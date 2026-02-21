import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { ensureAiProviderConfig, fetchAiJsonMap } from './ai.js';
import { loadGlobalCache, saveGlobalCache } from './cache.js';
import { extractors, URLS } from './extract.js';
import { CACHE_FILE, PACKS_DIR } from './paths.js';
import { askConfirmation, checkOllamaModel, CONSTANTS, log, logParallelTip, safeJsonParse, sanitizeTags } from './shared.js';
const SYSTEM_PROMPT = CONSTANTS.INTERPRET_PROMPT;
let globalCache = {};
const fetchAiTagsBatch = async (names) => {
    return fetchAiJsonMap({
        input: names,
        systemPrompt: SYSTEM_PROMPT,
        failureLabel: 'Interpretation failed'
    });
};
process.on('SIGINT', async () => {
    log.progressEnd();
    log.warn('Interrupted, saving cache...');
    await saveGlobalCache(globalCache);
    process.exit(0);
});
process.on('uncaughtException', async (err) => {
    log.error(`Uncaught exception: ${err.message}`);
    await saveGlobalCache(globalCache);
    process.exit(1);
});
const processRetryIcons = async (missingIcons, existingData) => {
    if (missingIcons.length === 0) {
        return;
    }
    const chunks = [];
    for (let i = 0; i < missingIcons.length; i += CONSTANTS.BATCH_SIZE) {
        chunks.push(missingIcons.slice(i, i + CONSTANTS.BATCH_SIZE));
    }
    for (const batch of chunks) {
        const retryMap = await fetchAiTagsBatch(batch);
        for (const icon of batch) {
            const rawTags = retryMap[icon];
            const cleanTags = sanitizeTags(rawTags || [], icon);
            if (cleanTags.length > 0) {
                existingData[icon] = cleanTags;
                globalCache[icon] = cleanTags;
            }
        }
    }
};
const processBatch = async (batch, existingData) => {
    const mappedTags = await fetchAiTagsBatch(batch);
    const missingIcons = [];
    for (const icon of batch) {
        const rawTags = mappedTags[icon];
        if (!rawTags || !Array.isArray(rawTags)) {
            missingIcons.push(icon);
            continue;
        }
        const cleanTags = sanitizeTags(rawTags, icon);
        existingData[icon] = cleanTags;
        if (cleanTags.length > 0) {
            globalCache[icon] = cleanTags;
        }
    }
    if (missingIcons.length > 0) {
        await processRetryIcons(missingIcons, existingData);
    }
};
const main = async () => {
    if (CONSTANTS.USE_NVIDIA_API) {
        log.info(`Model: ${CONSTANTS.NVIDIA_MODEL} (NVIDIA) | Batch: ${CONSTANTS.BATCH_SIZE} | Workers: ${CONSTANTS.CONCURRENCY_LIMIT}`);
        if (!ensureAiProviderConfig()) {
            process.exit(1);
        }
    }
    else {
        log.info(`Model: ${CONSTANTS.OLLAMA_MODEL} (Ollama) | Batch: ${CONSTANTS.BATCH_SIZE} | Workers: ${CONSTANTS.CONCURRENCY_LIMIT}`);
        logParallelTip();
        if (!(await checkOllamaModel())) {
            process.exit(1);
        }
    }
    if (!(await askConfirmation('Start processing icons?'))) {
        process.exit(0);
    }
    if (!existsSync(PACKS_DIR)) {
        await fs.mkdir(PACKS_DIR, { recursive: true });
    }
    if (existsSync(CACHE_FILE)) {
        globalCache = await loadGlobalCache();
        log.info(`Cache loaded: ${Object.keys(globalCache).length} icons`);
    }
    const packNames = Object.keys(extractors);
    log.info(`Processing ${packNames.length} icon packs`);
    for (const packName of packNames) {
        log.pack(packName);
        let existingData = {};
        const filePath = path.join(PACKS_DIR, `${packName}.json`);
        if (existsSync(filePath)) {
            const content = await fs.readFile(filePath, 'utf8').catch(() => '{}');
            existingData = safeJsonParse(content, {});
        }
        let allIcons = [];
        try {
            log.info(`Fetching from ${URLS[packName] || 'source'}...`);
            allIcons = await extractors[packName]();
            log.success(`Found ${allIcons.length} icons`);
        }
        catch (e) {
            log.error(`Failed to extract: ${e instanceof Error ? e.message : 'Unknown error'}`);
            continue;
        }
        const iconsToProcess = [];
        let cachedCount = 0;
        let promotedToGlobal = 0;
        for (const icon of allIcons) {
            if (existingData[icon] && existingData[icon].length > 0) {
                if (!globalCache[icon] || globalCache[icon].length === 0) {
                    globalCache[icon] = existingData[icon];
                    promotedToGlobal++;
                }
                continue;
            }
            else if (globalCache[icon] && globalCache[icon].length > 0) {
                existingData[icon] = globalCache[icon];
                cachedCount++;
            }
            else {
                iconsToProcess.push(icon);
            }
        }
        if (cachedCount > 0) {
            log.info(`Restored ${cachedCount} from global cache`);
        }
        if (promotedToGlobal > 0) {
            log.info(`Promoted ${promotedToGlobal} existing tags to global cache`);
        }
        if (iconsToProcess.length > 0) {
            log.info(`Generating tags for ${iconsToProcess.length} icons...`);
            const chunks = [];
            for (let i = 0; i < iconsToProcess.length; i += CONSTANTS.BATCH_SIZE) {
                chunks.push(iconsToProcess.slice(i, i + CONSTANTS.BATCH_SIZE));
            }
            let processed = 0;
            let queueIndex = 0;
            const workers = Array.from({ length: CONSTANTS.CONCURRENCY_LIMIT }, async () => {
                while (queueIndex < chunks.length) {
                    const currentIndex = queueIndex++;
                    const batch = chunks[currentIndex];
                    if (!batch) {
                        break;
                    }
                    await processBatch(batch, existingData);
                    processed += batch.length;
                    log.progress(processed, iconsToProcess.length, `${processed}/${iconsToProcess.length} icons`);
                }
            });
            await Promise.all(workers);
            log.progressEnd();
        }
        else {
            log.success('All icons already tagged');
        }
        const sortedData = {};
        Object.keys(existingData).sort().forEach(key => {
            sortedData[key] = existingData[key];
        });
        await fs.writeFile(filePath, JSON.stringify(sortedData, null, 2));
        await saveGlobalCache(globalCache);
        log.success(`Saved ${Object.keys(sortedData).length} icons to ${packName}.json`);
    }
    await saveGlobalCache(globalCache);
    log.success('Done!');
    process.exit(0);
};
main().catch((e) => {
    log.error(e instanceof Error ? e.message : 'Unknown error');
    process.exit(1);
});

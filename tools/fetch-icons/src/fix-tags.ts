import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { ensureAiProviderConfig, fetchAiJsonMap } from './ai.js';
import { loadGlobalCache, saveGlobalCache } from './cache.js';
import { CACHE_FILE, PACKS_DIR } from './paths.js';
import { askConfirmation, checkOllamaModel, CONSTANTS, log, logParallelTip, safeJsonParse, sanitizeTags, TAG_BLACKLIST } from './shared.js';

const SYSTEM_PROMPT = CONSTANTS.FIX_TAGS_PROMPT;

let globalCache: Record<string, string[]> = {};

const fetchAiFixBatch = async (icons: Record<string, string[]>): Promise<Record<string, string[]>> => {
  return fetchAiJsonMap({
    input: icons,
    systemPrompt: SYSTEM_PROMPT,
    failureLabel: 'Tag extraction failed'
  });
};

process.on('SIGINT', async () => {
  log.warn('Interrupted, saving cache...');
  await saveGlobalCache(globalCache);
  process.exit(0);
});

process.on('uncaughtException', async (err) => {
  log.error(`Uncaught exception: ${err.message}`);
  await saveGlobalCache(globalCache);
  process.exit(1);
});

const needsFixing = (iconName: string, tags: string[]): boolean => {
  if (!tags || !Array.isArray(tags) || tags.length === 0) {return true;}
  if (tags.length < 4) {return true;}
  const nameParts = new Set(iconName.toLowerCase().split(/[-_]/));
  const badTags = tags.filter(t => nameParts.has(t) || TAG_BLACKLIST.has(t));
  if (badTags.length > 0) {return true;}
  return false;
};

const arraysEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) {return false;}
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, index) => val === sortedB[index]);
};

const main = async () => {
  if (CONSTANTS.USE_NVIDIA_API) {
    log.info(`Model: ${CONSTANTS.NVIDIA_MODEL} (NVIDIA NIM API) | Batch: ${CONSTANTS.BATCH_SIZE} | Workers: ${CONSTANTS.CONCURRENCY_LIMIT}`);
    if (!ensureAiProviderConfig()) {
      process.exit(1);
    }
  } else {
    log.info(`Model: ${CONSTANTS.OLLAMA_MODEL} (Ollama) | Batch: ${CONSTANTS.BATCH_SIZE} | Workers: ${CONSTANTS.CONCURRENCY_LIMIT}`);
    logParallelTip();

    if (!(await checkOllamaModel())) {
      process.exit(1);
    }
  }

  if (!(await askConfirmation('Start fixing tags?'))) {
    process.exit(0);
  }

  if (existsSync(CACHE_FILE)) {
    globalCache = await loadGlobalCache();
    log.info(`Cache loaded: ${Object.keys(globalCache).length} icons`);
  }

  if (!existsSync(PACKS_DIR)) {
    log.warn('No packs-temp directory found. Run interpret first.');
    return;
  }

  const packFiles = (await fs.readdir(PACKS_DIR)).filter(f => f.endsWith('.json'));
  log.info(`Found ${packFiles.length} pack files`);

  const packsData: Record<string, Record<string, string[]>> = {};
  const allIconNames = new Set<string>();
  const currentTagsMap: Record<string, string[]> = {};

  for (const file of packFiles) {
    const content = await fs.readFile(path.join(PACKS_DIR, file), 'utf8').catch(() => '{}');
    const data = safeJsonParse<Record<string, string[]>>(content, {});
    packsData[file] = data;
    Object.entries(data).forEach(([key, tags]) => {
      allIconNames.add(key);
      if (tags && tags.length > 0) {
        currentTagsMap[key] = tags;
      }
    });
  }

  log.info(`Total unique icons: ${allIconNames.size}`);

  const iconsToFix: string[] = [];
  for (const icon of allIconNames) {
    const currentTags = currentTagsMap[icon] || globalCache[icon] || [];
    if (needsFixing(icon, currentTags)) {
      iconsToFix.push(icon);
    }
  }

  log.info(`Icons needing fixes: ${iconsToFix.length}`);

  if (iconsToFix.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < iconsToFix.length; i += CONSTANTS.BATCH_SIZE) {
      chunks.push(iconsToFix.slice(i, i + CONSTANTS.BATCH_SIZE));
    }

    let processed = 0;
    let queueIndex = 0;
    const workers = Array.from({ length: CONSTANTS.CONCURRENCY_LIMIT }, async () => {
      while (queueIndex < chunks.length) {
        const currentIndex = queueIndex++;
        const batch = chunks[currentIndex];
        if (!batch) {break;}

        const batchInput: Record<string, string[]> = {};
        for (const icon of batch) {
          batchInput[icon] = globalCache[icon] || currentTagsMap[icon] || [];
        }

        const results = await fetchAiFixBatch(batchInput);

        let batchProcessed = 0;
        for (const icon of batch) {
          batchProcessed++;
          const currentCount = processed + batchProcessed;
          const newTags = results[icon];
          if (newTags && Array.isArray(newTags)) {
            const clean = sanitizeTags(newTags, icon);
            if (clean.length > 0) {
              globalCache[icon] = clean;
              currentTagsMap[icon] = clean;
              log.success(`[${currentCount}/${iconsToFix.length}] ${icon}: ${clean.join(', ')}`);
            } else {
              log.warn(`[${currentCount}/${iconsToFix.length}] ${icon}: No valid tags generated`);
            }
          } else {
            log.warn(`[${currentCount}/${iconsToFix.length}] ${icon}: Failed to generate tags`);
          }
        }

        processed += batch.length;
      }
    });

    await Promise.all(workers);

    await saveGlobalCache(globalCache);
  }

  let totalUpdates = 0;
  for (const file of packFiles) {
    const packData = packsData[file];
    let updates = 0;
    for (const icon of Object.keys(packData)) {
      if (globalCache[icon]) {
        if (!packData[icon] || !arraysEqual(packData[icon], globalCache[icon])) {
          packData[icon] = globalCache[icon];
          updates++;
        }
      }
    }
    if (updates > 0) {
      await fs.writeFile(path.join(PACKS_DIR, file), JSON.stringify(packData, null, 2));
      log.success(`Updated ${updates} icons in ${file}`);
      totalUpdates += updates;
    }
  }

  if (totalUpdates === 0 && iconsToFix.length === 0) {
    log.success('All icons already have valid tags');
  } else {
    log.success(`Fixed ${totalUpdates} icons total`);
  }
  process.exit(0);
};
main().catch((e) => {
  log.error(e instanceof Error ? e.message : 'Unknown error');
  process.exit(1);
});

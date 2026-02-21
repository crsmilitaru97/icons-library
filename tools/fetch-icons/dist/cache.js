import { existsSync } from 'fs';
import fs from 'fs/promises';
import { CACHE_FILE } from './paths.js';
import { log, safeJsonParse } from './shared.js';
export const loadGlobalCache = async () => {
    if (!existsSync(CACHE_FILE)) { return {}; }
    const content = await fs.readFile(CACHE_FILE, 'utf8').catch(() => '{}');
    return safeJsonParse(content, {});
};
export const saveGlobalCache = async (cache) => {
    if (Object.keys(cache).length === 0) { return; }
    try {
        await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
    }
    catch (err) {
        log.error(`Failed to save cache: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
};

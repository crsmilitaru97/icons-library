import { existsSync } from 'fs';
import fs from 'fs/promises';
import { CACHE_FILE } from './paths.js';
import { log, safeJsonParse } from './shared.js';

export type GlobalCache = Record<string, string[]>;

export const loadGlobalCache = async (): Promise<GlobalCache> => {
  if (!existsSync(CACHE_FILE)) {return {};}
  const content = await fs.readFile(CACHE_FILE, 'utf8').catch(() => '{}');
  return safeJsonParse(content, {});
};

export const saveGlobalCache = async (cache: GlobalCache): Promise<void> => {
  if (Object.keys(cache).length === 0) {return;}
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    log.error(`Failed to save cache: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
};

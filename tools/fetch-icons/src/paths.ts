import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');
export const PACKS_DIR = path.resolve(ROOT_DIR, 'packs-temp');
export const CACHE_FILE = path.resolve(ROOT_DIR, 'global-tag-cache.json');

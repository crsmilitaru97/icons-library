import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { fileURLToPath } from 'url';
let envLoadError = null;
try {
    process.loadEnvFile();
}
catch (e) {
    envLoadError = e;
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.resolve(__dirname, '../config.json');
const loadConfig = () => {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
            return JSON.parse(content);
        }
    }
    catch (e) {
        console.warn(`Warning: Failed to load config from ${CONFIG_PATH}`, e);
    }
    return {};
};
const config = loadConfig();
export const CLR = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    bold: '\x1b[1m',
};
export const CONSTANTS = {
    OLLAMA_URL: config.OLLAMA_URL,
    OLLAMA_MODEL: config.OLLAMA_MODEL,
    CONCURRENCY_LIMIT: config.CONCURRENCY_LIMIT,
    BATCH_SIZE: config.BATCH_SIZE,
    REQUEST_TIMEOUT: config.REQUEST_TIMEOUT,
    URLS: (config.URLS || {}),
    FIX_TAGS_PROMPT: config.FIX_TAGS_PROMPT || '',
    INTERPRET_PROMPT: config.INTERPRET_PROMPT || '',
    NUM_CTX: config.NUM_CTX || 2048,
    NUM_THREAD: config.NUM_THREAD || 8,
    // NVIDIA Configuration
    USE_NVIDIA_API: config.USE_NVIDIA_API || process.env.NVIDIA_API === 'true' || process.argv.includes('--nvidia') || false,
    NVIDIA_API_KEY: process.env.NVIDIA_API_KEY || config.NVIDIA_API_KEY || '',
    NVIDIA_API_URL: config.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions',
    NVIDIA_MODEL: config.NVIDIA_MODEL || 'qwen/qwen3.5-397b-a17b',
    ENV_LOAD_ERROR: envLoadError,
};
export const OLLAMA_OPTIONS = {
    temperature: 0.2,
    num_ctx: CONSTANTS.NUM_CTX,
    num_predict: 500,
    num_thread: CONSTANTS.NUM_THREAD
};
export const TAG_BLACKLIST = new Set([
    'icon', 'logo', 'button', 'ui', 'ux', 'metadata', 'search', 'tag', 'tags',
    'symbol', 'graphic', 'vector', 'glyph', 'outline', 'filled', 'interface',
    'view', 'action', 'status', 'state', 'mode'
]);
export const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) { return 'Calculating...'; }
    if (seconds < 60) { return `${Math.round(seconds)}s`; }
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
};
export const extractJson = (text) => {
    const cleanText = text.replace(/<(think|thought)>[\s\S]*?<\/(think|thought)>/gi, '').trim();
    const attempt1 = safeJsonParse(cleanText, null);
    if (attempt1) { return attempt1; }
    const match = cleanText.match(/```json([\s\S]*?)```/);
    if (match) {
        const attempt2 = safeJsonParse(match[1], null);
        if (attempt2) { return attempt2; }
    }
    const start = cleanText.indexOf('{');
    const end = cleanText.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
        return safeJsonParse(cleanText.substring(start, end + 1), null);
    }
    return null;
};
export const safeJsonParse = (text, fallback) => {
    try {
        return JSON.parse(text);
    }
    catch {
        return fallback;
    }
};
export const sanitizeTags = (tags, iconName, maxTags = 100) => {
    if (!Array.isArray(tags)) { return []; }
    const nameParts = new Set(iconName.toLowerCase().split(/[-_]/));
    const uniqueTags = new Set();
    const limitedTags = tags.slice(0, maxTags);
    for (const t of limitedTags) {
        if (typeof t !== 'string') { continue; }
        const clean = t.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
        if (clean.length < 4) { continue; }
        if (TAG_BLACKLIST.has(clean)) { continue; }
        if (nameParts.has(clean)) { continue; }
        uniqueTags.add(clean);
    }
    return Array.from(uniqueTags);
};
export const log = {
    info: (msg) => process.stdout.write(`${CLR.cyan}ℹ${CLR.reset} ${msg}\n`),
    success: (msg) => process.stdout.write(`${CLR.green}✓${CLR.reset} ${msg}\n`),
    warn: (msg) => process.stdout.write(`${CLR.yellow}⚠${CLR.reset} ${msg}\n`),
    error: (msg) => process.stdout.write(`${CLR.red}✗${CLR.reset} ${msg}\n`),
    progress: (current, total, label) => {
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
        process.stdout.write(`\r${CLR.dim}[${bar}]${CLR.reset} ${pct}% ${label}`);
    },
    progressEnd: () => process.stdout.write('\n'),
    pack: (name) => process.stdout.write(`\n${CLR.bold}${CLR.magenta}▶ ${name}${CLR.reset}\n`),
};
export const fetchText = async (url, options = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONSTANTS.REQUEST_TIMEOUT || 30000);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        return await response.text();
    }
    finally {
        clearTimeout(timeoutId);
    }
};
export const fetchJson = async (url, options = {}) => {
    const text = await fetchText(url, options);
    return JSON.parse(text);
};
export const checkOllamaModel = async () => {
    if (!CONSTANTS.OLLAMA_URL) {
        log.error('OLLAMA_URL is not set.');
        return false;
    }
    if (!CONSTANTS.OLLAMA_MODEL) {
        log.error('OLLAMA_MODEL is not set.');
        return false;
    }
    const baseUrl = CONSTANTS.OLLAMA_URL.replace('/api/chat', '');
    const tagsUrl = `${baseUrl}/api/tags`;
    try {
        const data = await fetchText(tagsUrl);
        const json = JSON.parse(data);
        const modelName = CONSTANTS.OLLAMA_MODEL.split(':')[0];
        const exists = json.models.some(m => m.name === CONSTANTS.OLLAMA_MODEL || m.name.startsWith(modelName));
        if (!exists) {
            log.error(`Ollama is running, but model '${CONSTANTS.OLLAMA_MODEL}' was not found.`);
            log.warn(`Available models: ${json.models.map(m => m.name).join(', ')}`);
            log.warn(`Run: ollama run ${CONSTANTS.OLLAMA_MODEL}`);
            return false;
        }
        return true;
    }
    catch (e) {
        if (e.cause?.code === 'ECONNREFUSED' || e.message?.includes('ECONNREFUSED') || e.message?.includes('fetch failed')) {
            log.error(`${CLR.bold}${CLR.red}Ollama is NOT running!${CLR.reset}`);
            log.warn(`Please start the Ollama application first.`);
        }
        else {
            log.error(`Failed to connect to Ollama at ${baseUrl}: ${e.message}`);
        }
        return false;
    }
};
export const askConfirmation = async (message) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    const answer = await rl.question(`${message} (Y/n): `);
    rl.close();
    return answer.toLowerCase() !== 'n';
};
export const logParallelTip = () => {
    const current = process.env.OLLAMA_NUM_PARALLEL;
    const expected = String(CONSTANTS.CONCURRENCY_LIMIT);
    if (current === expected) { return; }
    log.info(`${CLR.yellow}Tip: For better performance, set OLLAMA_NUM_PARALLEL using:${CLR.reset}`);
    log.info(`[System.Environment]::SetEnvironmentVariable('OLLAMA_NUM_PARALLEL', '${expected}', 'User')`);
    log.info(`${CLR.yellow}Remember to RESTART Ollama after setting!${CLR.reset}\n`);
};

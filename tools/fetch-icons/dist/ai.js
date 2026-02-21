import { CONSTANTS, extractJson, fetchText, log, OLLAMA_OPTIONS } from './shared.js';
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 1000;
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const buildMessages = (systemPrompt, input) => [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(input) }
];
const requestOllama = async (messages) => {
    const payload = JSON.stringify({
        model: CONSTANTS.OLLAMA_MODEL,
        messages,
        stream: false,
        options: { ...OLLAMA_OPTIONS, num_predict: 4096 },
        keep_alive: '10m'
    });
    const responseData = await fetchText(CONSTANTS.OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
    });
    const jsonResponse = JSON.parse(responseData);
    return jsonResponse.message?.content || '{}';
};
const requestNvidia = async (messages) => {
    const payload = JSON.stringify({
        model: CONSTANTS.NVIDIA_MODEL,
        messages,
        max_tokens: 16384,
        temperature: 0.60,
        top_p: 0.95,
        top_k: 20,
        presence_penalty: 0,
        repetition_penalty: 1,
        stream: false,
        chat_template_kwargs: { enable_thinking: true }
    });
    const responseData = await fetchText(CONSTANTS.NVIDIA_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONSTANTS.NVIDIA_API_KEY}`,
            'Accept': 'application/json'
        },
        body: payload
    });
    const jsonResponse = JSON.parse(responseData);
    if (jsonResponse.error) {
        throw new Error(jsonResponse.error.message || 'NVIDIA API Error');
    }
    return jsonResponse.choices?.[0]?.message?.content || '{}';
};
export const ensureAiProviderConfig = () => {
    if (!CONSTANTS.USE_NVIDIA_API) { return true; }
    if (CONSTANTS.NVIDIA_API_KEY) { return true; }
    log.error('NVIDIA_API_KEY is missing in config or environment variables.');
    if (CONSTANTS.ENV_LOAD_ERROR) {
        if (CONSTANTS.ENV_LOAD_ERROR.code === 'ENOENT') {
            log.warn('Note: .env file was not found. If you have an .env file, ensure it is in the correct directory.');
        }
        else {
            log.warn(`Note: Failed to load .env file: ${CONSTANTS.ENV_LOAD_ERROR.message}`);
        }
    }
    else {
        log.warn('Note: .env file was loaded successfully, but NVIDIA_API_KEY was not found inside it.');
    }
    return false;
};
export const fetchAiJsonMap = async ({ input, systemPrompt, failureLabel, retry = 0 }) => {
    const messages = buildMessages(systemPrompt, input);
    try {
        const rawContent = CONSTANTS.USE_NVIDIA_API
            ? await requestNvidia(messages)
            : await requestOllama(messages);
        const result = extractJson(rawContent);
        if (!result || Object.keys(result).length === 0) {
            log.warn(`${failureLabel}. Raw content: ${rawContent.substring(0, 100).replace(/\n/g, ' ')}...`);
        }
        return result || {};
    }
    catch (error) {
        if (CONSTANTS.USE_NVIDIA_API) {
            log.error(`NVIDIA Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        if (retry < MAX_RETRIES) {
            await wait(RETRY_BACKOFF_MS * (retry + 1));
            return fetchAiJsonMap({ input, systemPrompt, failureLabel, retry: retry + 1 });
        }
        return {};
    }
};

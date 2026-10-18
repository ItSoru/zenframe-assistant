'use strict';
// Direct AI providers for Zenframe. Uses only Node's http/https (works on every CEP Node version).
// Keys are sent only to the provider's own base URL, never anywhere else.
const http = require('http');
const https = require('https');
const { URL } = require('url');

// Effort levels each kind of provider accepts, lowest to highest.
// Claude: https://platform.claude.com/docs/en/build-with-claude/effort (output_config.effort)
// OpenAI-style: reasoning_effort (OpenRouter: reasoning.effort).
const EFFORT_LEVELS = {
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
  openai: ['low', 'medium', 'high'],
  // Codex CLI: model_reasoning_effort
  codex: ['low', 'medium', 'high', 'xhigh']
};

// Models offered for Claude Code when no Anthropic key is available to fetch the live list.
// Aliases always point at the newest model of that line.
const CLAUDE_CODE_MODELS = [
  'opus', 'sonnet', 'haiku', 'fable',
  'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1',
  'claude-opus-5', 'claude-sonnet-5', 'claude-fable-5',
  'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'
];

const PRESETS = {
  anthropic: { label: 'Anthropic API', kind: 'anthropic', effort: 'claude', baseUrl: 'https://api.anthropic.com/v1', needsKey: true, keyHint: 'sk-ant-…', keyUrl: 'console.anthropic.com' },
  openai: { label: 'OpenAI', kind: 'openai', effort: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true, keyHint: 'sk-…', keyUrl: 'platform.openai.com/api-keys' },
  groq: { label: 'Groq (free tier)', kind: 'openai', effort: 'openai', baseUrl: 'https://api.groq.com/openai/v1', needsKey: true, keyHint: 'gsk_…', keyUrl: 'console.groq.com/keys' },
  openrouter: { label: 'OpenRouter (has free models)', kind: 'openai', effort: 'openai', effortField: 'reasoning', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, keyHint: 'sk-or-…', keyUrl: 'openrouter.ai/keys', freeFilter: true, extraHeaders: { 'X-Title': 'Zenframe Assistant' } },
  gemini: { label: 'Google Gemini (free tier)', kind: 'openai', effort: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true, keyHint: 'AIza…', keyUrl: 'aistudio.google.com/apikey', stripModelPrefix: 'models/' },
  ollama: { label: 'Ollama (local, free)', kind: 'openai', effort: 'openai', baseUrl: 'http://localhost:11434/v1', needsKey: false, editableUrl: true },
  custom: { label: 'Custom (OpenAI-compatible)', kind: 'openai', effort: 'openai', baseUrl: '', needsKey: false, optionalKey: true, editableUrl: true }
};

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

function checkBaseUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (e) { throw new Error('Enter a valid base URL, such as https://api.example.com/v1'); }
  const local = LOCAL_HOSTS.includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error('Use an https:// address (plain http:// is only allowed for localhost).');
  if (u.username || u.password) throw new Error('Do not put a username or password in the base URL.');
  return u.toString().replace(/\/+$/, '');
}

// Minimal JSON-over-HTTP client with timeout and cancel support.
function request(method, url, { headers = {}, body, timeoutMs = 120000, onRequest } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const h = Object.assign({ Accept: 'application/json' }, headers);
    if (payload !== undefined) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(payload); }
    const req = lib.request(u, { method, headers: h }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => { data += c; if (data.length > 20 * 1024 * 1024) req.destroy(new Error('Response too large.')); });
      res.on('end', () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch (e) {}
        resolve({ status: res.statusCode, json, text: data, headers: res.headers || {} });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('The AI provider did not respond in time.')));
    req.on('error', e => reject(e.code === 'ECONNREFUSED' ? new Error('Could not connect to ' + u.host + '. Is it running?') : e));
    if (onRequest) onRequest(req);
    req.end(payload);
  });
}

function providerError(preset, res) {
  const raw = res.json && (res.json.error && (res.json.error.message || res.json.error) || res.json.message);
  const detail = typeof raw === 'string' ? raw : res.text.slice(0, 300);
  if (res.status === 401 || res.status === 403) return new Error(preset.label + ' rejected the API key. Check it and save it again. (' + detail + ')');
  if (res.status === 429) return new Error(preset.label + ' rate limit reached. Free tiers have tight limits: wait a minute, or pick another model. (' + detail + ')');
  if (res.status === 404) return new Error(preset.label + ' could not find that model or address. Load models again and pick one from the list. (' + detail + ')');
  if (res.status === 400 && /image|vision|multimodal|image_url|content type/i.test(detail)) return new Error('This model cannot read images. Pick a model with vision, or remove the image and send again. (' + detail + ')');
  if (/tool|function/i.test(detail)) return new Error('This model does not seem to support tool calling, which Zeni needs. Pick another model. (' + detail + ')');
  return new Error(preset.label + ' error ' + res.status + ': ' + detail);
}

function authHeaders(preset, key) {
  if (preset.kind === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  return Object.assign(key ? { Authorization: 'Bearer ' + key } : {}, preset.extraHeaders || {});
}

/* ---------- Usage limits ---------- */
// Rate-limit headers the provider sends with every reply (Anthropic, OpenAI, Groq, OpenRouter and most
// OpenAI-compatible servers). Returns null when the provider sends none.
function num(v) { const n = Number(v); return v !== undefined && v !== null && v !== '' && isFinite(n) ? n : null; }
// "1m30s", "6m0s", "12ms", "2.5s" (OpenAI/Groq) or an ISO date (Anthropic) -> milliseconds from now.
function resetIn(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const t = Date.parse(s); return isFinite(t) ? Math.max(0, t - Date.now()) : null; }
  let ms = 0, matched = false;
  s.replace(/(\d+(?:\.\d+)?)(ms|h|m|s)/g, (all, n, unit) => { matched = true; ms += Number(n) * (unit === 'h' ? 3600000 : unit === 'm' ? 60000 : unit === 's' ? 1000 : 1); return all; });
  if (matched) return ms;
  const secs = num(s);
  return secs === null ? null : secs * 1000;
}
function readRateHeaders(preset, headers) {
  headers = headers || {};
  const pick = (kind) => {
    const p = preset.kind === 'anthropic' ? 'anthropic-ratelimit-' + kind + '-' : 'x-ratelimit-';
    const suffix = preset.kind === 'anthropic' ? '' : '-' + kind;
    const limit = num(headers[p + 'limit' + suffix]), remaining = num(headers[p + 'remaining' + suffix]);
    if (limit === null || remaining === null || limit <= 0) return null;
    return { limit, remaining, resetMs: resetIn(headers[p + 'reset' + suffix]) };
  };
  const requests = pick('requests'), tokens = pick('tokens');
  return requests || tokens ? { requests, tokens } : null;
}
// OpenRouter reports the key's spending limit and usage in dollars.
async function openRouterKey(baseUrl, key) {
  const res = await request('GET', baseUrl + '/key', { headers: { Authorization: 'Bearer ' + key }, timeoutMs: 15000 });
  if (res.status !== 200 || !res.json || !res.json.data) return null;
  return res.json.data;
}

/* ---------- Attachments ---------- */
// The user's message with any images, in the provider's format. Text files are already in the text.
function userContent(preset, text, images) {
  if (!images || !images.length) return text;
  if (preset.kind === 'anthropic') {
    return images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })).concat([{ type: 'text', text }]);
  }
  return [{ type: 'text', text }].concat(images.map(i => ({ type: 'image_url', image_url: { url: 'data:' + i.mime + ';base64,' + i.data } })));
}
// After a reply, images are swapped for a short note so they are not sent again with every later message.
function forgetImages(message) {
  if (!message || !Array.isArray(message.content)) return;
  const names = [];
  message.content = message.content.filter(b => {
    const img = b && (b.type === 'image' || b.type === 'image_url');
    if (img) names.push(b._name || 'image');
    return !img;
  }).map(b => { if (b && b._name) delete b._name; return b; });
  if (!names.length) return;
  const note = '[The user attached ' + names.length + ' image' + (names.length > 1 ? 's' : '') + ' earlier; you already saw ' + (names.length > 1 ? 'them' : 'it') + '.]';
  const textBlock = message.content.find(b => b.type === 'text');
  if (textBlock) textBlock.text += '\n' + note; else message.content.push({ type: 'text', text: note });
  if (message.content.length === 1 && message.content[0].type === 'text') message.content = message.content[0].text;
}

/* ---------- Model lists ---------- */
const NON_CHAT = /(whisper|embed|tts|transcribe|dall-e|imagen|image-generation|moderation|guard|veo|aqa|rerank|audio-preview|speech)/i;
async function listModels(preset, baseUrl, key, { freeOnly = false } = {}) {
  const res = await request('GET', baseUrl + '/models' + (preset.kind === 'anthropic' ? '?limit=1000' : ''), { headers: authHeaders(preset, key), timeoutMs: 30000 });
  if (res.status !== 200 || !res.json) throw providerError(preset, res);
  let rows = Array.isArray(res.json.data) ? res.json.data : Array.isArray(res.json.models) ? res.json.models : [];
  // Keep only models that advertise tool support, when the provider says so (OpenRouter does).
  rows = rows.filter(m => !Array.isArray(m.supported_parameters) || m.supported_parameters.includes('tools'));
  // Drop models that cannot chat at all (speech, embeddings, images, moderation).
  rows = rows.filter(m => !NON_CHAT.test(String(m.id || m.name || '')));
  if (freeOnly) rows = rows.filter(m => /:free$/.test(m.id || '') || (m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0));
  let ids = rows.map(m => String(m.id || m.name || '')).filter(Boolean);
  if (preset.stripModelPrefix) ids = ids.map(id => id.startsWith(preset.stripModelPrefix) ? id.slice(preset.stripModelPrefix.length) : id);
  return Array.from(new Set(ids)).sort().slice(0, 500);
}

/* ---------- Tool schemas ---------- */
// Strip JSON-schema keywords some providers reject, and give "any value" fields a concrete shape.
function cleanSchema(s) {
  if (Array.isArray(s)) return s.map(cleanSchema);
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const k of Object.keys(s)) {
    if (k === 'additionalProperties') continue;
    out[k] = cleanSchema(s[k]);
  }
  if (out.properties && out.properties.value && Object.keys(out.properties.value).length === 0) {
    out.properties.value = { description: 'A number, an array of numbers, or a string', anyOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }, { type: 'string' }] };
  }
  return out;
}
function toolsFor(preset, definitions) {
  if (preset.kind === 'anthropic') return definitions.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  return definitions.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: cleanSchema(t.inputSchema) } }));
}

/* ---------- One model turn ---------- */
// A 400 that is about the effort setting (unsupported level, or no reasoning on this model).
function effortError(res) {
  const text = JSON.stringify(res.json || res.text || '');
  return res.status === 400 && /effort|reasoning|output_config|thinking/i.test(text);
}
class EffortRejected extends Error {}

// Thinking counts toward max_tokens, so higher effort gets more room.
function maxTokensFor(effort) {
  return effort === 'xhigh' || effort === 'max' ? 64000 : effort === 'high' ? 32000 : 16000;
}

async function chat({ preset, baseUrl, key, model, system, history, tools, onRequest, effort }) {
  if (preset.kind === 'anthropic') {
    const body = { model, max_tokens: maxTokensFor(effort), system, messages: history, tools };
    if (effort) body.output_config = { effort };
    const res = await request('POST', baseUrl + '/messages', { headers: authHeaders(preset, key), onRequest, body, timeoutMs: 10 * 60 * 1000 });
    if (effort && effortError(res)) throw new EffortRejected(effort);
    if (res.status !== 200 || !res.json) throw providerError(preset, res);
    const content = res.json.content || [];
    return {
      assistant: { role: 'assistant', content },
      text: content.filter(b => b.type === 'text').map(b => b.text).join('\n'),
      calls: content.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, args: b.input || {} })),
      usage: res.json.usage ? { input: (res.json.usage.input_tokens || 0) + (res.json.usage.cache_read_input_tokens || 0) + (res.json.usage.cache_creation_input_tokens || 0), output: res.json.usage.output_tokens || 0 } : null,
      limits: readRateHeaders(preset, res.headers)
    };
  }
  const body = { model, messages: [{ role: 'system', content: system }].concat(history), tools, tool_choice: 'auto' };
  if (effort) { if (preset.effortField === 'reasoning') body.reasoning = { effort }; else body.reasoning_effort = effort; }
  const res = await request('POST', baseUrl + '/chat/completions', { headers: authHeaders(preset, key), onRequest, body, timeoutMs: 10 * 60 * 1000 });
  if (effort && effortError(res)) throw new EffortRejected(effort);
  if (res.status !== 200 || !res.json) throw providerError(preset, res);
  if (res.json.error) throw providerError(preset, { status: 500, json: res.json, text: JSON.stringify(res.json.error) });
  const msg = (res.json.choices && res.json.choices[0] && res.json.choices[0].message) || {};
  const calls = (msg.tool_calls || []).map((c, i) => ({ id: c.id || 'call_' + i, name: c.function && c.function.name, argsText: c.function && c.function.arguments }));
  const assistant = { role: 'assistant', content: msg.content == null ? null : msg.content };
  if (msg.tool_calls && msg.tool_calls.length) assistant.tool_calls = msg.tool_calls.map((c, i) => ({ id: c.id || 'call_' + i, type: 'function', function: { name: c.function.name, arguments: typeof c.function.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function.arguments || {}) } }));
  return {
    assistant,
    text: typeof msg.content === 'string' ? msg.content : '',
    calls,
    usage: res.json.usage ? { input: res.json.usage.prompt_tokens, output: res.json.usage.completion_tokens } : null,
    limits: readRateHeaders(preset, res.headers)
  };
}

/* ---------- Agent loop ---------- */
const MAX_STEPS = 24;
const MAX_RESULT_CHARS = 12000;

// Calls chat() at the requested effort. If the model rejects that level, steps down one level at a
// time, then drops the setting. The level that worked is remembered per model in effortCache.
async function chatWithEffort(args, effort, effortCache, emit) {
  const cacheKey = args.baseUrl + '|' + args.model;
  const levels = EFFORT_LEVELS[args.preset.effort] || [];
  let current = effort && levels.includes(effort) ? effort : null;
  if (current && effortCache && cacheKey in effortCache) {
    const known = effortCache[cacheKey];
    current = known === null ? null : levels.indexOf(known) < levels.indexOf(current) ? known : current;
  }
  for (;;) {
    try {
      const turn = await chat(Object.assign({}, args, { effort: current }));
      if (effortCache && effort && current !== effort && effortCache[cacheKey] !== current) {
        effortCache[cacheKey] = current;
        emit('notice', current
          ? 'This model does not accept "' + effort + '" effort, so Zeni used "' + current + '" instead.'
          : 'This model does not support effort levels, so Zeni used its default.');
      }
      return turn;
    } catch (e) {
      if (!(e instanceof EffortRejected)) throw e;
      const i = levels.indexOf(current);
      current = i > 0 ? levels[i - 1] : null;
    }
  }
}

async function runAgent({ preset, baseUrl, key, model, system, definitions, history, prompt, runTool, emit, isStopped, onRequest, effort, effortCache }) {
  const allowed = new Set(definitions.map(t => t.name));
  const tools = toolsFor(preset, definitions);
  history.push({ role: 'user', content: prompt });
  let shown = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    if (isStopped()) return;
    const turn = await chatWithEffort({ preset, baseUrl, key, model, system, history, tools, onRequest }, effort, effortCache, emit);
    history.push(turn.assistant);
    if (turn.usage) emit('usage', turn.usage);
    if (turn.limits) emit('rate', turn.limits);
    if (turn.text && turn.text.trim()) { shown = shown ? shown + '\n\n' + turn.text.trim() : turn.text.trim(); emit('text', shown); }
    if (!turn.calls.length) return;
    const anthropicResults = [], frameImages = [];
    for (const call of turn.calls) {
      let value;
      if (isStopped()) value = { error: 'The request was stopped.' };
      else if (!allowed.has(call.name)) value = { error: 'Unknown or unavailable tool: ' + call.name };
      else {
        let args = call.args;
        if (args === undefined) {
          try { args = call.argsText ? JSON.parse(call.argsText) : {}; } catch (e) { args = null; value = { error: 'Tool arguments were not valid JSON. Send valid JSON matching the schema.' }; }
        }
        if (!value) value = await runTool(call.name, args || {});
      }
      // 1.4.0: tools can return images (rendered frames). They go to the model as images, not as text.
      const images = value && Array.isArray(value.__images) ? value.__images : null;
      if (images) { value = Object.assign({}, value); delete value.__images; }
      let content = JSON.stringify(value);
      if (content.length > MAX_RESULT_CHARS) content = content.slice(0, MAX_RESULT_CHARS) + '…[truncated]';
      if (preset.kind === 'anthropic') {
        const blocks = images ? [{ type: 'text', text: content }].concat(images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } }))) : content;
        anthropicResults.push({ type: 'tool_result', tool_use_id: call.id, content: blocks, is_error: !!(value && value.error) });
      } else {
        history.push({ role: 'tool', tool_call_id: call.id, content: images ? content + '\n[The rendered frames follow in the next message.]' : content });
        if (images) images.forEach(i => frameImages.push(i));
      }
    }
    if (anthropicResults.length) history.push({ role: 'user', content: anthropicResults });
    // OpenAI-style tool messages can't carry images, so the frames follow as a short user message.
    if (frameImages.length) { const m = { role: 'user', content: userContent(preset, 'Frames rendered by ae_render_frames, as requested above.', frameImages) }; FRAME_MESSAGES.add(m); history.push(m); }
  }
  emit('notice', 'Zeni stopped after ' + MAX_STEPS + ' steps to avoid looping. Ask again to continue.');
}

const FRAME_MESSAGES = new WeakSet();
// After a reply, rendered frames are replaced by a note so they are not sent again with every later message.
function forgetToolImages(history, from) {
  const note = '[Frames you rendered were shown here; render them again to look again.]';
  for (let i = Math.max(0, from || 0); i < history.length; i++) {
    const m = history[i];
    if (!m || !Array.isArray(m.content)) continue;
    if (FRAME_MESSAGES.has(m)) { history[i] = { role: 'user', content: note }; continue; }
    m.content.forEach(b => {
      if (b && b.type === 'tool_result' && Array.isArray(b.content) && b.content.some(x => x.type === 'image')) {
        b.content = b.content.filter(x => x.type !== 'image').concat([{ type: 'text', text: note }]);
      }
    });
  }
}

module.exports = { forgetToolImages, PRESETS, EFFORT_LEVELS, CLAUDE_CODE_MODELS, checkBaseUrl, listModels, runAgent, toolsFor, cleanSchema, maxTokensFor, readRateHeaders, resetIn, openRouterKey, userContent, forgetImages };

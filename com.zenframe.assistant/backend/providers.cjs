'use strict';
// Direct AI providers for Zenframe. Uses only Node's http/https (works on every CEP Node version).
// Keys are sent only to the provider's own base URL, never anywhere else.
const http = require('http');
const https = require('https');
const { URL } = require('url');

const PRESETS = {
  anthropic: { label: 'Anthropic API', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', needsKey: true, keyHint: 'sk-ant-…', keyUrl: 'console.anthropic.com' },
  openai: { label: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true, keyHint: 'sk-…', keyUrl: 'platform.openai.com/api-keys' },
  groq: { label: 'Groq (free tier)', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', needsKey: true, keyHint: 'gsk_…', keyUrl: 'console.groq.com/keys' },
  openrouter: { label: 'OpenRouter (has free models)', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, keyHint: 'sk-or-…', keyUrl: 'openrouter.ai/keys', freeFilter: true, extraHeaders: { 'X-Title': 'Zenframe Assistant' } },
  gemini: { label: 'Google Gemini (free tier)', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true, keyHint: 'AIza…', keyUrl: 'aistudio.google.com/apikey', stripModelPrefix: 'models/' },
  ollama: { label: 'Ollama (local, free)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', needsKey: false, editableUrl: true },
  custom: { label: 'Custom (OpenAI-compatible)', kind: 'openai', baseUrl: '', needsKey: false, optionalKey: true, editableUrl: true }
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
        resolve({ status: res.statusCode, json, text: data });
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
  if (/tool|function/i.test(detail)) return new Error('This model does not seem to support tool calling, which Zeni needs. Pick another model. (' + detail + ')');
  return new Error(preset.label + ' error ' + res.status + ': ' + detail);
}

function authHeaders(preset, key) {
  if (preset.kind === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  return Object.assign(key ? { Authorization: 'Bearer ' + key } : {}, preset.extraHeaders || {});
}

/* ---------- Model lists ---------- */
async function listModels(preset, baseUrl, key, { freeOnly = false } = {}) {
  const res = await request('GET', baseUrl + '/models', { headers: authHeaders(preset, key), timeoutMs: 30000 });
  if (res.status !== 200 || !res.json) throw providerError(preset, res);
  let rows = Array.isArray(res.json.data) ? res.json.data : Array.isArray(res.json.models) ? res.json.models : [];
  // Keep only models that advertise tool support, when the provider says so (OpenRouter does).
  rows = rows.filter(m => !Array.isArray(m.supported_parameters) || m.supported_parameters.includes('tools'));
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
async function chat({ preset, baseUrl, key, model, system, history, tools, onRequest }) {
  if (preset.kind === 'anthropic') {
    const res = await request('POST', baseUrl + '/messages', {
      headers: authHeaders(preset, key), onRequest,
      body: { model, max_tokens: 4096, system, messages: history, tools }
    });
    if (res.status !== 200 || !res.json) throw providerError(preset, res);
    const content = res.json.content || [];
    return {
      assistant: { role: 'assistant', content },
      text: content.filter(b => b.type === 'text').map(b => b.text).join('\n'),
      calls: content.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, args: b.input || {} })),
      usage: res.json.usage ? { input: res.json.usage.input_tokens, output: res.json.usage.output_tokens } : null
    };
  }
  const res = await request('POST', baseUrl + '/chat/completions', {
    headers: authHeaders(preset, key), onRequest,
    body: { model, messages: [{ role: 'system', content: system }].concat(history), tools, tool_choice: 'auto' }
  });
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
    usage: res.json.usage ? { input: res.json.usage.prompt_tokens, output: res.json.usage.completion_tokens } : null
  };
}

/* ---------- Agent loop ---------- */
const MAX_STEPS = 24;
const MAX_RESULT_CHARS = 12000;

async function runAgent({ preset, baseUrl, key, model, system, definitions, history, prompt, runTool, emit, isStopped, onRequest }) {
  const allowed = new Set(definitions.map(t => t.name));
  const tools = toolsFor(preset, definitions);
  history.push({ role: 'user', content: prompt });
  let shown = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    if (isStopped()) return;
    const turn = await chat({ preset, baseUrl, key, model, system, history, tools, onRequest });
    history.push(turn.assistant);
    if (turn.usage) emit('usage', turn.usage);
    if (turn.text && turn.text.trim()) { shown = shown ? shown + '\n\n' + turn.text.trim() : turn.text.trim(); emit('text', shown); }
    if (!turn.calls.length) return;
    const anthropicResults = [];
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
      let content = JSON.stringify(value);
      if (content.length > MAX_RESULT_CHARS) content = content.slice(0, MAX_RESULT_CHARS) + '…[truncated]';
      if (preset.kind === 'anthropic') anthropicResults.push({ type: 'tool_result', tool_use_id: call.id, content, is_error: !!(value && value.error) });
      else history.push({ role: 'tool', tool_call_id: call.id, content });
    }
    if (anthropicResults.length) history.push({ role: 'user', content: anthropicResults });
  }
  emit('notice', 'Zeni stopped after ' + MAX_STEPS + ' steps to avoid looping. Ask again to continue.');
}

module.exports = { PRESETS, checkBaseUrl, listModels, runAgent, toolsFor, cleanSchema };

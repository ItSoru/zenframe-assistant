'use strict';
// Small stdio MCP transport between Claude Code and the Zenframe panel.
// The bridge secret stays in this process's environment and is never written to stdout.
const http = require('http');
const readline = require('readline');
const definitions = require('./tools.cjs');

const port = Number(process.env.ZENFRAME_PORT);
const token = process.env.ZENFRAME_TOKEN;
// Edits may wait for the user to click Apply, so they get a longer limit.
const TIMEOUTS = { ae_apply_actions: 15 * 60 * 1000, ae_run_script: 15 * 60 * 1000, ae_render_frames: 10 * 60 * 1000, ae_analyze_audio: 5 * 60 * 1000, ae_study_project: 10 * 60 * 1000 };
const DEFAULT_TIMEOUT = 2 * 60 * 1000;

function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

function call(name, args) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ name, args });
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/tool', method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let out = '';
      res.on('data', c => { out += c; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error('Panel rejected request (' + res.statusCode + ').');
          resolve(JSON.parse(out));
        } catch (e) { reject(e); }
      });
    });
    const limit = TIMEOUTS[name] || DEFAULT_TIMEOUT;
    req.setTimeout(limit, () => req.destroy(new Error(TIMEOUTS[name]
      ? 'No answer from the user or After Effects in time. Check After Effects before trying again.'
      : 'After Effects did not respond in time.')));
    req.on('error', reject);
    req.end(body);
  });
}

readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', async line => {
  let r;
  try { r = JSON.parse(line); } catch (e) { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); }
  if (r.id === undefined) return;
  try {
    let result;
    if (r.method === 'initialize') {
      result = { protocolVersion: r.params.protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'zenframe-aftereffects', version: '1.4.4' } };
    } else if (r.method === 'ping') {
      result = {};
    } else if (r.method === 'tools/list') {
      result = { tools: definitions };
    } else if (r.method === 'tools/call') {
      if (!definitions.some(t => t.name === r.params.name)) throw new Error('Unknown tool');
      try {
        let value = await call(r.params.name, r.params.arguments || {});
        // 1.4.0: rendered frames come back as real images.
        const images = value && Array.isArray(value.__images) ? value.__images : [];
        if (images.length) { value = Object.assign({}, value); delete value.__images; }
        result = { content: [{ type: 'text', text: JSON.stringify(value) }].concat(images.map(i => ({ type: 'image', data: i.data, mimeType: i.mime }))), isError: !!value.error };
      } catch (e) {
        result = { content: [{ type: 'text', text: e.message }], isError: true };
      }
    } else {
      return send({ jsonrpc: '2.0', id: r.id, error: { code: -32601, message: 'Method not found' } });
    }
    send({ jsonrpc: '2.0', id: r.id, result });
  } catch (e) {
    send({ jsonrpc: '2.0', id: r.id, error: { code: -32603, message: e.message } });
  }
});

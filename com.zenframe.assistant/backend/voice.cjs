'use strict';
// Zenframe Assistant 1.3.0: turns a short voice recording into text for the message box.
// Uses Groq's or OpenAI's Whisper when that key is saved, otherwise Windows' built-in offline speech recognition.
// The recording is sent only to the service named here, or stays on this computer for Windows recognition.
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const MAX_WAV_BYTES = 12 * 1024 * 1024; // about 6 minutes of 16 kHz mono

function multipart(fields, file) {
  const boundary = '----zenframe' + crypto.randomBytes(12).toString('hex');
  const parts = [];
  Object.keys(fields).forEach(k => parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + fields[k] + '\r\n')));
  parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + file.name + '"\r\nContent-Type: ' + file.type + '\r\n\r\n'));
  parts.push(file.data, Buffer.from('\r\n--' + boundary + '--\r\n'));
  return { body: Buffer.concat(parts), type: 'multipart/form-data; boundary=' + boundary };
}

function post(url, key, form, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(u, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': form.type, 'Content-Length': form.body.length, Accept: 'application/json' } }, res => {
      let data = ''; res.setEncoding('utf8');
      res.on('data', c => { data += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch (e) {} resolve({ status: res.statusCode, json, text: data }); });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('The speech service did not respond in time.')));
    req.on('error', reject);
    req.end(form.body);
  });
}

const SERVICES = {
  groq: { label: 'Groq Whisper', url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3-turbo' },
  openai: { label: 'OpenAI Whisper', url: 'https://api.openai.com/v1/audio/transcriptions', model: 'whisper-1' }
};

async function cloud(service, key, wav, language) {
  const s = SERVICES[service];
  const fields = { model: s.model, response_format: 'json', temperature: '0' };
  if (language) fields.language = language;
  const res = await post(s.url, key, multipart(fields, { name: 'speech.wav', type: 'audio/wav', data: wav }));
  if (res.status === 401 || res.status === 403) throw new Error(s.label + ' rejected the saved key. Save it again in Settings.');
  if (res.status === 429) throw new Error(s.label + ' rate limit reached. Wait a minute and try again.');
  if (res.status < 200 || res.status >= 300) throw new Error(s.label + ' error ' + res.status + ': ' + (res.json && res.json.error && res.json.error.message || res.text.slice(0, 200)));
  return String(res.json && res.json.text || '').trim();
}

// Windows' System.Speech dictation, fully offline. Needs a Windows speech language installed (English is by default).
function windows(wav) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('Offline voice typing needs Windows.'));
    const file = path.join(os.tmpdir(), 'zenframe-voice-' + crypto.randomBytes(8).toString('hex') + '.wav');
    fs.writeFileSync(file, wav);
    const script = [
      '$ErrorActionPreference = "Stop"',
      'Add-Type -AssemblyName System.Speech',
      '$r = New-Object System.Speech.Recognition.SpeechRecognitionEngine',
      '$r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))',
      '$r.SetInputToWaveFile($env:ZENFRAME_VOICE_FILE)',
      '$out = @()',
      'while ($true) { $res = $r.Recognize(); if ($res -eq $null) { break }; $out += $res.Text }',
      '$r.Dispose()',
      '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
      'Write-Output ($out -join " ")'
    ].join('; ');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { env: Object.assign({}, process.env, { ZENFRAME_VOICE_FILE: file }), timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(file); } catch (e) {}
        if (err) return reject(new Error(/recognizer|No recognizer|not installed/i.test(String(stderr)) ? 'Windows speech recognition is not installed. Add a speech language in Windows Settings > Time & language > Speech, or save a Groq key for free Whisper.' : 'Windows speech recognition failed: ' + String(stderr || err.message).trim().slice(0, 200)));
        resolve(String(stdout || '').trim());
      });
  });
}

// engine: 'auto' | 'groq' | 'openai' | 'windows'
async function transcribe(wavBase64, { engine = 'auto', keys, language = '' } = {}) {
  if (typeof wavBase64 !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(wavBase64)) throw new Error('The recording could not be read.');
  const wav = Buffer.from(wavBase64, 'base64');
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('The recording could not be read.');
  if (wav.length > MAX_WAV_BYTES) throw new Error('That recording is too long. Keep voice messages under about 5 minutes.');
  const order = engine === 'auto' ? ['groq', 'openai', 'windows'] : [engine];
  for (const svc of order) {
    if (svc === 'windows') return { text: await windows(wav), engine: 'windows' };
    const key = keys ? await keys.get(svc) : null;
    if (key) return { text: await cloud(svc, key, wav, language), engine: svc };
    if (engine !== 'auto') throw new Error((svc === 'groq' ? 'Save a Groq' : 'Save an OpenAI') + ' key in Settings first (pick that provider, paste the key, Save).');
  }
  throw new Error('No voice engine available.');
}

module.exports = { transcribe, multipart, SERVICES };

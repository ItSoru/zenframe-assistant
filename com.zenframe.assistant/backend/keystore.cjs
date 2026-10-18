'use strict';
// Stores the user's Anthropic API key encrypted with Windows DPAPI (current user only).
// The key is never written in plain text, never logged, and only ever handed to the
// Claude Code process as the ANTHROPIC_API_KEY environment variable.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;
const ENTROPY = 'zenframe-assistant-key-v1';

function powershellPath() {
  const root = process.env.SystemRoot || 'C:\\Windows';
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

// Runs a fixed, readable PowerShell script (no -EncodedCommand, which antivirus tools flag).
// Secrets travel only through stdin/stdout, never on the command line.
function runPowerShell(script, input, exe) {
  return new Promise((resolve, reject) => {
    const child = cp.execFile(exe || powershellPath(), ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 20000, maxBuffer: 64 * 1024 },
      (err, stdout) => {
        if (err) return reject(new Error('Windows could not process the API key securely.'));
        resolve(String(stdout).trim());
      });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

const dpapi = {
  protect(secret) {
    return runPowerShell(
      "$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;" +
      "$t=[Console]::In.ReadToEnd().Trim();" +
      "$e=[Text.Encoding]::UTF8.GetBytes('" + ENTROPY + "');" +
      "$p=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($t),$e,[Security.Cryptography.DataProtectionScope]::CurrentUser);" +
      "[Console]::Out.Write([Convert]::ToBase64String($p))", secret);
  },
  unprotect(blob) {
    return runPowerShell(
      "$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;" +
      "$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());" +
      "$e=[Text.Encoding]::UTF8.GetBytes('" + ENTROPY + "');" +
      "$u=[Security.Cryptography.ProtectedData]::Unprotect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser);" +
      "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($u))", blob);
  }
};

const PROVIDER_ID = /^[a-z0-9-]{2,32}$/;
// Anthropic keys have a known shape; other providers vary, so only basic sanity checks apply.
function validKey(provider, key) {
  key = String(key || '').trim();
  if (provider === 'anthropic') return KEY_PATTERN.test(key);
  return /^[\x21-\x7e]{8,500}$/.test(key);
}

class KeyStore {
  constructor(dataDir, protector) {
    this.dir = path.join(dataDir, 'credentials');
    this.protector = protector || (process.platform === 'win32' ? dpapi : null);
    this.cache = {};
  }
  static isValid(provider, key) { return validKey(provider, key); }
  file(provider) {
    if (!PROVIDER_ID.test(String(provider))) throw new Error('Unknown provider.');
    return path.join(this.dir, provider + '-key.dpapi');
  }
  has(provider) { return fs.existsSync(this.file(provider)); }
  async save(provider, key) {
    key = String(key || '').trim();
    if (!validKey(provider, key)) {
      throw new Error(provider === 'anthropic'
        ? 'That does not look like an Anthropic API key. It should start with sk-ant-.'
        : 'That does not look like an API key. Paste the whole key with no spaces.');
    }
    if (!this.protector) throw new Error('Saving an API key requires Windows.');
    const blob = await this.protector.protect(key);
    if (!blob) throw new Error('Windows could not encrypt the API key.');
    fs.mkdirSync(this.dir, { recursive: true });
    const target = this.file(provider), tmp = target + '.tmp';
    fs.writeFileSync(tmp, blob, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, target);
    this.cache[provider] = key;
  }
  async get(provider) {
    if (this.cache[provider]) return this.cache[provider];
    if (!this.has(provider)) return null;
    if (!this.protector) throw new Error('Reading the saved API key requires Windows.');
    const key = (await this.protector.unprotect(fs.readFileSync(this.file(provider), 'utf8'))).trim();
    if (!validKey(provider, key)) throw new Error('The saved API key could not be read. Save it again in Settings.');
    this.cache[provider] = key;
    return key;
  }
  remove(provider) {
    delete this.cache[provider];
    const f = this.file(provider);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  // Every key currently in memory, so error messages can be scrubbed of them.
  knownKeys() { return Object.keys(this.cache).map(k => this.cache[k]).filter(Boolean); }
}

module.exports = { KeyStore, runPowerShell };

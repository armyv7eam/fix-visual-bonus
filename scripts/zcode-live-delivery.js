#!/usr/bin/env node
/**
 * zcode-live-delivery.js — vuelca la entrega pendiente de marketing/touch
 * usando la SESION VIVA de ZCode (credentials.json + keyring del SO).
 * Solo GET. Redacta campos con pinta de token/clave.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ZCODE_DIR = process.env.ZCODE_V2_DIR || path.join(process.env.USERPROFILE || process.env.HOME, '.zcode', 'v2');
const CREDS = path.join(ZCODE_DIR, 'credentials.json');
const ASAR = process.env.ZCODE_ASAR || 'C:/Program Files/ZCode/resources/app.asar';
const ASAR_UNPACKED = process.env.ZCODE_ASAR_UNPACKED || 'C:/Program Files/ZCode/resources/app.asar.unpacked';
const BASE = 'https://zcode.z.ai';
const PLATFORM = 'win32-x64';
const KEYRING_DIR = path.join(__dirname, '.zcode-keyring');
const APP_VERSION = process.env.ZV || '3.18.2';

function readAsarFile(relPath) {
  const buf = fs.readFileSync(ASAR);
  const headerSize = buf.readUInt32LE(12);
  const header = JSON.parse(buf.toString('utf8', 16, 16 + headerSize));
  const dataStart = 16 + headerSize + (headerSize % 4 ? 4 - (headerSize % 4) : 0);
  let node = header;
  for (const part of relPath.split('/')) node = node.files[part];
  const start = dataStart + Number(node.offset);
  return buf.toString('utf8', start, start + node.size);
}
function ensureKeyring() {
  const scope = '@napi-rs';
  const jsDir = path.join(KEYRING_DIR, 'node_modules', scope, 'keyring');
  const binDir = path.join(KEYRING_DIR, 'node_modules', scope, 'keyring-win32-x64-msvc');
  const binSrc = path.join(ASAR_UNPACKED, 'node_modules', scope, 'keyring-win32-x64-msvc', 'keyring.win32-x64-msvc.node');
  if (!fs.existsSync(binSrc)) throw new Error(`Falta binario nativo: ${binSrc}`);
  fs.mkdirSync(jsDir, { recursive: true });
  fs.writeFileSync(path.join(jsDir, 'index.js'), readAsarFile('node_modules/@napi-rs/keyring/index.js'));
  fs.writeFileSync(path.join(jsDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring', version: '2.1.2', main: 'index.js' }));
  fs.mkdirSync(binDir, { recursive: true });
  const binDest = path.join(binDir, 'keyring.win32-x64-msvc.node');
  if (!fs.existsSync(binDest)) fs.copyFileSync(binSrc, binDest);
  fs.writeFileSync(path.join(binDir, 'index.js'), "module.exports = require('./keyring.win32-x64-msvc.node');\n");
  fs.writeFileSync(path.join(binDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring-win32-x64-msvc', version: '2.1.2', main: 'keyring.win32-x64-msvc.node' }));
  return path.join(KEYRING_DIR, 'node_modules', scope, 'keyring');
}
function sha256hex(p) { return crypto.createHash('sha256').update(p).digest('hex'); }
async function loadCredentials() {
  const { AsyncEntry } = require(ensureKeyring());
  const entry = new AsyncEntry('ZCode Credential Encryption', sha256hex(path.resolve(CREDS)), { linux: { store: 'secret-service' } });
  const secret = await entry.getPassword();
  if (!secret) throw new Error('Keyring vacio');
  const key = Buffer.from(secret, 'base64url');
  const creds = JSON.parse(fs.readFileSync(CREDS, 'utf8'));
  const decrypt = (v) => {
    if (typeof v !== 'string' || !v.startsWith('enc:v2:')) return null;
    const parts = v.slice(7).split(':');
    if (parts.length !== 3 || parts[0] !== 'os') return null;
    const [, keyId, payload] = parts;
    if (crypto.createHash('sha256').update(key).digest('hex').slice(0, 24) !== keyId) return null;
    const [iv, tag, data] = payload.split('.').map((x) => Buffer.from(x, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  };
  const out = {};
  for (const [k, v] of Object.entries(creds)) {
    if (typeof v !== 'string') continue;
    try { const p = decrypt(v); if (p) out[k] = p; } catch { /* noop */ }
  }
  return out;
}
function redact(obj, depth = 0) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (obj.length > 48 && /^[A-Za-z0-9_\-.=]+$/.test(obj)) return `<redacto len=${obj.length}>`;
    return obj;
  }
  if (typeof obj !== 'object') return obj;
  if (depth > 8) return '<profundo>';
  if (Array.isArray(obj)) return obj.map((x) => redact(x, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/token|secret|password|jwt|authorization|cookie|signature/i.test(k)) out[k] = v ? `<redacto len=${String(v).length}>` : v;
    else out[k] = redact(v, depth + 1);
  }
  return out;
}
function readDeviceMid() {
  try { return JSON.parse(fs.readFileSync(path.join(ZCODE_DIR, 'telemetry-state.json'), 'utf8')).deviceMid || null; }
  catch { return null; }
}
async function apiGet(url, jwt, deviceMid) {
  const headers = {
    'User-Agent': `ZCode/${APP_VERSION}`, 'HTTP-Referer': BASE, 'X-Title': 'Z Code@electron',
    'X-Client-Language': 'en-US', 'X-ZCode-App-Version': APP_VERSION, 'X-Platform': PLATFORM,
    'X-Os-Category': 'windows',
  };
  if (deviceMid) headers['X-Device-Mid'] = deviceMid;
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* noop */ }
  return { status: res.status, json, text };
}
(async () => {
  const creds = await loadCredentials();
  const jwt = (creds.zcodejwttoken || '').trim();
  const info = creds['oauth:zai:user_info'] ? JSON.parse(creds['oauth:zai:user_info']) : null;
  const deviceMid = readDeviceMid();
  console.log(`app_version=${APP_VERSION} usuario=${info ? info.email : '?'} sesion=${jwt ? 'si' : 'NO'}`);
  if (!jwt) return;
  for (const seq of [0, 1, 3, 4, 5]) {
    const t = await apiGet(`${BASE}/api/v1/marketing/touch?seq=${seq}`, jwt, deviceMid);
    const deliveries = t.json?.data?.deliveries || [];
    console.log(`\n=== seq=${seq} HTTP ${t.status} scope=${t.json?.data?.scope || '?'} entregas=${deliveries.length}`);
    if (!deliveries.length) { if (t.text) console.log('   body:', t.text.slice(0, 300)); continue; }
    for (const d of deliveries) {
      console.log(JSON.stringify(redact(d), null, 2));
    }
  }
  const cfg = await apiGet(`${BASE}/api/v1/client/configs?app_version=${APP_VERSION}&platform=${PLATFORM}`, jwt, deviceMid);
  console.log(`\n=== client/configs HTTP ${cfg.status}`);
  const d = cfg.json?.data || {};
  console.log('notificationCard:', JSON.stringify(redact(d.notificationCard)));
  console.log('startPlanPreview:', JSON.stringify(redact(d.startPlanPreview)).slice(0, 800));
  console.log('claves:', Object.keys(d).join(', '));
})().catch((e) => { console.error('ERROR:', e && e.message ? e.message : e); process.exitCode = 1; });

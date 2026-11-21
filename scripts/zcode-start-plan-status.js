#!/usr/bin/env node
/**
 * zcode-start-plan-status.js
 * ---------------------------------------------------------------------------
 * Verificador de estado del Start Plan de ZCode (Z.ai / zcode.z.ai).
 *
 * NO escribe tokens en disco: descifra las credenciales en memoria desde el
 * keyring del sistema operativo, consulta los endpoints públicos de Z.ai y
 * solo imprime estado (nunca los secretos).
 *
 * Uso:  node zcode-start-plan-status.js
 * ---------------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ZCODE_DIR = process.env.ZCODE_V2_DIR || path.join(process.env.USERPROFILE || process.env.HOME, '.zcode', 'v2');
const CREDS = path.join(ZCODE_DIR, 'credentials.json');
const ASAR = process.env.ZCODE_ASAR || 'C:/Program Files/ZCode/resources/app.asar';
const ASAR_UNPACKED = process.env.ZCODE_ASAR_UNPACKED || 'C:/Program Files/ZCode/resources/app.asar.unpacked';
const APP_VERSION = '3.18.1';
const PLATFORM = 'win32-x64';
const BASE = 'https://zcode.z.ai';
const KEYRING_DIR = path.join(__dirname, '.zcode-keyring');

// ---------------------------------------------------------------- asar reader
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

// --------------------------------------------------------- keyring bootstrap
function ensureKeyring() {
  const scope = '@napi-rs';
  const jsDir = path.join(KEYRING_DIR, 'node_modules', scope, 'keyring');
  const binDir = path.join(KEYRING_DIR, 'node_modules', scope, 'keyring-win32-x64-msvc');
  const binSrc = path.join(
    ASAR_UNPACKED, 'node_modules', scope, 'keyring-win32-x64-msvc', 'keyring.win32-x64-msvc.node'
  );
  if (!fs.existsSync(binSrc)) throw new Error(`No se encuentra el binario nativo: ${binSrc}`);

  fs.mkdirSync(jsDir, { recursive: true });
  fs.writeFileSync(path.join(jsDir, 'index.js'), readAsarFile('node_modules/@napi-rs/keyring/index.js'));
  fs.writeFileSync(path.join(jsDir, 'package.json'),
    JSON.stringify({ name: '@napi-rs/keyring', version: '2.1.2', main: 'index.js' }));

  fs.mkdirSync(binDir, { recursive: true });
  const binDest = path.join(binDir, 'keyring.win32-x64-msvc.node');
  // Si ya existe (y está cargado por otro proceso) no se vuelve a copiar: evita EBUSY.
  if (!fs.existsSync(binDest)) fs.copyFileSync(binSrc, binDest);
  fs.writeFileSync(path.join(binDir, 'package.json'),
    JSON.stringify({ name: '@napi-rs/keyring-win32-x64-msvc', version: '2.1.2', main: 'keyring.win32-x64-msvc.node' }));

  return path.join(KEYRING_DIR, 'node_modules', scope, 'keyring');
}

// -------------------------------------------------------------- credential IO
function sha256hex(p) { return crypto.createHash('sha256').update(p).digest('hex'); }

async function loadCredentials() {
  const keyringPath = ensureKeyring();
  const { AsyncEntry } = require(keyringPath);
  const entry = new AsyncEntry('ZCode Credential Encryption', sha256hex(path.resolve(CREDS)), {
    linux: { store: 'secret-service' },
  });
  const secret = await entry.getPassword();
  if (!secret) throw new Error('Keyring vacío: no se encontró la clave de cifrado de ZCode.');
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
    try { const p = decrypt(v); if (p) out[k] = p; } catch { /* ignorado */ }
  }
  return out;
}

// -------------------------------------------------------------------- helpers
function readDeviceMid() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ZCODE_DIR, 'telemetry-state.json'), 'utf8'));
    return j.deviceMid || null;
  } catch { return null; }
}

function ts(sec) {
  return sec ? new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'n/a';
}

async function apiGet(url, jwt, deviceMid) {
  const headers = {
    'User-Agent': `ZCode/${APP_VERSION}`,
    'HTTP-Referer': BASE,
    'X-Title': 'Z Code@electron',
    'X-Client-Language': 'en-US',
    'X-ZCode-App-Version': APP_VERSION,
    'X-Platform': PLATFORM,
    'X-Os-Category': 'windows',
  };
  if (deviceMid) headers['X-Device-Mid'] = deviceMid;
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* no json */ }
  return { status: res.status, json, text };
}

// ---------------------------------------------------------------------- main
(async () => {
  console.log('=== ZCode Start Plan — estado de la cuenta ===\n');
  const creds = await loadCredentials();
  const jwt = (creds.zcodejwttoken || '').trim();
  const info = creds['oauth:zai:user_info'] ? JSON.parse(creds['oauth:zai:user_info']) : null;
  const deviceMid = readDeviceMid();

  console.log(`Usuario Z.ai : ${info ? `${info.name} <${info.email}>` : 'desconocido'}`);
  console.log(`Device Mid   : ${deviceMid || 'no encontrado'}`);
  console.log(`Sesión JWT   : ${jwt ? 'presente' : 'AUSENTE'}`);

  if (!jwt) {
    console.log('\nNo hay sesión Z.ai activa. Abre ZCode e inicia sesión.');
    return;
  }

  const bal = await apiGet(
    `${BASE}/api/v1/zcode-plan/billing/balance?app_version=${APP_VERSION}`, jwt, deviceMid);
  const plans = bal.json?.data?.plans || [];
  const balances = bal.json?.data?.balances || [];

  console.log(`\n--- billing/balance (HTTP ${bal.status}) ---`);
  if (!plans.length) {
    console.log('  Sin planes activos -> la UI muestra "No available Start Plan".');
  }
  for (const p of plans) {
    console.log(`  plan ${p.plan_id}  status=${p.status}`);
    console.log(`        ${ts(p.starts_at)}  ->  ${ts(p.ends_at)}`);
    for (const e of p.entitlements || []) {
      console.log(`        · ${e.show_name}: ${e.grant_units} ${e.unit_type}/${e.period}`);
    }
  }
  for (const b of balances) {
    console.log(`  saldo ${b.show_name}: ${b.used_units}/${b.total_units} usados, ` +
      `${b.remaining_units} restantes (reinicio ${b.period_start ? ts(b.period_start) : 'n/a'})`);
  }

  const prev = await apiGet(
    `${BASE}/api/v1/zcode-plan/billing/preview?app_version=${APP_VERSION}&platform=${PLATFORM}`,
    jwt, deviceMid);
  const prevPlans = prev.json?.data?.plans || [];
  console.log(`\n--- billing/preview (HTTP ${prev.status}) — campañas reclamables ---`);
  if (!prevPlans.length) console.log('  Ninguna campaña disponible ahora mismo.');
  for (const p of prevPlans) console.log(`  · ${p.plan_id}  ${p.name || ''}`);

  const touch = await apiGet(`${BASE}/api/v1/marketing/touch?seq=0`, jwt, deviceMid);
  const deliveries = touch.json?.data?.deliveries || [];
  console.log(`\n--- marketing/touch (HTTP ${touch.status}) ---`);
  console.log(`  entregas pendientes: ${deliveries.length}`);
  for (const d of deliveries) {
    console.log(`  · campaign=${d.campaign_id || d.campaignId || '?'} action=${d.action_type || d.actionType || '?'}`);
  }

  console.log('\nNota: el reclamo de un plan exige el token de captcha de Aliyun');
  console.log('     (X-Aliyun-Captcha-Verify-Param), que solo genera el renderer de ZCode.');
})().catch((e) => {
  console.error('ERROR:', e && e.message ? e.message : e);
  process.exitCode = 1;
});

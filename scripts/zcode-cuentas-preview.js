#!/usr/bin/env node
/**
 * zcode-cuentas-preview.js — estado de campañas de las 5 cuentas Z.ai usando SOLO
 * `billing/preview`, que NO consume la entrega.
 *
 * Por qué: consultar `marketing/touch` avanza el cursor del servidor y entrega la
 * campana (~8 impresiones). Ese endpoint hay que reservarlo para el momento exacto
 * del reclamo. `billing/preview` responde "que campañas son reclamables para esta
 * cuenta" sin tocar el cursor de marketing.
 *
 *   node zcode-cuentas-preview.js
 *
 * Salida por cuenta: plan_id, nombre, estado y ventana de la campaña.
 */
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');

const DIR = __dirname;
const ZCODE_DIR = process.env.ZCODE_V2_DIR || path.join(process.env.USERPROFILE || process.env.HOME, '.zcode', 'v2');
const CREDS = path.join(ZCODE_DIR, 'credentials.json');
const ASAR = process.env.ZCODE_ASAR || 'C:/Program Files/ZCode/resources/app.asar';
const ASAR_UNPACKED = process.env.ZCODE_ASAR_UNPACKED || 'C:/Program Files/ZCode/resources/app.asar.unpacked';
const KEYRING_DIR = path.join(DIR, '.zcode-keyring');
const VAULT_CANDIDATOS = [process.env.ZCODE_VAULT, path.join(__dirname, 'vault', 'sessions.vault'), path.join(__dirname, '..', 'vault', 'sessions.vault'), path.join(ZCODE_DIR, 'vault', 'sessions.vault')].filter(Boolean);
const VAULT_FILE = VAULT_CANDIDATOS.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || VAULT_CANDIDATOS[0];
const BASE = 'https://zcode.z.ai';
const PLATFORM = 'win32-x64';
const APP_VERSION = '3.18.2';

function readAsarFile(rel) {
  const buf = fs.readFileSync(ASAR); const hs = buf.readUInt32LE(12);
  const header = JSON.parse(buf.toString('utf8', 16, 16 + hs));
  const start = 16 + hs + (hs % 4 ? 4 - (hs % 4) : 0);
  let n = header; for (const p of rel.split('/')) n = n.files[p];
  const off = start + Number(n.offset);
  return buf.toString('utf8', off, off + n.size);
}
function ensureKeyring() {
  const s = '@napi-rs';
  const jsDir = path.join(KEYRING_DIR, 'node_modules', s, 'keyring');
  const binDir = path.join(KEYRING_DIR, 'node_modules', s, 'keyring-win32-x64-msvc');
  const binSrc = path.join(ASAR_UNPACKED, 'node_modules', s, 'keyring-win32-x64-msvc', 'keyring.win32-x64-msvc.node');
  if (!fs.existsSync(binSrc)) throw new Error('falta binario nativo del keyring');
  fs.mkdirSync(jsDir, { recursive: true });
  fs.writeFileSync(path.join(jsDir, 'index.js'), readAsarFile('node_modules/@napi-rs/keyring/index.js'));
  fs.writeFileSync(path.join(jsDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring', version: '2.1.2', main: 'keyring/index.js' }));
  fs.mkdirSync(binDir, { recursive: true });
  const bd = path.join(binDir, 'keyring.win32-x64-msvc.node');
  if (!fs.existsSync(bd)) fs.copyFileSync(binSrc, bd);
  fs.writeFileSync(path.join(binDir, 'index.js'), "module.exports = require('./keyring.win32-x64-msvc.node');\n");
  fs.writeFileSync(path.join(binDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring-win32-x64-msvc', version: '2.1.2', main: 'keyring.win32-x64-msvc.node' }));
  return path.join(KEYRING_DIR, 'node_modules', s, 'keyring');
}
function sha256hex(p) { return crypto.createHash('sha256').update(p).digest('hex'); }
async function keyringSecret(service, account) {
  const { AsyncEntry } = require(ensureKeyring());
  return new AsyncEntry(service, account, { linux: { store: 'secret-service' } }).getPassword();
}

async function liveCredentials() {
  const { AsyncEntry } = require(ensureKeyring());
  const entry = new AsyncEntry('ZCode Credential Encryption', sha256hex(path.resolve(CREDS)), { linux: { store: 'secret-service' } });
  const secret = await entry.getPassword();
  if (!secret) return null;
  const key = Buffer.from(secret, 'base64url');
  const creds = JSON.parse(fs.readFileSync(CREDS, 'utf8'));
  const dec = (v) => {
    if (typeof v !== 'string' || !v.startsWith('enc:v2:')) return null;
    const p = v.slice(7).split(':');
    if (p.length !== 3 || p[0] !== 'os') return null;
    if (crypto.createHash('sha256').update(key).digest('hex').slice(0, 24) !== p[1]) return null;
    const [iv, tag, data] = p[2].split('.').map((x) => Buffer.from(x, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  };
  const out = {};
  for (const [k, v] of Object.entries(creds)) {
    if (typeof v !== 'string') continue;
    try { const p = dec(v); if (p) out[k] = p; } catch { }
  }
  const jwt = (out.zcodejwttoken || '').trim();
  if (!jwt) return null;
  let info = {};
  try { info = out['oauth:zai:user_info'] ? JSON.parse(out['oauth:zai:user_info']) : {}; } catch { }
  if (!info.email) { try { info = JSON.parse(out['oauth:zai_cn:user_info'] || '{}'); } catch { } }
  return { email: info.email || '(desconocido)', jwt };
}

async function vaultSessions() {
  try {
    const secret = await keyringSecret('ZCode Vault Key', sha256hex(path.resolve(VAULT_FILE)));
    if (!secret) return [];
    const key = Buffer.from(secret, 'base64url');
    const blob = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8'));
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64url'));
    d.setAuthTag(Buffer.from(blob.tag, 'base64url'));
    const vault = JSON.parse(Buffer.concat([d.update(Buffer.from(blob.data, 'base64url')), d.final()]).toString('utf8'));
    return Object.values(vault.sessions || {});
  } catch { return []; }
}

let deviceMid = null;
try { deviceMid = JSON.parse(fs.readFileSync(path.join(ZCODE_DIR, 'telemetry-state.json'), 'utf8')).deviceMid; } catch { }

async function apiGet(p, jwt) {
  const headers = {
    'User-Agent': `ZCode/${APP_VERSION}`, 'HTTP-Referer': BASE, 'X-Title': 'Z Code@electron',
    'X-Client-Language': 'en-US', 'X-ZCode-App-Version': APP_VERSION, 'X-Platform': PLATFORM,
    'X-Os-Category': 'windows', Authorization: `Bearer ${jwt}`
  };
  if (deviceMid) headers['X-Device-Mid'] = deviceMid;
  const r = await fetch(`${BASE}${p}`, { headers });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { }
  return { status: r.status, json: j };
}

async function cuentas() {
  const lista = [];
  const live = await liveCredentials();
  if (live) lista.push({ email: live.email, jwt: live.jwt, live: true });
  for (const s of await vaultSessions()) {
    const jwt = s.zcodejwttoken || s.jwt || s.token || s.accessToken;
    if (!jwt) continue;
    const email = s.email || s.user?.email || '(sin email)';
    if (lista.some((x) => x.email === email)) continue;
    lista.push({ email, jwt, live: false });
  }
  return lista;
}

(async () => {
  const { cargarConfig, filtrarCuentas } = require('./zcode-config');
  const CFG = cargarConfig();
  console.log('=== Campañas reclamables por cuenta (billing/preview — NO consume entrega) ===\n');
  if (CFG.ruta) console.log(`config: ${CFG.ruta} · cuentas: ${CFG.cuentas.length ? CFG.cuentas.join(', ') : 'todas'}\n`);
  const todas = await cuentas();
  const lista = filtrarCuentas(todas, CFG);
  if (CFG.cuentas.length) {
    const fuera = todas.filter((c) => !lista.includes(c));
    if (fuera.length) console.log(`(omitidas por config: ${fuera.map((c) => c.email).join(', ')})\n`);
  }
  let conCampana = 0;
  for (const c of lista) {
    const tag = c.live ? ' [SESIÓN ACTIVA]' : '';
    const prev = await apiGet(`/api/v1/zcode-plan/billing/preview?app_version=${APP_VERSION}&platform=${PLATFORM}`, c.jwt);
    const bal = await apiGet(`/api/v1/zcode-plan/billing/balance?app_version=${APP_VERSION}`, c.jwt);
    const planes = prev.json?.data?.plans || [];
    const activos = (bal.json?.data?.plans || []).filter((p) => p.status === 'active');
    const saldos = bal.json?.data?.balances || [];
    const saldoTxt = saldos.map((b) => `${b.show_name}: ${b.remaining_units}/${b.total_units}`).join(' | ') || 'sin saldo';
    console.log(`— ${c.email}${tag}`);
    console.log(`   preview  HTTP ${prev.status} · ${planes.length ? '' : 'sin'} campaña(s) disponible(s)`);
    for (const p of planes) {
      conCampana++;
      console.log(`      · ${p.plan_id}  ${p.name || ''}  ${p.status ? '[' + p.status + ']' : ''}`);
      if (p.start_time || p.end_time) console.log(`        ventana: ${p.start_time || '?'} -> ${p.end_time || '?'}`);
    }
    console.log(`   balance  HTTP ${bal.status} · planes activos: ${activos.map((p) => p.plan_id).join(', ') || 'ninguno'}`);
    console.log(`   saldo: ${saldoTxt}\n`);
  }
  console.log(conCampana
    ? `>> ${conCampana} cuenta(s) con campaña reclamable. Reclamar requiere el banner en el renderer (clic real + captcha del renderer).`
    : '>> Ninguna cuenta tiene campaña reclamable en este momento.');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

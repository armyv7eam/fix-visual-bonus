#!/usr/bin/env node
/**
 * zcode-provider-check.js — comprueba si el Start Plan se puede consumir desde
 * un cliente externo (Claude Code, Codex CLI, OpenCode, curl, MCP server).
 *
 * Hace una matriz endpoint x credencial x cabecera y NO imprime ningun secreto:
 * solo nombres de cabecera, longitudes y codigos de error del servidor.
 *
 * Gasto: una llamada minima (max_tokens 16) por combinacion que llega al
 * servidor de modelos. Las que no llegan se cortan antes.
 *
 *   node scripts/zcode-provider-check.js
 */
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const { AsyncEntry } = require(path.join(__dirname, '.zcode-keyring', 'node_modules', '@napi-rs', 'keyring'));

const ZCODE_DIR = process.env.ZCODE_V2_DIR || path.join(process.env.USERPROFILE || process.env.HOME, '.zcode', 'v2');
const CREDS = path.join(ZCODE_DIR, 'credentials.json');
const ASAR = process.env.ZCODE_ASAR || 'C:/Program Files/ZCode/resources/app.asar';
const ASAR_UNPACKED = process.env.ZCODE_ASAR_UNPACKED || 'C:/Program Files/ZCode/resources/app.asar.unpacked';
const KEYRING_DIR = path.join(__dirname, '.zcode-keyring');
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
  fs.writeFileSync(path.join(jsDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring', version: '2.1.2', main: 'index.js' }));
  fs.mkdirSync(binDir, { recursive: true });
  const bd = path.join(binDir, 'keyring.win32-x64-msvc.node');
  if (!fs.existsSync(bd)) fs.copyFileSync(binSrc, bd);
  fs.writeFileSync(path.join(binDir, 'index.js'), "module.exports = require('./keyring.win32-x64-msvc.node');\n");
  fs.writeFileSync(path.join(binDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring-win32-x64-msvc', version: '2.1.2', main: 'keyring.win32-x64-msvc.node' }));
  return path.join(KEYRING_DIR, 'node_modules', s, 'keyring');
}
const sha256hex = (p) => crypto.createHash('sha256').update(p).digest('hex');

async function credenciales() {
  const entry = new AsyncEntry('ZCode Credential Encryption', sha256hex(path.resolve(CREDS)), { linux: { store: 'secret-service' } });
  const secret = await entry.getPassword();
  if (!secret) throw new Error('no se encontro la clave de credenciales en el keyring');
  const key = Buffer.from(secret, 'base64url');
  const raw = JSON.parse(fs.readFileSync(CREDS, 'utf8'));
  const dec = (v) => {
    if (typeof v !== 'string' || !v.startsWith('enc:v2:')) return null;
    const p = v.slice(7).split(':');
    if (p.length !== 3 || p[0] !== 'os') return null;
    if (sha256hex(key).slice(0, 24) !== p[1]) return null;
    const [iv, tag, data] = p[2].split('.').map((x) => Buffer.from(x, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  };
  const out = {};
  for (const [k, v] of Object.entries(raw)) { if (typeof v !== 'string') continue; try { const p = dec(v); if (p) out[k] = p; } catch { } }
  return out;
}
const claims = (t) => { try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString('utf8')); } catch { return {}; } };
function deviceMid() { try { return JSON.parse(fs.readFileSync(path.join(ZCODE_DIR, 'telemetry-state.json'), 'utf8')).deviceMid || null; } catch { return null; } }

function cabecerasBase() {
  const h = {
    'User-Agent': `ZCode/${APP_VERSION}`, 'HTTP-Referer': BASE, 'X-Title': 'Z Code@electron',
    'X-Client-Language': 'en-US', 'X-ZCode-App-Version': APP_VERSION, 'X-Platform': PLATFORM,
    'X-Os-Category': 'windows',
  };
  const dm = deviceMid();
  if (dm) h['X-Device-Mid'] = dm;
  return h;
}

async function llamar(url, h, modelo, anthropic) {
  const headers = { 'Content-Type': 'application/json', ...h };
  if (anthropic) headers['anthropic-version'] = '2023-06-01';
  const body = anthropic
    ? { model: modelo, max_tokens: 16, messages: [{ role: 'user', content: 'Responde exactamente: OK' }] }
    : { model: modelo, messages: [{ role: 'user', content: 'Responde exactamente: OK' }], max_tokens: 16, temperature: 0 };
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(40000) });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { }
    const contenido = json?.choices?.[0]?.message?.content ?? (Array.isArray(json?.content) ? json.content.map((c) => c.text || '').join('') : json?.content);
    const msg = json?.error?.message || json?.msg || json?.message || (json?.error?.code ? 'error.code=' + json.error.code : '');
    // OJO: un 200 con {"error":{...}} NO es exito
    const ok = res.status === 200 && !!contenido;
    return { ok, status: res.status, detalle: ok ? `respuesta="${String(contenido).slice(0, 30)}"` : (msg || text.replace(/\s+/g, ' ').slice(0, 90)) };
  } catch (e) { return { ok: false, status: 'ERR', detalle: e.message }; }
}

(async () => {
  console.log('=== zcode-provider-check: el Start Plan desde un cliente externo ===\n');
  let c;
  try { c = await credenciales(); } catch (e) { console.error('ERROR:', e.message); process.exit(1); }

  const accessToken = (c['oauth:zai:access_token'] || '').trim();
  const zcodeJwt = (c.zcodejwttoken || '').trim();
  const cl = claims(accessToken);
  console.log('Credenciales disponibles en el disco (en memoria, no se imprimen):');
  console.log('  oauth:zai:access_token : ' + (accessToken ? 'si (' + accessToken.length + ' chars, claims=' + Object.keys(cl).join(',') + ')' : 'no'));
  console.log('  zcodejwttoken           : ' + (zcodeJwt ? 'si (' + zcodeJwt.length + ' chars)' : 'no'));
  console.log('  claim api_key           : ' + ((cl.api_key || '').trim() ? 'presente' : 'vacio'));
  console.log('');

  const base = cabecerasBase();
  const MODELO = 'GLM-5.3-Flash';

  const CASOS = [
    {
      nombre: 'Start Plan Anthropic (zcode.z.ai) + zcodejwttoken',
      url: `${BASE}/api/v1/zcode-plan/anthropic/v1/messages`, anthropic: true,
      h: { ...base, Authorization: `Bearer ${zcodeJwt}` },
    },
    {
      nombre: 'Start Plan Anthropic (zcode.z.ai) + access_token Bearer',
      url: `${BASE}/api/v1/zcode-plan/anthropic/v1/messages`, anthropic: true,
      h: { ...base, Authorization: `Bearer ${accessToken}` },
    },
    {
      nombre: 'Start Plan Anthropic (zcode.z.ai) + access_token en x-api-key',
      url: `${BASE}/api/v1/zcode-plan/anthropic/v1/messages`, anthropic: true,
      h: { ...base, 'x-api-key': accessToken },
    },
    {
      nombre: 'Start Plan OpenAI (zcode.z.ai) + access_token',
      url: `${BASE}/api/v1/zcode-plan/chat/completions`, anthropic: false,
      h: { ...base, Authorization: `Bearer ${accessToken}` },
    },
    {
      nombre: 'Z.ai publico Anthropic + access_token',
      url: 'https://api.z.ai/api/anthropic/v1/messages', anthropic: true,
      h: { Authorization: `Bearer ${accessToken}` },
    },
    {
      nombre: 'Z.ai publico coding/paas/v4 + access_token',
      url: 'https://api.z.ai/api/coding/paas/v4/chat/completions', anthropic: false,
      h: { Authorization: `Bearer ${accessToken}` },
    },
    {
      nombre: 'Z.ai publico coding/paas/v4 + access_token en x-api-key',
      url: 'https://api.z.ai/api/coding/paas/v4/chat/completions', anthropic: false,
      h: { 'x-api-key': accessToken },
    },
  ];

  let alguno = false;
  for (const caso of CASOS) {
    const r = await llamar(caso.url, caso.h, MODELO, caso.anthropic);
    if (r.ok) alguno = true;
    console.log(`[${r.ok ? 'FUNCIONA' : 'BLOQUEADO'}] HTTP ${r.status}  ${caso.nombre}`);
    console.log(`            ${r.detalle}`);
    await new Promise((x) => setTimeout(x, 300));
  }

  console.log('\n--- veredicto ---');
  if (alguno) {
    console.log('Al menos una ruta respondio con contenido de modelo. Mira arriba cual y usa esa.');
  } else {
    console.log('NINGUNA ruta externa sirvio el Start Plan.');
    console.log('El Start Plan de campana solo se consume dentro de ZCode (o desde un MCP server');
    console.log('que corra dentro de ZCode usando el carril "official auth").');
    console.log('Para un harness EXTERNO usa el Coding Plan de Z.ai (API key propia, otro producto).');
  }
})().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1); });

#!/usr/bin/env node
/**
 * zcode-claim-retry.js — reclama el banner con reintentos y verificacion real.
 *
 * Por que reintenta: al pulsar el boton, el renderer hace un "preflight" del captcha
 * de Aliyun antes de enviar el claim. Ese preflight falla de forma intermitente
 * (sdkCode F001 = fallo de red del captcha), aunque un segundo intento del SDK
 * funcione. Un solo clic no basta: hay que reintentar hasta que el plan aparezca
 * en billing/balance.
 *
 * Uso: node zcode-claim-retry.js [intentos] [esperaMsEntreIntentos]
 * Pre-requisito: ZCode corriendo con --remote-debugging-port=9222
 */
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const ASAR = process.env.ZCODE_ASAR || 'C:/Program Files/ZCode/resources/app.asar';
const ASAR_UNPACKED = process.env.ZCODE_ASAR_UNPACKED || 'C:/Program Files/ZCode/resources/app.asar.unpacked';
const KEYRING_DIR = path.join(__dirname, '.zcode-keyring');
function readAsarFile(rel) { const buf = fs.readFileSync(ASAR); const hs = buf.readUInt32LE(12); const header = JSON.parse(buf.toString('utf8', 16, 16 + hs)); const start = 16 + hs + (hs % 4 ? 4 - (hs % 4) : 0); let n = header; for (const p of rel.split('/')) n = n.files[p]; const off = start + Number(n.offset); return buf.toString('utf8', off, off + n.size); }
function ensureKeyring() { const s = '@napi-rs'; const jsDir = path.join(KEYRING_DIR, 'node_modules', s, 'keyring'); const binDir = path.join(KEYRING_DIR, 'node_modules', s, 'keyring-win32-x64-msvc'); const binSrc = path.join(ASAR_UNPACKED, 'node_modules', s, 'keyring-win32-x64-msvc', 'keyring.win32-x64-msvc.node'); if (!fs.existsSync(binSrc)) throw new Error('falta binario nativo del keyring'); fs.mkdirSync(jsDir, { recursive: true }); fs.writeFileSync(path.join(jsDir, 'index.js'), readAsarFile('node_modules/@napi-rs/keyring/index.js')); fs.writeFileSync(path.join(jsDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring', version: '2.1.2', main: 'index.js' })); fs.mkdirSync(binDir, { recursive: true }); const bd = path.join(binDir, 'keyring.win32-x64-msvc.node'); if (!fs.existsSync(bd)) fs.copyFileSync(binSrc, bd); fs.writeFileSync(path.join(binDir, 'index.js'), "module.exports = require('./keyring.win32-x64-msvc.node');\n"); fs.writeFileSync(path.join(binDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring-win32-x64-msvc', version: '2.1.2', main: 'keyring.win32-x64-msvc.node' })); return path.join(KEYRING_DIR, 'node_modules', s, 'keyring'); }
const { AsyncEntry } = require(ensureKeyring());

const PORT = process.env.CDP_PORT || '9222';
const INTENTOS = Number(process.argv[2] || 6);
const ESPERA = Number(process.argv[3] || 20000);
const ZCODE_DIR = process.env.ZCODE_V2_DIR || path.join(process.env.USERPROFILE || process.env.HOME, '.zcode', 'v2');
const CREDS = path.join(ZCODE_DIR, 'credentials.json');
const BASE = 'https://zcode.z.ai';
const APP_VERSION = '3.18.2';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256hex = (p) => crypto.createHash('sha256').update(p).digest('hex');

let deviceMid = null;
try { deviceMid = JSON.parse(fs.readFileSync(path.join(ZCODE_DIR, 'telemetry-state.json'), 'utf8')).deviceMid; } catch {}

async function tokenActual() {
  const secret = await new AsyncEntry('ZCode Credential Encryption', sha256hex(path.resolve(CREDS)), { linux: { store: 'secret-service' } }).getPassword();
  if (!secret) return null;
  const key = Buffer.from(secret, 'base64url');
  const creds = JSON.parse(fs.readFileSync(CREDS, 'utf8'));
  const v = creds['zcodejwttoken'];
  if (typeof v !== 'string' || !v.startsWith('enc:v2:')) return null;
  try {
    const p = v.slice(7).split(':');
    const [iv, tag, data] = p[2].split('.').map((x) => Buffer.from(x, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch { return null; }
}

async function planActivo(jwt) {
  const headers = {
    'User-Agent': `ZCode/${APP_VERSION}`, 'HTTP-Referer': BASE, 'X-Title': 'Z Code@electron',
    'X-Client-Language': 'en-US', 'X-ZCode-App-Version': APP_VERSION, 'X-Platform': 'win32-x64',
    'X-Os-Category': 'windows', 'Authorization': `Bearer ${jwt}`,
    ...(deviceMid ? { 'X-Device-Mid': deviceMid } : {}),
  };
  try {
    const r = await fetch(`${BASE}/api/v1/zcode-plan/billing/balance?app_version=${APP_VERSION}`, { headers, signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    const plans = j?.data?.plans || [];
    const bal = j?.data?.balances || [];
    return { plans, bal };
  } catch (e) { return { plans: [], bal: [], err: e.message }; }
}

async function getTarget() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) });
  const pages = (await res.json()).filter((t) => t.type === 'page');
  return pages.find((t) => /app\.asar\/out\/renderer\/index\.html/i.test(t.url)) || pages[0] || null;
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url); let id = 0; const pending = new Map();
    ws.addEventListener('message', (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    ws.addEventListener('open', () => resolve({
      send(method, params) { return new Promise((res) => { const myId = ++id; pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); }); },
      close: () => ws.close(),
    }));
    ws.addEventListener('error', reject, { once: true });
  });
}

const PREP = `(() => {
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus'));
  const el = document.querySelector('[data-testid="marketing-banner"]');
  if (!el) return 'sin-banner';
  const s = el.style;
  s.removeProperty('height'); s.removeProperty('overflow'); s.removeProperty('visibility');
  el.style.height='auto'; el.style.visibility='visible'; el.style.overflow='visible'; el.style.display='block';
  const ifr = el.querySelector('iframe');
  const btn = el.querySelector('button');
  if (btn) { btn.disabled = false; btn.removeAttribute('aria-disabled'); }
  return JSON.stringify({ iframe: !!ifr, iframeStatus: ifr ? ifr.getAttribute('data-status') : null, btnDisabled: btn ? btn.disabled : null, heroErr: !!el.querySelector('[data-testid="cloud-dialog-hero-error"]') });
})()`;

const CLICK = `(() => {
  const el = document.querySelector('[data-testid="marketing-banner"]');
  if (!el) return 'sin-banner';
  const btn = el.querySelector('button');
  if (!btn) return 'sin-boton';
  btn.click();
  return 'clic-enviado';
})()`;

(async () => {
  const jwt = await tokenActual();
  if (!jwt) { console.error('no se pudo leer el zcodejwttoken del disco'); process.exit(1); }

  const antes = await planActivo(jwt);
  if (antes.plans.length) {
    console.log('ya hay plan activo, no hace falta reclamar:');
    for (const p of antes.plans) console.log('   ' + p.plan_id + ' [' + p.status + ']');
    return;
  }

  const target = await getTarget().catch(() => null);
  if (!target) { console.error('CDP no responde — ZCode debe correr con --remote-debugging-port=' + PORT); process.exit(3); }
  const cdp = await connect(target.webSocketDebuggerUrl);
  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, userGesture: true });
    return r.result?.result?.value;
  };

  console.log('banner antes del clic: ' + await ev(PREP));

  for (let i = 1; i <= INTENTOS; i++) {
    const estado = await ev(PREP);
    console.log('\n[intento ' + i + '/' + INTENTOS + '] ' + estado);
    console.log('  ' + await ev(CLICK));
    await sleep(ESPERA);
    const p = await planActivo(jwt);
    if (p.plans.length) {
      console.log('\n*** PLAN ACTIVO ***');
      for (const pl of p.plans) console.log('   ' + pl.plan_id + ' [' + pl.status + ']');
      for (const b of p.bal) console.log('   saldo: ' + b.show_name + ' ' + b.used_units + '/' + b.total_units + ' usados, ' + b.remaining_units + ' restantes');
      cdp.close();
      process.exit(0);
    }
    console.log('  sin plan todavia; reintentando...');
  }

  console.log('\nNO se pudo confirmar el plan tras ' + INTENTOS + ' intentos.');
  console.log('Revisa el log de ZCode en ' + path.join(ZCODE_DIR, 'logs') + ' (busca captcha-diagnostics / marketing-touch.report)');
  cdp.close();
  process.exit(4);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

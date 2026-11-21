#!/usr/bin/env node
/**
 * zcode-cuentas-cupon.js — revisa TODAS las cuentas Z.ai de la boveda:
 * entregas marketing/touch pendientes (cupones) y planes activos.
 */
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const ASAR = process.env.ZCODE_ASAR || 'C:/Program Files/ZCode/resources/app.asar';
const ASAR_UNPACKED = process.env.ZCODE_ASAR_UNPACKED || 'C:/Program Files/ZCode/resources/app.asar.unpacked';
const KEYRING_DIR = path.join(__dirname, '.zcode-keyring');
const ZCODE_DIR = process.env.ZCODE_V2_DIR || path.join(process.env.USERPROFILE || process.env.HOME, '.zcode', 'v2');
const VAULT_CANDIDATOS = [process.env.ZCODE_VAULT, path.join(__dirname, 'vault', 'sessions.vault'), path.join(__dirname, '..', 'vault', 'sessions.vault'), path.join(ZCODE_DIR, 'vault', 'sessions.vault')].filter(Boolean);
const VAULT_FILE = VAULT_CANDIDATOS.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || VAULT_CANDIDATOS[0];
const BASE = 'https://zcode.z.ai';
const PLATFORM = 'win32-x64';
function readAsarFile(rel) { const buf = fs.readFileSync(ASAR); const hs = buf.readUInt32LE(12); const header = JSON.parse(buf.toString('utf8', 16, 16 + hs)); const start = 16 + hs + (hs % 4 ? 4 - (hs % 4) : 0); let n = header; for (const p of rel.split('/')) n = n.files[p]; const off = start + Number(n.offset); return buf.toString('utf8', off, off + n.size); }
function ensureKeyring() { const s = '@napi-rs'; const jsDir = path.join(KEYRING_DIR, 'node_modules', s, 'keyring'); const binDir = path.join(KEYRING_DIR, 'node_modules', s, 'keyring-win32-x64-msvc'); const binSrc = path.join(ASAR_UNPACKED, 'node_modules', s, 'keyring-win32-x64-msvc', 'keyring.win32-x64-msvc.node'); if (!fs.existsSync(binSrc)) throw new Error('falta binario'); fs.mkdirSync(jsDir, { recursive: true }); fs.writeFileSync(path.join(jsDir, 'index.js'), readAsarFile('node_modules/@napi-rs/keyring/index.js')); fs.writeFileSync(path.join(jsDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring', version: '2.1.2', main: 'index.js' })); fs.mkdirSync(binDir, { recursive: true }); const bd = path.join(binDir, 'keyring.win32-x64-msvc.node'); if (!fs.existsSync(bd)) fs.copyFileSync(binSrc, bd); fs.writeFileSync(path.join(binDir, 'index.js'), "module.exports = require('./keyring.win32-x64-msvc.node');\n"); fs.writeFileSync(path.join(binDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring-win32-x64-msvc', version: '2.1.2', main: 'keyring.win32-x64-msvc.node' })); return path.join(KEYRING_DIR, 'node_modules', s, 'keyring'); }
async function keyringSecret(service, account) { const { AsyncEntry } = require(ensureKeyring()); const e = new AsyncEntry(service, account, { linux: { store: 'secret-service' } }); return e.getPassword(); }
async function vaultSessions() {
  try {
    const secret = await keyringSecret('ZCode Vault Key', crypto.createHash('sha256').update(path.resolve(VAULT_FILE)).digest('hex'));
    if (!secret) return [];
    const key = Buffer.from(secret, 'base64url');
    const blob = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8'));
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64url'));
    d.setAuthTag(Buffer.from(blob.tag, 'base64url'));
    const vault = JSON.parse(Buffer.concat([d.update(Buffer.from(blob.data, 'base64url')), d.final()]).toString('utf8'));
    return Object.values(vault.sessions || {});
  } catch (e) { console.error('no se pudo abrir la boveda:', e.message); return []; }
}
let deviceMid = null;
try { deviceMid = JSON.parse(fs.readFileSync(path.join(ZCODE_DIR, 'telemetry-state.json'), 'utf8')).deviceMid; } catch { }
async function apiGet(path, jwt, ver) {
  const headers = { 'User-Agent': `ZCode/${ver}`, 'HTTP-Referer': BASE, 'X-Title': 'Z Code@electron', 'X-Client-Language': 'en-US', 'X-ZCode-App-Version': ver, 'X-Platform': PLATFORM, 'X-Os-Category': 'windows' };
  if (deviceMid) headers['X-Device-Mid'] = deviceMid;
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const r = await fetch(`${BASE}${path}`, { headers });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { }
  return { status: r.status, json: j };
}
(async () => {
  const sesiones = await vaultSessions();
  console.log(`cuentas en la boveda: ${sesiones.length}\n`);
  for (const s of sesiones) {
    const jwt = s.zcodejwttoken || s.jwt || s.token || s.accessToken;
    const email = s.email || s.user?.email || '(sin email)';
    if (!jwt) { console.log(`=== ${email} :: sin token ===\n`); continue; }
    console.log(`=== ${email} ===`);
    for (const ver of ['3.18.2']) {
      let total = 0; const campanas = [];
      // IMPORTANTE: consultar marketing/touch CONSUME la entrega del servidor.
      // Cada consulta la sirve y avanza el cursor: barrer seq 0..7 en varias cuentas
      // agota la entrega sin reclamarla. Por eso aqui se consulta SOLO seq=0
      // (una vez por cuenta). Para el barrido completo usa el vigilante, que ademas
      // reclama en el acto.
      for (const seq of [0]) {
        const t = await apiGet(`/api/v1/marketing/touch?seq=${seq}`, jwt, ver);
        if (t.status !== 200) { await new Promise((x) => setTimeout(x, 1500)); continue; }
        const dl = t.json?.data?.deliveries || [];
        total += dl.length;
        for (const d of dl) campanas.push(`seq=${seq} campaign=${d.campaign_id} pos=${d.resource_position} plan=${d.banner?.background?.args?.zcode_plan?.plan_id || d.popup?.hero?.args?.zcode_plan?.plan_id || '?'} nombre="${d.banner?.background?.args?.zcode_plan?.name || d.popup?.hero?.args?.zcode_plan?.name || '?'}"`);
        await new Promise((x) => setTimeout(x, 800));
      }
      console.log(`  marketing/touch: ${total} entregas`);
      for (const c of campanas) console.log('    -> ' + c);
      const b = await apiGet(`/api/v1/zcode-plan/billing/balance?app_version=${ver}`, jwt, ver);
      const planes = b.json?.data?.plans || [];
      console.log(`  planes activos (${planes.length}):`);
      for (const p of planes) {
        const ents = (p.entitlements || []).map((e) => `${e.show_name} ${e.grant_units}/${e.period}`).join(', ');
        console.log(`    ${p.plan_id} [${p.status}] ${ents}`);
      }
      const pr = await apiGet(`/api/v1/zcode-plan/billing/preview?app_version=${ver}&platform=${PLATFORM}`, jwt, ver);
      const pp = pr.json?.data?.plans || [];
      console.log(`  preview: ${pp.length} planes` + (pp.length ? ' -> ' + pp.map((x) => `${x.plan_id}(${x.name || ''})`).join(', ') : ''));
    }
    console.log('');
    await new Promise((x) => setTimeout(x, 1200));
  }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

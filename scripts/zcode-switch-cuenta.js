#!/usr/bin/env node
/**
 * zcode-switch-cuenta.js — cambia la cuenta activa de ZCode usando la boveda de
 * sesiones, sin pasar por el OAuth interactivo.
 *
 * COMO FUNCIONA
 *   Al arrancar, el host hace restoreSession(): valida el token contra
 *   chat.z.ai/api/oauth/userinfo. Si falla, hace logout.
 *   Pero fetchUserInfo() tiene un atajo: si accessToken === zcodeJwtToken,
 *   devuelve un perfil local sin tocar la red.
 *
 *   Asi que rotamos:
 *     zcodejwttoken          <- JWT de la boveda (válido para zcode.z.ai)
 *     oauth:zai:access_token <- el MISMO zcodejwttoken (activa el atajo)
 *     oauth:zai:user_info    <- perfil {user_id, email, name} de la boveda
 *
 *   El atajo + el user_info cacheado hacen que restoreSession acepte la sesion.
 *   El banner de marketing lo consulta el renderer con el zcodejwttoken -> la
 *   entrega de ESA cuenta aparece y se puede reclamar con un clic real.
 *
 * USO
 *   node zcode-switch-cuenta.js --list
 *   node zcode-switch-cuenta.js <email>            (rota, con backup previo)
 *   node zcode-switch-cuenta.js <email> --dry-run  (solo valida, no escribe)
 *   node zcode-switch-cuenta.js --restore <archivo>  (restaura un backup)
 *
 * IMPORTANTE: ZCode debe estar CERRADO al rotar (escribe credentials.json).
 */
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const ASAR = process.env.ZCODE_ASAR || 'C:/Program Files/ZCode/resources/app.asar';
const ASAR_UNPACKED = process.env.ZCODE_ASAR_UNPACKED || 'C:/Program Files/ZCode/resources/app.asar.unpacked';
const KEYRING_DIR = path.join(__dirname, '.zcode-keyring');
function readAsarFile(rel) { const buf = fs.readFileSync(ASAR); const hs = buf.readUInt32LE(12); const header = JSON.parse(buf.toString('utf8', 16, 16 + hs)); const start = 16 + hs + (hs % 4 ? 4 - (hs % 4) : 0); let n = header; for (const p of rel.split('/')) n = n.files[p]; const off = start + Number(n.offset); return buf.toString('utf8', off, off + n.size); }
function ensureKeyring() { const s = '@napi-rs'; const jsDir = path.join(KEYRING_DIR, 'node_modules', s, 'keyring'); const binDir = path.join(KEYRING_DIR, 'node_modules', s, 'keyring-win32-x64-msvc'); const binSrc = path.join(ASAR_UNPACKED, 'node_modules', s, 'keyring-win32-x64-msvc', 'keyring.win32-x64-msvc.node'); if (!fs.existsSync(binSrc)) throw new Error('falta binario nativo del keyring'); fs.mkdirSync(jsDir, { recursive: true }); fs.writeFileSync(path.join(jsDir, 'index.js'), readAsarFile('node_modules/@napi-rs/keyring/index.js')); fs.writeFileSync(path.join(jsDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring', version: '2.1.2', main: 'index.js' })); fs.mkdirSync(binDir, { recursive: true }); const bd = path.join(binDir, 'keyring.win32-x64-msvc.node'); if (!fs.existsSync(bd)) fs.copyFileSync(binSrc, bd); fs.writeFileSync(path.join(binDir, 'index.js'), "module.exports = require('./keyring.win32-x64-msvc.node');\n"); fs.writeFileSync(path.join(binDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring-win32-x64-msvc', version: '2.1.2', main: 'keyring.win32-x64-msvc.node' })); return path.join(KEYRING_DIR, 'node_modules', s, 'keyring'); }
const { AsyncEntry } = require(ensureKeyring());

const HOME = process.env.USERPROFILE || process.env.HOME;
const ZCODE_DIR = process.env.ZCODE_V2_DIR || path.join(HOME, '.zcode', 'v2');
const CREDS = path.join(ZCODE_DIR, 'credentials.json');
const VAULT_CANDIDATOS = [process.env.ZCODE_VAULT, path.join(__dirname, 'vault', 'sessions.vault'), path.join(__dirname, '..', 'vault', 'sessions.vault'), path.join(ZCODE_DIR, 'vault', 'sessions.vault')].filter(Boolean);
const VAULT_FILE = VAULT_CANDIDATOS.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || VAULT_CANDIDATOS[0];
const BACKUP_DIR = path.join(HOME, '.zcode', 'backup');
const BASE = 'https://zcode.z.ai';
const APP_VERSION = '3.18.2';
const PLATFORM = 'win32-x64';

const sha256hex = (p) => crypto.createHash('sha256').update(p).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let deviceMid = null;
try { deviceMid = JSON.parse(fs.readFileSync(path.join(ZCODE_DIR, 'telemetry-state.json'), 'utf8')).deviceMid; } catch {}

async function keyOf(service, account) {
  return new AsyncEntry(service, account, { linux: { store: 'secret-service' } }).getPassword();
}

// --- boveda ---
async function readVault() {
  const secret = await keyOf('ZCode Vault Key', sha256hex(path.resolve(VAULT_FILE)));
  if (!secret) throw new Error('sin clave de boveda');
  const key = Buffer.from(secret, 'base64url');
  const blob = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64url'));
  d.setAuthTag(Buffer.from(blob.tag, 'base64url'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(blob.data, 'base64url')), d.final()]).toString('utf8'));
}

// --- credenciales ---
async function credKey() {
  const secret = await keyOf('ZCode Credential Encryption', sha256hex(path.resolve(CREDS)));
  if (!secret) throw new Error('sin clave de credenciales');
  return Buffer.from(secret, 'base64url');
}

function decrypter(key) {
  const hash24 = crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
  return {
    hash24,
    dec(v) {
      if (typeof v !== 'string' || !v.startsWith('enc:v2:')) return null;
      const p = v.slice(7).split(':');
      if (p.length !== 3 || p[0] !== 'os') return null;
      if (p[1] !== hash24) return null;
      try {
        const [iv, tag, data] = p[2].split('.').map((x) => Buffer.from(x, 'base64url'));
        const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
        d.setAuthTag(tag);
        return Buffer.concat([d.update(data), d.final()]).toString('utf8');
      } catch { return null; }
    },
    enc(plain) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([c.update(Buffer.from(plain, 'utf8')), c.final()]);
      const tag = c.getAuthTag();
      return 'enc:v2:os:' + hash24 + ':' +
        [iv, tag, data].map((b) => b.toString('base64url')).join('.');
    },
  };
}

// --- API ---
async function apiGet(p, jwt) {
  const headers = {
    'User-Agent': `ZCode/${APP_VERSION}`, 'HTTP-Referer': BASE, 'X-Title': 'Z Code@electron',
    'X-Client-Language': 'en-US', 'X-ZCode-App-Version': APP_VERSION, 'X-Platform': PLATFORM,
    'X-Os-Category': 'windows', 'Authorization': `Bearer ${jwt}`,
  };
  if (deviceMid) headers['X-Device-Mid'] = deviceMid;
  const r = await fetch(`${BASE}${p}`, { headers });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j };
}

function zcodeVivo() {
  try {
    const out = require('child_process').execFileSync('tasklist', ['/FI', 'IMAGENAME eq ZCode.exe', '/NH'], { encoding: 'utf8' });
    return /ZCode\.exe/i.test(out);
  } catch { return false; }
}

(async () => {
  const args = process.argv.slice(2);
  const vault = await readVault();
  const sessions = Object.values(vault.sessions || {});
  const key = await credKey();
  const cy = decrypter(key);
  const creds = JSON.parse(fs.readFileSync(CREDS, 'utf8'));

  const actual = (() => { try { return JSON.parse(cy.dec(creds['oauth:zai:user_info'])).email; } catch { return null; } })();

  if (args[0] === '--list') {
    console.log('cuenta activa: ' + actual + '\n');
    console.log('sesiones en la boveda:');
    for (const s of sessions) {
      const jwt = s.zcodejwttoken || s.jwt || s.token;
      const isActiva = s.email === actual ? '  <-- ACTIVA' : '';
      console.log('  ' + (s.email || '(sin email)') + isActiva);
    }
    return;
  }

  if (args[0] === '--restore') {
    const src = args[1];
    if (!src || !fs.existsSync(src)) { console.error('backup no encontrado: ' + src); process.exit(1); }
    fs.copyFileSync(src, CREDS);
    console.log('credenciales restauradas desde ' + src);
    console.log('reinicia ZCode para que las aplique');
    return;
  }

  const target = args.find((a) => !a.startsWith('--') && a.includes('@'));
  const dry = args.includes('--dry-run');
  const pIdx = args.indexOf('--provider');
  const PROVIDER = pIdx !== -1 ? args[pIdx + 1] : 'zai';
  if (!target) { console.error('uso: --list | <email> [--dry-run] [--provider zai|zai_cn|bigmodel] | --restore <archivo>'); process.exit(1); }

  const s = sessions.find((x) => (x.email || x.user?.email) === target);
  if (!s) { console.error('no hay sesion en la boveda para ' + target); process.exit(1); }

  const jwt = s.zcodejwttoken || s.jwt || s.token;
  if (!jwt) { console.error('la sesion no tiene JWT'); process.exit(1); }

  console.log('=== cuenta objetivo: ' + target + ' ===');

  // 1) Validar que el JWT de la boveda realmente sirve contra la API (solo lectura)
  const touch = await apiGet('/api/v1/marketing/touch?seq=0', jwt);
  const entregas = touch.json?.data?.deliveries?.length ?? 0;
  console.log('  marketing/touch  -> HTTP ' + touch.status + ', entregas: ' + entregas);
  if (touch.status !== 200) { console.error('el JWT no sirve; abortando sin tocar nada'); process.exit(1); }

  const bal = await apiGet('/api/v1/zcode-plan/billing/balance?app_version=' + APP_VERSION, jwt);
  const planes = bal.json?.data?.plans || [];
  console.log('  billing/balance  -> HTTP ' + bal.status + ', planes: ' + (planes.map((p) => p.plan_id + '[' + p.status + ']').join(', ') || 'ninguno'));

  if (dry) { console.log('\n(dry-run: no se escribio nada)'); return; }

  if (zcodeVivo() && !args.includes('--force')) {
    console.log('\nATENCION: ZCode esta corriendo. Cerralo antes de rotar (o usa --force).');
    process.exit(2);
  }

  // 2) Backup
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(BACKUP_DIR, 'credentials-' + stamp + '.json');
  fs.copyFileSync(CREDS, backup);
  console.log('  backup -> ' + backup);

  // 3) Rotar
  // El provider zai valida el access_token OAuth contra chat.z.ai/api/oauth/userinfo:
  // si el access_token esta expirado hace logout y borra la sesion.
  // El provider zai_cn, en cambio, valida el ZCODE JWT contra
  // zcode.z.ai/api/v1/oauth/profile -> el zcodejwt de la boveda no tiene 'exp',
  // asi que nunca expira y la sesion se restaura sin tocar chat.z.ai.
  let perfil = {
    user_id: s.user_id || s.user?.id || s.user?.user_id,
    email: target,
    name: s.name || s.user?.name || target.split('@')[0],
  };

  if (PROVIDER === 'zai_cn') {
    // El perfil real que devuelve el backend (es lo que guarda la app tras un login)
    const pr = await apiGet('/api/v1/oauth/profile?app_version=' + APP_VERSION, jwt);
    const u = pr.json?.data?.user;
    if (pr.status === 200 && u && u.user_id) {
      perfil = u;
      console.log('  perfil del backend: user_id=' + u.user_id + ' email=' + u.email);
    } else {
      console.log('  AVISO: no se pudo leer el perfil del backend; uso el de la boveda');
    }
  }

  const nuevo = JSON.parse(JSON.stringify(creds));
  nuevo['zcodejwttoken'] = cy.enc(jwt);
  nuevo['oauth:active_provider'] = cy.enc(PROVIDER);
  nuevo['oauth:' + PROVIDER + ':access_token'] = cy.enc(jwt);
  nuevo['oauth:' + PROVIDER + ':user_info'] = cy.enc(JSON.stringify(perfil));
  nuevo['oauth:session_revision'] = cy.enc(crypto.randomUUID());
  // Limpiar las claves de sesion de los OTROS providers para que no queden restos
  for (const otro of ['zai', 'zai_cn', 'bigmodel']) {
    if (otro === PROVIDER) continue;
    for (const sufijo of [':access_token', ':refresh_token', ':user_info']) {
      const k = 'oauth:' + otro + sufijo;
      if (k in nuevo) delete nuevo[k];
    }
  }

  // Verificacion de ida y vuelta ANTES de escribir
  const check = decrypter(key);
  for (const k of ['zcodejwttoken', 'oauth:' + PROVIDER + ':access_token', 'oauth:' + PROVIDER + ':user_info', 'oauth:active_provider']) {
    const v = check.dec(nuevo[k]);
    if (v === null) { console.error('fallo de cifrado en ' + k + '; abortando'); process.exit(1); }
  }
  if (JSON.parse(check.dec(nuevo['oauth:' + PROVIDER + ':user_info'])).email !== target) {
    console.error('verificacion fallo; abortando'); process.exit(1);
  }

  fs.writeFileSync(CREDS, JSON.stringify(nuevo, null, 2), 'utf8');
  console.log('  credenciales rotadas a ' + target);
  console.log('\nAhora: ' + (zcodeVivo() ? 'el host relee el token en la proxima consulta; reinicia o espera al poller' : 'reinicia ZCode y verifica con zcode-start-plan-status.js'));
  console.log('Para volver atras: node zcode-switch-cuenta.js --restore "' + backup + '"');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

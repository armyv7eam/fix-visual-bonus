#!/usr/bin/env node
/**
 * zcode-vigilante-cupon.js — vigila las 5 cuentas Z.ai y avisa (o reclama) en cuanto
 * aparece una campaña.
 *
 * MODOS
 *   --avisar   (recomendado)  Sondea `billing/preview` de las 5 cuentas. NO consume
 *                             entrega, NO toca la sesión, NO reclama. Solo avisa por
 *                             consola y deja una línea en el log. El reclamo lo hace
 *                             una persona con un clic real en el banner.
 *   --auto     Reclama en el acto: cuando preview detecta una campaña, consume la
 *             entrega de ESA cuenta (marketing/touch seq=0), rota la sesión a ella
 *             (provider zai_cn), relanza ZCode con --remote-debugging-port=9222,
 *             pulsa el banner y verifica billing/balance. Después restaura la
 *             sesión original y deja ZCode en estado normal.
 *
 *   node zcode-vigilante-cupon.js --once              -> una pasada y salir (modo avisar)
 *   node zcode-vigilante-cupon.js --once --auto       -> una pasada reclamando
 *   node zcode-vigilante-cupon.js --cada 10           -> bucle cada 10 minutos
 *
 * REGLAS DURAS (aprendidas a la mala)
 *  - `marketing/touch` CONSUME la entrega: nunca se usa como sondeo. Solo se llama
 *    para la cuenta que ya se sabe reclamable, y se reclama en el acto.
 *  - La rotación de sesión usa SIEMPRE provider `zai_cn` (valida el zcodejwt contra
 *    zcode.z.ai). Con `zai` el host valida el access_token OAuth, da 401 y BORRA la
 *    sesión.
 *  - ZCode debe estar CERRADO al rotar credenciales.
 */
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const { spawn, execFileSync, spawnSync } = require('child_process');

const DIR = __dirname;
const ZCODE_DIR = process.env.ZCODE_V2_DIR || path.join(process.env.USERPROFILE || process.env.HOME, '.zcode', 'v2');
const CREDS = path.join(ZCODE_DIR, 'credentials.json');
const ASAR = process.env.ZCODE_ASAR || 'C:/Program Files/ZCode/resources/app.asar';
const ASAR_UNPACKED = process.env.ZCODE_ASAR_UNPACKED || 'C:/Program Files/ZCode/resources/app.asar.unpacked';
const KEYRING_DIR = path.join(DIR, '.zcode-keyring');
const VAULT_CANDIDATOS = [process.env.ZCODE_VAULT, path.join(__dirname, 'vault', 'sessions.vault'), path.join(__dirname, '..', 'vault', 'sessions.vault'), path.join(ZCODE_DIR, 'vault', 'sessions.vault')].filter(Boolean);
const VAULT_FILE = VAULT_CANDIDATOS.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || VAULT_CANDIDATOS[0];
const BACKUP_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.zcode', 'backup');
const ZCODE_EXE = process.env.ZCODE_EXE || 'C:/Program Files/ZCode/ZCode.exe';
const BASE = 'https://zcode.z.ai';
const PLATFORM = 'win32-x64';
const APP_VERSION = '3.18.2';
const LOG_FILE = path.join(DIR, 'vigilante-cupon.log');

const { cargarConfig, filtrarCuentas } = require('./zcode-config');
const CFG = cargarConfig();

const argv = process.argv.slice(2);
const ONCE = argv.includes('--once');
const AUTO = argv.includes('--auto') || CFG.modoVigilante === 'auto';
const idxC = argv.indexOf('--cada');
const CADA = idxC !== -1 ? Number(argv[idxC + 1]) : CFG.cadaMinutos;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => {
  const linea = `[${new Date().toISOString().slice(0, 19).replace('T', ' ')}Z] ${a.join(' ')}`;
  console.log(linea);
  try { fs.appendFileSync(LOG_FILE, linea + '\n', 'utf8'); } catch { }
};
const logAlerta = (txt) => {
  const linea = `[${new Date().toISOString().slice(0, 19).replace('T', ' ')}Z] !!! ${txt}`;
  console.log(linea);
  try { fs.appendFileSync(LOG_FILE, linea + '\n', 'utf8'); } catch { }
};

/* ---------------- credenciales / keyring (secreto nunca se imprime) ---------------- */
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
  return { email: info.email || '(desconocido)', jwt, provider: out['oauth:active_provider'] || '?' };
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
  try {
    const r = await fetch(`${BASE}${p}`, { headers });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch { }
    return { status: r.status, json: j };
  } catch (e) { return { status: 0, json: null, error: e.message }; }
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

/* ------------------------------- modos de vigilancia ------------------------------- */
// preview NO consume entrega: sirve de detector seguro de campañas reclamables.
async function previewCampanas() {
  const out = [];
  for (const c of filtrarCuentas(await cuentas(), CFG)) {
    const prev = await apiGet(`/api/v1/zcode-plan/billing/preview?app_version=${APP_VERSION}&platform=${PLATFORM}`, c.jwt);
    const planes = prev.json?.data?.plans || [];
    if (planes.length) out.push({ cuenta: c, campanas: planes });
    await sleep(400);
  }
  return out;
}

function planesActivos(jwt) {
  return apiGet(`/api/v1/zcode-plan/billing/balance?app_version=${APP_VERSION}`, jwt)
    .then((v) => (v.json?.data?.plans || []).filter((p) => p.status === 'active').map((p) => p.plan_id));
}

/* ------------------------------ flujo de reclamo (auto) ------------------------------ */
function zcodeVivo() {
  try { return /ZCode\.exe/i.test(execFileSync('tasklist', ['/FI', 'IMAGENAME eq ZCode.exe', '/NH'], { encoding: 'utf8' })); } catch { return false; }
}
function cdpVivo() {
  try { execFileSync('curl', ['-s', '-m', '4', '--noproxy', '*', 'http://127.0.0.1:9222/json/version'], { encoding: 'utf8' }); return true; } catch { return false; }
}
function cerrarZCode() {
  try { execFileSync('taskkill', ['/IM', 'ZCode.exe', '/F'], { encoding: 'utf8' }); } catch { }
}
function abrirZCode(conPuerto) {
  const args = conPuerto ? ['--remote-debugging-port=9222'] : [];
  spawn(ZCODE_EXE, args, { detached: true, stdio: 'ignore' }).unref();
}
function correr(script, args, timeout = 260000) {
  const r = spawnSync(process.execPath, [path.join(DIR, script), ...args], { encoding: 'utf8', timeout });
  return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

async function reclamarCuenta(cuenta) {
  // 1) Con la cuenta ya autenticada (live) el banner esta en el renderer actual.
  //    Para una cuenta de la boveda hay que rotar la sesion.
  let backup = null;
  const requiereRotacion = !cuenta.live;
  if (requiereRotacion) {
    log('rotando sesion a ' + cuenta.email + ' (provider zai_cn) ...');
    cerrarZCode(); await sleep(4000);
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backup = path.join(BACKUP_DIR, 'credentials-' + stamp + '.json');
    fs.copyFileSync(CREDS, backup);
    const r = correr('zcode-switch-cuenta.js', [cuenta.email, '--provider', 'zai_cn', '--force'], 120000);
    log('switch:', (r.out || r.err || '').split('\n').slice(-4).join(' | '));
    if (/ERROR|no sirve/i.test(r.err + r.out) && !/credenciales rotadas/.test(r.out)) {
      log('no se pudo rotar; se restaura el backup');
      try { fs.copyFileSync(backup, CREDS); } catch { }
      return false;
    }
    await sleep(2000);
  } else {
    log('la cuenta reclamable es la sesion activa: ' + cuenta.email);
  }

  try {
    // 2) Consumir la entrega de ESA cuenta y reclamar en el acto.
    const t = await apiGet('/api/v1/marketing/touch?seq=0', cuenta.jwt);
    const entregas = t.json?.data?.deliveries || [];
    log('marketing/touch seq=0 -> HTTP ' + t.status + ', entregas: ' + entregas.length);
    if (!entregas.length) { log('sin entrega servida; nada que reclamar'); return false; }

    if (!cdpVivo()) {
      log('relanzando ZCode con --remote-debugging-port=9222 ...');
      cerrarZCode(); await sleep(4000);
      abrirZCode(true); await sleep(18000);
    }
    const r = correr('zcode-claim-banner.js', ['180000'], 240000);
    log('claim:', (r.out || '').split('\n').slice(-6).join(' | ') || r.err);
    const activos = await planesActivos(cuenta.jwt);
    log('planes activos de ' + cuenta.email + ': ' + (activos.join(', ') || 'ninguno'));
    return activos.length > 0;
  } finally {
    if (requiereRotacion && backup) {
      log('restaurando la sesion original ...');
      cerrarZCode(); await sleep(4000);
      try { fs.copyFileSync(backup, CREDS); log('sesion restaurada desde ' + backup); } catch (e) { log('ERROR restaurando: ' + e.message); }
      await sleep(1500);
      abrirZCode(false); await sleep(6000);
    }
  }
}

async function pasada() {
  let halladas = await previewCampanas();
  if (CFG.campana) {
    halladas = halladas.filter((h) => h.campanas.some((p) => String(p.plan_id || '').includes(CFG.campana)));
    if (!halladas.length) { log(`sin campañas que casen con el filtro "${CFG.campana}"`); return false; }
  }
  if (!halladas.length) { log('sin campañas disponibles en ninguna cuenta'); return false; }

  for (const h of halladas) {
    for (const p of h.campanas) {
      logAlerta(`CAMPAÑA DISPONIBLE -> cuenta ${h.cuenta.email} · ${p.plan_id} ${p.name || ''}`);
    }
  }
  if (!AUTO) {
    log('modo avisar: no se reclama (hace falta un clic real en el banner).');
    return false;
  }

  // En modo auto se reclama una sola cuenta por pasada (la primera detectada).
  const h = halladas[0];
  const planId = h.campanas[0].plan_id;
  log('modo auto: reclamando ' + planId + ' para ' + h.cuenta.email);
  const ok = await reclamarCuenta(h.cuenta);
  if (ok) logAlerta('RECLAMADO ' + planId + ' en ' + h.cuenta.email);
  else log('el reclamo de ' + planId + ' no quedo confirmado; puede hacer falta resolver el captcha a mano');
  return ok;
}

(async () => {
  log(`vigilante de cupones ZCode — modo ${AUTO ? 'auto (reclama)' : 'avisar'} — cada ${CADA} min${ONCE ? ' (una sola pasada)' : ''}`);
  log(`config: ${CFG.ruta || 'sin archivo (valores por defecto)'} · cuentas: ${CFG.cuentas.length ? CFG.cuentas.join(', ') : 'todas'}${CFG.campana ? ' · campana: ' + CFG.campana : ''}`);
  for (;;) {
    try {
      const act = await pasada();
      if (act) log('pasada con reclamo');
    } catch (e) { log('error en la pasada:', e.message); }
    if (ONCE) break;
    await sleep(CADA * 60000);
  }
  log('vigilante terminado.');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

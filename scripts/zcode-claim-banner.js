#!/usr/bin/env node
/**
 * zcode-claim-banner.js — reclama la entrega de campaña desde el renderer de ZCode.
 *
 * El captcha de Aliyun (X-Aliyun-Captcha-Verify-Param) SOLO lo genera el renderer de ZCode,
 * así que el reclamo tiene que ejecutarse dentro de la app: nos conectamos por CDP al renderer,
 * forzamos la visibilidad (sin foco el poller no consulta), esperamos a que el boton del banner
 * este habilitado y lo pulsamos. Es el mismo flujo que el banner manual, sin intervencion.
 *
 * Pre-requisito: ZCode corriendo con  --remote-debugging-port=9222
 * Uso:  node zcode-claim-banner.js [timeoutMs]
 */
'use strict';
const { execFileSync, spawn } = require('child_process');

const PORT = process.env.CDP_PORT || '9222';
const TIMEOUT = Number(process.argv[2] || 180000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) });
  const targets = await res.json();
  const pages = targets.filter((t) => t.type === 'page');
  return pages.find((t) => /app\.asar\/out\/renderer\/index\.html/i.test(t.url)) || pages[0] || null;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    });
    ws.addEventListener('open', () => resolve({
      send(method, params) {
        return new Promise((res) => { const myId = ++id; pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); });
      },
      close: () => ws.close(),
    }));
    ws.addEventListener('error', reject, { once: true });
  });
}

const FORCE_VISIBLE = `(() => {
  try {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    return 'ok';
  } catch (e) { return 'err:' + e.message; }
})()`;

const PROBE = `(() => {
  const el = document.querySelector('[data-testid="marketing-banner"]');
  if (!el) return JSON.stringify({ banner: false });
  const btn = el.querySelector('button');
  const st = el.getAttribute('style') || '';
  return JSON.stringify({
    banner: true,
    disabled: btn ? btn.disabled : null,
    label: btn ? (btn.getAttribute('aria-label') || '').trim() : null,
    hidden: /height:\\s*0|visibility:\\s*hidden/.test(st),
    pending: el.getAttribute('aria-busy') === 'true',
  });
})()`;

const CLICK = `(() => {
  const el = document.querySelector('[data-testid="marketing-banner"]');
  if (!el) return 'sin-banner';
  const btn = el.querySelector('button');
  if (!btn) return 'sin-boton';
  if (btn.disabled) return 'boton-deshabilitado';
  btn.click();
  return 'clic-enviado';
})()`;

// El banner se monta plegado (height:0; overflow:hidden; visibility:hidden) y su
// boton queda disabled hasta que el bundle interactivo reporta 'ready'. Sin foco
// real de ventana ese bundle no se inicializa, el boton se queda disabled para
// siempre y el clic es imposible. Hay que desplegarlo a mano.
const UNHIDE = `(() => {
  const el = document.querySelector('[data-testid="marketing-banner"]');
  if (!el) return 'sin-banner';
  const s = el.style;
  s.removeProperty('height'); s.removeProperty('overflow');
  s.removeProperty('visibility'); s.removeProperty('display');
  el.style.height = 'auto'; el.style.visibility = 'visible';
  el.style.overflow = 'visible'; el.style.display = 'block';
  const btn = el.querySelector('button');
  if (btn) { btn.disabled = false; btn.removeAttribute('aria-disabled'); }
  return 'desplegado';
})()`;

(async () => {
  let target = null;
  try { target = await getTarget(); } catch (e) { console.error('CDP no responde en :' + PORT + ' — ZCode debe correr con --remote-debugging-port=' + PORT); process.exit(3); }
  if (!target) { console.error('sin target de renderer'); process.exit(3); }
  console.log(`[claim] target: ${target.title}`);
  const cdp = await connect(target.webSocketDebuggerUrl);
  const evalx = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
    return r.result?.result?.value;
  };

  await evalx(FORCE_VISIBLE);
  const t0 = Date.now();
  let clicked = false;
  let desplegado = false;
  while (Date.now() - t0 < TIMEOUT) {
    const raw = await evalx(PROBE);
    let st = {};
    try { st = JSON.parse(raw); } catch { }
    if (st.banner && !desplegado) {
      // el banner esta en el DOM pero plegado: lo desplegamos
      console.log('[claim] ' + await evalx(UNHIDE));
      desplegado = true;
    }
    if (st.banner && st.disabled === false && !st.hidden) {
      console.log('[claim] banner listo:', JSON.stringify(st));
      console.log('[claim] ' + await evalx(CLICK));
      clicked = true;
      break;
    }
    await sleep(4000);
  }
  if (!clicked) { console.error('[claim] el banner no apareció o no se habilitó en ' + Math.round(TIMEOUT / 1000) + 's'); cdp.close(); process.exit(4); }

  // esperar a que el backend registre la accion (marketing-touch.report)
  console.log('[claim] esperando confirmación del servidor...');
  const deadline = Date.now() + 120000;
  let ok = false;
  while (Date.now() < deadline) {
    await sleep(5000);
    const r = await fetch('http://127.0.0.1:9222/json/list').catch(() => null);
    if (!r) continue;
    // el claim se confirma con el plan nuevo en billing/balance; lo verifica el vigilante
    ok = true;
    break;
  }
  cdp.close();
  console.log(ok ? '[claim] clic enviado; verifica el plan con zcode-start-plan-status.js' : '[claim] sin confirmacion local');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

'use strict';
/**
 * zcode-config.js — configuracion por usuario del stack.
 *
 * Cada equipo/usuario declara aqui SUS cuentas y sus preferencias. El archivo de
 * trabajo es `config.json` (esta en .gitignore) y el ejemplo versionado es
 * `config.example.json`.
 *
 * IMPORTANTE: aqui NO se ponen tokens ni llaves. Las sesiones viven cifradas en
 * la boveda de ZCode (keyring de Windows) y en `credentials.json`; este archivo
 * solo dice QUE cuentas seguir y COMO seguir.
 */
const fs = require('fs'); const path = require('path');

const CANDIDATOS = [
  process.env.ZCODE_CONFIG,
  path.join(__dirname, '..', 'config.json'),
  path.join(__dirname, 'config.json'),
].filter(Boolean);

const POR_DEFECTO = {
  cuentas: [],        // correos a vigilar; [] = todas las que aparezcan en la boveda
  modoVigilante: 'avisar', // 'avisar' | 'auto'
  cadaMinutos: 15,    // intervalo del vigilante
  campana: null,      // filtro opcional de campaign_id / plan_id (p.ej. 'wk-1120')
};

function cargarConfig() {
  for (const c of CANDIDATOS) {
    try {
      if (!fs.existsSync(c)) continue;
      const t = JSON.parse(fs.readFileSync(c, 'utf8'));
      const cfg = Object.assign({}, POR_DEFECTO, t);
      cfg.cuentas = Array.isArray(cfg.cuentas) ? cfg.cuentas.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [];
      cfg.cadaMinutos = Number(cfg.cadaMinutos) > 0 ? Number(cfg.cadaMinutos) : POR_DEFECTO.cadaMinutos;
      cfg.modoVigilante = cfg.modoVigilante === 'auto' ? 'auto' : 'avisar';
      cfg.ruta = c;
      return cfg;
    } catch (e) {
      console.error('[config] no se pudo leer ' + c + ': ' + e.message);
    }
  }
  return Object.assign({}, POR_DEFECTO, { ruta: null });
}

/** Filtra una lista de cuentas segun la configuracion. */
function filtrarCuentas(cuentas, cfg) {
  if (!cfg || !cfg.cuentas.length) return cuentas;
  const permitidas = new Set(cfg.cuentas);
  return cuentas.filter((c) => permitidas.has(String(c.email).toLowerCase()));
}

module.exports = { cargarConfig, filtrarCuentas, POR_DEFECTO };

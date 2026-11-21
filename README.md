# fix-visual-bonus

Stack y runbook para **reclamar los tokens de las campañas de ZCode (Z.ai)** cuando el banner
de bonus se pinta en la app pero el reclamo no se completa.

El problema que resuelve: la campaña aparece en el cliente, pero el botón "Start Plan" no se puede
pulsar (banner montado plegado, `visibility:hidden`, botón `disabled`) y el plan nunca queda
`active`. La causa es que el bundle interactivo del banner **solo se inicializa con la ventana
en primer plano**, y el captcha de Aliyun que exige el endpoint de reclamo **solo lo genera el
renderer de ZCode**. No hay forma de hacerlo desde un cliente externo: tiene que ser un clic real
dentro de la app.

> **Este repo no trae ninguna cuenta, clave ni token.** Cada equipo mete los suyos: ver
> [Trae tus cuentas y tus llaves](#trae-tus-cuentas-y-tus-llaves).

---

## Trae tus cuentas y tus llaves

El stack trabaja sobre **tus** sesiones de ZCode. No hay que pegar tokens en ningún archivo: las
sesiones ya viven cifradas en tu propio equipo, en el keyring de Windows.

**Paso 1 — Instala ZCode y entra con cada una de tus cuentas.**
Cada vez que inicias sesión, ZCode guarda esa sesión en su propia bóveda cifrada
(`~/.zcode/v2/vault/sessions.vault`). Con una cuenta basta; con varias, entra con cada una (la
sesión queda archivada, no activa).

**Paso 2 — Declara cuáles cuentas quieres seguir.**
Copia el ejemplo y edítalo:

```powershell
Copy-Item config.example.json config.json
```

```json
{
  "cuentas": ["mi-cuenta@ejemplo.com", "otra-cuenta@ejemplo.com"],
  "modoVigilante": "avisar",
  "cadaMinutos": 15,
  "campana": null
}
```

| Clave | Qué hace |
|-------|----------|
| `cuentas` | Correos a vigilar. `[]` = todas las que encuentre en tu bóveda. |
| `modoVigilante` | `avisar` (recomendado) o `auto` (reclama solo). |
| `cadaMinutos` | Intervalo del vigilante. |
| `campana` | Filtro opcional de campaña, p. ej. `"wk-1120"`. `null` = todas. |

`config.json` está en `.gitignore`: **no se versiona**. `config.example.json` sí, y no contiene
nada tuyo.

**Paso 3 — Verifica que el stack ve tus cuentas.**

```powershell
node scripts/zcode-cuentas-preview.js
```

Si la bóveda está en otro equipo o quieres usar la tuya desde otra máquina, apúntala con
`$env:ZCODE_VAULT = 'C:\ruta\a\sessions.vault'`. Ojo: la clave de la bóveda está indexada por
`sha256(path.resolve(archivo))` en el keyring de Windows, así que **al copiarla a otra ruta hay
que volver a registrar la misma clave** bajo el nombre de cuenta de la ruta nueva. Si no, el
script no la encuentra.

---

## Requisitos

- **Windows** con ZCode Desktop instalado (`C:\Program Files\ZCode\ZCode.exe`, versión 3.18.2).
- **Node.js** 18+.
- Al menos una sesión iniciada en ZCode.

Todo el stack usa solo Node con `fetch` y `WebSocket` nativos: **no hay `npm install`**.

---

## Estructura

```
fix-visual-bonus/
├── README.md
├── .gitignore
├── config.example.json      # copia como config.json y pon tus cuentas
├── scripts/
│   ├── zcode-config.js          # carga tu config.json
│   ├── zcode-start-plan-status.js   # plan, saldo y campañas de la cuenta activa
│   ├── zcode-cuentas-preview.js     # campañas de tus cuentas — NO consume entrega
│   ├── zcode-cuentas-cupon.js       # entregas + planes de todas las cuentas (CONSUME)
│   ├── zcode-live-delivery.js       # detalle de la entrega viva (CONSUME)
│   ├── zcode-claim-banner.js        # reclamador por CDP (clic real en el banner)
│   ├── zcode-claim-retry.js         # reclamador con reintentos + verificación real
│   ├── zcode-switch-cuenta.js       # rota / lista / restaura la cuenta activa
│   └── zcode-vigilante-cupon.js     # vigilante: --avisar (por defecto) o --auto
└── docs/
    ├── zcode-stack-reclamo-bono.md  # el stack paso a paso + los hallazgos
    └── zcode-cuentas-inventario.md  # informe técnico: API, campañas, trampas
```

---

## Uso rápido

```powershell
# 1) Ver el estado: plan activo, saldo, campañas disponibles
node scripts/zcode-start-plan-status.js

# 2) Ver las campañas de tus cuentas sin consumir nada
node scripts/zcode-cuentas-preview.js

# 3) Reclamar (ZCode debe correr con puerto de depuración)
Get-Process -Name ZCode | ForEach-Object { Stop-Process -Id $_.Id -Force }
Start-Process "C:\Program Files\ZCode\ZCode.exe" -ArgumentList "--remote-debugging-port=9222"
node scripts/zcode-claim-retry.js 6 20000

# 4) Volver al estado normal (sin puerto de depuración)
Get-Process -Name ZCode | ForEach-Object { Stop-Process -Id $_.Id -Force }
Start-Process "C:\Program Files\ZCode\ZCode.exe"
```

---

## El flujo completo de reclamo

1. **Detectar** — `billing/preview` dice qué campañas son reclamables. **No consume nada.**
2. **Servir la entrega** — `marketing/touch?seq=0` para esa cuenta. **Sí consume**: nunca se usa
   como sondeo, solo en el instante del reclamo.
3. **Hacer clic** — `zcode-claim-banner.js` se conecta por CDP al renderer, fuerza
   `visibilityState = visible`, **despliega el banner** (le quita `height:0`, `overflow:hidden`,
   `visibility:hidden` del estilo inline) y habilita el botón.
4. **Captcha** — el renderer lo genera solo (preflight de Aliyun). Si aparece el puzzle
   interactivo, **lo resuelve una persona**: no se automatiza el anti-bot.
5. **Verificar** — `billing/balance` debe mostrar el plan en `status=active` con el saldo.
6. **Restaurar** — si se rotó la cuenta, se devuelve la sesión original y ZCode queda sin puerto
   de depuración.

---

## Multi-cuenta

El reclamo se puede hacer en una cuenta distinta a la que está activa, **sin login OAuth**:

```powershell
node scripts/zcode-switch-cuenta.js --list                          # ver tus cuentas
node scripts/zcode-switch-cuenta.js otra-cuenta@ejemplo.com --provider zai_cn
node scripts/zcode-switch-cuenta.js --restore "C:\Users\<tu_usuario>\.zcode\backup\credentials-<stamp>.json"
```

Reglas (ver [docs/zcode-stack-reclamo-bono.md](docs/zcode-stack-reclamo-bono.md) §9):

- El provider **siempre `zai_cn`**. Con `zai` el host valida el `access_token` OAuth contra
  `chat.z.ai`, responde 401 y **borra la sesión** (logout automático).
- El `user_info` debe ser el **perfil real del backend** (`data.user`), no uno inventado.
- **ZCode debe estar cerrado** al rotar credenciales (el host reescribe `credentials.json` al
  arrancar).

---

## El vigilante

```powershell
node scripts/zcode-vigilante-cupon.js --once        # una pasada, modo avisar
node scripts/zcode-vigilante-cupon.js --cada 10      # bucle cada 10 minutos
node scripts/zcode-vigilante-cupon.js --once --auto  # una pasada reclamando
```

| Modo | Detecta con | Consume entrega | Toca la sesión | Reclama |
|------|-------------|------------------|-----------------|---------|
| `--avisar` (defecto) | `billing/preview` | No | No | No (avisa por consola + `vigilante-cupon.log`) |
| `--auto` | `billing/preview` | Sí, solo de la cuenta detectada | Sí (rota y restaura) | Sí |

El modo y el intervalo por defecto salen de tu `config.json`; la línea de comandos los pisa.

Para instalarlo como tarea de Windows (funciona sin elevación):

```powershell
schtasks /create /tn "ZCode vigilante cupones" /tr "node ""<repo>\scripts\zcode-vigilante-cupon.js"" --once" /sc minute /mo 15 /f
```

---

## Variables de entorno

| Variable | Default | Para qué |
|----------|---------|----------|
| `ZCODE_V2_DIR` | `~/.zcode/v2` | Perfil de datos de ZCode |
| `ZCODE_ASAR` | `C:\Program Files\ZCode\resources\app.asar` | Bundle de la app |
| `ZCODE_ASAR_UNPACKED` | `C:\Program Files\ZCode\resources\app.asar.unpacked` | Binario nativo del keyring |
| `ZCODE_EXE` | `C:\Program Files\ZCode\ZCode.exe` | Ejecutable de ZCode |
| `ZCODE_VAULT` | — | Ruta a tu bóveda de sesiones |
| `ZCODE_CONFIG` | `<repo>\config.json` | Ruta a tu configuración |
| `CDP_PORT` | `9222` | Puerto de depuración de Electron |
| `ZV` | `3.18.2` | Versión de la API |

---

## Reglas duras (aprendidas a la mala)

1. **Consultar `marketing/touch` consume la entrega.** El servidor la sirve y avanza el cursor por
   cuenta (~8 impresiones). Un script de diagnóstico que solo lee campañas puede quemar el bono de
   una cuenta. Para sondear, usa `billing/preview`.
2. **El reclamo es siempre un clic real en el banner.** Un `POST` a `billing/claim` desde un
   script falla con 3007/429: exige `X-Aliyun-Captcha-Verify-Param`, que solo genera el renderer.
3. **El banner se monta plegado.** Hay que quitarle `height:0` / `overflow:hidden` /
   `visibility:hidden` y habilitar el botón; si no, el clic es imposible.
4. **El banner es un iframe servido por el host.** Si aparece `cloud-dialog-hero-error`, hay que
   **recargar el renderer** hasta que el lease del bundle se resuelva.
5. **Rotar sesión con `zai_cn`, nunca con `zai`.** Con `zai` el 401 del host borra la sesión.
6. **El captcha de Aliyun es anti-bot: lo resuelve una persona**, no el script.
7. **Cierra siempre la pestaña OAuth** (`zcode://oauth/callback`) antes de operar con ZCode.

---

## Troubleshooting

| Síntoma | Causa | Qué hacer |
|---------|-------|-----------|
| `sin-banner` | el banner no se montó | recargar el renderer; si no, reiniciar ZCode |
| `cloud-dialog-hero-error` | lease del bundle inválido | recargar el renderer |
| botón `disabled` | el bundle no inicializó | forzar `visibilityState` y recargar |
| captcha `sdkCode: F001` | preflight falló | reintentar (el SDK suele funcionar al 2.º intento) |
| `CDP no responde` | ZCode sin puerto de depuración | relanzar con `--remote-debugging-port=9222` |
| `HTTP 429` en `billing/preview` | rate limit | esperar y espaciar las consultas (no consume entrega) |
| `401` al rotar cuenta | se usó provider `zai` | repetir con `--provider zai_cn` |
| solo aparece una cuenta | la bóveda no está donde se busca | revisar `ZCODE_VAULT` o re-registrar la clave del keyring |

---

## Seguridad

- **Nunca se versiona nada sensible**: `config.json`, la bóveda, el keyring nativo y los logs están
  en `.gitignore`. Los scripts descifran las credenciales **en memoria** y no las imprimen ni las
  escriben.
- La clave de cifrado de las credenciales vive en el **keyring de Windows** del usuario; sin ella,
  `credentials.json` y la bóveda son inservibles.
- En `config.json` se ponen **correos**, nunca tokens. Si alguien te pide pegar un token en un
  archivo de texto, no lo hagas: no hace falta.
- Este repo describe el mecanismo del cliente de ZCode para automatizar **tu propia** cuenta. No
  compra planes, no pulsa opciones de pago y no resuelve captchas anti-bot automáticamente.

---

## Documentación

- [docs/zcode-stack-reclamo-bono.md](docs/zcode-stack-reclamo-bono.md) — el stack paso a paso, los
  hallazgos y cómo hacerlo en otra cuenta sin login OAuth.
- [docs/zcode-cuentas-inventario.md](docs/zcode-cuentas-inventario.md) — informe técnico: formas de
  la API, historial de campañas, trampas y el hallazgo del consumo de entregas.

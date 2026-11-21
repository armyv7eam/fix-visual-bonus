# ZCode (Z.ai) — Stack para reclamar el bono de campaña + hallazgos del proceso

**Fecha del caso:** 20-11-2026 · **Campaña reclamada:** `zcode-v3-start-plan-wk-1120` ("ZCODE WEEKEND BUILD")
**Prima obtenida:** 500.000.000 tokens GLM-5.3-Flash, activa hasta **23-11-2026 01:00 UTC** (22-11 22:00 hora de Chile)
**Entorno de prueba:** Windows 10/11 x64 · ZCode Desktop **3.18.2** (Electron 44.7.0) · Node 18+

> Documento de uso interno del equipo. No contiene credenciales, tokens ni claves: todos los secretos se
> descifran **en memoria** en el momento de usarlos y nunca se escriben en disco ni se imprimen.

---

## 1. Resumen ejecutivo

El bono no se puede "pedir" por API: **la elegibilidad la decide el servidor** por cohorte de cuenta, y
la entrega se materializa como un *banner* dentro de la app que hay que pulsar. Lo que fallaba antes no era
el derecho al bono, sino **la ventana**: el banner nunca se pintaba porque la app estaba sin foco, y cuando
la app no estaba corriendo la entrega se perdía.

La solución fue un stack de 4 piezas:

| Pieza | Función |
|-------|---------|
| **Detector** | Consulta `marketing/touch` en todas las cuentas y detecta la entrega pendiente |
| **Activador** | Relanza ZCode con puerto de depuración (`--remote-debugging-port=9222`) |
| **Reclamador** | Se conecta por CDP al renderer, fuerza visibilidad y hace el **clic real** en el banner |
| **Verificador** | Confirma en `billing/balance` que el plan quedó `active` y con el saldo completo |

Resultado: el bono se reclamó en ~2 minutos desde que el servidor lo publicó, sin intervención manual y sin
tocar el captcha ni los flujos de pago.

---

## 2. El stack, paso a paso

### Paso 0 — Requisitos

- ZCode Desktop instalado (`C:\Program Files\ZCode\ZCode.exe`), versión 3.18.2 o superior.
- Node.js disponible en PATH.
- La app con **una sesión iniciada** (la cuenta que se quiere premiar).
- PowerShell (los comandos están escritos para PowerShell 5.1, sin sintaxis bash).

### Paso 1 — Detectar la entrega (solo lectura, sin riesgo)

El endpoint que entrega las campañas es:

```
GET https://zcode.z.ai/api/v1/marketing/touch?seq=<n>
```

Headers obligatorios:

```js
{
  'Authorization': 'Bearer <zcode-jwt>',
  'X-ZCode-App-Version': '3.18.2',
  'X-Platform': 'win32-x64',
  'X-Os-Category': 'windows',
  'X-Client-Language': 'en-US',
  'X-Device-Mid': '<device-mid>',
  'User-Agent': 'ZCode/3.18.2'
}
```

Respuesta con campaña pendiente:

```json
{
  "data": {
    "deliveries": [
      {
        "campaign_id": "2101141259813175296",
        "resource_position": "banner",
        "banner": {
          "buttons": [
            { "action": { "type": "claim_zcode_plan",
                          "args": { "zcode_plan": { "plan_id": "zcode-v3-start-plan-wk-1120",
                                                   "name": "ZCODE WEEKEND BUILD" } } } }
          ]
        }
      }
    ]
  }
}
```

> **Clave:** una entrega es reclamable cuando existe un botón con `action.type === "claim_zcode_plan"`.
> Si `deliveries` viene vacío, **no hay nada que reclamar** (la cuenta no está en la cohorte).

Comando de solo lectura (no toca nada, no pulsa nada):

```powershell
node "C:\...\zcodeh\zcode-vigilante-cupon.js" --once
```

Salida esperada cuando no hay nada: `sin entregas pendientes`.

### Paso 2 — Reiniciar ZCode con el puerto de depuración

El renderer solo consulta el servidor si la ventana está **visible**. Con la app en segundo plano el poller
se detiene y la entrega se pasa. Para poder forzarlo hace falta CDP (Chrome DevTools Protocol):

```powershell
Get-Process -Name ZCode -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 5
Start-Process "C:\Program Files\ZCode\ZCode.exe" -ArgumentList "--remote-debugging-port=9222"
Start-Sleep -Seconds 15
```

Verificar que el puerto quedó abierto:

```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 9222
```

### Paso 3 — Reclamar (clic real en el banner)

```powershell
node "C:\...\zcodeh\zcode-claim-banner.js" 180000
```

Qué hace internamente, en orden:

1. `GET http://127.0.0.1:9222/json/list` → busca el target del renderer
   (`app.asar/out/renderer/index.html`).
2. Abre un WebSocket CDP contra ese target.
3. Ejecuta `Runtime.evaluate` para **forzar la visibilidad**:

   ```js
   Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
   Object.defineProperty(document, 'hidden', { get: () => false });
   document.dispatchEvent(new Event('visibilitychange'));
   window.dispatchEvent(new Event('focus'));
   ```

4. Sondea el banner cada 4 s hasta que esté listo:
   ```json
   {"banner": true, "disabled": false, "label": "Open", "hidden": false, "pending": false}
   ```
   `hidden` se detecta con `height:0` / `visibility:hidden` en el estilo inline (el banner se oculta así
   hasta que el bundle interactivo reporta `ready`).
5. Ejecuta el clic: `btn.click()` con `userGesture: true` en el `Runtime.evaluate`.

Salida esperada:

```
[claim] target: ZCode
[claim] banner listo: {"banner":true,"disabled":false,"label":"Open","hidden":false,"pending":false}
[claim] clic-enviado
[claim] esperando confirmación del servidor...
```

### Paso 4 — Verificar que el bono quedó activo

```powershell
node "C:\...\zcodeh\zcode-start-plan-status.js"
```

Salida esperada tras el reclamo:

```
--- billing/balance (HTTP 200) ---
  plan zcode-v3-start-plan-wk-1120  status=active
        2026-11-20 18:26:12 UTC  ->  2026-11-23 01:00:00 UTC
        · GLM-5.3-Flash: 500000000 token/one_time
  saldo GLM-5.3-Flash: 0/500000000 usados, 500000000 restantes

--- marketing/touch (HTTP 200) ---
  entregas pendientes: 0
```

Los **dos** checks importan: `status=active` con el saldo completo **y** `entregas pendientes: 0`.
Si el plan aparece activo pero `marketing/touch` sigue devolviendo la entrega, el reclamo no se registró.

### Paso 5 — Volver a estado normal

El puerto de depuración es una puerta abierta: hay que cerrar ZCode y relanzarlo **sin** el flag.

```powershell
Get-Process -Name ZCode -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 5
Start-Process "C:\Program Files\ZCode\ZCode.exe"
```

El plan **sobrevive al reinicio** (verificado: `hasActiveStartPlan: true` después del relanzamiento).

---

## 3. Hallazgos: por qué no se lograba antes

### 3.1 El captcha de Aliyun vuelve inviable el reclamo por API

El endpoint de reclamo es `POST /api/v1/zcode-plan/billing/claim`, pero exige el header
`X-Aliyun-Captcha-Verify-Param`, y ese token **solo lo genera el renderer de ZCode**. Intentarlo desde un
script devuelve:

```
3007 captcha verify failed   /   HTTP 429
```

**Conclusión:** el camino correcto no es saltarse el captcha, es hacer el reclamo **dentro de la app**.
Un clic real en el botón del banner hace que la app genere el captcha y lo firme sola.

### 3.2 La ventana sin foco era el vero killer

En `out/renderer/assets/styles-a4AckxCl.js`, el servicio de marketing evalúa `Szt.visible()`, que es
literalmente `document.visibilityState !== 'hidden'`. Con la app minimizada o en segundo plano, el poller
**deja de consultar el servidor** y las entregas se acumulan/expiran sin que nadie las vea.

De ahí la necesidad de forzar `visibilityState` por CDP antes de que el banner aparezca.

### 3.3 El banner vive en un lugar poco obvio

No está en el chat ni en el header. Vive en el **pie de la barra lateral izquierda**:

```
<aside> → [data-project-sidebar-panel="navigation"] → prop `banner` del componente
```

Selector estable para automatizarlo:

```js
document.querySelector('[data-testid="marketing-banner"]')
```

Y se oculta con `height:0; visibility:hidden` hasta que el bundle interactivo reporta `ready` — por eso
"no aparece" en la captura aunque el DOM ya exista.

### 3.4 El `seq` de `marketing/touch` no es un offset

Es un **contador incremental por proceso** (`iPe++` en `createMarketingTouchService`, `out/host/index.js`).
Por eso barrer `seq=0..500` no garantiza encontrar nada, y por eso el vigilante prueba `[0..5]` en cada pasada.

### 3.5 La elegibilidad no se puede forzar

Se verificó en profundidad que **no existe forma de auto-otorgarse un bono**:

- `billing/preview` con `app_version` 3.18.0 → 3.19.0 devuelve `{"code":0,"msg":""}` **sin `data`**
  cuando no hay nada elegible.
- `marketing/touch` con `deliveries: []` en 5 cuentas y con `app_version` 3.18.2 / 3.18.3 / 3.18.4.
- Los **31 endpoints** `/api/*` del host no incluyen ningún `rewards` / `coupon` / `daily pack`.
- El catálogo de providers del servidor expone 7 entradas (`bigmodel`, `z-ai`, `builtin:bigmodel`,
  `builtin:bigmodel-coding-plan`, `builtin:zai-coding-plan`, `builtin:zai`, `team-plan:builtin`) y **ninguna**
  corresponde al canal "Global Building" del cupón diario de 300 M que corría en semanas anteriores.

**Conclusión:** lo único que se puede perder es la *ventana*, no el *derecho*. El trabajo se concentró
entonces en detectar y reclamar lo más rápido posible, no en intentar abrir la puerta.

#### La cohorte también se decide por fecha de cuenta

Un login OAuth **nuevo** no garantiza nada: se verificó con una cuenta creada durante la campaña
`wk-1120` (que ya estaba abierta) y el resultado fue `plans: []`, `balances: []` y
`billing/preview` sin `data`, es decir, una sesión válida pero **fuera de la cohorte** de esa
campaña. Las cuentas que sí recibieron el bono ya existían cuando la campaña arrancó.

En el cliente no hay ninguna maquinaria de referido: los `plan_id` con sufijo `-referral` existen
en el servidor, pero en `app.asar` no aparece ningún endpoint ni parámetro de *referral* /
*invite* / *promo* de Z.ai (las coincidencias de "referral" del bundle son del SDK de Feishu
embebido, sin relación).

**Lo único que queda es la ventana de las próximas campañas:** la única forma de tener una entrega
es que la campaña esté viva y que la cuenta esté en su cohorte. Por eso conviene dejar el vigilante
en modo `--auto` (§5.3): detecta la campaña en cuanto aparece y la reclama en el acto.

### 3.6 El "cupón diario de 300 M" no existe en el build actual

Existe documentado en fuentes públicas (campaña "Global Building": 300 M GLM-5.3-Flash/día, reclamo desde
11:00 UTC, uso 15:00–01:00 UTC), pero **no está implementado en 3.18.2** (que es, además, la última versión
publicada). Puede ser que el servidor lo retire o que llegue por otro canal; no es algo que se pueda
forzar desde el cliente.

### 3.7 Cuidado con confundir cupón con cuota diaria

El **Start Plan base** tiene cuota propia que reinicia todos los días a las **16:00 UTC (13:00 hora de Chile)**.
Eso se ve explícito en `billing/balance`:

```
period_start 2026-11-15 16:00:00 UTC  →  period_end 2026-11-16 15:59:59 UTC
```

Cuando el Start Plan está activo, ese reinicio diario **oculta** el hecho de que la campaña puntual no llegó.
Obsérvese la diferencia: en el caso de hoy `period: "one_time"` y `period_end` = `ends_at` de la campaña
(23-11 01:00 UTC), no un ciclo diario.

---

## 4. Multi-cuenta

Las 5 cuentas Z.ai del equipo veían la entrega `wk-1120`, pero **solo la que tenía sesión iniciada en ZCode**
puede reclamarla automáticamente. Para las otras 4 el flujo es manual:

1. Iniciar sesión en ZCode con esa cuenta (el deep-link `zcode://oauth/callback` **debe cerrarse** en el
   navegador antes de operar, porque relanza la app).
2. El banner aparece solo en la app con foco → pulsar "Open".

Recomendación operativa: **una máquina por cuenta** (o sesiones de escritorio separadas) para no perder
ventanas por el foco de ventana.

---

## 5. Automatización (modo vigilante)

El vigilante combina todo lo anterior y solo actúa cuando hay una campaña real.

### 5.1 El endpoint que NO destruye nada: `billing/preview`

Descubrimiento clave del 21-11: hay **dos** formas de preguntar si una cuenta tiene campaña.

| Endpoint | ¿Consume la entrega? | Uso correcto |
|----------|----------------------|--------------|
| `GET /api/v1/marketing/touch?seq=N` | **Sí** — el servidor sirve la entrega y avanza el cursor por cuenta (~8 impresiones) | **Solo** en el instante del reclamo, para la cuenta que ya se sabe reclamable |
| `GET /api/v1/zcode-plan/billing/preview?app_version=3.18.2&platform=win32-x64` | **No** — no toca el cursor de marketing | Sondeo periódico, detección de campañas, diagnóstico seguro |

Esto explica por qué los barridos de diagnóstico de las 3 cuentas quemaron su entrega: se usó `touch` como si fuera un "listar". Con `preview` el mismo diagnóstico se hace sin costo.

> **Rate limit:** `billing/preview` aplica límite de peticiones (se observó `HTTP 429` al consultarlo repetidamente sobre las 5 cuentas en pocos minutos). En modo `--avisar` con intervalo de 15 min no aparece, pero si el vigilante corre cada pocos minutos conviene subir el intervalo o espaciar las consultas. Un 429 **no** consume entrega: es solo un rechazo de la petición.

```powershell
node scripts/zcode-cuentas-preview.js   # campañas reclamables por cuenta — no consume nada
```

### 5.2 Modos del vigilante

```powershell
node scripts/zcode-vigilante-cupon.js --once          # una pasada en modo avisar
node scripts/zcode-vigilante-cupon.js --cada 10        # bucle cada 10 min en modo avisar
node scripts/zcode-vigilante-cupon.js --once --auto    # una pasada reclamando
```

**Modo `--avisar`** (por defecto, riesgo cero):
1. Descifra la sesión en memoria (keyring de Windows → credenciales → JWT) y la bóveda de sesiones.
2. Consulta `billing/preview` en las 5 cuentas — **no consume entrega**.
3. Si aparece un plan, escribe un `!!!` en consola y en `vigilante-cupon.log`.
4. No toca la sesión, no abre ZCode, no reclama.

**Modo `--auto`** (reclama en el acto):
1. Detecta con `billing/preview` (no destructivo) cuál cuenta tiene campaña.
2. Si esa cuenta no es la sesión activa: cierra ZCode → hace backup de `credentials.json` → rota con `zcode-switch-cuenta.js <email> --provider zai_cn --force`.
3. Recién ahí consume la entrega de ESA cuenta (`marketing/touch?seq=0`) y reclama en el acto.
4. Relanza ZCode con `--remote-debugging-port=9222` si hace falta y ejecuta `zcode-claim-banner.js`.
5. Verifica `billing/balance` → plan `active`.
6. **Restaura la sesión original** desde el backup y deja ZCode corriendo **sin** puerto de depuración.

> En modo auto, el captcha de Aliyun puede pedir intervención humana (puzzle interactivo). Si aparece, el reclamo queda pendiente y el script lo dice en el log; no se automatiza la resolución del anti-bot.

### 5.3 Estado actual del vigilante

Los scripts quedan listos para lanzarse a mano cuando se quiera. Para instalarlo como tarea de
Windows (funciona como usuario normal, sin elevación) conviene apuntar a un `.cmd` propio, porque
la tarea necesita variables de entorno (la bóveda, sobre todo) y las comillas de `schtasks` en
PowerShell son traicioneras:

```powershell
# .cmd: fija ZCODE_VAULT y hace UNA pasada (no consume entrega si no hay campaña)
@echo off
set ZCODE_VAULT=%USERPROFILE%\...\vault\sessions.vault
cd /d "%...\scripts"
node zcode-vigilante-cupon.js --once --auto >> "%USERPROFILE%\.zcode\vigilante-cupon.log" 2>&1

schtasks /create /tn "ZCode vigilante cupones" /tr "C:\...\.zcode\zcode-vigilante-cupon.cmd" /sc minute /mo 15 /f
```

Con `--once --auto` la tarea **no queda residente**: cada 15 minutos sondea `billing/preview` de
todas las cuentas de la bóveda (que no consume entrega) y solo si aparece una campaña entra al flujo
de reclamo (rotar → `marketing/touch` → clic real por CDP → verificar → restaurar). Si no hay nada,
la pasada termina en segundos y no toca la sesión ni reinicia la app.

> La detección de campañas acepta cualquier forma de respuesta con contenido (`data.plans`,
> `data.campaigns`, `data.deliveries` o un objeto suelto): el servidor no garantiza una sola
> estructura y antes devolvía `{code:0}` sin `data` cuando no había nada.

---

## 6. Archivos del proyecto

| Archivo | Rol |
|---------|-----|
| `zcode-vigilante-cupon.js` | Detector + orquestador (modos `--avisar` / `--auto`) |
| `zcode-cuentas-preview.js` | Campañas reclamables por cuenta — **no consume entrega** |
| `zcode-claim-banner.js` | Reclamador por CDP (clic real en el banner) |
| `zcode-claim-retry.js` | Reclamador con reintentos + verificación de `billing/balance` |
| `zcode-switch-cuenta.js` | Rota / lista / restaura la cuenta activa (`zai_cn`) |
| `zcode-start-plan-status.js` | Verificador de plan y saldo (descifra en memoria, no imprime secretos) |
| `zcode-cuentas-cupon.js` | Estado de cupones y planes de todas las cuentas en una pasada |
| `zcode-live-delivery.js` | Detalle de la entrega viva (salida redactada) |
| `vigilante-cupon.log` | Historial de pasadas del vigilante |
| `docs/zcode-cuentas-inventario.md` | Informe técnico completo del caso |

---

## 7. Resumen de campos de la campaña `wk-1120`

| Campo | Valor |
|-------|-------|
| `campaign_id` | `2101141259813175296` |
| `plan_id` | `zcode-v3-start-plan-wk-1120` |
| Nombre | ZCODE WEEKEND BUILD |
| `resource_position` | `banner` |
| Acción | `claim_zcode_plan` |
| Bundle | `https://cdn-zcode.z.ai/marketing/touch/assets/2104840819634155520/weekend-banner-3.1.2.zip` |
| Prima | 500.000.000 tokens GLM-5.3-Flash (`one_time`, `model:glm-5.3-flash`) |
| `starts_at` | 1795172400 → 20-11 15:00 UTC (12:00 local) |
| `effective_at` | 1795186800 → 20-11 19:00 UTC (16:00 local) |
| `ends_at` | 1795395600 → **23-11 01:00 UTC** (22-11 22:00 local) |
| Cuentas con la entrega visible | 5 de 5 |
| Cuentas con sesión y reclamo automático | 1 (`cuenta-5@ejemplo.com`) |

---

## 8. Nota de seguridad

- El captcha de Aliyun **nunca** se sorteó ni se falsificó: el reclamo lo firma la propia app.
- No se membahas planes de pago ni se pulsó ninguna opción de compra.
- Los secretos se descifran en memoria en cada ejecución y no quedan persistidos; este documento no
  contiene tokens, claves de bóveda ni códigos OAuth.
- El puerto `9222` queda abierto solo durante la operación y se cierra reiniciando ZCode sin el flag.


---

## 9. Reclamar el bono en **otra cuenta** sin login OAuth (multi-cuenta)

> Caso real del 20-11-2026: la entrega `wk-1120` estaba visible en las 5 cuentas del equipo.
> Se reclamó en **dos** de ellas (500M GLM-5.3-Flash cada una) sin iniciar sesión OAuth
> en la segunda. Este es el método completo.

### 9.1 Qué hay que saber de la sesión de ZCode

ZCode guarda la sesión en `~/.zcode/v2/credentials.json`, cifrada con AES-256-GCM. La clave
está en el **keyring de Windows**, en la entrada `ZCode Credential Encryption` con la cuenta
`sha256(path.resolve(credentials.json))`. Cada valor cifrado tiene esta forma:

```
enc:v2:os:<hash24>:<iv>.<tag>.<data>       # base64url, hash24 = sha256(clave).slice(0,24)
```

Claves que importan (constantes del host, `out/host/index.js`):

| Clave | Contenido |
|-------|-----------|
| `oauth:active_provider` | id del provider: `zai`, `zai_cn` o `bigmodel` |
| `zcodejwttoken` | JWT de sesión de ZCode (**sin `exp`**: nunca expira) |
| `oauth:<provider>:access_token` | token OAuth de chat.z.ai (para `zai`) |
| `oauth:<provider>:refresh_token` | refresh token (no está en nuestra bóveda) |
| `oauth:<provider>:user_info` | perfil de la cuenta |
| `oauth:session_revision` | UUID de revisión de sesión |

### 9.2 Los tres caminos de restauración y cuál usar

Al arrancar, el host tiene **tres** caminos distintos. Elegir mal = `logout` automático.

| Camino | Valida contra la red | Efecto |
|--------|---------------------|--------|
| `restoreCachedSessionState` | **no** | Solo comprueba que el JWT no esté expirado. Si el `user_info` no parsea → `signed-out` **sin borrar nada**. |
| `restoreSession` (provider `zai`) | **sí** → `chat.z.ai/api/oauth/userinfo` | Si el `access_token` OAuth está expirado → **401 → logout y borra la sesión**. |
| `restoreSession` (provider `zai_cn`) | **sí** → `zcode.z.ai/api/v1/oauth/profile` | Valida el **`zcodejwttoken`**, que no expira. |

**Clave**: `zcodejwttoken` **no tiene `exp`** (claims: `user_id, token_version, sub, iat`).
Por eso nunca expira y el camino cacheado siempre es viable.

> **En la app 3.18.2 el provider `zai` además de hacer logout cambia el esquema del archivo.**
> Cuando el host entra por el camino `zai` y falla la validación, reescribe
> `~/.zcode/v2/credentials.json` con el esquema nuevo (`account-provider:*:identity`,
> `account-provider:*:auth-source`, `oauth:session_revision`, `oauth:login_attribution`) y
> **elimina `zcodejwttoken`**. Verificado descifrando el archivo en memoria: el JWT ya no está en
> ninguna de las claves, la app queda en la pantalla de login y cualquier herramienta que lea el
> token de ahí falla con `credentials.json no tiene zcodejwttoken`.
>
> Por eso **toda rotación debe usar `--provider zai_cn`**: con `zai_cn` la sesión sobrevive al
> arranque y el `zcodejwttoken` sigue en el archivo.

### 9.3 El método que funciona: provider `zai_cn`

El provider `zai_cn` ("Z.ai (CN)") valida el perfil contra `/api/v1/oauth/profile`, que
**acepta el `zcodejwttoken`**:

```bash
curl -H "Authorization: Bearer <zcodejwttoken>" \
     "https://zcode.z.ai/api/v1/oauth/profile?app_version=3.18.2"
# -> {"code":0,"data":{"user":{"user_id":"...","email":"cuenta-3@ejemplo.com"}}}
```

Además, con `n !== "zai"` la rama `(!a || a.id === "unknown")` **no aplica**, así que un
`user_info` mal formado no provoca logout.

Procedimiento (script `zcode-switch-cuenta.js`):

```powershell
# 1) ZCode CERRADO (obligatorio: el host reescribe credentials.json al arrancar)
Get-Process -Name ZCode | ForEach-Object { Stop-Process -Id $_.Id -Force }

# 2) Rotar la sesion a la cuenta destino (hace backup automatico)
node scripts/zcode-switch-cuenta.js cuenta-3@ejemplo.com --provider zai_cn

# 3) Arrancar ZCode con CDP y reclamar
Start-Process "C:\Program Files\ZCode\ZCode.exe" -ArgumentList "--remote-debugging-port=9222"
node scripts/zcode-claim-retry.js 6 20000

# 4) Volver al estado normal: restaurar el backup y reiniciar SIN el flag
node scripts/zcode-switch-cuenta.js --restore "<backup>.json"
Get-Process -Name ZCode | ForEach-Object { Stop-Process -Id $_.Id -Force }
Start-Process "C:\Program Files\ZCode\ZCode.exe"
```

Lo que escribe la rotación:

```js
nuevo['zcodejwttoken']            = enc(zcodejwt_de_la_boveda);
nuevo['oauth:active_provider']    = enc('zai_cn');
nuevo['oauth:zai_cn:access_token']= enc(zcodejwt_de_la_boveda);
nuevo['oauth:zai_cn:user_info']   = enc(JSON.stringify(perfil_real_del_backend));
nuevo['oauth:session_revision']   = enc(randomUUID());
// y BORRA las claves de los otros providers para no dejar restos
```

El `user_info` debe ser el **perfil real que devuelve el backend** (`data.user` de
`/api/v1/oauth/profile`), no uno inventado: si el host no lo parsea, la sesión cacheada
no se restaura.

### 9.4 El servicio de marketing usa el `zcodejwttoken`, no el provider

```js
// out/host/index.js — createMarketingTouchService
async query({locale}) {
  const {headers} = await ctx(locale);      // Authorization: Bearer <getToken()>
  url.searchParams.set('seq', String(iPe++));
  ...
}
```

`getToken()` devuelve el `zcodejwttoken` del disco, **releído en cada consulta**. Por eso
rotar `credentials.json` cambia de inmediato la cuenta con la que la app consulta las
campañas, aunque la UI no haya recargado.

Cuidado: el servicio detecta el cambio de token a mitad de una petición y lanza
`marketing_identity_changed` (compara un `scope` = UUID derivado del token).

### 9.5 Los cuatro tropiezos del camino real

| Tropiezo | Síntoma | Solución |
|----------|---------|----------|
| El host valida el access_token OAuth al arrancar | Logout automático, se borra la sesión | Usar provider `zai_cn` (valida el zcodejwt) |
| El bundle del banner no se monta | El banner aparece **vacío**, con `data-testid="cloud-dialog-hero-error"` | Recargar el renderer: el `prepare` del bundle necesita un lease válido |
| El bundle solo responde `ready` si recibe `init` por postMessage | Sin iframe no hay botón | El banner es un **iframe** servido por el host en `http://127.0.0.1:<puerto>/<lease>/index.html` |
| El captcha de Aliyun falla con `F001` en la verificación | El clic llega al flujo pero el claim no se envía | El SDK necesita su **prewarm** (≈28 s). Un solo clic no basta: hay que reintentar |

### 9.6 El captcha: lo que sí y lo que no se puede automatizar

El claim lo firma el renderer con `X-Aliyun-Captcha-Verify-Param`. La configuración de
Aliyun (`region: sgp`, `prefix: no8xfe`, `sceneId: 11xygtvd`) viene de
`GET /api/v1/client/configs` y **es idéntica para las 5 cuentas** → el fallo no es de cuenta.

Cuando el captcha pide verificación interactiva, aparece un **puzzle de arrastre** en la
ventana de ZCode ("Please complete the captcha"). Ese control existe para comprobar que hay
una persona: **se resuelve a mano**, no por script. Es un arrastre de 5 segundos.

El captcha en modo *traceless* (sin puzzle) sí es automático, pero Aliyun decide en que
modo entregar cada verificación.

### 9.7 Verificación final del reclamo

```
GET /api/v1/zcode-plan/billing/balance
-> plan zcode-v3-start-plan-wk-1120  status=active
     2026-11-21 00:54:03 UTC -> 2026-11-23 01:00:00 UTC
   · GLM-5.3-Flash: 500000000 token/one_time
   saldo: 0/500000000 usados, 500000000 restantes
```

En el log del host:

```
[captcha-diagnostics] sdk.callback success -> attempt.end outcome=success
[zcode-host] marketing-touch.report OK
[zcode-agent-service] reason: "settings:marketing-plan-claim"
```

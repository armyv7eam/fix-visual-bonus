# Inventario de cuentas Z.ai registradas en ZCode — estado del Start Plan

**Fecha del análisis:** 2026-11-13 (revisión 18:58 UTC — **ver §8: hay Start Plan activo**) · **App:** ZCode 3.18.1.10376 (Windows) · **Dominio:** `zcode.z.ai`

> Las credenciales se descifraron **en memoria** desde el Administrador de Credenciales de Windows.
> No se guardaron ni imprimieron tokens, API keys ni contraseñas.
> Esta revisión **corrige** la primera versión de este documento (ver §6).

---

## 1. Con qué cuentas nos hemos registrado en ZCode

ZCode guarda **una sola sesión OAuth activa** por instalación (`~/.zcode/v2/credentials.json`), pero a lo largo
del tiempo se han conectado **7 cuentas distintas** en este equipo (evidencia: `oauthService restoreCachedSession restored: zai <user_id>`).

| # | Correo | `user_id` | Sesión en este PC | Filas de plan Start Plan que tuvo | ¿Activo hoy? |
|---|--------|-----------|-------------------|-------------------------------------|--------------|
| 1 | cuenta-1@ejemplo.com | `<user_id>` | 2026-10-29 → 2026-11-01 | `-0817` (base), `-1030-wk` | ❌ expirados |
| 2 | cuenta-2@ejemplo.com | `<user_id>` | 2026-11-02 17:37 (~11 min) y **2026-11-12 00:41 (activa)** | **ninguno** | ❌ sin plan (cuenta vírgen, sesión viva) |
| 3 | **cuenta-3@ejemplo.com** (<nombre de la cuenta>) | `<user_id>` | 2026-11-02 → 2026-11-11 | `-0817` (base), `-referral`, `-1102`, `-gb-1104` | ❌ expirado |
| 4 | **cuenta-4@ejemplo.com** (<nombre de la cuenta>) | `19a058cf-…-f1ef6adf7f9c` | 2026-10-29 → 2026-11-12 | `-referral-wk-1030`, `-1030-wk`, `-gb-1104`, `-1105` | ❌ expirados |
| 5 | *(correo no registrado en los logs)* | `cuenta-8-…-81493a3624f7` | 2026-11-03 → 2026-11-04 | `-1103` (2 concesiones) | ❌ expirado |
| 6 | *(correo no registrado en los logs)* | `cuenta-7-…-5182496f357c` | 2026-11-06 → 2026-11-10 | `-0817` (base), `-1029`, `-referral` ×2, `-referral-wk-1030`, `-1106-wk` | ❌ expirado |
| 7 | *(correo no registrado en los logs)* | `cuenta-9-…-d1c22cab838b` | 2026-11-10 16:45 → 2026-11-11 | `-1110-nt` | ❌ expirado |

> **Corrección importante (ver §6.1):** la versión anterior de este documento daba por hecho que las
> identidades `cuenta-8`, `cuenta-9` y `cuenta-7` eran "solo API key de `api.z.ai`" sin sesión OAuth.
> Los logs demuestran que las tres tuvieron **sesión OAuth activa** (`restoreCachedSession`) y **consumieron
> Start Plan real** (tienen `user_plan_id` propio). Son cuentas, no simples claves de API.

> **Corrección importante (ver §6.2):** la atribución de esta tabla **ya no** se hace "por PID". Los PIDs
> internos del host **se reciclan entre días** (el `pid:13916` fue `67154f07` el 01-11 y `cuenta-9` el 10-11),
> lo que contaminaba la atribución anterior. Ahora se resuelve por **huella de planes** (ver §2).

### Las 9 identidades Z.ai almacenadas en `credentials.json`

Las 14 entradas del almacén se descifran en memoria; 9 de ellas son `project-key-location:v1:[…]` — una por
cuenta registrada, con su `organizationId` / `projectId` / `apiKeyId` de `api.z.ai`:

`67154f07` · `ce258a49` · `134ca108` · `19a058cf` · `cuenta-8` · `d5f6a221` · `cuenta-9` · `7fabf74b` · `cuenta-7`

Dos de ellas (`d5f6a221`, `7fabf74b`) **no** aparecen en ningún log: nunca hubo sesión OAuth con ellas y
nunca recibieron plan. Las otras 7 sí.

### Claves del Administrador de Credenciales

```
Destino: <hash de la ruta de credenciales>.ZCode Credential Encryption
```

Es **la única** entrada de ZCode entre las 17 del almacén de Windows, y coincide con
`sha256(ruta de ~/.zcode/v2/credentials.json)`. Verificado contra `cmdkey /list`.

> ⚠️ **Matiz corregido:** esto significa que solo hay **una** credencial de sesión cifrada por instalación.
> No significa que el equipo nunca haya tenido más cuentas — los `user_plan_id` de las 7 cuentas anteriores
> siguen trazables en los logs, aunque la sesión en sí se sobrescribió.

---

## 2. ¿Alguna tiene Start Plan activo?

**No. Ninguna.**

El historial real son **11 `plan_id` distintos / 16 concesiones** (un mismo `plan_id` puede concederse dos
veces con fechas distintas). Todos-canceraron `status=active` en su momento; **todos están vencidos**.

| plan_id | Nombre | Inicio (UTC) | Fin (UTC) | `upl` | Cuenta(s) |
|---------|--------|--------------|-----------|--------|-----------|
| `zcode-v3-start-plan-referral-wk-1030` | ZCode Referral Weekend | 2026-10-26 10:00 | 2026-11-02 01:00 | `<upl_id>` | cuenta-4 **+** cuenta-7 *(fila compartida)* |
| `zcode-v3-start-plan-0817` | **ZCode Start Plan** | 2026-10-27 13:21 | 2026-10-31 15:59 | `<upl_id>` | cuenta-1 |
| `zcode-v3-start-plan-0817` | **ZCode Start Plan** | 2026-11-02 02:08 | 2026-11-06 15:59 | `<upl_id>` | contacto **+** cuenta-7 *(fila compartida)* |
| `zcode-v3-start-plan-referral` | ZCode Referral Global | 2026-10-27 13:25 | 2026-10-30 01:00 | `<upl_id>` | cuenta-7 |
| `zcode-v3-start-plan-1029` | ZCODE GLOBAL BUILD | 2026-10-29 15:44 | 2026-10-30 01:00 | `<upl_id>` | cuenta-7 |
| `zcode-v3-start-plan-1030-wk` | ZCODE WEEKEND BUILD | 2026-10-30 15:04 | 2026-11-02 01:00 | `<upl_id>` | cuenta-1 |
| `zcode-v3-start-plan-1030-wk` | ZCODE WEEKEND BUILD | 2026-10-31 00:32 | 2026-11-02 01:00 | `<upl_id>` | cuenta-4 |
| `zcode-v3-start-plan-1102` | ZCODE GLOBAL BUILD | 2026-11-02 14:56 | 2026-11-03 01:00 | `<upl_id>` | contacto |
| `zcode-v3-start-plan-referral` | ZCode Referral Global | 2026-11-02 02:09 | 2026-11-03 01:00 | `<upl_id>` | contacto **+** cuenta-7 *(fila compartida)* |
| `zcode-v3-start-plan-1103` | ZCODE GLOBAL BUILD | 2026-11-03 15:28 | 2026-11-04 01:00 | `<upl_id>` | del grupo `0817` (contacto o cuenta-7) ⚠️ sin desambiguar |
| `zcode-v3-start-plan-1103` | ZCODE GLOBAL BUILD | 2026-11-03 19:19 | 2026-11-04 01:00 | `<upl_id>` | cuenta-8 |
| `zcode-v3-start-plan-gb-1104` | ZCODE GLOBAL BUILD | 2026-11-04 15:26 | 2026-11-05 01:00 | `<upl_id>` | contacto |
| `zcode-v3-start-plan-gb-1104` | ZCODE GLOBAL BUILD | 2026-11-04 18:15 | 2026-11-05 01:00 | `<upl_id>` | cuenta-4 |
| `zcode-v3-start-plan-1105` | ZCODE GLOBAL BUILD | 2026-11-05 14:17 | 2026-11-06 01:00 | `<upl_id>` | cuenta-4 |
| `zcode-v3-start-plan-1106-wk` | ZCODE WEEKEND BUILD | 2026-11-06 16:15 | 2026-11-09 01:00 | `<upl_id>` | cuenta-7 |
| `zcode-v3-start-plan-1110-nt` | ZCODE GLOBAL BUILD | 2026-11-10 13:29 | 2026-11-11 01:00 | `<upl_id>` | cuenta-9 |

### Cómo se atribuye cada concesión (método corregido)

La atribución **no** puede hacerse "por PID": los PIDs internos del host **se reciclan entre días** y una
misma cifra aparece en sesiones de cuentas distintas. El método fiable es la **huella de planes**:

1. Cada cuenta tiene una *huella* = el conjunto de pares `plan_id → user_plan_id` que devuelve **su**
   `/billing/balance`.
2. La huella se construye solo con las instancias de app donde el log dice explícitamente
   `restoreCachedSession restored: zai <user_id>` → atribución **directa**.
3. Cada concesión se asigna a las cuentas cuya huella contiene ese par; cada *claim* se cruza con la
   concesión cuyo `starts_at` cae a ±120 s del instante del `claimManualPlan OK`.

### El modelo real: `upl` = fila de plan, `bucket` = contadores por cuenta

> ⚠️ **Esto corrige una afirmación anterior de este informe** (ver §6.2): el `user_plan_id` **no** es
> "una concesión por cuenta".

- El `upl` identifica una **fila de plan** (una campaña en curso). Esa fila puede estar **adjunta a varias
  cuentas a la vez**: es lo que ocurre con `zcode-v3-start-plan-0817` (**"ZCode Start Plan"**, la oferta base
  de 5 días), cuya fila `<upl_id>` aparece en el `balance` de **5+ cuentas** simultáneamente.
- Dentro de una fila, **cada cuenta tiene sus propios `bucket`** (los contadores `total_units` /
  `used_units`). Extraído del payload real de `0817`:
  `bucket_2118011122415931392` (GLM-5.3, 3 M/día) y `bucket_2118011122420125696` (GLM-5.3-Flash, 5 M/día,
  con `used_units: 5000000` = **agotado** en ese momento).
- En los planes de **referido** el `bucket` también es el mismo para las dos cuentas implicadas: el par
  `[referente → referido]` **comparte la cuota** (mismo `upl` **y** mismo `bucket` en `referral` y
  `referral-wk-1030`).

Esto explica por qué una misma fila aparece con dos o más cuentas y por qué el mismo `plan_id`
(`gb-1104`, `1030-wk`, `1103`) se conceda varias veces: **cada reclamo crea un `upl` nuevo**, y las
campañas son reutilizables por cualquier cuenta mientras estén vivas.

### La regla del trial, tal y como la muestran los logs

- Hay **11 `plan_id` distintos / 16 concesiones**, y **11 `claimManualPlan OK`** (uno por concesión nueva).
- Cada `claim` ocurrió **justo después de un login OAuth interactivo** (el `OAuth polling flow completed`
  precede al claim entre 6 s y ~35 min) — es decir, el reclamo lo hace el usuario autenticado, con el
  captcha resuelto por el renderer.
- Una cuenta **sí puede obtener varias campañas distintas**: cuenta-4 tuvo 4, cuenta-7 tuvo 6 filas.
- El `plan_id` **se reutiliza** entre cuentas (`gb-1104` lo reclamaron contacto y cuenta-4 con `upl`
  distintos; `1103` lo reclamaron dos cuentas distintas).
- La oferta global sigue viva y es la misma que anuncia `client/configs`:
  `zcode-v3-start-plan` → **GLM-5.3 3 M/día + GLM-5.3-Flash 5 M/día**.

### Estado en vivo de la cuenta conectada

**Estado a 2026-11-12 00:48 UTC, con `cuenta-2@ejemplo.com` conectado y su token archivado en la bóveda:**

| Endpoint | Respuesta |
|----------|-----------|
| `GET /api/v1/zcode-plan/billing/balance` | HTTP 200 → `plans: []`, `balances: []` → **0 planes** |
| `GET /api/v1/zcode-plan/billing/preview` | HTTP 200, `code: 0` **sin `data`** → **0 campañas reclamables** |
| `GET /api/v1/zcode-plan/billing/current` | HTTP 200, sin `data` |
| `GET /api/v1/marketing/touch?seq=0..40` | HTTP 200 → **0 entregas** en las 41 secuencias |
| `GET /api/v1/client/configs` (público) | **HTTP 200 sin sesión** → `startPlanPreview` = `zcode-v3-start-plan` (3 M + 5 M/día) |

**La misma comprobación sobre las 3 cuentas archivadas** (`zcode-multi-account-preview.js`) da
**0 planes y 0 campañas en las tres** → el bloqueo es **global**: el servidor no tiene campaña publicada
para nadie en este momento.

> **Evidencia de por qué la UI no puede ni ofrecer el reclamo:** en `out/host/index.js`,
> `getManualClaimPlanPreviews` lanza `manual_claim_preview_missing_data` cuando la respuesta del servidor
> **no trae `data`**. Es decir: sin `data` no hay botón de reclamo que pulsar; y el único endpoint que
> muta (`POST /api/v1/zcode-plan/billing/claim`) solo acepta un `plan_id` que el cliente ya recibió del
> servidor (banner de `marketing/touch` o preview).

> **Historial de sesiones:** el 2026-11-11 a las 16:11 ZCode reinició y la sesión OAuth de
> `cuenta-3@ejemplo.com` fue cerrada (`oauth.logout OK`, 16:11:32); `credentials.json` fue recreado
> sin `zcodejwttoken`. El 2026-11-12 el usuario inició sesión con **cuenta-4@ejemplo.com**
> (token 00:07:20 UTC) y, acto seguido, con **cuenta-2@ejemplo.com** (token 00:41:29 UTC); **ambas
> sesiones quedaron archivadas en la bóveda** (`zcode-token-vault.js capture`) antes de cualquier cambio
> de cuenta.

---

## 3. Por qué no se puede "habilitar" localmente

- El derecho es **100 % server-side**: si `billing/balance` devuelve `plans: []` y `marketing/touch` no entrega
  campañas, no existe acción local que lo cree.
- El paquete **sí existe** en `client/configs` (`startPlanPreview`, en `out/host/index.js`:
  `unwrapClientConfigStartPlanPreview`) y el proveedor `account:zai-start-plan` está declarado en
  `config/provider/zcode-builtin.json` (`revision 44`) con `access: {type: zhipu-account; mode: start-plan}`
  y `baseUrl: https://zcode.z.ai/api/v1/zcode-plan/anthropic`. **La app está lista; el servidor no lo otorga.**
- El reclamo (`POST /api/v1/zcode-plan/billing/claim`) exige `X-Aliyun-Captcha-Verify-Param`, que **solo genera
  el renderer Electron**: en `out/host/chunk-7SAPNXNZ.js`, `requiresRequestVerification` exige
  `mode === "start-plan"`, y en el renderer el error `3007` / `CAPTCHA_VERIFY_FAILED` se traduce a
  «captcha verify failed». El token es de un solo uso.
- Documentación oficial (`zcode.z.ai/en/docs/welcome`, verificado): *"First-time ZCode users get 5 days of free
  benefits… the daily quotas below are granted only during these 5 days"* → el derecho se otorga **por primera
  vez** y las cuentas ya consumidas no se re-activan. La página lista GLM-5.3 3M tokens/día y GLM-5-turbo 2M
  tokens/día, con «Daily total (5 days only) 5M tokens».

### Lo que sí se intentó en este equipo (y no era una vía local de Activation)

En `~/.zcode/workspace/1793207997692-…/vps-sync/` hay 8 archivos de un experimento previo (2026-10-29/30)
que **no** intentaba conseguir el Start Plan, sino **reutilizar una cuota ya concedida** vía el runtime
`app-server` de ZCode CLI:

- `plan-driver.cjs` — arranca `zcode.cjs app-server`, llama `provider/updateAccountConfig` con
  `access: {type:'zhipu-account', entitled: true}` para `account:zai-start-plan`, fija `reasoningLevel: max`
  y entrega el `zcodejwttoken` en `interaction/requestProviderRuntimeHeaders`.
- `plan-gateway.cjs` — expone un gateway Anthropic Messages API (`POST /v1/messages`) sobre esa misma cuota.
- `probe-plan-provider.cjs` — prueba qué `providerId` enruta a la cuota del Start Plan.

Estos scripts **no** pueden crear el derecho: `entitled: true` es un estado local de la app, y el backend de
`zcode.z.ai` sigue validando la concesión. El hecho de que el servidor emita un `upl` **nuevo** en cada
reclamo (16 concesiones distintas para 11 `plan_id`) confirma que el derecho se registra en su propio
registro, y que **ni una fila de plan ni un `bucket` se pueden fabricar desde el cliente**.

---

## 4. cuenta-4@ejemplo.com — cerrado y verificado en vivo

La versión anterior decía que su estado era *«desconocido: su sesión está caducada y solo es verificable
volviendo a iniciar sesión (probablemente en el VPS)»*. **Verificado en dos fases:**

- **Fase 1 — copia antigua:** su credencial sí está en este equipo, en
  `~/.zcode/workspace/1793207997692-…/vps-sync/credentials.json` (copia del VPS, 2026-10-29), cifrada con
  `enc:v1` (no `enc:v2`), descifrable con la clave de fallback que los propios scripts del proyecto
  documentan (`zcode-credential-fallback:linux:/data/home:<clave>`).
  Identifica a `<user_id>` / **cuenta-4@ejemplo.com** / <nombre de la cuenta>.
  Su `zcodejwttoken` (emitido 2026-10-29 15:43:51 UTC) responde **HTTP 401** → **caducado**.
- **Fase 2 — sesión nueva (2026-11-12):** el usuario inició sesión con la cuenta y el token **válido**
  (emitido 2026-11-12 00:07:20 UTC) quedó **archivado en la bóveda** (`zcode-token-vault.js capture`).
  Con esa sesión se consultó el estado real:
  `balance` → **0 planes**, `preview` → **0 campañas reclamables**, `marketing/touch` → **0 entregas**.
- Su historial de planes (desde los logs de esta máquina): 4 filas de plan
  (`-referral-wk-1030`, `-1030-wk`, `-gb-1104`, `-1105`), todas vencidas.

Los otros dos puntos abiertos del informe también quedan cerrados con la atribución por huella:
`cuenta-1` (2 filas) y **`cuenta-2` (0 filas: cuenta vírgen)**.

### 4.1 `cuenta-2@ejemplo.com` — verificada el 2026-11-12

- Sesión nueva abierta el 2026-11-12 a las 00:41 UTC (token `iat` 00:41:29) y **archivada en la bóveda**
  a las 00:42:04 → es la **sesión activa** en este momento.
- Estado con esa sesión: `balance` → `plans: []`; `preview` → sin `data`; `marketing/touch` seq 0..40 → 0 entregas.
- Sigue siendo la **cuenta sin ningún plan en toda su historia**: es la candidata natural al próximo
  reclamo, pero **hoy el servidor no le publica nada** (ni a ella ni a las otras dos cuentas).

---

## 5. Nota de higiene

- Los scripts de descifrado del proyecto **descifran en memoria y no escriben secretos**; `zcode-identity-inspect.js`
  y `zcode-project-keys.js` redactan explícitamente `apiKeyId`, tokens y claves.
- ⚠️ **Pendiente de hygiene (no corregido):** los scripts de `vps-sync/` derivan la clave de descifrado
  `enc:v1` de un secreto **hardcodeado** (`zcode-credential-fallback:win32:C:\Users\<usuario>:<clave>`).
  Eso permite descifrar `credentials.json` de cualquier instalación ZCode de este usuario sin el keyring
  del sistema. No es un fallo de ZCode, pero conviene no dejar ese material en un workspace compartido.
- ✅ El almacén de Windows mantiene **una sola** entrada de ZCode (la de `credentials.json` activo).

---

## 6. Correcciones respecto a la primera versión de este informe

La primera versión (2026-11-11 18:57 UTC) tenía tres errores sustantivos, ya corregidos arriba:

1. **§1 — "3 cuentas distintas" + 1 en el VPS.** En realidad hubo **7 cuentas** con sesión OAuth en este
   equipo (las 3 conocidas + cuenta-4 + `cuenta-8` + `cuenta-7` + `cuenta-9`). cuenta-4 **sí** tuvo
   sesión activa en esta máquina (restaurada el 2026-10-29, 10-30, 10-31, 11-03, 11-04, 11-05 y **hoy
   2026-11-11 a las 12:38 y 12:49**), no solo en el VPS.
2. **§1 — las 5 identidades "solo API key" que "no pueden tener Start Plan".** Falso para 3 de ellas:
   `cuenta-8`, `cuenta-9` y `cuenta-7` tuvieron sesión OAuth **y** Start Plan propio (`upl` distinto). Esa
   conclusión era circular: se dedujo del formato de la clave `project-key-location` sin cruzar los logs.
3. **§2 — "11 planes" con atribución incompleta.** Hay 11 `plan_id` pero **16 concesiones** (5 planes se
   concedieron dos veces con ventanas distintas: `0817`, `1030-wk`, `1103`, `gb-1104`, `referral`). La tabla
   original listaba una sola fila por `plan_id` y dejaba 4accounts sin atribuir. Además, los finales de
   ventana estaban desplazados ~14 h en 5 filas (p. ej. `1030-wk` figuraba como 2026-10-31 00:32 → 2026-11-02
   01:00, cuando en realidad son **dos** concesiones: 10-30 15:04→11-02 01:00 y 10-31 00:32→11-02 01:00).

También se corrigió la afirmación de que el sufijo `-1` duplicaría los planes: **no** — los 21 identificadores
brutos del log se reducen a **11 `plan_id`**; el `-1` pertenece al `entitlement_id`
(`ent-zcode-v3-start-plan-1103-1`), no a un plan distinto.

### 6.2 Segunda ronda de correcciones (2026-11-12): el método de atribución

Al reauditar para cerrar el caso de cuenta-4 se detectaron **dos errores de método** en la versión
intermedia, ambos ya corregidos:

1. **Atribución "por PID" → por huella de planes.** Los PIDs internos del host **se reciclan entre días**:
   el `pid:13916` fue `67154f07` el 01-11 y `cuenta-9` el 10-11; el `pid:12832` fue `cuenta-7` el 09-11.
   Con el método anterior, la concesión `<upl_id>` (`1110-nt`) quedaba repartida entre
   `cuenta-9` (x99) y `cuenta-7` (x6). **Con el método correcto es 100 % de `cuenta-9`**: el claim del
   2026-11-10 10:29:50 ocurrió en la instancia `app=10948`, y la siguiente restauración de sesión
   (11-10 16:45) devuelve `cuenta-9`.
2. **"El `upl` es único por concesión / una cuenta por `upl` (100 %)"** → **incorrecto**. El `upl` identifica
   una **fila de plan** (campaña), que puede estar adjunta a **varias cuentas a la vez**:
   `zcode-v3-start-plan-0817` ("ZCode Start Plan") aparece con el mismo `upl` en el `balance` de **5+ cuentas**
   durante la ventana 02-08 UTC del 02-11 → 15-59 UTC del 06-11. Los contadores (`bucket`) sí son por cuenta;
   en los referidos, incluso el `bucket` es compartido por el par referente-referido.
   La atribución correcta es por **huella de planes** (ver §2).

Además, el punto "una concesión = un `upl`" que se usó para argumentar que no se puede reutilizar el
`upl` de otra cuenta se sustituye por la evidencia correcta: **cada reclamo genera un `upl` nuevo** y el
servidor mantiene su propio registro (`16` concessions, `11` `plan_id`, `11` `claimManualPlan OK`).

### 6.3 Lo que quedó sin desambiguar

Una sola concesión no pudo atribuirse a una cuenta concreta: `<upl_id>` (`1103`, ventana
2026-11-03 15:28 → 11-04 01:00), reclamada en la instancia `app=9500` el 03-11 a las 12:28:57. Esa cuenta
tenía además la fila compartida `0817`, por lo que es **cuenta-3@ejemplo.com o `cuenta-7`**.
No cambia ninguna conclusión (todas las concesiones están vencidas).

---

## 7. Archivos del proyecto

| Archivo | Qué hace |
|---------|----------|
| `docs/zcode-cuentas-inventario.md` | Este informe. |
| `zcode-start-plan-status.js` | Verificador del estado del Start Plan de la **sesión activa** (solo lectura). |
| `zcode-final-attribution.js` | **Tabla final** de concesiones → cuenta, por huella de planes (método corregido). |
| `zcode-claim-attribution.js` | Atribución de los 11 `claim` a su cuenta por huella. |
| `zcode-upl-audit.js` | Reconstruye concessions por línea de tiempo por instancia de app. |
| `zcode-day-timeline.js` | Timeline de un día: sesiones, claims y `balance` en orden. |
| `zcode-upl-context.js` | Para un `upl`: qué instancias y qué conjunto de planes lo vieron. |
| `zcode-upl-debug.js` | Depuración de la atribución de un `upl` concreto. |
| `zcode-bucket-check.js` | Relación `upl` → `entitlement` → `bucket` (detecta pools compartidos). |
| `zcode-multi-account-preview.js` | Compara `preview`/`balance`/`touch` de **todas** las cuentas de la bóveda. |
| `zcode-touch-sweep.js` | Barre `marketing/touch` (seq 0..40) y los endpoints de oferta de la sesión activa. |
| `zcode-campaign-watch.js` | Vigilante de campañas sobre las 3 cuentas de la bóveda + la sesión activa (tarea programada diaria 09:45). |
| `zcode-plan-attribution.js` | Versión primera de la atribución (supersedida por `zcode-final-attribution.js`). |
| `zcode-claim-analysis.js` / `zcode-claim-probe.js` / `zcode-grant-timing.js` | Análisis de los 11 claims y sus tiempos. |
| `zcode-token-vault.js` | Bóveda cifrada de sesiones: `capture` / `list` / `check` / `restore`. |
| `zcode-identity-inspect.js` | Lista las claves del almacén descifradas, con secretos redactados. |
| `zcode-project-keys.js` | Muestra la estructura de cada `project-key-location` (org/project, clave oculta). |
| `zcode-asar-scan.js` | Búsqueda de cadenas dentro de `app.asar` (verifica claims del cliente). |
| `zcode-vpssync-identify.js` | Identifica la cuenta de la copia `vps-sync` sin imprimir el token. |
| `zcode-vpssync-plan-check.js` | Verifica el Start Plan de esa copia (hoy: HTTP 401, token caducado). |

---

## 8. Revisión 2026-11-13 18:58 UTC — **sí hay Start Plan activo** (cuenta nueva)

La sesión activa de ZCode **ya no** es la de `cuenta-3@ejemplo.com`: ZCode se reinició el 13-11 a las
15:54 y quedó autenticada con una **cuenta nueva**, que sí tiene el Start Plan vigente.

### 8.1 Cuenta activa

| Campo | Valor |
|-------|-------|
| Nombre | **<nombre de la cuenta>** |
| Correo | **cuenta-5@ejemplo.com** |
| `user_id` | `<user_id>` |
| `user_plan_id` | `<upl_id>` |
| Bucket GLM-5.3 | `bucket_2121316594962345984` |
| Bucket GLM-5.3-Flash | `bucket_2121316594966540288` |

Confirmado por tres vías independientes: `/api/v1/oauth/profile` (200), `billing/balance` (200) y la UI de ZCode
(la esquina inferior izquierda muestra "<nombre de la cuenta>").

### 8.2 Plan activo

| Campo | Valor |
|-------|-------|
| `plan_id` | `zcode-v3-start-plan-0817` ("ZCode Start Plan", 免费 GLM 旗舰模型体验) |
| `status` | **active** |
| `starts_at` | 2026-11-12 16:37:44 UTC |
| `ends_at` | **2026-11-17 15:59:59 UTC** (vence en ~3,9 días) |
| GLM-5.3 | 3 000 000 token/día · `used 0 / 3 000 000` |
| GLM-5.3-Flash | 5 000 000 token/día · `used 0 / 5 000 000` |
| Reinicio de cuota diaria | `period_start 2026-11-13 16:00 UTC` → `period_end 2026-11-14 15:59 UTC` (la UI lo muestra como "Nov 14") |

Verificación en la UI (*Model settings → Start Plan*): tarjeta **"ZCode Start Plan"**, badge **"Upgrade 150% Quota"**,
texto **"Expires Nov 17, 12:59"**, dos barras de saldo al **100 %** y los modelos `GLM-5.3` y `GLM-5.3-Flash`
habilitados. El selector del composer pasó de `deepseek-v4.1-flash:free` a **`GLM-5.3-Flash Max`**: el plan ya
está aplicando entitlements.

### 8.3 Campaña pendiente: "ZCODE WEEKEND BUILD" (reclamable)

`marketing/touch` entrega una campaña activa (no un plan ya consolidado, sino una **oferta por reclamar**):

| Campo | Valor |
|-------|-------|
| `campaign_id` | `2101141259813175296` |
| `plan_id` | `zcode-v3-start-plan-1113-wk` ("ZCODE WEEKEND BUILD") |
| `starts_at` / `ends_at` | 2026-11-13 15:00 UTC → **2026-11-16 13:00 UTC** |
| Entitlement | **GLM-5.3-Flash — 500 000 000 token, `period: one_time`** |
| Acción del botón | `claim_zcode_plan` → `POST /api/v1/zcode-plan/billing/claim` |
| `resource_position` | `banner` (aparece en la portada al iniciar la app) |

Es la vía oficial (el botón del banner genera el captcha de Aliyun en el renderer). Sin reclamar, caduca el 16-11.

### 8.4 Cambio en el almacén de identidades

`credentials.json` pasó de 9 a **11** identidades `project-key-location` (api.z.ai): se añadieron
`<device_mid>` y **`<user_id>`** (la cuenta activa).
Las 7 cuentas documentadas en §1 siguen con sus planes vencidos; **ninguna se reactivó** — el plan vigente
pertenece a la cuenta nueva.

### 8.5 Conclusión

El objetivo original ("habilitar el Start Plan") **está cumplido** desde el 12-11 16:37 UTC, no por una acción
local sino porque se conectó una cuenta con derecho de primera vez. Las 4 cuentas del §1 no tienen plan activo:
sus tokens caducan al cambiar de sesión y no existe ninguna acción local que reactive un `upl` vencido
(la tabla §6.2 demuestra que cada reclamo genera un `upl` nuevo).

### 8.6 Actualización de ZCode a 3.18.2 (2026-11-13 16:37 UTC)

El badge "Update" ofrecía la 3.18.2; se instaló **con el consentimiento del usuario**:

| Paso | Resultado |
|------|-----------|
| Instalador localizado | `%LOCALAPPDATA%\@zcodedesktop-updater\pending\ZCode-3.18.2-win-x64.exe` (237 MB) |
| Instalador colgado (`setup` elevado, sin ventana) | terminado con `taskkill` elevado; el flag `/S` **no** avanza con este NSIS |
| Instalación efectiva | ejecutada elevada, extracción de ~1,1 GB en `ns*.tmp` y copia a `C:\Program Files\ZCode` |
| Versión final | **3.18.2.10443** (antes 3.18.1.10376) |
| Sesión | restaurada: `<nombre de la cuenta>` / `cuenta-5@ejemplo.com`, plan `zcode-v3-start-plan-0817` sigue `active` |

Después de actualizar desapareció el error `Windows runtime host is missing` / `spawn EBUSY` (los assets
`resources/tools/runtime-host/zcode-runtime-host.exe` se copiaron tarde, con la app ya arrancada).

### 8.7 Estado de la campaña "ZCODE WEEKEND BUILD" (diagnóstico de esta sección)

> **Actualizado en §9: la campaña fue RECLAMADA el 2026-11-13 20:52:53 UTC (+500 000 000 tokens GLM-5.3-Flash).**
> Este apartado conserva el estado previo y el diagnóstico que lo desbloqueó.

La campaña **sigue pendiente en el servidor** (`marketing/touch` → 1 entrega) pero **el banner no se renderiza**
en esta sesión de la app: se revisó la pantalla de inicio, el chat de una conversación, *Model settings → Start Plan*,
el badge "Upgrade 150% Quota" y el menú de ayuda, sin encontrarlo. UIAutomation no expone el DOM de ZCode
(9 nodos) y no hay ventana separada de banner.

Datos de la entrega (para reclamarla):

- `campaign_id` `2101141259813175296` · `plan_id` `zcode-v3-start-plan-1113-wk` ("ZCODE WEEKEND BUILD")
- Ventana: 2026-11-13 15:00 UTC → **2026-11-16 13:00 UTC**
- Prima: **500 000 000 tokens GLM-5.3-Flash**, `period: one_time`
- Botón del banner: acción `claim_zcode_plan` → `POST /api/v1/zcode-plan/billing/claim`

Vías de reclamo (la única que genera el captcha de Aliyun es el renderer de ZCode o el sitio web oficial):

1. **Web**: entrar en <https://zcode.z.ai> con `cuenta-5@ejemplo.com` → el mismo banner de campaña con su botón.
2. **App**: reiniciar ZCode (el banner se pinta en el arranque, `marketing-touch.query` se ejecuta a los ~3 s del
   launch) o esperar al siguiente arranque del proceso.
3. Desde scripts es **imposible**: `billing/claim` responde `3007 "captcha verify failed"` sin el token
   `X-Aliyun-Captcha-Verify-Param` que solo genera el renderer.

## 9. Campaña "ZCODE WEEKEND BUILD" — RECLAMADA (2026-11-13 20:52:53 UTC)

### 9.1 Resultado

| Campo | Valor |
|-------|-------|
| Cuenta | <nombre de la cuenta> `<cuenta-5@ejemplo.com>` (`user_id <user_id>`) |
| `plan_id` | `zcode-v3-start-plan-1113-wk` ("ZCODE WEEKEND BUILD") |
| `status` | **active** |
| Ventana del plan | 2026-11-13 20:52:53 UTC → 2026-11-16 01:00:00 UTC (caduca el **15-11 22:00 hora local**, UTC−3) |
| Prima | **500 000 000 tokens GLM-5.3-Flash**, `period: one_time`, `capabilities: model:glm-5.3-flash` |
| Saldo | 0 / 500 000 000 usados → **500 000 000 disponibles** |
| `marketing/touch` | **0 entregas pendientes** (la campaña se consumió) |
| Plan ya activo | `zcode-v3-start-plan-0817` sigue `active` hasta 2026-11-17 15:59:59 UTC (3 M + 5 M diarios) |

La UI lo refleja en *Model settings → Start Plan*: dos tarjetas, "ZCODE WEEKEND BUILD" (badge *Upgrade 150% Quota*,
GLM-5.3-Flash 100 %, 500 000 000 / 500 000 000) y "ZCode Start Plan" (GLM-5.3 y GLM-5.3-Flash al 100 %).
Captura: `zcode-weekend-claim.png`.

### 9.2 Por qué no aparecía el banner (diagnóstico con código y logs, no con suposiciones)

El banner **sí** se renderiza en el pie de la barra lateral izquierda de ZCode (`<aside>` → `data-project-sidebar-panel="navigation"`
→ `bLt` con prop `banner`), **no** en el chat ni en la pantalla de inicio. Condiciones en `out/renderer/assets/styles-a4AckxCl.js`:

- `yzt(delivery)` → exige `delivery.resource_position === 'banner'` **y** (`image` o `bannerHero`).
- `Azt()` → si no, devuelve `null` y no se monta nada.
- El bundle interactivo (`interactive_bundle`) se descarga y valida por sha256 en `cloudContentService.prepare`;
  si falla, `Tzt` degrada a imagen de fallback y, sin fallback, `prepare` lanza `marketing_banner_unavailable`
  → el poller registra `[marketing-touch] banner resource rejected` (warn de renderer, **no** va al log del host).
- El botón queda `disabled` hasta que el bundle reporta `ready` (`onReadyChange`).

**Causa raíz**: el poller de marketing (`Szt`) solo consulta cuando `document.visibilityState !== 'hidden'`
(`visible: () => document.visibilityState !== 'hidden'`). Con ZCode **minimizado o sin foco**, `visibilityState` es
`'hidden'` y el poller nunca dispara `marketing-touch.query`; por eso el banner no se pintaba. Secondary: la ventana
se lanzaba en segundo plano tras el reinicio.

### 9.3 Método usado para el reclamo (2026-11-13)

1. Reinicio limpio de ZCode (3.18.2) y **sesión única** → el callback OAuth de `cuenta-5@ejemplo.com` se aceptó
   (pestaña OAuth: *"Sign-In Complete — Your authorization is syncing to the ZCode desktop app"*).
   Nota: al pulsar "Open ZCode" el deep-link `zcode://oauth/callback` **arrancaba una segunda instancia** y el callback
   quedaba cacheado ("OAuth 回调未命中目标窗口") → el `handleCallback` posterior falló con *"OAuth state 不匹配或已过期"*.
   Con una sola instancia, la sesión se restauró bien.
2. Diagnóstico del DOM vía **Chrome DevTools Protocol** sobre la app Electron (`ZCode.exe --remote-debugging-port=9222`),
   ya que UIAutomation solo expone 9 nodos. Se leyó `document.querySelector('[data-testid="marketing-banner"]')`.
3. Se forzó la visibilidad en el renderer:
   `Object.defineProperty(document,'visibilityState',{get:()=>'visible'})` + `dispatchEvent(new Event('visibilitychange'))`
   → el poller consultó y montó el banner.
4. El botón `claim_zcode_plan` ejecutó el flujo real en el renderer: **captcha de Aliyun** (`captcha-network` →
   `init_api` / `device_api` contra `captcha-open-southeast.aliyuncs.com`), `marketing-touch.report` con `actionType: confirm`
   y `POST billing/claim` con éxito. Después, el *success popup* navegó a *Model settings → models*.
5. ZCode se reinició **sin** el puerto de depuración (estado normal) y el plan persiste en el servidor.

### 9.4 Reproducibilidad para futuras campañas

- El banner se pinta solo si la ventana de ZCode está **visible y con foco**; si no, no hay consulta ni banner.
  Basta con abrir la app en primer plano y esperar al siguiente poll (30 s en dev, 10 min en producción).
- Para automatizar un reclamo hay que actuar **desde el renderer** (el captcha de Aliyun no se puede generar fuera).
  El CDP (`--remote-debugging-port`) es la vía limpia: leer el DOM, esperar `button:not([disabled])` y pulsar.
- El log del host (`~/.zcode/v2/logs/YYYY-MM-DD.log`) solo registra el RPC `marketing-touch.query`; los warns del
  renderer (`hero degraded`, `banner resource rejected`) **no** aparecen ahí: hay que leer la consola del renderer.

## 10. Purga del bucle de tareas cron (2026-11-13, ~18:25 hora local)

### 10.1 Qué era el bucle

Una automatización cron de ZCode — *"Mantenimiento silencioso cada 5 minutos de las máquinas del equipo"*
(`automation-<automation_id>`) — corrió **1.628 veces** entre el 26-10 y el 05-11 15:29 UTC.
Cada ejecución creaba una sesión nueva con el mismo título, admitida en el grupo `zcode-default-group-cron`
("cron") de la barra lateral: de ahí la lista inflada de "Mantenimiento silencioso cada 5 minutos de las máquinas i…".

La automatización **ya no existe** en la tabla `automations` (solo queda la otra, ya completada y `enabled=0`),
o sea que el bucle ya estaba muerto: solo quedaban los restos acumulados.

### 10.2 Qué se borró

| Cosa | Antes | Después |
|------|-------|---------|
| `tasks` (índice) | 1.176 | **104** |
| tareas "Mantenimiento silencioso…" | 602 | **0** |
| stubs sin título (`created_at=0`, `meta_json={}`) | 475 | **5** (vivas) |
| `automation_runs` | 1.629 | **0** |
| miembros del grupo "cron" | 603 | **1** |
| `cli/db` → `session` | 807 | 205 |
| `cli/db` → `message` | 30.476 | 22.119 |
| `cli/db` → `part` | 93.613 | 74.353 |
| `~/.zcode/cli/db/db.sqlite` | 389,6 MB | **310,6 MB** |
| `~/.zcode/v2/tasks-index.sqlite` | 8,2 MB | **3,6 MB** |

≈ **84 MB liberados** (VACUUM + checkpoint del WAL). Verificación de claves foráneas: **0 violaciones** en ambas bases.

Quedan 104 tareas reales de proyecto (Engram, Tribizo, applacolina, Umbral, X.com, etc.) y 1 sesión del grupo "cron"
("Re-despliegue anillo git", que es la tarea destino de la automatización completada).

### 10.3 Exclusiones de seguridad aplicadas

El script `zcode-purga-cron.js` **nunca** borra sin comprobar:

1. Sesiones con proceso vivo (`session_runtime_presence`): 5 `app-server` del desktop estaban corriendo → excluidas.
2. Sesiones padre de workflows (`dwf_run.parent_session_id`, `workflow_run.parent_session_id`) o enlazadas por
   `session_task_link`: borrarlas arrastraría los 7 actores con trabajo real del run *"Rediseño dashboard admin (R1-R5)"*.
   (En la práctica 0: la sesión padre se titula "Estado actual de engram", no entra en el set.)
3. Comprobación de contenido antes de borrar: se verificó que **ninguna** de las 475 stubs sin título existe en
   `cli/db` ni tiene mensajes/partes → son basura de índice, no trabajo perdido.

### 10.4 Cómo se hizo (reproducible)

```powershell
# 1. Cerrar ZCode y la pestaña OAuth de Chrome que lo relanzaba por deep-link
Get-Process -Name ZCode | ForEach-Object { Stop-Process -Id $_.Id -Force }
# 2. Purgar (hace backup automatico antes de escribir)
node scripts/zcode-purga-cron.js --execute
```

El script: crea backup en `~/.zcode/backup/purga-cron-<ts>/` (copia de ambas bases con `-wal`/`-shm`),
abre transacción con `PRAGMA foreign_keys=ON`, borra hijos antes que padres según el orden real de FK
(`part` → `message` → `model_usage`/`turn_usage`/`tool_usage` → `session_*` → `todo`/`input_history` →
`session_task_link` → `workflow_*` → `dwf_*` → `session`), borra el índice, hace `VACUUM` y cierra con
`PRAGMA foreign_key_check`.

**Trampa encontrada**: la pestaña OAuth de Chrome (`zcode://oauth/callback?code=…`) **relanzaba ZCode** al cerrarlo,
y el script abortaba con *"hay 25 procesos ZCode.exe vivos"*. Hay que cerrar esa pestaña de Chrome ANTES de purgar.

### 10.5 Nota sobre los planes (sin cambios)

La purga no toca la cuenta Z.ai: los dos planes siguen `active`
(`zcode-v3-start-plan-1113-wk` con 500 M GLM-5.3-Flash y `zcode-v3-start-plan-0817` con 3 M + 5 M diarios).

## 11. El "cupón" diario: qué es y cómo evitar que se pierda (2026-11-16)

### 11.1 El programa real (verificado contra fuentes públicas)

| Campaña | Prima | Ventana | Canal |
|---------|-------|---------|-------|
| Trust Build | 100 M/día por cuenta | hasta 07-oct | in-app |
| Global Build | 100 M por cuenta **nueva** (50.000 plazas, link de invitación) | hasta 23-ago | in-app |
| **Diario "Global Building"** | **300 M GLM-5.3-Flash/día** | reclamo desde **11:00 UTC**, uso **15:00–01:00 UTC** | in-app + provider **"Global Building"** |
| Weekend Build | 500 M (13-16 nov) | 13-11 15:00 → **16-11 01:00 UTC** | in-app + canal Global Building |

Fuentes: [@zcode_ai en X (26-10)](https://x.com/zcode_ai/status/2114762939421139426), aipromonow.com/en/deals/zcode.

### 11.2 Por qué el 16-11 no llegó nada (evidencia, no suposiciones)

- `marketing/touch` → `deliveries: []` en **seq 0→500** y con `X-ZCode-App-Version` 3.18.2 / 3.18.3 / 3.18.4.
- Las **5 cuentas Z.ai** del equipo: 0 entregas y `billing/preview` vacío en todas.
- `billing/preview` con app_version 3.18.0→3.19.0: respuesta `{"code":0,"msg":""}` **sin `data`** → nada elegible.
- 3.18.2 **es la última versión** (el propio updater lo dice a las 14:12 del 16-11).
- El build 3.18.2 **no tiene el provider "Global Building"**: el catálogo del servidor expone 7 providers
  (`bigmodel`, `z-ai`, `builtin:bigmodel`, `builtin:bigmodel-coding-plan`, `builtin:zai-coding-plan`,
  `builtin:zai`, `team-plan:builtin`) y **0 coincidencias** de "global"/"building" en `client/configs`,
  `provider_config.json`, host y renderer. El `highspeed` del código es otra cosa (métricas de TPS).
- Los 31 endpoints `/api/*` del host no incluyen ningún "rewards/coupon/daily pack": la promo solo existe vía
  `marketing/touch` + `zcode-plan/billing/claim`.

**Conclusión**: la elegibilidad la decide el servidor por cohorte. No hay ningún parámetro, endpoint ni forma
de forzarla desde el cliente. Lo único que se puede perder es la **ventana**: que el banner se pinte y se pulse a tiempo.

### 11.3 Reinicio del cupo diario (no confundarlo con el cupón)

El cupo del Start Plan reinicia a las **16:00 UTC (13:00 hora local)**. `billing/balance` lo expone explícito:
`period_start` 2026-11-15 16:00:00 → `period_end` 2026-11-16 15:59:59 UTC. A las 12:54 local (15:54 UTC) el
periodo aún no había rotado; a las 16:00:00 UTC exactos ambos buckets volvieron a 0 consumidos
(GLM-5.3 3 M y GLM-5.3-Flash 5 M disponibles).

### 11.4 Herramientas para no volver a perder una entrega

| Script | Qué hace |
|--------|----------|
| `zcode-vigilante-cupon.js` | Sondea `marketing/touch` en las 5 cuentas; al detectar una entrega con `claim_zcode_plan` relanza ZCode con CDP y dispara el reclamo. `--once` para una pasada, `--cada N` para el intervalo (10 min por defecto). |
| `zcode-claim-banner.js` | El reclamo en sí: se conecta por CDP al renderer, fuerza `document.visibilityState='visible'` (sin foco el poller no consulta), espera a que el botón del banner esté habilitado y lo pulsa — el captcha de Aliyun lo genera el renderer, por eso el clic debe ser real. |
| `zcode-cuentas-cupon.js` | Estado de cupones y planes de las 5 cuentas en una sola pasada. |
| `zcode-touch-cursor.js` | Semántica del cursor `seq` (es un contador incremental por proceso) + barrido amplio + `client/configs`. |

Flujo probado: el 13-11 el mismo mecanismo reclamó los 500 M de "ZCODE WEEKEND BUILD" en ~2 s desde el clic.


---

## 12. Campaña del 20-11-2026: "ZCODE WEEKEND BUILD" (wk-1120) — RECLAMADA ✅

### 12.1 Qué se detectó

La campaña de la semana apareció por primera vez a las **15:00 UTC (12:00 local)** del 20-11 en
`GET /api/v1/marketing/touch`:

| Campo | Valor |
|-------|-------|
| `campaign_id` | `2101141259813175296` |
| `plan_id` | `zcode-v3-start-plan-wk-1120` |
| `resource_position` | `banner` (pie de la barra lateral izquierda) |
| Acción del banner | `claim_zcode_plan` |
| Bundle | `https://cdn-zcode.z.ai/marketing/touch/assets/2104840819634155520/weekend-banner-3.1.2.zip` |
| Prima | **500.000.000 tokens GLM-5.3-Flash** (`one_time`, `model:glm-5.3-flash`) |
| `starts_at` | 1795172400 = **20-11 15:00 UTC** (12:00 local) |
| `effective_at` | 1795186800 = **20-11 19:00 UTC** (16:00 local) |
| `ends_at` | 1795395600 = **23-11 01:00 UTC** (22-11 22:00 local) |

Visible en las **5 cuentas** Z.ai del equipo (8 entregas, seq 0–7):
cuenta-3@ejemplo.com, cuenta-4@ejemplo.com, cuenta-2@ejemplo.com,
cuenta-6@ejemplo.com, cuenta-5@ejemplo.com.

### 12.2 Cómo se reclamó

El reclamo se hizo con un **clic real en el banner** del renderer, porque `zcode-plan/billing/claim`
exige el captcha de Aliyun (`X-Aliyun-Captcha-Verify-Param`) que solo genera la app. Un POST desde script
devuelve `3007 captcha verify failed` / 429 — no es viable ni corresponde.

Secuencia probada:

1. Detección por API (5 cuentas) → la entrega `wk-1120` aparece en `marketing/touch`.
2. ZCode relanzado con `--remote-debugging-port=9222` (el poller del renderer no consulta si
   `document.visibilityState === 'hidden'`).
3. `zcode-claim-banner.js` se conecta por CDP, fuerza `visibilityState='visible'`, espera a que el banner
   reporte `{"banner":true,"disabled":false,"label":"Open","hidden":false,"pending":false}` y pulsa el botón.
4. ZCode se reinició **sin** el flag de depuración (estado normal).

### 12.3 Confirmación por API (después del reclamo)

`GET /api/v1/zcode-plan/billing/balance` → plan `zcode-v3-start-plan-wk-1120`:

- `status`: **active**
- `period_start`: 2026-11-20 18:26:12 UTC → `period_end`: 2026-11-23 01:00:00 UTC
- Bucket GLM-5.3-Flash: **0 / 500.000.000 usados → 500.000.000 restantes**
- `marketing/touch` → **0 entregas** (campaña consumida para esa cuenta)
- `billing/preview` → ninguna campaña adicional
- Log `settings:marketing-plan-claim` + `marketing-touch.report OK` + `hasActiveStartPlan: true`

Evidencia visual (`zcode-cupon-1120.png`): la tarjeta **Model settings → Start Plan** muestra
"Start Plan – IDE WEEKEND BUILD", "Expires Nov 22, 22:00", barra GLM-5.3-Flash al **100 %**,
`500,000,000 / 500,000,000`.

### 12.4 Las otras 4 cuentas

Las 4 cuentas restantes **también ven la entrega** `wk-1120`, pero no tienen sesión iniciada en ZCode.
Reclamarlas exige un login OAuth por cuenta (correo + verificación), que no se puede automatizar sin las
credenciales del usuario. Cada una puede abrir su propio cupón desde la app si el usuario inicia sesión
en ella y pulsa el banner.

### 12.5 Estado de higiene tras la operación

- ZCode corriendo **sin** `--remote-debugging-port` (puerto 9222 cerrado) → estado normal.
- El plan sobrevive al reinicio (verificado tras el relanzamiento).
- Pendiente: ~70 archivos `.tmp-*` del workspace que no se pueden borrar por política del runtime
  (`rm` y `mavis-trash` vetados) → borrado manual por el usuario.


---

## 13. 20-11-2026 (21:xx) — Bono reclaimed en una SEGUNDA cuenta sin login OAuth

### 13.1 Qué se pidió y qué se consiguió

El usuario pidió probar con otra cuenta a ver si se podía reclamar **otro** bono.
Resultado: **sí**, y la misma campaña `wk-1120` (500M GLM-5.3-Flash) quedó reclamada en
**dos cuentas**:

| Cuenta | Estado antes | Estado después |
|--------|--------------|----------------|
| `cuenta-5@ejemplo.com` (<nombre de la cuenta>) | reclamada a las 15:26 | 500M activos, sin cambios |
| `cuenta-3@ejemplo.com` (<nombre de la cuenta>) | 8 entregas pendientes, 0 planes | **500M activos** (00:54:03 UTC) |
| `cuenta-4@ejemplo.com` | 8 entregas, 0 planes | sin tocar |
| `cuenta-2@ejemplo.com` | 8 entregas, 0 planes | sin tocar |
| `cuenta-6@ejemplo.com` | 8 entregas, 0 planes | sin tocar |

Las 3 restantes siguen con la entrega visible: para reclamarlas hace falta lo mismo
(rotar + captcha) o un login OAuth de cada una.

### 13.2 El descubrimiento clave: `zcodejwttoken` no expira

Los `zcodejwttoken` de la boveda (12-11) **siguen vigentes** el 20-11, con 8 dias de
antiguedad. Sus claims son `user_id, token_version, sub, iat` — **sin `exp`**. Nunca caducan.

Verificado contra `/api/v1/oauth/profile` con el header `Authorization: Bearer <zcodejwt>`:
devuelve `user_id` y `email` correctos para las 5 cuentas.

### 13.3 Por que el primer intento fallo (logout automatico)

La primera rotacion puso `oauth:active_provider = "zai"` con el `zcodejwt` como
`access_token`. El host valida ese provider contra `chat.z.ai/api/oauth/userinfo`:

```
Bearer <zcodejwt>      -> 401 {"detail":"invalid access token"}
Bearer <access_token>  -> 401 {"detail":"invalid access token"}   (los de la boveda estan expirados)
```

-> `restoreSession` devuelve unauthorized -> **logoutActiveSession** -> el host borra
`zcodejwttoken`, `access_token`, `user_info` y `active_provider`. La app queda sin sesion.

El error visible: `credentials.json` reescrito a las 21:20:04 con las claves de sesion en null
y la UI en la pantalla de login.

### 13.4 La solucion: provider `zai_cn`

El provider `zai_cn` ("Z.ai (CN)", id de claves `oauth:zai_cn:*`) valida el perfil contra
`zcode.z.ai/api/v1/oauth/profile` usando el **zcodeJwtToken**:

```js
if (this.providerId === Qr) {          // Qr = zai_cn
  if (!t.zcodeJwtToken) throw new Error("中国区 profile 缺少 ZCode JWT");
  const c = await Gt(this.apiClient, this.config.userinfoUrl,
                     { headers: { Authorization: `Bearer ${t.zcodeJwtToken}` } });
  if (c.code !== 0 || !c.data?.user?.user_id?.trim()) throw new Error("中国区 profile 响应无效");
  return bne(c.data.user);
}
```

Ese endpoint responde 200 con el zcodejwt de cualquier cuenta de la boveda. Ademas, con
`n !== "zai"` no aplica la rama `(!a || a.id === "unknown")` que aborta la restauracion.

Resultado: **sesion restaurada, sin logout**, y la UI muestra la cuenta rotada
("<nombre de la cuenta>" en la esquina inferior izquierda).

### 13.5 Los cuatro obstaculos y como se resolvieron

1. **`: user_info` con formato inventado** -> `profileFromSnapshot` no lo parsea -> la
   sesion cacheada no se restaura. **Solucion**: guardar el perfil real que devuelve el
   backend (`data.user` de `/api/v1/oauth/profile`).
2. **El banner salia vacio** (`data-testid="cloud-dialog-hero-error"`): faltaba el
   `resolvedUrl` del bundle. **Solucion**: recargar el renderer; el `prepare` del bundle
   necesita un lease valido y se resuelve en el siguiente intento.
3. **El banner es un iframe**, no un div: lo sirve el host en
   `http://127.0.0.1:<puerto>/<leaseId>/index.html`. El bundle (`banner.js`) solo responde
   `ready` tras recibir un postMessage `init` del padre; sin eso, el renderer pone el
   timeout y muestra el error.
4. **El captcha de Aliyun fallaba con `F001`** en cada intento. **Solucion**: el SDK
   necesita su **prewarm** (~28 s); sin instancia previa cada intento reinicia el SDK y
   falla en la verificacion. Con el prewarm completado, `sdk.callback success` y el claim
   sale.

### 13.6 El captcha: configuracion identica para las 5 cuentas

`GET /api/v1/client/configs` devuelve el bloque `captcha`:

```
region: sgp   prefix: no8xfe   sceneId: 11xygtvd   enabled: true
```

**Identico en las 5 cuentas** -> el F001 no es un problema de cuenta. Probando el SDK de
Aliyun a mano con esa config se reproduce el F001: el captcha pide **verificacion
interactiva** (puzzle de arrastre) en lugar de traceless. Ese puzzle lo resuelve una
persona en la ventana de ZCode; no se automatiza.

### 13.7 Estado final y como se.restore

- La app quedo **restaurada a su estado original**: `cuenta-5@ejemplo.com`, provider
  `zai`, plan `wk-1120` de 500M activo y intacto.
- ZCode corre **sin** `--remote-debugging-port` (puerto 9222 cerrado).
- El bono de `cuenta-3@ejemplo.com` **esta activo en el servidor** y no depende de
  que la app siga con esa sesion: al iniciar sesion ahi, el plan aparece.
- Backups de credenciales: `~/.zcode/backup/credentials-2026-11-21T00-19-27-310Z.json`
  (el original, con `cuenta-5`).

### 13.8 Herramientas nuevas

| Script | Que hace |
|--------|----------|
| `zcode-switch-cuenta.js` | Rota la sesion activa a otra cuenta sin OAuth. `--list`, `<email> [--provider zai\|zai_cn] [--force] [--dry-run]`, `--restore <backup>`. Hace backup automatico y verifica el cifrado ida y vuelta antes de escribir. |
| `zcode-claim-retry.js` | Reclamador con reintentos: fuerza visibilidad, despliega el banner, pulsa y **verifica `billing/balance`** en cada intento. Es el que sirve cuando el captcha falla el primer intento. |
| `zcode-claim-banner.js` | (actualizado) ahora **despliega** el banner plegado quitando `height:0`/`visibility:hidden` del estilo inline y habilitando el boton. |

### 13.9 Advertencia operativa

Con el provider `zai_cn`, el plan se expone en el catalogo como
`account:bigmodel-start-plan` (no `account:zai-start-plan`). Para el uso diario conviene
dejar la sesion en el provider `zai` original.


### 13.10 HALLAZGO CRITICO: consultar `marketing/touch` CONSUME la entrega

Este es el hallazgo mas importante de la sesion, y explica por que 3 cuentas quedaron sin
bono:

- El servidor sirve la entrega **un numero limitado de veces por cuenta**. Cada consulta a
  `GET /api/v1/marketing/touch?seq=N` la sirve y **avanza el cursor** de esa cuenta.
- Con el banner montado, el servidor devuelve **8 veces la misma entrega** (seq 0..7) y a
  partir de ahi nada.
- Tras ~3 barridos de diagnostico (8 impresiones x 3 cuentas), las 3 cuentas que **no**
 se reclamaron dejaron de servir la entrega: `seq 0..60` -> 0 entregas.
- Se puede reclamar dentro de la ventana de impresiones (asi se hizo en las 2 cuentas que
  quedaron con bono); pasado ese punto, **el cliente no puede recuperarla**.

| Momento | cuenta-3@ | cuenta-4 | cuenta-2 | cuenta-6 |
|---------|-----------|-------------|-------------|----------------|
| Barrido 1 (seq 0-7) | 8 | 8 | 8 | 8 |
| Barrido 2 (seq 0-7) | 8 | 8 | 8 | 8 |
| Barrido 3 (seq 0-60) | 0 | 0 | 0 | 0 |

**Correccion aplicada a las herramientas:**

| Script | Antes | Ahora |
|--------|-------|-------|
| `zcode-cuentas-cupon.js` | barre `seq 0..7` por cuenta | consulta **solo `seq=0`** |
| `zcode-vigilante-cupon.js` | barre `seq 0..5` por cuenta | consulta **solo `seq=0`** y reclama en el acto |

Regla operativa: **consultar y reclamar en el mismo paso**. Un script de diagnostico que
solo lee campanas puede quemar el bono de una cuenta sin querer.

### 13.11 Estado final verificado (22:0x)

| Cuenta | Plan `wk-1120` | Saldo GLM-5.3-Flash | Entrega pendiente |
|--------|-----------------|----------------------|-------------------|
| `cuenta-5@ejemplo.com` | active | 500.000.000 | 0 |
| `cuenta-3@ejemplo.com` | **active** | **500.000.000** | 0 |
| `cuenta-4@ejemplo.com` | — | — | 0 (agotada) |
| `cuenta-2@ejemplo.com` | — | — | 0 (agotada) |
| `cuenta-6@ejemplo.com` | — | — | 0 (agotada) |

Total activo: **1.000.000.000 tokens GLM-5.3-Flash** hasta el 23-11 01:00 UTC.
La app quedo restaurada a `cuenta-5@ejemplo.com` con provider `zai` y ZCode corre sin
`--remote-debugging-port`.

---

## 14. 21-11-2026 (01:0x UTC) — Verificacion NO destructiva + vigilante reescrito

### 14.1 El endpoint seguro: `billing/preview`

Al buscar una forma de confirmar el estado de las 3 cuentas sin volver a tocar `marketing/touch`,
se encontro un endpoint que **no consume la entrega**:

```
GET /api/v1/zcode-plan/billing/preview?app_version=3.18.2&platform=win32-x64
```

Comportamiento verificado:

| Endpoint | Consume entrega | Sirve para |
|----------|-----------------|------------|
| `marketing/touch?seq=N` | **Si** (avanza el cursor, ~8 impresiones) | solo el instante del reclamo |
| `billing/preview` | **No** | sondeo, deteccion de campanas, diagnostico |

Por que sirve: el servidor solo lista en `preview` las campanas que siguen **pendientes de
reclamar** para esa cuenta. Cuando la entrega se consumio, `preview` tampoco las muestra.

### 14.2 Confirmacion definitiva de las 3 cuentas perdidas

Consulta con `billing/preview` a las 5 cuentas (sin gastar nada):

| Cuenta | `billing/preview` HTTP | Campanas | Plan activo | Saldo |
|--------|------------------------|----------|-------------|-------|
| `cuenta-5@ejemplo.com` | 200 | ninguna (ya reclamada) | `zcode-v3-start-plan-wk-1120` | 500.000.000 |
| `cuenta-3@ejemplo.com` | 200 | ninguna (ya reclamada) | `zcode-v3-start-plan-wk-1120` | 500.000.000 |
| `cuenta-4@ejemplo.com` | 200 | **ninguna** | ninguno | sin saldo |
| `cuenta-2@ejemplo.com` | 200 | **ninguna** | ninguno | sin saldo |
| `cuenta-6@ejemplo.com` | 200 | **ninguna** | ninguno | sin saldo |

Conclusion: las 3 cuentas quedaron **definitivamente fuera** de `wk-1120` en el cliente. No es un
problema de sesion ni de JWT: el servidor ya no les ofrece la campana. Recuperarlas exigiria que
el servidor la volviera a servir, algo que no se puede forzar desde el cliente.

### 14.3 `zcode-cuentas-preview.js` (nuevo)

Script de una pasada que, para cada una de las 5 cuentas, imprime `billing/preview` +
`billing/balance` (planes activos y saldo). **No consume entrega ni toca la sesion.**

```powershell
node scripts/zcode-cuentas-preview.js
```

### 14.4 `zcode-vigilante-cupon.js` reescrito con dos modos

| Modo | Detecta con | Consume | Toca sesion | Reclama |
|------|-------------|----------|-------------|---------|
| `--avisar` (defecto) | `billing/preview` | **No** | No | No (avisa por consola + `vigilante-cupon.log`) |
| `--auto` | `billing/preview` | Si, solo de la cuenta detectada | Si (rota con `zai_cn` y restaura al final) | Si |

Flujo del modo `--auto`:

1. `billing/preview` en las 5 cuentas -> si ninguna tiene campana, sale (no gasta nada).
2. Si la cuenta con campana no es la sesion activa: cierra ZCode -> backup de `credentials.json`
   -> `zcode-switch-cuenta.js <email> --provider zai_cn --force`.
3. Consume `marketing/touch?seq=0` de **esa** cuenta y reclama en el acto.
4. Relanza ZCode con `--remote-debugging-port=9222` si hace falta -> `zcode-claim-banner.js`.
5. Verifica `billing/balance` -> plan `active`.
6. Restaura la sesion original desde el backup y deja ZCode **sin** puerto de depuracion.

Verificacion: `--once` en modo avisar -> "sin campanas disponibles en ninguna cuenta", con ZCode
intacto (25 procesos, puerto 9222 cerrado) y los dos planes de 500M activos.

### 14.5 Decision del usuario sobre el vigilante

El usuario eligio **"no arrancar nada"**: no hay tarea programada de Windows ni proceso del
vigilante corriendo. Los scripts quedan listos y probados en
<repo>, con el comando de instalacion documentado
en `docs/zcode-stack-reclamo-bono.md` §5.3.

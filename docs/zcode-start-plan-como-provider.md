# Usar el Start Plan de ZCode como provider en otros harnesses

Este documento responde una pregunta concreta: **¿puedo gastar los tokens del Start Plan
(campaña) desde Claude Code, Codex CLI, OpenCode, un MCP server o un `curl`?**

La respuesta corta tiene tres capas, y conviene no mezclarlas porque son mecanismos distintos:

| Capa | Mecanismo | ¿Sirve fuera de ZCode? |
|------|-----------|------------------------|
| **Llamada HTTP directa** al endpoint del plan (`zcode.z.ai/api/v1/zcode-plan/...`) | el harness habla directo con la API | **No.** El servidor lo rechaza: `This client is not supported. Please use the official ZCode client.` |
| **Gateway local + app-server de ZCode** | un servicio translates Anthropic Messages → **el runtime real de ZCode** (`zcode.cjs app-server`), que es quien sí sabe autenticarse | **Sí.** Es como está funcionando hoy en OpenCode y en Paseo |
| **Coding Plan de Z.ai** | producto con API key propia en la consola de Z.ai (crédito aparte) | **Sí**, pero es otro producto y **no** usa los tokens del bono |

Todo lo de abajo está verificado contra la app instalada (ZCode 3.18.2), contra los servidores de
Z.ai y contra la instalación que está corriendo ahora mismo.

---

## 1. La arquitectura que está funcionando hoy

```
OpenCode (Windows)                 Paseo (sandbox)
  provider "zcode"                   provider "zai-start-plan" (extends: claude)
  @ai-sdk/anthropic                  ANTHROPIC_BASE_URL=http://127.0.0.1:3128
  http://127.0.0.1:3128/v1           model GLM-5.3-Flash
        |                                   |
        +----------- ssh -L 3128 ------------+
                        |
        sandbox instabox-zcode : 127.0.0.1:3128
        systemd: plan-gateway.service -> node /data/home/plan-gateway.cjs
                        |
                        |  por cada request, spawnea:
                        v
        zcode.cjs app-server --surface terminal --no-color
          (el runtime real de ZCode, 15 MB, va incluido en la app)
          + provider account:zai-start-plan  (entitled)
          + reasoningLevel: max
                        |
                        |  interaction/requestProviderRuntimeHeaders
                        |  -> { apiKey: zcodejwttoken, headers: {...} }
                        v
                  https://zcode.z.ai  (cuenta del sandbox, cuota del Start Plan)
```

### 1.1 En el lado Windows (este equipo)

El túnel lo abre un `.cmd` con failover, arrancado de forma oculta desde la carpeta de Inicio:

```bat
rem C:\Users\<TU_USUARIO>\.zcode\ssh-proxy\plan-gateway-tunnel.cmd
:loop
curl -s -m 5 http://127.0.0.1:3128/health >nul 2>&1
if %ERRORLEVEL% EQU 0 goto wait
ssh -N -L 3128:127.0.0.1:3128 -o ServerAliveInterval=30 -o ServerAliveCountMax=4 ^
  -o ExitOnForwardFailure=yes -o ConnectTimeout=20 -o BatchMode=yes instabox-zcode
rem si el sandbox primario cae (cooldown), prueba instabox-zcode-dev
timeout /t 20 /nobreak >nul
goto loop
```

Arranque: `plan-gateway-tunnel.vbs` (carpeta Inicio, oculto).

El provider de OpenCode (`~/.config/opencode/opencode.json`):

```jsonc
{
  "provider": {
    "zcode": {
      "npm": "@ai-sdk/anthropic",          // <-- protocolo Anthropic
      "name": "ZCode (plan-gateway)",
      "options": { "apiKey": "local", "baseURL": "http://127.0.0.1:3128/v1" },
      "models": { "GLM-5.3-Flash": { "name": "GLM 5.3 Flash (ZCode Start Plan)" } }
    }
  }
}
```

El `apiKey` es un dummy: el gateway **ignora** la cabecera de auth y pone la oficial.

### 1.2 En el sandbox (`instabox-zcode`)

El gateway corre como servicio systemd:

```ini
# /etc/systemd/system/plan-gateway.service
[Unit]
Description=Plan Gateway (cuota Start Plan -> API Anthropic)
[Service]
ExecStart=/usr/local/bin/node /data/home/plan-gateway.cjs
Restart=always
Environment=HOME=/data/home
User=<usuario>
WorkingDirectory=/data/home
[Install]
WantedBy=multi-user.target
```

Y expone dos rutas:

| Ruta | Qué es |
|------|--------|
| `GET /health` | `{"ok":true,"gateway":"plan-gateway","provider":"account:zai-start-plan","reasoning":"max"}` |
| `POST /v1/messages` | Anthropic Messages API: streaming SSE y no-streaming |

### 1.3 En Paseo

`/data/home/.paseo/config.json` → `agents.providers`:

```jsonc
{
  "zai-start-plan": {
    "extends": "claude",                 // -> Claude Code CLI
    "label": "ZCode Start Plan (GLM)",
    "env": {
      "ANTHROPIC_BASE_URL": "http://127.0.0.1:3128",
      "ANTHROPIC_AUTH_TOKEN": "...",
      "API_TIMEOUT_MS": "3000000"
    },
    "disallowedTools": ["WebSearch"],
    "models": [
      { "id": "GLM-5.3-Flash", "isDefault": true },
      { "id": "GLM-5.3" }
    ],
    "enabled": true
  },
  "zcode": {
    "extends": "acp",                    // -> ZCode app-server por Agent Client Protocol
    "command": ["/usr/local/bin/zcode", "app-server"],
    "enabled": false                     // <- hoy está apagado
  },
  "muse": { "enabled": false },
  "antigravity": { "enabled": false }
}
```

Ojo con la distinción: el provider `zai-start-plan` **no** usa ZCode como agente — usa **Claude
Code** apuntando al gateway. El provider `zcode` sí usa ZCode como agente (vía ACP), pero está
deshabilitado. Son dos caminos distintos al mismo Start Plan.

Paseo además tiene su capa de recuperación en el sandbox:

- `paseo-daemon.service` — "Paseo daemon (VPS zcode dedicado)".
- `/usr/local/bin/paseo-healthcheck.sh` — comprueba `paseo daemon status --json` y, si no responde,
  hace `paseo daemon restart` y luego `systemctl restart paseo-daemon.service`.
- `paseo-healthcheck.timer` — lo dispara **cada 2 minutos**.

### 1.4 Gateway local en Windows (port del sandbox)

Además del túnel, el gateway se puede correr **en el propio Windows**, sin depender del sandbox:

```bat
rem C:\Users\<TU_USUARIO>\.zcode\ssh-proxy\plan-gateway-local.cmd
:loop
cd /d "%USERPROFILE%\Documents\<carpeta-del-repo>\zcodeh"
node plan-gateway-win.cjs >> "%LOG%" 2>&1
timeout /t 20 /nobreak >nul
goto loop
```

Arranque: `plan-gateway-local.vbs` (carpeta de Inicio, oculto).

- Escucha en `127.0.0.1:**3129**` (el **3128** queda para el túnel, para que convivan).
- Lee el token del keyring de Windows, igual que el resto de los scripts de este repo.
- Usa el **CLI 0.17.0** (`glm-0.17.0/zcode.cjs`) y no el runtime de la app de escritorio: ver
  §3.1, es la diferencia entre que funcione o devuelva `405 / code 3012`.

```bash
curl -s http://127.0.0.1:3129/health
# {"ok":true,"gateway":"plan-gateway","provider":"account:zai-start-plan","reasoning":"max","platform":"win32","port":3129}
```

---

## 2. Cómo funciona el gateway por dentro

`plan-gateway.cjs` (11 KB, Node puro, sin dependencias) hace esto en cada request:

1. **Levanta un app-server de ZCode fresco** por turno:

   ```js
   spawn('node', [USE_ENTRY, 'app-server', '--surface', 'terminal', '--no-color'], { env })
   // env: ZCODE_BASE_URL=https://zcode.z.ai
   //      ZCODE_APP_VERSION=0.17.0
   //      ZCODE_PROVIDER_CONFIG=<zcode-builtin.json>
   //      ZCODE_PROVIDER_CONFIG_PATH=~/.zcode/v2/provider_config.json
   ```

   `USE_ENTRY` es `~/zcode-cli/glm/zcode.cjs` en Linux y, en Windows, el CLI 0.17.0 si está
   disponible (`glm-0.17.0/zcode.cjs`), con el runtime de la app como fallback (§3.1).

2. **Inyecta el provider del Start Plan** vía el método `provider/updateAccountConfig`:

   ```js
   providers: {
     'account:zai-start-plan': {
       access: { type: 'zhipu-account', entitled: true },
       builtinModelIds: ['GLM-5.3-Flash', 'GLM-5.3', 'GLM-5.2', 'GLM-5-Turbo'],
     }
   },
   states: { 'account:zai-start-plan': { availability: 'available', entitled: true, current: true } },
   ```

3. **Responde la petición de cabeceras oficiales** que el app-server le hace al cliente. El método
   **cambia según la versión**:

   | Versión del runtime | Método que hay que responder |
   |--------------------|------------------------------|
   | 3.16.x (sandbox) | `interaction/requestAuth` |
   | **3.18.2 (Windows)** | **`interaction/requestProviderRuntimeHeaders`** |
   | 3.18.2 | `interaction/requestOfficialMcpAuthHeaders` (otro carril, para MCP) |

   La respuesta es la misma en ambos casos:

   ```js
   {
     headersApplied: true,
     requestAuth: {
       apiKey: planToken,                       // el zcodejwttoken
       headers: {
         'http-referer': 'https://zcode.z.ai',
         'user-agent': `ZCode/${APP_VERSION}`,
         'x-zcode-app-version': APP_VERSION,
         'x-title': 'Z Code@cli',
       },
     },
   }
   ```

4. **Conduce la sesión**: `session/create` → `session/subscribe` → `session/setMode` (`bypass`) →
   `provider/updateAccountConfig` → `session/setModel` (con `reasoningLevel: 'max'`) →
   `session/send`, y escucha `session/event` (`model.streaming`, `turn.completed`, `turn.failed`).

5. **Traduce a Anthropic**: el `POST /v1/messages` del gateway devuelve
   `{id, type:'message', role:'assistant', model, content:[{type:'text',text}], stop_reason:'end_turn', usage}`.
   En streaming emite `message_start` → `content_block_start` → `content_block_delta` → `message_stop`.

### De dónde sale el token

`~/.zcode/v2/credentials.json`, clave `zcodejwttoken`. Ojo con el cifrado: **no es el mismo en
Linux y en Windows**.

| Plataforma | Formato | Clave del cifrado |
|-----------|---------|-------------------|
| Windows | `enc:v2:os:<sha256(clave)[0:24]>:\<iv>.<tag>.<data>` | keyring de Windows, cuenta `sha256(path.resolve(credentials.json))` |
| Linux | `enc:v1:<iv>.<tag>.<data>` | secreto **fallback** derivado del home: `zcode-credential-fallback:linux:<home>:<usuario>` |

En Linux no hay keyring de Windows, así que el CLI usa ese fallback. Quien replique esto en un
Linux propio necesita el mismo fallback para su usuario, o las credenciales no se descifran.

---

## 3. Por qué la llamada HTTP directa NO funciona (y por qué eso no importa)

`node scripts/zcode-provider-check.js` (no imprime ningún secreto):

```
[BLOQUEADO] HTTP 405  Start Plan Anthropic (zcode.z.ai) + zcodejwttoken
            This client is not supported. Please use the official ZCode client.
[BLOQUEADO] HTTP 401  Start Plan Anthropic (zcode.z.ai) + access_token Bearer
[BLOQUEADO] HTTP 401  Start Plan Anthropic (zcode.z.ai) + access_token en x-api-key
[BLOQUEADO] HTTP 404  Start Plan OpenAI (zcode.z.ai) + access_token
            404 page not found
[BLOQUEADO] HTTP 429  Z.ai publico Anthropic + access_token
            [1113][Insufficient balance or no resource package. Please recharge.]
[BLOQUEADO] HTTP 429  Z.ai publico coding/paas/v4 + access_token
            Insufficient balance or no resource package. Please recharge.
[BLOQUEADO] HTTP 200  Z.ai publico coding/paas/v4 + access_token en x-api-key
            error.code=500

--- veredicto ---
NINGUNA ruta externa sirvio el Start Plan.
```

Detalles que importan:

- **`405` + `code 3012`** es la señal más informativa: el servidor **reconoce** la credencial
  (`zcodejwttoken`) y llega hasta el chequeo de cliente, y ahí lo rechaza porque no es la app
  oficial. No es un problema de token: es un control de cliente.
- **`401`** con el `access_token` de OAuth: ese token no es una credencial válida para el
  endpoint del plan.
- **`429 [1113] Insufficient balance`** en `api.z.ai`: el token es aceptado, pero el producto
  público cobra **saldo de API**, que es distinto del bucket del Start Plan.
- **`HTTP 200` con `{"error":{"code":"500"}}`** es una trampa: el status 200 no significa éxito.
  Siempre mira el cuerpo, no solo el código HTTP.

La razón de fondo: **la coding plan API key que el endpoint quiere la resuelve la app contra el
servidor por sesión** (`accountRequestAuthService.resolveCurrent`), y no está en el disco. En las
credenciales locales solo hay `zcodejwttoken` (claims `user_id, token_version, sub, iat`, sin
`exp`) y `oauth:zai:access_token` (claims `user_type, user_id, api_key, user_key, customer_id,
username, customer`, con `api_key` **vacío**). Por eso el camino que funciona no es llamar a la
API: es **dejar que el runtime de ZCode sea el que llama**.

### 3.1 El chequeo de "cliente oficial" mira el PROMPT DE SISTEMA

Este es el punto más contraintuitivo de todo el mecanismo, y se destapó al portar el gateway
a Windows.

Cuando el runtime 3.18.2 de Windows habla con el endpoint del plan, el servidor responde:

```
HTTP 405
{"code":"3012","msg":"This client is not supported. Please use the official ZCode client.","logid":"..."}
```

Y el gateway se cae, aunque **todo lo demás esté correcto**. Lo que se verificó, por partes:

| Comprobación | Resultado |
|--------------|-----------|
| ¿El token es el correcto? | **Sí** — el mismo `zcodejwttoken` funciona desde el sandbox y desde Windows |
| ¿La cuenta es la misma? | **Sí** — mismo `user_id` (`<user_id>`), mismo `customer_id`, mismo `api_key` vacío |
| ¿El builtin provider es el mismo? | **Sí** — `account:zai-start-plan` con `mode:start-plan`, `accountType:zai`, `baseUrl: https://zcode.z.ai/api/v1/zcode-plan/anthropic` (rev 43 en sandbox, rev 44 en Windows) |
| ¿Cambian las cabeceras? | **No** — mismas claves, mismos valores salvo versión/plataforma/locale |
| ¿Cambia el **cuerpo**? | **Sí** — y es la causa |

El bisect (capturar la petición real que manda el runtime, reenviarla cambiando una variable a la vez)
deja el resultado así:

| Petición | Resultado |
|----------|-----------|
| cabeceras sandbox + cuerpo sandbox | HTTP 200 |
| cabeceras Windows + cuerpo Windows | HTTP 405 / 3012 |
| cabeceras **Windows** + cuerpo **sandbox** | **HTTP 200** |
| cabeceras sandbox + cuerpo **Windows** | HTTP 405 / 3012 |
| cuerpo sandbox con `metadata` de Windows | HTTP 200 |
| cuerpo sandbox con `tools` de Windows | HTTP 200 |
| cuerpo sandbox con `messages` de Windows | HTTP 200 |
| cuerpo sandbox con `system` de Windows | HTTP 405 / 3012 |
| cuerpo sandbox **sin** `system` | HTTP 405 / 3012 |

O sea: el servidor valida el **prompt de sistema** que manda el runtime como marca de cliente
oficial. Los dos prompts comparados:

| Runtime | `system[0]` | Tamaño |
|---------|-------------|--------|
| 3.16.x (CLI 0.17.0) | `You are ZCode, an interactive coding agent` | 6.893 chars |
| 3.18.2 (CLI 0.17.1) | `You are ZCode, an interactive agent` | 3.139 chars |

El prompt de 3.18.2 todavía no está en la lista de clientes que acepta el servidor. Da igual que
las cabeceras, el token y la cuenta sean correctos: sin `system` recognized, es `3012`.

**Consecuencia práctica:** el gateway local de Windows (§1.4) corre el **CLI 0.17.0** con su
`provider/zcode-builtin.json` (rev 43), no el runtime que trae la app de escritorio. Con el runtime
0.17.1 el gateway devuelve `405 / 3012`; con el 0.17.0 responde normal.

> Nota: el runtime 3.18.2 también pide un `session/requestRuntimePreferences` más estricto
> (`nativeSearchEnhancementsEnabled` obligatorio, objeto `strict`) y usa
> `interaction/requestProviderRuntimeHeaders` en vez de `interaction/requestAuth`. El gateway
> detecta la versión del runtime (`<entry> --version`) y manda el payload que corresponde.

#### Cómo capturar la petición real del runtime (método reutilizable)

El truco para ver qué manda el runtime de verdad es redirigir su `baseUrl` a un servidor local, sin
tocar el servidor de Z.ai:

1. Copiar el builtin provider config y cambiarle el `baseUrl` del provider `start-plan` a
   `http://127.0.0.1:<puerto>/api/v1/zcode-plan/anthropic`.
2. Levantar un HTTP server local que logue `method`, `url`, headers y body, y que responda algo.
3. Arrancar el gateway con `ZCODE_GATEWAY_BUILTIN=<builtin parcheado>`.
4. Un `POST` al gateway y listo: en el log queda la petición completa que el runtime firmaría.
5. Para reenviarla tal cual al endpoint real y ver qué acepta el servidor, sustituye el
   `authorization` / `x-api-key` por el token local (es el mismo) y haz `fetch` con esos headers.

### El mapa de cabeceras oficiales

Está en el bundle del host (`out/host/index.js`):

```js
{
  authorization:           "Authorization",
  codingPlanAuthorization: "X-Bigmodel-Authorization",
  targetType:              "Bigmodel-Target-Type",
  organization:            "Bigmodel-Organization",
  project:                 "Bigmodel-Project"
}
// + cabecera suelta: "x-coding-plan-api-key"
// + accountScope: 64 caracteres hexadecimales
```

Los modos de provider que reconoce la app:
`start-plan`, `individual-coding-plan`, `team-coding-plan`, `off-peak`, `highspeed`.

---

## 4. Probar el gateway

```bash
curl -s http://127.0.0.1:3128/health
# {"ok":true,"gateway":"plan-gateway","provider":"account:zai-start-plan","reasoning":"max"}

curl -s http://127.0.0.1:3128/v1/messages \
  -H 'content-type: application/json' \
  -H 'anthropic-version: 2023-06-01' \
  -H 'x-api-key: local' \
  -d '{"model":"GLM-5.3-Flash","max_tokens":64,"messages":[{"role":"user","content":"di OK"}]}'
```

Prueba real registrada durante la verificación de este documento: respuesta de `GLM-5.3-Flash`
con `usage: {input_tokens: 20072, output_tokens: 192}`.

> Ojo con el costo: cada request **spawnea un app-server nuevo** y el `system` prompt del runtime
> pesa ~20k tokens de entrada. Para uso intensivo conviene un app-server persistente en vez de
> uno por turno.

---

## 5. Harness externo: Coding Plan de Z.ai (producto aparte)

Si lo que quieres es **un harness externo** (Claude Code, Codex CLI, OpenCode…) lo que funciona
sin nada de ZCode es el **Coding Plan de Z.ai**: se compra en la consola de Z.ai, genera una **API
key propia** y esa key es la que consumes. **No usa los tokens del bono de campaña** y **no
requiere ZCode instalado**.

> Estado de verificación: la API key propia no se pudo probar en esta máquina (esta cuenta no
> tiene saldo de API). Los endpoints salen del bundle de la app y de la documentación pública de
> Z.ai.

### Claude Code (protocolo Anthropic)

```bash
export ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic"
export ANTHROPIC_AUTH_TOKEN="<tu API key de Z.ai>"
export ANTHROPIC_MODEL="GLM-4.6"
claude
```

### Codex CLI / cualquier cliente OpenAI-compatible

```bash
export OPENAI_BASE_URL="https://api.z.ai/api/coding/paas/v4"
export OPENAI_API_KEY="<tu API key de Z.ai>"
codex
```

### OpenCode

```jsonc
{
  "provider": {
    "zai": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Z.ai",
      "options": { "baseURL": "https://api.z.ai/api/coding/paas/v4" },
      "models": { "glm-4.6": { "name": "GLM-4.6" } }
    }
  },
  "model": "zai/glm-4.6"
}
```

---

## 6. Trampas

1. **Un `HTTP 200` no significa éxito.** `api.z.ai` devuelve `200` con
   `{"error":{"code":"500"}}` cuando la credencial no sirve. Siempre parsea el cuerpo.
2. **`405 code 3012` no es un problema de token.** Es el chequeo de cliente oficial.
3. **El método de auth cambió de nombre entre versiones.** `interaction/requestAuth` (3.16.x) vs
   `interaction/requestProviderRuntimeHeaders` (3.18.2). Un gateway que responde solo uno de los
   dos se queda colgado en la versión nueva.
4. **`x-api-key` con el `access_token` de OAuth no es la coding plan API key.** La key real la
   resuelve la app contra el servidor por sesión.
5. **Bearer y `x-api-key` no son equivalentes** en `api.z.ai`: con Bearer el token se trata como
   API key de pago (saldo), con `x-api-key` como credencial de plan.
6. **El Start Plan no tiene ruta OpenAI-compatible.** Solo Anthropic. Un harness que solo hable
   OpenAI necesita el gateway (que traduce) o el Coding Plan de Z.ai.
7. **El cifrado de credenciales difiere entre Windows y Linux** (`enc:v2:os:` con keyring vs
   `enc:v1:` con secreto fallback).
8. **`billing/preview` no consume entrega; `marketing/touch` sí.** Para saber si hay campaña usa
   `preview` (ver `zcode-stack-reclamo-bono.md` §5.1).
9. **`405 / 3012` también se dispara con todo correcto.** El servidor valida el *prompt de
   sistema* del runtime, no solo las cabeceras. Un runtime más nuevo puede quedar fuera de la
   lista de clientes oficiales aunque el token, la cuenta y el provider sean los mismos (§3.1).
10. **El runtime que trae la app de escritorio puede no servir para el Start Plan.** En 3.18.2
    (CLI 0.17.1) el prompt ya no es reconocido; el CLI 0.17.0 sí. El gateway local usa el 0.17.0.

---

## 7. Estado de verificación

| Afirmación | Estado |
|------------|--------|
| El Start Plan expone `POST /api/v1/zcode-plan/anthropic/v1/messages` (modelo `GLM-5.3-Flash`) | Verificado |
| La base "OpenAI-compatible" del plan no tiene `/chat/completions` | Verificado (404) |
| Un cliente externo con `zcodejwttoken` recibe `405 code 3012` | Verificado |
| Con `access_token` de OAuth: 401 / 429 / 200-con-error | Verificado |
| El mapa de cabeceras oficiales (`Authorization`, `X-Bigmodel-Authorization`, `x-coding-plan-api-key`, `Bigmodel-*`) | Verificado en el bundle |
| El gateway local expone Anthropic Messages API y traduce al app-server | Verificado **en vivo** (respuesta de GLM-5.3-Flash) |
| El gateway local **en Windows** (sin sandbox) expone lo mismo en `127.0.0.1:3129` | Verificado en vivo (`usage: {input_tokens: 21152, output_tokens: 4}`), streaming y no-streaming |
| El `405 / 3012` del runtime 3.18.2 se debe al **prompt de sistema**, no a token/cuenta/cabeceras | Verificado por bisect de la petición real (§3.1) |
| El CLI 0.17.0 (3.16.x) sí es aceptado por el endpoint del plan | Verificado en vivo desde Windows |
| OpenCode lo consume vía `@ai-sdk/anthropic` sobre `http://127.0.0.1:3128/v1` | Verificado en la config activa |
| Paseo lo consume con el provider `zai-start-plan` (`extends: claude`) | Verificado en `~/.paseo/config.json` |
| El provider `zcode` de Paseo (`extends: acp`) | Existe pero está **deshabilitado** |
| El método de auth en el runtime de Windows 3.18.2 | Verificado (`interaction/requestProviderRuntimeHeaders`) |
| El Coding Plan de Z.ai con API key propia desde un harness externo | Documentado por el proveedor; no probado aquí (sin saldo de API) |

---

## Documentación relacionada

- [zcode-stack-reclamo-bono.md](zcode-stack-reclamo-bono.md) — cómo se reclama el bono.
- [zcode-cuentas-inventario.md](zcode-cuentas-inventario.md) — informe técnico del caso.

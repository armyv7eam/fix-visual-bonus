# Usar el Start Plan de ZCode como provider en otros harnesses

Este documento responde una pregunta concreta: **¿puedo gastar los tokens del Start Plan
(campaña) desde Claude Code, Codex CLI, OpenCode, un MCP server o un `curl`?**

La respuesta corta tiene tres partes, y conviene no mezclarlas porque son productos distintos
con el nombre parecido:

| Capa | Qué es | ¿Sirve fuera de ZCode? |
|------|--------|------------------------|
| **Start Plan de campaña** | El bono que se reclama en el banner (p. ej. `zcode-v3-start-plan-wk-1120`, 500.000.000 tokens de `GLM-5.3-Flash`) | **No.** El servidor lo rechaza: `This client is not supported. Please use the official ZCode client.` |
| **Carril "official auth"** | Los MCP servers y plugins que **corren dentro de ZCode** piden al host las cabeceras oficiales y hablan con el modelo usando la cuenta del usuario | **Sí, pero solo desde dentro de ZCode** |
| **Coding Plan de Z.ai** | Producto con API key propia en la consola de Z.ai (crédito aparte) | **Sí.** Es la vía normal para un harness externo |

Todo lo de abajo está verificado contra la app instalada (ZCode 3.18.2) y contra los servidores de
Z.ai. Los comandos son reproducibles con `scripts/zcode-provider-check.js`.

---

## 1. Anatomía de la llamada

Definida en el bundle del renderer (`out/renderer/assets/validation-*.js`):

```js
zcodePlanOpenAiBaseUrl:    `${origin}/api/v1/zcode-plan`
zcodePlanAnthropicBaseUrl: `${origin}/api/v1/zcode-plan/anthropic`
zcodePlanBillingCurrentUrl: `${origin}/api/v1/zcode-plan/billing/current`
zcodePlanBillingBalanceUrl: `${origin}/api/v1/zcode-plan/billing/balance`
```

Con `origin = https://zcode.z.ai`. La ruta final del protocolo Anthropic es
`POST /api/v1/zcode-plan/anthropic/v1/messages`.

El host clasifica el tipo de provider por la ruta de la base URL
(`resolvePresetProviderKindFromRuntimeBaseUrl`):

- ruta con `/coding/paas/v4` → `openai-compatible`
- ruta con `/api/anthropic` o `/zcode-plan/anthropic` → `anthropic`

**El Start Plan solo tiene ruta Anthropic.** La base "OpenAI-compatible" no expone
`/chat/completions` (responde `404 page not found`).

### Modelos

Del endpoint `GET /api/v1/client/configs?app_version=3.18.2&platform=win32-x64`:
`GLM-5.3-Flash`, `GLM-5.3`, `GLM-5-Turbo`, `GLM-5.2`. El que consume el Start Plan es
**`GLM-5.3-Flash`** (es el `show_name` del bucket en `billing/balance`).

### Cabeceras del cliente oficial

Mapa literal en el host (`out/host/index.js`):

```js
{
  authorization:            "Authorization",
  codingPlanAuthorization:  "X-Bigmodel-Authorization",
  targetType:               "Bigmodel-Target-Type",
  organization:             "Bigmodel-Organization",
  project:                  "Bigmodel-Project"
}
// + cabecera suelta: "x-coding-plan-api-key"
// + x-api-key (opcional, segun el provider)
// + accountScope: 64 caracteres hexadecimales
```

Los modos de provider que reconoce la app:
`start-plan`, `individual-coding-plan`, `team-coding-plan`, `off-peak`, `highspeed`.

---

## 2. La matriz verificada

`node scripts/zcode-provider-check.js` (no imprime ningún secreto; solo códigos del servidor):

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
  público cobra **saldo de API**, que es distinto del bucket del Start Plan. Esta cuenta no tiene
  saldo de API.
- **`HTTP 200` con `{"error":{"code":"500"}}`** es una trampa: el status 200 no significa éxito.
  Siempre mira el cuerpo, no solo el código HTTP.

### De dónde sale la credencial que sí funciona

La app resuelve internamente una **coding plan API key** por cuenta. En el código:

- `resolveCodingPlanApiKeyError` → errores `zai_coding_plan_api_key_required` /
  `bigmodel_coding_plan_api_key_required`.
- `accountRequestAuthService.resolveCurrent(...)` → devuelve `{ apiKey, apiKeyId, accountScope }`.
- Esa key **no está en `credentials.json`**: se pide al servidor por sesión. En las credenciales
  locales solo hay `zcodejwttoken` (claims: `user_id, token_version, sub, iat`, sin `exp`) y
  `oauth:zai:access_token` (claims: `user_type, user_id, api_key, user_key, customer_id,
  username, customer`, con `api_key` **vacío**).

Por eso **no hay forma de copiar la credencial a un cliente externo**: no está en el disco.

---

## 3. La vía que sí funciona: "official auth" para MCP dentro de ZCode

Acá está el camino real para un harness: que corra **dentro de ZCode** como MCP server o plugin.
El host de ZCode le resuelve las cabeceras oficiales y el MCP server llama al modelo con la
cuenta del usuario (plan incluido).

### Contrato del canal `official-mcp`

Petición (enviada por el MCP server al host de ZCode):

```ts
type OfficialMcpAuthRequest = {
  requestId: string;
  workspace: Workspace;          // workspace del usuario
  pluginId: string;              // id del plugin/mcp
  consumer: 'mcp-server' | 'plugin-command';
  mcpKey?: string;               // OBLIGATORIO si consumer === 'mcp-server'
  targetOrigin: string;          // https://... origen del MCP server
};
```

Respuesta:

```ts
type OfficialMcpAuthResponse =
  | { ok: true;  headers: Record<string, string> }   // cabeceras oficiales
  | { ok: false; reason:
        | 'official_auth_unavailable'      // el host no tiene resolver de cabeceras
        | 'official_auth_plan_required'     // la cuenta no tiene plan de codificacion
        | 'official_mcp_origin_untrusted' };// el targetOrigin no es de confianza
```

Reglas que aplica el host:

1. Valida `targetOrigin` contra los orígenes de confianza. En desarrollo se aceotan por la variable
   de entorno `ZCODE_OFFICIAL_MCP_DEV_TRUSTED_ORIGINS`.
   Si no valida → `official_mcp_origin_untrusted`.
2. Si no hay resolver de cabeceras → `official_auth_unavailable`.
3. Si la cuenta no tiene plan de codificación → `official_auth_plan_required`.
4. Devuelve el mapa de cabeceras (`Authorization`, `X-Bigmodel-Authorization`,
   `x-coding-plan-api-key`, `Bigmodel-Target-Type`, …) y opcionalmente un `accountScope` de 64 hex.

### Esqueleto de un MCP server que usa el plan

```ts
// 1) pedir las cabeceras oficiales al host de ZCode
const res = await host.request('official-mcp', {
  requestId: crypto.randomUUID(),
  workspace,
  pluginId: 'mi-plugin',
  consumer: 'mcp-server',
  mcpKey: '<clave del mcp server>',
  targetOrigin: 'https://mi-plugin.local',
});

if (!res.ok) throw new Error(`official auth no disponible: ${res.reason}`);

// 2) llamar al modelo con esas cabeceras
const r = await fetch('https://zcode.z.ai/api/v1/zcode-plan/anthropic/v1/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...res.headers,
  },
  body: JSON.stringify({
    model: 'GLM-5.3-Flash',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'hola' }],
  }),
});
```

> Estado: el contrato está verificado leyendo el bundle (`out/host/index.js`,
> `out/host/chunk-*.js`, `out/main/chunk-*.js`). **La llamada en vivo desde un MCP server real
> dentro de ZCode queda pendiente de validar en runtime**: si te sirve, es el siguiente paso
> natural y se puede montar en 10 minutos con un MCP server de prueba.

---

## 4. Harness externo: Coding Plan de Z.ai (producto aparte)

Si lo que quieres es **un harness externo** (Claude Code, Codex CLI, OpenCode…), lo que funciona
es el **Coding Plan de Z.ai**: se compra en la consola de Z.ai, genera una **API key propia** y
esa key es la que consumes. **No usa los tokens del bono de campaña** y **no requiere ZCode
instalado**.

> Estado de verificación: la API key propia no se pudo probar en esta máquina (esta cuenta no
> tiene saldo de API). Los endpoints y el formato de llamada de esta sección salen del bundle de
> la app y de la documentación pública de Z.ai, y coinciden con lo que la propia app usa para el
> preset `bigmodelIndividualCodingPlan`.

### Claude Code (protocolo Anthropic)

```bash
export ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic"
export ANTHROPIC_AUTH_TOKEN="<tu API key de Z.ai>"
export ANTHROPIC_MODEL="GLM-4.6"      # o el modelo que tengas contratado
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
  "$schema": "https://opencode.ai/config.json",
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

### curl de humo

```bash
curl -s https://api.z.ai/api/coding/paas/v4/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-4.6","messages":[{"role":"user","content":"di OK"}],"max_tokens":16}'
```

### OpenCode como cliente del Start Plan dentro de ZCode

La app ya trae OpenCode embebido y sabe resolver el Start Plan como provider
(`resolveOpenCodeProviderDefaultKind`). Si quieres el mismo motor fuera de la app, la forma
soportada es la del punto 3: el MCP server pide la official auth al host.

---

## 5. Cómo revisar el estado desde tu máquina

```powershell
node scripts/zcode-provider-check.js      # matriz endpoint x credencial (sin imprimir secretos)
node scripts/zcode-start-plan-status.js   # plan activo y saldo del Start Plan
node scripts/zcode-cuentas-preview.js     # campanas disponibles por cuenta (no consume entrega)
```

Para ver **qué credenciales** hay en tu disco (sin mostrarlas):

```powershell
node scripts/zcode-provider-check.js
# imprime solo longitudes y nombres de claim
```

El `zcodejwttoken` **no expira** (no tiene `exp`); el `oauth:zai:access_token` es un JWT de
negocio ("MaaS") que el servidor refresca por su cuenta.

---

## 6. Trampas

1. **Un `HTTP 200` no significa éxito.** `api.z.ai` devuelve `200` con
   `{"error":{"code":"500"}}` cuando la credencial no sirve. Siempre parsea el cuerpo.
2. **`405 code 3012` no es un problema de token.** Es el chequeo de cliente oficial: la credencial
   era válida y el servidor te dijo que no eres la app.
3. **`x-api-key` con el `access_token` de OAuth no es la coding plan API key.** La key real la
   resuelve la app contra el servidor por sesión; no está en el disco.
4. **Bearer y `x-api-key` no son equivalentes** en `api.z.ai`: con Bearer el token se trata como
   API key de pago (saldo), con `x-api-key` como credencial de plan. Por eso una da 429 y la otra
   da otro error.
5. **El Start Plan no tiene ruta OpenAI-compatible.** Solo Anthropic. Un harness que solo hable
   OpenAI no puede consumirlo directamente.
6. **`billing/preview` no consume entrega; `marketing/touch` sí.** Al sondear para saber si hay
   campaña, usa `preview` (ver `docs/zcode-stack-reclamo-bono.md` §5.1).

---

## 7. Qué quedó verificado y qué no

| Afirmación | Estado |
|------------|--------|
| El Start Plan expone `POST /api/v1/zcode-plan/anthropic/v1/messages` | Verificado (responde, no 404) |
| El modelo del plan es `GLM-5.3-Flash` | Verificado (`billing/balance` + `client/configs`) |
| Un cliente externo con `zcodejwttoken` recibe `405 code 3012` | Verificado |
| Un cliente externo con `access_token` recibe 401 / 429 / 200-con-error | Verificado |
| El mapa de cabeceras oficiales (`Authorization`, `X-Bigmodel-Authorization`, `x-coding-plan-api-key`, `Bigmodel-*`) | Verificado en el bundle |
| El contrato del canal `official-mcp` (request/response/errores) | Verificado en el bundle |
| La official auth resuelta alcanza para llamar al modelo desde un MCP server | **Pendiente de validar en runtime** |
| El Coding Plan de Z.ai con API key propia funciona desde un harness externo | Documentado por el proveedor y por el bundle; no probado en esta máquina (sin saldo de API) |

---

## Documentación relacionada

- [zcode-stack-reclamo-bono.md](zcode-stack-reclamo-bono.md) — cómo se reclama el bono.
- [zcode-cuentas-inventario.md](zcode-cuentas-inventario.md) — informe técnico del caso.

#!/usr/bin/env node
/**
 * plan-gateway-win.cjs — Gateway Anthropic Messages API sobre la cuota
 * ZCode Start Plan, para Windows.
 *
 * Que NO es: un cliente de la API de zcode.z.ai. La API del plan rechaza a
 * cualquier cliente que no sea la app oficial (`405 code 3012`). Lo que hace
 * este gateway es hablar con el RUNTIME REAL de ZCode (el app-server) y dejar
 * que sea el quien se autentique.
 *
 * Flujo por cada request:
 *   1. spawnea `zcode.cjs app-server --surface terminal --no-color`
 *   2. inyecta el provider `account:zai-start-plan` (entitled) con los modelos
 *      GLM y reasoningLevel max
 *   3. responde la peticion de cabeceras oficiales del app-server con el
 *      `zcodejwttoken` de la sesion local + las cabeceras del cliente oficial
 *   4. conduce la sesion (create -> subscribe -> setMode -> setModel -> send)
 *      y traduce la respuesta a Anthropic Messages API (streaming y no-streaming)
 *
 * Endpoints:
 *   GET  /health      -> estado del gateway
 *   POST /v1/messages -> Anthropic Messages API
 *
 * Credenciales: ~/.zcode/v2/credentials.json, cifrado con el keyring de
 * Windows (servicio "ZCode Credential Encryption", cuenta sha256 de la ruta).
 *
 * RUNTIME (importante): el servidor valida el PROMPT DE SISTEMA que manda el
 * runtime como marca de "cliente oficial". El runtime 3.18.2 (CLI 0.17.1, el
 * que trae la app de escritorio) manda un prompt que el servidor todavia
 * rechaza con `405 / code 3012`, aunque las cabeceras, el token y la cuenta
 * sean correctos. El CLI 0.17.0 (3.16.x) si es aceptado. Por eso el gateway
 * usa `glm-0.17.0/zcode.cjs` + su `provider/zcode-builtin.json` (rev 43) si
 * encuentra esa carpeta, y solo cae al runtime de la app si no la tiene.
 * Ver `docs/zcode-start-plan-como-provider.md` §3.1.
 *
 * Uso:
 *   node plan-gateway-win.cjs                 # escucha en 127.0.0.1:3129
 *   PORT=3130 node plan-gateway-win.cjs       # otro puerto
 */
'use strict'
const { spawn, execFileSync } = require('node:child_process')
const readline = require('node:readline')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')
const http = require('node:http')

const HOME = os.homedir()
const APP_DIR = process.env.ZCODE_APP_DIR || 'C:\\Program Files\\ZCode\\resources'
/* Runtime local (CLI 0.17.0). El endpoint del Start Plan valida el prompt de
 * sistema que envia el runtime como "cliente oficial": el runtime 3.18.2
 * (0.17.1) manda un prompt que el servidor todavia rechaza con 405/3012,
 * mientras que el 0.17.0 si es aceptado. Por eso el gateway usa el 0.17.0
 * (traido del sandbox) y cae al del escritorio solo si no existe. */
const RUNTIME_DIRS = [
  process.env.ZCODE_GATEWAY_RUNTIME_DIR,
  path.join(__dirname, 'glm-0.17.0'),
  path.join(__dirname, '..', 'glm-0.17.0'),
].filter(Boolean)
const LOCAL_RUNTIME_DIR = RUNTIME_DIRS.find((d) => fs.existsSync(path.join(d, 'zcode.cjs')))
const LOCAL_ENTRY = LOCAL_RUNTIME_DIR ? path.join(LOCAL_RUNTIME_DIR, 'zcode.cjs') : null
const LOCAL_BUILTIN = LOCAL_RUNTIME_DIR ? path.join(LOCAL_RUNTIME_DIR, 'provider', 'zcode-builtin.json') : null
const ENTRY = process.env.ZCODE_CLI_ENTRY || (LOCAL_ENTRY || path.join(APP_DIR, 'glm', 'zcode.cjs'))
const BUILTIN = process.env.ZCODE_GATEWAY_BUILTIN || (LOCAL_BUILTIN || path.join(APP_DIR, 'config', 'provider', 'zcode-builtin.json'))
const CREDS = path.join(process.env.ZCODE_V2_DIR || path.join(HOME, '.zcode', 'v2'), 'credentials.json')
const PROVIDER_CONFIG = path.join(process.env.ZCODE_V2_DIR || path.join(HOME, '.zcode', 'v2'), 'provider_config.json')
const KEYRING_DIR = path.join(__dirname, '.zcode-keyring')
const ASAR = path.join(process.env.ZCODE_APP_DIR || 'C:\\Program Files\\ZCode\\resources', 'app.asar')
const ASAR_UNPACKED = path.join(process.env.ZCODE_APP_DIR || 'C:\\Program Files\\ZCode\\resources', 'app.asar.unpacked')

const PROVIDER_ID = 'account:zai-start-plan'
const REASONING = 'max'
const PORT = Number(process.env.PORT || 3129)

/* ------------------------- keyring de Windows (bootstrap) ------------------------- */
function readAsarFile(rel) {
  const buf = fs.readFileSync(ASAR)
  const hs = buf.readUInt32LE(12)
  const header = JSON.parse(buf.toString('utf8', 16, 16 + hs))
  const start = 16 + hs + (hs % 4 ? 4 - (hs % 4) : 0)
  let n = header
  for (const p of rel.split('/')) n = n.files[p]
  const off = start + Number(n.offset)
  return buf.toString('utf8', off, off + n.size)
}
function ensureKeyring() {
  const s = '@napi-rs'
  const jsDir = path.join(KEYRING_DIR, 'node_modules', s, 'keyring')
  const binDir = path.join(KEYRING_DIR, 'node_modules', s, 'keyring-win32-x64-msvc')
  const binSrc = path.join(ASAR_UNPACKED, 'node_modules', s, 'keyring-win32-x64-msvc', 'keyring.win32-x64-msvc.node')
  if (!fs.existsSync(binSrc)) throw new Error('falta el binario nativo del keyring en ' + ASAR_UNPACKED)
  fs.mkdirSync(jsDir, { recursive: true })
  fs.writeFileSync(path.join(jsDir, 'index.js'), readAsarFile('node_modules/@napi-rs/keyring/index.js'))
  fs.writeFileSync(path.join(jsDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring', version: '2.1.2', main: 'index.js' }))
  fs.mkdirSync(binDir, { recursive: true })
  const bd = path.join(binDir, 'keyring.win32-x64-msvc.node')
  if (!fs.existsSync(bd)) fs.copyFileSync(binSrc, bd)
  fs.writeFileSync(path.join(binDir, 'index.js'), "module.exports = require('./keyring.win32-x64-msvc.node');\n")
  fs.writeFileSync(path.join(binDir, 'package.json'), JSON.stringify({ name: '@napi-rs/keyring-win32-x64-msvc', version: '2.1.2', main: 'keyring.win32-x64-msvc.node' }))
  return path.join(KEYRING_DIR, 'node_modules', s, 'keyring')
}
const { AsyncEntry } = require(ensureKeyring())
const sha256hex = (p) => crypto.createHash('sha256').update(p).digest('hex')

/* ------------------------------ credenciales ------------------------------ */
async function readPlanAuth() {
  const entry = new AsyncEntry('ZCode Credential Encryption', sha256hex(path.resolve(CREDS)), { linux: { store: 'secret-service' } })
  const secret = await entry.getPassword()
  if (!secret) throw new Error('no hay clave de credenciales en el keyring de Windows')
  const key = Buffer.from(secret, 'base64url')
  const creds = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
  const v = creds['zcodejwttoken']
  if (typeof v !== 'string') throw new Error('credentials.json no tiene zcodejwttoken')
  if (!v.startsWith('enc:v2:')) return v
  const p = v.slice(7).split(':')
  if (p.length !== 3 || p[0] !== 'os') throw new Error('formato de credencial inesperado')
  if (sha256hex(key).slice(0, 24) !== p[1]) throw new Error('la clave del keyring no corresponde a este credentials.json')
  const [iv, tag, data] = p[2].split('.').map((x) => Buffer.from(x, 'base64url'))
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(data), d.final()]).toString('utf8')
}

/* ------------------------------ configuracion ------------------------------ */
if (!fs.existsSync(ENTRY)) { console.error('[gateway] no existe el runtime: ' + ENTRY); process.exit(1) }
if (!fs.existsSync(BUILTIN)) { console.error('[gateway] no existe el provider builtin: ' + BUILTIN); process.exit(1) }
const release = JSON.parse(fs.readFileSync(BUILTIN, 'utf8'))
const hash = crypto.createHash('sha256').update(fs.realpathSync(BUILTIN)).digest('hex')
const basedOn = `zcode-builtin:${release.revision}:${hash}`
console.log(`[gateway] builtin rev=${release.revision} entry=${ENTRY}`)

/* Version del runtime: 3.18.2 (0.17.1) exige un objeto de preferencias estricto
 * con nativeSearchEnhancementsEnabled; 3.16.x (0.17.0) usa un esquema mas chico.
 * El prompt de sistema que el runtime envia es lo que el servidor valida como
 * "cliente oficial", asi que un runtime mas nuevo puede ser rechazado. */
let RUNTIME_VERSION = '0.0.0'
try {
  RUNTIME_VERSION = execFileSync(process.execPath, [ENTRY, '--version'], { encoding: 'utf8', timeout: 20000 }).trim()
} catch (e) { RUNTIME_VERSION = 'desconocida' }
const MODERN_RUNTIME = /^0\.17\.[1-9]/.test(RUNTIME_VERSION)
const APP_VERSION = process.env.ZCODE_APP_VERSION || RUNTIME_VERSION
console.log(`[gateway] runtime=${RUNTIME_VERSION} (esquema ${MODERN_RUNTIME ? 'estricto 3.18.2' : 'legado 3.16.x'}) app-version=${APP_VERSION}`)

const RUNTIME_PREFERENCES = MODERN_RUNTIME
  ? {
      additionalDirectories: [],
      nativeSearchEnhancementsEnabled: false,
      toolSearchMode: 'off',
      subagentRuntimeConfigEnabled: false,
      appControlEnabled: false,
      memoryEnabled: false,
      askUserQuestionAutoResolutionEnabled: false,
      modelContextBudgetStrategy: 'preflight-v1',
    }
  : {
      nativeSearchEnhancementsEnabled: false,
      memoryEnabled: false,
      askUserQuestionAutoResolutionEnabled: true,
      modelContextBudgetStrategy: 'preflight-v1',
    }

function textOf(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  return String(content ?? '')
}

const OFFICIAL_HEADERS = () => ({
  'http-referer': 'https://zcode.z.ai',
  'user-agent': `ZCode/${APP_VERSION}`,
  'x-zcode-app-version': APP_VERSION,
  'x-title': 'Z Code@cli',
})

/** Ejecuta un turno completo en un app-server fresco. Devuelve {text, usage, providerId}. */
function runTurn({ prompt, modelId }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    env.ZCODE_APP_VERSION = APP_VERSION
    // nombres reales de las env del runtime (no ZCODE_PROVIDER_CONFIG)
    env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE = BUILTIN
    env.ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE = BUILTIN
    env.ZCODE_PERSONAL_PROVIDER_CONFIG_FILE = PROVIDER_CONFIG
    env.ZCODE_BASE_URL = process.env.ZCODE_GATEWAY_BASE_URL || 'https://zcode.z.ai'
    const child = spawn(process.execPath, [ENTRY, 'app-server', '--surface', 'terminal', '--no-color'], { cwd: HOME, env })
    let nextId = 1
    const pending = new Map()
    const out = { text: '', usage: undefined, providerId: undefined, error: undefined, done: false }
    let sessionId = undefined
    const send = (m) => child.stdin.write(JSON.stringify(m) + '\n')
    const request = (method, params, timeoutMs = 90000) => {
      const id = nextId++
      let resolver
      const p = new Promise((r) => { resolver = r; pending.set(id, r) })
      const timer = setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolver({ error: { message: 'timeout local esperando ' + method } }) } }, timeoutMs)
      send({ id, method, params })
      return p.then((r) => { clearTimeout(timer); return r })
    }
    const sleep = (ms) => new Promise((x) => setTimeout(x, ms))
    const timer = setTimeout(() => { out.error = out.error || 'timeout global del turno'; out.done = true }, 300000)
    const finish = () => { clearTimeout(timer); child.kill(); out.done ? resolve(out) : (out.done = true, resolve(out)) }

    readline.createInterface({ input: child.stdout }).on('line', async (line) => {
      const t = line.trim()
      if (!t) return
      let m
      try { m = JSON.parse(t) } catch { return }
      if (m.id !== undefined && m.method === undefined) {
        const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m) }
        return
      }
      if (m.method !== undefined && m.id !== undefined) {
        if (m.method === 'session/requestRuntimePreferences') {
          // 3.18.2 exige nativeSearchEnhancementsEnabled (sin default) y el objeto es strict:
          // mandar solo las claves permitidas, o el session/create falla con ZodError.
          send({ id: m.id, result: RUNTIME_PREFERENCES })
        } else if (m.method === 'interaction/requestProviderRuntimeHeaders' || m.method === 'interaction/requestAuth') {
          // 3.18.2 = requestProviderRuntimeHeaders; 3.16.x = requestAuth
          try {
            // OJO: readPlanAuth es async (keyring de Windows) -> hay que await,
            // si no apiKey viaja como Promise y el runtime lo rechaza por tipo.
            const planToken = await readPlanAuth()
            send({ id: m.id, result: { headersApplied: true, requestAuth: { apiKey: planToken, headers: OFFICIAL_HEADERS() } } })
          } catch (e) {
            send({ id: m.id, result: { headersApplied: false, errorMessage: e.message } })
          }
        } else if (m.method === 'interaction/requestOfficialMcpAuthHeaders') {
          try {
            await readPlanAuth()
            send({ id: m.id, result: { ok: true, headers: OFFICIAL_HEADERS() } })
          } catch (e) {
            send({ id: m.id, result: { ok: false, reason: 'official_auth_unavailable', errorMessage: e.message } })
          }
        } else if (m.method === 'interaction/requestPermission' || /approval|permission/i.test(m.method)) {
          send({ id: m.id, result: { decision: 'allow' } })
        } else if (m.method === 'interaction/browserList') {
          send({ id: m.id, result: { browsers: [] } })
        } else {
          send({ id: m.id, result: {} })
        }
        return
      }
      if (m.method !== 'session/event') return
      const type = m.params?.type ?? '?'
      const p = m.params?.payload ?? {}
      if (type === 'session.updated' && p.providerId) out.providerId = p.providerId
      if (type === 'turn.completed') {
        out.text = p.response ?? out.text
        out.usage = p.usage
        out.error = p.resultType && p.resultType !== 'success' ? p.resultType : out.error
        out.done = true
        finish()
      }
      if (type === 'turn.failed') {
        out.error = JSON.stringify(p).slice(0, 2000)
        console.log(`[turn.failed] ${out.error}`)
        out.done = true
        finish()
      }
    })
    child.on('error', (e) => { out.error = e.message; out.done = true; finish() })
    child.stderr.on('data', (b) => {
      const s = b.toString().trim()
      if (s) console.log(`[app-server stderr] ${s.slice(0, 400)}`)
    })
    child.on('exit', (code, sig) => {
      if (!out.done) { out.error = `app-server termino (code=${code}, signal=${sig})`; out.done = true; finish() }
    })
    ;(async () => {
      try {
        await sleep(2500)
        const created = await request('session/create', { workspace: { workspacePath: HOME, workspaceKey: 'plan-gateway' } })
        sessionId = created?.result?.session?.sessionId
        if (!sessionId) throw new Error('session/create sin sessionId: ' + JSON.stringify(created).slice(0, 200))
        await request('session/subscribe', { sessionId, deliveryKind: 'desktop-continuous', afterSeq: 0, includeSnapshot: true })
        try { await request('session/setMode', { sessionId, mode: 'bypass' }) } catch (e) {}
        const inj = await request('provider/updateAccountConfig', {
          revision: `plan-gateway:${Date.now()}`,
          basedOnZCodeBuiltinRevision: basedOn,
          providers: { [PROVIDER_ID]: { access: { type: 'zhipu-account', entitled: true }, builtinModelIds: ['GLM-5.3-Flash', 'GLM-5.3', 'GLM-5.2', 'GLM-5-Turbo'] } },
          states: { [PROVIDER_ID]: { availability: 'available', entitled: true, current: true } },
        })
        if (inj.error) throw new Error('updateAccountConfig: ' + JSON.stringify(inj.error).slice(0, 150))
        await sleep(2000)
        const sm = await request('session/setModel', { sessionId, model: { providerId: PROVIDER_ID, modelId, options: { reasoningLevel: REASONING } } })
        if (sm.error) throw new Error('setModel: ' + JSON.stringify(sm.error).slice(0, 200))
        await sleep(1500)
        await request('session/send', { sessionId, content: prompt }, 60000)
      } catch (e) {
        out.error = e.message
        out.done = true
        finish()
      }
    })()
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, gateway: 'plan-gateway', provider: PROVIDER_ID, reasoning: REASONING, platform: 'win32', port: PORT }))
    return
  }
  if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
    res.writeHead(404); res.end('not found'); return
  }
  let body = ''
  for await (const chunk of req) body += chunk
  let parsed
  try { parsed = JSON.parse(body) } catch { res.writeHead(400); res.end('bad json'); return }
  const modelId = parsed.model || 'GLM-5.3-Flash'
  const stream = parsed.stream === true
  const messages = Array.isArray(parsed.messages) ? parsed.messages : []
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const prompt = textOf(lastUser?.content) || 'hola'
  const system = parsed.system ? textOf(parsed.system) : ''
  const fullPrompt = system ? `[system]\n${system}\n\n[prompt]\n${prompt}` : prompt
  console.log(`[req] model=${modelId} stream=${stream} prompt=${JSON.stringify(prompt.slice(0, 80))}`)

  if (!stream) {
    const out = await runTurn({ prompt: fullPrompt, modelId })
    if (out.error && !out.text) {
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { type: 'gateway_error', message: out.error } }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      id: 'msg_gateway_' + Date.now(), type: 'message', role: 'assistant', model: modelId,
      content: [{ type: 'text', text: out.text }],
      stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: out.usage?.inputTokens ?? 0, output_tokens: out.usage?.outputTokens ?? 0 },
    }))
    return
  }
  // streaming SSE
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  const sse = (obj) => res.write(`event: ${obj.type}\ndata: ${JSON.stringify(obj)}\n\n`)
  sse({ type: 'message_start', message: { id: 'msg_gateway_' + Date.now(), type: 'message', role: 'assistant', model: modelId, content: [], usage: { input_tokens: 0, output_tokens: 0 } } })
  sse({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
  const out = await runTurn({ prompt: fullPrompt, modelId }).catch((e) => ({ error: e.message, text: '' }))
  if (out.text) sse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: out.text } })
  sse({ type: 'content_block_stop', index: 0 })
  sse({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: out.usage?.outputTokens ?? 0 } })
  sse({ type: 'message_stop' })
  res.end()
})

server.on('error', (e) => { console.error('[gateway] error de servidor:', e.message); process.exit(1) })
server.listen(PORT, '127.0.0.1', () => console.log(`[gateway] escuchando en http://127.0.0.1:${PORT}/v1/messages (provider ${PROVIDER_ID}, reasoning ${REASONING})`))

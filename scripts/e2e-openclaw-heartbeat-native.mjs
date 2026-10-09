/**
 * Actual OpenClaw 2026.6.11 -> installed Meridian -> native Opus heartbeat replay.
 * Derived from Meridian's committed bounded native #769 harness. The only
 * before/after variable is E2E_SCRUB_ENTRY (original or corrected plugin).
 * All prompt/file/session fixtures are owned; no customer transcript is read.
 * Run with Linux/Bun1.3.11, installed SDK0.2.141/native2.1.284 and private
 * read-only E2E_TOKEN_FILE. E2E_EXPECT=baseline|candidate. --prepare-only
 * performs no credential read or provider call. See docs/evidence controls.
 * A baseline runtime failure is retained as a failure, never reported as PASS.
 */
import * as cp from 'node:child_process'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, lstatSync, realpathSync, openSync, readSync, closeSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { spyOn } from 'bun:test'
import { observeChildClosure, stopAndJoinChild } from './lib/e2eProcessCustody.mjs'

const prepareOnly = process.argv.includes('--prepare-only')
const input = Object.fromEntries(['MERIDIAN_ENTRY', 'SDK_ENTRY', 'NATIVE_BIN', 'OPENCLAW_BIN', 'SCRUB_ENTRY', 'REFERENCE_SCRUB_ENTRY', 'OUTPUT_DIR', 'TOKEN_FILE', 'EXPECT']
  .map(name => [name, process.env['E2E_' + name]]))
for (const key of ['MERIDIAN_ENTRY', 'SDK_ENTRY', 'NATIVE_BIN', 'OPENCLAW_BIN', 'SCRUB_ENTRY', 'REFERENCE_SCRUB_ENTRY', 'OUTPUT_DIR']) {
  if (!input[key] || !isAbsolute(input[key])) throw new Error('Missing absolute fixture path: ' + key)
}
if (!['baseline', 'candidate'].includes(input.EXPECT)) throw new Error('Set E2E_EXPECT=baseline or candidate')
if (process.platform !== 'linux' || process.versions.bun !== '1.3.11') throw new Error('This gate requires Linux and Bun 1.3.11')
const output = input.OUTPUT_DIR
mkdirSync(output, { mode: 0o700 })
for (const name of ['home', 'tmp', 'config', 'sessions', 'backend-work', 'client-work', 'client-state', 'client-home', 'plugins', 'empty-plugins', 'xdg-config', 'xdg-data', 'xdg-cache']) {
  mkdirSync(join(output, name), { mode: 0o700 })
}
const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex')
const within = path => path === output || (!relative(output, path).startsWith('..') && !isAbsolute(relative(output, path)))
const marker = 'UNUSED_CONTROL_MARKER_' + randomUUID().replaceAll('-', '')
const poll = 'Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.'
const receipt = 'OWNED_READ_RECEIPT_' + randomUUID().replaceAll('-', '')
const fixture = join(output, 'client-work', 'receipt.txt')
writeFileSync(fixture, receipt + '\n', { mode: 0o600 })
const report = {
  kind: prepareOnly ? 'NATIVE_PREREQUISITE_ONLY' : 'ACTUAL_OPENCLAW_HEARTBEAT_REPLAY_NATIVE_GATE',
  expectation: input.EXPECT, platform: process.platform, architecture: process.arch,
  bun: process.versions.bun, nodeRuntime: null, firstFailure: null,
  commands: [], queries: [], requests: [], pluginObservations: [], stages: [], children: [],
  supportedHistoryReads: [], actorScope: 'Original observed child handles, SDK factory/iterator/close, and owned HTTP resources. External/global descendant absence is unknown.',
  classifierAcceptance: 'HELD: undisclosed current trigger and fresh same-window off/on/off controls are missing.',
  actualProviderQueries: 0, grantRead: false, sourceCredentialLoginRefreshWrites: false,
}
let retired = false, phase = 'preparation', mode = 'noop', token
let instance, relay, sdk, currentClient, baselineHistoryControl
let startup, startupSettled = false
const controls = new Set(), sockets = new Set(), socketClosures = [], handlers = new Set(), children = []
const childIndex = new WeakMap(), spies = []
const reads = new Set(), realSpawn = cp.spawn
const servedLocators = new WeakMap()
const deliveredCalls = new Set()
let proxyClosed = false
function fail(code) {
  retired = true
  let selected = String(code).replace(/sk-ant-[A-Za-z0-9_-]+/g, '[redacted-access]')
  if (token) selected = selected.replaceAll(token, '[redacted-access]')
  report.firstFailure ??= selected.slice(0, 500)
}
function stopCurrentClient() {
  const actor = currentClient && childIndex.get(currentClient)
  if (actor && !actor.witness.state.exitSeen && !actor.witness.state.closeSeen && currentClient.pid) currentClient.kill('SIGTERM')
}
function need(value, code) { if (!value) throw new Error(code) }
function save() { writeFileSync(join(output, 'REPORT.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }) }
function fileDigest(path) {
  const fd = openSync(path, 'r'), hash = createHash('sha256'), buffer = Buffer.alloc(1_048_576)
  try { for (;;) { const n = readSync(fd, buffer, 0, buffer.length, null); if (!n) break; hash.update(buffer.subarray(0, n)) } }
  finally { closeSync(fd) }
  return hash.digest('hex')
}
async function bounded(promise, ms, code) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code)), ms) })]) }
  finally { clearTimeout(timer) }
}
function attach(child, kind) {
  if (childIndex.has(child)) return childIndex.get(child)
  const witness = observeChildClosure(child)
  const item = { child, witness, facts: { kind, phase, originalPid: child.pid ?? null, nativeInit: [], nativeTerminal: [], stdinClosed: child.stdin === null } }
  children.push(item); childIndex.set(child, item)
  child.stdin?.once('close', () => { item.facts.stdinClosed = true })
  child.once('error', () => fail('owned-' + kind + '-spawn-error'))
  for (const stream of [child.stdout, child.stderr, child.stdin]) stream?.on('error', () => fail('owned-' + kind + '-pipe-error'))
  if (kind === 'sdk-gate') {
    let buffered = ''
    child.stdout?.on('data', chunk => {
      buffered += chunk.toString('utf8')
      if (buffered.length > 2_000_000) { fail('native-observer-line-bound'); buffered = ''; return }
      let end
      while ((end = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, end); buffered = buffered.slice(end + 1)
        try {
          const event = JSON.parse(line)
          if (event.type === 'system' && event.subtype === 'init') item.facts.nativeInit.push({ model: event.model, version: event.claude_code_version })
          if (event.type === 'result') item.facts.nativeTerminal.push({ subtype: event.subtype, isError: event.is_error === true })
        } catch (error) { item.facts.nonJsonLineCount = (item.facts.nonJsonLineCount ?? 0) + 1 }
      }
    })
  }
  return item
}
function observeSpawns() {
  for (const name of ['spawn', 'execFile']) {
    const original = cp[name]
    spies.push(spyOn(cp, name).mockImplementation((...args) => {
      const nativeGate = name === 'spawn' && args[0] === '/bin/sh' && args[1]?.[2] === 'meridian-sdk-gate'
      if (nativeGate) need(within(args[1][3]), 'sdk-gate-outside-owned-state')
      const child = Reflect.apply(original, cp, args)
      attach(child, nativeGate ? 'sdk-gate' : name)
      return child
    }))
  }
}
function observeQuery() {
  const original = sdk.query
  spies.push(spyOn(sdk, 'query').mockImplementation(params => {
    need(!retired, 'native-query-admission-retired')
    const opts = params.options ?? {}
    const facts = { phase, model: opts.model, resume: Boolean(opts.resume), rollback: Boolean(opts.resumeSessionAt),
      privateGrantMatched: opts.env?.CLAUDE_CODE_OAUTH_TOKEN === token,
      configOwned: within(opts.env?.CLAUDE_CONFIG_DIR ?? '/'), cwdOwned: within(opts.cwd ?? '/'),
      inputMarker: false, inputReceipt: false, inputDigests: [], inputOwnedCallDigests: [], inputOwnedResultDigests: [], constructed: false, iteratorSettled: false, closeCalled: false, publicSpawn: false }
    report.queries.push(facts); report.actualProviderQueries++
    need(facts.privateGrantMatched && facts.configOwned && facts.cwdOwned, 'sdk-private-grant-or-workdir-mismatch')
    need(opts.model === 'opus[1m]' || opts.model === 'claude-opus-5-5[1m]', 'sdk-model-or-window-mismatch')
    need(!opts.env?.ANTHROPIC_API_KEY && !opts.env?.ANTHROPIC_AUTH_TOKEN && !opts.env?.ANTHROPIC_BASE_URL, 'sdk-unexpected-provider-credential')
    need(typeof opts.sessionId === 'string' && /^[0-9a-f-]{36}$/i.test(opts.sessionId), 'owned-preallocated-sdk-target-required')
    const locator = { claudeSessionId: opts.sessionId, resumeSessionId: opts.resume, currentTranscript: { configDir: opts.env.CLAUDE_CONFIG_DIR, projectDir: opts.cwd }, terminal: false }
    servedLocators.set(facts, locator)
    facts.targetSessionDigest = digest(opts.sessionId)
    const recordInput = value => {
      const serialized = JSON.stringify(value)
      const metrics = historyMetrics([typeof value === 'string' ? { role: 'user', content: value } : value.message ?? value])
      facts.inputOwnedCallDigests.push(...metrics.ownedCallDigests)
      facts.inputOwnedResultDigests.push(...metrics.ownedResultDigests)
      facts.inputMarker ||= serialized.includes(marker)
      facts.inputReceipt ||= serialized.includes(receipt)
      facts.inputToolPair ||= [...deliveredCalls].some(id => serialized.includes(id)) && serialized.includes(receipt)
      facts.inputDigests.push(digest(serialized))
    }
    let prompt = params.prompt
    if (typeof prompt === 'string') recordInput(prompt)
    else {
      const originalPrompt = prompt
      prompt = (async function* () { for await (const row of originalPrompt) { recordInput(row); yield row } })()
    }
    const originalFactory = opts.spawnClaudeCodeProcess
    need(typeof originalFactory === 'function', 'real-product-sdk-process-gate-required')
    const options = { ...opts, spawnClaudeCodeProcess(spawnOptions) {
      need(realpathSync(spawnOptions.command) === realpathSync(input.NATIVE_BIN), 'sdk-native-command-not-pinned')
      need(spawnOptions.env?.CLAUDE_CODE_OAUTH_TOKEN === token && within(spawnOptions.env?.CLAUDE_CONFIG_DIR ?? '/'), 'native-grant-scope-mismatch')
      const child = originalFactory(spawnOptions)
      const actor = childIndex.get(child)
      need(actor?.facts.kind === 'sdk-gate', 'native-not-original-owned-gate-handle')
      facts.publicSpawn = true; facts.originalPid = actor.facts.originalPid
      return child
    } }
    const actual = original({ ...params, options, prompt })
    facts.constructed = true
    const originalClose = actual.close.bind(actual)
    actual.close = () => { facts.closeCalled = true; return originalClose() }
    const iterate = actual[Symbol.asyncIterator].bind(actual)
    actual[Symbol.asyncIterator] = async function* () {
      try {
        for await (const event of { [Symbol.asyncIterator]: iterate }) {
          if (event.type === 'result') {
            need(event.session_id === locator.claudeSessionId, 'native-terminal-not-preallocated-owned-target')
            locator.terminal = true
            facts.terminalSessionMatched = true
          }
          yield event
        }
      }
      finally { facts.iteratorSettled = true }
    }
    controls.add(actual)
    return actual
  }))
}
const childEnv = {
  PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', HOME: join(output, 'client-home'), TMPDIR: join(output, 'tmp'),
  OPENCLAW_HOME: join(output, 'client-home'), OPENCLAW_STATE_DIR: join(output, 'client-state'),
  OPENCLAW_CONFIG_PATH: join(output, 'openclaw.json'), NODE_DISABLE_COMPILE_CACHE: '1',
  XDG_CONFIG_HOME: join(output, 'xdg-config'), XDG_DATA_HOME: join(output, 'xdg-data'), XDG_CACHE_HOME: join(output, 'xdg-cache'),
}
async function cli(name, executable, args, timeout = 120_000) {
  const child = realSpawn(executable, args, { cwd: join(output, 'client-work'), env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  currentClient = child
  const actor = attach(child, 'client-' + name), stdout = []
  let bytes = 0
  child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 2_000_000) fail('client-output-bound'); else stdout.push(chunk) })
  child.stderr.on('data', () => {}) // Provider/client raw diagnostics are not persisted.
  try { await bounded(actor.witness.joined, timeout, 'client-' + name + '-deadline') }
  catch (error) { fail(error.message) }
  if (actor.witness.state.exitCode !== 0) fail('client-' + name + '-exit-' + actor.witness.state.exitCode)
  const closure = await stopAndJoinChild(child, actor.witness, { graceMs: 3000, forceMs: 3000 })
  report.commands.push({ name, closure, stdoutBytes: bytes, stdoutDigest: digest(Buffer.concat(stdout)) })
  currentClient = undefined
  need(closure.joined && closure.exitCode === 0 && !report.firstFailure, report.firstFailure ?? 'client-close-missing')
  return Buffer.concat(stdout).toString('utf8')
}
async function settleQueries() {
  const gates = children.filter(item => item.facts.kind === 'sdk-gate')
  await bounded(Promise.all(gates.map(item => item.witness.joined)), 20_000, 'sdk-gates-not-closed-after-response')
  need(report.queries.every(query => query.constructed && query.iteratorSettled && query.closeCalled && query.publicSpawn), 'query-factory-iterator-close-witness-missing')
}
async function supportedHistory(mapping) {
  need(mapping?.claudeSessionId && mapping.currentTranscript?.configDir && within(mapping.currentTranscript.configDir), 'owned-mapping-locator-required')
  const previous = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = mapping.currentTranscript.configDir
  const promise = sdk.getSessionMessages(mapping.claudeSessionId, { dir: mapping.currentTranscript.projectDir })
  reads.add(promise)
  const facts = { sessionDigest: digest(mapping.claudeSessionId), settled: false }
  report.supportedHistoryReads.push(facts)
  try {
    const rows = await bounded(promise, 25_000, 'supported-owned-history-read-deadline')
    facts.settled = true; facts.rows = rows.length
    need(rows.length > 0, 'supported-owned-history-empty')
    return JSON.stringify(rows)
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previous
  }
}
function historyMetrics(messages) {
  const blocks = messages.flatMap(message => Array.isArray(message?.content) ? message.content : [])
  const calls = blocks.filter(block => block?.type === 'tool_use' && (block.name === 'read' || deliveredCalls.has(block.id))
    && (block.input?.path === fixture || block.input?.file_path === fixture))
  const results = blocks.filter(block => block?.type === 'tool_result' && !block.is_error && JSON.stringify(block.content).includes(receipt))
  // Fresh SDK replay represents historical calls/results as context text,
  // rather than importing them as native assistant/tool-result blocks.
  // Read the exact recorded identities in that public representation too.
  for (const message of messages) {
    if (message?.role !== 'user') continue
    const texts = typeof message.content === 'string' ? [message.content]
      : (Array.isArray(message.content) ? message.content.filter(block => block?.type === 'text').map(block => block.text) : [])
    for (const text of texts) for (const line of text.split('\n')) {
      for (const [prefix, isCall] of [['Previously called tool: ', true], ['Recorded tool result: ', false]]) {
        const start = line.indexOf(prefix)
        if (start < 0) continue
        const record = JSON.parse(line.slice(start + prefix.length, line.lastIndexOf('}') + 1))
        if (isCall && deliveredCalls.has(record.id) && (record.input?.path === fixture || record.input?.file_path === fixture)) calls.push(record)
        if (!isCall && deliveredCalls.has(record.tool_use_id) && !record.is_error && text.includes(receipt)) results.push(record)
      }
    }
  }
  return { count: messages.length, polls: messages.filter(message => message?.role === 'user'
    && (typeof message.content === 'string' ? message.content : (message.content ?? []).filter?.(block => block?.type === 'text').map(block => block.text).join('\n'))?.startsWith(poll)).length,
    ownedCallDigests: calls.map(call => digest(call.id)), ownedResultDigests: results.map(result => digest(result.tool_use_id)),
    ownedOrphanDigests: results.filter(result => !calls.some(call => call.id === result.tool_use_id)).map(result => digest(result.tool_use_id)) }
}
const observationKey = Symbol.for('meridian.openclaw769.native-fixture')
const observations = { marker, get mode() { return mode }, request(ctx, effective) {
  need(ctx.adapter === 'opencode', 'actual-openclaw-fallback-adapter-changed')
  const raw = historyMetrics(ctx.body.messages), transformed = historyMetrics(effective)
  const reference = historyMetrics(baselineHistoryControl(structuredClone(ctx.body.messages)))
  report.pluginObservations.push({ phase, raw, transformed, reference, rawDigest: digest(ctx.body.messages), effectiveDigest: digest(effective) })
}, session(ctx) { report.pluginObservations.push({ phase, kind: 'session', lineage: ctx.lineage, incomingCount: ctx.incomingCount, sessionKeyDigest: digest(ctx.sessionKey ?? '') }) } }
globalThis[observationKey] = observations
async function forward(request, response) {
  response.on('error', () => fail('relay-response-error'))
  request.on('error', () => fail('relay-request-error'))
  let timer, controller
  try {
    need(!retired, 'relay-admission-retired')
    need(request.method === 'POST' && request.url === '/v1/messages', 'unexpected-client-route')
    const chunks = []; let size = 0
    for await (const chunk of request) { size += chunk.length; need(size <= 2_000_000, 'client-request-body-bound'); chunks.push(chunk) }
    const bytes = Buffer.concat(chunks), body = JSON.parse(bytes)
    need(body.model === 'opus[1m]' && body.stream === true, 'actual-client-model-stream-mismatch')
    need(report.requests.length < 16, 'native-request-bound')
    const blocks = body.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
    for (const block of blocks) {
      if (block.type !== 'tool_result' || block.is_error || !JSON.stringify(block.content).includes(receipt)) continue
      const call = blocks.find(item => item.type === 'tool_use' && item.id === block.tool_use_id && item.name === 'read'
        && (item.input?.path === fixture || item.input?.file_path === fixture))
      if (call) deliveredCalls.add(call.id)
    }
    const facts = { phase, mode, rawCount: body.messages.length, toolCount: body.tools?.length ?? 0, model: body.model, stream: body.stream,
      bodyDigest: digest(bytes), toolReceiptPresent: JSON.stringify(body.messages).includes(receipt), status: null, responseJoined: false }
    report.requests.push(facts)
    controller = new AbortController(); timer = setTimeout(() => { fail('relay-forward-deadline'); controller.abort() }, 120_000)
    response.once('close', () => { if (!response.writableFinished) { fail('client-response-abandoned'); controller.abort() } })
    const headers = new Headers()
    for (let i = 0; i < request.rawHeaders.length; i += 2) headers.append(request.rawHeaders[i], request.rawHeaders[i + 1])
    headers.delete('host'); headers.delete('content-length')
    const upstream = await fetch(`http://127.0.0.1:${instance.server.address().port}${request.url}`, { method: 'POST', headers, body: bytes, signal: controller.signal })
    facts.status = upstream.status
    if (!upstream.ok) {
      // The first non-success response retires admission before any checkpoint
      // or client-side retry; preserve classification metadata, never raw bodies.
      fail('actual-provider-http-' + upstream.status)
      const diagnostic = await upstream.text()
      facts.diagnosticDigest = digest(diagnostic)
      try { const value = JSON.parse(diagnostic); facts.errorType = value.error?.type; facts.extraUsageMentioned = /extra usage/i.test(value.error?.message ?? '') }
      catch (error) { facts.diagnosticJson = false }
      response.writeHead(upstream.status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { type: facts.errorType ?? 'api_error', message: 'Owned live gate stopped; inspect its retained metadata.' } }))
      stopCurrentClient()
      return
    }
    response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'text/event-stream' })
    for await (const chunk of upstream.body) response.write(chunk)
    response.end(); facts.responseJoined = true
  } catch (error) {
    fail(error.message)
    if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { type: 'api_error', message: 'Owned live gate stopped.' } }))
  } finally { clearTimeout(timer); controller?.abort(); save() }
}
function trackServer(server) {
  server.on('connection', socket => {
    sockets.add(socket)
    socketClosures.push(new Promise(resolve => socket.once('close', () => { sockets.delete(socket); resolve() })))
  })
  server.on('error', () => fail('owned-server-error'))
}
let deadline
try {
  for (const key of Object.keys(process.env)) if (/^(MERIDIAN_|CLAUDE_|ANTHROPIC_|OPENAI_|OPENCLAW_|OPENCODE_)/.test(key)) delete process.env[key]
  Object.assign(process.env, { HOME: join(output, 'home'), TMPDIR: join(output, 'tmp'),
    MERIDIAN_CONFIG_DIR: join(output, 'config'), MERIDIAN_SESSION_DIR: join(output, 'sessions'), MERIDIAN_WORKDIR: join(output, 'backend-work'),
    MERIDIAN_CLAUDE_PATH: input.NATIVE_BIN, MERIDIAN_DEFAULT_AGENT: 'opencode', MERIDIAN_PASSTHROUGH: '1',
    MERIDIAN_CREDENTIALS_READONLY: '1', MERIDIAN_TELEMETRY_PERSIST: '0', MERIDIAN_SESSION_GC_INTERVAL_MS: '0',
    CLAUDE_CONFIG_DIR: join(output, 'config'), MERIDIAN_OPUS_MODEL: 'claude-opus-5-5', NODE_DISABLE_COMPILE_CACHE: '1' })
  const nativeFd = openSync(input.NATIVE_BIN, 'r'), magic = Buffer.alloc(4)
  try { readSync(nativeFd, magic, 0, 4, 0) } finally { closeSync(nativeFd) }
  need(magic.toString('hex') === '7f454c46', 'native-ELF-executable-required')
  const require = createRequire(input.MERIDIAN_ENTRY)
  need(realpathSync(require.resolve('@anthropic-ai/claude-agent-sdk')) === realpathSync(input.SDK_ENTRY), 'actual-package-sdk-resolution-mismatch')
  report.inputFiles = Object.fromEntries(['MERIDIAN_ENTRY', 'SDK_ENTRY', 'NATIVE_BIN', 'OPENCLAW_BIN', 'SCRUB_ENTRY', 'REFERENCE_SCRUB_ENTRY'].map(key => [key, { path: input[key], sha256: fileDigest(input[key]) }]))
  observeSpawns()
  report.nodeRuntime = (await cli('node-version', '/usr/local/bin/node', ['--version'])).trim()
  report.nativeVersion = (await cli('native-version', input.NATIVE_BIN, ['--version'])).trim()
  need(report.nativeVersion === '2.1.284 (Claude Code)', 'native-version-mismatch')
  report.clientVersion = (await cli('client-version', '/usr/local/bin/node', [input.OPENCLAW_BIN, '--version'])).trim()
  need(report.clientVersion.includes('2026.6.11'), 'reported-client-version-mismatch')
  sdk = await import(pathToFileURL(input.SDK_ENTRY).href)
  const sdkPackage = JSON.parse(readFileSync(join(dirname(input.SDK_ENTRY), 'package.json')))
  report.sdkVersion = sdkPackage.version; need(report.sdkVersion === '0.2.141', 'sdk-version-mismatch')
  const scrub = (await import(pathToFileURL(input.SCRUB_ENTRY).href)).default
  need(scrub?.name === 'openclaw-scrub' && typeof scrub.onRequest === 'function', 'installed-scrub-hook-required')
  baselineHistoryControl = (await import(pathToFileURL(input.REFERENCE_SCRUB_ENTRY).href)).scrubOpenClawHeartbeatHistory
  need(typeof baselineHistoryControl === 'function', 'unchanged-installed-history-control-required')
  if (!prepareOnly) {
    need(input.TOKEN_FILE && isAbsolute(input.TOKEN_FILE), 'private-access-only-file-required')
    const stat = lstatSync(input.TOKEN_FILE)
    need(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && (stat.mode & 0o077) === 0 && stat.uid === process.getuid(), 'private-owned-token-file-required')
    const grantParent = lstatSync(dirname(input.TOKEN_FILE))
    need(grantParent.isDirectory() && !grantParent.isSymbolicLink() && grantParent.uid === process.getuid() && (grantParent.mode & 0o077) === 0 && realpathSync(input.TOKEN_FILE) === input.TOKEN_FILE, 'private-grant-parent-required')
    token = readFileSync(input.TOKEN_FILE, 'utf8').trim()
    need(/^sk-ant-oat01-[A-Za-z0-9_-]+$/.test(token), 'supported-access-only-token-required')
    report.grantRead = true
    for (const name of ['log', 'error', 'warn', 'debug', 'info']) console[name] = () => {} // No account/init/raw diagnostic logs.
    observeQuery()
    deadline = setTimeout(() => {
      fail('native-gate-whole-run-deadline'); stopCurrentClient()
      for (const query of controls) { try { query.close() } catch (error) { fail('deadline-query-close-failed') } }
    }, 480_000)
    const pluginPath = join(output, 'plugins', 'fixture.mjs')
    writeFileSync(pluginPath, `const key=Symbol.for('meridian.openclaw769.native-fixture'); export default {
      name:'owned-native-heartbeat-observer', onRequest(ctx) {
        globalThis[key].request(ctx,ctx.messages); return ctx;
      }, onSession(ctx) {globalThis[key].session(ctx); return ctx;} };\n`, { mode: 0o600 })
    const pluginConfig = join(output, 'plugins.json')
    writeFileSync(pluginConfig, JSON.stringify({ plugins: [{ path: input.SCRUB_ENTRY, enabled: true }, { path: pluginPath, enabled: true }] }), { mode: 0o600 })
    const product = await import(pathToFileURL(input.MERIDIAN_ENTRY).href)
    startup = product.startProxyServer({ port: 0, host: '127.0.0.1', silent: true, backend: 'claude',
      profiles: [{ id: 'taskoauth', type: 'oauth-token', oauthToken: token }], defaultProfile: 'taskoauth',
      pluginDir: join(output, 'empty-plugins'), pluginConfigPath: pluginConfig, installProcessErrorHandlers: false })
      .then(proxy => {
        instance = proxy; startupSettled = true
        trackServer(proxy.server); proxy.server.once('close', () => { proxyClosed = true })
        return proxy
      }, error => { startupSettled = true; throw error })
    await bounded(startup, 30_000, 'proxy-start-deadline')
    const pluginsResponse = await fetch(`http://127.0.0.1:${instance.server.address().port}/plugins/list`, { signal: AbortSignal.timeout(5000) })
    need(pluginsResponse.ok, 'installed-plugin-status-unavailable')
    const installedPlugins = await pluginsResponse.json()
    need(installedPlugins.plugins?.some(plugin => plugin.name === 'openclaw-scrub' && plugin.status === 'active' && plugin.version === '0.1.0'), 'installed-scrub-not-active')
    relay = createServer((request, response) => {
      const handler = forward(request, response); handlers.add(handler)
      handler.then(() => handlers.delete(handler), () => { handlers.delete(handler); fail('relay-handler-rejection') })
    })
    trackServer(relay); relay.requestTimeout = 15_000; relay.headersTimeout = 10_000
    await bounded(new Promise((resolve, reject) => { relay.once('error', reject); relay.listen(0, '127.0.0.1', resolve) }), 5000, 'relay-listen-deadline')
    const config = { models: { mode: 'replace', providers: { meridian: { baseUrl: `http://127.0.0.1:${relay.address().port}`, apiKey: 'owned-local-fixture-key', api: 'anthropic-messages',
      models: [{ id: 'opus[1m]', name: 'Owned live gate', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000, maxTokens: 4096 }] } } },
      agents: { defaults: { workspace: join(output, 'client-work'), model: { primary: 'meridian/opus[1m]' }, envelopeTimestamp: 'off', memorySearch: { enabled: false }, thinkingDefault: 'off' } },
      tools: { allow: ['read'] }, plugins: { enabled: false }, gateway: { mode: 'local' } }
    writeFileSync(childEnv.OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
    await cli('config-validate', '/usr/local/bin/node', [input.OPENCLAW_BIN, 'config', 'validate'])
    const sessionId = randomUUID()
    for (const [stage, prompt] of [
      ['read-canary', poll + `\nControlled interactive test: your first action must be one read tool call to ${fixture}, before any assistant text. Do not explain the call. After the read, return the exact file contents, and nothing else.`],
      ['heartbeat-replay', poll + '\nControlled interactive test: return the same file receipt from the preceding read tool result. Do not call tools.'],
      ['ordinary-continuation', 'Return that same receipt again. Do not call tools.'],
    ]) {
      phase = stage
      const queryStart = report.queries.length
      const result = JSON.parse(await cli(stage, '/usr/local/bin/node', [input.OPENCLAW_BIN, 'agent', '--local', '--json', '--model', 'meridian/opus[1m]',
        '--session-id', sessionId, '--thinking', 'off', '--timeout', '110', '--message', prompt]))
      need(result.payloads?.some(payload => typeof payload.text === 'string' && payload.text.includes(receipt)), 'actual-client-receipt-missing-' + stage)
      need(result.meta?.completion?.stopReason !== 'error' && !result.meta?.aborted, 'actual-client-completion-failed-' + stage)
      await settleQueries()
      const queries = report.queries.slice(queryStart)
      need(queries.length > 0, 'real-query-missing-' + stage)
      const served = servedLocators.get(queries.at(-1))
      need(served?.terminal, 'actual-served-terminal-session-unverified-' + stage)
      const servedHistory = await supportedHistory(served)
      const rows = JSON.parse(servedHistory)
      const metrics = historyMetrics(rows.map(row => row.message ?? row))
      const facts = { stage, receiptInSupportedHistory: servedHistory.includes(receipt), metrics,
        anyResume: queries.some(query => query.resume), successfulActualClientReceipt: true }
      report.stages.push(facts)
      need(deliveredCalls.size > 0 && facts.receiptInSupportedHistory, 'actual-read-receipt-or-call-unverified-' + stage)
      need(metrics.ownedCallDigests.length > 0 && metrics.ownedResultDigests.length > 0 && metrics.ownedOrphanDigests.length === 0, 'supported-served-tool-pair-lost-' + stage)
      if (stage === 'read-canary') need(report.pluginObservations.some(row => row.phase === stage && row.raw?.polls === 1), 'actual-client-first-heartbeat-poll-unverified')
      if (stage === 'heartbeat-replay') {
        const observation = report.pluginObservations.find(row => row.phase === stage && row.raw?.polls >= 2)
        need(observation?.raw.ownedCallDigests.length > 0 && observation.raw.ownedOrphanDigests.length === 0, 'actual-client-heartbeat-raw-pair-unverified')
        if (input.EXPECT === 'candidate') {
          need(observation.transformed.polls >= 2 && observation.transformed.ownedOrphanDigests.length === 0, 'candidate-heartbeat-pair-or-polls-lost')
          need(observation.rawDigest === observation.effectiveDigest, 'candidate-tool-bearing-history-was-mutated')
          need(observation.reference.ownedOrphanDigests.length > 0, 'candidate-exact-history-did-not-exercise-original-pruning-defect')
        }
      }
      save()
    }
    need(report.requests.some(request => request.phase === 'read-canary' && request.toolReceiptPresent), 'real-client-read-result-request-missing')
    need(report.requests.every(request => request.status === 200 && request.responseJoined), 'native-response-not-complete')
    const init = children.flatMap(child => child.facts.nativeInit)
    need(init.length > 0 && init.every(event => event.version === '2.1.284' && event.model?.startsWith('claude-opus-5-5')), 'native-init-version-or-model-unverified')
    report.nativeModelInitWitnesses = init
    const finalPluginsResponse = await fetch(`http://127.0.0.1:${instance.server.address().port}/plugins/list`, { signal: AbortSignal.timeout(5000) })
    need(finalPluginsResponse.ok, 'final-installed-plugin-status-unavailable')
    const finalPlugins = await finalPluginsResponse.json()
    report.scrubHook = finalPlugins.plugins?.find(plugin => plugin.name === 'openclaw-scrub')?.stats?.hooks?.onRequest
    need(report.scrubHook?.invocations >= report.requests.length && report.scrubHook.errors === 0, 'installed-scrub-hook-witness-missing')
  }
} catch (error) { fail(error.message) }
finally {
  retired = true; clearTimeout(deadline)
  if (startup && !startupSettled) {
    try { await bounded(startup, 15_000, 'proxy-acquisition-settlement-deadline') }
    catch (error) { fail(error.message) }
  }
  for (const query of controls) { try { query.close() } catch (error) { fail('query-close-failed') } }
  if (currentClient) { const actor = childIndex.get(currentClient); if (actor) await stopAndJoinChild(currentClient, actor.witness, { graceMs: 3000, forceMs: 3000 }) }
  if (relay) {
    const closed = new Promise(resolve => relay.close(error => { if (error) fail('relay-close-error'); resolve() }))
    relay.closeIdleConnections()
    try { await bounded(closed, 3000, 'relay-close-deadline') }
    catch (error) { fail(error.message); for (const socket of sockets) socket.destroy(); await bounded(closed, 3000, 'relay-force-close-deadline').catch(error => fail(error.message)) }
  }
  if (instance) {
    try { await bounded(instance.close(), 15_000, 'proxy-close-deadline') }
    catch (error) { fail(error.message); for (const socket of sockets) socket.destroy() }
  }
  // Bun 1.3.11's Node HTTP shim can emit listener close/callback while its
  // observed socket wrappers omit close. Explicitly destroy the original
  // owned handles and still require their close events; never erase witnesses.
  for (const socket of sockets) socket.destroy()
  for (const actor of children) {
    const closure = await stopAndJoinChild(actor.child, actor.witness, { graceMs: 3000, forceMs: 3000 })
    report.children.push({ ...actor.facts, closure })
    if (!closure.joined || !actor.facts.stdinClosed) fail('owned-child-or-stdio-witness-missing')
  }
  try { await bounded(Promise.all(socketClosures), 3000, 'owned-socket-close-deadline'); await bounded(Promise.allSettled([...handlers]), 3000, 'owned-handler-close-deadline'); await bounded(Promise.allSettled([...reads]), 3000, 'supported-read-settlement-deadline') }
  catch (error) { fail(error.message) }
  report.startupSettled = !startup || startupSettled
  report.httpWitnesses = { proxyCloseSeen: proxyClosed, proxyListening: instance?.server.listening ?? false,
    relayListening: relay?.listening ?? false, remainingSockets: sockets.size, remainingHandlers: handlers.size,
    observedSocketCount: socketClosures.length }
  report.httpJoined = prepareOnly || (startupSettled && proxyClosed && (!relay || !relay.listening) && sockets.size === 0 && handlers.size === 0)
  report.queryJoins = prepareOnly || report.queries.every(query => query.constructed && query.iteratorSettled && query.closeCalled && query.publicSpawn)
  if (!report.httpJoined || !report.queryJoins) fail('native-actor-custody-incomplete')
  for (const spy of spies.reverse()) spy.mockRestore()
  delete globalThis[observationKey]
  report.baselineBugProved = input.EXPECT === 'baseline' && report.pluginObservations.some(row => row.phase === 'heartbeat-replay'
    && row.raw?.polls >= 2 && row.raw.ownedCallDigests.length > 0 && row.raw.ownedOrphanDigests.length === 0
    && row.transformed.ownedOrphanDigests.length > 0) && report.queries.some(query => query.phase === 'heartbeat-replay'
    && !query.resume && query.inputOwnedResultDigests.some(id => !query.inputOwnedCallDigests.includes(id)))
  if (!prepareOnly && input.EXPECT === 'baseline' && !report.baselineBugProved) fail('baseline-heartbeat-orphan-not-reproduced')
  report.disposition = prepareOnly && !report.firstFailure ? 'PASS_PREREQUISITES_ONLY'
    : report.baselineBugProved && report.httpJoined && report.queryJoins ? 'REPRODUCED_HEARTBEAT_ORPHAN_FAILURE_RETAINED'
    : report.firstFailure ? 'FAILED_NATIVE_GATE' : input.EXPECT === 'candidate' ? 'PASS_HEARTBEAT_TOOL_PAIR_AND_CONTINUATION_CLASSIFIER_HELD' : 'BASELINE_DID_NOT_REPRODUCE'
  save()
  process.stdout.write(JSON.stringify({ disposition: report.disposition, firstFailure: report.firstFailure, stages: report.stages.length, httpJoined: report.httpJoined, queryJoins: report.queryJoins }) + '\n')
  process.exitCode = report.firstFailure ? 1 : 0
  if (!report.httpJoined || !report.queryJoins || report.children.some(actor => !actor.closure.joined)) process.exit(1)
}

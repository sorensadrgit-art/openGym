// The importable flow: in sync with verify.js, no secret in it, wired the way the README says, and
// its Function node's code run as Node-RED runs it (an async function with msg, env, context, node
// and the `crypto` lib in scope), so the glue is tested, not only the verifier.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { render, verifierSource, GLUE, OUT, SECRET_ENV, PATH } from '../build-flow.mjs'
import { signature, newSecret } from '../../../api/integrations/crypto.js'
import { envelope, testData } from '../../../api/integrations/events.js'

const text = readFileSync(OUT, 'utf8')
const flow = JSON.parse(text)
const byId = Object.fromEntries(flow.map(n => [n.id, n]))

test('the committed JSON is what build-flow.mjs writes from verify.js', () => {
  assert.equal(text, render())
  assert.equal(byId.og_verify.func, verifierSource() + '\n' + GLUE)
  assert.match(byId.og_verify.func, /function verifyOpenGymWebhook/)
  assert.doesNotMatch(byId.og_verify.func, /module\.exports/)
})

test('no secret in the flow: it reads the environment', () => {
  assert.doesNotMatch(text, /ogwh_/)
  assert.ok(byId.og_verify.func.includes(`env.get('${SECRET_ENV}')`))
  assert.doesNotMatch(text, /"credentials"/)
})

test('wired as documented: raw POST in, crypto lib, two outputs, every failure answered', () => {
  assert.deepEqual([byId.og_in.method, byId.og_in.url, byId.og_in.skipBodyParsing], ['post', PATH, true])
  assert.deepEqual(byId.og_in.wires, [['og_verify']])
  assert.deepEqual(byId.og_verify.libs, [{ var: 'crypto', module: 'crypto' }])
  assert.deepEqual(byId.og_verify.wires, [['og_handle'], ['og_reply']])
  assert.ok(byId.og_handle.wires[0].includes('og_reply'))
  assert.deepEqual(byId.og_catch.scope.sort(), ['og_handle', 'og_verify'])
  assert.deepEqual(byId.og_failed.wires, [['og_reply']])
  assert.equal(byId.og_reply.type, 'http response')
  for (const n of flow) if (n.type !== 'tab') assert.equal(n.z, 'og_tab', n.id)
})

/** The Function node's code in a sandbox like Node-RED's 10-function.js gives it. */
function functionNode(code, { env = {} } = {}) {
  const store = {}, logs = []
  const sandbox = {
    Buffer, Date, console, crypto,
    env: { get: k => env[k] },
    context: { get: k => store[k], set: (k, v) => { store[k] = v } },
    node: { status: () => {}, warn: m => logs.push(['warn', m]), error: m => logs.push(['error', m]) },
  }
  const fn = vm.runInNewContext(`(async function (msg) {\n${code}\n})`, sandbox)
  return { run: msg => fn(msg), store, logs }
}

// Objects made inside the vm have its own prototypes; compare their JSON.
const plain = v => JSON.parse(JSON.stringify(v))
const SECRET = newSecret()
const now = Date.now()
const body = JSON.stringify(envelope({ id: 'evt_flow1', type: 'workout.finished', data: testData('workout.finished', now), at: now }))
const msgFor = (raw, header) => ({ payload: Buffer.from(raw), req: { headers: { 'x-opengym-signature': header } } })

test('the verify node: authentic goes to output 1, a forgery or a repeat to output 2 with a fixed body', async () => {
  const node = functionNode(byId.og_verify.func, { env: { [SECRET_ENV]: SECRET } })
  const [ok, refused] = await node.run(msgFor(body, signature(SECRET, body)))
  assert.equal(refused, null)
  assert.equal(ok.opengym.id, 'evt_flow1')
  const [, dup] = await node.run(msgFor(body, signature(SECRET, body)))
  assert.deepEqual(plain([dup.statusCode, dup.payload]), [200, { ok: true, duplicate: true }])
  const [, bad] = await node.run(msgFor(body, signature(newSecret(), body)))
  assert.deepEqual(plain([bad.statusCode, bad.payload]), [401, { error: 'unauthorized' }])
  assert.deepEqual(plain(Object.keys(node.store.opengymSeen)), ['k:evt_flow1'])
  assert.ok(node.logs.some(([lvl, m]) => lvl === 'warn' && /refused \(401\)/.test(m)))
  assert.ok(!JSON.stringify(node.logs).includes(SECRET), 'the secret is never logged')
})

test('the verify node without its secret answers 500 and logs why', async () => {
  const node = functionNode(byId.og_verify.func)
  const [, out] = await node.run(msgFor(body, signature(SECRET, body)))
  assert.deepEqual(plain([out.statusCode, out.payload]), [500, { error: 'receiver not configured' }])
  assert.ok(node.logs.some(([lvl, m]) => lvl === 'error' && /OPENGYM_WEBHOOK_SECRET/.test(m)))
})

test('the demo handler only describes the event and answers 200', async () => {
  const node = functionNode(byId.og_handle.func)
  const out = await node.run({ opengym: JSON.parse(body) })
  assert.deepEqual(plain([out.statusCode, out.payload]), [200, { ok: true, handled: 'workout.finished' }])
  assert.match(out.summary, /^Workout finished: Test workout, 3 sets$/)
})

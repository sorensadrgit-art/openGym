// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const mocks = vi.hoisted(() => ({ S: null, calls: [], routes: {} }))
vi.mock('../store/useStore.js', async () => {
  const React = await import('react')
  const listeners = new Set()
  const update = mut => { const S = structuredClone(mocks.S); mut(S); mocks.S = S; listeners.forEach(f => f()) }
  const useStore = selector => {
    const [, tick] = React.useReducer(x => x + 1, 0)
    React.useEffect(() => { listeners.add(tick); return () => listeners.delete(tick) }, [])
    return selector({ S: mocks.S, update })
  }
  return { useStore }
})
vi.mock('../store/useUI.js', () => ({ useUI: selector => selector({ toast: () => {} }) }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(async (path, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : undefined
    mocks.calls.push({ path, method: opts?.method || 'GET', body })
    const key = (opts?.method || 'GET') + ' ' + path.split('?')[0]
    const out = mocks.routes[key]
    if (!out) throw new Error('no route ' + key)
    const v = typeof out === 'function' ? out(body, path) : out
    if (v instanceof Error) throw v
    return v
  }),
}))
import NutriTraceCard from './NutriTraceCard.jsx'

const conn = { id: 'c1', provider: 'nutritrace', label: 'nt.example.com', status: 'connected', info: { host: 'nt.example.com' } }
const skyr = { id: '7', name: 'Skyr', brand: 'Arla', portion: 150, unit: 'g', basis: '100g',
  per100: { kcal: 63, proteinG: 11, carbohydrateG: 4, fatG: 0.2 }, perPortion: { kcal: 95, proteinG: 16.5, carbohydrateG: 6, fatG: 0.3 } }
const rice = { id: '9', name: 'Rice', brand: '', portion: 1, unit: 'cup', basis: null, per100: null, perPortion: { kcal: 205 } }

let host, root
beforeEach(() => {
  mocks.S = { workouts: [], unit: 'kg' }; mocks.calls = []; mocks.routes = {}
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const mount = async () => act(async () => { root.render(<NutriTraceCard day="2026-11-13" />) })
const $ = sel => host.querySelector(sel)
const type = (el, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
const click = async el => act(async () => el.click())

describe('NutriTrace card', () => {
  it('connects with an address and a token, sends them once, and clears the token field', async () => {
    mocks.routes['GET /api/integrations'] = { providers: [], connections: [] }
    mocks.routes['POST /api/integrations/connect'] = { connection: conn }
    await mount()
    expect($('[data-nt-state]').textContent).toBe('Not connected')
    type($('input[name=nt-url]'), 'https://nt.example.com')
    type($('input[name=nt-token]'), 'nt_pat_secret')
    expect($('input[name=nt-token]').type).toBe('password')
    await click($('[data-nt-connect]'))
    expect(mocks.calls.find(c => c.path === '/api/integrations/connect').body).toEqual({ provider: 'nutritrace', url: 'https://nt.example.com', token: 'nt_pat_secret' })
    expect($('[data-nt-state]').textContent).toBe('Connected')
    expect(host.textContent).not.toContain('nt_pat_secret')
  })

  it('shows the server\'s reason when connecting fails', async () => {
    mocks.routes['GET /api/integrations'] = { connections: [] }
    mocks.routes['POST /api/integrations/connect'] = () => new Error('Paste a NutriTrace API token (it starts with nt_pat_).')
    await mount()
    await click($('[data-nt-connect]'))
    expect($('[role=alert]').textContent).toContain('starts with nt_pat_')
  })

  it('searches, logs grams of a weighable food into the day, and explains one it cannot weigh', async () => {
    mocks.routes['GET /api/integrations'] = { connections: [conn] }
    mocks.routes['GET /api/integrations/nutritrace/foods'] = { foods: [skyr, rice], total: 2 }
    await mount()
    type($('input[name=nt-q]'), 'sky')
    await click($('[data-nt-search]'))
    expect(mocks.calls.at(-1).path).toBe('/api/integrations/nutritrace/foods?q=sky')
    expect(host.textContent).toContain('150 g · 95 kcal')
    expect($('[data-nt-food="9"]').textContent).toContain('only g or mL can go into the diary')
    expect($('[data-nt-food="9"] [data-nt-add]')).toBe(null)
    await click($('[data-nt-food="7"] [data-nt-add]'))
    const [entry] = Object.values(mocks.S.foodLog)
    expect(entry).toMatchObject({ d: '2026-11-13', meal: 'snack', name: 'Skyr', amount: 150, basis: 'g', src: { kind: 'nutritrace', id: '7' } })
    expect($('[data-nt-food="7"]').textContent).toContain('Added')
  })

  it('a refused token shows its reason and reloads the connection state', async () => {
    let loads = 0
    mocks.routes['GET /api/integrations'] = () => (++loads === 1 ? { connections: [conn] } : { connections: [{ ...conn, status: 'attention', lastError: { msg: 'NutriTrace refused the token.' } }] })
    mocks.routes['GET /api/integrations/nutritrace/foods'] = () => new Error('NutriTrace refused the token. Make a new one in NutriTrace and connect again.')
    await mount()
    await click($('[data-nt-search]'))
    expect($('[role=alert]').textContent).toContain('refused the token')
    expect($('[data-nt-state]').textContent).toBe('Needs attention')
  })

  it('checks and disconnects through the integration routes', async () => {
    mocks.routes['GET /api/integrations'] = { connections: [conn] }
    mocks.routes['POST /api/integrations/test'] = { ok: false, msg: 'The token needs the read:foods scope.' }
    mocks.routes['POST /api/integrations/disconnect'] = { ok: true }
    await mount()
    await click($('[data-nt-check]'))
    expect(mocks.calls.at(-1)).toMatchObject({ path: '/api/integrations/test', body: { id: 'c1' } })
    expect($('[role=alert]').textContent).toContain('read:foods')
    await click($('[data-nt-disconnect]'))
    expect(mocks.calls.at(-1)).toMatchObject({ path: '/api/integrations/disconnect', body: { id: 'c1' } })
    expect($('[data-nt-state]').textContent).toBe('Not connected')
  })
})

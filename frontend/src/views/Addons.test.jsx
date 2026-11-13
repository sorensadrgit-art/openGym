// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const mocks = vi.hoisted(() => ({ config: {}, result: null, calls: [], navs: [] }))
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector({ S: { workouts: [], unit: 'kg' }, config: mocks.config })
  return { useStore }
})
vi.mock('../lib/api.js', () => ({
  api: vi.fn(async url => {
    mocks.calls.push(url)
    if (mocks.result instanceof Error) throw mocks.result
    return mocks.result
  })
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => path => mocks.navs.push(path) }))
vi.mock('motion/react', async () => {
  const React = await import('react')
  return { motion: { header: ({ initial, animate, transition, ...rest }) => React.createElement('header', rest) },
    useReducedMotion: () => true }
})
import Addons from './Addons.jsx'

let host, root
beforeEach(() => {
  Object.assign(mocks, { config: {}, result: null, calls: [], navs: [] })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const mount = async () => act(async () => { root.render(<Addons />) })
const type = (el, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})

describe('Add-on lab is opt-in and read-only', () => {
  it('does not enable third-party lookups without the server flag', async () => {
    await mount()
    expect(host.textContent).toContain('Nutrition lookup')
    expect(host.textContent).toContain('ADDON_NUTRITION=1')
    expect(host.querySelector('button[data-lookup]').disabled).toBe(true)
    expect(mocks.calls).toEqual([])
    expect(host.textContent).toContain('preview only')
  })

  it('lookup is user-initiated and displays data without saving to workout state', async () => {
    mocks.config = { addons: { nutrition: true } }
    mocks.result = { food: { name: 'Test yogurt', barcode: '3017620422003',
      brand: 'Example', quantity: '100 g', grade: 'B', serving: '50 g',
      per100: { kcal: 0, proteinG: 5, carbohydrateG: 6, fatG: 1, sugarG: 2 },
      allergens: ['milk'], source: 'Open Food Facts' } }
    await mount()
    const input = host.querySelector('input[name=barcode]')
    expect(mocks.calls).toEqual([])
    type(input, '3017620422003')
    await act(async () => host.querySelector('button[data-lookup]').click())
    expect(mocks.calls).toEqual(['/api/addons/food?barcode=3017620422003'])
    expect(host.textContent).toContain('Test yogurt')
    expect(host.textContent).toContain('0 kcal')
  })
})

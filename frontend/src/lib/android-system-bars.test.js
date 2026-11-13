// The stylesheet's half of the safe-area contract: the page takes the larger of env() and the
// --native-sat/--native-sab variables a shell may pass. The Android shell that passed them is gone
// from this fork; the stylesheet rules stay, so a browser still gets env() as before.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const css = read('../index.css')

describe('the system bars in the stylesheet', () => {
  it('the stylesheet takes the larger of env() and what the app passes', () => {
    expect(css).toMatch(/--sat:max\(env\(safe-area-inset-top,0px\),var\(--native-sat,0px\)\);/)
    expect(css).toMatch(/--sab:max\(env\(safe-area-inset-bottom,0px\),var\(--native-sab,0px\)\);/)
  })

  it('nothing reads env(safe-area-inset-*) around the two variables', () => {
    const dir = new URL('../', import.meta.url)
    for (const f of readdirSync(dir).filter(n => n.endsWith('.css'))) {
      const uses = read('../' + f).match(/env\(safe-area-inset-[a-z]+/g) || []
      expect({ f, uses }).toEqual({ f, uses: f === 'index.css' ? ['env(safe-area-inset-bottom', 'env(safe-area-inset-top'] : [] })
    }
  })
})

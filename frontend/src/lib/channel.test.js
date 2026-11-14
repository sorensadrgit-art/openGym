// Who installs the updates: the sideloaded APK updates itself, Google Play and the App Store do it
// for their builds. The updater must never show in a store build (Play does not allow it).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  vi.stubEnv('VITE_MOBILE', '1')
  return { platform: 'android', answer: { channel: 'sideload' }, fail: false }
})

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => h.platform },
  registerPlugin: () => new Proxy({}, {
    get: (_, prop) => prop === 'then' ? undefined : async () => {
      if (h.fail) throw new Error('"Channel" plugin is not implemented on android')
      return h.answer
    },
  }),
}))

beforeEach(() => {
  vi.resetModules()
  h.platform = 'android'
  h.answer = { channel: 'sideload' }
  h.fail = false
})

describe('install channel', () => {
  it('the APK from GitHub updates itself', async () => {
    const { getChannel, selfUpdates } = await import('./channel.js')
    expect(await getChannel()).toBe('sideload')
    expect(await selfUpdates()).toBe(true)
  })

  it('the Google Play build does not', async () => {
    h.answer = { channel: 'play' }
    const { getChannel, selfUpdates } = await import('./channel.js')
    expect(await getChannel()).toBe('play')
    expect(await selfUpdates()).toBe(false)
  })

  it('the F-Droid build is updated by F-Droid and has no native scanner', async () => {
    h.answer = { channel: 'fdroid' }
    const { getChannel, selfUpdates, nativeScanner, gymReminderBuilt } = await import('./channel.js')
    expect(await getChannel()).toBe('fdroid')
    expect(await selfUpdates()).toBe(false)
    expect(await nativeScanner()).toBe(false)
    expect(await gymReminderBuilt()).toBe(true)
  })

  it('the APK and the Play build scan with ML Kit', async () => {
    let m = await import('./channel.js')
    expect(await m.nativeScanner()).toBe(true)
    vi.resetModules()
    h.answer = { channel: 'play' }
    m = await import('./channel.js')
    expect(await m.nativeScanner()).toBe(true)
  })

  it('an older APK without the plugin is a sideloaded one', async () => {
    h.fail = true
    const { getChannel } = await import('./channel.js')
    expect(await getChannel()).toBe('sideload')
  })

  it('the iPhone app is the App Store\'s', async () => {
    h.platform = 'ios'
    const { getChannel, selfUpdates } = await import('./channel.js')
    expect(await getChannel()).toBe('appstore')
    expect(await selfUpdates()).toBe(false)
  })

  it('the gym reminder is there unless the build left background location out', async () => {
    let m = await import('./channel.js')
    expect(await m.gymReminderBuilt()).toBe(true)
    vi.resetModules()
    h.answer = { channel: 'play', backgroundLocation: false }
    m = await import('./channel.js')
    expect(await m.getChannel()).toBe('play')
    expect(await m.gymReminderBuilt()).toBe(false)
    vi.resetModules()
    h.fail = true
    m = await import('./channel.js')
    expect(await m.gymReminderBuilt()).toBe(true)
  })

})

// Opt-in, read-only Open Food Facts adapter. No food, profile or workout data is persisted.
// The server sets the User-Agent that browsers cannot set themselves.
const FIELDS = 'code,product_name,brands,quantity,serving_size,nutrition_grades,nutriments,allergens_tags'
const API = 'https://world.openfoodfacts.org/api/v3.6/product'
const DEFAULT_AGENT = 'openGym-SorenFork/0.1 (https://github.com/sorensadrgit-art/openGym)'

export function barcodeProblem(value) {
  const code = String(value ?? '').trim()
  if (!/^\d+$/.test(code)) return 'Barcode must contain digits only'
  if (code.length < 8 || code.length > 14) return 'Barcode must contain 8 to 14 digits'
  return null
}

const short = (v, max = 120) => typeof v === 'string' ? v.trim().slice(0, max) : ''
const numeric = n => n == null || n === '' || !Number.isFinite(Number(n)) ? null : Number(n)

export function normalizeOpenFoodFacts(payload, barcode) {
  if (!payload || payload.status === 0 || payload.result?.id === 'product_not_found') return null
  const p = payload.product
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null
  const n = p.nutriments || {}
  // Only use numbers per 100 g/ml; serving values are not standardized across records.
  const allergens = Array.isArray(p.allergens_tags)
    ? [...new Set(p.allergens_tags.filter(a => typeof a === 'string').map(a => short(a.replace(/^[a-z]{2}:/i, ''), 35)).filter(Boolean))].slice(0, 12)
    : []
  const grade = typeof p.nutrition_grades === 'string' && /^[a-e]$/i.test(p.nutrition_grades)
    ? p.nutrition_grades.toUpperCase() : null
  return {
    barcode, name: short(p.product_name || p.product_name_en) || 'Unnamed product',
    brand: short(p.brands, 90), quantity: short(p.quantity, 50),
    serving: short(p.serving_size, 50), grade,
    per100: {
      kcal: numeric(n['energy-kcal_100g']),
      proteinG: numeric(n.proteins_100g),
      carbohydrateG: numeric(n.carbohydrates_100g),
      fatG: numeric(n.fat_100g),
      sugarG: numeric(n.sugars_100g),
    },
    allergens, source: 'Open Food Facts'
  }
}

export function createFoodLookup({
  fetchImpl = fetch, now = Date.now, ttlMs = 15 * 60 * 1000,
  userAgent = DEFAULT_AGENT, timeoutMs = 8000, maxEntries = 256
} = {}) {
  const cache = new Map()
  const pending = new Map()
  return async function lookupFood(raw) {
    const barcode = String(raw ?? '').trim()
    const problem = barcodeProblem(barcode)
    if (problem) return { status: 400, body: { error: problem } }
    const found = cache.get(barcode)
    if (found && now() < found.expires) return found.value
    if (pending.has(barcode)) return pending.get(barcode)
    const work = (async () => {
      try {
        const url = API + '/' + barcode + '.json?fields=' + FIELDS
        const response = await fetchImpl(url, {
          headers: { Accept: 'application/json', 'User-Agent': userAgent },
          signal: AbortSignal.timeout(timeoutMs)
        })
        if (!response.ok) return { status: 502, body: { error: 'Food lookup unavailable' } }
        const food = normalizeOpenFoodFacts(await response.json(), barcode)
        if (!food) return { status: 404, body: { error: 'Product not found' } }
        return { status: 200, body: { food } }
      } catch {
        return { status: 502, body: { error: 'Food lookup unavailable' } }
      }
    })()
    pending.set(barcode, work)
    try {
      const result = await work
      if (result.status === 200) {
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value)
        cache.set(barcode, { value: result, expires: now() + ttlMs })
      }
      return result
    } finally {
      pending.delete(barcode)
    }
  }
}

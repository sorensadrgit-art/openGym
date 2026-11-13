import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barcodeProblem, normalizeOpenFoodFacts, createFoodLookup } from '../addons/food.js'

test('barcodes are strictly numeric GTIN-sized strings, preserving leading zeros', () => {
  assert.equal(barcodeProblem('01234567'), null)
  assert.equal(barcodeProblem(' 3017620422003 '), null)
  assert.match(barcodeProblem('123'), /8 to 14/)
  assert.match(barcodeProblem('123456789012345'), /8 to 14/)
  assert.match(barcodeProblem('1234567x'), /digits/)
})

test('normalization preserves zero, distinguishes missing nutrition, and does not echo untrusted image URLs', () => {
  const result = normalizeOpenFoodFacts({
    result: { id: 'product_found' },
    product: {
      code: '3017620422003', product_name: 'Test cereal', brands: 'Sample Co',
      quantity: '400 g', nutrition_grades: 'b', serving_size: '40 g',
      nutriments: { 'energy-kcal_100g': '0', proteins_100g: 9.2, fat_100g: null,
        carbohydrates_100g: 13, sugars_100g: '2.1' },
      allergens_tags: ['en:milk', 'en:gluten'],
      image_url: 'https://not-licensed.example/img.jpg'
    }
  }, '3017620422003')
  assert.deepEqual(result, {
    barcode: '3017620422003', name: 'Test cereal', brand: 'Sample Co', quantity: '400 g',
    serving: '40 g', grade: 'B',
    per100: { kcal: 0, proteinG: 9.2, carbohydrateG: 13, fatG: null, sugarG: 2.1 },
    allergens: ['milk', 'gluten'], source: 'Open Food Facts'
  })
  assert.equal(normalizeOpenFoodFacts({ status: 0 }, '3017620422003'), null)
  assert.equal(normalizeOpenFoodFacts({ result: { id: 'product_not_found' } }, '3017620422003'), null)
})

test('the read-only lookup uses a fixed OFF domain, User-Agent, bounds, and a per-barcode cache', async () => {
  const calls = []
  let now = 1000
  const lookup = createFoodLookup({
    now: () => now, ttlMs: 1000, userAgent: 'openGym-SorenFork/0.1 (https://github.com/sorensadrgit-art/openGym)',
    fetchImpl: async (url, opts) => {
      calls.push([url, opts])
      return { ok: true, json: async () => ({ result: { id: 'product_found' },
        product: { product_name: 'Yogurt', nutriments: { proteins_100g: 4 } } }) }
    }
  })
  const first = await lookup('0123456789012')
  assert.equal(first.status, 200)
  assert.equal(first.body.food.name, 'Yogurt')
  assert.equal((await lookup('0123456789012')).body.food.name, 'Yogurt')
  assert.equal(calls.length, 1)
  assert.match(calls[0][0], /^https:\/\/world\.openfoodfacts\.org\/api\/v3\.6\/product\/0123456789012\.json\?fields=/)
  assert.match(calls[0][1].headers['User-Agent'], /openGym-SorenFork/)
  assert.equal((await lookup('xx')).status, 400)
  assert.equal(calls.length, 1)
  now += 1001
  await lookup('0123456789012')
  assert.equal(calls.length, 2)
})

test('a missing product and upstream failures return safe bounded results', async () => {
  const missing = createFoodLookup({ fetchImpl: async () => ({ ok: true,
    json: async () => ({ result: { id: 'product_not_found' } }) }) })
  assert.deepEqual(await missing('3017620422003'), { status: 404, body: { error: 'Product not found' } })
  const unavailable = createFoodLookup({ fetchImpl: async () => { throw new Error('secret network detail') } })
  assert.deepEqual(await unavailable('3017620422003'), { status: 502, body: { error: 'Food lookup unavailable' } })
})

test('simultaneous requests for one barcode make one upstream request', async () => {
  let calls = 0
  const lookup = createFoodLookup({ fetchImpl: async () => {
    calls++
    await new Promise(resolve => setImmediate(resolve))
    return { ok: true, json: async () => ({ result: { id: 'product_found' }, product: { product_name: 'A' } }) }
  } })
  const [a, b] = await Promise.all([lookup('3017620422003'), lookup('3017620422003')])
  assert.equal(calls, 1)
  assert.deepEqual(a, b)
})

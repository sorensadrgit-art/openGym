import { Suspense, lazy, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { todayISO } from '../lib/format.js'
import { workoutDay, workoutVolume } from '../lib/history.js'
import { trainingVolumeSeries } from '../lib/addon-trends.js'
import { previewActivityFile } from '../lib/addon-activity.js'
import './addons.css'

const TrendChart = lazy(() => import('../components/AddonTrendChart.jsx'))

const formatMetric = (value, unit) => value == null ? 'Not reported' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`

function Metric({ label, value, unit }) {
  return <div className="addon-metric">
    <span className="addon-metric-label">{label}</span>
    <strong>{formatMetric(value, unit)}</strong>
  </div>
}

const BASIS = { '100g': 'Values per 100 g, as the label states.', '100ml': 'Values per 100 mL, as the label states.' }

function FoodLookup({ enabled }) {
  const [barcode, setBarcode] = useState('')
  const [food, setFood] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const lookup = async ev => {
    ev.preventDefault()
    if (!enabled || loading) return
    const code = barcode.trim()
    if (!/^\d{8,14}$/.test(code)) { setFood(null); setError('Enter a barcode of 8 to 14 digits.'); return }
    setLoading(true); setFood(null); setError('')
    try {
      const response = await api('/api/addons/food?barcode=' + encodeURIComponent(code))
      if (!response?.food) throw new Error('Product not found')
      setFood(response.food)
    } catch (err) {
      setError(err?.message || 'Food lookup unavailable')
    } finally { setLoading(false) }
  }
  return <section className="addon-card" aria-labelledby="addon-food-title">
    <div className="addon-headline">
      <div><span className="addon-kicker">NUTRITION / READ ONLY</span><h2 id="addon-food-title">Nutrition lookup</h2></div>
      <span className="addon-state">{enabled ? 'Available' : 'Off by default'}</span>
    </div>
    <p>Look up a product's published nutrition per 100 g or mL using its barcode.</p>
    {!enabled && <p className="addon-note">Enable <code>ADDON_NUTRITION=1</code> in your server configuration to activate this lookup.</p>}
    <form onSubmit={lookup} className="addon-form">
      <label htmlFor="addon-barcode">Product barcode</label>
      <div className="addon-input-row">
        <input id="addon-barcode" name="barcode" type="text" inputMode="numeric" autoComplete="off"
          placeholder="3017620422003" maxLength={14} value={barcode} disabled={!enabled || loading}
          onChange={e => { setBarcode(e.target.value); setFood(null); setError('') }} />
        <button type="submit" data-lookup disabled={!enabled || loading}>{loading ? 'Looking up…' : 'Look up'}</button>
      </div>
    </form>
    {error && <p className="addon-error" role="alert">{error}</p>}
    {food && <div className="addon-food" aria-live="polite">
      <div className="addon-food-name"><strong>{food.name}</strong><span>{[food.brand, food.quantity].filter(Boolean).join(' · ')}</span></div>
      <div className="addon-metrics">
        <Metric label="Energy" value={food.per100?.kcal} unit="kcal" />
        <Metric label="Protein" value={food.per100?.proteinG} unit="g" />
        <Metric label="Carbs" value={food.per100?.carbohydrateG} unit="g" />
        <Metric label="Fat" value={food.per100?.fatG} unit="g" />
      </div>
      <p className="addon-footnote" data-basis>{BASIS[food.basis] || 'Per 100 g or mL, as the label states.'}</p>
      {food.allergens?.length > 0 && <p>Reported allergens: {food.allergens.join(', ')}</p>}
      <p className="addon-footnote">Source: Open Food Facts (ODbL database). Product data may be incomplete. Not a food diary entry.</p>
    </div>}
    <p className="addon-footnote">Nothing is sent on page load. Only the barcode you submit is looked up; no workout history is shared.</p>
  </section>
}

function ActivityPreview() {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pick = async ev => {
    const file = ev.target.files?.[0]
    if (!file) return
    setBusy(true); setResult(null); setError('')
    try { setResult(await previewActivityFile(file)) }
    catch (err) { setError(err?.message || 'Could not read this activity') }
    finally { setBusy(false); ev.target.value = '' }
  }
  return <section className="addon-card" aria-labelledby="addon-activity-title">
    <div className="addon-headline">
      <div><span className="addon-kicker">TRAINING / DEVICE-LOCAL</span><h2 id="addon-activity-title">Activity file preview</h2></div>
      <span className="addon-state">No upload</span>
    </div>
    <p>Inspect a FIT, TCX, or GPX activity file on this device before deciding what to do with it.</p>
    <label className="addon-picker">
      {busy ? 'Reading…' : 'Choose a GPX, TCX or FIT file'}
      <input type="file" accept=".gpx,.tcx,.fit" disabled={busy} onChange={pick} aria-label="Choose an activity file" />
    </label>
    {error && <p role="alert" className="addon-error">{error}</p>}
    {result && <div className="addon-file-summary" aria-live="polite">
      <strong>{result.filename}</strong><span>{result.kind}</span>
      <div className="addon-metrics">
        <Metric label="Distance" value={result.distanceKm} unit="km" />
        <Metric label="Duration" value={result.durationMinutes} unit="min" />
      </div>
    </div>}
    <p className="addon-footnote">Activity preview only: the file stays on your device. This does not import into workout history.</p>
  </section>
}

function TrainingInsights({ workouts, unit }) {
  const rows = useMemo(() => trainingVolumeSeries(workouts, {
    end: todayISO(), days: 14, dayOf: workoutDay, volumeOf: w => {
      const v = Number(w?.vol)
      return Number.isFinite(v) && v >= 0 ? v : workoutVolume(w)
    }
  }), [workouts])
  const total = rows.reduce((sum, row) => sum + row.volume, 0)
  return <section className="addon-card addon-trends" aria-labelledby="addon-trends-title">
    <div className="addon-headline"><div>
      <span className="addon-kicker">INSIGHTS / EXISTING DATA</span>
      <h2 id="addon-trends-title">Training volume</h2>
    </div><span className="addon-state">Last 14 days</span></div>
    {workouts.length ? <>
      <p><strong>{Math.round(total).toLocaleString()} {unit}</strong> of recorded training volume across this window.</p>
      <Suspense fallback={<p>Preparing chart…</p>}><TrendChart rows={rows} unit={unit} /></Suspense>
    </> : <p className="addon-empty">Complete a workout to see a real training-volume chart. No sample data is shown.</p>}
  </section>
}

const ROADS = [
  { name: 'Nutrition journal', status: 'Evaluation', detail: 'NutriTrace needs a reviewed, authenticated API adapter before syncing food entries.' },
  { name: 'Recipes and meal plans', status: 'Not connected', detail: 'Mealie can be connected as a separate recipe service.' },
  { name: 'Advanced progression', status: 'Research', detail: 'Liftosaur rules require an isolated evaluator and verified program behavior.' },
  { name: 'Endurance activities', status: 'Not connected', detail: 'FitTrackee is optional once activity previews prove useful.' },
  { name: 'Camera / sensor coaching', status: 'Hardware validation needed', detail: 'MediaPipe and Bluetooth device support require permission, calibration, and physical testing.' },
  { name: '3D anatomy explorer', status: 'Asset clearance needed', detail: 'Three.js / React Three Fiber need properly licensed anatomy geometry.' },
  { name: 'Automations and AI', status: 'Existing integrations first', detail: 'Use openGym webhooks and its coach before adding Node-RED or LangGraph.' },
]

function Roadmap() {
  return <section className="addon-card" aria-labelledby="addon-roadmap-title">
    <div className="addon-headline"><div>
      <span className="addon-kicker">INTEGRATIONS / TRANSPARENCY</span><h2 id="addon-roadmap-title">Extension roadmap</h2>
    </div></div>
    <p>These systems are not connected by this prototype. Adding a name here does not grant access to external services.</p>
    <div className="addon-roadmap">
      {ROADS.map(item => <div key={item.name} className="addon-roadmap-row"><div>
        <strong>{item.name}</strong><p>{item.detail}</p>
      </div><small>{item.status}</small></div>)}
    </div>
  </section>
}

export default function Addons() {
  const S = useStore(s => s.S)
  const config = useStore(s => s.config)
  const reduceMotion = useReducedMotion()
  const nav = useNavigate()
  // Back the way you came when there is a way, else up to where the Lab is listed (Settings).
  const back = () => ((window.history.state?.idx || 0) > 0 ? nav(-1) : nav('/settings/integrations', { replace: true }))
  const workouts = Array.isArray(S?.workouts) ? S.workouts : []
  return <main className="addons-page">
    <button type="button" className="sp-back addons-back" onClick={back}><Icon name="chevronLeft" /><span>Integrations</span></button>
    <motion.header className="addons-hero" initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26 }}>
      <span className="addon-kicker">OPENGYM / EXTENSION LAB</span>
      <h1>More ways to train. <span>Under your control.</span></h1>
      <p>Optional, isolated additions to the tracker. Existing workout records are not changed here.</p>
    </motion.header>
    <div className="addons-layout">
      <TrainingInsights workouts={workouts} unit={S?.unit || 'kg'} />
      <FoodLookup enabled={config?.addons?.nutrition === true} />
      <ActivityPreview />
      <Roadmap />
    </div>
  </main>
}

# Optional openGym extensions — Soren fork

This document tracks **implemented functionality**, **verified boundaries**, and **work still required**.
It is not a claim that every referenced service is installed, licensed, or connected.

## Current implementation

The **Extension Lab** is reached through Settings → Integrations → Extension lab, or `/#/addons`.

| Feature | Actual behavior | Privacy / readiness |
| --- | --- | --- |
| Training-volume charts | Existing workout data, grouped by workout date and displayed using ECharts | Local read-only analytics; no fabricated workouts, charts load only when opened |
| Food product lookup | User enters a GTIN barcode; the authenticated server retrieves fields from the official Open Food Facts API | **Off by default**; sends the barcode only when explicitly submitted; no workout/user history transmitted |
| GPX, TCX, FIT activity preview | Browser reads a selected local file with sports-lib and shows distance and duration | File remains on the device and **is not yet imported or synced** to openGym's history |
| Transition animations | Motion is loaded with the optional lab; reduced-motion preference respected | No app-wide navigation changes |

The other products mentioned in the research catalog are **not integrated** by displaying them in the roadmap. Do not imply otherwise.

### Enable the nutrition lookup

Edit the openGym server's `.env`, add:

```dotenv
ADDON_NUTRITION=1
OPEN_FOOD_FACTS_USER_AGENT=openGym-SorenFork/0.1 (https://github.com/sorensadrgit-art/openGym)
```

Recreate the server container with the **fork's source code**: `docker compose up -d --build`. Do not use the upstream prebuilt `ghcr.io/duartesantos8/opengym-api:latest` image for this feature; it does not include the fork changes. Verify `GET /api/config` reports `addons: { nutrition: true }` only to a signed-in session.

All other instances remain unchanged. Requests are strictly 8–14 decimal barcode digits, limited to 12 lookups per minute per signed-in profile, time out after eight seconds, and use a bounded fifteen-minute cache. The lookup is read-only and returns a restricted set of nutritional fields without third-party image URLs.

**Open Food Facts rights:** its database uses ODbL, individual contents DbCL, product images CC-BY-SA. Attributions and database terms matter if exporting or reusing its data. Nutrition entries can be incomplete or inaccurate; verify labels. [Official data terms](https://world.openfoodfacts.org/data).

### Run the checks

```bash
cd api && npm ci --omit=optional && node --test test/addons-food.test.js test/server-addon-food.test.js && npm test
cd ../frontend && npm ci && npx vitest run src/lib/addon-trends.test.js src/lib/addon-activity.test.js src/views/Addons.test.jsx
npm test && npm run build
```

The activity preview currently supports files <=15 MiB and displays a summary only. **It does not write to openGym's existing workout collection.** Integrating imported activities requires an explicit conversion model, deduplication, permissions, and device-to-server synchronization tests.

### Optional services and planned integration boundaries

| Component | Chosen integration | Current status and acceptance gate |
| --- | --- | --- |
| NutriTrace | Standalone nutrition service; scoped federation API, per-user consent, isolated credentials | Not connected; prove backups, migrations, authentication, idempotent food writes |
| Mealie | Recipe/meal-plan REST adapter, server-side keys | Not connected; need configured instance, permissions, and recipe data ownership |
| FitTrackee | Optional endurance service, independent database | Not connected; prove activity identifiers and round-trip import mapping |
| Liftosaur | Preserve existing openGym rule engine; evaluate Liftoscript in isolated module | Not connected; deterministic rule evaluation and migration needed |
| MediaPipe | On-device permission-based pose estimation | Not connected; requires camera permission, calibrated placement, confidence and rep-count tests; no medical claims |
| Capacitor BLE | Pair only supported named devices with explicit authorization | Not connected; requires physical hardware, Android/iOS build and permissions |
| R3F / Drei / Three.js | Optional route with separately licensed anatomy assets | Not connected; clear model rights, performance and accessibility gates |
| BodyParts3D | Selected anatomy meshes with explicit attribution | Assets deliberately not imported pending license review (CC-BY-SA-2.1 JP) |
| Node-RED | Separate opt-in automation service fed by openGym's existing signed webhooks | Not connected; verify event signatures, loop protection, secret handling |
| LangGraph.js | Optional durable multi-step AI coach workflows | Not connected; existing coach is kept until evaluation proves a gap |
| Ollama | Existing openGym supported OpenAI-compatible provider | No new runtime deployed; operator supplies a suitable local model and verifies results |
| Sports2D / OpenSim | Specialist video analysis or simulation services | Not connected; separately validated use cases and licensing |

For each integration: install only when it solves a defined problem; keep secrets server-side, use per-user authorization, store provenance, avoid accidental export of personal records, retain backups, and test failure/retry/rollback paths.

**Code license:** openGym is AGPL. Its bundled exercise graphics and animations are **not** covered by AGPL: the third-party Gym visual media has special terms, and a commercial fork needs appropriate licenses or original replacements. See [NOTICE.md](../NOTICE.md) before using the fork commercially or changing exercise media.

### Deployment and update policy

Keep upstream at `DuarteSantos8/openGym` and your modifications on a separate feature branch until reviewed. Never deploy a feature branch to the public endpoint or overwrite an existing `./data` directory automatically. Backup the live `./data` directory before any tested release, verify migrations, use a staging hostname with appropriate passkey `RP_ID` and `ORIGIN`, and deploy only after explicit production approval.

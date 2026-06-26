/**
 * import-osm-restaurants.mjs
 *
 * Merges restaurants-osm.json (produced by sync-osm-restaurants.mjs) into
 * the region JSON files so they appear in the main browsable place list,
 * not only in the NearbyRestaurants widget.
 *
 * Parents will judge suitability themselves — all restaurant types are
 * included; family amenities (highchair, playground, etc.) are a bonus
 * reflected in the familyAmenities field, not a gate.
 *
 * Deduplication: exact name → partial name → coord proximity < 300 m.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED_DIR = path.join(ROOT, 'src', 'generated')
const OSM_FILE = path.join(GENERATED_DIR, 'restaurants-osm.json')

const regionFiles = {
  '北部': 'places-north.json',
  '中部': 'places-central.json',
  '南部': 'places-south.json',
  '東部': 'places-east.json',
  '離島': 'places-islands.json',
}

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dl = (v) => v * Math.PI / 180
  const a = Math.sin(dl(lat2 - lat1) / 2) ** 2
    + Math.cos(dl(lat1)) * Math.cos(dl(lat2)) * Math.sin(dl(lng2 - lng1) / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function normalize(name) {
  return name.replace(/臺/g, '台').replace(/（/g, '(').replace(/）/g, ')').trim()
}

async function loadJson(filepath) {
  try {
    return JSON.parse(await fs.readFile(filepath, 'utf-8'))
  } catch {
    return []
  }
}

async function main() {
  const osmRestaurants = await loadJson(OSM_FILE)
  if (!osmRestaurants.length) {
    console.log('No OSM restaurants found. Run npm run sync:osm-restaurants first.')
    process.exit(1)
  }
  console.log(`OSM restaurants: ${osmRestaurants.length}`)

  // Load all existing places for dedup
  const allExisting = []
  for (const filename of Object.values(regionFiles)) {
    allExisting.push(...await loadJson(path.join(GENERATED_DIR, filename)))
  }
  console.log(`Existing places (all types): ${allExisting.length}`)

  const existingNames = new Set(allExisting.map((p) => normalize(p.name)))
  // Coord proximity check only against existing restaurants (not attractions)
  const existingRestaurants = allExisting.filter((p) => p.placeType === '餐飲')

  function isDupe(name, lat, lng) {
    const n = normalize(name)
    if (existingNames.has(n)) return true
    // Partial name overlap (catch minor spelling variants)
    if ([...existingNames].some((en) => n.length > 3 && en.length > 3 && (n.includes(en) || en.includes(n)))) return true
    // Coordinate proximity < 300 m — restaurants only (don't filter out a café because a park is nearby)
    if (existingRestaurants.some((p) => p.lat && p.lng && distKm(lat, lng, p.lat, p.lng) < 0.3)) return true
    return false
  }

  // Group incoming OSM restaurants by region
  const toAdd = { '北部': [], '中部': [], '南部': [], '東部': [], '離島': [] }
  let skipped = 0

  for (const r of osmRestaurants) {
    if (!r.name || !r.lat || !r.lng || !r.region) { skipped++; continue }
    if (isDupe(r.name, r.lat, r.lng)) { skipped++; continue }

    toAdd[r.region].push(r)
    existingNames.add(normalize(r.name))
  }

  let totalAdded = 0
  for (const [region, newPlaces] of Object.entries(toAdd)) {
    if (newPlaces.length === 0) continue
    const filename = regionFiles[region]
    const existing = await loadJson(path.join(GENERATED_DIR, filename))
    const updated = [...existing, ...newPlaces]
    await fs.writeFile(
      path.join(GENERATED_DIR, filename),
      JSON.stringify(updated, null, 2) + '\n',
      'utf-8',
    )
    console.log(`${filename}: +${newPlaces.length} OSM restaurants (total ${updated.length})`)
    totalAdded += newPlaces.length
  }

  console.log(`\nDone — added ${totalAdded}, skipped ${skipped}`)
}

main().catch((err) => { console.error(err); process.exit(1) })

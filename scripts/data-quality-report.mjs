import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED_DIR = path.join(ROOT, 'src', 'generated')
const REPORT_FILE = path.join(ROOT, 'docs', 'data-quality-report.md')

const REGION_FILES = {
  北部: 'places-north.json',
  中部: 'places-central.json',
  南部: 'places-south.json',
  東部: 'places-east.json',
  離島: 'places-islands.json',
}

const AMENITY_KEYS = [
  ['accessibility', '無障礙'],
  ['ramp', '坡道'],
  ['nursingRoom', '哺乳室'],
  ['diaperTable', '尿布台'],
  ['familyRestroom', '親子廁所'],
  ['parking', '停車'],
  ['strollerFriendly', '推車友善'],
]

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(GENERATED_DIR, file), 'utf8'))
  } catch {
    return fallback
  }
}

function countBy(items, getter) {
  const result = new Map()
  for (const item of items) {
    const key = getter(item) || '未分類'
    result.set(key, (result.get(key) || 0) + 1)
  }
  return Object.fromEntries([...result.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'zh-Hant')))
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function markdownTable(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const line = `| ${headers.join(' | ')} |`
  const sep = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${headers.map((header) => row[header]).join(' | ')} |`)
  return [line, sep, ...body].join('\n')
}

function assertQuality({ allPlaces, featured, restaurantsFeatured, meta }) {
  const failures = []
  const first50 = featured.slice(0, 50)
  const first50Attractions = first50.filter((place) => place.placeType === '景點').length
  const amenityCoverage = meta.amenityCoverage || {}
  const restaurantTiers = countBy(restaurantsFeatured, (place) => place.restaurantTier)

  if (allPlaces.length < 5000) failures.push(`總資料量過低：${allPlaces.length} < 5000`)
  if (featured.length < 250) failures.push(`首頁精選過低：${featured.length} < 250`)
  if (first50Attractions < 35) failures.push(`首頁前 50 筆景點比例過低：${first50Attractions}/50`)
  if (restaurantsFeatured.length < 200) failures.push(`親子餐廳精選過低：${restaurantsFeatured.length} < 200`)
  if ((amenityCoverage.nursingRoom || 0) < 250) failures.push(`哺乳室覆蓋過低：${amenityCoverage.nursingRoom || 0} < 250`)
  if ((amenityCoverage.diaperTable || 0) < 150) failures.push(`尿布台覆蓋過低：${amenityCoverage.diaperTable || 0} < 150`)
  if (!restaurantTiers.family_verified && !restaurantTiers.mall_food_court) {
    failures.push('餐廳分層缺少 family_verified / mall_food_court')
  }

  return failures
}

async function main() {
  const regionPlaces = []
  for (const file of Object.values(REGION_FILES)) {
    regionPlaces.push(...await readJson(file, []))
  }
  const featured = await readJson('places-featured.json', [])
  const restaurantsFeatured = await readJson('restaurants-featured.json', [])
  const meta = await readJson('sync-meta.json', {})

  const qualityValues = regionPlaces.map((place) => Number(place.qualityScoreV2 ?? place.qualityScore ?? 0))
  const placeTypeCounts = countBy(regionPlaces, (place) => place.placeType)
  const categoryCounts = countBy(regionPlaces, (place) => place.category)
  const restaurantTierCounts = countBy(regionPlaces.filter((place) => place.placeType === '餐飲'), (place) => place.restaurantTier)
  const featuredCounts = countBy(featured, (place) => place.placeType)
  const first50Counts = countBy(featured.slice(0, 50), (place) => place.placeType)

  const regionRows = Object.entries(REGION_FILES).map(([region, file]) => {
    const records = regionPlaces.filter((place) => {
      if (place.region === region) return true
      return false
    })
    return {
      地區: region,
      筆數: records.length,
      景點: records.filter((place) => place.placeType === '景點').length,
      餐飲: records.filter((place) => place.placeType === '餐飲').length,
      活動: records.filter((place) => place.placeType === '活動').length,
      檔案: file,
    }
  })

  const amenityRows = AMENITY_KEYS.map(([key, label]) => ({
    設施: label,
    確認筆數: meta.amenityCoverage?.[key] ?? regionPlaces.filter((place) => place.familyAmenities?.[key] === 'confirmed').length,
    官方比對: meta.officialAmenityMatches?.[key] ?? 0,
  }))

  const failures = assertQuality({
    allPlaces: regionPlaces,
    featured,
    restaurantsFeatured,
    meta,
  })

  const generatedAt = new Date().toISOString()
  const report = `# HolidayGoWhere Data Quality Report

Generated at: ${generatedAt}

## Summary

- 總資料量：${regionPlaces.length}
- 首頁精選：${featured.length}
- 親子餐廳精選：${restaurantsFeatured.length}
- qualityScoreV2 中位數：${median(qualityValues)}
- 檢查結果：${failures.length ? `未通過（${failures.length} 項）` : '通過'}

## Place Type Mix

${markdownTable(Object.entries(placeTypeCounts).map(([類型, 筆數]) => ({ 類型, 筆數 })))}

## Featured Mix

${markdownTable(Object.entries(featuredCounts).map(([類型, 筆數]) => ({ 類型, 筆數 })))}

## First 50 Featured

${markdownTable(Object.entries(first50Counts).map(([類型, 筆數]) => ({ 類型, 筆數 })))}

## Region Coverage

${markdownTable(regionRows)}

## Family Amenity Coverage

${markdownTable(amenityRows)}

## Restaurant Tiers

${markdownTable(Object.entries(restaurantTierCounts).map(([分層, 筆數]) => ({ 分層, 筆數 })))}

## Top Categories

${markdownTable(Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([分類, 筆數]) => ({ 分類, 筆數 })))}

${failures.length ? `## Failures\n\n${failures.map((item) => `- ${item}`).join('\n')}\n` : ''}
`

  await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true })
  await fs.writeFile(REPORT_FILE, report, 'utf8')
  console.log(report)

  if (process.argv.includes('--check') && failures.length) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

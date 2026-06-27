import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED_DIR = path.join(ROOT, 'src', 'generated')
const CACHE_FILE = path.join(GENERATED_DIR, 'wikimedia-images-cache.json')

const REGION_FILES = [
  'places-north.json',
  'places-central.json',
  'places-south.json',
  'places-east.json',
  'places-islands.json',
]
const FEATURED_FILE = 'places-featured.json'
const USER_AGENT = 'HolidayGoWhere/2.0 (wikimedia-image-sync; https://github.com/donald5043/HolidayGoWhere)'

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Number(process.env.WIKIMEDIA_IMAGE_LIMIT || 800)
const REFRESH = process.argv.includes('--refresh')

const WIKI_RE = /wikimedia\.org|wikipedia\.org/i
const BAD_TITLE_RE = /消歧義|列表|一覽|分類/
const PLACE_SUFFIX_RE =
  /國家森林遊樂區|國家風景區|國家公園|地質公園|森林遊樂區|自然教育中心|教育園區|親子公園|共融遊戲場|觀光工廠|文化園區|文創園區|文化館|博物館|美術館|紀念館|展示館|故事館|遊客中心|公園|園區|農場|牧場|漁港|老街|步道|車站|驛站|海水浴場/g

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(GENERATED_DIR, file), 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(file, data) {
  await fs.writeFile(path.join(GENERATED_DIR, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function canonicalName(name) {
  return cleanText(name)
    .replace(/^(?:臺灣|台灣)[：:\s-]*/u, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[－—–-]\s*.*$/g, '')
    .trim()
}

function normalized(value) {
  return canonicalName(value)
    .normalize('NFKC')
    .replace(/臺/g, '台')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase()
}

function nameCandidates(place) {
  const base = canonicalName(place.name)
  return [...new Set([
    base,
    base.split(/[_｜|／/]/)[0],
    base.replace(PLACE_SUFFIX_RE, ''),
  ]
    .map(normalized)
    .filter((item) => item.length >= 3))]
}

function titleMatchesPlace(title, place) {
  const titleKey = normalized(title)
  if (!titleKey || BAD_TITLE_RE.test(title)) return false
  return nameCandidates(place).some((candidate) => {
    if (titleKey === candidate) return true
    if (candidate.length >= 5 && titleKey.includes(candidate)) return true
    if (titleKey.length >= 5 && candidate.includes(titleKey)) return true
    return false
  })
}

function isWeakImage(url) {
  return !url || /images\.unsplash|place-fallback|no[-_]?image|default[-_]?image|q-pang-placeholder/i.test(url)
}

function hasWikimedia(url) {
  return WIKI_RE.test(url || '')
}

function uniqueImages(urls) {
  return [...new Set((urls || []).filter(Boolean))]
}

function uniqueHttpUrls(urls) {
  return uniqueImages(urls).filter((url) => /^https?:\/\//.test(url))
}

async function requestJson(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/json',
    },
  })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.json()
}

function scorePage(page, place) {
  const title = cleanText(page.title)
  const titleKey = normalized(title)
  const nameKey = normalized(place.name)
  const shortNameKey = normalized(canonicalName(place.name).replace(PLACE_SUFFIX_RE, ''))
  let score = 0

  if (titleKey === nameKey) score += 90
  if (shortNameKey && titleKey === shortNameKey) score += 70
  if (shortNameKey && (titleKey.includes(shortNameKey) || shortNameKey.includes(titleKey))) score += 30
  if (title.includes(place.city)) score += 10
  if (BAD_TITLE_RE.test(title)) score -= 100
  if (!titleMatchesPlace(title, place)) score -= 100
  if (page.pageprops?.disambiguation !== undefined) score -= 100
  if (page.original?.source || page.thumbnail?.source) score += 20
  if (page.pageprops?.wikibase_item) score += 10

  return score
}

function filePathUrl(filename) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1400`
}

async function wikidataImages(qid) {
  if (!qid) return []
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`
  const payload = await requestJson(url)
  const entity = payload.entities?.[qid]
  const claims = entity?.claims?.P18 || []
  return claims
    .map((claim) => claim.mainsnak?.datavalue?.value)
    .filter(Boolean)
    .slice(0, 3)
    .map(filePathUrl)
}

async function findImages(place) {
  const query = `${canonicalName(place.name)} ${place.city} 景點`
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '5',
    prop: 'pageimages|pageprops|info',
    piprop: 'original|thumbnail',
    pithumbsize: '1400',
    inprop: 'url',
  })
  const payload = await requestJson(`https://zh.wikipedia.org/w/api.php?${params.toString()}`)
  const pages = Object.values(payload.query?.pages || {})
    .map((page) => ({ ...page, _score: scorePage(page, place) }))
    .filter((page) => page._score >= 55 && titleMatchesPlace(page.title, place))
    .sort((a, b) => b._score - a._score)

  const best = pages[0]
  if (!best) return { urls: [], pageTitle: '', wikidataId: '' }

  const wikidataId = best.pageprops?.wikibase_item || ''
  const urls = uniqueHttpUrls([
    best.original?.source,
    best.thumbnail?.source,
    ...await wikidataImages(wikidataId).catch(() => []),
  ]).slice(0, 4)

  return {
    urls,
    pageTitle: best.title,
    wikidataId,
  }
}

function cacheKey(place) {
  return `${place.id}:${place.name}`
}

function cacheIsUsable(place, cached) {
  if (!cached) return false
  if (!cached.urls?.length && !cached.pageTitle) return true
  return Boolean(cached.pageTitle && titleMatchesPlace(cached.pageTitle, place))
}

function targetScore(place, featuredIds, cache) {
  if (place.placeType !== '景點') return -1
  const cached = cache[cacheKey(place)]
  const hasWikiImage = hasWikimedia(place.image) || (place.imageCandidates || []).some(hasWikimedia)
  if (hasWikiImage && cacheIsUsable(place, cached)) return -1

  let score = Number(place.qualityScoreV2 ?? place.qualityScore ?? 0)
  if (featuredIds.has(place.id)) score += 50
  if (hasWikiImage && !cacheIsUsable(place, cached)) score += 40
  if (isWeakImage(place.image)) score += 30
  if (!(place.imageCandidates || []).length) score += 8
  if (/國家公園|森林遊樂區|博物館|美術館|文化園區|觀光工廠|公園|老街|步道/.test(place.name + place.category)) score += 10
  return score
}

function stripWikimedia(place) {
  const next = {
    ...place,
    imageCandidates: uniqueImages(place.imageCandidates || []).filter((url) => !hasWikimedia(url)),
    sources: (place.sources || []).filter((source) => source.type !== 'Wikipedia' && !WIKI_RE.test(source.url || '')),
  }
  if (hasWikimedia(next.image)) {
    next.image = next.imageCandidates[0] || ''
    next.imageCandidates = next.imageCandidates.slice(1)
  }
  return next
}

function applyImages(place, cached) {
  const originalPlace = place
  place = stripWikimedia(place)

  if (!cached?.pageTitle || !titleMatchesPlace(cached.pageTitle, place)) {
    return { place, changed: JSON.stringify(place) !== JSON.stringify(originalPlace) }
  }

  const urls = uniqueHttpUrls(cached?.urls || [])
  if (!urls.length) {
    return { place, changed: JSON.stringify(place) !== JSON.stringify(originalPlace) }
  }

  const currentCandidates = uniqueImages(place.imageCandidates || [])
  const shouldPromote = isWeakImage(place.image)
  const next = {
    ...place,
    image: shouldPromote ? urls[0] : place.image,
    imageCandidates: shouldPromote
      ? uniqueImages([...urls.slice(1), ...currentCandidates]).slice(0, 5)
      : uniqueImages([...urls, ...currentCandidates]).slice(0, 6),
  }

  const sourceUrl = cached.pageTitle
    ? `https://zh.wikipedia.org/wiki/${encodeURIComponent(cached.pageTitle.replace(/ /g, '_'))}`
    : `https://www.wikidata.org/wiki/${cached.wikidataId}`
  if (!next.sources?.some((source) => source.url === sourceUrl)) {
    next.sources = [
      ...(next.sources || []),
      { type: 'Wikipedia', label: cached.pageTitle ? `Wikipedia：${cached.pageTitle}` : `Wikidata：${cached.wikidataId}`, url: sourceUrl },
    ]
  }

  return { place: next, changed: JSON.stringify(next) !== JSON.stringify(originalPlace) }
}

async function main() {
  const cache = await readJson('wikimedia-images-cache.json', {})
  const featured = await readJson(FEATURED_FILE, [])
  const featuredIds = new Set(featured.map((place) => place.id))
  const regionData = Object.fromEntries(await Promise.all(REGION_FILES.map(async (file) => [file, await readJson(file, [])])))
  const allPlaces = Object.values(regionData).flat()

  const targets = allPlaces
    .map((place) => ({ place, score: targetScore(place, featuredIds, cache) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT)

  let lookedUp = 0
  let cacheHits = 0
  let found = 0
  for (const { place } of targets) {
    const key = cacheKey(place)
    if (!REFRESH && cacheIsUsable(place, cache[key])) {
      cacheHits += 1
      continue
    }
    try {
      const result = await findImages(place)
      cache[key] = {
        ...result,
        checkedAt: new Date().toISOString(),
      }
      if (result.urls.length) found += 1
    } catch (error) {
      cache[key] = {
        urls: [],
        pageTitle: '',
        wikidataId: '',
        error: String(error.message || error),
        checkedAt: new Date().toISOString(),
      }
    }
    lookedUp += 1
    if (lookedUp % 25 === 0) {
      console.log(`Wikimedia lookup ${lookedUp}/${targets.length}, found ${found}, cache hits ${cacheHits}`)
      await fs.writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
    }
    await sleep(120)
  }

  let changedPlaces = 0
  const updatedById = new Map()
  for (const [file, places] of Object.entries(regionData)) {
    const nextPlaces = places.map((place) => {
      const applied = applyImages(place, cache[cacheKey(place)])
      if (applied.changed) {
        changedPlaces += 1
        updatedById.set(place.id, applied.place)
      }
      return applied.place
    })
    await writeJson(file, nextPlaces)
  }

  const nextFeatured = featured.map((place) => {
    const updated = updatedById.get(place.id)
    return updated ? { ...place, image: updated.image, imageCandidates: updated.imageCandidates, sources: updated.sources } : place
  })
  await writeJson(FEATURED_FILE, nextFeatured)
  await fs.writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')

  console.log(`Wikimedia targets: ${targets.length}`)
  console.log(`Looked up: ${lookedUp}, cache hits: ${cacheHits}, found: ${found}`)
  console.log(`Updated places: ${changedPlaces}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

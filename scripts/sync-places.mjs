import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_DIR = path.join(ROOT, 'src', 'generated')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'places.json')
const META_FILE = path.join(OUTPUT_DIR, 'sync-meta.json')
const SOURCE_URL =
  process.env.ATTRACTION_SOURCE_URL ||
  'https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip'
const MAX_PLACES = Number(process.env.MAX_PLACES || 1200)

const regions = {
  北部: ['臺北市', '台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣'],
  中部: ['苗栗縣', '臺中市', '台中市', '彰化縣', '南投縣', '雲林縣'],
  南部: ['嘉義市', '嘉義縣', '臺南市', '台南市', '高雄市', '屏東縣'],
  東部: ['宜蘭縣', '花蓮縣', '臺東縣', '台東縣'],
  離島: ['澎湖縣', '金門縣', '連江縣'],
}

const familyRules = [
  [/親子|兒童|幼兒|童玩|遊戲場|共融/, 12],
  [/動物園|水族館|海生館|昆蟲|蝴蝶|生態園區/, 10],
  [/科學館|博物館|美術館|故事館|探索館|文化館|展示館|紀念館/, 8],
  [/觀光工廠|休閒農場|農場|牧場|果園|採果/, 8],
  [/森林遊樂區|遊樂園|樂園|主題園區|遊憩區/, 8],
  [/公園|植物園|花園|綠園道|河濱|濕地/, 6],
  [/圖書館|閱讀館|書屋/, 6],
  [/鐵道|火車|車站|航空|船舶/, 5],
  [/步道|瀑布|湖|海灘|沙灘|自然教育|環境教育/, 4],
  [/DIY|體驗|互動|手作|戲水|溜滑梯|野餐/, 5],
]

const negativeRules = [
  [/陵墓|公墓|納骨|殯葬/, -20],
  [/夜店|酒吧|酒店|賭場/, -20],
  [/百岳|攀岩|溯溪|斷崖|危險水域/, -7],
  [/寺|廟|宮|祠|教會|禮拜堂/, -3],
  [/紀念碑|牌坊|故居/, -2],
]

const categoryRules = [
  ['動物萌友', /動物園|水族館|海生館|昆蟲|蝴蝶|牧場/],
  ['親子樂園', /親子|兒童|幼兒|童玩|遊戲場|共融|遊樂園|樂園/],
  ['探索學習', /科學館|博物館|探索館|天文|教育館|展示館/],
  ['農場體驗', /觀光工廠|休閒農場|農場|果園|採果|DIY|手作/],
  ['藝文美感', /美術館|藝術|文化館|故事館|圖書館|閱讀館/],
  ['自然放電', /公園|森林|步道|瀑布|濕地|植物園|海灘|沙灘|湖/],
  ['交通迷', /鐵道|火車|車站|航空|飛機|船舶/],
]

const accentByCategory = {
  動物萌友: '#f2a65a',
  親子樂園: '#ff8066',
  探索學習: '#6a8dff',
  農場體驗: '#68b984',
  藝文美感: '#df7bb4',
  自然放電: '#42b883',
  交通迷: '#f4c95d',
  假日散步: '#64a7a2',
}

const fallbackImages = {
  動物萌友: 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&w=900&q=80',
  親子樂園: 'https://images.unsplash.com/photo-1596997000103-e597b3ca50df?auto=format&fit=crop&w=900&q=80',
  探索學習: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=900&q=80',
  農場體驗: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80',
  藝文美感: 'https://images.unsplash.com/photo-1561214115-f2f134cc4912?auto=format&fit=crop&w=900&q=80',
  自然放電: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80',
  交通迷: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=900&q=80',
  假日散步: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
}

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(value, length = 150) {
  const text = cleanText(value)
  return text.length > length ? `${text.slice(0, length).trim()}…` : text
}

function firstArray(root, preferredKey) {
  if (Array.isArray(root)) return root
  if (Array.isArray(root?.[preferredKey])) return root[preferredKey]
  return Object.values(root || {}).find(Array.isArray) || []
}

function regionFor(city) {
  for (const [region, cities] of Object.entries(regions)) {
    if (cities.includes(city)) return region
  }
  return '離島'
}

function classificationText(item) {
  return cleanText([
    item.AttractionName,
    item.Description,
    item.Remarks,
    ...(item.Tags || []),
    ...(item.Images || []).flatMap((image) => [image.Name, image.Description, ...(image.Keywords || [])]),
  ].join(' '))
}

function familyScore(text) {
  return [...familyRules, ...negativeRules].reduce(
    (score, [pattern, points]) => score + (pattern.test(text) ? points : 0),
    0,
  )
}

function qualityScore(item, text) {
  let score = 0
  if (cleanText(item.Description).length >= 80) score += 3
  if (item.Images?.some((image) => /^https?:\/\//.test(image.URL || ''))) score += 3
  if (Number.isFinite(Number(item.PositionLat)) && Number.isFinite(Number(item.PositionLon))) score += 3
  if (item.PostalAddress?.City && item.PostalAddress?.Town) score += 2
  if (item.WebsiteURL) score += 1
  if (item.ServiceTimeInfo) score += 1
  if (item.SocialMediaURLs?.length) score += 1
  if (/親子|兒童|幼兒|家庭/.test(text)) score += 2
  return score
}

function categoryFor(text) {
  return categoryRules.find(([, pattern]) => pattern.test(text))?.[0] || '假日散步'
}

function settingFor(text) {
  const indoor = /室內|館|中心|工廠|圖書館|書屋|展覽|展場/.test(text)
  const outdoor = /戶外|公園|森林|步道|瀑布|濕地|植物園|農場|牧場|海灘|沙灘|湖|河濱|遊樂區/.test(text)
  if (indoor && outdoor) return '室內外'
  return indoor ? '室內' : '室外'
}

function ageFor(text, category) {
  if (/嬰幼兒|幼兒|寶寶|尿布|哺乳|推車|共融/.test(text)) return [0, 12]
  if (/兒童|親子|童玩|遊戲場|動物園|水族館/.test(text)) return [2, 12]
  if (['探索學習', '藝文美感', '交通迷'].includes(category)) return [4, 12]
  if (/登山|古道|長程|攀爬/.test(text)) return [6, 12]
  return [3, 12]
}

function durationFor(item, text) {
  const minutes = Number(item.VisitDuration)
  if (Number.isFinite(minutes) && minutes >= 300) return '一日'
  if (/夜間|夜景|燈會|星空/.test(text)) return '晚上'
  if (/國家森林遊樂區|遊樂園|動物園|海生館|大型園區/.test(text)) return '一日'
  return '半日'
}

function priceFor(item, feeMap) {
  if (item.IsAccessibleForFree === 1 || item.IsAccessibleForFree === true) return '免費'
  const fees = feeMap.get(item.AttractionID) || []
  if (fees.some((fee) => Number(fee.Price) === 0 || /免費/.test(cleanText(fee.Name)))) return '免費'
  if (fees.length || cleanText(item.FeeInfo)) return '需購票'
  return '請查官網'
}

function hoursFor(item, serviceTimeMap) {
  const direct = cleanText(item.ServiceTimeInfo)
  if (direct) return truncate(direct, 90)
  const times = serviceTimeMap.get(item.AttractionID) || []
  if (!times.length) return '請至官方網站確認'
  return times.slice(0, 2).map((time) => {
    const name = cleanText(time.Name) || '開放時間'
    return `${name} ${String(time.StartTime || '').slice(0, 5)}–${String(time.EndTime || '').slice(0, 5)}`
  }).join('；')
}

function facilityTextFor(item, text) {
  const rawFacilities = Array.isArray(item.Facilities)
    ? item.Facilities.map((facility) => cleanText(facility.Name || facility.Description || facility)).join(' ')
    : cleanText(item.Facilities)
  return cleanText([
    text,
    rawFacilities,
    item.ParkingInfo,
    item.Remarks,
    item.TrafficInfo,
  ].join(' '))
}

function familyAmenitiesFor(item, text) {
  const all = facilityTextFor(item, text)
  const status = (pattern) => pattern.test(all) ? 'confirmed' : 'notListed'
  const parkingInfo = cleanText(item.ParkingInfo)

  return {
    accessibility: status(/無障礙|輪椅|身障|殘障/),
    ramp: status(/無障礙坡道|坡道|斜坡道|無障礙通道/),
    nursingRoom: status(/哺乳室|集乳室|育嬰室|母嬰室/),
    diaperTable: status(/尿布台|換尿布|尿布床|嬰兒護理台/),
    familyRestroom: status(/親子廁所|親子洗手間|兒童廁所|親子盥洗/),
    parking: parkingInfo || /停車場|停車位|停車空間/.test(all) ? 'confirmed' : 'notListed',
    strollerFriendly: status(/嬰兒車|娃娃車|推車友善|推車|輪椅|無障礙通道|坡道/),
    parkingInfo: parkingInfo
      ? truncate(parkingInfo, 140)
      : /停車場|停車位|停車空間/.test(all)
        ? '官方資料提及停車設施，車位與費用請出發前確認。'
        : '官方資料尚未提供停車資訊。',
  }
}

function facilitiesFor(item, text) {
  const facilities = []
  const all = facilityTextFor(item, text)
  const rules = [
    ['哺乳室', /哺乳/],
    ['尿布台', /尿布|換尿布/],
    ['推車友善', /推車|無障礙|輪椅/],
    ['親子廁所', /親子廁所|兒童廁所/],
    ['停車場', /停車/],
    ['餐飲', /餐廳|餐飲|咖啡|販賣部/],
    ['無障礙', /無障礙/],
  ]
  for (const [label, pattern] of rules) if (pattern.test(all)) facilities.push(label)
  return facilities.length ? [...new Set(facilities)].slice(0, 5) : ['出發前請確認設施']
}

function highlightsFor(text, category) {
  const candidates = {
    動物萌友: ['近距離看動物', '自然生態觀察', '親子共遊'],
    親子樂園: ['兒童遊戲空間', '親子放電', '假日同樂'],
    探索學習: ['互動探索', '寓教於樂', '主題展覽'],
    農場體驗: ['農場體驗', '親近自然', '動手玩'],
    藝文美感: ['美感體驗', '文化探索', '親子共賞'],
    自然放電: ['戶外散步', '自然觀察', '親子放電'],
    交通迷: ['交通主題', '拍照體驗', '小小車迷'],
    假日散步: ['輕鬆散步', '親子共遊', '在地探索'],
  }[category]
  if (/戲水|噴水|水樂園/.test(text)) candidates[0] = '戲水消暑'
  if (/DIY|手作/.test(text)) candidates[1] = 'DIY 手作'
  return candidates
}

function instagramHashtag(name) {
  const withoutRegionPrefix = cleanText(name).replace(
    /^(?:臺北|台北|新北|桃園|新竹|苗栗|臺中|台中|彰化|南投|雲林|嘉義|臺南|台南|高雄|屏東|宜蘭|花蓮|臺東|台東|澎湖|金門|連江)[縣市]?[：:]\s*/,
    '',
  )
  return withoutRegionPrefix
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .slice(0, 50) || '台灣親子景點'
}

function sourceLinks(item, name) {
  const sources = []
  if (/^https?:\/\//.test(item.WebsiteURL || '')) {
    sources.push({ type: '官方網站', label: '查看官方資訊', url: item.WebsiteURL })
  }
  const instagram = (item.SocialMediaURLs || []).find((source) => /instagram\.com/i.test(source.URL || ''))
  if (instagram) {
    sources.push({ type: 'Instagram', label: instagram.Name || `#${name}`, url: instagram.URL })
  } else {
    const hashtag = instagramHashtag(name)
    sources.push({
      type: 'Instagram',
      label: `查看 #${hashtag}`,
      url: `https://www.instagram.com/explore/tags/${encodeURIComponent(hashtag)}/`,
    })
  }
  sources.push({
    type: '部落格',
    label: '搜尋親子遊記',
    url: `https://www.google.com/search?q=${encodeURIComponent(`${name} 親子 部落格`)}`,
  })
  return sources
}

function normalizedKey(item) {
  const name = cleanText(item.AttractionName).replace(/[\s　\-—()（）·・]/g, '').toLowerCase()
  const city = cleanText(item.PostalAddress?.City)
  return `${city}:${name}`
}

async function download(url, target) {
  const response = await fetch(url, { headers: { 'user-agent': 'HolidayGoWhere/1.0 (open-data-sync)' } })
  if (!response.ok) throw new Error(`下載失敗：${response.status} ${response.statusText}`)
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()))
}

async function loadJson(file) {
  return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
}

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'holiday-go-where-'))
  const zipPath = path.join(tempDir, 'attractions.zip')
  const extractDir = path.join(tempDir, 'extracted')

  console.log(`下載觀光署景點資料：${SOURCE_URL}`)
  await download(SOURCE_URL, zipPath)
  new AdmZip(zipPath).extractAllTo(extractDir, true)

  const attractionRoot = await loadJson(path.join(extractDir, 'AttractionList.json'))
  const serviceRoot = await loadJson(path.join(extractDir, 'AttractionServiceTimeList.json'))
  const feeRoot = await loadJson(path.join(extractDir, 'AttractionFeeList.json'))
  const attractions = firstArray(attractionRoot, 'Attractions')
  const serviceTimes = firstArray(serviceRoot, 'AttractionServiceTimes')
  const fees = firstArray(feeRoot, 'AttractionFees')

  const serviceTimeMap = new Map(serviceTimes.map((item) => [item.AttractionID, item.ServiceTimes || []]))
  const feeMap = new Map(fees.map((item) => [item.AttractionID, item.Fees || []]))
  const seen = new Set()
  const rejected = { inactive: 0, coordinate: 0, duplicate: 0, relevance: 0, quality: 0 }

  const candidates = []
  for (const item of attractions) {
    if (![1, '1', true].includes(item.ServiceStatus)) {
      rejected.inactive += 1
      continue
    }
    const lat = Number(item.PositionLat)
    const lng = Number(item.PositionLon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 21.7 || lat > 26.5 || lng < 118 || lng > 122.5) {
      rejected.coordinate += 1
      continue
    }
    const key = normalizedKey(item)
    if (!key || seen.has(key)) {
      rejected.duplicate += 1
      continue
    }
    seen.add(key)

    const text = classificationText(item)
    const relevance = familyScore(text)
    if (relevance < 4) {
      rejected.relevance += 1
      continue
    }
    const quality = qualityScore(item, text)
    if (quality < 7) {
      rejected.quality += 1
      continue
    }

    const name = cleanText(item.AttractionName)
    const city = cleanText(item.PostalAddress?.City) || '臺灣'
    const district = cleanText(item.PostalAddress?.Town) || ''
    const street = cleanText(item.PostalAddress?.StreetAddress)
    const address = `${city}${district}${street}` || '地址請見官方資訊'
    const category = categoryFor(text)
    const [ageMin, ageMax] = ageFor(text, category)
    const image = (item.Images || []).find((entry) => /^https?:\/\//.test(entry.URL || ''))?.URL
    const updatedAt = cleanText(item.UpdateTime || attractionRoot.UpdateTime)

    candidates.push({
      id: item.AttractionID,
      name,
      region: regionFor(city),
      city,
      district,
      ageMin,
      ageMax,
      setting: settingFor(text),
      duration: durationFor(item, text),
      category,
      rating: null,
      reviews: 0,
      priceLabel: priceFor(item, feeMap),
      address,
      hours: hoursFor(item, serviceTimeMap),
      lat,
      lng,
      image: image || fallbackImages[category],
      accent: accentByCategory[category],
      description: truncate(item.Description, 180) || `${name}是適合安排親子假日出遊的景點。`,
      highlights: highlightsFor(text, category),
      facilities: facilitiesFor(item, text),
      familyAmenities: familyAmenitiesFor(item, text),
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`,
      sources: sourceLinks(item, name),
      dataSource: '交通部觀光署觀光資訊資料庫 V2.1',
      sourceId: item.AttractionID,
      qualityScore: quality,
      updatedAt,
      _rank: relevance * 10 + quality,
    })
  }

  candidates.sort((a, b) => b._rank - a._rank || a.name.localeCompare(b.name, 'zh-Hant'))
  const places = candidates.slice(0, MAX_PLACES).map(({ _rank, ...place }) => place)
  const categoryCounts = Object.fromEntries(
    [...new Set(places.map((place) => place.category))]
      .sort()
      .map((category) => [category, places.filter((place) => place.category === category).length]),
  )

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(places, null, 2)}\n`, 'utf8')
  await fs.writeFile(META_FILE, `${JSON.stringify({
    sourceUrl: SOURCE_URL,
    sourceUpdatedAt: attractionRoot.UpdateTime,
    generatedFromSourceAt: attractionRoot.UpdateTime,
    sourceCount: attractions.length,
    candidateCount: candidates.length,
    publishedCount: places.length,
    rejected,
    categoryCounts,
  }, null, 2)}\n`, 'utf8')
  await fs.rm(tempDir, { recursive: true, force: true })

  console.log(`來源 ${attractions.length} 筆，親子候選 ${candidates.length} 筆，發布 ${places.length} 筆`)
  console.log('分類：', categoryCounts)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import {
  loadFamilyOpenData,
  matchFamilyOpenData,
  mergeFamilyAmenities,
} from './family-open-data.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_DIR = path.join(ROOT, 'src', 'generated')
const META_FILE = path.join(OUTPUT_DIR, 'sync-meta.json')
const SOURCE_URL =
  process.env.ATTRACTION_SOURCE_URL ||
  'https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip'
const RESTAURANT_SOURCE_URL =
  process.env.RESTAURANT_SOURCE_URL ||
  'https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Restaurant-json.zip'
const EVENT_SOURCE_URL =
  process.env.EVENT_SOURCE_URL ||
  'https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Event-json.zip'
const FEATURED_PLACES = Number(process.env.FEATURED_PLACES || 300)
const regionFiles = {
  北部: 'places-north.json',
  中部: 'places-central.json',
  南部: 'places-south.json',
  東部: 'places-east.json',
  離島: 'places-islands.json',
}

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
  親子餐廳: '#f2a65a',
  咖啡下午茶: '#b98b73',
  甜點冰品: '#df7bb4',
  百貨商場: '#7e8bd6',
  室內餐廳: '#d88962',
  本週活動: '#ff6b6b',
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
  親子餐廳: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=80',
  咖啡下午茶: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80',
  甜點冰品: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=80',
  百貨商場: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80',
  室內餐廳: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
  本週活動: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd4297?auto=format&fit=crop&w=900&q=80',
}

const familyRestaurantPattern = /親子|兒童|小朋友|家庭|寶寶|幼兒|遊戲區|兒童椅/
const mallNamePattern =
  /百貨|購物中心|購物廣場|商場|名品城|outlet|奧特萊斯|global mall|裕隆城|老虎城|夢時代|skm park|勤美誠品|大魯閣新時代/i
const unreliableImageHosts = new Set(['khh.travel'])

function cleanText(value) {
  return String(value || '')
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fullAddress(city, district, street) {
  const normalizedCity = cleanText(city).replace(/^台/, '臺')
  const normalizedDistrict = cleanText(district)
  const normalizedStreet = cleanText(street).replace(/^台/, '臺').replace(/^臺灣/, '')
  if (!normalizedStreet) return `${normalizedCity}${normalizedDistrict}` || '地址請見官方資訊'
  if (normalizedStreet.startsWith(normalizedCity)) return normalizedStreet
  if (normalizedStreet.startsWith(normalizedDistrict)) return `${normalizedCity}${normalizedStreet}`
  return `${normalizedCity}${normalizedDistrict}${normalizedStreet}`
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

function restaurantCategoryFor(text) {
  if (/百貨|購物中心|商場/.test(text)) return '百貨商場'
  if (/親子餐廳|兒童|小朋友|家庭|寶寶|幼兒|遊戲區/.test(text)) return '親子餐廳'
  if (/甜點|蛋糕|烘焙|鬆餅|冰品|冰淇淋/.test(text)) return '甜點冰品'
  if (/咖啡|下午茶|茶館|茶屋|早午餐/.test(text)) return '咖啡下午茶'
  return '室內餐廳'
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

function dateOnly(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

function eventHours(item) {
  const start = dateOnly(item.StartDateTime)
  const end = dateOnly(item.EndDateTime)
  if (!start) return '活動時間請見官方資訊'
  return start === end || !end ? start : `${start}－${end}`
}

function isWeekendEvent(item, now) {
  const start = new Date(item.StartDateTime)
  const end = new Date(item.EndDateTime)
  const day = new Date(now)
  const weekday = day.getDay()
  const daysUntilSaturday = (6 - weekday + 7) % 7
  const saturday = new Date(day)
  saturday.setHours(0, 0, 0, 0)
  saturday.setDate(day.getDate() + daysUntilSaturday)
  const sundayEnd = new Date(saturday)
  sundayEnd.setDate(saturday.getDate() + 1)
  sundayEnd.setHours(23, 59, 59, 999)
  return start <= sundayEnd && end >= saturday
}

function completenessFor(place) {
  const checks = [
    ['官方網站', place.sources?.some((source) => source.type === '官方網站')],
    ['明確開放時間', place.hours && !/請至官方網站確認|請見官方資訊|以商家公告為準/.test(place.hours)],
    ['票價資訊', !['請查官網', '請查店家'].includes(place.priceLabel)],
    ['官方照片', place.image && !place.image.includes('images.unsplash.com')],
    ['親子設施', place.familyAmenities?.evidence?.length || place.facilities?.some((item) => item !== '出發前請確認設施')],
    ['詳細介紹', cleanText(place.description).length >= 100],
  ]
  const completed = checks.filter(([, available]) => available).length
  return {
    score: Math.round(completed / checks.length * 100),
    missing: checks.filter(([, available]) => !available).map(([label]) => label),
  }
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
  const trafficInfo = cleanText(item.TrafficInfo)
  const parkingPattern = /停車場|停車位|停車空間|停放車輛|車輛停放|可停車|停車方便|停車處/
  const parkingMention = trafficInfo
    .split(/[。；;，,]/)
    .map((part) => part.trim())
    .find((part) => parkingPattern.test(part))

  return {
    accessibility: status(/無障礙|輪椅|身障|殘障/),
    ramp: status(/無障礙坡道|坡道|斜坡道|無障礙通道/),
    nursingRoom: status(/哺乳室|集乳室|育嬰室|母嬰室/),
    diaperTable: status(/尿布台|換尿布|尿布床|嬰兒護理台/),
    familyRestroom: status(/親子廁所|親子洗手間|兒童廁所|親子盥洗/),
    parking: parkingInfo || parkingPattern.test(all) ? 'confirmed' : 'notListed',
    strollerFriendly: status(/嬰兒車|娃娃車|推車友善|推車|輪椅|無障礙通道|坡道/),
    parkingInfo: parkingInfo
      ? truncate(parkingInfo, 140)
      : parkingMention
        ? `${truncate(parkingMention, 110)}。車位與費用請出發前確認。`
        : parkingPattern.test(all)
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
    百貨商場: ['室內逛逛', '親子用餐', '雨天備案'],
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

function imageUrlsFor(item) {
  return [...new Set(
    (item.Images || [])
      .map((entry) => cleanText(entry.URL))
      .filter((url) => {
        if (!/^https?:\/\//.test(url) || /not-found|no[-_]?image|default[-_]?image/i.test(url)) return false
        try {
          return !unreliableImageHosts.has(new URL(url).hostname)
        } catch {
          return false
        }
      }),
  )].slice(0, 4)
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

function restaurantKey(item) {
  const name = cleanText(item.RestaurantName).replace(/[\s　\-—()（）·・]/g, '').toLowerCase()
  const city = cleanText(item.PostalAddress?.City).replace(/^台/, '臺')
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
  const restaurantZipPath = path.join(tempDir, 'restaurants.zip')
  const eventZipPath = path.join(tempDir, 'events.zip')
  const extractDir = path.join(tempDir, 'extracted')
  const restaurantExtractDir = path.join(tempDir, 'restaurants')
  const eventExtractDir = path.join(tempDir, 'events')

  console.log(`下載觀光署景點資料：${SOURCE_URL}`)
  console.log(`下載觀光署餐飲資料：${RESTAURANT_SOURCE_URL}`)
  console.log(`下載觀光署活動資料：${EVENT_SOURCE_URL}`)
  await Promise.all([
    download(SOURCE_URL, zipPath),
    download(RESTAURANT_SOURCE_URL, restaurantZipPath),
    download(EVENT_SOURCE_URL, eventZipPath),
  ])
  new AdmZip(zipPath).extractAllTo(extractDir, true)
  new AdmZip(restaurantZipPath).extractAllTo(restaurantExtractDir, true)
  new AdmZip(eventZipPath).extractAllTo(eventExtractDir, true)

  const attractionRoot = await loadJson(path.join(extractDir, 'AttractionList.json'))
  const serviceRoot = await loadJson(path.join(extractDir, 'AttractionServiceTimeList.json'))
  const feeRoot = await loadJson(path.join(extractDir, 'AttractionFeeList.json'))
  const restaurantRoot = await loadJson(path.join(restaurantExtractDir, 'RestaurantList.json'))
  const restaurantServiceRoot = await loadJson(path.join(restaurantExtractDir, 'RestaurantServiceTimeList.json'))
  const eventRoot = await loadJson(path.join(eventExtractDir, 'EventList.json'))
  const attractions = firstArray(attractionRoot, 'Attractions')
  const serviceTimes = firstArray(serviceRoot, 'AttractionServiceTimes')
  const fees = firstArray(feeRoot, 'AttractionFees')
  const restaurants = firstArray(restaurantRoot, 'Restaurants')
  const restaurantServiceTimes = firstArray(restaurantServiceRoot, 'RestaurantServiceTimes')
  const events = firstArray(eventRoot, 'Events')
  const familyOpenData = await loadFamilyOpenData()

  const serviceTimeMap = new Map(serviceTimes.map((item) => [item.AttractionID, item.ServiceTimes || []]))
  const restaurantServiceTimeMap = new Map(
    restaurantServiceTimes.map((item) => [item.RestaurantID, item.ServiceTimes || []]),
  )
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
    const mall = mallNamePattern.test(cleanText(item.AttractionName))
    if (relevance < 4 && !mall) {
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
    const address = fullAddress(city, district, street)
    const category = mall ? '百貨商場' : categoryFor(text)
    const [ageMin, ageMax] = ageFor(text, category)
    const imageCandidates = imageUrlsFor(item)
    const image = imageCandidates[0]
    const updatedAt = cleanText(item.UpdateTime || attractionRoot.UpdateTime)
    const setting = mall ? '室內' : settingFor(text)

    const baseFamilyAmenities = familyAmenitiesFor(item, text)
    const amenityEvidence = matchFamilyOpenData({ name, city, district, address, lat, lng }, familyOpenData)

    candidates.push({
      id: item.AttractionID,
      name,
      region: regionFor(city),
      city,
      district,
      ageMin: mall ? 0 : ageMin,
      ageMax: mall ? 12 : ageMax,
      setting,
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
      imageCandidates: imageCandidates.slice(1),
      accent: accentByCategory[category],
      description: truncate(item.Description, 180) || `${name}是適合安排親子假日出遊的景點。`,
      highlights: highlightsFor(text, category),
      facilities: facilitiesFor(item, text),
      familyAmenities: mergeFamilyAmenities(baseFamilyAmenities, amenityEvidence),
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`,
      sources: sourceLinks(item, name),
      dataSource: '交通部觀光署觀光資訊資料庫 V2.1',
      sourceId: item.AttractionID,
      qualityScore: quality,
      updatedAt,
      rainyDay: mall || setting !== '室外' || /百貨|購物中心|商場|室內遊戲/.test(text),
      placeType: '景點',
      _rank: relevance * 10 + quality,
    })
  }

  const restaurantRejected = { inactive: 0, coordinate: 0, duplicate: 0, relevance: 0, quality: 0 }
  let restaurantPublished = 0
  for (const item of restaurants) {
    if (![1, '1', true].includes(item.ServiceStatus)) {
      restaurantRejected.inactive += 1
      continue
    }
    const lat = Number(item.PositionLat)
    const lng = Number(item.PositionLon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 21.7 || lat > 26.5 || lng < 118 || lng > 122.5) {
      restaurantRejected.coordinate += 1
      continue
    }
    const key = restaurantKey(item)
    if (!key || seen.has(key)) {
      restaurantRejected.duplicate += 1
      continue
    }

    const text = cleanText([
      item.RestaurantName,
      item.Description,
      item.Remarks,
      ...(item.RestaurantFeatures || []).map((feature) => feature.Name || feature.Description || feature),
      ...(item.Images || []).flatMap((image) => [image.Name, image.Description, ...(image.Keywords || [])]),
    ].join(' '))
    const imageCandidates = imageUrlsFor(item)
    const description = cleanText(item.Description)
    let quality = 0
    if (description.length >= 60) quality += 3
    if (description.length >= 120) quality += 2
    if (imageCandidates.length) quality += 3
    if (item.WebsiteURL) quality += 1
    if (item.ServiceTimeInfo || restaurantServiceTimeMap.get(item.RestaurantID)?.length) quality += 1
    if (familyRestaurantPattern.test(text)) quality += 3
    if (quality < 3) {
      restaurantRejected.quality += 1
      continue
    }
    seen.add(key)

    const name = cleanText(item.RestaurantName)
    const city = cleanText(item.PostalAddress?.City).replace(/^台/, '臺') || '臺灣'
    const district = cleanText(item.PostalAddress?.Town)
    const street = cleanText(item.PostalAddress?.StreetAddress)
    const address = fullAddress(city, district, street)
    const category = restaurantCategoryFor(text)
    const amenityEvidence = matchFamilyOpenData({ name, city, district, address, lat, lng }, familyOpenData)
    const baseFamilyAmenities = familyAmenitiesFor(item, text)
    const hoursItem = {
      ...item,
      AttractionID: item.RestaurantID,
    }
    const restaurantHoursMap = new Map([
      [item.RestaurantID, restaurantServiceTimeMap.get(item.RestaurantID) || []],
    ])

    candidates.push({
      id: item.RestaurantID,
      name,
      region: regionFor(city),
      city,
      district,
      ageMin: 0,
      ageMax: 12,
      setting: '室內',
      duration: '半日',
      category,
      rating: null,
      reviews: 0,
      priceLabel: '請查店家',
      address,
      hours: hoursFor(hoursItem, restaurantHoursMap),
      lat,
      lng,
      image: imageCandidates[0] || fallbackImages[category],
      imageCandidates: imageCandidates.slice(1),
      accent: accentByCategory[category],
      description: truncate(description, 180) || `${name}是可安排休息、用餐或下午茶的雨天備案。`,
      highlights: familyRestaurantPattern.test(text)
        ? ['室內休息', '親子用餐', '雨天備案']
        : ['咖啡甜點', '爸媽充電', '雨天備案'],
      facilities: facilitiesFor(item, text),
      familyAmenities: mergeFamilyAmenities(baseFamilyAmenities, amenityEvidence),
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`,
      sources: sourceLinks(item, name),
      dataSource: '交通部觀光署餐飲資訊資料庫 V2.1',
      sourceId: item.RestaurantID,
      qualityScore: quality,
      updatedAt: cleanText(item.UpdateTime || restaurantRoot.UpdateTime),
      rainyDay: true,
      placeType: '餐飲',
      _rank: 45 + quality * 4 + (familyRestaurantPattern.test(text) ? 18 : 0),
    })
    restaurantPublished += 1
  }

  const eventRejected = { expired: 0, coordinate: 0, duplicate: 0, relevance: 0 }
  let eventPublished = 0
  const now = new Date()
  const futureLimit = new Date(now)
  futureLimit.setDate(futureLimit.getDate() + 120)
  for (const item of events) {
    const start = new Date(item.StartDateTime)
    const end = new Date(item.EndDateTime)
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < now ||
      start > futureLimit ||
      item.EventStatus === 'EventCancelled'
    ) {
      eventRejected.expired += 1
      continue
    }
    const lat = Number(item.PositionLat)
    const lng = Number(item.PositionLon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 21.7 || lat > 26.5 || lng < 118 || lng > 122.5) {
      eventRejected.coordinate += 1
      continue
    }
    const name = cleanText(item.EventName)
    const city = cleanText(item.PostalAddress?.City).replace(/^台/, '臺') || '臺灣'
    const district = cleanText(item.PostalAddress?.Town)
    const street = cleanText(item.PostalAddress?.StreetAddress)
    const address = fullAddress(city, district, street)
    const key = `${city}:${name.replace(/[\s　\-—()（）·・]/g, '').toLowerCase()}`
    if (!key || seen.has(key)) {
      eventRejected.duplicate += 1
      continue
    }
    const text = cleanText([
      name,
      item.Description,
      item.Remarks,
      item.Participant,
      ...(item.Tags || []),
    ].join(' '))
    const relevance = familyScore(text)
    if (relevance < 4 && !/市集|展覽|體驗|節|祭|花季|燈會|音樂|文化|藝術|親子|兒童/.test(text)) {
      eventRejected.relevance += 1
      continue
    }
    seen.add(key)
    const imageCandidates = imageUrlsFor(item)
    const baseFamilyAmenities = familyAmenitiesFor(item, text)
    const amenityEvidence = matchFamilyOpenData({ name, city, district, address, lat, lng }, familyOpenData)
    const weekend = isWeekendEvent(item, now)
    candidates.push({
      id: item.EventID,
      name,
      region: regionFor(city),
      city,
      district,
      ageMin: /幼兒|寶寶|親子/.test(text) ? 0 : 3,
      ageMax: 12,
      setting: settingFor(text),
      duration: '半日',
      category: '本週活動',
      rating: null,
      reviews: 0,
      priceLabel: item.IsAccessibleForFree === 1 || /免費/.test(cleanText(item.FeeInfo)) ? '免費' : cleanText(item.FeeInfo) ? '需購票' : '請查官網',
      address,
      hours: eventHours(item),
      lat,
      lng,
      image: imageCandidates[0] || fallbackImages['本週活動'],
      imageCandidates: imageCandidates.slice(1),
      accent: accentByCategory['本週活動'],
      description: truncate(item.Description, 180) || `${name}是近期舉辦的活動，出發前請再次確認日期與場次。`,
      highlights: [weekend ? '本週末限定' : '近期活動', '期間限定', '親子新鮮事'],
      facilities: facilitiesFor(item, text),
      familyAmenities: mergeFamilyAmenities(baseFamilyAmenities, amenityEvidence),
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`,
      sources: sourceLinks(item, name),
      dataSource: '交通部觀光署活動資訊資料庫 V2.1',
      sourceId: item.EventID,
      qualityScore: 10,
      updatedAt: cleanText(item.UpdateTime || eventRoot.UpdateTime),
      rainyDay: settingFor(text) !== '室外',
      placeType: '活動',
      eventStart: item.StartDateTime,
      eventEnd: item.EndDateTime,
      weekendEvent: weekend,
      _rank: (weekend ? 145 : 115) + relevance,
    })
    eventPublished += 1
  }

  candidates.sort((a, b) => b._rank - a._rank || a.name.localeCompare(b.name, 'zh-Hant'))
  const allPlaces = candidates.map(({ _rank, ...place }) => ({
    ...place,
    completeness: completenessFor(place),
  }))
  const featuredRainyPlaces = Object.keys(regionFiles).flatMap((region) => {
    const regional = allPlaces.filter((place) => place.region === region && place.rainyDay)
    const selected = []
    const selectedIds = new Set()
    const quotas = [
      ['百貨商場', 3],
      ['咖啡下午茶', 3],
      ['甜點冰品', 2],
      ['親子餐廳', 2],
      ['室內餐廳', 2],
    ]
    for (const [category, amount] of quotas) {
      for (const place of regional.filter((item) => item.category === category).slice(0, amount)) {
        if (!selectedIds.has(place.id)) {
          selected.push(place)
          selectedIds.add(place.id)
        }
      }
    }
    for (const place of regional) {
      if (selected.length >= 12) break
      if (!selectedIds.has(place.id)) {
        selected.push(place)
        selectedIds.add(place.id)
      }
    }
    return selected
  })
  const featuredEventPlaces = allPlaces
    .filter((place) => place.placeType === '活動')
    .slice(0, 60)
  const featuredIds = new Set([
    ...featuredRainyPlaces.map((place) => place.id),
    ...featuredEventPlaces.map((place) => place.id),
  ])
  const reservedFeaturedPlaces = [
    ...featuredEventPlaces,
    ...featuredRainyPlaces.filter((place) => !featuredEventPlaces.some((event) => event.id === place.id)),
  ]
  const featuredPlaces = [
    ...reservedFeaturedPlaces,
    ...allPlaces.filter((place) => !featuredIds.has(place.id)).slice(0, FEATURED_PLACES - reservedFeaturedPlaces.length),
  ]
  const regionCounts = Object.fromEntries(
    Object.keys(regionFiles).map((region) => [
      region,
      allPlaces.filter((place) => place.region === region).length,
    ]),
  )
  const categoryCounts = Object.fromEntries(
    [...new Set(allPlaces.map((place) => place.category))]
      .sort()
      .map((category) => [category, allPlaces.filter((place) => place.category === category).length]),
  )
  const amenityKeys = [
    'accessibility',
    'ramp',
    'nursingRoom',
    'diaperTable',
    'familyRestroom',
    'parking',
    'strollerFriendly',
  ]
  const amenityCoverage = Object.fromEntries(
    amenityKeys.map((key) => [
      key,
      allPlaces.filter((place) => place.familyAmenities?.[key] === 'confirmed').length,
    ]),
  )
  const officialAmenityMatches = Object.fromEntries(
    amenityKeys.map((key) => [
      key,
      allPlaces.filter((place) =>
        place.familyAmenities?.evidence?.some((item) => item.amenities.includes(key)),
      ).length,
    ]),
  )

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'places-featured.json'),
    `${JSON.stringify(featuredPlaces, null, 2)}\n`,
    'utf8',
  )
  for (const [region, file] of Object.entries(regionFiles)) {
    const regionPlaces = allPlaces.filter((place) => place.region === region)
    await fs.writeFile(path.join(OUTPUT_DIR, file), `${JSON.stringify(regionPlaces, null, 2)}\n`, 'utf8')
  }
  await fs.rm(path.join(OUTPUT_DIR, 'places.json'), { force: true })
  await fs.writeFile(META_FILE, `${JSON.stringify({
    sourceUrl: SOURCE_URL,
    sourceUpdatedAt: attractionRoot.UpdateTime,
    generatedFromSourceAt: attractionRoot.UpdateTime,
    sourceCount: attractions.length,
    restaurantSourceCount: restaurants.length,
    restaurantPublishedCount: restaurantPublished,
    restaurantRejected,
    eventSourceCount: events.length,
    eventPublishedCount: eventPublished,
    eventRejected,
    candidateCount: candidates.length,
    publishedCount: allPlaces.length,
    featuredCount: featuredPlaces.length,
    regionCounts,
    rejected,
    categoryCounts,
    amenityCoverage,
    officialAmenityMatches,
    familyOpenData: familyOpenData.metadata,
  }, null, 2)}\n`, 'utf8')
  await fs.rm(tempDir, { recursive: true, force: true })

  console.log(`來源 ${attractions.length} 筆，發布全部親子候選 ${allPlaces.length} 筆`)
  console.log(`餐飲來源 ${restaurants.length} 筆，新增雨天餐飲 ${restaurantPublished} 筆`)
  console.log(`活動來源 ${events.length} 筆，發布近期活動 ${eventPublished} 筆`)
  console.log(`首頁精選 ${featuredPlaces.length} 筆，分區：`, regionCounts)
  console.log('分類：', categoryCounts)
  console.log('親子設施覆蓋：', amenityCoverage)
  console.log('官方設施資料新增確認：', officialAmenityMatches)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

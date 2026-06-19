import https from 'node:https'
import AdmZip from 'adm-zip'

const DATA_GOV_API = 'https://data.gov.tw/api/v2/rest/dataset'
const DATASET_URL = 'https://data.gov.tw/dataset'
const NURSING_DATASETS = [
  { id: 23750, label: '依法應設置哺集乳室公共場所名單' },
  { id: 23858, label: '自願設置哺集乳室名單' },
]
const TOILET_DATASET = { id: 30794, label: '全國公廁建檔資料' }

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<text:line-break\s*\/>/g, ' ')
    .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, count) => ' '.repeat(Number(count || 1)))
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function normalizeCity(value) {
  return cleanText(value).replace(/^台/, '臺')
}

function cityFromAddress(value) {
  const address = normalizeCity(value)
  return [
    '臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣',
    '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣',
    '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣',
    '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣',
  ].find((city) => address.startsWith(city)) || ''
}

function normalizeName(value) {
  return cleanText(value)
    .normalize('NFKC')
    .replace(/^台/, '臺')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/股份有限公司|有限公司|財團法人|社團法人|管理處|管理站|遊客中心服務處/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase()
}

function normalizeAddress(value) {
  return cleanText(value)
    .normalize('NFKC')
    .replace(/^台/, '臺')
    .replace(/[樓F之\-－號巷弄衖段里村鄰\s,，.。]/g, '')
    .replace(/[一二三四五六七八九十]+/g, (text) => {
      const digits = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
      if (text.length === 1) return String(digits[text] || text)
      if (text === '十一') return '11'
      if (text === '十二') return '12'
      return text
    })
    .toLowerCase()
}

function rowValue(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && cleanText(row[name])) return cleanText(row[name])
  }
  return ''
}

function tableRowsFromOds(buffer) {
  const xml = new AdmZip(buffer).readAsText('content.xml')
  const rows = []
  for (const rowMatch of xml.matchAll(/<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/g)) {
    const cells = []
    const cellPattern = /<table:table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g
    for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
      const repeated = Math.min(Number(cellMatch[1].match(/table:number-columns-repeated="(\d+)"/)?.[1] || 1), 100)
      const paragraphs = [...String(cellMatch[2] || '').matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)]
      const value = cleanText(paragraphs.map((match) => decodeXml(match[1])).join(' | '))
      for (let index = 0; index < repeated; index += 1) cells.push(value)
    }
    if (cells.some(Boolean)) rows.push(cells)
  }
  if (rows.length < 2) return []
  const headers = rows[0].map(cleanText)
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])))
}

function requestBuffer(url, { allowOfficialCertificateFallback = false } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'user-agent': 'HolidayGoWhere/1.0 (open-data-sync)' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        requestBuffer(new URL(response.headers.location, url).href, { allowOfficialCertificateFallback }).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`下載失敗：${response.statusCode} ${url}`))
        return
      }
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
    })
    request.on('error', (error) => {
      if (
        allowOfficialCertificateFallback &&
        new URL(url).hostname === 'www.hpa.gov.tw' &&
        /certificate|self signed|unable to verify/i.test(error.message)
      ) {
        const fallback = https.get(
          url,
          {
            rejectUnauthorized: false,
            headers: { 'user-agent': 'HolidayGoWhere/1.0 (open-data-sync)' },
          },
          (response) => {
            if (response.statusCode !== 200) {
              response.resume()
              reject(new Error(`下載失敗：${response.statusCode} ${url}`))
              return
            }
            const chunks = []
            response.on('data', (chunk) => chunks.push(chunk))
            response.on('end', () => resolve(Buffer.concat(chunks)))
          },
        )
        fallback.on('error', reject)
        return
      }
      reject(error)
    })
  })
}

async function datasetMetadata(id) {
  const response = await fetch(`${DATA_GOV_API}/${id}`, {
    headers: { 'user-agent': 'HolidayGoWhere/1.0 (open-data-sync)' },
  })
  if (!response.ok) throw new Error(`資料集詮釋資料下載失敗：${id} ${response.status}`)
  const payload = await response.json()
  if (!payload.success || !payload.result) throw new Error(`資料集詮釋資料格式錯誤：${id}`)
  return payload.result
}

function nursingAddress(row) {
  return [
    rowValue(row, ['縣市']),
    rowValue(row, ['鄉/鎮/市/區', '鄉鎮市區']),
    rowValue(row, ['村/里']),
    rowValue(row, ['大道/路/街/地區', '地址-街路門牌', '地址']),
    rowValue(row, ['段']),
    rowValue(row, ['巷/弄/衖']),
    rowValue(row, ['號']),
    rowValue(row, ['樓（之~）']),
  ].join('')
}

async function loadNursingRooms() {
  const datasets = await Promise.all(NURSING_DATASETS.map(async (source) => {
    const metadata = await datasetMetadata(source.id)
    const resource = metadata.distribution.find((item) => item.resourceFormat === 'ODS')
    if (!resource?.resourceDownloadUrl) throw new Error(`${source.label}沒有可下載的 ODS 資源`)
    const buffer = await requestBuffer(resource.resourceDownloadUrl, { allowOfficialCertificateFallback: true })
    const rooms = tableRowsFromOds(buffer)
      .map((row) => ({
        name: rowValue(row, ['場所名稱', '機構名稱', '公共場所名稱']),
        city: normalizeCity(rowValue(row, ['縣市'])),
        district: rowValue(row, ['鄉/鎮/市/區', '鄉鎮市區']),
        address: nursingAddress(row),
        hours: rowValue(row, ['開放時間']),
        note: rowValue(row, ['注意事項']),
        source: source.label,
        sourceUrl: `${DATASET_URL}/${source.id}`,
      }))
      .filter((room) => room.name && room.city && room.address)
      .filter((room) => !/僅供員工|員工使用|內部使用|不對外開放/.test(`${room.hours} ${room.note}`))
    return { metadata, rooms }
  }))
  return {
    records: datasets.flatMap((item) => item.rooms),
    updatedAt: datasets.map((item) => item.metadata.modifiedDate).sort().at(-1) || '',
  }
}

async function loadPublicToilets() {
  const metadata = await datasetMetadata(TOILET_DATASET.id)
  const resource = metadata.distribution.find((item) => item.resourceFormat === 'JSON')
  if (!resource?.resourceDownloadUrl) throw new Error(`${TOILET_DATASET.label}沒有可下載的 JSON 資源`)
  const baseUrl = new URL(resource.resourceDownloadUrl)
  baseUrl.searchParams.set('format', 'JSON')
  baseUrl.searchParams.set('limit', '1000')
  const records = []
  for (let offset = 0; ; offset += 1000) {
    baseUrl.searchParams.set('offset', String(offset))
    const response = await fetch(baseUrl, {
      headers: { 'user-agent': 'HolidayGoWhere/1.0 (open-data-sync)' },
    })
    if (!response.ok) throw new Error(`${TOILET_DATASET.label}下載失敗：${response.status}`)
    const page = await response.json()
    if (!Array.isArray(page)) throw new Error(`${TOILET_DATASET.label}資料格式錯誤`)
    records.push(...page)
    if (page.length < 1000) break
  }
  return {
    records: records.map((row) => {
      const address = rowValue(row, ['address', 'Address'])
      const latitude = Number(rowValue(row, ['latitude', 'Latitude']))
      const longitude = Number(rowValue(row, ['longitude', 'Longitude']))
      const coordinatesSwapped = latitude > 90 && longitude < 90
      return {
        name: rowValue(row, ['name', 'Name']),
        city: cityFromAddress(address) || normalizeCity(rowValue(row, ['county', 'County'])),
        district: rowValue(row, ['areacode', 'Areacode']),
        address,
        lat: coordinatesSwapped ? longitude : latitude,
        lng: coordinatesSwapped ? latitude : longitude,
        type: rowValue(row, ['type', 'Type']),
        category: rowValue(row, ['type2', 'Type2']),
        diaper: Number(rowValue(row, ['diaper', 'Diaper']).replace(/[^\d.]/g, '')) || 0,
        source: TOILET_DATASET.label,
        sourceUrl: `${DATASET_URL}/${TOILET_DATASET.id}`,
      }
    }).filter((item) => item.name && item.city),
    updatedAt: metadata.modifiedDate,
  }
}

function byCity(records) {
  const index = new Map()
  for (const record of records) {
    const city = normalizeCity(record.city)
    if (!index.has(city)) index.set(city, [])
    index.get(city).push(record)
  }
  return index
}

function haversineMeters(a, b) {
  const radius = 6371000
  const radians = (degree) => degree * Math.PI / 180
  const dLat = radians(b.lat - a.lat)
  const dLng = radians(b.lng - a.lng)
  const lat1 = radians(a.lat)
  const lat2 = radians(b.lat)
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function relatedName(a, b) {
  const first = normalizeName(a)
  const second = normalizeName(b)
  if (!first || !second) return false
  return first === second || (Math.min(first.length, second.length) >= 4 && (first.includes(second) || second.includes(first)))
}

function exactName(a, b) {
  const first = normalizeName(a)
  const second = normalizeName(b)
  return Boolean(first && second && first === second)
}

function relatedAddress(a, b) {
  const first = normalizeAddress(a)
  const second = normalizeAddress(b)
  if (!first || !second) return false
  return first === second || (Math.min(first.length, second.length) >= 8 && (first.includes(second) || second.includes(first)))
}

function evidence(source, label, amenities, note) {
  return {
    amenities,
    source: source.source,
    label,
    url: source.sourceUrl,
    note: cleanText(note),
  }
}

export async function loadFamilyOpenData() {
  console.log('下載國民健康署哺集乳室與環境部全國公廁資料')
  const [nursing, toilets] = await Promise.all([loadNursingRooms(), loadPublicToilets()])
  return {
    nursingByCity: byCity(nursing.records),
    toiletsByCity: byCity(toilets.records),
    metadata: {
      nursingCount: nursing.records.length,
      toiletCount: toilets.records.length,
      nursingUpdatedAt: nursing.updatedAt,
      toiletUpdatedAt: toilets.updatedAt,
      sources: [
        ...NURSING_DATASETS.map((item) => ({ ...item, url: `${DATASET_URL}/${item.id}` })),
        { ...TOILET_DATASET, url: `${DATASET_URL}/${TOILET_DATASET.id}` },
      ],
    },
  }
}

export function matchFamilyOpenData(place, openData) {
  const city = normalizeCity(place.city)
  const nursingCandidates = openData.nursingByCity.get(city) || []
  const toiletCandidates = (openData.toiletsByCity.get(city) || []).filter((toilet) => {
    const text = `${toilet.name} ${toilet.type} ${toilet.category}`
    return toilet.diaper > 0 || /無障礙|身障|親子/.test(text)
  })
  const matchedNursing = nursingCandidates.find((room) => {
    const addressMatch = relatedAddress(place.address, room.address)
    return addressMatch || exactName(place.name, room.name)
  })
  let matchedToilet = null
  let matchedDistance = null
  for (const toilet of toiletCandidates) {
    const nameMatch = relatedName(place.name, toilet.name)
    const addressMatch = relatedAddress(place.address, toilet.address)
    const hasCoordinates = Number.isFinite(toilet.lat) && Number.isFinite(toilet.lng)
    const distance = hasCoordinates ? haversineMeters(place, toilet) : Number.POSITIVE_INFINITY
    if (!addressMatch && !(nameMatch && distance <= 250)) continue
    if (!matchedToilet || distance < matchedDistance) {
      matchedToilet = toilet
      matchedDistance = distance
    }
  }

  const evidenceItems = []
  if (matchedNursing) {
    evidenceItems.push(evidence(
      matchedNursing,
      matchedNursing.name,
      ['nursingRoom'],
      [matchedNursing.address, matchedNursing.hours].filter(Boolean).join('・'),
    ))
  }
  if (matchedToilet) {
    const toiletText = `${matchedToilet.name} ${matchedToilet.type} ${matchedToilet.category}`
    const amenities = []
    if (/無障礙|身障/.test(toiletText)) amenities.push('accessibility')
    if (/親子/.test(toiletText)) amenities.push('familyRestroom')
    if (matchedToilet.diaper > 0) amenities.push('diaperTable')
    if (amenities.length) {
      evidenceItems.push(evidence(
        matchedToilet,
        matchedToilet.name,
        amenities,
        [
          matchedToilet.type,
          matchedToilet.diaper > 0 ? `尿布檯 ${matchedToilet.diaper} 組` : '',
          Number.isFinite(matchedDistance) ? `距景點約 ${Math.round(matchedDistance)} 公尺` : '',
        ].filter(Boolean).join('・'),
      ))
    }
  }
  return evidenceItems
}

export function mergeFamilyAmenities(base, evidenceItems) {
  const merged = { ...base, evidence: evidenceItems }
  for (const item of evidenceItems) {
    for (const amenity of item.amenities) merged[amenity] = 'confirmed'
  }
  return merged
}

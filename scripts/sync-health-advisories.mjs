import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DATA_DIR = path.join(ROOT, 'public', 'data')
const OUTPUT = path.join(PUBLIC_DATA_DIR, 'health-advisories.json')

const NOW = new Date().toISOString()
const CDC_FETCH_RETRIES = Number(process.env.CDC_FETCH_RETRIES || 3)
const CDC_SEARCH_TIMEOUT_MS = Number(process.env.CDC_SEARCH_TIMEOUT_MS || 30000)
const CDC_RESOURCE_TIMEOUT_MS = Number(process.env.CDC_RESOURCE_TIMEOUT_MS || 30000)
const DISCLAIMER = '本提醒依政府公開資料整理，不能取代醫師診斷或治療建議；如孩子有不適或疑慮，請諮詢專業醫療人員。'

const SOURCES = {
  hpaDevelopment: {
    name: '兒童發展篩檢服務',
    agency: '衛生福利部國民健康署',
    url: 'https://www.hpa.gov.tw/Pages/List.aspx?nodeid=4856',
  },
  hpaHandbook: {
    name: '兒童健康手冊',
    agency: '衛生福利部國民健康署',
    url: 'https://www.hpa.gov.tw/Pages/EBook.aspx?nodeid=1139',
  },
  hpaEducation: {
    name: '兒童衛教手冊',
    agency: '衛生福利部國民健康署',
    url: 'https://www.hpa.gov.tw/Pages/EBook.aspx?nodeid=1459',
  },
  cdcOpenData: {
    name: '疾病管制署資料開放平台',
    agency: '衛生福利部疾病管制署',
    url: 'https://data.cdc.gov.tw/zh_TW/pages/developer',
  },
}

const officialSeeds = [
  {
    id: 'hpa-development-screening-under-7',
    category: 'development',
    severity: 'notice',
    title: '未滿 7 歲可以留意兒童發展篩檢時程',
    summary: '國健署兒童發展篩檢服務涵蓋粗大動作、精細動作、語言認知與社會發展；出門玩時也可以順手觀察孩子的動作與互動。',
    action: 'Q媽提醒：若接近篩檢年齡區間，出門前可以把兒童健康手冊一起放進包包。',
    applicableAges: [
      { label: '6至10個月', minMonths: 6, maxMonths: 10 },
      { label: '10個月至1歲6個月', minMonths: 10, maxMonths: 18 },
      { label: '1歲6個月至2歲', minMonths: 18, maxMonths: 24 },
      { label: '2至3歲', minMonths: 24, maxMonths: 36 },
      { label: '3至5歲', minMonths: 36, maxMonths: 60 },
      { label: '5至未滿7歲', minMonths: 60, maxMonths: 83 },
    ],
    regions: ['全國'],
    source: { ...SOURCES.hpaDevelopment, fetchedAt: NOW, dataPeriod: '國健署公開資訊' },
    evidence: '國健署公開資訊列出未滿7歲兒童新增6次兒童發展篩檢服務，服務項目包含粗大動作、精細動作、語言認知、社會發展。',
  },
  {
    id: 'hpa-child-handbook-outing-safety',
    category: 'safety',
    severity: 'info',
    title: '親子出遊前，先快速掃一次安全風險',
    summary: '兒童健康手冊包含家中常見嬰幼兒安全陷阱與緊急狀況處理等章節；外出到遊戲場、餐廳或商場，也可以用同樣概念檢查環境。',
    action: 'Q媽提醒：到新場地先看出口、洗手台、樓梯與尖角，讓孩子開始玩之前先少一點意外風險。',
    applicableAges: [{ label: '0至6歲', minMonths: 0, maxMonths: 83 }],
    regions: ['全國'],
    source: { ...SOURCES.hpaHandbook, fetchedAt: NOW, dataPeriod: '兒童健康手冊' },
    evidence: '國健署兒童健康手冊提供兒童發展、預防接種、緊急狀況處理與衛教資料等章節。',
  },
  {
    id: 'hpa-child-education-infant-care',
    category: 'safety',
    severity: 'info',
    title: '小小孩出門，睡眠與照護用品也要想在前面',
    summary: '兒童衛教手冊包含早產兒居家照護、嬰兒猝死症預防、副食品添加、營養與事故傷害預防等育兒保健資訊。',
    action: 'Q媽提醒：0–2 歲出門可以多確認尿布、替換衣物、餵食用品與安全睡眠安排。',
    applicableAges: [{ label: '0至2歲', minMonths: 0, maxMonths: 35 }],
    regions: ['全國'],
    source: { ...SOURCES.hpaEducation, fetchedAt: NOW, dataPeriod: '兒童衛教手冊' },
    evidence: '國健署兒童衛教手冊提供家長及主要照顧者育兒保健資訊，包含嬰兒照護、副食品、營養與預防事故傷害。',
  },
  {
    id: 'hpa-child-nutrition-outing',
    category: 'nutrition',
    severity: 'info',
    title: '半日行程也要幫孩子保留喝水與點心節奏',
    summary: '兒童衛教手冊收錄嬰幼兒與兒童期每日膳食營養素等資訊；安排親子行程時，別只看景點，也要預留補水與用餐時間。',
    action: 'Q媽提醒：戶外放電或排隊活動前，先準備水、簡單點心與休息點，爸媽比較不會被臨時狀況追著跑。',
    applicableAges: [{ label: '0至12歲', minMonths: 0, maxMonths: 155 }],
    regions: ['全國'],
    source: { ...SOURCES.hpaEducation, fetchedAt: NOW, dataPeriod: '兒童衛教手冊' },
    evidence: '國健署兒童衛教手冊包含副食品添加、嬰幼兒與兒童期營養等育兒保健資訊。',
  },
]

function withCommonFields(item) {
  return {
    ...item,
    mascot: 'qMom',
    disclaimer: DISCLAIMER,
  }
}

function normalizeNumber(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function weekKey(record) {
  const year = record['年'] ?? record.year ?? record.Year
  const week = record['週'] ?? record.week ?? record.Week
  if (!year || !week) return null
  return `${year}-${String(week).padStart(2, '0')}`
}

function valueFromRecord(record, diseaseName) {
  const key = Object.keys(record).find((name) => name.includes(diseaseName) && name.includes('急診') && name.includes('人次'))
  return normalizeNumber(key ? record[key] : 0)
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readPreviousPayload() {
  try {
    return JSON.parse(await fs.readFile(OUTPUT, 'utf8'))
  } catch {
    return null
  }
}

function previousCdcAdvisoriesFor(previousPayload, failedDiseases) {
  if (!previousPayload || !Array.isArray(previousPayload.advisories) || failedDiseases.length === 0) return []
  return previousPayload.advisories.filter((advisory) =>
    advisory?.category === 'disease' &&
    advisory?.source?.agency === SOURCES.cdcOpenData.agency &&
    failedDiseases.some((diseaseName) => String(advisory.id || '').includes(`cdc-${diseaseName}-trend`)),
  )
}

async function fetchJson(url, timeoutMs = CDC_SEARCH_TIMEOUT_MS) {
  let lastError
  for (let attempt = 1; attempt <= CDC_FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': 'HolidayGoWhere health-advisory sync (GitHub Actions)',
        },
      })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return await response.json()
    } catch (error) {
      lastError = error
      if (attempt < CDC_FETCH_RETRIES) {
        console.warn(`[health] fetch retry ${attempt}/${CDC_FETCH_RETRIES} failed for ${url}: ${error.message}`)
        await wait(1200 * attempt)
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

async function fetchText(url, timeoutMs = CDC_RESOURCE_TIMEOUT_MS) {
  let lastError
  for (let attempt = 1; attempt <= CDC_FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'text/csv,application/json,text/plain;q=0.9,*/*;q=0.8',
          'user-agent': 'HolidayGoWhere health-advisory sync (GitHub Actions)',
        },
      })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt < CDC_FETCH_RETRIES) {
        console.warn(`[health] fetch retry ${attempt}/${CDC_FETCH_RETRIES} failed for ${url}: ${error.message}`)
        await wait(1200 * attempt)
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }

  const [headers, ...values] = rows.filter((item) => item.some(Boolean))
  if (!headers) return []
  return values.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, ''), cells[index] ?? ''])),
  )
}

function normalizeResource(distribution) {
  if (!distribution?.resourceDownloadUrl) return null
  return {
    format: String(distribution.resourceFormat || '').toUpperCase(),
    url: distribution.resourceDownloadUrl,
    name: distribution.resourceDescription || distribution.resourceFormat || 'CDC resource',
  }
}

async function findCdcResourceFromDataGov(datasetId) {
  const payload = await fetchJson(`https://data.gov.tw/api/v2/rest/dataset/${datasetId}`)
  const dataset = payload?.result
  const distributions = Array.isArray(dataset?.distribution) ? dataset.distribution : []
  const resources = distributions.map(normalizeResource).filter(Boolean)
  const resource =
    resources.find((item) => item.format === 'JSON') ||
    resources.find((item) => item.format === 'CSV') ||
    resources[0]
  if (!resource) return null
  return {
    dataset: dataset.title || `data.gov.tw dataset ${datasetId}`,
    metadataUrl: `https://data.gov.tw/dataset/${datasetId}`,
    resource,
  }
}

async function findCdcJsonResource(query) {
  const api = new URL('https://data.cdc.gov.tw/api/3/action/package_search')
  api.searchParams.set('q', query)
  api.searchParams.set('rows', '5')
  const payload = await fetchJson(api.toString())
  const packages = payload?.result?.results ?? []
  for (const item of packages) {
    const resources = item.resources ?? []
    const resource = resources.find((entry) => String(entry.format || '').toUpperCase() === 'JSON' && entry.url)
    if (resource) return { dataset: item.title || query, resource: { ...resource, format: 'JSON' } }
  }
  return null
}

async function findCdcResource(task) {
  if (task.dataGovDatasetId) {
    try {
      const found = await findCdcResourceFromDataGov(task.dataGovDatasetId)
      if (found) return found
    } catch (error) {
      console.warn(`[health] data.gov.tw metadata lookup failed for ${task.query}: ${error.message}`)
    }
  }
  return findCdcJsonResource(task.query)
}

async function loadResourceRecords(resource) {
  const format = String(resource.format || '').toUpperCase()
  const { data, usedUrl } = await fetchResourceWithHttpFallback(resource.url, format)
  if (format === 'CSV') return { records: parseCsv(data), usedUrl }
  const payload = typeof data === 'string' ? JSON.parse(data) : data
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.result?.records)
      ? payload.result.records
      : Array.isArray(payload?.records)
        ? payload.records
        : []
  return { records, usedUrl }
}

function httpFallbackUrl(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    parsed.protocol = 'http:'
    return parsed.toString()
  } catch {
    return null
  }
}

async function fetchResourceWithHttpFallback(url, format) {
  try {
    const data = format === 'CSV'
      ? await fetchText(url, CDC_RESOURCE_TIMEOUT_MS)
      : await fetchJson(url, CDC_RESOURCE_TIMEOUT_MS)
    return { data, usedUrl: url }
  } catch (httpsError) {
    const fallback = httpFallbackUrl(url)
    if (!fallback) throw httpsError
    console.warn(`[health] HTTPS resource failed, retrying CDC official host over HTTP: ${fallback}`)
    const data = format === 'CSV'
      ? await fetchText(fallback, CDC_RESOURCE_TIMEOUT_MS)
      : await fetchJson(fallback, CDC_RESOURCE_TIMEOUT_MS)
    return { data, usedUrl: fallback }
  }
}

async function loadCdcRecords(task) {
  const found = await findCdcResource(task)
  if (!found) return null
  const { records, usedUrl } = await loadResourceRecords(found.resource)
  return { ...found, records, usedUrl }
}

function buildDiseaseAdvisory({ diseaseName, title, records, dataset, resource, usedUrl }) {
  if (!records.length) return null
  const totals = new Map()
  for (const record of records) {
    const key = weekKey(record)
    if (!key) continue
    totals.set(key, (totals.get(key) || 0) + valueFromRecord(record, diseaseName))
  }
  const points = [...totals.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((first, second) => first.key.localeCompare(second.key))
    .filter((item) => item.value > 0)
  if (points.length < 6) return null

  const latest = points.at(-1)
  const previous = points.slice(-6, -1).map((item) => item.value).sort((a, b) => a - b)
  const median = previous[Math.floor(previous.length / 2)] || 0
  if (!latest || median <= 0) return null
  const ratio = latest.value / median
  if (ratio < 1.5) return null

  return withCommonFields({
    id: `cdc-${diseaseName}-trend-${latest.key}`,
    category: 'disease',
    severity: ratio >= 2 ? 'elevated' : 'notice',
    title,
    summary: `疾管署開放資料顯示，最新週 ${diseaseName} 急診就診人次較前 5 週中位數偏高。`,
    action: 'Q媽提醒：若前往室內遊戲場、親子館或餐廳，記得勤洗手，避免共用餐具；孩子不舒服時先暫緩出遊。',
    applicableAges: [{ label: '0至12歲', minMonths: 0, maxMonths: 155 }],
    regions: ['全國'],
    source: {
      ...SOURCES.cdcOpenData,
      name: dataset || SOURCES.cdcOpenData.name,
      url: usedUrl || resource?.url || SOURCES.cdcOpenData.url,
      fetchedAt: NOW,
      dataPeriod: latest.key,
    },
    evidence: `最新週 ${latest.key}：${latest.value}，前 5 週中位數：${median}，倍數：${ratio.toFixed(2)}。`,
  })
}

async function buildDiseaseTrendAdvisories() {
  const tasks = [
    {
      diseaseName: '腸病毒',
      query: '急診傳染病監測統計-腸病毒',
      dataGovDatasetId: 14587,
      title: '近期腸病毒急診就診人次偏高，室內遊戲要更注意清潔',
    },
    {
      diseaseName: '類流感',
      query: '急診傳染病監測統計-類流感',
      dataGovDatasetId: 14584,
      title: '近期類流感急診就診人次偏高，密閉空間多留意',
    },
  ]

  const advisories = []
  const failedDiseases = []
  const attempts = []
  for (const task of tasks) {
    let found = null
    try {
      found = await findCdcResource(task)
      if (!found) {
        failedDiseases.push(task.diseaseName)
        attempts.push({
          diseaseName: task.diseaseName,
          dataGovDatasetId: task.dataGovDatasetId,
          metadataVerified: false,
          ok: false,
          error: 'No CDC resource found',
        })
        continue
      }
      const { records, usedUrl } = await loadResourceRecords(found.resource)
      const advisory = buildDiseaseAdvisory({ ...task, ...found, records, usedUrl })
      if (advisory) advisories.push(advisory)
      attempts.push({
        diseaseName: task.diseaseName,
        dataGovDatasetId: task.dataGovDatasetId,
        metadataVerified: true,
        dataset: found.dataset,
        metadataUrl: found.metadataUrl,
        resourceUrl: found.resource?.url,
        usedUrl,
        resourceFormat: found.resource?.format,
        records: records.length,
        ok: true,
      })
    } catch (error) {
      failedDiseases.push(task.diseaseName)
      attempts.push({
        diseaseName: task.diseaseName,
        dataGovDatasetId: task.dataGovDatasetId,
        metadataVerified: Boolean(found),
        dataset: found?.dataset,
        metadataUrl: found?.metadataUrl,
        resourceUrl: found?.resource?.url,
        resourceFormat: found?.resource?.format,
        ok: false,
        error: error.message,
      })
      console.warn(`[health] CDC sync skipped for ${task.diseaseName}: ${error.message}`)
    }
  }
  return { advisories, failedDiseases, attempts }
}

const previousPayload = await readPreviousPayload()
const cdcTrendResult = await buildDiseaseTrendAdvisories()
const fallbackCdcTrends = previousCdcAdvisoriesFor(previousPayload, cdcTrendResult.failedDiseases)
if (fallbackCdcTrends.length) {
  console.warn(`[health] Reusing ${fallbackCdcTrends.length} previous CDC disease advisory/advisories because current fetch failed.`)
}

const advisories = [
  ...cdcTrendResult.advisories,
  ...fallbackCdcTrends,
  ...officialSeeds.map(withCommonFields),
]

await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true })
await fs.writeFile(OUTPUT, JSON.stringify({
  schemaVersion: 1,
  generatedAt: NOW,
  sourcePolicy: 'Only government public data and official Ministry of Health and Welfare / Taiwan CDC sources are allowed. Do not generate medical claims with AI.',
  syncStatus: {
    cdc: {
      freshAdvisories: cdcTrendResult.advisories.length,
      fallbackAdvisories: fallbackCdcTrends.length,
      failedDiseases: cdcTrendResult.failedDiseases,
      attempts: cdcTrendResult.attempts,
      fetchRetries: CDC_FETCH_RETRIES,
      searchTimeoutMs: CDC_SEARCH_TIMEOUT_MS,
      resourceTimeoutMs: CDC_RESOURCE_TIMEOUT_MS,
    },
  },
  advisories,
}, null, 2))

console.log(`Wrote ${advisories.length} health advisories to ${path.relative(ROOT, OUTPUT)}.`)

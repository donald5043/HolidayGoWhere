import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 每週健康檢查:即時內容(YouTube 直播、官方快照/播放頁)和自動同步排程都會「靜默腐爛」——
// 直播被下架、政府網站改版、TDX 端點停用,使用者會先發現,我們卻收不到任何錯誤通知。
// 這支腳本把三類風險攤開來看,壞了就讓 CI 用非 0 結束碼提醒(workflow 再開 issue)。
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SEEDS_FILE = path.join(ROOT, 'scripts', 'webcam-seeds.json')
const WEBCAMS_FILE = path.join(ROOT, 'public', 'data', 'webcams.json')
const REPORT_FILE = process.env.HEALTH_CHECK_OUTPUT || path.join(ROOT, 'docs', 'health-check-report.md')

const GITHUB_API = 'https://api.github.com'
const REPO = process.env.GITHUB_REPOSITORY || 'donald5043/HolidayGoWhere'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

// 排程一旦連續失敗這麼多次才算「壞了」,避免單次網路抖動就發 issue 洗版
const CONSECUTIVE_FAILURE_THRESHOLD = 3
const SYNC_WORKFLOWS = [
  'sync-webcams.yml',
  'sync-traffic.yml',
  'sync-places.yml',
  'sync-health-advisories.yml',
  'sync-medical.yml',
  'sync-osm-restaurants.yml',
]

// 大量 TDX 鏡頭沒辦法全部實測(數千支),抽樣看有沒有系統性故障(例如整批網域掛掉)
const SAMPLE_SIZE = 40
const FETCH_TIMEOUT_MS = 8000
// 有限並發:避免序列逐一檢查時,單一網域延遲拖慢整個檢查(數百支鏡頭跑到天荒地老)
const CONCURRENCY = 8

/** 有限並發跑 mapper,避免一次性 Promise.all 打爆目標網站或序列跑太久 */
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function withTimeout(promiseFactory) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await promiseFactory(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

async function checkYoutubeId(youtubeId) {
  try {
    const res = await withTimeout((signal) =>
      fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${youtubeId}`, { signal }),
    )
    return res.status === 200
  } catch {
    return false
  }
}

async function checkReachable(url) {
  if (!url) return true
  try {
    const res = await withTimeout((signal) => fetch(url, { method: 'GET', signal }))
    return res.status < 400
  } catch {
    return false
  }
}

async function checkSeeds(seeds) {
  const broken = []
  await mapWithConcurrency(seeds, CONCURRENCY, async (seed) => {
    if (seed.kind === 'youtube' && seed.youtubeId) {
      const ok = await checkYoutubeId(seed.youtubeId)
      if (!ok) broken.push({ id: seed.id, name: seed.name, reason: `YouTube ID 失效: ${seed.youtubeId}` })
    } else if (seed.kind === 'link' && seed.pageUrl) {
      const ok = await checkReachable(seed.pageUrl)
      if (!ok) broken.push({ id: seed.id, name: seed.name, reason: `頁面無法連線: ${seed.pageUrl}` })
    } else if (seed.kind === 'image' && (seed.imageUrl || seed.streamUrl)) {
      const ok = await checkReachable(seed.imageUrl || seed.streamUrl)
      if (!ok) broken.push({ id: seed.id, name: seed.name, reason: `影像網址無法連線: ${seed.imageUrl || seed.streamUrl}` })
    }
  })
  return broken
}

function sample(array, size) {
  const copy = [...array]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, size)
}

async function checkTdxSample(webcams) {
  const candidates = webcams.filter((cam) => cam.kind === 'image' && (cam.imageUrl || cam.streamUrl))
  const picked = sample(candidates, Math.min(SAMPLE_SIZE, candidates.length))
  const failedExamples = []
  let failed = 0
  await mapWithConcurrency(picked, CONCURRENCY, async (cam) => {
    const ok = await checkReachable(cam.imageUrl || cam.streamUrl)
    if (!ok) {
      failed += 1
      if (failedExamples.length < 8) failedExamples.push(`${cam.name}（${cam.source}）`)
    }
  })
  return { checked: picked.length, failed, failedExamples }
}

async function fetchWorkflowRuns(workflowFile) {
  if (!GITHUB_TOKEN) return null
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${REPO}/actions/workflows/${workflowFile}/runs?per_page=5&status=completed`,
      { headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: 'application/vnd.github+json' } },
    )
    if (!res.ok) return null
    const payload = await res.json()
    return payload.workflow_runs ?? []
  } catch {
    return null
  }
}

async function checkSyncWorkflows() {
  const results = []
  for (const workflowFile of SYNC_WORKFLOWS) {
    const runs = await fetchWorkflowRuns(workflowFile)
    if (!runs) {
      results.push({ workflowFile, status: 'unknown', detail: '無法讀取執行紀錄(可能缺少 GITHUB_TOKEN 權限)' })
      continue
    }
    if (!runs.length) {
      results.push({ workflowFile, status: 'unknown', detail: '尚無執行紀錄' })
      continue
    }
    let consecutiveFailures = 0
    for (const run of runs) {
      if (run.conclusion === 'failure') consecutiveFailures += 1
      else break
    }
    results.push({
      workflowFile,
      status: consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD ? 'broken' : 'ok',
      detail:
        consecutiveFailures > 0
          ? `最近連續失敗 ${consecutiveFailures} 次（最新一次：${runs[0].html_url}）`
          : `最新一次成功（${runs[0].run_started_at}）`,
    })
  }
  return results
}

async function main() {
  const seedsPayload = JSON.parse(await fs.readFile(SEEDS_FILE, 'utf8'))
  const seeds = seedsPayload.webcams ?? []
  const webcamsPayload = JSON.parse(await fs.readFile(WEBCAMS_FILE, 'utf8'))
  const webcams = webcamsPayload.webcams ?? []

  console.log(`[health-check] 檢查 ${seeds.length} 支策劃鏡頭(YouTube/官方連結)...`)
  const brokenSeeds = await checkSeeds(seeds)

  console.log(`[health-check] 抽樣檢查 TDX 鏡頭...`)
  const tdxSample = await checkTdxSample(webcams)

  console.log(`[health-check] 檢查同步排程執行紀錄...`)
  const workflowResults = await checkSyncWorkflows()

  const brokenWorkflows = workflowResults.filter((item) => item.status === 'broken')
  const tdxSampleFailRate = tdxSample.checked ? tdxSample.failed / tdxSample.checked : 0
  // 抽樣失敗率過高才視為異常;個別鏡頭斷線是常態,不用因此發 issue
  const tdxSampleUnhealthy = tdxSample.checked >= 10 && tdxSampleFailRate > 0.4

  const healthy = brokenSeeds.length === 0 && brokenWorkflows.length === 0 && !tdxSampleUnhealthy

  const generatedAt = new Date().toISOString()
  const report = `# HolidayGoWhere 每週健康檢查

Generated at: ${generatedAt}

## 結論：${healthy ? '✅ 正常' : '⚠️ 發現問題'}

## 策劃鏡頭（scripts/webcam-seeds.json，共 ${seeds.length} 支）

${brokenSeeds.length === 0 ? '全部正常。' : brokenSeeds.map((item) => `- **${item.name}** (\`${item.id}\`)：${item.reason}`).join('\n')}

## TDX 鏡頭抽樣（隨機 ${tdxSample.checked} / ${webcams.length} 支）

- 失敗：${tdxSample.failed} 支（${(tdxSampleFailRate * 100).toFixed(0)}%）
- 判定：${tdxSampleUnhealthy ? '⚠️ 失敗率過高，疑似系統性問題（網域掛掉、TDX 改版等）' : '正常範圍內（個別鏡頭斷線是常態）'}
${tdxSample.failedExamples.length ? `- 失敗範例：${tdxSample.failedExamples.join('、')}` : ''}

## 同步排程執行紀錄

${workflowResults
  .map((item) => `- ${item.status === 'broken' ? '⚠️' : item.status === 'unknown' ? '❔' : '✅'} \`${item.workflowFile}\`：${item.detail}`)
  .join('\n')}
`

  await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true })
  await fs.writeFile(REPORT_FILE, report, 'utf8')
  console.log(report)

  if (!healthy) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

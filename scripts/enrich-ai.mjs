import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLACES_FILE = path.join(ROOT, 'src', 'generated', 'places.json')
const OUTPUT_FILE = path.join(ROOT, 'src', 'generated', 'ai-insights.json')
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
const MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b'

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=')
    return [key, value]
  }),
)
const LIMIT = Math.max(1, Number(args.limit || process.env.AI_LIMIT || process.env.npm_config_limit || 10))
const FORCE = args.force === 'true'

const schema = {
  type: 'object',
  required: ['summary', 'whyForKids', 'rainyDay', 'stroller', 'tips', 'confidence'],
  properties: {
    summary: { type: 'string' },
    whyForKids: { type: 'array', items: { type: 'string' } },
    rainyDay: { type: 'string', enum: ['適合', '部分適合', '不適合', '未知'] },
    stroller: { type: 'string', enum: ['友善', '部分友善', '不友善', '未知'] },
    tips: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  additionalProperties: false,
}

function sourceHash(place) {
  return [
    place.updatedAt,
    place.name,
    place.description,
    place.setting,
    place.duration,
    place.facilities.join('|'),
  ].join('::')
}

function cleanLine(value, max = 90) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max).trim()}…` : text
}

function validate(result) {
  const rainyOptions = ['適合', '部分適合', '不適合', '未知']
  const strollerOptions = ['友善', '部分友善', '不友善', '未知']
  if (!result || typeof result !== 'object') throw new Error('AI 回傳不是物件')
  if (!cleanLine(result.summary)) throw new Error('缺少摘要')
  if (!rainyOptions.includes(result.rainyDay)) throw new Error('雨天選項錯誤')
  if (!strollerOptions.includes(result.stroller)) throw new Error('推車選項錯誤')
  return {
    summary: cleanLine(result.summary, 120),
    whyForKids: (Array.isArray(result.whyForKids) ? result.whyForKids : [])
      .map((item) => cleanLine(item, 60)).filter(Boolean).slice(0, 3),
    rainyDay: result.rainyDay,
    stroller: result.stroller,
    tips: (Array.isArray(result.tips) ? result.tips : [])
      .map((item) => cleanLine(item, 80)).filter(Boolean).slice(0, 3),
    confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0)),
  }
}

async function loadExisting() {
  try {
    return JSON.parse(await fs.readFile(OUTPUT_FILE, 'utf8'))
  } catch {
    return {}
  }
}

async function ensureOllama() {
  const response = await fetch(`${OLLAMA_URL}/api/tags`)
  if (!response.ok) throw new Error(`無法連線 Ollama：${response.status}`)
  const data = await response.json()
  if (!data.models?.some((model) => model.name === MODEL || model.model === MODEL)) {
    throw new Error(`本機尚未安裝模型 ${MODEL}`)
  }
}

async function generate(place) {
  const prompt = [
    `景點：${place.name}`,
    `地區：${place.city}${place.district}`,
    `分類：${place.category}`,
    `環境：${place.setting}`,
    `建議年齡：${place.ageMin}–${place.ageMax} 歲`,
    `建議時間：${place.duration}`,
    `官方介紹：${cleanLine(place.description, 600)}`,
    `已知設施：${place.facilities.join('、')}`,
    `開放時間：${place.hours}`,
    '',
    '請整理成親子出遊摘要。只能使用上述資料，不可補充未提供的事實。',
    'whyForKids 請提供 2–3 點；tips 只寫由資料可合理得出的提醒。',
    '若無法從資料判斷雨天或推車資訊，必須填「未知」。',
  ].join('\n')

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false,
      keep_alive: '30m',
      format: schema,
      options: { temperature: 0, num_predict: 240, num_ctx: 4096 },
      system: '你是台灣親子旅遊資料編輯。使用臺灣繁體中文，只能根據輸入資料整理，不可杜撰。嚴格輸出指定 JSON。',
      prompt,
    }),
  })
  if (!response.ok) throw new Error(`Ollama 錯誤：${response.status} ${await response.text()}`)
  const payload = await response.json()
  return validate(JSON.parse(payload.response))
}

async function main() {
  await ensureOllama()
  const places = JSON.parse(await fs.readFile(PLACES_FILE, 'utf8'))
  const insights = await loadExisting()
  const pending = places.filter((place) => {
    const current = insights[place.id]
    return FORCE || !current || current.sourceHash !== sourceHash(place) || current.model !== MODEL
  }).slice(0, LIMIT)

  if (!pending.length) {
    console.log('AI 摘要皆已是最新版本。')
    return
  }

  console.log(`使用 ${MODEL} 處理 ${pending.length} 筆（共 ${places.length} 筆景點）`)
  for (const [index, place] of pending.entries()) {
    const startedAt = Date.now()
    try {
      const insight = await generate(place)
      insights[place.id] = {
        ...insight,
        model: MODEL,
        sourceHash: sourceHash(place),
        generatedAt: new Date().toISOString(),
      }
      await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(insights, null, 2)}\n`, 'utf8')
      console.log(`[${index + 1}/${pending.length}] ${place.name} 完成（${Math.round((Date.now() - startedAt) / 1000)} 秒）`)
    } catch (error) {
      console.error(`[${index + 1}/${pending.length}] ${place.name} 失敗：${error.message}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

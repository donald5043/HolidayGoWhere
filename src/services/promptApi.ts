/**
 * promptApi.ts — Chrome 內建 Prompt API（Gemini Nano）漸進增強層
 *
 * 只在模型「已就緒」時使用（絕不觸發下載，Nano 要抓約 2GB）。
 * iPhone / Safari / 不支援的環境會安靜地回傳 null，
 * 由 concierge.ts 的模板回覆負責完整體驗——Nano 只是加分項。
 *
 * 安全邊界：Nano 只改寫既有草稿的語氣，推薦地點卡片一律來自
 * 本地檢索結果，模型輸出不會新增或替換任何地點。
 */

type LanguageModelSession = {
  prompt: (input: string) => Promise<string>
  destroy?: () => void
}

type ModernLanguageModel = {
  availability: () => Promise<string>
  create: (options?: {
    initialPrompts?: { role: string; content: string }[]
    expectedInputs?: { type: string; languages: string[] }[]
    expectedOutputs?: { type: string; languages: string[] }[]
  }) => Promise<LanguageModelSession>
}

type LegacyLanguageModel = {
  capabilities: () => Promise<{ available: string }>
  create: (options?: { systemPrompt?: string }) => Promise<LanguageModelSession>
}

const SYSTEM_PROMPT =
  '你是台灣親子旅遊 App「假日去哪兒」的吉祥物Q媽，一位溫暖幹練的媽媽。' +
  '任務：把使用者給你的草稿改寫得更口語、更有溫度。' +
  '規則：只能改寫草稿內容，絕對不可以新增地點、店名或任何草稿沒有的資訊；' +
  '使用繁體中文（台灣用語）；長度不超過 80 字；不要用表情符號以外的裝飾。'

let sessionPromise: Promise<LanguageModelSession | null> | null = null

async function getSession(): Promise<LanguageModelSession | null> {
  if (sessionPromise) return sessionPromise
  sessionPromise = (async () => {
    try {
      const g = globalThis as Record<string, unknown>

      // 新版 API（Chrome 138+）：全域 LanguageModel
      const modern = g.LanguageModel as ModernLanguageModel | undefined
      if (modern?.availability) {
        const availability = await modern.availability()
        if (availability !== 'available') return null
        return await modern.create({
          initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
          expectedInputs: [{ type: 'text', languages: ['zh-TW'] }],
          expectedOutputs: [{ type: 'text', languages: ['zh-TW'] }],
        })
      }

      // 舊版 API：window.ai.languageModel
      const ai = g.ai as { languageModel?: LegacyLanguageModel } | undefined
      const legacy = ai?.languageModel
      if (legacy?.capabilities) {
        const caps = await legacy.capabilities()
        if (caps.available !== 'readily') return null
        return await legacy.create({ systemPrompt: SYSTEM_PROMPT })
      }

      return null
    } catch {
      return null
    }
  })()
  return sessionPromise
}

/** 裝置端模型是否已就緒（不觸發下載） */
export async function isNanoReady(): Promise<boolean> {
  return (await getSession()) !== null
}

/**
 * 用 Gemini Nano 把草稿改寫得更口語；失敗、超時或輸出可疑一律回 null。
 */
export async function rewriteWithNano(draft: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const session = await getSession()
    if (!session) return null

    const result = await Promise.race([
      session.prompt(`請改寫這段話（只能改語氣，不能新增資訊）：\n${draft}`),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])

    if (typeof result !== 'string') return null
    const cleaned = result.trim()
    // 輸出品質守門：太短、太長、或看起來不是繁中回覆就放棄
    if (cleaned.length < 8 || cleaned.length > 160) return null
    return cleaned
  } catch {
    return null
  }
}

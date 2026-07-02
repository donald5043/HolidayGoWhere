import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, MapPin, Mic, Send, Sparkles, X } from 'lucide-react'
import type { Place, WeatherSummary } from '../data'
import { answerQuery, GREETING_CHIPS, GREETING_TEXT, type ConciergePick } from '../services/concierge'
import { isNanoReady, rewriteWithNano } from '../services/promptApi'
import { fetchPublicJson } from '../lib/fetchPublicJson'
import { Mascot } from './Mascot'
import { PlaceImage } from './PlaceCard'

type UserLocation = { lat: number; lng: number }

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  picks?: ConciergePick[]
  chips?: string[]
}

type Props = {
  places: Place[]
  weather: WeatherSummary | null
  userLocation: UserLocation | null
  onClose: () => void
  onOpenPlace: (place: Place) => void
}

const STORAGE_KEY = 'holiday-go-where:concierge-chat'
const MAX_STORED_MESSAGES = 30

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort?: () => void
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const g = globalThis as Record<string, unknown>
  return (g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null
}

function loadStoredMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { id: string; role: 'user' | 'assistant'; text: string; chips?: string[] }[]
    // picks 內含完整 place 物件，不落地儲存 — 只還原文字與 chips
    return parsed.filter((m) => m && typeof m.text === 'string' && (m.role === 'user' || m.role === 'assistant'))
  } catch {
    return []
  }
}

function persistMessages(messages: ChatMessage[]) {
  try {
    const slim = messages.slice(-MAX_STORED_MESSAGES).map(({ id, role, text, chips }) => ({ id, role, text, chips }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
  } catch { /* 儲存失敗不影響對話 */ }
}

let messageSeq = 0
function nextId() {
  messageSeq += 1
  return `msg-${Date.now()}-${messageSeq}`
}

function greetingMessage(): ChatMessage {
  return { id: nextId(), role: 'assistant', text: GREETING_TEXT, chips: GREETING_CHIPS }
}

export function ConciergeChat({ places, weather, userLocation, onClose, onOpenPlace }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const stored = loadStoredMessages()
    return stored.length > 0 ? stored : [greetingMessage()]
  })
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [nanoActive, setNanoActive] = useState(false)
  const [listening, setListening] = useState(false)
  const [featuredRestaurants, setFeaturedRestaurants] = useState<Place[]>([])
  const shownIdsRef = useRef<Set<string>>(new Set())
  const lastQueryRef = useRef<string>('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const voiceTimeoutRef = useRef<number | null>(null)

  const speechSupported = useMemo(() => getSpeechRecognition() !== null, [])

  useEffect(() => {
    isNanoReady().then(setNanoActive).catch(() => setNanoActive(false))
    // 首頁 featured 資料集餐廳很少，補上精選餐廳讓「吃什麼」類問題有料可答
    fetchPublicJson<Place[]>('data/restaurants-featured.json')
      .then(setFeaturedRestaurants)
      .catch(() => {/* silent */})
  }, [])

  const conciergePlaces = useMemo(() => {
    if (featuredRestaurants.length === 0) return places
    const seen = new Set(places.map((p) => p.id))
    return [...places, ...featuredRestaurants.filter((p) => !seen.has(p.id))]
  }, [places, featuredRestaurants])

  useEffect(() => {
    persistMessages(messages)
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, thinking])

  const stopVoice = useCallback(() => {
    if (voiceTimeoutRef.current != null) {
      window.clearTimeout(voiceTimeoutRef.current)
      voiceTimeoutRef.current = null
    }
    const recognition = recognitionRef.current
    recognitionRef.current = null
    setListening(false)
    if (recognition) {
      // 先卸掉 handler 再停止，避免 iOS 延遲觸發的 onend/onerror 又動到狀態
      recognition.onresult = null
      recognition.onend = null
      recognition.onerror = null
      try { recognition.stop() } catch { /* iOS 可能在未啟動完成時丟錯 */ }
      try { recognition.abort?.() } catch { /* 同上 */ }
    }
  }, [])

  useEffect(() => () => { stopVoice() }, [stopVoice])

  const runQuery = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim()
    if (!query || thinking) return

    const isRefresh = query === '換一批'
    const effectiveQuery = isRefresh && lastQueryRef.current ? lastQueryRef.current : query
    if (!isRefresh) {
      lastQueryRef.current = query
      shownIdsRef.current = new Set()
    }

    setMessages((current) => [...current, { id: nextId(), role: 'user', text: query }])
    setInput('')
    setThinking(true)

    // 讓「思考中」動畫至少露臉一下，回覆才不會閃現
    const minDelay = new Promise((resolve) => setTimeout(resolve, 450))

    const answer = answerQuery(effectiveQuery, { places: conciergePlaces, weather, userLocation }, {
      excludeIds: [...shownIdsRef.current],
      seed: messages.length,
    })
    for (const pick of answer.picks) shownIdsRef.current.add(pick.place.id)

    let text = answer.text
    if (nanoActive && answer.picks.length > 0) {
      const rewritten = await rewriteWithNano(answer.text)
      if (rewritten) text = rewritten
    }
    await minDelay

    setMessages((current) => [
      ...current,
      { id: nextId(), role: 'assistant', text, picks: answer.picks, chips: answer.chips },
    ])
    setThinking(false)
  }, [conciergePlaces, messages.length, nanoActive, thinking, userLocation, weather])

  const toggleVoice = useCallback(() => {
    // 聆聽中再按一次 = 取消，回到打字輸入
    if (listening) {
      stopVoice()
      return
    }
    const Recognition = getSpeechRecognition()
    if (!Recognition) return
    try {
      const recognition = new Recognition()
      recognitionRef.current = recognition
      recognition.lang = 'zh-TW'
      recognition.interimResults = false
      recognition.maxAlternatives = 1
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript?.trim()
        stopVoice()
        if (transcript) runQuery(transcript)
      }
      recognition.onerror = () => stopVoice()
      recognition.onend = () => stopVoice()
      recognition.start()
      setListening(true)
      // 保險絲：iOS 的 onend 不一定觸發，15 秒後強制結束避免卡死
      voiceTimeoutRef.current = window.setTimeout(stopVoice, 15000)
    } catch {
      stopVoice()
    }
  }, [listening, runQuery, stopVoice])

  return (
    <div className="modal-backdrop concierge-backdrop" onClick={onClose}>
      <section className="concierge-sheet" onClick={(event) => event.stopPropagation()} aria-label="Q媽隨行管家">
        <header className="concierge-header">
          <Mascot variant="qMom" className="concierge-avatar" alt="Q媽" loading="eager" />
          <div className="concierge-header-copy">
            <strong>Q媽隨行管家</strong>
            <span className="concierge-engine">
              <Sparkles size={11} />
              {nanoActive ? '裝置端 AI・對話不離開手機' : '智慧推薦・全程免費'}
            </span>
          </div>
          <button className="modal-close concierge-close" onClick={onClose} aria-label="關閉"><X /></button>
        </header>

        <div className="concierge-scroll" ref={scrollRef}>
          {messages.map((message) => (
            <div key={message.id} className={`concierge-row concierge-row--${message.role}`}>
              {message.role === 'assistant' && (
                <Mascot variant="qMom" className="concierge-bubble-avatar" alt="" />
              )}
              <div className="concierge-bubble-group">
                <div className={`concierge-bubble concierge-bubble--${message.role}`}>
                  {message.text}
                </div>
                {message.picks && message.picks.length > 0 && (
                  <div className="concierge-picks">
                    {message.picks.map(({ place, reason, distanceKm }) => (
                      <button
                        key={place.id}
                        className="concierge-pick-card"
                        onClick={() => onOpenPlace(place)}
                      >
                        <PlaceImage place={place} className="concierge-pick-image" />
                        <span className="concierge-pick-info">
                          <strong>{place.name}</strong>
                          <small>
                            <MapPin size={10} />
                            {place.city}{place.district && `・${place.district}`}
                            {distanceKm != null && distanceKm < 50 && `・${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}`}
                          </small>
                          <em>{reason}</em>
                        </span>
                        <ChevronRight size={14} className="concierge-pick-arrow" />
                      </button>
                    ))}
                  </div>
                )}
                {message.chips && message.chips.length > 0 && (
                  <div className="concierge-chips">
                    {message.chips.map((chip) => (
                      <button key={chip} className="concierge-chip" onClick={() => runQuery(chip)} disabled={thinking}>
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="concierge-row concierge-row--assistant">
              <Mascot variant="thinking" className="concierge-bubble-avatar" alt="" />
              <div className="concierge-bubble concierge-bubble--assistant concierge-typing">
                <span /><span /><span />
              </div>
            </div>
          )}
        </div>

        <form
          className="concierge-input-row"
          onSubmit={(event) => { event.preventDefault(); runQuery(input) }}
        >
          {speechSupported && (
            <button
              type="button"
              className={`concierge-mic${listening ? ' is-listening' : ''}`}
              onClick={toggleVoice}
              aria-label={listening ? '取消語音輸入' : '語音輸入'}
            >
              {listening ? <X size={17} /> : <Mic size={17} />}
            </button>
          )}
          <input
            type="text"
            value={input}
            onChange={(event) => {
              if (listening) stopVoice()
              setInput(event.target.value)
            }}
            onFocus={() => { if (listening) stopVoice() }}
            placeholder={listening ? '聆聽中…再按一次取消' : '例如：下雨帶2歲去哪？'}
            aria-label="輸入問題"
            enterKeyHint="send"
          />
          <button type="submit" className="concierge-send" disabled={!input.trim() || thinking} aria-label="送出">
            <Send size={16} />
          </button>
        </form>
        <p className="concierge-disclaimer">推薦來自政府與社群開放資料，出發前請以官方資訊為準。</p>
      </section>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'

export function useSound() {
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('holiday-go-where:sound') === 'on')
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    localStorage.setItem('holiday-go-where:sound', soundEnabled ? 'on' : 'off')
  }, [soundEnabled])

  const playUiSound = useCallback((kind: 'tap' | 'favorite' | 'open' = 'tap', force = false) => {
    if (!soundEnabled && !force) return
    const AudioContextClass = window.AudioContext || (window as typeof window & {
      webkitAudioContext?: typeof AudioContext
    }).webkitAudioContext
    if (!AudioContextClass) return
    const context = audioContextRef.current || new AudioContextClass()
    audioContextRef.current = context
    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const frequencies = kind === 'favorite' ? [523, 659] : kind === 'open' ? [392, 523] : [440]
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequencies[0], now)
    if (frequencies[1]) oscillator.frequency.exponentialRampToValueAtTime(frequencies[1], now + 0.09)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.15)
  }, [soundEnabled])

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    if (next) playUiSound('open', true)
  }

  return { soundEnabled, playUiSound, toggleSound }
}

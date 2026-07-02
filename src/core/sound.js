// Web Audio API 합성음 엔진 (외부 파일 없음)
// load(gameId) 로 게임별 SFX 파일 캐시 → 없으면 합성음 fallback
let _ctx   = null
let _muted = false

// sfxName → HTMLAudioElement (파일 캐시)
const _sfxCache = {}

const SFX_NAMES = ['beep', 'go', 'success', 'hit', 'round_clear', 'game_clear', 'game_over']

function _getCtx() {
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) { return null }
  }
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

// 첫 사용자 터치/클릭에서 호출 → 자동재생 정책 대응
export function activate() { _getCtx() }

export function toggle() { _muted = !_muted; return _muted }
export function isMuted() { return _muted }

// gameId 기반 SFX 파일 캐시 로드 (없으면 합성음 fallback 유지)
export async function load(gameId) {
  const base = `/assets/audio/${gameId}/sfx`
  await Promise.all(SFX_NAMES.map(async (name) => {
    const url = `${base}/${name}.mp3`
    try {
      const res = await fetch(url, { method: 'HEAD' })
      if (res.ok) {
        const a    = new Audio(url)
        a.preload  = 'auto'
        a.volume   = 0.75
        _sfxCache[name] = a
      } else {
        delete _sfxCache[name]
      }
    } catch (_) {
      delete _sfxCache[name]
    }
  }))
}

// 캐시 파일 재생 시도, 없으면 synthFn 호출
function _playOrSynth(name, synthFn) {
  if (_muted) return
  const cached = _sfxCache[name]
  if (cached) {
    cached.currentTime = 0
    cached.play().catch(() => {})
    return
  }
  synthFn()
}

// 단일 톤 헬퍼
function _tone(c, freq, type, vol, start, dur) {
  try {
    const osc  = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    osc.type = type
    osc.frequency.setValueAtTime(freq, c.currentTime + start)
    gain.gain.setValueAtTime(0, c.currentTime)
    gain.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur)
    osc.start(c.currentTime + start)
    osc.stop(c.currentTime + start + dur + 0.05)
  } catch (_) {}
}

// 카운트다운 비프 (3, 2, 1)
export function playBeep() {
  _playOrSynth('beep', () => {
    const c = _getCtx(); if (!c) return
    _tone(c, 880, 'sine', 0.3, 0, 0.12)
  })
}

// GO! 신호음
export function playGo() {
  _playOrSynth('go', () => {
    const c = _getCtx(); if (!c) return
    _tone(c, 1046, 'sine', 0.4, 0,    0.15)
    _tone(c, 1318, 'sine', 0.4, 0.16, 0.28)
  })
}

// 회피 성공 (밝은 두 음)
export function playSuccess() {
  _playOrSynth('success', () => {
    const c = _getCtx(); if (!c) return
    _tone(c, 784,  'sine', 0.18, 0,    0.07)
    _tone(c, 1047, 'sine', 0.18, 0.07, 0.1)
  })
}

// 히트 (둔탁한 하강음)
export function playHit() {
  _playOrSynth('hit', () => {
    const c = _getCtx(); if (!c) return
    try {
      const osc  = c.createOscillator()
      const gain = c.createGain()
      osc.connect(gain); gain.connect(c.destination)
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(240, c.currentTime)
      osc.frequency.exponentialRampToValueAtTime(55, c.currentTime + 0.18)
      gain.gain.setValueAtTime(0.5, c.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.22)
      osc.start(); osc.stop(c.currentTime + 0.25)
    } catch (_) {}
  })
}

// 라운드 클리어 (상승 4음)
export function playRoundClear() {
  _playOrSynth('round_clear', () => {
    const c = _getCtx(); if (!c) return
    ;[523, 659, 784, 1047].forEach((f, i) => _tone(c, f, 'sine', 0.28, i * 0.1, 0.16))
  })
}

// 게임 클리어 팡파레 (상승 5음)
export function playGameClear() {
  _playOrSynth('game_clear', () => {
    const c = _getCtx(); if (!c) return
    ;[523, 659, 784, 1047, 1318].forEach((f, i) => _tone(c, f, 'triangle', 0.32, i * 0.12, 0.22))
  })
}

// 게임 오버 (하강음)
export function playGameOver() {
  _playOrSynth('game_over', () => {
    const c = _getCtx(); if (!c) return
    ;[880, 698, 554, 440, 330].forEach((f, i) => _tone(c, f, 'sawtooth', 0.2, i * 0.13, 0.16))
  })
}

// 범용 재생 인터페이스
export function play(sfxName) {
  switch (sfxName) {
    case 'beep':        return playBeep()
    case 'go':          return playGo()
    case 'success':     return playSuccess()
    case 'hit':         return playHit()
    case 'round_clear': return playRoundClear()
    case 'game_clear':  return playGameClear()
    case 'game_over':   return playGameOver()
  }
}

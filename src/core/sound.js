// Web Audio API 합성음 엔진 (외부 파일 없음)
let _ctx = null
let _muted = false

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
  if (_muted) return
  const c = _getCtx(); if (!c) return
  _tone(c, 880, 'sine', 0.3, 0, 0.12)
}

// GO! 신호음
export function playGo() {
  if (_muted) return
  const c = _getCtx(); if (!c) return
  _tone(c, 1046, 'sine', 0.4, 0,    0.15)
  _tone(c, 1318, 'sine', 0.4, 0.16, 0.28)
}

// 회피 성공 (밝은 두 음)
export function playSuccess() {
  if (_muted) return
  const c = _getCtx(); if (!c) return
  _tone(c, 784,  'sine', 0.18, 0,    0.07)
  _tone(c, 1047, 'sine', 0.18, 0.07, 0.1)
}

// 히트 (둔탁한 하강음)
export function playHit() {
  if (_muted) return
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
}

// 라운드 클리어 (상승 4음)
export function playRoundClear() {
  if (_muted) return
  const c = _getCtx(); if (!c) return
  ;[523, 659, 784, 1047].forEach((f, i) => _tone(c, f, 'sine', 0.28, i * 0.1, 0.16))
}

// 게임 클리어 팡파레 (상승 5음)
export function playGameClear() {
  if (_muted) return
  const c = _getCtx(); if (!c) return
  ;[523, 659, 784, 1047, 1318].forEach((f, i) => _tone(c, f, 'triangle', 0.32, i * 0.12, 0.22))
}

// 게임 오버 (하강음)
export function playGameOver() {
  if (_muted) return
  const c = _getCtx(); if (!c) return
  ;[880, 698, 554, 440, 330].forEach((f, i) => _tone(c, f, 'sawtooth', 0.2, i * 0.13, 0.16))
}

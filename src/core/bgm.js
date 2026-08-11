// BGM 관리 모듈 — 게임별 배경음악 자동 로드 + 재생/정지

import { audioFileExists } from './audioProbe.js'

const COMMON_BGM = '/assets/audio/common/Kingdom.mp3'
const BGM_VOLUME = 0.45
const FADE_MS    = 500

let _audio      = null
let _muted      = false
let _currentSrc = null
// stop() 이후 "첫 인터랙션 자동재생 fallback"이 되살리지 못하도록 막는 플래그.
// (웜업처럼 자체 BGM을 트는 게임팩에서 두 곡이 겹치는 걸 방지)
let _suspended  = false

function _getAudio() {
  if (!_audio) {
    _audio = new Audio(COMMON_BGM)
    _audio.loop   = true
    _audio.volume = _muted ? 0 : BGM_VOLUME
    _audio.addEventListener('error', () => {})
    _currentSrc = COMMON_BGM
  }
  return _audio
}

function _fadeOut() {
  return new Promise(resolve => {
    if (!_audio || _audio.paused) { resolve(); return }
    const from    = _audio.volume
    if (from <= 0) { _audio.pause(); resolve(); return }
    const steps   = 20
    const stepMs  = FADE_MS / steps
    const stepVol = from / steps
    let i = 0
    const id = setInterval(() => {
      i++
      _audio.volume = Math.max(0, from - stepVol * i)
      if (i >= steps) { clearInterval(id); _audio.pause(); resolve() }
    }, stepMs)
  })
}

// 첫 사용자 인터랙션에서 재생하도록 대기하는 fallback 등록
function _registerAutoplayFallback(audio) {
  const resume = () => {
    if (audio.paused && !_muted && !_suspended) audio.play().catch(() => {})
    document.removeEventListener('click',      resume)
    document.removeEventListener('touchstart', resume)
    document.removeEventListener('keydown',    resume)
  }
  document.addEventListener('click',      resume, { once: true })
  document.addEventListener('touchstart', resume, { once: true })
  document.addEventListener('keydown',    resume, { once: true })
}

// gameId 기반으로 BGM 소스 결정: 게임별 → 공통 fallback
export async function load(gameId) {
  const gameSrc = `/assets/audio/${gameId}/bgm/bgm.mp3`
  // 게임 전용 곡이 **실제로** 있을 때만 쓴다. 없으면 공통곡.
  // (상태 코드만 보면 없는 파일도 200 → HTML을 오디오로 물었다. audioProbe 참고)
  const newSrc = (await audioFileExists(gameSrc)) ? gameSrc : COMMON_BGM

  if (newSrc === _currentSrc) return   // 변경 없으면 스킵

  await _fadeOut()

  const a   = _getAudio()
  a.src     = newSrc
  a.volume  = 0
  a.load()
  _currentSrc = newSrc
}

export async function play() {
  _suspended = false
  const a = _getAudio()
  if (!a.paused) return
  if (_muted) return
  a.volume = BGM_VOLUME
  try {
    await a.play()
  } catch (e) {
    // 조용히 삼키면 "소리가 왜 안 나지"를 눈으로 찾게 된다. 이유를 남긴다.
    console.info('[bgm] 자동재생이 막혔다 — 첫 클릭에서 다시 시도한다:', e?.name ?? e)
    _registerAutoplayFallback(a)
  }
}

export function stop() {
  _suspended = true
  if (!_audio) return
  _audio.pause()
  _audio.currentTime = 0
}

export function isMuted() { return _muted }

// 소리가 나고 있나. Audio 객체는 DOM에 없어서 밖에서 들여다볼 방법이 이것뿐이다 —
// "허브에서 음악이 난다" 같은 문제를 확인하려면 눈이 아니라 값이 있어야 한다.
export function isPlaying() { return !!_audio && !_audio.paused }

export function toggleMute() {
  _muted = !_muted
  if (!_audio) return _muted
  if (_muted) {
    _audio.volume = 0
  } else {
    _audio.volume = BGM_VOLUME
    if (_audio.paused) _audio.play().catch(() => {})
  }
  return _muted
}

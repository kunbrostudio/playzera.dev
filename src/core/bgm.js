// BGM 관리 모듈 — 게임 배경음악 재생/정지

const BGM_SRC = '/assets/audio/Kingdom.mp3'
const BGM_VOLUME = 0.45

let _audio = null
let _muted = false

function _getAudio() {
  if (!_audio) {
    _audio = new Audio(BGM_SRC)
    _audio.loop = true
    _audio.volume = _muted ? 0 : BGM_VOLUME
    _audio.addEventListener('error', () => {
      // 파일 로드 실패 시 조용히 무시
    })
  }
  return _audio
}

// 첫 사용자 인터랙션에서 재생하도록 대기하는 fallback 등록
function _registerAutoplayFallback(audio) {
  const resume = () => {
    if (audio.paused && !_muted) audio.play().catch(() => {})
    document.removeEventListener('click',      resume)
    document.removeEventListener('touchstart', resume)
    document.removeEventListener('keydown',    resume)
  }
  document.addEventListener('click',      resume, { once: true })
  document.addEventListener('touchstart', resume, { once: true })
  document.addEventListener('keydown',    resume, { once: true })
}

export async function play() {
  const a = _getAudio()
  if (!a.paused) return           // 이미 재생 중이면 스킵
  if (_muted) return
  try {
    await a.play()
  } catch (_) {
    // 브라우저 자동재생 차단 → 첫 인터랙션 때 재생
    _registerAutoplayFallback(a)
  }
}

export function stop() {
  if (!_audio) return
  _audio.pause()
  _audio.currentTime = 0
}

export function isMuted() { return _muted }

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

// 향후 확장 예정
// export function setVolume(v) { BGM_VOLUME = Math.max(0, Math.min(1, v)); if (!_muted && _audio) _audio.volume = BGM_VOLUME }

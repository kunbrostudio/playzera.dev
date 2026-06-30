// BGM 관리 모듈 — 게임 배경음악 재생/정지

const BGM_SRC = '/assets/audio/Kingdom.mp3'
const BGM_VOLUME = 0.45

let _audio = null

function _getAudio() {
  if (!_audio) {
    _audio = new Audio(BGM_SRC)
    _audio.loop = true
    _audio.volume = BGM_VOLUME
    _audio.addEventListener('error', () => {
      // 파일 로드 실패 시 조용히 무시 — 게임에 영향 없음
    })
  }
  return _audio
}

export async function play() {
  const a = _getAudio()
  if (!a.paused) return           // 이미 재생 중이면 중복 시작 안 함
  try {
    await a.play()
  } catch (_) {
    // 브라우저 자동재생 차단 시 조용히 무시
  }
}

export function stop() {
  if (!_audio) return
  _audio.pause()
  _audio.currentTime = 0
}

// 향후 확장 예정 (지금은 미구현)
// export function setVolume(v) { _getAudio().volume = Math.max(0, Math.min(1, v)) }
// export function toggle() { _audio?.paused ? play() : stop() }

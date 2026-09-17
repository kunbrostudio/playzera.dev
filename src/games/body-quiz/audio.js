// BODY QUIZ 오디오 이벤트 조정 계층.
//
// 실제 음소거 상태와 WebAudio/BGM 수명은 Play Zera 공통 sound.js·bgm.js가
// 소유한다. 이 파일은 BODY QUIZ의 어떤 상태 전이에 어떤 소리를 한 번 낼지만
// 결정한다. 전용 파일이 없으므로 SFX는 공통 합성음을 쓴다. 사용자가 공통곡을
// Jurassic 톤으로 느꼈고 별도 neutral 곡도 없어서 BODY QUIZ BGM은 비활성화한다.

import * as bgm from '../../core/bgm.js'
import * as sound from '../../core/sound.js'

export const BODY_QUIZ_AUDIO_POLICY = Object.freeze({
  gameId: 'body-quiz',
  bgmMode: 'disabled-no-suitable-asset',
  countdownFirstBeep: 2,
  buttonDebounceMs: 90,
})

export function createBodyQuizButtonSfx({ soundApi = sound } = {}) {
  let lastPlayedAt = -Infinity
  return function playButton(kind = 'default', now = performance.now()) {
    soundApi.activate?.()
    if (now - lastPlayedAt < BODY_QUIZ_AUDIO_POLICY.buttonDebounceMs) return false
    lastPlayedAt = now
    if (kind === 'primary') soundApi.playSuccess?.()
    else soundApi.playBeep?.()
    return true
  }
}

export const playBodyQuizButtonSfx = createBodyQuizButtonSfx()

/** 다른 게임 BGM이 game route 사이에서 이어지는 것도 BODY QUIZ 진입 시 끊는다. */
export function silenceBodyQuizBgm() {
  bgm.stop()
}

export function createBodyQuizAudio({ bgmApi = bgm, soundApi = sound } = {}) {
  let preparePromise = null
  let started = false
  let destroyed = false
  let lastSquatCount = 0
  let unlockPlayed = false
  let selectedSide = null
  let countdown = null
  let resultPlayed = false
  let completed = false

  function prepare(gameId = BODY_QUIZ_AUDIO_POLICY.gameId) {
    if (!preparePromise) {
      // 별도 음원을 억지로 빌리지 않는다. 진입 즉시 이전 게임 BGM만 정리한다.
      bgmApi.stop?.()
      preparePromise = Promise.resolve({ bgm: 'disabled' })
    }
    return preparePromise
  }

  function activate() {
    if (!destroyed) soundApi.activate?.()
  }

  async function start(gameId = BODY_QUIZ_AUDIO_POLICY.gameId) {
    if (started || destroyed) return
    started = true
    activate()
    soundApi.playGo?.()
    await prepare(gameId)
  }

  function squat(count, target) {
    if (destroyed || count <= lastSquatCount) return
    lastSquatCount = count
    if (count >= target) {
      if (!unlockPlayed) {
        unlockPlayed = true
        // 마지막 rep 성공음과 unlock음을 겹치지 않고 한 번만 낸다.
        soundApi.playGo?.()
      }
    } else {
      soundApi.playSuccess?.()
    }
  }

  function enterSelection(side) {
    if (destroyed || !side || selectedSide === side) return
    selectedSide = side
    countdown = null
    soundApi.playSuccess?.()
  }

  function selectionCountdown(value) {
    if (destroyed || value == null || value === countdown) return
    countdown = value
    // zone 진입음이 3과 같은 순간에 울리므로 2·1에서만 짧게 센다.
    if (value <= BODY_QUIZ_AUDIO_POLICY.countdownFirstBeep) soundApi.playBeep?.()
  }

  function cancelSelection() {
    selectedSide = null
    countdown = null
  }

  function result(correct) {
    if (destroyed || resultPlayed) return
    resultPlayed = true
    if (correct) soundApi.playRoundClear?.()
    else soundApi.playHit?.()
  }

  function nextQuestion() {
    lastSquatCount = 0
    unlockPlayed = false
    selectedSide = null
    countdown = null
    resultPlayed = false
  }

  function complete() {
    if (destroyed || completed) return
    completed = true
    soundApi.playGameClear?.()
  }

  function destroy() {
    destroyed = true
    cancelSelection()
    // 재생 중인 BODY QUIZ BGM 자체가 없으므로 timer/listener만 남지 않는다.
  }

  return {
    prepare,
    activate,
    start,
    squat,
    enterSelection,
    selectionCountdown,
    cancelSelection,
    result,
    nextQuestion,
    complete,
    destroy,
  }
}

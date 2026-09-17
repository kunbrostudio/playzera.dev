import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import * as bgm from '../src/core/bgm.js'
import * as sound from '../src/core/sound.js'
import {
  BODY_QUIZ_AUDIO_POLICY,
  createBodyQuizAudio,
  createBodyQuizButtonSfx,
} from '../src/games/body-quiz/audio.js'
import {
  bindBodyQuizSystemBar,
  bodyQuizSystemBarMarkup,
} from '../src/games/body-quiz/tutorial.js'

function fakes() {
  return {
    bgmApi: { stop: vi.fn(), load: vi.fn(), play: vi.fn(() => Promise.resolve()) },
    soundApi: {
      activate: vi.fn(), playGo: vi.fn(), playSuccess: vi.fn(), playBeep: vi.fn(),
      playRoundClear: vi.fn(), playHit: vi.fn(), playGameClear: vi.fn(),
    },
  }
}

describe('BODY QUIZ audio coordinator', () => {
  it('전용 BGM이 생기기 전에는 다른 게임/공통곡을 빌리지 않는다', () => {
    expect(BODY_QUIZ_AUDIO_POLICY.bgmMode).toBe('disabled-no-suitable-asset')
    const source = fs.readFileSync('src/games/body-quiz/audio.js', 'utf8')
    expect(source).not.toMatch(/\/assets\/[^'"\s]*(?:jurassic|Kingdom)[^'"\s]*\.mp3/i)
  })

  it('게임 시작음은 한 번 내고 이전 BGM은 끊되 새 BGM은 재생하지 않는다', async () => {
    const api = fakes()
    const audio = createBodyQuizAudio(api)
    await audio.start()

    expect(api.soundApi.activate).toHaveBeenCalledOnce()
    expect(api.soundApi.playGo).toHaveBeenCalledOnce()
    expect(api.bgmApi.stop).toHaveBeenCalledOnce()
    expect(api.bgmApi.load).not.toHaveBeenCalled()
    expect(api.bgmApi.play).not.toHaveBeenCalled()

    await audio.start()
    expect(api.soundApi.playGo).toHaveBeenCalledOnce()
    expect(api.bgmApi.stop).toHaveBeenCalledOnce()
  })

  it('prepare를 여러 번 불러도 이전 BGM 정리는 한 번만 한다', async () => {
    const api = fakes()
    const audio = createBodyQuizAudio(api)
    await Promise.all([audio.prepare(), audio.prepare()])
    expect(api.bgmApi.stop).toHaveBeenCalledOnce()
    expect(api.bgmApi.play).not.toHaveBeenCalled()
  })

  it('버튼음은 CTA를 구분하고 빠른 중복 입력을 제한한다', () => {
    const api = fakes()
    const playButton = createBodyQuizButtonSfx({ soundApi: api.soundApi })
    expect(playButton('default', 100)).toBe(true)
    expect(playButton('primary', 150)).toBe(false)
    expect(playButton('primary', 200)).toBe(true)
    expect(api.soundApi.activate).toHaveBeenCalledTimes(3)
    expect(api.soundApi.playBeep).toHaveBeenCalledOnce()
    expect(api.soundApi.playSuccess).toHaveBeenCalledOnce()
  })

  it('스쿼트는 증가한 rep마다 한 번만, 마지막 rep는 unlock음 하나만 낸다', () => {
    const api = fakes()
    const audio = createBodyQuizAudio(api)
    audio.squat(1, 5)
    audio.squat(1, 5)
    audio.squat(2, 5)
    audio.squat(5, 5)
    audio.squat(5, 5)
    expect(api.soundApi.playSuccess).toHaveBeenCalledTimes(2)
    expect(api.soundApi.playGo).toHaveBeenCalledOnce()
  })

  it('zone 진입과 2·1 카운트다운은 상태 변화 때만 소리 난다', () => {
    const api = fakes()
    const audio = createBodyQuizAudio(api)
    audio.enterSelection('left')
    audio.enterSelection('left')
    audio.selectionCountdown(3)
    audio.selectionCountdown(2)
    audio.selectionCountdown(2)
    audio.selectionCountdown(1)
    expect(api.soundApi.playSuccess).toHaveBeenCalledOnce()
    expect(api.soundApi.playBeep).toHaveBeenCalledTimes(2)

    audio.cancelSelection()
    audio.enterSelection('left')
    expect(api.soundApi.playSuccess).toHaveBeenCalledTimes(2)
  })

  it('정오답과 게임 완료 효과음은 같은 상태에서 중복 재생하지 않는다', () => {
    const api = fakes()
    const audio = createBodyQuizAudio(api)
    audio.result(true)
    audio.result(true)
    audio.complete()
    audio.complete()
    expect(api.soundApi.playRoundClear).toHaveBeenCalledOnce()
    expect(api.soundApi.playGameClear).toHaveBeenCalledOnce()

    audio.nextQuestion()
    audio.result(false)
    audio.result(false)
    expect(api.soundApi.playHit).toHaveBeenCalledOnce()
  })
})

describe('BODY QUIZ system sound controls', () => {
  it('BGM 버튼은 비활성이고 SFX mute는 공통 설정을 그대로 사용한다', () => {
    const initialBgm = bgm.isMuted()
    const initialSfx = sound.isMuted()
    document.body.innerHTML = `<div id="root">${bodyQuizSystemBarMarkup()}</div>`
    const root = document.querySelector('#root')
    const binding = bindBodyQuizSystemBar(root)

    expect(root.querySelector('#pz-music').disabled).toBe(true)
    root.querySelector('#pz-sfx').click()
    expect(bgm.isMuted()).toBe(initialBgm)
    expect(sound.isMuted()).toBe(!initialSfx)

    root.querySelector('#pz-sfx').click()
    expect(bgm.isMuted()).toBe(initialBgm)
    expect(sound.isMuted()).toBe(initialSfx)
    binding.destroy()
  })

  it('게임 밖 BGM 정리는 기존 router 한 곳이 계속 소유한다', () => {
    const source = fs.readFileSync('src/core/router.js', 'utf8')
    expect(source).toContain("const GAME_ROUTES = new Set(['/intro', '/tutorial', '/play'])")
    expect(source).toContain('if (!GAME_ROUTES.has(path)) bgm.stop()')
  })
})

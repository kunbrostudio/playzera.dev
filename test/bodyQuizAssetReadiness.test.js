import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BODY_QUIZ_CRITICAL_ASSETS,
  createBodyQuizAssetReadiness,
  createBodyQuizLoadingGate,
  getBodyQuizPlayAssets,
  getBodyQuizTutorialAssets,
  openBodyQuizReadinessGate,
} from '../src/games/body-quiz/assetReadiness.js'
import { createBodyQuizTutorial } from '../src/games/body-quiz/tutorial.js'
import bodyQuizIntro from '../src/games/body-quiz/intro.js'
import bodyQuizPlay from '../src/games/body-quiz/play.js'
import { QUESTIONS } from '../src/games/body-quiz/questions.js'

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function readinessResult(ready = true, timedOut = false) {
  return { ready, timedOut, results: [], failed: ready ? [] : [{ src: '/missing.png', ok: false }] }
}
const noopLoadingScreen = () => ({ release() {} })
const noopAudioController = {
  prepare: () => Promise.resolve(), activate() {}, start: () => Promise.resolve(),
  squat() {}, enterSelection() {}, selectionCountdown() {}, cancelSelection() {},
  result() {}, nextQuestion() {}, complete() {}, destroy() {},
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('BODY QUIZ image load + decode readiness', () => {
  it('load와 decode가 끝나기 전에는 resolve하지 않고 같은 URL을 한 번만 만든다', async () => {
    const instances = []
    class ControlledImage {
      constructor() {
        instances.push(this)
        this.complete = false
        this.naturalWidth = 0
        this.decodeDeferred = deferred()
      }
      set src(value) { this._src = value }
      get src() { return this._src }
      decode() { return this.decodeDeferred.promise }
    }
    const readiness = createBodyQuizAssetReadiness({ ImageCtor: ControlledImage })
    let settled = false
    const first = readiness.preload(['/critical.png']).then(result => { settled = true; return result })
    const second = readiness.preload(['/critical.png'])
    expect(instances).toHaveLength(1)
    expect(settled).toBe(false)

    instances[0].onload()
    await Promise.resolve()
    expect(settled).toBe(false)
    instances[0].decodeDeferred.resolve()
    expect((await first)[0]).toMatchObject({ ok: true, decoded: true })
    await second
    expect(readiness.areReady(['/critical.png'])).toBe(true)
    expect(instances).toHaveLength(1)
  })

  it('decode 실패는 완료된 onload를 fallback으로 인정한다', async () => {
    class DecodeFailImage {
      set src(value) { this._src = value; queueMicrotask(() => this.onload()) }
      decode() { return Promise.reject(new Error('decode unsupported')) }
    }
    const readiness = createBodyQuizAssetReadiness({ ImageCtor: DecodeFailImage })
    const [result] = await readiness.preload(['/loaded.png'])
    expect(result).toMatchObject({ ok: true, decoded: false })
    expect(result.decodeError).toBeInstanceOf(Error)
  })

  it('최대 대기 시간을 넘으면 무한 대기하지 않고 timedOut 상태를 반환한다', async () => {
    vi.useFakeTimers()
    class NeverImage { set src(value) { this._src = value } }
    const readiness = createBodyQuizAssetReadiness({ ImageCtor: NeverImage })
    const waiting = readiness.waitFor(['/slow.png'], { minMs: 0, maxMs: 80 })
    await vi.advanceTimersByTimeAsync(81)
    await expect(waiting).resolves.toMatchObject({ ready: false, timedOut: true })
  })
})

describe('BODY QUIZ screen readiness interaction gate', () => {
  it('실제 공통 Loading Screen만 표시하고 local error panel은 로딩 중 숨긴다', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="host"><div>게임 콘텐츠</div></div>'
    const host = document.querySelector('#host')
    const gate = createBodyQuizLoadingGate(host)
    gate.showLoading()
    expect(document.querySelector('#pz-loading .pz-loading-logo')).not.toBeNull()
    expect(document.querySelectorAll('#pz-loading .pz-loading-dots span')).toHaveLength(3)
    expect(gate.overlay.hidden).toBe(true)
    gate.reveal()
    vi.advanceTimersByTime(1000)
    expect(document.getElementById('pz-loading')).toBeNull()
    gate.destroy()
  })

  it('임시 spinner 대신 공식 Loading Screen handle을 즉시 acquire/release한다', () => {
    document.body.innerHTML = '<div id="host"><button>진행</button></div>'
    const release = vi.fn()
    const loadingScreen = vi.fn(() => ({ release }))
    const host = document.querySelector('#host')
    const gate = createBodyQuizLoadingGate(host, { loadingScreen })
    gate.showLoading()
    expect(loadingScreen).toHaveBeenCalledWith(document.body, { immediate: true })
    expect(host.querySelector('.bq-asset-gate__spinner')).toBeNull()
    gate.reveal()
    expect(release).toHaveBeenCalledOnce()
    gate.destroy()
  })

  it('intro 공개 뒤 tutorial 첫 화면을 백그라운드 preload한다', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const preload = vi.fn(() => Promise.resolve([]))
    const readiness = {
      areReady: () => true,
      preload,
      waitFor: vi.fn(() => Promise.resolve(readinessResult(true))),
      invalidate() {},
    }
    bodyQuizIntro(document.querySelector('#app'), { id: 'body-quiz' }, { assetReadiness: readiness, loadingScreen: noopLoadingScreen })
    expect(preload).toHaveBeenCalledWith(getBodyQuizTutorialAssets(QUESTIONS[0], 0))
  })

  it('critical asset resolve 전에는 튜토리얼을 숨기고 controls를 막은 뒤 완료 후 공개한다', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    const pending = deferred()
    let ready = false
    const readiness = {
      areReady: () => ready,
      preload: vi.fn(() => Promise.resolve([])),
      waitFor: vi.fn(() => pending.promise),
      invalidate: vi.fn(),
    }
    const handle = createBodyQuizTutorial({
      mountEl: document.querySelector('#app'),
      question: QUESTIONS[0],
      assetReadiness: readiness,
      loadingScreen: noopLoadingScreen,
    })
    const root = document.querySelector('#bqt-root')
    expect(root.dataset.bqReadiness).toBe('loading')
    expect(root.querySelector('#bqt-next').disabled).toBe(true)
    root.querySelector('#bqt-next').click()
    expect(handle.getStepIndex()).toBe(0)

    ready = true
    pending.resolve(readinessResult(true))
    await vi.waitFor(() => expect(root.dataset.bqReadiness).toBe('ready'))
    expect(root.querySelector('#bqt-next').disabled).toBe(false)
    root.querySelector('#bqt-next').click()
    expect(handle.getStepIndex()).toBe(1)
    handle.destroy()
  })

  it('play critical readiness 전에는 system UI와 gameplay를 시작하지 않는다', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    const pending = deferred()
    let ready = false
    const readiness = {
      areReady: () => ready,
      preload: vi.fn(() => Promise.resolve([])),
      waitFor: vi.fn(() => pending.promise),
      invalidate() {},
    }
    bodyQuizPlay(document.querySelector('#app'), { id: 'body-quiz' }, {
      assetReadiness: readiness,
      tutorialPolicy: () => false,
      loadingScreen: noopLoadingScreen,
      audioController: noopAudioController,
    })
    const root = document.querySelector('#bq')
    expect(root.dataset.bqReadiness).toBe('loading')
    expect(root.querySelector('#bq-system-slot').children).toHaveLength(0)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }))
    expect(root.querySelector('#bq-squat').textContent).toBe('SQUAT 0/5')

    ready = true
    pending.resolve(readinessResult(true))
    await vi.waitFor(() => expect(root.dataset.bqReadiness).toBe('ready'))
    expect(root.querySelector('#pz-menu')).not.toBeNull()
  })

  it('다음 STEP decode가 덜 끝났으면 현재 STEP을 유지하고 준비 뒤에만 전환한다', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    const pending = deferred()
    let firstWait = true
    const readiness = {
      areReady: assets => assets.some(asset => String(asset).includes('tutorial_think.png')),
      preload: vi.fn(() => Promise.resolve([])),
      waitFor: vi.fn(() => {
        if (firstWait) {
          firstWait = false
          return pending.promise
        }
        return Promise.resolve(readinessResult(true))
      }),
      invalidate() {},
    }
    const handle = createBodyQuizTutorial({
      mountEl: document.querySelector('#app'),
      question: QUESTIONS[0],
      assetReadiness: readiness,
      loadingScreen: noopLoadingScreen,
    })
    const root = document.querySelector('#bqt-root')
    root.querySelector('#bqt-next').click()
    expect(handle.getStepIndex()).toBe(0)
    expect(root.dataset.bqReadiness).toBe('transition')
    expect(root.querySelector('#bqt-next').disabled).toBe(true)

    pending.resolve(readinessResult(true))
    await vi.waitFor(() => expect(handle.getStepIndex()).toBe(1))
    expect(root.dataset.bqReadiness).toBe('ready')
    handle.destroy()
  })

  it('failure/timeout은 broken content를 공개하지 않고 bounded retry 상태를 보인다', async () => {
    document.body.innerHTML = '<div id="host"><div id="critical">content</div><button>진행</button></div>'
    const host = document.querySelector('#host')
    const gate = createBodyQuizLoadingGate(host, { loadingScreen: noopLoadingScreen })
    const readiness = {
      waitFor: vi.fn(() => Promise.resolve(readinessResult(false, true))),
      invalidate: vi.fn(),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await openBodyQuizReadinessGate({ gate, readiness, assets: ['/slow.png'], minMs: 0, maxMs: 1 })
    expect(host.dataset.bqReadiness).toBe('error')
    expect(gate.overlay.hidden).toBe(false)
    expect(gate.overlay.querySelector('button').hidden).toBe(false)
    expect(host.querySelector(':scope > button').disabled).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    gate.destroy()
  })

  it('튜토리얼 공개 뒤 다음 STEP과 play critical assets를 백그라운드 preload한다', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const preload = vi.fn(() => Promise.resolve([]))
    const readiness = {
      areReady: () => true,
      preload,
      waitFor: vi.fn(() => Promise.resolve(readinessResult(true))),
      invalidate() {},
    }
    const playAssets = getBodyQuizPlayAssets(QUESTIONS[0])
    const handle = createBodyQuizTutorial({
      mountEl: document.querySelector('#app'),
      question: QUESTIONS[0],
      assetReadiness: readiness,
      playAssets,
      loadingScreen: noopLoadingScreen,
    })
    const calls = preload.mock.calls.map(([assets]) => assets)
    expect(calls).toContainEqual(getBodyQuizTutorialAssets(QUESTIONS[0], 1))
    expect(calls).toContainEqual(playAssets)
    expect(BODY_QUIZ_CRITICAL_ASSETS.intro).toContain('/assets/body-quiz/intro/thum_bodyquiz.png')
    handle.destroy()
  })
})

// 공용 로딩 화면(core/loadingScreen.js) — 참조 카운팅 + 지연표시/최소노출
// 타이밍(STEP 74)을 확인한다. 실제 이미지 로딩(Image.onload)은 jsdom이
// 안 쏴 주므로 preloadImage는 "url이 없으면 즉시 끝난다"만 검증한다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { showLoadingScreen, isLoadingScreenVisible, preloadImage } from '../src/core/loadingScreen.js'

beforeEach(() => {
  document.body.innerHTML = ''
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('showLoadingScreen — 지연 표시', () => {
  it('부르자마자는 안 뜨고, 250ms 뒤에 뜬다', () => {
    const h = showLoadingScreen(document.body)
    expect(isLoadingScreenVisible()).toBe(false)
    vi.advanceTimersByTime(249)
    expect(isLoadingScreenVisible()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(isLoadingScreenVisible()).toBe(true)
    h.release()
    vi.advanceTimersByTime(1000)   // 다음 테스트에 상태가 새지 않게 정리
  })

  it('250ms 안에 release()하면 화면이 한 번도 안 뜬다', () => {
    const h = showLoadingScreen(document.body)
    vi.advanceTimersByTime(100)
    h.release()
    vi.advanceTimersByTime(1000)
    expect(isLoadingScreenVisible()).toBe(false)
    expect(document.getElementById('pz-loading')).toBeNull()
  })
})

describe('showLoadingScreen — 최소 노출', () => {
  it('뜬 뒤 바로 release()해도 최소 600ms는 붙어 있는다', () => {
    const h = showLoadingScreen(document.body)
    vi.advanceTimersByTime(250)
    expect(isLoadingScreenVisible()).toBe(true)
    h.release()   // 뜨자마자 놓아도
    expect(isLoadingScreenVisible()).toBe(true)   // 아직 안 사라진다
    vi.advanceTimersByTime(599)
    expect(isLoadingScreenVisible()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(isLoadingScreenVisible()).toBe(false)
  })

  it('오래 떠 있었으면(이미 600ms 넘음) release() 즉시 사라진다', () => {
    const h = showLoadingScreen(document.body)
    vi.advanceTimersByTime(250)   // 뜬다
    vi.advanceTimersByTime(1000) // 이미 최소 노출을 훌쩍 넘김
    h.release()
    vi.advanceTimersByTime(1)
    expect(isLoadingScreenVisible()).toBe(false)
  })
})

describe('showLoadingScreen — 참조 카운팅', () => {
  it('둘이 띄우면 하나만 놓아서는 안 사라진다', () => {
    const a = showLoadingScreen(document.body)
    const b = showLoadingScreen(document.body)
    vi.advanceTimersByTime(250)
    expect(document.querySelectorAll('#pz-loading').length).toBe(1)   // DOM은 하나만
    a.release()
    vi.advanceTimersByTime(1000)
    expect(isLoadingScreenVisible()).toBe(true)   // b가 아직 살아 있다
    b.release()
    vi.advanceTimersByTime(1000)
    expect(isLoadingScreenVisible()).toBe(false)
  })

  it('release()를 두 번 불러도 참조 카운트가 더 깎이지 않는다', () => {
    const a = showLoadingScreen(document.body)
    const b = showLoadingScreen(document.body)
    vi.advanceTimersByTime(250)
    a.release()
    a.release()   // 실수로 두 번 — b의 몫까지 깎이면 안 된다
    vi.advanceTimersByTime(1000)
    expect(isLoadingScreenVisible()).toBe(true)
    b.release()
    vi.advanceTimersByTime(1000)
    expect(isLoadingScreenVisible()).toBe(false)
  })

  it('지우기 예약 중에 다시 showLoadingScreen()하면 안 사라지고 계속 뜬다', () => {
    const a = showLoadingScreen(document.body)
    vi.advanceTimersByTime(250)   // 뜬다
    a.release()                   // 최소 노출 카운트다운 시작(600ms)
    vi.advanceTimersByTime(300)
    const b = showLoadingScreen(document.body)   // 사라지기 전에 다시 잡음
    vi.advanceTimersByTime(1000)                 // 원래 지우기 예약 시각을 훌쩍 지남
    expect(isLoadingScreenVisible()).toBe(true)  // 계속 떠 있어야 한다
    b.release()
    vi.advanceTimersByTime(1000)
    expect(isLoadingScreenVisible()).toBe(false)
  })

  it('로고 두 장(풀·마크)이 다 마크업에 있다 — 화면 폭에 따라 CSS가 고른다', () => {
    const h = showLoadingScreen(document.body)
    vi.advanceTimersByTime(250)
    const el = document.getElementById('pz-loading')
    expect(el.querySelector('.pz-loading-logo')).not.toBeNull()
    expect(el.querySelector('.pz-loading-mark')).not.toBeNull()
    h.release()
    vi.advanceTimersByTime(1000)
  })
})

describe('preloadImage', () => {
  it('url이 없으면 즉시 끝난다', async () => {
    vi.useRealTimers()   // Promise resolve는 진짜 마이크로태스크로 확인한다
    await expect(preloadImage('')).resolves.toBeUndefined()
    await expect(preloadImage(undefined)).resolves.toBeUndefined()
  })
})

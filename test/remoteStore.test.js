// 리모컨 페어링 기억하기 — 순수 저장 계층 (STEP 74)
//
// localStorage는 **없을 수도 던질 수도** 있다(사파리 비공개 모드, 쿠키
// 차단, 용량 초과). 리모컨은 그때도 (재연결만 못 할 뿐) 평소처럼 돌아야
// 하므로 그 경우까지 여기서 잠근다.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  saveController, loadController, clearController,
  savePrimary, loadPrimary, clearPrimary, MAX_AGE_MS,
} from '../src/core/remote/remoteStore.js'

beforeEach(() => { localStorage.clear() })

describe('저장하고 다시 읽는다', () => {
  it('코드와 remoteId를 같이 돌려준다', () => {
    saveController('ABC123', 'r-1', 1000)
    expect(loadController(1000)).toMatchObject({ code: 'ABC123', remoteId: 'r-1' })
  })

  it('★ remoteId까지 저장한다 — 코드만 있으면 재입장 때 승인창이 다시 뜬다', () => {
    saveController('ABC123', 'r-1', 1000)
    expect(loadController(1000).remoteId).toBe('r-1')
  })

  it('조종하는 쪽과 조종당하는 쪽은 서로 다른 자리에 쓴다', () => {
    saveController('AAA111', 'r-a', 1000)
    savePrimary('BBB222', 'r-b', 1000)
    expect(loadController(1000).code).toBe('AAA111')
    expect(loadPrimary(1000).code).toBe('BBB222')
  })

  it('지우면 없다', () => {
    saveController('ABC123', 'r-1', 1000)
    clearController()
    expect(loadController(1000)).toBeNull()
    savePrimary('ABC123', 'r-1', 1000)
    clearPrimary()
    expect(loadPrimary(1000)).toBeNull()
  })

  it('저장한 적 없으면 null', () => {
    expect(loadController(1000)).toBeNull()
    expect(loadPrimary(1000)).toBeNull()
  })
})

describe('유효기간 ★', () => {
  it('기간 안이면 살아 있다', () => {
    saveController('ABC123', 'r-1', 0)
    expect(loadController(MAX_AGE_MS - 1)).not.toBeNull()
  })

  it('기간을 넘기면 null이고, 다음에 또 안 읽히게 지워 둔다', () => {
    saveController('ABC123', 'r-1', 0)
    expect(loadController(MAX_AGE_MS + 1)).toBeNull()
    // 지워졌으므로 시각을 되돌려도 없다
    expect(loadController(0)).toBeNull()
  })
})

describe('깨진 값은 조용히 버린다', () => {
  it('JSON이 아니면 null', () => {
    localStorage.setItem('pz.remote.controller', '{{{')
    expect(loadController(1000)).toBeNull()
  })

  it('remoteId가 빠져 있으면 null — 반쪽짜리로 재입장하면 승인창이 뜬다', () => {
    localStorage.setItem('pz.remote.controller', JSON.stringify({ code: 'ABC123', at: 1000 }))
    expect(loadController(1000)).toBeNull()
  })

  it('시각이 없으면 null — 유효기간을 못 재는 값은 안 믿는다', () => {
    localStorage.setItem('pz.remote.controller', JSON.stringify({ code: 'ABC123', remoteId: 'r-1' }))
    expect(loadController(1000)).toBeNull()
  })
})

describe('localStorage가 못 쓰는 상태여도 앱이 안 죽는다 ★', () => {
  it('setItem이 던져도 저장 호출이 조용히 끝난다', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded') })
    expect(() => saveController('ABC123', 'r-1', 1000)).not.toThrow()
    spy.mockRestore()
  })

  it('getItem이 던져도 null을 낸다', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(loadController(1000)).toBeNull()
    spy.mockRestore()
  })

  it('removeItem이 던져도 지우기 호출이 조용히 끝난다', () => {
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => clearController()).not.toThrow()
    spy.mockRestore()
  })
})

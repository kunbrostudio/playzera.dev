import { describe, it, expect } from 'vitest'
import { hasWasmSimd, isPoseSupported, poseUnsupportedReason } from '../src/core/pose/poseEngine.js'

// 이 프로브가 틀리면 **모든 기기에서** "브라우저가 오래됐어요"가 뜬다.
// 실제로 처음 쓴 바이트열이 그랬다(splat 뒤 drop 때문에 어디서나 false).
// 테스트가 도는 런타임은 SIMD를 지원하므로 true여야 한다.
describe('WASM SIMD 감지', () => {
  it('SIMD를 지원하는 런타임에서 true', () => {
    expect(hasWasmSimd()).toBe(true)
  })

  it('두 번 불러도 같은 값 (캐시)', () => {
    expect(hasWasmSimd()).toBe(hasWasmSimd())
  })
})

describe('지원 여부 판정', () => {
  it('getUserMedia가 없으면 미지원', () => {
    const orig = navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    expect(isPoseSupported()).toBe(false)
    expect(poseUnsupportedReason()).toBeTruthy()
    Object.defineProperty(navigator, 'mediaDevices', { value: orig, configurable: true })
  })

  it('HTTPS가 아니면 그 이유를 알려준다', () => {
    const origMd = navigator.mediaDevices
    const origSec = window.isSecureContext
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    expect(poseUnsupportedReason()).toContain('HTTPS')
    Object.defineProperty(navigator, 'mediaDevices', { value: origMd, configurable: true })
    Object.defineProperty(window, 'isSecureContext', { value: origSec, configurable: true })
  })
})

// QR 스캐너가 디코드한 문자열에서 페어링 코드 뽑기 (STEP 68).
import { describe, it, expect } from 'vitest'
import { extractRemoteCode } from '../src/core/remote/qrUtil.js'

describe('extractRemoteCode', () => {
  it('이 앱이 만든 QR URL에서 code를 뽑는다', () => {
    expect(extractRemoteCode('https://playzera.dev/#/remote?code=ABC123')).toBe('ABC123')
  })

  it('경로가 있어도(pathname) 뽑는다', () => {
    expect(extractRemoteCode('https://playzera.dev/app/#/remote?code=XYZ789')).toBe('XYZ789')
  })

  it('URL이 아니면 null', () => {
    expect(extractRemoteCode('그냥 아무 텍스트')).toBeNull()
  })

  it('URL이지만 code가 없으면 null', () => {
    expect(extractRemoteCode('https://playzera.dev/#/remote')).toBeNull()
  })

  it('이 앱과 무관한 QR(다른 사이트 URL)도 code 쿼리가 없으면 null', () => {
    expect(extractRemoteCode('https://example.com/')).toBeNull()
  })
})

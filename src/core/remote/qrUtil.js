// QR 스캐너(`pairingModal.js`)가 디코드한 원시 문자열에서 페어링 코드만
// 뽑는 순수 함수. 별도 파일로 뺀 이유는 테스트 때문이다 — `pairingModal.js`는
// `core/handControl.js`(카메라 오류 문구 재사용)를 거쳐 결국 포즈 엔진까지
// 정적 import로 물고 있어서, 그 파일을 그대로 import해 테스트하면
// `test/readyScreen.test.js`가 이미 겪은 것과 같은 문제(jsdom엔 너무
// 무겁다)가 생긴다. 이 파일은 그 무엇도 안 물고 있어 안전하게 테스트할 수
// 있다.
export function extractRemoteCode(text) {
  try {
    const url = new URL(text)
    const qs = url.hash.replace(/^#/, '').split('?')[1] || ''
    return new URLSearchParams(qs).get('code')
  } catch {
    return null
  }
}

// Stub — MediaPipe 연동 시 이 파일에 구현
let _zone = 1

export function init(videoElement, onZoneChange) {
  console.log('[pose] init called', videoElement)
  // TODO: MediaPipe Pose 초기화 및 zone 감지 루프
}

export function getZone() {
  console.log('[pose] getZone ->', _zone)
  return _zone // 0=왼쪽, 1=가운데, 2=오른쪽
}

export function destroy() {
  console.log('[pose] destroy called')
}

// 골반(#23/#24) X좌표 평균으로 3구역 판별
// 0 = 왼쪽 | 1 = 가운데 | 2 = 오른쪽

export function createZoneDetector({ onZoneChange } = {}) {
  let currentZone = 1

  function _calcZone(x) {
    if (x < 1 / 3) return 0
    if (x > 2 / 3) return 2
    return 1
  }

  return {
    update(landmarks) {
      const lh = landmarks[23]  // LEFT_HIP
      const rh = landmarks[24]  // RIGHT_HIP
      if (!lh || !rh) return

      const hipX = (lh.x + rh.x) / 2
      const zone = _calcZone(hipX)

      if (zone !== currentZone) {
        currentZone = zone
        onZoneChange?.(zone, hipX)
      }
    },
    getCurrentZone() { return currentZone },
    destroy()        { currentZone = 1 },
  }
}

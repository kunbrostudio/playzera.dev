// 무릎(#25 왼/#26 오른) Y좌표 교대 변화로 제자리 달리기 감지
// 왼무릎 올라감 → 오른무릎 올라감 순서로 1스텝 카운트
// Y좌표: 0 = 화면 상단, 1 = 화면 하단 (올라가면 Y 감소)

const LK = 25  // LEFT_KNEE
const RK = 26  // RIGHT_KNEE
const BASELINE_SMOOTH = 0.1

export function createRunDetector({ threshold = 0.05, onStep } = {}) {
  let count      = 0
  let lastStep   = null   // 'left' | 'right' | null
  let leftBase   = null
  let rightBase  = null

  return {
    update(landmarks) {
      const lk = landmarks[LK]
      const rk = landmarks[RK]
      if (!lk || !rk) return

      // baseline 초기화
      if (leftBase  === null) { leftBase  = lk.y; return }
      if (rightBase === null) { rightBase = rk.y; return }

      const leftUp  = leftBase  - lk.y > threshold  // 왼무릎 올라감
      const rightUp = rightBase - rk.y > threshold  // 오른무릎 올라감

      if (leftUp && lastStep !== 'left') {
        lastStep = 'left'

      } else if (rightUp && lastStep === 'left') {
        // 왼→오른 순서 완성: 1스텝
        lastStep = 'right'
        count++
        onStep?.(count)

      } else if (!leftUp && !rightUp) {
        // 양 무릎이 내려간 상태 → 순서 리셋 + baseline 적응
        lastStep  = null
        leftBase  = leftBase  * (1 - BASELINE_SMOOTH) + lk.y * BASELINE_SMOOTH
        rightBase = rightBase * (1 - BASELINE_SMOOTH) + rk.y * BASELINE_SMOOTH
      }
    },

    getCount() { return count },
    reset()    { count = 0; lastStep = null; leftBase = null; rightBase = null },
    destroy()  { count = 0; lastStep = null; leftBase = null; rightBase = null },
  }
}

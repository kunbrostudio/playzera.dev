// 골반(#23/#24) Y좌표 평균 변화로 스쿼트 감지 및 카운팅
// MediaPipe Y좌표: 0 = 화면 상단, 1 = 화면 하단 (내려가면 Y 증가)
//
// 상태 머신: STANDING → SQUATTING → (일어섬) → count++ → STANDING

const STATE = { STANDING: 'STANDING', SQUATTING: 'SQUATTING' }
const MIN_SQUAT_MS   = 200   // 최소 자세 유지 시간 (잡음 제거)
const BASELINE_SMOOTH = 0.08 // baseline 적응 속도

export function createSquatDetector({ threshold = 0.08, onSquat } = {}) {
  let state     = STATE.STANDING
  let count     = 0
  let baselineY = null   // 서있는 상태 기준 골반 Y
  let squatAt   = 0

  return {
    update(landmarks) {
      const lh = landmarks[23]  // LEFT_HIP
      const rh = landmarks[24]  // RIGHT_HIP
      if (!lh || !rh) return

      const hipY = (lh.y + rh.y) / 2

      // 첫 프레임: baseline 초기화
      if (baselineY === null) { baselineY = hipY; return }

      if (state === STATE.STANDING) {
        if (hipY - baselineY > threshold) {
          // 골반이 baseline보다 내려감 → 스쿼트 시작
          state   = STATE.SQUATTING
          squatAt = Date.now()
        } else {
          baselineY = baselineY * (1 - BASELINE_SMOOTH) + hipY * BASELINE_SMOOTH
        }

      } else if (state === STATE.SQUATTING) {
        if (hipY <= baselineY + threshold * 0.3) {
          // 골반이 다시 올라옴 → 일어섬
          if (Date.now() - squatAt >= MIN_SQUAT_MS) {
            count++
            onSquat?.(count)
          }
          state     = STATE.STANDING
          baselineY = hipY
        }
      }
    },

    getCount() { return count },
    reset()    { count = 0; state = STATE.STANDING; baselineY = null },
    destroy()  { count = 0; state = STATE.STANDING; baselineY = null },
  }
}

// 어깨(#11/#12) Y좌표 평균 변화로 점프 감지 및 카운팅
// MediaPipe Y좌표: 0 = 화면 상단, 1 = 화면 하단 (올라가면 Y 감소)
//
// 상태 머신: IDLE → AIRBORNE → (착지) → count++ → IDLE

const STATE = { IDLE: 'IDLE', AIRBORNE: 'AIRBORNE' }
const MIN_AIRBORNE_MS = 100  // 최소 체공 시간 (잡음 제거)
const BASELINE_SMOOTH = 0.08 // baseline 적응 속도 (서있을 때만 업데이트)

export function createJumpDetector({ threshold = 0.06, onJump } = {}) {
  let state      = STATE.IDLE
  let count      = 0
  let baselineY  = null   // 서있는 상태 기준 어깨 Y
  let airborneAt = 0

  return {
    update(landmarks) {
      const ls = landmarks[11]  // LEFT_SHOULDER
      const rs = landmarks[12]  // RIGHT_SHOULDER
      if (!ls || !rs) return

      const shoulderY = (ls.y + rs.y) / 2

      // 첫 프레임: baseline 초기화
      if (baselineY === null) { baselineY = shoulderY; return }

      if (state === STATE.IDLE) {
        if (baselineY - shoulderY > threshold) {
          // 어깨가 baseline보다 위로 올라감 → 점프 시작
          state      = STATE.AIRBORNE
          airborneAt = Date.now()
        } else {
          // 서있는 동안 baseline을 천천히 현재값으로 추적 (키/자세 변화 적응)
          baselineY = baselineY * (1 - BASELINE_SMOOTH) + shoulderY * BASELINE_SMOOTH
        }

      } else if (state === STATE.AIRBORNE) {
        if (shoulderY >= baselineY - threshold * 0.3) {
          // 어깨가 다시 내려옴 → 착지
          if (Date.now() - airborneAt >= MIN_AIRBORNE_MS) {
            count++
            onJump?.(count)
          }
          state     = STATE.IDLE
          baselineY = shoulderY
        }
      }
    },

    getCount() { return count },
    reset()    { count = 0; state = STATE.IDLE; baselineY = null },
    destroy()  { count = 0; state = STATE.IDLE; baselineY = null },
  }
}

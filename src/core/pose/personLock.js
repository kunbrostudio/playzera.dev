// 카메라에 여러 사람이 잡혀도 "그 아이 한 명"을 계속 추적한다.
//
// ── 왜 필요한가 ★ ─────────────────────────────────────────────
//
// MediaPipe는 한 프레임에 여럿을 감지할 수 있어도(`numPoses`), 이 프로젝트의
// 모든 감지기(zoneDetector · moves · poseMatch · row …)는 "한 사람"을 전제로
// 짜여 있다. `numPoses: 1`로 두면 MediaPipe가 내부적으로 "가장 두드러진" 사람을
// 골라 그 하나만 내주는데, 그 기준이 **이 게임을 하려는 아이**를 보장하지
// 않는다 — 아이 혼자 하기 어려워 옆에서 도와주던 보호자가 카메라에 더
// 가깝고 크게 잡혀 대신 뽑히는 사고가 실제로 있었다(ken 제보, 9/4).
//
// ── 두 단계 ──────────────────────────────────────────────────
//
//   잠기기 전(unlocked) — 매 프레임 다시 고른다. 화면 중앙에 가깝고,
//     크게(=카메라에 가깝게) 잡히고, **지금 시작 동작(O자세)을 시도 중이면**
//     압도적으로 우대한다. 카메라 준비 화면의 "O를 3초 들면 시작"은 이미
//     모든 게임이 요구하는 동작이라 아이에게 새로 시키는 게 없다 — 그 동작을
//     실제로 하고 있는 사람이 거의 항상 그 게임을 하려는 아이이기 때문이다.
//     보호자는 돕는 동안 O자세를 들고 있지 않으므로 이 점수에서 이기지 못한다.
//
//   잠긴 뒤(locked) — 위치로만 따라간다. 직전 잠금 위치에서 가장 가까운
//     후보를 그 사람으로 본다. 놓쳐도(프레임 밖으로 잠깐 나가는 등) 바로
//     풀지 않고 유예 시간을 준다 — 잠깐 가렸다고 다른 사람에게 안 넘어간다.
//     유예를 넘기면 잠금을 풀고 다시 고르기(unlocked)로 돌아간다.
//
// **잠그는 시점은 이 모듈이 정하지 않는다.** `confirmLock()`을 밖에서(카메라
// 준비 화면의 O자세 성공 순간, 또는 이어하기 순간) 불러야 잠긴다 — "지금이
// 확정할 순간"인지는 화면마다 다르므로 화면이 판단한다.
//
// ── 시간은 밖에서 받는다 ─────────────────────────────────────
//
// `select()`가 `performance.now()`를 안에서 읽으면 합성 프레임으로 테스트할
// 수 없다(프로젝트 공통 규칙). 실제 시각은 `poseEngine.js`가 넘긴다.

import { LM } from './gesture.js'

const mid = (a, b) => (a && b) ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null
const seen = p => !!p && (p.visibility ?? 1) >= 0.5

/** 골반 중심 — 좌우 골반이 둘 다 신뢰도 있게 보여야 값을 낸다. */
export function hipCenterOf(lms) {
  const lh = lms?.[LM.L_HIP], rh = lms?.[LM.R_HIP]
  if (!seen(lh) || !seen(rh)) return null
  return mid(lh, rh)
}

/** 어깨 중심 — 상반신만 잡혀도 나온다. */
export function shoulderCenterOf(lms) {
  const ls = lms?.[LM.L_SHOULDER], rs = lms?.[LM.R_SHOULDER]
  if (!seen(ls) || !seen(rs)) return null
  return mid(ls, rs)
}

// ── 사람의 "자리"는 골반이 아니라 골반-또는-어깨다 ★ ──────────
//
// 원래 이 모듈은 자리를 **골반 중심으로만** 쟀고, 골반이 안 보이면
// `acquisitionScore`가 `-Infinity`를 냈다. 후보가 전부 그러면 `select()`가
// null을 내고, 그러면 `poseEngine._loop`은 **구독자를 아예 안 부른다** —
// 즉 포즈 추론은 멀쩡히 돌고 있는데 화면에는 랜드마크가 한 개도 안 간다.
//
// 이게 ken의 "트래킹이 안 된다"의 진짜 원인이었다(STEP 76 후속 라운드 5).
// 풍선 팡팡에 붙여 둔 감지율 표시(`#bf-diag`)가 **0회/초**를 찍은 화면을
// 받고서야 잡혔다 — 책상 앞에 앉아 카메라에 가까이 있으면 골반이 프레임
// 밖이거나 책상에 가려 안 보인다. 손·얼굴·어깨는 다 잘 잡히는데 골반
// 하나 때문에 전부 버려지고 있었다. 서서 하는 게임만 보고 만든 전제가
// 앉아서/가까이 하는 상황에서 통째로 무너진 것이다.
//
// 그래서 자리를 골반 → **없으면 어깨**로 떨어지게 한다. 어깨는 상반신만
// 들어와도 보이므로 사실상 "사람이 보이면 자리도 있다"가 된다.
//
// 프레임마다 기준점이 골반↔어깨로 바뀌면 잠금 위치가 그만큼(대략 y로
// 0.1~0.2) 튀는데, `TRACK_MATCH_DIST`(0.30)가 그보다 넉넉해서 같은
// 사람으로 계속 이어진다 — 기준점 두 개를 따로 들고 다니는 복잡함보다
// 이쪽이 낫다고 봤다.
export function anchorOf(lms) {
  return hipCenterOf(lms) ?? shoulderCenterOf(lms)
}

/**
 * 잠기기 전 후보 점수 — 높을수록 "이 사람일 확률"이 높다고 본다.
 *   center   화면 중앙에 가까울수록 (0~1)
 *   size     코~발목이 클수록 = 카메라에 가까울수록 (0~1, 대략치)
 *   gesture  지금 시작 동작을 시도 중이면 압도적 가중치 — 위치·크기를 다 뒤집는다
 *
 * @param {Function} [gestureCheck] (lms) => boolean, 보통 `isArmsUpCircle`.
 *   없으면 중앙·크기만으로 고른다.
 */
export function acquisitionScore(lms, gestureCheck) {
  const hc = anchorOf(lms)
  if (!hc) return -Infinity
  const center = 1 - Math.min(1, Math.abs(hc.x - 0.5) * 2)
  const nose = lms[LM.NOSE], lAnk = lms[LM.L_ANKLE], rAnk = lms[LM.R_ANKLE]
  let size = 0
  if (seen(nose) && seen(lAnk) && seen(rAnk)) {
    const ankleY = (lAnk.y + rAnk.y) / 2
    size = Math.min(1, Math.abs(ankleY - nose.y) / 0.8)
  } else {
    // 발목이 안 보인다(앉아 있거나 카메라에 가깝다) — 어깨 너비로 대신
    // 잰다. 가까울수록 어깨가 넓게 잡힌다. 0.35를 화면 가득으로 보는 건
    // 어림값이고, 서 있는 경우(위 분기)와 눈금이 정확히 같지는 않다 —
    // 다만 이 점수는 **후보끼리 비교**에만 쓰이므로 같은 프레임 안에서
    // 일관되기만 하면 된다.
    const ls = lms[LM.L_SHOULDER], rs = lms[LM.R_SHOULDER]
    if (seen(ls) && seen(rs)) size = Math.min(1, Math.abs(ls.x - rs.x) / 0.35)
  }
  const gesture = gestureCheck?.(lms) ? 3 : 0   // center+size 최댓값(2)을 항상 넘는다
  return center + size + gesture
}

// 잠긴 사람을 놓쳤을 때 다른 사람에게 넘어가기까지의 유예(초).
// 실기기 미검증 — 너무 짧으면 잠깐 겹쳐 가린 것도 놓치고, 너무 길면 진짜
// 자리를 뜬 뒤에도 한참 새 사람을 못 찾는다.
const TRACK_LOSE_GRACE_SEC = 2.5

// "같은 사람"으로 볼 최대 거리(정규화 좌표, 골반 중심 기준). 실기기 미검증.
const TRACK_MATCH_DIST = 0.30

/**
 * 잠금 상태 하나를 만든다. 화면(대개 `poseEngineCore`)이 매 프레임 `select()`를
 * 부르고, 확정할 순간에 `confirmLock()`을 부른다.
 */
export function createPersonLock({ gestureCheck } = {}) {
  let lock = null          // { x, y } | null — 잠긴 골반 중심
  let lostAt = null        // ms | null — 잠긴 사람을 놓친 시각
  let lastHipCenter = null // 마지막으로 고른 사람의 골반 중심 — confirmLock()이 이걸 잠근다

  function pickLocked(candidates) {
    let best = null, bestDist = Infinity
    for (const c of candidates) {
      const hc = anchorOf(c)
      if (!hc) continue
      const d = Math.hypot(hc.x - lock.x, hc.y - lock.y)
      if (d < bestDist) { bestDist = d; best = c }
    }
    return bestDist <= TRACK_MATCH_DIST ? best : null
  }

  function pickBest(candidates) {
    let best = null, bestScore = -Infinity
    for (const c of candidates) {
      const s = acquisitionScore(c, gestureCheck)
      if (s > bestScore) { bestScore = s; best = c }
    }
    return best
  }

  return {
    /**
     * @param {Array} candidates 이번 프레임에 감지된 사람들의 랜드마크 배열들
     * @param {number} now 지금 시각(ms) — 유예 계산에만 쓴다
     * @returns 골라낸 사람의 랜드마크, 아무도 못 고르면 null
     */
    select(candidates, now) {
      if (lock) {
        const found = pickLocked(candidates)
        if (found) {
          lock = anchorOf(found)
          lostAt = null
          lastHipCenter = lock
          return found
        }
        // 놓쳤다 — 유예 안이면 이번 프레임은 쉰다(다른 사람으로 안 넘어간다)
        if (lostAt == null) lostAt = now
        if (now - lostAt < TRACK_LOSE_GRACE_SEC * 1000) return null
        // 유예를 넘겼다 — 잠금을 풀고 이번 프레임부터 다시 고른다
        lock = null
        lostAt = null
      }
      const best = pickBest(candidates)
      if (best) lastHipCenter = anchorOf(best)
      return best
    },

    /** 지금 고른 사람을 "이 사람"으로 확정한다. 화면이 순간을 판단해서 부른다. */
    confirmLock() {
      if (lastHipCenter) { lock = { ...lastHipCenter }; lostAt = null }
    },

    get isLocked() { return !!lock },

    /** 세션 경계(카메라를 완전히 놓을 때) — 다음 사람을 처음부터 고른다. */
    reset() { lock = null; lostAt = null; lastHipCenter = null },
  }
}

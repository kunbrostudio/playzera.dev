// arcade2d 손 추적 — 카메라 랜드마크를 손 좌표(정규화 0~1)로 바꾼다.
//
// `spriteField.js`가 미리 적어둔 자리다: "실제 손 위치를 이 좌표계로 바꾸는 일
// (거울 좌표, 카메라 접근)은 `arcade2d/handTracker.js` 몫이다." 여기서만
// 카메라를 안다 — movement.js·spriteField.js·game.js는 여전히 숫자만 다룬다.
//
// 좌표는 이미 거울 좌표다(`poseEngineCore`가 `1-x`를 한 번만 한다) — 여기서
// 또 뒤집지 않는다. 화면 레이어가 다른 게임의 PIP 오버레이(`pipOverlay.js`)와
// 똑같이 `p.x * 화면폭`으로 그대로 쓰면 된다.

import { poseEngineCore } from '../../core/pose/poseEngine.js'
import { LM } from '../../core/pose/gesture.js'

// ── 용어 ★ ──────────────────────────────────────────────────
//
// **트래커** = 화면에서 손을 따라다니는 동그란 포인터. ken이 쓰는
// 말이고 이 저장소도 이 말을 쓴다(그 전엔 "손 커서"라고 적었는데,
// 같은 것을 가리키는 이름이 둘이면 피드백이 어긋난다).
//
// ── 트래커는 **하나만** 띄운다 ★ ────────────────────────────
//
// ken 5차 피드백: "내 손이 하나인데 왜 트래커 포인트가 두개가 나와서
// 헷갈리게 해?" — 라운드 4에서 "두 손목이 너무 가까우면 하나를
// 버린다"로 막아 봤지만, 지어낸 손목이 **멀리** 찍히면 그 검사에
// 안 걸린다. MediaPipe Pose는 안 보이는 관절도 **좌표를 지어내서**
// 33개를 항상 채워 주기 때문에, "둘 중 진짜만 고르기"는 원리적으로
// 100% 맞힐 수가 없다.
//
// 그래서 고르는 걸 잘하려 하지 않고 **개수를 줄였다**: 이 게임은
// 어차피 한 번에 풍선 하나만 잡는다(3차 피드백). 트래커도 하나면
// 지어낸 손목이 있어도 화면에 안 나온다 — 오탐이 남아도 아이 눈에는
// 안 보인다. 규칙을 단순하게 만들어 문제를 없애는 쪽이 더 나은 판정
// 로직을 만드는 쪽보다 확실하다.
//
// 어느 쪽 손을 쓸지는 **더 높이 든 손**으로 정하고, 한 번 고르면
// 웬만해선 안 바꾼다(`SWITCH_MARGIN`) — 여유 없이 매 프레임 다시
// 고르면 두 손 높이가 비슷할 때 트래커가 좌우로 튄다.
//
// 신뢰도 문턱은 앱 표준(0.5, `poseEngine.js`의
// `FULL_BODY_VISIBILITY_MIN`)이다. 라운드 2에서 0.65로 올렸다가
// 라운드 4에서 되돌렸다 — 팔을 카메라 쪽으로 뻗으면(이 게임의 기본
// 동작이다) 진짜 손인데도 visibility가 0.5~0.7을 오르내려서, 문턱을
// 올리면 진짜 손이 자주 걸러진다.
const VISIBILITY_MIN = 0.5
const SWITCH_MARGIN = 0.08   // 쓰던 손을 놓고 반대 손으로 갈아타는 데 필요한 높이 차(정규화)

const seenAt = (lms, idx) => {
  const p = lms?.[idx]
  if (!p) return null
  if (typeof p.visibility === 'number' && p.visibility < VISIBILITY_MIN) return null
  if (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05) return null
  return p
}

/**
 * 한쪽 손의 **손바닥 한가운데**.
 *
 * 손목(15·16)만 쓰면 트래커가 팔목에 붙는다 — 아이는 손바닥으로
 * 풍선을 만진다고 느끼는데 판정점은 한 뼘 아래 있으니, 맞게 잡아도
 * "빗나갔다"로 보인다(ken 스크린샷에서 실제로 손목에 떠 있었다).
 * 손목·검지·새끼의 평균이 손바닥 중심에 가장 가깝다. 손끝 점이
 * 안 보이면 손목만으로 떨어진다 — 없는 것보다는 낫다.
 */
function palmOf(lms, wristIdx, indexIdx, pinkyIdx) {
  const w = seenAt(lms, wristIdx)
  if (!w) return null
  const i = seenAt(lms, indexIdx), p = seenAt(lms, pinkyIdx)
  const pts = [w, i, p].filter(Boolean)
  const n = pts.length
  return {
    x: pts.reduce((s, q) => s + q.x, 0) / n,
    y: pts.reduce((s, q) => s + q.y, 0) / n,
    visibility: w.visibility ?? 1,
  }
}

/** 이번 프레임의 양손 후보. 고르기 전 단계라 둘 다 나올 수 있다. */
export function palmCandidates(lms) {
  return {
    left: palmOf(lms, LM.L_WRIST, LM.L_INDEX, LM.L_PINKY),
    right: palmOf(lms, LM.R_WRIST, LM.R_INDEX, LM.R_PINKY),
  }
}

/**
 * 트래커 하나를 고른다. 순수 함수 — 카메라 없이 테스트할 수 있다
 * (`test/handTracker.test.js`).
 *
 * @param {Array<object>} lms 프레임 하나의 전체 랜드마크
 * @param {'left'|'right'|null} current 지금 쓰고 있는 손 (없으면 null)
 * @returns {{ side:'left'|'right'|null, point:{x,y}|null }}
 */
export function pickTracker(lms, current = null) {
  const { left, right } = palmCandidates(lms)
  if (!left && !right) return { side: null, point: null }
  if (!left) return { side: 'right', point: { x: right.x, y: right.y } }
  if (!right) return { side: 'left', point: { x: left.x, y: left.y } }

  // 둘 다 보인다 — y가 작을수록 위. 쓰던 손이 있으면 반대 손이
  // SWITCH_MARGIN만큼 더 높이 올라와야 갈아탄다.
  let side
  if (current === 'left') side = (left.y - right.y) > SWITCH_MARGIN ? 'right' : 'left'
  else if (current === 'right') side = (right.y - left.y) > SWITCH_MARGIN ? 'left' : 'right'
  else side = left.y <= right.y ? 'left' : 'right'

  const p = side === 'left' ? left : right
  return { side, point: { x: p.x, y: p.y } }
}

/**
 * 카메라를 빌려 손목 좌표를 계속 흘려준다. 화면 배경으로 쓸 `<video>` 엘리먼트도
 * 여기서 만든다 — 호출한 쪽이 이걸 DOM에 붙이기만 하면 된다.
 *
 * `hands.seq`는 실제 새 감지가 있을 때마다 하나씩 올라간다 — 포즈 추론은
 * 화면 갱신(rAF)보다 느려서 `hands.left/right` 값 자체는 여러 프레임
 * 동안 똑같이 머물 수 있다(다음 프레임 참고). 화면 쪽 스무딩
 * (`arcade2d/handSmoother.js`)이 "이번 값이 진짜 새 정보인지 그냥
 * 반복인지"를 구별하는 데 이 값을 쓴다 — 못 구별하면 정지한 옛
 * 좌표를 새 정보인 것처럼 계속 보정하려다 예측이 오히려 방해받는다.
 *
 * @param {object} [opts]
 * @param {(hands:{left:object|null,right:object|null}, lms:object) => void} [opts.onFrame]
 * @returns {{ video: HTMLVideoElement, hands: object, ready: Promise<boolean>, release: Function }}
 */
export function trackHands({ onFrame } = {}) {
  const hands = { left: null, right: null, side: null, seq: 0 }
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.autoplay = true

  let acquired = false, unsub = null, detach = null

  const ready = (async () => {
    try {
      await poseEngineCore.acquire()
      acquired = true
      detach = poseEngineCore.attach(video)
      unsub = poseEngineCore.onLandmarks(lms => {
        // 트래커는 하나다 — 고른 쪽만 채우고 반대쪽은 항상 null이다.
        // `game.js`는 여전히 `{left, right}` 모양을 받으므로(양손을 쓰는
        // 다른 게임과 같은 규격) 게임 쪽 코드는 안 바뀐다.
        const { side, point } = pickTracker(lms, hands.side)
        hands.side = side
        hands.left = side === 'left' ? point : null
        hands.right = side === 'right' ? point : null
        hands.seq++
        onFrame?.(hands, lms)
      })
      return true
    } catch (e) {
      console.info('[arcade2d] 카메라를 못 열었다:', e?.name ?? e)
      return false
    }
  })()

  return {
    video,
    hands,
    ready,
    release() {
      unsub?.()
      detach?.()
      if (acquired) { acquired = false; poseEngineCore.release() }
    },
  }
}

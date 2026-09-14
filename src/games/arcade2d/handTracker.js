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
import { createPlayerSlots } from '../../core/pose/playerSlots.js'

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
  // `personAt` — 마지막으로 "사람 한 명"이 흘러온 시각(ms). 손이 안 보여도
  // 사람만 보이면 오른다 — 풍선 팡팡이 게임 시작 전 "화면에 선 사람이
  // 있나"를 재는 데 쓴다(STEP 105). 기존 필드·동작은 그대로다.
  const hands = { left: null, right: null, side: null, seq: 0, personAt: null }
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
        hands.personAt = performance.now()
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
    // 손 키 목록과 "그 키가 실제로 어느 손인가" — DUO 트래커(`trackPlayers`)와
    // 같은 모양을 맞춰서 화면 코드가 둘을 구별 없이 쓴다. SOLO는 키가 곧 손이다.
    keys: ['left', 'right'],
    sideOf: key => key,
    ready,
    release() {
      unsub?.()
      detach?.()
      if (acquired) { acquired = false; poseEngineCore.release() }
    },
  }
}

// ── DUO(둘이 하기) — 플레이어마다 손 하나 ★ (STEP 105) ─────────────
//
// 한 사람이 양손을 다 쓰지 않는다(요청 7번 — 난이도·중복 충돌·유아 UX).
// 그래서 플레이어 한 명당 트래커도 하나다. 어느 손을 쓸지는 SOLO와 같은
// `pickTracker`(더 높이 든 손 + 갈아타기 여유)를 그대로 쓰되, 플레이어마다
// 상태를 따로 들고 두 가지를 더 얹는다:
//
//   - 손이 **잠깐** 안 보이면(가림) 곧장 반대 손으로 안 넘어간다 — 유예
//     동안은 포인터만 비워 두고 같은 손을 기다린다.
//   - 반대 손이 더 높다고 판단돼도 **잠깐 이어져야** 갈아탄다 — 두 손
//     높이가 비슷할 때 프레임마다 좌우로 튀지 않는다.
export const HAND_LOSS_GRACE_MS = 350     // 실기기 미검증
export const HAND_SWITCH_DWELL_MS = 250   // 실기기 미검증

/**
 * 플레이어 한 명의 "지금 쓰는 손" 고르기. 순수(시간을 밖에서 받는다).
 * @returns {{ update(lms, now): {side:'left'|'right'|null, point:{x,y}|null}, reset(): void, readonly side }}
 */
export function createHandPicker({ lossGraceMs = HAND_LOSS_GRACE_MS, switchDwellMs = HAND_SWITCH_DWELL_MS } = {}) {
  let side = null, lostSince = null, switchSince = null
  return {
    get side() { return side },
    update(lms, now) {
      const cands = palmCandidates(lms)
      if (side && cands[side]) {
        lostSince = null
        const want = pickTracker(lms, side).side
        if (want && want !== side) {
          if (switchSince == null) switchSince = now
          if (now - switchSince >= switchDwellMs) { side = want; switchSince = null }
        } else {
          switchSince = null
        }
        const p = cands[side]
        return { side, point: { x: p.x, y: p.y } }
      }
      switchSince = null
      if (side) {
        if (lostSince == null) lostSince = now
        if (now - lostSince < lossGraceMs) return { side, point: null }
      }
      const picked = pickTracker(lms, null)
      side = picked.side
      lostSince = null
      return picked
    },
    reset() { side = null; lostSince = null; switchSince = null },
  }
}

/**
 * DUO용 손 추적 — `trackHands`와 같은 모양(`video`·`hands`·`keys`·`ready`·
 * `release`)에 플레이어 상태(`status`)와 세션 초기화(`reset`)를 더했다.
 * 손 키는 `p1`/`p2`이고 각 키에 그 플레이어의 손 하나만 들어간다 —
 * 그래서 포인터는 **최대 maxPlayers개**다(한 사람이 양손을 들어도 늘지 않는다).
 */
export function trackPlayers({ maxPlayers = 2, onFrame } = {}) {
  const duo = createDuoHands({ maxPlayers })

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
      unsub = poseEngineCore.onCandidates((people, now) => {
        duo.update(people, now)
        onFrame?.(duo.hands, duo.slots)
      })
      return true
    } catch (e) {
      console.info('[arcade2d] 카메라를 못 열었다:', e?.name ?? e)
      return false
    }
  })()

  return {
    video,
    hands: duo.hands,
    keys: duo.keys,
    sideOf: duo.sideOf,
    ready,
    status: duo.status,
    reset: duo.reset,
    release() {
      unsub?.()
      detach?.()
      if (acquired) { acquired = false; poseEngineCore.release() }
    },
  }
}

/**
 * DUO 손 추적의 **카메라 없는 알맹이** — 사람 후보 목록을 받아 자리(플레이어)를
 * 유지하고, 자리마다 손 하나만 `hands[p1|p2]`에 채운다. `trackPlayers`가 이걸
 * 카메라에 물릴 뿐이라, 포인터 개수·자리 연속성을 합성 프레임으로 검증할 수 있다.
 */
export function createDuoHands({ maxPlayers = 2 } = {}) {
  const keys = Array.from({ length: maxPlayers }, (_, i) => `p${i + 1}`)
  const hands = { seq: 0 }
  const sides = {}
  for (const k of keys) { hands[k] = null; sides[k] = null }
  const slots = createPlayerSlots({ maxSlots: maxPlayers })
  const pickers = keys.map(() => createHandPicker())

  return {
    keys,
    hands,
    slots: slots.slots,
    sideOf: key => sides[key] ?? null,

    /** @param {Array<Array<object>>} people 거울 좌표 후보들 @param {number} now ms */
    update(people, now) {
      slots.update(people, now).forEach((slot, i) => {
        const k = keys[i]
        if (slot.state !== 'active') {
          pickers[i].reset(); hands[k] = null; sides[k] = null
          return
        }
        if (!slot.lms) { hands[k] = null; return }   // 잠깐 가려짐 — 쓰던 손은 기억한다
        const r = pickers[i].update(slot.lms, now)
        hands[k] = r.point
        sides[k] = r.side
      })
      hands.seq++
      return hands
    },

    /** @param {number} now ms — `{ slots:[{id,state,present}], activeCount, presentCount }` */
    status: now => slots.statusAt(now),

    /** 게임 진입 직전 — 메뉴를 조작한 사람과 무관하게 자리를 처음부터 다시 채운다. */
    reset() {
      slots.reset()
      pickers.forEach(p => p.reset())
      for (const k of keys) { hands[k] = null; sides[k] = null }
    },
  }
}

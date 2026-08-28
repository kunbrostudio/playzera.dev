// 네 가지 기본 동작 — 점프 · 앉기 · 좌우 · 만세.
//
// ── 왜 core에 있나 ───────────────────────────────────────────
//
// 이 넷은 러너의 `input/motionDetector.js` 안에 갇혀 있었다. 게임팩 안에 있으니
// 다른 게임이 쓰려면 복사하는 수밖에 없고, 복사하면 문턱값이 두 벌이 되어 어긋난다.
// 클리커 게임이 같은 넷을 쓰게 되면서 여기로 올렸다.
//
// ── 캘리브레이션을 하지 않는다 ★ ─────────────────────────────
//
// 러너는 "3초간 가만히 서 계세요"로 기준선(골반 높이·중앙 위치)을 잡는다.
// 여기서는 그러지 않는다. `highKnees`가 먼저 택한 길을 그대로 따른다.
//
// **몸은 대부분의 시간을 서 있는 자세로 보낸다.** 최근 몇 초 골반 높이의 중앙값이
// 곧 "서 있을 때"고, 좌우도 대부분 가운데 있으므로 중앙값이 곧 "중앙"이다.
// 그 값을 계속 갱신해 기준으로 쓴다.
//
//   → 게임을 바꿀 때마다 멈춰 서 있지 않아도 된다 (지겨움의 주범이 이것이었다)
//   → 아이가 카메라에서 멀어지거나 옆으로 자리를 옮겨도 따라간다
//   → **틀린 기준을 오래 끌고 다니지 않는다.** 저장해서 재사용하면 앉은 채로 잡힌
//     기준이나 다른 아이의 몸이 그대로 남는데, 그게 틀렸다는 걸 아무도 모른다
//
// 대신 함정이 하나 있고 이미 겪었다 — **시작하자마자 아이가 점프 중이거나 앉아
// 있으면 그 자세가 기준이 된다.** `highKnees`가 해부학적 폴백으로 막았고 여기도 같다.
//
// ── 1회로 세는 기준 ──────────────────────────────────────────
//
// 넷 다 **"돌아와야 다음 1회"**다. 한 방향으로 가서 멈춰 있으면 카운트가 안 오른다.
// 그래서 반복이 곧 스쿼트·사이드스텝·팔 운동이 된다.
//
// 시간은 밖에서 받는다(초). `performance.now()`를 안에서 부르면 합성 프레임으로
// 테스트할 수 없다(프로젝트 공통 규칙).

import { LM } from '../gesture.js'
import { MOVES as T } from '../tuning.js'

/** 이 감지기가 아는 동작. 게임은 이 이름으로 말한다. */
export const MOVE = {
  JUMP: 'jump',
  SQUAT: 'squat',
  LEFT: 'left',
  RIGHT: 'right',
  ARMS_UP: 'armsUp',
}

// MediaPipe는 화면 밖 관절의 좌표를 **지어낸다.** 좌표만 보면 그럴듯해서 앉아 있는
// 사람에게서 걸음이 세어진 적이 있다. visibility가 낮은 프레임은 통째로 버린다.
// 값이 없는 경우(테스트의 가짜 프레임)는 보이는 것으로 본다.
const seen = p => p && (p.visibility ?? 1) >= 0.5
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** 최근 창에서 값 하나를 뽑는 롤링 기준선. */
class Rolling {
  constructor(windowSec, pick) {
    this.windowSec = windowSec
    this.pick = pick          // (values) => number
    this.samples = []
    this.value = null
  }
  push(t, v) {
    this.samples.push({ t, v })
    const from = t - this.windowSec
    while (this.samples.length && this.samples[0].t < from) this.samples.shift()
    this.value = this.pick(this.samples.map(s => s.v))
  }
}

const median = vs => {
  const s = [...vs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

export class MoveDetector {
  /**
   * @param {object} opts  문턱값 덮어쓰기 (테스트·튜닝용)
   */
  constructor(opts = {}) {
    this.cfg = { ...T, ...opts }

    // ⚠️ **골반 높이는 중앙값이어야 한다.** `highKnees`처럼 "가장 낮았던 위치"를 쓰면
    //    앉는 순간 기준선이 그 자리로 따라 내려가서 **앉기가 영영 안 잡힌다**
    //    (무릎은 서 있을 때가 항상 제일 낮지만, 골반은 앉으면 더 내려간다).
    //    아이는 대부분의 시간을 서 있으므로 중앙값이 곧 "서 있을 때"다.
    this.hipBase = new Rolling(this.cfg.standWindowSec, median)  // 서 있을 때 골반 높이
    this.hipMid = new Rolling(this.cfg.baseWindowSec, median)    // 중앙 위치

    this.counts = { jumps: 0, squats: 0, side_steps: 0, arm_raises: 0 }

    this._prevHipY = null
    this._prevT = null
    this._lastJumpAt = -99
    this._squatting = false
    this._stoodUpAt = -99
    this._side = 0            // -1 좌 / 0 중앙 / +1 우
    this._armsUp = false

    /** 이번 프레임에 완성된 동작들 — `update()`가 채우고 게임이 읽는다. */
    this.fired = []
  }

  /**
   * 한 프레임.
   * @param {Array} lms  랜드마크 (거울 좌표 — 엔진이 이미 뒤집었다)
   * @param {number} t   초
   * @returns {string[]} 이번 프레임에 완성된 동작 이름들 (보통 0~1개)
   */
  update(lms, t) {
    this.fired = []
    if (!lms) return this.fired

    const lHip = lms[LM.L_HIP], rHip = lms[LM.R_HIP]
    const nose = lms[LM.NOSE]
    const lAnk = lms[LM.L_ANKLE], rAnk = lms[LM.R_ANKLE]
    if (![lHip, rHip, nose, lAnk, rAnk].every(seen)) return this.fired

    const hip = mid(lHip, rHip)
    const ankle = mid(lAnk, rAnk)
    const bodyHeight = Math.abs(ankle.y - nose.y)
    if (bodyHeight < this.cfg.minBodyHeight) return this.fired

    this.hipBase.push(t, hip.y)
    this.hipMid.push(t, hip.x)

    // **해부학적 폴백.** 시작하자마자 점프 중이면 그 높이가 "서 있을 때"가 되어
    // 첫 점프를 놓친다. 골반은 발목보다 키의 45%쯤 위에 있는 게 정상이므로,
    // 롤링 기준이 그보다 높게(=y가 작게) 잡히면 해부학적 값을 쓴다.
    const anatomical = ankle.y - bodyHeight * this.cfg.hipFromAnkle
    const baseY = Math.max(this.hipBase.value ?? anatomical, anatomical)
    const baseX = this.hipMid.value ?? hip.x

    // **앉기를 먼저 본다.** 앉았다 일어나는 순간은 골반이 빠르게 올라가서 점프로도
    // 보인다 — 실제로 테스트에서 스쿼트 한 번이 점프로 세어졌다.
    // 일어난 직후 잠깐은 점프를 세지 않는다.
    this._squat(hip, baseY, bodyHeight, t)
    this._jump(hip, baseY, bodyHeight, t)
    this._side_(hip, baseX, bodyHeight)
    this._arms(lms, bodyHeight)

    this._prevHipY = hip.y
    this._prevT = t
    return this.fired
  }

  // 골반이 기준선보다 올라가고 **상승 속도가 붙어야** 점프다.
  // 높이만 보면 까치발이나 프레임 흔들림도 잡힌다.
  _jump(hip, baseY, bodyHeight, t) {
    const rise = (baseY - hip.y) / bodyHeight
    let vy = 0
    if (this._prevHipY != null && this._prevT != null && t > this._prevT) {
      vy = (this._prevHipY - hip.y) / bodyHeight / (t - this._prevT)
    }
    if (rise > this.cfg.jumpRise && vy > this.cfg.jumpVelocity
        && t - this._lastJumpAt > this.cfg.jumpCooldown
        && t - this._stoodUpAt > this.cfg.squatToJumpLockSec) {
      this._lastJumpAt = t
      this.counts.jumps++
      this.fired.push(MOVE.JUMP)
    }
  }

  // **앉았다 일어나야** 1회다. 앉은 채로 있으면 카운트가 안 오른다 — 그래야 스쿼트다.
  _squat(hip, baseY, bodyHeight, t) {
    const drop = (hip.y - baseY) / bodyHeight
    if (!this._squatting && drop > this.cfg.squatDrop) {
      this._squatting = true
    } else if (this._squatting && drop < this.cfg.squatDrop * this.cfg.returnRatio) {
      this._squatting = false
      this._stoodUpAt = t        // 직후 잠깐 점프를 막는다 (`_jump` 참고)
      this.counts.squats++
      this.fired.push(MOVE.SQUAT)
    }
  }

  // **옆으로 갔다 중앙으로 돌아와야** 1회다. 그래야 사이드스텝이 된다.
  // 히스테리시스가 없으면 경계에서 좌우가 덜덜 떨린다(러너에서 겪었다).
  _side_(hip, baseX, bodyHeight) {
    const dx = (hip.x - baseX) / bodyHeight
    const out = this.cfg.laneThreshold
    const back = this.cfg.laneThreshold - this.cfg.laneHysteresis

    if (this._side === 0) {
      if (dx < -out) this._side = -1
      else if (dx > out) this._side = 1
    } else if (Math.abs(dx) < back) {
      // 돌아왔다 — 이때 센다
      this.counts.side_steps++
      this.fired.push(this._side < 0 ? MOVE.LEFT : MOVE.RIGHT)
      this._side = 0
    }
  }

  // 두 손목이 어깨 위로. **내려야** 다음 1회.
  _arms(lms, bodyHeight) {
    const lw = lms[LM.L_WRIST], rw = lms[LM.R_WRIST]
    const ls = lms[LM.L_SHOULDER], rs = lms[LM.R_SHOULDER]
    if (![lw, rw, ls, rs].every(seen)) return

    const shoulderY = (ls.y + rs.y) / 2
    const margin = this.cfg.armRaise * bodyHeight
    const up = lw.y < shoulderY - margin && rw.y < shoulderY - margin
    const down = lw.y > shoulderY && rw.y > shoulderY

    if (!this._armsUp && up) {
      this._armsUp = true
      this.counts.arm_raises++
      this.fired.push(MOVE.ARMS_UP)
    } else if (this._armsUp && down) {
      this._armsUp = false
    }
  }

  /** 운동 사전(`progress/exercises.js`)의 키로 낸다. 셸의 기록기가 그대로 쓴다. */
  snapshot() {
    return { ...this.counts }
  }
}

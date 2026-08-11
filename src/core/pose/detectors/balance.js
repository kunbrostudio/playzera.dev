// 한 발 서기 — 버틴 **시간**을 센다.
//
// 균형은 모든 동작의 토대이고, 4~8세에 넘어짐을 줄이는 가장 직접적인 능력이다.
// 그런데 우리가 세던 지표에는 균형이 하나도 없었다.
//
// ── 왜 횟수가 아니라 초인가 ─────────────────────────────────
//
// 한 발로 "몇 번 섰나"는 의미가 없다. 발을 들었다 놨다만 반복해도 오른다.
// **얼마나 버텼나**가 곧 능력이다. 그래서 단위가 초다.
//
// ── 흔들림을 봐준다 ─────────────────────────────────────────
//
// 아이는 버티다가 발이 잠깐 바닥에 닿았다 다시 든다. 그때마다 0으로 되돌리면
// 아이 입장에서는 **되는 게 없는 놀이**가 된다. 0.4초까지는 이어진 것으로 친다.
// 대신 그 유예 시간은 초에 더하지 않는다 — 안 버틴 시간을 버틴 것으로 세면
// 그건 거짓말이다.
//
// 시간은 밖에서 받는다(초). performance.now()를 안에서 부르면 테스트를 못 쓴다.

import { LM } from '../gesture.js'

// 랜드마크가 화면 밖이면 MediaPipe는 **위치를 지어낸다.** 좌표만 보면 그럴듯해서
// 앉아 있는 사람에게서도 걸음이 세어진다(실제로 /lab에서 1걸음이 찍혔다).
// visibility가 낮은 프레임은 통째로 버린다. 값이 없는 경우(테스트의 가짜 프레임)는 보이는 것으로 본다.
const seen = p => p && (p.visibility ?? 1) >= 0.5


export const BALANCE = {
  liftRatio: 0.06,       // 두 발목의 높이 차가 키의 6% 이상이면 한 발이 뜬 것
  dropRatio: 0.03,       // 3% 아래로 내려오면 내려놓은 것 (히스테리시스)
  graceSec: 0.4,         // 이 안에 다시 들면 이어서 센 것으로 본다
  minBodyHeight: 0.15,
}

export class BalanceDetector {
  constructor(opts = {}) {
    this.cfg = { ...BALANCE, ...opts }
    this.reset()
    this.onHoldStart = null   // (side) => void
    this.onHoldEnd = null     // (sec, side) => void  — 유예까지 끝나 끊긴 순간
    this.onBest = null        // (sec, side) => void  — 최고 기록이 갱신될 때
  }

  reset() {
    this.holding = false      // 지금 발이 떠 있나
    this.side = null          // 'left' | 'right' — 뜬 발
    this.holdSec = 0          // 지금 이어지고 있는 시간
    this.totalSec = 0         // 이번 판에 버틴 시간 합계
    this.bestSec = 0
    this.bestBySide = { left: 0, right: 0 }
    this._graceLeft = 0       // 남은 유예
    this._lastT = null
  }

  /**
   * @param {Array<{x:number,y:number}>} lms  거울 좌표 랜드마크
   * @param {number} t  초
   */
  update(lms, t) {
    const dt = this._lastT === null ? 0 : Math.max(0, t - this._lastT)
    this._lastT = t

    const lifted = this._liftedSide(lms)

    if (lifted) {
      // 발을 바꿔 들면 이어지는 게 아니라 새로 시작이다
      if (this.holding && this.side !== lifted) this._end()
      if (!this.holding) {
        this.holding = true
        this.side = lifted
        this.onHoldStart?.(lifted)
      }
      this._graceLeft = this.cfg.graceSec
      this.holdSec += dt
      this.totalSec += dt
      if (this.holdSec > this.bestSec) {
        this.bestSec = this.holdSec
        this.onBest?.(this.holdSec, this.side)
      }
      if (this.holdSec > (this.bestBySide[this.side] ?? 0)) {
        this.bestBySide[this.side] = this.holdSec
      }
      return
    }

    // 발이 내려왔다 — 유예 안이면 아직 끊긴 게 아니다.
    // **유예 시간은 초에 더하지 않는다.** 안 버틴 시간을 세면 거짓말이 된다.
    if (this.holding) {
      this._graceLeft -= dt
      if (this._graceLeft <= 0) this._end()
    }
  }

  _end() {
    const sec = this.holdSec
    const side = this.side
    this.holding = false
    this.side = null
    this.holdSec = 0
    this._graceLeft = 0
    if (sec > 0) this.onHoldEnd?.(sec, side)
  }

  _liftedSide(lms) {
    if (!lms || lms.length <= LM.R_ANKLE) return null
    // 발이 안 보이면 판정하지 않는다. 화면 밖 발목은 지어낸 좌표다.
    for (const i of [LM.NOSE, LM.L_ANKLE, LM.R_ANKLE]) if (!seen(lms[i])) return null
    const nose = lms[LM.NOSE]
    const l = lms[LM.L_ANKLE], r = lms[LM.R_ANKLE]
    const bodyHeight = Math.abs((l.y + r.y) / 2 - nose.y)
    if (!(bodyHeight > this.cfg.minBodyHeight)) return null

    // 화면 좌표라 y가 작을수록 위. 위에 있는 쪽이 뜬 발이다.
    const diff = Math.abs(l.y - r.y) / bodyHeight
    const up = l.y < r.y ? 'left' : 'right'

    // 이미 들고 있으면 더 낮은 문턱으로 유지 판정한다 —
    // 같은 값으로 판정하면 경계에서 켜졌다 꺼졌다 한다.
    const need = this.holding ? this.cfg.dropRatio : this.cfg.liftRatio
    if (diff < need) return null
    return up
  }

  /** 게임이 끝날 때 기록으로 넘길 값 */
  snapshot() {
    return { balance_sec: Math.round(this.totalSec) }
  }
}

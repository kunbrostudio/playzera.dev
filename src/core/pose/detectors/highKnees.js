// 제자리 달리기 — 무릎을 교대로 드는 걸 센다.
//
// **유산소 구멍을 메우는 동작이다.** 지금까지 우리가 세던 넷(점프·앉기·좌우·포즈)은
// 전부 짧은 반응이라 숨이 차는 구간이 없었다. 30초만 해도 아이는 헐떡인다.
//
// ── 왜 캘리브레이션을 안 하나 ────────────────────────────────
//
// 웜업의 MotionDetector는 3초 서 있게 하고 기준선을 잡는다. 여기서는 그러지 않는다.
// **다리는 대부분의 시간을 아래에 두고 있다** — 최근 몇 초 동안 무릎이 가장 낮았던
// 위치가 곧 "서 있을 때"다. 그 값을 계속 갱신해 기준으로 쓴다.
//
//   → 준비 화면을 안 거치는 게임에도 그냥 붙는다
//   → 아이가 카메라에서 멀어지거나 가까워져도 따라간다
//   → 키·카메라 거리는 bodyHeight 비율로 흡수한다 (프로젝트 공통 규칙)
//
// ── 4~8세에 맞춘 문턱 ────────────────────────────────────────
//
// 어른 기준 하이니(허벅지 수평)를 요구하면 아이는 한 번도 못 센다.
// **키의 10%**만 올라와도 한 걸음으로 친다. 그 정도면 그냥 걷는 것과는 확실히 다르다.
//
// 시간은 밖에서 받는다(초). performance.now()를 안에서 부르면 테스트를 못 쓴다.

import { LM } from '../gesture.js'

// 랜드마크가 화면 밖이면 MediaPipe는 **위치를 지어낸다.** 좌표만 보면 그럴듯해서
// 앉아 있는 사람에게서도 걸음이 세어진다(실제로 /lab에서 1걸음이 찍혔다).
// visibility가 낮은 프레임은 통째로 버린다. 값이 없는 경우(테스트의 가짜 프레임)는 보이는 것으로 본다.
const seen = p => p && (p.visibility ?? 1) >= 0.5


export const HIGH_KNEES = {
  liftRatio: 0.10,      // 기준선보다 키의 10% 위 → 든 것
  dropRatio: 0.05,      // 5% 아래로 내려와야 다시 셀 수 있다 (히스테리시스)
  minGapSec: 0.18,      // 같은 다리를 이보다 빨리 두 번 세지 않는다 (떨림 방지)
  baseWindowSec: 2.0,   // "서 있을 때 무릎 높이"를 찾는 창
  cadenceWindowSec: 6.0,// 분당 걸음 수를 재는 창
  activeCadence: 40,    // 이 이상이면 "달리는 중"으로 본다 (걸음/분)
  minBodyHeight: 0.15,  // 전신이 안 보이면 아무것도 하지 않는다
}

class Leg {
  constructor() {
    this.up = false
    this.lastCountAt = -99
    this.samples = []     // { t, y } — 무릎이 가장 낮았던 위치를 찾는 창
    this.base = null
  }

  // 최근 창에서 **가장 낮은 무릎 위치**(화면 좌표라 y가 큰 쪽)가 서 있을 때다
  updateBase(t, y) {
    this.samples.push({ t, y })
    const from = t - HIGH_KNEES.baseWindowSec
    while (this.samples.length && this.samples[0].t < from) this.samples.shift()
    this.base = this.samples.reduce((m, s) => Math.max(m, s.y), -Infinity)
  }
}

export class HighKneesDetector {
  constructor(opts = {}) {
    this.cfg = { ...HIGH_KNEES, ...opts }
    this.left = new Leg()
    this.right = new Leg()
    this.count = 0
    this.stepTimes = []       // 케이던스 계산용
    this.activeSec = 0        // 실제로 달린 시간
    this._lastT = null
    this.onStep = null        // (side, count) => void
  }

  /** 최근 창 기준 분당 걸음 수 */
  get cadence() {
    if (this.stepTimes.length < 2) return 0
    const span = this.stepTimes[this.stepTimes.length - 1] - this.stepTimes[0]
    if (span <= 0) return 0
    return Math.round((this.stepTimes.length - 1) / span * 60)
  }

  get running() { return this.cadence >= this.cfg.activeCadence }

  /**
   * @param {Array<{x:number,y:number}>} lms  거울 좌표 랜드마크 (엔진이 이미 뒤집어 준다)
   * @param {number} t  초
   */
  update(lms, t) {
    if (!lms || lms.length <= LM.R_ANKLE) return
    // 다리가 안 보이면 셀 수 없다. 무릎·발목이 다 잡힌 프레임만 쓴다.
    for (const i of [LM.NOSE, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE]) {
      if (!seen(lms[i])) { this._lastT = t; return }
    }
    const nose = lms[LM.NOSE]
    const ankleY = (lms[LM.L_ANKLE].y + lms[LM.R_ANKLE].y) / 2
    const bodyHeight = Math.abs(ankleY - nose.y)
    if (!(bodyHeight > this.cfg.minBodyHeight)) { this._lastT = t; return }

    const dt = this._lastT === null ? 0 : Math.max(0, t - this._lastT)
    this._lastT = t

    const hipY = (lms[LM.L_HIP].y + lms[LM.R_HIP].y) / 2
    this._leg(this.left, lms[LM.L_KNEE].y, hipY, bodyHeight, t, 'left')
    this._leg(this.right, lms[LM.R_KNEE].y, hipY, bodyHeight, t, 'right')

    // 케이던스 창 정리
    const from = t - this.cfg.cadenceWindowSec
    while (this.stepTimes.length && this.stepTimes[0] < from) this.stepTimes.shift()

    // 달리는 동안만 시간을 센다 — 서 있는 시간이 운동 시간으로 들어가면 안 된다
    if (this.running) this.activeSec += dt
  }

  _leg(leg, kneeY, hipY, bodyHeight, t, side) {
    // 든 상태에서는 기준선을 갱신하지 않는다. 갱신하면 든 위치가 기준이 되어
    // **한 번 들고 나면 다시는 안 세어진다.**
    if (!leg.up) leg.updateBase(t, kneeY)
    if (leg.base === null) return

    // 시작하자마자 무릎이 이미 올라가 있으면 그 위치가 기준선이 되어 **첫 걸음을 놓친다.**
    // 서 있는 무릎은 골반보다 한참 아래(키의 20%쯤)에 있다. 창에서 찾은 값이
    // 그만큼도 안 내려가 있으면 그건 서 있는 자세가 아니므로 몸 비율로 어림한다.
    // 정상일 때는 **관찰값을 그대로 쓴다** — 어림값이 끼어들면 과다 카운트가 난다.
    const standing = hipY + 0.12 * bodyHeight       // 여기보다 위면 서 있는 게 아니다
    const base = leg.base >= standing ? leg.base : hipY + 0.20 * bodyHeight

    const lift = (base - kneeY) / bodyHeight    // 위로 = +

    if (!leg.up && lift > this.cfg.liftRatio) {
      leg.up = true
      if (t - leg.lastCountAt >= this.cfg.minGapSec) {
        leg.lastCountAt = t
        this.count++
        this.stepTimes.push(t)
        this.onStep?.(side, this.count)
      }
    } else if (leg.up && lift < this.cfg.dropRatio) {
      leg.up = false
    }
  }

  reset() {
    this.left = new Leg()
    this.right = new Leg()
    this.count = 0
    this.stepTimes = []
    this.activeSec = 0
    this._lastT = null
  }

  /** 게임이 끝날 때 기록으로 넘길 값 */
  snapshot() {
    return { high_knees: this.count, active_sec: Math.round(this.activeSec) }
  }
}

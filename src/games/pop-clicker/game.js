// 팝팝 클리커 — 규칙만. **DOM도 캔버스도 모른다.**
//
// 기획은 `docs/09_팝팝클리커_기획.md`. 여기는 그 문서의 수치를 코드로 옮긴 것이다.
//
// ── 한 판 ────────────────────────────────────────────────────
//
//   1막 준비   다섯 클리커를 하나씩 눌러본다 (설명 화면이 아니라 워밍업)
//   2막 주 운동 라운드 4개 — 묶음이 길어지고 반복이 늘어난다
//   3막 정리   슈퍼 클리커를 점프 5연속으로 눌러 피니시
//
// ── 이 게임의 킥은 즉시성 하나다 ─────────────────────────────
//
// 동작 → 클리커 눌림 → 소리가 150ms 안에 나야 "내가 눌렀다"로 느낀다.
// 그래서 `hit()`은 **동기 함수**다. 화면은 이 함수가 돌려준 것을 그 프레임에 그린다.
// 애니메이션이 끝나기를 기다렸다가 소리를 내면 이미 늦다.
//
// ── 오답이 없다 ──────────────────────────────────────────────
//
// 틀린 동작을 해도 "틀렸다"가 아니라 **아무 일도 일어나지 않는다.**
// 시간이 지나면 힌트가 커지고, 더 지나면 조용히 다음으로 넘어간다(별만 덜 받는다).
// 하트·목숨은 없다 — 소개서의 "실패보다 다시 움직이고 싶게"가 이 뜻이라고 본다.

import { MOVE } from '../../core/pose/detectors/moves.js'

/** 다섯 클리커. 순서가 화면의 좌→우 순서다. */
export const CLICKERS = [
  { id: 'blue',   move: MOVE.JUMP,     label: '점프',   metric: 'jumps',       note: 4 },
  { id: 'yellow', move: MOVE.SQUAT,    label: '앉기',   metric: 'squats',      note: 5 },
  { id: 'pink',   move: MOVE.LEFT,     label: '왼쪽',   metric: 'side_steps',  note: 7 },
  { id: 'purple', move: MOVE.RIGHT,    label: '오른쪽', metric: 'side_steps',  note: 9 },
  { id: 'green',  move: MOVE.ARMS_UP,  label: '만세',   metric: 'arm_raises',  note: 11 },
]

export const byMove = m => CLICKERS.find(c => c.move === m) ?? null

/**
 * 라운드 구성 — `docs/09`의 표 그대로.
 *
 * `bundle`은 한 번에 이어지는 클리커 수, `reps`는 클리커 하나를 몇 번 눌러야 하나.
 * 합쳐서 약 68동작 = 종류당 13~14회. **실기기에서 조정할 값이다.**
 */
export const ROUNDS = [
  { bundle: 1, reps: 1, bundles: 6 },
  { bundle: 1, reps: 2, bundles: 6 },
  { bundle: 2, reps: 2, bundles: 5 },
  { bundle: 2, reps: 3, bundles: 5 },
]

export const TIMING = {
  hintSec: 4.0,      // 이만큼 못 하면 힌트가 커진다
  skipSec: 6.0,      // 이만큼 지나면 조용히 넘어간다 (별을 덜 받는다)
  freezeSec: 2.0,    // 「얼음!」 유지 시간
  warmupSec: 30,     // 1막
  superJumps: 5,     // 3막 — 슈퍼 클리커
}

export const PHASE = { WARMUP: 'warmup', PLAY: 'play', FREEZE: 'freeze', SUPER: 'super', DONE: 'done' }

/**
 * 클리커 뽑기 — 같은 동작이 연달아 몰리지 않게.
 *
 * ⚠️ `docs/07` 안전 항목: **"연속 점프는 10회쯤에서 끊고 쉰다 — 착지 반복은 무릎에 부담"**.
 * 반복 3회짜리 묶음이 점프로만 연달아 나오면 순식간에 그 문턱을 넘는다.
 * 러너의 셔플백과 같은 방식으로 최근에 나온 것을 피한다.
 */
class Bag {
  constructor(items, avoidRecent = 2, rng = Math.random) {
    this.items = items
    this.avoidRecent = avoidRecent
    this.rng = rng
    this.queue = []
    this.recent = []
  }
  _refill() {
    this.queue = [...this.items]
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]]
    }
  }
  next() {
    if (!this.queue.length) this._refill()
    const bad = c => this.recent.includes(c.id)
    if (this.queue.length > 1 && bad(this.queue[0])) {
      const k = this.queue.findIndex(c => !bad(c))
      if (k > 0) [this.queue[0], this.queue[k]] = [this.queue[k], this.queue[0]]
    }
    const picked = this.queue.shift()
    this.recent.push(picked.id)
    if (this.recent.length > this.avoidRecent) this.recent.shift()
    return picked
  }
}

export class ClickerRun {
  constructor({ rounds = ROUNDS, timing = {}, rng = Math.random } = {}) {
    this.rounds = rounds
    this.t = { ...TIMING, ...timing }
    this.bag = new Bag(CLICKERS, 2, rng)

    this.phase = PHASE.WARMUP
    this.roundIndex = 0
    this.bundleIndex = 0        // 이 라운드에서 끝낸 묶음 수
    this.steps = []             // 지금 묶음: [{ clicker, reps, done }]
    this.stepIndex = 0

    this.score = 0
    this.combo = 0
    this.bestCombo = 0
    this.pressed = 0            // 클리커를 실제로 누른 횟수 (반복 포함)
    this.skipped = 0
    this.superLeft = this.t.superJumps

    this._elapsed = 0           // 지금 클리커를 켜 둔 시간
    this._freezeHeld = 0
    this._warmupQueue = [...CLICKERS]

    this._startWarmup()
  }

  // ── 상태 읽기 ──────────────────────────────────────────────

  /** 지금 켜져 있는 클리커. 없으면 null. */
  get active() {
    const s = this.steps[this.stepIndex]
    return s ? s.clicker : null
  }

  /** 지금 클리커에 남은 반복 수. */
  get repsLeft() {
    const s = this.steps[this.stepIndex]
    return s ? s.reps - s.done : 0
  }

  /** **다음에 켜질 클리커** — 화면이 미리 은은하게 빛내 준다. */
  get upcoming() {
    const s = this.steps[this.stepIndex + 1]
    return s ? s.clicker : null
  }

  /** 힌트를 키울 때가 됐나. */
  get needsHint() { return this._elapsed >= this.t.hintSec }

  get round() { return this.rounds[this.roundIndex] ?? null }
  get roundNo() { return this.roundIndex + 1 }
  get totalRounds() { return this.rounds.length }
  get done() { return this.phase === PHASE.DONE }

  // ── 진행 ───────────────────────────────────────────────────

  _startWarmup() {
    this.phase = PHASE.WARMUP
    this._nextWarmupStep()
  }

  _nextWarmupStep() {
    const c = this._warmupQueue.shift()
    if (!c) { this.roundIndex = 0; this.bundleIndex = 0; this._startBundle(); return }
    this.steps = [{ clicker: c, reps: 1, done: 0 }]
    this.stepIndex = 0
    this._elapsed = 0
  }

  _startBundle() {
    this.phase = PHASE.PLAY
    const r = this.round
    if (!r) { this._startSuper(); return }
    this.steps = Array.from({ length: r.bundle }, () => ({
      clicker: this.bag.next(), reps: r.reps, done: 0,
    }))
    this.stepIndex = 0
    this._elapsed = 0
  }

  _startFreeze() {
    this.phase = PHASE.FREEZE
    this._freezeHeld = 0
  }

  _startSuper() {
    this.phase = PHASE.SUPER
    this.superLeft = this.t.superJumps
    this.steps = []
    this._elapsed = 0
  }

  /**
   * 시간이 흐른다. 화면이 매 프레임 부른다.
   * @returns {{ skipped?:boolean, freezeDone?:boolean }}
   */
  tick(dt) {
    if (this.phase === PHASE.DONE) return {}

    if (this.phase === PHASE.FREEZE) {
      // 얼음 유지 시간은 `hit()`이 아니라 여기서 흐른다 — 움직이면 화면이 리셋한다
      this._freezeHeld += dt
      if (this._freezeHeld >= this.t.freezeSec) {
        this.score += 50
        this._startBundle()
        return { freezeDone: true }
      }
      return {}
    }

    if (this.phase === PHASE.SUPER) return {}

    this._elapsed += dt
    if (this._elapsed >= this.t.skipSec) {
      this.skipped++
      this.combo = 0
      this._advanceStep(true)
      return { skipped: true }
    }
    return {}
  }

  /** 얼음 중에 움직였다 — 다시 처음부터. */
  freezeBroken() {
    if (this.phase === PHASE.FREEZE) this._freezeHeld = 0
  }

  /**
   * 동작 하나가 감지됐다.
   *
   * **틀린 동작은 아무 일도 일으키지 않는다** — `{ ok: false }`만 돌려주고 끝.
   * 화면도 아무것도 하지 않는다(빨간 X를 띄우지 않는다).
   *
   * @param {string} move  `MOVE.*`
   * @returns {{ ok:boolean, clicker?:object, repDone?:boolean, bundleDone?:boolean,
   *             roundDone?:boolean, gameDone?:boolean, combo?:number, gained?:number }}
   */
  hit(move) {
    if (this.phase === PHASE.DONE) return { ok: false }

    if (this.phase === PHASE.SUPER) {
      if (move !== MOVE.JUMP) return { ok: false }
      this.superLeft--
      this.pressed++
      this.score += 100
      if (this.superLeft <= 0) {
        this.phase = PHASE.DONE
        return { ok: true, gameDone: true, gained: 100 }
      }
      return { ok: true, gained: 100 }
    }

    if (this.phase === PHASE.FREEZE) {
      // 얼음 중의 움직임은 성공이 아니다. 유지 시간만 리셋된다.
      this.freezeBroken()
      return { ok: false }
    }

    const step = this.steps[this.stepIndex]
    if (!step || step.clicker.move !== move) return { ok: false }

    step.done++
    this.pressed++
    this.combo++
    this.bestCombo = Math.max(this.bestCombo, this.combo)

    // 콤보가 붙을수록 점수가 커진다 — 연속으로 움직이게 만드는 유일한 장치
    const gained = 10 + Math.min(this.combo, 20) * 2
    this.score += gained

    const repDone = step.done >= step.reps
    const out = { ok: true, clicker: step.clicker, repDone, combo: this.combo, gained }
    if (!repDone) return out

    return { ...out, ...this._advanceStep(false) }
  }

  /** 지금 클리커를 끝내고 다음으로. */
  _advanceStep(bySkip) {
    this.stepIndex++
    this._elapsed = 0
    if (this.stepIndex < this.steps.length) return { bundleDone: false }

    // 묶음 하나 끝
    if (this.phase === PHASE.WARMUP) {
      this._nextWarmupStep()
      return { bundleDone: true }
    }

    this.bundleIndex++
    const r = this.round
    if (r && this.bundleIndex < r.bundles) {
      this._startBundle()
      return { bundleDone: true }
    }

    // 라운드 하나 끝 → 얼음으로 숨 고르기 → 다음 라운드
    this.roundIndex++
    this.bundleIndex = 0
    if (this.roundIndex >= this.rounds.length) {
      this._startSuper()
      return { bundleDone: true, roundDone: true }
    }
    this._startFreeze()
    return { bundleDone: true, roundDone: true }
  }

  /**
   * 결과 — 셸의 기록기가 `manifest.metrics`로 걸러 쓴다.
   *
   * **운동 지표는 감지기가 센 것을 그대로 쓴다.** 게임이 "몇 번 눌렀나"를 따로 세면
   * 클리커를 안 켠 상태에서 움직인 것이 빠진다 — 그것도 아이가 실제로 한 운동이다.
   */
  summary(detectorCounts = {}) {
    return {
      score: this.score,
      cleared: this.roundIndex,
      pressed: this.pressed,
      skipped: this.skipped,
      bestCombo: this.bestCombo,
      completed: this.phase === PHASE.DONE,
      ...detectorCounts,
    }
  }
}

/** 결과 화면 한 줄. */
export function cheer(run) {
  if (run.skipped === 0) return '한 번도 안 놓쳤어요! 대단해요'
  if (run.bestCombo >= 10) return `${run.bestCombo}연속! 손발이 착착 맞았어요`
  if (run.pressed >= 40) return '클리커를 정말 많이 눌렀어요'
  return '몸으로 눌렀어요! 다음엔 더 빠르게'
}

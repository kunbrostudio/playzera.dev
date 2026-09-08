// 풍선 팡팡 — 규칙만. **DOM도 카메라도 모른다.**
//
// 기획은 `PLAY_ZERA_BALLOON_FESTIVAL_GAME_PLAN.md`(ken 전달, 2026-09-05).
// 여기는 그 문서의 두 파트(1부 잡기·2부 터뜨리기)를 코드로 옮긴 것이다.
//
// ── 한 판 ────────────────────────────────────────────────────
//
//   1부 BALLOON CATCH  3단계 — 1분 안에 5·10·15개를 붙잡아 바구니에 넣는다
//   (파트 전환 — 축제 장면, 화면 쪽 몫)
//   2부 BALLOON POP    3단계 — 1분 안에 5·10·15개를 터뜨린다
//
// 두 파트가 **같은 `SpriteField`/이동 패턴**을 쓴다(기획서 13장:
// "동일한 카메라 기반 충돌 시스템을 사용"). 다른 것은 손이 오브젝트를
// 만났을 때의 결과뿐이다 — 1부는 붙잡아 옮기고(attach/collect),
// 2부는 그 자리에서 없앤다(pop).
//
// ── 단계는 **개수 목표**로 넘어가고, 시간은 제한이다 ★ ────────
//
// ken 6차 피드백이 이 구조를 확정했다: "1단계로 5개의 풍선으로 진행돼.
// 그래서 1분 안에 5개를 바구니에 담으면 돼. 5개 완료하면 2단계로
// 넘어가는데 2단계는 10개, 완료해서 3단계는 15개로 진행."
//
// 그 전 라운드들이 이 지점에서 헤맸다 — 3차에서 "타이머로 진행하자"를
// **타이머가 클리어 조건**이라는 뜻으로 읽고 quota를 전부 걷어냈고,
// 5차에서는 숫자 5·7·10을 **화면에 뜨는 개수**로 읽었다. 6차에서 ken이
// 문장으로 풀어 준 걸 보면 두 축이 처음부터 따로였다:
//
//   quota        이 단계를 **넘어가는 조건** — 담거나 터뜨릴 개수(5·10·15)
//   timeLimitSec 그걸 해내야 하는 **제한 시간** (1분)
//   count        그 동안 화면에 떠 있는 풍선 수 — 난이도(체감)일 뿐 목표가 아니다
//
// 그래서 타이머는 더 이상 "다 되면 다음 단계"가 아니다. 시간 안에
// 목표를 못 채우면 **실패**다(아래 timeUp). 3차의 "목숨값은 없다"는
// 그대로 지킨다 — 하트를 깎지 않고, 실패는 판 전체가 한 번 끝나는 것뿐이다.
//
// 화면에 뜨는 개수(count)는 5차 요청을 그대로 둔다: "풍선은 너무 많으면
// 아이들이 어지럽고 힘들어 할거야." 목표가 15개라고 15개를 한꺼번에
// 띄우지 않는다 — 담은 만큼 다시 채워지므로(`_spawnUpTo`) 목표는
// 채워지고 화면은 한산하다.
const STAGE_SEC = 60   // 단계마다 1분 (ken: "1분 안에 5개를 바구니에 담으면 돼")
//
// 초 단위·개수 전부 어림값이다(pop-clicker의 `ROUNDS`처럼 **실기기에서
// 조정할 값**) — 특히 CATCH 파트는 "한 번에 하나만 잡는다" 제약이
// 붙어서(아래 참고) 3단계 15개가 1분 안에 되는지 봐야 한다.
//
// ── 3부(바람 곡선 이동)는 MVP에서 단순화했다 ─────────────────
//
// 기획서 1부 STAGE3("부드러운 곡선 이동")은 화면 안을 계속 돌아다니는
// 잡기용 풍선에는 안 맞는 패턴이다(`arcade2d/movement.js`의 CURVE는
// 위로 떠오르며 사라지는 비눗방울류 전용이다). MVP에서는 1부 전
// 스테이지를 DRIFT(등속+가장자리 튕김)로 통일하고, 속도·개수만
// 스테이지별로 올린다 — "곡선 이동" 질감은 다음 다듬기 대상이다.

import { PATTERN } from '../arcade2d/movement.js'
import { SpriteField } from '../arcade2d/spriteField.js'

export const PART = { CATCH: 'catch', POP: 'pop', DONE: 'done' }

// count는 STEP 76 후속에서 ken 요청으로 올렸다("풍선은 처음부터 많이
// 보여줘도 될 거 같아") — 원래 값(1~5개, 아래 주석)은 한산해서 화면이
// 심심했다. r(반지름)은 3차 피드백에서 다시 키웠다("풍선 크기는 더
// 키워주고") — 원래 값도 주석으로 남긴다. 여전히 둘 다 어림값이다.
//
// quota(목표)는 ken이 6차에서 준 값이다 — 5 → 10 → 15, 두 파트 다 같다.
// count(화면에 뜨는 수)는 5차의 "어지럽다" 요청을 그대로 지킨다(5·7·10).
// 풍선이 커질수록 화면이 빨리 차므로 count가 늘 때 r을 조금씩 줄인다 —
// 안 줄이면 3단계에서 풍선끼리 겹쳐 어느 게 어느 건지 안 보인다.
/** 1부 — BALLOON CATCH. 3단계, 각 1분 안에 5·10·15개를 바구니에. */
export const CATCH_STAGES = [
  { id: 1, name: '풍선을 담아봐!',      quota: 5,  count: 5,  speed: 0.06, r: 0.135 },
  { id: 2, name: '조금 더 많아졌어!',   quota: 10, count: 7,  speed: 0.09, r: 0.12  },
  { id: 3, name: 'FESTIVAL READY',     quota: 15, count: 10, speed: 0.12, r: 0.105 },
].map(s => ({ ...s, kind: 'balloon', pattern: PATTERN.DRIFT, points: 10, timeLimitSec: STAGE_SEC }))

/** 2부 — BALLOON POP. 3단계, 각 1분 안에 5·10·15개를 터뜨린다. STAGE2만 FLEE. */
export const POP_STAGES = [
  { id: 1, name: 'EASY POP',   quota: 5,  count: 5,  speed: 0.08, r: 0.135, pattern: PATTERN.DRIFT },
  { id: 2, name: 'CHASE POP',  quota: 10, count: 7,  speed: 0.10, r: 0.12,  pattern: PATTERN.FLEE  },
  { id: 3, name: 'POP FEVER',  quota: 15, count: 10, speed: 0.14, r: 0.105, pattern: PATTERN.DRIFT },
].map(s => ({ ...s, kind: 'balloon', points: 10, timeLimitSec: STAGE_SEC }))

const COMBO_BREAK_SEC = 2.5   // 이만큼 아무것도 못 잡거나 못 터뜨리면 콤보가 끊긴다 (어림값)
const HAND_HIT_R = 0.04       // 손 좌표의 충돌 반경 (정규화). 실기기에서 손 크기 보고 조정

export class BalloonFestivalRun {
  constructor({ catchStages = CATCH_STAGES, popStages = POP_STAGES, rng = Math.random, comboBreakSec = COMBO_BREAK_SEC } = {}) {
    this.catchStages = catchStages
    this.popStages = popStages
    this.rng = rng
    this.comboBreakSec = comboBreakSec
    this.field = new SpriteField({ rng })

    this.part = PART.CATCH
    this.stageIndex = 0
    this.collected = 0        // 지금 스테이지에서 모은 개수
    this.popped = 0           // 지금 스테이지에서 터뜨린 개수
    this.totalCollected = 0
    this.totalPopped = 0
    this.score = 0
    this.combo = 0
    this.bestCombo = 0
    this.stageTimeLeft = null
    this.failed = false       // 시간 안에 목표를 못 채워 끝났나
    this._sinceHit = 0

    this._startStage()
  }

  // ── 상태 읽기 ──────────────────────────────────────────────

  get stageList() { return this.part === PART.CATCH ? this.catchStages : this.popStages }
  get stage() { return this.stageList[this.stageIndex] ?? null }
  get stageNo() { return this.stageIndex + 1 }
  get totalStages() { return this.stageList.length }
  get done() { return this.part === PART.DONE }

  /** 이번 단계 목표(없으면 null) — 화면이 "3 / 5"를 그리는 데 쓴다. */
  get quota() { return this.stage?.quota ?? null }

  /** 이번 단계에서 지금까지 해낸 개수. */
  get progress() { return this.part === PART.CATCH ? this.collected : this.popped }

  _startStage() {
    this.collected = 0
    this.popped = 0
    this.combo = 0
    this._sinceHit = 0
    const st = this.stage
    this.stageTimeLeft = st?.timeLimitSec ?? null
    this.field.active.length = 0   // 스테이지가 바뀌면 이전 풍선은 정리하고 새로 채운다
  }

  _spawnUpTo(count, st) {
    while (this.field.count < count) {
      const speed = st.speed * (0.85 + this.rng() * 0.3)   // 스테이지 안에서도 살짝 다르게
      const angle = this.rng() * Math.PI * 2
      this.field.spawn({
        kind: st.kind,
        pattern: st.pattern,
        r: st.r,
        speed,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        points: st.points,
      })
    }
  }

  /**
   * 한 프레임 진행.
   *
   * @param {number} dt 초
   * @param {{left?:{x,y}|null, right?:{x,y}|null}} hands 정규화 좌표
   * @param {{x0,x1,y0,y1}|null} basketRect 1부에서만 쓴다(바구니 영역, 정규화)
   * @returns {{ events: Array<object>, stageCleared?:boolean, partDone?:boolean, gameDone?:boolean }}
   */
  tick(dt, hands = {}, basketRect = null) {
    if (this.done) return { events: [] }
    const st = this.stage
    if (!st) return { events: [] }

    this._spawnUpTo(st.count, st)
    this.field.tick(dt, hands)
    this._sinceHit += dt
    if (this._sinceHit >= this.comboBreakSec) this.combo = 0

    const events = []

    if (this.part === PART.CATCH) {
      // ken 3차 피드백: "풍선 하나만 잡게 설정하자! 여러개 한번에 잡히게
      // 하지마!" — 양손이 동시에 서로 다른 풍선을 잡을 수 있던 걸 막는다.
      // 이미 붙잡힌 풍선이 하나라도 있으면 다른 손은 이번 틱에 새로 못
      // 잡는다. 루프 안에서 즉시 갱신해야(let, 반복문 중간에 true로 바뀜)
      // 같은 프레임에 두 손이 동시에 서로 다른 풍선을 잡는 경우까지 막는다.
      let anyHeld = this.field.active.some(s => s.attachedTo)
      for (const [handKey, point] of Object.entries(hands)) {
        if (!point) continue
        const holding = this.field.active.some(s => s.attachedTo === handKey)
        if (!holding) {
          if (anyHeld) continue
          const s = this.field.attach(handKey, point, HAND_HIT_R)
          if (s) { events.push({ type: 'grab', handKey, id: s.id }); anyHeld = true }
        } else if (basketRect) {
          const s = this.field.collectInBasket(handKey, basketRect)
          if (s) {
            this.collected++; this.totalCollected++
            this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo)
            this._sinceHit = 0
            this.score += s.points
            events.push({ type: 'collect', handKey, gained: s.points, id: s.id })
          }
        }
      }
    } else if (this.part === PART.POP) {
      for (const { handKey, sprite } of this.field.popAtHands(hands, HAND_HIT_R)) {
        this.popped++; this.totalPopped++
        this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo)
        this._sinceHit = 0
        this.score += sprite.points
        events.push({ type: 'pop', handKey, gained: sprite.points })
      }
    }

    // ── 단계 판정 — 목표를 채우면 통과, 시간이 다하면 실패 ★ ──
    //
    // 순서가 중요하다. 시간을 먼저 깎되 **목표 달성을 먼저 본다** —
    // 마지막 남은 하나를 시간이 0이 되는 그 틱에 담았다면 성공이어야
    // 한다. 반대로 두면 다 해놓고 실패로 끝나는 억울한 판이 생긴다.
    if (st.timeLimitSec != null) {
      this.stageTimeLeft = Math.max(0, this.stageTimeLeft - dt)
    }
    const progress = this.part === PART.CATCH ? this.collected : this.popped
    const stageCleared = st.quota != null && progress >= st.quota

    if (!stageCleared) {
      if (st.timeLimitSec != null && this.stageTimeLeft <= 0) {
        // 시간 안에 목표를 못 채웠다 — 판이 여기서 끝난다.
        // 하트를 깎지 않는다(ken 3차: "목숨값 그런것은 없고"). 실패는
        // "한 번 더 도전"으로만 이어진다 — 화면이 안내를 띄우고 게임
        // 인트로로 돌려보낸다(ken 4차 요청, 6차에서 목표 구조가 생기며
        // 비로소 의미가 생겼다).
        this.part = PART.DONE
        this.failed = true
        return { events, timeUp: true, gameDone: true }
      }
      return { events }
    }

    this.stageIndex++
    if (this.stageIndex < this.totalStages) {
      this._startStage()
      return { events, stageCleared: true }
    }

    // 파트 하나 끝
    if (this.part === PART.CATCH) {
      this.part = PART.POP
      this.stageIndex = 0
      this._startStage()
      return { events, stageCleared: true, partDone: true }
    }
    this.part = PART.DONE
    return { events, stageCleared: true, partDone: true, gameDone: true }
  }

  /**
   * 결과 — 셸의 기록기가 `manifest.metrics`로 걸러 쓴다.
   * 왼손/오른손 활동 횟수는 감지기가 아니라 이 게임 자체가 센다
   * (포즈 동작이 아니라 손 좌표 충돌이 지표라서 — `game.js`가 직접 집계).
   */
  summary(handCounts = {}) {
    return {
      score: this.score,
      collected: this.totalCollected,
      popped: this.totalPopped,
      bestCombo: this.bestCombo,
      // 시간 초과로 끝난 판은 **깬 게 아니다.** `part`만 보면 실패도
      // DONE이라 완주로 기록돼 배지·레벨이 잘못 붙는다.
      completed: this.part === PART.DONE && !this.failed,
      ...handCounts,
    }
  }
}

/** 결과 화면 한 줄. */
export function cheer(run) {
  // 시간이 모자라 끝난 판에는 "잘했다"가 아니라 **다음이 있다**고 말한다.
  // 몇 개까지 했는지를 같이 보여줘야 아이가 얼마나 모자랐는지 안다.
  if (run.failed) {
    const goal = run.quota
    return goal ? `조금만 더! ${run.progress}/${goal}개까지 했어요` : '조금만 더 해볼까요?'
  }
  if (run.part === PART.DONE && run.bestCombo >= 15) return `${run.bestCombo}연속 콤보! 손이 빨라졌어요`
  if (run.totalCollected >= 20) return '풍선을 정말 많이 모았어요!'
  if (run.totalPopped >= 30) return '팡팡! 신나게 터뜨렸어요'
  return '오늘도 즐겁게 놀았어요'
}

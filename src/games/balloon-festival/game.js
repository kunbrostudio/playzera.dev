// 풍선 팡팡 — 규칙만. **DOM도 카메라도 모른다.**
//
// 기획은 `PLAY_ZERA_BALLOON_FESTIVAL_GAME_PLAN.md`(ken 전달, 2026-09-05).
// 여기는 그 문서의 두 파트(1부 잡기·2부 터뜨리기)를 코드로 옮긴 것이다.
//
// ── 한 판 ────────────────────────────────────────────────────
//
//   1부 BALLOON CATCH  3레벨 — 5·10·15개를 붙잡아 바구니에 넣는다
//   (파트 전환 — 축제 장면, 화면 쪽 몫)
//   2부 BALLOON POP    3레벨 — 5·10·15개를 터뜨린다
//
// 두 파트가 **같은 `SpriteField`/이동 패턴**을 쓴다. 다른 것은 손이
// 오브젝트를 만났을 때의 결과뿐이다 — 1부는 붙잡아 옮기고(attach/collect),
// 2부는 그 자리에서 없앤다(pop).
//
// ── 레벨은 "정해진 개수를 전부 처리"로만 끝난다 ★ (재구성) ────
//
// STEP 76 계열은 "quota(목표) + timeLimitSec(제한시간) + count(동시
// 노출수, 담을수록 다시 채움)"이었다. 이번 요청은 그 세 축을 걷어내고
// 하나로 합친다 — **레벨 시작 때 quota만큼 딱 한 번 스폰**하고, 그
// 이후로는 절대 다시 안 채운다(담거나 터뜨릴 때마다 화면의 풍선 수가
// quota → quota-1 → … → 0으로 줄어든다). 그래서 "동시 노출 수"라는
// 별도 개념이 없다 — 노출 수는 항상 남은 목표 수와 같다.
//
// 레벨 완료의 source of truth는 **이번 레벨에서 처리한 개수
// (collected/popped) === quota** 하나뿐이다. quota만큼만 스폰하므로
// "화면에 남은 자유 풍선이 0"은 이 조건의 **결과**이지 별도로 검사할
// 필요가 없다 — 두 조건을 따로 관리하면 언젠가 어긋난다.
//
// 시간 제한은 없앴다("정해진 풍선 모두 처리"가 유일한 완료 조건이라
// 타이머가 레벨을 강제로 끝내거나 실패시키면 새 규칙과 충돌한다) —
// 그래서 `failed`/`timeUp` 개념도 함께 걷어냈다. 실기기에서 "너무
// 오래 걸린다"는 피드백이 나오면 그때 다시 넣는다.

import { PATTERN, avoidZone } from '../arcade2d/movement.js'
import { SpriteField } from '../arcade2d/spriteField.js'

export const PART = { CATCH: 'catch', POP: 'pop', DONE: 'done' }

/** 레벨별 목표 개수 — 1부·2부 둘 다 5 → 10 → 15(ken 6차 값 그대로). */
export const PART1_LEVEL_QUOTAS = [5, 10, 15]
export const PART2_LEVEL_QUOTAS = [5, 10, 15]

/**
 * 2부(POP) 시작 시 바구니 안에 **장식용**으로 쌓아 두는 풍선 개수 —
 * 레벨이 올라갈수록(=축제가 끝나가면서) 줄어들다 3레벨엔 빈 바구니가
 * 된다. 게임 지표와 완전히 무관한 연출 값이라 여기 있지만 실제로는
 * `ui/playScreen.js`만 읽는다(장식 풍선은 `SpriteField`에 안 들어가므로
 * `game.js`의 판정 로직은 이 값의 존재 자체를 모른다).
 */
export const PART2_BASKET_DECOR_COUNTS = [10, 5, 0]

// ── 레벨 사이 쉬는 시간(초) ★ (재구성 STEP 96) ─────────────────
//
// ken 요청: "다음 레벨이 너무 즉시 시작돼서 성공을 인식할 시간이 없다."
// LEVEL_CLEAR 배너 → 캐릭터 대사 → 이 시간만큼 숫자 카운트다운(10…4는
// 평범한 숫자, 마지막 3·2·1·START!는 러너 엔진의 기존 카운트다운
// 그림(`runner/ui/cues.js`의 `runCountdown`)을 그대로 재사용한다 —
// 화면·타이밍은 `ui/playScreen.js`가 갖고, 여기는 값만 정본으로 둔다.
export const LEVEL_REST_SECONDS = 10

/**
 * 레벨 클리어 직후 캐릭터가 하는 말 — 인덱스는 방금 깬 레벨(0-based).
 * ken이 준 문구를 톤만 살짝 다듬었다. 마지막 줄(2번, 레벨 3)은 다음
 * 파트/엔딩으로 넘어간다는 걸 알려준다.
 *
 * ── 목표 개수는 문자열에 안 박는다 ★ (STEP 107) ─────────────────
 *
 * DUO(10→20→30)를 붙이면서(STEP 104/105) 이 대사들이 "5개"·"10개"·
 * "15개"를 그대로 문자열에 박아 둔 게 드러났다 — DUO로 플레이하면
 * 실제로는 10개를 모았는데 대사가 "5개를 모았어!"라고 말하는 식으로
 * 어긋난다. 그래서 각 항목을 `(quotas) => string` 함수로 바꿨다 —
 * `quotas`는 그 판이 실제로 쓰는 `run.part1Quotas`/`run.part2Quotas`
 * 배열(모드 설정 `modes.js`에서 온 값, `game.js` 생성자 옵션)이다.
 * 대사가 "지금 막 몇 개를 채웠는지"·"다음엔 몇 개인지"를 하드코딩된
 * 숫자가 아니라 **그 판의 실제 quota**에서 읽으므로, SOLO(5/10/15)든
 * DUO(10/20/30)든 같은 함수가 항상 맞는 숫자를 낸다 — 복제된 숫자가
 * 어디에도 없다(HUD·게임 판정·대사가 전부 `run.quotas` 하나를 본다).
 * 숫자가 없는 줄(마지막 줄들)은 그대로 함수로만 감싸 모양을 맞췄다.
 */
export const PART1_LEVEL_CLEAR_LINES = [
  quotas => `잘했어! 풍선 ${quotas[0]}개를 모두 모았어! 이번에는 풍선 ${quotas[1]}개를 바구니에 담아보자!`,
  quotas => `대단해! 이번에는 마지막으로 풍선 ${quotas[2]}개를 모아보자!`,
  () => '모든 풍선을 모았어! 잠깐 쉬었다가 이제 풍선을 팡팡 터뜨려보자!',
]
export const PART2_LEVEL_CLEAR_LINES = [
  quotas => `멋져! 이번에는 풍선 ${quotas[1]}개를 터뜨려보자!`,
  quotas => `거의 다 왔어! 마지막으로 풍선 ${quotas[2]}개를 터뜨려보자!`,
  // 이 줄(레벨 3=gameDone)은 STEP 100부터 실제로는 안 뜬다 — 화면 없는
  // 배경(짙은 남색 단색)에 이 대사만 떠서 "암전"으로 보였고, 곧이어
  // 나오는 진짜 엔딩 스토리가 이미 같은 내용을 그림과 함께 말한다.
  // `ui/playScreen.js`의 `runLevelTransition()`이 gameDone일 때 이
  // 대사 단계를 건너뛰고 곧장 엔딩으로 간다 — 배열은 레벨 수(3)와
  // 자리를 맞추려고 그대로 두되, 실제 표시는 안 된다.
  () => '축제 준비 완료! 정말 잘했어!',
]

// r(반지름)을 원래 값(0.135 / 0.12 / 0.105, STEP 76 후속 3차 값) 대비
// 20% 줄였다(ken 요청, "실제 플레이 화면의 풍선이 크게 느껴진다") —
// 중간에 한 번 15%(0.85배)를 시도했었지만 그 빌드가 실제 브라우저에
// 반영된 적이 없어서(다른 작업 디렉터리를 보고 있었다, STEP 95 참고)
// 사용자가 실제로 본 크기는 항상 이 **원래 값**이었다. 그래서 15%
// 위에 20%를 또 곱하지 않고, 원래 값 기준으로 다시 20%를 줄인다
// (0.8배). 레벨이 오를수록(풍선 수가 늘수록) 조금씩 더 줄여 겹침을
// 막는 기존 방식은 그대로 둔다.
//
// r은 시각 크기(`playScreen.js`의 `s.r * 200vmin`)와 충돌 판정 반경
// (`s.r + handRadius`, spriteField.js attach/popAt)에 **같은 값**이
// 들어가므로 그림만 작아지고 판정 영역이 그대로 넓게 남는 어긋남은
// 없다 — 시각·판정이 항상 같이 줄어든다.
export const BALLOON_R = [0.108, 0.096, 0.084]

const CATCH_SPEED = [0.06, 0.09, 0.12]
const POP_SPEED = [0.08, 0.10, 0.14]
// 2레벨만 CHASE(손이 가까우면 살짝 피한다) — 기획서의 "레벨이 오를수록
// 더 활발히 움직인다"를 그대로 잇는다.
const POP_PATTERN = [PATTERN.DRIFT, PATTERN.FLEE, PATTERN.DRIFT]

const COMBO_BREAK_SEC = 2.5   // 이만큼 아무것도 못 잡거나 못 터뜨리면 콤보가 끊긴다 (어림값)
const HAND_HIT_R = 0.04       // 손 좌표의 충돌 반경 (정규화). 실기기에서 손 크기 보고 조정

export class BalloonFestivalRun {
  constructor({
    rng = Math.random,
    comboBreakSec = COMBO_BREAK_SEC,
    part1Quotas = PART1_LEVEL_QUOTAS,
    part2Quotas = PART2_LEVEL_QUOTAS,
    // 동시에 붙잡고 있을 수 있는 풍선 수(게임 전체) — SOLO는 1(3차
    // 피드백 "풍선 하나만 잡게"), DUO는 2(플레이어마다 한 개, STEP 105).
    // 한 손이 두 개를 잡는 건 이 값과 무관하게 `SpriteField.attach()`가
    // 이미 막는다.
    maxHeld = 1,
  } = {}) {
    this.rng = rng
    this.comboBreakSec = comboBreakSec
    this.part1Quotas = part1Quotas
    this.part2Quotas = part2Quotas
    this.maxHeld = maxHeld
    this.field = new SpriteField({ rng })

    this.part = PART.CATCH
    this.levelIndex = 0
    this.collected = 0        // 지금 레벨에서 모은 개수
    this.popped = 0           // 지금 레벨에서 터뜨린 개수
    this.totalCollected = 0
    this.totalPopped = 0
    this.score = 0
    this.combo = 0
    this.bestCombo = 0
    this._sinceHit = 0
    // 레벨을 막 깨서 다음 레벨 시작을 기다리는 중인가 — 이 동안은
    // `tick()`이 아무것도 안 한다(스폰도 안 하고 판정도 안 본다).
    // 화면이 LEVEL_CLEAR 배너·대사·Rest 카운트다운을 다 보여준 뒤
    // `startNextLevel()`을 불러야 실제로 다음 레벨이 열린다 — "레벨
    // 완료 순간부터 다음 레벨 시작까지 새 풍선을 만들지 않는다"는
    // 요청을 지키려면 스폰 자체를 이 시점까지 미뤄야 한다.
    this.awaitingNext = false

    this._startLevel()
  }

  // ── 상태 읽기 ──────────────────────────────────────────────

  get quotas() { return this.part === PART.CATCH ? this.part1Quotas : this.part2Quotas }
  /** 이번 레벨 목표(없으면 null) — 화면이 "3 / 5"를 그리는 데 쓴다. */
  get quota() { return this.quotas[this.levelIndex] ?? null }
  get levelNo() { return this.levelIndex + 1 }
  get totalLevels() { return this.quotas.length }
  get done() { return this.part === PART.DONE }

  /** 이번 레벨에서 지금까지 해낸 개수. */
  get progress() { return this.part === PART.CATCH ? this.collected : this.popped }

  _startLevel() {
    this.collected = 0
    this.popped = 0
    this.combo = 0
    this._sinceHit = 0
    this.field.active.length = 0   // 레벨이 바뀌면 이전 풍선은 모두 정리한다

    const quota = this.quota
    if (quota == null) return

    const r = BALLOON_R[this.levelIndex] ?? BALLOON_R[BALLOON_R.length - 1]
    const speed = this.part === PART.CATCH
      ? CATCH_SPEED[this.levelIndex] ?? CATCH_SPEED[CATCH_SPEED.length - 1]
      : POP_SPEED[this.levelIndex] ?? POP_SPEED[POP_SPEED.length - 1]
    const pattern = this.part === PART.CATCH
      ? PATTERN.DRIFT
      : (POP_PATTERN[this.levelIndex] ?? PATTERN.DRIFT)

    // ── 레벨 시작 시 quota만큼 딱 한 번 스폰 ★ ─────────────────
    //
    // 예전 `_spawnUpTo()`는 "화면에 떠 있는 수(count)가 목표(quota)보다
    // 늘 적게" 유지하며 담을 때마다 다시 채웠다. 이번 요청은 그 반대다
    // — 처음부터 quota개를 전부 띄우고, 그 이후로는 **절대 다시 안
    // 채운다**. 그래서 화면의 풍선 수가 quota → quota-1 → … → 0으로
    // 곧장 줄어든다.
    for (let i = 0; i < quota; i++) {
      const spd = speed * (0.85 + this.rng() * 0.3)   // 레벨 안에서도 살짝 다르게
      const angle = this.rng() * Math.PI * 2
      this.field.spawn({
        kind: 'balloon',
        pattern,
        r,
        speed: spd,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        points: 10,
      })
    }
  }

  /**
   * 한 프레임 진행.
   *
   * @param {number} dt 초
   * @param {{left?:{x,y}|null, right?:{x,y}|null}} hands 정규화 좌표
   * @param {{x0,x1,y0,y1}|null} basketRect 1부에서만 쓴다(바구니 영역, 정규화)
   * @returns {{ events: Array<object>, levelCleared?:boolean, clearedLevel?:number, partDone?:boolean, gameDone?:boolean }}
   */
  tick(dt, hands = {}, basketRect = null) {
    if (this.done) return { events: [] }
    if (this.awaitingNext) return { events: [] }   // 다음 레벨 시작 대기 중 — 아무 것도 안 한다
    if (this.quota == null) return { events: [] }

    this.field.tick(dt, hands)

    // ── 바구니 주변 safe zone — 자유 풍선만 ★ ────────────────
    //
    // 1부(CATCH)에서만 의미가 있다(바구니가 그때만 화면에 있다).
    // `attach()`는 이미 붙잡힌 풍선인지만 보고 위치는 안 보므로, 자유
    // 풍선이 바구니 자리를 떠다니다가 손이 (다른 풍선을 넣으려고)
    // 그 자리에 머무는 순간 함께 붙잡혀 버렸다 — 겉보기엔 "잡지도
    // 않았는데 저절로 담긴" 것처럼 보였다. 여백은 풍선 반지름
    // (`s.r`, 레벨마다 다르다) + 손 충돌 반경(HAND_HIT_R) + 여유
    // 조금이다 — 손이 바구니 위에 있어도 자유 풍선과 거리가 항상
    // HAND_HIT_R보다 멀어야 저 우연이 안 생긴다.
    if (this.part === PART.CATCH && basketRect) {
      for (const s of this.field.active) {
        avoidZone(s, basketRect, s.r + HAND_HIT_R + 0.02)
      }
    }

    this._sinceHit += dt
    if (this._sinceHit >= this.comboBreakSec) this.combo = 0

    const events = []

    if (this.part === PART.CATCH) {
      // ken 3차 피드백: "풍선 하나만 잡게 설정하자! 여러개 한번에 잡히게
      // 하지마!" — 양손이 동시에 서로 다른 풍선을 잡을 수 있던 걸 막는다.
      // 이미 붙잡힌 풍선이 하나라도 있으면 다른 손은 이번 틱에 새로 못
      // 잡는다. 루프 안에서 즉시 갱신해야(let, 반복문 중간에 true로 바뀜)
      // 같은 프레임에 두 손이 동시에 서로 다른 풍선을 잡는 경우까지 막는다.
      //
      // STEP 105 — "하나만"을 `maxHeld`(기본 1)로 일반화했다. SOLO는 1이라
      // 예전 `anyHeld`와 완전히 같고, DUO는 2라 두 플레이어가 서로 다른
      // 풍선을 동시에 잡는다. 같은 풍선을 두 손이 같은 틱에 노려도
      // `attach()`가 `attachedTo`를 즉시 써서 두 번째 손은 못 잡는다.
      let heldCount = this.field.active.filter(s => s.attachedTo).length
      for (const [handKey, point] of Object.entries(hands)) {
        if (!point) continue
        const holding = this.field.active.some(s => s.attachedTo === handKey)
        if (!holding) {
          if (heldCount >= this.maxHeld) continue
          const s = this.field.attach(handKey, point, HAND_HIT_R)
          if (s) { events.push({ type: 'grab', handKey, id: s.id }); heldCount++ }
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
        // id·x·y·r을 같이 보낸다 — 화면이 "터진 자리에 색 맞는 Pop FX"를
        // 띄우려면 터진 순간의 위치와 어느 색(=id로 정해짐, assets.js
        // colorFor)인지가 필요하다. 이미 `field.active`에서 빠진 뒤라
        // 이벤트에 안 실으면 화면 쪽에서 되찾을 방법이 없다.
        events.push({ type: 'pop', handKey, gained: sprite.points, id: sprite.id, x: sprite.x, y: sprite.y, r: sprite.r })
      }
    }

    // ── 레벨 판정 — collected/popped === quota 하나만 본다 ★ ──
    //
    // quota만큼만 스폰하므로 "남은 자유 풍선이 0"은 이 조건이 참이 되는
    // 순간과 항상 같은 프레임에 일어난다(다 처리하면 자동으로 화면에
    // 아무것도 안 남는다) — 그래서 두 조건을 따로 검사하지 않고 하나를
    // source of truth로 둔다. 따로 관리하면 언젠가 둘이 어긋난다.
    const progress = this.part === PART.CATCH ? this.collected : this.popped
    const levelCleared = progress >= this.quota
    if (!levelCleared) return { events }

    // ── 여기서는 아직 다음 레벨을 열지 않는다 ★ ────────────────
    //
    // 예전엔 이 지점에서 곧장 `_startLevel()`을 불러 다음 레벨의 풍선을
    // 스폰했다 — 그래서 클리어를 인식할 새도 없이 새 풍선이 떴다(ken
    // 지적). 이제는 `awaitingNext`만 세우고 실제 전환은 `startNextLevel()`
    // 호출 때까지 미룬다 — 화면이 LEVEL_CLEAR 배너·대사·Rest 카운트다운을
    // 다 보여준 뒤에야 부른다. `partDone`/`gameDone`은 **지금 상태
    // 기준으로 미리 계산**해 화면에 알려준다 — 화면이 어떤 다음 화면
    // (레벨 계속/파트 전환/엔딩)을 보여줄지 이 시점에 알아야 한다.
    const clearedLevel = this.levelNo
    this.awaitingNext = true
    const isLastLevelOfPart = this.levelIndex + 1 >= this.quotas.length
    const partDone = isLastLevelOfPart
    const gameDone = partDone && this.part === PART.POP
    return { events, levelCleared: true, clearedLevel, partDone, gameDone }
  }

  /**
   * 그 손이 붙잡고 있던 풍선을 놓는다(STEP 105, DUO에서 한 플레이어가
   * 유예를 넘겨 사라졌을 때). 안 놓으면 그 풍선이 떠난 사람 몫으로
   * 계속 묶여 남은 사람이 못 잡고, 레벨을 영영 못 끝낼 수 있다.
   */
  releaseHand(handKey) {
    this.field.release(handKey)
  }

  /**
   * 화면이 LEVEL_CLEAR 배너·대사·Rest 카운트다운을 전부 보여준 뒤에만
   * 부른다. 이 호출 안에서만 실제로 레벨(또는 파트)이 넘어가고, 다음
   * 레벨의 quota만큼 풍선이 스폰된다 — "0초가 된 뒤에만 startLevel을
   * 부른다"는 요청을 그대로 지킨다. `awaitingNext`가 아니면(중복 호출
   * 등) 아무 것도 안 한다.
   */
  startNextLevel() {
    if (!this.awaitingNext) return
    this.awaitingNext = false

    const nextIndex = this.levelIndex + 1
    if (nextIndex < this.quotas.length) {
      this.levelIndex = nextIndex
      this._startLevel()
      return
    }
    // 이 파트의 마지막 레벨이었다.
    if (this.part === PART.CATCH) {
      this.part = PART.POP
      this.levelIndex = 0
      this._startLevel()
      return
    }
    this.part = PART.DONE   // 2부 마지막 레벨까지 끝 — 스폰 없이 종료
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
      completed: this.part === PART.DONE,
      ...handCounts,
    }
  }
}

/** 결과 화면 한 줄. */
export function cheer(run) {
  if (run.part === PART.DONE && run.bestCombo >= 15) return `${run.bestCombo}연속 콤보! 손이 빨라졌어요`
  if (run.totalCollected >= 20) return '풍선을 정말 많이 모았어요!'
  if (run.totalPopped >= 30) return '팡팡! 신나게 터뜨렸어요'
  return '오늘도 즐겁게 놀았어요'
}

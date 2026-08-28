// 판정 — **순수 함수다.** 캔버스도 three도 모른다.
//
// ── 왜 떼어 두나 ────────────────────────────────────────────
//
// "이 순간 맞았나"는 눈으로 확인하기 가장 어려운 것이다. 화면에서는 스치는 것처럼
// 보였는데 목숨이 줄고, 확실히 피했는데 안 줄기도 한다. 그림과 판정이 섞여 있으면
// 어느 쪽이 틀렸는지 알 수 없다.
//
// 그래서 **상태 하나를 받아 결과 하나를 내는 함수**로 둔다. 합성 값으로 전부 검증된다.
//
// ── 무엇으로 판정하나 ───────────────────────────────────────
//
//   cube        같은 레인에 있으면 맞는다. 점프로는 못 넘는다 — 큐브는 비키는 것이다
//   hurdleLow   낮다. **점프**로 넘는다
//   hurdleWide  위에 걸려 있다. **숙여서** 지나간다
//   poseSign    맞는 **자세**를 잡고 있어야 한다
//   archGate    결승. 맞고 틀리고가 없다
//
// 큐브를 점프로 넘지 못하게 한 것은 규칙을 줄이기 위해서다. 넘을 수 있으면
// 아이는 모든 것에 점프부터 하고, 그러면 좌우 이동이 사라진다 —
// **운동의 종류가 하나로 줄어든다.**

/** 판정 결과 */
export const RESULT = { PASS: 'pass', HIT: 'hit', NONE: 'none' }

/**
 * @param {object} e 코스 이벤트 (`type` · `lane` · `pose`)
 * @param {object} s 캐릭터 상태
 * @param {number} s.lane
 * @param {boolean} s.jumping
 * @param {boolean} s.ducking
 * @param {string|null} s.pose
 * @returns {'pass'|'hit'}
 */
export function judge(e, s) {
  switch (e.type) {
    case 'cube':
      // **점프로는 못 넘는다.** 비키는 것이 이 장애물의 운동이다.
      return s.lane === e.lane ? RESULT.HIT : RESULT.PASS

    case 'hurdleLow':
      return s.jumping ? RESULT.PASS : RESULT.HIT

    case 'hurdleWide':
      return s.ducking ? RESULT.PASS : RESULT.HIT

    case 'poseSign':
      // 자세가 **맞아야** 한다. 아무 자세나 잡으면 통과되면
      // 아이는 아무거나 하고 지나간다 — 운동이 아니라 통과 의식이 된다.
      return s.pose === e.pose ? RESULT.PASS : RESULT.HIT

    case 'archGate':
      return RESULT.PASS

    default:
      return RESULT.PASS
  }
}

/** 이 이벤트가 아이에게 **무엇을 시키나**. 힌트 화살표와 운동 기록이 같이 쓴다. */
export const ACTION = {
  cube: 'side',
  hurdleLow: 'jump',
  hurdleWide: 'duck',
  poseSign: 'pose',
  archGate: null,
}

/**
 * 판을 굴리는 상태 통.
 *
 * **끝까지 못 깨도 기록한다**(`docs/05` 4-1)는 규칙 때문에 점수와 운동량을
 * 따로 센다. 점수는 잘한 정도이고, 운동량은 **움직인 정도**다.
 */
export function createRun({ lives = 5 } = {}) {
  return {
    lives, score: 0, combo: 0, bestCombo: 0,
    passed: 0, hits: 0,
    // 운동량 — `progress/exercises.js`의 이름을 그대로 쓴다.
    // 지표 이름을 여기서 새로 지으면 마이페이지 칸과 어긋난다.
    exercise: { jumps: 0, squats: 0, side_steps: 0, pose_holds: [] },

    /** 이벤트 하나를 처리한다. 이미 처리한 것은 다시 세지 않는다. */
    settle(e, s) {
      if (e.done) return null
      e.done = true
      const r = judge(e, s)

      if (r === RESULT.PASS) {
        this.passed++
        this.combo++
        this.bestCombo = Math.max(this.bestCombo, this.combo)
        // 콤보가 붙을수록 조금씩 더 준다. **점수는 연료가 아니다** —
        // EXP는 아래 운동량에서만 나온다(`CLAUDE.md` 규칙).
        this.score += 100 + Math.min(this.combo, 10) * 10
      } else {
        this.hits++
        this.combo = 0
        this.lives = Math.max(0, this.lives - 1)
      }
      return r
    },

    /**
     * 몸을 움직인 것만 센다.
     *
     * 판정과 **따로** 부른다. 피하려다 늦어서 맞았어도 **몸은 움직였다** —
     * 그건 운동이다. 판정에 묶으면 서툰 아이의 운동량이 통째로 사라진다.
     */
    record(kind, pose = null) {
      if (kind === 'jump') this.exercise.jumps++
      else if (kind === 'duck') this.exercise.squats++
      else if (kind === 'side') this.exercise.side_steps++
      else if (kind === 'pose' && pose) this.exercise.pose_holds.push(pose)
    },

    get over() { return this.lives <= 0 },
  }
}

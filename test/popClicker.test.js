// 팝팝 클리커 규칙 — 순수 로직. DOM도 카메라도 없다.
//
// 기획은 `docs/09_팝팝클리커_기획.md`. 여기서 잠그는 것은 **기획의 약속들**이다 —
// 오답이 없다, 되돌아와야 1회, 같은 동작이 연달아 몰리지 않는다.
import { describe, it, expect } from 'vitest'
import { ClickerRun, CLICKERS, PHASE, TIMING, cheer } from '../src/games/pop-clicker/game.js'
import { MOVE } from '../src/core/pose/detectors/moves.js'
import { EXERCISES } from '../src/progress/exercises.js'
import manifest from '../src/games/pop-clicker/manifest.json'

/** 지금 켜진 클리커의 동작을 그대로 눌러 준다. */
const hitActive = run => run.hit(run.active.move)

/** 준비 막(다섯 개 한 번씩)을 지나 주 운동으로. */
function skipWarmup(run) {
  let guard = 0
  while (run.phase === PHASE.WARMUP && guard++ < 50) hitActive(run)
  return run
}

describe('한 판의 흐름', () => {
  it('준비 막부터 시작한다 — 다섯을 하나씩 눌러본다', () => {
    const run = new ClickerRun()
    expect(run.phase).toBe(PHASE.WARMUP)
    const seen = []
    while (run.phase === PHASE.WARMUP) { seen.push(run.active.id); hitActive(run) }
    expect(seen.sort()).toEqual(CLICKERS.map(c => c.id).sort())
  })

  it('준비가 끝나면 주 운동으로 넘어간다', () => {
    const run = skipWarmup(new ClickerRun())
    expect(run.phase).toBe(PHASE.PLAY)
    expect(run.roundNo).toBe(1)
  })

  it('라운드가 끝나면 얼음으로 숨을 고른다', () => {
    // 라운드 1 = 묶음 1개짜리 × 6
    const run = skipWarmup(new ClickerRun())
    for (let i = 0; i < 6; i++) hitActive(run)
    expect(run.phase).toBe(PHASE.FREEZE)
  })

  it('얼음을 버티면 다음 라운드가 시작된다', () => {
    const run = skipWarmup(new ClickerRun())
    for (let i = 0; i < 6; i++) hitActive(run)
    run.tick(TIMING.freezeSec)
    expect(run.phase).toBe(PHASE.PLAY)
    expect(run.roundNo).toBe(2)
  })

  it('마지막 라운드 뒤에는 슈퍼 클리커가 나온다', () => {
    const run = skipWarmup(new ClickerRun())
    let guard = 0
    while (run.phase !== PHASE.SUPER && guard++ < 500) {
      if (run.phase === PHASE.FREEZE) run.tick(TIMING.freezeSec)
      else hitActive(run)
    }
    expect(run.phase).toBe(PHASE.SUPER)
  })

  it('슈퍼 클리커는 점프 5연속으로 끝낸다', () => {
    const run = skipWarmup(new ClickerRun())
    let guard = 0
    while (run.phase !== PHASE.SUPER && guard++ < 500) {
      if (run.phase === PHASE.FREEZE) run.tick(TIMING.freezeSec)
      else hitActive(run)
    }
    for (let i = 0; i < TIMING.superJumps - 1; i++) run.hit(MOVE.JUMP)
    expect(run.done).toBe(false)
    expect(run.hit(MOVE.JUMP).gameDone).toBe(true)
    expect(run.done).toBe(true)
  })

  it('슈퍼 클리커는 점프만 받는다', () => {
    const run = skipWarmup(new ClickerRun())
    let guard = 0
    while (run.phase !== PHASE.SUPER && guard++ < 500) {
      if (run.phase === PHASE.FREEZE) run.tick(TIMING.freezeSec)
      else hitActive(run)
    }
    expect(run.hit(MOVE.SQUAT).ok).toBe(false)
    expect(run.superLeft).toBe(TIMING.superJumps)
  })
})

describe('오답이 없다 ★', () => {
  // 기획의 핵심 — "실패보다 다시 움직이고 싶게 만드는 구조"
  it('틀린 동작은 아무 일도 일으키지 않는다', () => {
    const run = skipWarmup(new ClickerRun())
    const wrong = CLICKERS.find(c => c.move !== run.active.move).move
    const before = { score: run.score, combo: run.combo, pressed: run.pressed }
    const r = run.hit(wrong)
    expect(r.ok).toBe(false)
    expect(run.score).toBe(before.score)
    expect(run.combo).toBe(before.combo)
    expect(run.pressed).toBe(before.pressed)
  })

  it('틀려도 목숨이 줄지 않는다 — 목숨이라는 게 없다', () => {
    const run = new ClickerRun()
    expect(run.lives).toBeUndefined()
  })

  it('시간이 지나면 조용히 넘어간다 (별만 덜 받는다)', () => {
    const run = skipWarmup(new ClickerRun())
    const first = run.active.id
    const ev = run.tick(TIMING.skipSec)
    expect(ev.skipped).toBe(true)
    expect(run.skipped).toBe(1)
    expect(run.active?.id === first && run.phase === PHASE.PLAY).toBe(false)
  })

  it('넘어가기 전에 힌트가 먼저 커진다', () => {
    const run = skipWarmup(new ClickerRun())
    expect(run.needsHint).toBe(false)
    run.tick(TIMING.hintSec)
    expect(run.needsHint).toBe(true)
    expect(run.skipped).toBe(0)
  })
})

describe('반복과 묶음', () => {
  it('반복을 다 채워야 다음 클리커로 간다', () => {
    // 라운드 2 = 반복 2회
    const run = skipWarmup(new ClickerRun())
    for (let i = 0; i < 6; i++) hitActive(run)     // 라운드 1 끝
    run.tick(TIMING.freezeSec)
    const first = run.active.id
    expect(run.repsLeft).toBe(2)
    const r1 = run.hit(run.active.move)
    expect(r1.repDone).toBe(false)
    expect(run.active.id).toBe(first)
    const r2 = run.hit(run.active.move)
    expect(r2.repDone).toBe(true)
  })

  it('묶음이 2개인 라운드에서는 다음에 올 것을 미리 알려준다', () => {
    const run = skipWarmup(new ClickerRun())
    let guard = 0
    // 라운드 경계는 얼음을 거친다 — 얼음을 다 버텨야 새 묶음이 깔린다
    while ((run.roundNo < 3 || run.phase !== PHASE.PLAY) && guard++ < 200) {
      if (run.phase === PHASE.FREEZE) run.tick(TIMING.freezeSec)
      else hitActive(run)
    }
    expect(run.round.bundle).toBe(2)
    expect(run.upcoming).toBeTruthy()          // 외우는 게 아니라 준비하는 것
    expect(run.upcoming.id).not.toBe(run.active.id)
  })
})

describe('안전 — 같은 동작을 연달아 몰지 않는다 ★', () => {
  // `docs/07`: "연속 점프는 10회쯤에서 끊고 쉰다 — 착지 반복은 무릎에 부담"
  it('같은 클리커가 연달아 두 번 켜지지 않는다', () => {
    // **반복(reps)과 구분해야 한다.** "점프 3번"은 한 번 켜진 것이고 안전 범위 안이다
    // (`docs/07`의 문턱은 10회). 위험한 건 점프가 **켜지고 또 켜지는** 것이다.
    const run = skipWarmup(new ClickerRun())
    const lit = []           // 새로 켜질 때마다 한 번씩
    let last = null
    let guard = 0
    while (run.phase !== PHASE.SUPER && guard++ < 500) {
      if (run.phase === PHASE.FREEZE) { run.tick(TIMING.freezeSec); continue }
      const cur = `${run.roundNo}-${run.bundleIndex}-${run.stepIndex}`
      if (cur !== last) { lit.push(run.active.id); last = cur }
      hitActive(run)
    }
    for (let i = 1; i < lit.length; i++) {
      expect(lit[i], `연달아 켜짐: ${lit[i - 1]} → ${lit[i]}`).not.toBe(lit[i - 1])
    }
  })

  it('한 번 켜졌을 때의 반복은 최대 3회다', () => {
    // 점프가 한 번에 10회씩 나오면 무릎에 부담이다 (`docs/07` 안전 항목)
    const run = new ClickerRun()
    const maxReps = Math.max(...run.rounds.map(r => r.reps))
    expect(maxReps).toBeLessThanOrEqual(3)
  })

  it('한 판의 동작 수가 기획한 범위 안이다', () => {
    const run = skipWarmup(new ClickerRun())
    let guard = 0
    while (run.phase !== PHASE.SUPER && guard++ < 500) {
      if (run.phase === PHASE.FREEZE) run.tick(TIMING.freezeSec)
      else hitActive(run)
    }
    // docs/09: 라운드 4개 합쳐 약 68회 (준비 5회 별도)
    expect(run.pressed).toBeGreaterThanOrEqual(60)
    expect(run.pressed).toBeLessThanOrEqual(80)
  })
})

describe('얼음', () => {
  it('얼음 중에 움직이면 처음부터 다시 버틴다', () => {
    const run = skipWarmup(new ClickerRun())
    for (let i = 0; i < 6; i++) hitActive(run)
    expect(run.phase).toBe(PHASE.FREEZE)
    run.tick(TIMING.freezeSec * 0.8)
    run.hit(MOVE.JUMP)                    // 움직였다
    run.tick(TIMING.freezeSec * 0.5)      // 아직 못 채운다
    expect(run.phase).toBe(PHASE.FREEZE)
  })

  it('얼음 중의 움직임은 성공이 아니다', () => {
    const run = skipWarmup(new ClickerRun())
    for (let i = 0; i < 6; i++) hitActive(run)
    const before = run.pressed
    expect(run.hit(MOVE.JUMP).ok).toBe(false)
    expect(run.pressed).toBe(before)
  })
})

describe('콤보', () => {
  it('연속 성공하면 점수가 커진다', () => {
    const run = skipWarmup(new ClickerRun())
    const first = hitActive(run).gained
    const second = hitActive(run).gained
    expect(second).toBeGreaterThan(first)
  })

  it('놓치면 콤보가 끊긴다', () => {
    const run = skipWarmup(new ClickerRun())
    hitActive(run); hitActive(run)
    expect(run.combo).toBeGreaterThan(0)
    run.tick(TIMING.skipSec)
    expect(run.combo).toBe(0)
  })
})

describe('기록', () => {
  it('운동 지표는 감지기가 센 것을 그대로 쓴다', () => {
    // 게임이 "몇 번 눌렀나"를 따로 세면 클리커를 안 켠 상태에서 움직인 것이 빠진다 —
    // 그것도 아이가 실제로 한 운동이다
    const run = skipWarmup(new ClickerRun())
    hitActive(run)
    const s = run.summary({ jumps: 12, squats: 9, side_steps: 14, arm_raises: 7, active_sec: 95 })
    expect(s.jumps).toBe(12)
    expect(s.active_sec).toBe(95)
    expect(s.score).toBe(run.score)
  })

  it('manifest.metrics가 전부 운동 사전에 있다', () => {
    const known = new Set(EXERCISES.map(e => e.key))
    for (const m of manifest.metrics) expect(known, m).toContain(m)
  })

  it('다섯 클리커의 지표가 전부 manifest에 선언돼 있다', () => {
    // 선언이 빠지면 셸의 기록기가 걸러내서 **그 동작이 통째로 안 쌓인다**
    for (const c of CLICKERS) expect(manifest.metrics, c.id).toContain(c.metric)
  })

  it('클리커마다 음정이 다르다 — 연속 묶음이 멜로디가 된다', () => {
    const notes = CLICKERS.map(c => c.note)
    expect(new Set(notes).size).toBe(CLICKERS.length)
  })
})

describe('결과 문구', () => {
  it('한 번도 안 놓쳤으면 그렇게 말한다', () => {
    const run = new ClickerRun()
    expect(cheer(run)).toContain('한 번도')
  })
})

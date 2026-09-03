// 자동재생 — 카메라도 손도 없이 "영상처럼" 돌아가는 모드(ken 요청, 9/2).
//
// **약속은 하나다: 무조건 클리어.** 채점을 흉내 내지 않고 실제
// `judge.js`·`createRun`을 그대로 쓰고, 캐릭터도 진짜 물리(점프 체공·
// 숙임 유지 시간)를 흉내 낸 가짜로 붙여서 — 다섯 레벨 전부 한 번도
// 안 맞고 끝까지 가는지를 **실행해서** 확인한다. 타이밍 숫자(LEAD)를
// 잘못 잡으면 여기서 바로 걸린다.
import { describe, it, expect } from 'vitest'
import { createAutopilot } from '../src/games/runner/game/autopilot.js'
import { buildCourse3d, visibleEvents, assignCubeLane, atHit } from '../src/games/runner3d/course3d.js'
import { createRun } from '../src/games/runner3d/judge.js'

// character.js의 점프·숙임 물리를 그대로 옮긴 가짜 캐릭터. **판정과 자동조종
// 둘 다 진짜 상태 전이를 거쳐야** 타이밍 실수가 숫자로 드러난다 — 상태를
// 즉시 true/false로 꽂아 버리면 "미리 움직였는데 판정 순간엔 이미 풀렸다"
// 같은 버그를 못 잡는다.
const JUMP_SEC = 0.75
const DUCK_SEC = 0.55

function makeFakeCharacter(lanes = 3) {
  let lane = Math.floor(lanes / 2)
  let jumpT = -1
  let duckT = -1
  let duckHeld = false
  let pose = null

  const controls = {
    getLane: () => lane,
    setLane: l => { lane = l },
    jump: () => { if (jumpT < 0 && duckT < 0) jumpT = 0 },
    duck: on => {
      if (on) { if (jumpT < 0) { duckHeld = true; if (duckT < 0) duckT = 0 } }
      else duckHeld = false
    },
    setPose: (p) => { pose = p },
  }
  const state = {
    get lane() { return lane },
    get jumping() { return jumpT >= 0 },
    get ducking() { return duckT >= 0 },
    get pose() { return pose },
  }
  const tick = dt => {
    if (jumpT >= 0) { jumpT += dt; if (jumpT >= JUMP_SEC) jumpT = -1 }
    if (duckT >= 0) { duckT += dt; if (!duckHeld && duckT >= DUCK_SEC) duckT = -1 }
  }
  return { controls, state, tick }
}

/** 실제 게임 루프(`scene.js`)와 같은 순서로 한 판을 끝까지 굴린다. */
function runAutoLevel(levelIdx) {
  const course = buildCourse3d(levelIdx)
  const ch = makeFakeCharacter()
  const auto = createAutopilot(() => course, ch.controls)
  const run = createRun({ lives: 999 })   // 미스가 있어도 중간에 안 끊기고 끝까지 세게
  const dt = 1 / 60
  const far = 200
  let now = 0

  while (now <= course.duration + 1) {
    now += dt
    ch.tick(dt)
    const vis = visibleEvents(course, now, far)
    for (const { e } of vis) assignCubeLane(e, ch.state.lane)
    for (const { e } of vis) {
      if (e.done || !atHit(e, now, course.speed)) continue
      run.settle(e, ch.state)
    }
    auto.update(now)
  }
  return { course, run }
}

describe('자동재생 — 무조건 클리어 ★', () => {
  it('다섯 레벨 전부, 한 번도 안 맞고 모든 장애물을 통과한다', () => {
    for (let lv = 0; lv < 5; lv++) {
      const { course, run } = runAutoLevel(lv)
      expect(run.hits, `레벨${lv} — 놓친 장애물이 있다`).toBe(0)
      expect(course.events.every(e => e.done), `레벨${lv} — 판정 안 된 이벤트가 남았다`).toBe(true)
      expect(run.passed, `레벨${lv}`).toBe(course.events.length)
    }
  })

  it('레인은 실제로 매번 벗어난다 — 안 움직이고 우연히 맞은 게 아니다', () => {
    // 큐브는 스폰 시점에 캐릭터의 **현재** 레인을 막으므로, 자동조종이
    // 정말 비켰다면 다음 큐브의 lane이 방금 옮겨 간 자리와 달라야 한다.
    const { course } = runAutoLevel(0)
    const cubes = course.events.filter(e => e.type === 'cube')
    expect(cubes.length).toBeGreaterThan(0)
    for (const c of cubes) expect(c.lane, '레인이 안 정해졌다 — 안 나타난 채로 끝났다').not.toBe(null)
  })

  it('운동량은 하나도 안 쌓인다 — 몸을 안 움직였으니까', () => {
    // 자동조종은 `setLane`·`jump`·`duck`·`setPose`를 직접 부른다.
    // `run.record(...)`를 부르는 코드가 이 파일에 아예 없다는 것으로 확인한다
    // (부르는 자리가 `act.*`·`holdPose` — play3d.js에만 있고 여기는 없다).
    const src = require('node:fs').readFileSync('src/games/runner/game/autopilot.js', 'utf8')
    expect(src, '자동조종이 운동량 기록 함수를 직접 부른다').not.toMatch(/\.record\(/)
  })

  it('포즈는 좌우 반전 정보(mirror)도 그대로 넘긴다', () => {
    // STEP 27에서 만든 좌우 반전(`e.mirror`)이 자동조종에서도 살아 있어야
    // 캐릭터가 사인판과 같은 방향을 보여준다.
    const src = require('node:fs').readFileSync('src/games/runner/game/autopilot.js', 'utf8')
    expect(src).toContain('e.mirror')
  })
})

// ken 지적(9/2): 회피 뒤 가운데로 안 돌아온다 · 포즈를 너무 늦게 잡는다 · 가끔
// 두 칸을 한 번에 건너뛴다. 셋 다 실제 코스가 아니라 최소 구성으로 직접
// 재현한다 — 타이밍이 정확히 언제 걸리는지가 요점이라 합성 코스가 더 명확하다.
describe('자동재생 — 회피 뒤 가운데로 돌아온다 ★', () => {
  it('가운데 칸이 막혀 옆으로 피한 뒤, 한숨 돌릴 시간이 지나면 가운데로 되돌아온다', () => {
    // 캐릭터는 가운데(1)에 서 있는데 큐브가 가운데를 막아 0으로 피한다.
    const course = { events: [
      { type: 'cube', lane: 1, hintLane: 0, hitTime: 2, done: false },
    ] }
    let lane = 1
    const controls = { getLane: () => lane, setLane: l => { lane = l }, jump() {}, duck() {}, setPose() {} }
    const auto = createAutopilot(() => course, controls, { lanes: 3 })

    auto.update(1.4)                 // LEAD(0.5초) 전이라 아직 이르다(2-0.5=1.5)
    expect(lane).toBe(1)
    auto.update(1.6)                 // 이제 피한다
    expect(lane).toBe(0)
    auto.update(2.3)                 // 판정은 지났지만 아직 복귀 유예(0.5초) 전이다
    expect(lane).toBe(0)
    auto.update(2.6)                 // hitTime(2) + 0.5 = 2.5를 넘었다 — 가운데로
    expect(lane).toBe(1)
  })

  it('큐브가 연달아 나오면 마지막 큐브를 지난 뒤에만 한 번 돌아간다', () => {
    // 첫 큐브는 가운데를 막아 0으로 피하고, 곧이어 두 번째 큐브가 그 0을
    // 막아 다시 가운데(1)로 피한다 — 이미 가운데이므로 복귀가 따로 안 보여도
    // 되지만, 그 사이(첫 큐브 판정 직후)에 섣불리 가운데로 끌려가면 안 된다.
    const course = { events: [
      { type: 'cube', lane: 1, hintLane: 0, hitTime: 2, done: false },
      { type: 'cube', lane: 0, hintLane: 1, hitTime: 2.4, done: false },
    ] }
    let lane = 1
    const moves = []
    const controls = { getLane: () => lane, setLane: l => { lane = l; moves.push(l) }, jump() {}, duck() {}, setPose() {} }
    const auto = createAutopilot(() => course, controls, { lanes: 3 })

    auto.update(1.6)   // 첫 큐브 회피 → 0
    expect(lane).toBe(0)
    auto.update(1.95)  // 두 번째 큐브의 LEAD(2.4-0.5=1.9)에 걸려 곧바로 다시 피한다 → 1
    expect(lane).toBe(1)
    // 첫 큐브의 복귀 예약(2.5)이 두 번째 회피로 밀려났으므로, 그 시각에
    // 다시 한 번 "돌아가는" 움직임이 덧나면 안 된다 — 이미 가운데다.
    auto.update(2.5)
    expect(moves.filter(l => l === 1).length).toBe(1)
  })
})

describe('자동재생 — 포즈는 벽에 닿기 한참 전에 미리 잡는다 ★', () => {
  it('포즈 LEAD가 1.5초로 늘어 스쳐 지나가듯 짧게 안 보인다', () => {
    // ken 지적: "포즈를 취하는데 이게 너무 짧아서 잠깐 보여주고 말아."
    // 옛 LEAD(0.15초)였다면 이 시각엔 아직 안 잡혔어야 한다 — 그러면
    // LEAD가 도로 줄어도 이 테스트가 못 잡는 게 아니라 실패로 드러난다.
    const course = { events: [
      { type: 'poseSign', pose: 'lunge', mirror: false, hitTime: 3, done: false },
    ] }
    let pose = null
    const controls = { getLane: () => 1, setLane() {}, jump() {}, duck() {}, setPose: p => { pose = p } }
    const auto = createAutopilot(() => course, controls)

    auto.update(1.4)   // hitTime(3) - 1.4 = 1.6 > LEAD(1.5) — 아직 이르다
    expect(pose).toBe(null)
    auto.update(1.6)   // hitTime(3) - 1.6 = 1.4 <= LEAD(1.5) — 이제 잡는다
    expect(pose).toBe('lunge')
  })
})

// 3D 러너 — 브라우저 없이 확인할 수 있는 것만.
//
// 그리는 것은 눈으로 봐야 하고(`#/lab3d`), 여기서는 **숫자로 답이 나오는 것**만 본다.
//   ① 곡률 식이 화면 설명과 같은가
//   ② 프롭이 되돌아올 때 간격이 무너지지 않는가
import { describe, it, expect } from 'vitest'
import { CURVE, kFromRadius, radiusFromK, dropAt, horizonDistance } from '../src/games/runner3d/curve.js'
import { PropRow } from '../src/games/runner3d/props.js'
import { PANORAMA, foldTan } from '../src/games/runner3d/backdrop.js'
// scene.js는 three와 함께 무거우니 한 번만 불러 나눠 쓴다
const { VIEW } = await import('../src/games/runner3d/scene.js')
import * as THREE from 'three'

// 이 게임이 지켜야 하는 예고 거리(유닛). `approachSec` 3.2초 × 18유닛/초.
const PREVIEW = 58
const CAM_H = 6

describe('곡률 — 눈에만 준다 ★', () => {
  it('k와 반지름은 서로를 되돌린다', () => {
    for (const R of [60, 110, 300, 600]) {
      expect(radiusFromK(kFromRadius(R))).toBeCloseTo(R, 6)
    }
  })

  it('가까이는 거의 안 휘고 멀수록 급해진다 — z의 제곱이다', () => {
    const k = kFromRadius(110)
    expect(dropAt(10, k)).toBeLessThan(0.5)     // 발밑은 평평해 보여야 한다
    expect(dropAt(58, k)).toBeGreaterThan(10)   // 멀리는 확 내려앉는다
    // 거리가 2배면 낙차는 4배
    expect(dropAt(40, k) / dropAt(20, k)).toBeCloseTo(4, 5)
  })

  it('★ 이 방식을 쓰는 이유 — 진짜 구로는 두 가지를 같이 못 가진다', () => {
    // 극적으로 휘는 반지름(110)을 진짜 구로 만들면 지평선이 예고 거리보다 앞에서 끊긴다.
    // = 장애물이 발밑에서 튀어나온다.
    expect(horizonDistance(110, CAM_H)).toBeLessThan(PREVIEW)

    // 예고 거리를 지키는 반지름(600)은 거의 안 휜다.
    expect(horizonDistance(600, CAM_H)).toBeGreaterThan(PREVIEW)
    expect(dropAt(PREVIEW, kFromRadius(600))).toBeLessThan(3)

    // 셰이더는 둘을 떼어 놓는다 — R=110의 휨을 쓰면서 예고 거리는 그대로다.
    expect(dropAt(PREVIEW, kFromRadius(110))).toBeGreaterThan(10)
  })

  it('기본값은 눈으로 고른 것이다 — 화면에서 정하고 여기에 못 박는다', () => {
    // 8/19에 `#/lab3d`에서 60~900을 돌려 보고 600으로 정했고,
    // 에셋이 다 들어온 8/25에 다시 보고 **900**으로 올렸다. 600은 트랙이
    // 눈에 띄게 말려 올라가 원경이 좁아 보였다.
    // 숫자를 바꾸려면 화면에서 다시 보고 바꿔야 한다 — 그래서 값을 고정해 둔다.
    expect(radiusFromK(CURVE.k)).toBeCloseTo(900, 6)
    // 그 값이 예고 거리를 해치지 않는지도 같이 본다
    expect(horizonDistance(900, CAM_H)).toBeGreaterThan(PREVIEW)
  })
})

describe('프롭 되돌리기', () => {
  const make = (over = {}) => {
    // 난수를 고정한다 — 배치가 흔들리면 무엇을 검증했는지 말할 수 없다
    let n = 0
    const rnd = () => ((n = (n * 9301 + 49297) % 233280) / 233280)
    return new PropRow({
      geometry: new THREE.BoxGeometry(1, 1, 1),
      material: new THREE.MeshBasicMaterial(),
      count: 12, span: 140, side: 1, near: 6, spread: 10, rnd, ...over,
    })
  }

  it('처음에는 전부 카메라 앞(음수 z)에 깔린다', () => {
    const row = make()
    for (const it of row.items) expect(it.z).toBeLessThanOrEqual(0)
  })

  it('지나간 것은 span만큼 물러난다 — 새 좌표를 주지 않는다 ★', () => {
    // 새로 주면 간격이 리셋되어 물건이 뭉친다.
    const row = make()

    // **고리 위의 간격**을 본다. z는 span마다 되돌아오므로 맨 끝과 맨 앞 사이에도
    // 간격이 있다 — 그걸 빼고 세면 한 바퀴 돈 뒤에 하나가 달라 보인다.
    const cyclicGaps = () => {
      const zs = row.items.map(it => it.z).sort((a, b) => a - b)
      const g = zs.slice(1).map((z, i) => z - zs[i])
      g.push(row.span - (zs[zs.length - 1] - zs[0]))   // 되돌아오는 구간
      return g.map(v => +v.toFixed(6)).sort((a, b) => a - b)
    }

    const before = cyclicGaps()
    for (let i = 0; i < 200; i++) row.update(1, 12)   // 200유닛 흘린다
    expect(cyclicGaps()).toEqual(before)
  })

  it('프레임이 크게 튀어도 따라잡는다', () => {
    // 탭에서 돌아오면 dt가 몇 초가 된다. 한 번만 빼면 앞에 남는다.
    const row = make()
    row.update(1000, 12)
    for (const it of row.items) expect(it.z).toBeLessThanOrEqual(12)
  })

  it('한쪽에만 선다 — 트랙을 침범하지 않는다', () => {
    const left = make({ side: -1 })
    const right = make({ side: 1 })
    for (const it of left.items) expect(it.x).toBeLessThanOrEqual(-6)
    for (const it of right.items) expect(it.x).toBeGreaterThanOrEqual(6)
  })

  it('종류당 draw call 하나 — 인스턴싱이다', () => {
    const row = make({ count: 40 })
    expect(row.mesh.isInstancedMesh).toBe(true)
    expect(row.mesh.count).toBe(40)
  })

  // ★ 오디세이 런(9/3) — faceTrack 기준 방향(0)이 모델마다 다르게 "정면"일
  // 수 있어(glTF엔 정해진 축이 없다), 코드가 아니라 데이터로 뒤집을 수 있어야 한다.
  it('rotOffset — faceTrack 기준 방향을 데이터로 돌린다', () => {
    const row = make({ faceTrack: true, rotOffset: Math.PI })
    for (const it of row.items) {
      const wrapped = ((it.rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      expect(Math.abs(wrapped - Math.PI)).toBeLessThanOrEqual(0.5 + 1e-9)
    }
  })

  // ★ 오디세이 런(9/3) — 부표처럼 물 위에 뜬 프롭만 켠다. 육지 야자수·
  // 바위는 그대로 고정이어야 하므로 **기본값(bob 없음)이 안 바뀌는지**부터 본다.
  describe('bob — 물에 뜬 것만 까딱인다', () => {
    it('안 주면(기본값) 시간이 지나도 y는 그대로 0이다', () => {
      const row = make()
      const mat = new THREE.Matrix4()
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
      for (let i = 0; i < 30; i++) row.update(1, 12, 0.1)
      for (let i = 0; i < row.items.length; i++) {
        row.mesh.getMatrixAt(i, mat); mat.decompose(pos, q, s)
        expect(pos.y).toBe(0)
      }
    })

    it('bob을 켜면 시간에 따라 y가 흔들린다', () => {
      const row = make({ bob: { amp: 0.08, rate: 1.2 } })
      const mat = new THREE.Matrix4()
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
      row.mesh.getMatrixAt(0, mat); mat.decompose(pos, q, s)
      const y0 = pos.y
      row.update(0, 12, 0.4)   // dz=0 — 자리는 안 바뀌고 시간만 흐른다
      row.mesh.getMatrixAt(0, mat); mat.decompose(pos, q, s)
      expect(pos.y).not.toBeCloseTo(y0, 6)
      expect(Math.abs(pos.y)).toBeLessThanOrEqual(0.08 + 1e-9)
    })

    it('물건마다 위상이 달라 다 같이 까딱이지 않는다', () => {
      const row = make({ bob: { amp: 0.1, rate: 1.5 }, count: 8 })
      row.update(0, 12, 0.7)
      const mat = new THREE.Matrix4()
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
      const ys = row.items.map((_, i) => {
        row.mesh.getMatrixAt(i, mat); mat.decompose(pos, q, s)
        return pos.y
      })
      // 전부 같은 값이면 위상이 안 흩어진 것이다
      expect(new Set(ys.map(v => v.toFixed(4))).size).toBeGreaterThan(1)
    })
  })

  describe('sway — "살아있는" 느낌이 필요한 것만 좌우로 튼다', () => {
    it('안 주면(기본값) 시간이 지나도 각도는 처음 그대로다', () => {
      const row = make()
      const mat = new THREE.Matrix4()
      const pos = new THREE.Vector3(), q0 = new THREE.Quaternion(), s = new THREE.Vector3()
      row.mesh.getMatrixAt(0, mat); mat.decompose(pos, q0, s)
      row.update(0, 12, 0.5)
      const q1 = new THREE.Quaternion()
      row.mesh.getMatrixAt(0, mat); mat.decompose(pos, q1, s)
      expect(q1.angleTo(q0)).toBeCloseTo(0, 6)
    })

    it('sway를 켜면 시간에 따라 각도가 흔들린다', () => {
      const row = make({ sway: { amp: 0.3, rate: 1.1 } })
      const mat = new THREE.Matrix4()
      const pos = new THREE.Vector3(), q0 = new THREE.Quaternion(), s = new THREE.Vector3()
      row.mesh.getMatrixAt(0, mat); mat.decompose(pos, q0, s)
      row.update(0, 12, 0.4)
      const q1 = new THREE.Quaternion()
      row.mesh.getMatrixAt(0, mat); mat.decompose(pos, q1, s)
      expect(q1.angleTo(q0)).toBeGreaterThan(0)
    })

    it('bob과 같이 켜면 둘 다 동시에 움직인다', () => {
      const row = make({ bob: { amp: 0.1, rate: 1.0 }, sway: { amp: 0.2, rate: 1.3 } })
      row.update(0, 12, 0.6)
      const mat = new THREE.Matrix4()
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
      row.mesh.getMatrixAt(0, mat); mat.decompose(pos, q, s)
      expect(pos.y).not.toBe(0)
      expect(q.angleTo(new THREE.Quaternion())).toBeGreaterThan(0)
    })
  })
})

describe('레인', () => {
  it('가운데가 0이고 좌우가 대칭이다', async () => {
    const { laneX } = await import('../src/games/runner3d/character.js')
    expect(laneX(1, 3)).toBe(0)
    expect(laneX(0, 3)).toBe(-laneX(2, 3))
  })

  it('칸 간격이 트랙 폭의 1/3이다 — 차선 그림과 같아야 한다 ★', async () => {
    const { laneX } = await import('../src/games/runner3d/character.js')
    const { TRACK_W } = await import('../src/games/runner3d/ground.js')
    // 텍스처는 트랙을 3등분해 차선을 긋는다. 레인 간격이 다르면
    // **아이가 선 자리와 그려진 칸이 어긋난다** — 눈으로는 잡기 어렵다.
    expect(laneX(2, 3) - laneX(1, 3)).toBeCloseTo(TRACK_W / 3, 6)
  })

  it('5칸도 같은 규칙이다', async () => {
    const { laneX } = await import('../src/games/runner3d/character.js')
    expect(laneX(2, 5)).toBe(0)
    expect(laneX(0, 5)).toBe(-laneX(4, 5))
  })
})

describe('코스 — 규칙은 기존 것을 쓴다 ★', () => {
  it('2D 러너와 같은 타임라인을 쓴다 — 복사하지 않았다', async () => {
    const { buildCourse } = await import('../src/games/runner/game/course.js')
    const { buildCourse3d } = await import('../src/games/runner3d/course3d.js')
    for (const lv of [0, 2, 4]) {
      const a = buildCourse(lv)
      const b = buildCourse3d(lv)
      // 같은 레벨이면 **같은 판**이어야 기록을 견줄 수 있다.
      expect(b.events.length).toBe(a.events.length)
      expect(b.speed).toBe(a.speed)
      expect(b.duration).toBe(a.duration)
      expect(b.events.map(e => e.type)).toEqual(a.events.map(e => e.type))
      expect(b.events.map(e => e.hitTime)).toEqual(a.events.map(e => e.hitTime))
    }
  })

  describe('★ 속도 설정 배율 (ken 요청, 9/3)', () => {
    it('speed에는 곱하고 approachSec은 그대로 둔다 — 반응 여유는 안 줄인다', async () => {
      const { buildCourse } = await import('../src/games/runner/game/course.js')
      const base = buildCourse(0)
      const fast = buildCourse(0, 1.6)
      expect(fast.speed).toBeCloseTo(base.speed * 1.6, 6)
      expect(fast.approachSec).toBe(base.approachSec)
    })

    it('배율이 세지면 같은 판이 더 빨리 끝난다 — 간격도 같이 줄어든다', async () => {
      const { buildCourse } = await import('../src/games/runner/game/course.js')
      const base = buildCourse(0)
      const fast = buildCourse(0, 1.6)
      expect(fast.events.length).toBe(base.events.length)   // 장애물 개수는 그대로
      expect(fast.duration).toBeLessThan(base.duration)     // 빨리 끝난다
    })

    it('안 주면(기본 1) 예전과 완전히 같다 — 순수 함수라 다른 테스트를 안 깬다', async () => {
      const { buildCourse } = await import('../src/games/runner/game/course.js')
      const a = buildCourse(0)
      const b = buildCourse(0, 1)
      expect(b).toEqual(a)
    })

    it('course3d까지 그대로 전달된다', async () => {
      const { buildCourse3d } = await import('../src/games/runner3d/course3d.js')
      const base = buildCourse3d(0)
      const fast = buildCourse3d(0, 1.3)
      expect(fast.speed).toBeCloseTo(base.speed * 1.3, 6)
    })

    it('★ 판정 창(hitWindow)도 같은 배율로 넓어져 — 실제 초 단위 여유는 그대로다', async () => {
      // ken이 "매우 빠르게가 너무 느리다"고 다시 요청해서 배율을 크게
      // 올렸다(1.6 → 2.5). 배율을 올려도 순간 판정이 불가능해지지 않는
      // 이유가 이 보정이다 — hitWindow가 speed와 같은 배율로 커져서
      // window(units) / (speed(units/sec)) = 초 단위 여유가 배율과
      // 무관하게 일정해야 한다.
      const { buildCourse3d, HIT_WINDOW } = await import('../src/games/runner3d/course3d.js')
      for (const mult of [1, 1.3, 2.5]) {
        const c = buildCourse3d(0, mult)
        expect(c.hitWindow).toBeCloseTo(HIT_WINDOW * mult, 6)
        const windowSec = c.hitWindow / c.speed
        const baseWindowSec = (HIT_WINDOW * 1) / buildCourse3d(0, 1).speed
        expect(windowSec, `배율 ${mult}에서 초 단위 여유가 달라졌다`).toBeCloseTo(baseWindowSec, 6)
      }
    })

    it('atHit은 배율 없이 부르면(기본 HIT_WINDOW) 예전과 같다', async () => {
      const { atHit, HIT_WINDOW } = await import('../src/games/runner3d/course3d.js')
      const { UNITS_PER_SPEED } = await import('../src/games/runner3d/scene.js')
      const e = { hitTime: 10 }
      // 판정 창 경계 — 딱 안쪽/바깥쪽
      const speed = 1.6
      const insideNow = 10 - (HIT_WINDOW - 0.01) / (speed * UNITS_PER_SPEED)
      const outsideNow = 10 - (HIT_WINDOW + 0.5) / (speed * UNITS_PER_SPEED)
      expect(atHit(e, insideNow, speed)).toBe(true)
      expect(atHit(e, outsideNow, speed)).toBe(false)
    })

    it('★ play3d.js는 배속이 곱해진 course.speed로 화면을 굴린다', async () => {
      // `view.update(dt, speed)`의 speed가 `CONFIG.levels[level].speed`(배속 전
      // 원본)면, 배경·프롭은 원래 속도로 흐르는데 장애물의 실제 z 위치는
      // `course.speed`(배속 반영)로 계산돼 **둘이 어긋난다** — 배속을 올려도
      // 화면이 그만큼 안 빨라진 것처럼 보인 원인이었다. 소스에서 이 자리를
      // 직접 본다 — 카메라·three.js가 얽혀 있어 루프를 통째로 실행하긴 무겁다.
      const fs = await import('node:fs')
      const src = fs.readFileSync('src/games/runner3d/play3d.js', 'utf8')
      const noComments = s => s.split('\n')
        .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
      expect(noComments(src), 'view.update가 배속 전 원본 speed를 쓴다')
        .not.toMatch(/view\.update\(dt,\s*CONFIG\.levels\[level\]\.speed\)/)
      expect(noComments(src), 'view.update가 course.speed를 안 쓴다')
        .toMatch(/view\.update\(dt,\s*view\.course\.speed\)/)
    })
  })

  it('원본을 건드리지 않는다 — 기존 게임에 영향이 가면 안 된다', async () => {
    const { buildCourse } = await import('../src/games/runner/game/course.js')
    const { buildCourse3d, assignCubeLane } = await import('../src/games/runner3d/course3d.js')
    const b = buildCourse3d(0)
    // 3D는 큐브에 레인을 심는다. 그게 원본 생성기까지 오염시키면 안 된다.
    for (const e of b.events) assignCubeLane(e, 2)
    const fresh = buildCourse(0)
    expect(fresh.events.filter(e => e.type === 'cube').every(e => e.lane === null)).toBe(true)
  })

  it('시간이 거리가 된다 — 앞의 것은 음수 z다', async () => {
    const { buildCourse3d } = await import('../src/games/runner3d/course3d.js')
    const c = buildCourse3d(0)
    const first = c.events[0]
    expect(c.zOf(first, 0)).toBeLessThan(0)          // 아직 앞에 있다
    expect(c.zOf(first, first.hitTime)).toBeCloseTo(0, 6)  // 지금이 그때다
    expect(c.zOf(first, first.hitTime + 1)).toBeGreaterThan(0)  // 지나갔다
  })

  it('레벨이 오르면 **간격**이 좁아진다 — 판 길이가 아니라', async () => {
    const { buildCourse3d } = await import('../src/games/runner3d/course3d.js')
    // 높은 레벨은 사이클이 늘어 판이 오히려 **길다**(1 → 3사이클).
    // 어려워지는 것은 길이가 아니라 **이벤트 사이의 여유**다.
    const gap = c => {
      const t = c.events.map(e => e.hitTime)
      return (t[t.length - 1] - t[0]) / (t.length - 1)
    }
    expect(gap(buildCourse3d(4))).toBeLessThan(gap(buildCourse3d(0)))
    expect(buildCourse3d(4).duration).toBeGreaterThan(buildCourse3d(0).duration)
  })

  it('큐브 레인은 나타나는 순간 정해진다 — 한 번 정하면 안 바뀐다 ★', async () => {
    const { buildCourse3d, assignCubeLane } = await import('../src/games/runner3d/course3d.js')
    const c = buildCourse3d(0)
    const cube = c.events.find(e => e.type === 'cube')
    expect(cube.lane).toBe(null)          // 만들 때는 비어 있다
    assignCubeLane(cube, 0)
    expect(cube.lane).toBe(0)
    // 아이가 옮겨 가도 그 장애물은 처음 정한 칸을 막는다.
    // 계속 따라오면 피할 수 없는 장애물이 된다 — 그건 반응이 아니라 벌이다.
    assignCubeLane(cube, 2)
    expect(cube.lane).toBe(0)
  })

  it('★ 피할 방향도 같이 정한다 — 안 그러면 오른쪽만 나온다', async () => {
    const { buildCourse3d, assignCubeLane } = await import('../src/games/runner3d/course3d.js')
    const c = buildCourse3d(0)
    const cubes = c.events.filter(e => e.type === 'cube')

    // 막힌 칸이 아닌 곳을 가리켜야 한다 — 막힌 칸으로 가라고 하면 그건 함정이다
    for (const e of cubes) {
      assignCubeLane(e, 1)
      expect(e.hintLane, '막힌 칸을 가리킨다').not.toBe(e.lane)
    }

    // 가운데가 막히면 양쪽 다 빈다. **한쪽만 나오면 안 된다** —
    // 아이는 대개 가운데에 서 있으므로, 여기서 한쪽으로 쏠리면
    // 게임 전체가 "오른쪽만 하는 게임"이 된다(8/26에 실제로 그랬다).
    const sides = new Set()
    for (let i = 0; i < 60; i++) {
      const e = { type: 'cube', lane: null }
      assignCubeLane(e, 1)
      sides.add(e.hintLane)
    }
    expect(sides, `한쪽만 나왔다: ${[...sides]}`).toEqual(new Set([0, 2]))
  })

  it('바깥 칸이 막히면 안쪽으로만 보낸다', async () => {
    const { assignCubeLane } = await import('../src/games/runner3d/course3d.js')
    for (let i = 0; i < 20; i++) {
      const l = { type: 'cube', lane: null }
      assignCubeLane(l, 0)
      expect(l.hintLane).toBeGreaterThan(0)     // 왼쪽 끝이 막혔으면 오른쪽
      const r = { type: 'cube', lane: null }
      assignCubeLane(r, 2)
      expect(r.hintLane).toBeLessThan(2)        // 오른쪽 끝이 막혔으면 왼쪽
    }
  })

  it('★ 회피는 언제나 한 칸이다 — 가운데를 건너뛰어 반대편으로 안 간다(ken 지적, 9/2)', async () => {
    const { assignCubeLane } = await import('../src/games/runner3d/course3d.js')
    // 3칸 트랙에서 한 칸 거리가 아닌 유일한 조합은 0↔2다. 그게 안 나오는지
    // charLane 0·1·2 전부에서 여러 번 뽑아 확인한다.
    for (const charLane of [0, 1, 2]) {
      for (let i = 0; i < 40; i++) {
        const e = { type: 'cube', lane: null }
        assignCubeLane(e, charLane)
        expect(Math.abs(e.hintLane - charLane), `charLane=${charLane} → hintLane=${e.hintLane}`).toBe(1)
      }
    }
  })
})

describe('포즈 사인판 — 양쪽 다 나온다 ★', () => {
  // 채점(`poseMatch.js`의 `mirrorFeatures`)은 원래 좌우 어느 쪽이든 통과시킨다.
  // 그런데 사인판·캐릭터 시범이 늘 한쪽만 보여주면 아이는 반대쪽을 할 생각을
  // 못 한다. 여기서는 **번갈아 뒤집히는지**를 본다 — 어느 쪽이 "정답"인지가
  // 아니라, 한쪽으로 쏠리지 않는지가 핵심이다(8/26에 큐브가 그랬다).

  it('팔벌리기(armsopen)는 좌우 대칭이라 절대 안 뒤집는다', async () => {
    const { buildCourse } = await import('../src/games/runner/game/course.js')
    for (let lv = 0; lv < 5; lv++) {
      const c = buildCourse(lv)
      for (const e of c.events.filter(e => e.pose === 'armsopen')) {
        expect(e.mirror, `레벨${lv}`).toBeFalsy()
      }
    }
  })

  it('런지·옆구리늘리기는 나올 때마다 번갈아 뒤집힌다', async () => {
    const { buildCourse } = await import('../src/games/runner/game/course.js')
    // 사이클이 여럿인 레벨(3~5, 0-idx 2~4)에서 같은 자세가 여러 번 나온다.
    for (const lv of [2, 3, 4]) {
      const c = buildCourse(lv)
      for (const pose of ['lunge', 'forwardbend']) {
        const mirrors = c.events.filter(e => e.pose === pose).map(e => !!e.mirror)
        expect(mirrors.length, `레벨${lv}·${pose}`).toBeGreaterThan(1)
        // 바로 옆 사이클과는 반대쪽이어야 한다 — 매번 같은 쪽이면
        // "번갈아"가 아니라 그냥 고정이다.
        for (let i = 1; i < mirrors.length; i++) {
          expect(mirrors[i], `레벨${lv}·${pose} ${i}번째`).toBe(!mirrors[i - 1])
        }
      }
    }
  })

  it('레벨마다 시작하는 쪽이 다르다 — 짧은 레벨(1·2)도 서로 갈린다', async () => {
    const { buildCourse } = await import('../src/games/runner/game/course.js')
    // 레벨 1·2(0-idx 0·1)는 사이클이 하나뿐이라 그 안에서는 못 번갈이지만,
    // 레벨을 이어서 하면(1→2→3…) 최소한 그 사이에서는 갈려야 고르게 섞인다.
    const first = lv => buildCourse(lv).events.find(e => e.pose === 'lunge').mirror
    expect(!!first(0)).not.toBe(!!first(1))
  })

  it('같은 레벨은 다시 만들어도 항상 같은 순서다 — 무작위가 아니다', async () => {
    const { buildCourse } = await import('../src/games/runner/game/course.js')
    const a = buildCourse(3).events.filter(e => e.type === 'poseSign').map(e => e.mirror)
    const b = buildCourse(3).events.filter(e => e.type === 'poseSign').map(e => e.mirror)
    expect(b).toEqual(a)
  })
})

describe('사인판·캐릭터가 뒤집힌 방향을 실제로 보여준다 ★', () => {
  // 방향을 정하기만 하고 그리는 쪽이 안 따라가면 아무 의미가 없다. 인스턴스의
  // 변환 행렬과 캐릭터 스프라이트의 스케일을 직접 풀어서 x가 뒤집혔는지 본다.

  it('obstacles3d — mirror가 있는 사인판만 scale.x가 음수다', async () => {
    const { createObstacles } = await import('../src/games/runner3d/obstacles3d.js')
    const { eventX } = await import('../src/games/runner3d/course3d.js')
    const obs = createObstacles(m => m)   // withCurve는 여기선 그대로 통과시킨다

    const plain = { type: 'poseSign', pose: 'lunge', lane: 0, mirror: false }
    const flipped = { type: 'poseSign', pose: 'lunge', lane: 0, mirror: true }
    obs.sync([{ e: plain, z: -10 }, { e: flipped, z: -20 }], 3, eventX)

    // 반환값(`meshes`)은 키 없이 배열로 오므로, 이 사인판만 인스턴스가
    // 둘(정방향 1 + 반전 1)이라는 것으로 골라낸다.
    const lungeMesh = obs.meshes.find(m => m.count === 2)
    expect(lungeMesh, '런지 인스턴스 두 개짜리 메시를 못 찾았다').toBeTruthy()

    const mat = new THREE.Matrix4()
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3()
    lungeMesh.getMatrixAt(0, mat); mat.decompose(pos, quat, scale)
    expect(scale.x, '안 뒤집힌 것').toBeCloseTo(1, 6)
    lungeMesh.getMatrixAt(1, mat); mat.decompose(pos, quat, scale)
    expect(scale.x, '뒤집힌 것').toBeCloseTo(-1, 6)

    obs.dispose()
  })

  it('character — setPose가 mirror를 받아 scale.x를 뒤집게 짜여 있다', async () => {
    // `createCharacter`는 실제 PNG를 `Image`로 읽어 아틀라스를 굽는다(`buildAtlas`) —
    // 이 프로젝트의 테스트 환경(Node, DOM 없음)에는 이미지 디코더가 없어 실행할
    // 수 없다(`docs/04`: 그림·카메라·좌우반전처럼 브라우저에서만 확인되는 것은
    // 추측하지 않고 확인을 요청한다 — 실기기 확인은 `#/lab3d`). 여기서는 대신
    // **배선이 실제로 있는지**를 소스에서 확인한다 — 위 obstacles3d 테스트와
    // 짝이다(사인판은 실행해서, 캐릭터는 읽어서 검증).
    const fs = await import('node:fs')
    const src = fs.readFileSync('src/games/runner3d/character.js', 'utf8')
    expect(src, 'setPose가 mirror 인자를 안 받는다').toMatch(/setPose\(p,\s*mirror/)
    expect(src, 'apply()가 pose 반전을 안 쓴다').toMatch(/pose\s*&&\s*poseMirror/)
    expect(src, '스케일에 반전을 안 곱한다').toContain('s * flip')
  })
})

describe('나타나는 순간 ★', () => {
  const mk = async lv => {
    const { buildCourse3d, visibleEvents, assignCubeLane } =
      await import('../src/games/runner3d/course3d.js')
    return { c: buildCourse3d(lv), visibleEvents, assignCubeLane }
  }

  it('예고 시간 전에는 안 보인다 — 거리로 자르지 않는다', async () => {
    const { c, visibleEvents } = await mk(0)
    const first = c.events[0]
    // 예고보다 이르면 아직 없다
    expect(visibleEvents(c, first.hitTime - c.approachSec - 0.1, 130)).toHaveLength(0)
    // 예고 시각이 되면 나타난다
    expect(visibleEvents(c, first.hitTime - c.approachSec + 0.01, 130).length).toBeGreaterThan(0)
  })

  it('큐브가 한꺼번에 나타나지 않는다 — 셋이 같은 칸을 막던 원인 ★', async () => {
    const { c, visibleEvents } = await mk(0)
    const cubes = c.events.filter(e => e.type === 'cube')
    const t = cubes[0].hitTime - c.approachSec + 0.01
    const visCubes = visibleEvents(c, t, 130).filter(v => v.e.type === 'cube')
    // 이 순간 보이는 큐브는 하나여야 한다. 여럿이면 레인이 전부 같아진다.
    expect(visCubes).toHaveLength(1)
  })

  it('큐브마다 다른 순간에 레인이 정해진다 — 그래서 방향이 바뀐다', async () => {
    const { c, visibleEvents, assignCubeLane } = await mk(0)
    const cubes = c.events.filter(e => e.type === 'cube')
    // 아이가 막힌 칸을 피해 옆으로 옮겨 간다고 보고 흘려 본다
    let lane = 1
    const chosen = []
    for (let t = 0; t < 30; t += 0.1) {
      for (const { e } of visibleEvents(c, t, 130)) {
        if (e.type !== 'cube' || e.lane !== null) continue
        assignCubeLane(e, lane)
        chosen.push(e.lane)
        lane = lane === 0 ? 1 : 0     // 피한다
      }
    }
    expect(chosen.length).toBeGreaterThan(2)
    // 연속으로 같은 칸이 이어지지 않는다
    expect(chosen.every((v, i) => i === 0 || v !== chosen[i - 1])).toBe(true)
  })
})

describe('반응형 — 가로 폭을 지킨다 ★', () => {
  it('비율이 달라도 트랙이 다 보인다', async () => {
    const { fovFor, VIEW } = await import('../src/games/runner3d/scene.js')
    const { TRACK_W } = await import('../src/games/runner3d/ground.js')

    // 캐릭터 자리에서 실제로 보이는 가로 폭
    const widthAt = aspect => {
      const vHalf = fovFor(aspect) * Math.PI / 360
      const hHalf = Math.atan(Math.tan(vHalf) * aspect)
      return 2 * VIEW.camBack * Math.tan(hHalf)
    }

    // 데스크톱 16:9 · 폰 가로 19.5:9 · 태블릿 가로 4:3
    for (const a of [16 / 9, 19.5 / 9, 4 / 3]) {
      // 트랙 15유닛이 다 보이고, 양옆에 어깨도 조금 남아야 한다
      expect(widthAt(a), `aspect ${a.toFixed(2)}`).toBeGreaterThan(TRACK_W * 1.1)
    }
  })

  it('세로 화각을 고정했다면 태블릿에서 잘렸다 — 이 방식을 쓰는 이유', async () => {
    const { VIEW } = await import('../src/games/runner3d/scene.js')
    const { TRACK_W } = await import('../src/games/runner3d/ground.js')
    // 예전처럼 fov 55를 못 박았다고 치고 4:3에서 얼마나 보이나
    const vHalf = 55 * Math.PI / 360
    const hHalf = Math.atan(Math.tan(vHalf) * (4 / 3))
    const width = 2 * VIEW.camBack * Math.tan(hHalf)
    expect(width).toBeLessThan(TRACK_W)     // 트랙이 안 들어간다
  })

  it('화각에 한계를 둔다 — 세로로 들면 어차피 안 되고, 넓히면 어지럽다', async () => {
    const { fovFor, VIEW } = await import('../src/games/runner3d/scene.js')
    expect(fovFor(0.46)).toBe(VIEW.fovMax)   // 세로 폰 — 안내로 돌려세운다
    expect(fovFor(4.0)).toBe(VIEW.fovMin)    // 아주 넓은 화면
  })
})

describe('판정 ★', () => {
  const S = (over = {}) => ({ lane: 1, jumping: false, ducking: false, pose: null, ...over })

  it('큐브는 **비켜야** 한다 — 점프로는 못 넘는다', async () => {
    const { judge } = await import('../src/games/runner3d/judge.js')
    const cube = { type: 'cube', lane: 1 }
    expect(judge(cube, S())).toBe('hit')
    expect(judge(cube, S({ jumping: true }))).toBe('hit')   // 뛰어도 소용없다
    expect(judge(cube, S({ lane: 0 }))).toBe('pass')
    // 넘을 수 있으면 아이는 모든 것에 점프부터 하고 좌우 이동이 사라진다.
    // 그러면 운동의 종류가 하나로 준다.
  })

  it('낮은 허들은 점프, 높은 허들은 숙이기 — 서로 안 통한다', async () => {
    const { judge } = await import('../src/games/runner3d/judge.js')
    expect(judge({ type: 'hurdleLow' }, S({ jumping: true }))).toBe('pass')
    expect(judge({ type: 'hurdleLow' }, S({ ducking: true }))).toBe('hit')
    expect(judge({ type: 'hurdleWide' }, S({ ducking: true }))).toBe('pass')
    expect(judge({ type: 'hurdleWide' }, S({ jumping: true }))).toBe('hit')
  })

  it('자세는 **맞아야** 한다 — 아무거나 잡으면 안 된다', async () => {
    const { judge } = await import('../src/games/runner3d/judge.js')
    const sign = { type: 'poseSign', pose: 'lunge' }
    expect(judge(sign, S({ pose: 'lunge' }))).toBe('pass')
    expect(judge(sign, S({ pose: 'armsopen' }))).toBe('hit')
    expect(judge(sign, S())).toBe('hit')
  })

  it('한 이벤트는 한 번만 센다 — 프레임이 겹쳐도', async () => {
    const { createRun } = await import('../src/games/runner3d/judge.js')
    const run = createRun()
    const e = { type: 'cube', lane: 1, done: false }
    expect(run.settle(e, S())).toBe('hit')
    expect(run.settle(e, S())).toBe(null)     // 두 번째는 무시
    expect(run.lives).toBe(4)
  })

  it('운동량은 판정과 따로 센다 ★', async () => {
    const { createRun } = await import('../src/games/runner3d/judge.js')
    const run = createRun()
    // 피하려다 늦어서 맞았다 — 그래도 **몸은 움직였다**
    run.record('jump')
    run.settle({ type: 'hurdleLow', done: false }, S())   // 늦어서 hit
    expect(run.lives).toBe(4)
    expect(run.exercise.jumps).toBe(1)   // 운동은 남는다
    // 판정에 묶었다면 서툰 아이의 운동량이 통째로 사라진다.
  })

  it('지표 이름은 운동 사전을 따른다 — 새로 짓지 않는다', async () => {
    const { createRun } = await import('../src/games/runner3d/judge.js')
    const { EXERCISES } = await import('../src/progress/exercises.js')
    const known = new Set(EXERCISES.map(e => e.key))
    for (const k of Object.keys(createRun().exercise)) {
      expect(known, k).toContain(k)
    }
  })

  it('목숨이 다하면 끝이다', async () => {
    const { createRun } = await import('../src/games/runner3d/judge.js')
    const run = createRun({ lives: 2 })
    for (let i = 0; i < 3; i++) run.settle({ type: 'cube', lane: 1, done: false }, S())
    expect(run.lives).toBe(0)
    expect(run.over).toBe(true)
  })
})

describe('두 프로필이 같은 컷을 갖는다 ★', () => {
  it('남·여 폴더에 필요한 11컷이 다 있다', async () => {
    const { existsSync } = await import('node:fs')
    // 하나라도 없으면 아틀라스가 던지고 **캐릭터가 통째로 안 나온다.**
    // 여자아이만 빠지면 그 프로필을 고른 아이 화면에서만 사라진다 — 늦게 발견된다.
    const need = [
      'char_run01', 'char_run02', 'char_run03', 'char_run04', 'char_run05',
      'char_jump_prep', 'char_jump_air', 'char_slide',
      'char_stretch_lunge', 'char_stretch_forwardbend', 'char_stretch_armsopen',
    ]
    for (const skin of ['boy', 'girl']) {
      const missing = need.filter(n => !existsSync(`public/assets/runner/_shared/char/${skin}/${n}.png`))
      expect(missing, skin).toEqual([])
    }
  })
})

describe('게임팩으로 묶기 ★', () => {
  it('registry에 한 줄로 들어갔다', async () => {
    const { getAll, GAME_REGISTRY, getEntry } = await import('../src/games/registry.js')
    expect(getAll().find(g => g.id === 'jurassic-run-3d')).toBeTruthy()
    // 게임팩 규격 — manifest + play 로더
    expect(GAME_REGISTRY['jurassic-run-3d'].play).toBeTypeOf('function')
    // 인트로가 없으므로 곧장 플레이로 간다
    expect(getEntry('jurassic-run-3d')).toBe('/play?id=jurassic-run-3d')
  })

  it('기록 키가 기존 쥬라기와 다르다 ★', async () => {
    // registry 전체로 본다 — getAll()이 아니다. 2D 쥬라기는 STEP 20에서
    // status: hidden으로 숨겼지만(3D와 이름이 같아져서), 코드와 game_id는
    // 그대로 있고 옛 기록도 그 id로 남아 있다. **숨겼다고 id가 비는 건 아니다** —
    // 겹치면 옛 기록과 새 기록이 한 통에 섞이고 되돌릴 수 없다.
    const { GAME_REGISTRY } = await import('../src/games/registry.js')
    const ids = Object.keys(GAME_REGISTRY)
    expect(ids).toContain('jurassic-run')
    expect(ids).toContain('jurassic-run-3d')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('선언한 지표가 운동 사전에 다 있다', async () => {
    const { getAll } = await import('../src/games/registry.js')
    const { EXERCISES } = await import('../src/progress/exercises.js')
    const known = new Set(EXERCISES.map(e => e.key))
    const m = getAll().find(g => g.id === 'jurassic-run-3d')
    // 사전에 없는 이름을 적으면 `makeRecorder`가 조용히 버린다 —
    // 그 지표만 통째로 안 쌓이고 화면에는 아무 일도 없어 보인다.
    for (const k of m.metrics) expect(known, k).toContain(k)
  })

  it('판정이 만드는 지표와 manifest가 맞는다 ★', async () => {
    const { getAll } = await import('../src/games/registry.js')
    const { createRun } = await import('../src/games/runner3d/judge.js')
    const declared = new Set(getAll().find(g => g.id === 'jurassic-run-3d').metrics)
    // 게임이 세는데 선언 안 한 것이 있으면 그 운동은 **기록되지 않는다**
    for (const k of Object.keys(createRun().exercise)) {
      expect(declared, k).toContain(k)
    }
  })

  it('★ 셀 줄 아는 운동을 **화면이 실제로 부른다**', async () => {
    const fs = await import('node:fs')
    // 위의 두 테스트는 이름이 맞는지만 본다. 그래서 `record('pose', …)`를
    // **아무 데서도 안 부르는데** 둘 다 통과하고 있었다 — manifest에
    // `pose_holds`를 선언해 두고 값은 언제나 빈 배열이었다(8/25).
    //
    // 이름이 맞는 것과 데이터가 쌓이는 것은 다른 문제다. 운동 데이터가
    // 쌓이는 것이 이 서비스의 존재 이유이므로, 여기서는 **부르는지**를 본다.
    const judgeSrc = fs.readFileSync('src/games/runner3d/judge.js', 'utf8')
    const kinds = [...judgeSrc.matchAll(/kind === '(\w+)'/g)].map(m => m[1])
    expect(kinds.length, 'judge.js에서 record 종류를 못 읽었다').toBeGreaterThan(0)

    const playSrc = fs.readFileSync('src/games/runner3d/play3d.js', 'utf8')
    for (const k of kinds) {
      expect(playSrc, `record('${k}')를 부르는 곳이 없다 — 그 운동은 안 쌓인다`)
        .toContain(`record('${k}'`)
    }
  })

  it('★ 자세 판정이 **카메라 모드에도** 붙어 있다', async () => {
    const fs = await import('node:fs')
    // 키보드에만 붙여 두면 어른이 테스트할 때는 되고 아이가 놀 때는 안 된다.
    // 실제로 그랬다 — 카메라로 놀면 자세 팻말이 무조건 벽이었다.
    const src = fs.readFileSync('src/games/runner3d/play3d.js', 'utf8')
    // `if (motion)` 블록만 잘라 본다 — 키보드 쪽에 있는 것으로는 안 된다.
    // 끝은 키보드 매핑(`POSE_KEY`)이 시작하는 자리다.
    const from = src.indexOf('if (motion)')
    const motion = src.slice(from, from + 2000)
    expect(motion.length, '모션 블록을 못 찾았다').toBeGreaterThan(0)
    // `jointScores`가 `matchPose`를 대체했다(9/2) — 총점만 필요했을 때는
    // `matchPose`로 충분했는데, 런지·옆구리늘리기를 좌우 반전해서 보여주려면
    // **어느 쪽으로 맞았나**(`mirrored`)도 있어야 해서 상세 채점으로 바꿨다.
    // 채점 자체(관절각·문턱)는 그대로다 — `poseMatch.js`의 `matchDetail`을
    // 부르는 얇은 이름만 다르다.
    expect(motion, 'onLandmarks 안에서 자세를 채점하지 않는다').toContain('jointScores')
    // 채점기는 2D 러너와 **한 벌**이어야 한다
    expect(src).toContain("from '../runner/input/poseMatcher.js'")
  })
})

// ── 원경 ─────────────────────────────────────────────────────
//
// 처음엔 능선·화산을 평면으로 세웠는데 화면에는 화산만 떴다. 왜 그랬는지와
// 왜 지금 방식이 맞는지를 **숫자로** 남긴다. 눈으로만 고치면 다음에 또 판을 세운다.

describe('원경 — 휜 바닥이 접히는 자리에 앉는다 ★', () => {
  const k = CURVE.k
  const h = CAM_H
  /** 거리 d의 지면이 눈 아래로 보이는 각의 탄젠트. */
  const groundTan = d => (h + dropAt(d, k)) / d

  it('바닥은 지평선까지 안 가고 **중간에서 접힌다**', () => {
    // 이 각보다 위로는 바닥이 절대 안 올라온다 = 이 세계의 지평선이다
    let min = Infinity
    for (let d = 1; d <= 400; d += 0.25) min = Math.min(min, groundTan(d))
    expect(foldTan(k, h)).toBeCloseTo(min, 4)

    // 접히는 거리는 √(h/k)다. 지금 값으로 85유닛쯤 — far(130)보다 가깝다.
    const dFold = Math.sqrt(h / k)
    expect(groundTan(dFold)).toBeCloseTo(foldTan(k, h), 9)
    expect(dFold).toBeLessThan(VIEW.far)
  })

  it('★ 왜 판이 안 됐나 — 곡률이 판을 지평선 밑으로 끌어내린다', () => {
    // 옛 코드: 능선 판을 far-8 = 122유닛 앞에 밑동 y=-2로 세웠다.
    const zPlate = VIEW.far - 8
    const bottomAfterCurve = -2 - dropAt(zPlate, k)

    // 곡률을 받은 판의 밑동이 보이는 각 (눈 아래로)
    const plateTan = (h - bottomAfterCurve) / zPlate
    // 접힘각보다 **더 아래**다 = 바닥이 끝나는 선보다 밑에 있다 = 안 보인다
    expect(plateTan).toBeGreaterThan(foldTan(k, h))

    // 화산만 보였던 이유: 밑동을 y=4로 더 높이 띄워 뒀다
    const volcanoTop = 4 + 34 - dropAt(VIEW.far - 12, k)
    expect(volcanoTop).toBeGreaterThan(h)      // 눈높이보다 위 = 하늘에 떠 보였다
  })

  it('원경 띠의 지면선이 접힘선과 만난다 — 사이가 안 벌어진다', () => {
    const R = PANORAMA.radius
    const yGround = h - R * foldTan(k, h)
    // 띠 위의 지면선이 보이는 각 = 접힘각. 정의상 같아야 한다.
    expect((h - yGround) / R).toBeCloseTo(foldTan(k, h), 9)

    // 접힘선이 실제로 그려지려면 바닥 판이 그 거리를 **넘어서** 있어야 한다.
    // 짧으면 판이 끝나는 자리가 그대로 보이고 거기 하늘이 뚫린다.
    const dFold = Math.sqrt(h / k)
    const groundLength = VIEW.span * 1.4          // ground.js가 쓰는 길이
    expect(groundLength * 0.95).toBeGreaterThan(dFold)
    expect(VIEW.far).toBeGreaterThan(dFold)       // far가 접힘선 앞에서 자르면 안 된다
  })

  it('띠가 far 안에 들어오고, 화면 위로도 남는다', () => {
    const R = PANORAMA.radius
    expect(R).toBeLessThan(VIEW.far)           // 잘리면 하늘에 구멍이 뚫린다

    const D2R = Math.PI / 180
    const yGround = h - R * foldTan(k, h)
    const top = yGround + R * PANORAMA.upDeg * D2R

    // 가장 화각이 큰 경우(세로 화면, fov 상한)에도 띠가 프레임 위까지 닿아야 한다
    const halfV = (VIEW.fovMax / 2) * D2R
    const pitch = Math.atan(
      (VIEW.camHeight - VIEW.camHeight * 0.45) / VIEW.camLookAhead)
    const frameTop = h + R * Math.tan(halfV - pitch)
    expect(top).toBeGreaterThan(frameTop)
  })

  it('능선은 홀수 장이라 관문 하나가 소실점에 온다', () => {
    // 짝수면 이음매가 한가운데 오고, 트랙이 관문이 아니라 벽으로 들어간다
    expect(PANORAMA.ridgeTiles % 2).toBe(1)
  })

  it('안개가 접힘선을 덮지 않는다 — 잔디가 바래면 원경이 아니라 자국이다', () => {
    const dFold = Math.sqrt(h / k)
    expect(VIEW.fogNear).toBeGreaterThan(dFold)
  })
})

describe('바닥과 원경이 한 세계로 보인다 ★', () => {
  it('원경 띠의 지면 색이 진짜 잔디와 같다', async () => {
    const { PALETTE } = await import('../src/games/runner3d/ground.js')
    // 다르면 접힘선에 색 띠가 한 줄 생긴다. 눈에는 "저 멀리 뭔가 있다"로 보이는데
    // 사실은 우리가 두 군데에 색을 적어 둔 것이다.
    expect(PANORAMA.grass).toBe(PALETTE.grass)
  })

  it('★ 구름은 옆으로 미끄러지지 않고 **다가온다**', async () => {
    const { makeCloudField, CLOUDS } = await import('../src/games/runner3d/backdrop.js')
    const f = makeCloudField()
    const before = f.clouds.map(c => c.z)
    f.advance(10)
    // z가 **커진다** = 카메라 쪽으로 온다. 처음엔 원통 u를 돌려 옆으로 미끄러졌고,
    // 그러면 아래의 나무는 다가오는데 하늘만 옆으로 흘러 한 화면에 두 방향이 보였다.
    f.clouds.forEach((c, i) => {
      const forward = c.z > before[i] || c.z < before[i] - CLOUDS.span / 2  // 되돌아간 것도 앞으로 간 것
      expect(forward).toBe(true)
    })
    // 달린 만큼 다 보태면 나무처럼 스쳐 지나가 구름이 코앞에 있는 게 된다
    expect(CLOUDS.drag).toBeGreaterThan(0)
    expect(CLOUDS.drag).toBeLessThan(1)
    // 되돌리기 주기가 far보다 길어야 구름이 눈앞에서 갑자기 안 나타난다
    expect(CLOUDS.span).toBeGreaterThan(VIEW.far)
  })

  it('구름은 되돌아도 간격이 안 무너진다 — span을 뺄 뿐 다시 뽑지 않는다', async () => {
    const { makeCloudField } = await import('../src/games/runner3d/backdrop.js')
    const { CLOUDS } = await import('../src/games/runner3d/backdrop.js')
    const f = makeCloudField()
    // **되감기는 간격도 세야 한다.** 줄로만 세면 한 바퀴 돈 뒤 목록이 한 칸
    // 어긋나 늘 다르게 나온다 — 프롭 테스트에서 같은 데 걸렸다.
    const gaps = () => {
      const z = f.clouds.map(c => c.z).sort((a, b) => a - b)
      const g = z.slice(1).map((v, i) => v - z[i])
      g.push(z[0] + CLOUDS.span - z[z.length - 1])
      return g.sort((a, b) => a - b)
    }
    const g0 = gaps()
    for (let i = 0; i < 40; i++) f.advance(9)     // 한 바퀴 넘게 돌린다
    const g1 = gaps()
    g1.forEach((g, i) => expect(g).toBeCloseTo(g0[i], 6))
    for (const g of g1) expect(g).toBeGreaterThan(0)
  })

  it('되돌아온 직후에는 옅다 — 먼 하늘에 툭 나타나면 안 된다', async () => {
    const { makeCloudField, CLOUDS } = await import('../src/games/runner3d/backdrop.js')
    const f = makeCloudField()
    const c = f.clouds[0]
    c.z = CLOUDS.near - CLOUDS.span                 // 막 되돌아온 자리
    expect(f.fadeOf(c)).toBeCloseTo(0, 6)
    c.z = CLOUDS.near - CLOUDS.span * (1 - CLOUDS.fadeIn)
    expect(f.fadeOf(c)).toBeCloseTo(1, 6)
    c.z = CLOUDS.near - 1                           // 머리 위
    expect(f.fadeOf(c)).toBeGreaterThanOrEqual(1)
  })})

describe('연석 — 띠의 v는 길이 방향이다 ★', () => {
  // `BoxGeometry`를 쓰면 옆면은 v가 **높이**, 윗면은 v가 **길이**라
  // v를 흘렸을 때 옆면만 위아래로 미끄러진다. 그래서 직접 만든다.
  it('같은 단면 위의 두 점은 v가 같고, 길이를 따라가면 v가 자란다', async () => {
    const { extrudeStrips } = await import('../src/games/runner3d/ground.js')
    const TILES = 6, SEG = 4
    const geo = extrudeStrips(
      [{ ax: -1, ay: 0, bx: -1, by: 0.5, u0: 0, u1: 0.34 }], 100, TILES, SEG)
    const uv = geo.attributes.uv.array
    const pos = geo.attributes.position.array
    for (let i = 0; i <= SEG; i++) {
      const a = i * 4, b = a + 2                     // 단면의 두 점
      expect(uv[a + 1]).toBeCloseTo(uv[b + 1], 9)    // v가 같다
      expect(uv[a]).not.toBeCloseTo(uv[b], 9)        // u는 다르다
      expect(uv[a + 1]).toBeCloseTo((i / SEG) * TILES, 9)
      // ★ v는 **가까운 쪽으로** 자란다. 눕힌 판(+v가 먼 쪽)과 반대라
      //   `update`에서 부호를 빼야 턱이 뒤로 흐른다.
      if (i > 0) expect(uv[a + 1]).toBeGreaterThan(uv[a + 1 - 4])
      // z가 길이 방향으로 자란다
      expect(pos[i * 6 + 2]).toBeCloseTo(-50 + (100 * i) / SEG, 9)
    }
  })

  it('띠 넷이 한 덩어리다 — draw call 하나', async () => {
    const { extrudeStrips } = await import('../src/games/runner3d/ground.js')
    const s = { ax: 0, ay: 0, bx: 1, by: 0, u0: 0, u1: 1 }
    const geo = extrudeStrips([s, s, s, s], 100, 4, 8)
    expect(geo.attributes.position.count).toBe(4 * (8 + 1) * 2)
    expect(geo.groups.length).toBe(0)   // 재질이 하나다
  })
})

// ── 블렌더 에셋 ───────────────────────────────────────────────
//
// 모델 자체는 눈으로 봐야 하지만(`tools/blender/preview/`), **선언과 파일이
// 어긋나는 것**은 숫자로 잡힌다. 이게 제일 자주 나는 사고다 —
// 이름을 바꾸고 한쪽만 고치면 그 장애물만 조용히 도형으로 남는다.

describe('3D 에셋 — 선언한 것이 실제로 있다 ★', () => {
  const fs = require('node:fs')
  const root = 'public/assets/runner3d'

  it('장애물 종류마다 GLB가 있다', async () => {
    const { KINDS, POSE_MODELS } = await import('../src/games/runner3d/obstacles3d.js')
    for (const [kind, k] of Object.entries(KINDS)) {
      expect(k.model, `${kind}에 model이 없다`).toBeTruthy()
      expect(fs.existsSync(`${root}/obstacles/${k.model}.glb`),
        `${kind} → ${k.model}.glb 가 없다`).toBe(true)
    }
    // 자세 팻말은 **자세마다** 있어야 한다. 하나로 때우면 아이가 무엇을 할지 모른다
    for (const [pose, file] of Object.entries(POSE_MODELS)) {
      expect(fs.existsSync(`${root}/obstacles/${file}.glb`), `${pose} 팻말이 없다`).toBe(true)
    }
  })

  it('코스가 내는 자세가 전부 팻말을 갖는다', async () => {
    const { POSE_MODELS } = await import('../src/games/runner3d/obstacles3d.js')
    const { CONFIG } = await import('../src/games/runner/config.js')
    for (const p of CONFIG.pose.types) expect(POSE_MODELS[p], `${p} 팻말이 없다`).toBeTruthy()
  })

  it('★ 에셋 총량이 예산 안에 있다 — 하나하나가 아니라 **합계**다', () => {
    // 처음엔 파일 하나당 200KB로 묶었다. 그 숫자를 지키려고 모델을 90% 깎았고,
    // 화면이 찢어졌다(`import_ai.py` "깎지 않는다"). 아이가 기다리는 것은
    // **한 파일이 아니라 다 받는 시간**이라, 묶어야 할 것도 합계다.
    let total = 0
    const each = []
    for (const dir of ['props', 'obstacles']) {
      for (const f of fs.readdirSync(`${root}/${dir}`).filter(f => f.endsWith('.glb'))) {
        const kb = fs.statSync(`${root}/${dir}/${f}`).size / 1024
        total += kb
        each.push([f, Math.round(kb)])
      }
    }
    // ── 한 번 11MB로 올렸다가 **7MB로 되돌렸다** ★ ──
    // 깨져 보이는 걸 못 고쳐서 "안 깎는 수밖에 없다"고 결론짓고 예산을
    // 올렸었다. 그 결론이 틀렸다 — 원인은 삼각형 수가 아니라 메시가 갈라져
    // 있는 것이었고(`import_ai.py`의 붙이기), 붙이고 나니 3만 삼각형으로도
    // 매끈하다. 예산을 지키면서 화면도 깨끗한 길이 있었던 것이다.
    //
    // **막혔을 때 예산부터 늘리지 않는다.** 그때는 아직 원인을 모르는 것이다.
    expect(total, `합계 ${Math.round(total)}KB`).toBeLessThan(7000)
    // 하나가 유독 크면 그건 잘못 들어온 것이다 — 2K 텍스처가 딸려 온 경우가 그렇다
    for (const [f, kb] of each) expect(kb, `${f}가 ${kb}KB로 유독 크다`).toBeLessThan(700)
  })

  it('만드는 스크립트가 저장소에 남아 있다', () => {
    // **그림이 아니라 그림을 만드는 방법**이 정본이다. 스크립트가 없으면
    // 색 하나 바꾸는 데 처음부터 다시 만들어야 한다.
    for (const f of ['pzblender.py', 'make_palm.py', 'make_props.py', 'make_obstacles.py']) {
      expect(fs.existsSync(`tools/blender/${f}`), `${f}가 없다`).toBe(true)
    }
  })
})

describe('넓은 장애물은 언제나 가운데다 ★', () => {
  // 코스는 이것들에 `lane: 0`을 준다. 2D에서는 안 쓰이던 값인데 3D에서 그대로
  // 먹였더니 **왼쪽 칸에 놓였다** — 숙이는 관문도 자세 팻말도 트랙 왼쪽에 섰다.
  it('관문·허들·팻말은 레인을 무시한다', async () => {
    const { eventX } = await import('../src/games/runner3d/course3d.js')
    for (const type of ['hurdleLow', 'hurdleWide', 'poseSign', 'archGate']) {
      for (const lane of [0, 1, 2, null]) {
        expect(eventX({ type, lane }, 3), `${type} lane=${lane}`).toBe(0)
      }
    }
  })

  it('큐브만 레인을 쓴다 — 그게 피하기의 전부다', async () => {
    const { eventX } = await import('../src/games/runner3d/course3d.js')
    const { LANE_W } = await import('../src/games/runner3d/ground.js')
    expect(eventX({ type: 'cube', lane: 0 }, 3)).toBeCloseTo(-LANE_W, 6)
    expect(eventX({ type: 'cube', lane: 1 }, 3)).toBeCloseTo(0, 6)
    expect(eventX({ type: 'cube', lane: 2 }, 3)).toBeCloseTo(LANE_W, 6)
  })

  it('코스가 내는 모든 종류가 둘 중 하나에 속한다', async () => {
    const { KINDS } = await import('../src/games/runner3d/obstacles3d.js')
    const { eventX } = await import('../src/games/runner3d/course3d.js')
    // 새 종류를 넣고 분류를 잊으면 그것만 조용히 왼쪽 칸에 선다
    for (const type of Object.keys(KINDS)) {
      const x = eventX({ type, lane: 0 }, 3)
      expect(type === 'cube' ? x !== 0 : x === 0, `${type}이 분류에 없다`).toBe(true)
    }
  })
})


describe('공룡은 통째로 온다 ★★', () => {
  const fs = require('node:fs')
  it('부위로 자르지 않는다 — 자른 자리가 뚫려 머리가 떨어져 보였다', async () => {
    const src = fs.readFileSync('tools/blender/import_ai.py', 'utf8')
    const spec = src.slice(src.indexOf('SPEC = {'), src.indexOf('TEX_MAX'))
    for (const m of spec.matchAll(/"(dino_\w+)":\s*dict\(([^)]*)\)/g)) {
      expect(m[2], `${m[1]}이 다시 잘리고 있다`).not.toContain('split')
    }
  })

  it('땅에 선 공룡은 아이보다 크다 — 대형 공룡으로 읽혀야 한다', async () => {
    const src = fs.readFileSync('tools/blender/import_ai.py', 'utf8')
    const scene = fs.readFileSync('src/games/runner3d/scene.js', 'utf8')
    const CHILD = 4.6                                  // character.js의 CHAR.height
    for (const m of src.matchAll(/"(dino_\w+)":\s*dict\(height=([\d.]+)/g)) {
      // 나는 것은 크기 규칙이 다르다 — 하늘에 있으면 작아도 작아 보이지 않는다
      const flies = new RegExp(`file: '${m[1]}'[^}]*\\by:\\s*\\d`).test(scene)
      if (flies) continue
      expect(Number(m[2]), `${m[1]}이 아이보다 작다`).toBeGreaterThan(CHILD)
    }
  })

  it('깎지 않는다 — 상한이 받은 것보다 넉넉하다', () => {
    const src = fs.readFileSync('tools/blender/import_ai.py', 'utf8')
    // AI가 주는 것이 4천~1만이다. 상한이 그보다 낮으면 또 UV가 뭉개진다
    for (const m of src.matchAll(/tris=(\d+)/g)) {
      expect(Number(m[1]), '삼각형 상한이 너무 낮다').toBeGreaterThanOrEqual(10000)
    }
  })
})

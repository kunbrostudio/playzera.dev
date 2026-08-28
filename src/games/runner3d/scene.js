// 3D 러너의 씬 — **0단계는 도형만.** 진짜 에셋은 3단계에서 들어온다.
//
// ── 예산 (docs/10 §4) ────────────────────────────────────────
//
//   재질 1개 · 실시간 조명 0개 · 그림자 맵 0개 · draw call 20 이하
//
// 조명을 안 쓰는 대신 **버텍스 컬러에 명암을 굽는다.** 0단계에서는 도형이라
// 면마다 색을 조금씩 달리해 흉내만 낸다 — 에셋이 오면 블렌더가 구워서 온다.
//
// ── 바닥이 "하나처럼"의 핵심이다 ─────────────────────────────
//
// 바닥을 움직이지 않는다. **판 하나를 두고 UV만 흘린다.** 지오메트리를 옮기면
// 반드시 이음매가 생기고, 그 이음매를 프롭 흐름과 맞추려는 순간 지금 2D 러너가
// 겪던 "따로 노는" 문제가 그대로 돌아온다.
//
// 프롭은 그 위를 z로 흐르고, 둘이 같은 카메라와 같은 곡률을 본다.
// **속도를 맞추는 코드가 필요 없다** — 같은 `dz`를 받을 뿐이다.

import * as THREE from 'three'
import { CURVE, applyCurve } from './curve.js'
import { PropRow, DinoRow, animateDino } from './props.js'
import { makePlacer, rowSpots } from './layout.js'
import { createGround, TRACK_W, LANE_W } from './ground.js'
import { createBackdrop, createClouds, PANORAMA } from './backdrop.js'
import { loadGeometries, loadParts } from './models.js'
import { createCharacter } from './character.js'
import { playerSkin } from '../../core/playerSkin.js'
import { createObstacles } from './obstacles3d.js'
import { createPortal } from './portal.js'
import { buildCourse3d, visibleEvents, assignCubeLane, eventX, atHit } from './course3d.js'
import { createRun, RESULT } from './judge.js'

/** 화면 좌표를 잴 때 돌려 쓰는 벡터. 프레임마다 새로 만들면 GC가 돈다. */
const _v = new THREE.Vector3()

/**
 * 결승 포털 앞 **몇 유닛부터 가운데로 모으나**(`update` 참고).
 *
 * 26은 속도 0.9에서 2초쯤이다. 더 짧으면 아이가 옆으로 미끄러지는 것이
 * 눈에 띄고, 더 길면 마지막 장애물을 피하는 조작이 안 먹는 것처럼 느껴진다.
 */
const PORTAL_FUNNEL = 26

export const VIEW = {
  camHeight: 6,        // 지면 위 카메라 높이
  camBack: 10,         // 캐릭터 뒤
  camLookAhead: 26,    // 이만큼 앞을 본다
  // **세로 화각이 아니라 가로 폭을 맞춘다** — 아래 `fovFor` 참고
  viewWidth: 19,       // 캐릭터 자리에서 가로로 보이는 세계의 폭(유닛)
  fovMin: 50, fovMax: 70,
  fov: 55,             // 폴백. 실제로는 `fovFor(aspect)`가 정한다
  far: 130,            // 원경 띠(R=116)가 그 안에 들어와야 한다
  // ── 안개를 멀리 미뤘다 ★ ───────────────────────────────────
  // 예전엔 55~120이었다. 안개가 지평선을 감추는 역할을 했기 때문인데, 이제
  // **원경 띠가 지평선을 닫는다.** 안개를 가까이 두면 접힘선 근처 잔디가
  // 하늘색으로 바래고, 그건 원경이 아니라 **바랜 자국**으로 보인다
  // (`CLAUDE.md`: 하늘색을 바닥에 얹지 않는다 — 2D에서 이미 겪었다).
  // 지금 안개가 하는 일은 프롭이 되돌아오는 자리(≈126유닛)를 무르게 하는 것뿐이다.
  // R을 600 → 900으로 올리면서 **접힘선이 85에서 104로 밀려났다**(√(h/k)).
  // 안개를 그대로 88에 두면 접힘선 앞부터 잔디가 바래 원경이 아니라 자국으로
  // 보인다 — 곡률을 바꾸면 안개도 따라가야 한다. 테스트가 이 짝을 지킨다.
  // 원경 띠는 `fog: false`라 안개를 안 받는다. 밀어도 능선은 안 바랜다.
  fogNear: 108,
  fogFar: 138,
  // 하늘색이 아니라 **연한 풀빛**이다. 그리고 잔디보다 조금만 밝다 —
  // 많이 밝으면 안개가 닿는 데부터 바닥이 하얗게 뜬다(8/20에 한 번 그랬다).
  // 잔디가 진짜 `PALETTE.grass`로 나오게 되면서(`ground.js`의 sRGB) 이 값도
  // 같이 내렸다. 안 내리면 안개가 닿는 데부터 바닥이 허옇게 뜬다 —
  // 초록 위의 밝은 색은 원경이 아니라 **바랜 자국**으로 보인다.
  // 잔디(`#3f8a2f`)보다 **조금만** 밝다.
  fogColor: '#4d9e3e',
  span: 140,           // 프롭 되돌리기 주기. far보다 길어야 한다
  laneWidth: LANE_W,
}

/**
 * 화면 비율에 맞는 세로 화각 — **가로 폭을 지킨다.** ★
 *
 * ── 왜 세로 화각을 고정하면 안 되나 ────────────────────────
 *
 * `fov`는 **세로** 화각이다. 고정해 두면 화면이 좁아질수록 가로로 보이는 폭이 준다.
 * 데스크톱 16:9에서 딱 맞게 잡아 두면 태블릿 4:3에서 **트랙 좌우가 잘린다** —
 * 바깥 레인의 장애물이 화면 밖에서 나타난다. 그건 반응이 아니라 운이다.
 *
 * 그래서 반대로 간다. "캐릭터 자리에서 가로 19유닛이 보인다"를 못 박고,
 * 세로 화각은 비율에서 **계산한다.**
 *
 * ── 왜 지금 잡나 ────────────────────────────────────────────
 *
 * 이 값이 **트랙 폭과 프롭 크기를 정한다.** 에셋을 발주한 뒤에 세계 크기가 바뀌면
 * 야자수도 관문도 다 다시 맞춰야 한다. 지금은 한 줄이고, 나중은 그림 전부다.
 *
 * 세로로 든 폰은 이 방법으로도 안 된다(가로 6유닛밖에 안 보인다).
 * 기존 게임들처럼 **가로로 돌려 달라고 안내한다** — 4단계에서 붙인다.
 */
export function fovFor(aspect, v = VIEW) {
  const halfW = v.viewWidth / 2
  const tanH = halfW / v.camBack                 // 가로 반각의 탄젠트
  const fov = 2 * Math.atan(tanH / aspect) * 180 / Math.PI
  return Math.min(v.fovMax, Math.max(v.fovMin, fov))
}

/** 도형에 면마다 다른 밝기를 구워 넣는다 — 조명 없이 입체가 보이게. */
function bakeShade(geo, base, top = 1.25, side = 0.85) {
  const pos = geo.attributes.position
  const normal = geo.attributes.normal
  const col = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const ny = normal.getY(i)
    // 위를 보는 면은 밝게, 옆면은 어둡게. 해가 위에 있다는 것만 말해 주면 된다.
    const k = ny > 0.5 ? top : ny < -0.5 ? side * 0.7 : side
    c.set(base).multiplyScalar(k)
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geo
}

export function createScene(canvas, { dpr = Math.min(2, window.devicePixelRatio || 1) } = {}) {
  // ── 계단현상을 끄고 있었다 ★ ──
  // `antialias: false`에 DPR 상한 1.5. 삼각형을 아무리 늘려도 **모든 모서리가
  // 톱니**로 보였다 — "깨져 보인다"의 절반이 이것이었다.
  // 실측이 60fps에 여유가 있으니 화질 쪽으로 쓴다. 모자라면 그때 내린다.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(dpr)
  // 조명이 없으니 톤매핑도 필요 없다. 색을 그대로 낸다.
  renderer.toneMapping = THREE.NoToneMapping

  const scene = new THREE.Scene()
  // 배경색은 **원경 띠의 윗끝 색과 같게** 둔다. 띠 위로 삐져나오는 하늘이
  // 있어도 이어져 보인다 — 다르면 거기 가로선이 생긴다.
  scene.background = new THREE.Color(PANORAMA.skyTop)
  scene.fog = new THREE.Fog(new THREE.Color(VIEW.fogColor), VIEW.fogNear, VIEW.fogFar)

  const camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.5, VIEW.far)
  camera.position.set(0, VIEW.camHeight, VIEW.camBack)
  camera.lookAt(0, VIEW.camHeight * 0.45, -VIEW.camLookAhead)

  // 곡률 유니폼 — **모두가 이 하나를 공유한다.** 재질마다 값을 두면 바닥과 프롭이
  // 다르게 휘어 물건이 땅에서 뜨거나 파묻힌다.
  const kUniform = { value: CURVE.k }

  // ── 재질 ──
  // 프롭은 버텍스 컬러, 바닥은 텍스처. 어느 것도 조명을 안 받는다.
  const withCurve = m => applyCurve(m, kUniform)
  const propMat = withCurve(new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }))

  // ── 바닥 (잔디 + 트랙) ──
  const ground = createGround(withCurve, VIEW.span * 1.4)
  for (const m of ground.meshes) scene.add(m)

  // ── 원경 (카메라를 감싸는 띠) ──
  // **곡률을 안 받는다.** 판으로 세웠을 때 k·z²만큼 내려앉아 지평선 밑으로
  // 파묻혔다(`backdrop.js` 첫 주석). 대신 곡률이 바뀌면 띠가 통째로 오르내린다.
  const backdrop = createBackdrop({
    camHeight: VIEW.camHeight, camBack: VIEW.camBack, k: kUniform.value,
  })
  scene.add(backdrop.group)

  // 구름은 띠에 안 넣는다 — **다가와서 지나가는 것**이라 곡률을 받아야 한다.
  const clouds = createClouds(withCurve)
  scene.add(clouds.mesh)

  // ── 프롭 ──
  // 도형으로 먼저 세우고, GLB가 오면 **지오메트리만 갈아 끼운다.**
  // 기다렸다 세우면 로딩 동안 세계가 비어 보이고, 에셋이 없는 자리에서
  // 화면이 통째로 죽는다(`models.js`).
  const shapes = {
    palm: bakeShade(new THREE.ConeGeometry(1.6, 6, 6), new THREE.Color('#3f8f3a')),
    rock: bakeShade(new THREE.DodecahedronGeometry(1.5, 0), new THREE.Color('#9a8f7d')),
    fossil_rock: bakeShade(new THREE.DodecahedronGeometry(2.0, 0), new THREE.Color('#b0a08c')),
    rock_footprint: bakeShade(new THREE.DodecahedronGeometry(1.8, 0), new THREE.Color('#bcae98')),
    egg_nest: bakeShade(new THREE.SphereGeometry(1.0, 8, 6), new THREE.Color('#e8d9a8')),
    flower_bush: bakeShade(new THREE.SphereGeometry(1.2, 7, 5), new THREE.Color('#4f9a3c')),
  }

  // 트랙 밖에서 시작한다 — 안쪽으로 들어오면 아이가 장애물과 헷갈린다.
  const edge = TRACK_W / 2 + 1.5

  // 여섯 종류를 **한두 마리씩**. 한 종류를 많이 두는 것보다 여러 종류를 조금씩 두는
  // 편이 같은 draw call로 훨씬 덜 심심하다.
  //
  // 처음엔 종마다 세 마리씩(양쪽 합쳐 36마리) 뒀는데 "너무 많아서 어지럽다"였다.
  // 큰 공룡은 화면을 많이 먹어서 **두 마리만 보여도 무리로 읽힌다.** 숲을 채우는
  // 일은 야자수에게 넘기고 공룡은 가끔 눈에 띄는 쪽이 낫다.
  //
  // `radius`는 발밑이 차지하는 크기다 — 브라키오는 목이 길지 뚱뚱하지 않다.
  const DINOS = [
    // sway·nod는 **몸 크기에 대한 비율**이다(`animateDino`). 0.09면 11유닛짜리가
    // 1유닛쯤 흔들린다 — 살아 있는 게 보이면서 어지럽지는 않은 정도다.
    { file: 'dino_brachio', count: 1, near: edge + 5, spread: 12, speed: 0.8, sway: 0.075, nod: 0.055, radius: 4.5 },
    { file: 'dino_trex', count: 1, near: edge + 3.5, spread: 10, speed: 1.2, sway: 0.085, nod: 0.070, radius: 3.5 },
    { file: 'dino_stego', count: 1, near: edge + 3, spread: 10, speed: 1.0, sway: 0.070, nod: 0.055, radius: 3.2 },
    { file: 'dino_para', count: 1, near: edge + 4.5, spread: 12, speed: 1.0, sway: 0.090, nod: 0.065, radius: 4.0 },
    { file: 'dino_raptor', count: 2, near: edge + 3, spread: 10, speed: 1.5, sway: 0.100, nod: 0.080, radius: 2.6 },
    // 익룡 — **하늘에 띄운다.** 날개를 편 자세라 땅에 두면 넘어진 것처럼 보인다.
    // 높이 있으니 크게 흔들어도 어지럽지 않고, 오히려 나는 것처럼 읽힌다.
    //
    // 두 종류다. 한 종류만 띄웠더니 같은 새가 네 마리 도는 것으로 보였다 —
    // 높이가 다르면 크기 비교가 안 돼서, 종이 하나뿐인 게 땅보다 더 티가 난다.
    // 높이대를 갈라 둔다: 하나는 낮게(9), 하나는 높게(14).
    { file: 'dino_ptero', count: 2, near: edge + 6, spread: 22, speed: 1.8,
      sway: 0.16, nod: 0.20, y: 9, yJitter: 4, radius: 4 },
    { file: 'dino_ptero2', count: 2, near: edge + 9, spread: 24, speed: 2.2,
      sway: 0.18, nod: 0.22, y: 14, yJitter: 4, radius: 4 },
  ]

  const rows = []
  // 큰 것은 멀리·드물게, 작은 것은 가까이·촘촘히. 다 같은 밀도로 두면
  // 근경이 막히고 원경이 텅 빈다.
  //
  // ── 숲은 나무로 만든다 ★ ──
  // 공룡을 늘려 채웠더니 "어지럽다"는 말이 나왔다(8/25). 움직이는 것이 많으면
  // 눈이 쉴 데가 없고, **아이가 봐야 할 곳은 트랙이다.** 배경을 채우는 일은
  // 가만히 서 있는 것들이 해야 한다 — 그래서 야자수와 수풀을 크게 늘리고
  // 공룡은 절반 아래로 줄였다. 밀도는 그대로인데 훨씬 조용하다.
  //
  // `radius`는 겹침 판정용이다(`layout.js`). 실제 모델의 발밑 크기에 맞춘다 —
  // 너무 크게 잡으면 배치기가 자리를 못 찾아 물건이 바깥으로 밀려난다.
  const PROPS = [
    { kind: 'palm', count: 30, near: edge + 2.5, spread: 19, scale: 1.0, radius: 1.7 },
    { kind: 'flower_bush', count: 16, near: edge + 1, spread: 17, scale: 1.0, radius: 1.5 },
    // `faceTrack` — **한 면에만 그림이 있는 것들.** 화석 바위는 뼈가, 발자국
    // 바위는 발자국이 앞면에만 새겨져 있다. 마음껏 돌리면 절반이 뒤를 보여
    // 그냥 갈색 덩어리가 된다(8/25에 실제로 그렇게 보였다).
    { kind: 'fossil_rock', count: 5, near: edge + 4, spread: 14, scale: 1.0, radius: 2.4, faceTrack: true },
    { kind: 'rock_footprint', count: 5, near: edge + 3, spread: 13, scale: 1.0, radius: 2.0, faceTrack: true },
    { kind: 'rock', count: 12, near: edge, spread: 22, scale: 0.9, radius: 1.4 },
    { kind: 'egg_nest', count: 7, near: edge + 0.5, spread: 12, scale: 1.0, radius: 1.5 },
  ]
  // 쪽마다 배치기 하나. 왼쪽과 오른쪽은 트랙이 갈라놔 서로 겹칠 일이 없다.
  const placers = { '-1': makePlacer({ span: VIEW.span }), 1: makePlacer({ span: VIEW.span }) }

  // ── 공룡 자리를 **먼저** 잡는다 ★★ ──
  // 공룡은 GLB를 받은 뒤에야 만들어져(`loadParts`) 언제나 마지막이다. 그런데
  // 야자수 서른 그루를 먼저 깔고 나면 반지름 4.5짜리 브라키오가 들어갈 구멍이
  // 안 남아, 배치기가 포기하고 겹친 자리에 놓는다 — 실측한 여유가 -1.67이었다.
  // **작은 것은 큰 것 사이에 끼지만 반대는 안 된다.** 그래서 자리만 미리 예약해
  // 두고, 모델이 오면 그 자리에 세운다.
  //
  // 하늘도 마찬가지다. 익룡이 한 종류일 때는 자리를 안 챙겼는데, 두 종류가
  // 되면서 서로 겹칠 수 있게 됐다 — 하늘 배치기를 따로 둔다. 땅과 섞지 않는
  // 이유는 높이가 달라 애초에 부딪힐 일이 없기 때문이다.
  const skyPlacers = { '-1': makePlacer({ span: VIEW.span }), 1: makePlacer({ span: VIEW.span }) }
  const dinoSpots = {}
  for (const side of [-1, 1]) {
    for (const d of DINOS) {
      if ((d.y ?? 0) > 0) continue      // 나는 것은 아래에서 따로 잡는다
      dinoSpots[`${d.file}:${side}`] = rowSpots({
        count: d.count, span: VIEW.span, side, near: d.near, spread: d.spread,
        scale: d.scale ?? 1, radius: d.radius ?? 3, placer: placers[side],
        lo: 0.82, hi: 0.36,
      })
    }
    // 하늘 — 큰 것부터라는 규칙은 여기서도 같다
    for (const d of DINOS) {
      if (!(d.y > 0)) continue
      dinoSpots[`${d.file}:${side}`] = rowSpots({
        count: d.count, span: VIEW.span, side, near: d.near, spread: d.spread,
        scale: d.scale ?? 1, radius: d.radius ?? 3, placer: skyPlacers[side],
        lo: 0.82, hi: 0.36,
      })
    }
  }

  for (const side of [-1, 1]) {
    for (const p of PROPS) {
      rows.push(Object.assign(new PropRow({
        geometry: shapes[p.kind] ?? shapes.rock, material: propMat, count: p.count,
        span: VIEW.span, side, near: p.near, spread: p.spread, scale: p.scale,
        placer: placers[side], radius: p.radius, faceTrack: p.faceTrack ?? false,
      }), { kind: p.kind }))
    }
  }
  for (const r of rows) scene.add(r.mesh)

  /**
   * 텍스처를 들고 온 모델은 **자기 재질**을 받는다.
   *
   * 정점 색만 있는 것(스크립트 에셋)은 공용 `propMat`을 그대로 쓴다.
   * 재질이 늘어도 draw call은 안 는다 — draw call은 `InstancedMesh` 개수다.
   * 다만 곡률은 **반드시 우리가 씌운다**. 안 그러면 그 프롭만 안 휜다.
   */
  const matCache = new Map()
  const matFor = geo => {
    const map = geo.userData?.pzMap
    if (!map) return propMat
    if (!matCache.has(map)) {
      // ── 불투명으로 그린다 ★ ──
      // 처음엔 `transparent: true, alphaTest: 0.5`로 뒀다. 그런데 우리가
      // 내보내는 텍스처는 **JPEG라 알파가 없다.** 알파가 없는 그림에 알파
      // 판정을 걸면 얻는 것은 없고, 반투명 정렬 때문에 가장자리가 지저분해진다.
      // 비스듬히 보는 면이 대부분이라 이방성 필터가 크게 먹는다
      map.anisotropy = renderer.capabilities.getMaxAnisotropy()
      map.needsUpdate = true
      matCache.set(map, withCurve(new THREE.MeshBasicMaterial({
        map, vertexColors: false, fog: true,
      })))
    }
    return matCache.get(map)
  }

  // 진짜 모델 — 오는 대로 바꿔 낀다. 안 오면 도형이 그대로 남는다.
  loadGeometries([...new Set(PROPS.map(p => p.kind))]).then(geos => {
    for (const r of rows) {
      const g = geos[r.kind]
      if (!g) continue
      r.mesh.geometry = g            // 도형은 `shapes`가 들고 있다 — 여기서 안 버린다
      r.mesh.material = matFor(g)
      r.mesh.instanceMatrix.needsUpdate = true
    }
  })

  // ── 아기 공룡 ──
  // **살아 있는 것은 이것뿐이다.** 나머지는 서 있고 공룡만 고개를 젓는다 —
  // 다 움직이면 어디를 봐야 할지 모르게 되고, 아이가 봐야 할 곳은 트랙이다.
  const dinos = []
  // 셰이더가 쓰는 시각 — 모두가 하나를 나눠 쓴다
  const dinoTime = { value: 0 }
  // 지금 아이에게 자세를 시키고 있는 팻말. 없으면 `null`.
  let asked = null
  // 제일 가까운, 아직 안 지난 이벤트 (종류 무관). 방향 힌트가 본다.
  let upcoming = null
  for (const d of DINOS) {
    loadParts(d.file).then(parts => {
      if (!parts) return
      // 공룡은 **자기 재질**을 받는다. 흔드는 셰이더가 여기에만 붙기 때문이다 —
      // 공용 재질에 붙이면 야자수도 같이 흔들린다.
      const geo = parts.body.geo
      geo.computeBoundingBox()
      const bb = geo.boundingBox
      const h = bb.max.y - bb.min.y
      const map = geo.userData?.pzMap
      const mat = animateDino(withCurve(new THREE.MeshBasicMaterial(
        map ? { map, fog: true } : { vertexColors: true, fog: true })), {
          time: dinoTime, sway: d.sway ?? 0.08, nod: d.nod ?? 0.06,
          height: h,
          // 끄덕임의 자는 **앞뒤 폭**이다 — 키로 재면 진폭의 일부만 쓴다
          depth: bb.max.z - bb.min.z, zMid: (bb.max.z + bb.min.z) / 2,
          rate: d.speed,
        })
      if (map) map.anisotropy = renderer.capabilities.getMaxAnisotropy()
      for (const side of [-1, 1]) {
        const row = new DinoRow({
          parts, material: mat, count: d.count, span: VIEW.span, side,
          near: d.near, spread: d.spread, scale: d.scale ?? 1,
          headSwing: d.headSwing ?? 0.18, speed: d.speed,
          y: d.y ?? 0, yJitter: d.yJitter ?? 0,
          // 프롭보다 **먼저** 잡아 둔 자리다 — 야자수 안에 티라노가 박히지 않게
          spots: dinoSpots[`${d.file}:${side}`] ?? null,
          placer: placers[side], radius: d.radius ?? 3,
        })
        dinos.push(row)
        for (const m of row.list) scene.add(m)
      }
    })
  }

  // ── 주인공 ──
  // 그림을 불러와야 해서 비동기다. 오기 전에도 세계는 돌아간다 —
  // 캐릭터가 없다고 씬이 멈추면 로딩 중에 화면이 검다.
  let character = null
  createCharacter(withCurve, playerSkin(), 3)
    .then(c => { character = c; scene.add(c.mesh) })
    .catch(e => console.warn('[runner3d] 캐릭터 없음:', e.message))

  // ── 장애물 ──
  const obstacles = createObstacles(withCurve)
  for (const m of obstacles.meshes) scene.add(m)

  // ── 결승 포털 ──
  // 씬에 **한 번만** 붙고 z만 옮긴다. 없는 레벨에서는 `active = false`라
  // 아예 안 그린다.
  const portal = createPortal(withCurve, kUniform)
  scene.add(portal.group)

  // ── 코스 ──
  // 규칙은 기존 `course.js`가 만든다. 여기서는 **시간을 거리로** 바꿀 뿐이다.
  let course = buildCourse3d(0)
  let now = 0            // 코스 시각(초). 판정의 정본이다
  let run = createRun()
  let onResult = null    // (result, event) — 화면이 배너를 띄운다

  let scroll = 0

  return {
    renderer, scene, camera, kUniform,
    get character() { return character },
    get course() { return course },
    get now() { return now },
    get run() { return run },

    /** 레벨을 바꾼다. 시각도 되감는다 — 안 되감으면 새 코스가 이미 지나가 있다. */
    setLevel(i) { course = buildCourse3d(i); now = 0; run = createRun() },

    /** 판정 결과를 받아 화면이 반응한다. 씬은 무엇을 띄울지 모른다. */
    onResult(fn) { onResult = fn },

    /**
     * 캐릭터 **머리 위**가 화면 어디인가 — 판정 글자를 띄울 자리.
     *
     * DOM 연출은 3D를 모르고 씬은 DOM을 모른다. 사이를 잇는 것이 좌표 하나다.
     * 곡률은 `z²`에 비례하는데 캐릭터는 `z = 0`이라 **셰이더가 옮기지 않는다** —
     * 그래서 여기서 곡률을 빼거나 더할 필요가 없다.
     *
     * @returns {{x: number, y: number}|null} 캔버스 기준 CSS 픽셀
     */
    headScreen() {
      if (!character) return null
      const m = character.mesh
      // 스프라이트의 위쪽 모서리. 판 높이 × 배율의 절반을 중심에서 올린다.
      const half = (m.geometry.parameters.height * m.scale.y) / 2
      _v.set(m.position.x, m.position.y + half + 0.35, m.position.z).project(camera)
      const el = renderer.domElement
      return {
        x: (_v.x * 0.5 + 0.5) * el.clientWidth,
        y: (-_v.y * 0.5 + 0.5) * el.clientHeight,
      }
    },

    resize(w, h) {
      renderer.setSize(w, h, false)
      const aspect = w / Math.max(1, h)
      camera.aspect = aspect
      // 가로 폭을 지킨다 — 태블릿·폰마다 비율이 달라도 트랙이 다 보인다
      camera.fov = fovFor(aspect)
      camera.updateProjectionMatrix()
      camera.lookAt(0, VIEW.camHeight * 0.45, -VIEW.camLookAhead)
    },

    /** @param {number} dt 초 @param {number} speed 기존 `CONFIG.levels[].speed` */
    update(dt, speed) {
      const dz = speed * UNITS_PER_SPEED * dt
      scroll += dz
      now += dt

      ground.update(dz)                       // 바닥은 UV만 흐른다
      for (const r of rows) r.update(dz, VIEW.camBack + 4)
      for (const d of dinos) d.update(dz, VIEW.camBack + 4, dt)
      character?.update(dt)
      // 원경의 능선은 **흐르지 않는다.** 달려도 그대로 있는 것이 멀다는 뜻이다.
      dinoTime.value += dt
      backdrop.update(dt)
      // 구름은 나무·돌과 같은 방향으로 다가온다. 다만 달린 만큼 다 보태지는 않는다.
      clouds.update(dz)

      // 화면에 들어온 것만 그린다. 안개 너머는 그릴 이유가 없다.
      const vis = visibleEvents(course, now, VIEW.far)
      // 큐브가 막을 레인은 **나타나는 순간** 정한다 — 미리 정하면
      // "이미 피해 있는데 엉뚱한 방향으로 가라"는 힌트가 뜬다.
      for (const { e } of vis) assignCubeLane(e, character?.lane ?? 1)
      obstacles.sync(vis, 3, eventX)

      // ── 결승 포털 ★ ──
      // 인스턴싱 통에 안 담기므로 여기서 자리를 준다. 지나간 뒤에도 **뒤에
      // 남아 있어야** 통과한 그림이 되므로, 화면 뒤로 넘어가도 안 숨긴다.
      const gate = course.events.find(e => e.type === 'archGate')
      portal.active = !!gate
      if (gate) {
        const gz = course.zOf(gate, now)
        portal.place(gz)
        // 가까울수록 문이 밝아진다 — "여기가 끝이다"를 빛이 먼저 말한다
        portal.update(dt, 1 - Math.min(1, Math.max(0, -gz) / 60))

        // ── 문 앞에서는 **가운데로 데려간다** ★★ ────────────
        //
        // 문은 5.83유닛이고 트랙은 15다. 바깥 레인으로 달려온 아이는 문이
        // 아니라 돌기둥에 박힌다 — 마지막 순간에 "피하기"를 하나 더 시키는
        // 셈이고, 그건 결승선이 아니라 장애물이다.
        //
        // 문을 트랙만큼 넓히는 방법도 있었다. 그러려면 기둥을 바깥으로 밀고
        // 가운데를 늘려야 하는데(`_fit_gate`), 여기 가운데에는 **해골이**
        // 있다. 늘리면 해골이 옆으로 퍼진다.
        //
        // 그래서 규칙을 바꾸는 대신 연출로 푼다. 26유닛 앞부터 조용히 가운데
        // 레인으로 옮긴다 — 보간이 있어서(`laneLerp`) 끌려가는 게 아니라
        // 스스로 달려 들어가는 것처럼 보인다. 판정은 어차피 통과다(`judge.js`).
        if (character && gz > -PORTAL_FUNNEL) character.setLane(1)
      }

      // ── 지금 **무슨 자세를 시키고 있나** ★ ──
      // 카메라 모드의 자세 판정이 이걸 본다(`play3d.js`). 세 자세를 매 프레임
      // 다 채점하지 않는 이유는 두 가지다 — 값이 세 배로 들고, 무엇보다
      // **아무 자세나 맞으면 통과**가 되어 버린다. 아이가 아무거나 하고
      // 지나가면 그건 운동이 아니라 통과 의식이다(`judge.js`).
      //
      // `course.events`가 시간순이라 먼저 걸리는 것이 제일 가까운 팻말이다.
      asked = null
      upcoming = null
      for (const { e } of vis) {
        if (e.done) continue
        // 제일 가까운 **안 지난** 이벤트. 방향 힌트가 이걸 본다(`ui/cues.js`).
        if (!upcoming) upcoming = e
        if (e.type === 'poseSign') { asked = e; break }
      }

      // 판정 — **캐릭터를 지나는 순간 한 번.** 이벤트가 `done`을 들고 있어
      // 프레임이 여럿 겹쳐도 한 번만 센다.
      if (character) {
        const st = {
          lane: character.lane,
          jumping: character.jumping,
          ducking: character.ducking,
          pose: character.posing,
        }
        for (const { e } of vis) {
          if (e.done || !atHit(e, now, speed)) continue
          const r = run.settle(e, st)
          onResult?.(r, e)
        }
      }
    },

    render() { renderer.render(scene, camera) },

    /**
     * 화면에서 실시간으로 돌린다. 곡률은 숫자로 못 정한다 — 눈으로 정한다.
     * 원경도 같이 옮긴다 — 바닥이 접히는 각이 바뀌면 지평선이 오르내린다.
     */
    setCurve(k) { kUniform.value = k; backdrop.setCurve(k) },

    setDpr(v) { renderer.setPixelRatio(v) },

    /**
     * 지금 다가오고 있는 자세 팻말(없으면 `null`).
     *
     * **이벤트 그대로** 넘긴다 — 자세 이름만 주면 부르는 쪽이 "같은 팻말인지"를
     * 알 수 없어, 한 팻말에서 운동량을 여러 번 세게 된다.
     */
    get askedPose() { return asked },

    /** 제일 가까운 **안 지난** 이벤트. 방향 힌트를 띄울 때 쓴다. */
    get upcoming() { return upcoming },

    get drawCalls() { return renderer.info.render.calls },
    get triangles() { return renderer.info.render.triangles },

    dispose() {
      for (const r of rows) r.dispose()
      for (const d of dinos) d.dispose()
      for (const g of Object.values(shapes)) g.dispose()
      for (const m of matCache.values()) { m.map?.dispose(); m.dispose() }
      ground.dispose()
      backdrop.dispose()
      clouds.dispose()
      obstacles.dispose()
      portal.dispose()
      character?.dispose()
      propMat.dispose()
      renderer.dispose()
    },
  }
}

/**
 * `speed` 1.0이 초당 몇 유닛인가.
 *
 * 기존 러너의 `speed`는 배율(1.0~1.6)이지 속도가 아니다. 세계 크기가 정해진
 * 여기서 한 번만 환산한다 — **새 속도 체계를 만들지 않는다**(docs/10 §8).
 * 18유닛/초 × 3.2초 ≈ 58유닛으로, 지금 게임의 예고 거리와 같다.
 */
export const UNITS_PER_SPEED = 18

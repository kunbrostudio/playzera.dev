// 바닥 — **잔디 판과 트랙 판, 둘로 나눈다.**
//
// ── 왜 한 장이 아닌가 ────────────────────────────────────────
//
// 처음엔 한 장에 잔디와 흙길을 같이 그리고 가로로 4번 반복했다. 그러니 흙길이
// **네 줄로 늘어나** 어디가 트랙인지 안 보였다. 잔디는 촘촘히 반복해야 결이 살고
// 트랙은 반복하면 안 되는데, 한 장에 두면 둘 중 하나를 포기해야 한다.
//
// 나누면 각자 맞는 반복 횟수를 쓴다. draw call 하나가 늘 뿐이다(예산 20).
//
// ── 흐르는 방향 ★ ───────────────────────────────────────────
//
// 판을 눕히면(`rotation.x = -π/2`) 텍스처의 +v가 **먼 쪽**을 향한다.
// 샘플링은 `uv·repeat + offset`이라, offset을 **키우면** 먼 쪽의 무늬가 가까운
// 자리에 나타난다 — 즉 무늬가 **카메라 쪽으로 온다.**
//
// 처음에 부호를 반대로 뒀더니 땅만 앞으로 밀려가고 좌우 나무는 다가왔다.
// 한 화면에서 두 방향이 보이니 멀미가 났다. 부호 하나였다.
//
// ── 지오메트리를 옮기지 않는다 ───────────────────────────────
//
// 판을 z로 밀면 반드시 이음매가 생기고, 그 이음매를 프롭 흐름과 맞추려는 순간
// 2D 러너가 겪던 "따로 노는" 문제가 그대로 돌아온다. UV만 흘린다.

import * as THREE from 'three'

/** 3레인. 폭은 화면에서 트랙이 길처럼 보이는 크기다(§lane). */
export const LANE_W = 5.0
export const TRACK_W = LANE_W * 3

/**
 * 색은 **한곳에 모아 둔다.** 여기저기 흩어 두면 톤을 낮출 때 한두 군데가 남고,
 * 남은 밝은 조각이 눈에 제일 먼저 띈다.
 *
 * 값은 컨셉아트에서 왔다(8/20). 첫 판은 이보다 밝았는데 잔디가 색이 바랜 것처럼
 * 보였다 — 채도가 낮아서가 아니라 **명도가 높아서**였다.
 */
export const PALETTE = {
  grass: '#3f8a2f', grassLit: '#57a53d', grassDark: '#2f6d24',
  stone: '#5b3f39', stoneLit: '#7a5a4c', stoneDark: '#3d2823',
  gloss: 'rgba(255,196,120,0.10)',
  edge: '#ffd23e', edgeGlow: 'rgba(255,150,40,0.55)',
  lane: 'rgba(255,214,80,0.85)',
  arrow: 'rgba(150,240,80,0.85)',
  curbA: '#c9a06a', curbB: '#8d8078', curbTop: '#4f9a37',
  gem: '#4fe6c8',
}

/** 잔디 — 작게 반복한다. 결이 촘촘해야 속도가 읽힌다. */
function grassTexture(palette = PALETTE) {
  const S = 128
  const cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d')
  g.fillStyle = palette.grass; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 90; i++) {
    g.fillStyle = i % 3 ? palette.grassLit : palette.grassDark
    const x = Math.random() * S, y = Math.random() * S
    g.fillRect(x, y, 2 + Math.random() * 4, 1 + Math.random())
  }
  const t = new THREE.CanvasTexture(cv)
  // ── **sRGB라고 말해 준다** ★ ──────────────────────────────
  // 안 붙이면 three는 캔버스 픽셀을 이미 선형인 값으로 보고, 출력할 때 한 번 더
  // 밝게 편다. `#3f8a2f`로 칠한 잔디가 화면에서는 `#87c475`쯤으로 떠올랐다 —
  // "바닥이 연한 녹색"의 정체가 이것이고, 색을 고른 사람 잘못이 아니었다.
  //
  // 원경 띠(`backdrop.js`)는 처음부터 sRGB를 붙이고 있었다. 그래서 둘의 색을
  // 같게 적어 두고도(테스트가 그걸 본다) **화면에서는 접힘선에 색이 갈렸다.**
  // 값이 같은데 화면이 다르면, 대개 한쪽만 색공간을 말해 주고 있는 것이다.
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(20, 44)
  t.anisotropy = 4
  return t
}

/**
 * 트랙 — **가로로 반복하지 않는다.** 한 장이 트랙 폭을 그대로 덮는다.
 * 그래야 차선이 딱 두 줄이다.
 *
 * ── 왜 자갈이 아니라 돌 포장인가 (8/20) ─────────────────────
 *
 * 흙에 자갈을 흩는 방식은 **무늬가 너무 잘아서** 멀어지면 그냥 갈색 판이 된다.
 * 돌을 크게 깔면 한 장 한 장이 지나가는 게 보여 속도가 읽힌다.
 *
 * 셰브론(초록 화살표)은 가운데 칸에만 둔다. 세 칸에 다 깔면 화살표가
 * 차선처럼 보여서 **어디가 칸 경계인지**가 흐려진다.
 */
/**
 * ── 트랙·연석은 **일부러 sRGB를 안 붙였다** ★ ────────────────
 *
 * 잔디와 같은 문제를 안고 있다(화면이 팔레트보다 밝게 나온다). 그런데 지금
 * 화면의 돌길 톤은 그 상태로 확인받은 것이라, 색공간만 고치면 **승인받은
 * 그림이 통째로 어두워진다.**
 *
 * 고치려면 sRGB를 붙이면서 `PALETTE`의 돌 색들을 지금 보이는 밝기로 다시
 * 올려 적어야 한다 — 그건 화면을 보면서 할 일이다. 지금은 잔디만 맞췄다.
 * 여기 적어 두는 이유는 이게 **버그가 아니라 미룬 것**임을 남기기 위해서다.
 */
function trackTexture(palette = PALETTE) {
  const W = 384, H = 384
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')

  g.fillStyle = palette.stoneDark; g.fillRect(0, 0, W, H)

  // ── 돌 포장 ──
  // 격자를 만들되 꼭짓점을 흔든다. 반듯하면 타일 바닥이지 돌길이 아니다.
  const COLS = 7, ROWS = 7
  const cw = W / COLS, ch = H / ROWS
  const jx = (c, r) => ((Math.sin(c * 12.9 + r * 78.2) * 43758.5) % 1) * 0.34
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const off = r % 2 ? cw * 0.5 : 0     // 벽돌처럼 반 칸 어긋나게
      const x = c * cw + off + jx(c, r) * cw
      const y = r * ch + jx(r, c) * ch
      const w = cw * (0.82 + jx(c + 3, r) * 0.5)
      const h = ch * (0.82 + jx(c, r + 3) * 0.5)
      const tone = 0.78 + jx(c + 7, r + 7) * 0.6
      g.fillStyle = shade(palette.stone, tone)
      round(g, x, y, w, h, 6); g.fill()
      // 윗변만 밝게 — 돌이 도톰해 보인다
      g.strokeStyle = shade(palette.stoneLit, 1); g.lineWidth = 1.6
      g.beginPath(); g.moveTo(x + 5, y + 1.2); g.lineTo(x + w - 5, y + 1.2); g.stroke()
    }
  }

  // ── 광택 ──
  // 세로로 길게 흐르는 빛. 젖은 돌처럼 보이라고 넣는다.
  // **하늘색이 아니라 주황빛이다** — 초록·갈색 위의 하늘색은 바랜 자국이 된다.
  for (const f of [0.28, 0.5, 0.72]) {
    const gr = g.createLinearGradient(W * f - 26, 0, W * f + 26, 0)
    gr.addColorStop(0, 'rgba(255,196,120,0)')
    gr.addColorStop(0.5, palette.gloss)
    gr.addColorStop(1, 'rgba(255,196,120,0)')
    g.fillStyle = gr; g.fillRect(W * f - 26, 0, 52, H)
  }

  // ── 가운데 셰브론 ──
  const AR = 4                                   // 한 장에 네 개 — 촘촘해야 흐름이 보인다
  g.fillStyle = palette.arrow
  for (let i = 0; i < AR; i++) {
    const y = (i / AR) * H
    const w = W * 0.13, t = H * 0.045, d = H * 0.055
    g.beginPath()
    g.moveTo(W / 2 - w, y + d); g.lineTo(W / 2, y)
    g.lineTo(W / 2 + w, y + d); g.lineTo(W / 2 + w, y + d + t)
    g.lineTo(W / 2, y + t); g.lineTo(W / 2 - w, y + d + t)
    g.closePath(); g.fill()
  }

  // ── 차선 둘 ──
  // 트랙을 **3등분**한다. 아이가 "내가 어느 칸에 있나"를 알아야 좌우 이동이
  // 게임이 된다(2D 러너에서 배운 것, STEP 15). 참고 아트처럼 실선이다 —
  // 점선은 돌 무늬에 묻힌다.
  g.strokeStyle = palette.lane; g.lineWidth = 3.5
  for (const f of [1 / 3, 2 / 3]) {
    g.beginPath(); g.moveTo(W * f, 0); g.lineTo(W * f, H); g.stroke()
  }

  // ── 양 끝 — 빛나는 선 ──
  for (const x of [3, W - 3]) {
    const gr = g.createLinearGradient(x - 16, 0, x + 16, 0)
    gr.addColorStop(0, 'rgba(255,150,40,0)')
    gr.addColorStop(0.5, palette.edgeGlow)
    gr.addColorStop(1, 'rgba(255,150,40,0)')
    g.fillStyle = gr; g.fillRect(x - 16, 0, 32, H)
    g.strokeStyle = palette.edge; g.lineWidth = 5
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke()
  }

  const t = new THREE.CanvasTexture(cv)
  t.wrapS = THREE.ClampToEdgeWrapping   // 가로는 반복 금지
  t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1, 10)
  t.anisotropy = 8
  return t
}

/** `#rrggbb`를 밝기 배율로 민다. 돌마다 톤을 흔들려고 쓴다. */
function shade(hex, m) {
  const n = parseInt(hex.slice(1), 16)
  const c = i => Math.max(0, Math.min(255, Math.round(((n >> i) & 255) * m)))
  return `rgb(${c(16)},${c(8)},${c(0)})`
}

function round(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/**
 * 연석 — **진짜 높이가 있는 상자다.** 텍스처에 그린 가짜 입체가 아니다.
 *
 * 트랙을 바닥에 그려 놓기만 하면 길이 **잔디에 인쇄된 무늬**로 보인다.
 * 참고 아트가 트랙처럼 보이는 건 옆에 턱이 있어서다 — 턱이 있어야 길이
 * 잔디보다 낮거나 높은 것으로 읽힌다(`CLAUDE.md`: 오브젝트는 바닥에 붙어 있어야 한다).
 *
 * 길이 방향으로 잘게 나눠야 곡률이 먹는다.
 *
 * 단면을 길이 방향으로 **밀어 만든 띠**다. `BoxGeometry`를 쓰면 안 된다 —
 * three의 상자는 면마다 uv 축이 다르다(옆면은 v가 **높이**, 윗면은 v가 **길이**).
 * 그래서 v를 흘리면 윗면만 흐르고 옆면은 위아래로 미끄러진다.
 *
 * 직접 만들면 네 면 전부 `v = 길이`로 맞출 수 있고, 좌우 두 줄을 한 덩어리에
 * 담아 **draw call 하나**로 끝난다.
 *
 * @param {{ax:number,ay:number,bx:number,by:number,u0:number,u1:number}[]} sections
 */
export function extrudeStrips(sections, length, tiles, seg = 80) {
  const pos = [], uv = [], idx = []
  let base = 0
  for (const s of sections) {
    for (let i = 0; i <= seg; i++) {
      const z = -length / 2 + (length * i) / seg
      const v = (i / seg) * tiles
      pos.push(s.ax, s.ay, z, s.bx, s.by, z)
      uv.push(s.u0, v, s.u1, v)
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2)
    }
    base += (seg + 1) * 2
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  return geo
}

function curbTexture(palette = PALETTE) {
  const W = 128, H = 256
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')
  const BLOCKS = 8, bh = H / BLOCKS
  for (let i = 0; i < BLOCKS; i++) {
    g.fillStyle = i % 2 ? palette.curbA : palette.curbB
    g.fillRect(0, i * bh, W, bh - 2)
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(0, i * bh + bh - 2, W, 2)             // 블록 사이 홈
    // 바깥 끝은 풀 — 연석이 잔디에 박혀 있는 것으로 읽힌다.
    // (u 0.34~1 이 윗면이고, 그중 바깥 15%가 여기다)
    g.fillStyle = palette.curbTop
    g.fillRect(W * 0.87, i * bh, W * 0.13, bh)
    g.fillStyle = 'rgba(255,255,255,0.16)'
    g.fillRect(0, i * bh, W, 3)                      // 윗면 하이라이트
    // 세 칸에 한 번 보석 — 규칙적이면 무늬, 드물어야 장식이다
    if (i % 3 === 1) {
      g.fillStyle = palette.gem
      g.beginPath(); g.ellipse(W / 2, i * bh + bh / 2, 11, 9, 0, 0, Math.PI * 2); g.fill()
      g.fillStyle = 'rgba(255,255,255,0.5)'
      g.beginPath(); g.ellipse(W / 2 - 3, i * bh + bh / 2 - 3, 4, 3, 0, 0, Math.PI * 2); g.fill()
    }
  }
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = THREE.ClampToEdgeWrapping
  // 길이 방향 반복은 **지오메트리의 v에 이미 들어 있다**(`extrudeStrips`의 tiles).
  // 여기서 또 곱하면 두 번 반복돼 블록이 잘아진다.
  t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

/**
 * @param {(m:THREE.Material)=>THREE.Material} withCurve 곡률을 심는 함수
 * @param {number} length 판 길이(유닛)
 * @param {object} [opts]
 * @param {typeof PALETTE} [opts.palette] 색을 통째로 바꿔 낀다(기본 쥬라기 팔레트).
 *   `backdrop.js`가 STEP 37에서 `art`/`groundColor`로 하늘을 테마별로 바꿔
 *   낄 수 있게 연 것과 같은 이유 — 트랙(돌길)·연석 구조는 재사용하되 색만
 *   테마에 맞게 다시 칠할 수 있다(예: 오디세이 런의 대리석 신전 바닥).
 * @param {boolean} [opts.grass] 잔디 판을 만들지 말지(기본 true). 트랙
 *   바깥을 물로 채우는 테마(섬)는 잔디 판 자체가 필요 없다 — 굳이 만들어
 *   숨기지 않고 아예 생성을 건너뛴다(텍스처 하나·draw call 하나를 아낀다).
 */
export function createGround(withCurve, length, opts = {}) {
  const { palette = PALETTE, grass: showGrass = true } = opts
  const grassMap = showGrass ? grassTexture(palette) : null
  const trackMap = trackTexture(palette)
  const curbMap = curbTexture(palette)

  const grassMat = grassMap ? withCurve(new THREE.MeshBasicMaterial({ map: grassMap, fog: true })) : null
  const trackMat = withCurve(new THREE.MeshBasicMaterial({ map: trackMap, fog: true }))
  // 손으로 만든 띠라 앞뒤 감김을 장담할 수 없다. 양면으로 두면 한 면이
  // 통째로 사라지는 일이 없다 — 폴리가 몇 개 안 되니 값도 안 든다.
  const curbMat = withCurve(new THREE.MeshBasicMaterial({
    map: curbMap, fog: true, side: THREE.DoubleSide,
  }))

  // 세로로 잘게 나눈다. 정점이 있어야 셰이더가 휜다 — 2삼각형 판은 안 휜다.
  const mk = (w, mat, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, length, 1, 80), mat)
    m.rotation.x = -Math.PI / 2
    m.position.set(0, y, -length * 0.45)
    m.frustumCulled = false
    return m
  }
  const grass = grassMat ? mk(140, grassMat, 0) : null
  // 아주 조금 띄운다. 같은 높이면 z-파이팅으로 지글거린다.
  const track = mk(TRACK_W, trackMat, 0.02)

  // ── 연석 ──
  // 좌우 두 줄 × (안쪽 면 + 윗면) = 띠 넷을 **한 지오메트리**에 담는다.
  const CURB = { w: 1.1, h: 0.55, tiles: 34 }
  const inner = TRACK_W / 2
  const outer = inner + CURB.w
  const sections = []
  for (const side of [-1, 1]) {
    // 안쪽 면 — 트랙을 마주 본다. 아이 눈에 제일 많이 걸리는 면이다.
    sections.push({ ax: side * inner, ay: 0, bx: side * inner, by: CURB.h, u0: 0, u1: 0.34 })
    // 윗면
    sections.push({ ax: side * inner, ay: CURB.h, bx: side * outer, by: CURB.h, u0: 0.34, u1: 1 })
  }
  const curbGeo = extrudeStrips(sections, length, CURB.tiles)
  const curb = new THREE.Mesh(curbGeo, curbMat)
  curb.position.z = -length * 0.45
  curb.frustumCulled = false

  return {
    meshes: grass ? [grass, track, curb] : [track, curb],

    /** @param {number} dz 이번 프레임에 다가온 거리 */
    update(dz) {
      // **더한다.** 빼면 땅만 앞으로 밀려간다(위 주석).
      const dv = dz / length
      if (grassMap) grassMap.offset.y += dv * grassMap.repeat.y
      trackMap.offset.y += dv * trackMap.repeat.y
      // ── 연석은 **빼야** 한다 ★ ──
      //
      // 눕힌 판(`rotation.x = -π/2`)은 +v가 **먼 쪽**을 향하지만,
      // `extrudeStrips`는 v를 `z = -length/2`(먼 쪽)에서 0으로 시작해
      // 가까운 쪽으로 갈수록 키운다 — 즉 **v의 방향이 반대**다.
      // 그래서 트랙과 같은 부호로 흘리면 턱만 앞으로 간다(실제로 그랬다).
      curbMap.offset.y -= dv * CURB.tiles
    },

    dispose() {
      for (const m of this.meshes) m.geometry.dispose()
      if (grassMap) { grassMap.dispose(); grassMat.dispose() }
      trackMap.dispose(); curbMap.dispose()
      trackMat.dispose(); curbMat.dispose()
    },
  }
}

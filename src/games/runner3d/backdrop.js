// 원경 — **카메라를 감싸는 띠 하나다.** 판을 세우지 않는다.
//
// ── 판이 왜 안 됐나 ★ ───────────────────────────────────────
//
// 처음엔 능선과 화산을 각각 평면으로 세웠다. 화면에는 **화산만** 떴다.
// 곡률 때문이다 — 셰이더가 `y -= k·z²`를 하므로 118유닛 앞의 판은 통째로
// **11유닛 내려앉는다.** 능선은 지평선 밑으로 파묻히고, 더 높이 띄워 둔 화산만
// 남아 하늘에 떠 있는 스티커가 되었다.
//
// 원경에 곡률을 주면 안 된다. **멀리 있는 것은 지평선에 붙어 있는 것**이고,
// 지평선은 휘어도 그 자리다.
//
// ── 그럼 어디에 붙이나 ★ ───────────────────────────────────
//
// 휜 바닥에는 **접히는 선**이 있다. 거리 d의 지면이 눈 아래로 보이는 각은
// `atan((h + k·d²)/d)`이고, 이 값은 `d = √(h/k)`에서 **가장 작아진다** —
// 그보다 멀어지면 다시 내려간다. 즉 바닥은 그 각도에서 끝난다. 그게 이 세계의
// 지평선이다.
//
//     tan(접힘각) = 2·√(k·h)          (h = 카메라 높이)
//
// 지금 값(k=1/1200, h=6)으로 8.05°. 원경 띠의 **지면선을 정확히 그 각도**에
// 두면 바닥이 끝나는 자리에서 그림이 이어 받는다. 곡률 슬라이더를 돌리면
// 띠도 같이 오르내린다(`setCurve`).
//
// ── 왜 원통인가 ─────────────────────────────────────────────
//
// 평면 한 장이면 좌우 끝에서 원근이 어긋난다(가운데보다 멀어진다). 원통은
// 모든 방향이 같은 거리라 어디를 봐도 같은 크기다 — 원경이 갖춰야 할 성질이다.
// 카메라가 안 도니 **150°만** 두른다. 360°를 두르면 절반 이상을 못 보고 버린다.
//
// ── 그림은 만들지 않고 **합친다** ────────────────────────────
//
// 능선·화산·구름은 이미 쥬라기 테마에 있다. 새 그림을 발주하면 같은 세계가
// 두 벌이 되고, 한쪽만 고쳐지는 날이 온다. 시작할 때 캔버스에서 한 장으로
// 합쳐 원통에 감는다 — 테마 그림을 바꾸면 원경도 따라 바뀐다.
//
// ── 연기는 영상이 아니다 ★ ──────────────────────────────────
//
// 알파 있는 영상은 iOS Safari에서 안 돈다(VP9 알파 미지원, HEVC 알파만 되는데
// 인코딩이 까다롭다). 용량도 수백 KB~MB이고, 디코더가 GPU를 먹는다 —
// 우리는 이미 MediaPipe와 three를 같이 돌리고 있다.
//
// 스프라이트 시트도 안 쓴다. 몇 초마다 **똑같은 주기**가 눈에 보인다.
//
// 퍼프(뭉게구름 조각) 여덟 개를 띄워 올린다. 그림은 코드가 그리므로 **0바이트**,
// 정점 알파로 각자 흐려지고, 사각형 여덟 개가 한 덩어리라 **draw call 하나**다.
// 주기가 서로 어긋나 있어 반복이 안 보인다.

import * as THREE from 'three'

const D2R = Math.PI / 180

/**
 * 눈으로 고르는 값들. **전부 시야각(도)이다** — 유닛으로 두면 반지름을 바꿀
 * 때마다 다시 맞춰야 하는데, 화면에서 몇 도로 보이는지는 반지름과 무관하다.
 */
export const PANORAMA = {
  radius: 116,        // far(130) 안쪽이어야 잘리지 않는다
  arcDeg: 150,        // 두르는 각. 보이는 건 최대 87°라 여유가 넉넉하다
  // 위아래는 **지면선을 기준으로** 잰다. 눈높이를 기준으로 두면 곡률을 바꿀
  // 때마다 그림을 다시 그려야 한다 — 지면선 기준이면 띠를 통째로 올리면 된다.
  upDeg: 44,          // 지면선 위로 (세로 화면에서도 하늘이 안 비게)
  downDeg: 6,         // 아래로. 여기는 진짜 바닥이 덮는다
  ridgeTiles: 7,      // **홀수** — 가운데 한 장이 트랙 소실점에 온다
  ridgeDeg: 6.9,      // 능선 높이
  volcanoDeg: 12,     // 화산 폭. 줄이면 더 멀어 보인다
  craterFrac: 0.05,   // 화산 그림 위에서 분화구까지 — 연기가 여기서 난다
  texWidth: 2560,     // 보이는 87°가 화면 폭과 거의 1:1이 된다
  skyTop: '#5f8fe0',
  skyHorizon: '#bfe6f7',
  grass: '#3f8a2f',   // 지면선 아래 — `ground.js`의 `PALETTE.grass`와 같아야 한다
}

/**
 * 흐르는 구름 — **좌우로 미끄러지지 않고 앞에서 뒤로 지나간다.** ★
 *
 * 처음엔 원통에 감아 `u`를 돌렸다. 그러니 구름이 **옆으로 미끄러졌다** —
 * 달리는 게 아니라 제자리에서 도는 것처럼 보인다. 아래의 나무·돌은 다가와서
 * 지나가는데 하늘만 옆으로 흐르니, 한 화면에서 두 방향이 보였다.
 * (바닥 부호를 뒤집었을 때와 같은 종류의 문제다.)
 *
 * 그래서 프롭과 같은 방식으로 바꿨다 — z를 흘리고 `span`마다 되돌린다.
 * 곡률도 같이 받는다. 그래야 멀리서 산 너머로 **떠오르듯** 들어온다.
 *
 * 모양도 화산 연기와 같은 퍼프다. 그림 파일이 없고, 뭉치 하나가 조각 여럿이라
 * 뭉게구름처럼 보인다.
 */
export const CLOUDS = {
  count: 10,          // 뭉치 수
  puffs: 5,           // 한 뭉치의 조각 — 적으면 동그라미, 많으면 무겁다
  span: 150,          // 되돌리기 주기. far(130)보다 길어야 갑자기 안 나타난다
  near: 24,           // 이보다 가까워지면 되돌린다 (머리 위를 지난 뒤)
  yLow: 30, yHigh: 54,
  spreadX: 95,        // 좌우로 흩는 폭
  size: 9, sizeVar: 8,
  drag: 0.5,          // 달린 거리 중 구름에 보태지는 비율. 1이면 나무처럼 빠르다
  fadeIn: 0.18,       // 되돌아온 직후 이 구간에서 서서히 나타난다 — 안 그러면 툭 뜬다
}

/** 쥬라기 테마에서 빌려 쓴다(`CLAUDE.md`: 이름은 데이터로). */
export const BACKDROP_ART = {
  sky: '/assets/runner/jurassic/image/bg_sky.png',
  ridge: '/assets/runner/jurassic/image/bg_jurassic_ridge.png',
  volcano: '/assets/runner/jurassic/image/bg_volcano_far.png',
}

/** 휜 바닥이 접히는 각의 탄젠트. 원경 지면선이 여기에 앉는다. */
export const foldTan = (k, camHeight) => 2 * Math.sqrt(k * camHeight)

const load = url => new Promise(res => {
  const im = new Image()
  im.onload = () => res(im)
  im.onerror = () => res(null)   // 없으면 그 층만 건너뛴다 — 화면은 계속 돈다
  im.src = url
})

/** 부드러운 원반. 연기 퍼프의 유일한 그림이다. */
function puffTexture() {
  const S = 64
  const cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d')
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.85)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad; g.fillRect(0, 0, S, S)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * @param {object} o
 * @param {number} o.camHeight
 * @param {number} o.camBack   카메라 z. 띠는 카메라를 중심으로 둘러야 한다
 * @param {number} o.k         곡률. 지면선 높이를 정한다
 */
export function createBackdrop({ camHeight, camBack, k }) {
  const P = PANORAMA
  const R = P.radius

  // 가로는 각도, 세로는 세계 y로 재는데 **픽셀 밀도는 같아야** 그림이 안 늘어난다.
  const pxPerUnit = P.texWidth / (R * P.arcDeg * D2R)

  /** 시야각 → 벽 위의 세계 단위. */
  const uOf = deg => R * deg * D2R

  const upU = uOf(P.upDeg)
  const downU = uOf(P.downDeg)
  const H = upU + downU                           // 원통 높이(유닛)
  const texH = Math.round(H * pxPerUnit)
  const groundPx = Math.round(upU * pxPerUnit)    // 텍스처 안의 **지면선**

  const ridgeH = uOf(P.ridgeDeg) * pxPerUnit
  const volcW = uOf(P.volcanoDeg) * pxPerUnit

  // ── 한 장으로 합치기 ──
  const cv = document.createElement('canvas')
  cv.width = P.texWidth; cv.height = texH
  const g = cv.getContext('2d')

  const grad = g.createLinearGradient(0, 0, 0, groundPx)
  grad.addColorStop(0, P.skyTop)
  grad.addColorStop(1, P.skyHorizon)
  g.fillStyle = grad; g.fillRect(0, 0, cv.width, groundPx)
  g.fillStyle = P.grass; g.fillRect(0, groundPx, cv.width, texH - groundPx)

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  // BackSide로 안에서 보면 좌우가 뒤집힌다. u를 되감아 바로 세운다.
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.repeat.x = -1
  tex.offset.x = 1

  // 화산 분화구가 어디인지는 그림을 다 올린 뒤에야 안다
  let craterLocal = { x: 0, y: uOf(P.ridgeDeg) * 1.4 }

  ;(async () => {
    const [sky, ridge, volcano] = await Promise.all(
      [BACKDROP_ART.sky, BACKDROP_ART.ridge, BACKDROP_ART.volcano].map(load))

    // 하늘 — **덮기(cover)로 넣는다.** 상자에 맞춰 늘이면 구름이 눌린다
    // (`CLAUDE.md`). 밑에 깔아 둔 그라데이션이 못 덮은 데를 받쳐 준다.
    if (sky) {
      const s = Math.max(cv.width / sky.width, groundPx / sky.height)
      const w = sky.width * s, h = sky.height * s
      g.drawImage(sky, (cv.width - w) / 2, groundPx - h, w, h)
    }

    // 화산 — **능선보다 먼저** 그린다. 2D에서 순서를 뒤집어 화산이 능선 앞에
    // 나온 적이 있다(STEP 16). 여기서는 그리는 차례가 곧 앞뒤다.
    if (volcano) {
      const vw = volcW, vh = vw * (volcano.height / volcano.width)
      // 밑동은 능선에 가린다 — 조금만 걸치게 두면 "뒤에 있다"가 읽힌다
      const vy = groundPx - ridgeH * 0.45 - vh
      g.drawImage(volcano, (cv.width - vw) / 2, vy, vw, vh)
      // 분화구 자리. 그림은 **투명 여백을 잘라 두었다** — 안 자르면 여백만큼
      // 위에서 연기가 나서 산과 떨어져 보인다(실제로 그랬다).
      craterLocal = { x: 0, y: (groundPx - (vy + vh * P.craterFrac)) / pxPerUnit }
    }

    // 능선 — 홀수 장. 가운데 한 장의 한가운데가 소실점이다.
    if (ridge) {
      const tw = cv.width / P.ridgeTiles
      const th = tw * (ridge.height / ridge.width)
      for (let i = 0; i < P.ridgeTiles; i++) {
        // 0.5px 겹쳐 그린다 — 딱 맞추면 이음매에 하늘색 실선이 뜬다
        g.drawImage(ridge, i * tw - 0.5, groundPx - th, tw + 1, th)
      }
    }

    tex.needsUpdate = true
  })()

  // ── 원통 ──
  const arc = P.arcDeg * D2R
  const geo = new THREE.CylinderGeometry(R, R, H, 64, 1, true, Math.PI - arc / 2, arc)
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    // 곡률도 안개도 안 받는다 — 원경은 감출 것도, 휠 것도 없다
    fog: false,
    depthWrite: false,
    transparent: false,
  })
  const wall = new THREE.Mesh(geo, mat)
  wall.frustumCulled = false
  wall.renderOrder = -20
  // 그룹의 국소 y=0 이 **지면선**이다. 곡률이 바뀌면 그룹만 오르내린다.
  wall.position.y = (groundPx / pxPerUnit) - H / 2

  // ── 연기 ──
  const N = 8
  const puffTex = puffTexture()
  const pg = new THREE.BufferGeometry()
  const pos = new Float32Array(N * 4 * 3)
  const col = new Float32Array(N * 4 * 4)          // itemSize 4 → 정점 알파가 켜진다
  const uv = new Float32Array(N * 4 * 2)
  const idx = []
  for (let i = 0; i < N; i++) {
    uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8)
    const b = i * 4
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
  }
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  pg.setAttribute('color', new THREE.BufferAttribute(col, 4))
  pg.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  pg.setIndex(idx)
  const smoke = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({
    map: puffTex, transparent: true, vertexColors: true,
    depthWrite: false, fog: false, side: THREE.DoubleSide,
  }))
  smoke.frustumCulled = false
  smoke.renderOrder = -19

  // 크기는 8/20에 눈으로 키웠다 — 처음 값(1.6→5.2)은 화산에 견줘 잘아서
  // 연기가 아니라 먼지처럼 보였다.
  const SMOKE = { life: 6.5, rise: 17, from: 2.8, to: 8.4, drift: 2.6 }
  // 주기를 고르게 어긋뜨린다. 무작위로 두면 뭉치는 순간이 생긴다.
  const phase = Array.from({ length: N }, (_, i) => (i / N) * SMOKE.life)
  const sway = Array.from({ length: N }, () => 0.6 + Math.random() * 0.8)
  let t = 0

  const zCrater = -(R - 6)   // 벽보다 살짝 앞 — 연기가 산에 박히면 안 된다
  const drawSmoke = () => {
    for (let i = 0; i < N; i++) {
      const a = ((t + phase[i]) % SMOKE.life) / SMOKE.life
      const cx = craterLocal.x + Math.sin(a * 3.1 * sway[i]) * SMOKE.drift * a
      const cy = craterLocal.y + a * SMOKE.rise
      const s = (SMOKE.from + (SMOKE.to - SMOKE.from) * a) / 2
      // 올라오며 진해졌다가 흩어진다. 끝에서 뚝 끊기면 사라지는 게 보인다.
      const al = Math.min(1, a / 0.18) * Math.max(0, 1 - Math.max(0, a - 0.45) / 0.55) * 0.82
      const b = i * 12
      pos[b + 0] = cx - s; pos[b + 1] = cy - s; pos[b + 2] = zCrater
      pos[b + 3] = cx + s; pos[b + 4] = cy - s; pos[b + 5] = zCrater
      pos[b + 6] = cx + s; pos[b + 7] = cy + s; pos[b + 8] = zCrater
      pos[b + 9] = cx - s; pos[b + 10] = cy + s; pos[b + 11] = zCrater
      for (let v = 0; v < 4; v++) {
        const c = i * 16 + v * 4
        // 화산재 색 — 흰 김이 아니라 짙은 잿빛으로(ken 요청, 9/2). 텍스처
        // (`puffTexture()`)는 흰 원반 그대로 두고 정점 색만 어둡게 곱한다 —
        // 구름(`createClouds`)이 같은 텍스처를 빌려 쓰지만 색 버퍼는 따로라
        // 안 건드린다. 올라갈수록 살짝 더 옅어진다 — 흩어지는 느낌.
        const w = 0.4 - a * 0.08
        col[c] = w; col[c + 1] = w; col[c + 2] = w; col[c + 3] = al
      }
    }
    pg.attributes.position.needsUpdate = true
    pg.attributes.color.needsUpdate = true
  }

  // ── 그룹 ──
  const group = new THREE.Group()
  group.add(wall, smoke)
  group.position.z = camBack

  const place = kk => { group.position.y = camHeight - R * foldTan(kk, camHeight) }
  place(k)
  drawSmoke()

  return {
    group,
    /** 곡률이 바뀌면 지평선이 오르내린다 — 띠도 따라간다. */
    setCurve(kk) { place(kk) },

    /** 벽은 안 움직인다. **달려도 그대로 있는 것이 멀다는 뜻**이다. */
    update(dt) { t += dt; drawSmoke() },

    dispose() {
      geo.dispose(); tex.dispose(); mat.dispose()
      pg.dispose(); puffTex.dispose(); smoke.material.dispose()
    },
  }
}

/**
 * 구름의 **자리와 흐름만.** 그림도 three도 모른다.
 *
 * 이렇게 떼어 두는 이유는 감지기와 같다 — 캔버스를 만드는 순간 브라우저 없이
 * 확인할 수 없고, 그러면 "옆으로 미끄러지는가 다가오는가"를 눈으로만 보게 된다.
 *
 * @param {() => number} rnd 무작위 원천. 테스트가 고정할 수 있게 밖에서 받는다
 */
export function makeCloudField(rnd = Math.random) {
  const C = CLOUDS
  const clouds = Array.from({ length: C.count }, (_, i) => ({
    x: (rnd() - 0.5) * C.spreadX,
    y: C.yLow + rnd() * (C.yHigh - C.yLow),
    // **줄은 자리의 기준이지 자리가 아니다**(`CLAUDE.md`) — 고르게만 두면
    // 하늘에 구름이 줄지어 온다.
    z: C.near - ((i + rnd() * 0.7) / C.count) * C.span,
    puffs: Array.from({ length: C.puffs }, (_, j) => ({
      dx: (j - (C.puffs - 1) / 2) * (0.62 + rnd() * 0.3),
      dy: (rnd() - 0.5) * 0.5,
      s: C.size + rnd() * C.sizeVar,
      a: 0.62 + rnd() * 0.3,
    })),
  }))

  return {
    clouds,
    /** @param {number} dz 이번 프레임에 달린 거리 */
    advance(dz) {
      const d = dz * C.drag
      for (const c of clouds) {
        c.z += d
        // **span을 뺀다, 자리를 다시 뽑지 않는다.** 새로 뽑으면 간격이 무너진다
        // (프롭에서 겪은 것과 같다).
        while (c.z > C.near) c.z -= C.span
      }
    },
    /** 되돌아온 직후에는 옅다 — 안 그러면 먼 하늘에 구름이 툭 나타난다. */
    fadeOf(c) {
      return Math.min(1, (1 - (C.near - c.z) / C.span) / C.fadeIn)
    },
  }
}

/**
 * 하늘의 구름 — **프롭과 같은 방식으로 흐른다.**
 *
 * 원경 띠에 넣지 않는다. 띠는 지평선에 붙어 안 움직이는 것들의 자리이고,
 * 구름은 **다가와서 지나가는 것**이다. 씬에 바로 붙고 곡률을 같이 받는다 —
 * 그래야 멀리서 산 너머로 떠오르듯 들어온다.
 *
 * 뭉치 하나가 퍼프 여럿이라 뭉게구름처럼 보인다. 전부 한 지오메트리라
 * **draw call 하나**, 그림 파일은 없다.
 *
 * @param {(m:THREE.Material)=>THREE.Material} withCurve
 */
export function createClouds(withCurve) {
  const C = CLOUDS
  const N = C.count * C.puffs
  const tex = puffTexture()
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(N * 4 * 3)
  const col = new Float32Array(N * 4 * 4)
  const uv = new Float32Array(N * 4 * 2)
  const idx = []
  for (let i = 0; i < N; i++) {
    uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8)
    const b = i * 4
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setIndex(idx)

  const mesh = new THREE.Mesh(geo, withCurve(new THREE.MeshBasicMaterial({
    map: tex, transparent: true, vertexColors: true,
    depthWrite: false, fog: false, side: THREE.DoubleSide,
  })))
  mesh.frustumCulled = false
  mesh.renderOrder = -15          // 원경 띠보다 앞, 나머지보다 뒤

  const field = makeCloudField()

  const write = () => {
    let q = 0
    for (const c of field.clouds) {
      const fade = field.fadeOf(c)
      for (const p of c.puffs) {
        const s = p.s / 2
        const cx = c.x + p.dx * p.s, cy = c.y + p.dy * p.s
        const b = q * 12
        pos[b + 0] = cx - s; pos[b + 1] = cy - s; pos[b + 2] = c.z
        pos[b + 3] = cx + s; pos[b + 4] = cy - s; pos[b + 5] = c.z
        pos[b + 6] = cx + s; pos[b + 7] = cy + s; pos[b + 8] = c.z
        pos[b + 9] = cx - s; pos[b + 10] = cy + s; pos[b + 11] = c.z
        for (let v = 0; v < 4; v++) {
          const k = q * 16 + v * 4
          col[k] = col[k + 1] = col[k + 2] = 1
          col[k + 3] = p.a * fade
        }
        q++
      }
    }
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
  }
  write()

  return {
    mesh,
    /** @param {number} dz 이번 프레임에 달린 거리 */
    update(dz) { field.advance(dz); write() },
    dispose() { geo.dispose(); tex.dispose(); mesh.material.dispose() },
  }
}

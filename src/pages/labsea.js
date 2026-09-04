// /lab-sea — 오디세이 런 **바다+배 프로토타입**. 개발용이다.
//
// ── 왜 정식 게임으로 안 만들고 여기서 먼저 보나 ★ ────────────────
//
// `runner3d/scene.js`·`backdrop.js`·`models.js`·`props.js`는 전부 쥬라기
// 테마가 하드코딩돼 있다(공룡·화산·정글 그림·모델을 직접 가리킨다) — 2D
// 러너들처럼 `theme.json` 하나로 갈아 끼우는 구조가 아직 아니다. 오디세이
// 런을 정식 게임으로 붙이려면 그 넷을 먼저 테마 데이터를 받게 뜯어고쳐야
// 하는데, 그건 "물이 괜찮아 보이는지" 확인보다 몇 배 큰 일이다.
//
// `#/lab3d`가 쥬라기 에셋을 발주하기 전에 도형으로 먼저 곡률·성능을 쟀던
// 것과 같은 이유로, 이 화면도 **도형만으로** 셋을 먼저 본다.
//
//   ① 물이 "달리는(흐르는) 느낌"이 나는가 — `runner3d/water.js`
//   ② 로프로 나눈 레인에서 큐브 피하기가 육지 러너와 같은 느낌인가
//   ③ 성능 — 물 정점 셰이더 + 곡률을 같이 얹어도 fps가 버티는가
//
// 셋 다 통과하면 그때 테마 데이터를 갈아 끼우는 리팩터를 한다. 지금은
// 카메라도 안 켠다 — 조종은 키보드 좌우뿐이다(레인 이동 자체는 기존
// 러너와 똑같은 3레인이라 새로 검증할 게 없다). 로우(노 젓기) 감지기는
// 여기서는 안 쓴다(9/3 확정: 동작은 전진에 영향을 안 주고 운동 지표로만
// 카운트되므로, 조종 자체는 그대로 3레인 회피다) — 그건 `#/lab`에서 따로 잰다.

import * as THREE from 'three'
import { onLeave, navigate } from '../core/router.js'
import { icon } from '../core/icons.js'
import { playerSkin } from '../core/playerSkin.js'
import { CURVE, applyCurve, kFromRadius, dropAt, horizonDistance } from '../games/runner3d/curve.js'

export async function labseaPage(app) {
  app.innerHTML = `
    <style>
      #ls, #ls * { box-sizing: border-box; }
      #ls {
        position: fixed; inset: 0; overflow: hidden;
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff; background: #052033;
      }
      #ls-cv { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
      #ls-ui {
        position: absolute; left: 0; top: 0; z-index: 5;
        display: flex; flex-direction: column; gap: 8px;
        padding: 12px; width: min(340px, 92vw);
      }
      .ls-card {
        background: rgba(5,20,40,0.78); backdrop-filter: blur(8px);
        border: 2px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 12px 14px;
      }
      .ls-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 6px 0; }
      .ls-row .k { font-size: 0.78rem; color: #7dd3fc; font-weight: 800; }
      .ls-row .v { font-size: 1.05rem; font-weight: 900; font-variant-numeric: tabular-nums; }
      .v.ok { color: #6ee75a; } .v.bad { color: #ff6b6b; } .v.warn { color: #ffb36b; }
      .ls-btn {
        display: inline-flex; align-items: center; gap: 6px;
        min-height: 40px; padding: 0 14px; border-radius: 9999px;
        background: rgba(255,255,255,0.12); color: #fff; border: 2px solid rgba(255,255,255,0.24);
        font: inherit; font-weight: 800; font-size: 0.82rem; cursor: pointer;
      }
      #ls-slider, #ls-spd { width: 100%; accent-color: #38bdf8; }
      #ls-note { font-size: 0.72rem; color: #8fb8d9; line-height: 1.5; }
      #ls-top { position: absolute; right: 12px; top: 12px; z-index: 6; }
      #ls-flash {
        position: absolute; inset: 0; z-index: 4; pointer-events: none;
        background: radial-gradient(120% 90% at 50% 60%, transparent 40%, rgba(255,60,60,0.55));
        opacity: 0; transition: opacity 0.25s;
      }
      #ls-flash.on { opacity: 1; transition: opacity 0.05s; }
      #ls-flash.avoid { background: radial-gradient(120% 90% at 50% 60%, transparent 40%, rgba(60,255,150,0.35)); }
    </style>

    <div id="ls">
      <canvas id="ls-cv"></canvas>
      <div id="ls-top">
        <button class="ls-btn" id="ls-back">${icon('back')} 나가기</button>
      </div>
      <div id="ls-flash"></div>
      <div id="ls-ui">
        <div class="ls-card">
          <div class="ls-row"><span class="k">렌더 FPS</span><span class="v" id="ls-fps">–</span></div>
          <div class="ls-row"><span class="k">draw call</span><span class="v" id="ls-dc">–</span></div>
          <div class="ls-row"><span class="k">삼각형</span><span class="v" id="ls-tri">–</span></div>
        </div>
        <div class="ls-card">
          <div class="ls-row"><span class="k">휨 (보이는 반지름)</span><span class="v" id="ls-r">–</span></div>
          <input type="range" id="ls-slider" min="60" max="900" step="10" value="900" />
          <div id="ls-note"></div>
        </div>
        <div class="ls-card">
          <div class="ls-row"><span class="k">레벨 (속도·코스)</span><span class="v" id="ls-speed">LV1 · 1.00</span></div>
          <input type="range" id="ls-spd" min="0" max="4" step="1" value="0" />
          <div style="font-size:0.72rem; color:#8fb8d9; margin-top:8px">
            ← → 레인 이동 · 스페이스바 — 점프(소용돌이 피하기) · ↓ — 숙이기
            (번개 다리 피하기). 진짜 코스 데이터(runner/game/course.js)를
            그대로 쓴다 — 육지 러너와 같은 판이다.
          </div>
        </div>
        <div class="ls-card">
          <div class="ls-row"><span class="k">인어·신상 방향</span><span class="v" id="ls-rot">–</span></div>
          <div style="font-size:0.72rem; color:#8fb8d9; line-height:1.5">
            1 / 2 — 인어 15°씩 돌리기<br>
            3 / 4 — 신상 15°씩 돌리기<br>
            정면이 보이는 값을 찾으면 그 숫자를 알려 주면 코드에 그대로 박는다.
          </div>
        </div>
      </div>
    </div>
  `

  const $ = s => app.querySelector(s)
  const cv = $('#ls-cv')

  // 게임 모듈은 **여기서만** 부른다. 정적으로 import하면 허브 번들에 들어간다.
  // three 자체는 이 파일이 이미 라우터의 동적 import 뒤에서만 불려서(DEV 전용
  // 라우트) 정적으로 import해도 허브 번들에는 안 들어간다 — `water.js` 등
  // 다른 runner3d 파일들과 같은 방식이다.
  const { createWater, PALETTE } = await import('../games/runner3d/water.js')
  const { PropRow } = await import('../games/runner3d/props.js')
  const { rowSpots } = await import('../games/runner3d/layout.js')
  const { buildCourse3d, visibleEvents, assignCubeLane, eventX, atHit } =
    await import('../games/runner3d/course3d.js')
  const { laneX, CHAR } = await import('../games/runner3d/character.js')
  const { UNITS_PER_SPEED } = await import('../games/runner3d/scene.js')
  const { TRACK_W } = await import('../games/runner3d/ground.js')
  // 하늘만 빌린다 — 능선·화산은 육지 테마 것이라 바다에는 안 어울린다
  // (`backdrop.js`의 `art`·`groundColor`·`smoke` 옵션, 9/3에 새로 열었다).
  const { createBackdrop, createClouds, PANORAMA, BACKDROP_ART } = await import('../games/runner3d/backdrop.js')
  // 육지의 `extrudeStrips`(연석)와 같은 역할 — 도형 몇 개를 한 지오메트리로
  // 합쳐 draw call을 하나로 묶는다. 육지는 손으로 짠 띠라 직접 만들었지만,
  // 부표·돌고래·섬은 기본 도형 몇 개를 이어 붙이면 되니 three가 이미 들고
  // 있는 병합 유틸을 쓴다(`models.js`가 GLTFLoader를 그때그때 받는 것과
  // 같은 방식 — 이 화면에 처음 필요해졌을 때만 받는다).
  const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
  // 배경 GLB 로더(로드+정규화+PropRow 배치) — `labisland.js`와 공유하는
  // 공용 모듈이다(`glbProp.js` 참고). `_` 접두사는 아래에서 이 화면의
  // `withCurve`/`scene`/`pageLeft`를 미리 발라 둔 얇은 래퍼로 감쌀 것임을
  // 표시한다.
  const { loadNormalizedGlb: _loadNormalizedGlb, loadBgGlbProp: _loadBgGlbProp } =
    await import('../games/runner3d/glbProp.js')
  // 점프 판정 — 육지 러너가 이미 쓰는 순수 함수(`judge.js`)를 그대로 쓴다.
  // `hurdleLow`("낮다, 점프로 넘는다") 규칙을 이 화면에서 다시 정의하지 않는다.
  const { judge, RESULT } = await import('../games/runner3d/judge.js')

  // ── 렌더러·카메라 — `scene.js`의 VIEW 값과 맞춘다 ──
  // 육지 구간과 카메라가 같아야 두 구간을 오갈 때 눈높이가 안 튄다.
  const VIEW = { camHeight: 6, camBack: 10, camLookAhead: 26, viewWidth: 19, fovMin: 50, fovMax: 70, far: 130 }
  const fovFor = aspect => {
    const tanH = (VIEW.viewWidth / 2) / VIEW.camBack
    const fov = 2 * Math.atan(tanH / aspect) * 180 / Math.PI
    return Math.min(VIEW.fovMax, Math.max(VIEW.fovMin, fov))
  }

  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1))
  renderer.toneMapping = THREE.NoToneMapping

  const scene = new THREE.Scene()
  // 배경색은 **원경 띠의 윗끝 색과 같게** 둔다(`scene.js`와 같은 이유) —
  // 띠 위로 삐져나오는 하늘이 있어도 이어져 보인다. 다르면 거기 가로선이 생긴다.
  scene.background = new THREE.Color(PANORAMA.skyTop)
  scene.fog = new THREE.Fog(new THREE.Color(PANORAMA.skyHorizon), 90, 130)

  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, VIEW.far)
  camera.position.set(0, VIEW.camHeight, VIEW.camBack)
  camera.lookAt(0, VIEW.camHeight * 0.45, -VIEW.camLookAhead)

  const kUniform = { value: CURVE.k }

  // 곡률은 `curve.js`의 `applyCurve`를 그대로 쓴다 — 처음엔 이 파일 안에
  // 따로 `applyCurveOnly`를 두고 있었는데, `water.js`가 곡률+잔물결을 한
  // 함수에 같이 심어야 하는 이유(`onBeforeCompile`은 하나만 걸린다)는 여기
  // 재질들(로프·부표·돌고래·섬·배 배경물)엔 해당이 없다 — 다 곡률 하나뿐이라
  // 그냥 공용 함수를 부르면 된다. 복사해 둘 이유가 없었다(`scene.js`의
  // `withCurve` 변수와 같은 이름·같은 모양으로 맞췄다).
  const withCurve = m => applyCurve(m, kUniform)

  // ── 원경 하늘 — 쥬라기 하늘 그림만 빌린다 ──
  //
  // ken 요청(9/3): "하늘 배경도 일단 쥬라기에 적용된 하늘 배경도 넣어보자."
  // `backdrop.js`의 원통 띠는 원래 능선·화산까지 같이 그리는데, 그 둘은
  // 육지 테마 그림이라 바다 한가운데 떠 있으면 안 어울린다. 오늘(9/3) 그
  // 파일에 `art`·`groundColor`·`smoke` 옵션을 새로 열어서, 하늘 한 장만
  // 쓰고 나머지는 뺄 수 있게 했다 — 기본값은 그대로라 쥬라기 쪽은 한 글자도
  // 안 바뀐다. 지면선 아래는 잔디 대신 물빛으로 채운다.
  const backdrop = createBackdrop({
    camHeight: VIEW.camHeight, camBack: VIEW.camBack, k: kUniform.value,
    art: { sky: BACKDROP_ART.sky },
    groundColor: '#1f6fb8',
    smoke: false,
  })
  scene.add(backdrop.group)

  // ── 구름 — 어두운 톤으로, 하늘을 가로질러 지나간다 ──
  // ken 요청(9/3): "어두운 톤의 구름들도 하늘에 떠서 지나가게 만들어줘."
  // `backdrop.js`의 `createClouds`는 이미 테마를 안 타는 공용 모듈이다
  // (그림 파일 없이 흰 퍼프를 정점 색으로 물들이는 방식) — 여기서 처음
  // `tint` 옵션을 추가했고(기본 흰색, 쥬라기는 그대로), 오디세이는 짙은
  // 남회색을 넘긴다. 배치·흐름(다가오는 방향으로 스치듯 지나가기)은
  // `createClouds` 안에 이미 있어 새로 짤 게 없었다.
  const clouds = createClouds(withCurve, '#4b5568')
  scene.add(clouds.mesh)

  // ── 비 — 카메라가 안 움직이는 화면이라 세계 좌표에 그냥 흩뿌려도 된다 ──
  // ken 요청(9/3): "번개 치고, 비오는 효과도 좀 넣어줘." 곡률을 안 준다
  // (`withCurve` 안 씀) — 비는 트랙 바닥이 아니라 대기 현상이라 휘어질
  // 이유가 없다. 빗방울 하나 = 선분 하나(`LineSegments`) — 점보다 빗줄기
  // 느낌이 난다. 전부 한 지오메트리라 draw call은 여전히 1개다.
  const RAIN_N = 420
  const RAIN_BOX = { xz: 16, yTop: 18, yBot: -0.2, zNear: VIEW.camBack, zSpan: 40 }
  const RAIN_SPEED = 22
  const rainGeo = new THREE.BufferGeometry()
  const rainPos = new Float32Array(RAIN_N * 2 * 3)
  const dropAtIdx = (arr, i, y) => {
    const b = i * 6
    const x = (Math.random() * 2 - 1) * RAIN_BOX.xz
    const z = RAIN_BOX.zNear - Math.random() * RAIN_BOX.zSpan
    arr[b] = x; arr[b + 1] = y; arr[b + 2] = z
    arr[b + 3] = x + 0.05; arr[b + 4] = y - 0.55; arr[b + 5] = z   // 살짝 기운 짧은 스트릭
  }
  for (let i = 0; i < RAIN_N; i++) {
    dropAtIdx(rainPos, i, RAIN_BOX.yBot + Math.random() * (RAIN_BOX.yTop - RAIN_BOX.yBot))
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
  const rainMat = new THREE.LineBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.5, fog: true })
  const rain = new THREE.LineSegments(rainGeo, rainMat)
  rain.frustumCulled = false
  scene.add(rain)

  function updateRain(dt) {
    const arr = rainGeo.attributes.position.array
    for (let i = 0; i < RAIN_N; i++) {
      const b = i * 6
      const fall = RAIN_SPEED * dt
      arr[b + 1] -= fall
      arr[b + 4] -= fall
      if (arr[b + 1] < RAIN_BOX.yBot) dropAtIdx(arr, i, RAIN_BOX.yTop)   // 다시 위에서 — 자리도 새로 뽑는다
    }
    rainGeo.attributes.position.needsUpdate = true
  }

  // ── 번개 — 화면 플래시 대신 **하늘에 지그재그 선**을 잠깐 그린다 ──
  // ken 정정(9/3): "화면이 깜빡거리게 하는 것은 빼줘, 오류난 거 같아.
  // 하늘 배경에서 전기 흐르듯 효과를 줬으면 좋겠어. 번개 효과음과 함께."
  // — 전체 화면을 덮는 오버레이(`#ls-lightning`, 이제 지웠다)가 아니라,
  // 실제로 씬 안에 번개 모양 선을 세운다. 매번 모양·자리를 새로 뽑아서
  // 같은 번개가 두 번 안 친다 — 각도의 다중 사인 대신 **누적 랜덤워크**로
  // 지그재그를 만든다(섬 해안선의 `jitterRadial`과 달리 닫힌 도형이
  // 아니라 매번 달라야 더 "번개답다"). 곁가지 하나를 더해 한 줄기만
  // 치는 밋밋함을 없앴다. 가산 합성 + `depthWrite:false`로 그려서
  // (`runner3d/portal.js`의 문과 같은 이유 — 빛으로 그린 것은 깊이를
  // 안 쓴다) 뒤의 구름·하늘을 가리지 않고 얹힌다.
  const boltMat = new THREE.LineBasicMaterial({
    color: '#eaf3ff', transparent: true, opacity: 0.95, fog: false,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const boltGroup = new THREE.Group()
  boltGroup.visible = false
  boltGroup.renderOrder = 6   // 구름(-15)보다 위 — 항상 구름 앞에서 번쩍인다
  scene.add(boltGroup)

  function jaggedLine(x0, yTop, yBot, spread, steps) {
    const pts = []
    let x = x0
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const y = yTop + (yBot - yTop) * t
      if (i > 0 && i < steps) x += (Math.random() - 0.5) * spread
      pts.push(new THREE.Vector3(x, y, -70))   // 구름과 비슷한 깊이 — 하늘에 떠 보인다
    }
    return pts
  }
  function clearBolt() {
    while (boltGroup.children.length) {
      const line = boltGroup.children.pop()
      line.geometry.dispose()   // 매번 새로 만드니 쌓이지 않게 바로 지운다
    }
  }
  function spawnBolt() {
    clearBolt()
    const x0 = (Math.random() * 2 - 1) * 40
    const main = jaggedLine(x0, 46, 14, 3.2, 10 + Math.floor(Math.random() * 4))
    boltGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(main), boltMat))
    // 곁가지 — 몸통 위쪽 어딘가에서 짧게 갈라져 나간다
    const from = main[2 + Math.floor(Math.random() * 3)]
    const branch = jaggedLine(from.x, from.y, from.y - 10, 2.4, 4)
    boltGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(branch), boltMat))
  }

  const lightningTimers = []
  let lightningWait = 4 + Math.random() * 6
  function strikeLightning() {
    spawnBolt()
    boltGroup.visible = true
    // 실제 번개처럼 짧게 두 번 — 켜짐 90ms → 꺼짐 80ms → 켜짐(모양 다시
    // 뽑기) 90ms → 꺼짐. 효과음(크랙+우르릉)은 뺐다(ken 요청 9/3: "탁탁
    // 소리가 자꾸 나, 빼줘" — 4~10초마다 반복되는 이 크랙 소리였다.
    // 빗소리에 이어 이 화면의 마지막 남은 효과음도 없어졌다).
    lightningTimers.push(setTimeout(() => { boltGroup.visible = false }, 90))
    lightningTimers.push(setTimeout(() => { spawnBolt(); boltGroup.visible = true }, 170))
    lightningTimers.push(setTimeout(() => { boltGroup.visible = false }, 260))
  }

  // ── 부표·돌고래가 같이 쓰는 색칠 도우미 ──
  // 실시간 조명이 없는 예산 규율이라(`CLAUDE.md`) 색은 텍스처 대신 정점에
  // 직접 굽는다 — `ground.js`의 연석과 같은 발상이다.
  const paintFlat = (geo, hex) => {
    const c = new THREE.Color(hex)
    const n = geo.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    return geo
  }
  /** y로 두 색을 섞는다 — 돌고래 등(짙게)·배(밝게) 같은 그러데이션에 쓴다. */
  const paintGradientY = (geo, topHex, bottomHex) => {
    const top = new THREE.Color(topHex), bottom = new THREE.Color(bottomHex)
    const pos = geo.attributes.position
    let minY = Infinity, maxY = -Infinity
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const range = Math.max(1e-6, maxY - minY)
    const arr = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const tt = (pos.getY(i) - minY) / range
      arr[i * 3] = THREE.MathUtils.lerp(bottom.r, top.r, tt)
      arr[i * 3 + 1] = THREE.MathUtils.lerp(bottom.g, top.g, tt)
      arr[i * 3 + 2] = THREE.MathUtils.lerp(bottom.b, top.b, tt)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    return geo
  }
  // ── 물 ──
  const water = createWater(kUniform, { width: 140, length: 182 })
  scene.add(water.mesh)

  // ── 레인 로프 — 육지의 연석 자리와 같은 x(트랙 폭 5×3=15의 절반=7.5 안쪽,
  // 레인 경계는 ±2.5) ──
  function ropeTexture() {
    const S = 64
    const cvs = document.createElement('canvas'); cvs.width = 16; cvs.height = S
    const g = cvs.getContext('2d')
    g.fillStyle = '#0b2f52'; g.fillRect(0, 0, 16, S)
    const stripe = S / 8
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#ffffff' : '#1f6fb8'
      g.fillRect(0, i * stripe, 16, stripe)
    }
    const t = new THREE.CanvasTexture(cvs)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1, 60)
    return t
  }
  const ropeMap = ropeTexture()
  const ropeMat = new THREE.MeshBasicMaterial({ map: ropeMap, fog: true })
  withCurve(ropeMat)
  const ropeGeo = new THREE.PlaneGeometry(0.35, 182, 1, 80)
  const ropes = [-2.5, 2.5].map(x => {
    const m = new THREE.Mesh(ropeGeo, ropeMat)
    m.rotation.x = -Math.PI / 2
    m.position.set(x, 0.06, -182 * 0.45)
    m.frustumCulled = false
    return m
  })
  for (const r of ropes) scene.add(r)

  // ── 부표 — 로프 바깥, "여기부터는 트랙 밖"을 표시하는 경계물 ──
  //
  // 육지 러너는 연석(턱이 있는 상자)으로 트랙과 잔디를 가른다(`ground.js`:
  // "길에는 턱이 있어야 길이다, 안 그러면 잔디에 인쇄된 무늬로 보인다").
  // 물에는 턱을 세울 수 없으니 — ken 제안대로 **부표**로 같은 역할을 시킨다.
  // 로프 라인 위에 규칙적으로 찍는 대신(그러면 표지가 아니라 또 하나의
  // 줄무늬가 된다) 로프 조금 바깥, 열린 바다 쪽에 흩어 세워서 "이 라인
  // 바깥은 바다"를 몸으로 알려준다 — 육지의 야자수·바위가 트랙 바깥에서
  // 하는 일과 같다.
  //
  // 배치는 `props.js`의 `PropRow`를 그대로 쓴다 — 되돌리기·겹침 회피가
  // 이미 있는데 새로 짤 이유가 없다(`layout.js`: 자리는 한 곳에서 관리한다).
  // `bob`만 새로 켰다(9/3) — 물 위에 뜬 것이니 가만히 서 있으면 "떠 있는
  // 스티커"로 보인다(`CLAUDE.md`: 오브젝트는 바닥에 붙어 있어야 한다 —
  // 물에서는 그 "바닥"이 출렁여야 한다는 뜻이다). 물결처럼 정확히
  // 맞물리진 않지만(부표 위치의 실제 물결 높이를 정점 셰이더 밖에서는
  // 모른다), 물건마다 다른 위상으로 까딱이는 것만으로도 "얹혀 있다"는
  // 인상은 충분히 난다 — 다 같은 박자면 그거야말로 기계로 보인다.
  function buoyGeometry() {
    // 몸통 아래(빨강, 물에 살짝 잠긴다) → 몸통 위(흰색) → 기둥 → 꼭대기 표식.
    const lower = paintFlat(new THREE.CylinderGeometry(0.42, 0.5, 0.32, 8), '#e6402f')
    lower.translate(0, 0.01, 0)
    const upper = paintFlat(new THREE.CylinderGeometry(0.34, 0.42, 0.26, 8), '#f4f4f4')
    upper.translate(0, 0.30, 0)
    const pole = paintFlat(new THREE.CylinderGeometry(0.035, 0.04, 0.55, 6), '#cfd6da')
    pole.translate(0, 0.705, 0)
    const cap = paintFlat(new THREE.SphereGeometry(0.085, 8, 6), '#ffb020')
    cap.translate(0, 1.065, 0)
    return mergeGeometries([lower, upper, pole, cap], false)
  }
  const buoyGeo = buoyGeometry()
  const buoyMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })
  withCurve(buoyMat)
  const BUOY_SPAN = 182   // 물·로프와 같은 주기 — 다른 값을 주면 셋이 서로 다른 박자로 흘러 어색하다
  // ★ 9/3 — ken 지적: "부표를 더 넓혀야 할 거 같아. 트랙을 3분할로
  // 나눠야 하니까!" 처음엔 로프(±2.5, 가운데 레인 하나의 경계) 바로
  // 바깥에 세웠는데, 그러면 부표가 3레인 전체가 아니라 가운데 레인만
  // 감싸는 것처럼 보인다. 트랙 전체 폭(`TRACK_W`)의 바깥 끝으로 옮긴다 —
  // 부표 반지름(0.55)만큼 여유를 더한 자리다.
  const buoyRows = [-1, 1].map(side => new PropRow({
    geometry: buoyGeo, material: buoyMat, count: 12, span: BUOY_SPAN,
    side, near: TRACK_W / 2 + 0.6, spread: 1.6, radius: 0.55,
    bob: { amp: 0.06, rate: 1.3 },
  }))
  for (const r of buoyRows) scene.add(r.mesh)

  // ── 돌고래 — 물 밖으로 튀어오르는 배경 생물 ──
  //
  // ken 요청(9/3): "돌고래도 만들수 있어? 물속에서 위로 점프하는 동작도
  // 넣으면 좋겠는데." `PropRow`의 `bob`(사인파 하나)로는 "대부분 물 아래
  // 숨어 있다가 이따금 포물선을 그리며 튀어오르는" 비대칭 동작을 못
  // 낸다 — 그래서 여기서만 쓰는 `LeapingRow`를 새로 짰다(`props.js`에
  // 얹지 않았다 — 아직 이 동작을 쓰는 게 여기 하나뿐이라, 두 번째로
  // 필요해지면 그때 올린다. 과도한 공용화를 미리 하지 않는다).
  //
  // 배치(자리 고르기·되돌리기)는 그대로 `layout.js`의 `rowSpots`를 쓴다 —
  // 애니메이션만 다르지 "물건을 겹치지 않게 흩어 세우는 문제"는 부표·
  // 육지 프롭과 같아서 새로 풀 이유가 없다.
  function dolphinGeometry() {
    // 몸통 — 길쭉하게 늘인 타원체. +z가 코, -z가 꼬리(`DinoRow`와 같은
    // 약속 — 나는/헤엄치는 것은 다가오는 쪽인 +z를 본다).
    // ★ 9/3 — ken이 "고래도 크기 키워줘"라고 해서 반지름을 0.5→0.68로,
    // 부품 자리도 그만큼 다시 맞췄다.
    const body = new THREE.SphereGeometry(0.68, 12, 9)
    body.scale(0.36, 0.36, 0.95)
    paintGradientY(body, '#7c8fa3', '#f3f6f8')   // 등 회청색 → 배 흰색
    const nose = new THREE.ConeGeometry(0.13, 0.42, 8)
    nose.rotateX(Math.PI / 2)
    nose.translate(0, 0, 0.83)
    paintFlat(nose, '#7c8fa3')
    // 등지느러미 — 3면 콘을 얇게 눌러 낫 모양 실루엣을 낸다.
    const fin = new THREE.ConeGeometry(0.16, 0.34, 3)
    fin.scale(1, 1, 0.35)
    fin.rotateZ(-0.35)
    fin.translate(0, 0.42, -0.03)
    paintFlat(fin, '#5c7086')
    // 꼬리지느러미 — **가로로 눕는다**(물고기와 달리 돌고래는 수평 플루크다.
    // 세로로 세우면 몸통 실루엣만으로는 물고기와 구별이 안 간다).
    const fluke = new THREE.BoxGeometry(0.6, 0.045, 0.21)
    fluke.translate(0, 0, -0.75)
    paintFlat(fluke, '#5c7086')
    return mergeGeometries([body, nose, fin, fluke], false)
  }
  const dolphinGeo = dolphinGeometry()
  const dolphinMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })
  withCurve(dolphinMat)

  class LeapingRow {
    /** @param {{cycle:number, dur:number, height:number, submerge:number, tiltMax:number}} jump */
    constructor({ geometry, material, count, span, side, near, spread, radius, scale = 1, jump, rnd = Math.random }) {
      this.span = span
      this.jump = jump
      this.t = 0
      this.mesh = new THREE.InstancedMesh(geometry, material, count)
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.mesh.frustumCulled = false
      this.items = rowSpots({ count, span, side, near, spread, radius, scale, rnd }).map(p => ({
        ...p,
        phase: rnd() * jump.cycle,
        // 살짝만 흔든다 — 나아가는 방향(+z)에서 크게 벗어나면 옆으로
        // 헤엄치는 것처럼 보인다(`DinoRow`가 나는 것에 쓰는 것과 같은 폭).
        rot: (rnd() - 0.5) * 0.5,
      }))
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion()
      this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._e = new THREE.Euler()
      this.sync()
    }

    update(dz, behind, dt) {
      this.t += dt
      for (const it of this.items) {
        it.z += dz
        while (it.z > behind) it.z -= this.span
      }
      this.sync()
    }

    sync() {
      const J = this.jump
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i]
        const ph = (this.t + it.phase) % J.cycle
        let y, pitch
        if (ph < J.dur) {
          // 포물선 — 뛰어오르는 순간(u=0)엔 0, 정점(u=0.5)에서 최고, 다시
          // 물에 닿는 순간(u=1)엔 0으로 돌아온다.
          const u = ph / J.dur
          y = Math.sin(Math.PI * u) * J.height
          // 코가 올라갈 때는 위를, 내려갈 때는 아래를 향한다.
          pitch = (0.5 - u) * 2 * J.tiltMax
        } else {
          y = J.submerge   // 물 아래 — 물 판(depth test) 뒤로 가려 안 보인다
          pitch = 0
        }
        this._v.set(it.x, y, it.z)
        this._e.set(pitch, it.rot, 0)
        this._q.setFromEuler(this._e)
        this._s.setScalar(it.s)
        this._m.compose(this._v, this._q, this._s)
        this.mesh.setMatrixAt(i, this._m)
      }
      this.mesh.instanceMatrix.needsUpdate = true
    }

    dispose() { this.mesh.geometry.dispose(); this.mesh.dispose() }
  }

  const DOLPHIN_JUMP = { cycle: 5.5, dur: 1.1, height: 1.7, submerge: -1.1, tiltMax: 0.55 }
  const dolphinRows = [-1, 1].map(side => new LeapingRow({
    geometry: dolphinGeo, material: dolphinMat, count: 4, span: BUOY_SPAN,
    side, near: 11, spread: 8, radius: 1.1, scale: 1.3, jump: DOLPHIN_JUMP,
  }))
  for (const r of dolphinRows) scene.add(r.mesh)

  // ── 배(플레이스홀더) — 이건 **아이가 타는 배**다 ──
  // 진짜 모델이 오기 전까지 도형이다. ken이 보낸 GLB는 이 배가 아니라
  // 좌우 배경물이다(바로 아래 절 참고) — 처음엔 여기 낄 줄 알고 잘못
  // 꽂았었다.
  const boatGroup = new THREE.Group()
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.6, 3.6),
    new THREE.MeshBasicMaterial({ color: '#8a5a2e' }),
  )
  hull.position.y = 0.3
  const mast = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 1.8, 0.15),
    new THREE.MeshBasicMaterial({ color: '#5c3d1e' }),
  )
  mast.position.set(0, 1.5, -0.6)
  boatGroup.add(hull, mast)
  boatGroup.position.set(0, 0, 0)
  scene.add(boatGroup)

  let pageLeft = false   // 로드가 끝나기 전에 화면을 나가면 씬을 더 안 건드린다 — 배+GLB 로더가 같이 쓴다

  // ── 배+캐릭터 빌보드 — ken이 준 2컷으로 상자를 대신한다 ──
  //
  // ken 요청(9/3): 오디세우스와 아이가 함께 탄 배를 뒤에서 본 합성
  // 그림 2장(노를 든 컷·노를 물에 담근 컷)을 주며 "노 저으며 달리는
  // 모습을 이 2컷으로 적용 가능할까?" — `character.js`의 달리기
  // 애니메이션과 같은 발상이다. 그림이 열한 장에서 두 장으로 준 것뿐,
  // 아틀라스 한 장 + UV 오프셋만 옮기는 방식은 그대로 재사용한다.
  //
  // **박스 대신 완전히 바꿔 끼우는 것이 아니라 위에 얹는다** — 이미지
  // 로드가 비동기라 실패(또는 아직 없는 스킨)해도 화면이 안 비게
  // 하려면 상자를 그대로 두는 편이 안전하다(`scene.js`가 GLB 오기
  // 전엔 도형을 쓰는 것과 같은 규율). 로드에 성공하면 상자를 숨기고
  // 빌보드를 켠다.
  //
  // ken이 확인해 준 것(9/3): 이 그림엔 오디세우스와 아이가 **같이**
  // 들어 있어서, 아이가 고른 프로필(소년/소녀)에 따라 그림 전체를
  // 다시 그려야 한다 — "소녀 버전도 필요"로 확정했다. 아직 소년
  // 그림만 받아서, 스킨별 폴더(`boat_char/<skin>/`, `character.js`의
  // `_shared/char/<skin>/`와 같은 구조)로 미리 만들어 두고
  // `playerSkin()`으로 고른다 — 소녀 그림이 도착하면 같은 파일명으로
  // `boat_char/girl/`에 넣기만 하면 된다. 지금은 못 찾으면(404)
  // 조용히 상자로 남는다(`character.js`의 `setCarrying`과 같은 태도 —
  // 그림이 없다고 화면이 멈추면 안 된다).
  const BOAT_CHAR = {
    height: 3.6,     // 유닛 — 상자+돛대(약 3.3)와 비슷한 눈대중. 아직 눈으로 확인 전
    rowFps: 2.2,      // 저었다 뺐다 한 번 = 초당 몇 번. 달리기(12fps)보다 훨씬 느리다 — 이것도 눈대중
  }
  let boatChar = null   // 로드 성공하면 채워진다 — dispose는 onLeave가 같이 한다
  async function loadImage(url) {
    return new Promise((res, rej) => {
      const im = new Image()
      im.onload = () => res(im)
      im.onerror = () => rej(new Error(`[lab-sea] 이미지 없음: ${url}`))
      im.src = url
    })
  }
  async function loadBoatCharacter() {
    const skin = playerSkin()
    const base = `/assets/runner3d/_lab/boat_char/${skin}/`
    let up, pull
    try {
      ;[up, pull] = await Promise.all([loadImage(base + 'row_up.png'), loadImage(base + 'row_pull.png')])
    } catch (e) {
      console.warn(e.message)   // 소녀 그림이 아직 없으면 여기로 온다 — 상자를 그대로 둔다
      return
    }
    if (pageLeft) return
    // 두 컷을 가로로 이어 붙인다(`character.js`의 buildAtlas와 같은 이유 —
    // 컷마다 텍스처를 갈아 끼우면 바인딩이 그때마다 바뀐다).
    const cellW = Math.max(up.naturalWidth, pull.naturalWidth)
    const cellH = Math.max(up.naturalHeight, pull.naturalHeight)
    const cv = document.createElement('canvas')
    cv.width = cellW * 2
    cv.height = cellH
    const g = cv.getContext('2d')
    g.drawImage(up, 0, cellH - up.naturalHeight)
    g.drawImage(pull, cellW, cellH - pull.naturalHeight)
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.repeat.set(0.5, 1)
    tex.anisotropy = 4

    const mat = withCurve(new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, alphaTest: 0.35, fog: true,
    }))
    const H = BOAT_CHAR.height
    const ratio = cellW / cellH
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(H * ratio, H), mat)
    mesh.position.y = H / 2   // 바닥(뱃바닥)이 waterline(y=0)에 붙게
    mesh.frustumCulled = false
    boatGroup.add(mesh)
    hull.visible = false; mast.visible = false   // 상자는 숨기고 남겨 둔다 — dispose는 onLeave에서 한 번에

    boatChar = { tex, mat, mesh, geo: mesh.geometry }
  }
  loadBoatCharacter()

  // ── 배경 GLB 프롭 — 공용 로더 ──
  //
  // ken 정정(9/3): "배 glb 파일을 트랙에 넣는게 아니라 좌우 배경에
  // 들어갈 오브젝트야. 쥬라기 런에서 공룡 glb 오브젝트 에셋과 같은
  // 개념이야. 하나만 넣을게 아니고 반복적으로 넣는거지. 지금 섬처럼."
  // — 아이가 타는 배가 아니라, 섬·돌고래와 같은 층의 배경 프롭이다.
  // `scene.js`가 공룡 GLB를 쓰는 것과 똑같은 방식으로 바꿨다 — 지오메트리
  // (+텍스처)만 뽑아 `PropRow`로 여러 번 인스턴싱한다. 배 하나로 끝날
  // 줄 알았는데 록키 템플(9/3 추가)이 똑같은 순서를 또 밟게 돼서
  // 함수로 묶었고, 육지 구간(`labisland.js`)이 두 번째로 이 순서를
  // 또 밟게 되면서 `runner3d/glbProp.js`로 뺐다(구현은 그 파일 참고).
  const loadNormalizedGlb = (url, fitBy, target, onReady) =>
    _loadNormalizedGlb(url, fitBy, target, withCurve, onReady, { label: 'lab-sea', isAborted: () => pageLeft })
  const loadBgGlbProp = (url, fitBy, target, rowSpecs, rowsOut) =>
    _loadBgGlbProp(url, fitBy, target, withCurve, BUOY_SPAN, rowSpecs, rowsOut, scene, { label: 'lab-sea', isAborted: () => pageLeft })

  // 배 — 부표(8~9.7)보다 바깥, 돌고래(11~19)·록키 템플(26~44)과는 다른 층.
  // `faceTrack: true` — 배는 앞뒤가 뚜렷한 물건이라 아무렇게나 안
  // 돌린다(`props.js`의 화석 바위와 같은 이유). ken 요청(9/3): "현재
  // 적용된 배들도 크기 더 크게 키워줘" — 3.6 → 7.4. 커진 만큼 자리도
  // 넓혔다(15~23 → 16~28) — 록키 템플(26~)과 살짝 겹치는 폭이 생기지만,
  // z가 서로 다르게 흩어져 있어 화면에서는 층이 이어지는 것으로 읽힌다.
  const shipRows = []
  loadBgGlbProp('/assets/runner3d/_lab/ship_odyssey.glb', 'footprint', 7.4, [
    { count: 5, side: -1, near: 16, spread: 12, radius: 4.2, faceTrack: true },
    { count: 5, side: 1, near: 16, spread: 12, radius: 4.2, faceTrack: true },
  ], shipRows)

  // 록키 템플 — ken 업로드("이 섬 형태의 에셋도 넣어줘", "크기는 많이
  // 크게"). 원본은 57MB·196만 삼각형(Tripo AI, 무압축 2048 텍스처 3장) —
  // 이 저장소의 `tools/blender` 파이프라인과 같은 목적(정점 붙이기 →
  // 깎기 → 필요 없는 채널 버리기)을 gltf-transform으로 거쳐 3.9만
  // 삼각형·베이스컬러 1024 하나·1.3MB로 줄였다(붙이기 없이 그냥
  // 깎으면 이 저장소가 이미 겪은 "깨져 보인다"가 재현된다 — `weld`가
  // `remove_doubles`와 같은 역할). 먼바다 층(26~44)에, 크고 드문
  // 랜드마크로 둔다 — "큰 것은 두 마리만 보여도 무리로 읽힌다"
  // (`CLAUDE.md`)를 따라 좌우 각 2개뿐이다. (9/3 — 여기 있던 절차적
  // 섬 프롭은 ken이 빼 달라고 해서 지웠다, 록키 템플이 이 층의
  // 랜드마크 역할을 그대로 잇는다.)
  const templeRows = []
  loadBgGlbProp('/assets/runner3d/_lab/temple_odyssey.glb', 'height', 17, [
    { count: 2, side: -1, near: 26, spread: 18, radius: 6, faceTrack: true },
    { count: 2, side: 1, near: 26, spread: 18, radius: 6, faceTrack: true },
  ], templeRows)

  // 인어 — ken 업로드("mermaid... 좌우 배경 오브젝트, 크게 잘 적용해줘",
  // "모션이 들어가면 좋겠어, 살아있는 느낌 살려서"). 원본이 이미 가벼워서
  // (1.78MB·1만 삼각형, 텍스처 하나) 깎지 않고 텍스처만 배경 규격(1024)으로
  // 줄였다. **뼈대 없는 GLB라 부위별로 흔들 수 없다**(공룡처럼 몸통·꼬리를
  // 나눠 내보내려면 이 물건도 `tools/blender` 파이프라인이 있어야 하는데
  // 이 세션엔 Blender가 없다) — 대신 `PropRow`에 새로 추가한 `bob`+`sway`를
  // 같이 켜서 몸 전체가 둥실거리며 좌우로 트는 것으로 "살아있는 느낌"을
  // 낸다(저비용 대안, `props.js`의 `sway` 주석 참고). 돌고래(11~19)보다
  // 훨씬 크고 먼 층에 셋씩 — 파도 사이로 보이는 바다의 정령처럼.
  //
  // ken 지적(9/3): "등을 보여주지 말아줘, 웬만하면 정면이나 사용자
  // 쪽으로." `faceTrack`의 기준(rot=0)이 어느 쪽을 보는지는 glTF에
  // 정해진 축이 없어 **모델을 만든 쪽 마음이다** — 정면 텍스처 확인
  // 없이는 코드로 알 길이 없다. `0`도 `Math.PI`(180도)도 ken이 확인해
  // 보니 둘 다 등이었고, 그래서 STEP 44에서 추측을 멈추고 "1/2" 키
  // 조작(STEP 42)을 열어 뒀다 — ken이 새로고침 후 직접 돌려보며
  // **15도**에서 정면(웃는 얼굴·꼬리 옆으로)이 확실히 보이는 걸
  // 스크린샷으로 확인해 줬다. 그 값을 시작값으로 고정한다.
  let mermaidRotOffset = Math.PI / 12   // 15도 — ken이 조작 키로 직접 찾은 값
  const mermaidRows = []
  loadBgGlbProp('/assets/runner3d/_lab/mermaid_odyssey.glb', 'height', 10, [
    { count: 3, side: -1, near: 21, spread: 15, radius: 3, faceTrack: true, rotOffset: mermaidRotOffset,
      bob: { amp: 0.22, rate: 0.85 }, sway: { amp: 0.3, rate: 0.65 } },
    { count: 3, side: 1, near: 21, spread: 15, radius: 3, faceTrack: true, rotOffset: mermaidRotOffset,
      bob: { amp: 0.22, rate: 0.85 }, sway: { amp: 0.3, rate: 0.65 } },
  ], mermaidRows)

  // 록키 신상(god statue) — ken 업로드. "동상이니까 안 들어가도 돼"(모션
  // 없음)라 `bob`·`sway`를 안 준다 — 배경 프롭 중 유일하게 완전히
  // 정지해 있다. 원본 58MB·189만 삼각형을 록키 템플과 같은 방식으로
  // 처리했는데, 이 메시는 붙인 뒤에도 깎이는 게 더뎌서(경계가 많은
  // 조각상 — `tools/blender/import_ai.py`가 겪은 "경계 모서리를 못
  // 접는다"와 같은 현상) 8만5천 삼각형·4MB에서 멈췄다 — 그래도 원본의
  // 4.5%다. 신상답게 가장 크고(높이 20) 가장 드물다(좌우 각 1개,
  // 록키 템플보다도 바깥 층) — "큰 것은 두 마리만 보여도 무리로
  // 읽힌다"를 신상 하나로 더 밀어붙인 것이다.
  // 인어와 같은 이유·같은 사정 — ken이 "3/4" 키로 직접 돌려서
  // **75도**에서 얼굴이 보이는 걸 확인해 줬다(3/4 각도에 가깝다 —
  // 완전한 정면은 아니지만 등이 아니라 얼굴이 보이는 각도다). 더
  // 정면에 가깝게 다듬고 싶으면 화면에서 "3"/"4"로 더 미세 조정한다.
  //
  // ken 재확인(9/3): "우측에 있는 오브젝트는 여전히 등이랑 옆모습
  // 위주로 보이는 거 같아." 좌우 신상이 같은 `rotOffset`을 받는데도
  // 한쪽만 그래 보인 원인은 방향이 아니라 **지터**였다 — `faceTrack`은
  // 기준 각도에서 ±28.6도(`rotJitter` 기본 1.0라디안)를 흔드는데, 좌우가
  // 각각 `new PropRow(...)`라 독립된 난수를 뽑는다. 신상은 좌우 각
  // 1개뿐이라(반복이 아니라 랜드마크) "여러 개가 똑같아 보이는 걸
  // 막는다"는 지터의 원래 목적이 애초에 필요 없는데, 그 지터가 하필
  // 한쪽만 나쁜 방향으로 튄 것이다. `rotJitter: 0`으로 꺼서 좌우 둘 다
  // 정확히 튜닝한 75도 그대로 고정한다(`props.js`에 옵션 추가).
  //
  // STEP 58 — ken이 "3" 키로 6번 더 돌려 75도에서 90도를 더 빼(-15도 =
  // 345도) 진짜 정면으로 확정했다("이 설정값이 최상인거 같아", 9/3
  // 스크린샷). 이 구도(신상 정면 각도)는 같은 GLB(`godstatue_odyssey.glb`)를
  // 쓰는 `labisland.js`에도 그대로 옮긴다.
  let godstatueRotOffset = -Math.PI / 12   // 345도(=-15도) — ken이 조작 키로 확정한 정면 값
  const godstatueRows = []
  loadBgGlbProp('/assets/runner3d/_lab/godstatue_odyssey.glb', 'height', 20, [
    { count: 1, side: -1, near: 34, spread: 16, radius: 7, faceTrack: true, rotOffset: godstatueRotOffset, rotJitter: 0 },
    { count: 1, side: 1, near: 34, spread: 16, radius: 7, faceTrack: true, rotOffset: godstatueRotOffset, rotJitter: 0 },
  ], godstatueRows)

  // ── 방향 맞추기 조작 — 눈으로 봐야만 알 수 있는 값이라(위 주석)
  // 되풀이 추측 대신 브라우저에서 직접 돌려보게 연다. `it.rot`은 이미
  // 인스턴스 생성 시점에 `rotOffset + 지터`로 굳어 있으므로, 여기선
  // 그 굳은 값에 델타만 더한다 — 지터(개체마다 다른 미세한 흔들림)는
  // 그대로 보존된다.
  function nudgeRotOffset(rows, delta) {
    for (const row of rows) {
      for (const it of row.items) it.rot += delta
      row.sync()
    }
  }
  const ROT_STEP = Math.PI / 12   // 15도
  const rotDeg = r => Math.round((((r % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 180 / Math.PI)
  const updateRotReadout = () => {
    const el = $('#ls-rot')
    if (el) el.textContent = `인어 ${rotDeg(mermaidRotOffset)}° · 신상 ${rotDeg(godstatueRotOffset)}°`
  }
  const onRotKey = e => {
    if (e.code === 'Digit1') { mermaidRotOffset -= ROT_STEP; nudgeRotOffset(mermaidRows, -ROT_STEP) }
    else if (e.code === 'Digit2') { mermaidRotOffset += ROT_STEP; nudgeRotOffset(mermaidRows, ROT_STEP) }
    else if (e.code === 'Digit3') { godstatueRotOffset -= ROT_STEP; nudgeRotOffset(godstatueRows, -ROT_STEP) }
    else if (e.code === 'Digit4') { godstatueRotOffset += ROT_STEP; nudgeRotOffset(godstatueRows, ROT_STEP) }
    else return
    updateRotReadout()
  }
  addEventListener('keydown', onRotKey)
  updateRotReadout()

  // ── 소용돌이 — 점프로 피하는 전폭 장애물(`hurdleLow`) ──
  //
  // ken 요청(9/3): "스테이지 별로 하나씩 장애물을 추가해보자! 일단
  // lab-sea 에서 지금 업로드한 이미지를 참고해서 바닥에 소용돌이
  // 장애물을 만들어야 해. 이건 점프해서 피하는 장애물이야. 딱 트랙에만
  // 가로 넓이로 꽉차게 만들어야 해. 그림과 최대한 비슷하게 소용돌이
  // 함정을 만들어줘."
  //
  // 새 규칙이 아니다 — `course.js`(육지 러너와 공유하는 코스 생성기)는
  // 사이클마다 이미 `hurdleLow`(낮다, **점프로 넘는다** — `judge.js`)를
  // 셋씩 만들어 두고 있었는데, 이 화면은 지금까지 `cube` 말고는 전부
  // 건너뛰고 있었다(`e.type !== 'cube' → continue`). 이미 있던 자리를
  // 처음 채우는 것이다(`course3d.js`: "복사하지 않는다"). `hurdleWide`
  // (숙이기)·`poseSign`은 이번 요청 범위 밖이라 계속 건너뛴다 — "스테이지
  // 별로 하나씩" 늘려 가기로 했다.
  //
  // 판정도 `judge.js`(육지 러너가 이미 쓰는 순수 함수)를 그대로 쓴다 —
  // `hurdleLow`의 규칙을 이 화면에서 다시 정의하지 않는다.
  //
  // ── 소용돌이 STEP 57 — 평면 데칼에서 진짜 입체 링으로 ──
  //
  // STEP 53의 첫 판은 평면 하나에 나선 그림을 그려 얹은 데칼이었다.
  // ken이 참고 그림(오디세우스+아이가 진짜 파인 깔때기를 향해 가는
  // 그림)과 비교하며 "그래픽을 더 잘 표현할 방법이 없을까? 3D 객체로
  // 모델링해야 해?"라고 물었다 — 방법을 먼저 찾기로 하고, 결론은
  // "진짜로 파인 깔때기(물 아래로 내려가는 지오메트리) + 가장자리 포말
  // 링" 조합이었다.
  //
  // **왜 물 아래로 실제로 파지는 않았나** — `water.js`의 `createWater()`는
  // 트랙 전체를 덮는 **구멍 없는 단일 평면**이다(140×182, y=0). 카메라가
  // 아무리 각도를 바꿔도, 그 평면과 같은 (x,z) 자리에 더 낮은 지오메트리를
  // 놓으면 광선이 항상 평면을 먼저 만나 아래는 가려진다 — 평면에 실제로
  // 구멍을 뚫지 않는 한 피할 수 없는 성질이다(스텐실이나 매 프레임
  // 지오메트리를 다시 깎는 방법은 이 프로토타입 하나를 위해 들이기엔
  // 과하다). 그래서 방향을 바꿨다 — **수면 위로 솟아오르는 소용돌이
  // 벽**(진짜 소용돌이도 중심 둘레에 물이 부풀어 오르는 테두리가 있다)을
  // 만들고, "빨려 드는 구멍"의 어두움은 깊이가 아니라 **정점에 구운 색**
  // (중심은 거의 검게, 가장자리는 물빛으로)으로 표현한다 — 조명 없이
  // 입체를 읽히는 이 프로젝트의 표준 수법을 그대로 쓴다.
  //
  // 모양은 `THREE.LatheGeometry`(2D 단면을 축 중심으로 돌려 입체를
  // 만드는 함수)로 만든다 — 중심(r=0)은 수면과 같은 높이, 중간(r≈0.6)은
  // 부풀어 오른 테두리(가장 밝은 포말 색), 가장자리(r=1)는 다시 물빛으로
  // 낮아져 주변 물과 이어진다. 삼각형 수는 아주 적다(단면 점 9개 ×
  // 둘레 28분할 — 큐브 하나보다도 가볍다).
  //
  // 나선 무늬는 텍스처가 맡는다 — 다만 이번엔 도형 전체를 감싸는
  // 원통형 UV(가로=둘레 각도, 세로=중심→가장자리)에 맞춰 **주기적인
  // 사선 줄무늬**로 새로 그렸다(캔버스에 원을 그리는 대신 나머지/모듈로
  // 연산만으로 만들어서 가로·세로 어느 방향으로 이어 붙여도 이음매가
  // 안 보인다). 이 무늬는 색이 아니라 **밝기(가산 합성)** 층으로 따로
  // 얹어서 — 물빛 바탕(정점색) 위에 흰 포말 줄무늬가 반짝이며 얹히는
  // 두 겹 구조다(포털 문·번개가 이미 쓰는 가산 합성+깊이 안 쓰기 조합과
  // 같다). 이 층의 UV를 매 프레임 두 방향(둘레·중심 방향)으로 같이
  // 흘리면 "물이 빙글빙글 돌며 안으로 빨려든다"는 인상을 낸다.
  function whirlpoolProfile() {
    // (반경 0~1, 높이, 색) — 중심은 수면과 같은 높이(더 낮추면 water.js의
    // 구멍 없는 평면에 가려진다, 위 설명), r≈0.6 부근에서 부풀어 오른
    // 테두리(포말)로 절정을 찍고, 가장자리에서 다시 물빛으로 가라앉는다.
    const stops = [
      { r: 0.00, y: 0.00, c: '#02060c' },  // 중심 — 거의 검게, "구멍" 인상
      { r: 0.12, y: -0.04, c: '#04101c' },
      { r: 0.28, y: 0.04, c: '#0a2f4e' },
      { r: 0.44, y: 0.20, c: '#125a86' },
      { r: 0.58, y: 0.48, c: '#2f8fc0' },
      { r: 0.66, y: 0.58, c: '#cfe9fb' },  // 부풀어 오른 테두리 절정 — 가장 밝은 포말
      { r: 0.78, y: 0.34, c: '#7fc4e6' },
      { r: 0.90, y: 0.10, c: '#3f8fc0' },
      { r: 1.00, y: 0.00, c: PALETTE.mid },  // 가장자리 — 주변 물빛과 같은 색으로 이어 붙는다
    ]
    return stops.map(s => ({ ...s, color: new THREE.Color(s.c) }))
  }
  function buildWhirlpoolGeometry(stops, radialSegments = 28) {
    const points = stops.map(s => new THREE.Vector2(Math.max(0.0001, s.r), s.y))
    const geo = new THREE.LatheGeometry(points, radialSegments)
    // 정점색 — 반경(r=hypot(x,z), 아직 비균등 스케일 전이라 0~1 그대로다)으로
    // stops를 다시 훑어 보간한다. `paintGradientY`는 y 기준이라 여기서는
    // 못 쓴다 — 이 도형은 y가 중심→테두리 사이에서 오르내려서(부푼
    // 테두리) y만 봐서는 반경을 못 되짚는다.
    const pos = geo.attributes.position
    const arr = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const r = Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)))
      let a = stops[0], b = stops[stops.length - 1]
      for (let k = 0; k < stops.length - 1; k++) {
        if (r >= stops[k].r && r <= stops[k + 1].r) { a = stops[k]; b = stops[k + 1]; break }
      }
      const t = THREE.MathUtils.clamp((r - a.r) / Math.max(1e-6, b.r - a.r), 0, 1)
      arr[i * 3] = THREE.MathUtils.lerp(a.color.r, b.color.r, t)
      arr[i * 3 + 1] = THREE.MathUtils.lerp(a.color.g, b.color.g, t)
      arr[i * 3 + 2] = THREE.MathUtils.lerp(a.color.b, b.color.b, t)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    return geo
  }
  // 포말 줄무늬 — 원통형 UV(u=둘레 각도, v=중심→가장자리) 위에 주기적인
  // 사선을 **모듈로 연산으로** 그린다. 원을 그려 이어 붙이는 대신 이
  // 방식을 쓰면 가로(u)·세로(v) 어느 방향으로 오프셋을 흘려도(빙빙
  // 돌리기 + 안으로 빨려들기) 이음매가 안 보인다 — 함수 자체가 주기적이라
  // 원천적으로 타일링된다.
  function whirlpoolStreakTexture() {
    const W = 128, H = 256
    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    const g = cv.getContext('2d')
    const img = g.createImageData(W, H)
    const arms = 4      // 나선 팔 수 — 이전 판(STEP 53)과 같다
    const turns = 2.6   // 중심→가장자리까지 도는 바퀴 수
    const bandHalf = 0.09
    for (let y = 0; y < H; y++) {
      const v = y / H
      for (let x = 0; x < W; x++) {
        const u = x / W
        let phase = (u * arms + v * turns) % 1
        if (phase < 0) phase += 1
        const d = Math.min(phase, 1 - phase)
        const bright = d < bandHalf ? 1 - d / bandHalf : 0
        const idx = (y * W + x) * 4
        img.data[idx] = 235; img.data[idx + 1] = 245; img.data[idx + 2] = 255
        // 중심 쪽(v 작음)은 옅게, 가장자리 쪽은 또렷하게 — 참고 그림의
        // 바깥 고리가 안쪽보다 뚜렷한 인상과 같다.
        img.data[idx + 3] = Math.round(bright * 235 * (0.25 + v * 0.75))
      }
    }
    g.putImageData(img, 0, 0)
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    return tex
  }
  const whirlStops = whirlpoolProfile()
  const whirlGeo = buildWhirlpoolGeometry(whirlStops)
  // `side: DoubleSide` — Lathe가 어느 쪽으로 감기는지(법선 방향)는 미리
  // 장담하기 어렵다(이 sandbox는 렌더링을 실시간으로 못 본다). 양면을
  // 그리면 뒤집혀도 안 보이는 사고를 아예 없앤다 — 삼각형 수가 적어
  // 비용도 무시할 만하다.
  const whirlMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide })
  withCurve(whirlMat)
  const whirlStreakTex = whirlpoolStreakTexture()
  // 가산 합성 + 깊이 안 쓰기 — 포털 문·번개가 이미 쓰는 조합("빛으로
  // 그린 것은 깊이를 안 쓴다", `curve.js`가 아니라 `portal.js`의 관례).
  // 밑에 깔린 물빛 도형(`whirlMat`) 위에 반짝이는 줄무늬만 얹는다.
  const whirlStreakMat = new THREE.MeshBasicMaterial({
    map: whirlStreakTex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
  })
  withCurve(whirlStreakMat)
  const WHIRL_W = TRACK_W * 0.95   // 큐브·허들과 같은 규칙(obstacles3d.js KINDS) — 트랙 거의 전체 폭
  const WHIRL_D = 11
  // ken 재확인(9/3, 스크린샷): "가까이서 보면 바닥에 물이 약간 올라와
  // 보여 ... 바닥물이 회오리를 가려서 이상해." 원인은 `water.js`의
  // 잔물결이다 — 세 사인파를 합친 진폭이 최대 약 0.285유닛까지
  // 올라오는데(`a1+a2+a3 = 0.11+0.14+0.035`), 링 가장자리를 0.02에
  // 거의 물 표면 높이로 맞춰 놓으면 카메라 가까이(마루가 자주 오는
  // 자리)에서 물마루가 그 가장자리를 그대로 덮어 버린다. 잔물결
  // 최대치보다 확실히 위로 올린다 — 가장자리가 살짝 뜨는 것보다
  // 덮이는 쪽이 훨씬 더 부자연스럽다("소용돌이가 안 보인다"가 되므로).
  const WHIRL_Y = 0.32
  const WHIRL_SPIN_U = 0.55        // 라디안/초 — 둘레 방향(빙빙 도는 인상)
  const WHIRL_FLOW_V = 0.35        // 초당 — 중심 방향(안으로 빨려드는 인상)
  const whirlMeshes = new Map()   // event.id → THREE.Group(물빛 도형 + 줄무늬)

  // ── 번개 다리 — 숙여서 피하는 전폭 장애물(`hurdleWide`) ──
  //
  // ken 요청(9/3): "스커트로 피하는 장애물을 만들건데 ... 천둥 느낌의
  // 전기 다리 ... 트랙에서 좌우 끝으로 이어지는 천둥의 그 줄기로
  // 다리처럼 표현해서 장애물을 만들어줘. 전기 찌릿하는 효과로 잘
  // 표현해서." — 소용돌이(점프)에 이어 "스테이지 별로 하나씩" 늘리기로
  // 한 두 번째 장애물이다. 새 판정을 짓지 않는다 — `judge.js`의
  // `hurdleWide`("위에 걸려 있다, **숙여서** 지나간다")를 그대로 쓴다.
  //
  // 모양 — 하늘 번개(`spawnBolt`, 위)와 같은 발상(누적 랜덤워크 지그재그
  // + 가산 합성 + `depthWrite:false`)을 가로로 눕혀 트랙 폭 전체를
  // 잇는 "케이블"로 쓴다. 다만 **선(`THREE.Line`)이 아니라 얇은 띠(리본
  // 메시)로 그린다** — `LineBasicMaterial`의 굵기(`linewidth`)는 대부분의
  // 브라우저(WebGL 표준)에서 1px로 고정돼 있어, 하늘 번개처럼 화면
  // 대각선을 크게 가로지르는 게 아니라 카메라 가까이(9~15유닛)에 낮게
  // 뻗어 있는 이 다리는 1px 선으로 그리면 화면에서 거의 안 보인다.
  // 두께를 직접 가진 삼각형 띠로 그리면 브라우저·해상도와 무관하게
  // 항상 또렷하다.
  //
  // 하늘 번개는 몇백ms만 반짝이고 꺼지는데(한 번씩 치는 배경 연출),
  // 이건 **장애물이라 계속 보여야** 아이가 무엇을 피하는지 안다 —
  // 대신 짧은 주기(80~140ms)로 지오메트리를 다시 뽑아서 "지지직"
  // 크래클(잔떨림)을 준다. 심(core, 얇고 밝은 백청색 띠) + 글로(넓고
  // 옅은 하늘색 띠) 두 겹이 같은 점을 그려 빛이 번지는 것처럼 읽히게
  // 하고, 몸통 중간에서 짧은 잔가지(tendril) 몇 개가 아래로 갈라져
  // "전기가 흐르는" 인상을 더한다.
  //
  // 소용돌이와 같은 이유로 `withCurve`를 건다 — 트랙 거의 전체 폭
  // (`THUNDER_W`)에 걸쳐 있어서, 바닥이 휘는데 다리만 안 휘면 가장자리가
  // 땅에서 뜨거나 파묻힌 것처럼 보인다.
  const THUNDER_W = TRACK_W * 0.95   // 소용돌이·큐브·허들과 같은 규칙(obstacles3d.js KINDS)
  const THUNDER_Y = 3.4              // obstacles3d.js KINDS.hurdleWide와 같은 높이 — 숙여야 지나간다
  const THUNDER_SAG = 0.9            // 다리처럼 가운데가 살짝 처진다
  const thunderCoreMat = new THREE.MeshBasicMaterial({
    color: '#eaffff', transparent: true, opacity: 0.95, fog: false,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })
  withCurve(thunderCoreMat)
  const thunderGlowMat = new THREE.MeshBasicMaterial({
    color: '#7fd6ff', transparent: true, opacity: 0.4, fog: false,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })
  withCurve(thunderGlowMat)

  /** 점 목록을 두께를 가진 평평한 띠(리본) 지오메트리로 편다 — Y축으로만 두껍다. */
  function ribbonFromPoints(pts, halfWidth) {
    const pos = []
    for (const p of pts) {
      pos.push(p.x, p.y + halfWidth, p.z)
      pos.push(p.x, p.y - halfWidth, p.z)
    }
    const idx = []
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = a + 2, d = b + 2
      idx.push(a, b, c, b, d, c)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setIndex(idx)
    return geo
  }
  // ken 재확인(9/3, 스크린샷): "공중에 떠있고 양 끝이 잘려 보여서
  // 이상해 ... 트랙 좌측 끝부분에서 우측 끝부분으로 연결되게 둥근
  // 줄기 모양으로." 처음 판은 지그재그 잔떨림이 너무 커서(±0.55) 몸통
  // 전체가 들쭉날쭉해 보였고, 양 끝이 허공에서 뚝 끊겨 아무 데도 안
  // 붙은 것처럼 보였다. 둘 다 고친다 — 몸통은 완만한 사인 곡선(부드러운
  // "둥근" 처짐) 하나로 읽히게 잔떨림을 확 줄이고(±0.12, 전기 느낌은
  // 얇은 글로·잔가지가 대신 맡는다), **양 끝 9%는 물 표면 높이까지
  // 부드럽게 내려앉게**(`Math.sin` 이징) 만들어 트랙 양 끝(부표 자리와
  // 거의 같은 x)에서 물에 닿아 "매달려 있다"로 읽히게 한다 — 허공에
  // 뜬 채 잘린 게 아니라 양 끝이 물에 박힌 케이블이다.
  const THUNDER_DROP_FRAC = 0.09
  /** 다리 몸통 — 좌우 끝을 잇는 완만한 케이블(가운데는 다리처럼 처지고, 양 끝은 물에 닿는다). */
  function thunderBridgePoints() {
    const steps = 26
    const pts = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = (t - 0.5) * THUNDER_W
      let y
      if (t < THUNDER_DROP_FRAC) {
        y = THUNDER_Y * Math.sin((Math.PI / 2) * (t / THUNDER_DROP_FRAC))
      } else if (t > 1 - THUNDER_DROP_FRAC) {
        y = THUNDER_Y * Math.sin((Math.PI / 2) * ((1 - t) / THUNDER_DROP_FRAC))
      } else {
        const mt = (t - THUNDER_DROP_FRAC) / (1 - 2 * THUNDER_DROP_FRAC)
        y = THUNDER_Y - Math.sin(Math.PI * mt) * THUNDER_SAG
      }
      const jitter = (i === 0 || i === steps) ? 0 : (Math.random() - 0.5) * 0.12
      pts.push(new THREE.Vector3(x, Math.max(0.05, y + jitter), 0))
    }
    return pts
  }
  /** 몸통 한 점에서 짧게 아래로 갈라지는 잔가지 — 하늘 번개의 곁가지와 같은 발상. */
  function thunderTendrilPoints(from) {
    const pts = [from.clone()]
    let x = from.x, y = from.y
    const steps = 3 + Math.floor(Math.random() * 2)
    for (let i = 0; i < steps; i++) {
      x += (Math.random() - 0.5) * 0.6
      y -= 0.3 + Math.random() * 0.3
      pts.push(new THREE.Vector3(x, y, 0))
    }
    return pts
  }
  /** 그룹을 비우고 새로 뽑는다 — 크래클(잔떨림)마다 부른다. */
  function fillThunderBridge(group) {
    while (group.children.length) {
      const mesh = group.children.pop()
      mesh.geometry.dispose()
    }
    const main = thunderBridgePoints()
    group.add(new THREE.Mesh(ribbonFromPoints(main, 0.22), thunderGlowMat))
    group.add(new THREE.Mesh(ribbonFromPoints(main, 0.07), thunderCoreMat))
    // 잔가지는 처지는 가운데 구간(양 끝 물에 닿는 자리 제외)에서만 뽑는다
    // — 물에 닿는 자리 근처에서 갈라지면 어색하다.
    const midLo = Math.floor(main.length * 0.2)
    const midHi = Math.ceil(main.length * 0.8)
    for (let i = 0; i < 3; i++) {
      const from = main[midLo + Math.floor(Math.random() * (midHi - midLo))]
      const tp = thunderTendrilPoints(from)
      group.add(new THREE.Mesh(ribbonFromPoints(tp, 0.045), thunderCoreMat))
    }
  }
  const thunderMeshes = new Map()   // event.id → THREE.Group(케이블 + 잔가지, 전부 리본 메시)

  // ── 장애물 — 도형이 기본, 삼두룡(드래곤) GLB가 오면 바꿔 낀다 ──
  // ken 요청(9/3): "headed+dragon 파일은 좌우 피하는 장애물로 활용해줘.
  // 그런데 모션을 줬으면 좋겠어. 살아 있는 느낌으로." — 지금 장애물
  // (빨간 정육면체)과 똑같은 역할이다. **자리(x·z)는 코스 데이터가
  // 정한다**(`assignCubeLane`·`eventX` — 판정에 관여하는 부분, 안
  // 건드린다) — 이 절이 더하는 건 그 위에 얹는 idle 모션뿐이다.
  //
  // `obstacleVisual`을 두는 이유 — 이미 `cubeMeshes`에 만들어져 있는
  // `THREE.Mesh`는 생성 시점의 지오메트리·재질을 그대로 들고 있어서
  // (자바스크립트 객체 참조다), 드래곤이 나중에 도착해도 **이미 떠 있는
  // 장애물까지 바꿔 끼우진 못한다** — 다음에 새로 생기는 것부터
  // 드래곤이다. 부표·섬 등 배경 프롭은 `PropRow`가 한 인스턴스드메시라
  // 이런 문제가 없는데, 장애물은 코스 이벤트마다 각자 `Mesh`라 다르다.
  const cubeGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6)
  const cubeMat = new THREE.MeshBasicMaterial({ color: '#ff5a5a' })
  const obstacleVisual = { geo: cubeGeo, mat: cubeMat, baseY: 0.8 }
  // ken 요청(9/3): "dragon 오브젝트 이거 사이즈 더 키워줘." 3.4 → 4.6으로
  // 키웠다(약 35%). 발밑 폭(가로세로 중 큰 쪽)이 대략 높이의 1.1배라
  // 4.6에서도 발판 폭이 레인 폭(`TRACK_W/3`≈5유닛)을 크게 넘지 않는다 —
  // 더 키우면 옆 레인까지 시각적으로 걸치기 시작한다.
  let dragonGeo = null, dragonMat = null   // GLB가 오면 채워진다 — onLeave가 같이 치운다
  loadNormalizedGlb('/assets/runner3d/_lab/dragon_odyssey.glb', 'height', 4.6, (geo, mat) => {
    dragonGeo = geo; dragonMat = mat
    obstacleVisual.geo = geo; obstacleVisual.mat = mat; obstacleVisual.baseY = 0
  })
  const cubeMeshes = new Map()   // event.id → mesh

  let course = buildCourse3d(0)
  let now = 0

  const fit = () => {
    const w = cv.clientWidth, h = cv.clientHeight
    renderer.setSize(w, h, false)
    const aspect = w / Math.max(1, h)
    camera.aspect = aspect
    camera.fov = fovFor(aspect)
    camera.updateProjectionMatrix()
    camera.lookAt(0, VIEW.camHeight * 0.45, -VIEW.camLookAhead)
  }
  fit()
  addEventListener('resize', fit)

  // ── 곡률 슬라이더 ──
  const slider = $('#ls-slider')
  const applyCurveUI = () => {
    const R = Number(slider.value)
    kUniform.value = kFromRadius(R)
    backdrop.setCurve(kUniform.value)   // 지평선이 오르내리면 하늘 띠도 같이 옮긴다
    $('#ls-r').textContent = `R ${R}`
    const preview = 58
    const drop = dropAt(preview, kFromRadius(R)).toFixed(1)
    const realHorizon = horizonDistance(R, VIEW.camHeight).toFixed(0)
    $('#ls-note').innerHTML =
      `${preview}유닛 앞이 <b>${drop}유닛</b> 내려앉는다.<br>` +
      `진짜 구였다면 지평선이 <b>${realHorizon}유닛</b>에서 끊긴다.`
  }
  slider.addEventListener('input', applyCurveUI)
  applyCurveUI()

  // ── 레벨(=코스 데이터 + 속도) ──
  const spd = $('#ls-spd')
  spd.addEventListener('input', e => {
    const lv = Number(e.target.value)
    course = buildCourse3d(lv)
    now = 0
    cubeMeshes.forEach(m => scene.remove(m))
    cubeMeshes.clear()
    $('#ls-speed').textContent = `LV${lv + 1} · ${course.speed.toFixed(2)}`
  })
  $('#ls-speed').textContent = `LV1 · ${course.speed.toFixed(2)}`

  // ── 레인 이동 — 키보드만. 카메라는 이 화면의 검증 대상이 아니다 ──
  let lane = 1
  let boatX = laneX(lane, 3)

  // ── 배 점프 — 소용돌이(`hurdleLow`)를 피하는 유일한 방법 ──
  // ken 요청(9/3): "이건 점프해서 피하는 장애물이야." 이 화면의 아이는
  // 캐릭터 스프라이트가 아니라 배를 조종하므로(`character.js`의 점프
  // 스프라이트 전환은 안 쓴다), 배 자체가 짧게 떠올랐다 내려오는
  // 포물선으로 "점프"를 표현한다. 지속 시간(`CHAR.jumpSec`)만 육지
  // 캐릭터와 맞췄다 — 코스 예고 시간(`approachSec`)·판정 창(`hitWindow`)이
  // 이미 그 값을 기준으로 튜닝돼 있어서, 다르게 두면 "눈에는 넉넉해
  // 보이는데 판정은 빠듯한" 어긋남이 생길 수 있다. 높이(`JUMP_HEIGHT`)는
  // 배 크기에 맞춰 새로 골랐다 — 아직 눈으로 확인 전이다.
  const JUMP_SEC = CHAR.jumpSec
  const JUMP_HEIGHT = 2.2
  let jumpT = -1   // -1 = 물 위. 0 이상이면 공중, jumpSec에서 끝난다

  // ── 배 숙이기 — 번개 다리(`hurdleWide`)를 피하는 유일한 방법 ──
  // 점프와 달리 **누르고 있는 동안만** 숙인다(land 러너의 ArrowDown과
  // 같은 방식, `runner/main.js`) — 잠깐 스치는 소용돌이와 달리 다리는
  // 폭이 있어 판정 창 동안 계속 숙이고 있어야 자연스럽다.
  let ducking = false
  const DUCK_DIP = 0.5   // 숙였을 때 배가 가라앉는 양(유닛) — 눈으로 확인 전, 대략값
  let duckDip = 0

  const onKey = e => {
    if (e.code === 'ArrowLeft' && lane > 0) { e.preventDefault(); lane-- }
    if (e.code === 'ArrowRight' && lane < 2) { e.preventDefault(); lane++ }
    if (e.code === 'Space') { e.preventDefault(); if (jumpT < 0) jumpT = 0 }
    if (e.code === 'ArrowDown') { e.preventDefault(); ducking = true }
  }
  addEventListener('keydown', onKey)
  const onKeyUp = e => {
    if (e.code === 'ArrowDown') ducking = false
  }
  addEventListener('keyup', onKeyUp)

  const flash = $('#ls-flash')
  const judged = new Set()

  // ── 루프 ──
  let raf = null
  let last = performance.now()
  let frames = 0
  let acc = 0
  const grade = (el, v, good, ok) => {
    el.className = 'v ' + (v >= good ? 'ok' : v >= ok ? 'warn' : 'bad')
  }

  const loop = t => {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(0.05, (t - last) / 1000)
    last = t

    const dz = course.speed * UNITS_PER_SPEED * dt
    now += dt

    water.update(dz, dt)
    ropeMap.offset.y += (dz / 182) * ropeMap.repeat.y
    for (const r of buoyRows) r.update(dz, VIEW.camBack + 4, dt)
    for (const r of dolphinRows) r.update(dz, VIEW.camBack + 4, dt)
    for (const r of shipRows) r.update(dz, VIEW.camBack + 4, dt)
    for (const r of templeRows) r.update(dz, VIEW.camBack + 4, dt)
    for (const r of mermaidRows) r.update(dz, VIEW.camBack + 4, dt)
    for (const r of godstatueRows) r.update(dz, VIEW.camBack + 4, dt)
    clouds.update(dz)
    backdrop.update(dt)
    updateRain(dt)
    // 둘레 방향(u)으로 흘려 빙빙 돌고, 중심 방향(v)으로도 같이 흘려
    // 안으로 빨려드는 인상을 더한다 — 텍스처가 모듈로 연산으로 그려져
    // 있어(`whirlpoolStreakTexture`) 어느 방향으로 흘려도 이음매가 없다.
    whirlStreakTex.offset.x += dt * WHIRL_SPIN_U
    whirlStreakTex.offset.y -= dt * WHIRL_FLOW_V
    lightningWait -= dt
    if (lightningWait <= 0) { strikeLightning(); lightningWait = 4 + Math.random() * 6 }

    // 배 점프 — 포물선. 소용돌이(`hurdleLow`)를 피하는 동안만 공중이다.
    if (jumpT >= 0) {
      jumpT += dt
      if (jumpT >= JUMP_SEC) jumpT = -1
    }
    const jumpArc = jumpT < 0 ? 0 : Math.sin(Math.PI * (jumpT / JUMP_SEC)) * JUMP_HEIGHT
    // 숙이기 — 번개 다리 아래로 몸을 낮춘다. 점프처럼 정해진 포물선이
    // 아니라 누르는 동안 계속이라, 목표값으로 부드럽게 따라가게 한다
    // (`boatX`와 같은 lerp 감쇠 — 뚝 떨어지면 부자연스럽다).
    duckDip += ((ducking ? -DUCK_DIP : 0) - duckDip) * Math.min(1, dt * 10)

    // 배 — 레인을 향해 부드럽게, 물결에 살짝 얹힌 듯 위아래로 + 점프/숙이기.
    const targetX = laneX(lane, 3)
    boatX += (targetX - boatX) * Math.min(1, dt * 8)
    boatGroup.position.x = boatX
    boatGroup.position.y = Math.sin(now * 1.6) * 0.05 + Math.sin(now * 1.05 * -1) * 0.02 + jumpArc + duckDip
    // 노 젓기 — 두 컷을 번갈아(달리기 사이클과 같은 발상, `character.js`).
    // 점프 중엔 배가 공중이니 노 정지 없이 그대로 이어 젓는다 — 어차피
    // 표정·자세가 바뀌는 건 아니라서 점프와 부딪히지 않는다.
    if (boatChar) boatChar.tex.offset.x = Math.floor(now * BOAT_CHAR.rowFps) % 2 === 0 ? 0 : 0.5

    // 장애물 — 시야 안에 든 것만 그린다(`visibleEvents`, 육지와 같은 규칙).
    // 판정은 `judge.js`를 그대로 쓴다 — 큐브(레인)·소용돌이(점프) 둘 다
    // 여기서 규칙을 다시 안 짠다.
    const vis = visibleEvents(course, now, VIEW.far)
    const visIds = new Set()
    const visWhirlIds = new Set()
    const visThunderIds = new Set()
    const charState = { lane, jumping: jumpT >= 0, ducking, pose: null }
    for (const { e, z } of vis) {
      if (e.type === 'cube') {
        assignCubeLane(e, lane)
        visIds.add(e.id)
        let m = cubeMeshes.get(e.id)
        if (!m) {
          m = new THREE.Mesh(obstacleVisual.geo, obstacleVisual.mat)
          // 만들어질 때 모양을 기억해 둔다 — `obstacleVisual`은 드래곤이
          // 도착하면 바뀌지만, **이미 만들어진 이 메시는 그대로**다(위 주석
          // 참고). idle 모션은 실제로 드래곤인 것만 붙는다.
          m.userData.dragon = obstacleVisual.mat === dragonMat
          m.userData.baseY = obstacleVisual.baseY
          scene.add(m)
          cubeMeshes.set(e.id, m)
        }
        m.position.x = eventX(e, 3)
        m.position.z = z
        // idle 모션 — ken 요청(9/3): "모션을 줬으면 좋겠어, 살아 있는
        // 느낌으로." 뼈대 없는 GLB라 머리 셋을 따로 못 흔든다(인어와 같은
        // 사정) — 대신 몸 전체를 살짝 둥실+좌우로 트는 것으로 대신한다.
        // `e.id`를 위상에 섞어 드래곤마다 박자가 어긋나게 한다.
        if (m.userData.dragon) {
          m.position.y = m.userData.baseY + Math.sin(now * 1.6 + e.id * 1.7) * 0.12
          m.rotation.y = Math.sin(now * 0.9 + e.id * 0.6) * 0.22
          const pulse = 1 + Math.sin(now * 2.1 + e.id * 0.9) * 0.03
          m.scale.setScalar(pulse)
        } else {
          m.position.y = m.userData.baseY
        }
        if (!judged.has(e.id) && atHit(e, now, course.speed, course.hitWindow)) {
          judged.add(e.id)
          const hit = judge(e, charState) === RESULT.HIT
          flash.classList.toggle('avoid', !hit)
          flash.classList.add('on')
          setTimeout(() => flash.classList.remove('on'), 160)
        }
      } else if (e.type === 'hurdleLow') {
        visWhirlIds.add(e.id)
        let m = whirlMeshes.get(e.id)
        if (!m) {
          // 그룹 하나에 물빛 도형(정점색) + 반짝이는 줄무늬(가산 합성)
          // 두 겹을 얹는다 — geometry는 둘이 공유한다(draw call만 늘어난다).
          // `LatheGeometry`는 Y축을 축으로 이미 "바닥에 눕는" 모양이라
          // 예전 평면과 달리 rotation.x를 줄 필요가 없다. 비균등 스케일로
          // 단위 반지름을 트랙 폭·깊이(WHIRL_W·WHIRL_D)에 맞춘다.
          m = new THREE.Group()
          const base = new THREE.Mesh(whirlGeo, whirlMat)
          const streak = new THREE.Mesh(whirlGeo, whirlStreakMat)
          m.add(base, streak)
          m.scale.set(WHIRL_W / 2, 1, WHIRL_D / 2)
          scene.add(m)
          whirlMeshes.set(e.id, m)
        }
        m.position.set(0, WHIRL_Y, z)
        if (!judged.has(e.id) && atHit(e, now, course.speed, course.hitWindow)) {
          judged.add(e.id)
          const hit = judge(e, charState) === RESULT.HIT
          flash.classList.toggle('avoid', !hit)
          flash.classList.add('on')
          setTimeout(() => flash.classList.remove('on'), 160)
        }
      } else if (e.type === 'hurdleWide') {
        visThunderIds.add(e.id)
        let g = thunderMeshes.get(e.id)
        if (!g) {
          g = new THREE.Group()
          fillThunderBridge(g)
          g.userData.nextCrackle = now + 0.08 + Math.random() * 0.06
          scene.add(g)
          thunderMeshes.set(e.id, g)
        }
        g.position.set(0, 0, z)
        // 크래클 — 짧은 주기로 지오메트리를 다시 뽑아 "지지직" 흔든다.
        // 재질은 그대로라(`fillThunderBridge`가 geometry만 새로 만든다)
        // 매 프레임 다시 만드는 것보다 훨씬 싸다.
        if (now >= g.userData.nextCrackle) {
          fillThunderBridge(g)
          g.userData.nextCrackle = now + 0.08 + Math.random() * 0.06
        }
        if (!judged.has(e.id) && atHit(e, now, course.speed, course.hitWindow)) {
          judged.add(e.id)
          const hit = judge(e, charState) === RESULT.HIT
          flash.classList.toggle('avoid', !hit)
          flash.classList.add('on')
          setTimeout(() => flash.classList.remove('on'), 160)
        }
      }
      // poseSign·archGate — 아직 이 화면의 검증 대상이 아니다("스테이지
      // 별로 하나씩" — ken 요청 9/3).
    }
    // 화면 밖으로 나간 것은 지운다.
    for (const [id, m] of cubeMeshes) {
      if (!visIds.has(id)) { scene.remove(m); cubeMeshes.delete(id) }
    }
    for (const [id, m] of whirlMeshes) {
      if (!visWhirlIds.has(id)) { scene.remove(m); whirlMeshes.delete(id) }
    }
    for (const [id, g] of thunderMeshes) {
      if (!visThunderIds.has(id)) {
        for (const mesh of g.children) mesh.geometry.dispose()
        scene.remove(g)
        thunderMeshes.delete(id)
      }
    }

    renderer.render(scene, camera)

    frames++; acc += dt
    if (acc >= 0.5) {
      const fps = frames / acc
      $('#ls-fps').textContent = fps.toFixed(0)
      grade($('#ls-fps'), fps, 55, 45)
      $('#ls-dc').textContent = renderer.info.render.calls
      $('#ls-tri').textContent = renderer.info.render.triangles.toLocaleString()
      frames = 0; acc = 0
    }
  }
  raf = requestAnimationFrame(loop)

  $('#ls-back').addEventListener('click', () => navigate('/'))

  // **정리는 라우터의 onLeave로 한다** — 페이지가 hashchange를 직접 들으면
  // 이미 #app이 비워진 뒤에 정리가 돈다(CLAUDE.md 규칙).
  onLeave(() => {
    pageLeft = true   // GLB 로드가 이 시점 뒤에 끝나면 씬을 더 안 건드리고 바로 치운다
    cancelAnimationFrame(raf)
    removeEventListener('resize', fit)
    removeEventListener('keydown', onKey)
    removeEventListener('keyup', onKeyUp)
    removeEventListener('keydown', onRotKey)
    water.dispose()
    ropeGeo.dispose(); ropeMat.dispose(); ropeMap.dispose()
    for (const r of buoyRows) r.dispose()
    buoyMat.dispose()
    for (const r of dolphinRows) r.dispose()
    dolphinGeo.dispose(); dolphinMat.dispose()
    backdrop.dispose()
    cubeGeo.dispose(); cubeMat.dispose()
    if (dragonGeo) { dragonGeo.dispose(); dragonMat.map?.dispose(); dragonMat.dispose() }
    whirlGeo.dispose(); whirlMat.dispose()
    whirlStreakMat.dispose(); whirlStreakTex.dispose()
    for (const m of whirlMeshes.values()) scene.remove(m)
    // 번개 다리 — 소용돌이와 달리 지오메트리를 공유하지 않는다(크래클마다
    // 새로 뽑아서, `fillThunderBridge`가 매번 다른 좌표의 `BufferGeometry`를
    // 만든다). 그룹마다 자식 라인의 geometry를 각각 지워야 샌다.
    for (const g of thunderMeshes.values()) {
      for (const mesh of g.children) mesh.geometry.dispose()
      scene.remove(g)
    }
    thunderCoreMat.dispose(); thunderGlowMat.dispose()
    rainGeo.dispose(); rainMat.dispose()
    for (const id of lightningTimers) clearTimeout(id)
    clearBolt(); boltMat.dispose()
    // 배 — 상자 플레이스홀더(ken 정정: GLB는 배경용)는 그림이 늦게
    // 도착해도 계속 씬에 남아 있었을 수 있어 항상 지운다. 배+캐릭터
    // 빌보드는 로드에 성공했을 때만 존재한다(`boatChar`).
    hull.geometry.dispose(); hull.material.dispose()
    mast.geometry.dispose(); mast.material.dispose()
    if (boatChar) { boatChar.geo.dispose(); boatChar.mat.dispose(); boatChar.tex.dispose() }
    // 배경 범선 — GLB가 아직 안 왔으면(비동기 로드 중 이탈) shipRows가 비어
    // 있어 아래는 그냥 아무 일도 안 한다.
    for (const r of shipRows) r.dispose()
    shipRows[0]?.mesh.material.map?.dispose()
    shipRows[0]?.mesh.material.dispose()
    for (const r of templeRows) r.dispose()
    templeRows[0]?.mesh.material.map?.dispose()
    templeRows[0]?.mesh.material.dispose()
    for (const r of mermaidRows) r.dispose()
    mermaidRows[0]?.mesh.material.map?.dispose()
    mermaidRows[0]?.mesh.material.dispose()
    for (const r of godstatueRows) r.dispose()
    godstatueRows[0]?.mesh.material.map?.dispose()
    godstatueRows[0]?.mesh.material.dispose()
    clouds.dispose()
    renderer.dispose()
  })
}

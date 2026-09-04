// /lab-ithaca — 오디세이 런 **이타카(마지막 스테이지) 프로토타입**. 개발용이다.
//
// ── 왜 여기서 먼저 보나 (labsea.js·labisland.js와 같은 이유) ────────
//
// ken 요청(9/3): "마지막 스테이지인 이타카를 배경으로 한 작업도 진행해볼까?
// 이 스테이지 배경은 지금 스테이지 배경에서 좌우를 바다가 아닌 약간
// 사막이나 흙 바닥 느낌으로 적용하면 돼. 그리고 그 좌우 배경에 아까
// 잘못 넣었다고 했던 그 에셋들을 넣어주면 돼. 강아지나 양, 전사 등등."
//
// STEP 48에서 `#/lab-island`(키클롭스 섬)에 잘못 놓았던 8종 중 거인을
// 뺀 일곱(기사·개·염소·보물·여신상 둘·목마)이 원래 이 화면 몫이었다 —
// GLB는 그대로 `_lab/island/`에 있으니 새로 받을 것 없이 옮겨 심기만
// 한다. 트랙은 `lab-island`와 같은 `ground.js`를 재사용하되, 물 대신
// **사막/흙 팔레트**로 다시 칠한다(`grass: true` — 이번엔 잔디 색 대신
// 모래 색을 먹인다. `grassTexture()`는 이름과 달리 "바탕색 + 작은 얼룩
// 두 톤"만 그리는 범용 텍스처라 사막에도 그대로 맞는다).
//
// 장애물은 이 화면의 검증 대상이 아니라 기본 큐브로 둔다 — ken이
// 이타카 전용 장애물을 지정하면 그때 바꿔 낀다.
//
// ken 요청(9/3, 2차): "하늘은 맑은 하늘 이미지를 적용해줘. 쥬라기 런
// 작업할때 맨 처음에 넣었던 파란 하늘과 구름이 있는 이미지를 사용하면
// 돼." — `backdrop.js`의 `BACKDROP_ART.sky`(`bg_sky.png`)는 STEP 26에서
// **한 번 교체된** 버전이다(원래보다 더 나은 그림으로 덮어썼다). "맨
// 처음에 넣었던" 그림은 git 이력에만 남아 있어서(`210c0f0`, 교체 전
// 커밋) `git show`로 복원해 `_lab/sky_original_jurassic.png`로 저장해
// 새로 썼다 — 지금 `bg_sky.png`(다른 화면들이 쓰는 최신본)와는 다른
// 파일이다. "좌우 오브젝트들 전부 사이즈 키워줘" + "rocky 오브젝트도
// 넣어도 될 거 같아"(록키 템플, `#/lab-sea`·`#/lab-island`가 이미 쓰는
// 그 GLB) 요청도 같이 반영했다 — 자세한 수치는 아래 각 절 참고.
//
// ken 요청(9/3, 3차): "양이랑 강아지, 전사, 그리고 방패와 돌 같이
// 있는 오브젝트들 전부 크기 키워줘. 그리고 여기도 쥬라기 런처럼
// 나무를 넣자. 많이." — 네 종을 한 번 더 키웠고(2차에서 이미 키운
// 값 위에 다시 약 30%), 나무는 GLB가 없어 쥬라기 야자수와 같은
// 발상(도형 + 정점색 굽기)으로 이 파일에서 직접 만들었다. 자세한
// 수치는 아래 각 절 참고.

import * as THREE from 'three'
import { onLeave, navigate } from '../core/router.js'
import { icon } from '../core/icons.js'
import { CURVE, applyCurve, kFromRadius, dropAt, horizonDistance } from '../games/runner3d/curve.js'
import { createBackdrop, PANORAMA } from '../games/runner3d/backdrop.js'

export async function labithacaPage(app) {
  app.innerHTML = `
    <style>
      #lt, #lt * { box-sizing: border-box; }
      #lt {
        position: fixed; inset: 0; overflow: hidden;
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff; background: #e9cd97;
      }
      #lt-cv { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
      #lt-ui {
        position: absolute; left: 0; top: 0; z-index: 5;
        display: flex; flex-direction: column; gap: 8px;
        padding: 12px; width: min(340px, 92vw);
      }
      .lt-card {
        background: rgba(40,28,14,0.72); backdrop-filter: blur(8px);
        border: 2px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 12px 14px;
      }
      .lt-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 6px 0; }
      .lt-row .k { font-size: 0.78rem; color: #ffd699; font-weight: 800; }
      .lt-row .v { font-size: 1.05rem; font-weight: 900; font-variant-numeric: tabular-nums; }
      .v.ok { color: #6ee75a; } .v.bad { color: #ff6b6b; } .v.warn { color: #ffb36b; }
      .lt-btn {
        display: inline-flex; align-items: center; gap: 6px;
        min-height: 40px; padding: 0 14px; border-radius: 9999px;
        background: rgba(255,255,255,0.16); color: #fff; border: 2px solid rgba(255,255,255,0.28);
        font: inherit; font-weight: 800; font-size: 0.82rem; cursor: pointer;
      }
      #lt-slider, #lt-spd { width: 100%; accent-color: #f0a83c; }
      #lt-note { font-size: 0.72rem; color: #f3e3c4; line-height: 1.5; }
      #lt-top { position: absolute; right: 12px; top: 12px; z-index: 6; }
      #lt-flash {
        position: absolute; inset: 0; z-index: 4; pointer-events: none;
        background: radial-gradient(120% 90% at 50% 60%, transparent 40%, rgba(255,60,60,0.55));
        opacity: 0; transition: opacity 0.25s;
      }
      #lt-flash.on { opacity: 1; transition: opacity 0.05s; }
    </style>

    <div id="lt">
      <canvas id="lt-cv"></canvas>
      <div id="lt-top">
        <button class="lt-btn" id="lt-back">${icon('back')} 나가기</button>
      </div>
      <div id="lt-flash"></div>
      <div id="lt-ui">
        <div class="lt-card">
          <div class="lt-row"><span class="k">렌더 FPS</span><span class="v" id="lt-fps">–</span></div>
          <div class="lt-row"><span class="k">draw call</span><span class="v" id="lt-dc">–</span></div>
          <div class="lt-row"><span class="k">삼각형</span><span class="v" id="lt-tri">–</span></div>
        </div>
        <div class="lt-card">
          <div class="lt-row"><span class="k">휨 (보이는 반지름)</span><span class="v" id="lt-r">–</span></div>
          <input type="range" id="lt-slider" min="60" max="900" step="10" value="900" />
          <div id="lt-note"></div>
        </div>
        <div class="lt-card">
          <div class="lt-row"><span class="k">레벨 (속도·코스)</span><span class="v" id="lt-speed">LV1 · 1.00</span></div>
          <input type="range" id="lt-spd" min="0" max="4" step="1" value="0" />
          <div style="font-size:0.72rem; color:#f3e3c4; margin-top:8px">
            ← → 레인 이동.
          </div>
        </div>
        <div class="lt-card">
          <div class="lt-row"><span class="k">방향 맞추기</span></div>
          <div id="lt-tune" style="font-size:0.85rem; font-weight:800; line-height:1.6"></div>
          <div style="font-size:0.72rem; color:#f3e3c4; margin-top:8px">
            Tab — 다음 오브젝트 선택 · , / . — 15도씩 돌리기.
          </div>
        </div>
      </div>
    </div>
  `

  const $ = s => app.querySelector(s)
  const cv = $('#lt-cv')

  // 게임 모듈은 **여기서만** 부른다. 정적으로 import하면 허브 번들에 들어간다.
  const { createGround } = await import('../games/runner3d/ground.js')
  // 배경 GLB 로더 — `labsea.js`·`labisland.js`와 공유하는 공용 모듈(`glbProp.js`).
  const { loadNormalizedGlb: _loadNormalizedGlb, loadBgGlbProp: _loadBgGlbProp } =
    await import('../games/runner3d/glbProp.js')
  const { PropRow } = await import('../games/runner3d/props.js')
  // 나무는 GLB가 아니라 도형이다(아래 절 참고) — 부품 몇 개를 한
  // 지오메트리로 합치는 용도로 `labsea.js`(부표·돌고래)가 이미 쓰는
  // three 유틸을 그대로 가져온다.
  const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
  const { buildCourse3d, visibleEvents, assignCubeLane, eventX, atHit } =
    await import('../games/runner3d/course3d.js')
  const { laneX } = await import('../games/runner3d/character.js')
  const { UNITS_PER_SPEED } = await import('../games/runner3d/scene.js')

  // ── 렌더러·카메라 — 오디세이 런 다른 lab 화면과 같은 값 ──
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
  // 배경색은 **원경 띠(아래 backdrop)의 윗끝 색과 같게** 둔다(`scene.js`·
  // `labsea.js`와 같은 이유) — 띠 위로 삐져나오는 하늘이 있어도 이어져
  // 보인다. 안개도 띠의 지평선 색과 맞춘다.
  scene.background = new THREE.Color(PANORAMA.skyTop)
  scene.fog = new THREE.Fog(new THREE.Color(PANORAMA.skyHorizon), 95, 130)

  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, VIEW.far)
  camera.position.set(0, VIEW.camHeight, VIEW.camBack)
  camera.lookAt(0, VIEW.camHeight * 0.45, -VIEW.camLookAhead)

  const kUniform = { value: CURVE.k }
  const withCurve = m => applyCurve(m, kUniform)

  const GROUND_LEN = 182

  // ── 사막/흙 팔레트 ──
  // ken 요청(9/3): "좌우를 바다가 아닌 약간 사막이나 흙 바닥 느낌으로."
  // `grassTexture()`는 이름과 달리 바탕색 하나 + 작은 얼룩 두 톤만 찍는
  // 범용 텍스처다(잎이나 풀잎 모양을 그리지 않는다) — 그래서 색만
  // 모래·흙 톤으로 바꾸면 그대로 사막 바닥이 된다. 트랙(돌길)은 이
  // 팔레트에서는 다져진 흙길로 다시 칠했다 — 대리석(키클롭스 섬)과
  // 구분되는 톤이라야 "다른 스테이지"로 읽힌다.
  const DESERT_PALETTE = {
    grass: '#d9b775', grassLit: '#eccf98', grassDark: '#b8905a',
    stone: '#a97c4f', stoneLit: '#c99a68', stoneDark: '#7a5636',
    gloss: 'rgba(255,224,170,0.14)',
    edge: '#e0a63e', edgeGlow: 'rgba(224,140,40,0.5)',
    lane: 'rgba(255,241,214,0.85)',
    arrow: 'rgba(255,214,120,0.9)',
    curbA: '#d9b775', curbB: '#b8905a', curbTop: '#e0a63e',
    gem: '#5fd6ff',
  }

  // ── 바닥 (흙길 트랙 + 연석 + 사막 바닥, 물 없음) ──
  const ground = createGround(withCurve, GROUND_LEN, { palette: DESERT_PALETTE, grass: true })
  for (const m of ground.meshes) scene.add(m)

  // ── 원경 — "쥬라기 런 맨 처음" 하늘만 빌린다 ──
  // ken 요청(9/3): "쥬라기 런 작업할때 맨 처음에 넣었던 파란 하늘과
  // 구름이 있는 이미지를 사용하면 돼." 지금 `backdrop.js`의
  // `BACKDROP_ART.sky`는 STEP 26에서 한 번 교체된 최신본이라, git
  // 이력의 첫 커밋(`210c0f0`)에서 원본을 복원해 `_lab/`에 새로 저장했다
  // (위 파일 상단 주석 참고). 능선·화산은 여전히 안 어울려서 뺐다
  // (`art`에 `sky`만 준다 — `labsea.js`와 같은 방식). 지면선 아래는
  // 사막 팔레트의 바닥색(`DESERT_PALETTE.grass`)으로 채운다 — 다르면
  // 접힘선에서 색이 갈린다(`CLAUDE.md`).
  const ORIGINAL_SKY = '/assets/runner3d/_lab/sky_original_jurassic.png'
  const backdrop = createBackdrop({
    camHeight: VIEW.camHeight, camBack: VIEW.camBack, k: kUniform.value,
    art: { sky: ORIGINAL_SKY },
    groundColor: DESERT_PALETTE.grass,
    smoke: false,
  })
  scene.add(backdrop.group)

  // ── 배경 GLB 프롭 — 키클롭스 섬(`#/lab-island`)에 잘못 놓였던 7종 ──
  // ken 요청(9/3): "그 좌우 배경에 아까 잘못 넣었다고 했던 그 에셋들을
  // 넣어주면 돼. 강아지나 양, 전사 등등." STEP 47에서 짠 배치를 그대로
  // 옮겨 왔다 — 그때 이미 층(거리)·희소성을 정리해 뒀으니 다시 설계할
  // 이유가 없다(`docs/04` STEP 47 참고).
  let pageLeft = false   // 로드가 끝나기 전에 화면을 나가면 씬을 더 안 건드린다
  const loadBgGlbProp = (url, fitBy, target, rowSpecs, rowsOut) =>
    _loadBgGlbProp(url, fitBy, target, withCurve, GROUND_LEN, rowSpecs, rowsOut, scene, { label: 'lab-ithaca', isAborted: () => pageLeft })

  const ISLAND_GLB = '/assets/runner3d/_lab/island/'   // 파일명은 그대로 — 이타카에서 처음 쓰인다

  // ── 방향 맞추기 — `labisland.js`가 STEP 47에서 일반화한 Tab 조작 ──
  // 방향이 있는 물건이 넷(기사·여신상 둘·목마)이라 물건마다 숫자 키
  // 하나씩(labsea.js식)은 안 늘어난다.
  const tunables = []   // { label, offset, rows }
  const ROT_STEP = Math.PI / 12   // 15도
  const rotDeg = r => Math.round((((r % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 180 / Math.PI)
  let tuneSelected = 0
  const updateTuneReadout = () => {
    const el = $('#lt-tune')
    if (!el || !tunables.length) return
    el.innerHTML = tunables
      .map((t, i) => `${i === tuneSelected ? '▶ ' : '&nbsp;&nbsp;&nbsp;'}${t.label} ${rotDeg(t.offset)}°`)
      .join('<br>')
  }
  /** 방향이 있는 배경 프롭 하나를 조작 목록에 등록한다. */
  function makeTunable(label, initialDeg) {
    const t = { label, offset: initialDeg * Math.PI / 180, rows: [] }
    tunables.push(t)
    return t
  }
  const onTuneKey = e => {
    if (e.code === 'Tab') {
      e.preventDefault()
      tuneSelected = (tuneSelected + (e.shiftKey ? -1 : 1) + tunables.length) % tunables.length
      updateTuneReadout()
    } else if (e.code === 'Comma' || e.code === 'Period') {
      const delta = (e.code === 'Comma' ? -1 : 1) * ROT_STEP
      const t = tunables[tuneSelected]
      if (!t) return
      t.offset += delta
      for (const row of t.rows) {
        for (const it of row.items) it.rot += delta
        row.sync()
      }
      updateTuneReadout()
    }
  }
  addEventListener('keydown', onTuneKey)

  // ken 요청(9/3, 2차): "좌우 오브젝트들 전부 사이즈 키워줘." 목표
  // 크기를 전부 약 35%씩 키웠다(기사 3.2→4.3, 개 1.4→1.9, 염소 1.6→2.2,
  // 보물 1.8→2.4, 여신상 9→12, 목마 8→10.8) — 몸집이 커진 만큼 같은
  // 행 안에서 서로 겹치지 않도록 `spread`도, 트랙(연석)에 발이 걸리지
  // 않도록 가까운 층의 `near`도 같이 늘렸다(기사·여신상·목마는 이미
  // 여유가 커서 그대로 뒀다).
  //
  // ken 요청(9/3, 3차): "양이랑 강아지, 전사, 그리고 방패와 돌 같이
  // 있는 오브젝트들 전부 크기 키워줘." — 위 1차 확대분에서 다시 한 번
  // 약 30%씩 더 키웠다(기사 4.3→5.6, 개 1.9→2.5, 염소 2.2→2.9, 방패+돌
  // (`treasure_odyssey.glb`) 2.4→3.2). 여신상·목마·록키 템플은 이번
  // 요청에 없어 그대로 뒀다. 몸집이 또 커진 만큼 `radius`·`spread`·
  // `near`도 같이 늘려 트랙(연석)과 서로에게서 여유를 지켰다.

  // 기사 — 참배길을 지키는 보초처럼, 트랙 가까이 좌우 둘씩.
  const knightTune = makeTunable('기사', 0)
  loadBgGlbProp(ISLAND_GLB + 'knight_odyssey.glb', 'height', 5.6, [
    { count: 2, side: -1, near: 14, spread: 14, radius: 2.5, faceTrack: true, rotOffset: knightTune.offset },
    { count: 2, side: 1, near: 14, spread: 14, radius: 2.5, faceTrack: true, rotOffset: knightTune.offset },
  ], knightTune.rows)

  // 강아지·염소 — 가장 가까운 층, 앞뒤가 뚜렷하지 않은 작은 동물이라
  // `faceTrack` 없이 마음껏 돌린다(야자수·바위와 같은 대접).
  const dogRows = []
  loadBgGlbProp(ISLAND_GLB + 'dog_odyssey.glb', 'height', 2.5, [
    { count: 3, side: -1, near: 11, spread: 10, radius: 1.6 },
    { count: 3, side: 1, near: 11, spread: 10, radius: 1.6 },
  ], dogRows)
  const goatRows = []
  loadBgGlbProp(ISLAND_GLB + 'goat_odyssey.glb', 'height', 2.9, [
    { count: 2, side: -1, near: 11.5, spread: 10, radius: 1.6 },
    { count: 2, side: 1, near: 11.5, spread: 10, radius: 1.6 },
  ], goatRows)

  // 방패+돌(`treasure_odyssey.glb`) — 눕는 물건이라 footprint 기준.
  const treasureRows = []
  loadBgGlbProp(ISLAND_GLB + 'treasure_odyssey.glb', 'footprint', 3.2, [
    { count: 3, side: -1, near: 11.6, spread: 12, radius: 1.9 },
    { count: 3, side: 1, near: 11.6, spread: 12, radius: 1.9 },
  ], treasureRows)

  // 여신상 둘(다른 모델) + 목마 — 크고 드문 랜드마크는 좌우 각 1개뿐.
  // `rotJitter: 0` — STEP 45에서 배운 것. 랜드마크는 반복이 없으니
  // "여러 개가 똑같아 보이지 않게" 흔드는 지터가 오히려 좌우를 다르게
  // 튀게 만들 뿐이다.
  const goddess1Tune = makeTunable('여신상 A', 0)
  loadBgGlbProp(ISLAND_GLB + 'goddess1_odyssey.glb', 'height', 12, [
    { count: 1, side: -1, near: 20, spread: 14, radius: 4.6, faceTrack: true, rotOffset: goddess1Tune.offset, rotJitter: 0 },
    { count: 1, side: 1, near: 20, spread: 14, radius: 4.6, faceTrack: true, rotOffset: goddess1Tune.offset, rotJitter: 0 },
  ], goddess1Tune.rows)

  const goddess2Tune = makeTunable('여신상 B', 0)
  loadBgGlbProp(ISLAND_GLB + 'goddess2_odyssey.glb', 'height', 12, [
    { count: 1, side: -1, near: 24, spread: 14, radius: 4.6, faceTrack: true, rotOffset: goddess2Tune.offset, rotJitter: 0 },
    { count: 1, side: 1, near: 24, spread: 14, radius: 4.6, faceTrack: true, rotOffset: goddess2Tune.offset, rotJitter: 0 },
  ], goddess2Tune.rows)

  const horseTune = makeTunable('목마', 0)
  loadBgGlbProp(ISLAND_GLB + 'horse_odyssey.glb', 'height', 10.8, [
    { count: 1, side: -1, near: 28, spread: 16, radius: 5.2, faceTrack: true, rotOffset: horseTune.offset, rotJitter: 0 },
    { count: 1, side: 1, near: 28, spread: 16, radius: 5.2, faceTrack: true, rotOffset: horseTune.offset, rotJitter: 0 },
  ], horseTune.rows)

  // 록키 템플 — ken 요청(9/3, 2차): "여기 스테이지에서도 좌우 배경에
  // rocky 오브젝트도 넣어도 될 거 같아." `#/lab-sea`·`#/lab-island`가
  // 이미 쓰는 그 랜드마크(`temple_odyssey.glb`)를 같은 크기·같은 방식
  // (`faceTrack: true`, `rotOffset` 없이도 등이 안 보인다고 이미
  // 확인됐다 — STEP 39)으로 가장 먼 층(34~50)에 좌우 각 2개 뒀다.
  const templeRows = []
  loadBgGlbProp('/assets/runner3d/_lab/temple_odyssey.glb', 'height', 17, [
    { count: 2, side: -1, near: 34, spread: 18, radius: 6, faceTrack: true },
    { count: 2, side: 1, near: 34, spread: 18, radius: 6, faceTrack: true },
  ], templeRows)

  // ── 나무 — ken 요청(9/3, 3차): "여기도 쥬라기 런처럼 나무를 넣자.
  // 많이." ──
  // 쥬라기 런의 야자수(`scene.js`의 `PROPS.palm`)는 GLB가 아니라
  // 도형이다 — 원뿔 하나에 `bakeShade()`로 정점 색을 굽는다(실시간
  // 조명 0개 규율). 그 함수는 `scene.js` 안에 갇혀 있어(모듈 비공개,
  // export 안 됨) 그대로 가져다 쓸 수 없어서, 같은 발상을 이 파일에서
  // 다시 짰다 — 부표·돌고래(`labsea.js`)가 이미 쓰는 정점색 굽기
  // 패턴과 같다. 사막/올리브 나무 느낌으로 몸통은 갈색, 잎은 올리브
  // 녹색 두 톤(뭉치 둘을 어긋나게 둬서 원뿔보다 자연스러운 실루엣을
  // 낸다)을 준다.
  const paintFlat = (geo, hex) => {
    const c = new THREE.Color(hex)
    const n = geo.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    return geo
  }
  function treeGeometry() {
    // `mergeGeometries`는 인덱스가 있는 것과 없는 것을 섞으면 안 받는다
    // (에러: "index attribute exists among all geometries, or in none of
    // them") — `CylinderGeometry`는 인덱스가 있고 `IcosahedronGeometry`는
    // 없어서(저폴리 정점을 면마다 따로 두는 방식), 트렁크를
    // `toNonIndexed()`로 맞춰야 셋이 합쳐진다. 실제로 화면이 통째로
    // 안 뜨는 원인이었다(합치기가 `null`을 돌려주자 `PropRow`가
    // `null` 지오메트리로 `InstancedMesh`를 만들려다 그 자리에서
    // 멎었다 — 이후 코드가 하나도 안 돌아 렌더 루프까지 못 갔다).
    const trunk = new THREE.CylinderGeometry(0.09, 0.14, 1.5, 6).toNonIndexed()
    trunk.translate(0, 0.75, 0)
    paintFlat(trunk, '#8a6b45')
    const canopyA = new THREE.IcosahedronGeometry(0.62, 0)
    canopyA.translate(0, 1.55, 0)
    paintFlat(canopyA, '#6b8f52')
    // 뭉치를 하나 더 어긋나게 둔다 — 원 하나만 얹으면 사탕처럼 보인다
    // ("눌러 늘이지 않는다"와 같은 결의 원칙: 규칙적이면 무늬가 된다).
    const canopyB = new THREE.IcosahedronGeometry(0.44, 0)
    canopyB.translate(0.32, 1.78, 0.18)
    paintFlat(canopyB, '#7ea35d')
    return mergeGeometries([trunk, canopyA, canopyB], false)
  }
  const treeGeo = treeGeometry()
  const treeMat = withCurve(new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }))
  // 방향이 없는 물건이라(`faceTrack` 없음) 마음껏 돌아간다 — 야자수와
  // 같은 대접이다. "많이"라 30그루씩(쥬라기 야자수 30그루와 같은
  // 규모) — 기사·동물 층(11~24)보다 살짝 바깥, 여신상·목마·록키
  // 템플(20~52) 층과는 겹치지만 나무는 배경을 채우는 정적인 물건이라
  // 괜찮다(`CLAUDE.md`: "배경을 채우는 일은 가만히 서 있는 것들이 한다").
  const treeRows = [-1, 1].map(side => new PropRow({
    geometry: treeGeo, material: treeMat, count: 30, span: GROUND_LEN,
    side, near: 14, spread: 34, radius: 0.8,
  }))
  for (const r of treeRows) scene.add(r.mesh)

  updateTuneReadout()

  const bgRows = [
    knightTune.rows, dogRows, goatRows, treasureRows,
    goddess1Tune.rows, goddess2Tune.rows, horseTune.rows, templeRows, treeRows,
  ]

  // ── 장애물 — 기본 큐브 ──
  // 이 화면은 좌우 배경 배치가 검증 대상이라 장애물은 손 안 댔다.
  // 이타카 전용 장애물이 정해지면 giant/dragon처럼 `obstacleVisual`
  // 패턴으로 바꿔 끼우면 된다.
  const cubeGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6)
  const cubeMat = new THREE.MeshBasicMaterial({ color: '#ff5a5a' })
  const cubeMeshes = new Map()

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
  const slider = $('#lt-slider')
  const applyCurveUI = () => {
    const R = Number(slider.value)
    kUniform.value = kFromRadius(R)
    backdrop.setCurve(kUniform.value)   // 지평선이 오르내리면 하늘 띠도 같이 옮긴다
    $('#lt-r').textContent = `R ${R}`
    const preview = 58
    const drop = dropAt(preview, kFromRadius(R)).toFixed(1)
    const realHorizon = horizonDistance(R, VIEW.camHeight).toFixed(0)
    $('#lt-note').innerHTML =
      `${preview}유닛 앞이 <b>${drop}유닛</b> 내려앉는다.<br>` +
      `진짜 구였다면 지평선이 <b>${realHorizon}유닛</b>에서 끊긴다.`
  }
  slider.addEventListener('input', applyCurveUI)
  applyCurveUI()

  // ── 레벨(=코스 데이터 + 속도) ──
  const spd = $('#lt-spd')
  spd.addEventListener('input', e => {
    const lv = Number(e.target.value)
    course = buildCourse3d(lv)
    now = 0
    cubeMeshes.forEach(m => scene.remove(m))
    cubeMeshes.clear()
    $('#lt-speed').textContent = `LV${lv + 1} · ${course.speed.toFixed(2)}`
  })
  $('#lt-speed').textContent = `LV1 · ${course.speed.toFixed(2)}`

  // ── 레인 이동 — 키보드만. 카메라는 이 화면의 검증 대상이 아니다 ──
  let lane = 1
  const onKey = e => {
    if (e.code === 'ArrowLeft' && lane > 0) { e.preventDefault(); lane-- }
    if (e.code === 'ArrowRight' && lane < 2) { e.preventDefault(); lane++ }
  }
  addEventListener('keydown', onKey)

  const flash = $('#lt-flash')
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

    ground.update(dz)
    backdrop.update(dt)   // 화산 연기가 꺼져 있어 사실상 no-op이지만, 나중에 켜질 때를 대비해 계속 부른다
    for (const rows of bgRows) for (const r of rows) r.update(dz, VIEW.camBack + 4)

    // 장애물 — 시야 안에 든 큐브만 그린다(`visibleEvents`, 다른 lab 화면과 공용 규칙).
    const vis = visibleEvents(course, now, VIEW.far)
    const visIds = new Set()
    for (const { e, z } of vis) {
      if (e.type !== 'cube') continue
      assignCubeLane(e, lane)
      visIds.add(e.id)
      let m = cubeMeshes.get(e.id)
      if (!m) {
        m = new THREE.Mesh(cubeGeo, cubeMat)
        scene.add(m)
        cubeMeshes.set(e.id, m)
      }
      m.position.x = eventX(e, 3)
      m.position.z = z
      m.position.y = 0.8
      if (!judged.has(e.id) && atHit(e, now, course.speed, course.hitWindow)) {
        judged.add(e.id)
        const hit = eventX(e, 3) === laneX(lane, 3)
        flash.classList.toggle('avoid', !hit)
        flash.classList.add('on')
        setTimeout(() => flash.classList.remove('on'), 160)
      }
    }
    for (const [id, m] of cubeMeshes) {
      if (!visIds.has(id)) { scene.remove(m); cubeMeshes.delete(id) }
    }

    renderer.render(scene, camera)

    frames++; acc += dt
    if (acc >= 0.5) {
      const fps = frames / acc
      $('#lt-fps').textContent = fps.toFixed(0)
      grade($('#lt-fps'), fps, 55, 45)
      $('#lt-dc').textContent = renderer.info.render.calls
      $('#lt-tri').textContent = renderer.info.render.triangles.toLocaleString()
      frames = 0; acc = 0
    }
  }
  raf = requestAnimationFrame(loop)

  $('#lt-back').addEventListener('click', () => navigate('/'))

  // **정리는 라우터의 onLeave로 한다** — 페이지가 hashchange를 직접 들으면
  // 이미 #app이 비워진 뒤에 정리가 돈다(CLAUDE.md 규칙).
  onLeave(() => {
    pageLeft = true   // 정리 이후 늦게 도착하는 GLB 로드가 씬을 더 안 건드리게
    cancelAnimationFrame(raf)
    removeEventListener('resize', fit)
    removeEventListener('keydown', onKey)
    removeEventListener('keydown', onTuneKey)
    ground.dispose()
    backdrop.dispose()
    // 배경 프롭 9종(기사·개·염소·방패+돌·여신상 A·B·목마·록키 템플·
    // 나무) — 행마다 지오메트리는 공유(같은 GLB/도형에서 나온 geo를
    // 좌우 두 PropRow가 같이 쓴다)라 dispose는 첫 행에서만, 재질도
    // 마찬가지(나무 지오메트리·재질은 GLB가 아니라 이 파일이 직접
    // 만든 것이지만, 공유·dispose 방식은 같아서 같은 반복문을 탄다).
    for (const rows of bgRows) {
      for (const r of rows) { r.dispose(); scene.remove(r.mesh) }
      const first = rows[0]
      if (first) { first.mesh.material.map?.dispose(); first.mesh.material.dispose() }
    }
    cubeGeo.dispose(); cubeMat.dispose()
    for (const m of cubeMeshes.values()) scene.remove(m)
    renderer.dispose()
  })
}

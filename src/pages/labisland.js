// /lab-island — 오디세이 런 **키클롭스 섬(육지) 프로토타입**. 개발용이다.
//
// ── 왜 여기서 먼저 보나 (labsea.js와 같은 이유) ─────────────────
//
// ken 요청(9/3): "키클롭스 섬에 찾아갔을때 화면을 만들면 될 거 같아. 이건
// 육지이고, 쥬라기에서 사용한 트랙이다 바닥 부분을 가져다가 사용해도 될
// 거 같아. 다만 최대한 [콘셉트아트] 스타일에 맞춰서. 그 트랙 바깥 부분은
// 지금처럼 물로 표현하는 것도 아주 좋을거 같고."
//
// `runner3d/ground.js`는 지금까지 쥬라기 색(`PALETTE`)에 고정돼 있었다 —
// 이 화면을 만들기 전에 `createGround()`에 `palette`/`grass` 옵션을 먼저
// 열었다(`docs/04` STEP 46). 여기서는 그 옵션으로 대리석 팔레트를 먹이고,
// 잔디 대신 `#/lab-sea`의 `water.js`를 그대로 가져와 트랙 바깥을 채운다 —
// 섬이니까 트랙 밖은 바다다.
//
// `runner3d/scene.js`의 `createScene()`은 공룡·야자수까지 전부 쥬라기
// 전용으로 박혀 있어 재사용할 수 없다(`docs/00`의 "테마 데이터를 받게
// 뜯어고치는 리팩터"가 아직 안 됐다) — 그래서 `labsea.js`처럼 이 화면도
// 부품(`ground.js`+`water.js`+`course3d.js`)을 직접 조립한다.
//
// 좌우 바다 배경은 새로 받은 8종이 아니라 `#/lab-sea`가 이미 검증한
// 넷(배·록키 템플·인어·록키 신상=포세이돈)을 그대로 재사용한다 — ken
// 정정(9/3): "이 좌우에 들어간 오브젝트 에셋들은 마지막 스테이지인
// 이타카에 들어갈 에셋들이야." 새 8종은 이타카 화면을 만들 때 쓴다
// (`docs/04` STEP 47). 거인만 예외로 이 화면의 장애물로 그대로 쓴다.
//
// 하늘·기둥·황금 문 같은 나머지 그리스풍 배경물은 다음 단계다.

import * as THREE from 'three'
import { onLeave, navigate } from '../core/router.js'
import { icon } from '../core/icons.js'
import { CURVE, applyCurve, kFromRadius, dropAt, horizonDistance } from '../games/runner3d/curve.js'

export async function labislandPage(app) {
  app.innerHTML = `
    <style>
      #li, #li * { box-sizing: border-box; }
      #li {
        position: fixed; inset: 0; overflow: hidden;
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff; background: #cfeaf9;
      }
      #li-cv { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
      #li-ui {
        position: absolute; left: 0; top: 0; z-index: 5;
        display: flex; flex-direction: column; gap: 8px;
        padding: 12px; width: min(340px, 92vw);
      }
      .li-card {
        background: rgba(20,40,60,0.72); backdrop-filter: blur(8px);
        border: 2px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 12px 14px;
      }
      .li-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 6px 0; }
      .li-row .k { font-size: 0.78rem; color: #7dd3fc; font-weight: 800; }
      .li-row .v { font-size: 1.05rem; font-weight: 900; font-variant-numeric: tabular-nums; }
      .v.ok { color: #6ee75a; } .v.bad { color: #ff6b6b; } .v.warn { color: #ffb36b; }
      .li-btn {
        display: inline-flex; align-items: center; gap: 6px;
        min-height: 40px; padding: 0 14px; border-radius: 9999px;
        background: rgba(255,255,255,0.16); color: #fff; border: 2px solid rgba(255,255,255,0.28);
        font: inherit; font-weight: 800; font-size: 0.82rem; cursor: pointer;
      }
      #li-slider, #li-spd { width: 100%; accent-color: #38bdf8; }
      #li-note { font-size: 0.72rem; color: #274a5e; line-height: 1.5; }
      #li-top { position: absolute; right: 12px; top: 12px; z-index: 6; }
      #li-flash {
        position: absolute; inset: 0; z-index: 4; pointer-events: none;
        background: radial-gradient(120% 90% at 50% 60%, transparent 40%, rgba(255,60,60,0.55));
        opacity: 0; transition: opacity 0.25s;
      }
      #li-flash.on { opacity: 1; transition: opacity 0.05s; }
    </style>

    <div id="li">
      <canvas id="li-cv"></canvas>
      <div id="li-top">
        <button class="li-btn" id="li-back">${icon('back')} 나가기</button>
      </div>
      <div id="li-flash"></div>
      <div id="li-ui">
        <div class="li-card">
          <div class="li-row"><span class="k">렌더 FPS</span><span class="v" id="li-fps">–</span></div>
          <div class="li-row"><span class="k">draw call</span><span class="v" id="li-dc">–</span></div>
          <div class="li-row"><span class="k">삼각형</span><span class="v" id="li-tri">–</span></div>
        </div>
        <div class="li-card">
          <div class="li-row"><span class="k">휨 (보이는 반지름)</span><span class="v" id="li-r">–</span></div>
          <input type="range" id="li-slider" min="60" max="900" step="10" value="900" />
          <div id="li-note"></div>
        </div>
        <div class="li-card">
          <div class="li-row"><span class="k">레벨 (속도·코스)</span><span class="v" id="li-speed">LV1 · 1.00</span></div>
          <input type="range" id="li-spd" min="0" max="4" step="1" value="0" />
          <div style="font-size:0.72rem; color:#274a5e; margin-top:8px">
            ← → 레인 이동.
          </div>
        </div>
        <div class="li-card">
          <div class="li-row"><span class="k">신상 방향</span><span class="v" id="li-rot">–</span></div>
          <div style="font-size:0.72rem; color:#274a5e; line-height:1.5">
            1 / 2 — 신상 15°씩 돌리기<br>
            #/lab-sea에서 이미 찾은 75°가 기본값이다 — 다르게 보이면 여기서 더 맞춘다.
          </div>
        </div>
      </div>
    </div>
  `

  const $ = s => app.querySelector(s)
  const cv = $('#li-cv')

  // 게임 모듈은 **여기서만** 부른다. 정적으로 import하면 허브 번들에 들어간다.
  const { createWater } = await import('../games/runner3d/water.js')
  const { createGround, TRACK_W, PALETTE } = await import('../games/runner3d/ground.js')
  const { PropRow } = await import('../games/runner3d/props.js')
  // 배경 GLB 로더 — `labsea.js`와 공유하는 공용 모듈(`glbProp.js`).
  const { loadNormalizedGlb: _loadNormalizedGlb, loadBgGlbProp: _loadBgGlbProp } =
    await import('../games/runner3d/glbProp.js')
  const { buildCourse3d, visibleEvents, assignCubeLane, eventX, atHit } =
    await import('../games/runner3d/course3d.js')
  const { laneX } = await import('../games/runner3d/character.js')
  const { UNITS_PER_SPEED } = await import('../games/runner3d/scene.js')

  // ── 렌더러·카메라 — `labsea.js`와 같은 값 ──
  // 오디세이 런의 바다·육지 구간이 같은 카메라를 써야 두 구간을 오갈 때
  // 눈높이가 안 튄다(`labsea.js`가 이미 이렇게 하고 있다).
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
  // 콘셉트아트는 맑은 대낮 하늘이다 — 폭풍우였던 바다 구간과 다르다.
  // 아직 그림(하늘 배경)은 없다 — 도형(바닥+물)부터 본 뒤에 다음 단계에서 입힌다.
  const SKY = '#8fd3f4'
  scene.background = new THREE.Color(SKY)
  scene.fog = new THREE.Fog(new THREE.Color('#bfe6f7'), 95, 130)

  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, VIEW.far)
  camera.position.set(0, VIEW.camHeight, VIEW.camBack)
  camera.lookAt(0, VIEW.camHeight * 0.45, -VIEW.camLookAhead)

  const kUniform = { value: CURVE.k }
  const withCurve = m => applyCurve(m, kUniform)

  // ── 바닥·물 길이는 같은 값을 쓴다 ──
  // `ground.js`·`water.js` 둘 다 `mk(..., -length*0.45)` 같은 식으로 판을
  // z 중앙에 맞춘다 — 길이가 다르면 트랙과 물의 되돌리기 주기가 어긋나서
  // 둘이 서로 다른 리듬으로 흐르는 것처럼 보인다.
  const GROUND_LEN = 182

  // ── 대리석 팔레트 — 콘셉트아트(신전 참배길) 기준 ──
  // `ground.js`의 `PALETTE`(쥬라기: 초록 잔디·갈색 돌)를 그대로 복사하지
  // 않고 필요한 키만 덮어쓴다 — 잔디 관련 키(`grass*`)는 `grass:false`라
  // 아예 안 쓰이지만, 팔레트 객체 형태를 그대로 유지해 둔다(나중에
  // 이 섬에도 잔디가 필요해지면 바로 채울 자리가 있다).
  const MARBLE_PALETTE = {
    ...PALETTE,
    stone: '#cbb489', stoneLit: '#f1e2b8', stoneDark: '#8f7752',
    gloss: 'rgba(255,244,205,0.16)',
    edge: '#f4cf46', edgeGlow: 'rgba(255,205,60,0.55)',
    lane: 'rgba(58,140,255,0.85)',      // 콘셉트아트의 파란 모자이크 선
    arrow: 'rgba(255,255,255,0.9)',     // 대리석 위 흰 셰브론
    curbA: '#e9dcb9', curbB: '#cdb98d', curbTop: '#3f8a2f',   // 넝쿨 초록은 그대로
    gem: '#5fd6ff',
  }

  // ── 바닥 (대리석 트랙 + 연석, 잔디 없음) ──
  const ground = createGround(withCurve, GROUND_LEN, { palette: MARBLE_PALETTE, grass: false })
  for (const m of ground.meshes) scene.add(m)

  // ── 물 — 트랙 바깥에만, 좌우 두 조각으로 ──
  // ken 지적(9/3): "트랙에는 물이 없게 해줘" — 스크린샷에 트랙 한가운데
  // 물이 뚫고 올라와 있었다. 처음엔 "트랙·연석이 물보다 살짝 높으니
  // (0.02) 그 위에 얹혀 가릴 것"이라 생각했는데 틀렸다 — 물은 `water.js`가
  // 정점에서 실제로 출렁이는 파도 지오메트리라(단순한 곡률 sag가 아니라
  // 진짜 높이가 흔들린다), 파도 마루가 그 0.02보다 높이 올라오는 순간
  // 카메라에서 봤을 때 트랙보다 **더 가까운 자리**를 차지해 깊이 검사에서
  // 이겨 버린다 — 편평한 트랙 밑에 물을 통째로 깔아 두고 "위에 얹혀
  // 가린다"는 가정 자체가 파도 있는 표면에는 안 맞았다.
  //
  // 고치는 방법은 겹치지 않게 하는 것뿐이다 — 물을 트랙 폭 전체를 덮는
  // 한 장 대신, 연석 바깥(outer)에서 시작하는 **좌우 두 조각**으로
  // 나눴다. 트랙 밑에는 아예 물이 없으니 파도가 아무리 높이 쳐도 뚫고
  // 올라올 자리가 없다.
  const CURB_OUTER = TRACK_W / 2 + 1.1   // ground.js의 CURB.w와 같은 값(연석 바깥 끝)
  const SIDE_WATER_W = 70
  const waterSides = [-1, 1].map(side => {
    const w = createWater(kUniform, { width: SIDE_WATER_W, length: GROUND_LEN })
    // 연석과 살짝 겹치게(0.2유닛) 붙여서 뜯어진 틈이 안 보이게 한다 —
    // 연석이 그 위(y 0~0.55)를 덮으니 겹쳐도 드러나지 않는다.
    w.mesh.position.x = side * (CURB_OUTER - 0.2 + SIDE_WATER_W / 2)
    scene.add(w.mesh)
    return w
  })

  // ── 배경 GLB 프롭 — ken 정정(9/3) ──
  // 처음엔 이 자리에 새로 올라온 8종(기사·개·염소·보물·여신상 둘·목마·
  // 거인)의 나머지 일곱을 배치했는데, ken이 "이 좌우에 들어간 오브젝트
  // 에셋들은 마지막 스테이지인 이타카에 들어갈 에셋들이야. 지금 이
  // 화면에서는 아까 처음 작업한 포세이돈 동상과 인어, 배, 섬 등의
  // 에셋들이 들어가는게 좋을 거 같아"라고 바로잡았다 — 키클롭스 섬은
  // `#/lab-sea`가 이미 검증해 둔 그 바다 배경(록키 신상·인어·배·록키
  // 템플)을 그대로 이어받는 게 맞고, 새 8종은 이타카(마지막 스테이지)
  // 몫으로 남겨 둔다(GLB 파일 자체는 `_lab/island/`에 그대로 있다 —
  // 이타카 화면을 만들 때 쓴다). 거인만 예외 — "좌우 피하는 장애물로
  // giant 에셋을 이용한것도 그대로 진행"이라 아래 장애물 절은 안 건드린다.
  let pageLeft = false   // 로드가 끝나기 전에 화면을 나가면 씬을 더 안 건드린다
  const loadNormalizedGlb = (url, fitBy, target, onReady) =>
    _loadNormalizedGlb(url, fitBy, target, withCurve, onReady, { label: 'lab-island', isAborted: () => pageLeft })
  const loadBgGlbProp = (url, fitBy, target, rowSpecs, rowsOut) =>
    _loadBgGlbProp(url, fitBy, target, withCurve, GROUND_LEN, rowSpecs, rowsOut, scene, { label: 'lab-island', isAborted: () => pageLeft })

  const ISLAND_GLB = '/assets/runner3d/_lab/island/'   // 거인(장애물)만 여기서 쓴다
  const SEA_GLB = '/assets/runner3d/_lab/'   // `#/lab-sea`와 같은 GLB — 배경 넷은 여기서 재사용

  // 배 — `labsea.js`와 같은 자리·크기(footprint 7.4, near 16~28).
  const shipRows = []
  loadBgGlbProp(SEA_GLB + 'ship_odyssey.glb', 'footprint', 7.4, [
    { count: 5, side: -1, near: 16, spread: 12, radius: 4.2, faceTrack: true },
    { count: 5, side: 1, near: 16, spread: 12, radius: 4.2, faceTrack: true },
  ], shipRows)

  // 록키 템플("섬") — `labsea.js`가 STEP 41에서 절차적 섬 프롭 대신
  // 랜드마크로 쓰기로 한 그 모델. 같은 자리(먼바다 26~44, 좌우 각 2개).
  const templeRows = []
  loadBgGlbProp(SEA_GLB + 'temple_odyssey.glb', 'height', 17, [
    { count: 2, side: -1, near: 26, spread: 18, radius: 6, faceTrack: true },
    { count: 2, side: 1, near: 26, spread: 18, radius: 6, faceTrack: true },
  ], templeRows)

  // 인어는 이 화면에서 뺐다 — ken 요청(9/3): "여기서는 좌우 배경
  // 에셋들 중에서 인어는 빼줘." GLB 자체는 손 안 댔다(`#/lab-sea`는
  // 그대로 인어를 쓴다) — 이 화면의 로딩·배치만 지운다.

  // 록키 신상(포세이돈) — 345도(=-15도)가 정면. `rotJitter: 0` — 좌우
  // 각 1개뿐인 랜드마크라 기본 지터를 켜 두면 신상 때 겪은 좌우
  // 비대칭 버그(STEP 45)가 재현된다.
  //
  // STEP 44에서는 75도로 확정했었는데, `#/lab-sea`에서 ken이 "3" 키로
  // 6번 더 돌려 345도가 진짜 정면임을 다시 찾았다(STEP 58, 9/3 —
  // "이 설정값이 최상인거 같아. 이 구도는 다른 스테이지에서도 적용해줘").
  // 같은 GLB(`godstatue_odyssey.glb`)를 쓰는 화면이라 그대로 옮긴다.
  let godstatueRotOffset = -Math.PI / 12   // 345도(=-15도)
  const godstatueRows = []
  loadBgGlbProp(SEA_GLB + 'godstatue_odyssey.glb', 'height', 20, [
    { count: 1, side: -1, near: 34, spread: 16, radius: 7, faceTrack: true, rotOffset: godstatueRotOffset, rotJitter: 0 },
    { count: 1, side: 1, near: 34, spread: 16, radius: 7, faceTrack: true, rotOffset: godstatueRotOffset, rotJitter: 0 },
  ], godstatueRows)

  // ── 방향 미세 조정 — 인어가 빠져서 신상 하나만 남았다 ──
  // 75도는 `#/lab-sea`에서 이미 확인된 값이지만, 물 배치가 달라진 이
  // 화면에서 각도가 다르게 보일 수도 있어 조작은 그대로 살려 둔다.
  function nudgeRotOffset(rows, delta) {
    for (const row of rows) {
      for (const it of row.items) it.rot += delta
      row.sync()
    }
  }
  const ROT_STEP = Math.PI / 12   // 15도
  const rotDeg = r => Math.round((((r % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 180 / Math.PI)
  const updateRotReadout = () => {
    const el = $('#li-rot')
    if (el) el.textContent = `신상 ${rotDeg(godstatueRotOffset)}°`
  }
  const onRotKey = e => {
    if (e.code === 'Digit1') { godstatueRotOffset -= ROT_STEP; nudgeRotOffset(godstatueRows, -ROT_STEP) }
    else if (e.code === 'Digit2') { godstatueRotOffset += ROT_STEP; nudgeRotOffset(godstatueRows, ROT_STEP) }
    else return
    updateRotReadout()
  }
  addEventListener('keydown', onRotKey)
  updateRotReadout()

  const bgRows = [shipRows, templeRows, godstatueRows]

  // ── 장애물 — 도형이 기본, 거인(giant) GLB가 오면 바꿔 낀다 ──
  // ken 요청(9/3): "giant 모델 glb 파일은 좌우 피하는 장애물로 활용하면
  // 돼. 쥬라기 런에서 공룡들에 준 모션을 적용해주면 좋을 거 같아." —
  // 뼈대 없는 단일 메시라 쥬라기 배경 공룡의 `DinoRow`+`animateDino`
  // (부위별 셰이더 애니메이션, Blender로 몸통·머리를 나눠 내보내야
  // 한다 — 이 세션엔 그 파이프라인이 없다)는 그대로 못 쓴다. 대신
  // 바다 구간의 드래곤 장애물과 같은 저비용 대안 — 둥실+좌우 틀기+
  // 펄스를 매 프레임 직접 얹는다. "공룡에게 준 모션"과 다른 손으로
  // 짰지만, 뼈 없는 단일 메시에 살아있는 느낌을 내는 지금 가능한
  // 방법은 이것뿐이다(드래곤과 같은 사정 — `labsea.js` 참고).
  const cubeGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6)
  const cubeMat = new THREE.MeshBasicMaterial({ color: '#ff5a5a' })
  const obstacleVisual = { geo: cubeGeo, mat: cubeMat, baseY: 0.8 }
  // ken 요청(9/3): "트랙에 보이는 거인 장애물만 크기를 더 키워줘." 5.2 → 6.8
  // (약 30%). 드래곤(4.6)보다도 훨씬 커서 이름값("거인")에 맞춘다 —
  // 발판 폭이 레인 폭(`TRACK_W/3`≈5유닛)에 거의 닿는 크기라 더 키우면
  // 옆 레인까지 시각적으로 걸치기 시작한다(드래곤과 같은 한계, STEP 45).
  let giantGeo = null, giantMat = null   // GLB가 오면 채워진다 — onLeave가 같이 치운다
  loadNormalizedGlb(ISLAND_GLB + 'giant_odyssey.glb', 'height', 6.8, (geo, mat) => {
    giantGeo = geo; giantMat = mat
    obstacleVisual.geo = geo; obstacleVisual.mat = mat; obstacleVisual.baseY = 0
  })
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
  const slider = $('#li-slider')
  const applyCurveUI = () => {
    const R = Number(slider.value)
    kUniform.value = kFromRadius(R)
    $('#li-r').textContent = `R ${R}`
    const preview = 58
    const drop = dropAt(preview, kFromRadius(R)).toFixed(1)
    const realHorizon = horizonDistance(R, VIEW.camHeight).toFixed(0)
    $('#li-note').innerHTML =
      `${preview}유닛 앞이 <b>${drop}유닛</b> 내려앉는다.<br>` +
      `진짜 구였다면 지평선이 <b>${realHorizon}유닛</b>에서 끊긴다.`
  }
  slider.addEventListener('input', applyCurveUI)
  applyCurveUI()

  // ── 레벨(=코스 데이터 + 속도) ──
  const spd = $('#li-spd')
  spd.addEventListener('input', e => {
    const lv = Number(e.target.value)
    course = buildCourse3d(lv)
    now = 0
    cubeMeshes.forEach(m => scene.remove(m))
    cubeMeshes.clear()
    $('#li-speed').textContent = `LV${lv + 1} · ${course.speed.toFixed(2)}`
  })
  $('#li-speed').textContent = `LV1 · ${course.speed.toFixed(2)}`

  // ── 레인 이동 — 키보드만. 카메라는 이 화면의 검증 대상이 아니다 ──
  let lane = 1
  const onKey = e => {
    if (e.code === 'ArrowLeft' && lane > 0) { e.preventDefault(); lane-- }
    if (e.code === 'ArrowRight' && lane < 2) { e.preventDefault(); lane++ }
  }
  addEventListener('keydown', onKey)

  const flash = $('#li-flash')
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
    for (const w of waterSides) w.update(dz, dt)
    for (const rows of bgRows) for (const r of rows) r.update(dz, VIEW.camBack + 4)

    // 장애물 — 시야 안에 든 큐브만 그린다(`visibleEvents`, 육지·바다 공용 규칙).
    const vis = visibleEvents(course, now, VIEW.far)
    const visIds = new Set()
    for (const { e, z } of vis) {
      if (e.type !== 'cube') continue
      assignCubeLane(e, lane)
      visIds.add(e.id)
      let m = cubeMeshes.get(e.id)
      if (!m) {
        m = new THREE.Mesh(obstacleVisual.geo, obstacleVisual.mat)
        // 만들어질 때 모양을 기억해 둔다 — `obstacleVisual`은 거인이
        // 나중에 도착하면 바뀌지만, **이미 만들어진 이 메시는 그대로**다
        // (`labsea.js`의 드래곤과 같은 사정 — 이미 떠 있는 장애물까지
        // 바꿔 끼우진 못한다).
        m.userData.giant = obstacleVisual.mat === giantMat
        m.userData.baseY = obstacleVisual.baseY
        scene.add(m)
        cubeMeshes.set(e.id, m)
      }
      m.position.x = eventX(e, 3)
      m.position.z = z
      // idle 모션 — 거인도 뼈대 없는 GLB라 드래곤과 같은 방식으로
      // 둥실+좌우 틀기+펄스를 얹는다. `e.id`로 위상을 흩어 거인마다
      // 박자가 어긋나게 한다.
      if (m.userData.giant) {
        m.position.y = m.userData.baseY + Math.sin(now * 1.4 + e.id * 1.7) * 0.15
        m.rotation.y = Math.sin(now * 0.8 + e.id * 0.6) * 0.2
        const pulse = 1 + Math.sin(now * 1.9 + e.id * 0.9) * 0.03
        m.scale.setScalar(pulse)
      } else {
        m.position.y = m.userData.baseY
      }
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
      $('#li-fps').textContent = fps.toFixed(0)
      grade($('#li-fps'), fps, 55, 45)
      $('#li-dc').textContent = renderer.info.render.calls
      $('#li-tri').textContent = renderer.info.render.triangles.toLocaleString()
      frames = 0; acc = 0
    }
  }
  raf = requestAnimationFrame(loop)

  $('#li-back').addEventListener('click', () => navigate('/'))

  // **정리는 라우터의 onLeave로 한다** — 페이지가 hashchange를 직접 들으면
  // 이미 #app이 비워진 뒤에 정리가 돈다(CLAUDE.md 규칙).
  onLeave(() => {
    pageLeft = true   // 정리 이후 늦게 도착하는 GLB 로드가 씬을 더 안 건드리게
    cancelAnimationFrame(raf)
    removeEventListener('resize', fit)
    removeEventListener('keydown', onKey)
    removeEventListener('keydown', onRotKey)
    ground.dispose()
    for (const w of waterSides) w.dispose()
    // 배경 프롭 3종(배·록키 템플·신상) — 행마다 지오메트리는
    // 공유(같은 GLB에서 나온 geo를 좌우 두 PropRow가 같이 쓴다)라
    // dispose는 첫 행에서만, 재질도 마찬가지.
    for (const rows of bgRows) {
      for (const r of rows) { r.dispose(); scene.remove(r.mesh) }
      const first = rows[0]
      if (first) { first.mesh.material.map?.dispose(); first.mesh.material.dispose() }
    }
    if (giantGeo) { giantGeo.dispose(); giantMat.map?.dispose(); giantMat.dispose() }
    cubeGeo.dispose(); cubeMat.dispose()
    for (const m of cubeMeshes.values()) scene.remove(m)
    renderer.dispose()
  })
}

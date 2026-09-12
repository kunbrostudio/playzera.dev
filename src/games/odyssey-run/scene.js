// 오디세이 런 — **3 스테이지 · 6 레벨의 씬.** ★
//
// ── 왜 runner3d/scene.js를 안 쓰나 ────────────────────────────
//
// `runner3d/scene.js`는 공룡·야자수·쥬라기 팔레트가 통째로 하드코딩돼 있다.
// 테마 데이터를 받게 뜯어고치는 건 "대규모 runner3d 리팩터"라 범위 밖이다.
// 대신 `#/lab-island`·`#/lab-sea`·`#/lab-ithaca` 프로토타입이 검증한 조립
// (`ground.js`+`water.js`+`glbProp.js`+`props.js`)을 가져오고, `play3d.js`가
// 기대하는 **씬 계약**(course·run·judge·headScreen·update)을 얹는다. 그 계약
// 로직은 `runner3d/scene.js`의 `update()`를 그대로 옮긴 것이다 — 규칙·판정은
// 쥬라기와 완전히 같아야 기록을 견줄 수 있다(`course3d.js` 주석).
//
// ── 스테이지 ─────────────────────────────────────────────────
//
//   Stage 0 (키클롭스 섬)   Lv1·Lv2   대리석 트랙 + 양옆 바다
//   Stage 1 (포세이돈 바다) Lv3·Lv4   전면 물 + 젖은 갑판 트랙 + 소용돌이
//   Stage 2 (이타카)        Lv5·Lv6   흙길 + 마른 들판, 물 없음
//
// `setLevel(i)`가 스테이지 경계(Lv2→3, Lv4→5)에서 시각 레이어를 부수고
// 다시 짓는다. **run(목숨·점수·운동량)은 안 건드린다** — 6판이 한 판이다
// (`play3d.js`: "목숨과 점수는 이어진다").
//
// ── 속도는 스테이지가 바뀌어도 리셋되지 않는다 ★ ─────────────
//
// `buildCourse3d(i, speedMult, { levels: ODYSSEY_LEVELS })` — 절대 레벨(0~5)로
// 인덱싱하는 6판짜리 표라, Lv1 → Lv6로 계속 빨라진다.

import * as THREE from 'three'
import { CURVE, applyCurve } from '../runner3d/curve.js'
import { createGround, TRACK_W } from '../runner3d/ground.js'
import { createWater } from '../runner3d/water.js'
import { createCharacter } from '../runner3d/character.js'
import { playerSkin } from '../../core/playerSkin.js'
import { buildCourse3d, visibleEvents, assignCubeLane, eventX, atHit } from '../runner3d/course3d.js'
import { createRun } from '../runner3d/judge.js'
import { VIEW, fovFor, UNITS_PER_SPEED } from '../runner3d/scene.js'
import { createBackdrop, PANORAMA, BACKDROP_ART } from '../runner3d/backdrop.js'
import { loadNormalizedGlb, loadBgGlbProp } from '../runner3d/glbProp.js'
import { createPortal } from '../runner3d/portal.js'
import { warmGlb } from '../runner3d/models.js'
import { ODYSSEY_LEVELS, stageOf, isStageFinale } from './levels.js'
import { STAGES, POSE_BOX, ODYSSEY_SKY } from './stages.js'
import { makeWhirlpool } from './whirlpool.js'
import { makeBoat } from './boat.js'
import { makeSea } from './sea.js'

// 자세 팻말 이벤트 순서(`course.js`) → 스테이지 팻말 GLB 인덱스.
const POSE_ORDER = ['lunge', 'forwardbend', 'armsopen']

const _v = new THREE.Vector3()
const GROUND_LEN = VIEW.span * 1.4
const LANE_W = TRACK_W / 3
const CURB_OUTER = TRACK_W / 2 + 1.1

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{dpr?:number, speedMult?:number}} [o]
 */
export function createScene(canvas, { dpr = Math.min(2, window.devicePixelRatio || 1), speedMult = 1 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(dpr)
  renderer.toneMapping = THREE.NoToneMapping

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.5, VIEW.far)
  camera.position.set(0, VIEW.camHeight, VIEW.camBack)
  camera.lookAt(0, VIEW.camHeight * 0.45, -VIEW.camLookAhead)

  const kUniform = { value: CURVE.k }
  const withCurve = m => applyCurve(m, kUniform)

  let aborted = false   // 씬 전체를 떠났다

  // ── 주인공 — 러너 전 테마 공용(`_shared/char`). 스테이지가 바뀌어도 유지된다 ──
  let character = null
  createCharacter(withCurve, playerSkin(), 3)
    .then(c => {
      if (aborted) { c.dispose?.(); return }
      character = c; scene.add(c.mesh)
    })
    .catch(e => console.warn('[odyssey] 캐릭터 없음:', e.message))

  // ── 스테이지 레이어 ───────────────────────────────────────────
  // `buildStage`가 바닥·물·배경 프롭·장애물 자원을 만들고, 씬에 붙인 것과
  // dispose 목록을 함께 들고 있다. 스테이지가 바뀔 때 통째로 부순다.

  /** @param {number} stageIdx */
  function buildStage(stageIdx) {
    const cfg = STAGES[stageIdx]
    const added = []      // scene에 add한 최상위 오브젝트(remove 대상)
    const disposers = []  // dispose()에서 부를 정리 함수
    const rows = []       // PropRow — update(dz)가 필요
    const seaLayers = []  // makeSea 결과 — update(dz, dt)
    let waters = []       // createWater 결과 — update(dz, dt)
    let ground = null

    // ── 이 스테이지 전용 중단 플래그 ★ ──────────────────────────
    // 스테이지가 바뀌면(씬은 살아 있고 이 스테이지만 부순다) 씬 전체의
    // `aborted`는 아직 false다. 늦게 도착한 GLB 콜백이 부서진 스테이지의
    // 씬에 오브젝트를 얹지 않게 별도 플래그를 둔다(`labisland.js`의
    // `pageLeft`와 같은 발상 — 다만 스테이지 단위).
    let stageGone = false
    const glb = (label) => ({ label, isAborted: () => aborted || stageGone })

    // ── 하늘 ★ ──────────────────────────────────────────────────
    // 섬·이타카는 공통 파란 하늘·구름(`ODYSSEY_SKY`). 능선·화산은 안 준다
    // (`art`에 `sky`만 — `#/lab-sea`·`#/lab-ithaca`와 같은 방식). 지평선
    // 아래는 스테이지의 `groundColor`로 채운다(안개색과 이어져야 색이 안 갈림).
    // 폭풍 스테이지(Stage 2)는 **하늘 그림 자체를 바꾼다** — 쥬라기 3D가
    // 기본으로 쓰는 `BACKDROP_ART.sky`(어두운 먹구름 원본, `createBackdrop`의
    // 기본값)를 그대로 가져온다. 전엔 배경색만 어둡게 하고 하늘 그림은
    // 그대로 밝은 것을 썼더니 "여전히 밝은 하늘"로 보였다(ken QA, STEP 87 —
    // 검은 오버레이로 대충 가리지 말고 실제 하늘 그림을 바꾸라는 지적).
    scene.background = new THREE.Color(cfg.weather ? '#131f2d' : PANORAMA.skyTop)
    scene.fog = new THREE.Fog(new THREE.Color(cfg.fog[0]), cfg.fog[1], cfg.fog[2])
    const backdrop = createBackdrop({
      camHeight: VIEW.camHeight, camBack: VIEW.camBack, k: kUniform.value,
      art: { sky: cfg.weather ? BACKDROP_ART.sky : ODYSSEY_SKY },
      groundColor: cfg.groundColor,
      smoke: false,
    })
    scene.add(backdrop.group); added.push(backdrop.group)
    disposers.push(() => backdrop.dispose())

    // 바닥 트랙 (바다 스테이지는 없다 — 트랙이 곧 바닷물)
    if (cfg.ground) {
      ground = createGround(withCurve, GROUND_LEN, cfg.ground)
      for (const m of ground.meshes) { scene.add(m); added.push(m) }
      disposers.push(() => ground.dispose())
    }

    // 물
    const waterY = cfg.waterY ?? 0
    if (cfg.water === 'sides') {
      const SIDE_W = 70
      waters = [-1, 1].map(side => {
        const w = createWater(kUniform, { width: SIDE_W, length: GROUND_LEN })
        w.mesh.position.set(side * (CURB_OUTER - 0.2 + SIDE_W / 2), waterY, 0)
        scene.add(w.mesh); added.push(w.mesh)
        return w
      })
    } else if (cfg.water === 'full') {
      // 트랙 전체를 덮는 물 — `#/lab-sea` 방식. 바닥 트랙이 없어(`cfg.ground:
      // null`) 물마루가 뚫을 트랙 자체가 없다. 프롭·소용돌이도 이 y 기준이라
      // 공중에 안 뜬다(ken 지적: "좌우 오브젝트가 하늘에 떠 있다").
      const w = createWater(kUniform, { width: 140, length: GROUND_LEN })
      w.mesh.position.y = waterY
      scene.add(w.mesh); added.push(w.mesh)
      waters = [w]

      // 트랙 시각화 + 폭풍 — `sea.js`(labsea 프로토타입 이식). 부표(경계) +
      // 흰 가이드 라인(레인 경계) + (weather면) 어두운 구름·비·번개.
      // ken QA: "물 위에서 lane 경계가 거의 안 보인다" / "폭풍 느낌이 약하다".
      if (cfg.seaTrack || cfg.weather) {
        const sea = makeSea({ scene, withCurve, span: GROUND_LEN, waterY, weather: cfg.weather ?? null })
        seaLayers.push(sea)
        disposers.push(() => sea.dispose())
      }
    }
    disposers.push(() => { for (const w of waters) w.dispose() })

    // 배경 GLB 프롭 — 좌우 PropRow. GLB가 늦게 와도 씬은 돌아간다.
    for (const p of cfg.props) {
      loadBgGlbProp(p.url, p.fit, p.size, withCurve, GROUND_LEN, p.rows, rows, scene, glb(`odyssey-${cfg.key}-prop`))
    }
    disposers.push(() => {
      const seenMat = new Set()
      for (const r of rows) {
        r.dispose(); scene.remove(r.mesh)
        const mat = r.mesh.material
        if (!seenMat.has(mat)) { seenMat.add(mat); mat.map?.dispose(); mat.dispose() }
      }
    })

    // ── 장애물 자원 ──
    // ★ STEP 87부터 도형 폴백을 안 쓴다(ken QA — "파란 box가 순간적으로
    // 보인다"). 예전엔 GLB가 도착하기 전까지 스테이지 색(`cfg.obstacleColor`)
    // 상자를 그렸는데, 포세이돈의 색이 파랑(`#2f6d9a`)이라 그 상자가
    // 정확히 "파란 직육면체"로 보였다 — 네트워크가 느리면 매번, 스테이지
    // 전환 직후엔 다른 스테이지에서도 순간적으로 보일 수 있었다. 지금은
    // GLB가 준비되기 전엔 **그 이벤트를 그리지 않는다**(아래 `syncObstacles`의
    // `!k.geo` 가드) — 판정(`atHit`)은 시간 기준이라 시각 유무와 무관하게
    // 그대로 돈다. `preloadStage`가 스테이지 전환 스토리 동안 다음 스테이지
    // GLB를 이미 당겨 두므로, 실제로 안 보이는 채로 넘어가는 경우는 거의 없다.
    const kinds = {
      cube:       { geo: null, mat: null, y: 1.3, lane: true, motion: cfg.lane.motion },
      hurdleLow:  { geo: null, mat: null, y: 0.45 },
      hurdleWide: { geo: null, mat: null, y: 3.4 },
      'pose:lunge':       { geo: null, mat: null, y: POSE_BOX.h / 2, sign: true },
      'pose:forwardbend': { geo: null, mat: null, y: POSE_BOX.h / 2, sign: true },
      'pose:armsopen':    { geo: null, mat: null, y: POSE_BOX.h / 2, sign: true },
    }

    // ── GLB를 kinds에 갈아 끼운다 ──
    // 도착 전엔 그 이벤트를 안 그리고, 도착하면 이후 스폰부터 GLB다.
    // GLB에서 나온 지오메트리·재질은 스테이지 dispose에서 정리한다.
    const ownedGlb = []   // 정리할 GLB 지오메트리 + 재질
    const swap = (kindKey, url, fit, size, y, label, flip = false) => {
      loadNormalizedGlb(url, fit, size, withCurve, (geo, mat) => {
        // flip — 원본 실루엣이 캐릭터 pose와 반대 방향일 때 x축으로 뒤집는다
        // (`stages.js` poseFlip, ken QA). GLB 재질은 DoubleSide라 감김 순서가
        // 뒤집혀도 안 사라진다.
        if (flip) geo.scale(-1, 1, 1)
        const k = kinds[kindKey]
        k.geo = geo; k.mat = mat; k.y = y
        ownedGlb.push({ geo, mat })
      }, glb(label))
    }
    disposers.push(() => {
      for (const { geo, mat } of ownedGlb) { geo.dispose(); mat.map?.dispose(); mat.dispose() }
    })

    // 레인 장애물 (거인 / 드래곤(스킬라) / 전사상)
    swap('cube', cfg.lane.url, cfg.lane.fit, cfg.lane.size, cfg.lane.y, `odyssey-${cfg.key}-lane`)

    // 점프(hurdleLow) — 소용돌이(코드) 또는 GLB(양떼·도끼 줄)
    let whirl = null
    if (cfg.jump.kind === 'whirlpool') {
      whirl = makeWhirlpool(withCurve)
      kinds.hurdleLow = { whirlpool: whirl, y: 0 }
      disposers.push(() => whirl.dispose())
    } else if (cfg.jump.url) {
      swap('hurdleLow', cfg.jump.url, cfg.jump.fit, cfg.jump.size, cfg.jump.y ?? 0, `odyssey-${cfg.key}-jump`)
    }

    // 숙이기(hurdleWide) — GLB(키클롭스 게이트)가 있을 때만. 없으면 이벤트
    // 자체를 코스에서 뺀다(`stageCourse`) — placeholder box 안 씀(ken).
    if (cfg.crouch) {
      swap('hurdleWide', cfg.crouch.url, cfg.crouch.fit, cfg.crouch.size, cfg.crouch.y ?? 0, `odyssey-${cfg.key}-crouch`)
    } else {
      delete kinds.hurdleWide
    }

    // 자세 팻말 — 스테이지 전용 세트. 이벤트 pose로 갈린다. null인 칸은
    // 팻말도 안 만들고 이벤트도 코스에서 뺀다(`stageCourse`).
    POSE_ORDER.forEach((pose, i) => {
      const url = cfg.pose[i]
      if (url) swap('pose:' + pose, url, 'height', cfg.poseSize, 0, `odyssey-${cfg.key}-pose-${pose}`, cfg.poseFlip?.[i] === true)
      else delete kinds['pose:' + pose]
    })

    // ── Finish Gate — 스테이지 전용 ★ ─────────────────────────────
    // STEP 86부터 스테이지마다 다른 관문 GLB를 쓴다(키클롭스/포세이돈/
    // 이타카 각자 실제 asset) — 그래서 관문도 다른 장애물처럼 **스테이지
    // 레이어 소유**로 옮겼다(전엔 씬 레벨에서 하나만 공유했다). `runner3d/
    // portal.js`(정식 결승 포털)는 그대로 재사용 — 껍데기(`opts.shell`)만
    // `cfg.finishGate`로 스테이지마다 바뀐다. lifecycle(archGate → funnel →
    // passThrough → 레벨 완료/finish)은 `play3d.js` 것을 그대로 탄다.
    const portal = createPortal(withCurve, kUniform, {
      shell: { name: cfg.finishGate.name, subdir: cfg.finishGate.subdir, group: true },
      // 관문(높이 13유닛)에 실제 뚫린 구멍이 없어서(신전/아치 파사드) 셰이더
      // 문은 **파사드 앞쪽**(z=3.8)에 세운다 — 가산 합성이라 기둥 위에
      // 얹혀도 벽이 아니라 빛나는 관문으로 읽힌다. 세 관문 다 같은 높이로
      // 정규화했으니(`optimize.mjs fitHeight:13`) 문 크기·자리도 공용.
      door: { w: 6.8, h: 9.8, y: 5.0, z: 3.8 },
      fire: null,   // 신화 관문 셋 다 탑 불꽃은 안 어울린다
      isAborted: () => aborted || stageGone,   // 스테이지를 나가면 늦은 콜백을 막는다
    })
    scene.add(portal.group); added.push(portal.group)
    disposers.push(() => portal.dispose())

    return {
      cfg,
      kinds,
      portal,
      update(dz, dt) {
        backdrop.update(dt)
        ground?.update(dz)
        for (const w of waters) w.update(dz, dt)
        for (const s of seaLayers) s.update(dz, dt)
        // 3번째 인자 dt — `bob`/`sway`를 켠 PropRow가 시간을 밖에서 받는다.
        for (const r of rows) r.update(dz, VIEW.camBack + 4, dt)
        whirl?.tick(dt)
      },
      dispose() {
        stageGone = true   // 늦게 오는 GLB 콜백을 막는다
        for (const d of disposers) { try { d() } catch (e) { console.warn('[odyssey] 스테이지 정리:', e) } }
        for (const m of added) scene.remove(m)
      },
    }
  }

  let curStage = stageOf(0)
  let stage = buildStage(curStage)

  // ── 코스 ──
  // archGate 이벤트를 **스테이지 경계(Lv2·Lv4·Lv6)마다** 넣는다 —
  // `play3d.js`의 passThrough가 이걸 보고 레벨 완료(→ 전환 스토리) 또는
  // finish(→ 결과)를 탄다. 정식 finish lifecycle 재사용(`docs/04` STEP 82).
  const courseOpts = { levels: ODYSSEY_LEVELS, archGate: isStageFinale }

  /**
   * 코스를 만들고, **자산이 없는 장애물 이벤트를 뺀다** ★
   * Stage 2·3은 crouch GLB가 없고(`cfg.crouch === null`), Stage 2 pose·Stage 3
   * armsopen도 없다(`cfg.pose[i] === null`). placeholder box를 안 쓰기로 했으니
   * (ken) 그 이벤트를 코스에서 지운다 — 안 지우면 안 보이는 장애물에 맞아
   * 목숨이 준다(`judge.js`는 통과 못 하면 HIT). 자산이 오면 `stages.js`의
   * null만 채우면 이벤트가 되살아난다.
   */
  function stageCourse(levelIdx) {
    const c = buildCourse3d(levelIdx, speedMult, courseOpts)
    const cfg = STAGES[stageOf(levelIdx)]
    c.events = c.events.filter(e => {
      if (e.type === 'hurdleWide' && !cfg.crouch) return false
      if (e.type === 'poseSign') {
        const i = POSE_ORDER.indexOf(e.pose ?? 'lunge')
        if (i >= 0 && !cfg.pose[i]) return false
      }
      return true
    })
    return c
  }

  let course = stageCourse(0)
  let now = 0
  let run = createRun()
  let onResult = null
  let asked = null
  let upcoming = null

  const obMeshes = new Map()   // event.id -> { obj, kind }

  const PORTAL_FUNNEL = 26   // 관문 앞 이만큼부터 가운데 레인으로 모은다(쥬라기와 같다)

  function syncObstacles(vis) {
    const live = new Set()
    for (const { e, z } of vis) {
      // poseSign 이벤트는 pose(lunge/forwardbend/armsopen)로 갈린다 —
      // 스테이지 전용 팻말 세트에서 골라 그린다.
      const key = e.type === 'poseSign' ? 'pose:' + (e.pose ?? 'lunge') : e.type
      const k = stage.kinds[key]
      // GLB가 아직 안 왔으면(k.geo === null) 이 이벤트를 아직 안 그린다 —
      // 도형 폴백을 안 쓰기로 했다(STEP 87, 위 kinds 주석). 소용돌이는
      // 코드로 바로 만들어져 항상 준비돼 있다. 판정(atHit)은 시간 기준이라
      // 시각 유무와 무관하게 그대로 돈다 — 다음 프레임에 GLB가 오면 그때
      // 바로 나타난다.
      if (!k || (!k.whirlpool && !k.geo)) continue
      live.add(e.id)
      let rec = obMeshes.get(e.id)
      if (!rec) {
        let obj
        if (k.whirlpool) obj = k.whirlpool.createMesh()
        else obj = new THREE.Mesh(k.geo, k.mat)
        obj.frustumCulled = false
        rec = { obj, whirl: !!k.whirlpool, lane: !!k.lane, motion: k.motion, baseY: k.y }
        scene.add(obj)
        obMeshes.set(e.id, rec)
      }
      rec.obj.position.x = eventX(e, 3)
      rec.obj.position.z = z
      if (rec.whirl) {
        // 소용돌이는 y·scale이 자원에 이미 박혀 있다 — z만 옮긴다.
        continue
      }
      rec.obj.scale.set(e.mirror ? -1 : 1, 1, 1)
      if (rec.lane && rec.motion === 'float') {
        rec.obj.position.y = rec.baseY + Math.sin(now * 1.4 + e.id * 1.7) * 0.15
        rec.obj.rotation.y = Math.sin(now * 0.8 + e.id * 0.6) * 0.2
        rec.obj.scale.setScalar(1 + Math.sin(now * 1.9 + e.id * 0.9) * 0.03)
      } else if (rec.lane && rec.motion === 'sway') {
        rec.obj.position.y = rec.baseY + Math.sin(now * 1.1 + e.id * 1.3) * 0.1
        rec.obj.rotation.y = (e.mirror ? -1 : 1) * (0.15 + Math.sin(now * 1.6 + e.id) * 0.25)
      } else {
        rec.obj.position.y = rec.baseY
      }
    }
    for (const [id, rec] of obMeshes) {
      if (!live.has(id)) { scene.remove(rec.obj); obMeshes.delete(id) }
    }
  }

  function clearObstacles() {
    for (const rec of obMeshes.values()) scene.remove(rec.obj)
    obMeshes.clear()
  }

  // ── 배 빌보드 (바다 스테이지) ★ ─────────────────────────────
  // 바다 스테이지에서는 러닝 캐릭터를 숨기고 "소년+오디세우스가 노 젓는 배"
  // 빌보드를 그린다(ken: "달리는 boy runner 사용 금지"). 판정·레인·점프
  // 상태는 여전히 `character`가 갖고, 빌보드는 그 x·점프를 따라간다.
  let boat = null
  let boatLoading = false
  function syncBoat() {
    const want = !!stage.cfg.boat
    if (want && !boat && !boatLoading && character) {
      boatLoading = true
      makeBoat(withCurve, () => aborted).then(b => {
        boatLoading = false
        if (!b || aborted || !stage.cfg.boat) { b?.dispose?.(); return }
        boat = b
        scene.add(b.mesh)
        if (character) character.mesh.visible = false
      }).catch(() => { boatLoading = false })
    } else if (!want && boat) {
      scene.remove(boat.mesh); boat.dispose(); boat = null
      if (character) character.mesh.visible = true
    }
  }

  return {
    renderer, scene, camera, kUniform,
    get character() { return character },
    get course() { return course },
    get now() { return now },
    get run() { return run },
    get askedPose() { return asked },
    get upcoming() { return upcoming },
    /** 디버그·테스트용 — 지금 어느 스테이지인가(0·1·2). */
    get stageIndex() { return curStage },

    setLevel(i) {
      const s = stageOf(i)
      if (s !== curStage) {
        clearObstacles()
        stage.dispose()
        stage = buildStage(s)
        curStage = s
      }
      // **run은 안 만든다** — 6판이 한 판이다(목숨·점수·운동량이 이어진다).
      course = stageCourse(i)
      now = 0
      stage.portal.active = false   // update()에서 archGate 이벤트를 보고 다시 켠다
      clearObstacles()
      syncBoat()   // 스테이지가 바뀌면 배를 바로 넣거나 뺀다(1프레임 깜빡임 방지)
    },

    onResult(fn) { onResult = fn },

    /**
     * 다음 스테이지의 **장애물 GLB만** 미리 받아 캐시에 넣는다(`play3d.js`가
     * 전환 스토리 직전에 부른다). 배경 프롭은 늦게 떠도 되니 안 당긴다 —
     * "critical asset만 준비"(Codex). 스테이지가 안 바뀌면 아무것도 안 한다.
     */
    preloadStage(levelIdx) {
      const s = stageOf(levelIdx)
      if (s === curStage) return
      const cfg = STAGES[s]
      const urls = [cfg.lane.url, ...cfg.pose]
      if (cfg.jump.url) urls.push(cfg.jump.url)
      if (cfg.crouch) urls.push(cfg.crouch.url)
      warmGlb(urls)
    },

    headScreen() {
      if (!character) return null
      const m = character.mesh
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
      camera.fov = fovFor(aspect)
      camera.updateProjectionMatrix()
      camera.lookAt(0, VIEW.camHeight * 0.45, -VIEW.camLookAhead)
    },

    // ── `runner3d/scene.js`의 update()를 옮긴 것이다 ★ ────────────
    update(dt, speed) {
      const dz = speed * UNITS_PER_SPEED * dt
      now += dt

      stage.update(dz, dt)
      character?.update(dt)
      syncBoat()
      // jumpOffset(연속값) — jumping(불리언) 대신 넘긴다. boat.js 주석 참고
      // (ken QA: "점프 회피 모션이 끊긴다" → 스냅 대신 같은 포물선을 따라감).
      // 숙이기·자세 동작 그림(STEP 87, ken QA — "성공해도 그림이 안 바뀐다").
      // 자세 방향(STEP 90, ken QA — "장애물은 뒤집혔는데 배 위 캐릭터는
      // 그대로라 서로 반대 방향으로 보인다") — `character.poseMirror`가
      // 사인판·판정과 같은 source of truth다(`character.setPose`가 그
      // 사인판의 `e.mirror`를 그대로 받아 저장한 값). 크로치는 좌우가
      // 없는 대칭 장애물이라 반전 대상이 아니다.
      if (boat && character) {
        const action = character.ducking ? 'crouch' : character.posing
        const mirror = character.posing ? character.poseMirror : false
        boat.update(now, character.mesh.position.x, character.jumpOffset, action, mirror)
      }

      const vis = visibleEvents(course, now, VIEW.far)
      for (const { e } of vis) assignCubeLane(e, character?.lane ?? 1)
      syncObstacles(vis)

      // ── 결승 포털 ★ ── (`runner3d/scene.js`의 그것을 그대로 옮겼다)
      // 인스턴싱 통에 안 담기므로 여기서 자리를 준다. 지나간 뒤에도 뒤에
      // 남아 있어야 통과한 그림이 되므로 화면 뒤로 넘어가도 안 숨긴다.
      // `stage.portal` — 스테이지 전용(STEP 86, 스테이지마다 다른 관문 GLB).
      const gateEvent = course.events.find(e => e.type === 'archGate')
      stage.portal.active = !!gateEvent
      if (gateEvent) {
        const gz = course.zOf(gateEvent, now)
        stage.portal.place(gz)
        stage.portal.update(dt, 1 - Math.min(1, Math.max(0, -gz) / 60))
        // 문(6.4)이 트랙(15)보다 좁다 — 바깥 레인 아이는 기둥에 박힌다.
        // 26유닛 앞부터 조용히 가운데로 모은다(보간이 있어 끌려가는 게 아니라
        // 스스로 달려 들어가는 것처럼 보인다). 판정은 어차피 통과(`judge.js`).
        if (character && gz > -PORTAL_FUNNEL) character.setLane(1)
      }

      // 지금 무슨 자세를 시키고 있나 + 제일 가까운 안 지난 이벤트(방향 힌트)
      asked = null
      upcoming = null
      for (const { e } of vis) {
        if (e.done) continue
        if (!upcoming) upcoming = e
        if (e.type === 'poseSign') { asked = e; break }
      }

      // 판정 — 캐릭터를 지나는 순간 한 번(`e.done`이 중복을 막는다)
      if (character) {
        const st = {
          lane: character.lane,
          jumping: character.jumping,
          ducking: character.ducking,
          pose: character.posing,
        }
        for (const { e } of vis) {
          if (e.done || !atHit(e, now, speed, course.hitWindow)) continue
          const r = run.settle(e, st)
          onResult?.(r, e)
        }
      }
    },

    render() { renderer.render(scene, camera) },

    dispose() {
      aborted = true
      clearObstacles()
      boat?.dispose()
      stage.dispose()   // 포털도 스테이지가 소유 — 여기서 같이 정리된다(STEP 86)
      character?.dispose()
      renderer.dispose()
    },
  }
}

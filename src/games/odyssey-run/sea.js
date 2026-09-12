// 오디세이 런 — **포세이돈 바다 스테이지의 폭풍 + 트랙 시각화.** ★
//
// `#/lab-sea` 프로토타입(STEP 54, `src/pages/labsea.js`)이 검증한 것들을
// 옮겨 왔다 — 비(LineSegments) · 번개(지그재그 선) · 어두운 구름 · 부표
// (레인 경계) · 흰 가이드 라인. labsea.js는 라우트라 씬 계약이 없어 그대로
// import할 수 없어서, 여기 스테이지 레이어(`scene.js`의 `buildStage`)가
// 쓰기 좋은 팩토리 하나로 묶었다.
//
// ── 기본 하늘은 안 바꾼다 ★ ─────────────────────────────────
//
// 세 스테이지 공통 sky는 `ODYSSEY_SKY`(파란 하늘) 그대로다. 폭풍은 **덧
// 씌우는 레이어**로 낸다 — 어두운 구름이 하늘을 덮고, 비가 내리고, 번개가
// 치고, 배경색·안개가 짙어진다(`stages.js`의 `weather`). Stage 2만.

import * as THREE from 'three'
import { createClouds } from '../runner3d/backdrop.js'
import { PropRow } from '../runner3d/props.js'
import { TRACK_W } from '../runner3d/ground.js'

/** 정점마다 y로 두 색을 섞는다(부표 빨강밑동→흰꼭대기). */
function paintGradientY(geo, bottomHex, topHex) {
  const b = new THREE.Color(bottomHex)
  const t = new THREE.Color(topHex)
  const pos = geo.attributes.position
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const range = Math.max(1e-6, maxY - minY)
  const arr = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const k = (pos.getY(i) - minY) / range
    arr[i * 3] = THREE.MathUtils.lerp(b.r, t.r, k)
    arr[i * 3 + 1] = THREE.MathUtils.lerp(b.g, t.g, k)
    arr[i * 3 + 2] = THREE.MathUtils.lerp(b.b, t.b, k)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}

/** 흰 점선 가이드 라인 텍스처 — labsea의 `ropeTexture` 축약본. */
function guideTexture() {
  const S = 64
  const cvs = document.createElement('canvas')
  cvs.width = 8
  cvs.height = S
  const g = cvs.getContext('2d')
  g.fillStyle = 'rgba(10,47,82,0)'
  g.fillRect(0, 0, 8, S)
  for (let i = 0; i < 8; i++) {
    // 완전 불투명 흰색 — 폭풍의 어두운 톤 위에서도 또렷하게(ken QA: "레인
    // 구분선이 명확히 보여야 한다").
    g.fillStyle = i % 2 ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0)'
    g.fillRect(0, i * (S / 8), 8, S / 8)
  }
  const tx = new THREE.CanvasTexture(cvs)
  tx.colorSpace = THREE.SRGBColorSpace
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping
  tx.repeat.set(1, 48)
  return tx
}

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {(m: THREE.Material) => THREE.Material} o.withCurve
 * @param {number} o.span   트랙 길이(= GROUND_LEN)
 * @param {number} o.waterY
 * @param {object} o.weather  `stages.js`의 weather — `{clouds, rain, lightning}` (없으면 폭풍 없음)
 * @returns {{ update:(dz:number,dt:number)=>void, dispose:()=>void }}
 */
export function makeSea({ scene, withCurve, span, waterY = 0, weather = null }) {
  const added = []
  const disposers = []

  // ── 레인 경계 흰 가이드 라인 (x = ±LANE_W/2) ★ ───────────────
  const LANE_W = TRACK_W / 3
  const guideMap = guideTexture()
  const guideMat = withCurve(new THREE.MeshBasicMaterial({
    map: guideMap, transparent: true, depthWrite: false, fog: true,
  }))
  const guideGeo = new THREE.PlaneGeometry(0.4, span, 1, 40)
  for (const bx of [-LANE_W / 2, LANE_W / 2]) {
    const line = new THREE.Mesh(guideGeo, guideMat)
    line.rotation.x = -Math.PI / 2
    line.position.set(bx, waterY + 0.05, -span * 0.42)
    line.frustumCulled = false
    line.renderOrder = 2
    scene.add(line)
    added.push(line)
  }
  disposers.push(() => { guideGeo.dispose(); guideMat.dispose(); guideMap.dispose() })

  // ── 부표 — 트랙 바깥 끝(±TRACK_W/2 + 여유), "여기부터 바다" ★ ──
  // labsea와 같은 발상(육지의 연석 역할). `PropRow` 하나 = draw call 1.
  const buoyGeo = paintGradientY(
    new THREE.CylinderGeometry(0.3, 0.5, 1.15, 7),
    '#e6402f', '#f4f4f4',
  )
  buoyGeo.translate(0, 0.5, 0)   // 밑동이 물 표면
  const buoyMat = withCurve(new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }))
  const buoyRows = [-1, 1].map(side => new PropRow({
    geometry: buoyGeo, material: buoyMat, count: 10, span,
    side, near: TRACK_W / 2 + 0.9, spread: 1.4, radius: 0.5,
    bob: { amp: 0.07, rate: 1.25 },
  }))
  for (const r of buoyRows) { scene.add(r.mesh); added.push(r.mesh) }
  disposers.push(() => { for (const r of buoyRows) r.dispose(); buoyGeo.dispose(); buoyMat.dispose() })

  // ── 폭풍 (weather가 있을 때만) ───────────────────────────────
  let clouds = null
  let rain = null
  let rainGeo = null
  let updateRain = () => {}
  let boltGroup = null
  let strike = () => {}
  let lightningWait = 3 + Math.random() * 5
  const lightningTimers = []

  if (weather) {
    // 어두운 구름 — `createClouds`는 테마 안 타는 공용 모듈(색만 넘긴다).
    clouds = createClouds(withCurve, weather.clouds ?? '#3c4557')
    scene.add(clouds.mesh)
    added.push(clouds.mesh)
    disposers.push(() => clouds.dispose())

    // 비 — 선분 하나 = 빗줄기 하나. 전부 한 지오메트리라 draw call 1.
    // 곡률 안 준다(대기 현상). ★ 수직 낙하 대신 **바람에 밀리는 비바람**
    // (ken QA) — 스트릭 자체를 대각으로 길게 눕히고(WIND_X), 낙하 중에도
    // x를 같은 방향으로 밀어서 실제로 비스듬히 흘러간다(전엔 스트릭만
    // 살짝 기울고 낙하는 순수 수직이라 바람 느낌이 안 났다).
    const RAIN_N = 420
    const RAIN_BOX = { xz: 16, yTop: 18, yBot: -0.2, zNear: 8, zSpan: 42 }
    const RAIN_SPEED = 26
    const WIND_X = 6.5   // 초당 옆으로 밀리는 속도(유닛) — 비바람
    rainGeo = new THREE.BufferGeometry()
    const rainPos = new Float32Array(RAIN_N * 2 * 3)
    const dropAt = (arr, i, y) => {
      const bi = i * 6
      const x = (Math.random() * 2 - 1) * RAIN_BOX.xz
      const z = RAIN_BOX.zNear - Math.random() * RAIN_BOX.zSpan
      arr[bi] = x; arr[bi + 1] = y; arr[bi + 2] = z
      // 스트릭 자체도 바람 방향으로 길게 눕힌다(수직 0.55 + 옆으로 0.75).
      arr[bi + 3] = x + 0.75; arr[bi + 4] = y - 0.55; arr[bi + 5] = z
    }
    for (let i = 0; i < RAIN_N; i++) {
      dropAt(rainPos, i, RAIN_BOX.yBot + Math.random() * (RAIN_BOX.yTop - RAIN_BOX.yBot))
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
    const rainMat = new THREE.LineBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.55, fog: true })
    rain = new THREE.LineSegments(rainGeo, rainMat)
    rain.frustumCulled = false
    rain.renderOrder = 3
    scene.add(rain)
    added.push(rain)
    disposers.push(() => { rainGeo.dispose(); rainMat.dispose() })
    updateRain = dt => {
      const arr = rainGeo.attributes.position.array
      const fall = RAIN_SPEED * dt
      const drift = WIND_X * dt
      for (let i = 0; i < RAIN_N; i++) {
        const bi = i * 6
        arr[bi] += drift; arr[bi + 3] += drift          // 바람 — 옆으로
        arr[bi + 1] -= fall; arr[bi + 4] -= fall          // 낙하 — 아래로
        // 화면 밖(바람 방향)으로 나가거나 바닥을 지나면 위에서 새로 뽑는다.
        if (arr[bi + 1] < RAIN_BOX.yBot || arr[bi] > RAIN_BOX.xz * 1.4) dropAt(arr, i, RAIN_BOX.yTop)
      }
      rainGeo.attributes.position.needsUpdate = true
    }

    // 번개 — 하늘에 지그재그 선 잠깐. 화면 플래시 없음(ken: "깜빡임 빼줘").
    // 가산 합성 + depthWrite:false(빛으로 그린 것은 깊이 안 쓴다). ★ ken QA
    // "번개가 더 명확히 보여야 한다" — 완전 불투명 흰색 + 굵어 보이게
    // 본줄기를 두 겹(살짝 옆으로 옮긴 복제)으로 그리고, 더 자주 친다.
    const boltMat = new THREE.LineBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 1, fog: false,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
    boltGroup = new THREE.Group()
    boltGroup.visible = false
    boltGroup.renderOrder = 6
    scene.add(boltGroup)
    added.push(boltGroup)
    const jagged = (x0, yTop, yBot, spread, steps) => {
      const pts = []
      let x = x0
      for (let i = 0; i <= steps; i++) {
        const y = yTop + (yBot - yTop) * (i / steps)
        if (i > 0 && i < steps) x += (Math.random() - 0.5) * spread
        pts.push(new THREE.Vector3(x, y, -70))
      }
      return pts
    }
    const clearBolt = () => {
      while (boltGroup.children.length) boltGroup.children.pop().geometry.dispose()
    }
    const addStrand = pts => {
      boltGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), boltMat))
      // 굵어 보이게 — 바로 옆(±0.12)에 한 겹 더. LineBasicMaterial은 대부분의
      // GPU에서 실제 두께(linewidth)를 못 그리므로 겹쳐 그려 두께를 낸다.
      const thick = pts.map(p => new THREE.Vector3(p.x + 0.12, p.y, p.z))
      boltGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(thick), boltMat))
    }
    const spawnBolt = () => {
      clearBolt()
      const x0 = (Math.random() * 2 - 1) * 38
      const main = jagged(x0, 46, 14, 3.0, 10 + Math.floor(Math.random() * 4))
      addStrand(main)
      const from = main[2 + Math.floor(Math.random() * 3)]
      addStrand(jagged(from.x, from.y, from.y - 9, 2.2, 4))
    }
    strike = () => {
      spawnBolt()
      boltGroup.visible = true
      lightningTimers.push(setTimeout(() => { boltGroup.visible = false }, 110))
      lightningTimers.push(setTimeout(() => { spawnBolt(); boltGroup.visible = true }, 190))
      lightningTimers.push(setTimeout(() => { boltGroup.visible = false }, 320))
    }
    disposers.push(() => {
      for (const t of lightningTimers) clearTimeout(t)
      clearBolt()
      boltMat.dispose()
    })
  }

  return {
    update(dz, dt) {
      for (const r of buoyRows) r.update(dz, 20, dt)
      if (weather) {
        clouds.update(dz)
        updateRain(dt)
        lightningWait -= dt
        // 전보다 자주 친다(3~7초, 전엔 5~12초) — "더 명확히" 보이려면
        // 잘 안 보이는 문제만이 아니라 자주 안 보이는 것도 원인이었다.
        if (lightningWait <= 0) { strike(); lightningWait = 3 + Math.random() * 4 }
      }
    },
    dispose() {
      for (const d of disposers) { try { d() } catch { /* 무시 */ } }
      for (const m of added) scene.remove(m)
    },
  }
}

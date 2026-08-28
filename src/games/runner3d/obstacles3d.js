// 장애물 그리기 — **인스턴싱 하나로 네 종류를 다 그린다.**
//
// ── 왜 종류마다 메시를 안 만드나 ─────────────────────────────
//
// 화면에 동시에 뜨는 장애물은 많아야 대여섯이다. 종류마다 `InstancedMesh`를 두면
// draw call이 넷인데, 대부분의 프레임에서 그중 셋은 0개를 그린다.
//
// **네 종류를 한 지오메트리 통에 넣고** 인스턴스마다 어느 부분을 쓸지 정하는 것도
// 방법이지만, 0단계는 도형이라 그냥 종류별로 하나씩 두고 개수만 조절한다.
// 진짜 GLB가 오면 아틀라스 하나에 묶으면서 이 파일만 고치면 된다.
//
// ── 자리 ────────────────────────────────────────────────────
//
// x는 레인, y는 종류가 정한다. z는 **코스가 매 프레임 계산한다** —
// 여기서 z를 들고 있으면 두 곳이 같은 값을 따로 세게 되고, 반드시 어긋난다.

import * as THREE from 'three'
import { LANE_W, TRACK_W } from './ground.js'
import { loadGeometries } from './models.js'

/**
 * 종류별 모양과 높이. 2D 러너의 역할을 그대로 옮긴다.
 *
 * **여기 숫자가 규칙이다.** 뛰어넘을 수 있는 높이, 숙여서 지나갈 틈, 한 레인을
 * 막는 폭이 곧 판정이다. 블렌더 스크립트가 이 값을 보고 만든다 — 반대가 아니다.
 * 그림이 규칙을 바꾸면 아이가 화면을 보고 판단한 것과 판정이 어긋난다.
 *
 * `model`은 그 종류를 대신할 GLB다. **모델이 오면 `y`는 0이 된다** —
 * 블렌더 쪽 원점이 바닥(z=0)이라서, 상자 중심을 띄우던 보정이 필요 없다.
 */
export const KINDS = {
  // 피한다 — 레인 하나를 막는다
  cube:       { w: LANE_W * 0.8, h: 2.6, d: 1.2, color: '#c8603a', y: 1.3, model: 'egg_block' },
  // 뛰어넘는다 — 낮고 넓다
  hurdleLow:  { w: TRACK_W * 0.95, h: 0.9, d: 0.8, color: '#d8a23c', y: 0.45, model: 'hurdle_low' },
  // 숙여서 지나간다 — 위에 걸려 있다
  hurdleWide: { w: TRACK_W * 0.95, h: 0.7, d: 0.8, color: '#8f5ad8', y: 3.4, model: 'gate_wide' },
  // 자세를 잡는다 — 표지판. **자세마다 그림이 다르다**(아래)
  poseSign:   { w: 2.6, h: 2.6, d: 0.3, color: '#3aa8d8', y: 2.6, model: 'sign_armsopen' },
}

// ── `archGate`가 여기 없다 ★ ────────────────────────────────
//
// 결승 포털은 **판 전체에서 한 번** 나오고, 문이 반짝이고 탑에 불이 붙는다.
// 인스턴싱은 인스턴스마다 다른 재질·다른 시간을 못 주므로 그 통에 못 담는다.
// `runner3d/portal.js`가 따로 갖는다 — 판정(`judge.js`)에는 그대로 남아 있다.

/**
 * 자세 팻말은 **자세마다 다른 물건**이다. ★
 *
 * 하나로 두면 아이에게 "뭔가 하라"까지만 전해진다. 팻말의 사람 그림이
 * 이 물건의 전부다 — 그걸 보고 무엇을 할지 알아야 운동이 된다.
 */
export const POSE_MODELS = {
  lunge: 'sign_lunge',
  forwardbend: 'sign_forwardbend',
  armsopen: 'sign_armsopen',
}

const MAX_PER_KIND = 8   // 한 화면에 이보다 많이 뜰 일이 없다

export function createObstacles(withCurve) {
  const mat = withCurve(new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }))
  const dummy = new THREE.Object3D()
  const meshes = {}

  for (const [kind, k] of Object.entries(KINDS)) {
    const geo = new THREE.BoxGeometry(k.w, k.h, k.d)
    // 조명이 없으니 면마다 밝기를 구워 넣는다 — 안 그러면 납작한 색 덩어리다
    const n = geo.attributes.normal
    const col = new Float32Array(n.count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < n.count; i++) {
      const shade = n.getY(i) > 0.5 ? 1.25 : Math.abs(n.getX(i)) > 0.5 ? 0.8 : 1.0
      c.set(k.color).multiplyScalar(shade)
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))

    const m = new THREE.InstancedMesh(geo, mat, MAX_PER_KIND)
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.frustumCulled = false
    m.count = 0                 // 쓸 만큼만 그린다
    m.userData.boxY = k.y       // 도형일 때만 쓰는 보정. 모델이 오면 0이 된다
    meshes[kind] = m
  }

  // 자세 팻말은 자세마다 다른 메시를 쓴다. 기본(`poseSign`)은 모델이 없을 때의 자리다.
  for (const [pose, file] of Object.entries(POSE_MODELS)) {
    const src = meshes.poseSign
    const m = new THREE.InstancedMesh(src.geometry, mat, MAX_PER_KIND)
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.frustumCulled = false
    m.count = 0
    m.userData.boxY = KINDS.poseSign.y
    meshes['pose:' + pose] = m
  }

  // ── 진짜 모델 ──
  // 도형으로 먼저 세우고 오는 대로 갈아 낀다(`models.js`와 같은 규율).
  // **모델이 오면 y 보정을 0으로 내린다** — 블렌더 쪽 원점이 바닥이라서다.
  const wanted = [
    ...Object.entries(KINDS).map(([kind, k]) => [kind, k.model]),
    ...Object.entries(POSE_MODELS).map(([p, f]) => ['pose:' + p, f]),
  ]
  loadGeometries([...new Set(wanted.map(w => w[1]))], 'obstacles').then(geos => {
    for (const [key, file] of wanted) {
      const g = geos[file]
      const m = meshes[key]
      if (!g || !m) continue
      m.geometry = g
      m.userData.boxY = 0
      // 텍스처를 들고 왔으면 그 종류만 자기 재질을 쓴다. 곡률은 우리가 씌운다 —
      // 안 씌우면 그 장애물만 평평한 세계에 서 있게 된다.
      const map = g.userData?.pzMap
      if (map) {
        // 알파 없는 JPEG다 — 반투명으로 그리면 가장자리만 지저분해진다
        m.material = withCurve(new THREE.MeshBasicMaterial({ map, fog: true }))
      }
      m.instanceMatrix.needsUpdate = true
    }
  })

  return {
    meshes: Object.values(meshes),

    /**
     * @param {{e:object, z:number}[]} visible  코스가 골라 준 것
     * @param {number} lanes
     */
    sync(visible, lanes = 3, xOf) {
      const n = {}
      for (const kind of Object.keys(meshes)) n[kind] = 0

      for (const { e, z } of visible) {
        // 자세 팻말은 자세로 갈린다. 자세가 없으면 기본 팻말로 떨어진다.
        const key = e.type === 'poseSign' && POSE_MODELS[e.pose]
          ? 'pose:' + e.pose : e.type
        const m = meshes[key]
        if (!m || n[key] >= MAX_PER_KIND) continue
        dummy.position.set(xOf(e, lanes), m.userData.boxY, z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        m.setMatrixAt(n[key]++, dummy.matrix)
      }

      for (const [kind, m] of Object.entries(meshes)) {
        m.count = n[kind] || 0
        m.instanceMatrix.needsUpdate = true
      }
    },

    dispose() {
      for (const m of Object.values(meshes)) { m.geometry.dispose(); m.dispose() }
      mat.dispose()
    },
  }
}

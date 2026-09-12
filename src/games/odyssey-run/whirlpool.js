// 카리브디스 소용돌이 — **점프로 피하는 바다 장애물(`hurdleLow`).** ★
//
// `#/lab-sea`(STEP 53·57·59)가 만든 입체 링을 그대로 이식한 것이다. ken이
// "대박이야!"로 확인한 모양이라 손대지 않는다 — `src/pages/labsea.js`의
// `whirlpoolProfile`/`buildWhirlpoolGeometry`/`whirlpoolStreakTexture`를
// 옮겼다.
//
// ── 왜 물 아래로 안 파나 ─────────────────────────────────────
//
// `water.js`의 물 평면은 구멍 없는 단일 평면이라 카메라가 어느 각도든
// 평면이 먼저 걸려 아래가 안 보인다. 대신 **수면 위로 솟아오르는 소용돌이
// 벽**(`LatheGeometry`)을 세우고, 그 위에 빙빙 도는 포말 줄무늬(가산 합성)를
// 얹는다. 중심은 거의 검게("구멍" 인상), r≈0.66에서 부풀어 오른 포말
// 테두리로 절정을 찍는다.

import * as THREE from 'three'
import { PALETTE } from '../runner3d/water.js'
import { TRACK_W } from '../runner3d/ground.js'

const WHIRL_W = TRACK_W * 0.95   // 큐브·허들과 같은 규칙(`obstacles3d.js` KINDS)
const WHIRL_D = 11
const WHIRL_SPIN_U = 0.55        // 라디안/초 — 둘레 방향(빙빙 도는 인상)
const WHIRL_FLOW_V = 0.35        // 초당 — 중심 방향(안으로 빨려드는 인상)

function whirlpoolProfile() {
  const stops = [
    { r: 0.00, y: 0.00, c: '#02060c' },
    { r: 0.12, y: -0.04, c: '#04101c' },
    { r: 0.28, y: 0.04, c: '#0a2f4e' },
    { r: 0.44, y: 0.20, c: '#125a86' },
    { r: 0.58, y: 0.48, c: '#2f8fc0' },
    { r: 0.66, y: 0.58, c: '#cfe9fb' },
    { r: 0.78, y: 0.34, c: '#7fc4e6' },
    { r: 0.90, y: 0.10, c: '#3f8fc0' },
    { r: 1.00, y: 0.00, c: PALETTE.mid },
  ]
  return stops.map(s => ({ ...s, color: new THREE.Color(s.c) }))
}

function buildWhirlpoolGeometry(stops, radialSegments = 28) {
  const points = stops.map(s => new THREE.Vector2(Math.max(0.0001, s.r), s.y))
  const geo = new THREE.LatheGeometry(points, radialSegments)
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

function whirlpoolStreakTexture() {
  const W = 128, H = 256
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const g = cv.getContext('2d')
  const img = g.createImageData(W, H)
  const arms = 4, turns = 2.6, bandHalf = 0.09
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
      img.data[idx + 3] = Math.round(bright * 235 * (0.25 + v * 0.75))
    }
  }
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

/**
 * 소용돌이 자원 한 벌. 지오메트리·재질·줄무늬 텍스처는 한 번만 만들고
 * 인스턴스는 `createMesh()`로 여러 개 찍는다(전부 같은 자원을 공유).
 *
 * @param {(m: THREE.Material) => THREE.Material} withCurve
 * @param {number} [baseY] 소용돌이 링이 앉는 높이. 물 표면(오디세이 바다
 *   스테이지는 y=0) + 잔물결 최대 진폭(≈0.285)보다 살짝 위여야 물마루에
 *   안 덮인다 — `#/lab-sea` STEP 59에서 확정한 0.32.
 */
export function makeWhirlpool(withCurve, baseY = 0.32) {
  const stops = whirlpoolProfile()
  const geo = buildWhirlpoolGeometry(stops)
  const baseMat = withCurve(new THREE.MeshBasicMaterial({
    vertexColors: true, fog: true, side: THREE.DoubleSide,
  }))
  const streakTex = whirlpoolStreakTexture()
  const streakMat = withCurve(new THREE.MeshBasicMaterial({
    map: streakTex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
  }))

  return {
    /** 새 소용돌이 하나. 씬에 add하고 z만 옮겨 쓴다. `baseY`는 이미 반영돼 있다. */
    createMesh() {
      const grp = new THREE.Group()
      grp.add(new THREE.Mesh(geo, baseMat))
      grp.add(new THREE.Mesh(geo, streakMat))
      grp.scale.set(WHIRL_W / 2, 1, WHIRL_D / 2)   // 단위 반지름 → 트랙 폭·깊이
      grp.position.y = baseY
      grp.frustumCulled = false
      return grp
    },
    /** 매 프레임 줄무늬 UV를 두 방향으로 흘린다(빙빙 + 안으로). */
    tick(dt) {
      streakTex.offset.x += dt * WHIRL_SPIN_U
      streakTex.offset.y -= dt * WHIRL_FLOW_V
    },
    dispose() {
      geo.dispose()
      baseMat.dispose()
      streakMat.dispose()
      streakTex.dispose()
    },
  }
}

// 좌우 프롭 — **인스턴싱 + 되돌리기.**
//
// ── 왜 풀링이 아니라 되돌리기인가 ────────────────────────────
//
// 지시서는 "카메라를 지나면 먼 z로 재배치"라고 했고 그게 맞다. 다만 `InstancedMesh`를
// 쓰면 **풀이라는 것이 따로 필요 없다** — 인스턴스 개수가 처음부터 고정이고,
// 우리는 행렬만 고쳐 쓴다. 생성도 파괴도 없다.
//
// 종류당 draw call 1개다. 야자수 40그루가 화면에 있어도 한 번 그린다.
//
// ── 되돌리는 자리 ────────────────────────────────────────────
//
// z가 카메라를 지나가면 `span`만큼 빼서 맨 뒤로 보낸다. **span으로 빼는 것**이지
// 맨 뒤 좌표를 새로 주는 게 아니다 — 새로 주면 간격이 리셋되어 물건이 뭉친다.
//
// ── 흩뜨림은 2D 러너에서 배운 것을 그대로 ────────────────────
//
// 줄에 고정 간격으로 심으면 가로수길이 된다(STEP 16). 옆·앞뒤·크기·회전을
// 물건마다 흔든다. 여기서는 z 간격까지 흔든다 — 박자가 일정하면 흩어져도 기계적이다.

import * as THREE from 'three'
import { rowSpots } from './layout.js'

/** 한 종류의 프롭 무리. 같은 지오메트리·재질을 인스턴스가 나눠 쓴다. */
export class PropRow {
  /**
   * @param {object} o
   * @param {THREE.BufferGeometry} o.geometry
   * @param {THREE.Material} o.material  **모두가 공유한다.** 재질이 늘면 draw call이 는다
   * @param {number} o.count   이 종류를 몇 개 둘지
   * @param {number} o.span    되돌리기 주기(유닛). 카메라 far보다 길어야 한다
   * @param {number} o.side    -1 왼쪽 · 1 오른쪽
   * @param {number} o.near    트랙에서 이만큼 떨어져 시작
   * @param {number} o.spread  옆으로 흩어지는 폭
   * @param {() => number} o.rnd  난수. 테스트에서 고정할 수 있게 밖에서 받는다
   * @param {{place:Function}} [o.placer] 쪽마다 하나. 이미 놓인 것과 안 겹치게 잡아 준다
   * @param {number} [o.radius] 이 물건이 차지하는 반지름 (겹침 판정용)
   * @param {boolean} [o.faceTrack] **앞뒤가 있는 물건**은 아무렇게나 안 돌린다
   * @param {number} [o.rotOffset] `faceTrack`의 기준 방향(0)이 실제로 어느
   *   쪽을 보는지는 **모델마다 다르다** — glTF에 "정면 축은 이거다"라는
   *   규칙이 없어서, 원본을 만든 쪽이 어느 축을 앞으로 두고 내보냈느냐에
   *   달렸다. 0으로 뒀을 때 등을 보이면 π를 준다(180도 반대). 기본 0.
   * @param {number} [o.rotJitter] `faceTrack`이 `rotOffset` 둘레로 흔드는
   *   폭(라디안). 기본 1.0(±0.5rad≈±28.6도) — 같은 물건이 여러 개(예:
   *   범선 5척) 있을 때 전부 똑같이 줄 세운 것처럼 안 보이게 하는 값이다.
   *   **`count`가 1~2뿐인 랜드마크(신상 등)에는 안 맞는다** — 인스턴스가
   *   하나면 "여러 개가 똑같아 보인다"를 막을 이유가 없는데, 흔들림
   *   자체가 그 하나의 방향을 어렵게 맞춘 `rotOffset`에서 최대 ±28.6도
   *   벗어나게 만든다(신상이 좌우 중 한쪽만 옆모습으로 보이던 원인 —
   *   좌우가 각자 `new PropRow`라 독립된 난수를 뽑아서, 우연히 한쪽만
   *   불리한 값이 나왔다). 그런 물건은 0으로 꺼서 튜닝한 각도 그대로
   *   고정한다.
   * @param {{amp:number, rate:number}} [o.bob] **물 위에 뜬 물건**만 준다(부표 등).
   *   `null`(기본)이면 육지 프롭처럼 자리에 고정 — 잔디 위 야자수·바위는 이걸
   *   켤 이유가 없다. 물건마다 위상을 `x·z`에서 뽑아 흔든다(`DinoRow`와 같은
   *   이유 — 다 같은 박자로 까딱이면 살아 있는 게 아니라 기계로 보인다).
   * @param {{amp:number, rate:number}} [o.sway] **살아 있는 느낌**이 필요한
   *   물건만 준다(인어 등) — 좌우로 몸을 트는 각도(yaw)를 흔든다. `bob`과
   *   같은 발상이고 독립적으로 같이 켤 수 있다(둥실+뒤척임). 뼈대 없이
   *   몸 전체를 흔드는 것이라 `DinoRow`보다 거칠지만, 프롭 하나를 통째로
   *   깎아 부위별로 다시 내보낼 파이프라인(Blender)이 없을 때 쓰는 저비용 대안이다.
   */
  constructor({ geometry, material, count, span, side, near, spread, scale = 1,
    placer = null, radius = 1.4, faceTrack = false, rotOffset = 0, rotJitter = 1.0, bob = null, sway = null,
    rnd = Math.random }) {
    this.span = span
    this.bob = bob
    this.sway = sway
    this.t = 0
    this.mesh = new THREE.InstancedMesh(geometry, material, count)
    // 매 프레임 행렬을 고친다 — three에게 미리 알려 두면 최적화를 건너뛴다
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false   // 인스턴스 전체의 경계상자가 커서 통째로 잘려나간다

    // ── 앞뒤가 있는 물건은 **아무렇게나 안 돌린다** ★ ──
    // 야자수·바위는 어느 쪽에서 봐도 같아서 마음껏 돌려도 된다. 그런데 화석
    // 바위는 **한 면에만 공룡 뼈가 새겨져 있다.** 랜덤으로 돌렸더니 절반이
    // 뒷면을 보였고, 화면에는 그냥 커다란 갈색 덩어리가 서 있었다.
    //
    // 그런 물건은 아이 쪽을 본다. 다만 정확히 0으로 두면 줄 세운 것처럼
    // 보이니 ±0.5rad만 흔든다 — 3/4 각이라 새겨진 면이 계속 보인다.
    this.items = rowSpots({ count, span, side, near, spread, scale, radius, placer, rnd })
      .map(p => ({
        ...p,
        rot: faceTrack ? rotOffset + (rnd() - 0.5) * rotJitter : rnd() * Math.PI * 2,
      }))
    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._v = new THREE.Vector3()
    this._s = new THREE.Vector3()
    this.sync()
  }

  /**
   * @param {number} dz 이번 프레임에 다가온 거리 = speed × dt
   * @param {number} behind 카메라 뒤 이만큼 지나가면 되돌린다
   * @param {number} [dt] `bob`을 켰을 때만 쓴다 — 시간을 밖에서 받는다
   *   (`감지기는 시간을 밖에서 받는다`와 같은 이유, 합성 프레임 테스트 가능해진다)
   */
  update(dz, behind = 12, dt = 0) {
    if (this.bob || this.sway) this.t += dt
    for (const it of this.items) {
      it.z += dz
      // while이다. 프레임이 크게 튀면(탭 복귀) 한 번 빼는 걸로 모자란다.
      while (it.z > behind) it.z -= this.span
    }
    this.sync()
  }

  sync() {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]
      // 위상을 x·z에서 뽑는다 — 따로 저장 안 해도 물건마다 다른 값이라
      // 다 같이 까딱이지 않는다.
      const y = this.bob
        ? Math.sin(this.t * this.bob.rate + it.x * 0.7 + it.z * 0.13) * this.bob.amp
        : 0
      // sway는 bob과 다른 위상 조합을 써서 — 켤 때 같은 물건이 같은 순간에
      // 오르내리며 동시에 트는 게 아니라 어긋나게 움직인다(더 "살아있게" 읽힌다).
      const yaw = this.sway
        ? it.rot + Math.sin(this.t * this.sway.rate + it.z * 0.19 + it.x * 0.11) * this.sway.amp
        : it.rot
      this._v.set(it.x, y, it.z)
      this._q.setFromAxisAngle(UP, yaw)
      this._s.setScalar(it.s)
      this._m.compose(this._v, this._q, this._s)
      this.mesh.setMatrixAt(i, this._m)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.dispose()
  }
}

const UP = new THREE.Vector3(0, 1, 0)

/**
 * 공룡을 **셰이더로 살아 움직이게** 한다. ★★
 *
 * ── 왜 뼈대도 자르기도 아닌가 ──────────────────────────────
 *
 * 뼈대(스킨드 메시)는 `InstancedMesh`가 못 쓴다 — 서른 마리면 draw call 서른 개다.
 * 잘라서 부위를 돌리는 방법은 **잘린 자리가 뚫린 채로 남아** 머리가 몸에서
 * 떨어져 나간 것처럼 보였다(8/20, 아이가 무서워할 그림이었다).
 *
 * 세 번째 길이 있다. 메시는 **통째로 두고 정점을 셰이더에서 민다.**
 *   · 발밑은 안 움직이고 위로 갈수록 많이 흔들린다 → 몸이 숨 쉬는 것처럼 보인다
 *   · 앞으로 튀어나온 부분(머리)이 위아래로 끄덕인다
 *   · 이음매가 없다. 통짜 메시라 뚫릴 자리가 없다
 *   · draw call이 안 는다. 인스턴싱 그대로다
 *
 * 마리마다 위상은 **인스턴스 행렬의 x**에서 뽑는다. 따로 속성을 넘기지 않아도
 * 마리마다 다른 값이라, 서른 마리가 한 몸처럼 움직이는 일이 없다.
 */
export function animateDino(material, {
  time, sway = 0.16, nod = 0.10, height = 6, depth = 0, zMid = 0, rate = 1,
}) {
  // ── 진폭은 **몸 크기에 대한 비율**이다 ★ ──
  // 처음엔 유닛으로 줬다. 0.16유닛은 11유닛짜리 브라키오에서 1.5%라
  // 화면에서 **아무 일도 안 일어나는 것처럼** 보였다. 크기가 바뀔 때마다
  // 다시 맞춰야 하는 값이기도 했다. 비율로 두면 어느 공룡이든 같게 보인다.
  const A = height
  const prev = material.onBeforeCompile
  material.onBeforeCompile = shader => {
    prev?.(shader)                       // 곡률이 먼저 심어져 있다 — 덮으면 안 휜다
    shader.uniforms.uTime = time
    shader.uniforms.uSway = { value: sway * A }
    shader.uniforms.uNod = { value: nod * A }
    shader.uniforms.uBodyH = { value: height }
    // ── 끄덕임은 **몸 길이**로 나눈다 ★ ──
    // 키로 나눴더니(`-z / uBodyH`) 11유닛짜리 브라키오의 앞뒤 폭이 4유닛이라
    // 비율이 0.18에서 멈췄다 — 진폭의 5분의 1만 쓴 셈이고, 화면에서는
    // **가만히 서 있는 것과 구별이 안 갔다.** 재는 자를 잘못 골랐던 것이다.
    shader.uniforms.uHalfD = { value: Math.max(depth, 0.001) * 0.5 }
    shader.uniforms.uZMid = { value: zMid }
    shader.uniforms.uRate = { value: rate }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uSway; uniform float uNod;
        uniform float uBodyH; uniform float uHalfD; uniform float uZMid;
        uniform float uRate;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float pzPhase = instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2] * 0.31;
        #else
          float pzPhase = 0.0;
        #endif
        float pzT = uTime * uRate + pzPhase;
        // 발밑(y=0)은 0, 머리 높이에서 1. 제곱이라 위쪽만 크게 움직인다
        float pzUp = clamp(transformed.y / uBodyH, 0.0, 1.0);
        pzUp *= pzUp;
        transformed.x += sin(pzT * 1.7) * pzUp * uSway;
        // 몸 가운데를 축으로 **시소처럼** 끄덕인다: 한쪽 끝이 내려가면 반대쪽이 올라간다.
        // 앞쪽만 올리지 않는 이유는 **어느 쪽이 머리인지 파일마다 다르기 때문이다.**
        // AI가 뽑아 온 GLB의 정면 축은 제각각이라, 앞쪽만 움직이게 두면 어떤 공룡은
        // 꼬리만 까딱거린다. 시소는 어느 쪽이 머리든 살아 있는 것으로 읽힌다.
        float pzFwd = clamp((uZMid - transformed.z) / uHalfD, -1.0, 1.0);
        transformed.y += sin(pzT * 2.3) * pzFwd * uNod;`)
  }
  material.needsUpdate = true
  return material
}

/**
 * 공룡 무리 — **부위를 따로 흔든다.** ★
 *
 * ── 왜 뼈대를 안 쓰나 ────────────────────────────────────────
 *
 * GLB에 애니메이션을 담으면 스키닝 계산이 붙는데, 우리는 이미 MediaPipe와
 * GPU를 나눠 쓴다(`docs/10` §4). 게다가 `InstancedMesh`는 스킨드 메시를 못 쓴다 —
 * 공룡 열 마리를 뿌리려면 열 번 그려야 한다.
 *
 * 대신 몸통·머리·꼬리를 **각각 인스턴싱**한다. draw call 셋이면 몇 마리든 그린다.
 *
 * ── 흔드는 축 ────────────────────────────────────────────────
 *
 * 머리 행렬 = 몸통 행렬 × 붙는자리로 이동 × 흔들기.
 * 블렌더가 부위의 원점을 **붙는 자리**에 맞춰 뒀기 때문에 이렇게 곱하면
 * 목이 몸에 붙은 지점을 축으로 돈다. 원점이 딴 데면 머리가 궤도를 돈다.
 *
 * ── 위상을 흩뜨린다 ─────────────────────────────────────────
 *
 * 마리마다 `phase`가 다르다. 안 그러면 열 마리가 **한 몸처럼** 같은 박자로
 * 고개를 젓는다 — 살아 있는 게 아니라 기계로 보인다.
 */
export class DinoRow {
  /**
   * @param {object} o
   * @param {{[part:string]:{geo:THREE.BufferGeometry, at:number[]}}} o.parts
   * @param {number} o.headSwing 라디안
   * @param {number} o.tailSwing 라디안
   */
  constructor({ parts, material, count, span, side, near, spread, scale = 1,
    headSwing = 0.30, tailSwing = 0.26, speed = 1.0, y = 0, yJitter = 0,
    placer = null, radius = 3, spots = null, rnd = Math.random }) {
    this.span = span
    this.headSwing = headSwing
    this.tailSwing = tailSwing
    this.speed = speed
    this.t = 0

    this.meshes = {}
    for (const [name, p] of Object.entries(parts)) {
      const m = new THREE.InstancedMesh(p.geo, material, count)
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      m.frustumCulled = false
      this.meshes[name] = m
    }
    this.at = Object.fromEntries(
      Object.entries(parts).map(([n, p]) => [n, new THREE.Vector3(...p.at)]))

    // 나는 것은 **높이가 다르니 겹칠 일이 없다.** 땅에 선 것만 자리를 다툰다.
    // `spots`가 오면 그대로 쓴다 — `scene.js`가 프롭보다 **먼저** 잡아 둔 자리다.
    // 공룡은 모델을 받은 뒤에 만들어져 언제나 마지막인데, 큰 것이 늦게 오면
    // 야자수 사이에 낄 구멍이 안 남는다(`layout.js`).
    this.items = (spots ?? rowSpots({
      count, span, side, near, spread, scale, radius,
      placer: y === 0 ? placer : null, lo: 0.82, hi: 0.36, rnd,
    })).map(p => {
      const s = p.s
      return {
        x: p.x, z: p.z, s,
        // ── 아이를 **바라보게** 둔다 ★ ──
        // 모델의 앞은 +Z(three 기준)이고, `rotY(θ)`는 +Z를 `(sinθ, 0, cosθ)`로 보낸다.
        // 카메라가 +z에 있으니 **θ=0이 곧 아이를 보는 방향**이다.
        //
        // 처음엔 ±π/2로 트랙 쪽 옆면을 보게 했다. 등을 돌린 것보다는 나았지만
        // 옆모습만 계속 보였다 — 공룡의 얼굴은 앞에 있다. ±π/4로 틀어
        // **3/4 각**을 준다. 얼굴과 몸통 옆선이 함께 보이는, 캐릭터가 제일
        // 살아 보이는 각이다. 정면으로 완전히 돌리지 않는 이유는 그러면
        // 종이 인형처럼 납작해 보이기 때문이다.
        //
        // 나는 것(y>0)은 **다가오는 쪽**을 본다. 세계가 아이 쪽으로 흐르므로
        // θ≈0이 곧 날아오는 방향이다. π로 두면 뒤로 나는 새가 된다.
        rot: y > 0
          ? (rnd() - 0.5) * 0.5
          : (side < 0 ? Math.PI * 0.25 : -Math.PI * 0.25) + (rnd() - 0.5) * 0.5,
        // 익룡만 0이 아니다 — 하늘을 나는 것은 바닥에 안 붙는다
        y: y + (rnd() - 0.5) * yJitter,
        phase: rnd() * Math.PI * 2,
        // 마리마다 조금씩 다른 박자 — 같은 속도면 위상만 달라도 결국 겹친다
        rate: 0.75 + rnd() * 0.6,
      }
    })

    this._m = new THREE.Matrix4()
    this._t = new THREE.Matrix4()
    this._r = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._v = new THREE.Vector3()
    this._s = new THREE.Vector3()
    this.sync()
  }

  /** 편의 — 씬에 넣을 것들. */
  get list() { return Object.values(this.meshes) }

  update(dz, behind = 12, dt = 0) {
    this.t += dt
    for (const it of this.items) {
      it.z += dz
      while (it.z > behind) it.z -= this.span
    }
    this.sync()
  }

  sync() {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]
      const w = this.t * this.speed * it.rate + it.phase
      // ── 몸 전체를 흔든다 ★★ ──
      // 처음엔 몸통·머리·꼬리를 잘라 따로 돌렸다. 그런데 잘린 자리가 **뚫린 채**
      // 남아서, 머리를 돌릴수록 목에 구멍이 벌어졌다 — 화면에서는 머리가 몸에서
      // 떨어져 나간 것처럼 보였다. 아이가 무서워할 그림이었다.
      //
      // 통째로 두고 들썩임 + 좌우로 몸을 트는 것으로 바꿨다. 관절은 없지만
      // **이음매도 없다.** 살아 보이는 데는 이음매가 없는 게 먼저다.
      const bob = Math.sin(w * 2) * 0.05 * it.s
      const sway = Math.sin(w) * (this.headSwing * 0.5)
      this._v.set(it.x, it.y + bob, it.z)
      this._q.setFromAxisAngle(UP, it.rot + sway)
      this._s.setScalar(it.s)
      this._m.compose(this._v, this._q, this._s)

      for (const [name, mesh] of Object.entries(this.meshes)) {
        if (name === 'body') { mesh.setMatrixAt(i, this._m); continue }
        const w = this.t * this.speed * it.rate + it.phase
        const ang = (name === 'head' ? this.headSwing : this.tailSwing) * Math.sin(w)
        this._t.makeTranslation(this.at[name].x, this.at[name].y, this.at[name].z)
        // 머리는 좌우로 젓고, 꼬리는 **반대로** 흔든다. 같은 방향이면 몸이 통째로 도는 것처럼 보인다
        this._r.makeRotationY(name === 'tail' ? -ang : ang)
        mesh.setMatrixAt(i, this._m.clone().multiply(this._t).multiply(this._r))
      }
    }
    for (const m of this.list) m.instanceMatrix.needsUpdate = true
  }

  dispose() {
    for (const m of this.list) { m.geometry.dispose(); m.dispose() }
  }
}

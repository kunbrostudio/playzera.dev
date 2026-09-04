// 바다 표면 — 오디세이 런(프로토타입) ★
//
// ── "달리는 느낌"은 물이 아니라 바닥이 이미 풀던 문제다 ─────────
//
// `ground.js`가 잔디·트랙에서 쓰는 트릭을 그대로 가져온다 — **지오메트리는
// 가만히 두고 텍스처 UV만 흘린다.** 판을 z로 밀면 이음매가 생기고, 프롭
// 흐름과 맞추려는 순간 2D 러너가 겪던 "따로 노는" 문제가 그대로 돌아온다
// (`ground.js` 주석). 그러니 물도 같은 규칙을 따른다 — 파도 무늬가 그려진
// 텍스처를 카메라 쪽으로 흘리면, 장애물이 같은 속도로 다가오는 것과 나란히
// 움직여서 "배가 나아간다"로 읽힌다.
//
// ── 반사·굴절은 안 쓴다 ────────────────────────────────────────
//
// three.js 예제의 `Water.js`는 반사·굴절 텍스처를 매 프레임 새로 렌더링한다
// (렌더 패스 2번 추가). 이미 MediaPipe와 three를 같이 돌리고 있고, 이 앱은
// 실시간 조명도 0개로 두는 예산 규율이다(`CLAUDE.md`) — 반사는 그 규율과
// 정면으로 부딪힌다. 대신 **정점 잔물결**(사인파 세 개 겹치기) +
// **가짜 빛 받기**(물결 기울기로 마루는 밝게·골은 어둡게, 아래 설명) +
// **스크롤 텍스처**로 가볍게 흉내 낸다. 비용은 정점·프래그먼트 셰이더
// 몇 줄과 draw call 하나뿐이다.
//
// ── ★★ 첫 판(9/3)은 물결 축이 틀려 있었다 ──────────────────────
//
// `PlaneGeometry`는 로컬 XY 평면에 눕는다(폭=X, 길이=Y, 법선=+Z). 이 메시는
// `rotation.x = -π/2`로 눕히므로, **화면에서 "위"로 보이려면 로컬 Z를
// 밀어야 한다.** 처음엔 실수로 `transformed.y`(로컬 "길이" 축, 회전 뒤엔
// 카메라를 향하는 앞뒤 방향이 된다)를 밀었다 — 화면에서는 물이 위아래로
// 출렁이는 게 아니라 아주 미세하게 앞뒤로 밀렸다 안 밀렸다 할 뿐이었고,
// 그게 스크린샷에서 "파도가 아니라 블라인드"로 보인 진짜 원인이었다
// (ken 확인, 9/3 — "게임 스타일이지만 입체적으로"). `transformed.z`를
// 밀어야 회전 뒤 세계 좌표의 Y(위)가 움직인다.
//
// ── ★★ 입체감은 "가짜 빛 받기"로 낸다 ───────────────────────────
//
// `ground.js`의 `bakeShade()`는 도형 면마다 법선을 보고 밝기를 구워
// 넣는다(윗면 밝게·옆면 어둡게) — 조명 없이 입체를 읽히게 하는 이
// 프로젝트의 표준 수법이다. 물은 매 프레임 모양이 바뀌어서 미리 구울 수
// 없다. 대신 물결 함수의 **미분(기울기)**을 정점 셰이더에서 그 자리에서
// 계산해 대략적인 법선을 만들고, 고정된 가상의 빛 방향과 내적해 밝기
// 하나(`vWaterLight`)를 프래그먼트로 넘긴다 — 마루(빛을 정면으로 받는
// 자리)는 밝고, 골(비스듬히 등지는 자리)은 어둡다. `bakeShade`와 같은
// 배율 범위(대략 0.82~1.28)를 그대로 맞췄다 — 이 앱 전체의 "밝기로 입체
// 표현하기" 어휘를 물에도 똑같이 쓰는 셈이다.
//
// ── 곡률은 `curve.js`와 같은 것을 쓴다 ─────────────────────────
//
// 육지 구간과 이어 보이려면 지평선이 같은 자리에서 접혀야 한다. `applyCurve`를
// 그대로 재사용하면 될 텐데, three의 `material.onBeforeCompile`은 **하나만
// 걸린다** — 나중에 또 다른 함수가 걸면 앞의 것이 통째로 사라진다. 잔물결도
// 정점을 만지므로 `applyCurve`를 부른 뒤 잔물결을 또 걸면 곡률이 지워진다.
// 그래서 이 파일은 `applyCurve`를 따로 부르지 않고, 곡률 코드를 잔물결과
// **한 함수 안에 같이** 심는다(`curve.js`의 `project_vertex` 치환과 동일한
// 내용을 그대로 복사했다 — 셋 이상의 재질이 이런 식으로 정점을 여러 번
// 손대야 하는 날이 오면, 그때는 `curve.js`에 여러 훅을 이어붙이는 공용
// 헬퍼를 만드는 게 맞다. 지금은 프로토타입 하나뿐이라 복사가 더 안전하다).
//
// ── 텍스처는 줄무늬 대신 얼룩이다 ────────────────────────────────
//
// 첫 판은 가로로 긴 반짝임 줄을 그렸는데, 큰 판에 여러 번 반복되니
// 블라인드처럼 보였다(잔물결 축 버그와 겹쳐 더 심했다). 잔디 텍스처
// (`ground.js`의 `grassTexture`)처럼 **작은 얼룩을 흩뿌리는 방식**으로
// 바꿨다 — 방향성이 없어서 아무리 반복해도 줄로 안 읽힌다. 물의 "움직임"
// 자체는 이제 정점 잔물결이 맡고, 텍스처는 "표면에 짙고 옅은 자리가
// 있다"는 색 변화만 맡는다 — 둘을 나누는 게 하나로 다 하려는 것보다
// 각자 잘 읽힌다.
//
// ── 아직 프로토타입이다 ────────────────────────────────────────
//
// 색·잔물결 진폭·가짜 빛 방향은 전부 눈대중이다. `#/lab-sea`에서 눈으로
// 보고 고친다 — 육지 구간의 잔디·트랙 색(`ground.js`)도 처음엔 이렇게
// 잡았었다.

import * as THREE from 'three'

export const PALETTE = {
  deep: '#0a4d78',
  mid: '#1f8fc4',
  lit: '#6fd6ee',
  dark: 'rgba(6,40,66,0.5)',
  glint: 'rgba(255,255,255,0.6)',
}

/** 바다 텍스처 — 방향 없는 얼룩(짙게·밝게) 흩뿌리기. 그림 파일 0바이트. */
function waterTexture() {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')
  g.fillStyle = PALETTE.mid
  g.fillRect(0, 0, S, S)

  const blob = (color, count, rMin, rMax, aMin, aMax) => {
    g.fillStyle = color
    for (let i = 0; i < count; i++) {
      g.globalAlpha = aMin + Math.random() * (aMax - aMin)
      const x = Math.random() * S, y = Math.random() * S
      const r = rMin + Math.random() * (rMax - rMin)
      g.beginPath()
      g.ellipse(x, y, r, r * (0.45 + Math.random() * 0.3), Math.random() * Math.PI, 0, Math.PI * 2)
      g.fill()
    }
  }
  // 깊은 자리 — 크고 옅게, 방향 없이.
  blob(PALETTE.dark, 46, 10, 26, 0.10, 0.22)
  // 반짝임 — 작고 또렷하게. 줄이 아니라 점이라 아무리 반복해도 블라인드로 안 읽힌다.
  blob(PALETTE.glint, 60, 1.5, 4.5, 0.10, 0.35)
  blob(PALETTE.lit, 30, 4, 10, 0.06, 0.16)
  g.globalAlpha = 1

  const t = new THREE.CanvasTexture(cv)
  // sRGB라고 말해 준다 — 안 붙이면 색이 실제보다 밝게 뜬다(`ground.js`가 이미 겪었다).
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(5, 16)
  t.anisotropy = 4
  return t
}

/**
 * 곡률(`curve.js`와 동일한 식) + 잔물결(사인파 세 개) + 가짜 빛 받기를
 * 한 셰이더에 같이 심는다. 왜 따로 나눠 걸지 않는지는 파일 맨 위 주석 참고.
 */
function applyCurveAndRipple(material, kUniform, timeUniform) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uCurve = kUniform
    shader.uniforms.uTime = timeUniform

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        uniform float uCurve;
        uniform float uTime;
        varying float vWaterLight;
      `)
      // 잔물결 — **로컬(모델) 좌표**에서 건다. 물판이 안 움직이므로 로컬
      // x·y가 곧 세계의 폭·길이다. 뷰 공간에서 걸면 카메라가 따라 흔들린다.
      // 세 겹: 큰 너울 둘(폭 방향·길이 방향, 서로 다른 결이라야 격자처럼
      // 안 보인다) + 잔챙이 하나(대각선, 짧고 잦은 반짝임 결).
      // **밀어야 하는 축은 로컬 Z다** — 회전(rotation.x=-π/2) 뒤에
      // 세계의 "위"가 된다(파일 맨 위 주석의 9/3 버그 참고).
      .replace('#include <begin_vertex>', /* glsl */`
        #include <begin_vertex>
        float wx = transformed.x;
        float wy = transformed.y;
        float ph1 = wx * 0.30 + uTime * 1.35;
        float ph2 = wy * 0.19 - uTime * 1.05;
        float ph3 = (wx + wy) * 0.85 + uTime * 2.4;
        const float a1 = 0.11;
        const float a2 = 0.14;
        const float a3 = 0.035;
        transformed.z += a1 * sin(ph1) + a2 * sin(ph2) + a3 * sin(ph3);

        // ── 가짜 빛 받기 ★ — 물결의 기울기(미분)로 대략적인 법선을 만들고
        // 고정된 가상의 빛과 내적한다. 진짜 조명이 아니라 밝기 하나(스칼라)
        // 뿐이라 비용이 거의 없다. ground.js의 bakeShade와 같은 배율
        // 범위(약 0.82~1.28)로 맞췄다 — 이 앱이 입체를 표현하는 방식이 그거다.
        float dzdx = a1 * 0.30 * cos(ph1) + a3 * 0.85 * cos(ph3);
        float dzdy = a2 * 0.19 * cos(ph2) + a3 * 0.85 * cos(ph3);
        vec3 waterNormal = normalize(vec3(-dzdx, -dzdy, 1.0));
        vec3 waterLightDir = normalize(vec3(-0.35, 0.5, 0.78));
        vWaterLight = 0.82 + 0.46 * clamp(dot(waterNormal, waterLightDir), 0.0, 1.0);
      `)
      // 곡률 — `curve.js`의 `applyCurve`와 완전히 같은 내용이다.
      .replace('#include <project_vertex>', /* glsl */`
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        mvPosition.y -= uCurve * mvPosition.z * mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      `)

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWaterLight;')
      // `<map_fragment>`가 텍스처 색을 diffuseColor에 곱한 **다음** 자리다 —
      // 최종 색에 밝기를 곱해야 마루가 밝고 골이 어두워 보인다.
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        diffuseColor.rgb *= vWaterLight;
      `)
  }
  material.needsUpdate = true
}

/**
 * @param {{value:number}} kUniform 곡률 — `curve.js`의 `CURVE.k`를 담은 유니폼.
 *   화면(`#/lab-sea`)이 실시간으로 돌릴 수 있게 객체로 받는다.
 * @param {{width?:number, length?:number}} [opts]
 */
export function createWater(kUniform, { width = 140, length = 182 } = {}) {
  const map = waterTexture()
  const timeUniform = { value: 0 }
  const material = new THREE.MeshBasicMaterial({ map, fog: true })
  applyCurveAndRipple(material, kUniform, timeUniform)

  // 잘게 나눈다 — 정점이 있어야 잔물결도 곡률도 먹는다(2삼각형 판은 안 휜다,
  // `ground.js`와 같은 이유). 가로도 촘촘히 나누는 건 잔챙이 물결(대각선,
  // 파장이 짧다)이 폭 방향에서도 각지지 않게 보이려면 필요하다 — 육지
  // 잔디판은 곡률만 있으면 되니 세로만 나눴지만(1×80), 물은 가로도 흔든다.
  const geometry = new THREE.PlaneGeometry(width, length, 24, 80)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(0, 0, -length * 0.45)
  mesh.frustumCulled = false

  return {
    mesh,

    /**
     * @param {number} dz 이번 프레임에 다가온 거리(유닛) — 텍스처만 흘린다
     * @param {number} dt 이번 프레임의 시간(초) — 잔물결 위상을 돌린다
     */
    update(dz, dt) {
      const dv = dz / length
      map.offset.y += dv * map.repeat.y
      timeUniform.value += dt
    },

    dispose() {
      geometry.dispose()
      material.dispose()
      map.dispose()
    },
  }
}

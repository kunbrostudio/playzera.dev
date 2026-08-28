// 결승 포털 — **판 전체에서 딱 한 번** 나오는 물건. ★★
//
// ── 왜 장애물 통에 안 넣나 ──────────────────────────────────
//
// `obstacles3d.js`는 종류마다 `InstancedMesh` 하나를 두고 여러 개를 같은
// 행렬로 찍어 낸다. 지나가는 장애물에는 맞는 방식이지만 여기는 셋이 다르다.
//
//   ① **하나뿐이다.** 8칸짜리 인스턴스 통을 잡아 놓고 1개만 쓴다
//   ② **부품이 다르게 움직인다.** 문은 반짝이고 불은 흔들린다.
//      인스턴싱은 인스턴스마다 다른 재질·다른 시간을 못 준다
//   ③ **아이가 통과한다.** 지나가고 나서도 뒤에 남아 있어야 한다
//
// 그래서 자기 그룹을 갖는다. 대신 **씬에 한 번만 붙고**, 코스가 준 z로
// 그룹째 옮긴다 — draw call은 셋(포털·문·불)이다.
//
// ── 문은 그림이 아니라 셰이더다 ★ ───────────────────────────
//
// 받은 모델에는 문짝이 그려져 있었다. 그걸 그대로 쓰면 아무리 밝게 칠해도
// **안 움직인다** — 4~8세에게 "여기가 끝이다, 들어가라"를 말해 주는 것은
// 반짝임이다. 그래서 블렌더에서 문짝을 빼내고(`import_ai.py`의 `_take_door`)
// 그 자리에 판 하나를 세운다.
//
// **자리는 블렌더가 잰 값이다.** 손으로 적으면 모델을 다시 뽑을 때 조용히
// 어긋난다 — 문은 벽에 남고 빛만 허공에 뜬다.

import * as THREE from 'three'
import { loadGeometries } from './models.js'

/**
 * 문의 자리와 크기 — **`import_ai.py`가 잰 값을 옮겨 적은 것이다.**
 *
 *   블렌더에서 `import_ai.run(only={'finish_portal'})` → `report.door`
 *
 * 블렌더는 Z가 위·-Y가 앞이고 glTF는 Y가 위·+Z가 앞이라, 블렌더의 y가
 * 여기서는 **부호가 뒤집힌 z**가 된다.
 *
 * 폭은 스크립트가 준 5.83에서 5.3으로 줄였다 — 그 값은 문짝을 **찾는 상자**의
 * 크기라 돌 프레임을 조금 물고 있다. 메시에서 잰 실제 구멍이 ±2.7이다.
 */
export const DOOR = { w: 5.3, h: 9.9, y: 5.05, z: -0.48 }

/**
 * 불이 서는 자리 — 양쪽 탑 **꼭대기**.
 *
 * 눈으로 찍지 않고 **메시에서 쟀다.** 트랙 밖(|x| > 6.5)에서 제일 높은 곳이
 * 탑이고, 그 무게중심이 x = ±7.49 · z = 20.17 · y(깊이) = 2.91이다.
 * 어림으로 8.35를 적어 봤더니 불이 탑 바깥 허공에 떠 있었다.
 *
 * `base`는 **불의 밑동**이다. 판의 한가운데가 아니라 — 불은 발밑에서 위로
 * 타오르는 것이라 밑동을 기준으로 잡아야 탑에 붙는다.
 */
export const FIRE = { x: 7.49, base: 20.17, z: -2.9, w: 4.0, h: 5.8 }

const PORTAL_W = 21
const PORTAL_H = 20.17

// ── 문: 흐르는 빛 ───────────────────────────────────────────
//
// 반투명 + 가산 합성이다. 뒤가 뚫려 있으므로(뒷벽을 잘랐다) 문 너머로 길이
// 비쳐 보이고, 그 위에 빛이 얹힌다 — "지나갈 수 있다"가 그림으로 읽힌다.
//
// `depthWrite: false`가 중요하다. 켜 두면 이 판이 깊이 버퍼를 채워서
// **뒤에 있는 길이 사라진다** — 아이 눈에는 문이 아니라 노란 벽이 된다.
const DOOR_VS = /* glsl */`
  uniform float uCurve;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    mv.y -= uCurve * mv.z * mv.z;      // 세계와 같은 곡률. 안 주면 문만 안 휜다
    gl_Position = projectionMatrix * mv;
  }
`

const DOOR_FS = /* glsl */`
  precision mediump float;
  uniform float uTime;
  uniform float uOpen;                 // 0 = 닫힘, 1 = 활짝. 다가올수록 커진다
  varying vec2 vUv;

  void main() {
    vec2 p = vUv - 0.5;

    // ── 가장자리는 옅게 ──
    // 사각형 그대로 두면 판의 네 변이 선으로 보여서 "판때기"가 된다.
    float edge = (1.0 - smoothstep(0.30, 0.50, abs(p.x)))
               * (1.0 - smoothstep(0.34, 0.50, abs(p.y)));

    // ── 위로 흐르는 결 ──
    // 문 안쪽에서 빛이 솟아오르는 느낌. 아이 눈이 위(=스컬프처)로 따라 올라간다.
    float flow = 0.5 + 0.5 * sin((vUv.y * 9.0 - uTime * 1.6) * 3.14159);

    // ── 숨쉬기 ──
    float pulse = 0.78 + 0.22 * sin(uTime * 2.2);

    // ── 반짝이 알갱이 ──
    // 별처럼 몇 개만 켰다 꺼진다. 많이 넣으면 지직거리는 화면이 된다.
    vec2 g = floor(vUv * vec2(7.0, 12.0));
    float rnd = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
    float twinkle = smoothstep(0.86, 1.0, sin(uTime * 2.4 + rnd * 6.283) * 0.5 + 0.5);

    float a = edge * (0.30 + 0.30 * flow + 0.34 * twinkle) * pulse * uOpen;

    // 가운데는 하얗게, 가장자리로 갈수록 금빛 — 뜨거운 빛의 색이다
    vec3 col = mix(vec3(1.0, 0.72, 0.22), vec3(1.0, 0.98, 0.86), edge * (0.45 + 0.4 * flow));
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`

// ── 불: 두 갈래로 흔들리는 혀 ───────────────────────────────
//
// 스프라이트 시트를 만들 수도 있었지만 **그림이 테마마다 는다.** 불은
// 우주에서도 정글에서도 불이라 셰이더 한 벌이면 된다(`CLAUDE.md`:
// 연출을 그림 파일로 늘리지 않는다).
const FIRE_FS = /* glsl */`
  precision mediump float;
  uniform float uTime;
  varying vec2 vUv;

  // 값 노이즈 — 불꽃이 뭉치고 흩어지는 결
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    vec2 p = vUv;
    // 위로 갈수록 좁아진다 — 불꽃의 모양은 폭이 만든다
    float taper = 1.0 - p.y * 0.72;
    float dx = abs(p.x - 0.5) / max(taper * 0.5, 1e-3);

    // 흔들림. 위쪽일수록 크게 흔들려야 혀처럼 보인다
    float sway = sin(uTime * 3.1 + p.y * 5.0) * 0.16 * p.y
               + sin(uTime * 5.3 + p.y * 9.0) * 0.07 * p.y;
    dx = abs(dx + sway);

    float n = noise(vec2(p.x * 4.0, p.y * 3.0 - uTime * 2.4));
    float body = smoothstep(1.0, 0.15, dx) * smoothstep(1.0, 0.55, p.y);
    body *= 0.62 + 0.55 * n;

    // 심지는 하얗고, 바깥으로 갈수록 주황 → 빨강
    vec3 col = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.75, 0.15), smoothstep(0.9, 0.25, dx));
    col = mix(col, vec3(1.0, 0.98, 0.8), smoothstep(0.45, 0.0, dx) * (1.0 - p.y * 1.1));
    gl_FragColor = vec4(col, clamp(body, 0.0, 1.0));
  }
`

const FIRE_VS = /* glsl */`
  uniform float uCurve;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    mv.y -= uCurve * mv.z * mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

function glowMaterial(fs, kUniform, extra = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: extra.vs ?? DOOR_VS,
    fragmentShader: fs,
    uniforms: { uTime: { value: 0 }, uOpen: { value: 1 }, uCurve: kUniform },
    transparent: true,
    // ── 가산 합성 ★ ──
    // 빛은 뒤를 **가리지 않고 더한다.** 보통 알파로 두면 문 뒤의 길이 어둡게
    // 깔려 통로가 막힌 것처럼 보인다.
    blending: THREE.AdditiveBlending,
    // 깊이를 **안 쓴다.** 쓰면 판 뒤의 길이 지워지고, 그러면 문이 아니라 벽이다.
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,      // 안개가 끼면 빛이 흐려진다. 빛은 멀어도 빛이다
  })
}

/**
 * 결승 포털 하나. **씬에 한 번 붙이고 z만 옮긴다.**
 *
 * @param {(m: import('three').Material) => import('three').Material} withCurve
 * @param {{value:number}} kUniform 곡률 유니폼 — 셰이더 재질은 직접 받는다
 */
export function createPortal(withCurve, kUniform) {
  const group = new THREE.Group()
  group.visible = false          // 마지막 레벨 끝에만 나온다
  group.frustumCulled = false

  // ── 뼈대: 도형으로 먼저, 모델이 오면 갈아 낀다 ──
  // 다른 장애물과 같은 규율이다. 모델이 안 와도 게임이 멈추지 않는다.
  const stub = new THREE.Mesh(
    new THREE.BoxGeometry(PORTAL_W, PORTAL_H, 2),
    withCurve(new THREE.MeshBasicMaterial({ color: '#8a6a52', fog: true })),
  )
  stub.position.y = PORTAL_H / 2
  stub.frustumCulled = false
  group.add(stub)

  let shell = stub
  loadGeometries(['finish_portal'], 'obstacles').then(geos => {
    const g = geos.finish_portal
    if (!g) return
    const map = g.userData?.pzMap
    const m = new THREE.Mesh(g, withCurve(new THREE.MeshBasicMaterial({
      map: map ?? null, color: map ? 0xffffff : 0x8a6a52, fog: true,
    })))
    m.frustumCulled = false
    group.remove(shell)
    shell.geometry.dispose()
    shell = m
    group.add(m)
  })

  // ── 문 ──
  const doorMat = glowMaterial(DOOR_FS, kUniform)
  const door = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w, DOOR.h), doorMat)
  door.position.set(0, DOOR.y, DOOR.z)
  door.frustumCulled = false
  // 빛은 **맨 나중에** 그린다. 안 그러면 뒤에 오는 물건이 빛 위에 얹힌다.
  door.renderOrder = 5
  group.add(door)

  // ── 불 ──
  // 두 개를 하나의 지오메트리로 묶었다. 따로 두면 draw call이 하나 더 는다.
  const fireGeo = new THREE.PlaneGeometry(FIRE.w, FIRE.h)
  const fires = []
  const fireMat = glowMaterial(FIRE_FS, kUniform, { vs: FIRE_VS })
  for (const side of [-1, 1]) {
    const f = new THREE.Mesh(fireGeo, fireMat)
    // 판의 한가운데를 밑동 위 절반에 둔다 — 그래야 불이 탑에 **붙는다**
    f.position.set(side * FIRE.x, FIRE.base + FIRE.h / 2, FIRE.z)
    f.frustumCulled = false
    f.renderOrder = 5
    fires.push(f)
    group.add(f)
  }

  let t = 0
  return {
    group,
    /** 이 판에 포털이 있나. 없으면 그리지 않는다 — 매 레벨 뜨는 물건이 아니다. */
    set active(on) { group.visible = on },
    get active() { return group.visible },

    /** 코스가 준 자리. x는 언제나 트랙 한가운데다. */
    place(z) { group.position.set(0, 0, z) },

    /**
     * @param {number} dt 초
     * @param {number} near 0…1 — 아이가 얼마나 가까이 왔나. 문이 밝아진다
     */
    update(dt, near = 1) {
      if (!group.visible) return
      t += dt
      doorMat.uniforms.uTime.value = t
      doorMat.uniforms.uOpen.value = 0.45 + 0.55 * near
      fireMat.uniforms.uTime.value = t
      // 불은 판이라 옆에서 보면 종잇장이다. **언제나 카메라를 보게** 돌린다 —
      // 빌보드는 스프라이트가 아니라 회전으로 한다(스프라이트는 곡률을 못 받는다).
      for (const f of fires) f.rotation.y = -group.rotation.y
    },

    dispose() {
      shell.geometry.dispose()
      shell.material.dispose()
      door.geometry.dispose(); doorMat.dispose()
      fireGeo.dispose(); fireMat.dispose()
    },
  }
}

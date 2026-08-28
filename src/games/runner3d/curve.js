// 휜 세계 — **논리는 평평하고, 휘는 것은 눈뿐이다.** ★
//
// ── 왜 진짜 구를 안 돌리나 ───────────────────────────────────
//
// "큰 행성을 만들어 돌리자"가 먼저 떠오르는 답이고 그림도 예쁘다. 그런데 이 게임의
// 심장은 **장애물 예고 거리**다 — `approachSec` 2.0~3.2초. 아이가 보고, 판단하고,
// 몸을 옮길 시간이다. 세계 단위로 약 58유닛 앞이 보여야 한다.
//
// 구 위에서 지평선까지는 `√(2Rh)`다. 카메라를 지면 6유닛 위에 둔다면
//
//   R=100  → 35유닛   확 휘지만 **장애물이 발밑에서 튀어나온다**
//   R=300  → 60유닛   겨우
//   R=600  → 85유닛   충분한데 **휨이 거의 안 보인다**
//
// 곡률과 예고 거리가 정면으로 부딪힌다. 진짜 구로는 둘 다 가질 수 없다.
//
// ── 그래서 눈에만 준다 ───────────────────────────────────────
//
// 정점 셰이더에서 **뷰 공간 y를 z²만큼 내린다.**
//
//   y -= k · z²        (k = 1 / 2R_시각)
//
// 충돌·레인·코스 타이밍은 평면 그대로라 기존 판정 코드를 손대지 않는다.
// 그리고 `k`가 **예고 거리와 무관한 손잡이**가 된다 — R=100처럼 극적으로 휘게 해도
// 장애물은 제 시각에 나타난다.
//
// 비용은 0이다. 지오메트리가 늘지 않고 draw call도 그대로다.
//
// ⚠️ **바닥과 프롭이 같은 k를 써야 한다.** 하나만 휘면 물건이 땅에서 떠오르거나
// 파묻힌다. 그래서 재질마다 값을 적지 않고 여기 하나를 공유한다.

/**
 * 시각 곡률. `1 / (2 × 보이고 싶은 반지름)`
 *
 * **눈으로 골랐다(8/19).** `#/lab3d`에서 60~600을 돌려 보고 R=600으로 정했다.
 * 더 작게 하면 휨은 극적이지만 바닥 판의 끝이 지평선 위로 들려 잘린 선이 보이고,
 * 무엇보다 아이가 보는 화면이 어지럽다. 600은 "행성 위"가 은은히 읽히는 자리다.
 */
// R=600에서 900으로 올렸다 — `#/lab3d`에서 눈으로 고른 값이다(8/25).
// 600은 트랙이 눈에 띄게 말려 올라가 원경이 좁아 보였다. 900이면 58유닛 앞이
// 1.9유닛 내려앉는다 — 세계가 둥글다는 것만 말해 주고 길은 여전히 곧게 읽힌다.
export const CURVE = { k: 1 / (2 * 900) }

/** 시각 반지름 ↔ k. 화면에서 고를 때는 반지름이 사람 말에 가깝다. */
export const kFromRadius = R => 1 / (2 * R)
export const radiusFromK = k => 1 / (2 * k)

/**
 * z만큼 앞에 있는 것이 화면에서 얼마나 내려앉나(유닛).
 *
 * 테스트와 화면 설명이 같은 식을 쓰게 하려고 떼어 뒀다.
 * 셰이더와 이 함수가 어긋나면 "슬라이더 숫자와 보이는 게 다르다"가 된다.
 */
export const dropAt = (z, k = CURVE.k) => k * z * z

/**
 * 구 위에서 지평선까지의 거리 — **진짜 구였다면** 얼마나 보였을까.
 *
 * 곡률을 고르는 화면에서 "이 휨을 진짜 행성으로 만들면 예고 거리가 이만큼 준다"를
 * 같이 보여주려고 둔다. 우리가 왜 셰이더로 가는지가 숫자로 보인다.
 */
export const horizonDistance = (R, camHeight) => Math.sqrt(2 * R * camHeight + camHeight * camHeight)

/**
 * 재질에 곡률을 심는다.
 *
 * `onBeforeCompile`로 three가 만든 셰이더에 끼워 넣는다. 재질을 새로 쓰면
 * three의 안개·인스턴싱·스킨이 다 날아가므로 **끼워 넣기**가 맞다.
 *
 * @param {import('three').Material} material
 * @param {{ value:number }} kUniform  화면이 실시간으로 돌릴 수 있게 유니폼을 넘긴다
 */
export function applyCurve(material, kUniform) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uCurve = kUniform
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCurve;')
      // `project_vertex`가 모델→뷰→클립 변환을 하는 자리다. 그걸 그대로 다시 쓰되
      // **뷰 공간에서 한 번 내린다.** 월드 공간에서 내리면 카메라가 돌 때 같이 돌아
      // 휨이 화면에 붙어 있지 않고 세계에 붙는다.
      .replace('#include <project_vertex>', /* glsl */`
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        // 카메라 앞은 z가 음수다. 제곱하니 부호는 상관없다.
        mvPosition.y -= uCurve * mvPosition.z * mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      `)
  }
  // 이미 컴파일된 재질이면 다시 컴파일하게 한다
  material.needsUpdate = true
  return material
}

// PoseMatcher — 웜업의 스트레칭 포즈 목표값.
//
// **채점 자체는 `core/pose/poseMatch.js`가 한다.** 요가 자세를 넣으면서 core로 올렸다 —
// 각도 계산과 화면 비율 보정이 두 벌이 되면 반드시 어긋난다.
// 여기 남은 것은 **이 게임의 포즈 목표값**과 예전 이름의 얇은 껍데기뿐이다.

import {
  poseFeatures, featureScore, mirrorFeatures, scoreAgainst, matchTargets, matchDetail,
} from '../../../core/pose/poseMatch.js'

export { poseFeatures as jointAngles, featureScore as jointScore }

// 목표 포즈 정의: [목표각, 허용오차, 가중치, 판정방향?]
//
// ⚠️ **'min'을 붙인 관절은 "그 각도 이상이면 만점"이다.**
//
// 원래는 전부 양방향이었다. 그런데 팔·다리를 "펴라"는 관절의 목표를 165~172°로
// 잡아놨더니, **완벽하게 편 180°가 감점을 받았다.**
//
//   lElbow  목표 165 ± 30  →  180°(쭉 편 팔)  =  |180-165|/30 = 0.50점
//   lKnee   목표 172 ± 20  →  180°(쭉 편 다리) = |180-172|/20 = 0.60점
//
// 그 결과 기하학적으로 완벽한 T포즈가 0.70점으로 기준(0.75)을 못 넘었다.
// **자세가 문제가 아니라 채점이 문제였다** — 아무리 잘해도 통과할 수 없었다.
//
// 관절은 180°에서 멈춘다. "더 펴라"는 요구를 넘겼다고 깎을 이유가 없다.
// 굽히는 관절(런지 앞무릎 105°)은 양쪽 다 의미가 있으므로 그대로 둔다.
export const POSE_TARGETS = {
  // 런지: 앞무릎 굽힘 + 뒷다리 폄 + 상체 세움
  //
  // ⚠️ 2D 카메라의 한계에 걸리는 유일한 포즈다. 다리를 **앞뒤로** 뻗는 동작이라
  // 정면에서 보면 깊이가 안 보여 굽힌 무릎이 곧게 편 것으로 계산된다(정면 런지 0.48점).
  // 옆으로 서야 잡히는데, 그러면 레인 이동(골반 x)이 망가진다.
  // → 좌우 평면 동작으로 교체할지 결정이 필요하다. docs/04 참고.
  lunge: {
    lKnee: [105, 40, 2], rKnee: [165, 30, 2, 'min'],
    lHip: [110, 40, 1.5], rHip: [165, 35, 1.5, 'min'],
    lShoulder: [30, 35, 0.5], rShoulder: [30, 35, 0.5],
  },

  // 옆구리 늘리기 — 한 팔을 머리 위로 넘기고 몸통을 옆으로 기울인다.
  //
  // ⚠️ 키 이름은 `forwardbend`지만 **실제 동작은 옆구리 늘리기다.**
  // 에셋 파일명(`obs_sign_stretch_forwardbend.png`·`char_stretch_forwardbend.png`)이
  // 이 이름이라 키를 그대로 뒀다. 사인판과 캐릭터 그림 둘 다 옆구리 늘리기인데
  // **코드만 "상체 앞으로 접기"(고관절 75°)를 보고 있었다.** 그림대로 정확히 해도
  // 고관절이 150~175°라 0점이었다 — 통과할 수 없는 포즈였다.
  //
  // 판정의 핵심은 **비대칭**이다. 한쪽 팔은 머리 위(어깨각 큼), 반대쪽은 아래(작음).
  // 거기에 몸통 기울기를 함께 봐야 "한 팔만 든 채 서 있기"와 갈린다.
  // 세 값이 **동시에** 맞아야 통과한다. 하나라도 빠지면 다른 동작이다.
  //   기울임 없이 팔만 들기        → torsoTilt 0점 (가중치가 제일 크다)
  //   기울이기만 하고 팔은 그대로  → lShoulder 0점
  forwardbend: {
    torsoTilt: [22, 18, 2.5, 'min'],     // 옆으로 기울였나 — 더 기울여도 만점
    lShoulder: [130, 45, 2, 'min'],      // 위로 넘긴 팔 — 더 올려도 만점
    rShoulder: [35, 40, 1, 'max'],       // 내린 팔 — 더 붙여도 만점
    lKnee: [172, 22, 1, 'min'], rKnee: [172, 22, 1, 'min'],   // 다리는 곧게
  },

  // 팔 벌리기(T포즈): 팔 수평 + 팔꿈치 폄 + 직립
  armsopen: {
    lShoulder: [90, 25, 2], rShoulder: [90, 25, 2],
    lElbow: [165, 30, 1.5, 'min'], rElbow: [165, 30, 1.5, 'min'],
    lKnee: [172, 20, 1, 'min'], rKnee: [172, 20, 1, 'min'],
    lHip: [172, 20, 1, 'min'], rHip: [172, 20, 1, 'min'],
    torsoTilt: [0, 25, 1, 'max'],        // 똑바로 서 있어야 한다
  },
};

// ── 예전 이름 (웜업 코드가 그대로 쓴다) ─────────────────────
export function matchPose(lms, poseType, k) {
  return matchTargets(lms, POSE_TARGETS[poseType], k)
}

export function jointScores(lms, poseType, k) {
  return matchDetail(lms, POSE_TARGETS[poseType], k)
}

// PoseMatcher — 스트레칭 포즈 유사도 스코어링 (관절 각도 비교)
// 좌우 반전 허용: 미러 버전과 비교해 높은 점수 채택
import { LM } from './poseEngine.js';

// 관절각(도) 계산: b를 꼭짓점으로 a-b-c
function angle(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (m === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180 / Math.PI;
}

// 현재 랜드마크에서 주요 관절각 추출
function extractAngles(lms) {
  return {
    lElbow: angle(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST]),
    rElbow: angle(lms[LM.R_SHOULDER], lms[LM.R_ELBOW], lms[LM.R_WRIST]),
    lShoulder: angle(lms[LM.L_ELBOW], lms[LM.L_SHOULDER], lms[LM.L_HIP]),
    rShoulder: angle(lms[LM.R_ELBOW], lms[LM.R_SHOULDER], lms[LM.R_HIP]),
    lHip: angle(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE]),
    rHip: angle(lms[LM.R_SHOULDER], lms[LM.R_HIP], lms[LM.R_KNEE]),
    lKnee: angle(lms[LM.L_HIP], lms[LM.L_KNEE], lms[LM.L_ANKLE]),
    rKnee: angle(lms[LM.R_HIP], lms[LM.R_KNEE], lms[LM.R_ANKLE]),
  };
}

// 목표 포즈 정의: [목표각, 허용오차, 가중치]
const POSE_TARGETS = {
  // 런지: 앞무릎 굽힘 + 뒷다리 폄 + 상체 세움
  lunge: {
    lKnee: [105, 40, 2], rKnee: [165, 30, 2],
    lHip: [110, 40, 1.5], rHip: [165, 35, 1.5],
    lShoulder: [30, 35, 0.5], rShoulder: [30, 35, 0.5],
  },
  // 상체 숙이기: 고관절 접힘 + 무릎 폄 + 팔 아래로
  forwardbend: {
    lHip: [75, 35, 2], rHip: [75, 35, 2],
    lKnee: [168, 25, 1.5], rKnee: [168, 25, 1.5],
    lShoulder: [130, 50, 1], rShoulder: [130, 50, 1],
  },
  // 팔 벌리기(T포즈): 팔 수평 + 팔꿈치 폄 + 직립
  armsopen: {
    lShoulder: [90, 25, 2], rShoulder: [90, 25, 2],
    lElbow: [165, 30, 1.5], rElbow: [165, 30, 1.5],
    lKnee: [172, 20, 1], rKnee: [172, 20, 1],
    lHip: [172, 20, 1], rHip: [172, 20, 1],
  },
};

function mirrorAngles(a) {
  return {
    lElbow: a.rElbow, rElbow: a.lElbow,
    lShoulder: a.rShoulder, rShoulder: a.lShoulder,
    lHip: a.rHip, rHip: a.lHip,
    lKnee: a.rKnee, rKnee: a.lKnee,
  };
}

function scoreAgainst(angles, targets) {
  let sum = 0, wsum = 0;
  for (const [joint, [target, tol, w]] of Object.entries(targets)) {
    const s = Math.max(0, 1 - Math.abs(angles[joint] - target) / tol);
    sum += s * w;
    wsum += w;
  }
  return wsum ? sum / wsum : 0;
}

// 반환: 0~1 유사도
export function matchPose(lms, poseType) {
  const targets = POSE_TARGETS[poseType];
  if (!targets || !lms) return 0;
  const a = extractAngles(lms);
  return Math.max(scoreAgainst(a, targets), scoreAgainst(mirrorAngles(a), targets));
}

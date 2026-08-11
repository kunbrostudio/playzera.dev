// 자세 채점 — 관절 각도와 몸 비율을 목표값과 견준다.
//
// 원래 `games/warmup-obstacle/input/poseMatcher.js`에 있었고 웜업만 썼다.
// 요가 자세를 넣으면서 core로 올린다 — 두 벌이 되면 반드시 어긋난다.
// (웜업 파일은 이제 이 모듈을 부르는 얇은 껍데기다)
//
// ── 각도만으로는 부족하다 ────────────────────────────────────
//
// 웜업의 세 자세는 팔·다리 각도만으로 갈렸다. 그런데 요가는 그렇지 않다.
//   삼각 자세 vs 초승달   — 몸통 기울기·팔 각도가 거의 같다. **다리 벌린 폭**만 다르다
//   나무 vs 산            — 팔 각도가 같다. **한 발이 떠 있나**만 다르다
// 그래서 각도 옆에 **몸 비율**을 함께 뽑는다. 채점 방식은 같다.

import { LM } from './gesture.js'
import { poseEngineCore } from './poseEngine.js'

// ── 화면 비율 보정 ──────────────────────────────────────────
//
// ⚠️ 랜드마크의 x는 **가로 폭**으로, y는 **세로 높이**로 각각 0~1 정규화된다.
// 16:9 프레임이면 x 1.0이 y 1.0보다 1.78배 긴 거리다. 그 좌표로 각도를 재면
// **비스듬한 자세가 통째로 어긋난다** — 실제 45°가 29°로 나온다.
// 축에 나란한 T포즈는 우연히 영향이 없어서 오래 안 보였다.
export function frameAspect() {
  try { return poseEngineCore.frameAspect ?? 16 / 9 } catch { return 16 / 9 }
}

// 관절각(도) — b를 꼭짓점으로 a-b-c
function angle(a, b, c, k) {
  const v1 = { x: (a.x - b.x) * k, y: a.y - b.y }
  const v2 = { x: (c.x - b.x) * k, y: c.y - b.y }
  const dot = v1.x * v2.x + v1.y * v2.y
  const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)
  if (m === 0) return 0
  return Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180 / Math.PI
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * 자세의 특징값 — 각도(도)와 비율(어깨너비·키 기준).
 *
 * **비율은 어깨너비나 키로 나눈다.** 픽셀이나 정규화 좌표를 그대로 쓰면
 * 아이 키와 카메라 거리에 따라 값이 달라진다(프로젝트 공통 규칙).
 */
export function poseFeatures(lms, k = frameAspect()) {
  const sh = mid(lms[LM.L_SHOULDER], lms[LM.R_SHOULDER])
  const hip = mid(lms[LM.L_HIP], lms[LM.R_HIP])
  const shoulderW = Math.abs(lms[LM.L_SHOULDER].x - lms[LM.R_SHOULDER].x) * k || 1e-6
  const bodyH = Math.abs(mid(lms[LM.L_ANKLE], lms[LM.R_ANKLE]).y - lms[LM.NOSE].y) || 1e-6

  // 몸통이 수직에서 몇 도 기울었나. 관절각만으로는 "서 있음"과 "옆으로 기움"을
  // 구별할 수 없다 — 옆구리 늘리기·삼각 자세는 이 값이 판정의 핵심이다.
  const torsoTilt = Math.abs(
    Math.atan2((sh.x - hip.x) * k, hip.y - sh.y) * 180 / Math.PI
  )

  return {
    lElbow: angle(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST], k),
    rElbow: angle(lms[LM.R_SHOULDER], lms[LM.R_ELBOW], lms[LM.R_WRIST], k),
    lShoulder: angle(lms[LM.L_ELBOW], lms[LM.L_SHOULDER], lms[LM.L_HIP], k),
    rShoulder: angle(lms[LM.R_ELBOW], lms[LM.R_SHOULDER], lms[LM.R_HIP], k),
    lHip: angle(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE], k),
    rHip: angle(lms[LM.R_SHOULDER], lms[LM.R_HIP], lms[LM.R_KNEE], k),
    lKnee: angle(lms[LM.L_HIP], lms[LM.L_KNEE], lms[LM.L_ANKLE], k),
    rKnee: angle(lms[LM.R_HIP], lms[LM.R_KNEE], lms[LM.R_ANKLE], k),
    torsoTilt,

    // ── 비율 (요가를 넣으며 추가) ──
    stance:   Math.abs(lms[LM.L_ANKLE].x - lms[LM.R_ANKLE].x) * k / shoulderW,  // 다리 벌린 폭
    armSpan:  Math.abs(lms[LM.L_WRIST].x - lms[LM.R_WRIST].x) * k / shoulderW,  // 손 벌린 폭
    footLift: Math.abs(lms[LM.L_ANKLE].y - lms[LM.R_ANKLE].y) / bodyH,          // 한 발이 떴나
    handGap:  Math.hypot((lms[LM.L_WRIST].x - lms[LM.R_WRIST].x) * k,
                         lms[LM.L_WRIST].y - lms[LM.R_WRIST].y) / shoulderW,    // 두 손이 모였나
  }
}

/** 예전 이름 — 웜업이 아직 쓴다 */
export const jointAngles = poseFeatures

/**
 * 특징값 하나의 점수 0~1.
 *   'min' — 목표 이상이면 만점 (더 폈다고 깎지 않는다)
 *   'max' — 목표 이하면 만점 (더 똑바르다고 깎지 않는다)
 *
 * ⚠️ 이 모드가 없던 시절, 팔을 "펴라"는 목표를 165°로 잡아놓고
 * **완벽하게 편 180°를 감점**했다. 실제로 T포즈가 0.696점으로 떨어졌다.
 */
export function featureScore(value, [target, tol, , mode]) {
  const diff = mode === 'min' ? Math.max(0, target - value)
             : mode === 'max' ? Math.max(0, value - target)
             : Math.abs(value - target)
  return Math.max(0, 1 - diff / tol)
}

/** 좌우를 바꾼 특징값. 비율(stance·armSpan…)과 torsoTilt는 대칭이라 그대로 둔다. */
export function mirrorFeatures(a) {
  return {
    ...a,
    lElbow: a.rElbow, rElbow: a.lElbow,
    lShoulder: a.rShoulder, rShoulder: a.lShoulder,
    lHip: a.rHip, rHip: a.lHip,
    lKnee: a.rKnee, rKnee: a.lKnee,
  }
}

export function scoreAgainst(features, targets) {
  let sum = 0, wsum = 0
  for (const [key, spec] of Object.entries(targets)) {
    sum += featureScore(features[key], spec) * spec[2]
    wsum += spec[2]
  }
  return wsum ? sum / wsum : 0
}

/**
 * 자세 유사도 0~1. **좌우 반전을 자동으로 허용한다** —
 * 아이가 어느 발을 들든 같은 자세다.
 */
export function matchTargets(lms, targets, k) {
  if (!targets || !lms) return 0
  const f = poseFeatures(lms, k ?? frameAspect())
  return Math.max(scoreAgainst(f, targets), scoreAgainst(mirrorFeatures(f), targets))
}

/**
 * 항목별 내역 — 진단용.
 *
 * 총점만 보면 "왜 안 맞는지"를 알 수 없다. 어느 관절이 깎아먹는지 보이면
 * 원인이 바로 갈린다(다리가 프레임 밖 / 자세가 다름 / 기준이 빡빡함).
 */
export function matchDetail(lms, targets, k) {
  if (!targets || !lms) return { total: 0, joints: [] }
  const f = poseFeatures(lms, k ?? frameAspect())
  const m = mirrorFeatures(f)
  const useMirror = scoreAgainst(m, targets) > scoreAgainst(f, targets)
  const use = useMirror ? m : f
  const joints = Object.entries(targets)
    .map(([key, spec]) => [key, featureScore(use[key], spec), use[key], spec[0]])
    .sort((x, y) => x[1] - y[1])      // 낮은 것부터 — 범인이 맨 위
  return { total: scoreAgainst(use, targets), joints, mirrored: useMirror }
}

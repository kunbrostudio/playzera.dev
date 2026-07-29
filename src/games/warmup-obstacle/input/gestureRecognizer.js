// GestureRecognizer — 메뉴/화면 전환용 손동작 인식 (달리기 중 좌우/점프/숙이기와는 별개)
// 머리 위로 동그라미(O) = 시작/확인, 팔을 엇갈려 엑스(X) = 종료 — 직관적인 유니버설 제스처
// X는 머리 위로 들지 않아도(가슴 앞 등 편한 위치에서) 인식되도록 완화했음 — O만 머리 위 유지
import { LM } from './poseEngine.js';

function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

function bodyMetrics(lms) {
  const nose = lms[LM.NOSE];
  const hip = mid(lms[LM.L_HIP], lms[LM.R_HIP]);
  const ankle = mid(lms[LM.L_ANKLE], lms[LM.R_ANKLE]);
  const bodyHeight = Math.abs(ankle.y - nose.y);
  return { nose, bodyHeight };
}

// 손목이 코보다 확실히 위(=든 상태)인지
function isRaised(wrist, nose, bodyHeight, margin) {
  return (nose.y - wrist.y) > bodyHeight * margin;
}

// 머리 위로 양손을 모아 동그라미(O)를 만든 자세
export function isArmsUpCircle(lms, cfg) {
  if (!lms) return false;
  const lw = lms[LM.L_WRIST], rw = lms[LM.R_WRIST];
  const { nose, bodyHeight } = bodyMetrics(lms);
  if (bodyHeight < 0.15) return false;
  const bothUp = isRaised(lw, nose, bodyHeight, cfg.armsUpMargin) && isRaised(rw, nose, bodyHeight, cfg.armsUpMargin);
  if (!bothUp) return false;
  const dist = Math.hypot(lw.x - rw.x, lw.y - rw.y);
  return dist < bodyHeight * cfg.closeMargin;
}

// 양팔을 엇갈려 엑스(X)를 만든 자세 — 손목 좌우 순서가 어깨 좌우 순서와 반대로 뒤집히면 교차로 판정.
// 머리 위로 들어야 한다는 제약은 없앰(가슴 앞, 배 앞 등 어디서든 팔짱/엑스 모양이면 인식).
// 상반신(어깨·손목)만으로 판정 — 전신(코~발목) 기준 bodyHeight를 쓰면 달리기/점프/피하기로
// 몸이 계속 움직이는 실제 플레이 중엔 발목이 프레임 밖으로 나가거나 트래킹이 흔들려서
// 정지 화면(종료 확인창 등)에서는 잘 되던 인식이 플레이 중엔 잘 안 되는 문제가 있었다.
export function isArmsUpCross(lms, cfg) {
  if (!lms) return false;
  const lw = lms[LM.L_WRIST], rw = lms[LM.R_WRIST];
  const ls = lms[LM.L_SHOULDER], rs = lms[LM.R_SHOULDER];
  const shoulderWidth = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  if (shoulderWidth < 0.03) return false; // 상체조차 안 보이는 경우만 제외
  const separated = Math.abs(lw.x - rw.x) > shoulderWidth * cfg.crossSeparation;
  if (!separated) return false;
  const shoulderOrder = Math.sign(ls.x - rs.x) || 1;
  const wristOrder = Math.sign(lw.x - rw.x) || 1;
  return wristOrder !== shoulderOrder;
}

// 특정 제스처를 n초 동안 유지했는지 누적 추적하는 작은 헬퍼
// matchFn(landmarks) => boolean 을 매 프레임 update(dt, landmarks)로 넣어준다
export class GestureHold {
  constructor(matchFn, holdSec) {
    this.matchFn = matchFn;
    this.holdSec = holdSec;
    this.t = 0;
  }
  update(dt, lms) {
    const matched = this.matchFn(lms);
    // 놓쳤을 때 너무 빨리 리셋되면 카메라 인식이 한두 프레임만 흔들려도 처음부터 다시
    // 유지해야 해서 "잘 안 된다"고 느껴짐 — 누적 속도보다 느리게 감소시켜 여유를 둠
    this.t = matched ? this.t + dt : Math.max(0, this.t - dt * 0.6);
    return this.t >= this.holdSec;
  }
  reset() { this.t = 0; }
  get progress() { return Math.min(1, this.t / this.holdSec); }
}

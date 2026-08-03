// MotionDetector — 랜드마크 → 게임 입력(레인/점프/숙이기)
// 모든 임계값은 bodyHeight(코~발목) 비율 기준 → 아이/어른, 카메라 거리 무관
import { CONFIG } from '../config.js';
import { LM } from './poseEngine.js';

export class MotionDetector {
  constructor() {
    this.baseline = null;      // { hipX(거울 좌표), hipY, bodyHeight }
    this.calibrating = false;
    this._calibSamples = [];
    this._calibStart = 0;

    this.lane = 0;             // -1 좌 / 0 중앙 / +1 우
    this.ducking = false;
    this._lastJumpAt = -10;
    this._prevHipY = null;
    this._prevT = null;

    this.onLaneChange = null;  // (lane) => void
    this.onJump = null;
    this.onDuckStart = null;
    this.onDuckEnd = null;
    this.onCalibrated = null;
  }

  get calibrated() { return !!this.baseline; }

  startCalibration() {
    this.calibrating = true;
    this._calibSamples = [];
    this._calibStart = performance.now();
  }

  // PoseEngine.onFrame에서 호출
  update(lms) {
    const now = performance.now() / 1000;
    const hip = mid(lms[LM.L_HIP], lms[LM.R_HIP]);
    const ankle = mid(lms[LM.L_ANKLE], lms[LM.R_ANKLE]);
    const nose = lms[LM.NOSE];
    // STEP 4-0 이전에는 여기서 `1 - hip.x`로 뒤집었다. 이제 엔진이 거울 좌표로
    // 내보내므로 그대로 쓴다. 여기서 또 뒤집으면 레인이 반대로 움직인다.
    const mirroredHipX = hip.x;
    const bodyHeight = Math.abs(ankle.y - nose.y);
    if (bodyHeight < 0.15) return;    // 전신이 안 보임

    // ── 캘리브레이션 ──
    if (this.calibrating) {
      this._calibSamples.push({ hipX: mirroredHipX, hipY: hip.y, bodyHeight });
      if (performance.now() - this._calibStart >= CONFIG.motion.calibrationSec * 1000) {
        const n = this._calibSamples.length;
        const avg = k => this._calibSamples.reduce((s, v) => s + v[k], 0) / n;
        this.baseline = { hipX: avg('hipX'), hipY: avg('hipY'), bodyHeight: avg('bodyHeight') };
        this.calibrating = false;
        this.onCalibrated?.(this.baseline);
      }
      return;
    }
    if (!this.baseline) return;

    const B = this.baseline;
    const M = CONFIG.motion;

    // ── 레인 (히스테리시스) ──
    const dx = (mirroredHipX - B.hipX) / B.bodyHeight;
    let newLane = this.lane;
    if (this.lane !== -1 && dx < -(M.laneThreshold + (this.lane === 0 ? 0 : M.laneHysteresis))) newLane = -1;
    else if (this.lane !== 1 && dx > (M.laneThreshold + (this.lane === 0 ? 0 : M.laneHysteresis))) newLane = 1;
    else if (this.lane !== 0 && Math.abs(dx) < M.laneThreshold - M.laneHysteresis) newLane = 0;
    if (newLane !== this.lane) {
      this.lane = newLane;
      this.onLaneChange?.(newLane);
    }

    // ── 점프 (골반 상승량 + 상승 속도) ──
    const rise = (B.hipY - hip.y) / B.bodyHeight;   // 위로 = +
    let vy = 0;
    if (this._prevHipY !== null && this._prevT !== null && now > this._prevT) {
      vy = (this._prevHipY - hip.y) / B.bodyHeight / (now - this._prevT);
    }
    if (rise > M.jumpRise && vy > M.jumpVelocity && now - this._lastJumpAt > M.jumpCooldown) {
      this._lastJumpAt = now;
      this.onJump?.();
    }

    // ── 숙이기 (골반 하강 유지) ──
    const drop = (hip.y - B.hipY) / B.bodyHeight;
    if (!this.ducking && drop > M.duckDrop) {
      this.ducking = true;
      this.onDuckStart?.();
    } else if (this.ducking && drop < M.duckDrop * 0.6) {
      this.ducking = false;
      this.onDuckEnd?.();
    }

    this._prevHipY = hip.y;
    this._prevT = now;
  }
}

function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

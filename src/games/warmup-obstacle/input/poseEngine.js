// PoseEngine — MediaPipe Pose Landmarker 래퍼 (플레이 제라 게임 팩 공통 모듈)
// 웹캠 열기 → 프레임마다 33개 랜드마크 콜백 → PIP 스켈레톤 렌더
import { CONFIG } from '../config.js';

const MP_VERSION = '0.10.14';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// 랜드마크 인덱스
export const LM = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
};

const SKELETON_EDGES = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],
];

// 캘리브레이션 전 "전신이 화면 안에 다 들어와 있는지" 체크 — 코~발목까지 주요 관절이
// 1) MediaPipe가 보고하는 신뢰도(visibility)가 충분히 높고, 2) 정규화 좌표가 화면 범위(0~1) 안에
// 있어야 "전신이 보인다"고 판정한다. 카메라 준비 화면에서 테두리를 빨강/초록으로 바꾸는 데 사용.
const FULL_BODY_POINTS = [LM.NOSE, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE];
const FULL_BODY_VISIBILITY_MIN = 0.5;
const FULL_BODY_FRAME_MARGIN = 0.02; // 프레임 가장자리 살짝의 여유(오검출 방지)

export function isFullBodyVisible(lms) {
  if (!lms) return false;
  for (const idx of FULL_BODY_POINTS) {
    const p = lms[idx];
    if (!p) return false;
    if (typeof p.visibility === 'number' && p.visibility < FULL_BODY_VISIBILITY_MIN) return false;
    if (p.x < -FULL_BODY_FRAME_MARGIN || p.x > 1 + FULL_BODY_FRAME_MARGIN ||
        p.y < -FULL_BODY_FRAME_MARGIN || p.y > 1 + FULL_BODY_FRAME_MARGIN) return false;
  }
  return true;
}

export class PoseEngine {
  constructor(videoEl, overlayCanvas) {
    this.video = videoEl;
    this.overlay = overlayCanvas;
    this.octx = overlayCanvas ? overlayCanvas.getContext('2d') : null;
    this.landmarker = null;
    this.running = false;
    this.available = false;   // 웹캠+모델 준비 완료 여부
    this.smoothed = null;     // EMA 스무딩된 랜드마크
    this.lastVideoTime = -1;
    this.onFrame = null;      // (landmarks) => void
  }

  async init() {
    // 1) 웹캠 — 16:9로 넓게 잡아야 옆으로 피하기(좌우 이동) 인식 범위가 충분히 확보됨
    //    (4:3은 상하로 좁고 좌우도 상대적으로 좁아 화면 가장자리에서 손실되기 쉬움)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 360 }, aspectRatio: { ideal: 16 / 9 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = stream;
    await new Promise(res => { this.video.onloadedmetadata = res; });
    await this.video.play();

    // 2) MediaPipe 모델 (CDN)
    // @vite-ignore: 번들러가 CDN URL을 상대경로로 재작성하지 않도록 그대로 둔다
    // (없으면 vite:dynamic-import-vars가 ../../../../https:/cdn... 로 망가뜨림)
    const vision = await import(/* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`);
    const fileset = await vision.FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`
    );
    this.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
    this.available = true;
  }

  start() {
    if (!this.available || this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      const t = performance.now();
      if (this.video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.video.currentTime;
        try {
          const result = this.landmarker.detectForVideo(this.video, t);
          const lms = result.landmarks && result.landmarks[0];
          if (lms) {
            this._smooth(lms);
            this.onFrame?.(this.smoothed);
          }
          this._drawSkeleton(lms);
        } catch (e) { /* 프레임 스킵 */ }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }

  _smooth(lms) {
    const a = CONFIG.motion.emaAlpha;
    if (!this.smoothed) {
      this.smoothed = lms.map(p => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }));
      return;
    }
    for (let i = 0; i < lms.length; i++) {
      const s = this.smoothed[i], p = lms[i];
      s.x += a * (p.x - s.x);
      s.y += a * (p.y - s.y);
      s.z += a * (p.z - s.z);
      s.visibility = p.visibility;
    }
  }

  _drawSkeleton(lms) {
    if (!this.octx) return;
    const c = this.overlay, ctx = this.octx;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!lms) return;
    // PIP 영상이 좌우 반전(scaleX(-1))이므로 스켈레톤도 반전해서 그림
    const px = p => (1 - p.x) * c.width;
    const py = p => p.y * c.height;
    ctx.strokeStyle = 'rgba(88, 224, 138, 0.9)';
    ctx.lineWidth = 3;
    for (const [i, j] of SKELETON_EDGES) {
      ctx.beginPath();
      ctx.moveTo(px(lms[i]), py(lms[i]));
      ctx.lineTo(px(lms[j]), py(lms[j]));
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd23e';
    for (const idx of Object.values(LM)) {
      ctx.beginPath();
      ctx.arc(px(lms[idx]), py(lms[idx]), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

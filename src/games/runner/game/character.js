// Character — 스프라이트 상태 머신 (run/jump/slide/stretch), AE 크로스페이드 방식 계승
import { CONFIG } from '../config.js';
import { IMG } from '../assets.js';
import { theme } from '../theme.js';

// 스프라이트 **이름**은 테마가 갖는다. 상태 머신(run/jump/slide/stretch)은 엔진의 것이다.
// 정글 아이와 우주 아이는 그림이 다를 뿐 같은 방식으로 달리고 뛴다.
const C = () => theme().sprites.character;

export class Character {
  constructor() {
    this.lane = 0;            // 목표 레인 (-1/0/1)
    this.renderLane = 0;      // 보간된 레인 위치
    this.state = 'run';       // run | jump | slide | stretch | idle
    this.stretchType = null;
    this.jumpT = 0;           // 점프 경과
    this.animT = 0;
    this.flashT = 0;          // 충돌 피드백
  }

  setLane(l) { this.lane = Math.max(-1, Math.min(1, l)); }

  jump() {
    if (this.state === 'jump') return;
    this.state = 'jump';
    this.jumpT = 0;
  }

  setSlide(on) {
    if (this.state === 'jump') return;
    this.state = on ? 'slide' : 'run';
  }

  setStretch(type) {
    // 점프/숙이기로 실제 장애물을 피하는 중에는 스트레치가 state를 가로채면 안 됨 —
    // 포즈 사인판은 접근 구간이 훨씬 길어서(POSE_ACTIVE_START부터) 아직 안 맞춘 상태인
    // 매 프레임 setStretch(null)이 호출되는데, 이게 무조건 state='run'으로 되돌려버려서
    // 직전 허들을 피하려고 앉아 있는(state='slide') 도중에 앉기가 취소돼버리는 문제가 있었음
    // (특히 허들→포즈 전환 구간이 짧아지는 레벨3 이상에서 자주 발생).
    if (this.state === 'jump' || this.state === 'slide') return;
    this.state = type ? 'stretch' : 'run';
    this.stretchType = type;
  }

  hitFlash() { this.flashT = 0.8; }

  update(dt) {
    this.animT += dt;
    if (this.flashT > 0) this.flashT -= dt;

    // 레인 보간
    const k = Math.min(1, dt * CONFIG.character.laneLerpSpeed);
    this.renderLane += (this.lane - this.renderLane) * k;

    // 점프 진행
    if (this.state === 'jump') {
      this.jumpT += dt;
      if (this.jumpT >= CONFIG.character.jumpDuration) this.state = 'run';
    }
  }

  get jumpOffset() {
    if (this.state !== 'jump') return 0;
    const u = this.jumpT / CONFIG.character.jumpDuration; // 0~1
    return Math.sin(u * Math.PI) * CONFIG.character.jumpHeight;
  }

  currentSprite() {
    switch (this.state) {
      case 'jump':
        return IMG[this.jumpT < 0.18 ? C().jumpPrep : C().jumpAir];
      case 'slide':
        return IMG[C().slide];
      case 'stretch':
        return IMG[C().pose[this.stretchType]] || IMG[C().idle[0]];
      case 'idle':
        return IMG[C().idle[Math.floor(this.animT * 2) % C().idle.length]];
      default: {
        const i = Math.floor(this.animT * CONFIG.character.runFps) % C().run.length;
        return IMG[C().run[i]];
      }
    }
  }

  draw(ctx) {
    const img = this.currentSprite();
    if (!img) return;
    const { charBaseY, laneSpacing } = CONFIG.world;
    let h = CONFIG.character.height;
    if (this.state === 'slide') h *= 0.62;
    const w = h * (img.width / img.height);
    const x = CONFIG.canvas.w / 2 + this.renderLane * laneSpacing;
    const y = charBaseY - this.jumpOffset;

    // 그림자
    ctx.fillStyle = 'rgba(10,0,40,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, charBaseY + 8, w * 0.34, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.flashT > 0 && Math.floor(this.flashT * 12) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.drawImage(img, x - w / 2, y - h, w, h);
    ctx.globalAlpha = 1;
  }
}

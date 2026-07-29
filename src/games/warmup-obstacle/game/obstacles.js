// ObstacleRun — 한 레벨의 장애물 진행/렌더/판정 + 힌트 + 포즈 유지(캡션 방식, 게임은 멈추지 않음)
import { CONFIG } from '../config.js';
import { IMG } from '../assets.js';
import { playSfx, playMissBuzz } from '../audio.js';

const W = CONFIG.canvas.w, H = CONFIG.canvas.h;
const HORIZON = CONFIG.world.horizonY;

const SPRITES = {
  cube: { '-1': 'obs_cube_star_left', '0': 'obs_cube_star_center', '1': 'obs_cube_star_right' },
  hurdleLow: 'obs_hurdle_low',
  hurdleWide: 'obs_hurdle_wide',
  poseSign: { lunge: 'obs_sign_stretch_lunge', forwardbend: 'obs_sign_stretch_forwardbend', armsopen: 'obs_sign_stretch_armsopen' },
  archGate: 'obs_arch_gate',
};
const HINTS = { cube: null, hurdleLow: 'signs_up', hurdleWide: 'signs_down', poseSign: 'signs_pose' };
const LANES = [-1, 0, 1];
const SIZE = { cube: 300, hurdleLow: 170, hurdleWide: 340, poseSign: 360, archGate: 620 };
const POSE_LABELS = { lunge: '런지', forwardbend: '상체 숙이기', armsopen: '팔 벌리기' };
const POSE_KEYS = { lunge: 'A', forwardbend: 'S', armsopen: 'D' };

// 포즈 사인판이 "활성"(유지 시도 대상)으로 취급되는 접근 구간(진행률 u 기준)
const POSE_ACTIVE_START = 0.32;
const POSE_ACTIVE_END = 1.15;

const POPUP_LIFE = 0.9; // Great!/Miss 팝업 표시 시간(초)

export class ObstacleRun {
  constructor(course, stats, character, opts = {}) {
    this.course = course;
    this.stats = stats;
    this.character = character;
    this.time = 0;
    this.done = false;
    this.keyboardMode = !!opts.keyboardMode;

    // 포즈 사인판은 일반 장애물보다 훨씬 오래 접근하게 해서(운동 시간 확보) 화면을 멈추지 않고도 여유를 줌
    this.poseWindow = Math.max(course.approachSec * 1.8, 5.5);
    this.poseScore = 0;           // 외부(모션/키보드)에서 매 프레임 주입
    this.activePoseEvent = null;  // 현재 유지 시도 중인 포즈 이벤트
    this.popups = [];             // 화면에 떠 있는 Great!/Miss 팝업들

    this.onMissionGate = null;    // 결승 아치 통과 콜백
    this.onMiss = null;           // 장애물/포즈 실패 시 콜백(목숨 차감용)
    for (const e of course.events) {
      e.judged = false; e.passed = false; e.hintPlayed = false;
      if (e.type === 'poseSign') e.holdProgress = 0;
    }
  }

  get finished() { return this.done; }
  get activePoseType() { return this.activePoseEvent ? this.activePoseEvent.pose : null; }

  // 활성 포즈에 대한 실시간 유사도 주입 (모션 또는 키보드 폴백)
  setPoseScore(s) { this.poseScore = s; }

  _windowFor(e) { return e.type === 'poseSign' ? this.poseWindow : this.course.approachSec; }
  _uOf(e) { const win = this._windowFor(e); return (this.time - (e.hitTime - win)) / win; }

  update(dt) {
    this.time += dt;

    let candidate = null;
    for (const e of this.course.events) {
      const u = this._uOf(e);

      // 회피 큐브: 화면에 나타나는 순간(스폰 시점) 캐릭터의 실제 현재 레인을 그대로 차단한다.
      // → "이미 피해있는데 엉뚱한 방향으로 이동하라"는 힌트 불일치가 사라지고, 매번 실제로
      //   레인을 옮겨야 하는 진짜 회피 장애물이 된다. 안내 화살표는 남은 두 레인 중 하나로.
      if (e.type === 'cube' && e.lane === null && u >= 0) {
        e.lane = this.character.lane;
        const free = LANES.filter(l => l !== e.lane);
        e.hintLane = free[Math.floor(Math.random() * free.length)];
      }

      // 힌트 등장음
      if (!e.hintPlayed && u >= 0) { e.hintPlayed = true; playSfx('hint_pop', 0.7); }

      if (e.type === 'poseSign') {
        if (!e.judged && u >= POSE_ACTIVE_START && u <= POSE_ACTIVE_END) {
          // course.events는 hitTime 오름차순이므로 먼저 만난(=더 먼저 도착하는) 걸 우선 — 갱신하지 않음
          if (!candidate) candidate = e;
        } else if (!e.judged && u > POSE_ACTIVE_END) {
          this._finishPose(e, false); // 시간 종료 — 페널티 없이 지금까지 유지한 시간만 기록
        }
      } else if (!e.judged && u >= 1) {
        e.judged = true;
        this._judge(e);
      }
      if (!e.passed && u >= 1.18) e.passed = true;
    }

    // 포즈 유지 진행 추적 (게임/트랙은 계속 진행 — 더 이상 멈추지 않음)
    if (candidate) {
      this.activePoseEvent = candidate;
      const matched = this.poseScore >= CONFIG.pose.matchThreshold;
      candidate.holdProgress = matched
        ? candidate.holdProgress + dt
        : Math.max(0, candidate.holdProgress - dt * 0.7);
      // 실제로 자세를 맞추고 있을 때만 캐릭터가 스트레치 포즈를 취한다(버튼/동작 없이
      // 저절로 자세를 취하는 것처럼 보이던 문제 수정). 맞추지 않는 동안은 계속 달리는 모션.
      this.character.setStretch(matched ? candidate.pose : null);
      if (candidate.holdProgress >= CONFIG.pose.holdSec) this._finishPose(candidate, true);
    } else if (this.activePoseEvent) {
      this.activePoseEvent = null;
      this.character.setStretch(null);
    }

    // Great!/Miss 팝업 수명 관리
    if (this.popups.length) {
      for (const p of this.popups) p.t += dt;
      this.popups = this.popups.filter(p => p.t < POPUP_LIFE);
    }

    if (this.time >= this.course.duration) this.done = true;
  }

  // 판정 순간 캐릭터 머리 위에 Great!/Miss 팝업 + 효과음
  _spawnPopup(ok) {
    const ch = this.character;
    this.popups.push({
      ok, t: 0,
      x: W / 2 + ch.renderLane * CONFIG.world.laneSpacing,
      y: CONFIG.world.charBaseY - CONFIG.character.height - 30,
    });
    if (ok) playSfx('dodge'); else playMissBuzz();
  }

  _finishPose(e, success) {
    e.judged = true;
    e.passed = true; // 판정 즉시 화면에서 사라지게(느리게 남아있다 사라지는 문제 수정)
    e.success = success;
    this.stats.recordPoseHold(e.pose, Math.min(e.holdProgress, CONFIG.pose.holdSec), success);
    if (success) this.stats.addStar(3);
    else this.onMiss?.();
    this._spawnPopup(success);
    if (this.activePoseEvent === e) {
      this.activePoseEvent = null;
      this.character.setStretch(null);
    }
  }

  _judge(e) {
    const ch = this.character;
    let ok = true;
    switch (e.type) {
      case 'cube':
        ok = Math.round(ch.renderLane) !== e.lane;
        this.stats.record('cube', ok);
        break;
      case 'hurdleLow':
        ok = ch.state === 'jump' && ch.jumpOffset > CONFIG.character.jumpHeight * 0.35;
        this.stats.record('jumpObstacle', ok);
        break;
      case 'hurdleWide':
        ok = ch.state === 'slide';
        this.stats.record('duckObstacle', ok);
        break;
      case 'archGate':
        this.onMissionGate?.();
        return;
    }
    if (ok) this.stats.addStar(1);
    else { ch.hitFlash(); this.onMiss?.(); }
    this._spawnPopup(ok);
  }

  draw(ctx) {
    // 먼 것부터 그리기 (판정이 끝난(e.passed) 것은 즉시 화면에서 제외 — 특히 포즈 사인판이
    // 통과 후에도 계속 커지며 느리게 남아있던 문제 수정)
    const visible = this.course.events
      .filter(e => { const u = this._uOf(e); return u >= 0 && u < 1.18 && !e.passed; })
      .sort((a, b) => a.hitTime - b.hitTime === 0 ? 0 : b.hitTime - a.hitTime);

    for (const e of visible) {
      const u = Math.max(0, this._uOf(e));
      this._drawObstacle(ctx, e, u);
      if (e.type === 'poseSign' && !e.judged && u >= POSE_ACTIVE_START && u <= POSE_ACTIVE_END) {
        this._drawPoseCaption(ctx, e, u);
      }
    }

    // 힌트: 가장 가까운 미판정 장애물
    const next = this.course.events.find(e => !e.judged && this._uOf(e) >= 0);
    if (next) this._drawHint(ctx, next);
  }

  _drawObstacle(ctx, e, u) {
    const p = Math.pow(Math.min(u, 1.18), 2.2);
    const { charBaseY, laneSpacing, trackHalfWidthNear: hwN, trackHalfWidthFar: hwF } = CONFIG.world;
    const y = HORIZON + (charBaseY - HORIZON) * p;
    const hw = hwF + (hwN - hwF) * p;
    const x = W / 2 + (e.lane || 0) * laneSpacing * (hw / hwN);
    const scale = 0.05 + 0.95 * p;

    let name = SPRITES[e.type];
    if (e.type === 'cube') name = name[String(e.lane)];
    if (e.type === 'poseSign') name = name[e.pose];
    const img = IMG[name];
    if (!img) return;

    const h = SIZE[e.type] * scale;
    const w = h * (img.width / img.height);
    ctx.globalAlpha = u < 0.08 ? u / 0.08 : 1; // 스폰 페이드인

    // 런지 포즈 사인판(obs_sign_stretch_lunge) 이미지만 캐릭터의 실제 런지 동작과 좌우가
    // 반대로 그려져 있어서, 이 사인판만 좌우반전해서 그린다(다른 포즈 사인/장애물은 원본 그대로)
    if (e.type === 'poseSign' && e.pose === 'lunge') {
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, y - h, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, x - w / 2, y - h, w, h);
    }
    ctx.globalAlpha = 1;
  }

  // 포즈 사인판(POSE 배너) 바로 아래에 안내 캡션 + 진행 게이지 표시 — 화면 정지/암전 없음
  _drawPoseCaption(ctx, e, u) {
    const p = Math.pow(Math.min(u, 1.18), 2.2);
    const { charBaseY } = CONFIG.world;
    const signY = HORIZON + (charBaseY - HORIZON) * p;
    const x = W / 2;
    const capY = Math.min(signY + 40, H - 50);

    const label = POSE_LABELS[e.pose];
    const keyHint = this.keyboardMode ? ` (${POSE_KEYS[e.pose]})` : '';
    const text = `${label} 자세를 따라해요${keyHint}`;
    const matched = this.poseScore >= CONFIG.pose.matchThreshold;

    ctx.textAlign = 'center';
    ctx.font = '900 30px Jua, sans-serif';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(20,8,46,.85)';
    ctx.strokeText(text, x, capY);
    ctx.fillStyle = matched ? '#58e08a' : '#ffe27a';
    ctx.fillText(text, x, capY);

    // 진행 게이지(작고 은은하게)
    const gw = 180, gh = 13, gx = x - gw / 2, gy = capY + 14;
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    roundRect(ctx, gx, gy, gw, gh, 7); ctx.fill();
    const frac = Math.min(1, e.holdProgress / CONFIG.pose.holdSec);
    if (frac > 0) {
      ctx.fillStyle = matched ? '#58e08a' : '#ffd23e';
      roundRect(ctx, gx, gy, gw * frac, gh, 7); ctx.fill();
    }
  }

  _drawHint(ctx, e) {
    if (e.type === 'archGate') return;
    let name = HINTS[e.type];
    if (e.type === 'cube') {
      if (e.lane === null || e.hintLane === undefined) return; // 아직 차단 레인 미확정(스폰 전)
      // 캐릭터가 실제로 서 있는(차단당하는) 레인 기준으로, 비어있는 레인 쪽 방향을 안내
      name = e.hintLane > e.lane ? 'signs_right' : 'signs_left';
    }
    const img = IMG[name];
    if (!img) return;
    const h = 130, w = h * (img.width / img.height);
    const pulse = 1 + Math.sin(performance.now() / 180) * 0.05;
    // 상단 중앙 HUD(목숨/카운트)가 훨씬 짧아졌으므로 화면 최상단 가까이, 스카이라인
    // 건물보다 위쪽에 배치 — 참고 이미지처럼 화면 위쪽에 깔끔하게 떠 있는 느낌
    const topY = 105;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(img, W / 2 - (w * pulse) / 2, topY - (h * (pulse - 1)) / 2, w * pulse, h * pulse);
    ctx.globalAlpha = 1;
  }

  // Great!/Miss 팝업 — 캐릭터보다 위(z순서)에 그려지도록 main.js에서 character.draw() 이후 별도 호출
  drawPopups(ctx) {
    for (const p of this.popups) this._drawPopup(ctx, p);
  }

  _drawPopup(ctx, p) {
    const u = Math.min(1, p.t / POPUP_LIFE);
    const rise = 80 * Math.min(1, u * 1.3);
    const y = p.y - rise;
    let scale = 1;
    if (u < 0.18) scale = 0.5 + 0.5 * (u / 0.18);
    else if (u < 0.32) scale = 1 + 0.16 * Math.sin(((u - 0.18) / 0.14) * Math.PI);
    const alpha = u > 0.55 ? Math.max(0, 1 - (u - 0.55) / 0.45) : 1;
    const text = p.ok ? 'Great!' : 'Miss';

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, y);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.font = '900 56px Jua, sans-serif';
    const halfW = ctx.measureText(text).width / 2; // 별을 텍스트 바깥으로 확실히 비켜서 배치하기 위해 실제 폭 측정
    ctx.lineWidth = 9;
    ctx.strokeStyle = p.ok ? 'rgba(15,60,35,.9)' : 'rgba(70,10,10,.9)';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = p.ok ? '#79f0a0' : '#ff8a8a';
    ctx.fillText(text, 0, 0);
    if (p.ok) {
      ctx.font = '900 26px Jua, sans-serif';
      ctx.fillStyle = '#ffe27a';
      ctx.fillText('★', -halfW - 24, -26);
      ctx.fillText('★', halfW + 24, -14);
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// World — 배경(하늘/빌딩/장식) + 원근 트랙 렌더링 (AE 버전 비주얼 재현)
import { CONFIG } from '../config.js';
import { IMG } from '../assets.js';

const W = CONFIG.canvas.w, H = CONFIG.canvas.h;
const HORIZON = CONFIG.world.horizonY;

// 지면 옆으로 흘러가는 오브젝트 — 좌/우 각각 다른 조합으로 순환(다양성 확보, 보유 에셋 총동원)
// 원본 컨셉아트처럼 주변이 꽉 차 보이도록 "안쪽 줄 / 바깥쪽 줄" 두 줄로 배치한다.
// 건물류(타워/로켓/돔)는 원본 컨셉처럼 시원하게 크게, 마스코트·별 장식은 그보다 작게
const SIDE_PROPS_LEFT = [
  { name: 'bg_rocket_pink', h: 520 },
  { name: 'bg_tower_spiral_slide', h: 480 },
  { name: 'bg_mascot_bunny_blue', h: 200 },
  { name: 'bg_star_deco_yellow_small', h: 90 },
  { name: 'bg_tower_teal_slide', h: 500 },
  { name: 'bg_star_mascot_yellow', h: 120 },
  { name: 'bg_tower_cannon_blue', h: 455 },
  { name: 'bg_star_deco_purple', h: 95 },
  { name: 'bg_target_pole_purple', h: 300 },
];
const SIDE_PROPS_RIGHT = [
  { name: 'bg_tower_purple_slide', h: 520 },
  { name: 'bg_target_pole_purple', h: 305 },
  { name: 'bg_mascot_robot_blue', h: 230 },
  { name: 'bg_tower_cannon_blue', h: 465 },
  { name: 'bg_star_deco_purple', h: 95 },
  { name: 'bg_star_deco_yellow_small', h: 85 },
  { name: 'bg_rocket_pink', h: 495 },
  { name: 'bg_star_mascot_yellow', h: 115 },
  { name: 'bg_tower_spiral_slide', h: 475 },
];

// 두 줄 배치 — inner는 트랙에 바짝 붙어 천천히 벌어지고, outer는 더 크게/빠르게 화면 밖으로 빠짐
// (시차(parallax)가 생겨 공간이 층층이 채워져 보인다)
const SIDE_ROWS = [
  { baseOffset: 80,  spread: 900,  scaleMul: 1.0,  travelMul: 1.0 },
  { baseOffset: 300, spread: 1650, scaleMul: 1.45, travelMul: 0.86 },
];

const SIDE_SPAWN_GAP = 0.62;  // 줄 하나당 스폰 간격(초, speed=1 기준) — 두 줄이라 실질 밀도는 2배
const SIDE_TRAVEL_SEC = 3.6;  // 지평선→화면 밖까지 걸리는 시간(초, speed=1 기준)

// 지평선 부근은 원근상 오브젝트가 거의 점처럼 작아져 휑해 보이므로,
// 아주 작은 실루엣들을 고정 배치해 먼 배경을 촘촘하게 메운다.
const HORIZON_FILLERS = [
  { name: 'bg_tower_spiral_slide', x: 250, h: 95 },
  { name: 'bg_rocket_pink', x: 505, h: 104 },
  { name: 'bg_tower_teal_slide', x: 620, h: 82 },
  { name: 'bg_tower_cannon_blue', x: 900, h: 79 },
  { name: 'bg_tower_purple_slide', x: 1090, h: 98 },
  { name: 'bg_target_pole_purple', x: 1205, h: 73 },
  { name: 'bg_tower_cannon_blue', x: 1440, h: 91 },
];

export class World {
  constructor() {
    this.scroll = 0; // 트랙 스크롤 진행(0~1 반복)

    this.leftProps = [];
    this.rightProps = [];
    // 줄마다 타이머를 따로 두고 시작값을 어긋나게 해서 좌우/앞뒤가 규칙적으로 겹치지 않게 함
    this.leftTimers = SIDE_ROWS.map((_, i) => 0.25 + i * (SIDE_SPAWN_GAP / SIDE_ROWS.length));
    this.rightTimers = SIDE_ROWS.map((_, i) => 0.25 + SIDE_SPAWN_GAP / 2 + i * (SIDE_SPAWN_GAP / SIDE_ROWS.length));
    this.leftIdx = 0;
    this.rightIdx = 0;
  }

  update(dt, speed) {
    this.scroll = (this.scroll + dt * 0.55 * speed * CONFIG.world.scrollSpeedBase) % 1;
    this._updateSideProps(dt, speed);
  }

  _updateSideProps(dt, speed) {
    const step = dt * speed;
    for (const p of this.leftProps) p.t += step;
    for (const p of this.rightProps) p.t += step;
    this.leftProps = this.leftProps.filter(p => p.t / (SIDE_TRAVEL_SEC * p.row.travelMul) < 1.25);
    this.rightProps = this.rightProps.filter(p => p.t / (SIDE_TRAVEL_SEC * p.row.travelMul) < 1.25);

    for (let r = 0; r < SIDE_ROWS.length; r++) {
      this.leftTimers[r] -= step;
      if (this.leftTimers[r] <= 0) {
        this.leftTimers[r] += SIDE_SPAWN_GAP;
        const tpl = SIDE_PROPS_LEFT[this.leftIdx % SIDE_PROPS_LEFT.length];
        this.leftIdx++;
        this.leftProps.push({ ...tpl, t: 0, row: SIDE_ROWS[r] });
      }
      this.rightTimers[r] -= step;
      if (this.rightTimers[r] <= 0) {
        this.rightTimers[r] += SIDE_SPAWN_GAP;
        const tpl = SIDE_PROPS_RIGHT[this.rightIdx % SIDE_PROPS_RIGHT.length];
        this.rightIdx++;
        this.rightProps.push({ ...tpl, t: 0, row: SIDE_ROWS[r] });
      }
    }
  }

  draw(ctx) {
    // ── 하늘 ──
    if (IMG.bg_sky) ctx.drawImage(IMG.bg_sky, 0, 0, W, HORIZON + 60);
    else { ctx.fillStyle = '#2a1a6e'; ctx.fillRect(0, 0, W, HORIZON + 60); }

    // ── 지평선 빌딩 스카이라인 ──
    // 원본은 1916x325(가로:세로 = 5.9:1)인데 예전엔 화면 폭(1600)에 강제로 늘려 그려서
    // 세로만 상대적으로 눌린(찌그러진) 형태가 됐다. 원본 비율 그대로 그리되, 그러면 폭이
    // 화면보다 좁아지므로 좌우로 이어붙여(타일링) 화면 밖까지 채운다.
    // 이미지 좌우 끝이 투명 여백이라 살짝 겹쳐 이어야 빈 틈이 생기지 않는다.
    if (IMG.bg_buildings) {
      const img = IMG.bg_buildings;
      const bh = 180;
      const tileW = bh * (img.width / img.height); // 비율 유지
      const step = tileW * 0.96;                   // 투명 여백만큼 겹쳐서 이어붙임
      const y = HORIZON - bh + 30;
      for (let x = -step; x < W + step; x += step) ctx.drawImage(img, x, y, tileW, bh);
    }

    // ── 하늘 장식(먼 배경 — 고정) ──
    drawDeco(ctx, 'bg_planet_orange_striped', 190, 90, 150);
    drawDeco(ctx, 'bg_planet_purple', 1360, 70, 130);
    drawDeco(ctx, 'bg_star_deco_yellow', 620, 60, 55);
    drawDeco(ctx, 'bg_star_outline_pink', 90, 190, 50);
    drawDeco(ctx, 'bg_star_deco_yellow', 1080, 130, 45);
    drawDeco(ctx, 'bg_star_deco_yellow_small', 1520, 220, 34);
    drawDeco(ctx, 'bg_star_outline_pink', 1180, 250, 34);
    drawDeco(ctx, 'bg_star_deco_purple', 330, 260, 30);

    // ── 바닥(보도) — 트랙 바깥 영역. 어둡게 깔아서 밝은 트랙이 도드라지게 함 ──
    const floorGrad = ctx.createLinearGradient(0, HORIZON, 0, H);
    floorGrad.addColorStop(0, '#231a5c');
    floorGrad.addColorStop(0.45, '#2b2070');
    floorGrad.addColorStop(1, '#372a8c');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, HORIZON, W, H - HORIZON);
    this._drawSidewalkBlocks(ctx);

    // ── 지평선 부근 먼 실루엣(휑한 원경 메우기) ──
    this._drawHorizonFillers(ctx);

    // ── 좌우 사이드 오브젝트(달리기 속도에 맞춰 흘러감) ──
    this._drawSideProps(ctx);

    // ── 트랙(원근 사다리꼴) ──
    this._drawTrack(ctx);

    // ── 전체 톤을 살짝 밝게(원본 컨셉아트의 화사한 느낌에 가깝게) ──
    // world.draw() 시점이라 배경/바닥/장식에만 적용되고 캐릭터·장애물에는 영향 없음
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(70, 52, 130, 0.13)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 트랙 바깥 바닥에 보도블럭 느낌의 이음선을 아주 연하게 깐다.
  // 이미지 텍스처는 먼 곳에서 격자가 1px 미만으로 뭉개지며 모아레(어지러운 무늬)가 생겼기 때문에,
  // 선을 직접 그려서 ① 블럭을 크게(줄 수를 적게) ② 먼 구간은 페이드아웃 되도록 직접 통제한다.
  _drawSidewalkBlocks(ctx) {
    const span = H - HORIZON;
    const FADE_IN = 0.10, FADE_FULL = 0.42; // 이보다 멀면 안 그림 → 모아레 구간 자체를 없앰
    const smooth = t => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

    ctx.save();
    ctx.lineCap = 'butt';

    // ① 가로 이음선 — 달리는 속도에 맞춰 흘러온다(블럭이 다가오는 느낌)
    const ROWS = 7; // 적을수록 블럭이 크고 차분해짐
    for (let i = 0; i < ROWS; i++) {
      const u = ((i / ROWS) + this.scroll * 0.6) % 1;
      const p = u * u;
      if (p <= FADE_IN) continue;
      const y = HORIZON + span * p;
      const a = smooth((p - FADE_IN) / (FADE_FULL - FADE_IN));
      ctx.strokeStyle = `rgba(190, 215, 255, ${0.085 * a})`;
      ctx.lineWidth = 1 + 2.2 * p;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // ② 세로 이음선 — 소실점으로 모이는 고정 선(움직이지 않아 깜빡임이 없다)
    const yStart = HORIZON + span * FADE_IN;
    const tStart = FADE_IN;
    ctx.lineWidth = 1.5;
    for (let i = -7; i <= 7; i++) {
      if (i === 0) continue; // 중앙은 트랙이 덮으므로 생략
      const xAt = t => W / 2 + i * (34 + (300 - 34) * t);
      const grad = ctx.createLinearGradient(0, yStart, 0, H);
      grad.addColorStop(0, 'rgba(190, 215, 255, 0)');      // 멀수록 사라지게
      grad.addColorStop(1, 'rgba(190, 215, 255, 0.085)');
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(xAt(tStart), yStart);
      ctx.lineTo(xAt(1), H);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 지평선 바로 위/아래에 아주 작게 깔리는 원경 실루엣 — 살짝 어둡게 깔아 공기원근을 준다
  _drawHorizonFillers(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (const f of HORIZON_FILLERS) {
      const img = IMG[f.name];
      if (!img) continue;
      const w = f.h * (img.width / img.height);
      ctx.drawImage(img, f.x - w / 2, HORIZON + 6 - f.h, w, f.h);
    }
    ctx.restore();
  }

  _drawSideProps(ctx) {
    // 먼 것(t가 작은 것)부터 그려야 가까운 오브젝트가 앞에 온다
    const all = [
      ...this.leftProps.map(p => ({ p, side: -1 })),
      ...this.rightProps.map(p => ({ p, side: 1 })),
    ].sort((a, b) => a.p.t - b.p.t);
    for (const { p, side } of all) this._drawSideProp(ctx, p, side);
  }

  _drawSideProp(ctx, p, side) {
    const img = IMG[p.name];
    if (!img) return;
    const row = p.row || SIDE_ROWS[0];
    const u = p.t / (SIDE_TRAVEL_SEC * row.travelMul);
    const prog = Math.pow(Math.min(u, 1.25), 2.1); // 장애물과 동일한 원근 가속 곡선
    const { charBaseY } = CONFIG.world;
    const y = HORIZON + (charBaseY + 240 - HORIZON) * prog;
    const x = W / 2 + side * (CONFIG.world.trackHalfWidthFar + row.baseOffset + prog * row.spread);
    const scale = (0.08 + prog * 1.15) * row.scaleMul;
    const h = p.h * scale;
    const w = h * (img.width / img.height);

    let alpha = 1;
    if (u < 0.05) alpha = u / 0.05;
    if (u > 1.05) alpha = Math.max(0, 1 - (u - 1.05) / 0.2);
    if (alpha <= 0) return;

    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x - w / 2, y - h, w, h);
    ctx.globalAlpha = 1;
  }

  _drawTrack(ctx) {
    const { trackHalfWidthNear: hwN, trackHalfWidthFar: hwF } = CONFIG.world;
    const cx = W / 2;

    // 골드 엣지 포함 본체
    trap(ctx, cx, hwN + 34, hwF + 3, '#d7a418');
    trap(ctx, cx, hwN + 22, hwF + 2, '#f6c845');
    trap(ctx, cx, hwN, hwF, '#3d2bb8');
    // 트랙 표면 그라데이션
    const g = ctx.createLinearGradient(0, HORIZON, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(120,90,255,0.25)');
    trap(ctx, cx, hwN, hwF, g);

    // 트랙 안쪽 가장자리를 따라 흐르는 네온(청록) 라인 — 광택감
    trapBand(ctx, cx, -(hwN - 6), -(hwN - 16), -(hwF - 0.5), -(hwF - 1.5), 'rgba(94, 234, 255, .55)');
    trapBand(ctx, cx, hwN - 6, hwN - 16, hwF - 0.5, hwF - 1.5, 'rgba(94, 234, 255, .55)');

    // 레인 구분선 2개 (네온 청록 + 안쪽 흰 코어)
    for (const f of [-1 / 3, 1 / 3]) {
      const nearX = cx + hwN * f * 2 * 1.5;
      const farX = cx + hwF * f * 2 * 1.5;
      ctx.strokeStyle = 'rgba(94, 234, 255, 0.45)';
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(farX, HORIZON); ctx.lineTo(nearX, H); ctx.stroke();
      ctx.strokeStyle = 'rgba(235, 250, 255, 0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(farX, HORIZON); ctx.lineTo(nearX, H); ctx.stroke();
    }

    // 진행감: 트랙 중앙을 따라 흘러내리는 전진 화살표(셰브론)
    this._drawChevrons(ctx, hwN, hwF);

    // 골드 레일 위를 함께 흘러가는 별 장식 — 참고 컨셉의 "별 박힌 난간" 느낌
    this._drawRailStars(ctx, hwN, hwF);
  }

  // 전진 화살표(셰브론) — 형광 느낌을 내기 위해 세 겹으로 그린다.
  // ① 넓고 흐린 청록 번짐(글로우) → ② 형광 연두 본체 → ③ 가는 흰 코어
  // shadowBlur를 매 화살표마다 쓰면 무거워서, 굵기가 다른 선을 겹쳐 발광처럼 보이게 함.
  _drawChevrons(ctx, hwN, hwF) {
    const COUNT = 7;
    const LAYERS = [
      { color: 'rgba(0, 255, 200, 0.30)', mul: 3.4, alpha: 0.85 }, // 바깥 번짐
      { color: 'rgba(120, 255, 90, 0.95)', mul: 1.6, alpha: 1 },   // 형광 본체
      { color: 'rgba(240, 255, 235, 0.95)', mul: 0.6, alpha: 1 },  // 흰 코어
    ];
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < COUNT; i++) {
      const u = ((i / COUNT) + this.scroll) % 1;
      const p = u * u; // 원근 가속
      const y = HORIZON + (H - HORIZON) * p;
      const hw = hwF + (hwN - hwF) * p;
      const wing = hw * 0.3;          // 화살표 날개 폭
      const depth = 26 * p + 3;       // 화살표 높이(가까울수록 큼)
      const base = Math.max(2, 9 * p);
      const fade = Math.min(1, p * 2.2);
      for (const L of LAYERS) {
        ctx.globalAlpha = fade * L.alpha;
        ctx.strokeStyle = L.color;
        ctx.lineWidth = Math.max(1, base * L.mul);
        ctx.beginPath();
        ctx.moveTo(W / 2 - wing, y + depth);
        ctx.lineTo(W / 2, y);
        ctx.lineTo(W / 2 + wing, y + depth);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawRailStars(ctx, hwN, hwF) {
    const img = IMG.bg_star_deco_yellow_small;
    if (!img) return;
    const COUNT = 6;
    const ratio = img.width / img.height;
    ctx.save();
    for (let i = 0; i < COUNT; i++) {
      const u = ((i / COUNT) + this.scroll) % 1;
      const p = u * u;
      const y = HORIZON + (H - HORIZON) * p;
      const hw = hwF + (hwN - hwF) * p;
      const h = 8 + 40 * p;
      const w = h * ratio;
      ctx.globalAlpha = Math.min(1, p * 2.5);
      for (const side of [-1, 1]) {
        const x = W / 2 + side * (hw + 14 + 16 * p);
        ctx.drawImage(img, x - w / 2, y - h * 0.75, w, h);
      }
    }
    ctx.restore();
  }

}

function trap(ctx, cx, hwNear, hwFar, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx - hwFar, HORIZON);
  ctx.lineTo(cx + hwFar, HORIZON);
  ctx.lineTo(cx + hwNear, H);
  ctx.lineTo(cx - hwNear, H);
  ctx.closePath();
  ctx.fill();
}

// 임의의 좌우 오프셋을 갖는 원근 띠(사다리꼴) — 트랙 옆 플랫폼/네온 라인용
// 값은 중심(cx)으로부터의 부호 있는 거리(왼쪽이면 음수)를 그대로 넘긴다.
function trapBand(ctx, cx, nearA, nearB, farA, farB, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx + farA, HORIZON);
  ctx.lineTo(cx + farB, HORIZON);
  ctx.lineTo(cx + nearB, H);
  ctx.lineTo(cx + nearA, H);
  ctx.closePath();
  ctx.fill();
}

function drawDeco(ctx, name, x, y, h, bottomAnchor = false) {
  const img = IMG[name];
  if (!img) return;
  const w = h * (img.width / img.height);
  ctx.drawImage(img, x - w / 2, bottomAnchor ? y - h + h * 0.5 : y - h / 2, w, h);
}

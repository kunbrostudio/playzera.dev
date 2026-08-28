// World — 배경(하늘/빌딩/장식) + 원근 트랙 렌더링 (AE 버전 비주얼 재현)
import { CONFIG } from '../config.js';
import { IMG } from '../assets.js';
import { theme } from '../theme.js';

const W = CONFIG.canvas.w, H = CONFIG.canvas.h;
const HORIZON = CONFIG.world.horizonY;

// 지면 옆으로 흘러가는 오브젝트 — 좌/우 각각 다른 조합으로 순환(다양성 확보, 보유 에셋 총동원)
// 원본 컨셉아트처럼 주변이 꽉 차 보이도록 "안쪽 줄 / 바깥쪽 줄" 두 줄로 배치한다.
// 건물류(타워/로켓/돔)는 원본 컨셉처럼 시원하게 크게, 마스코트·별 장식은 그보다 작게
//
// ── 받침(disc)은 받침이 아니었다 ─────────────────────────────
//
// 원형 플랫폼 4종을 건물 아래 깔아 받침으로 쓰려 했는데, 열어 보니 그림 자체에
// 별·돔·미끄럼틀이 이미 올라가 있는 **완성된 오브젝트**였다. 그 위에 건물을 얹으면
// 물건이 겹친다. 그래서 받침이 아니라 **바닥에 놓인 낮은 프롭**으로 쓴다 —
// 컨셉아트에서도 이 플랫폼들은 건물 밑이 아니라 바닥 여기저기에 흩어져 있다.
//
// ── tier — 크기의 계급 ──────────────────────────────────────
//
// 전부 비슷한 중간 크기로 지나가면 밀도가 있어도 심심하다. 컨셉아트는 근경 오브젝트가
// **화면 밖으로 잘려나갈 만큼** 크고 그 사이를 작은 것들이 메운다. 그 대비가 리듬이다.
// hero를 1.5까지 키웠더니 근경이 화면의 3분의 1을 먹고 트랙을 눌렀다. 대비는 필요하지만
// **주인공은 트랙 위의 아이다** — 배경이 그보다 커지면 안 된다.
// ── 무엇이 테마이고 무엇이 엔진인가 ─────────────────────────
//
//   테마   무엇이 놓이나(프롭 목록) · 무슨 색인가(팔레트) · 어떤 그림인가
//   엔진   어디에 놓이나(원근·줄 배치·밀도) · 어떻게 움직이나
//
// 아래 주석들은 **엔진 쪽 판단 근거**다. 값을 테마로 옮겨도 이유는 여기 남는다 —
// 새 테마를 만드는 사람이 왜 이런 모양인지 알아야 값을 고를 수 있다.

// 크기의 계급. 전부 비슷한 중간 크기로 지나가면 밀도가 있어도 심심하다.
// 컨셉아트는 근경이 화면 밖으로 잘려나갈 만큼 크고 그 사이를 작은 것들이 메운다.
// hero를 1.5까지 키웠더니 근경이 화면의 3분의 1을 먹고 트랙을 눌렀다 —
// **주인공은 트랙 위의 아이다.** 배경이 그보다 커지면 안 된다.
const TIER = { hero: 1.18, mid: 1.0, small: 0.82 };

// 두 줄 배치 — inner는 트랙 가까이서 천천히 벌어지고, outer는 크게/빠르게 화면 밖으로.
// 시차(parallax)가 생겨 공간이 층층이 채워져 보인다.
//
// ── 이 네 값이 서로를 잡아당긴다 ────────────────────────────
//
// `spread`가 크면 오브젝트가 화면 아래에 닿기 전에 옆으로 빠져나가 하단이 빈다.
// 작으면 **트랙에 달라붙어 시선을 뺏고, 옆으로 벗어나지 못해 속도가 죽는다.**
// 1650 → 700까지 줄였더니 정확히 그 증상이 났다(가까이서 느려지고 뒤 건물과 겹친다).
//
// `baseOffset`은 트랙에서 얼마나 떨어져 시작하나다. 작으면 배경이 주인공을 가린다.
//
// 지금 값은 "하단이 비지 않으면서 트랙을 침범하지 않는" 자리다. 한쪽만 만지면
// 반대쪽 증상이 돌아온다.
// 줄이 둘일 때는 능선과 트랙 사이의 초록 벌판이 휑하게 비었다. 가운데 줄을 하나 더
// 넣어 **거리의 층이 셋**이 되게 한다 — 먼 것 · 중간 것 · 화면 밖으로 나가는 큰 것.
// 밀도는 간격(gap)이 아니라 줄 수로 올린다. 간격을 좁히면 같은 줄 안에서 앞뒤가 겹친다.
const SIDE_ROWS = [
  { baseOffset: 190, spread: 1020, scaleMul: 1.0,  travelMul: 1.0 },
  { baseOffset: 300, spread: 1340, scaleMul: 1.16, travelMul: 0.94 },
  { baseOffset: 430, spread: 1680, scaleMul: 1.35, travelMul: 0.88 },
];

// 오브젝트를 트랙에서 떼어 놓고 수명을 줄이자 좌우가 휑해졌다. 밀도는 간격으로 되돌린다 —
// **자리(spread)와 밀도(gap)는 따로 다뤄야 한다.** 한 값으로 둘 다 맞추려 하면 계속 어긋난다.
// 트랙·연석을 **화면 아래(p=1)까지만** 그리면 근경 모서리에 노치가 생긴다.
//
// 연석 윗면은 `yAt(p) - lift(p)`에 있어서, p=1에서 화면 바닥보다 lift(44px)만큼
// 위에서 끝난다. 그 아래 삼각형에는 아무것도 없어 **바닥 초록이 쐐기처럼 비쳤다** —
// 우주·정글·쥬라기 세 게임에 다 있던 증상이다.
//
// y와 반폭이 둘 다 p에 선형이라 p를 1보다 크게 잡아도 **모양은 그대로**다.
// 같은 직선이 화면 밖까지 이어질 뿐이라 잘려서 안 보인다.
const P_OVER = 1.3;

const SIDE_SPAWN_GAP = 0.40;

/**
 * 흩뜨림 — **줄은 자리의 기준이지 자리 그 자체가 아니다.**
 *
 * 줄마다 `baseOffset`·`spread`가 고정이라 같은 줄의 물건들이 **정확히 같은 궤적**을
 * 따라 흘렀다. 그래서 화면에는 나무가 한 줄로 늘어선 가로수길처럼 보였다 —
 * 자연스러운 숲은 그렇게 서 있지 않다.
 *
 * 물건마다 세 가지를 조금씩 어긋낸다.
 *   off    줄에서 옆으로. **바깥쪽으로만 크게 흔든다** — 안쪽으로 밀면 트랙을 침범한다
 *   spread 벌어지는 속도. 같은 줄이어도 어떤 건 빨리, 어떤 건 천천히 화면 밖으로
 *   depth  앞뒤. 좌우가 나란히 지나가는 짝을 깬다
 *
 * 스폰 간격에도 흔들림을 준다. 일정하면 물건은 흩어져도 **박자가 규칙적**이라
 * 여전히 기계적으로 보인다.
 */
const jitter = () => ({
  jOff: -50 + Math.random() * 210,
  jSpread: 0.86 + Math.random() * 0.3,
  jDepth: 0.88 + Math.random() * 0.24,
});  // 줄 하나당 스폰 간격(초, speed=1 기준) — 두 줄이라 실질 밀도는 2배
const SIDE_TRAVEL_SEC = 3.6;  // 지평선→화면 밖까지 걸리는 시간(초, speed=1 기준)

// 연석의 **치수**는 엔진이 갖는다(원근 계산의 일부다). 색만 테마에서 온다.
//
// **얇게 만들면 없느니만 못하다.** 처음엔 폭 78·높이 27로 뒀는데 원근에 눌려
// 트랙 옆의 색이 조금 다른 띠로만 보였다. 컨셉아트의 연석은 아이 무릎 높이의
// 두툼한 벽돌이라, 폭과 높이를 그만큼 키워야 "물건"으로 읽힌다.
const CURB = {
  gapFar: 2,    gapNear: 26,    // 트랙 가장자리 바깥에서 시작
  widthFar: 3,  widthNear: 72,  // 넓히면 트랙이 넓어진 것처럼 보인다
  liftFar: 2,   liftNear: 44,   // 높이 — 윗면과 안쪽면을 가르는 값
};

// ── 테마 접근자 ─────────────────────────────────────────────
//
// **트랙 밖은 "여백"이 아니라 바닥이다.** 예전에는 어둡게 깔아 밝은 트랙을 띄우려
// 했는데, 좌우 오브젝트가 설 자리를 잃어 어둠 속에 뜬 스티커처럼 보였다.
// 도드라짐은 명도가 아니라 **색상 대비**에서 나와야 한다 — 우주는 청색 바닥에
// 보라 트랙, 정글은 초록 바닥에 황토 트랙. 그래서 바닥과 트랙 색이 테마다.
const T = () => theme().world;
const P = () => theme().world.palette;

const lerp = (a, b, p) => a + (b - a) * p;

/**
 * 테마 색 + 알파 → `rgba(...)`.
 *
 * 테마 팔레트는 `[r, g, b]` 배열로 적는다. 알파가 붙는 색을 문자열로 두면 테마마다
 * `rgba(126,168,240,0.46)` 같은 것을 알파 값 개수만큼 적어야 하고, 하나만 고쳐도
 * 나머지와 어긋난다. 색은 한 번, 알파는 코드가 정한다.
 */
const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

// 지평선 부근은 원근상 오브젝트가 거의 점처럼 작아져 휑해 보이므로, 아주 작은
// 실루엣들을 고정 배치해 먼 배경을 메운다 → 테마의 `world.horizonFillers`.

/**
 * 셔플백 — 목록을 섞어 한 바퀴 다 쓰고 다시 섞는다.
 *
 * 예전에는 인덱스를 하나씩 올렸다(`idx % length`). 목록 길이가 좌우 같고 스폰 주기도
 * 같아서 **같은 물건이 좌우에 나란히 서는 그림**이 규칙적으로 반복됐다 — 실제로
 * 파란 대포가 양쪽에 동시에 나왔다. 매번 무작위로 뽑으면 이번엔 같은 게 연달아 나온다.
 * 섞어서 한 바퀴씩 쓰면 둘 다 피하면서 골고루 나온다.
 *
 * `avoid`는 **반대편이 최근에 내보낸 이름들**이다. 하나만 비교하면 좌우에 같은 로켓이
 * 나란히 서는 그림이 그대로 나온다 — 스폰 시각이 조금만 어긋나면 비교를 빠져나간다.
 */
class Bag {
  constructor(items) { this.items = items; this.queue = []; this.recent = []; }
  _refill() {
    this.queue = [...this.items];
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }
  next(avoid) {
    if (!this.queue.length) this._refill();
    // 앞 것과 같으면 자리를 바꾼다. **한 바퀴가 끝나는 경계가 특히 위험하다** —
    // 통 마지막이 대포였는데 새 통 첫 장도 대포면 화면에 대포가 둘 겹쳐 선다.
    // 실제로 그 그림이 나왔다.
    //
    // 최근 몇 개를 함께 피하는 이유: 통 한 바퀴 도는 시간과 오브젝트가 지나가는 시간이
    // 비슷해서, 경계에서 뽑히면 **같은 물건이 한 화면에 둘** 보인다.
    const other = avoid ?? [];
    const bad = n => other.includes(n) || this.recent.includes(n);
    if (this.queue.length > 1 && bad(this.queue[0].name)) {
      const k = this.queue.findIndex(it => !bad(it.name));
      if (k > 0) [this.queue[0], this.queue[k]] = [this.queue[k], this.queue[0]];
    }
    const picked = this.queue.shift();
    this.recent.push(picked.name);
    if (this.recent.length > 4) this.recent.shift();
    return picked;
  }
}

export class World {
  constructor() {
    this.scroll = 0; // 트랙 스크롤 진행(0~1 반복)

    this.leftProps = [];
    this.rightProps = [];
    // 줄마다 타이머를 따로 두고 시작값을 어긋나게 해서 좌우/앞뒤가 규칙적으로 겹치지 않게 함
    this.leftTimers = SIDE_ROWS.map((_, i) => 0.25 + i * (SIDE_SPAWN_GAP / SIDE_ROWS.length));
    this.rightTimers = SIDE_ROWS.map((_, i) => 0.25 + SIDE_SPAWN_GAP / 2 + i * (SIDE_SPAWN_GAP / SIDE_ROWS.length));
    this.leftBag = new Bag(T().props.left);
    this.rightBag = new Bag(T().props.right);
  }

  update(dt, speed) {
    this.scroll = (this.scroll + dt * 0.55 * speed * CONFIG.world.scrollSpeedBase) % 1;
    this._updateSideProps(dt, speed);
  }

  _updateSideProps(dt, speed) {
    const step = dt * speed;
    for (const p of this.leftProps) p.t += step;
    for (const p of this.rightProps) p.t += step;
    this.leftProps = this.leftProps.filter(p => p.t / (SIDE_TRAVEL_SEC * p.row.travelMul) < 1.15);
    this.rightProps = this.rightProps.filter(p => p.t / (SIDE_TRAVEL_SEC * p.row.travelMul) < 1.15);

    for (let r = 0; r < SIDE_ROWS.length; r++) {
      this.leftTimers[r] -= step;
      if (this.leftTimers[r] <= 0) {
        this.leftTimers[r] += SIDE_SPAWN_GAP * (0.72 + Math.random() * 0.56);
        const tpl = this.leftBag.next(this.rightBag.recent);
        this.leftProps.push({ ...tpl, t: 0, row: SIDE_ROWS[r], ...jitter() });
      }
      this.rightTimers[r] -= step;
      if (this.rightTimers[r] <= 0) {
        this.rightTimers[r] += SIDE_SPAWN_GAP * (0.72 + Math.random() * 0.56);
        const tpl = this.rightBag.next(this.leftBag.recent);
        this.rightProps.push({ ...tpl, t: 0, row: SIDE_ROWS[r], ...jitter() });
      }
    }
  }

  draw(ctx) {
    // ── 하늘 ──
    // 하늘은 **덮기(cover)로 넣는다.** 상자에 맞춰 늘이면 구름이 옆으로 찌그러진다 —
    // 비율을 지킨 채 상자를 다 덮을 만큼 키우고 넘치는 만큼은 잘라 낸다.
    // 아래로 넘친 부분은 어차피 능선과 바닥이 덮으므로 손해가 없다.
    const skyH = HORIZON + 60;
    const sky = IMG[T().sky];
    if (sky) {
      const k = Math.max(W / sky.width, skyH / sky.height);
      const w = sky.width * k, h = sky.height * k;
      ctx.drawImage(sky, (W - w) / 2, 0, w, h);
    } else {
      ctx.fillStyle = P().skyFallback; ctx.fillRect(0, 0, W, skyH);
    }

    // ── 지평선 빌딩 스카이라인 ──
    // 원본은 1916x325(가로:세로 = 5.9:1)인데 예전엔 화면 폭(1600)에 강제로 늘려 그려서
    // 세로만 상대적으로 눌린(찌그러진) 형태가 됐다. 원본 비율 그대로 그리되, 그러면 폭이
    // 화면보다 좁아지므로 좌우로 이어붙여(타일링) 화면 밖까지 채운다.
    // 이미지 좌우 끝이 투명 여백이라 살짝 겹쳐 이어야 빈 틈이 생기지 않는다.
    // ── 능선보다 뒤에 있어야 하는 하늘 장식 (화산 등) ──
    for (const d of T().skyDeco) if (d.behind) drawDeco(ctx, d.name, d.x, d.y, d.h);

    // ── 지평선 능선 ──
    //
    // **모드가 둘이다.**
    //   tile    좌우로 이어 붙인다. 우주의 빌딩 스카이라인처럼 어디를 잘라도 같은 그림
    //   center  화면 폭에 맞춰 **한 번만** 그린다
    //
    // 정글·쥬라기 능선은 **가운데에 게이트라는 랜드마크가 있다.** 타일링하면 게이트가
    // 서너 개로 늘어나고 어느 것도 트랙 소실점에 안 맞는다 — 실제로 그 화면이 나왔다.
    // 랜드마크가 있는 그림은 트랙 중앙에 딱 한 번 놓아야 "저기로 달려간다"가 된다.
    if (IMG[T().skyline]) {
      const img = IMG[T().skyline];
      const ratio = img.width / img.height;
      if (T().skylineMode === 'center') {
        // 높이는 테마가 정한다. **화면 폭에 억지로 맞추면 안 된다** —
        // 폭을 1600에 맞추면 높이가 500을 넘어 화면 위쪽을 다 덮고,
        // 그 뒤에 있어야 할 화산이 통째로 가려진다(실제로 그 화면이 나왔다).
        //
        // 그리고 **한 장만 놓으면 좌우 끝이 잘린 벽으로 보인다.** 중앙에 한 장을
        // 놓되 거기서 좌우로 같은 그림을 이어붙인다 — 게이트는 정중앙 하나뿐이고
        // 양옆은 벽이 계속되는 그림이 된다.
        const h = T().skylineH ?? 280;
        const w = h * ratio;
        const x0 = (W - w) / 2;                 // 게이트가 트랙 소실점에 오는 자리
        const y = HORIZON + 24 - h;
        const step = w * 0.99;                  // 투명 여백만큼 겹쳐서 이어붙임
        for (let x = x0; x < W; x += step) ctx.drawImage(img, x, y, w, h);
        for (let x = x0 - step; x + w > 0; x -= step) ctx.drawImage(img, x, y, w, h);
      } else {
        const bh = 180;
        const tileW = bh * ratio;
        const step = tileW * 0.96;      // 투명 여백만큼 겹쳐서 이어붙임
        const y = HORIZON - bh + 30;
        for (let x = -step; x < W + step; x += step) ctx.drawImage(img, x, y, tileW, bh);
      }
    }

    // ── 능선 앞의 하늘 장식 (구름·익룡) ──
    for (const d of T().skyDeco) if (!d.behind) drawDeco(ctx, d.name, d.x, d.y, d.h);

    // ── 바닥 — 트랙 바깥 영역 ──
    // 트랙과 **색상**으로 갈려야 한다(명도가 아니라).
    const floorGrad = ctx.createLinearGradient(0, HORIZON, 0, H);
    floorGrad.addColorStop(0, P().floorFar);
    floorGrad.addColorStop(0.45, P().floorMid);
    floorGrad.addColorStop(1, P().floorNear);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, HORIZON, W, H - HORIZON);
    this._drawFloorGloss(ctx);
    // 바닥 이음선은 모든 테마가 쓴다 — **지나가는 느낌**의 절반이 여기서 온다.
    this._drawSidewalkBlocks(ctx);
    if (T().floorStyle === 'grass') this._drawGrass(ctx);

    // ── 지평선 부근 먼 실루엣(휑한 원경 메우기) ──
    this._drawHorizonFillers(ctx);

    // ── 좌우 사이드 오브젝트(달리기 속도에 맞춰 흘러감) ──
    this._drawSideProps(ctx);

    // ── 트랙(원근 사다리꼴) ──
    this._drawTrack(ctx);

    // ── 연석 — 트랙 다음이다.
    // 화면에서 카메라와 가장 가까운 물건이라 트랙의 골드 엣지를 덮어야 맞다.
    this._drawCurbs(ctx);

    // ── 깊이 안개 — 배경을 다 그린 뒤 한 번. 먼 것이 옅어지되 투명해지지는 않는다 ──
    this._drawDepthFog(ctx);

    // ── 전체 톤을 살짝 밝게(원본 컨셉아트의 화사한 느낌에 가깝게) ──
    // world.draw() 시점이라 배경/바닥/장식에만 적용되고 캐릭터·장애물에는 영향 없음
    // 바닥이 밝아진 뒤로는 0.13이 과했다 — 전체가 뿌옇게 떴다.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = P().toneLift;
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
      // 바닥이 밝아졌으므로 이음선은 **밝은 선이 아니라 어두운 줄눈**이다.
      // 밝은 선을 유지하면 광택 띠와 섞여 뿌옇게만 보인다.
      ctx.strokeStyle = rgba(P().floorSeam, 0.20 * a);
      ctx.lineWidth = 1 + 2.2 * p;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // ② 세로 이음선 — 소실점으로 모이는 고정 선(움직이지 않아 깜빡임이 없다)
    const yStart = HORIZON + span * FADE_IN;
    const tStart = FADE_IN;
    // 세로선을 촘촘히 두면 잔디가 **타일 바닥**처럼 보인다. 개수를 줄여
    // "멀리 뻗은 결" 정도로만 남긴다 (컨셉아트의 잔디는 균일하고 부드럽다).
    ctx.lineWidth = 1.5;
    for (let i = -7; i <= 7; i += 2) {
      if (i === 0) continue; // 중앙은 트랙이 덮으므로 생략
      const xAt = t => W / 2 + i * (34 + (300 - 34) * t);
      const grad = ctx.createLinearGradient(0, yStart, 0, H);
      grad.addColorStop(0, rgba(P().floorSeam, 0));        // 멀수록 사라지게
      grad.addColorStop(1, rgba(P().floorSeam, 0.20));
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(xAt(tStart), yStart);
      ctx.lineTo(xAt(1), H);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 풀 포기 — **소실점에서 뻗어 나오는 선을 타고 흐른다.**
   *
   * ── 왜 한 번 걷어냈다가 되살렸나 ────────────────────────────
   *
   * 처음엔 줄마다 x를 고정해 두고 y만 내렸다. 그러니 화면에서는 풀이 옆으로
   * 퍼지지 않고 **위에서 아래로 수직 낙하**했다 — 달리는 게 아니라 비가 오는 것 같았다.
   *
   * 실제로 달리면 발밑의 풀은 소실점에서 나와 **바깥으로 벌어지며** 지나간다.
   * 그래서 포기마다 중심에서의 비율 `n`을 고정하고, x를 깊이에 따라 벌린다 —
   * 세로 이음선(`_drawSidewalkBlocks` ②)이 그리는 것과 **같은 부챗살**이다.
   * 둘이 같은 선을 타야 바닥이 한 덩어리로 흐른다.
   *
   * ⚠️ 먼 구간은 그리지 않는다(`FADE_IN`). 획 간격이 1px 밑으로 내려가면 모아레가
   * 되는 것을 보도블럭·연석·트랙에서 세 번 겪었다.
   */
  _drawGrass(ctx) {
    const span = H - HORIZON;
    const FADE_IN = 0.05, FADE_FULL = 0.30;
    const smooth = t => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
    // 부챗살 — 세로 이음선과 같은 식. 소실점 근처는 촘촘하고 앞은 넓게 벌어진다.
    const xAt = (n, t) => W / 2 + n * (30 + (300 - 30) * t);

    ctx.save();
    ctx.lineCap = 'round';
    const ROWS = 14, FAN = 13;   // FAN: 중심에서 좌우로 몇 갈래
    for (let i = 0; i < ROWS; i++) {
      const u = ((i / ROWS) + this.scroll * 0.6) % 1;
      const t = u * u;                       // 셰브론·이음선과 같은 원근 가속
      if (t <= FADE_IN) continue;
      const y = HORIZON + span * t;
      const a = smooth((t - FADE_IN) / (FADE_FULL - FADE_IN));
      const len = 3 + 22 * t;
      ctx.lineWidth = Math.max(1, 2.6 * t);
      for (let k = -FAN; k <= FAN; k++) {
        if (k === 0) continue;
        // 줄마다 반 칸씩 어긋내 격자로 보이지 않게 한다
        const n = k + ((i % 2) ? 0.5 : 0) * Math.sign(k);
        const x = xAt(n, t);
        if (x < -40 || x > W + 40) continue;
        if (Math.abs(x - W / 2) < hwAt(t) + 26) continue;   // 트랙 위엔 풀이 없다
        const tilt = (((i * 7 + k * 13) % 9) - 4) * 0.08 * len;
        ctx.strokeStyle = rgba((k + i) % 3 ? P().grassDark : P().grassLight, 0.42 * a);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + tilt, y - len);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 바닥 광택 — 컨셉아트 바닥은 젖은 것처럼 반들거린다.
  //
  // 소실점으로 모이는 넓은 빛줄기 몇 개로 낸다. **선이 아니라 띠다** —
  // 가는 선을 여러 개 그으면 먼 구간에서 1px 미만으로 뭉개져 모아레가 생긴다.
  // (예전에 보도블럭 텍스처로 겪었다. 아래 `_drawSidewalkBlocks` 주석 참고)
  // 띠는 폭이 넓고 지평선 쪽에서 알파가 0으로 죽어서 그 구간 자체가 생기지 않는다.
  _drawFloorGloss(ctx) {
    const cx = W / 2;

    // ① 지평선 안개 — 바닥 윗변을 하늘빛으로 풀어 스카이라인과 이어 붙인다.
    //    이게 없으면 지평선에 자로 그은 듯한 경계선이 남는다.
    // **연하게.** 0.42로 뒀더니 지평선 아래 넓은 띠가 통째로 하얗게 떠서
    // 바닥이 안개에 잠긴 것처럼 보였다. 경계만 지우면 되는 일이다.
    // 잔디 바닥에서는 이 하얀 헤이즈가 **위쪽을 허옇게 띄운다.** 멀수록 어두워야
    // 깊이가 생기는데 반대로 갔다. 경계는 바닥 색 자체를 어둡게 해서 지운다.
    const haze = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 70);
    haze.addColorStop(0, rgba(P().fog, T().floorStyle === 'grass' ? 0 : 0.30));
    haze.addColorStop(1, rgba(P().fog, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, HORIZON, W, 70);

    // ② 반사 빛줄기 — 화면 아래에서 넓고, 소실점으로 가면서 좁아지며 사라진다
    // 진하면 광택이 아니라 **줄무늬**가 된다. 바닥은 배경이지 무늬가 아니다.
    //
    // **잔디에는 광택이 없다.** 이 빛줄기는 우주의 젖은 바닥용인데, 초록 바닥에
    // 그대로 얹으니 잔디가 통째로 밝게 떠서 아무리 팔레트를 어둡게 해도 색이 안 잡혔다.
    if (T().floorStyle === 'grass') return;
    const STREAKS = [
      { at: 300, w: 90, a: 0.12 },
      { at: 470, w: 150, a: 0.09 },
      { at: 700, w: 120, a: 0.11 },
      { at: 930, w: 210, a: 0.07 },
      { at: 1180, w: 160, a: 0.10 },
    ];
    for (const s of STREAKS) {
      for (const side of [-1, 1]) {
        const mid = p => cx + side * lerp(s.at * 0.05, s.at, p);
        const half = p => lerp(s.w * 0.05, s.w, p) / 2;
        const g = ctx.createLinearGradient(0, HORIZON, 0, H);
        g.addColorStop(0, rgba(P().floorGloss, 0));
        g.addColorStop(0.55, rgba(P().floorGloss, s.a * 0.45));
        g.addColorStop(1, rgba(P().floorGloss, s.a));
        ribbon(ctx, p => [mid(p) - half(p), yAt(p)], p => [mid(p) + half(p), yAt(p)], g);
      }
    }
  }

  // 연석 — 트랙 양옆에 세워진 벽돌 난간.
  //
  // 면이 둘이다. 카메라가 트랙 한가운데 위에 있으므로 **윗면**과 **안쪽 세로면**이 보인다
  // (바깥 세로면은 연석 자신에 가려 안 보인다).
  //
  // 원근에서 "높이"는 화면 y를 위로 끌어올리는 것으로 표현된다. 같은 깊이라면 가로 위치가
  // 달라도 화면 y가 같으므로, 윗면은 지평선→화면아래로 이어지는 **사다리꼴 띠**가 되고
  // 세로면은 그 띠와 지면선 사이의 **좁은 리본**이 된다.
  _drawCurbs(ctx) {
    const cx = W / 2;

    for (const side of [-1, 1]) {
      const innerX = p => cx + side * (hwAt(p) + lerp(CURB.gapFar, CURB.gapNear, p));
      const outerX = p => cx + side * (hwAt(p) + lerp(CURB.gapFar, CURB.gapNear, p)
                                              + lerp(CURB.widthFar, CURB.widthNear, p));
      const lift = p => lerp(CURB.liftFar, CURB.liftNear, p);

      // 안쪽 세로면(그늘) — 윗면보다 먼저 그려 아래에 깔린다
      ribbon(ctx, p => [innerX(p), yAt(p) - lift(p)], p => [innerX(p), yAt(p)], P().curbFace);

      // 윗면 — 가까울수록 밝게(빛을 더 받는 느낌)
      const topGrad = ctx.createLinearGradient(0, HORIZON, 0, H);
      topGrad.addColorStop(0, P().curbTopFar);
      topGrad.addColorStop(1, P().curbTop);
      ribbon(ctx, p => [innerX(p), yAt(p) - lift(p)], p => [outerX(p), yAt(p) - lift(p)], topGrad);

      // 윗면 안쪽 모서리 — 골드 하이라이트. 트랙의 골드 엣지와 이어져 한 줄로 읽힌다.
      ctx.strokeStyle = P().curbRim;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(innerX(0), yAt(0) - lift(0));
      ctx.lineTo(innerX(P_OVER), yAt(P_OVER) - lift(P_OVER));
      ctx.stroke();

      this._drawCurbSeams(ctx, innerX, outerX, lift);
      this._drawCurbTrim(ctx, side, innerX, outerX, lift);
    }
  }

  /**
   * 연석의 벽돌 이음매.
   *
   * 민무늬 띠로 두면 색만 다른 판으로 보인다. 컨셉아트의 연석은 **블록이 이어진
   * 물건**이고, 그 이음매가 지나가는 것이 속도감의 절반이다(셰브론이 나머지 절반).
   *
   * 먼 구간은 그리지 않는다 — 간격이 1px 밑으로 내려가면 모아레가 된다.
   * 바닥 이음선에서 이미 겪은 그것이라 같은 규율을 쓴다.
   */
  _drawCurbSeams(ctx, innerX, outerX, lift) {
    const COUNT = 14;
    ctx.save();
    ctx.lineCap = 'butt';
    for (let i = 0; i < COUNT; i++) {
      const u = ((i / COUNT) + this.scroll) % 1;
      const p = u * u;
      if (p < 0.12) continue;                 // 모아레 구간은 아예 건너뛴다
      const fade = Math.min(1, (p - 0.12) / 0.2);
      const y = yAt(p) - lift(p);
      ctx.strokeStyle = rgba(P().floorSeam, 0.30 * fade);
      ctx.lineWidth = Math.max(1, 3 * p);
      ctx.beginPath();
      ctx.moveTo(innerX(p), y);
      ctx.lineTo(outerX(p), y);
      // 안쪽 세로면에도 같은 이음매를 내려 그어야 블록이 두께를 갖는다
      ctx.lineTo(innerX(p), yAt(p));
      ctx.stroke();
    }
    ctx.restore();
  }

  // 연석 윗면에 얹히는 장식 — 별과 청록 등이 번갈아 흘러온다.
  // 컨셉아트의 "별 박힌 난간"이 여기서 나온다.
  _drawCurbTrim(ctx, side, innerX, outerX, lift) {
    const star = IMG[T().curbStar];
    const COUNT = 9;

    ctx.save();
    for (let i = 0; i < COUNT; i++) {
      // 셰브론과 같은 원근 가속 곡선을 써서 트랙과 같은 속도로 흘러가 보이게 한다
      const u = ((i / COUNT) + this.scroll) % 1;
      const p = u * u;
      const x = (innerX(p) + outerX(p)) / 2;
      const y = yAt(p) - lift(p);
      const fade = Math.min(1, p * 2.6);
      if (fade <= 0.02) continue;
      ctx.globalAlpha = fade;

      if (i % 2 === 0 && star) {
        const h = 8 + 54 * p;
        const w = h * (star.width / star.height);
        ctx.drawImage(star, x - w / 2, y - h * 0.72, w, h);
      } else {
        // 청록 반구 등 — 이미지 없이 원호 하나로 낸다
        const r = Math.max(1.2, 4 + 16 * p);
        ctx.fillStyle = rgba(P().curbLamp, 0.85);
        ctx.beginPath();
        ctx.arc(x, y - r * 0.35, r, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.beginPath();
        ctx.arc(x - r * 0.25, y - r * 0.55, r * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * 깊이 안개 — **화면 전체에 한 번** 씌운다.
   *
   * 오브젝트마다 알파를 낮추는 방식은 안개가 아니라 투명이라, 뒤의 스카이라인이
   * 건물 너머로 비쳐 유령처럼 보였다. 실제로 그 화면이 나왔다.
   *
   * 이 세계에서는 **깊이가 곧 화면 y**다(지평선이 가장 멀고 아래가 가장 가깝다).
   * 그래서 지평선에서 아래로 내려오며 옅어지는 띠 하나가 곧 거리 안개가 된다.
   * 오브젝트를 건드리지 않으므로 무엇도 투명해지지 않는다.
   */
  _drawDepthFog(ctx) {
    // **위쪽도 0에서 시작해야 한다.** 지평선에서 곧바로 0.5로 들어가면 스카이라인
    // 밑동을 가로지르는 자 대고 그은 듯한 띠가 생긴다 — 실제로 그 선이 보였다.
    // 잔디 바닥에서는 **띠를 지평선 위로 올린다.**
    //
    // 안개는 능선 밑동의 자른 듯한 경계를 지우려고 있는 것인데, 아래로 250px을
    // 덮으니 지평선 바로 아래 잔디가 통째로 허옇게 떴다. 초록 위의 하늘색은
    // 원경으로 안 읽히고 그냥 **바랜 자국**으로 보인다.
    // 능선 밑동만 걸치게 좁히고 옅게 한다.
    const grass = T().floorStyle === 'grass';
    const top = HORIZON - (grass ? 110 : 70);
    const span = grass ? 150 : 250;
    const g = ctx.createLinearGradient(0, top, 0, top + span);
    g.addColorStop(0, rgba(P().fog, 0));
    g.addColorStop(0.26, rgba(P().fog, grass ? 0.20 : 0.34));
    g.addColorStop(0.5, rgba(P().fog, grass ? 0.10 : 0.16));
    g.addColorStop(1, rgba(P().fog, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, top, W, span);
  }

  // 지평선 부근에 아주 작게 깔리는 원경 실루엣 — 안개는 `_drawDepthFog`가 씌운다
  _drawHorizonFillers(ctx) {
    ctx.save();
    for (const f of T().horizonFillers) {
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
    const prog = Math.pow(Math.min(u * (p.jDepth ?? 1), 1.25), 2.1); // 장애물과 동일한 원근 가속
    const { charBaseY } = CONFIG.world;
    const y = HORIZON + (charBaseY + 240 - HORIZON) * prog;
    const x = W / 2 + side * (CONFIG.world.trackHalfWidthFar + row.baseOffset + (p.jOff ?? 0)
                              + prog * row.spread * (p.jSpread ?? 1));
    const scale = (0.08 + prog * 1.15) * row.scaleMul;
    const h = p.h * scale * (TIER[p.tier] ?? TIER.mid);
    const w = h * (img.width / img.height);

    // 알파는 **등장·퇴장에만** 쓴다.
    //
    // 한때 여기서 거리에 따라 알파를 낮춰 공기원근을 흉내 냈는데, 그건 안개가 아니라
    // **투명**이다. 뒤에 스카이라인이 있으면 건물 너머로 그게 그대로 비쳐 유령이 된다.
    // 안개는 아래 `_drawDepthFog`가 화면 전체에 한 번 씌운다.
    let alpha = 1;
    if (u < 0.05) alpha = u / 0.05;
    if (u > 0.98) alpha = Math.max(0, 1 - (u - 0.98) / 0.17);
    if (alpha <= 0) return;

    ctx.globalAlpha = alpha;

    // ── 그림자 → 받침 → 오브젝트 순 ──
    //
    // **그림자가 접지감의 절반이다.** 예전에는 drawImage 한 줄이 전부라서, 아무리 좋은
    // 에셋을 써도 바닥에 닿지 않고 떠 보였다. 위에서 내려다보는 카메라라 그림자는
    // 원형이 아니라 **납작한 타원**이고, 멀수록 더 납작해진다.
    // 별 장식은 **바닥에 놓인 물건이 아니라 떠 있는 것**이다. 건물과 똑같이 지면에
    // 세우고 진한 그림자를 깔았더니 바닥에 떨어진 소품처럼 보였다.
    const floats = p.tier === 'small';
    const lift = floats ? h * 0.55 : 0;

    const footW = w * 0.72;
    const flat = 0.16 + 0.10 * prog;   // 가까울수록 덜 납작(카메라를 더 올려다본다)

    ctx.save();
    ctx.globalAlpha = alpha * (floats ? 0.16 : 0.34);
    ctx.fillStyle = P().shadow;
    ctx.beginPath();
    ctx.ellipse(x, y, (footW * (floats ? 0.6 : 1)) / 2, (footW * flat) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 오른쪽 것은 좌우로 뒤집어 **안쪽(트랙 쪽)을 보게** 한다.
    // 안 뒤집으면 좌우 오브젝트가 나란히 같은 방향을 봐서 무대 배경처럼 평평해진다.
    ctx.save();
    if (side > 0) {
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, y - h - lift, w, h);
    } else {
      ctx.drawImage(img, x - w / 2, y - h - lift, w, h);
    }
    ctx.restore();

    ctx.globalAlpha = 1;
  }

  _drawTrack(ctx) {
    const { trackHalfWidthNear: hwN, trackHalfWidthFar: hwF } = CONFIG.world;
    const cx = W / 2;

    // 골드 엣지 포함 본체
    trap(ctx, cx, hwN + 34, hwF + 3, P().trackEdgeDark);
    trap(ctx, cx, hwN + 22, hwF + 2, P().trackEdge);
    trap(ctx, cx, hwN, hwF, P().track);
    // 트랙 표면 그라데이션
    const g = ctx.createLinearGradient(0, HORIZON, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, rgba(P().trackSheen, 0.25));
    trap(ctx, cx, hwN, hwF, g);

    // 트랙 안쪽 가장자리를 따라 흐르는 네온(청록) 라인 — 광택감
    trapBand(ctx, cx, -(hwN - 6), -(hwN - 16), -(hwF - 0.5), -(hwF - 1.5), rgba(P().laneNeon, 0.55));
    trapBand(ctx, cx, hwN - 6, hwN - 16, hwF - 0.5, hwF - 1.5, rgba(P().laneNeon, 0.55));

    // 트랙 표면 질감 — 돌길. 색만 있으면 판때기로 보인다.
    this._drawTrackTexture(ctx, hwN, hwF);

    // ── 레인 구분선 — 트랙을 **3등분**한다 ★ ──────────────────
    //
    // 여기 계산이 틀려 있었다. `hwN * (1/3) * 2 * 1.5`는 결국 `hwN * 1.0`이라
    // **구분선이 트랙 가장자리에 딱 붙어 그려졌다.** 그래서 화면에는 테두리 선만
    // 두 줄 보이고 3등분은 눈에 띄지 않았다.
    //
    // 레인이 셋이면 경계는 중앙에서 ±hw/3이다. 그게 전부다.
    //
    // 굵기도 올렸다 — 컨셉아트의 차선은 트랙 위에서 확실히 읽히는 실선이고,
    // 아이가 "내가 어느 칸에 있나"를 알아야 좌우 이동이 게임이 된다.
    for (const f of [-1 / 3, 1 / 3]) {
      const nearX = cx + hwN * f;
      const farX = cx + hwF * f;
      const line = (w, style) => {
        ctx.strokeStyle = style; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(farX, HORIZON); ctx.lineTo(nearX, H); ctx.stroke();
      };
      line(16, rgba(P().laneNeon, 0.28));            // 바깥 번짐
      line(8, rgba(P().laneNeon, 0.9));              // 본체
      line(2.5, 'rgba(255, 252, 235, 0.8)');         // 흰 코어
    }

    // 진행감: 트랙 중앙을 따라 흘러내리는 전진 화살표(셰브론)
    this._drawChevrons(ctx, hwN, hwF);

    // 별 난간은 여기 있었지만 **연석 윗면으로 옮겼다**(`_drawCurbTrim`).
    // 연석이 트랙보다 뒤에 그려지므로 여기 두면 그대로 덮인다.
  }

  /**
   * 트랙 표면 — 돌길 무늬.
   *
   * 단색 사다리꼴은 아무리 색이 좋아도 **판때기**로 보인다. 컨셉아트의 트랙은
   * 돌이 깔린 길이고, 그 이음매가 발밑으로 흘러가는 것이 속도감을 만든다.
   *
   * 벽돌처럼 **줄마다 어긋나게** 세로 이음을 넣는다. 격자로 딱 맞추면 바닥 타일처럼
   * 보이고, 어긋내면 돌을 깐 길이 된다.
   *
   * ⚠️ 먼 구간은 아예 그리지 않는다. 간격이 1px 밑으로 내려가면 모아레가 되는 것을
   * 보도블럭·연석에서 이미 두 번 겪었다. 같은 규율(`p < FADE_IN`이면 건너뛴다)을 쓴다.
   */
  _drawTrackTexture(ctx, hwN, hwF) {
    const cx = W / 2;
    const ROWS = 16;
    const FADE_IN = 0.14, FADE_FULL = 0.42;
    const smooth = t => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

    ctx.save();
    ctx.lineCap = 'butt';
    for (let i = 0; i < ROWS; i++) {
      const u = ((i / ROWS) + this.scroll) % 1;
      const p = u * u;                       // 셰브론과 같은 원근 가속
      if (p <= FADE_IN) continue;
      const a = smooth((p - FADE_IN) / (FADE_FULL - FADE_IN));
      const y = yAt(p);
      const hw = hwF + (hwN - hwF) * p;

      // ① 가로 줄눈 — 돌의 단이 다가온다.
      //    **바닥 줄눈 색(`floorSeam`)을 쓰지 않는다.** 그건 잔디용 초록이라
      //    갈색 트랙에 얹으면 얼룩이 된다. 돌 사이 그늘은 어느 테마에서나 검다.
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.22 * a})`;
      ctx.lineWidth = Math.max(1, 2.6 * p);
      ctx.beginPath(); ctx.moveTo(cx - hw, y); ctx.lineTo(cx + hw, y); ctx.stroke();

      // ② 세로 이음 — 줄마다 반 칸씩 어긋난다(벽돌 쌓기)
      const cells = 8;
      const off = (i % 2) * 0.5;
      const tick = Math.max(2, 10 * p);
      for (let c = -cells / 2; c <= cells / 2; c++) {
        const x = cx + hw * ((c + off) / (cells / 2));
        if (Math.abs(x - cx) > hw) continue;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - tick); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 전진 화살표(셰브론) — 형광 느낌을 내기 위해 세 겹으로 그린다.
  // ① 넓고 흐린 청록 번짐(글로우) → ② 형광 연두 본체 → ③ 가는 흰 코어
  // shadowBlur를 매 화살표마다 쓰면 무거워서, 굵기가 다른 선을 겹쳐 발광처럼 보이게 함.
  _drawChevrons(ctx, hwN, hwF) {
    const COUNT = 7;
    const LAYERS = [
      { color: rgba(P().chevronGlow, 0.30), mul: 3.4, alpha: 0.85 }, // 바깥 번짐
      { color: rgba(P().chevron, 0.95), mul: 1.6, alpha: 1 },        // 형광 본체
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

}

// ── 원근 좌표 ────────────────────────────────────────────────
// p는 0(지평선)~1(화면 아래)의 깊이 파라미터다. y와 트랙 반폭이 둘 다 p에 선형이라
// 셰브론·연석·바닥 광택이 전부 같은 원근을 공유한다 — 하나만 다르면 눈에 띈다.
const yAt = p => HORIZON + (H - HORIZON) * p;
const hwAt = p => CONFIG.world.trackHalfWidthFar
  + (CONFIG.world.trackHalfWidthNear - CONFIG.world.trackHalfWidthFar) * p;

/**
 * 두 모서리 경로 사이를 채운다.
 *
 * `edgeA`/`edgeB`는 p를 받아 `[x, y]`를 돌려주는 함수다. 직선이면 steps=1로 충분하지만
 * 높이(lift)가 섞이면 경로가 휘므로 잘게 나눠 잇는다.
 */
function ribbon(ctx, edgeA, edgeB, fill, steps = 16, pMax = P_OVER) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const [x, y] = edgeA((i / steps) * pMax);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const [x, y] = edgeB((i / steps) * pMax);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function trap(ctx, cx, hwNear, hwFar, fill) {
  // 화면 밖까지 이어 그린다 — 근경 노치 방지(위 `P_OVER` 주석)
  const yE = yAt(P_OVER), hwE = a => hwFar + (a - hwFar) * P_OVER;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx - hwFar, HORIZON);
  ctx.lineTo(cx + hwFar, HORIZON);
  ctx.lineTo(cx + hwE(hwNear), yE);
  ctx.lineTo(cx - hwE(hwNear), yE);
  ctx.closePath();
  ctx.fill();
}

// 임의의 좌우 오프셋을 갖는 원근 띠(사다리꼴) — 트랙 옆 플랫폼/네온 라인용
// 값은 중심(cx)으로부터의 부호 있는 거리(왼쪽이면 음수)를 그대로 넘긴다.
function trapBand(ctx, cx, nearA, nearB, farA, farB, fill) {
  const yE = yAt(P_OVER), e = (f, n) => f + (n - f) * P_OVER;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx + farA, HORIZON);
  ctx.lineTo(cx + farB, HORIZON);
  ctx.lineTo(cx + e(farB, nearB), yE);
  ctx.lineTo(cx + e(farA, nearA), yE);
  ctx.closePath();
  ctx.fill();
}

function drawDeco(ctx, name, x, y, h, bottomAnchor = false) {
  const img = IMG[name];
  if (!img) return;
  const w = h * (img.width / img.height);
  ctx.drawImage(img, x - w / 2, bottomAnchor ? y - h + h * 0.5 : y - h / 2, w, h);
}

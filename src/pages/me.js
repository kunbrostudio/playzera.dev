// /me — 마이페이지. **부모 화면이다.**
//
// docs/06 §5. 목업 구성을 쓰되 네 가지를 고쳤다.
//   1 점수를 앞세우지 않는다      — 부모가 알아야 할 것은 얼마나 움직였나다
//   2 누적이 아니라 목표 대비다    — 천장 없이 자랑하면 부모가 더 시키고 아이가 지친다
//   3 "연속"이 아니라 "기간 내 n일" — 아프거나 여행 갔다고 기록이 사라지면 벌이 된다
//   4 '피하기 30회'는 운동이 아니다 — 가만히 서 있어도 오른다. side_steps를 쓴다
//
// ── 가로형 레이아웃 (PC 기준) ────────────────────────────────
//
// 처음엔 카드를 세로로 쌓았는데, 그건 **폰 레이아웃을 넓은 화면에 늘린 것**이었다.
// 부모는 대개 PC나 태블릿 가로로 본다. 가로를 안 쓰면 스크롤만 길어진다.
//
//   ┌──────────────┬──────────────┐
//   │ 아이 (프로필 + │   버디 크게   │  ← 왼쪽 아이 · 오른쪽 캐릭터
//   │  오늘 + 리포트)│              │
//   ├──────────────┴──────────────┤
//   │ 게임별 기록  ◀ 카드 카드 카드 ▶ │  ← 좌우 슬라이드 + 전체 보기
//   ├─────────────────────────────┤
//   │ 배지        ◀ 배지 배지 배지 ▶ │  ← 갈래 셀렉트 + 전체 보기
//   └─────────────────────────────┘
//
// **주간·월간 리포트는 상시 노출하지 않는다.** 첫 화면에 늘 필요한 건 "오늘 어땠나"
// 하나다. 지난 기록은 궁금할 때 열어보는 것이라 프로필의 [활동 리포트] 버튼 →
// 팝업으로 뺐다. 상시로 두면 화면이 길어지고, 정작 오늘이 눈에 안 들어온다.
//
// **버디를 오른쪽에 크게 두는 건 장식이 아니다.** 부모가 보는 숫자와 아이가 보는
// 친구가 같은 화면에 있어야 "이 분들이 저 친구를 키운 것"이 읽힌다.
//
// 개수가 늘어나는 것(게임·배지)은 **좌우 슬라이드 + 전체 보기 팝업**으로 둔다.
// 세로로 다 늘어놓으면 게임이 20개가 되는 순간 화면이 무너진다. 허브가 같은 이유로
// 같은 구조를 쓴다(pages/home.js "게임이 많아지면").
//
// **여기에는 `data-pz-hit`을 붙이지 않는다.**
// 부모가 폰을 손에 들고 보는 화면이고, 작은 요소가 많아 손 커서로는 어차피 못 쓴다.
// "아이 화면만 손으로 된다"는 규칙을 여기서 지킨다. 카메라도 켜지 않는다.

import { navigate, onLeave } from '../core/router.js'
import { handSession } from '../core/handSession.js'
import { getAll } from '../games/registry.js'
import { getProgress, setNickname, hasStarted } from '../progress/state.js'
import { getBuddy, currentStage } from '../buddies/registry.js'
import { mountBuddy } from '../progress/buddyView.js'
import { profileImage, profileEmoji } from '../profiles/registry.js'
import { levelFromTotals } from '../progress/level.js'
import { BADGES, GROUPS, badgeIcon } from '../progress/badges.js'
import { progressOf } from '../progress/conditions.js'
import {
  DAILY_GOAL_MIN, METRICS, metricValue,
  todayReport, todayLine, periodSummary, gameRows, dayLabel, progressText,
} from '../progress/report.js'

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
))

export function mePage(app) {
  if (!hasStarted()) { navigate('/start'); return }

  // 부모 화면에서는 손 커서를 내린다. 켜진 채로 들어오면 작은 요소들 위에서
  // 커서가 제멋대로 눌린다. (카메라 자체는 handSession이 계속 들고 있어도 된다)
  handSession.setPointerActive(false)

  const games = getAll()
  const gameOf = id => games.find(g => g.id === id) ?? null

  let badgeGroup = 'all'   // 배지 갈래 필터

  app.innerHTML = `
    <style>
      #me, #me * { box-sizing: border-box; }
      #me {
        position: fixed; inset: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
        background: linear-gradient(180deg, #2b1b52 0%, #150a2e 60%, #120826 100%);
        padding: clamp(14px, 2.4vh, 24px);
        padding-top: max(clamp(14px, 2.4vh, 24px), env(safe-area-inset-top));
        padding-bottom: max(40px, env(safe-area-inset-bottom));
      }
      /* 모든 카드가 **같은 왼쪽·오른쪽 선**에 맞는다. 안쪽 여백도 하나로 통일한다 —
         카드마다 패딩이 다르면 제목 줄이 서로 어긋나 보인다. */
      #me-in { width: min(1240px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }

      .me-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .me-btn {
        min-height: 40px; padding: 0 14px; border-radius: 9999px;
        background: rgba(255,255,255,0.1); color: #fff;
        border: 2px solid rgba(255,255,255,0.22); font: inherit; font-weight: 800;
        font-size: 0.85rem; cursor: pointer; -webkit-tap-highlight-color: transparent;
        white-space: nowrap; transition: background 0.12s, border-color 0.12s;
      }
      .me-btn:hover { background: rgba(255,255,255,0.18); border-color: #ffd23e; }
      .me-btn:active { transform: scale(0.96); }
      .me-btn.on { background: #ffd23e; color: #4a2a00; border-color: transparent; }

      .card {
        background: rgba(255,255,255,0.07); border: 2px solid rgba(255,255,255,0.12);
        border-radius: 22px; padding: var(--pad);
        --pad: clamp(16px, 1.8vw, 22px);
      }
      .card > h2 {
        margin: 0 0 14px; font-size: clamp(0.95rem, 1.8vw, 1.15rem); font-weight: 900;
        display: flex; align-items: center; gap: 10px; min-height: 40px;
      }
      .card > h2 .sub { font-size: 0.78rem; font-weight: 700; color: #a78bda; }
      /* 제목 줄 오른쪽에 붙는 조작들 (셀렉트·전체 보기) */
      .card > h2 .tools { margin-left: auto; display: flex; align-items: center; gap: 8px; }
      .me-sel {
        min-height: 40px; padding: 0 30px 0 12px; border-radius: 12px;
        background: rgba(0,0,0,0.35) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0h10L5 6z' fill='%23a78bda'/></svg>") no-repeat right 12px center;
        color: #fff; border: 2px solid rgba(255,255,255,0.22);
        font: inherit; font-size: 0.85rem; font-weight: 800;
        appearance: none; -webkit-appearance: none; cursor: pointer;
      }
      .me-sel option { background: #221145; color: #fff; }

      /* ── 위 두 단 ── */
      #me-two {
        display: grid; gap: 16px; align-items: stretch;
        grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      }
      @media (max-width: 980px) { #me-two { grid-template-columns: minmax(0, 1fr); } }

      /* ── 프로필 + 오늘 (한 카드) ── */
      #me-head { display: flex; align-items: center; gap: clamp(12px, 1.6vw, 18px); }
      #me-face {
        position: relative; width: clamp(64px, 8vw, 88px); aspect-ratio: 1; flex: none;
        display: flex; align-items: center; justify-content: center; font-size: 2.2rem;
        background: rgba(0,0,0,0.25); border-radius: 50%; overflow: hidden;
      }
      #me-face img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      #me-who { flex: 1; min-width: 0; }
      #me-name-row { display: flex; align-items: center; gap: 8px; }
      #me-name { font-size: clamp(1.1rem, 2.2vw, 1.5rem); font-weight: 900; }
      #me-edit {
        background: none; border: none; color: #ffd23e; font: inherit; font-size: 1rem;
        cursor: pointer; padding: 4px; -webkit-tap-highlight-color: transparent;
      }
      #me-name-input {
        font: inherit; font-size: clamp(1rem, 2vw, 1.3rem); font-weight: 900;
        background: rgba(0,0,0,0.3); color: #fff; border: 2px solid #ffd23e;
        border-radius: 12px; padding: 6px 10px; width: min(220px, 60vw);
      }
      #me-sub { font-size: 0.85rem; font-weight: 700; color: #a78bda; margin-top: 4px; }
      #me-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      #me-chips span {
        font-size: 0.76rem; font-weight: 800; color: #cbb8f2;
        background: rgba(0,0,0,0.24); border-radius: 999px; padding: 4px 10px;
      }
      /* 프로필과 오늘을 한 카드에 두되 **줄 하나로 나눈다.** 두 카드로 띄우면
         "누구의 오늘인지"가 끊긴다. */
      #me-divider { height: 2px; background: rgba(255,255,255,0.1); margin: 16px 0; border-radius: 2px; }
      #me-today-head {
        display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px;
        font-size: clamp(0.95rem, 1.8vw, 1.15rem); font-weight: 900;
      }
      #me-today-head .sub { font-size: 0.78rem; font-weight: 700; color: #a78bda; }
      #me-today-head .tools { margin-left: auto; }

      .bar { height: 14px; border-radius: 999px; background: rgba(0,0,0,0.32); overflow: hidden; }
      .bar > i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #ffd23e, #ff8a3d); }
      .bar.done > i { background: linear-gradient(90deg, #7ee787, #35c46a); }
      #me-today-num { font-size: clamp(1.4rem, 3vw, 2rem); font-weight: 900; }
      #me-today-num small { font-size: 0.5em; font-weight: 800; color: #a78bda; }
      #me-today-line { margin-top: 8px; font-size: 0.9rem; font-weight: 800; color: #ffd23e; }
      #me-today-line.done { color: #7ee787; }

      /* 칸 수를 못 박지 않는다 — 운동 사전에 동작이 늘면 칸도 는다 */
      .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(76px, 1fr)); gap: 8px; margin-top: 14px; }
      .metric { background: rgba(0,0,0,0.22); border-radius: 14px; padding: 10px 4px; text-align: center; }
      .metric .v { font-size: clamp(0.95rem, 1.8vw, 1.2rem); font-weight: 900; }
      .metric .l { font-size: 0.7rem; font-weight: 700; color: #a78bda; margin-top: 2px; }
      .metric.zero .v { opacity: 0.3; }

      /* ── 버디 칸 ── */
      #me-buddy-card {
        display: flex; flex-direction: column; gap: 10px; height: 100%;
        background: radial-gradient(110% 80% at 50% 18%, rgba(58,36,105,0.9) 0%, rgba(21,10,46,0.6) 70%),
                    rgba(255,255,255,0.05);
      }
      #me-buddy-card .pz-bd { flex: 1 1 auto; }
      /* 그림 칸에 **확정 높이**를 준다. max-height만 주면 안 먹는다 —
         안쪽 img의 max-height:100%가 높이 auto인 부모를 기준으로 못 풀어서
         원본 크기(512px)로 펼쳐지고 카드 밖으로 넘쳤다(실제로 그랬다). */
      #me-buddy-card .pz-bd-art { flex: 0 0 auto; height: clamp(190px, 30vh, 300px); }
      #me-buddy-note { flex: none; text-align: center; font-size: 0.78rem; font-weight: 700; color: #a78bda; }

      /* ── 리포트 팝업 ── */
      .rp-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
      .rp-chart { width: 100%; height: 200px; display: block; }
      /* 대시보드 — 숫자를 큰 칸으로 나눠 둔다. 한 줄 문장보다 눈에 빨리 들어온다 */
      .rp-tiles {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px; margin: 16px 0;
      }
      .rp-tile { background: rgba(0,0,0,0.26); border-radius: 16px; padding: 12px 14px; }
      .rp-tile .v { font-size: clamp(1.2rem, 2.4vw, 1.7rem); font-weight: 900; }
      .rp-tile .v small { font-size: 0.5em; color: #a78bda; margin-left: 3px; }
      .rp-tile .l { font-size: 0.74rem; font-weight: 800; color: #a78bda; margin-top: 4px; }
      .rp-tile.good .v { color: #7ee787; }
      .rp-sec { font-size: 0.82rem; font-weight: 900; color: #a78bda; margin: 4px 0 8px; }
      .rp-note { font-size: 0.74rem; color: #6b5c96; line-height: 1.6; margin-top: 10px; }

      /* ── 좌우 슬라이드 ──
         개수가 늘어나는 것은 세로로 늘어놓지 않는다. 화살표는 트랙 **위에 겹쳐** 두어
         카드 줄이 카드의 좌우 끝선에 그대로 맞는다. */
      .slider { position: relative; }
      .s-track {
        display: flex; gap: 12px; overflow-x: auto; scroll-behavior: smooth;
        scroll-snap-type: x proximity; padding-bottom: 2px;
        scrollbar-width: none; -ms-overflow-style: none;
      }
      .s-track::-webkit-scrollbar { display: none; }
      .s-track > * { scroll-snap-align: start; flex: none; }
      .s-arrow {
        position: absolute; top: 50%; transform: translateY(-50%); z-index: 3;
        width: 40px; height: 40px; border-radius: 50%;
        display: none; align-items: center; justify-content: center;
        background: rgba(10,6,22,0.88); color: #fff;
        border: 2px solid rgba(255,255,255,0.28); font: inherit; font-size: 0.9rem;
        cursor: pointer; backdrop-filter: blur(4px);
      }
      .s-arrow:hover { border-color: #ffd23e; }
      /* 화살표는 트랙 **안쪽**에 둔다. 카드 밖으로 나가면 카드의 좌우 끝선이 어긋나 보인다. */
      .s-arrow.prev { left: 6px; }
      .s-arrow.next { right: 6px; }
      /* 갈 수 있는 방향만 보여준다. 눌러도 안 움직이는 버튼은 없는 게 낫고,
         맨 앞에서 왼쪽 화살표가 첫 카드를 가리는 것도 막는다. */
      .slider.can-prev .s-arrow.prev,
      .slider.can-next .s-arrow.next { display: flex; }

      /* ── 게임 카드 ── */
      .g-card {
        width: clamp(190px, 20vw, 240px);
        background: rgba(0,0,0,0.24); border: 2px solid rgba(255,255,255,0.1);
        border-radius: 18px; overflow: hidden; display: flex; flex-direction: column;
      }
      .g-thumb {
        width: 100%; aspect-ratio: 16 / 10; background: rgba(0,0,0,0.35);
        display: flex; align-items: center; justify-content: center; font-size: 1.6rem;
      }
      .g-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .g-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 4px; }
      .g-name { font-weight: 900; font-size: 0.92rem; line-height: 1.25; }
      .g-main { font-size: 0.8rem; font-weight: 800; color: #ffd23e; }
      .g-sub  { font-size: 0.74rem; color: #a78bda; line-height: 1.4; }
      .g-when { font-size: 0.7rem; color: #7b6ba8; margin-top: 2px; }

      /* ── 배지 카드 ── */
      /* 갈래 이름을 줄마다 적지 않는다. 갈래는 위 셀렉트로 고른다 —
         목록이 짧아지고 배지 그림이 커진다. */
      .b-card {
        width: clamp(140px, 14vw, 168px);
        display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center;
        background: rgba(0,0,0,0.24); border: 2px solid rgba(255,255,255,0.1);
        border-radius: 18px; padding: 14px 10px 12px;
      }
      .b-card img { width: clamp(72px, 8vw, 96px); aspect-ratio: 1; object-fit: contain; }
      .b-card .n { font-weight: 900; font-size: 0.88rem; line-height: 1.25; }
      .b-card .d { font-size: 0.72rem; color: #a78bda; line-height: 1.35; }
      .b-card .p { font-size: 0.76rem; font-weight: 900; color: #ffd23e; margin-top: 2px; }
      .b-card.locked img { filter: grayscale(1) brightness(0.4); opacity: 0.6; }
      .b-card.locked .n { color: #8d7fb5; }
      .b-card.locked .p { color: #7b6ba8; }

      .empty { font-size: 0.88rem; font-weight: 700; color: #a78bda; padding: 10px 2px; }

      /* ── 전체 보기 팝업 ── */
      #me-modal {
        position: fixed; inset: 0; z-index: 80; display: none;
        align-items: center; justify-content: center; padding: clamp(12px, 3vh, 32px);
        background: rgba(8,4,18,0.72); backdrop-filter: blur(4px);
      }
      #me-modal.on { display: flex; }
      #me-modal-box {
        width: min(1000px, 100%); max-height: 100%; display: flex; flex-direction: column;
        background: #1b0f38; border: 2px solid rgba(255,255,255,0.16); border-radius: 24px;
        padding: clamp(16px, 2vw, 24px);
      }
      #me-modal-head { display: flex; align-items: center; gap: 10px; flex: none; margin-bottom: 14px; }
      #me-modal-title { margin: 0; font-size: clamp(1rem, 2vw, 1.3rem); font-weight: 900; }
      #me-modal-head .tools { margin-left: auto; display: flex; align-items: center; gap: 8px; }
      /* **세로 스크롤은 팝업 안에서.** 뒤 화면이 같이 밀리면 어디를 보고 있었는지 잃는다.
         칸은 폭에 맞춰 늘어난다 — 고정 폭으로 두면 오른쪽에 어중간한 여백이 남는다. */
      #me-modal-body {
        flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;
        display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 12px; align-content: start; padding: 2px;
      }
      #me-modal-body .b-card, #me-modal-body .g-card { width: auto; }
      /* 리포트는 격자가 아니라 한 덩어리다 */
      #me-modal-body.plain { display: block; }
      /* 게임 카드가 배지보다 넓다 — 팝업에서도 썸네일이 뭉개지지 않게 */
      #me-modal-body.wide { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }

      #me-foot { text-align: center; font-size: 0.75rem; color: #6b5c96; line-height: 1.7; }
    </style>

    <div id="me">
      <div id="me-in">
        <div class="me-top">
          <button class="me-btn" id="me-back">← 홈으로</button>
          <span style="font-size:0.8rem;font-weight:800;color:#a78bda">보호자 화면</span>
        </div>

        <div id="me-two">
          <div class="card">
            <div id="me-head"></div>
            <div id="me-divider"></div>
            <div id="me-today-head">
              오늘의 활동 <span class="sub">목표 ${DAILY_GOAL_MIN}분</span>
              <span class="tools"><button class="me-btn" id="me-report">📈 활동 리포트</button></span>
            </div>
            <div id="me-today"></div>
          </div>

          <div class="card" id="me-buddy-card">
            <div id="me-buddy-view"></div>
            <div id="me-buddy-note"></div>
          </div>
        </div>

        <div class="card">
          <h2>
            게임별 기록 <span class="sub" id="me-games-count"></span>
            <span class="tools"><button class="me-btn" id="me-games-all">☷ 전체 보기</button></span>
          </h2>
          <div class="slider" id="me-games-slider">
            <button class="s-arrow prev" aria-label="이전">◀</button>
            <div class="s-track" id="me-games-track"></div>
            <button class="s-arrow next" aria-label="다음">▶</button>
          </div>
        </div>

        <div class="card">
          <h2>
            배지 <span class="sub" id="me-badge-count"></span>
            <span class="tools">
              <select class="me-sel" id="me-badge-group" aria-label="배지 갈래"></select>
              <button class="me-btn" id="me-badges-all">☷ 전체 보기</button>
            </span>
          </h2>
          <div class="slider" id="me-badges-slider">
            <button class="s-arrow prev" aria-label="이전">◀</button>
            <div class="s-track" id="me-badges-track"></div>
            <button class="s-arrow next" aria-label="다음">▶</button>
          </div>
        </div>

        <div id="me-foot">
          기록은 이 기기에만 저장돼요.<br>
          하루 목표 ${DAILY_GOAL_MIN}분은 WHO 아동 권장 활동량(하루 60분)의 일부를 이 앱이 맡는다는 기준이에요.
        </div>
      </div>

      <div id="me-modal" role="dialog" aria-modal="true">
        <div id="me-modal-box">
          <div id="me-modal-head">
            <h3 id="me-modal-title"></h3>
            <span class="tools"><button class="me-btn" id="me-modal-close">✕ 닫기</button></span>
          </div>
          <div id="me-modal-body"></div>
        </div>
      </div>
    </div>
  `

  const $ = q => app.querySelector(q)

  // ── 슬라이드 ─────────────────────────────────────────────
  // 넘칠 때만 화살표를 보여준다. 항상 떠 있으면 눌러도 안 움직이는 버튼이 된다.
  function wireSlider(sliderSel) {
    const box = $(sliderSel)
    const track = box.querySelector('.s-track')
    const sync = () => {
      const max = track.scrollWidth - track.clientWidth
      box.classList.toggle('can-prev', max > 4 && track.scrollLeft > 4)
      box.classList.toggle('can-next', max > 4 && track.scrollLeft < max - 4)
    }
    track.addEventListener('scroll', sync, { passive: true })
    box.querySelector('.prev').addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.8 }))
    box.querySelector('.next').addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.8 }))
    return sync
  }
  const syncGames = wireSlider('#me-games-slider')
  const syncBadges = wireSlider('#me-badges-slider')

  // ── 팝업 ─────────────────────────────────────────────────
  const modal = $('#me-modal')
  const openModal = (title, html, { mode = '' } = {}) => {
    $('#me-modal-title').textContent = title
    const body = $('#me-modal-body')
    body.className = mode          // '' 격자 · 'wide' 넓은 격자 · 'plain' 한 덩어리
    body.innerHTML = html
    body.scrollTop = 0
    modal.classList.add('on')
  }
  const closeModal = () => modal.classList.remove('on')
  $('#me-modal-close').addEventListener('click', closeModal)
  modal.addEventListener('click', e => { if (e.target === modal) closeModal() })

  // ── 프로필 ───────────────────────────────────────────────
  function renderHead() {
    const s = getProgress()
    const lv = levelFromTotals(s.totals)
    const buddy = getBuddy(s.buddyId)
    const stage = currentStage(s.buddyId, lv.level, s.buddyStage)
    const face = profileImage(s.profile)
    const name = s.nickname || buddy?.name || '우리 아이'

    $('#me-head').innerHTML = `
      <div id="me-face">
        <span>${profileEmoji(s.profile)}</span>
        ${face ? `<img src="${face}" alt="" onload="this.previousElementSibling?.remove()" onerror="this.remove()" />` : ''}
      </div>
      <div id="me-who">
        <div id="me-name-row">
          <span id="me-name">${esc(name)}</span>
          <button id="me-edit" title="이름 바꾸기" aria-label="이름 바꾸기">✏️</button>
        </div>
        <div id="me-sub">LV.${lv.level} · ${esc(stage?.label ?? '알')}</div>
        <div id="me-chips">
          <span>논 날 ${s.days.length}일</span>
          <span>${s.totals.sessions ?? 0}판</span>
          <span>다 합쳐 ${Math.round((s.totals.active_sec ?? 0) / 60)}분</span>
        </div>
      </div>
    `

    // 이름은 **여기서만** 고친다 — 아이 화면에서 키보드를 띄우지 않으려고 그렇게 정했다
    $('#me-edit').addEventListener('click', () => {
      const row = $('#me-name-row')
      row.innerHTML = `<input id="me-name-input" maxlength="12" value="${esc(name)}" />`
      const input = $('#me-name-input')
      input.focus()
      input.select()
      const save = () => {
        setNickname(input.value.trim().slice(0, 12) || null)   // 비우면 버디 이름으로
        renderHead()
      }
      input.addEventListener('blur', save)
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur()
        if (e.key === 'Escape') { input.value = name; input.blur() }
      })
    })
  }

  // ── 버디 ─────────────────────────────────────────────────
  // 아이 화면과 **같은 조각**을 쓴다(progress/buddyView.js).
  function renderBuddyPanel() {
    const s = getProgress()
    const { level } = mountBuddy($('#me-buddy-view'))
    // 부모에게는 "다음이 언제 열리나"가 정보다. 아이 화면에는 이 문장이 없다 — 못 읽는다.
    const next = (getBuddy(s.buddyId)?.stages ?? []).find(st => st.unlockLevel > level)
    $('#me-buddy-note').textContent = next
      ? `다음 모습 "${next.label}"은 LV.${next.unlockLevel}에서 열려요`
      : '모든 모습이 열렸어요'
  }

  // ── 오늘 ─────────────────────────────────────────────────
  function renderToday() {
    const r = todayReport(getProgress())
    $('#me-today').innerHTML = `
      <div id="me-today-num">${r.min}<small> / ${r.goal}분</small></div>
      <div class="bar ${r.reached ? 'done' : ''}" style="margin-top:10px">
        <i style="width:${Math.round(r.ratio * 100)}%"></i>
      </div>
      <div id="me-today-line" class="${r.reached ? 'done' : ''}">${todayLine(r)}</div>
      <div class="metrics">
        ${METRICS.map(m => {
          const v = metricValue(r.totals, m)
          return `<div class="metric ${v ? '' : 'zero'}">
            <div class="v">${v}</div><div class="l">${m.emoji} ${m.label}</div>
          </div>`
        }).join('')}
      </div>
    `
  }

  // ── 꺾은선 ────────────────────────────────────────────────
  //
  // 부모가 한눈에 읽는 건 숫자가 아니라 **모양**이다.
  // 라이브러리를 쓰지 않는다 — 점 몇 개짜리 선 하나에 번들을 늘릴 이유가 없다.
  //
  // 주간(7일)과 월간(30일)이 **같은 함수를 쓴다.** 점이 많아지면 값 표시를 끄고
  // 가로 눈금을 띄엄띄엄 찍는다 — 30개를 다 적으면 글자가 서로 겹친다.
  function chartSVG(days, { showValues = true, labelEvery = 1 } = {}) {
    const W = 900, H = 200, padX = 30, padT = 28, padB = 34
    // 눈금 상한은 **목표선이 늘 보이게** 잡는다. 목표가 화면 밖에 있으면
    // 목표 대비로 읽으라는 말이 무색해진다.
    const maxMin = days.reduce((m, d) => Math.max(m, d.min), 0)
    const top = Math.max(DAILY_GOAL_MIN, maxMin, 10)
    const x = i => padX + (W - padX * 2) * (i / Math.max(1, days.length - 1))
    const y = v => padT + (H - padT - padB) * (1 - v / top)

    const line = days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.min).toFixed(1)}`).join(' ')
    const area = `${line} L${x(days.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
    const dot = days.length > 14 ? 3 : 4

    return `
      <svg class="rp-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="rpFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffd23e" stop-opacity="0.35" />
            <stop offset="100%" stop-color="#ffd23e" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line x1="${padX}" y1="${y(DAILY_GOAL_MIN)}" x2="${W - padX}" y2="${y(DAILY_GOAL_MIN)}"
              stroke="#7ee787" stroke-width="1.5" stroke-dasharray="5 5" opacity="0.7" />
        <text x="${W - padX}" y="${y(DAILY_GOAL_MIN) - 6}" text-anchor="end"
              fill="#7ee787" font-size="11" font-weight="700">목표 ${DAILY_GOAL_MIN}분</text>
        <path d="${area}" fill="url(#rpFill)" />
        <path d="${line}" fill="none" stroke="#ffd23e" stroke-width="3"
              stroke-linejoin="round" stroke-linecap="round" />
        ${days.map((d, i) => `
          <circle cx="${x(i).toFixed(1)}" cy="${y(d.min).toFixed(1)}" r="${d.today ? dot + 2 : dot}"
                  fill="${d.min ? '#ffd23e' : '#4b3a77'}" stroke="#150a2e" stroke-width="2" />
          ${showValues && d.min ? `<text x="${x(i).toFixed(1)}" y="${Math.max(12, y(d.min) - 12).toFixed(1)}"
                  text-anchor="middle" fill="#fff" font-size="11" font-weight="800">${d.min}</text>` : ''}
          ${(i % labelEvery === 0 || d.today) ? `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle"
                  fill="${d.today ? '#ffd23e' : '#8d7fb5'}" font-size="11" font-weight="800">${
                    days.length > 14 ? Number(d.key.slice(8)) : d.weekday
                  }</text>` : ''}
        `).join('')}
      </svg>`
  }

  // ── 활동 리포트 팝업 ──────────────────────────────────────
  //
  // 상시로 두지 않는 이유는 머리말에 적었다 — 첫 화면에 늘 필요한 건 "오늘"이다.
  // 여기서는 반대로 **기간을 통째로** 보여준다. 그래프 + 숫자 대시보드.
  let reportSpan = 7

  function reportHTML() {
    const p = periodSummary(getProgress(), reportSpan)
    const month = reportSpan > 7
    const tile = (v, unit, l, good = false) => `
      <div class="rp-tile ${good ? 'good' : ''}">
        <div class="v">${v}${unit ? `<small>${unit}</small>` : ''}</div>
        <div class="l">${l}</div>
      </div>`

    return `
      <div class="rp-tabs">
        <button class="me-btn rp-tab ${!month ? 'on' : ''}" data-span="7">주간</button>
        <button class="me-btn rp-tab ${month ? 'on' : ''}" data-span="30">월간</button>
      </div>

      ${chartSVG(p.days, { showValues: !month, labelEvery: month ? 5 : 1 })}

      <div class="rp-tiles">
        ${tile(p.playedDays, `/ ${p.span}일`, '논 날')}
        ${tile(p.totalMin, '분', '합계 활동')}
        ${tile(p.avgMin, '분', '논 날 평균')}
        ${tile(p.goalDays, '일', `목표 ${DAILY_GOAL_MIN}분 달성`, p.goalDays > 0)}
        ${tile(p.sessions, '판', '논 횟수')}
        ${tile(p.bestDay ? `${p.maxMin}` : '—', p.bestDay ? '분' : '', p.bestDay ? `가장 많이 논 날 · ${dayLabel(p.bestDay.key)}` : '가장 많이 논 날')}
      </div>

      <div class="rp-sec">동작별 합계</div>
      <div class="metrics">
        ${METRICS.map(m => {
          const v = metricValue(p.totals, m)
          return `<div class="metric ${v ? '' : 'zero'}">
            <div class="v">${v}</div><div class="l">${m.emoji} ${m.label}</div>
          </div>`
        }).join('')}
      </div>

      <div class="rp-note">
        평균은 <b>논 날로만</b> 나눕니다 — 쉰 날로 나누면 꾸준히 논 기록이 깎여 보여요.<br>
        하루 목표 ${DAILY_GOAL_MIN}분은 WHO 아동 권장 활동량(하루 60분)의 일부를 이 앱이 맡는다는 기준이에요.
      </div>`
  }

  function openReport() {
    openModal('활동 리포트', reportHTML(), { mode: 'plain' })
    // 탭은 다시 그린다. 상태가 하나(reportSpan)뿐이라 부분 갱신할 이유가 없다.
    app.querySelectorAll('.rp-tab').forEach(b => b.addEventListener('click', () => {
      reportSpan = Number(b.dataset.span)
      openReport()
    }))
  }

  // ── 게임별 기록 ───────────────────────────────────────────
  //
  // **점수를 앞세우지 않는다.** 이 서비스에서 점수는 부산물이고
  // 부모가 알아야 할 것은 얼마나 움직였나다. (docs/06 §5 고칠 것 1)
  const moveText = totals => METRICS
    .filter(m => m.key !== 'active_sec')
    .map(m => [m, metricValue(totals, m)])
    .filter(([, v]) => v > 0)
    .map(([m, v]) => `${m.label} ${v}${m.unit}`)
    .join(' · ')

  const thumbOf = m => m?.thumbnail
    ? `<img src="${m.thumbnail}" alt="" onerror="this.remove()" />`
    : '🎮'

  function gameCard(r) {
    const m = gameOf(r.id)
    return `
      <div class="g-card">
        <div class="g-thumb">${thumbOf(m)}</div>
        <div class="g-body">
          <div class="g-name">${esc(m?.title ?? r.id)}</div>
          <div class="g-main">${r.sessions}번 · ${r.min}분</div>
          <div class="g-sub">${moveText(r.totals) || '기록 준비 중'}</div>
          <div class="g-when">${r.lastAt ? dayLabel(r.lastAt.slice(0, 10)) : ''}</div>
        </div>
      </div>`
  }

  function renderGames() {
    const rows = gameRows(getProgress())
    $('#me-games-count').textContent = rows.length ? `${rows.length}개` : ''
    $('#me-games-track').innerHTML = rows.length
      ? rows.map(gameCard).join('')
      : `<div class="empty">아직 기록이 없어요</div>`
    syncGames()

    // 팝업도 **같은 카드**를 쓴다. 목록에서만 다른 모양을 쓰면 같은 것으로 안 보인다.
    $('#me-games-all').onclick = () => openModal('게임별 기록', rows.length
      ? rows.map(gameCard).join('')
      : `<div class="empty">아직 기록이 없어요</div>`, { mode: 'wide' })
  }

  // ── 배지 ─────────────────────────────────────────────────
  //
  // 아이 화면(/buddy)과 달리 **조건을 글로 적고 진행도를 숫자로 준다.**
  // 부모는 읽을 수 있고, "뭘 하면 따는지"를 알아야 아이에게 말해줄 수 있다.
  //
  // 갈래는 줄마다 적지 않고 **셀렉트로 고른다.** 14개가 20개가 되어도 목록 길이가
  // 그대로고, 대신 배지 그림을 크게 쓸 수 있다.
  function badgeCard(b, owned, snap) {
    const has = owned.has(b.id)
    const p = progressOf(b.cond, snap)
    return `
      <div class="b-card ${has ? '' : 'locked'}">
        <img src="${badgeIcon(b.id)}" alt="" onerror="this.style.visibility='hidden'" />
        <div class="n">${esc(b.name)}</div>
        <div class="d">${esc(b.desc)}</div>
        <div class="p">${has ? '완료' : progressText(b.cond, p)}</div>
      </div>`
  }

  function badgeList(snap) {
    const owned = new Set(snap.badges)
    return BADGES
      .filter(b => badgeGroup === 'all' || b.group === badgeGroup)
      // 딴 것을 앞에 세운다. 뒤로 갈수록 "아직 남은 것"이다.
      .sort((a, b) => (owned.has(b.id) ? 1 : 0) - (owned.has(a.id) ? 1 : 0))
  }

  function renderBadges() {
    const snap = getProgress()
    const owned = new Set(snap.badges)
    const list = badgeList(snap)

    $('#me-badge-count').textContent = `${owned.size} / ${BADGES.length}`
    $('#me-badges-track').innerHTML = list.length
      ? list.map(b => badgeCard(b, owned, snap)).join('')
      : `<div class="empty">이 갈래에는 배지가 없어요</div>`
    $('#me-badges-track').scrollLeft = 0
    syncBadges()

    $('#me-badges-all').onclick = () => openModal(
      `배지 ${owned.size} / ${BADGES.length}`,
      badgeList(snap).map(b => badgeCard(b, owned, snap)).join(''),
    )
  }

  // 갈래 셀렉트 — 목록은 **데이터에서 만든다.** 배지 갈래가 늘어도 여기는 그대로다.
  $('#me-badge-group').innerHTML = [
    `<option value="all">전체</option>`,
    ...Object.entries(GROUPS)
      .filter(([g]) => BADGES.some(b => b.group === g))
      .map(([g, label]) => `<option value="${g}">${label}</option>`),
  ].join('')
  $('#me-badge-group').addEventListener('change', e => {
    badgeGroup = e.target.value
    renderBadges()
  })

  renderHead()
  renderBuddyPanel()
  renderToday()
  renderGames()
  renderBadges()
  $('#me-report').addEventListener('click', openReport)

  // 창 크기가 바뀌면 화살표가 필요한지 다시 본다
  const onResize = () => { syncGames(); syncBadges() }
  window.addEventListener('resize', onResize)

  $('#me-back').addEventListener('click', () => navigate('/'))
  const onKey = e => {
    if (e.key !== 'Escape') return
    if (modal.classList.contains('on')) closeModal()
    else navigate('/')
  }
  window.addEventListener('keydown', onKey)

  // 아이 화면으로 돌아가면 손 커서를 다시 켠다 — 여기서 내린 것을 여기서 되돌린다
  onLeave(() => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', onResize)
    handSession.setPointerActive(true)
  })
}

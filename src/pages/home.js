// 허브 홈 — 고정 히어로 + 한 줄 페이징.
//
// ┌──────────────────────────────────────────────────────────┐
// │  PLAY ZERA                          [👤 제라]  [☰]       │
// │                                                          │
// │   4-8세 · 순발력 · 피하기        [ 선택된 게임 비주얼 ] ● │  ← 고정. 절대 스크롤되지 않는다
// │   똥 피하기                                            ○ │
// │   하늘에서 떨어지는 똥을 피하세요!                      ○ │
// │   [▶ 시작하기]                                           │
// ├──────────────────────────────────────────────────────────┤
// │  전체 게임 20 · 2/5            [⚙ 전체 ▾]                │
// │  ┌──────┐┌──────┐┌──────┐┌──────┐                       │  ← 한 줄(4개)만. 페이지로 넘긴다
// ├──────────────────────────────────────────────────────────┤
// │  ⤒ 맨 위로  │  ▲ 위로  │  ▼ 아래로  │  ⤓ 맨 아래로     │
// └──────────────────────────────────────────────────────────┘
//
// 왜 자유 스크롤을 버렸나
//   카드 클릭이 "선택"이고 실행은 히어로에서 하는데, 스크롤로 히어로가 사라지면
//   선택의 결과가 안 보인다. 클릭만 두 번 하고 아무 일도 안 일어난 것처럼 느껴진다.
//   히어로를 고정하면 선택 → 확인 → 시작이 한 화면에서 끝난다.
//
//   03 설계의 하단 4칸 바도 원래 "한 줄씩" 이동이다. 자유 스크롤이 예외였다.
//   그리고 STEP 6에서 손 포인터 머무르기(1.2초)가 붙으면 조준하는 동안 카드가
//   움직여서는 안 된다. 위치 고정이 사실상 전제 조건이다.
//
// 페이지 구성
//   0페이지  이어서 하기 (기록이 있을 때만 — 첫 방문에는 없다)
//   1~n페이지 전체 게임 4개씩
//
// 남긴 것
//   ⬜ 손 포인터 + 머무르기 → STEP 6. 지금은 클릭·터치만.
//   ⬜ 계정(아이 선택) → 기획안 2단계. 자리만.
//   ⬜ 히어로 영상 — manifest `heroVideo` 슬롯은 열어뒀고 에셋이 없다.

import { navigate, onLeave } from '../core/router.js'
import { getAll, getEntry } from '../games/registry.js'
import { getRecentIds, markPlayed } from '../core/recent.js'
import * as bgm from '../core/bgm.js'
import { handSession } from '../core/handSession.js'
import {
  PER_PAGE, RECENT_MAX,
  isNew, playersLabel, buildCategories, buildFeatured,
  buildPages, labelPosition, findPageAfterRebuild, railPageCount,
} from '../core/catalog.js'

// 머무르기 시간 — 03 설계 §머무르기 시간
const DWELL_CARD = 1200   // 게임 카드: 잘못 누르면 게임이 바뀐다
const DWELL_NAV  = 500    // 페이지 이동: 되돌리기 쉽다
const DWELL_CAT  = 600    // 카테고리: 목록이 바뀌어 놀랄 수 있다

const HERO_MAX = 5           // 히어로 추천 로테이션 개수
const HERO_INTERVAL = 6000   // 자동 전환 간격(ms)
const HERO_VIDEO_DELAY = 800 // 선택 후 이만큼 머물러야 영상을 튼다
const WHEEL_COOLDOWN = 420   // 휠 연속 입력 제한(ms)

function cardHTML(m) {
  const tags = (m.tags ?? []).slice(0, 2)
  return `
    <button class="pz-card" data-id="${m.id}" title="${m.title}" data-pz-hit data-pz-dwell="${DWELL_CARD}">
      <div class="pz-card-thumb">
        <img src="${m.thumbnail}" alt="" />
        ${isNew(m) ? `<span class="pz-badge-new">NEW</span>` : ''}
        ${m.players ? `<span class="pz-badge-players">${playersLabel(m.players)}</span>` : ''}
      </div>
      <div class="pz-card-title">${m.title}</div>
      <div class="pz-card-tags">${tags.map(t => `<span>${t}</span>`).join('')}</div>
    </button>`
}

export function homePage(app) {
  // 허브는 무음이다. BGM은 게임에 들어가야 나온다.
  bgm.stop()

  const all = getAll()
  const byId = Object.fromEntries(all.map(m => [m.id, m]))
  const categories = buildCategories(all)

  const featured = buildFeatured(all, HERO_MAX)

  let filter = null        // 선택된 태그 (null = 전체)
  let page = 0             // 현재 줄 페이지 (세로)
  let pages = []           // [{ label, kind, items }]
  let railPage = 0         // 이어서 하기 안에서의 좌우 위치
  let heroIdx = 0          // 자동 전환 중 featured 안에서의 위치
  let heroTimer = null
  let selectedId = null    // 목록에서 고른 게임. null이면 자동 전환 중.
  let videoTimer = null
  let wheelLockedUntil = 0

  app.innerHTML = `
    <style>
      #pz-hub, #pz-hub *, #pz-hub *::before, #pz-hub *::after,
      #pz-cat-backdrop, #pz-cat-backdrop * { box-sizing: border-box; }

      /* 화면 전체를 세 덩어리로 나눈다. 어느 것도 스크롤하지 않는다. */
      #pz-hub {
        position: fixed; inset: 0; overflow: hidden;
        display: flex; flex-direction: column;
        font-family: var(--font-main, 'Jua', sans-serif);
        color: #fff;
        background: linear-gradient(180deg, #2b1b52 0%, #150a2e 100%);
        touch-action: none;   /* 브라우저 기본 스크롤 대신 스와이프로 페이지를 넘긴다 */
      }

      /* ── 헤더 (히어로 위 오버레이) ── */
      /* 아이폰 가로 모드에서 노치가 왼쪽에 온다. safe-area만큼 안쪽으로 민다. */
      #pz-head {
        position: absolute; top: 0; left: 0; right: 0; z-index: 30;
        display: flex; align-items: center; justify-content: space-between;
        padding: clamp(12px, 1.8vh, 22px) clamp(16px, 2.4vw, 36px);
        padding-left: max(clamp(16px, 2.4vw, 36px), env(safe-area-inset-left));
        padding-right: max(clamp(16px, 2.4vw, 36px), env(safe-area-inset-right));
      }
      #pz-logo {
        background: none; border: none; padding: 0; cursor: pointer;
        font-family: inherit; color: #ffd23e;
        font-size: clamp(1.2rem, 2.4vw, 1.9rem); font-weight: 900;
        letter-spacing: 0.08em; text-shadow: 0 3px 10px rgba(0,0,0,0.55);
        -webkit-tap-highlight-color: transparent;
      }
      #pz-head-right { display: flex; align-items: center; gap: 10px; }
      .pz-head-btn {
        display: flex; align-items: center; gap: 8px;
        min-height: 48px; padding: 0 clamp(12px, 1.4vw, 18px);
        background: rgba(21,10,46,0.55);
        border: 2px solid rgba(255,255,255,0.2); border-radius: 9999px;
        color: #fff; font: inherit; font-size: clamp(0.85rem, 1.4vw, 1rem); font-weight: 700;
        cursor: pointer; -webkit-tap-highlight-color: transparent;
        backdrop-filter: blur(6px);
        transition: background 0.12s, border-color 0.12s, transform 0.12s;
      }
      .pz-head-btn:hover  { background: rgba(255,255,255,0.18); border-color: #ffd23e; }
      .pz-head-btn:active { transform: scale(0.95); }

      /* ── 히어로 (고정) ── */
      #pz-hero {
        position: relative; flex: 1 1 auto; min-height: 0;
        display: flex; align-items: center; overflow: hidden;
      }
      #pz-hero-bg {
        position: absolute; inset: 0;
        background-position: center; background-size: cover; background-repeat: no-repeat;
      }
      /* hero 전용 이미지가 없는 게임은 썸네일을 크게 늘려 흐리게 깔고,
         선명한 그림은 오른쪽 포스터 카드로 따로 보여준다. */
      #pz-hero-bg.fallback { filter: blur(28px) saturate(1.25) brightness(0.8); transform: scale(1.15); }
      #pz-hero-video {
        position: absolute; inset: 0; width: 100%; height: 100%;
        object-fit: cover; opacity: 0; transition: opacity 0.6s;
      }
      #pz-hero-video.on { opacity: 1; }
      #pz-hero-scrim {
        position: absolute; inset: 0;
        background:
          linear-gradient(90deg, #150a2e 0%, rgba(21,10,46,0.94) 26%, rgba(21,10,46,0.55) 55%, rgba(21,10,46,0.15) 100%),
          linear-gradient(0deg, #150a2e 0%, rgba(21,10,46,0.5) 18%, transparent 50%);
      }
      #pz-hero-inner {
        position: relative; z-index: 2;
        width: min(560px, 62%);
        padding: clamp(48px, 8vh, 90px) clamp(16px, 2.4vw, 36px) 0;
      }
      #pz-hero-meta {
        display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
        font-size: clamp(0.78rem, 1.3vw, 0.95rem); font-weight: 700;
        opacity: 0.85; margin-bottom: 10px;
      }
      #pz-hero-meta .dot { opacity: 0.4; }
      #pz-hero-meta .tag-new {
        background: #ff5c8a; color: #fff; padding: 3px 10px; border-radius: 9999px;
        font-size: 0.72rem; letter-spacing: 0.06em; opacity: 1;
      }
      #pz-hero-title {
        font-size: clamp(1.6rem, 4vw, 3rem); font-weight: 900; line-height: 1.15;
        margin: 0 0 10px; text-shadow: 0 4px 20px rgba(0,0,0,0.6);
      }
      #pz-hero-desc {
        font-size: clamp(0.88rem, 1.4vw, 1.08rem); line-height: 1.5;
        opacity: 0.82; margin: 0 0 clamp(14px, 2.2vh, 24px);
      }
      #pz-hero-play {
        display: inline-flex; align-items: center; gap: 8px;
        min-height: 56px; padding: 0 clamp(22px, 2.6vw, 34px);
        border-radius: 9999px; border: none; font: inherit;
        font-size: clamp(0.95rem, 1.5vw, 1.15rem); font-weight: 900;
        background: #ffd23e; color: #3a2205;
        box-shadow: 0 5px 0 #c89800, 0 10px 26px rgba(0,0,0,0.35);
        cursor: pointer; -webkit-tap-highlight-color: transparent;
        transition: transform 0.12s, box-shadow 0.12s;
      }
      #pz-hero-play:hover  { transform: translateY(-2px); box-shadow: 0 7px 0 #c89800, 0 14px 32px rgba(0,0,0,0.4); }
      #pz-hero-play:active { transform: translateY(3px); box-shadow: 0 2px 0 #c89800; }

      /* 오른쪽 포스터 — 배경만으로는 무슨 게임인지 안 읽히는 경우가 있다 */
      #pz-hero-poster {
        position: absolute; z-index: 2;
        right: clamp(24px, 5vw, 90px); top: 50%; transform: translateY(-50%);
        width: clamp(180px, 22vw, 300px); aspect-ratio: 16 / 10;
        border-radius: 20px; overflow: hidden;
        border: 3px solid rgba(255,255,255,0.22);
        box-shadow: 0 20px 60px rgba(0,0,0,0.55);
        background: rgba(0,0,0,0.35);
      }
      #pz-hero-poster img { width: 100%; height: 100%; object-fit: contain; display: block; }

      @keyframes pzHeroIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      .pz-hero-anim { animation: pzHeroIn 0.45s ease-out; }
      @keyframes pzBgIn { from { opacity: 0.2; } to { opacity: 1; } }
      .pz-bg-anim { animation: pzBgIn 0.5s ease-out; }
      @keyframes pzPosterIn { from { opacity: 0; transform: translateY(-50%) scale(0.94); } to { opacity: 1; transform: translateY(-50%) scale(1); } }
      .pz-poster-anim { animation: pzPosterIn 0.5s ease-out; }

      /* ── 한 줄 영역 ── */
      #pz-row-sec {
        flex: none; position: relative; z-index: 5;
        background: linear-gradient(0deg, #150a2e 30%, rgba(21,10,46,0.72) 100%);
      }
      /* 초광폭 화면에서 카드가 무한정 커지지 않게 — 커지면 히어로 자리를 뺏는다 */
      #pz-row-in {
        max-width: 1760px; margin: 0 auto;
        padding: 0 clamp(16px, 2.4vw, 36px) clamp(10px, 1.6vh, 18px);
      }
      #pz-row-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; padding: clamp(8px, 1.4vh, 16px) 0 clamp(6px, 1vh, 12px);
      }
      #pz-row-title {
        font-size: clamp(1rem, 1.9vw, 1.4rem); font-weight: 900;
        display: flex; align-items: baseline; gap: 10px;
        text-shadow: 0 2px 10px rgba(0,0,0,0.5);
      }
      #pz-row-count { font-size: 0.72em; opacity: 0.55; font-weight: 700; }

      /* 좌우 화살표 자리는 어느 페이지에서든 항상 비워둔다.
         '이어서 하기'에서만 쓰이지만, 필요할 때만 자리를 만들면 페이지를 넘길 때
         카드 폭이 달라져 화면이 덜컥거린다. */
      #pz-row-wrap { display: flex; align-items: stretch; gap: clamp(8px, 1vw, 14px); }
      .pz-rail-arrow {
        flex: none; width: clamp(44px, 3.4vw, 62px);
        background: rgba(255,255,255,0.07);
        border: 2px solid rgba(255,255,255,0.14); border-radius: 18px;
        color: #fff; font-size: 1.4rem; cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.12s, opacity 0.12s;
      }
      .pz-rail-arrow:hover:not(:disabled) { background: rgba(255,255,255,0.16); }
      .pz-rail-arrow:disabled { opacity: 0.3; cursor: default; }
      .pz-rail-arrow.hide { visibility: hidden; }

      #pz-row {
        flex: 1; min-width: 0;
        display: grid; grid-template-columns: repeat(4, 1fr);
        gap: clamp(10px, 1.2vw, 18px);
      }
      #pz-row-empty { grid-column: 1 / -1; opacity: 0.55; padding: 24px 0; }

      /* 넘어간 방향으로 살짝 밀려 들어온다 — 세로는 페이지, 가로는 이어서 하기 레일 */
      @keyframes pzRowUp    { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
      @keyframes pzRowDown  { from { opacity: 0; transform: translateY(-22px); } to { opacity: 1; transform: none; } }
      @keyframes pzRowLeft  { from { opacity: 0; transform: translateX(34px); } to { opacity: 1; transform: none; } }
      @keyframes pzRowRight { from { opacity: 0; transform: translateX(-34px); } to { opacity: 1; transform: none; } }
      .pz-row-up    { animation: pzRowUp 0.28s ease-out; }
      .pz-row-down  { animation: pzRowDown 0.28s ease-out; }
      .pz-row-left  { animation: pzRowLeft 0.26s ease-out; }
      .pz-row-right { animation: pzRowRight 0.26s ease-out; }

      /* ── 게임 카드 ── */
      .pz-card {
        display: flex; flex-direction: column; gap: 8px;
        min-height: 96px; padding: 10px;
        background: rgba(255,255,255,0.07);
        border: 2px solid rgba(255,255,255,0.14); border-radius: 20px;
        color: inherit; font: inherit; text-align: left; cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        backdrop-filter: blur(4px);
        transition: transform 0.12s, background 0.12s, border-color 0.12s;
      }
      .pz-card:hover  { background: rgba(255,255,255,0.14); border-color: rgba(255,210,62,0.6); transform: translateY(-3px); }
      .pz-card:active { transform: scale(0.97); }
      /* 지금 히어로에 떠 있는 카드 */
      .pz-card.selected {
        border-color: #ffd23e; background: rgba(255,210,62,0.14);
        box-shadow: 0 0 0 3px rgba(255,210,62,0.25), 0 10px 30px rgba(0,0,0,0.45);
      }
      .pz-card.selected .pz-card-title { color: #ffd23e; }
      /* 높이를 뷰포트에 묶는다. 비율로 두면 넓은 화면에서 줄이 세로로 커져
         고정 히어로가 눌린다 — 이 레이아웃에서는 세로가 예산이다. */
      .pz-card-thumb {
        position: relative; width: 100%; height: clamp(104px, 17vh, 190px);
        background: rgba(0,0,0,0.3); border-radius: 14px; overflow: hidden;
      }
      .pz-card-thumb img { width: 100%; height: 100%; object-fit: contain; display: block; }
      .pz-badge-new {
        position: absolute; top: 6px; left: 6px;
        background: #ff5c8a; color: #fff; font-size: 0.65rem; font-weight: 900;
        padding: 3px 8px; border-radius: 9999px; letter-spacing: 0.06em;
      }
      .pz-badge-players {
        position: absolute; bottom: 6px; right: 6px;
        background: rgba(0,0,0,0.55); color: #fff;
        font-size: 0.65rem; font-weight: 700; padding: 3px 8px; border-radius: 9999px;
      }
      .pz-card-title {
        font-size: clamp(0.85rem, 1.35vw, 1.05rem); font-weight: 900; line-height: 1.25;
        display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
      }
      .pz-card-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: auto; }
      .pz-card-tags span {
        font-size: 0.68rem; font-weight: 700; opacity: 0.8;
        background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 9999px;
      }

      /* ── 하단 4칸 바 ── */
      #pz-navbar {
        flex: none; display: grid; grid-template-columns: repeat(4, 1fr);
        gap: 2px; background: rgba(0,0,0,0.4);
        border-top: 2px solid rgba(255,255,255,0.12);
        /* 홈 인디케이터(가로 막대)에 버튼이 깔리지 않게 */
        padding-bottom: env(safe-area-inset-bottom);
      }
      /* 손 커서로 겨눌 수 있어야 한다. 03 설계의 최소 타겟 96×96을 세로로도 지킨다 —
         화면 맨 아래는 팔을 가장 많이 내려야 닿는 자리라 얇으면 못 맞춘다. */
      .pz-nav {
        min-height: clamp(64px, 9vh, 96px);
        background: none; border: none; color: #fff; font: inherit;
        font-size: clamp(0.8rem, 1.3vw, 1rem); font-weight: 700;
        cursor: pointer; -webkit-tap-highlight-color: transparent;
        transition: background 0.12s, opacity 0.12s;
      }
      .pz-nav:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
      .pz-nav:disabled { opacity: 0.32; cursor: default; }

      /* ── 카테고리 팝업 ── */
      #pz-cat-backdrop {
        position: fixed; inset: 0; z-index: 200;
        background: rgba(8,3,20,0.68);
        display: none; align-items: center; justify-content: center; padding: 20px;
      }
      #pz-cat-backdrop.open { display: flex; }
      #pz-cat {
        background: #2c1a58; border: 3px solid rgba(255,255,255,0.18);
        border-radius: 28px; padding: clamp(18px, 3vh, 30px);
        width: min(560px, 100%); max-height: 84vh; overflow-y: auto;
      }
      #pz-cat h2 { margin: 0 0 16px; font-size: clamp(1.05rem, 2vw, 1.4rem); }
      #pz-cat-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .pz-cat-tile {
        display: flex; align-items: center; gap: 10px;
        min-height: 68px; padding: 0 16px;
        background: rgba(255,255,255,0.08);
        border: 2px solid rgba(255,255,255,0.16); border-radius: 18px;
        color: #fff; font: inherit; font-size: clamp(0.9rem, 1.5vw, 1.05rem); font-weight: 800;
        cursor: pointer; -webkit-tap-highlight-color: transparent;
        transition: background 0.12s, border-color 0.12s, transform 0.12s;
      }
      .pz-cat-tile:hover  { background: rgba(255,255,255,0.16); }
      .pz-cat-tile:active { transform: scale(0.97); }
      .pz-cat-tile.on { border-color: #ffd23e; background: rgba(255,210,62,0.16); }
      .pz-cat-tile .n { margin-left: auto; opacity: 0.6; font-size: 0.85em; }

      /* ── 손 포인터 ── */
      /* 커서가 지금 어느 버튼을 겨누고 있는지 대상 쪽에서도 보여줘야 한다.
         커서 링만으로는 "이게 눌리는 중인가"가 안 읽힌다. */
      .pz-hover {
        outline: 3px solid #ffd23e !important;
        outline-offset: 2px;
        background: rgba(255,210,62,0.18) !important;
      }

      /* ── 토스트 ── */
      #pz-toast {
        position: fixed; left: 50%; bottom: clamp(96px, 14vh, 140px); transform: translateX(-50%);
        z-index: 300; padding: 12px 22px; border-radius: 9999px;
        background: rgba(0,0,0,0.8); font-size: 0.95rem; font-weight: 700;
        opacity: 0; pointer-events: none; transition: opacity 0.2s;
      }
      #pz-toast.on { opacity: 1; }

      /* ── 좁은 화면 ── */
      @media (max-width: 1100px) {
        #pz-hero-poster { display: none; }
        #pz-hero-inner  { width: min(560px, 86%); }
        #pz-hero-scrim {
          background:
            linear-gradient(90deg, #150a2e 0%, rgba(21,10,46,0.9) 42%, rgba(21,10,46,0.45) 100%),
            linear-gradient(0deg, #150a2e 0%, rgba(21,10,46,0.6) 22%, transparent 55%);
        }
      }
      @media (max-width: 900px) {
        #pz-row { grid-template-columns: repeat(2, 1fr); }
        #pz-cat-list { grid-template-columns: 1fr; }
      }
      @media (prefers-reduced-motion: reduce) {
        .pz-hero-anim, .pz-bg-anim, .pz-poster-anim, .pz-row-up, .pz-row-down { animation: none; }
      }
    </style>

    <div id="pz-hub">
      <header id="pz-head">
        <button id="pz-logo">PLAY ZERA</button>
        <div id="pz-head-right">
          <button class="pz-head-btn" id="pz-hand" data-pz-hit data-pz-dwell="${DWELL_CAT}">✋ <span id="pz-hand-label">손으로 고르기</span></button>
          <button class="pz-head-btn" id="pz-account">👤 <span>제라</span></button>
          <button class="pz-head-btn" id="pz-menu">☰</button>
        </div>
      </header>


      <section id="pz-hero">
        <div id="pz-hero-bg"></div>
        <video id="pz-hero-video" muted loop playsinline preload="none"></video>
        <div id="pz-hero-scrim"></div>
        <div id="pz-hero-poster"><img alt="" /></div>
        <div id="pz-hero-inner">
          <div id="pz-hero-meta"></div>
          <h1 id="pz-hero-title"></h1>
          <p id="pz-hero-desc"></p>
          <button id="pz-hero-play" data-pz-hit data-pz-dwell="${DWELL_CARD}">▶ 시작하기</button>
        </div>
      </section>

      <section id="pz-row-sec">
        <div id="pz-row-in">
          <div id="pz-row-head">
            <div id="pz-row-title">
              <span id="pz-row-label">전체 게임</span>
              <span id="pz-row-count"></span>
            </div>
            <button class="pz-head-btn" id="pz-filter" data-pz-hit data-pz-dwell="${DWELL_CAT}">⚙ <span id="pz-filter-label">전체</span> ▾</button>
          </div>
          <div id="pz-row-wrap">
            <button class="pz-rail-arrow hide" id="pz-rail-prev" aria-label="이전" data-pz-hit data-pz-dwell="${DWELL_NAV}">◀</button>
            <div id="pz-row"></div>
            <button class="pz-rail-arrow hide" id="pz-rail-next" aria-label="다음" data-pz-hit data-pz-dwell="${DWELL_NAV}">▶</button>
          </div>
        </div>
      </section>

      <nav id="pz-navbar">
        <button class="pz-nav" data-pz-hit data-pz-dwell="${DWELL_NAV}" data-nav="top">⤒ 맨 위로</button>
        <button class="pz-nav" data-pz-hit data-pz-dwell="${DWELL_NAV}" data-nav="up">▲ 위로</button>
        <button class="pz-nav" data-pz-hit data-pz-dwell="${DWELL_NAV}" data-nav="down">▼ 아래로</button>
        <button class="pz-nav" data-pz-hit data-pz-dwell="${DWELL_NAV}" data-nav="bottom">⤓ 맨 아래로</button>
      </nav>
    </div>

    <div id="pz-cat-backdrop">
      <div id="pz-cat">
        <h2>어떤 운동을 해볼까?</h2>
        <div id="pz-cat-list"></div>
      </div>
    </div>

    <div id="pz-toast"></div>
  `

  const $ = sel => app.querySelector(sel)
  const hub = $('#pz-hub')
  const rowEl = $('#pz-row')
  const heroBg = $('#pz-hero-bg')
  const heroVideo = $('#pz-hero-video')
  const heroPoster = $('#pz-hero-poster')
  const heroPosterImg = heroPoster.querySelector('img')
  const heroInner = $('#pz-hero-inner')

  // ── 토스트 ──
  const toastEl = $('#pz-toast')
  let toastTimer = null
  const toast = msg => {
    toastEl.textContent = msg
    toastEl.classList.add('on')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1600)
  }

  // ── 페이지 구성 ──
  // 규칙 자체는 core/catalog.js에 있다 (테스트 가능하게 떼어냄).
  // 여기서는 registry·recent를 읽어 그 함수에 넘기는 일만 한다.
  //
  // 중복은 recent.js가 거른다 — 같은 게임을 다시 하면 뒤 항목을 지우고 맨 앞으로 올린다.
  const currentPages = () => buildPages({
    all,
    recent: getRecentIds(id => !!byId[id]).slice(0, RECENT_MAX).map(id => byId[id]),
    filter,
  })

  // dir: 세로 페이지 이동 방향(+1 아래 / -1 위), rail: 좌우 레일 이동 방향
  function renderRow(dir = 0, rail = 0) {
    const p = pages[page]
    if (!p) return

    const isRecent = p.kind === 'recent'
    const railPages = isRecent ? railPageCount(p.items) : 1
    if (isRecent) railPage = Math.max(0, Math.min(railPage, railPages - 1))
    else railPage = 0

    const items = isRecent
      ? p.items.slice(railPage * PER_PAGE, railPage * PER_PAGE + PER_PAGE)
      : p.items

    $('#pz-row-label').textContent = p.label
    const { idx, of } = labelPosition(pages, page)
    $('#pz-row-count').textContent = isRecent
      ? (railPages > 1 ? `${railPage + 1}/${railPages}` : `${p.items.length}개`)
      : `${p.total ?? 0}개 · ${idx}/${of}`

    // 화살표는 이어서 하기가 4개를 넘을 때만 나타난다. 자리는 항상 잡혀 있다.
    const showArrows = isRecent && railPages > 1
    const prev = $('#pz-rail-prev')
    const next = $('#pz-rail-next')
    prev.classList.toggle('hide', !showArrows)
    next.classList.toggle('hide', !showArrows)
    prev.disabled = !showArrows || railPage <= 0
    next.disabled = !showArrows || railPage >= railPages - 1

    rowEl.innerHTML = items.length
      ? items.map(cardHTML).join('')
      : `<p id="pz-row-empty">이 분류에는 아직 게임이 없어요.</p>`

    rowEl.querySelectorAll('.pz-card-thumb img').forEach(img => {
      img.addEventListener('error', () => { img.style.visibility = 'hidden' })
    })
    rowEl.querySelectorAll('.pz-card').forEach(card => {
      const id = card.dataset.id

      // 올려놓기만 해도 히어로가 바뀐다. 마우스도 손도 같다 —
      // "이게 무슨 게임이지"를 누르기 전에 확인할 수 있어야 한다.
      card.addEventListener('mouseenter', () => selectGame(id))
      card.addEventListener('pz-pointer-enter', () => selectGame(id))

      // 마우스는 클릭 = 선택. 큰 화면에서 한 번 보고 시작하는 흐름이 어색하지 않다.
      card.addEventListener('click', () => selectGame(id))

      // 손은 머무르기 = 바로 실행.
      //
      // 손으로는 "카드에 1.2초 머물러 고르고 → 히어로로 커서를 옮겨 다시 1.2초"가
      // 너무 멀다. 팔을 두 번 조준하는 동안 아이는 이미 지친다.
      // 이미 카드를 1.2초 겨눴다는 것 자체가 충분히 분명한 의사표시다.
      card.addEventListener('pz-dwell', e => {
        e.preventDefault()   // click()으로 떨어지지 않게 — 그러면 선택만 되고 만다
        selectGame(id)
        openGame(id)
      })
    })
    syncSelectedCards()

    const cls = dir > 0 ? 'pz-row-up' : dir < 0 ? 'pz-row-down'
      : rail > 0 ? 'pz-row-left' : rail < 0 ? 'pz-row-right' : null
    rowEl.classList.remove('pz-row-up', 'pz-row-down', 'pz-row-left', 'pz-row-right')
    if (cls) {
      void rowEl.offsetWidth
      rowEl.classList.add(cls)
    }
    syncNav()
  }

  function goPage(next, dir = 0) {
    const clamped = Math.max(0, Math.min(pages.length - 1, next))
    if (clamped === page && dir !== 0) return
    page = clamped
    renderRow(dir)
  }

  // 이어서 하기 안에서 좌우로 한 화면(4개)씩. 가속 없음 — 03 설계 §이어서 하기.
  function goRail(delta) {
    const p = pages[page]
    if (p?.kind !== 'recent') return
    const railPages = railPageCount(p.items)
    const next = Math.max(0, Math.min(railPages - 1, railPage + delta))
    if (next === railPage) return
    railPage = next
    renderRow(0, delta)
  }

  // 페이지를 다시 만든 뒤에도 보던 자리에 남아야 한다 (규칙은 catalog.js 참조)
  function rebuildPages({ keepPage = true } = {}) {
    const before = pages.length
      ? { label: pages[page].label, idx: labelPosition(pages, page).idx }
      : null
    pages = currentPages()
    page = keepPage ? findPageAfterRebuild(pages, before) : 0
    renderRow()
  }

  // ── 선택 / 실행 ──
  //
  // 카드 클릭은 "선택"이다. 실제 실행은 히어로의 시작 버튼 하나뿐이라
  // 목록을 훑다가 잘못 눌러 게임이 켜지는 일이 없다.
  function selectGame(id) {
    if (!byId[id]) return
    selectedId = id

    // 고른 순간 추천 자동 전환은 멈춘다. 보고 있는 게 바뀌면 곤란하다.
    clearInterval(heroTimer)
    heroTimer = null

    const i = featured.findIndex(f => f.id === id)
    if (i >= 0) heroIdx = i

    renderHero()
    syncSelectedCards()
  }

  function syncSelectedCards() {
    rowEl.querySelectorAll('.pz-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.id === selectedId)
    })
  }

  function openGame(id) {
    // 더미 카드(개발용)는 갈 곳이 없다. 대신 최근 목록에는 넣어서
    // 이어서 하기 페이지를 확인할 수 있게 한다.
    if (byId[id]?.placeholder) {
      markPlayed(id)
      rebuildPages()
      toast('아직 준비 중인 게임이에요')
      return
    }
    navigate(getEntry(id))
  }

  // ── 히어로 ──
  const heroGame = () => (selectedId ? byId[selectedId] : featured[heroIdx])

  // 영상은 선택 직후가 아니라 조금 머문 뒤에 튼다. 목록을 훑을 때마다
  // 켜졌다 꺼지면 산만하고 디코딩도 낭비다. 에셋이 없으면 아무 일도 없다.
  function stopHeroVideo() {
    clearTimeout(videoTimer)
    videoTimer = null
    heroVideo.classList.remove('on')
    heroVideo.pause()
    heroVideo.removeAttribute('src')
    heroVideo.load()
  }

  function scheduleHeroVideo(m) {
    stopHeroVideo()
    if (!m?.heroVideo) return
    videoTimer = setTimeout(() => {
      if (heroGame()?.id !== m.id) return   // 그새 다른 걸 골랐으면 취소
      heroVideo.src = m.heroVideo
      heroVideo.play()
        .then(() => { if (heroGame()?.id === m.id) heroVideo.classList.add('on') })
        .catch(() => stopHeroVideo())       // 자동재생 차단 등 — 이미지 그대로 둔다
    }, HERO_VIDEO_DELAY)
  }

  function renderHero() {
    const m = heroGame()
    if (!m) return

    const wide = !!m.hero
    heroBg.style.backgroundImage = `url('${m.hero ?? m.thumbnail}')`
    heroBg.classList.toggle('fallback', !wide)
    heroPosterImg.src = m.thumbnail
    heroPoster.style.display = m.thumbnail ? '' : 'none'
    scheduleHeroVideo(m)

    $('#pz-hero-meta').innerHTML = [
      isNew(m) ? `<span class="tag-new">NEW</span>` : '',
      `<span>${m.ageRange}세</span>`,
      m.players ? `<span class="dot">·</span><span>${playersLabel(m.players)}</span>` : '',
      ...(m.tags ?? []).slice(0, 3).map(t => `<span class="dot">·</span><span>${t}</span>`),
    ].join('')
    $('#pz-hero-title').textContent = m.title
    $('#pz-hero-desc').textContent = m.description ?? ''
    $('#pz-hero-play').textContent = m.placeholder ? '준비 중이에요' : '▶ 시작하기'

    for (const [el, cls] of [[heroInner, 'pz-hero-anim'], [heroBg, 'pz-bg-anim'], [heroPoster, 'pz-poster-anim']]) {
      el.classList.remove(cls)
      void el.offsetWidth
      el.classList.add(cls)
    }

  }

  function goHero(i) {
    heroIdx = (i + featured.length) % featured.length
    renderHero()
  }

  // 자동 전환은 **아직 아무것도 고르지 않았을 때만** 돈다.
  function restartHeroTimer() {
    clearInterval(heroTimer)
    heroTimer = null
    if (selectedId || featured.length < 2) return
    heroTimer = setInterval(() => goHero(heroIdx + 1), HERO_INTERVAL)
  }

  $('#pz-hero-play').addEventListener('click', () => openGame(heroGame()?.id))
  $('#pz-rail-prev').addEventListener('click', () => goRail(-1))
  $('#pz-rail-next').addEventListener('click', () => goRail(1))
  $('#pz-hero').addEventListener('mouseenter', () => clearInterval(heroTimer))
  $('#pz-hero').addEventListener('mouseleave', restartHeroTimer)

  // ── 페이지 이동 입력 ──
  //
  // 바깥쪽일수록 멀리 간다 — 03 설계 §하단 4칸 바.
  function syncNav() {
    const atTop = page <= 0
    const atBottom = page >= pages.length - 1
    app.querySelectorAll('.pz-nav').forEach(btn => {
      const d = btn.dataset.nav
      btn.disabled = (d === 'top' || d === 'up') ? atTop : atBottom
    })
  }
  app.querySelectorAll('.pz-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = btn.dataset.nav
      if (d === 'top') goPage(0, -1)
      else if (d === 'bottom') goPage(pages.length - 1, 1)
      else goPage(page + (d === 'up' ? -1 : 1), d === 'up' ? -1 : 1)
    })
  })

  // 휠 — 트랙패드는 한 번 굴려도 이벤트가 수십 개 날아온다. 쿨다운으로 한 페이지씩.
  const onWheel = e => {
    if ($('#pz-cat-backdrop').classList.contains('open')) return
    e.preventDefault()
    const now = performance.now()
    if (now < wheelLockedUntil) return
    if (Math.abs(e.deltaY) < 8) return
    wheelLockedUntil = now + WHEEL_COOLDOWN
    const dir = e.deltaY > 0 ? 1 : -1
    goPage(page + dir, dir)
  }
  hub.addEventListener('wheel', onWheel, { passive: false })

  // 방향키
  const onKey = e => {
    if ($('#pz-cat-backdrop').classList.contains('open')) {
      if (e.key === 'Escape') $('#pz-cat-backdrop').classList.remove('open')
      return
    }
    if (e.key === 'ArrowDown')      { e.preventDefault(); goPage(page + 1, 1) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); goPage(page - 1, -1) }
    else if (e.key === 'ArrowRight'){ e.preventDefault(); goRail(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goRail(-1) }
    else if (e.key === 'Home')      { e.preventDefault(); goPage(0, -1) }
    else if (e.key === 'End')       { e.preventDefault(); goPage(pages.length - 1, 1) }
    // 버튼에 포커스가 있으면 브라우저가 이미 click을 발생시킨다 — 여기서 또 하면 두 번이다
    else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      openGame(heroGame()?.id)
    }
  }
  window.addEventListener('keydown', onKey)

  // 터치 스와이프 — 40px 이상. 세로는 페이지, 가로는 이어서 하기 레일.
  let touch = null
  hub.addEventListener('touchstart', e => {
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, { passive: true })
  hub.addEventListener('touchend', e => {
    if (!touch) return
    const t = e.changedTouches[0]
    const dx = touch.x - (t?.clientX ?? touch.x)
    const dy = touch.y - (t?.clientY ?? touch.y)
    touch = null
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return
    if (Math.abs(dx) > Math.abs(dy)) goRail(dx > 0 ? 1 : -1)
    else goPage(page + (dy > 0 ? 1 : -1), dy > 0 ? 1 : -1)
  }, { passive: true })

  // ── 카테고리 팝업 ──
  // 닫기 버튼은 두지 않는다. "전체"가 곧 닫기이자 초기화 — 03 설계 §카테고리 팝업.
  const backdrop = $('#pz-cat-backdrop')
  function renderCategories() {
    $('#pz-cat-list').innerHTML = categories.map(c => {
      const on = (c.key ?? null) === filter
      return `<button class="pz-cat-tile ${on ? 'on' : ''}" data-key="${c.key ?? ''}" data-pz-hit data-pz-dwell="${DWELL_CAT}">
                <span>${c.emoji}</span><span>${c.label}</span><span class="n">${c.n}</span>
              </button>`
    }).join('')
    $('#pz-cat-list').querySelectorAll('.pz-cat-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        filter = tile.dataset.key || null
        $('#pz-filter-label').textContent = filter ?? '전체'
        backdrop.classList.remove('open')
        // 필터를 바꾸면 전체 게임 첫 쪽으로. 이어서 하기는 필터와 무관하므로 건너뛴다.
        pages = currentPages()
        page = Math.max(0, pages.findIndex(p => p.label === '전체 게임'))
        renderRow(1)
      })
    })
  }
  $('#pz-filter').addEventListener('click', () => {
    renderCategories()
    backdrop.classList.add('open')
  })
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) backdrop.classList.remove('open')
  })

  // ── 손 포인터 ──────────────────────────────────────────────
  //
  // 카메라와 커서는 `handSession`이 앱 수명 동안 들고 있다. 이 화면은 켜고 끄는
  // 버튼과 라벨만 담당한다 — 라우팅이 바뀌어도 커서가 끊기지 않아야 해서다.
  const handLabel = $('#pz-hand-label')
  const syncHandLabel = () => {
    handLabel.textContent = handSession.enabled ? '손 끄기' : '손으로 고르기'
  }
  // 될 수 없는 기기에서는 버튼 자체를 숨긴다. 눌러봐야 실패 안내만 나온다.
  if (!handSession.supported) {
    $('#pz-hand').style.display = 'none'
    console.info('[home] 손 포인터 미지원:', handSession.unsupportedReason)
  }
  const offHandChange = handSession.onChange(syncHandLabel)

  async function turnHandOn() {
    handLabel.textContent = '켜는 중…'
    try {
      await handSession.enable()
      toast('손을 어깨 위로 들면 커서가 나와요')
    } catch (err) {
      console.warn('[home] 손 포인터 시작 실패:', err?.name, err?.message)
      const byName = {
        NotAllowedError:  '카메라 권한을 허용해 주세요',
        NotFoundError:    '카메라를 찾지 못했어요',
        NotReadableError: '다른 앱이 카메라를 쓰고 있어요',
        OverconstrainedError: '카메라가 이 화질을 지원하지 않아요',
        SecurityError:    'HTTPS에서만 쓸 수 있어요',
        PoseUnsupportedError: err?.message,   // 기기가 못 하는 경우 — 이유가 이미 문장이다
      }
      // 아는 이유가 아니면 원문을 그대로 보여준다. "카메라를 열 수 없어요"만 뜨면
      // 콘솔을 열기 전까지 아무것도 알 수 없다 — 실제로 그 상태로 한참 헤맸다.
      toast(byName[err?.name] ?? `카메라 오류: ${err?.name || ''} ${err?.message || ''}`.trim())
    }
    syncHandLabel()
  }

  $('#pz-hand').addEventListener('click', () => {
    if (handSession.enabled) handSession.disable()
    else turnHandOn()
  })

  // ── 헤더 ──
  // 계정(아이 선택)은 기획안 2단계, 햄버거 메뉴는 STEP 7. 자리만 잡아둔다.
  $('#pz-logo').addEventListener('click', () => goPage(0, -1))
  $('#pz-account').addEventListener('click', () => toast('아이 선택은 준비 중이에요'))
  $('#pz-menu').addEventListener('click', () => toast('설정 메뉴는 준비 중이에요'))

  // ── 정리 ──
  // 홈을 떠난 뒤에도 타이머가 살아 있으면 이미 사라진 DOM을 6초마다 건드린다.
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') { clearInterval(heroTimer); stopHeroVideo() }
    else restartHeroTimer()
  }
  document.addEventListener('visibilitychange', onVisibility)
  onLeave(() => {
    clearInterval(heroTimer)
    clearTimeout(toastTimer)
    stopHeroVideo()
    offHandChange()
    // 카메라는 놓지 않는다. 다음 화면(인트로)도 같은 스트림을 쓰기 때문에
    // 여기서 끄면 커서가 한 번 끊기고 곧바로 다시 열게 된다.
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('keydown', onKey)
  })

  rebuildPages({ keepPage: false })
  renderHero()
  restartHeroTimer()

  // 허브에서는 커서가 보여야 한다 (게임 플레이 화면에서는 끈다)
  handSession.setPointerActive(true)
  syncHandLabel()
  // 지난번에 켜뒀다면 조용히 다시 켠다
  handSession.resumeIfPreferred().then(syncHandLabel)
}

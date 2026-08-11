// 허브 홈 — 고정 히어로 + 한 줄 좌우 레일.
//
// ┌──────────────────────────────────────────────────────────┐
// │  PLAY ZERA            [✋ 손][👤 제라][☰]                │
// │                                                          │
// │   4-8세 · 순발력           [ 선택된 게임 비주얼 ]        │  ← 고정
// │   똥 피하기                                              │
// │   [▶ 시작하기]                                           │
// ├──────────────────────────────────────────────────────────┤
// │  게임 20   1/5           [⚙ 전체 ▾]  [☷ 전체 보기]      │
// │  ◀ ┌────┐┌────┐┌────┐┌────┐ ▶                          │  ← 좌우로만 움직인다
// └──────────────────────────────────────────────────────────┘
//
// 왜 좌우 하나뿐인가
//   이전에는 '이어서 하기'(좌우)와 '전체 게임'(세로 페이지) 두 축이 섞여 있었고,
//   세로 이동 버튼이 카드 줄 **바로 아래** 붙어 있었다. 카드를 1.2초 겨누는 동안
//   손이 조금만 내려가면 그 버튼에 걸린다. 세로로 인접한 두 타겟은 머무르기와 상극이다.
//
//   한 줄로 합치고 화살표를 좌우 끝에 두면 카드와 **가로로** 떨어진다.
//   목록 순서는 "최근에 한 것 먼저, 그다음 나머지".
//
// 게임이 많아지면
//   좌우 레일은 개수에 약하다(20개면 5쪽, 100개면 25쪽). 그래서 [☷ 전체 보기]로
//   격자 목록을 따로 연다. 거기에는 검색·카테고리·세로 스크롤이 있다.
//   **검색은 부모·선생님용이다** — 아이는 키보드를 못 쓰고 손 제스처로도 불가능하다.

import { navigate, onLeave } from '../core/router.js'
import { getAll, getEntry } from '../games/registry.js'
import { getRecentIds, markPlayed } from '../core/recent.js'
import { handSession } from '../core/handSession.js'
import { bindHandButton } from '../core/handControl.js'
import { getProgress, hasStarted, buddyNews } from '../progress/state.js'
import { levelFromTotals } from '../progress/level.js'
import { buddyImage, currentStage } from '../buddies/registry.js'
import {
  PER_PAGE, RECENT_MAX,
  isNew, playersLabel, buildCategories, buildFeatured,
  buildRail, searchGames, railPageCount,
} from '../core/catalog.js'

// 머무르기 시간 — 03 설계 §머무르기 시간
const DWELL_CARD = 1200   // 게임 카드: 잘못 누르면 게임이 바뀐다
const DWELL_NAV  = 500    // 화살표·스크롤: 되돌리기 쉽다
const DWELL_CAT  = 600    // 카테고리·팝업 열고 닫기

const HERO_MAX = 5
const HERO_INTERVAL = 6000
const HERO_VIDEO_DELAY = 800
const WHEEL_COOLDOWN = 420

function cardHTML(m, { dwell = DWELL_CARD, maxTags = 2 } = {}) {
  const tags = (m.tags ?? []).slice(0, maxTags)
  return `
    <button class="pz-card" data-id="${m.id}" title="${m.title}" data-pz-hit data-pz-dwell="${dwell}">
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
  // 허브는 무음이다. **끄는 건 라우터가 한다**(core/router.js의 GAME_ROUTES) —
  // 화면마다 각자 끄면 켜는 쪽과 순서가 엉킨다.

  const all = getAll()
  const byId = Object.fromEntries(all.map(m => [m.id, m]))
  const categories = buildCategories(all)
  const featured = buildFeatured(all, HERO_MAX)

  // 레일에 한 번에 몇 장을 놓을지. 좁은 화면에서는 2열이라 4개를 넣으면
  // 두 줄로 쌓여서 "좌우 한 방향" 원칙이 깨진다.
  const perPage = () => (window.innerWidth <= 900 ? 2 : PER_PAGE)

  let filter = null        // 선택된 태그 (레일·전체 목록이 함께 쓴다)
  let query = ''           // 전체 목록의 검색어
  let rail = []            // 지금 레일에 뿌릴 목록
  let railPage = 0
  let heroIdx = 0
  let heroTimer = null
  let selectedId = null
  let videoTimer = null
  let wheelLockedUntil = 0

  app.innerHTML = `
    <style>
      #pz-hub, #pz-hub *, #pz-hub *::before, #pz-hub *::after,
      .pz-backdrop, .pz-backdrop * { box-sizing: border-box; }

      #pz-hub {
        position: fixed; inset: 0; overflow: hidden;
        display: flex; flex-direction: column;
        font-family: var(--font-main, 'Jua', sans-serif);
        color: #fff;
        background: linear-gradient(180deg, #2b1b52 0%, #150a2e 100%);
        touch-action: none;
      }

      /* ── 헤더 ── */
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
      .pz-btn {
        display: flex; align-items: center; gap: 8px;
        min-height: 52px; padding: 0 clamp(14px, 1.6vw, 20px);
        background: rgba(21,10,46,0.55);
        border: 2px solid rgba(255,255,255,0.2); border-radius: 9999px;
        color: #fff; font: inherit; font-size: clamp(0.85rem, 1.4vw, 1rem); font-weight: 700;
        cursor: pointer; -webkit-tap-highlight-color: transparent;
        backdrop-filter: blur(6px); white-space: nowrap;
        transition: background 0.12s, border-color 0.12s, transform 0.12s;
      }
      .pz-btn:hover  { background: rgba(255,255,255,0.18); border-color: #ffd23e; }
      .pz-btn:active { transform: scale(0.95); }
      .pz-btn.primary { background: rgba(255,210,62,0.9); color: #3a2205; border-color: transparent; }

      /* ── 히어로 (고정) ── */
      #pz-hero {
        position: relative; flex: 1 1 auto; min-height: 0;
        display: flex; align-items: center; overflow: hidden;
      }
      #pz-hero-bg {
        position: absolute; inset: 0;
        background-position: center; background-size: cover; background-repeat: no-repeat;
      }
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

      /* ── 버디 자리 (docs/06 §7) ──
         홈을 크게 바꾸지 않는다. **한쪽에 작게** 둔다 — 여기 주인공은 게임 고르기다.
         자리는 **포스터 왼쪽 옆.** 처음엔 히어로 오른쪽 아래 구석에 뒀는데,
         바로 밑 35px에 [☷ 전체 보기]가 있었다. 세로로 인접한 두 머무르기 타겟은
         이 프로젝트가 이미 한 번 밟은 지뢰다(파일 머리말 "왜 좌우 하나뿐인가").
         1.2초 겨누는 동안 손이 조금만 올라가면 버디로 튄다.
         포스터와는 **가로로** 이웃하고, 위아래로는 헤더·레일에서 멀다.
         오프셋이 포스터의 크기 식을 그대로 쓰는 이유 — 포스터가 커지면 같이 비켜야 한다. */
      #pz-buddy {
        position: absolute; z-index: 3;
        right: calc(clamp(24px, 5vw, 90px) + clamp(180px, 22vw, 300px) + clamp(14px, 1.6vw, 26px));
        top: 50%; transform: translateY(-50%);
        display: none;                       /* 알을 고른 아이에게만 보인다 */
        flex-direction: column; align-items: center; gap: 4px;
        width: clamp(86px, 9vw, 118px); padding: 8px 10px 10px;
        background: rgba(21,10,46,0.55); backdrop-filter: blur(6px);
        border: 2px solid rgba(255,255,255,0.2); border-radius: 22px;
        color: #fff; font: inherit; cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.14s, border-color 0.14s, background 0.14s;
      }
      #pz-buddy.on { display: flex; }
      /* 자리를 translateY(-50%)로 잡았으니 hover/active도 그걸 이어서 써야 한다.
         transform은 덮어쓰기라 scale만 적으면 카드가 아래로 반쯤 내려간다. */
      #pz-buddy:hover { background: rgba(255,255,255,0.18); border-color: #ffd23e; transform: translateY(-50%) scale(1.05); }
      #pz-buddy:active { transform: translateY(-50%) scale(0.96); }
      #pz-buddy-art {
        position: relative; width: 100%; aspect-ratio: 1;
        display: flex; align-items: center; justify-content: center; font-size: 2rem;
      }
      #pz-buddy-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
      #pz-buddy-lv { font-size: clamp(0.72rem, 1.1vw, 0.88rem); font-weight: 900; color: #ffd23e; }
      /* 빨간 점 — **글자를 못 읽는 아이에게 "가볼 데가 생겼다"를 알리는 유일한 수단.**
         레벨이 오르거나 배지가 늘면 켜지고, /buddy에 들어가면 꺼진다. */
      #pz-buddy-dot {
        position: absolute; top: 4px; right: 6px; width: 14px; height: 14px;
        border-radius: 50%; background: #ff4d4d; border: 2px solid #150a2e;
        display: none;
      }
      #pz-buddy.news #pz-buddy-dot { display: block; }

      /* 좁거나 낮은 화면에서는 숨긴다. 게임 고르기가 먼저다 —
         포스터가 사라지는 지점과 같은 조건으로 맞춘다. */
      @media (max-width: 900px), (max-height: 620px) {
        #pz-buddy { display: none !important; }
      }

      @keyframes pzHeroIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      .pz-hero-anim { animation: pzHeroIn 0.45s ease-out; }
      @keyframes pzBgIn { from { opacity: 0.2; } to { opacity: 1; } }
      .pz-bg-anim { animation: pzBgIn 0.5s ease-out; }
      @keyframes pzPosterIn { from { opacity: 0; transform: translateY(-50%) scale(0.94); } to { opacity: 1; transform: translateY(-50%) scale(1); } }
      .pz-poster-anim { animation: pzPosterIn 0.5s ease-out; }

      /* ── 레일 ── */
      #pz-rail-sec {
        flex: none; position: relative; z-index: 5;
        background: linear-gradient(0deg, #150a2e 30%, rgba(21,10,46,0.72) 100%);
        padding-bottom: env(safe-area-inset-bottom);
      }
      #pz-rail-in {
        max-width: 1760px; margin: 0 auto;
        padding: 0 clamp(16px, 2.4vw, 36px) clamp(12px, 2vh, 22px);
      }
      #pz-rail-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; padding: clamp(8px, 1.4vh, 16px) 0 clamp(6px, 1vh, 12px);
      }
      #pz-rail-title {
        font-size: clamp(1rem, 1.9vw, 1.4rem); font-weight: 900;
        display: flex; align-items: baseline; gap: 10px;
        text-shadow: 0 2px 10px rgba(0,0,0,0.5);
      }
      #pz-rail-count { font-size: 0.72em; opacity: 0.55; font-weight: 700; }
      #pz-rail-actions { display: flex; gap: 8px; }

      #pz-rail-wrap { display: flex; align-items: stretch; gap: clamp(10px, 1.2vw, 16px); }
      /* 화살표는 카드와 **가로로** 떨어져 있다. 세로 인접이 아니라 오조준이 적다.
         손으로 겨눌 수 있어야 하므로 폭도 96px 규칙에 가깝게 잡는다. */
      .pz-arrow {
        flex: none; width: clamp(56px, 5vw, 88px);
        background: rgba(255,255,255,0.08);
        border: 2px solid rgba(255,255,255,0.16); border-radius: 20px;
        color: #fff; font-size: 1.6rem; cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.12s, opacity 0.12s;
      }
      .pz-arrow:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
      .pz-arrow:disabled { opacity: 0.28; cursor: default; }

      #pz-rail-row {
        flex: 1; min-width: 0;
        display: grid; grid-template-columns: repeat(4, 1fr);
        grid-auto-rows: max-content;   /* 전체 목록과 같은 이유 — #pz-all-grid 주석 참고 */
        gap: clamp(10px, 1.2vw, 18px);
      }
      #pz-rail-empty { grid-column: 1 / -1; opacity: 0.55; padding: 24px 0; }


      @keyframes pzRowLeft  { from { opacity: 0; transform: translateX(34px); } to { opacity: 1; transform: none; } }
      @keyframes pzRowRight { from { opacity: 0; transform: translateX(-34px); } to { opacity: 1; transform: none; } }
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
        /* 무엇이 넘치든 카드 밖으로는 나가지 않는다.
           이미지 하나가 삐져나오면 아래 카드까지 밀려 화면 전체가 어그러진다. */
        overflow: hidden;
        transition: transform 0.12s, background 0.12s, border-color 0.12s;
      }
      .pz-card:hover  { background: rgba(255,255,255,0.14); border-color: rgba(255,210,62,0.6); transform: translateY(-3px); }
      .pz-card:active { transform: scale(0.97); }
      .pz-card.selected {
        border-color: #ffd23e; background: rgba(255,210,62,0.14);
        box-shadow: 0 0 0 3px rgba(255,210,62,0.25), 0 10px 30px rgba(0,0,0,0.45);
      }
      .pz-card.selected .pz-card-title { color: #ffd23e; }
      /* 썸네일·제목·태그 모두 flex 축소를 막는다.
         카드 높이가 모자랄 때 flex가 자식을 눌러버려서 제목이 반만 보였다. */
      /* 높이는 반드시 명시한다.
         aspect-ratio + height:auto 로 두면 안쪽 img의 height:100% 가
         기준 없는 높이를 만나 원본 크기로 커지고, 카드 높이가 이미지 로드
         시점에 따라 달라진다. 값을 못 박아 두면 그 흔들림이 사라진다. */
      .pz-card-thumb {
        position: relative; flex: none; width: 100%;
        height: clamp(96px, 16vh, 170px);
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
      /* 한 줄로 자르되 **잘라낸 티가 나게** — line-clamp는 디센더(ㅑ,ㅕ의 아래)를
         먹어서 글자가 반만 보였다. 말줄임이 읽기에도 낫다. */
      .pz-card-title {
        flex: none;
        font-size: clamp(0.85rem, 1.3vw, 1.02rem); font-weight: 900;
        line-height: 1.35; min-height: 1.35em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pz-card-tags { flex: none; display: flex; flex-wrap: nowrap; overflow: hidden; gap: 5px; margin-top: auto; }
      .pz-card-tags span {
        font-size: 0.68rem; font-weight: 700; opacity: 0.8;
        background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 9999px;
      }

      /* 손 포인터가 겨누고 있는 대상 */
      .pz-hover {
        outline: 3px solid #ffd23e !important;
        outline-offset: 2px;
        background: rgba(255,210,62,0.18) !important;
      }

      /* ── 팝업 공통 ── */
      .pz-backdrop {
        position: fixed; inset: 0; z-index: 200;
        background: rgba(8,3,20,0.75); backdrop-filter: blur(4px);
        display: none; align-items: center; justify-content: center; padding: 20px;
      }
      .pz-backdrop.open { display: flex; }
      /* 둘 다 열릴 일은 없어졌지만, 같은 z-index면 **나중에 그려진 쪽**이 위로 온다.
         한 번 당한 함정이라 순서를 못 박아 둔다. */
      #pz-cat-backdrop { z-index: 210; }

      /* 카테고리 팝업 */
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

      /* ── 전체 목록 팝업 ── */
      #pz-all {
        display: flex; flex-direction: column;
        width: min(1400px, 100%); height: min(88vh, 100%);
        background: #221046; border: 3px solid rgba(255,255,255,0.18);
        border-radius: 28px; overflow: hidden;
      }
      /* 제목과 닫기는 **항상 한 줄**. 좁은 화면에서 닫기가 아래로 떨어지면
         "닫는 방법"을 찾느라 헤매게 된다. */
      #pz-all-head {
        flex: none; display: flex; align-items: center; gap: 12px;
        padding: clamp(14px, 2vh, 22px) clamp(16px, 2vw, 28px) 8px;
      }
      #pz-all-title { font-size: clamp(1.05rem, 2vw, 1.4rem); font-weight: 900; margin-right: auto; }

      /* 검색은 부모·선생님용이다. 제목 줄 아래로 내려 아이 동선에서 비켜둔다.
         접힌 카테고리 버튼도 같은 줄 **오른쪽 끝**에 붙는다 — 줄을 하나 더 쓰면
         가로로 누운 폰(세로 400px)에서 목록이 설 자리가 없어진다. */
      #pz-all-search-row {
        flex: none; display: flex; align-items: center; gap: 12px;
        padding: 0 clamp(16px, 2vw, 28px) 10px;
      }
      #pz-search {
        flex: 1 1 auto; min-width: 0; display: block; max-width: 420px;
        min-height: 52px; padding: 0 18px; border-radius: 9999px;
        background: rgba(0,0,0,0.35); border: 2px solid rgba(255,255,255,0.2);
        color: #fff; font: inherit; font-size: 1rem;
      }
      #pz-search::placeholder { color: rgba(255,255,255,0.4); }
      #pz-search:focus { outline: none; border-color: #ffd23e; }

      /* 카테고리 — 넓은 화면에서는 칩을 한 줄로 늘어놓고 가로 스크롤,
         좁은 화면에서는 버튼 하나로 접어 카테고리 팝업을 연다.
         (칩이 여러 줄로 쌓이면 정작 게임 목록이 설 자리가 없어진다) */
      #pz-chips {
        flex: none; display: flex; gap: 8px;
        overflow-x: auto; scrollbar-width: none;
        padding: 0 clamp(16px, 2vw, 28px) 4px;   /* 나머지 8px는 그리드의 padding-top */
      }
      #pz-chips::-webkit-scrollbar { height: 0; }
      #pz-chips .pz-chip { flex: none; }

      /* 접힌 카테고리 = 셀렉트 박스.
         **팝업을 또 띄우지 않는다.** 전체 보기 팝업 위에 두 번째 모달을 얹으면
         겹침 순서·닫기 순서·손 커서 타겟이 전부 두 겹이 된다(실제로 뒤에 열려서
         안 열린 줄 알았다). 버튼 바로 아래로 펼치는 목록이면 그럴 일이 없다. */
      #pz-cat-select { position: relative; flex: none; margin-left: auto; display: none; }
      #pz-chips-btn { width: 100%; }
      #pz-chips-btn[aria-expanded="true"] { border-color: #ffd23e; }
      #pz-chips-btn[aria-expanded="true"] #pz-chips-caret { transform: rotate(180deg); }
      #pz-chips-caret { display: inline-block; transition: transform 0.15s; }
      #pz-cat-drop {
        position: absolute; top: calc(100% + 8px); right: 0; z-index: 20;
        display: none; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
        gap: 8px; width: min(560px, calc(100vw - 56px));
        max-height: min(340px, 52vh); overflow-y: auto; scrollbar-width: none;
        padding: 10px; border-radius: 20px;
        background: #2b1655; border: 2px solid rgba(255,255,255,0.22);
        box-shadow: 0 18px 44px rgba(0,0,0,0.55);
      }
      #pz-cat-drop::-webkit-scrollbar { width: 0; }
      #pz-cat-drop.open { display: grid; }
      .pz-cat-opt {
        display: flex; align-items: center; gap: 10px;
        min-height: 56px; padding: 0 14px;
        background: rgba(255,255,255,0.07);
        border: 2px solid rgba(255,255,255,0.14); border-radius: 14px;
        color: #fff; font: inherit; font-weight: 800; font-size: 0.95rem;
        text-align: left; cursor: pointer; -webkit-tap-highlight-color: transparent;
        transition: background 0.12s, border-color 0.12s;
      }
      .pz-cat-opt:hover { background: rgba(255,255,255,0.16); }
      .pz-cat-opt.on { border-color: #ffd23e; background: rgba(255,210,62,0.18); }
      .pz-cat-opt .n { margin-left: auto; opacity: 0.6; font-size: 0.85em; }
      .pz-chip {
        min-height: 48px; padding: 0 16px; border-radius: 9999px;
        background: rgba(255,255,255,0.08); border: 2px solid rgba(255,255,255,0.16);
        color: #fff; font: inherit; font-weight: 800; font-size: 0.92rem;
        cursor: pointer; -webkit-tap-highlight-color: transparent;
      }
      .pz-chip.on { border-color: #ffd23e; background: rgba(255,210,62,0.18); }

      #pz-all-body { flex: 1; min-height: 0; display: flex; gap: 10px; padding: 0 clamp(16px, 2vw, 28px) clamp(14px, 2vh, 22px); }
      #pz-all-grid {
        flex: 1; min-width: 0; overflow-y: auto;
        display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        /* grid-auto-rows를 반드시 못 박는다.
           높이가 정해진(overflow:auto) 그리드 안에서 auto 행은 컨테이너 높이를
           행 개수만큼 **똑같이 나눠 가졌다**. 카드 내용은 255px인데 행이 147px로
           잘렸고, 카드의 overflow:hidden이 넘친 제목·태그를 그대로 먹어버렸다.
           그래서 화면에는 썸네일만 남았다. max-content면 행이 내용만큼 자란다. */
        grid-auto-rows: max-content;
        gap: clamp(10px, 1.2vw, 18px); align-content: start;
        /* hover하면 카드가 3px 떠오른다. 스크롤 컨테이너는 **패딩 박스 경계**에서
           자르므로, 위에 여유를 안 주면 맨 윗줄만 머리가 잘려 보인다.
           그만큼 위 요소(칩 줄)의 아래 여백을 줄여 전체 간격은 그대로 둔다. */
        padding-top: 8px;
        scrollbar-width: none;
      }
      #pz-all-grid::-webkit-scrollbar { width: 0; }
      /* 팝업은 한 화면에 여러 줄을 보여주는 곳이다. 레일보다 썸네일을 낮게 잡아야
         스크롤 없이 세 줄이 들어온다(손 제스처 스크롤은 느리다). */
      #pz-all-grid .pz-card-thumb { height: clamp(92px, 12vh, 150px); }
      #pz-all-empty { grid-column: 1 / -1; opacity: 0.55; text-align: center; padding: 40px 0; }

      /* 세로 스크롤 레일 — 카드와 가로로 떨어져 있어 손으로 겨눠도 안 겹친다.
         높이는 **고정하지 않는다.** 96px 두 개 + 간격이 본문 높이보다 크면
         justify-content:center가 버튼을 위로 밀어내 카테고리 줄과 겹쳐 보였다
         (가로로 누운 폰에서 실제로 그랬다). 남은 높이를 나눠 갖게 한다. */
      #pz-all-scroll {
        flex: none; min-height: 0; display: flex; flex-direction: column;
        justify-content: center; gap: 12px;
      }
      .pz-scroll-btn {
        flex: 1 1 0; min-height: 48px; max-height: clamp(96px, 14vh, 140px);
        width: clamp(56px, 4.5vw, 80px);
        background: rgba(255,255,255,0.08);
        border: 2px solid rgba(255,255,255,0.16); border-radius: 20px;
        color: #fff; font-size: 1.5rem; cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .pz-scroll-btn:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
      .pz-scroll-btn:disabled { opacity: 0.28; cursor: default; }

      /* ── 토스트 ── */
      #pz-toast {
        position: fixed; left: 50%; bottom: clamp(96px, 14vh, 140px); transform: translateX(-50%);
        z-index: 300; padding: 12px 22px; border-radius: 9999px;
        background: rgba(0,0,0,0.8); font-size: 0.95rem; font-weight: 700;
        opacity: 0; pointer-events: none; transition: opacity 0.2s;
      }
      #pz-toast.on { opacity: 1; }

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
        /* 레일은 **한 줄**이어야 한다. 2열로 줄이면서 4개를 넣으면 두 줄로 쌓여
           세로 이동이 다시 생긴다 — perPage를 함께 2로 줄인다(JS). */
        #pz-rail-row { grid-template-columns: repeat(2, 1fr); }
        #pz-cat-list { grid-template-columns: 1fr; }
        #pz-all-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
        .pz-arrow { width: clamp(44px, 12vw, 60px); }
      }

      /* 칩 한 줄을 접는 조건은 **폭만이 아니다.**
         가로로 누운 폰(932×400)은 폭은 넉넉한데 세로가 400px이라, 칩 한 줄이
         목록과 ▲▼ 버튼의 자리를 통째로 먹었다. 접은 버튼은 검색창과 같은 줄
         오른쪽 끝에 붙어서 줄을 새로 만들지 않는다. */
      @media (max-width: 900px), (max-height: 620px) {
        #pz-chips { display: none; }
        #pz-cat-select { display: block; }
      }

      /* 가로로 누운 폰 — 세로가 귀하다. 머리글 여백과 썸네일을 함께 줄인다 */
      @media (max-height: 620px) {
        .pz-backdrop { padding: 10px; }
        #pz-all { height: 100%; }
        #pz-all-head { padding-top: clamp(10px, 2vh, 16px); padding-bottom: 4px; }
        #pz-all-search-row { padding-bottom: 6px; }
        #pz-all-grid .pz-card-thumb { height: clamp(70px, 20vh, 110px); }
      }
      /* 400px짜리 세로에서는 한 줄 반밖에 안 보인다. 태그를 접어 한 줄을 더 번다.
         고르는 데 꼭 필요한 건 썸네일과 이름이고, 태그는 카테고리 버튼이 대신한다. */
      @media (max-height: 480px) {
        .pz-card-tags { display: none; }
      }

      /* 가로로 눕힌 폰처럼 세로가 짧으면 히어로 글자가 헤더와 겹친다 */
      @media (max-height: 480px) {
        #pz-hero-inner { padding-top: 68px; }
        #pz-hero-desc { display: none; }
        #pz-hero-title { font-size: clamp(1.2rem, 3.4vw, 1.8rem); }
      }
      @media (prefers-reduced-motion: reduce) {
        .pz-hero-anim, .pz-bg-anim, .pz-poster-anim, .pz-row-left, .pz-row-right { animation: none; }
      }
    </style>

    <div id="pz-hub">
      <header id="pz-head">
        <button id="pz-logo">PLAY ZERA</button>
        <div id="pz-head-right">
          <button class="pz-btn" id="pz-hand" data-pz-hit data-pz-dwell="${DWELL_CAT}">✋ <span id="pz-hand-label">손으로 고르기</span></button>
          <button class="pz-btn" id="pz-account">👤 <span>제라</span></button>
          <button class="pz-btn" id="pz-menu">☰</button>
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
        <button id="pz-buddy" data-pz-hit data-pz-dwell="${DWELL_CAT}">
          <span id="pz-buddy-dot"></span>
          <span id="pz-buddy-art"></span>
          <span id="pz-buddy-lv"></span>
        </button>
      </section>

      <section id="pz-rail-sec">
        <div id="pz-rail-in">
          <div id="pz-rail-head">
            <div id="pz-rail-title">
              <span id="pz-rail-label">게임</span>
              <span id="pz-rail-count"></span>
            </div>
            <div id="pz-rail-actions">
              <button class="pz-btn" id="pz-filter" data-pz-hit data-pz-dwell="${DWELL_CAT}">⚙ <span id="pz-filter-label">전체</span> ▾</button>
              <button class="pz-btn" id="pz-open-all" data-pz-hit data-pz-dwell="${DWELL_CAT}">☷ 전체 보기</button>
            </div>
          </div>
          <div id="pz-rail-wrap">
            <button class="pz-arrow" id="pz-prev" aria-label="이전" data-pz-hit data-pz-dwell="${DWELL_NAV}">◀</button>
            <div id="pz-rail-row"></div>
            <button class="pz-arrow" id="pz-next" aria-label="다음" data-pz-hit data-pz-dwell="${DWELL_NAV}">▶</button>
          </div>
        </div>
      </section>
    </div>

    <div class="pz-backdrop" id="pz-cat-backdrop">
      <div id="pz-cat">
        <h2>어떤 운동을 해볼까?</h2>
        <div id="pz-cat-list"></div>
      </div>
    </div>

    <div class="pz-backdrop" id="pz-all-backdrop">
      <div id="pz-all">
        <div id="pz-all-head">
          <div id="pz-all-title">전체 게임 <span id="pz-all-count"></span></div>
          <button class="pz-btn" id="pz-all-close" data-pz-hit data-pz-dwell="${DWELL_CAT}">✕ 닫기</button>
        </div>
        <div id="pz-all-search-row">
          <input id="pz-search" type="search" placeholder="게임 이름·태그 검색" autocomplete="off" />
          <div id="pz-cat-select">
            <button class="pz-btn" id="pz-chips-btn" aria-haspopup="listbox" aria-expanded="false" data-pz-hit data-pz-dwell="${DWELL_CAT}">⚙ <span id="pz-chips-label">전체</span> <span id="pz-chips-caret">▾</span></button>
            <div id="pz-cat-drop" role="listbox"></div>
          </div>
        </div>
        <div id="pz-chips"></div>
        <div id="pz-all-body">
          <div id="pz-all-grid"></div>
          <div id="pz-all-scroll">
            <button class="pz-scroll-btn" id="pz-all-up" aria-label="위로" data-pz-hit data-pz-dwell="${DWELL_NAV}">▲</button>
            <button class="pz-scroll-btn" id="pz-all-down" aria-label="아래로" data-pz-hit data-pz-dwell="${DWELL_NAV}">▼</button>
          </div>
        </div>
      </div>
    </div>

    <div id="pz-toast"></div>
  `

  const $ = sel => app.querySelector(sel)
  const hub = $('#pz-hub')
  const rowEl = $('#pz-rail-row')
  const heroBg = $('#pz-hero-bg')
  const heroVideo = $('#pz-hero-video')
  const heroPoster = $('#pz-hero-poster')
  const heroPosterImg = heroPoster.querySelector('img')
  const heroInner = $('#pz-hero-inner')
  const catBackdrop = $('#pz-cat-backdrop')
  const allBackdrop = $('#pz-all-backdrop')
  const allGrid = $('#pz-all-grid')

  const anyPopupOpen = () =>
    catBackdrop.classList.contains('open') || allBackdrop.classList.contains('open')

  // ── 토스트 ──
  const toastEl = $('#pz-toast')
  let toastTimer = null
  const toast = msg => {
    toastEl.textContent = msg
    toastEl.classList.add('on')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1600)
  }

  // ── 선택 / 실행 ──
  function selectGame(id) {
    if (!byId[id]) return
    selectedId = id
    clearInterval(heroTimer)
    heroTimer = null
    const i = featured.findIndex(f => f.id === id)
    if (i >= 0) heroIdx = i
    renderHero()
    syncSelected()
  }

  function syncSelected() {
    app.querySelectorAll('.pz-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.id === selectedId)
    })
  }

  function openGame(id) {
    if (byId[id]?.placeholder) {
      markPlayed(id)
      refreshRail()
      toast('아직 준비 중인 게임이에요')
      return
    }
    navigate(getEntry(id))
  }

  // 카드 한 장에 붙는 동작.
  //
  //   올려놓기(마우스 hover · 손 커서 진입) → 히어로 즉시 변경
  //   손 머무르기 완료                     → 어디서든 바로 실행
  //   마우스 클릭 — 레일에서는 선택, **전체 보기 팝업에서는 실행** (launch)
  //
  // 손으로 "카드에서 1.2초 → 히어로로 옮겨 다시 1.2초"는 너무 멀다.
  // 이미 1.2초를 겨눴다는 것 자체가 충분히 분명한 의사표시다.
  //
  // 팝업에서만 클릭이 실행인 이유 — 그 화면에는 **히어로가 안 보인다.**
  // 선택만 하고 팝업이 닫히면 "누른 결과"가 어디에도 안 보인 채 홈으로 돌아가고,
  // 시작하려면 다시 시작하기를 눌러야 한다. 자유 스크롤을 폐기했던 이유와 같은
  // 문제다(선택의 결과가 안 보인다). 게다가 손 머무르기는 이미 바로 실행이라
  // 클릭만 다르게 두면 같은 카드가 입력 수단에 따라 다르게 동작하게 된다.
  // 전체 보기는 '고르러 들어간' 화면이니 잘못 눌러 게임이 켜질 걱정도 적다.
  function armCards(root, { launch = false } = {}) {
    root.querySelectorAll('.pz-card-thumb img').forEach(img => {
      img.addEventListener('error', () => { img.style.visibility = 'hidden' })
    })
    root.querySelectorAll('.pz-card').forEach(card => {
      const id = card.dataset.id
      card.addEventListener('mouseenter', () => selectGame(id))
      card.addEventListener('pz-pointer-enter', () => selectGame(id))
      card.addEventListener('click', () => {
        selectGame(id)
        if (launch) { closeAll(); openGame(id) }
      })
      card.addEventListener('pz-dwell', e => {
        e.preventDefault()
        selectGame(id)
        closeAll()
        openGame(id)
      })
    })
    syncSelected()
  }

  // ── 레일 ────────────────────────────────────────────────────
  function refreshRail({ keepPage = true } = {}) {
    const recentIds = getRecentIds(id => !!byId[id]).slice(0, RECENT_MAX)
    rail = buildRail({ all, recentIds, filter })
    const pages = railPageCount(rail, perPage())
    railPage = keepPage ? Math.min(railPage, pages - 1) : 0
    renderRail()
  }

  function renderRail(dir = 0) {
    const per = perPage()
    const pages = railPageCount(rail, per)
    railPage = Math.max(0, Math.min(railPage, pages - 1))
    const items = rail.slice(railPage * per, railPage * per + per)

    $('#pz-rail-label').textContent = filter ? `${filter} 게임` : '게임'
    $('#pz-rail-count').textContent = rail.length ? `${rail.length}개 · ${railPage + 1}/${pages}` : ''
    $('#pz-filter-label').textContent = filter ?? '전체'

    rowEl.innerHTML = items.length
      ? items.map(m => cardHTML(m)).join('')
      : `<p id="pz-rail-empty">이 분류에는 아직 게임이 없어요.</p>`
    armCards(rowEl)

    $('#pz-prev').disabled = railPage <= 0
    $('#pz-next').disabled = railPage >= pages - 1

    rowEl.classList.remove('pz-row-left', 'pz-row-right')
    if (dir !== 0) {
      void rowEl.offsetWidth
      rowEl.classList.add(dir > 0 ? 'pz-row-left' : 'pz-row-right')
    }
  }

  function goRail(delta) {
    const pages = railPageCount(rail, perPage())
    const next = Math.max(0, Math.min(pages - 1, railPage + delta))
    if (next === railPage) return
    railPage = next
    renderRail(delta)
  }

  $('#pz-prev').addEventListener('click', () => goRail(-1))
  $('#pz-next').addEventListener('click', () => goRail(1))

  // ── 히어로 ──────────────────────────────────────────────────
  const heroGame = () => (selectedId ? byId[selectedId] : featured[heroIdx])

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
      if (heroGame()?.id !== m.id) return
      heroVideo.src = m.heroVideo
      heroVideo.play()
        .then(() => { if (heroGame()?.id === m.id) heroVideo.classList.add('on') })
        .catch(() => stopHeroVideo())
    }, HERO_VIDEO_DELAY)
  }

  function renderHero() {
    const m = heroGame()
    if (!m) return

    heroBg.style.backgroundImage = `url('${m.hero ?? m.thumbnail}')`
    heroBg.classList.toggle('fallback', !m.hero)
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

  function restartHeroTimer() {
    clearInterval(heroTimer)
    heroTimer = null
    if (selectedId || featured.length < 2) return
    heroTimer = setInterval(() => {
      heroIdx = (heroIdx + 1) % featured.length
      renderHero()
    }, HERO_INTERVAL)
  }

  $('#pz-hero-play').addEventListener('click', () => openGame(heroGame()?.id))
  $('#pz-hero').addEventListener('mouseenter', () => clearInterval(heroTimer))
  $('#pz-hero').addEventListener('mouseleave', restartHeroTimer)

  // ── 전체 목록 팝업 ──────────────────────────────────────────
  function renderAll() {
    const list = buildRail({ all, recentIds: [], filter, query })
    $('#pz-all-count').textContent = `${list.length}개`
    allGrid.innerHTML = list.length
      ? list.map(m => cardHTML(m)).join('')
      : `<p id="pz-all-empty">찾는 게임이 없어요.</p>`
    armCards(allGrid, { launch: true })
    syncAllScrollBtns()
  }

  function renderChips() {
    $('#pz-chips').innerHTML = categories.map(c => {
      const on = (c.key ?? null) === filter
      return `<button class="pz-chip ${on ? 'on' : ''}" data-key="${c.key ?? ''}" data-pz-hit data-pz-dwell="${DWELL_CAT}">
                ${c.emoji} ${c.label} ${c.n}
              </button>`
    }).join('')
    $('#pz-chips').querySelectorAll('.pz-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        filter = chip.dataset.key || null
        renderChips()
        renderAll()
        renderRail()
      })
    })
    $('#pz-chips-label').textContent = filter ?? '전체'
  }

  // 좁은 화면에서는 칩 대신 셀렉트 박스 — 버튼 **바로 아래로** 펼친다.
  //
  // 네이티브 <select>를 쓰지 않는 이유: 열리는 목록이 **OS가 그리는 창**이라
  // 우리 손 커서가 닿지 않는다(화면 위 요소가 아니다). 같은 이유로 커서 좌표로는
  // 항목을 고를 수도 없다. 우리가 그리는 목록이어야 손으로 쓸 수 있다.
  //
  // 카테고리 팝업(모달)을 재활용하지 않는 이유: 전체 보기 팝업 위에 두 번째 모달을
  // 얹는 꼴이 된다. 둘 다 z-index가 같아서 나중에 그려진 전체 보기가 위를 덮었고,
  // 카테고리 목록이 **뒤에서 열려** 아무 일도 안 일어난 것처럼 보였다.
  // z-index로 순서를 맞춰도 닫기 순서·손 커서 타겟이 두 겹으로 남는다.
  const catDrop = $('#pz-cat-drop')
  const catBtn = $('#pz-chips-btn')

  function renderCatDrop() {
    catDrop.innerHTML = categories.map(c => {
      const on = (c.key ?? null) === filter
      return `<button class="pz-cat-opt ${on ? 'on' : ''}" role="option" aria-selected="${on}"
                      data-key="${c.key ?? ''}" data-pz-hit data-pz-dwell="${DWELL_CAT}">
                <span>${c.emoji}</span><span>${c.label}</span><span class="n">${c.n}</span>
              </button>`
    }).join('')
    catDrop.querySelectorAll('.pz-cat-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        filter = opt.dataset.key || null
        closeCatDrop()
        renderChips()      // 라벨(⚙ 전체 ▾)도 여기서 갱신된다
        renderAll()
        refreshRail({ keepPage: false })
      })
    })
  }

  const catDropOpen = () => catDrop.classList.contains('open')
  function openCatDrop() {
    renderCatDrop()
    catDrop.classList.add('open')
    catBtn.setAttribute('aria-expanded', 'true')
    catDrop.scrollTop = 0
  }
  function closeCatDrop() {
    catDrop.classList.remove('open')
    catBtn.setAttribute('aria-expanded', 'false')
  }
  catBtn.addEventListener('click', e => {
    e.stopPropagation()   // 아래 "바깥 누르면 닫기"가 곧바로 되받지 않도록
    catDropOpen() ? closeCatDrop() : openCatDrop()
  })
  // 바깥을 누르면 닫는다. 목록 안(카테고리 고르기)은 자기 핸들러가 처리한다.
  allBackdrop.addEventListener('click', e => {
    if (catDropOpen() && !catDrop.contains(e.target)) closeCatDrop()
  })
  // 목록이 열린 채로 스크롤하면 버튼과 따로 논다 → 그냥 닫는다
  allGrid.addEventListener('scroll', () => { if (catDropOpen()) closeCatDrop() }, { passive: true })

  const rowStep = () => {
    const card = allGrid.querySelector('.pz-card')
    return card ? card.getBoundingClientRect().height + 18 : allGrid.clientHeight * 0.6
  }
  function syncAllScrollBtns() {
    const atTop = allGrid.scrollTop <= 1
    const atBottom = allGrid.scrollTop + allGrid.clientHeight >= allGrid.scrollHeight - 1
    $('#pz-all-up').disabled = atTop
    $('#pz-all-down').disabled = atBottom
  }
  $('#pz-all-up').addEventListener('click', () => allGrid.scrollBy({ top: -rowStep(), behavior: 'smooth' }))
  $('#pz-all-down').addEventListener('click', () => allGrid.scrollBy({ top: rowStep(), behavior: 'smooth' }))
  allGrid.addEventListener('scroll', syncAllScrollBtns, { passive: true })

  const searchEl = $('#pz-search')
  searchEl.addEventListener('input', () => { query = searchEl.value; renderAll() })

  function openAll() {
    closeCatDrop()
    renderChips()
    renderAll()
    allBackdrop.classList.add('open')
    allGrid.scrollTop = 0
  }
  function closeAll() {
    closeCatDrop()
    allBackdrop.classList.remove('open')
  }
  $('#pz-open-all').addEventListener('click', openAll)
  $('#pz-all-close').addEventListener('click', closeAll)
  allBackdrop.addEventListener('click', e => { if (e.target === allBackdrop) closeAll() })

  // ── 카테고리 팝업 ───────────────────────────────────────────
  // 닫기 버튼은 두지 않는다. "전체"가 곧 닫기이자 초기화 — 03 설계 §카테고리 팝업.
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
        catBackdrop.classList.remove('open')
        refreshRail({ keepPage: false })
        // 전체 목록이 열려 있는 채로 카테고리를 골랐다면 그쪽도 같이 바꾼다
        if (allBackdrop.classList.contains('open')) { renderChips(); renderAll() }
      })
    })
  }
  $('#pz-filter').addEventListener('click', () => {
    renderCategories()
    catBackdrop.classList.add('open')
  })
  catBackdrop.addEventListener('click', e => {
    if (e.target === catBackdrop) catBackdrop.classList.remove('open')
  })

  // ── 입력 ────────────────────────────────────────────────────
  // 휠·방향키·스와이프 전부 좌우 한 방향이다. 세로 이동이 없어졌다.
  const onWheel = e => {
    if (anyPopupOpen()) return
    e.preventDefault()
    const now = performance.now()
    if (now < wheelLockedUntil) return
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (Math.abs(d) < 8) return
    wheelLockedUntil = now + WHEEL_COOLDOWN
    goRail(d > 0 ? 1 : -1)
  }
  hub.addEventListener('wheel', onWheel, { passive: false })

  const onKey = e => {
    if (allBackdrop.classList.contains('open')) {
      // 안쪽부터 닫는다 — 카테고리 목록이 열려 있으면 그것부터
      if (e.key === 'Escape') catDropOpen() ? closeCatDrop() : closeAll()
      return
    }
    if (catBackdrop.classList.contains('open')) {
      if (e.key === 'Escape') catBackdrop.classList.remove('open')
      return
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goRail(1) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goRail(-1) }
    else if (e.key === 'Home') { e.preventDefault(); railPage = 0; renderRail(-1) }
    else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      openGame(heroGame()?.id)
    }
  }
  window.addEventListener('keydown', onKey)

  // 회전·창 크기 변경 시 한 줄에 놓을 개수가 달라진다
  let resizeTimer = null
  const onResize = () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => renderRail(), 150)
  }
  window.addEventListener('resize', onResize)

  let touch = null
  hub.addEventListener('touchstart', e => {
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, { passive: true })
  hub.addEventListener('touchend', e => {
    if (!touch || anyPopupOpen()) { touch = null; return }
    const t = e.changedTouches[0]
    const dx = touch.x - (t?.clientX ?? touch.x)
    const dy = touch.y - (t?.clientY ?? touch.y)
    touch = null
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return
    goRail((Math.abs(dx) > Math.abs(dy) ? dx : dy) > 0 ? 1 : -1)
  }, { passive: true })

  // ── 손 포인터 ───────────────────────────────────────────────
  // 켜고 끄는 판단과 오류 문구는 core/handControl.js가 가진다.
  // 인트로·튜토리얼도 같은 것을 쓴다 — 화면마다 다른 안내가 뜨면 안 된다.
  const offHandChange = bindHandButton({
    el: $('#pz-hand'),
    labelEl: $('#pz-hand-label'),
    onToast: toast,
  })

  // ── 버디 자리 ───────────────────────────────────────────────
  // 홈은 버디를 **모른다.** 상태를 물어보고 그림 하나를 그릴 뿐이라
  // 버디가 3종이든 30종이든, 단계가 넷이든 여덟이든 여기 코드는 그대로다.
  function renderBuddy() {
    const el = $('#pz-buddy')
    if (!hasStarted()) return           // 아직 알을 안 골랐다 — 자리를 만들지 않는다

    const s = getProgress()
    const lv = levelFromTotals(s.totals)
    const stage = currentStage(s.buddyId, lv.level, s.buddyStage)
    const src = stage ? buddyImage(s.buddyId, stage.image) : null

    // 그림이 아직 없는 버디가 있다. **빈 칸이 되면 안 된다** — 이모지가 받친다.
    $('#pz-buddy-art').innerHTML = `
      <span>${stage?.id === 'egg' ? '🥚' : '🐣'}</span>
      ${src ? `<img src="${src}" alt="" onload="this.previousElementSibling?.remove()" onerror="this.remove()" />` : ''}`
    $('#pz-buddy-lv').textContent = `LV.${lv.level}`
    el.classList.toggle('news', buddyNews(s))
    el.classList.add('on')
  }
  renderBuddy()

  const goBuddy = () => navigate('/buddy')
  $('#pz-buddy').addEventListener('click', goBuddy)
  $('#pz-buddy').addEventListener('pz-dwell', e => { e.preventDefault(); goBuddy() })

  // ── 헤더 ────────────────────────────────────────────────────
  $('#pz-logo').addEventListener('click', () => { railPage = 0; renderRail(-1) })
  // 👤 제라 = **부모 화면 입구**(docs/06 §5). 아이 선택(계정)은 그 뒤에 붙는다.
  $('#pz-account').addEventListener('click', () => navigate('/me'))
  $('#pz-menu').addEventListener('click', () => toast('설정 메뉴는 준비 중이에요'))

  // ── 정리 ────────────────────────────────────────────────────
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
    clearTimeout(resizeTimer)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', onResize)
  })

  refreshRail({ keepPage: false })
  renderHero()
  restartHeroTimer()
  handSession.setPointerActive(true)
  // 라벨 동기화는 bindHandButton이 handSession.onChange로 걸어뒀다
  handSession.resumeIfPreferred()
}

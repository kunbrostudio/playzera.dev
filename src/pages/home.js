// 허브 홈 — 고정 히어로 + 한 줄 좌우 레일.
//
// ┌──────────────────────────────────────────────────────────┐
// │  PLAY ZERA               [손][제라][메뉴]                 │
// │                                                          │
// │   4-8세 · 순발력           [ 선택된 게임 비주얼 ]        │  ← 고정
// │   똥 피하기                                              │
// │   [▶ 시작하기]                                           │
// ├──────────────────────────────────────────────────────────┤
// │  게임 20   1/5           [⚙ 전체 ▾]  [☷ 전체 보기]      │
// │ ▒┌────┐┌────┐┌────┐┌────┐▒                              │  ← 좌우로만 움직인다
// └──────────────────────────────────────────────────────────┘
//   ▒ = 다음/이전 카드가 살짝 걸쳐 보인다 (버튼 없음)
//
// 왜 좌우 하나뿐인가
//   이전에는 '이어서 하기'(좌우)와 '전체 게임'(세로 페이지) 두 축이 섞여 있었고,
//   세로 이동 버튼이 카드 줄 **바로 아래** 붙어 있었다. 카드를 1.2초 겨누는 동안
//   손이 조금만 내려가면 그 버튼에 걸린다. 세로로 인접한 두 타겟은 머무르기와 상극이다.
//
//   목록 순서는 "최근에 한 것 먼저, 그다음 나머지".
//
// 왜 좌우 화살표가 없나
//   버튼은 카드와 가까이 있으면 오조준되고, 멀리 두면 못 찾는다. 대신 양 끝에
//   다음/이전 카드를 살짝 잘라 보여준다(`.pz-peek`) — "더 있다"를 버튼 없이
//   안다. 넘기는 길은 넷: 휠 · 터치 스와이프 · 방향키 · 손 스와이프
//   (끝에 손이 닿아야 무장되고 반대로 당겨야 확정된다 — `core/edgeSwipe.js`) —
//   전부 `goRail()` 하나로 모인다.
//
// 게임이 많아지면
//   좌우 레일은 개수에 약하다(20개면 5쪽, 100개면 25쪽). 그래서 [☷ 전체 보기]로
//   격자 목록을 따로 연다. 거기에는 검색·카테고리·세로 스크롤이 있다.
//   **검색은 부모·선생님용이다** — 아이는 키보드를 못 쓰고 손 제스처로도 불가능하다.

import { icon } from '../core/icons.js'
import { navigate, onLeave } from '../core/router.js'
import { getAll, getEntry } from '../games/registry.js'
import { getRecentIds, markPlayed } from '../core/recent.js'
import { handSession } from '../core/handSession.js'
import { bindHandButton } from '../core/handControl.js'
import { bindRemoteButton } from '../core/remote/bindRemoteButton.js'
import {
  PER_PAGE, RECENT_MAX,
  isNew, playersLabel, buildCategories, buildFeatured,
  buildRail, searchGames, railPageCount,
} from '../core/catalog.js'

// 머무르기 시간 — 03 설계 §머무르기 시간
const DWELL_CARD = 1200   // 게임 카드: 잘못 누르면 게임이 바뀐다
const DWELL_NAV  = 500    // 스크롤 버튼 등: 되돌리기 쉽다
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

// 화살표 대신 쓰는 "다음/이전 카드가 살짝 걸쳐 보인다" 조각.
// 누를 수 있는 게 아니라서 `<button>`도 `data-pz-hit`도 없다 — 지금 페이지가
// 아닌 카드가 눌리면 더 헷갈린다. 썸네일만 있으면 "이어진다"는 느낌은 충분하다.
const peekHTML = m => m
  ? `<div class="pz-card"><div class="pz-card-thumb"><img src="${m.thumbnail}" alt="" /></div></div>`
  : ''

export function homePage(app) {
  // 허브는 무음이다. **끄는 건 라우터가 한다**(core/router.js의 GAME_ROUTES) —
  // 화면마다 각자 끄면 켜는 쪽과 순서가 엉킨다.

  const all = getAll()
  const byId = Object.fromEntries(all.map(m => [m.id, m]))
  const categories = buildCategories(all)
  const featured = buildFeatured(all, HERO_MAX)

  // 레일에 한 번에 몇 장을 놓을지 — CSS의 #pz-rail-row 열 수와 반드시
  // 같이 간다. 어긋나면 카드가 두 줄로 쌓여서 "좌우 한 방향" 원칙이 깨진다.
  //
  // 예전엔 900px 하나로만 2/4를 갈랐다. 그런데 가로로 누운 폰(예: 844×390)도
  // 폭이 900 이하라 세로로 선 좁은 폰(예: 390×844)과 똑같이 2개 취급을 받았다
  // — 가로 공간은 넉넉한데 아깝게 2개만 보였다(ken 지적, 909px 폭 화면과
  // 비교해서 "다르게 보인다"고 했다). 세로로 선 폰의 폭은 대개 480 아래이므로,
  // 그 위(가로로 누운 폰·작은 태블릿 세로)는 3열로 한 단계 더 준다.
  const perPage = () => {
    const w = window.innerWidth
    if (w <= 480) return 2
    if (w <= 900) return 3
    return PER_PAGE
  }

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
      /* 리모컨이 연결돼 있을 때 — 이 기기가 조종당하는 쪽이든(remoteSession)
         조종하는 쪽이든(controller) 똑같이 켠다(bindRemoteButton.js, STEP 66) */
      .pz-btn.pz-remote-live { background: #ff4d4d; border-color: transparent; color: #fff;
        animation: pz-remote-pulse 1.8s ease-in-out infinite; }
      @keyframes pz-remote-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(255,77,77,0.55); }
        50% { box-shadow: 0 0 0 9px rgba(255,77,77,0); }
      }

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
      .pz-hero-logo {
        display: block; width: auto; max-width: min(420px, 76%);
        max-height: clamp(72px, 11vh, 150px); object-fit: contain;
        filter: drop-shadow(0 8px 22px rgba(0,0,0,0.5));
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

      /* ── 손 컨트롤 카메라 미리보기를 여기로 ──
         옛 게임 썸네일(#pz-hero-poster)·버디 버튼(#pz-buddy) 자리였다. 썸네일은
         레일에도 같은 그림이 있어 중복이라 없앴고, 버디는 /me의 공룡 섹션으로
         옮겼다(ken 요청, 9/1). 그 자리가 비어서 카메라 미리보기(core/handSession.js의
         #pz-hand-pip, 전역 고정 위치)를 여기로 끌어왔다 — 기본 위치(헤더 아래
         오른쪽 위)는 다른 화면 몫으로 그대로 두고, :has()로 홈에 한정해 덮어쓴다. */
      /* 좁은 화면(1100px 이하)에서는 안 옮긴다 — 옛 포스터가 그 지점에서
         사라지던 것과 같은 기준. 히어로 오른쪽에 그만한 자리가 없다. */
      @media (min-width: 1101px) {
        body:has(#pz-hub) #pz-hand-pip {
          top: 50%; bottom: auto; right: clamp(24px, 5vw, 90px);
          transform: translateY(-50%);
          width: clamp(180px, 22vw, 300px); height: auto; aspect-ratio: 16 / 10;
          border-radius: 20px; border: 3px solid rgba(255,255,255,0.22);
          box-shadow: 0 20px 60px rgba(0,0,0,0.55);
        }
      }

      @keyframes pzHeroIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      .pz-hero-anim { animation: pzHeroIn 0.45s ease-out; }
      @keyframes pzBgIn { from { opacity: 0.2; } to { opacity: 1; } }
      .pz-bg-anim { animation: pzBgIn 0.5s ease-out; }

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

      #pz-rail-wrap { display: flex; align-items: stretch; position: relative; }

      /* 양 끝 "다음/이전 카드가 살짝 걸쳐 보인다" — 버튼 없이도 더 있다는 걸 안다.
         실제 카드 컴포넌트를 축소해 절반쯤 잘려 보이게 두고, 안쪽(진짜 카드와
         맞닿는 쪽)은 배경으로 흐려지게 해 이어지는 느낌을 준다. 누를 수 없다
         (aria-hidden + pointer-events: none) — 지금 페이지의 카드가 아니라서
         눌려도 아무 일이 안 나면 그게 더 헷갈린다. */
      .pz-peek {
        /* 카드 폭의 절반 안팎이 보여야 "다음 카드가 있다"는 게 실제로 읽힌다.
           너무 좁으면(20~40px) 색 테두리처럼만 보여서 안 보인다는 말이 나왔다. */
        flex: 0 0 clamp(64px, 11vw, 118px); min-width: 0;
        overflow: hidden; position: relative;
        /* 손 커서의 스와이프 판정(core/pointer.js의 EdgeSwipeGate)이 여기가
           끝(무장 자리)인지 elementFromPoint로 찾는다 — pointer-events:none이면
           찾지 못한다. 클릭 핸들러는 안 달려 있으니 눌러도 아무 일 없다. */
        pointer-events: auto;
        display: flex; align-items: stretch;
        /* 오른쪽 피크는 카드의 **왼쪽**이 보여야 한다(다음 카드가 이어지는 쪽).
           justify-content로 자식을 컨테이너 시작 쪽에 붙이면 남는 폭(카드가
           컨테이너보다 넓은 만큼)이 반대쪽으로 저절로 밀려나 잘린다. */
        justify-content: flex-start;
      }
      .pz-peek:empty { flex-basis: 0; }
      /* 진짜 카드 줄과 같은 간격으로 떨어뜨린다 — 붙어 있으면 같은 카드의
         일부처럼 보인다. 비어 있을 때는(첫/마지막 페이지) 여백도 없앤다. */
      #pz-peek-left:not(:empty) { margin-right: clamp(10px, 1.2vw, 18px); }
      #pz-peek-right:not(:empty) { margin-left: clamp(10px, 1.2vw, 18px); }
      /* 왼쪽 피크는 반대로 카드의 **오른쪽**(진짜 카드 줄에 맞닿는 쪽)이 보여야
         한다 — 그게 "이 카드가 왼쪽으로 계속된다"는 뜻이다. */
      #pz-peek-left { justify-content: flex-end; }
      .pz-peek .pz-card {
        flex: none; width: clamp(170px, 23vw, 250px);
        opacity: 0.75; cursor: default;
      }
      /* 안쪽(진짜 카드와 맞닿는 쪽)은 그대로 보이고, 바깥쪽(화면 잘리는 쪽)만
         배경으로 페이드한다 — 대부분 가려 버리면 "절반쯤 보인다"가 안 된다. */
      .pz-peek::after {
        content: ''; position: absolute; inset: 0;
        background: linear-gradient(90deg, #150a2e 0%, transparent 32%);
      }
      #pz-peek-right::after { background: linear-gradient(270deg, #150a2e 0%, transparent 32%); }

      /* 스와이프 힌트 — 손이 끝(피크)에 닿아 무장되면 뜬다. "이렇게 당기면
         넘어간다"를 화살표 방향으로 몸으로 보여준다. 눈에 띄어야 하니 커서
         링과 같은 강조색(#ffd23e)을 쓰고, 화살표는 당길 방향으로 살짝 튄다 —
         가만히 있으면 장식처럼 안 읽힌다. */
      .pz-swipe-hint {
        position: absolute; top: 50%; z-index: 8;
        transform: translateY(-50%) scale(0.8);
        display: flex; flex-direction: column; align-items: center; gap: 4px;
        min-width: 78px; padding: 10px 10px 12px; border-radius: 22px;
        background: #ffd23e; color: #3a2205;
        box-shadow: 0 10px 26px rgba(0,0,0,0.5), 0 0 0 4px rgba(255,210,62,0.3);
        opacity: 0; pointer-events: none;
        transition: opacity 0.15s ease-out, transform 0.15s ease-out;
      }
      .pz-swipe-hint.on { opacity: 1; transform: translateY(-50%) scale(1); }
      #pz-swipe-hint-left  { left: clamp(2px, 0.6vw, 10px); }
      #pz-swipe-hint-right { right: clamp(2px, 0.6vw, 10px); }
      .pz-swipe-hint svg { width: clamp(24px, 3vw, 32px); height: clamp(24px, 3vw, 32px); }
      .pz-swipe-hint span {
        font-size: 0.68rem; font-weight: 900; line-height: 1.25;
        text-align: center; white-space: nowrap;
      }
      /* 화살표는 손이 움직여야 할 방향으로 튄다 — 왼쪽 힌트(오른쪽으로 당기면
         '이전')는 오른쪽으로, 오른쪽 힌트(왼쪽으로 당기면 '다음')는 왼쪽으로. */
      #pz-swipe-hint-left svg  { animation: pzHintR 0.85s ease-in-out infinite; }
      #pz-swipe-hint-right svg { animation: pzHintL 0.85s ease-in-out infinite; }
      @keyframes pzHintR { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(7px); } }
      @keyframes pzHintL { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-7px); } }

      #pz-rail-row {
        flex: 1; min-width: 0;
        display: grid; grid-template-columns: repeat(4, 1fr);
        grid-auto-rows: max-content;   /* 전체 목록과 같은 이유 — #pz-all-grid 주석 참고 */
        gap: clamp(10px, 1.2vw, 18px);
      }
      #pz-rail-empty { grid-column: 1 / -1; opacity: 0.55; padding: 24px 0; }


      /* ken이 "이동하는 모습이 잘 보이게" 해달라고 했다 — 예전 34px·0.26s는
         손 스와이프로 넘길 때 너무 슬쩍 지나가 "넘어갔다"가 잘 안 읽혔다.
         이동 거리를 화면 폭에 비례해 키우고(clamp 48~110px), 시간도 늘리고,
         빠르게 튀어나왔다 부드럽게 멈추는 곡선(ease-out-expo류)으로 바꿔
         카드가 실제로 옆에서 밀려 들어오는 느낌을 준다. */
      @keyframes pzRowLeft  { from { opacity: 0; transform: translateX(clamp(48px, 6vw, 110px)); } to { opacity: 1; transform: none; } }
      @keyframes pzRowRight { from { opacity: 0; transform: translateX(clamp(-110px, -6vw, -48px)); } to { opacity: 1; transform: none; } }
      .pz-row-left  { animation: pzRowLeft 0.34s cubic-bezier(0.16, 1, 0.3, 1); }
      .pz-row-right { animation: pzRowRight 0.34s cubic-bezier(0.16, 1, 0.3, 1); }

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
      /* 높이는 반드시 명시한다 — 안 그러면 안쪽 img의 height:100%가 기준
         없는 높이를 만나 원본 크기로 커지고, 카드 높이가 이미지 로드
         시점에 따라 달라진다.
         전에는 16vh(뷰포트 **높이**)로 뒀는데, 폭은 그리드 칸(뷰포트 **폭**)
         에서 온다 — 폭과 높이가 서로 다른 축을 따라가니 화면 비율이 바뀔
         때마다 썸네일 박스 모양 자체가 늘어나거나 뭉개졌다(세로로 긴 폰에서는
         거의 정사각형, 가로로 누운 폰에서는 폭만 넓은 띠). ken 지적 — "비율이
         변형된 거 같다". aspect-ratio로 폭에서 높이를 계산하면 박스 모양이
         화면 크기와 무관하게 항상 같다 — /me 페이지의 게임 카드(.g-thumb)와
         같은 16:10을 썼다. */
      .pz-card-thumb {
        position: relative; flex: none; width: 100%;
        aspect-ratio: 16 / 10;
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
        #pz-hero-inner  { width: min(560px, 86%); }
        #pz-hero-scrim {
          background:
            linear-gradient(90deg, #150a2e 0%, rgba(21,10,46,0.9) 42%, rgba(21,10,46,0.45) 100%),
            linear-gradient(0deg, #150a2e 0%, rgba(21,10,46,0.6) 22%, transparent 55%);
        }
      }
      /* 레일은 **한 줄**이어야 한다. 열 수를 줄이면서 그만큼(4→3→2) 담는
         개수도 함께 줄여야 카드가 두 줄로 안 쌓인다 — JS perPage()와 반드시
         같은 문턱을 쓴다. 예전엔 900px 하나로 2/4만 갈라서, 가로로 누운
         폰(폭은 넉넉한데 900 이하)이 세로로 선 좁은 폰과 똑같이 2개만
         받았다(ken 지적). 세로 폰의 폭은 대개 480 아래라 그 위는 3열로 준다. */
      @media (max-width: 480px) {
        #pz-rail-row { grid-template-columns: repeat(2, 1fr); }
      }
      @media (min-width: 481px) and (max-width: 900px) {
        #pz-rail-row { grid-template-columns: repeat(3, 1fr); }
      }
      @media (max-width: 900px) {
        #pz-cat-list { grid-template-columns: 1fr; }
        #pz-all-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
        .pz-peek { flex-basis: clamp(40px, 20vw, 80px); }
        .pz-peek .pz-card { width: clamp(120px, 46vw, 180px); }
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
        .pz-hero-anim, .pz-bg-anim, .pz-row-left, .pz-row-right,
        #pz-swipe-hint-left svg, #pz-swipe-hint-right svg { animation: none; }
      }
    </style>

    <div id="pz-hub">
      <header id="pz-head">
        <button id="pz-logo">PLAY ZERA</button>
        <div id="pz-head-right">
          <button class="pz-btn" id="pz-hand" data-pz-hit data-pz-dwell="${DWELL_CAT}">${icon('hand')} <span id="pz-hand-label">손으로 고르기</span></button>
          <button class="pz-btn" id="pz-remote" aria-label="리모컨 연결">${icon('qrcode')}</button>
          <button class="pz-btn" id="pz-account">${icon('user')} <span>제라</span></button>
          <button class="pz-btn" id="pz-menu">${icon('menu')}</button>
        </div>
      </header>

      <section id="pz-hero">
        <div id="pz-hero-bg"></div>
        <video id="pz-hero-video" muted loop playsinline preload="none"></video>
        <div id="pz-hero-scrim"></div>
        <div id="pz-hero-inner">
          <div id="pz-hero-meta"></div>
          <h1 id="pz-hero-title"></h1>
          <p id="pz-hero-desc"></p>
          <button id="pz-hero-play" data-pz-hit data-pz-dwell="${DWELL_CARD}">${icon('play')} 시작하기</button>
        </div>
      </section>

      <section id="pz-rail-sec">
        <div id="pz-rail-in">
          <div id="pz-rail-head">
            <div id="pz-rail-title">
              <span id="pz-rail-label">게임</span>
              <span id="pz-rail-count"></span>
            </div>
            <div id="pz-rail-actions">
              <button class="pz-btn" id="pz-filter" data-pz-hit data-pz-dwell="${DWELL_CAT}">${icon('settings')} <span id="pz-filter-label">전체</span> ${icon('down', 0.8)}</button>
              <button class="pz-btn" id="pz-open-all" data-pz-hit data-pz-dwell="${DWELL_CAT}">${icon('grid')} 전체 보기</button>
            </div>
          </div>
          <!-- 화살표를 없앴다. 카드 옆에 바짝 붙어 있어 손 커서로 겨누기 어렵다는
               지적이 있었다(180cm 성인 기준) — 버튼을 없애는 대신, 양 끝에 다음/이전
               카드가 살짝 걸쳐 보이게 해서 "더 있다"는 걸 저절로 알게 한다. 넘기는 길은
               넷: 휠 · 터치 스와이프 · 방향키(이미 있었다) · 손 스와이프. 손 스와이프는
               피크 자리(data-pz-swipe-zone)에 손이 닿아야 무장되고, 반대로 당겨야
               확정된다(core/edgeSwipe.js·core/pointer.js) — 레일 가운데를 오가는
               움직임은 걸리지 않는다. -->
          <div id="pz-rail-wrap">
            <div id="pz-peek-left" class="pz-peek" aria-hidden="true" data-pz-swipe-zone="left"></div>
            <div id="pz-rail-row"></div>
            <div id="pz-peek-right" class="pz-peek" aria-hidden="true" data-pz-swipe-zone="right"></div>
            <div id="pz-swipe-hint-left" class="pz-swipe-hint" aria-hidden="true">${icon('right', 1.3)}<span>오른쪽으로<br>끌기</span></div>
            <div id="pz-swipe-hint-right" class="pz-swipe-hint" aria-hidden="true">${icon('left', 1.3)}<span>왼쪽으로<br>끌기</span></div>
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
          <button class="pz-btn" id="pz-all-close" data-pz-hit data-pz-dwell="${DWELL_CAT}">${icon('close')} 닫기</button>
        </div>
        <div id="pz-all-search-row">
          <input id="pz-search" type="search" placeholder="게임 이름·태그 검색" autocomplete="off" />
          <div id="pz-cat-select">
            <button class="pz-btn" id="pz-chips-btn" aria-haspopup="listbox" aria-expanded="false" data-pz-hit data-pz-dwell="${DWELL_CAT}">${icon('settings')} <span id="pz-chips-label">전체</span> <span id="pz-chips-caret">${icon('down', 0.8)}</span></button>
            <div id="pz-cat-drop" role="listbox"></div>
          </div>
        </div>
        <div id="pz-chips"></div>
        <div id="pz-all-body">
          <div id="pz-all-grid"></div>
          <div id="pz-all-scroll">
            <button class="pz-scroll-btn" id="pz-all-up" aria-label="위로" data-pz-hit data-pz-dwell="${DWELL_NAV}">${icon('up')}</button>
            <button class="pz-scroll-btn" id="pz-all-down" aria-label="아래로" data-pz-hit data-pz-dwell="${DWELL_NAV}">${icon('down')}</button>
          </div>
        </div>
      </div>
    </div>

    <div id="pz-toast"></div>
  `

  const $ = sel => app.querySelector(sel)
  const hub = $('#pz-hub')
  const rowEl = $('#pz-rail-row')
  const wrapEl = $('#pz-rail-wrap')
  const heroBg = $('#pz-hero-bg')
  const heroVideo = $('#pz-hero-video')
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
    const start = railPage * per
    const items = rail.slice(start, start + per)

    $('#pz-rail-label').textContent = filter ? `${filter} 게임` : '게임'
    $('#pz-rail-count').textContent = rail.length ? `${rail.length}개 · ${railPage + 1}/${pages}` : ''
    $('#pz-filter-label').textContent = filter ?? '전체'

    rowEl.innerHTML = items.length
      ? items.map(m => cardHTML(m)).join('')
      : `<p id="pz-rail-empty">이 분류에는 아직 게임이 없어요.</p>`
    armCards(rowEl)

    // 화살표 대신 — 이전/다음 페이지의 끝 카드를 살짝 보여준다. 페이지
    // 경계 밖(첫 페이지의 왼쪽, 마지막 페이지의 오른쪽)이면 빈 채로 둔다.
    $('#pz-peek-left').innerHTML = peekHTML(rail[start - 1])
    $('#pz-peek-right').innerHTML = peekHTML(rail[start + per])

    // 애니메이션은 카드 줄만이 아니라 **레일 전체**(피크 포함)에 건다.
    // 카드 줄만 슬라이드하고 피크는 그 자리에서 툭 바뀌면 서로 안 맞아
    // 보인다 — 전환하는 동안 한 덩어리로 같이 움직여야 자연스럽다.
    wrapEl.classList.remove('pz-row-left', 'pz-row-right')
    if (dir !== 0) {
      void wrapEl.offsetWidth
      wrapEl.classList.add(dir > 0 ? 'pz-row-left' : 'pz-row-right')
    }
  }

  function goRail(delta) {
    const pages = railPageCount(rail, perPage())
    const next = Math.max(0, Math.min(pages - 1, railPage + delta))
    if (next === railPage) return
    railPage = next
    renderRail(delta)
  }

  // 화살표는 없다 — 휠 · 터치 스와이프 · 방향키 · 손 스와이프 넷이 전부 goRail()로 모인다.
  // 손 스와이프는 core/pointer.js가 document에 쏜다(EdgeSwipeGate) — 무장 상태가
  // 바뀔 때마다 pz-swipe-arm으로 알려주므로 그걸로 화살표 힌트를 켜고 끈다.
  const hintLeft = $('#pz-swipe-hint-left')
  const hintRight = $('#pz-swipe-hint-right')
  const onSwipe = e => goRail(e.detail.dir)
  const onSwipeArm = e => {
    const side = e.detail.side
    hintLeft.classList.toggle('on', side === 'left')
    hintRight.classList.toggle('on', side === 'right')
  }
  document.addEventListener('pz-swipe', onSwipe)
  document.addEventListener('pz-swipe-arm', onSwipeArm)

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
    scheduleHeroVideo(m)

    $('#pz-hero-meta').innerHTML = [
      isNew(m) ? `<span class="tag-new">NEW</span>` : '',
      `<span>${m.ageRange}세</span>`,
      m.players ? `<span class="dot">·</span><span>${playersLabel(m.players)}</span>` : '',
      ...(m.tags ?? []).slice(0, 3).map(t => `<span class="dot">·</span><span>${t}</span>`),
    ].join('')
    // 게임에 로고 그림이 있으면 글자 제목 대신 그것을 쓴다. 4~8세는 글자를 못 읽는다 —
    // 로고는 아이가 "저 게임"이라고 알아보는 유일한 표지다. 없는 게임은 글자로 남는다.
    const titleEl = $('#pz-hero-title')
    titleEl.innerHTML = m.logo
      ? `<img class="pz-hero-logo" src="${m.logo}" alt="${m.title}">`
      : ''
    if (!m.logo) titleEl.textContent = m.title
    $('#pz-hero-desc').textContent = m.description ?? ''
    $('#pz-hero-play').innerHTML = m.placeholder ? '준비 중이에요' : `${icon('play')} 시작하기`

    for (const [el, cls] of [[heroInner, 'pz-hero-anim'], [heroBg, 'pz-bg-anim']]) {
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
        renderChips()      // 라벨(전체 ▾)도 여기서 갱신된다
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

  // 버디 접근은 /me(마이페이지)의 공룡 캐릭터 섹션으로 옮겼다 — 이 자리는
  // 이제 카메라 미리보기(#pz-hand-pip)가 대신 쓴다.

  // ── 헤더 ────────────────────────────────────────────────────
  $('#pz-logo').addEventListener('click', () => { railPage = 0; renderRail(-1) })
  // '제라' = **부모 화면 입구**(docs/06 §5). 아이 선택(계정)은 그 뒤에 붙는다.
  $('#pz-account').addEventListener('click', () => navigate('/me'))
  $('#pz-menu').addEventListener('click', () => toast('설정 메뉴는 준비 중이에요'))
  // qrcode 라이브러리·팝업 마크업을 홈 첫 로딩에 안 끼워 넣으려고 동적 import한다
  // (registry.js의 게임팩 로더와 같은 이유) — `bindRemoteButton`이 클릭
  // 시점에만 불러온다. 버튼 자체는 이 기기가 리모컨에 연결돼 있는지(주
  // 디바이스로든 조종하는 쪽으로든)에 따라 빨간 펄스로 바뀐다(STEP 66).
  // 화면을 나가도(onLeave) 리모컨 세션 자체는 안 끊는다 — 페어링이 계속
  // 살아 있어야 아이가 게임 중일 때도 부모가 끄기를 누를 수 있다.
  const offRemoteButton = bindRemoteButton({ el: $('#pz-remote') })

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
    offRemoteButton()
    clearTimeout(resizeTimer)
    document.removeEventListener('visibilitychange', onVisibility)
    document.removeEventListener('pz-swipe', onSwipe)
    document.removeEventListener('pz-swipe-arm', onSwipeArm)
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

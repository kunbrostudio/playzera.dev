// 러너 인게임 HUD — **2D와 3D가 같이 쓴다.** ★
//
// ── 왜 떼어냈나 ────────────────────────────────────────────────
//
// 2D 러너의 HUD는 마크업이 `legacy-shell.js`에, 모양이 `style.css`에,
// 갱신이 `main.js`에 흩어져 있었다. 3D 러너를 만들면서 같은 것을 또 짜려니
// **같은 UI가 두 벌**이 되고, 그러면 버튼 하나 옮길 때 두 군데를 고쳐야 한다.
// 코스와 자세 채점기를 이미 공유하고 있으니(`runner/game/course.js`,
// `core/pose/poseMatch.js`) HUD도 같은 규율로 둔다.
//
// ── 무엇이 여기 있고 무엇이 없나 ─────────────────────────────
//
// 여기 있는 것은 **판이 도는 동안 늘 떠 있는 것**뿐이다 —
// 레벨·별·목숨·운동 카운트. 카운트다운·레벨 완료·시상대처럼 잠깐 떴다
// 사라지는 연출은 `screens.js`가 갖는다.
//
// 모양(CSS)도 여기 있다. `style.css`에 두면 3D는 그 파일을 안 불러서
// 뼈대만 나온다 — 마크업과 모양은 한 몸이라 같이 움직여야 한다.
//
// ── 숫자를 해석하지 않는다 ───────────────────────────────────
//
// `stars`가 무엇인지는 게임이 정한다. 2D는 주워 모은 별이고 3D는 점수다.
// 여기서 "3D면 점수"라고 아는 순간 이 모듈이 게임을 알게 된다.

import { icon } from '../../../core/icons.js'

/** 한 번만 넣는다 — 화면을 다시 그려도 스타일시트가 쌓이면 안 된다. */
const STYLE_ID = 'pz-runner-hud-css'

export const HUD_CSS = `
/* 레벨·별은 좌상단 배지로 분리하고 상단 가운데에는 목숨과 운동 카운트만 둔다.
   그래야 그 아래에 뜨는 방향 힌트 배너가 화면 위쪽까지 올라올 수 있다. */
#hud-left {
  position: absolute; top: 2%; left: 2%; z-index: 25; pointer-events: none;
  display: flex; align-items: baseline; gap: 10px;
  background: rgba(20, 8, 46, .38); border-radius: 16px; padding: .3em .8em;
}
#hud-level, #hud-stars {
  color: #ffd23e; font-size: clamp(16px, 2vw, 26px); font-weight: 900;
  text-shadow: 0 3px 0 rgba(0,0,0,.35); line-height: 1.2; white-space: nowrap;
}
#hud {
  position: absolute; top: 1%; left: 50%; transform: translateX(-50%); z-index: 25;
  text-align: center; pointer-events: none;
  background: rgba(20, 8, 46, .38); border-radius: 16px; padding: .3em 1em;
}
#hud-lives { display: flex; justify-content: center; gap: 3px; }
#hud-lives span { font-size: clamp(12px, 1.5vw, 19px); }
#hud-lives .life-full { color: #ff4d6d; text-shadow: 0 2px 0 rgba(0,0,0,.35); }
#hud-lives .life-empty { color: rgba(255,255,255,.22); }
#hud-counts {
  color: rgba(255,255,255,.92); font-size: clamp(11px, 1.4vw, 19px); font-weight: 700;
  text-shadow: 0 2px 5px rgba(0,0,0,.5); white-space: nowrap; margin-top: 2px;
}
`

/** 문서에 스타일을 한 번 심는다. 여러 번 불러도 안전하다. */
export function ensureHudStyle(doc = document) {
  if (doc.getElementById(STYLE_ID)) return
  const s = doc.createElement('style')
  s.id = STYLE_ID
  s.textContent = HUD_CSS
  doc.head.appendChild(s)
}

/**
 * HUD 마크업. **id를 바꾸지 않는다** — 2D의 `main.js`와 `style.css`가
 * 이 이름들로 붙어 있다.
 *
 * @param {boolean} hidden 처음에 숨겨 둘지 (2D는 타이틀 화면에서 감춘다)
 * @param {boolean} auto   자동재생 중인지. 운동 카운트 자리를 "자동재생 중"
 *   표시로 바꾼다 — 몸을 안 움직였는데 점프·앉기·피하기가 0으로 박혀
 *   있으면 "왜 안 오르지" 하고 오해하기 쉽다(`runner/game/autopilot.js`).
 */
export function hudMarkup({ hidden = false, auto = false } = {}) {
  const h = hidden ? ' hidden' : ''
  return `
  <div id="hud-left" class="${h.trim()}">
    <span id="hud-level">LEVEL 1</span>
    <span id="hud-stars">${icon('star')} 0</span>
  </div>
  <div id="hud" class="${h.trim()}">
    <div id="hud-lives"></div>
    <div id="hud-counts">${auto ? autoCountsMarkup() : countsMarkup({})}</div>
  </div>`
}

/** 자동재생 중 운동 카운트 자리에 대신 넣는 표시. */
function autoCountsMarkup() {
  return `${icon('zap')} 자동재생 중`
}

/** 목숨 하트 — 남은 만큼 채우고 나머지는 비운다. */
export function livesMarkup(lives, maxLives) {
  return Array.from({ length: maxLives }, (_, i) =>
    `<span class="${i < lives ? 'life-full' : 'life-empty'}">♥</span>`).join('')
}

/** 운동 카운트 한 줄. **지표 이름은 게임이 넘긴다** — 여기서 짓지 않는다. */
export function countsMarkup({ jumps = 0, squats = 0, sideSteps = 0 } = {}) {
  return `${icon('zap')} 점프 ${jumps}&nbsp;&nbsp;&nbsp;`
       + `${icon('down')} 앉기 ${squats}&nbsp;&nbsp;&nbsp;`
       + `${icon('run')} 피하기 ${sideSteps}`
}

/**
 * 값을 그린다. 없는 칸은 건너뛴다 — 게임마다 있는 값이 다르다.
 *
 * @param {ParentNode} root 찾을 범위 (문서 전체여도 된다)
 * @param {boolean} [auto] 자동재생 중이면 운동 카운트 칸을 안 건드린다 —
 *   매 프레임 0으로 덮어써서 `hudMarkup({auto:true})`가 넣어 둔
 *   "자동재생 중" 표시를 지우면 안 된다.
 */
export function updateHud(root, { level, stars, lives, maxLives, jumps, squats, sideSteps, auto = false }) {
  const q = s => root.querySelector(s)
  const lv = q('#hud-level')
  if (lv && level != null) lv.textContent = `LEVEL ${level}`
  const st = q('#hud-stars')
  if (st && stars != null) st.innerHTML = `${icon('star')} ${stars}`
  const lifeEl = q('#hud-lives')
  if (lifeEl && lives != null) lifeEl.innerHTML = livesMarkup(lives, maxLives ?? lives)
  if (auto) return
  const counts = q('#hud-counts')
  if (counts) counts.innerHTML = countsMarkup({ jumps, squats, sideSteps })
}

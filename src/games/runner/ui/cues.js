// 인게임 연출 — 방향 힌트 · 카운트다운 · 배너. **러너들이 같이 쓴다.** ★
//
// ── 왜 `_shared/`인가 ────────────────────────────────────────
//
// `CLAUDE.md`의 규칙: **바닥에 놓이는 것은 테마, 화면에 뜨는 것은 공용.**
// 장애물·관문·배경은 세계마다 다르지만, 화살표 팻말과 카운트다운 숫자는
// 우주에서든 쥬라기에서든 같은 것을 가리킨다. 그래서 그림이 `_shared/` 한 벌이고
// 여기서도 테마를 안 받는다 — **경로가 상수다.**
//
// ── 무엇이 공용이고 무엇이 아닌가 ★ ─────────────────────────
//
// 그림과 **"이 이벤트가 무엇을 시키나"의 대응**은 공용이다. 그게 어긋나면
// 아이가 같은 화살표를 보고 게임마다 다른 동작을 하게 된다.
//
// **그리는 방법은 다르다.** 2D는 자기 캔버스에 그리고(`game/obstacles.js`),
// 3D는 DOM으로 덮는다. 둘을 억지로 합치면 검증 끝난 2D의 화면이 미묘하게
// 움직이고, 얻는 것은 없다. 여기 있는 DOM 조각은 3D가 쓴다.

const SHARED = '/assets/runner/_shared/'

/** 화면에 뜨는 그림들 — 러너 전부가 같은 것을 쓴다. */
export const CUE = {
  left: `${SHARED}signs_left.png`,
  right: `${SHARED}signs_right.png`,
  up: `${SHARED}signs_up.png`,
  down: `${SHARED}signs_down.png`,
  pose: `${SHARED}signs_pose.png`,
  count: [1, 2, 3].map(n => `${SHARED}fx_count_${n}.png`),
  start: `${SHARED}fx_start_word.png`,
  levelComplete: [1, 2, 3, 4, 5].map(n => `${SHARED}fx_level_complete_${n}.png`),
  missionComplete: `${SHARED}fx_mission_complete.png`,
}

/**
 * 만세하는 아이들 — **엔딩 화면에 선다.** ★
 *
 * 캐릭터 그림은 테마가 아니라 `_shared/char/<skin>/`에 한 벌씩 있다
 * (`CLAUDE.md`: 주인공은 테마가 아니다). 만세 포즈도 같은 자리에 둔다 —
 * 따로 폴더를 만들면 나중에 캐릭터를 바꿀 때 한 장이 옛 그림으로 남는다.
 *
 * 엔딩에는 **둘 다** 세운다. 프로필로 갈리는 것은 달리는 캐릭터다.
 */
export const CHEER = ['girl', 'boy'].map(skin => `${SHARED}char/${skin}/char_cheer.png`)

/**
 * **이 이벤트가 아이에게 무엇을 시키나** → 어떤 팻말을 띄우나.
 *
 * `action`은 `judge.js`의 `ACTION`에서 온다 — 지표 이름과 같은 곳에서 나온다.
 * 여기서 이벤트 종류를 다시 나열하면 판정과 힌트가 따로 놀게 된다.
 *
 * @param {'side'|'jump'|'duck'|'pose'|null} action
 * @param {number} [dir] 옆으로 피할 때 어느 쪽인지 (-1 왼쪽 · +1 오른쪽)
 * @returns {string|null} 그림 경로. 힌트가 없는 이벤트는 `null`
 */
export function hintFor(action, dir = 1) {
  switch (action) {
    case 'side': return dir < 0 ? CUE.left : CUE.right
    case 'jump': return CUE.up
    case 'duck': return CUE.down
    case 'pose': return CUE.pose
    default: return null      // 결승 관문처럼 시키는 게 없는 것
  }
}

/** 레벨 완료 그림 — 그림 수보다 레벨이 많아도 안 터진다. */
export function levelCompleteAsset(levelNum) {
  const i = Math.min(Math.max(levelNum, 1), CUE.levelComplete.length) - 1
  return CUE.levelComplete[i]
}

const STYLE_ID = 'pz-runner-cues-css'

export const CUES_CSS = `
/* 상단 HUD(목숨·운동 카운트) 아래에 둔다. 7%에 뒀더니 HUD와 붙어서 잘 안 보였다 —
   화면 맨 위는 눈이 잘 안 가는 자리다. 하늘이 비어 있는 구간에 띄운다. */
#pz-hint {
  position: absolute; left: 50%; top: 17%; transform: translateX(-50%);
  z-index: 30; pointer-events: none;
  height: clamp(64px, 11vh, 122px); width: auto;
  filter: drop-shadow(0 6px 14px rgba(0,0,0,.35));
  opacity: 0; transition: opacity .18s;
  animation: pz-hint-pulse 1.1s ease-in-out infinite;
}
#pz-hint.on { opacity: .95; }
@keyframes pz-hint-pulse { 0%,100% { scale: 1 } 50% { scale: 1.06 } }

/* 카운트다운·배너는 **화면 한가운데**다. 힌트와 겹치지 않게 힌트보다 위에 둔다. */
#pz-cue {
  position: absolute; inset: 0; z-index: 40;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
#pz-cue img {
  height: clamp(110px, 32vh, 320px); width: auto;
  filter: drop-shadow(0 10px 26px rgba(0,0,0,.45));
  opacity: 0; scale: .7;
  transition: opacity .16s ease-out, scale .16s ease-out;
}
#pz-cue img.on { opacity: 1; scale: 1; }

/* ── 판정 연출 — Great! · Miss ★ ───────────────────────────────
   장애물 하나하나에 **즉시** 답을 준다. 하트가 하나 줄어드는 것만으로는
   4~8세가 "무엇 때문에 줄었는지"를 못 잇는다 — 방금 그 장애물 위에 글자가
   떠야 원인과 결과가 붙는다.

   **그림이 아니라 글자다.** 러너 셋·클리커까지 같이 쓸 것이라 테마 폴더에
   파일을 넣기 시작하면 게임 수만큼 늘어난다. 획이 굵은 폰트 하나에
   테두리를 두르면 그림과 구별이 안 간다.

   테두리는 paint-order: stroke로 **글자 바깥쪽에만** 그린다. 옛 방식인
   text-shadow 네 겹은 모서리가 각지고, 글자가 클수록 티가 난다. */
#pz-judge {
  position: absolute; inset: 0; z-index: 35; pointer-events: none; overflow: hidden;
}
.pz-judge-pop {
  position: absolute; transform: translate(-50%, -100%);
  font-family: var(--font-main, 'Jua', sans-serif);
  font-size: clamp(34px, 6.4vw, 92px); font-weight: 900;
  white-space: nowrap; line-height: 1;
  -webkit-text-stroke: .16em #fff;
  paint-order: stroke fill;
  animation: pz-judge-pop 900ms cubic-bezier(.2,1.4,.4,1) forwards;
}
/* 초록은 "잘했다"의 색이다 — 하트·점수와 겹치지 않는 자리에서 쓴다 */
.pz-judge-pop.great {
  color: #7fd63a;
  filter: drop-shadow(0 3px 0 #3f7a17) drop-shadow(0 8px 14px rgba(0,0,0,.35));
}
/* **빨강을 안 쓴다.** 놓친 것은 실패가 아니라 다음 것이 온다는 뜻이고,
   경고색은 아이를 굳게 만든다. 분홍은 눈에 띄면서 야단치지 않는다. */
.pz-judge-pop.miss {
  color: #ff96ab;
  filter: drop-shadow(0 3px 0 #b4485e) drop-shadow(0 8px 14px rgba(0,0,0,.35));
}
.pz-judge-pop .star { color: #ffd23e; -webkit-text-stroke: .1em #fff; font-size: .62em;
                      vertical-align: .18em; margin: 0 .1em; }
@keyframes pz-judge-pop {
  0%   { opacity: 0; scale: .5;  translate: 0 10px; }
  22%  { opacity: 1; scale: 1.14; translate: 0 -6px; }
  38%  {             scale: 1;    translate: 0 -12px; }
  75%  { opacity: 1;              translate: 0 -34px; }
  100% { opacity: 0; scale: .96;  translate: 0 -52px; }
}
@media (prefers-reduced-motion: reduce) {
  .pz-judge-pop { animation-duration: 600ms; }
  @keyframes pz-judge-pop { 0%,100% { opacity: 0 } 20%,70% { opacity: 1 } }
}
`

export function ensureCuesStyle(doc = document) {
  if (doc.getElementById(STYLE_ID)) return
  const s = doc.createElement('style')
  s.id = STYLE_ID
  s.textContent = CUES_CSS
  doc.head.appendChild(s)
}

/** 힌트 한 장 + 가운데 연출 한 장 + 판정 글자가 뜨는 자리. 화면에 **한 벌만** 둔다. */
export function cuesMarkup() {
  return `
  <img id="pz-hint" alt="">
  <div id="pz-cue"><img alt=""></div>
  <div id="pz-judge"></div>`
}

/** 판정 글자 — 무엇을 띄우나. 게임이 아니라 **연출이** 소유한다. */
export const JUDGE = {
  great: { cls: 'great', html: '<span class="star">★</span>Great!<span class="star">★</span>' },
  miss: { cls: 'miss', html: 'Miss' },
}

/**
 * 캐릭터 머리 위에 판정을 띄운다.
 *
 * ── 왜 화면 좌표를 받나 ★ ───────────────────────────────────
 *
 * 화면 한가운데에 고정해 봤더니 **어느 칸에서 맞았는지가 안 보였다.** 세 칸을
 * 오가는 게임이라 "방금 내가 선 자리"에 떠야 아이가 자기 몸과 결과를 잇는다.
 * 그래서 좌표는 부르는 쪽이 준다 — 여기는 3D도 2D도 모른다.
 *
 * @param {ParentNode} root
 * @param {'great'|'miss'} kind
 * @param {{x: number, y: number}} [at] root 기준 CSS 픽셀. 없으면 가운데 위쪽
 */
export function showJudge(root, kind, at = null) {
  const host = root.querySelector('#pz-judge')
  const spec = JUDGE[kind]
  if (!host || !spec) return
  const el = document.createElement('div')
  el.className = `pz-judge-pop ${spec.cls}`
  el.innerHTML = spec.html
  const box = host.getBoundingClientRect()
  el.style.left = `${at?.x ?? box.width / 2}px`
  el.style.top = `${at?.y ?? box.height * 0.42}px`
  host.appendChild(el)
  // 애니메이션이 끝나면 스스로 사라진다. 안 지우면 한 판에 수십 개가 쌓인다.
  el.addEventListener('animationend', () => el.remove())
  setTimeout(() => el.remove(), 1400)      // 애니메이션이 안 도는 환경의 보험
}

/**
 * 방향 힌트를 띄운다. 같은 그림이면 아무것도 하지 않는다 —
 * 매 프레임 `src`를 다시 넣으면 애니메이션이 처음으로 돌아가 깜빡인다.
 */
export function showHint(root, src) {
  const el = root.querySelector('#pz-hint')
  if (!el) return
  if (!src) { el.classList.remove('on'); return }
  if (el.getAttribute('src') !== src) el.setAttribute('src', src)
  el.classList.add('on')
}

export function hideHint(root) { showHint(root, null) }

/**
 * 가운데 그림을 잠깐 띄운다.
 * @returns {Promise<void>} 사라진 뒤에 풀린다
 */
export function showCue(root, src, ms = 900) {
  return new Promise(resolve => {
    const box = root.querySelector('#pz-cue')
    const img = box?.querySelector('img')
    if (!img) { resolve(); return }
    img.src = src
    // 다음 프레임에 켜야 전환이 먹는다. 같은 프레임에 넣으면 그냥 나타난다.
    requestAnimationFrame(() => img.classList.add('on'))
    setTimeout(() => {
      img.classList.remove('on')
      setTimeout(resolve, 160)      // 사라지는 동안 기다린다
    }, ms)
  })
}

/**
 * 3 → 2 → 1 → START!
 *
 * @param {object} o
 * @param {(step: string) => void} [o.onStep] 소리를 낼 곳. 화면은 소리를 모른다 —
 *   2D는 자기 오디오를, 3D는 (아직) 아무것도 안 쓴다
 * @param {() => boolean} [o.cancelled] 중간에 화면을 떠났는지
 */
export async function runCountdown(root, { onStep, cancelled } = {}) {
  const seq = [
    [CUE.count[2], 'countdown_beep'],   // 3
    [CUE.count[1], 'countdown_beep'],
    [CUE.count[0], 'countdown_beep'],
    [CUE.start, 'go'],
  ]
  for (const [src, sfx] of seq) {
    if (cancelled?.()) return
    onStep?.(sfx)
    await showCue(root, src, sfx === 'go' ? 620 : 700)
  }
}

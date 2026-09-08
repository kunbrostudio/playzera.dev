// 게임 진입/화면 전환 공용 로딩 화면 — **모든 게임이 같은 로딩 화면을 쓴다**
// (ken 요청, 9/5. STEP 73).
//
// ── 왜 생겼나 ────────────────────────────────────────────────
//
// 쥬라기 대탐험(3D)의 배경 그림(스토리 합성컷 등, 장당 몇 MB)이 CSS
// `background-image`로 화면에 바로 걸리면, 느린 네트워크에서는 그림이
// 위에서 아래로 서서히 그려지는 게 그대로 보였다("90년대 로딩" —
// ken이 실기기 배포 뒤 재현, 9/5). three.js 텍스처(GLB)는 다 받아지기
// 전엔 캔버스에 아예 안 그려지는데, 순수 CSS `background-image`나
// `<img>`는 브라우저가 받은 만큼 그 자리에서 바로 그리기 때문이다.
//
// **화질(파일 크기)은 그대로 두고, 다 받아지기 전엔 아예 안 보여주는
// 쪽으로 고쳤다** — 그 자리를 플레이 제라 로고 + 로딩 문구로 덮는다.
// 총 대기 시간은 똑같지만, 지저분하게 그려지는 대신 브랜드 로딩
// 화면이 뜬다.
//
// ── 참조 카운팅이다 ★ ──────────────────────────────────────────
//
// `pages/play.js`(게임 코드 자체를 내려받는 동안)와, 이 그림을 실제로
// 쓰는 화면(예: `runner3d/screens.js`의 `mount()` — 배경 그림을
// 내려받는 동안)이 **동시에** 이 화면을 띄울 수 있다 — 코드는 이미
// 받았는데 그림이 아직인 경우, 반대의 경우 둘 다 있다.
// `poseEngineCore.acquire()/release()`와 같은 참조 카운팅으로 만들어서,
// 어느 한쪽이 먼저 끝나도 다른 쪽이 끝날 때까지 화면이 계속 떠 있다.
// `release()`를 안 부르면 화면이 영원히 안 사라지므로, 부르는 쪽은
// 반드시 `try/finally`나 `.finally()`로 짝을 맞춘다.
//
// **모든 게임에 적용되는 공통 UI/UX 규칙이다** — 게임마다 새로 만들지
// 않는다(CLAUDE.md: 공통 UI는 한 벌이다). 로고는 화면 폭에 따라 자동으로
// 바뀐다 — PC·큰 모니터는 풀 워드마크(PLAY ZERA), 태블릿·모바일은
// 축약형(PZ 날개 로고)을 보여준다(ken이 두 로고를 그렇게 나눠 줬다).
//
// ── 지연 표시 + 최소 노출 시간(STEP 74) ★ ──────────────────────
//
// 처음엔 부르자마자 바로 떴다. 그런데 이미지가 브라우저 캐시에 남아
// 있으면(같은 기기로 두 번째 이후 접속) 다 받아지는 데 몇십ms밖에 안
// 걸려서, 로딩 화면이 뜨자마자 사라지는 게 "깜빡이는 오류"처럼 보였다
// (ken 재확인, 9/5).
//
// 그래서 두 문턱을 뒀다:
//   - `SHOW_DELAY_MS`(250) — 부르자마자 안 띄우고 이만큼 기다린다.
//     그 안에 `release()`가 다 불려서 끝나면(캐시 히트처럼 빠른 경우)
//     **화면을 아예 한 번도 안 만든다** — 깜빡임 자체가 없다.
//   - `MIN_VISIBLE_MS`(600) — 한 번 뜨면 최소 이만큼은 붙어 있는다.
//     안 그러면 "떴다가 바로 사라지는" 깜빡임이 이번엔 화면이 뜬
//     뒤에 생긴다.
//
// 실제 네트워크 속도를 재는 복잡한 로직 없이, "일정 시간 안에 안
// 끝나면 느린 것으로 친다"는 단순한 기준만으로 결과적으로 적응형이
// 된다 — 빠른 경우엔 화면 자체가 안 뜨고, 느린 경우에만 깨끗하게
// (깜빡임 없이) 뜬다. "무조건 1~2초 보여주기"는 빠른 경우까지 없어도
// 될 대기 시간을 강제하므로 쓰지 않았다.

import { UI } from './uiAssets.js'

const STYLE_ID = 'pz-loading-style'
const ID = 'pz-loading'
const SHOW_DELAY_MS = 250    // 이 안에 끝나면 화면을 아예 안 띄운다
const MIN_VISIBLE_MS = 600   // 일단 뜨면 최소 이만큼은 붙어 있는다

// 심심하지 않게 몇 마디를 돌려 보여준다 — 하나만 있으면 오래 뜨는
// 화면에서 "멈췄나?" 싶어진다. 게임 이름을 몰라도 되는 문구만 쓴다
// (이 화면은 어떤 게임에서도 뜬다).
const MESSAGES = [
  '신나는 게임을 준비하고 있어요',
  '조금만 기다려 줘!',
  '거의 다 왔어요!',
]
const MESSAGE_INTERVAL_MS = 1800

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    #${ID} {
      position: fixed; inset: 0; z-index: 5000;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: clamp(14px, 3vh, 28px);
      background: radial-gradient(circle at 50% 42%, var(--pz-bg-veil-3, #1c1240), var(--pz-bg-veil-1, #0a0418) 78%);
      font-family: var(--font-main, 'Jua', sans-serif);
    }
    #${ID} .pz-loading-logo {
      width: min(60vw, 380px); height: auto;
      filter: drop-shadow(0 10px 26px rgba(0,0,0,.5));
      animation: pz-loading-pop 640ms cubic-bezier(.2,1.5,.4,1) both;
    }
    #${ID} .pz-loading-mark { display: none; width: min(42vw, 190px); }
    @media (max-width: 700px) {
      #${ID} .pz-loading-logo { display: none; }
      #${ID} .pz-loading-mark { display: block; }
    }
    @keyframes pz-loading-pop {
      0%   { opacity: 0; transform: scale(.6) rotate(-6deg); }
      70%  { opacity: 1; transform: scale(1.08) rotate(1.5deg); }
      100% { opacity: 1; transform: scale(1) rotate(0); }
    }
    #${ID} .pz-loading-msg {
      color: #fff; font-size: clamp(1rem, 2.4vw, 1.3rem); font-weight: 800;
      opacity: .92; text-align: center; padding: 0 20px; min-height: 1.4em;
    }
    #${ID} .pz-loading-dots { display: flex; gap: 10px; }
    #${ID} .pz-loading-dots span {
      width: 12px; height: 12px; border-radius: var(--pz-radius-pill, 999px);
      background: #8CD432; animation: pz-loading-bounce 1.1s ease-in-out infinite;
    }
    #${ID} .pz-loading-dots span:nth-child(2) { background: #FF6FA0; animation-delay: .15s; }
    #${ID} .pz-loading-dots span:nth-child(3) { background: var(--pz-gold, #ffd23e); animation-delay: .3s; }
    @keyframes pz-loading-bounce {
      0%, 80%, 100% { transform: translateY(0); opacity: .6; }
      40%           { transform: translateY(-10px); opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      #${ID} .pz-loading-logo { animation: none; }
      #${ID} .pz-loading-dots span { animation: none; opacity: .9; }
    }
  `
  document.head.appendChild(s)
}

function build() {
  ensureStyle()
  const el = document.createElement('div')
  el.id = ID
  el.innerHTML = `
    <img class="pz-loading-logo" src="${UI.logoFull}" alt="플레이 제라">
    <img class="pz-loading-mark" src="${UI.logoMark}" alt="플레이 제라">
    <div class="pz-loading-msg"></div>
    <div class="pz-loading-dots"><span></span><span></span><span></span></div>
  `
  const msgEl = el.querySelector('.pz-loading-msg')
  msgEl.textContent = MESSAGES[0]
  let i = 0
  el._msgTimer = setInterval(() => {
    i = (i + 1) % MESSAGES.length
    msgEl.textContent = MESSAGES[i]
  }, MESSAGE_INTERVAL_MS)
  return el
}

let refCount = 0
let el = null
let showTimer = null   // "아직 안 띄웠고, SHOW_DELAY_MS 뒤에 띄울 예정"
let hideTimer = null   // "이미 떴고, MIN_VISIBLE_MS를 채우면 지울 예정"
let shownAt = 0

/**
 * 로딩 화면을 (지연 뒤에) 띄운다 — 이미 떠 있거나 뜨기로 예약돼 있으면
 * 참조만 하나 늘린다. 반환값의 `release()`를 **반드시** 불러야 한다 —
 * 안 부르면 참조가 안 줄어 화면이 영원히 안 사라진다.
 *
 * @param {HTMLElement} [root] 기본은 `document.body` — 게임의 `#app`이
 *   비워지는 도중에도 화면 전체를 계속 덮어야 해서 늘 body에 붙인다.
 * @returns {{ release: () => void }}
 */
export function showLoadingScreen(root = document.body) {
  refCount++
  // 이미 "지우기 예약"이 걸려 있었다면(방금 0이 됐다가 다시 늘었다)
  // 취소한다 — 화면이 떴다 바로 사라졌다 다시 뜨는 깜빡임을 막는다.
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }

  if (!el && !showTimer) {
    showTimer = setTimeout(() => {
      showTimer = null
      if (refCount <= 0) return   // 그새 다 released됐다 — 안 띄운다
      el = build()
      root.appendChild(el)
      shownAt = Date.now()
    }, SHOW_DELAY_MS)
  }

  let released = false
  return {
    release() {
      if (released) return   // 두 번 부르면 참조 카운트가 실제보다 더 깎인다
      released = true
      refCount = Math.max(0, refCount - 1)
      if (refCount > 0) return   // 아직 다른 쪽이 붙잡고 있다

      if (showTimer) {
        // 아직 화면을 안 만들었다 — 지금 취소하면 한 번도 안 뜬다
        clearTimeout(showTimer)
        showTimer = null
        return
      }
      if (!el) return
      const elapsed = Date.now() - shownAt
      const wait = Math.max(0, MIN_VISIBLE_MS - elapsed)
      hideTimer = setTimeout(() => {
        hideTimer = null
        if (refCount > 0 || !el) return   // 그새 다시 켜졌다
        clearInterval(el._msgTimer)
        el.remove()
        el = null
      }, wait)
    },
  }
}

/** 테스트 전용 — 지금 화면이 실제로 DOM에 떠 있는지. */
export function isLoadingScreenVisible() {
  return !!el
}

/**
 * 그림 하나가 (성공이든 실패든) 다 받아질 때까지 기다린다. 실패해도
 * 계속 막아 두면 화면이 영원히 안 뜨니, 에러도 "끝났다"로 친다 —
 * 로딩 화면은 "안전하게 못 여는 것"까지 막을 자리가 아니다.
 */
export function preloadImage(url) {
  if (!url) return Promise.resolve()
  return new Promise(resolve => {
    const img = new Image()
    img.onload = resolve
    img.onerror = resolve
    img.src = url
  })
}

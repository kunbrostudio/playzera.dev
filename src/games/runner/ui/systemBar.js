// 플레이 제라 **공통 게임 UI** — 홈 버튼 · 햄버거 메뉴 · 나가기 · 종료 확인.
//
// ── 이것이 브랜드다 ★★ ──────────────────────────────────────
//
// 게임마다 컨셉과 규칙이 달라도, 아이가 **"플레이 제라 안에서 놀고 있구나"**를
// 계속 느끼게 하는 것은 이 네 가지다. 나가는 법·소리 끄는 법·홈으로 가는 법이
// 게임마다 다르면 그건 게임 모음이지 하나의 플랫폼이 아니다.
//
// **새 게임을 추가할 때 이 모듈을 그대로 쓴다.** 모양을 따로 짜지 않는다 —
// 그림도 글자도 자리도 여기 있는 것이 정본이다.
//
// ── 어디에 붙나 ─────────────────────────────────────────────
//
//   타이틀    홈 + 메뉴            (나가기 없음 — 아직 판이 없다)
//   튜토리얼  홈 + 메뉴 + 나가기
//   플레이    메뉴 + 나가기         (홈은 없다 — 아래 참고)
//
// ── 플레이 중에는 홈 버튼이 없다 ★ ──────────────────────────
//
// 판이 도는 중에 한 번에 나가면 **그때까지의 운동 기록을 저장하는 경로를
// 건너뛴다.** 그래서 나가기 → 확인창을 거치고, 홈으로 가는 길도 그 안에 둔다.
//
// ── 소리는 여기서 내지 않는다 ───────────────────────────────
//
// 버튼은 **무엇을 눌렀는지만** 알린다. 실제 음소거는 게임의 오디오 모듈이 한다.

import { icon } from '../../../core/icons.js'

const SHARED = '/assets/runner/_shared/'

export const SYS_ICON = {
  menu: `${SHARED}ico_menu.png`,
  menuClose: `${SHARED}ico_menu_close.png`,
  fullscreen: `${SHARED}ico_menu_fullscreen.png`,
  exit: `${SHARED}ico_menu_logout.png`,
  music: `${SHARED}btn_main_music.png`,
  musicOff: `${SHARED}btn_main_music_off.png`,
  sfx: `${SHARED}btn_main_audio.png`,
  sfxOff: `${SHARED}btn_main_audio_off.png`,
}

const STYLE_ID = 'pz-runner-sysbar-css'

export const SYSBAR_CSS = `
/* ── 왼쪽 위: 홈 ── */
#pz-home {
  position: absolute; z-index: 46;
  top: clamp(10px, 2.5vh, 26px); left: clamp(10px, 2vw, 28px);
  min-height: clamp(44px, 6vh, 58px); padding: 0 clamp(16px, 2.2vw, 26px);
  border-radius: var(--pz-radius-pill, 9999px); border: 3px solid #fff; background: var(--pz-lavender-light, #d9c8f7); color: var(--pz-navy, #2a1a6e);
  font-family: var(--font-main, 'Jua', sans-serif);
  font-size: clamp(.9rem, 1.7vw, 1.15rem); font-weight: 900;
  box-shadow: 0 4px 0 var(--pz-lavender, #a78bda); cursor: pointer; -webkit-tap-highlight-color: transparent;
}
#pz-home:active { transform: translateY(3px); box-shadow: none; }
#pz-home.hidden { display: none; }

/* ── 오른쪽 위: 메뉴 · 나가기 ── */
#pz-topbar {
  position: absolute; top: 2.5%; right: 2%; z-index: 45;
  display: flex; align-items: flex-start; gap: clamp(8px, 1.4vw, 16px);
}
.pz-sys-btn {
  background: none; border: none; padding: 0; cursor: pointer;
  -webkit-tap-highlight-color: transparent; line-height: 0;
}
.pz-sys-btn.hidden { display: none; }
.pz-sys-btn img {
  width: clamp(44px, 5vw, 76px); height: auto; display: block;
  filter: drop-shadow(0 4px 10px rgba(0,0,0,.4));
  transition: transform .15s;
}
.pz-sys-btn:hover img { transform: scale(1.08); }
.pz-sys-btn:active img { transform: scale(.9); }

.pz-menu-wrap { position: relative; }
#pz-menu-panel {
  position: absolute; top: 130%; right: 0; z-index: 50;
  background: var(--pz-lavender-panel, #F7F0FF); border: 5px solid var(--pz-lavender-border, #c4a8f5); outline: 5px solid #fff;
  border-radius: 34px; padding: clamp(10px, 1.6vh, 16px) clamp(9px, 1.4vw, 14px);
  display: flex; flex-direction: column; align-items: center; gap: clamp(8px, 1.4vh, 12px);
  box-shadow: 0 6px 0 var(--pz-lavender, #a78bda), 0 12px 32px rgba(0,0,0,.35);
  min-width: 60px;
}
/* **닫힌 것이 기본이다.** 이 규칙을 다른 id에 걸어 두면 메뉴가 늘 펼쳐진 채로
   화면에 붙어 있는다 — 타이틀에서 실제로 그랬다(8/26). */
#pz-menu-panel.hidden { display: none; }
.pz-menu-item { background: none; border: none; padding: 0; cursor: pointer;
                -webkit-tap-highlight-color: transparent; line-height: 0; }
.pz-menu-item img {
  width: clamp(36px, 3.6vw, 56px); height: auto; display: block;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,.18)); transition: transform .12s;
}
.pz-menu-item:hover img { transform: scale(1.1); }
.pz-menu-item:active img { transform: scale(.92); }

/* ── 종료 확인 ── */
#pz-confirm {
  position: absolute; inset: 0; z-index: 60;
  display: flex; align-items: center; justify-content: center;
  background: rgba(8, 3, 20, .72);
  font-family: var(--font-main, 'Jua', sans-serif);
}
#pz-confirm.hidden { display: none; }
.pz-confirm-box {
  background: linear-gradient(var(--pz-navy, #2a1a6e), var(--pz-navy-2, #1c1050));
  border: 4px solid var(--pz-gold, #ffd23e); border-radius: 28px;
  padding: clamp(20px, 4vh, 40px) clamp(24px, 5vw, 60px);
  text-align: center; color: #fff;
  box-shadow: 0 12px 40px rgba(0,0,0,.5);
  max-width: min(88vw, 560px);
}
.pz-confirm-box p {
  margin: 0 0 clamp(14px, 2.6vh, 26px);
  font-size: clamp(1rem, 2.4vw, 1.5rem); font-weight: 900;
}
/* **세로로 쌓는다.** 가로로 늘어놓으면 셋째 버튼이 생기면서 줄이 넘치고,
   4~8세는 가운데 버튼을 고르기 어려워한다. */
.pz-confirm-actions {
  display: flex; flex-direction: column; gap: clamp(8px, 1.6vh, 14px);
  align-items: stretch;
}
.pz-btn {
  min-height: clamp(46px, 6.5vh, 60px); padding: 0 clamp(20px, 3.4vw, 36px);
  border-radius: var(--pz-radius-pill, 9999px); border: none; cursor: pointer;
  font: inherit; font-size: clamp(.9rem, 1.8vw, 1.15rem); font-weight: 900;
  background: var(--pz-gold, #ffd23e); color: var(--pz-gold-text, #4a2a00);
  box-shadow: 0 4px 0 var(--pz-gold-shadow-alt, #c99b1e); transition: transform .1s;
  -webkit-tap-highlight-color: transparent;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
}
.pz-btn.secondary { background: var(--pz-lavender-light, #d9c8f7); color: var(--pz-navy, #2a1a6e); box-shadow: 0 4px 0 var(--pz-lavender, #a78bda); }
.pz-btn.ghost { background: rgba(255,255,255,.14); color: #fff; box-shadow: 0 4px 0 rgba(0,0,0,.28); }
.pz-btn:active { transform: translateY(3px); box-shadow: none; }
`

export function ensureSysBarStyle(doc = document) {
  if (doc.getElementById(STYLE_ID)) return
  const s = doc.createElement('style')
  s.id = STYLE_ID
  s.textContent = SYSBAR_CSS
  doc.head.appendChild(s)
}

/**
 * 공통 UI 마크업. 화면에 **한 벌만** 둔다.
 *
 * @param {object} [o]
 * @param {boolean} [o.home] 왼쪽 위 Home 버튼 (타이틀·튜토리얼)
 * @param {boolean} [o.exit] 오른쪽 위 나가기 버튼 (튜토리얼·플레이)
 * @param {boolean} [o.bgmMuted] 지금 음소거 상태 — 아이콘을 맞춰 그린다
 * @param {boolean} [o.sfxMuted]
 * @param {string} [o.homeLabel] 왼쪽 위 버튼 글자. **버튼 이름은 가는 곳이다**
 *   (CLAUDE.md) — 실제로는 항상 `onHome`에 걸리지만, 부르는 쪽이 그게
 *   허브로 가는 길인지 방금 화면으로 돌아가는 길인지에 맞춰 글자를 바꾼다
 *   (스토리 인트로의 "뒤로"가 그렇다 — `runner3d/storyDialogue.js`).
 */
export function sysBarMarkup({
  home = false, exit = true, bgmMuted = false, sfxMuted = false, homeLabel = '← Home',
} = {}) {
  return `
  <button id="pz-home" class="${home ? '' : 'hidden'}" data-pz-hit data-pz-dwell="1000">${homeLabel}</button>

  <div id="pz-topbar">
    <div class="pz-menu-wrap">
      <button id="pz-menu" class="pz-sys-btn" aria-label="메뉴" data-pz-hit data-pz-dwell="1000">
        <img src="${SYS_ICON.menu}" alt="메뉴">
      </button>
      <div id="pz-menu-panel" class="hidden">
        <button class="pz-menu-item" id="pz-music" aria-label="배경음악">
          <img src="${bgmMuted ? SYS_ICON.musicOff : SYS_ICON.music}" alt="배경음악">
        </button>
        <button class="pz-menu-item" id="pz-sfx" aria-label="효과음">
          <img src="${sfxMuted ? SYS_ICON.sfxOff : SYS_ICON.sfx}" alt="효과음">
        </button>
        <button class="pz-menu-item" id="pz-full" aria-label="전체화면">
          <img src="${SYS_ICON.fullscreen}" alt="전체화면">
        </button>
      </div>
    </div>
    <button id="pz-exit" class="pz-sys-btn ${exit ? '' : 'hidden'}" aria-label="나가기"
            data-pz-hit data-pz-dwell="1200">
      <img src="${SYS_ICON.exit}" alt="나가기">
    </button>
  </div>

  <div id="pz-confirm" class="hidden">
    <div class="pz-confirm-box">
      <p>게임을 그만할까요?</p>
      <div class="pz-confirm-actions">
        <button class="pz-btn secondary" id="pz-resume" data-pz-hit data-pz-dwell="1000">계속하기</button>
        <button class="pz-btn" id="pz-quit" data-pz-hit data-pz-dwell="1200">${icon('play')} 게임 처음으로</button>
        <button class="pz-btn ghost" id="pz-quit-home" data-pz-hit data-pz-dwell="1400">${icon('home')} Home으로</button>
      </div>
    </div>
  </div>`
}

/**
 * 버튼을 잇는다.
 *
 * @param {ParentNode} root
 * @param {object} o
 * @param {() => boolean} [o.onToggleMusic] 음소거 **뒤의** 상태를 돌려준다 (true=꺼짐)
 * @param {() => boolean} [o.onToggleSfx]
 * @param {() => void} [o.onHome]      Home 버튼 · 확인창의 "Home으로"
 * @param {() => void} [o.onQuit]      확인창의 "게임 처음으로" — 그 게임의 타이틀
 * @param {(paused: boolean) => void} [o.onPause] 메뉴·확인창이 열리고 닫힐 때.
 *   **판을 멈추라는 뜻이다** — 안 멈추면 아이가 메뉴를 보는 동안 장애물이 지나간다.
 * @param {AbortSignal} [signal]
 */
export function bindSysBar(root, {
  onToggleMusic, onToggleSfx, onHome, onQuit, onPause,
} = {}, signal) {
  const q = s => root.querySelector(s)
  const panel = q('#pz-menu-panel')
  const confirm = q('#pz-confirm')
  const menuImg = q('#pz-menu img')
  const opt = { signal }

  const isOpen = () => !panel.classList.contains('hidden')
  const isConfirming = () => !confirm.classList.contains('hidden')
  const sync = () => onPause?.(isOpen() || isConfirming())

  const setMenu = open => {
    panel.classList.toggle('hidden', !open)
    menuImg.src = open ? SYS_ICON.menuClose : SYS_ICON.menu
    sync()
  }

  q('#pz-menu').addEventListener('click', e => {
    e.stopPropagation()
    if (isConfirming()) return       // 확인창이 떠 있으면 메뉴는 무시한다
    setMenu(!isOpen())
  }, opt)
  panel.addEventListener('click', e => e.stopPropagation(), opt)
  // 바깥을 누르면 닫힌다. 아이가 메뉴를 열어 두고 못 닫는 일이 없어야 한다.
  document.addEventListener('click', () => { if (isOpen()) setMenu(false) }, opt)

  q('#pz-music').addEventListener('click', () => {
    q('#pz-music img').src = onToggleMusic?.() ? SYS_ICON.musicOff : SYS_ICON.music
  }, opt)
  q('#pz-sfx').addEventListener('click', () => {
    q('#pz-sfx img').src = onToggleSfx?.() ? SYS_ICON.sfxOff : SYS_ICON.sfx
  }, opt)
  q('#pz-full').addEventListener('click', () => {
    const el = document.documentElement
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)
    }
  }, opt)

  q('#pz-home').addEventListener('click', () => onHome?.(), opt)

  // ── 나가기는 확인을 거친다 ──
  // 바로 나가면 그때까지의 운동 기록을 저장하는 경로를 건너뛴다.
  q('#pz-exit').addEventListener('click', () => {
    setMenu(false)
    confirm.classList.remove('hidden')
    sync()
  }, opt)
  q('#pz-resume').addEventListener('click', () => {
    confirm.classList.add('hidden')
    sync()
  }, opt)
  q('#pz-quit').addEventListener('click', () => onQuit?.(), opt)
  q('#pz-quit-home').addEventListener('click', () => onHome?.(), opt)

  // Escape — 어른이 테스트할 때의 길이다. 아이는 버튼을 쓴다.
  // 나가기 버튼이 없는 화면(타이틀)에서는 확인창을 열지 않는다 — 아직 판이
  // 없는데 "그만할까요?"를 묻는 셈이 된다.
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    if (isConfirming()) { confirm.classList.add('hidden'); sync() }
    else if (isOpen()) setMenu(false)
    else if (!q('#pz-exit').classList.contains('hidden')) {
      confirm.classList.remove('hidden'); sync()
    }
  }, opt)

  return {
    /** 판이 끝났을 때처럼 화면을 정리해야 할 때 */
    close() { setMenu(false); confirm.classList.add('hidden'); sync() },
  }
}

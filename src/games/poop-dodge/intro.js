// 똥 피하기 스플래시 — 원래 src/pages/home.js였다.
//
// STEP 2에서 home은 게임 목록 허브가 됐고, 이 화면은 게임팩 소유가 됐다.
// 허브 홈 → (목록에서 똥 피하기 선택) → 이 인트로 → /game 순서.
// 뒤로가기로 허브에 돌아올 수 있어야 해서 좌상단 홈 버튼을 추가했다.

import { navigate, onLeave } from '../../core/router.js'
import * as bgm   from '../../core/bgm.js'
import * as sound from '../../core/sound.js'
import { markPlayed } from '../../core/recent.js'
import { handSession } from '../../core/handSession.js'
import { bindHandButton } from '../../core/handControl.js'
import { hasSeenTutorial } from '../../core/tutorialSeen.js'
import { getPlayRoute } from '../registry.js'
import { poseEngineCore } from '../../core/pose/poseEngine.js'
import { isArmsUpCircle, isArmsUpCross, GestureHold } from '../../core/pose/gesture.js'
import { GESTURE } from '../../core/pose/tuning.js'

const GAME_ID = 'poop-dodge'

const IMG = {
  bg:        '/assets/image/poop_game_bg.jpg',
  logo:      '/assets/image/poop_game_tit.png',
  character: '/assets/image/poop_main_character.png',
  startDef:  '/assets/image/btn_start_default.png',
  startPrs:  '/assets/image/btn_start_pressed.png',
  menuOpen:  '/assets/image/ico_menu.png',
  menuClose: '/assets/image/ico_menu_close.png',
  musicOn:   '/assets/image/btn_main_music.png',
  musicOff:  '/assets/image/btn_main_music_off.png',
  audioOn:   '/assets/image/btn_main_audio.png',
  audioOff:  '/assets/image/btn_main_audio_off.png',
}

export function poopDodgeIntro(app) {
  app.innerHTML = `
    <style>
      #home-root {
        position: fixed; inset: 0; overflow: hidden;
        font-family: var(--font-main, 'Jua', sans-serif);
        background: url('${IMG.bg}') center/cover no-repeat;
        display: flex; align-items: center; justify-content: center;
      }

      /* ── 중앙 그룹 ── */
      #home-group {
        display: flex; flex-direction: column; align-items: center;
        gap: clamp(8px, 1.8vh, 24px);
      }
      #home-logo {
        width: clamp(240px, 38vw, 540px); object-fit: contain;
        filter: drop-shadow(0 6px 20px rgba(0,0,0,0.30));
        animation: hFloat 3.2s ease-in-out infinite;
        pointer-events: none; position: relative; z-index: 2;
      }
      #home-start-img {
        display: block; width: clamp(180px, 26vw, 340px);
        cursor: pointer; transition: transform 0.08s, filter 0.08s;
        -webkit-tap-highlight-color: transparent; user-select: none;
        position: relative; z-index: 2;
        animation: hPulse 2.6s ease-in-out infinite 0.6s;
      }
      #home-start-img:hover   { filter: brightness(1.08); }
      #home-start-img.pressed { transform: scale(0.92); filter: brightness(0.93); animation: none; }
      #home-start-css {
        display: none; align-items: center; justify-content: center;
        width: clamp(180px, 26vw, 340px); padding: clamp(12px, 2vh, 18px) 0;
        background: linear-gradient(180deg, #ffe94d 0%, #ffcc00 100%);
        border: none; border-radius: 9999px;
        box-shadow: 0 6px 0 #c89800, 0 10px 28px rgba(0,0,0,0.22);
        font-size: clamp(1.2rem, 2.8vw, 2rem); font-weight: 900;
        color: #7a4a00; letter-spacing: 0.12em; cursor: pointer;
        transition: transform 0.08s, box-shadow 0.08s;
        -webkit-tap-highlight-color: transparent; user-select: none;
        position: relative; z-index: 2;
        animation: hPulse 2.6s ease-in-out infinite 0.6s;
      }
      #home-start-css:hover   { transform: scale(1.06); box-shadow: 0 8px 0 #c89800, 0 14px 36px rgba(0,0,0,0.26); }
      #home-start-css.pressed { transform: scale(0.92) translateY(4px); box-shadow: 0 2px 0 #c89800; animation: none; }
      #home-character {
        width: clamp(160px, 24vw, 340px); object-fit: contain;
        filter: drop-shadow(0 8px 18px rgba(0,0,0,0.22));
        animation: hBounce 2.8s ease-in-out infinite 0.3s;
        pointer-events: none;
        margin-bottom: clamp(-80px, -9vh, -40px);
        z-index: 3; position: relative;
      }

      /* ── 상단 줄 ──
         왼쪽은 나가는 길(← 게임 목록), 오른쪽은 이 게임의 설정이다.
         손 컨트롤·튜토리얼은 메뉴(햄버거)와 같은 성격이라 오른쪽에 모은다.
         **가로로** 늘어놓는다 — 세로로 붙이면 손 커서로 1.2초 겨누는 동안
         손이 조금만 내려가도 아래 버튼에 걸린다(허브 하단 바에서 겪은 문제). */
      #intro-topleft {
        position: fixed; top: clamp(12px, 2vw, 24px); left: clamp(12px, 2vw, 24px);
        z-index: 100; display: flex; align-items: center; gap: 10px;
      }
      #intro-topright {
        position: fixed; top: clamp(12px, 2vw, 24px); right: clamp(12px, 2vw, 24px);
        z-index: 100; display: flex; align-items: center; gap: 10px;
      }
      #home-back-btn, #intro-hand-btn, #intro-howto-btn {
        background: rgba(255,255,255,0.92); border: none;
        border-radius: 9999px; padding: clamp(8px, 1.2vw, 12px) clamp(16px, 2.2vw, 24px);
        font-family: inherit; font-size: clamp(0.9rem, 1.6vw, 1.15rem); font-weight: 900;
        color: #6b3fa0; cursor: pointer;
        box-shadow: 0 3px 0 #c4a8f5, 0 6px 18px rgba(0,0,0,0.22);
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.12s;
      }
      #home-back-btn:hover,  #intro-hand-btn:hover,  #intro-howto-btn:hover  { transform: scale(1.06); }
      #home-back-btn:active, #intro-hand-btn:active, #intro-howto-btn:active { transform: scale(0.94); }
      #intro-hand-btn[aria-pressed="true"] { background: #ffd23e; color: #4a2a00; }

      /* 안내 토스트 — 카메라 오류 문구가 여기 뜬다 */
      #intro-toast {
        position: fixed; left: 50%; top: clamp(70px, 11vh, 110px); transform: translateX(-50%);
        z-index: 120; max-width: min(90vw, 460px); text-align: center;
        padding: 10px 20px; border-radius: 9999px;
        background: rgba(10,6,22,0.86); color: #fff;
        font-size: clamp(0.82rem, 1.5vw, 0.98rem); font-weight: 700;
        opacity: 0; pointer-events: none; transition: opacity 0.2s;
      }
      #intro-toast.on { opacity: 1; }

      /* ── 손동작 안내 ── */
      #intro-gesture-hint {
        position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
        z-index: 90; display: none; flex-direction: column; align-items: center; gap: 6px;
        background: rgba(10,6,22,0.78); backdrop-filter: blur(8px);
        padding: 8px 20px; border-radius: 50px; border: 1px solid rgba(196,168,245,0.25);
        font-size: 0.85rem; color: #ffe27a; pointer-events: none; white-space: nowrap;
      }
      #intro-gesture-hint.on { display: flex; }
      #intro-gesture-hint .gauge {
        width: 150px; height: 7px; background: rgba(255,255,255,0.16);
        border-radius: 999px; overflow: hidden;
      }
      #intro-gauge { height: 100%; width: 0%; background: linear-gradient(90deg,#ff8a8a,#ffd23e); }

      /* ── 메뉴 버튼 (우상단) ── */
      #home-menu-btn {
        background: none; border: none; padding: 0; line-height: 0;
        cursor: pointer; -webkit-tap-highlight-color: transparent;
      }
      #home-menu-btn img {
        width: clamp(44px, 5.5vw, 72px); height: auto;
        filter: drop-shadow(0 3px 8px rgba(0,0,0,0.3));
        transition: transform 0.15s;
      }
      #home-menu-btn:hover img { transform: scale(1.1); }
      #home-menu-btn:active img { transform: scale(0.92); }

      /* ── 메뉴 패널 (우상단 드롭다운) ── */
      #home-menu-panel {
        position: fixed; top: clamp(68px, 9vw, 108px); right: clamp(12px, 2vw, 24px);
        z-index: 99;
        background: #F7F0FF;
        border: 6px solid #c4a8f5; outline: 6px solid #fff;
        border-radius: 36px;
        padding: 16px 14px;
        display: none;
        flex-direction: column; align-items: center; gap: 10px;
        box-shadow: 0 6px 0 #a78bda, 0 12px 40px rgba(0,0,0,0.28);
        min-width: clamp(72px, 9vw, 110px);
      }
      #home-menu-panel.open { display: flex; }
      .home-menu-item {
        background: none; border: none; padding: 0; cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .home-menu-item img {
        width: clamp(52px, 6.5vw, 86px); height: auto;
        display: block;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.18));
        transition: transform 0.12s;
      }
      .home-menu-item:hover img  { transform: scale(1.1); }
      .home-menu-item:active img { transform: scale(0.92); }

      /* ── 애니메이션 ── */
      @keyframes hFloat  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
      @keyframes hBounce { 0%,100%{transform:translateY(0)} 45%{transform:translateY(-9px)} 65%{transform:translateY(-2px)} 80%{transform:translateY(-6px)} }
      @keyframes hPulse  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }

      /* ── 반응형 ── */
      @media (max-width: 520px) {
        #home-group     { gap: 8px; }
        #home-logo      { width: clamp(200px, 78vw, 320px); }
        #home-character { width: clamp(120px, 40vw, 200px); margin-bottom: -30px; }
        #home-start-img, #home-start-css { width: clamp(150px, 58vw, 240px); }
      }
      @media (max-height: 560px) {
        #home-group     { gap: 4px; }
        #home-character { width: clamp(110px, 13vw, 150px); margin-bottom: -22px; }
        #home-logo      { width: clamp(200px, 22vw, 270px); }
        #home-start-img, #home-start-css { width: clamp(155px, 17vw, 210px); }
      }
    </style>

    <div id="home-root">
      <div id="home-group">
        <img id="home-character" src="${IMG.character}" alt="" />
        <img id="home-logo"      src="${IMG.logo}"      alt="POOP DODGE" />
        <img id="home-start-img" src="${IMG.startDef}"  alt="START" data-pz-hit data-pz-dwell="1200" />
        <button id="home-start-css" data-pz-hit data-pz-dwell="1200">START</button>
      </div>
    </div>

    <!-- 좌상단 — 나가는 길 -->
    <div id="intro-topleft">
      <button id="home-back-btn" data-pz-hit data-pz-dwell="800">← 게임 목록</button>
    </div>

    <div id="intro-toast"></div>

    <!-- 손동작 안내 (카메라가 켜져 있을 때만) -->
    <div id="intro-gesture-hint">
      <div>✋ 머리 위 <b>O</b> = 시작 · 팔로 <b>X</b> = 게임 목록</div>
      <div class="gauge"><div id="intro-gauge"></div></div>
    </div>

    <!-- 우상단 — 손 컨트롤 · 튜토리얼 · 메뉴 -->
    <div id="intro-topright">
      <button id="intro-hand-btn" data-pz-hit data-pz-dwell="800">✋ <span id="intro-hand-label">손 컨트롤 모드</span></button>
      <button id="intro-howto-btn" data-pz-hit data-pz-dwell="800">❔ 어떻게 해?</button>
      <button id="home-menu-btn" aria-label="메뉴">
        <img id="home-menu-ico" src="${IMG.menuOpen}" alt="메뉴" />
      </button>
    </div>
    <div id="home-menu-panel">
      <button class="home-menu-item" id="menu-item-music" aria-label="BGM">
        <img id="menu-music-img" src="${IMG.musicOn}" alt="BGM" />
      </button>
      <button class="home-menu-item" id="menu-item-audio" aria-label="효과음">
        <img id="menu-audio-img" src="${IMG.audioOn}" alt="효과음" />
      </button>
      <!-- 향후 메뉴 항목 추가 자리 -->
    </div>
  `

  // 시작 지점은 하나다 — START 버튼도, 머리 위 O도 여기로 온다.
  //
  // **처음 하는 아이에게는 튜토리얼을 한 번 거치게 한다.** 이 게임은 규칙이
  // 하나뿐이라(옆으로 비킨다) 한 번만 보면 되고, 두 번째부터는 바로 게임이다.
  // 다시 보고 싶으면 좌상단 '어떻게 해?' 버튼으로 언제든 갈 수 있다.
  function startGame() {
    if (hasSeenTutorial(GAME_ID)) navigate(getPlayRoute(GAME_ID))
    else                          navigate(`/tutorial?id=${GAME_ID}`)
  }

  // ── 이미지 에러 처리 ──────────────────────────────────────
  const startImg = app.querySelector('#home-start-img')
  const startCss = app.querySelector('#home-start-css')

  startImg.addEventListener('error', () => { startImg.style.display = 'none'; startCss.style.display = 'flex' })
  startImg.addEventListener('load',  () => { startCss.style.display = 'none' })
  if (startImg.complete && startImg.naturalWidth === 0) {
    startImg.style.display = 'none'; startCss.style.display = 'flex'
  }
  ;[app.querySelector('#home-logo'), app.querySelector('#home-character')].forEach(el => {
    if (el) el.addEventListener('error', () => { el.style.visibility = 'hidden' })
  })
  app.querySelectorAll('#home-menu-btn img, .home-menu-item img').forEach(el => {
    el.addEventListener('error', () => { el.style.display = 'none' })
  })

  // ── START 버튼 ────────────────────────────────────────────
  function onPressStart() {
    sound.activate()
    startImg.src = IMG.startPrs
    startImg.classList.add('pressed')
    startCss.classList.add('pressed')
  }
  let launched = false
  function onPressEnd(fire) {
    startImg.src = IMG.startDef
    startImg.classList.remove('pressed')
    startCss.classList.remove('pressed')
    if (!fire || launched) return
    launched = true   // mouseup과 click이 연달아 오므로 한 번만 나간다
    startGame()
  }
  ;[startImg, startCss].forEach(el => {
    el.addEventListener('mousedown',  () => onPressStart())
    el.addEventListener('mouseup',    () => onPressEnd(true))
    el.addEventListener('mouseleave', () => onPressEnd(false))
    el.addEventListener('touchstart', e => { e.preventDefault(); onPressStart() }, { passive: false })
    el.addEventListener('touchend',   e => { e.preventDefault(); onPressEnd(true) }, { passive: false })
    // 손 포인터는 머무르기가 끝나면 el.click()을 부른다. 위 핸들러는 mousedown/up만
    // 듣고 있어서 그대로면 커서로는 눌리지 않는다. (버튼마다 다르게 반응하는 걸
    // 포인터가 알 필요는 없으니, 표준 click을 받아주는 쪽이 맞다.)
    el.addEventListener('click', () => onPressEnd(true))
  })

  // 튜토리얼 다시 보기 — 한 번 보고 나면 자동으로는 안 뜬다
  app.querySelector('#intro-howto-btn').addEventListener('click', () => {
    navigate(`/tutorial?id=${GAME_ID}`)
  })

  // ── 허브 복귀 ─────────────────────────────────────────────
  app.querySelector('#home-back-btn').addEventListener('click', e => {
    e.stopPropagation()
    sound.activate()
    navigate('/')
  })

  // ── 메뉴 패널 ─────────────────────────────────────────────
  const menuBtn   = app.querySelector('#home-menu-btn')
  const menuPanel = app.querySelector('#home-menu-panel')
  const menuIco   = app.querySelector('#home-menu-ico')

  let menuOpen = false
  function toggleMenu() {
    menuOpen = !menuOpen
    menuPanel.classList.toggle('open', menuOpen)
    menuIco.src = menuOpen ? IMG.menuClose : IMG.menuOpen
  }
  menuBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu() })

  // 패널 바깥 클릭 시 닫기
  document.addEventListener('click', () => {
    if (menuOpen) toggleMenu()
  })
  menuPanel.addEventListener('click', e => e.stopPropagation())

  // ── BGM 토글 ──────────────────────────────────────────────
  const musicImg = app.querySelector('#menu-music-img')
  function syncMusicBtn() {
    musicImg.src = bgm.isMuted() ? IMG.musicOff : IMG.musicOn
  }
  app.querySelector('#menu-item-music').addEventListener('click', () => {
    bgm.toggleMute()
    syncMusicBtn()
  })
  syncMusicBtn()

  // ── 효과음 토글 ───────────────────────────────────────────
  const audioImg = app.querySelector('#menu-audio-img')
  function syncAudioBtn() {
    audioImg.src = sound.isMuted() ? IMG.audioOff : IMG.audioOn
  }
  app.querySelector('#menu-item-audio').addEventListener('click', () => {
    sound.toggle()
    syncAudioBtn()
  })
  syncAudioBtn()

  // BGM은 게임에 들어와야 나온다 — 허브는 무음이다.
  // 스플래시가 이 게임의 첫 화면이므로 여기가 시작 지점이다.
  bgm.load(GAME_ID).then(() => bgm.play())
  markPlayed(GAME_ID)

  // ── 손 컨트롤 ─────────────────────────────────────────────
  //
  // 허브에서 켜둔 세션이 그대로 이어진다. 카메라를 다시 열지 않으므로
  // 커서가 끊기지 않는다. 여기서는 커서를 계속 보여주기만 하면 된다.
  //
  // 포인터로 START를 겨눠도 되고, 머리 위 O로 바로 시작해도 된다.
  // 웜업 타이틀이 O로 시작하니 감각을 맞춘다.
  handSession.setPointerActive(true)

  // 손 컨트롤이 꺼진 채로 들어오면 여기서 켤 수 있어야 한다.
  // 이 버튼이 없어서 "인트로에서는 손이 안 된다"고 보였다.
  const toastEl = app.querySelector('#intro-toast')
  let toastTimer = null
  const toast = msg => {
    toastEl.textContent = msg
    toastEl.classList.add('on')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2600)
  }
  const unbindHand = bindHandButton({
    el: app.querySelector('#intro-hand-btn'),
    labelEl: app.querySelector('#intro-hand-label'),
    onToast: toast,
  })

  const hintEl = app.querySelector('#intro-gesture-hint')
  const gaugeEl = app.querySelector('#intro-gauge')
  const oHold = new GestureHold(lms => isArmsUpCircle(lms, GESTURE), GESTURE.confirmHoldSec)
  const xHold = new GestureHold(lms => isArmsUpCross(lms, GESTURE), GESTURE.confirmHoldSec)

  let lastLms = null
  let raf = null
  let last = performance.now()
  let done = false

  const unsub = poseEngineCore.onLandmarks(lms => { lastLms = lms })

  const tick = now => {
    raf = requestAnimationFrame(tick)
    if (done) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    if (!handSession.enabled) { hintEl.classList.remove('on'); return }
    hintEl.classList.add('on')

    const oDone = oHold.update(dt, lastLms)
    const xDone = xHold.update(dt, lastLms)
    gaugeEl.style.width = `${Math.round(Math.max(oHold.progress, xHold.progress) * 100)}%`

    if (oDone)      { done = true; sound.activate(); startGame() }
    else if (xDone) { done = true; navigate('/') }
  }
  raf = requestAnimationFrame(tick)

  onLeave(() => {
    unsub()
    unbindHand()
    clearTimeout(toastTimer)
    if (raf) cancelAnimationFrame(raf)
  })
}

export default poopDodgeIntro

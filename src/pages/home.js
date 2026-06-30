// [임시] 현재 똥피하기 전용 스플래시 화면.
//  추후 게임 허브 추가 시: 이 파일은 게임 목록 허브로 교체되고,
//  현재 스플래시 내용은 games/poop-dodge/ 인트로로 이동 예정.

import { navigate } from '../core/router.js'
import * as bgm   from '../core/bgm.js'
import * as sound from '../core/sound.js'

// 향후 games/poop-dodge/ 인트로로 이동할 때 한 곳만 수정하면 됨
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

export function homePage(app) {
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

      /* ── 메뉴 버튼 (우상단) ── */
      #home-menu-btn {
        position: fixed; top: clamp(12px, 2vw, 24px); right: clamp(12px, 2vw, 24px);
        z-index: 100; background: none; border: none; padding: 0;
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
        <img id="home-start-img" src="${IMG.startDef}"  alt="START" />
        <button id="home-start-css">START</button>
      </div>
    </div>

    <!-- 우상단 메뉴 -->
    <button id="home-menu-btn" aria-label="메뉴">
      <img id="home-menu-ico" src="${IMG.menuOpen}" alt="메뉴" />
    </button>
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
  function onPressEnd(fire) {
    startImg.src = IMG.startDef
    startImg.classList.remove('pressed')
    startCss.classList.remove('pressed')
    if (fire) navigate(`/game?id=${GAME_ID}`)
  }
  ;[startImg, startCss].forEach(el => {
    el.addEventListener('mousedown',  () => onPressStart())
    el.addEventListener('mouseup',    () => onPressEnd(true))
    el.addEventListener('mouseleave', () => onPressEnd(false))
    el.addEventListener('touchstart', e => { e.preventDefault(); onPressStart() }, { passive: false })
    el.addEventListener('touchend',   e => { e.preventDefault(); onPressEnd(true) }, { passive: false })
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
}

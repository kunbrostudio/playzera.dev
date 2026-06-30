// [임시] 현재 똥피하기 전용 스플래시 화면.
//  추후 게임 허브 추가 시: 이 파일은 게임 목록 허브로 교체되고,
//  현재 스플래시 내용은 games/poop-dodge/ 인트로로 이동 예정.

import { navigate } from '../core/router.js'
import * as bgm   from '../core/bgm.js'

// 향후 games/poop-dodge/ 인트로로 이동할 때 한 곳만 수정하면 됨
const GAME_ID = 'poop-dodge'

const IMG = {
  bg:        '/assets/image/poop_game_bg.jpg',
  logo:      '/assets/image/poop_game_tit.png',
  character: '/assets/image/poop_main_character.png',
  startDef:  '/assets/image/btn_start_default.png',
  startPrs:  '/assets/image/btn_start_pressed.png',
}

export function homePage(app) {
  app.innerHTML = `
    <style>
      /* ── 루트 ── */
      #home-root {
        position: fixed;
        inset: 0;
        overflow: hidden;
        font-family: var(--font-main, 'Jua', sans-serif);
        background: url('${IMG.bg}') center/cover no-repeat;
        /* 모든 자식을 정중앙 정렬 */
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* ── 중앙 그룹 (캐릭터 + 로고 + 버튼을 한 덩어리로) ── */
      #home-group {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: clamp(8px, 1.8vh, 24px);
      }

      /* ── 로고 ── */
      #home-logo {
        width: clamp(240px, 38vw, 540px);
        object-fit: contain;
        filter: drop-shadow(0 6px 20px rgba(0,0,0,0.30));
        animation: hFloat 3.2s ease-in-out infinite;
        pointer-events: none;
        position: relative;
        z-index: 2;
      }

      /* ── START 이미지 버튼 ── */
      #home-start-img {
        display: block;
        width: clamp(180px, 26vw, 340px);
        cursor: pointer;
        transition: transform 0.08s, filter 0.08s;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        position: relative;
        z-index: 2;
        animation: hPulse 2.6s ease-in-out infinite 0.6s;
      }
      #home-start-img:hover  { filter: brightness(1.08); }
      #home-start-img.pressed { transform: scale(0.92); filter: brightness(0.93); animation: none; }

      /* ── CSS fallback 버튼 ── */
      #home-start-css {
        display: none;
        align-items: center;
        justify-content: center;
        width: clamp(180px, 26vw, 340px);
        padding: clamp(12px, 2vh, 18px) 0;
        background: linear-gradient(180deg, #ffe94d 0%, #ffcc00 100%);
        border: none;
        border-radius: 9999px;
        box-shadow: 0 6px 0 #c89800, 0 10px 28px rgba(0,0,0,0.22);
        font-size: clamp(1.2rem, 2.8vw, 2rem);
        font-weight: 900;
        color: #7a4a00;
        letter-spacing: 0.12em;
        cursor: pointer;
        transition: transform 0.08s, box-shadow 0.08s;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        position: relative;
        z-index: 2;
        animation: hPulse 2.6s ease-in-out infinite 0.6s;
      }
      #home-start-css:hover  { transform: scale(1.06); box-shadow: 0 8px 0 #c89800, 0 14px 36px rgba(0,0,0,0.26); }
      #home-start-css.pressed { transform: scale(0.92) translateY(4px); box-shadow: 0 2px 0 #c89800; animation: none; }

      /* ── 캐릭터: 그룹 맨 위 중앙 ── */
      #home-character {
        width: clamp(160px, 24vw, 340px);
        object-fit: contain;
        filter: drop-shadow(0 8px 18px rgba(0,0,0,0.22));
        animation: hBounce 2.8s ease-in-out infinite 0.3s;
        pointer-events: none;
        margin-bottom: clamp(-80px, -9vh, -40px);
        z-index: 3;
        position: relative;
      }

      /* ── 애니메이션 ── */
      @keyframes hFloat {
        0%, 100% { transform: translateY(0); }
        50%       { transform: translateY(-10px); }
      }
      @keyframes hBounce {
        0%, 100% { transform: translateY(0); }
        45%      { transform: translateY(-9px); }
        65%      { transform: translateY(-2px); }
        80%      { transform: translateY(-6px); }
      }
      @keyframes hPulse {
        0%, 100% { transform: scale(1); }
        50%       { transform: scale(1.05); }
      }

      /* ── 모바일 세로 ── */
      @media (max-width: 520px) {
        #home-group     { gap: 8px; }
        #home-logo      { width: clamp(200px, 78vw, 320px); }
        #home-character { width: clamp(120px, 40vw, 200px); margin-bottom: -30px; }
        #home-start-img,
        #home-start-css { width: clamp(150px, 58vw, 240px); }
      }
      /* ── 모바일 가로 (세로 높이 560px 이하) ── */
      @media (max-height: 560px) {
        #home-group     { gap: 4px; }
        #home-character { width: clamp(110px, 13vw, 150px); margin-bottom: -22px; }
        #home-logo      { width: clamp(200px, 22vw, 270px); }
        #home-start-img,
        #home-start-css { width: clamp(155px, 17vw, 210px); }
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
  `

  const startImg = app.querySelector('#home-start-img')
  const startCss = app.querySelector('#home-start-css')

  // START 이미지 로드 실패 → CSS 버튼
  startImg.addEventListener('error', () => {
    startImg.style.display = 'none'
    startCss.style.display = 'flex'
  })
  startImg.addEventListener('load', () => { startCss.style.display = 'none' })
  if (startImg.complete && startImg.naturalWidth === 0) {
    startImg.style.display = 'none'
    startCss.style.display = 'flex'
  }

  // 로고·캐릭터 에러 처리
  ;[app.querySelector('#home-logo'), app.querySelector('#home-character')].forEach(el => {
    if (el) el.addEventListener('error', () => { el.style.visibility = 'hidden' })
  })

  // 버튼 pressed 상태
  function onPressStart() {
    bgm.play()   // 첫 사용자 인터랙션 → 브라우저 자동재생 정책 통과
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
    el.addEventListener('touchend',   e => { e.preventDefault(); onPressEnd(true) },  { passive: false })
  })
}

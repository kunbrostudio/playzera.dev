import { navigate } from '../core/router.js'

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
      #home-root {
        position: fixed;
        inset: 0;
        overflow: hidden;
        font-family: var(--font-main, 'Jua', sans-serif);
        background: url('${IMG.bg}') center/cover no-repeat;
      }

      /* ── 로고 ── */
      #home-logo {
        position: absolute;
        top: clamp(24px, 7vh, 72px);
        left: 50%;
        transform: translateX(-50%);
        width: clamp(260px, 38vw, 560px);
        max-height: 55vh;
        object-fit: contain;
        filter: drop-shadow(0 6px 20px rgba(0,0,0,0.28));
        animation: hFloat 3.2s ease-in-out infinite;
        pointer-events: none;
        z-index: 2;
      }

      /* ── START 버튼 ── */
      #home-start-wrap {
        position: absolute;
        bottom: clamp(60px, 14vh, 140px);
        left: 50%;
        transform: translateX(-50%);
        z-index: 3;
        animation: hPulse 2.4s ease-in-out infinite;
      }

      /* 이미지 버튼 */
      #home-start-img {
        display: block;
        width: clamp(160px, 22vw, 300px);
        cursor: pointer;
        transition: transform 0.08s, filter 0.08s;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }
      #home-start-img:hover  { filter: brightness(1.08); }
      #home-start-img.pressed { transform: scale(0.93); filter: brightness(0.95); }

      /* CSS fallback 버튼 (이미지 없을 때) */
      #home-start-css {
        display: none;
        align-items: center;
        justify-content: center;
        width: clamp(160px, 22vw, 300px);
        padding: clamp(13px, 2.2vh, 20px) 0;
        background: linear-gradient(180deg, #ffe94d 0%, #ffcc00 100%);
        border: none;
        border-radius: 9999px;
        box-shadow: 0 6px 0 #c89800, 0 10px 28px rgba(0,0,0,0.22);
        font-size: clamp(1.3rem, 3.2vw, 2.2rem);
        font-weight: 900;
        color: #7a4a00;
        letter-spacing: 0.12em;
        cursor: pointer;
        transition: transform 0.08s, box-shadow 0.08s;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }
      #home-start-css:hover  { transform: scale(1.06); box-shadow: 0 8px 0 #c89800, 0 14px 36px rgba(0,0,0,0.26); }
      #home-start-css.pressed { transform: scale(0.94) translateY(4px); box-shadow: 0 2px 0 #c89800, 0 4px 16px rgba(0,0,0,0.18); }

      /* ── 캐릭터 ── */
      #home-character {
        position: absolute;
        bottom: -8px;
        /* 로고 왼쪽에 살짝 겹치게 — 화면 중앙 기준 왼쪽 */
        left: clamp(0px, 10vw, 180px);
        width: clamp(140px, 20vw, 280px);
        object-fit: contain;
        filter: drop-shadow(0 8px 18px rgba(0,0,0,0.22));
        animation: hBounce 2.8s ease-in-out infinite 0.4s;
        pointer-events: none;
        z-index: 2;
      }

      /* ── 애니메이션 ── */
      @keyframes hFloat {
        0%, 100% { transform: translateX(-50%) translateY(0); }
        50%       { transform: translateX(-50%) translateY(-10px); }
      }
      @keyframes hBounce {
        0%, 100% { transform: translateY(0); }
        45%      { transform: translateY(-8px); }
        60%      { transform: translateY(-2px); }
        75%      { transform: translateY(-6px); }
      }
      @keyframes hPulse {
        0%, 100% { transform: translateX(-50%) scale(1); }
        50%      { transform: translateX(-50%) scale(1.04); }
      }

      /* ── 반응형: 모바일 세로 ── */
      @media (max-width: 520px) {
        #home-logo      { width: clamp(220px, 80vw, 340px); top: clamp(16px, 5vh, 48px); }
        #home-character { width: clamp(100px, 32vw, 160px); left: 4vw; }
        #home-start-img,
        #home-start-css { width: clamp(140px, 55vw, 220px); }
      }
    </style>

    <div id="home-root">
      <!-- 로고 -->
      <img id="home-logo" src="${IMG.logo}" alt="POOP DODGE" />

      <!-- 캐릭터 -->
      <img id="home-character" src="${IMG.character}" alt="" />

      <!-- START 버튼 -->
      <div id="home-start-wrap">
        <img id="home-start-img" src="${IMG.startDef}" alt="START" />
        <button id="home-start-css">START</button>
      </div>
    </div>
  `

  const startImg = app.querySelector('#home-start-img')
  const startCss = app.querySelector('#home-start-css')

  // 이미지 로드 실패 → CSS 버튼으로 전환
  startImg.addEventListener('error', () => {
    startImg.style.display = 'none'
    startCss.style.display = 'flex'
  })

  // 로드 성공 확인 (캐시된 경우 error 이벤트 안 뜰 수 있음)
  startImg.addEventListener('load', () => {
    startCss.style.display = 'none'
  })

  // 이미 로드됐는데 complete 상태인 경우 체크
  if (startImg.complete && startImg.naturalWidth === 0) {
    startImg.style.display = 'none'
    startCss.style.display = 'flex'
  }

  // 기타 이미지 에러 처리
  ;[app.querySelector('#home-logo'), app.querySelector('#home-character')].forEach(el => {
    if (el) el.addEventListener('error', () => { el.style.visibility = 'hidden' })
  })

  // pressed 상태 (이미지 버튼)
  function onPressStart() {
    startImg.src = IMG.startPrs
    startImg.classList.add('pressed')
    startCss.classList.add('pressed')
  }
  function onPressEnd(fire) {
    startImg.src = IMG.startDef
    startImg.classList.remove('pressed')
    startCss.classList.remove('pressed')
    if (fire) navigate('/game?id=poop-dodge')
  }

  ;[startImg, startCss].forEach(el => {
    el.addEventListener('mousedown',  () => onPressStart())
    el.addEventListener('mouseup',    () => onPressEnd(true))
    el.addEventListener('mouseleave', () => onPressEnd(false))
    el.addEventListener('touchstart', e => { e.preventDefault(); onPressStart() }, { passive: false })
    el.addEventListener('touchend',   e => { e.preventDefault(); onPressEnd(true) },  { passive: false })
  })
}

import { navigate } from '../core/router.js'

export function homePage(app) {
  app.innerHTML = `
    <style>
      #home-root {
        position: fixed;
        inset: 0;
        overflow: hidden;
        font-family: var(--font-main, 'Nunito', sans-serif);
      }

      /* 배경 */
      #home-bg {
        position: absolute;
        inset: 0;
        background: url('/assets/image/poop_game_bg.jpg') center/cover no-repeat;
      }

      /* 콘텐츠 레이어 */
      #home-content {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        padding-top: clamp(28px, 6vh, 64px);
      }

      /* PLAYZERA 간판 */
      #home-playzera {
        width: clamp(140px, 28vw, 320px);
        max-height: 80px;
        object-fit: contain;
        filter: drop-shadow(0 4px 12px rgba(0,0,0,0.25));
        margin-bottom: clamp(8px, 1.5vh, 20px);
      }

      /* POOP DODGE 로고 */
      #home-logo {
        width: clamp(240px, 52vw, 620px);
        max-height: 220px;
        object-fit: contain;
        filter: drop-shadow(0 6px 18px rgba(0,0,0,0.3));
        animation: homeFloat 3s ease-in-out infinite;
        margin-bottom: clamp(20px, 4vh, 48px);
      }

      /* START 버튼 */
      #home-start {
        display: flex;
        align-items: center;
        justify-content: center;
        width: clamp(160px, 32vw, 320px);
        padding: clamp(14px, 2.4vh, 22px) 0;
        background: linear-gradient(180deg, #ffe94d 0%, #ffcc00 100%);
        border: none;
        border-radius: 9999px;
        box-shadow: 0 6px 0 #c89800, 0 10px 32px rgba(0,0,0,0.22);
        font-size: clamp(1.4rem, 3.6vw, 2.4rem);
        font-weight: 900;
        color: #7a4a00;
        letter-spacing: 0.12em;
        cursor: pointer;
        animation: homeFloat 3s ease-in-out infinite 0.5s;
        transition: transform 0.1s, box-shadow 0.1s;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }
      #home-start:hover {
        transform: scale(1.07);
        box-shadow: 0 8px 0 #c89800, 0 14px 40px rgba(0,0,0,0.28);
      }
      #home-start:active {
        transform: scale(0.96) translateY(4px);
        box-shadow: 0 2px 0 #c89800, 0 6px 20px rgba(0,0,0,0.2);
      }

      /* 왼쪽 하단 메인 캐릭터 */
      #home-character {
        position: absolute;
        bottom: -4px;
        left: clamp(-20px, -2vw, 0px);
        width: clamp(160px, 26vw, 340px);
        object-fit: contain;
        filter: drop-shadow(0 8px 20px rgba(0,0,0,0.2));
        pointer-events: none;
      }

      @keyframes homeFloat {
        0%, 100% { transform: translateY(0); }
        50%       { transform: translateY(-10px); }
      }

      /* 이미지 깨짐 방지 */
      #home-playzera[src=""],
      #home-logo[src=""],
      #home-character[src=""] {
        display: none;
      }

      /* 모바일 세로 조정 */
      @media (max-width: 480px) {
        #home-content { padding-top: clamp(20px, 5vh, 40px); }
        #home-character { width: clamp(100px, 38vw, 180px); }
      }
    </style>

    <div id="home-root">
      <div id="home-bg"></div>

      <div id="home-content">
        <img id="home-playzera" src="/assets/image/tit_signboard_playzera.png" alt="PLAYZERA" />
        <img id="home-logo"     src="/assets/image/poop_game_tit.png"          alt="POOP DODGE" />
        <button id="home-start">START</button>
      </div>

      <img id="home-character" src="/assets/image/poop_main_character.png" alt="" />
    </div>
  `

  // 이미지 로드 실패 시 숨김
  app.querySelectorAll('#home-root img').forEach(img => {
    img.addEventListener('error', () => { img.style.display = 'none' })
  })

  // START → 게임 진입
  app.querySelector('#home-start').addEventListener('click', () => {
    navigate('/game?id=poop-dodge')
  })
}

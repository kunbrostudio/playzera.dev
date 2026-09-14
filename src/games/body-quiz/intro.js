// 바디 퀴즈 인트로 — 게임 진입 직후 보여주는 스플래시.
//
// 이 화면의 비주얼은 전부 `thum_bodyquiz.png` 한 장이다. 그 그림 안에
// 이미 로고·캐릭터·코끼리·호랑이·게임 분위기가 완성돼 있으므로, 코드로
// 타이틀이나 캐릭터를 다시 그리지 않는다(ken 지시) — 코드가 만드는 건
// 하단 중앙의 START 버튼 하나뿐이다.
//
// ── 다음 화면 분기는 여기서 정하지 않는다 ─────────────────────
//
// START를 누르면 언제나 `getPlayRoute('body-quiz')`로 간다. 튜토리얼을
// 아직 안 봤으면 뜨고 봤으면 곧장 게임인 분기는 `play.js`가 이미
// `shouldShowTutorial()`로 하고 있다 — 여기서 또 판단하면 그 판단이
// 두 곳에 나뉘어 어긋날 여지가 생긴다.
//
// `?tutorial=1`(개발용 강제 재표시)은 인트로를 거쳐 와도 그대로
// 이어지도록 play 라우트에 옮겨 붙인다 — 안 그러면 "인트로부터 다시
// 봐야 튜토리얼이 강제로 뜬다"는 경로마다 다른 동작이 생긴다.

import { navigate, onLeave } from '../../core/router.js'
import { icon } from '../../core/icons.js'
import { handSession } from '../../core/handSession.js'
import { getPlayRoute } from '../registry.js'

const GAME_ID = 'body-quiz'
const HERO_IMG = '/assets/body-quiz/intro/thum_bodyquiz.png'

/**
 * START가 실제로 갈 곳. `?tutorial=1`로 인트로에 들어왔으면 그 강제
 * 재표시를 play 라우트까지 이어 붙인다 — 안 그러면 "인트로를 거치면
 * 강제 표시가 풀린다"는 경로마다 다른 동작이 생긴다. 순수 함수로 뽑아
 * 둔 이유는 `navigate()`(실제 라우팅)를 안 태우고도 이 규칙만 테스트할
 * 수 있게 하기 위해서다.
 */
export function resolveStartRoute(query = {}) {
  const forceTutorial = query.tutorial === '1' || query.tutorial === 'true'
  return forceTutorial ? `${getPlayRoute(GAME_ID)}&tutorial=1` : getPlayRoute(GAME_ID)
}

export default function bodyQuizIntro(app, query = {}) {
  app.innerHTML = `
    <style>
      #bqi-root, #bqi-root * { box-sizing: border-box; }
      #bqi-root {
        position: fixed; inset: 0; overflow: hidden;
        background: #150a2e;   /* 그림이 늦게 뜰 때, 그리고 16:9가 아닌 화면의 레터박스 */
        font-family: var(--font-main, 'Jua', sans-serif);
        touch-action: none; user-select: none;
      }

      /* 온전한 그림 하나 — 타이틀·캐릭터가 이미 그림 안에 있다. 잘리지
         않는 게 우선이라 cover 대신 contain을 쓴다(ken 지시: "심하게 crop되지
         않도록 주의"). 원본이 16:9에 아주 가까워(1672×941) 16:9 화면에서는
         cover와 체감 차이가 거의 없다. */
      #bqi-hero {
        position: absolute; inset: 0; width: 100%; height: 100%;
        object-fit: contain; object-position: center;
      }

      #bqi-top-left {
        position: fixed; top: clamp(12px, 2vw, 24px); left: clamp(12px, 2vw, 24px);
        z-index: 10;
      }
      #bqi-back {
        display: inline-flex; align-items: center; gap: 7px;
        background: rgba(255,255,255,0.92); border: none;
        border-radius: 9999px; padding: clamp(8px, 1.2vw, 12px) clamp(16px, 2.2vw, 24px);
        font-family: inherit; font-size: clamp(0.9rem, 1.6vw, 1.15rem); font-weight: 900;
        color: #6b3fa0; cursor: pointer;
        box-shadow: 0 3px 0 #c4a8f5, 0 6px 18px rgba(0,0,0,0.22);
        -webkit-tap-highlight-color: transparent; transition: transform 0.12s;
      }
      #bqi-back:hover  { transform: scale(1.06); }
      #bqi-back:active { transform: scale(0.94); }

      /* ── START — 밝은 마젠타/핑크 glossy 게임 버튼. 타이틀이 그림
         가운데에 있으므로 버튼은 하단에만 둔다(ken 지시). ── */
      #bqi-start {
        position: fixed; z-index: 10;
        left: 50%; bottom: clamp(6%, 8%, 10%); transform: translateX(-50%);
        display: inline-flex; align-items: center; gap: 12px;
        min-width: clamp(220px, 26vw, 340px); justify-content: center;
        padding: clamp(16px, 2.6vh, 26px) clamp(36px, 5vw, 64px);
        border: 4px solid rgba(255,255,255,0.95); border-radius: 9999px;
        background: linear-gradient(180deg, #ff9be0 0%, #ff2fa0 50%, #d600a0 100%);
        color: #fff; font: inherit; font-weight: 900; letter-spacing: 0.04em;
        font-size: clamp(1.3rem, 3vw, 2rem); cursor: pointer;
        box-shadow:
          0 0 0 6px rgba(255,47,160,0.28),
          0 0 40px rgba(255,47,160,0.85),
          0 8px 0 #9c007a, 0 16px 34px rgba(0,0,0,0.4);
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.12s, box-shadow 0.12s;
        animation: bqiPulse 1.8s ease-in-out infinite;
      }
      #bqi-start:hover  { transform: translateX(-50%) scale(1.05); }
      #bqi-start:active { transform: translateX(-50%) scale(0.95); animation: none; }
      #bqi-start svg { width: 1.3em; height: 1.3em; }
      @keyframes bqiPulse {
        0%, 100% { box-shadow: 0 0 0 6px rgba(255,47,160,0.28), 0 0 40px rgba(255,47,160,0.85), 0 8px 0 #9c007a, 0 16px 34px rgba(0,0,0,0.4); }
        50%      { box-shadow: 0 0 0 10px rgba(255,47,160,0.16), 0 0 60px rgba(255,47,160,1), 0 8px 0 #9c007a, 0 16px 34px rgba(0,0,0,0.4); }
      }

      @media (max-width: 520px) {
        #bqi-start { min-width: clamp(180px, 60vw, 280px); font-size: 1.2rem; }
      }
    </style>

    <div id="bqi-root">
      <img id="bqi-hero" src="${HERO_IMG}" alt="BODY QUIZ">

      <div id="bqi-top-left">
        <button id="bqi-back" data-pz-hit data-pz-dwell="800" aria-label="Home">${icon('back')} Home</button>
      </div>

      <button id="bqi-start" data-pz-hit data-pz-dwell="1200">${icon('play')} 게임 시작</button>
    </div>
  `

  // 손 커서는 인트로에서도 계속 필요하다(허브에서 켜 둔 세션을 이어받는다).
  // 게임 플레이 화면에서 꺼 뒀을 수 있으니 여기서 다시 켠다.
  handSession.setPointerActive(true)

  const playRoute = resolveStartRoute(query)

  let launched = false
  function start() {
    if (launched) return
    launched = true
    navigate(playRoute)
  }

  app.querySelector('#bqi-start').addEventListener('click', start)
  app.querySelector('#bqi-back').addEventListener('click', () => navigate('/'))

  onLeave(() => { /* 전역 리스너·rAF·카메라를 새로 열지 않아 정리할 것이 없다 */ })
}

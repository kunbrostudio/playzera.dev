// 풍선 팡팡 — 타이틀 화면.
//
// ken이 준 커버 그림(`assets.js`의 TITLE_IMAGE, manifest.json의 썸네일과 같은
// 그림)을 그대로 배경에 깔고 시작 버튼 하나만 얹는다. 시작 버튼 그림은
// `core/uiAssets.js`의 공용 그림을 쓴다 — "카드 클릭은 선택, 실행은 히어로의
// 시작 버튼 하나"(CLAUDE.md)와 다른 게임들이 이미 쓰는 것과 같은 그림이라
// 아이가 게임마다 다른 버튼을 다시 배우지 않는다.

import { UI } from '../../../core/uiAssets.js'
import { icon } from '../../../core/icons.js'
import { TITLE_IMAGE } from '../assets.js'

/** @returns {Promise<'start'|'home'>} */
export function showTitleScreen(app) {
  return new Promise(resolve => {
    app.innerHTML = `
      <style>
        #bf-title { position: fixed; inset: 0; overflow: hidden; background: #000; }
        #bf-title img.cover {
          position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
        }
        #bf-title::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 40%, rgba(10,6,20,0.75) 100%);
        }
        #bf-title .home {
          position: absolute; top: clamp(10px, 2vh, 20px); left: clamp(10px, 2vw, 20px); z-index: 2;
          min-height: 48px; padding: 0 16px; border-radius: 9999px;
          background: rgba(0,0,0,0.35); color: #fff; border: 2px solid rgba(255,255,255,0.3);
          font: inherit; font-weight: 800; font-size: 0.9rem; cursor: pointer;
          display: flex; align-items: center; gap: 6px; -webkit-tap-highlight-color: transparent;
        }
        /* 시작 버튼은 **화면 한가운데**다(ken 6차 요청). 예전에는 아래쪽에
           붙여 뒀는데, 커버 그림이 object-fit:cover라 화면 비율에 따라
           위아래가 잘리면서 버튼이 그림 어디에 걸릴지가 기기마다 달랐다.
           가운데는 어느 비율에서도 항상 화면 안이고, 손 커서로 겨누기에도
           가장 쉬운 자리다. 세로 중앙에서 살짝 아래(56%)로 둔 건 아이들
           얼굴 위를 덮지 않으려는 것 — 가로·세로 둘 다 정렬 기준은
           가운데다. */
        #bf-title .start {
          position: absolute; left: 50%; top: 56%; transform: translate(-50%, -50%);
          z-index: 2; background: none; border: none; padding: 0; cursor: pointer;
          filter: drop-shadow(0 8px 22px rgba(0,0,0,0.5));
          animation: bf-title-pulse 1.4s ease-in-out infinite;
          -webkit-tap-highlight-color: transparent;
        }
        #bf-title .start img { display: block; width: clamp(200px, 30vw, 320px); height: auto; }
        /* 키프레임에도 translate를 그대로 적어야 한다 — transform은 통째로
           덮어써져서, 여기서 빠뜨리면 애니메이션이 도는 순간 버튼이
           가운데에서 오른쪽 아래로 튄다. */
        @keyframes bf-title-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50%      { transform: translate(-50%, -50%) scale(1.05); }
        }
        @media (prefers-reduced-motion: reduce) { #bf-title .start { animation: none; } }
      </style>
      <div id="bf-title">
        <img class="cover" src="${TITLE_IMAGE}" alt="풍선 팡팡">
        <button class="home" type="button" aria-label="Home으로">${icon('home')} Home</button>
        <button class="start" type="button" aria-label="시작하기">
          <img src="${UI.startButton}" alt="시작하기">
        </button>
      </div>
    `
    app.querySelector('.start').addEventListener('click', () => resolve('start'))
    app.querySelector('.home').addEventListener('click', () => resolve('home'))
  })
}

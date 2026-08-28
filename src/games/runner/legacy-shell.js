// STEP 1 임시 셸 — warm-up-web/public/index.html의 #stage 마크업을 그대로 옮긴 것.
//
// main.js가 모듈 최상단에서 document.getElementById(...)로 DOM을 잡기 때문에,
// main.js를 import 하기 "전에" 이 마크업이 문서에 있어야 한다.
// STEP 5(게임팩화)에서 화면 소유권을 허브/게임팩으로 나눌 때 이 파일은 사라진다.

import { icon } from '../../core/icons.js';
import styleUrl from './style.css?url'
import { ui } from './theme.js'
import { hudMarkup, ensureHudStyle } from './ui/hud.js'
import { touchPadMarkup, ensureTouchPadStyle } from './ui/touchPad.js'

const STYLE_LINK_ID = 'runner-legacy-style'

// style.css가 html/body를 덮어쓰므로(배경 #050014 등) 전역 import 대신
// <link>로 붙였다 떼는 방식으로 격리한다.
export function mountRunnerStyle() {
  if (document.getElementById(STYLE_LINK_ID)) return
  const link = document.createElement('link')
  link.id = STYLE_LINK_ID
  link.rel = 'stylesheet'
  link.href = styleUrl
  document.head.appendChild(link)
  // HUD 모양은 `ui/hud.js`가 들고 있다 — `style.css`에서 떼어냈다.
  // 3D 러너는 이 style.css를 안 부르므로 거기 두면 뼈대만 나온다.
  ensureHudStyle()
  ensureTouchPadStyle()
}

export function unmountRunnerStyle() {
  document.getElementById(STYLE_LINK_ID)?.remove()
}

/**
 * 스테이지 마크업.
 *
 * **함수여야 한다.** 예전엔 `export const STAGE_HTML = \`...\`` 였는데, 안에 테마
 * 아이콘 경로(`${'$'}{ui('menu')}`)를 넣는 순간 **import 시점에 평가**됐다.
 * 그 시점엔 `setTheme()`이 아직 안 불렸으니 `ui()`가 던지고, 모듈 로드 자체가
 * 실패해서 **러너 게임이 둘 다 안 켜졌다.**
 *
 * 상수를 함수로 바꾸는 것이 답이다 — 테마를 읽는 것은 무엇이든 "쓸 때" 읽어야 한다.
 */
export function stageHtml() {
  return `
<div id="stage">
  <canvas id="game-canvas" width="1600" height="900"></canvas>

  <!-- 웹캠 PIP -->
  <div id="pip" class="hidden">
    <video id="webcam" autoplay playsinline muted></video>
    <canvas id="pip-overlay" width="320" height="180"></canvas>
    <div id="pip-label">모션 인식 중</div>
  </div>

  <!-- DOM 오버레이 화면들 -->
  <div id="overlay"></div>

  <!-- 게임플레이 HUD (DOM — 캔버스가 잘려도(세로 모드 cover) 항상 화면에 보이도록 분리)
       마크업과 모양은 3D 러너와 같이 쓴다 (ui/hud.js). 여기서 직접 적지 않는다 —
       두 벌이 되면 버튼 하나 옮길 때 두 군데를 고쳐야 한다. -->
  ${hudMarkup({ hidden: true })}

  <!-- 허브 복귀 (좌상단) — 플레이 중이 아닐 때만 보인다.
       플레이 중에는 기존 종료 확인 플로우(우상단 종료 버튼 / 팔로 X)로 나가야
       운동 기록이 저장된다. 여기로 바로 빠져나가면 그 경로를 건너뛴다. -->
  <button id="btn-hub" class="hub-back-btn" data-pz-hit data-pz-dwell="800">← Home</button>

  <!-- 상단 시스템 버튼 (햄버거 메뉴 / 전체화면 / 종료) -->
  <div id="topbar">
    <div class="menu-wrap">
      <button id="btn-menu" class="menu-icon-btn" title="메뉴">
        <img id="menu-ico" src="${ui('menu')}" alt="메뉴">
      </button>
      <div id="menu-panel" class="hidden">
        <button class="menu-item" id="menu-item-music" aria-label="배경음악">
          <img id="menu-music-img" src="${ui('music')}" alt="BGM">
        </button>
        <button class="menu-item" id="menu-item-audio" aria-label="효과음">
          <img id="menu-audio-img" src="${ui('sfxOn')}" alt="효과음">
        </button>
        <button class="menu-item" id="btn-fullscreen" aria-label="전체화면">
          <img src="${ui('fullscreen')}" alt="전체화면">
        </button>
      </div>
    </div>
    <button id="btn-exit" class="sys-icon-btn hidden" title="게임 종료">
      <img src="${ui('exit')}" alt="종료">
    </button>
    <div id="exit-gesture-gauge" class="exit-gesture-gauge hidden">
      <div class="exit-gesture-label">${icon('hand')} 팔로 X → 종료</div>
      <div class="exit-gesture-gauge-track"><div id="exit-gesture-gauge-fill" class="exit-gesture-gauge-fill"></div></div>
    </div>
  </div>

  <!-- 모바일 터치 컨트롤 — 마크업과 모양은 3D 러너와 같이 쓴다 (ui/touchPad.js) -->
  ${touchPadMarkup({ hidden: true })}

  <!-- 종료 확인 모달 -->
  <div id="confirm-modal" class="hidden">
    <div class="confirm-box">
      <p>게임을 그만할까요?</p>
      <!-- **세로로 쌓는다.** 셋이 가로로 서면 줄이 넘치고, 4~8세는 가운데
           버튼을 겨누기 어려워한다. 3D 러너와 같은 구성이다
           (ui/systemBar.js — 거기가 이 모양의 정본이다). -->
      <div class="confirm-actions">
        <button class="btn secondary" id="btn-resume">계속하기</button>
        <button class="btn" id="btn-quit-confirm">게임 처음으로</button>
        <button class="btn ghost" id="btn-quit-home">${icon('home')} Home으로</button>
      </div>
      <div class="gesture-hint hidden" id="confirm-gesture-hint">
        ${icon('hand')} 머리 위 <b>동그라미(O)</b>=계속하기 · 팔로 <b>엑스(X)</b>=종료하기
        <div class="gesture-gauge"><div class="gesture-gauge-fill" id="confirm-gauge-fill"></div></div>
      </div>
    </div>
  </div>
</div>
`
}

// STEP 1 임시 셸 — warm-up-web/public/index.html의 #stage 마크업을 그대로 옮긴 것.
//
// main.js가 모듈 최상단에서 document.getElementById(...)로 DOM을 잡기 때문에,
// main.js를 import 하기 "전에" 이 마크업이 문서에 있어야 한다.
// STEP 5(게임팩화)에서 화면 소유권을 허브/게임팩으로 나눌 때 이 파일은 사라진다.

import styleUrl from './style.css?url'

const STYLE_LINK_ID = 'warmup-legacy-style'

// style.css가 html/body를 덮어쓰므로(배경 #050014 등) 전역 import 대신
// <link>로 붙였다 떼는 방식으로 격리한다.
export function mountWarmupStyle() {
  if (document.getElementById(STYLE_LINK_ID)) return
  const link = document.createElement('link')
  link.id = STYLE_LINK_ID
  link.rel = 'stylesheet'
  link.href = styleUrl
  document.head.appendChild(link)
}

export function unmountWarmupStyle() {
  document.getElementById(STYLE_LINK_ID)?.remove()
}

export const STAGE_HTML = `
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

  <!-- 게임플레이 HUD (DOM — 캔버스가 잘려도(세로 모드 cover) 항상 화면에 보이도록 분리) -->
  <div id="hud-left" class="hidden">
    <span id="hud-level">LEVEL 1</span>
    <span id="hud-stars">⭐ 0</span>
  </div>
  <div id="hud" class="hidden">
    <div id="hud-lives"></div>
    <div id="hud-counts">🦘 점프 0&nbsp;&nbsp;&nbsp;🧎 앉기 0&nbsp;&nbsp;&nbsp;🏃 피하기 0</div>
  </div>

  <!-- 허브 복귀 (좌상단) — 플레이 중이 아닐 때만 보인다.
       플레이 중에는 기존 종료 확인 플로우(우상단 종료 버튼 / 팔로 X)로 나가야
       운동 기록이 저장된다. 여기로 바로 빠져나가면 그 경로를 건너뛴다. -->
  <button id="btn-hub" class="hub-back-btn" data-pz-hit data-pz-dwell="800">← 게임 목록</button>

  <!-- 상단 시스템 버튼 (햄버거 메뉴 / 전체화면 / 종료) -->
  <div id="topbar">
    <div class="menu-wrap">
      <button id="btn-menu" class="menu-icon-btn" title="메뉴">
        <img id="menu-ico" src="/assets/warmup/image/ico_menu.png" alt="메뉴">
      </button>
      <div id="menu-panel" class="hidden">
        <button class="menu-item" id="menu-item-music" aria-label="배경음악">
          <img id="menu-music-img" src="/assets/warmup/image/btn_main_music.png" alt="BGM">
        </button>
        <button class="menu-item" id="menu-item-audio" aria-label="효과음">
          <img id="menu-audio-img" src="/assets/warmup/image/btn_main_audio.png" alt="효과음">
        </button>
        <button class="menu-item" id="btn-fullscreen" aria-label="전체화면">
          <img src="/assets/warmup/image/ico_menu_fullscreen.png" alt="전체화면">
        </button>
      </div>
    </div>
    <button id="btn-exit" class="sys-icon-btn hidden" title="게임 종료">
      <img src="/assets/warmup/image/ico_menu_logout.png" alt="종료">
    </button>
    <div id="exit-gesture-gauge" class="exit-gesture-gauge hidden">
      <div class="exit-gesture-label">✋ 팔로 X → 종료</div>
      <div class="exit-gesture-gauge-track"><div id="exit-gesture-gauge-fill" class="exit-gesture-gauge-fill"></div></div>
    </div>
  </div>

  <!-- 모바일 터치 컨트롤 (키보드 없는 기기에서 키보드 모드 대체) -->
  <div id="touch-controls" class="hidden">
    <div class="tc-pad">
      <button id="tc-jump" class="tc-btn tc-jump" aria-label="점프">▲</button>
      <div class="tc-pad-row">
        <button id="tc-left" class="tc-btn" aria-label="왼쪽">◀</button>
        <button id="tc-duck" class="tc-btn" aria-label="앉기">▼</button>
        <button id="tc-right" class="tc-btn" aria-label="오른쪽">▶</button>
      </div>
    </div>
    <div class="tc-pose-group">
      <button id="tc-pose-a" class="tc-btn tc-pose" aria-label="런지"><b>A</b><span>런지</span></button>
      <button id="tc-pose-s" class="tc-btn tc-pose" aria-label="상체숙이기"><b>S</b><span>숙이기</span></button>
      <button id="tc-pose-d" class="tc-btn tc-pose" aria-label="팔벌리기"><b>D</b><span>벌리기</span></button>
    </div>
  </div>

  <!-- 종료 확인 모달 -->
  <div id="confirm-modal" class="hidden">
    <div class="confirm-box">
      <p>게임을 종료할까요?</p>
      <div class="confirm-actions">
        <button class="btn secondary" id="btn-resume">계속하기</button>
        <button class="btn" id="btn-quit-confirm">종료하기</button>
      </div>
      <div class="gesture-hint hidden" id="confirm-gesture-hint">
        ✋ 머리 위 <b>동그라미(O)</b>=계속하기 · 팔로 <b>엑스(X)</b>=종료하기
        <div class="gesture-gauge"><div class="gesture-gauge-fill" id="confirm-gauge-fill"></div></div>
      </div>
    </div>
  </div>
</div>
`

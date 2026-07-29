// JAPARI RUN! — 부트스트랩 + 게임 루프 + 입력 통합(모션/키보드)
import { CONFIG } from './config.js';
import { loadAssets } from './assets.js';
import {
  initAudio, unlockAudio, startBgm, stopBgm, playSfx,
  isBgmMuted, toggleBgmMute, isSfxMuted, toggleSfxMute,
} from './audio.js';
import { PoseEngine } from './input/poseEngine.js';
import { MotionDetector } from './input/motionDetector.js';
import { matchPose } from './input/poseMatcher.js';
import { isArmsUpCircle, isArmsUpCross, GestureHold } from './input/gestureRecognizer.js';
import { World } from './game/world.js';
import { Character } from './game/character.js';
import { buildCourse } from './game/course.js';
import { ObstacleRun } from './game/obstacles.js';
import { Stats } from './stats.js';
import {
  showTitle, showCameraSetup, showTutorial1, showTutorial2,
  showCountdown, showLevelBanner, showMissionComplete, showGameOver,
} from './screens.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const pipEl = document.getElementById('pip');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnExit = document.getElementById('btn-exit');
const confirmModal = document.getElementById('confirm-modal');
const btnMenu = document.getElementById('btn-menu');
const menuIco = document.getElementById('menu-ico');
const menuPanel = document.getElementById('menu-panel');
const menuMusicImg = document.getElementById('menu-music-img');
const menuAudioImg = document.getElementById('menu-audio-img');
const hudEl = document.getElementById('hud');
const hudLeftEl = document.getElementById('hud-left');
const hudLevelEl = document.getElementById('hud-level');
const hudLivesEl = document.getElementById('hud-lives');
const hudStarsEl = document.getElementById('hud-stars');
const hudCountsEl = document.getElementById('hud-counts');
const exitGestureGauge = document.getElementById('exit-gesture-gauge');
const exitGestureGaugeFill = document.getElementById('exit-gesture-gauge-fill');

// ── 전역 상태 ──
const world = new World();
let character = new Character();
let stats = new Stats();
let run = null;              // 현재 레벨 ObstacleRun
let currentLevel = 0;
let inputMode = 'keyboard';  // 'motion' | 'keyboard'
let lastLandmarks = null;
let playing = false;
let paused = false;          // 종료 확인 모달 등으로 일시정지
let quitRequested = false;   // 플레이 중 "종료하기" 선택 시
let lives = CONFIG.game.lives;      // 목숨(하트) — 장애물/포즈 실패 시 차감
let gameOverRequested = false;      // 목숨 소진 시
let skipTitleNext = false;          // 게임오버 "다시 하기" → 타이틀 생략하고 바로 재도전

const poseEngine = new PoseEngine(
  document.getElementById('webcam'),
  document.getElementById('pip-overlay'),
);
const detector = new MotionDetector();

// 튜토리얼 동작 대기 콜백 저장소
const actionWaiters = { dodge: [], jump: [], duck: [] };
function fireAction(name) {
  const list = actionWaiters[name];
  while (list.length) list.pop()();
}
function waitAction(name, cb) { actionWaiters[name].push(cb); }

// ── 모션 입력 → 게임 ──
poseEngine.onFrame = lms => { lastLandmarks = lms; detector.update(lms); };

detector.onLaneChange = lane => {
  if (playing) { character.setLane(lane); stats.countSideStep(); }
  fireAction('dodge');
};
detector.onJump = () => {
  if (playing) { character.jump(); stats.countJump(); }
  fireAction('jump');
};
detector.onDuckStart = () => {
  if (playing) { character.setSlide(true); stats.countSquat(); }
  fireAction('duck');
};
detector.onDuckEnd = () => { if (playing) character.setSlide(false); };

// ── 키보드/터치 공통 폴백 액션 (개발·데모 + 카메라 미지원 + 모바일 터치 컨트롤) ──
const heldPoseKeys = new Set();
function actDodgeLeft() {
  if (playing) { character.setLane(character.lane - 1); stats.countSideStep(); }
  fireAction('dodge');
}
function actDodgeRight() {
  if (playing) { character.setLane(character.lane + 1); stats.countSideStep(); }
  fireAction('dodge');
}
function actJump() {
  if (playing) { character.jump(); stats.countJump(); }
  fireAction('jump');
}
function actDuckStart() {
  if (playing) { character.setSlide(true); stats.countSquat(); }
  fireAction('duck');
}
function actDuckEnd() { if (playing) character.setSlide(false); }
function actPoseDown(key) { heldPoseKeys.add(key); }
function actPoseUp(key) { heldPoseKeys.delete(key); }

// e.key 대신 e.code(물리적 키 위치)를 사용 — 한글 등 IME가 켜져 있으면 e.key가
// 'a'/'s'/'d'가 아닌 다른 문자로 바뀌어버려 키를 눌러도 인식되지 않는 문제가 있었음.
// e.code는 입력기(IME)/언어 레이아웃과 무관하게 항상 물리적 키 위치를 그대로 보고한다.
// 방향키(특히 ↓, ↑, Space)는 브라우저 기본 동작으로 페이지를 스크롤시켜버려서
// 게임 화면 아래로 검은 여백이 드러나는 문제가 있었음 — 게임에서 쓰는 키는 preventDefault로 막는다.
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyS', 'KeyD', 'Space']);
window.addEventListener('keydown', e => {
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  switch (e.code) {
    case 'ArrowLeft': actDodgeLeft(); break;
    case 'ArrowRight': actDodgeRight(); break;
    case 'ArrowUp': actJump(); break;
    case 'ArrowDown': actDuckStart(); break;
    case 'KeyA': actPoseDown('lunge'); break;
    case 'KeyS': actPoseDown('forwardbend'); break;
    case 'KeyD': actPoseDown('armsopen'); break;
  }
}, { passive: false });
window.addEventListener('keyup', e => {
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  switch (e.code) {
    case 'ArrowDown': actDuckEnd(); break;
    case 'KeyA': actPoseUp('lunge'); break;
    case 'KeyS': actPoseUp('forwardbend'); break;
    case 'KeyD': actPoseUp('armsopen'); break;
  }
}, { passive: false });

// ── 모바일 터치 컨트롤 (키보드 없는 기기에서 키보드 모드 대체) ──
function bindTouchButton(el, onDown, onUp) {
  if (!el) return;
  const start = ev => { ev.preventDefault(); onDown(); };
  const end = ev => { ev.preventDefault(); onUp?.(); };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointerleave', end);
  el.addEventListener('pointercancel', end);
}
bindTouchButton(document.getElementById('tc-left'), actDodgeLeft);
bindTouchButton(document.getElementById('tc-right'), actDodgeRight);
bindTouchButton(document.getElementById('tc-jump'), actJump);
bindTouchButton(document.getElementById('tc-duck'), actDuckStart, actDuckEnd);
bindTouchButton(document.getElementById('tc-pose-a'), () => actPoseDown('lunge'), () => actPoseUp('lunge'));
bindTouchButton(document.getElementById('tc-pose-s'), () => actPoseDown('forwardbend'), () => actPoseUp('forwardbend'));
bindTouchButton(document.getElementById('tc-pose-d'), () => actPoseDown('armsopen'), () => actPoseUp('armsopen'));

const touchControlsEl = document.getElementById('touch-controls');
function setTouchControlsVisible(on) { touchControlsEl?.classList.toggle('hidden', !on); }

// 포즈 유사도 (모션 우선, 키보드 폴백)
function getPoseScore(poseType) {
  if (heldPoseKeys.has(poseType)) return 1;
  if (inputMode === 'motion' && lastLandmarks) return matchPose(lastLandmarks, poseType);
  return 0;
}

// ── 일시정지 상태 통합 관리 (햄버거 메뉴 열림 OR 종료 확인창 열림 → 일시정지) ──
let menuOpen = false;
function updatePaused() {
  paused = menuOpen || !confirmModal.classList.contains('hidden');
}

// ── 햄버거 메뉴 (BGM/효과음 토글 — 똥피하기와 동일한 Play Zera UI 패턴) ──
function setMenuOpen(open) {
  menuOpen = open;
  menuPanel.classList.toggle('hidden', !menuOpen);
  menuIco.src = menuOpen ? '/assets/warmup/image/ico_menu_close.png' : '/assets/warmup/image/ico_menu.png';
  updatePaused(); // 게임 화면에서 메뉴를 열면 잠깐 일시정지
}
function syncMenuIcons() {
  menuMusicImg.src = isBgmMuted() ? '/assets/warmup/image/btn_main_music_off.png' : '/assets/warmup/image/btn_main_music.png';
  menuAudioImg.src = isSfxMuted() ? '/assets/warmup/image/btn_main_audio_off.png' : '/assets/warmup/image/btn_main_audio.png';
}
btnMenu.addEventListener('click', e => {
  e.stopPropagation();
  if (!confirmModal.classList.contains('hidden')) return; // 종료 확인창이 떠 있으면 무시
  setMenuOpen(!menuOpen);
});
menuPanel.addEventListener('click', e => e.stopPropagation());
document.addEventListener('click', () => { if (menuOpen) setMenuOpen(false); });
document.getElementById('menu-item-music').addEventListener('click', () => { toggleBgmMute(); syncMenuIcons(); });
document.getElementById('menu-item-audio').addEventListener('click', () => { toggleSfxMute(); syncMenuIcons(); });
syncMenuIcons();

// ── 전체화면 토글 (햄버거 메뉴 안 버튼) ──
btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)
      ?.call(document.documentElement);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  }
});

// ── 게임 종료(일시정지 → 확인) ──
// 모션 모드에서는 버튼 클릭 대신 손동작으로도 선택 가능: 머리 위 동그라미(O)=계속하기, 엑스(X)=종료하기
const confirmGestureHint = document.getElementById('confirm-gesture-hint');
const confirmGaugeFill = document.getElementById('confirm-gauge-fill');
let confirmGestureRaf = null;
let confirmOHold = null, confirmXHold = null;
let confirmGestureLast = 0;

function stopConfirmGestureLoop() {
  if (confirmGestureRaf) cancelAnimationFrame(confirmGestureRaf);
  confirmGestureRaf = null;
  confirmGestureHint.classList.add('hidden');
}
function startConfirmGestureLoop() {
  if (inputMode !== 'motion') return; // 키보드 모드는 카메라가 없으니 스킵
  confirmGestureHint.classList.remove('hidden');
  confirmOHold = new GestureHold(lms => isArmsUpCircle(lms, CONFIG.gesture), CONFIG.gesture.confirmHoldSec);
  confirmXHold = new GestureHold(lms => isArmsUpCross(lms, CONFIG.gesture), CONFIG.gesture.confirmHoldSec);
  confirmGestureLast = performance.now();
  const loop = () => {
    if (confirmModal.classList.contains('hidden')) { confirmGestureRaf = null; return; }
    const now = performance.now();
    const dt = (now - confirmGestureLast) / 1000; confirmGestureLast = now;
    const oDone = confirmOHold.update(dt, lastLandmarks);
    const xDone = confirmXHold.update(dt, lastLandmarks);
    confirmGaugeFill.style.width = `${Math.max(confirmOHold.progress, confirmXHold.progress) * 100}%`;
    if (oDone) { playSfx('button_press'); resumeFromExitConfirm(); return; }
    if (xDone) { playSfx('button_press'); doQuitConfirm(); return; }
    confirmGestureRaf = requestAnimationFrame(loop);
  };
  confirmGestureRaf = requestAnimationFrame(loop);
}

function openExitConfirm() {
  if (btnExit.classList.contains('hidden')) return; // 플레이 중이 아니면 무시
  if (!confirmModal.classList.contains('hidden')) return;
  if (menuOpen) setMenuOpen(false); // 메뉴가 열려 있었다면 닫고 종료 확인으로 전환
  confirmModal.classList.remove('hidden');
  updatePaused();
  startConfirmGestureLoop();
}
function resumeFromExitConfirm() {
  confirmModal.classList.add('hidden');
  updatePaused();
  stopConfirmGestureLoop();
}
function doQuitConfirm() {
  confirmModal.classList.add('hidden');
  updatePaused();        // 종료 확인창을 닫아야 게임 루프가 다시 돌면서 종료를 감지함
  stopConfirmGestureLoop();
  quitRequested = true;  // gameFlow 루프가 감지해서 정리
}
btnExit.addEventListener('click', openExitConfirm);
document.getElementById('btn-resume').addEventListener('click', () => { playSfx('button_press'); resumeFromExitConfirm(); });
document.getElementById('btn-quit-confirm').addEventListener('click', () => { playSfx('button_press'); doQuitConfirm(); });
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!confirmModal.classList.contains('hidden')) resumeFromExitConfirm();
    else if (menuOpen) setMenuOpen(false);
    else openExitConfirm();
  }
});

// 게임 진행 중(모션 모드) 팔로 엑스(X)를 일정 시간 유지하면 종료 확인창을 연다 —
// 확인창이 뜬 뒤에는 위 startConfirmGestureLoop()가 이어받아 한 번 더 X를 유지해야 실제 종료됨
const gameplayExitXHold = new GestureHold(lms => isArmsUpCross(lms, CONFIG.gesture), CONFIG.gesture.duringPlayExitHoldSec);

// ── 렌더 루프 ──
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (!paused) {
    const speed = run ? CONFIG.levels[currentLevel].speed : 0.4;
    world.update(dt, speed); // 포즈 유지 중에도 더 이상 멈추지 않고 계속 진행
    character.update(dt);

    if (run && playing) {
      const activePose = run.activePoseType;
      run.setPoseScore(activePose ? getPoseScore(activePose) : 0);
      run.update(dt);
    }

    // 게임 진행 중 손동작으로 종료 확인창 열기(모션 모드 전용)
    // 안내를 진행 중일 때만 보여주면 기능이 있는지 모르고 지나칠 수 있어, 모션 모드로
    // 플레이하는 동안에는 항상 라벨+게이지를 띄워둔다(0%여도 보임).
    if (playing && inputMode === 'motion') {
      const xDone = gameplayExitXHold.update(dt, lastLandmarks);
      exitGestureGauge.classList.remove('hidden');
      exitGestureGaugeFill.style.width = `${gameplayExitXHold.progress * 100}%`;
      if (xDone) { gameplayExitXHold.reset(); openExitConfirm(); }
    } else {
      gameplayExitXHold.reset();
      exitGestureGauge.classList.add('hidden');
    }
  }

  // draw
  ctx.clearRect(0, 0, CONFIG.canvas.w, CONFIG.canvas.h);
  world.draw(ctx);
  if (run && playing) {
    run.draw(ctx);
    character.draw(ctx);
    run.drawPopups(ctx); // Great!/Miss는 캐릭터보다 위(z순서)에
    updateHudDom();
    hudEl.classList.remove('hidden');
    hudLeftEl.classList.remove('hidden');
    pipEl.classList.toggle('big', !!run.activePoseType); // 포즈 유지 중 PIP 확대
  } else {
    character.draw(ctx);
    hudEl.classList.add('hidden');
    hudLeftEl.classList.add('hidden');
  }

  requestAnimationFrame(frame);
}

// HUD는 DOM 요소로 표시(세로 모드에서 캔버스를 크롭/확대해도 항상 화면에 남도록)
function updateHudDom() {
  hudLevelEl.textContent = `LEVEL ${currentLevel + 1}`;
  hudLivesEl.innerHTML = Array.from({ length: CONFIG.game.lives }, (_, i) =>
    `<span class="${i < lives ? 'life-full' : 'life-empty'}">♥</span>`
  ).join('');
  hudStarsEl.textContent = `⭐ ${stats.stars}`;
  hudCountsEl.textContent = `🦘 점프 ${stats.jumps}   🧎 앉기 ${stats.squats}   🏃 피하기 ${stats.sideSteps}`;
}

// 플레이 중 종료 처리: 확보된 운동 기록은 조용히 저장하고 타이틀로 복귀
async function handleQuit() {
  playing = false;
  paused = false;
  run = null;
  stopBgm();
  btnExit.classList.add('hidden');
  setTouchControlsVisible(false);
  poseEngine.stop();
  pipEl.classList.add('hidden');
  if (stats.jumps || stats.squats || stats.sideSteps || Object.keys(stats.poseHolds).length) {
    await stats.save();
  }
  quitRequested = false;
}

// 목숨 소진: 확보된 운동 기록은 저장하고 게임오버 화면에서 다시하기/종료 선택
async function handleGameOver() {
  playing = false;
  paused = false;
  run = null;
  stopBgm();
  btnExit.classList.add('hidden');
  setTouchControlsVisible(false);
  pipEl.classList.add('hidden');
  if (stats.jumps || stats.squats || stats.sideSteps || Object.keys(stats.poseHolds).length) {
    await stats.save();
  }
  // 머리 위 엑스(X) 유지로도 종료하기 선택 가능(모션 모드일 때만) — 이 화면에서 손동작을
  // 인식하려면 poseEngine이 계속 돌고 있어야 하므로, 화면이 끝난 뒤에 정지시킨다.
  const choice = await showGameOver(inputMode === 'motion' ? () => lastLandmarks : null);
  poseEngine.stop();
  skipTitleNext = choice === 'retry'; // 다시 하기 → 타이틀 화면 건너뛰고 바로 카메라 준비로
  gameOverRequested = false;
}

// ── 게임 플로우 ──
async function gameFlow() {
  outer: while (true) {
    stats = new Stats();
    character = new Character();
    run = null;
    playing = false;
    paused = false;
    quitRequested = false;
    gameOverRequested = false;
    lives = CONFIG.game.lives;
    btnExit.classList.add('hidden');
    setTouchControlsVisible(false);
    startBgm(); // 이미 오디오가 잠금 해제된 상태(재방문 등)라면 타이틀 화면부터 바로 재생

    if (!skipTitleNext) await showTitle();
    skipTitleNext = false;
    unlockAudio();
    playSfx('button_press');
    startBgm();
    btnExit.classList.remove('hidden'); // 카메라 준비 화면부터 종료 버튼 사용 가능

    // 카메라 셋업 → 튜토리얼1 → 튜토리얼2
    // 모션 모드에서는 각 화면에서 머리 위 엑스(X)를 1초 유지하면 바로 이전 화면으로 돌아갈 수 있다
    // (예: 튜토리얼2에서 엑스 → 튜토리얼1로, 튜토리얼1에서 엑스 → 카메라 준비 화면으로).
    let step = 'camera';
    while (step !== 'done') {
      if (step === 'camera') {
        // 이 화면에서는 어두운 화면 필터에 가려 웹캠 미리보기가 안 보이던 문제 + 버튼을 가리던
        // 문제 때문에, showCameraSetup이 준비되면 #pip를 화면 레이아웃 안(.pip-slot)으로 직접
        // 옮겨서 크게 보여주고, 화면을 나갈 때 원래 자리로 되돌려 놓는다(screens.js에서 처리).
        const setup = await showCameraSetup({
          poseInit: async () => {
            if (!poseEngine.available) await poseEngine.init();
            poseEngine.start();
            pipEl.classList.remove('hidden');
          },
          startCalibration: () => detector.startCalibration(),
          isCalibrated: () => detector.calibrated,
          quitCheck: () => quitRequested,
          pipEl,
          getLandmarks: () => lastLandmarks, // 머리 위 동그라미(O) 3초 유지로도 캘리브레이션 시작 가능
        });
        if (quitRequested) { await handleQuit(); continue outer; }
        inputMode = setup.mode;
        if (inputMode === 'keyboard') {
          pipEl.classList.add('hidden');
          setTouchControlsVisible(true); // 키보드 없는 기기(모바일)에서도 조작 가능하게
        }
        step = 'tutorial1';
      } else if (step === 'tutorial1') {
        const r = await showTutorial1(waitAction, () => quitRequested, inputMode === 'motion' ? () => lastLandmarks : null);
        if (quitRequested) { await handleQuit(); continue outer; }
        step = r === 'back' ? 'camera' : 'tutorial2';
      } else if (step === 'tutorial2') {
        const r = await showTutorial2(
          getPoseScore, () => quitRequested, inputMode === 'keyboard',
          inputMode === 'motion' ? () => lastLandmarks : null,
        );
        if (quitRequested) { await handleQuit(); continue outer; }
        step = r === 'back' ? 'tutorial1' : 'done';
      }
    }

    // 카운트다운 → 레벨 1~5
    await showCountdown();
    stats.startActive();

    let missionDone = false;
    for (currentLevel = 0; currentLevel < CONFIG.levels.length; currentLevel++) {
      stats.levelReached = currentLevel + 1;
      const course = buildCourse(currentLevel);
      run = new ObstacleRun(course, stats, character, { keyboardMode: inputMode === 'keyboard' });
      run.onMissionGate = () => { missionDone = true; };
      run.onMiss = () => {
        lives = Math.max(0, lives - 1);
        if (lives <= 0) gameOverRequested = true;
      };
      playing = true;

      // 레벨 종료 대기 (일시정지 중엔 진행 판정 없이 대기만)
      await new Promise(res => {
        const iv = setInterval(() => {
          if (paused) return;
          if (run.finished || missionDone || quitRequested || gameOverRequested) { clearInterval(iv); res(); }
        }, 100);
      });
      playing = false;
      run = null;

      if (quitRequested || missionDone || gameOverRequested) break;
      if (currentLevel < CONFIG.levels.length - 1) {
        await showLevelBanner(currentLevel + 1);
      }
    }

    if (quitRequested) { await handleQuit(); continue; }
    if (gameOverRequested) { await handleGameOver(); continue; }

    stopBgm();
    btnExit.classList.add('hidden');
    setTouchControlsVisible(false);
    stats.completed = missionDone || currentLevel >= CONFIG.levels.length - 1;
    await showMissionComplete(stats);
    // 루프 → 타이틀로
  }
}

// 브라우저 자동재생 정책상 완전 무음 자동재생은 불가능 — 페이지에서의 "첫 상호작용"
// (START 버튼을 누르기 전이라도 어디든 클릭/터치/키 입력) 즉시 BGM을 시작해서
// 타이틀 화면을 보는 동안에도 음악이 나오게 함
function armFirstInteractionAudioUnlock() {
  const unlockOnce = () => {
    unlockAudio();
    startBgm();
    document.removeEventListener('pointerdown', unlockOnce);
    document.removeEventListener('keydown', unlockOnce);
  };
  document.addEventListener('pointerdown', unlockOnce);
  document.addEventListener('keydown', unlockOnce);
}

// ── 부트스트랩 ──
(async function boot() {
  initAudio();
  Stats.flushPending();
  armFirstInteractionAudioUnlock();

  // 로딩 표시
  const ov = document.getElementById('overlay');
  ov.innerHTML = `<div class="screen dark"><h1>JAPARI RUN!</h1><p id="load-p">로딩 중… 0%</p></div>`;
  await loadAssets(f => {
    const p = document.getElementById('load-p');
    if (p) p.textContent = `로딩 중… ${Math.round(f * 100)}%`;
  });

  requestAnimationFrame(frame);
  gameFlow();
})();

// JAPARI RUN! — 부트스트랩 + 게임 루프 + 입력 통합(모션/키보드)
//
// STEP 2 — 재진입 가능하게 재구성.
//   이전에는 파일 최상단에서 DOM을 잡고 IIFE로 부팅했다. 모듈 캐시가 남아 있어
//   허브 → 웜업 → 허브 → 웜업으로 다시 들어오면 아무 일도 일어나지 않았고
//   (새로고침이 필요했다), 웹캠·rAF·window 리스너도 그대로 살아 있었다.
//   이제 모든 상태를 boot()에서 만들고 destroy()에서 되돌린다.
//
//   규칙 세 가지
//     · DOM 참조는 boot() 안에서 잡는다 (마운트할 때마다 새 엘리먼트다)
//     · window/document 리스너는 전부 AbortController signal로 건다
//     · 루프(rAF·setInterval)는 id를 남겨 destroy에서 취소한다
//
//   게임팩 인터페이스(init/update/render/destroy) 정식 규격화는 STEP 5.
import { CONFIG } from './config.js';
import { handSession } from '../../core/handSession.js';
import { loadAssets } from './assets.js';
import {
  initAudio, unlockAudio, startBgm, stopBgm, playSfx,
  isBgmMuted, toggleBgmMute, isSfxMuted, toggleSfxMute,
} from './audio.js';
import { PoseEngine } from './input/poseEngine.js';
import { MotionDetector } from './input/motionDetector.js';
import { matchPose } from './input/poseMatcher.js';
import { isPoseDebugOn, createPoseDebug } from './input/poseDebug.js';
import { isArmsUpCircle, isArmsUpCross, GestureHold } from './input/gestureRecognizer.js';
import { World } from './game/world.js';
import { Character } from './game/character.js';
import { buildCourse } from './game/course.js';
import { ObstacleRun } from './game/obstacles.js';
import { Stats } from './stats.js';
import {
  showTitle, showCameraSetup, showTutorial1, showTutorial2,
  showCountdown, showLevelBanner, showMissionComplete, showGameOver,
  abortScreens,
} from './screens.js';

// ── 수명 관리 ──
let running = false;        // boot() 완료 ~ destroy() 전
let ac = null;              // 이 세션에 건 모든 리스너를 한 번에 떼기 위한 컨트롤러
let rafId = null;
const timers = new Set();   // setInterval id — destroy에서 일괄 정리
function track(id) { timers.add(id); return id; }
function untrack(id) { clearInterval(id); timers.delete(id); }

// 에셋·오디오는 세션마다 다시 만들 필요가 없다 (브라우저 캐시로 빨라도 수십 개 디코드)
let assetsReady = false;
let audioReady = false;

// ── DOM 참조 (boot에서 채운다) ──
let canvas, ctx, pipEl, btnFullscreen, btnExit, confirmModal;
let btnMenu, menuIco, menuPanel, menuMusicImg, menuAudioImg;
let hudEl, hudLeftEl, hudLevelEl, hudLivesEl, hudStarsEl, hudCountsEl;
let exitGestureGauge, exitGestureGaugeFill;
let confirmGestureHint, confirmGaugeFill;
let touchControlsEl, btnHub;

// ── 게임 상태 (boot에서 초기화) ──
let world = null;
let character = null;
let stats = null;
let poseEngine = null;
let detector = null;
let run = null;              // 현재 레벨 ObstacleRun
let currentLevel = 0;
let inputMode = 'keyboard';  // 'motion' | 'keyboard'
let poseDebug = null;        // ?debug=pose 일 때만 — 관절별 점수 오버레이
let lastLandmarks = null;
let playing = false;
let paused = false;          // 종료 확인 모달 등으로 일시정지
let quitRequested = false;   // 플레이 중 "종료하기" 선택 시
let lives = 0;               // 목숨(하트) — 장애물/포즈 실패 시 차감
let gameOverRequested = false;      // 목숨 소진 시
let skipTitleNext = false;          // 게임오버 "다시 하기" → 타이틀 생략하고 바로 재도전
let menuOpen = false;
let heldPoseKeys = new Set();
let gameplayExitXHold = null;

// 튜토리얼 동작 대기 콜백 저장소
const actionWaiters = { dodge: [], jump: [], duck: [] };
function fireAction(name) {
  const list = actionWaiters[name];
  while (list.length) list.pop()();
}
function waitAction(name, cb) { actionWaiters[name].push(cb); }
function clearActionWaiters() {
  for (const k of Object.keys(actionWaiters)) actionWaiters[k].length = 0;
}

// ── 키보드/터치 공통 폴백 액션 (개발·데모 + 카메라 미지원 + 모바일 터치 컨트롤) ──
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

function setTouchControlsVisible(on) { touchControlsEl?.classList.toggle('hidden', !on); }

// 플레이 중이면 종료 버튼, 아니면 허브 복귀 버튼. 둘은 항상 배타적이다.
//
// 플레이 중에 허브로 바로 나가는 길을 열어두면 종료 확인 플로우를 건너뛰게 되고,
// 그 경로에 있는 stats.save()도 함께 건너뛴다. (destroy()의 queueOnExit이 받아주긴
// 하지만 "저장됐다"는 피드백 없이 사라지는 건 다른 문제다.)
function setInPlayUi(on) {
  btnExit?.classList.toggle('hidden', !on);
  btnHub?.classList.toggle('hidden', on);
  // 타이틀에서는 손 커서로 START·게임 목록을 고를 수 있고, 플레이에 들어가면 숨긴다.
  // 몸으로 조종하는 화면에서 커서가 따라다니면 시야를 가린다.
  handSession.setPointerActive(!on);
}

// 포즈 유사도 (모션 우선, 키보드 폴백)
function getPoseScore(poseType) {
  if (heldPoseKeys.has(poseType)) return 1;
  if (inputMode === 'motion' && lastLandmarks) return matchPose(lastLandmarks, poseType);
  return 0;
}

// ── 일시정지 상태 통합 관리 (햄버거 메뉴 열림 OR 종료 확인창 열림 → 일시정지) ──
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

// ── 게임 종료(일시정지 → 확인) ──
// 모션 모드에서는 버튼 클릭 대신 손동작으로도 선택 가능: 머리 위 동그라미(O)=계속하기, 엑스(X)=종료하기
let confirmGestureRaf = null;
let confirmOHold = null, confirmXHold = null;
let confirmGestureLast = 0;

function stopConfirmGestureLoop() {
  if (confirmGestureRaf) cancelAnimationFrame(confirmGestureRaf);
  confirmGestureRaf = null;
  confirmGestureHint?.classList.add('hidden');
}
function startConfirmGestureLoop() {
  if (inputMode !== 'motion') return; // 키보드 모드는 카메라가 없으니 스킵
  confirmGestureHint.classList.remove('hidden');
  confirmOHold = new GestureHold(lms => isArmsUpCircle(lms, CONFIG.gesture), CONFIG.gesture.confirmHoldSec);
  confirmXHold = new GestureHold(lms => isArmsUpCross(lms, CONFIG.gesture), CONFIG.gesture.confirmHoldSec);
  confirmGestureLast = performance.now();
  const loop = () => {
    if (!running || confirmModal.classList.contains('hidden')) { confirmGestureRaf = null; return; }
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

// ── 렌더 루프 ──
let lastT = 0;
function frame(now) {
  if (!running) { rafId = null; return; }

  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (!paused) {
    const speed = run ? CONFIG.levels[currentLevel].speed : 0.4;
    world.update(dt, speed); // 포즈 유지 중에도 더 이상 멈추지 않고 계속 진행
    character.update(dt);

    if (run && playing) {
      run.update(dt);   // 점수는 run이 poseScoreFn으로 직접 물어본다
      poseDebug?.update(lastLandmarks, run.activePoseType, CONFIG.pose.matchThreshold);
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

  rafId = requestAnimationFrame(frame);
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
  setInPlayUi(false);
  setTouchControlsVisible(false);
  poseEngine.stop();
  pipEl.classList.add('hidden');
  // save()가 움직임 유무·중복 저장을 스스로 판단한다 (Stats.hasMovement / _saved)
  await stats.save();
  quitRequested = false;
}

// 목숨 소진: 확보된 운동 기록은 저장하고 게임오버 화면에서 다시하기/종료 선택
async function handleGameOver() {
  playing = false;
  paused = false;
  run = null;
  stopBgm();
  setInPlayUi(false);
  setTouchControlsVisible(false);
  pipEl.classList.add('hidden');
  await stats.save();
  // 머리 위 엑스(X) 유지로도 종료하기 선택 가능(모션 모드일 때만) — 이 화면에서 손동작을
  // 인식하려면 poseEngine이 계속 돌고 있어야 하므로, 화면이 끝난 뒤에 정지시킨다.
  const choice = await showGameOver(inputMode === 'motion' ? () => lastLandmarks : null);
  poseEngine.stop();
  skipTitleNext = choice === 'retry'; // 다시 하기 → 타이틀 화면 건너뛰고 바로 카메라 준비로
  gameOverRequested = false;
}

// ── 게임 플로우 ──
//
// 모든 await 뒤에 running을 확인한다. destroy()는 대기 중인 화면 Promise를
// abortScreens()로 즉시 resolve시키므로, 확인이 없으면 게임이 이미 사라진
// DOM을 상대로 다음 단계를 진행해 버린다.
async function gameFlow() {
  outer: while (running) {
    stats = new Stats();
    character = new Character();
    run = null;
    playing = false;
    paused = false;
    quitRequested = false;
    gameOverRequested = false;
    lives = CONFIG.game.lives;
    heldPoseKeys.clear();
    clearActionWaiters();
    setInPlayUi(false);
    setTouchControlsVisible(false);
    startBgm(); // 이미 오디오가 잠금 해제된 상태(재방문 등)라면 타이틀 화면부터 바로 재생

    if (!skipTitleNext) await showTitle();
    if (!running) return;
    skipTitleNext = false;
    unlockAudio();
    playSfx('button_press');
    startBgm();
    setInPlayUi(true); // 카메라 준비 화면부터 종료 버튼 사용 가능

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
            // init()이 도는 동안 허브로 나가버렸다면 destroy()의 release()는 아직
            // 스트림이 없는 상태에서 이미 지나갔다. 여기서 다시 끊지 않으면
            // 카메라 표시등이 켜진 채로 남는다.
            if (!running) { poseEngine.release(); return; }
            poseEngine.start();
            pipEl.classList.remove('hidden');
          },
          startCalibration: () => detector.startCalibration(),
          isCalibrated: () => detector.calibrated,
          quitCheck: () => quitRequested,
          pipEl,
          getLandmarks: () => lastLandmarks, // 머리 위 동그라미(O) 3초 유지로도 캘리브레이션 시작 가능
        });
        if (!running) return;
        if (quitRequested) { await handleQuit(); continue outer; }
        // 카메라 준비에서 팔로 X = 이전 화면(타이틀). 튜토리얼의 X와 같은 규칙이다.
        // 아직 아무것도 플레이하지 않았으므로 바깥 루프를 처음부터 돌리면 된다.
        if (setup.mode === 'back') {
          poseEngine.stop();
          pipEl.classList.add('hidden');
          skipTitleNext = false;
          continue outer;
        }
        inputMode = setup.mode;
        // 운동 데이터의 신뢰도를 가르는 값이므로 기록에 함께 남긴다.
        // 키보드 모드는 몸을 안 움직여도 카운트가 올라가 통계를 오염시킨다.
        stats.setInputMode(inputMode);
        if (inputMode === 'keyboard') {
          pipEl.classList.add('hidden');
          setTouchControlsVisible(true); // 키보드 없는 기기(모바일)에서도 조작 가능하게
        }
        step = 'tutorial1';
      } else if (step === 'tutorial1') {
        const r = await showTutorial1(waitAction, () => quitRequested, inputMode === 'motion' ? () => lastLandmarks : null);
        if (!running) return;
        if (quitRequested) { await handleQuit(); continue outer; }
        step = r === 'back' ? 'camera' : 'tutorial2';
      } else if (step === 'tutorial2') {
        const r = await showTutorial2(
          getPoseScore, () => quitRequested, inputMode === 'keyboard',
          inputMode === 'motion' ? () => lastLandmarks : null,
        );
        if (!running) return;
        if (quitRequested) { await handleQuit(); continue outer; }
        step = r === 'back' ? 'tutorial1' : 'done';
      }
    }

    // 카운트다운 → 레벨 1~5
    await showCountdown();
    if (!running) return;
    stats.startActive();
    // 운동 시간의 기준점. Stats 생성 시점(타이틀 도착)이 아니라 여기가 실제 플레이 시작이다.
    stats.markPlayStart();

    let missionDone = false;
    for (currentLevel = 0; currentLevel < CONFIG.levels.length; currentLevel++) {
      stats.levelReached = currentLevel + 1;
      const course = buildCourse(currentLevel);
      run = new ObstacleRun(course, stats, character, { keyboardMode: inputMode === 'keyboard' });
      run.poseScoreFn = getPoseScore;
      run.onMissionGate = () => { missionDone = true; };
      run.onMiss = () => {
        lives = Math.max(0, lives - 1);
        if (lives <= 0) gameOverRequested = true;
      };
      playing = true;

      // 레벨 종료 대기 (일시정지 중엔 진행 판정 없이 대기만)
      await new Promise(res => {
        const iv = track(setInterval(() => {
          if (!running) { untrack(iv); res(); return; }
          if (paused) return;
          if (run.finished || missionDone || quitRequested || gameOverRequested) { untrack(iv); res(); }
        }, 100));
      });
      playing = false;
      run = null;
      if (!running) return;

      if (quitRequested || missionDone || gameOverRequested) break;
      if (currentLevel < CONFIG.levels.length - 1) {
        await showLevelBanner(currentLevel + 1);
        if (!running) return;
      }
    }

    if (quitRequested) { await handleQuit(); continue; }
    if (gameOverRequested) { await handleGameOver(); continue; }

    stopBgm();
    setInPlayUi(false);
    setTouchControlsVisible(false);
    stats.completed = missionDone || currentLevel >= CONFIG.levels.length - 1;
    // 미션 완료 경로에 저장이 빠져 있었다 — 끝까지 완주한 판, 즉 운동량이 가장 많은
    // 기록이 통째로 유실되고 있었다(루프가 타이틀로 돌아가며 new Stats()로 덮어씀).
    // 결과 화면을 보여주기 전에 저장한다. 화면에서 오래 머물다 탭을 닫아도 남는다.
    await stats.save();
    await showMissionComplete(stats);
    // 루프 → 타이틀로
  }
}

// ── 부트스트랩 ──
export async function boot() {
  if (running) return;
  running = true;
  ac = new AbortController();
  const { signal } = ac;

  // 포즈 판정 진단 — `#/play?id=warmup-obstacle?debug=pose` 로 켠다.
  // 평소에는 만들지도 않으니 화면에도 번들에도 영향이 없다.
  if (isPoseDebugOn()) poseDebug = createPoseDebug();

  // ── DOM 참조 ──
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  pipEl = document.getElementById('pip');
  btnFullscreen = document.getElementById('btn-fullscreen');
  btnExit = document.getElementById('btn-exit');
  confirmModal = document.getElementById('confirm-modal');
  btnMenu = document.getElementById('btn-menu');
  menuIco = document.getElementById('menu-ico');
  menuPanel = document.getElementById('menu-panel');
  menuMusicImg = document.getElementById('menu-music-img');
  menuAudioImg = document.getElementById('menu-audio-img');
  hudEl = document.getElementById('hud');
  hudLeftEl = document.getElementById('hud-left');
  hudLevelEl = document.getElementById('hud-level');
  hudLivesEl = document.getElementById('hud-lives');
  hudStarsEl = document.getElementById('hud-stars');
  hudCountsEl = document.getElementById('hud-counts');
  exitGestureGauge = document.getElementById('exit-gesture-gauge');
  exitGestureGaugeFill = document.getElementById('exit-gesture-gauge-fill');
  confirmGestureHint = document.getElementById('confirm-gesture-hint');
  confirmGaugeFill = document.getElementById('confirm-gauge-fill');
  touchControlsEl = document.getElementById('touch-controls');
  btnHub = document.getElementById('btn-hub');

  // ── 게임 객체 ──
  world = new World();
  character = new Character();
  stats = new Stats();
  run = null;
  currentLevel = 0;
  inputMode = 'keyboard';
  lastLandmarks = null;
  playing = false;
  paused = false;
  quitRequested = false;
  gameOverRequested = false;
  skipTitleNext = false;
  menuOpen = false;
  lives = CONFIG.game.lives;
  heldPoseKeys = new Set();
  clearActionWaiters();

  poseEngine = new PoseEngine(
    document.getElementById('webcam'),
    document.getElementById('pip-overlay'),
  );
  detector = new MotionDetector();

  // 게임 진행 중(모션 모드) 팔로 엑스(X)를 일정 시간 유지하면 종료 확인창을 연다 —
  // 확인창이 뜬 뒤에는 startConfirmGestureLoop()가 이어받아 한 번 더 X를 유지해야 실제 종료됨
  gameplayExitXHold = new GestureHold(lms => isArmsUpCross(lms, CONFIG.gesture), CONFIG.gesture.duringPlayExitHoldSec);

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

  // ── 키보드 ──
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
  }, { passive: false, signal });
  window.addEventListener('keyup', e => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    switch (e.code) {
      case 'ArrowDown': actDuckEnd(); break;
      case 'KeyA': actPoseUp('lunge'); break;
      case 'KeyS': actPoseUp('forwardbend'); break;
      case 'KeyD': actPoseUp('armsopen'); break;
    }
  }, { passive: false, signal });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!confirmModal.classList.contains('hidden')) resumeFromExitConfirm();
      else if (menuOpen) setMenuOpen(false);
      else openExitConfirm();
    }
  }, { signal });

  // ── 모바일 터치 컨트롤 (키보드 없는 기기에서 키보드 모드 대체) ──
  const bindTouchButton = (id, onDown, onUp) => {
    const el = document.getElementById(id);
    if (!el) return;
    const start = ev => { ev.preventDefault(); onDown(); };
    const end = ev => { ev.preventDefault(); onUp?.(); };
    el.addEventListener('pointerdown', start, { signal });
    el.addEventListener('pointerup', end, { signal });
    el.addEventListener('pointerleave', end, { signal });
    el.addEventListener('pointercancel', end, { signal });
  };
  bindTouchButton('tc-left', actDodgeLeft);
  bindTouchButton('tc-right', actDodgeRight);
  bindTouchButton('tc-jump', actJump);
  bindTouchButton('tc-duck', actDuckStart, actDuckEnd);
  bindTouchButton('tc-pose-a', () => actPoseDown('lunge'), () => actPoseUp('lunge'));
  bindTouchButton('tc-pose-s', () => actPoseDown('forwardbend'), () => actPoseUp('forwardbend'));
  bindTouchButton('tc-pose-d', () => actPoseDown('armsopen'), () => actPoseUp('armsopen'));

  // ── 햄버거 메뉴 ──
  btnMenu.addEventListener('click', e => {
    e.stopPropagation();
    if (!confirmModal.classList.contains('hidden')) return; // 종료 확인창이 떠 있으면 무시
    setMenuOpen(!menuOpen);
  }, { signal });
  menuPanel.addEventListener('click', e => e.stopPropagation(), { signal });
  document.addEventListener('click', () => { if (menuOpen) setMenuOpen(false); }, { signal });
  document.getElementById('menu-item-music').addEventListener('click', () => { toggleBgmMute(); syncMenuIcons(); }, { signal });
  document.getElementById('menu-item-audio').addEventListener('click', () => { toggleSfxMute(); syncMenuIcons(); }, { signal });

  // ── 전체화면 토글 (햄버거 메뉴 안 버튼) ──
  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)
        ?.call(document.documentElement);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
  }, { signal });

  // ── 허브 복귀 ──
  // 라우터의 onLeave가 destroy()를 부르므로 여기서는 해시만 바꾸면 된다.
  setInPlayUi(false);
  btnHub?.addEventListener('click', () => { location.hash = '#/'; }, { signal });

  // ── 종료 확인 ──
  btnExit.addEventListener('click', openExitConfirm, { signal });
  document.getElementById('btn-resume').addEventListener('click', () => { playSfx('button_press'); resumeFromExitConfirm(); }, { signal });
  document.getElementById('btn-quit-confirm').addEventListener('click', () => { playSfx('button_press'); doQuitConfirm(); }, { signal });

  // ── 오디오 ──
  if (!audioReady) { initAudio(); audioReady = true; }
  syncMenuIcons();

  // 브라우저 자동재생 정책상 완전 무음 자동재생은 불가능 — 페이지에서의 "첫 상호작용"
  // (START 버튼을 누르기 전이라도 어디든 클릭/터치/키 입력) 즉시 BGM을 시작해서
  // 타이틀 화면을 보는 동안에도 음악이 나오게 함
  const unlockOnce = () => {
    unlockAudio();
    startBgm();
    document.removeEventListener('pointerdown', unlockOnce);
    document.removeEventListener('keydown', unlockOnce);
  };
  document.addEventListener('pointerdown', unlockOnce, { signal });
  document.addEventListener('keydown', unlockOnce, { signal });

  // ── 이탈 시 운동 기록 보존 ──
  //
  // 정상 종료 경로(handleQuit / handleGameOver / 미션 완료)는 stats.save()로 처리된다.
  // 하지만 아래 경로들은 그 함수를 거치지 않아 기록이 그냥 사라졌다:
  //   · 탭 닫기 · 새로고침 · 브라우저 뒤로가기
  //   · 허브 홈으로 라우팅 → 이건 이제 destroy()가 직접 처리한다
  //
  // pagehide 시점에는 비동기 요청이 취소되므로 Supabase를 부르지 않는다.
  // localStorage에 동기로 써두고, 다음 접속 때 Stats.flushPending()이 보낸다.
  // stats.queueOnExit()은 멱등하므로 아래 핸들러가 중복 발동해도 한 번만 저장된다.
  window.addEventListener('pagehide', () => stats?.queueOnExit(), { signal });
  // iOS Safari는 pagehide가 누락되는 경우가 있어 visibilitychange를 함께 본다
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stats?.queueOnExit();
  }, { signal });

  Stats.flushPending();          // 이전 이탈로 큐에 남은 기록을 먼저 전송

  // 로딩 표시
  const ov = document.getElementById('overlay');
  ov.innerHTML = `<div class="screen dark"><h1>JAPARI RUN!</h1><p id="load-p">로딩 중… 0%</p></div>`;
  if (!assetsReady) {
    await loadAssets(f => {
      const p = document.getElementById('load-p');
      if (p) p.textContent = `로딩 중… ${Math.round(f * 100)}%`;
    });
    assetsReady = true;
  }
  if (!running) return;   // 로딩 중에 나가버린 경우

  lastT = performance.now();
  rafId = requestAnimationFrame(frame);
  gameFlow();
}

// ── 정리 ──
//
// 허브로 돌아갈 때 호출한다. 여기서 되돌리지 않은 것은 다음 진입에 그대로 남는다:
//   웹캠 트랙(카메라 표시등이 안 꺼짐) · rAF 루프(두 번 돌아 배속) ·
//   window 리스너(방향키가 두 번 먹음) · 화면 Promise(gameFlow가 멈춘 채 잔류)
export function destroy() {
  if (!running) return;
  running = false;

  // 저장 안 된 판이 있으면 큐에 보존 — 리스너를 떼기 전에 먼저 한다.
  // save()가 이미 성공했거나 움직임이 없으면 queueOnExit()이 알아서 건너뛴다.
  try { stats?.queueOnExit(); } catch { /* 무시 */ }

  ac?.abort();
  ac = null;

  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  stopConfirmGestureLoop();
  poseDebug?.destroy();
  poseDebug = null;

  for (const id of timers) clearInterval(id);
  timers.clear();

  abortScreens();          // 대기 중인 화면 Promise를 즉시 resolve → gameFlow 탈출
  clearActionWaiters();

  poseEngine?.release();   // 웹캠 트랙 정지 + 랜드마커 해제
  stopBgm();

  document.body.classList.remove('on-title');

  // world·stats·poseEngine 참조는 null로 밀지 않는다. destroy 직후 마이크로태스크에서
  // 깨어나는 await 뒤 코드가 `if (!running) return`에 닿기 전에 이들을 건드릴 수 있어
  // null이면 그 자리에서 터진다. 다음 boot()이 어차피 전부 새로 만들어 덮어쓴다.
  run = null;
  playing = false;
  paused = false;
  menuOpen = false;
}

// BODY QUIZ 실제 플레이 — 카메라가 무대이고 UI는 그 위에 얹힌다.
// 게임 규칙은 BodyQuizRun, 몸 동작은 BODY QUIZ 전용 motionInput이 맡는다.

import { navigate, onLeave } from '../../core/router.js'
import { icon } from '../../core/icons.js'
import { handSession } from '../../core/handSession.js'
import { poseEngineCore } from '../../core/pose/poseEngine.js'
import { getManifest, getBackTo } from '../registry.js'
import { ensureSysBarStyle } from '../runner/ui/systemBar.js'
import { QUESTIONS } from './questions.js'
import { BodyQuizRun, PHASE, getAnswerHoldCountdown } from './game.js'
import { BODY_QUIZ_GUIDE_CHARACTERS, getBodyQuizGuideCue } from './guide.js'
import {
  createBodyQuizSession,
  createBodyQuizQuestionTiming,
  markBodyQuizExerciseCompleted,
  markBodyQuizAnswerSelected,
} from './session.js'
import {
  createBodyQuizTutorial,
  shouldShowTutorial,
  markTutorialCompleted,
  bodyQuizSystemBarMarkup,
  bindBodyQuizSystemBar,
} from './tutorial.js'
import {
  bodyQuizAssetReadiness,
  createBodyQuizLoadingGate,
  getBodyQuizPlayAssets,
  openBodyQuizReadinessGate,
} from './assetReadiness.js'
import {
  BODY_QUIZ_MOTION_HUD_CSS,
  bodyQuizMotionHudMarkup,
  createBodyQuizMotionHud,
} from './motionHud.js'
import {
  BODY_QUIZ_INPUT_TUNING,
  BodyQuizSquatDetector,
  createBodyQuizZoneDetector,
} from './motionInput.js'
import {
  BODY_QUIZ_RESULT_FX_TIMEOUT_MS,
  createBodyQuizResultFx,
} from './resultFx.js'
import { createBodyQuizAudio, playBodyQuizButtonSfx } from './audio.js'

export { BODY_QUIZ_RESULT_FX_TIMEOUT_MS } from './resultFx.js'

// 기존 import 계약은 유지하되 구현 정본은 motionHud.js 한 곳에 둔다.
export { bodyQuizMotionIcon } from './motionHud.js'

/** poseEngineCore의 참조 하나를 안전하게 빌리는 수명주기 래퍼. */
export function createBodyQuizCameraSession({ videoEl, onLandmarks, onStatus, engine = poseEngineCore }) {
  let acquired = false
  let detach = null
  let unsubscribe = null
  let destroyed = false
  let pending = null
  let generation = 0

  async function start() {
    if (destroyed || acquired) return acquired
    if (pending) return pending
    const run = ++generation
    onStatus?.('connecting')
    pending = (async () => {
      try {
        await engine.acquire()
        if (destroyed || run !== generation) {
          engine.release()
          return false
        }
        acquired = true
        detach = engine.attach(videoEl)
        unsubscribe = engine.onLandmarks(onLandmarks)
        onStatus?.('ready')
        return true
      } catch (error) {
        if (!destroyed && run === generation) onStatus?.('error', error)
        return false
      } finally {
        pending = null
      }
    })()
    return pending
  }

  function destroy() {
    if (destroyed) return
    destroyed = true
    generation++
    unsubscribe?.()
    unsubscribe = null
    detach?.()
    detach = null
    if (acquired) {
      acquired = false
      engine.release()
    }
  }

  return { start, destroy }
}

export default function bodyQuizPlay(app, query, {
  assetReadiness = bodyQuizAssetReadiness,
  tutorialPolicy = shouldShowTutorial,
  loadingScreen,
  sessionRandom = Math.random,
  audioController = createBodyQuizAudio(),
} = {}) {
  const gameId = query.id ?? 'body-quiz'
  const manifest = getManifest(gameId)
  if (!manifest) { navigate('/'); return }

  // 인트로/허브의 손 커서와 PIP가 실제 전신 플레이 위에 남으면 zone 선택과
  // 시야를 방해한다. 카메라 스트림은 공용 엔진이 계속 공유하고 표시만 끈다.
  handSession.setPointerActive(false)

  const backTo = getBackTo(gameId)
  const session = createBodyQuizSession(QUESTIONS, { random: sessionRandom })
  if (!session.questions.length) { navigate(backTo); return }
  let questionIndex = 0
  let question = session.questions[questionIndex]
  let game = new BodyQuizRun(question)
  let squatDetector = new BodyQuizSquatDetector({ frameAspect: poseEngineCore.frameAspect })
  let questionTiming = null
  let timingCommitted = false
  let currentZone = 1
  let tutorialActive = false
  let systemPaused = false
  let screenReady = false
  let destroyed = false
  let hasPoseFrame = false
  let lastTrackableAt = null
  let resultFxStarted = false
  let resultFxHandle = null

  // BGM 준비는 image readiness와 별개다. 늦거나 실패해도 게임은 즉시 진행한다.
  void audioController.prepare(gameId)

  ensureSysBarStyle(app.ownerDocument)

  app.innerHTML = `
    <style>
      #bq, #bq * { box-sizing: border-box; }
      ${BODY_QUIZ_MOTION_HUD_CSS}
      #bq {
        --bq-header-height: clamp(44px, 6dvh, 58px);
        --bq-header-border: 3px;
        --bq-header-depth: 5px;
        position: fixed; inset: 0; overflow: hidden;
        background: #17102e; color: #fff;
        font-family: var(--font-main, 'Jua', sans-serif);
        touch-action: none; user-select: none;
      }

      /* 카메라가 화면 전체의 실제 무대다. 영상도 거울처럼 보여 화면 반응과 맞춘다. */
      #bq-camera-layer, #bq-camera, #bq-readability { position: absolute; inset: 0; }
      #bq-camera-layer { z-index: 0; overflow: hidden; background: radial-gradient(circle at 50% 35%, #4a3b6e, #17102e 72%); }
      #bq-camera { width: 100%; height: 100%; object-fit: cover; display: block; transform: scaleX(-1); filter: saturate(1.04) contrast(1.02); }
      #bq-readability {
        z-index: 1; pointer-events: none;
        background:
          linear-gradient(180deg, rgba(13,8,38,0.56) 0%, rgba(13,8,38,0.10) 24%, rgba(13,8,38,0.02) 58%, rgba(13,8,38,0.48) 100%),
          linear-gradient(90deg, rgba(16,8,42,0.27), transparent 24%, transparent 76%, rgba(16,8,42,0.27));
      }

      #bq-camera-status {
        position: absolute; z-index: 2; inset: 0;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 10px; text-align: center; padding: 80px 20px;
        color: #fff; background: radial-gradient(circle at 50% 42%, rgba(100,78,151,0.58), rgba(23,16,46,0.88));
      }
      #bq-camera-status[hidden] { display: none; }
      #bq-camera-status strong { font-size: clamp(1rem, 2.2vw, 1.35rem); }
      #bq-camera-status span { font-size: clamp(0.72rem, 1.4vw, 0.92rem); color: #e2daf8; }
      #bq-camera-retry {
        min-height: 42px; padding: 0 22px; border: 2px solid #fff; border-radius: 9999px;
        background: linear-gradient(180deg, #fff3a0, #ffd23e); color: #573600;
        font: inherit; font-weight: 900; cursor: pointer; box-shadow: 0 4px 0 #b77c14;
      }
      #bq-camera-retry:active { transform: translateY(3px); box-shadow: none; }

      #bq-ui {
        position: absolute; z-index: 3; inset: 0;
        display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto;
        gap: clamp(6px, 1.2dvh, 14px);
        padding: max(8px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
          max(10px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
      }

      /* 헤더 — 실제 세션 진행도 + 튜토리얼과 같은 원형 system actions. */
      #bq-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; position: relative; z-index: 8; }
      #bq-progress {
        height: var(--bq-header-height); min-width: clamp(124px, 12vw, 168px);
        display: inline-flex; align-items: center; justify-content: center; gap: clamp(7px, .8vw, 11px);
        padding: 0 clamp(15px, 2vw, 25px); border: var(--bq-header-border) solid #fff; border-radius: 9999px;
        background: linear-gradient(180deg, #82efff 0%, #279eea 52%, #1262c8 100%); color: #fff;
        box-shadow: inset 0 2px 0 rgba(255,255,255,.48), 0 0 20px rgba(64,210,255,.5),
          0 var(--bq-header-depth) 0 rgba(22,68,157,.78), 0 calc(var(--bq-header-depth) + 4px) 18px rgba(0,0,0,.24);
        font-size: clamp(.86rem, 1.45vw, 1.08rem); font-weight: 900; letter-spacing: .04em; white-space: nowrap;
      }
      #bq-progress strong { font-size: 1.26em; letter-spacing: .02em; text-shadow: 0 2px 0 rgba(30,53,130,.72); }
      #bq-system-slot #pz-topbar { position: static; display: flex; align-items: center; gap: clamp(6px, .8vw, 12px); }
      #bq-system-slot > #pz-home { display: none; }
      .bqt-header-action {
        --bqt-header-depth-color: rgba(8,73,128,.64); --bqt-header-glow: rgba(64,210,255,.38);
        width: var(--bq-header-height); height: var(--bq-header-height); padding: 0;
        display: inline-flex; align-items: center; justify-content: center;
        border: var(--bq-header-border) solid #fff; border-radius: 9999px; color: #fff;
        box-shadow: inset 0 2px 0 rgba(255,255,255,.42), 0 0 18px var(--bqt-header-glow),
          0 var(--bq-header-depth) 0 var(--bqt-header-depth-color), 0 calc(var(--bq-header-depth) + 4px) 18px rgba(0,0,0,.24);
        transition: transform .12s, filter .12s, box-shadow .12s;
      }
      .bqt-header-action--menu { background: linear-gradient(180deg, #71e8ff 0%, #168fe9 54%, #075fc4 100%); }
      .bqt-header-action--exit { --bqt-header-depth-color: rgba(139,28,45,.72); --bqt-header-glow: rgba(255,91,111,.38); background: linear-gradient(180deg, #ffaaa6 0%, #ff4f62 54%, #d62543 100%); }
      .bqt-header-action > span { width: 100%; height: 100%; display: inline-flex; align-items: center; justify-content: center; }
      .bqt-header-action .pz-ico { width: 52%; height: 52%; stroke-width: 2.35; }
      .bqt-header-action:hover { filter: brightness(1.07); transform: scale(1.04); }
      .bqt-header-action:active { transform: translateY(3px) scale(.96); box-shadow: none; }
      .bqt-header-action:focus-visible, #bq .pz-menu-item:focus-visible,
      #bq .pz-btn:focus-visible, #bq-camera-retry:focus-visible { outline: 3px solid #ffe066; outline-offset: 3px; }

      /* QUESTION — 승인된 tutorial의 한 줄 neon banner language. */
      #bq-question {
        justify-self: center; width: fit-content;
        min-width: min(72vw, 520px); max-width: min(92vw, 1280px);
        display: flex; align-items: center; gap: clamp(14px, 2vw, 30px);
        padding: clamp(8px, 1.2dvh, 14px) clamp(16px, 2.6vw, 36px);
        border: 4px solid #ff39aa; border-radius: 9999px;
        background: linear-gradient(180deg, rgba(70,26,124,.96), rgba(39,10,83,.97));
        box-shadow: inset 0 2px 0 rgba(255,255,255,.18), 0 0 24px rgba(255,47,160,.72), 0 6px 0 rgba(96,8,99,.62);
      }
      #bq-question-tag {
        flex: 0 0 auto; padding: 4px clamp(13px, 1.5vw, 20px); border: 2px solid #fff; border-radius: 9999px;
        background: linear-gradient(180deg, #fff09a, #ffbd36); color: #562300; box-shadow: 0 3px 0 #bc6f0d;
        font-size: clamp(.8rem, 1.3vw, 1.05rem); font-weight: 900; letter-spacing: .09em;
      }
      #bq-question-prompt { flex: 1 1 auto; min-width: 0; text-align: center; white-space: normal; overflow-wrap: anywhere; text-wrap: balance; color: #fff7cf; font-size: clamp(1.45rem, 3vw, 2.35rem); line-height: 1.08; font-weight: 900; text-shadow: 0 3px 0 #2a0e5e; }

      /* 중앙은 실제 아이의 전신을 위한 빈 공간이고, 답은 양 가장자리에 선다. */
      #bq-stage { position: relative; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(28vw, 42vw) minmax(0, 1fr); align-items: center; gap: clamp(8px, 1.5vw, 24px); }
      .bq-answer {
        --bq-card-scale: 1; --bq-card-opacity: 1; --bq-card-glow: rgba(104,218,255,.55);
        position: relative; top: clamp(-22px, -2dvh, -8px);
        width: min(100%, clamp(118px, min(21.5vw, 36dvh), 330px));
        display: flex; flex-direction: column; align-items: center;
        isolation: isolate;
        opacity: var(--bq-card-opacity);
        filter: drop-shadow(0 0 13px var(--bq-card-glow)) drop-shadow(0 12px 22px rgba(0,0,0,.48));
        transition: transform .18s ease, filter .18s ease, opacity .18s ease;
      }
      #bq-left { justify-self: end; --bq-card-tilt: 12deg; --bq-card-glow: rgba(72,204,255,.62); transform: perspective(1100px) rotateY(var(--bq-card-tilt)) scale(var(--bq-card-scale)); }
      #bq-right { justify-self: start; --bq-card-tilt: -12deg; --bq-card-glow: rgba(255,181,47,.60); transform: perspective(1100px) rotateY(var(--bq-card-tilt)) scale(var(--bq-card-scale)); }
      .bq-answer::before, .bq-answer::after {
        content: ''; position: absolute; z-index: 2; pointer-events: none;
        width: 7px; height: 7px; border-radius: 50%; color: var(--bq-card-glow);
        background: #fff; box-shadow: 0 0 8px 2px currentColor, 0 0 18px 5px currentColor;
        opacity: .18; transform: scale(.45) rotate(0deg);
        animation: bqCardSparkle 3s ease-in-out infinite;
      }
      .bq-answer::before { top: 10%; left: -2%; }
      .bq-answer::after { right: 1%; bottom: 22%; animation-delay: 1.45s; }
      .bq-answer-visual {
        --bq-sway-start: -.55deg; --bq-sway-end: .55deg;
        position: relative; z-index: 1; width: 100%; display: flex; flex-direction: column; align-items: center;
        gap: clamp(4px, .8dvh, 9px); animation: bqCardFloat 3.4s ease-in-out infinite;
      }
      #bq-right .bq-answer-visual { --bq-sway-start: .5deg; --bq-sway-end: -.5deg; animation-delay: -1.65s; }
      @keyframes bqCardFloat {
        0%, 100% { transform: translateY(0) rotateZ(var(--bq-sway-start)); }
        50% { transform: translateY(clamp(-7px, -1dvh, -3px)) rotateZ(var(--bq-sway-end)); }
      }
      .bq-card-aura {
        position: absolute; z-index: 0; inset: 5% 3% 16%; border: 2px solid var(--bq-card-glow);
        border-radius: 46%; pointer-events: none; opacity: .38;
        background: radial-gradient(circle, var(--bq-card-glow), transparent 68%);
        box-shadow: 0 0 18px 4px var(--bq-card-glow), inset 0 0 22px var(--bq-card-glow);
        animation: bqAuraPulse 2.8s ease-in-out infinite;
      }
      #bq-right .bq-card-aura { animation-delay: -1.35s; }
      @keyframes bqAuraPulse {
        0%, 100% { opacity: .28; transform: scale(.94); }
        50% { opacity: .58; transform: scale(1.04); }
      }
      @keyframes bqCardSparkle {
        0%, 32%, 100% { opacity: .14; transform: scale(.42) rotate(0deg); }
        46% { opacity: .92; transform: scale(1.15) rotate(45deg); }
        62% { opacity: .24; transform: scale(.58) rotate(90deg); }
      }
      .bq-answer img { width: 100%; aspect-ratio: 1; object-fit: contain; display: block; }
      .bq-label { min-width: 54%; padding: 4px 16px; border: 3px solid rgba(255,255,255,.95); border-radius: 9999px; text-align: center; color: #42277d; background: rgba(255,255,255,.94); box-shadow: 0 4px 0 rgba(71,47,126,.42); font-size: clamp(1rem, 2vw, 1.45rem); font-weight: 900; }
      .bq-answer.zone-active { --bq-card-scale: 1.07; filter: drop-shadow(0 0 22px #ffe066) drop-shadow(0 14px 24px rgba(0,0,0,.48)); }
      .bq-answer.zone-active .bq-card-aura { border-color: #fff6a6; animation: bqSelectedAura .72s ease-in-out infinite; box-shadow: 0 0 25px 8px #ffd447, inset 0 0 25px #fff3a0; }
      @keyframes bqSelectedAura { 0%,100% { opacity: .58; transform: scale(.98); } 50% { opacity: .96; transform: scale(1.08); } }
      .bq-answer.zone-muted { --bq-card-scale: .96; --bq-card-opacity: .66; }
      #bq.move-unlocked .bq-answer:not(.zone-muted):not(.correct):not(.wrong) { filter: drop-shadow(0 0 19px var(--bq-card-glow)) drop-shadow(0 13px 23px rgba(0,0,0,.48)); }
      .bq-answer.correct { --bq-card-scale: 1.08; filter: drop-shadow(0 0 24px #65f08a) drop-shadow(0 0 46px #ffd23e); }
      .bq-answer.wrong { --bq-card-scale: 1.03; filter: drop-shadow(0 0 24px #ff6c82); }
      .bq-answer.correct { animation: bqCorrectFlip 1.05s cubic-bezier(.2,.72,.25,1); }
      .bq-answer.correct .bq-card-aura { animation: bqCorrectRing 1.05s ease-out both; border-color: #fff5a0; }
      .bq-answer.wrong .bq-answer-visual { animation: bqWrongShake .58s ease-out; }
      .bq-answer.wrong .bq-card-aura { animation: bqFailPulse .58s ease-out both; border-color: #ff9aae; }
      @keyframes bqCorrectFlip {
        0% { transform: perspective(1100px) rotateY(var(--bq-card-tilt)) scale(1.08); }
        42% { transform: perspective(1100px) rotateY(calc(var(--bq-card-tilt) + 180deg)) scale(1.08); }
        68% { transform: perspective(1100px) rotateY(calc(var(--bq-card-tilt) + 360deg)) scale(1.19); }
        84% { transform: perspective(1100px) rotateY(calc(var(--bq-card-tilt) + 360deg)) scale(.99); }
        100% { transform: perspective(1100px) rotateY(calc(var(--bq-card-tilt) + 360deg)) scale(1.08); }
      }
      @keyframes bqCorrectRing { 0% { opacity: .3; transform: scale(.72); } 48% { opacity: 1; } 100% { opacity: 0; transform: scale(1.38); } }
      @keyframes bqFailPulse { 0%,100% { opacity: .25; transform: scale(1); } 35% { opacity: .9; transform: scale(1.08); } 65% { opacity: .45; transform: scale(.94); } }
      @keyframes bqWrongShake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-7px) rotate(-1.5deg); }
        40% { transform: translateX(6px) rotate(1.2deg); }
        60% { transform: translateX(-4px) rotate(-.8deg); }
        80% { transform: translateX(3px) rotate(.5deg); }
      }
      .bq-card-particles { position: absolute; z-index: 5; inset: 40% 50%; pointer-events: none; }
      .bq-card-particles i {
        --bq-particle-angle: 0deg; --bq-particle-distance: 58px;
        position: absolute; width: 8px; height: 8px; border-radius: 2px;
        background: #ffe066; box-shadow: 0 0 9px #fff, 0 0 16px #ffbd36;
        opacity: 0; transform: rotate(var(--bq-particle-angle)) translateX(0) rotate(45deg);
        animation: bqAmbientTwinkle 3.6s ease-in-out infinite;
      }
      .bq-card-particles i:nth-child(2) { --bq-particle-angle: 45deg; --bq-particle-distance: 72px; animation-delay: -.45s; }
      .bq-card-particles i:nth-child(3) { --bq-particle-angle: 90deg; --bq-particle-distance: 54px; animation-delay: -.9s; }
      .bq-card-particles i:nth-child(4) { --bq-particle-angle: 135deg; --bq-particle-distance: 68px; animation-delay: -1.35s; }
      .bq-card-particles i:nth-child(5) { --bq-particle-angle: 180deg; --bq-particle-distance: 62px; animation-delay: -1.8s; }
      .bq-card-particles i:nth-child(6) { --bq-particle-angle: 225deg; --bq-particle-distance: 74px; animation-delay: -2.25s; }
      .bq-card-particles i:nth-child(7) { --bq-particle-angle: 270deg; --bq-particle-distance: 58px; animation-delay: -2.7s; }
      .bq-card-particles i:nth-child(8) { --bq-particle-angle: 315deg; --bq-particle-distance: 70px; animation-delay: -3.15s; }
      @keyframes bqAmbientTwinkle {
        0%, 70%, 100% { opacity: 0; transform: rotate(var(--bq-particle-angle)) translateX(18px) rotate(45deg) scale(.25); }
        82% { opacity: .9; transform: rotate(var(--bq-particle-angle)) translateX(29px) rotate(90deg) scale(.72); }
        92% { opacity: .12; transform: rotate(var(--bq-particle-angle)) translateX(34px) rotate(135deg) scale(.38); }
      }
      .bq-answer.correct .bq-card-particles i { animation: bqGoldBurst .78s ease-out both; }
      .bq-answer.wrong .bq-card-particles i { background: #ff91a6; box-shadow: 0 0 8px #fff, 0 0 13px #ff5e7a; animation: bqSoftScatter .45s ease-out both; }
      @keyframes bqGoldBurst {
        0% { opacity: 0; transform: rotate(var(--bq-particle-angle)) translateX(0) rotate(45deg) scale(.3); }
        25% { opacity: 1; }
        100% { opacity: 0; transform: rotate(var(--bq-particle-angle)) translateX(var(--bq-particle-distance)) rotate(135deg) scale(1); }
      }
      @keyframes bqSoftScatter {
        0% { opacity: .85; transform: rotate(var(--bq-particle-angle)) translateX(0) scale(.55); }
        100% { opacity: 0; transform: rotate(var(--bq-particle-angle)) translateX(30px) scale(.25); }
      }
      .bq-select-countdown {
        --bq-countdown-progress: 0deg;
        position: absolute; z-index: 6; left: 50%; top: 42%; transform: translate(-50%, -50%);
        width: clamp(46px, 6vw, 78px); aspect-ratio: 1; display: inline-flex;
        align-items: center; justify-content: center; border: 3px solid #fff; border-radius: 50%;
        color: #fff; background: radial-gradient(circle, #ffad32 0 58%, transparent 60%), conic-gradient(#fff var(--bq-countdown-progress), rgba(255,255,255,.22) 0);
        box-shadow: 0 4px 0 #a95813, 0 0 26px rgba(255,215,64,.9);
        font-size: clamp(1.5rem, 4vw, 2.8rem); font-weight: 900; text-shadow: 0 2px 0 #9b5310;
        animation: bqCountdownPulse .72s ease-in-out infinite;
      }
      .bq-select-countdown::after { content: ''; position: absolute; inset: -9px; border: 3px solid rgba(255,238,126,.82); border-radius: inherit; animation: bqCountdownRing .9s ease-out infinite; }
      .bq-select-countdown[hidden] { display: none; }
      @keyframes bqCountdownPulse { 0%,100% { transform: translate(-50%,-50%) scale(.96); } 50% { transform: translate(-50%,-50%) scale(1.06); } }
      @keyframes bqCountdownRing { from { opacity: .9; transform: scale(.84); } to { opacity: 0; transform: scale(1.22); } }
      #bq-center-guide { align-self: end; justify-self: stretch; position: relative; height: clamp(20px, 5dvh, 52px); opacity: .48; }
      #bq-center-guide::after { content: ''; position: absolute; left: 20%; right: 20%; bottom: 8%; height: 35%; border-radius: 50%; border: 2px solid rgba(117,225,255,.74); background: radial-gradient(ellipse, rgba(89,211,255,.22), transparent 70%); box-shadow: 0 0 18px rgba(83,213,255,.34); }
      #bq-feedback { position: absolute; z-index: 4; left: 50%; bottom: 5%; transform: translateX(-50%); min-height: 1.4em; white-space: nowrap; text-align: center; font-size: clamp(1.2rem, 3vw, 2.15rem); font-weight: 900; text-shadow: 0 3px 0 rgba(24,11,57,.72), 0 0 18px currentColor; }
      #bq-feedback.correct { color: #ffe066; }
      #bq-feedback.wrong { color: #ff9cad; }
      #bq-feedback.correct { animation: bqFeedbackSuccess 1s cubic-bezier(.2,.75,.25,1); }
      #bq-feedback.wrong { animation: bqFeedbackWrong .55s ease-out; }
      @keyframes bqFeedbackSuccess { 0% { opacity: 0; transform: translateX(-50%) scale(.55); } 45% { opacity: 1; transform: translateX(-50%) scale(1.22); } 70% { transform: translateX(-50%) scale(.96); } 100% { transform: translateX(-50%) scale(1); } }
      @keyframes bqFeedbackWrong { 0% { opacity: 0; transform: translateX(-50%) translateY(6px); } 35% { opacity: 1; transform: translateX(-50%) translateY(0); } 100% { opacity: 1; } }

      #bq-dev-hint { position: absolute; left: 8px; bottom: 4px; font-size: .68rem; color: rgba(255,255,255,.58); }

      /* 가이드 파일이 실제로 로드된 경우에만 보인다. 깨진 이미지 대체물은 쓰지 않는다. */
      #bq-guides { position: absolute; z-index: 4; inset: 0; pointer-events: none; }
      .bq-guide {
        position: absolute; bottom: max(8px, env(safe-area-inset-bottom));
        width: clamp(92px, 10vw, 154px); display: flex; align-items: flex-end; justify-content: center;
      }
      .bq-guide--left { left: max(10px, env(safe-area-inset-left)); }
      .bq-guide--right { right: max(10px, env(safe-area-inset-right)); }
      .bq-guide.asset-missing { display: none; }
      .bq-guide img { width: 100%; max-height: min(22dvh, 220px); object-fit: contain; object-position: center bottom; filter: drop-shadow(0 8px 12px rgba(25,12,56,.36)); animation: bqGuideIdle 3.2s ease-in-out infinite; }
      .bq-guide--right img { animation-delay: -1.5s; }
      .bq-guide-bubble {
        position: absolute; z-index: 2; bottom: 72%; width: max-content; max-width: clamp(150px, 18vw, 245px);
        padding: clamp(8px, 1vw, 13px) clamp(11px, 1.3vw, 16px); border: 3px solid #72cfff; border-radius: 19px;
        color: #28306d; background: linear-gradient(180deg, #fff, #f3f8ff); box-shadow: 0 4px 0 #489fce, 0 10px 24px rgba(31,35,99,.28);
        font-size: clamp(.76rem, 1.2vw, 1rem); font-weight: 900; line-height: 1.25; text-align: center;
        opacity: 0; visibility: hidden; transform: translateY(5px) scale(.92);
      }
      .bq-guide--left .bq-guide-bubble { left: 54%; }
      .bq-guide--right .bq-guide-bubble { right: 54%; border-color: #ff90c8; box-shadow: 0 4px 0 #cf659b, 0 10px 24px rgba(75,29,75,.25); }
      .bq-guide-bubble::after {
        content: ''; position: absolute; bottom: -9px; width: 15px; height: 15px; background: #f3f8ff;
        border-right: 3px solid #72cfff; border-bottom: 3px solid #72cfff; transform: rotate(45deg);
      }
      .bq-guide--left .bq-guide-bubble::after { left: 18px; }
      .bq-guide--right .bq-guide-bubble::after { right: 18px; border-color: #cf659b; }
      .bq-guide.is-speaking .bq-guide-bubble { opacity: 1; visibility: visible; transform: translateY(0) scale(1); }
      .bq-guide.is-speaking .bq-guide-bubble.is-popping { animation: bqGuideBubblePop .24s ease-out; }
      @keyframes bqGuideIdle { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-3px) scale(1.012); } }
      @keyframes bqGuideBubblePop { from { opacity: 0; transform: translateY(5px) scale(.88); } to { opacity: 1; transform: translateY(0) scale(1); } }

      /* tutorial과 같은 공통 system panel / exit confirm skin. */
      #bq #pz-menu-panel { display: flex; top: calc(100% + clamp(8px, 1.2dvh, 14px)); right: 0; width: clamp(62px, 5.2vw, 78px); min-width: 0; padding: clamp(9px, 1.3dvh, 14px); gap: clamp(8px, 1.2dvh, 12px); border: 3px solid #cbb8f5; outline: 3px solid rgba(255,255,255,.96); border-radius: clamp(22px, 2vw, 30px); background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(240,232,255,.98)); box-shadow: 0 6px 0 #ac94dc, 0 14px 32px rgba(52,32,100,.28); opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0) scale(1); transform-origin: top center; transition: opacity .16s ease, transform .16s ease, visibility 0s; }
      #bq #pz-menu-panel.hidden { display: flex; opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(-8px) scale(.94); transition: opacity .13s ease, transform .13s ease, visibility 0s linear .13s; }
      #bq .pz-menu-item { width: clamp(40px, 3.7vw, 52px); height: clamp(40px, 3.7vw, 52px); padding: 0; display: inline-flex; align-items: center; justify-content: center; border: 2px solid rgba(255,255,255,.98); border-radius: 9999px; color: #443087; background: linear-gradient(180deg, #fff, #ddd0fb); box-shadow: inset 0 2px 0 rgba(255,255,255,.78), 0 3px 0 #aa91dc, 0 7px 13px rgba(63,43,112,.2); transition: transform .12s, filter .12s, box-shadow .12s; }
      #bq .pz-menu-item > span { width: 100%; height: 100%; display: inline-flex; align-items: center; justify-content: center; }
      #bq .pz-menu-item .pz-ico { width: 52%; height: 52%; stroke-width: 2.25; }
      #bq .pz-menu-item:hover { filter: brightness(1.05); transform: scale(1.06); }
      #bq .pz-menu-item:active { transform: translateY(2px) scale(.94); box-shadow: none; }
      #bq .pz-menu-item:disabled { opacity: .42; cursor: not-allowed; filter: grayscale(.35); transform: none; }
      #bq #pz-confirm { position: fixed; inset: 0; display: flex; background: rgba(38,25,73,.46); backdrop-filter: blur(4px); opacity: 1; visibility: visible; pointer-events: auto; transition: opacity .16s, visibility 0s; }
      #bq #pz-confirm.hidden { display: flex; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity .13s, visibility 0s linear .13s; }
      #bq .pz-confirm-box { width: min(88vw, 520px); max-width: none; padding: clamp(20px, 3.5dvh, 34px) clamp(22px, 4vw, 44px); border: 4px solid #cbb8f5; outline: 4px solid rgba(255,255,255,.95); border-radius: clamp(24px, 2.4vw, 34px); background: linear-gradient(180deg, #fff, #f1e9ff); color: #35236f; box-shadow: 0 8px 0 #a98fdc, 0 20px 52px rgba(35,19,77,.36); }
      #bq .pz-confirm-box p { margin-bottom: clamp(14px, 2.4dvh, 24px); color: #35236f; font-size: clamp(1.15rem, 2.4vw, 1.55rem); }
      #bq .pz-confirm-actions { gap: clamp(9px, 1.4dvh, 13px); }
      #bq .pz-btn { min-height: clamp(44px, 6dvh, 58px); border: 3px solid rgba(255,255,255,.96); color: #38236f; font-size: clamp(.9rem, 1.7vw, 1.1rem); background: linear-gradient(180deg, #fff, #ded2fa); box-shadow: inset 0 2px 0 rgba(255,255,255,.72), 0 4px 0 #aa91dc, 0 8px 16px rgba(60,37,110,.2); transition: transform .12s, filter .12s, box-shadow .12s; }
      #bq #pz-quit { color: #573600; background: linear-gradient(180deg, #fff3a0, #ffd23e 56%, #f0a91b); box-shadow: inset 0 2px 0 rgba(255,255,255,.64), 0 4px 0 #be8213, 0 8px 16px rgba(102,67,5,.22); }
      #bq #pz-quit-home { color: #fff; background: linear-gradient(180deg, #9f8df3, #7056d3 56%, #4c35a6); box-shadow: inset 0 2px 0 rgba(255,255,255,.38), 0 4px 0 #39257e, 0 8px 16px rgba(43,27,88,.28); }
      #bq .pz-btn:hover { filter: brightness(1.05); transform: scale(1.02); }
      #bq .pz-btn:active { transform: translateY(3px) scale(.98); box-shadow: none; }

      @media (max-width: 920px), (max-height: 520px) {
        #bq { --bq-header-height: 34px; --bq-header-border: 2px; --bq-header-depth: 3px; }
        #bq-ui { gap: 4px; padding-block: max(5px, env(safe-area-inset-top)) max(6px, env(safe-area-inset-bottom)); }
        #bq-progress { min-width: 100px; padding-inline: 11px; gap: 5px; font-size: .7rem; }
        #bq-system-slot #pz-topbar { gap: 5px; }
        #bq-question { width: fit-content; min-width: min(72vw, 440px); max-width: 96vw; gap: 7px; padding: 4px 12px; border-width: 2px; box-shadow: 0 0 15px rgba(255,47,160,.65), 0 3px 0 rgba(96,8,99,.62); }
        #bq-question-tag { padding: 2px 8px; border-width: 1px; box-shadow: 0 2px 0 #bc6f0d; font-size: clamp(.52rem, 2dvh, .66rem); }
        #bq-question-prompt { font-size: clamp(.88rem, 4dvh, 1.15rem); }
        #bq-stage { grid-template-columns: minmax(0, 1fr) minmax(30vw, 40vw) minmax(0, 1fr); gap: 6px; }
        .bq-answer { top: -3px; width: min(100%, clamp(98px, min(19.5vw, 29.5dvh), 152px)); gap: 2px; }
        #bq-left { --bq-card-tilt: 7deg; }
        #bq-right { --bq-card-tilt: -7deg; }
        .bq-answer::before, .bq-answer::after { width: 5px; height: 5px; }
        .bq-label { padding: 2px 9px; border-width: 2px; box-shadow: 0 2px 0 rgba(71,47,126,.42); font-size: clamp(.66rem, 2.4dvh, .82rem); }
        #bq-center-guide { height: 24px; }
        #bq-feedback { bottom: 2%; font-size: clamp(.9rem, 4dvh, 1.2rem); }
        #bq-dev-hint { display: none; }
        .bq-guide { width: clamp(58px, 8vw, 82px); bottom: max(4px, env(safe-area-inset-bottom)); }
        .bq-guide-bubble { bottom: 68%; max-width: 170px; padding: 6px 9px; border-width: 2px; border-radius: 14px; font-size: clamp(.58rem, 2.4dvh, .7rem); box-shadow: 0 2px 0 #489fce, 0 5px 12px rgba(31,35,99,.24); }
        .bq-guide--right .bq-guide-bubble { box-shadow: 0 2px 0 #cf659b, 0 5px 12px rgba(75,29,75,.22); }
        .bq-guide-bubble::after { bottom: -6px; width: 10px; height: 10px; border-width: 2px; }
        #bq #pz-menu-panel { width: 54px; padding: 7px; gap: 7px; border-width: 2px; outline-width: 2px; border-radius: 19px; box-shadow: 0 4px 0 #ac94dc, 0 8px 18px rgba(52,32,100,.24); }
        #bq .pz-menu-item { width: 34px; height: 34px; }
        #bq .pz-confirm-box { width: min(86vw, 430px); padding: 12px 20px; border-width: 3px; outline-width: 3px; border-radius: 22px; }
        #bq .pz-confirm-box p { margin-bottom: 9px; font-size: clamp(.94rem, 3.7dvh, 1.15rem); }
        #bq .pz-confirm-actions { gap: 7px; }
        #bq .pz-btn { min-height: 36px; padding-inline: 16px; border-width: 2px; font-size: clamp(.74rem, 2.8dvh, .9rem); }
      }

      @media (max-width: 700px) and (orientation: landscape) {
        #bq { --bq-header-height: 30px; }
        #bq-ui { padding-inline: max(7px, env(safe-area-inset-left)) max(7px, env(safe-area-inset-right)); }
        #bq-progress { min-width: 88px; padding-inline: 8px; gap: 4px; font-size: .61rem; }
        #bq-question { width: fit-content; min-width: min(72vw, 420px); max-width: 100%; padding-inline: 9px; }
        #bq-question-tag { padding-inline: 6px; font-size: .5rem; }
        #bq-question-prompt { font-size: .84rem; }
        #bq-stage { grid-template-columns: minmax(0, 1fr) minmax(29vw, 36vw) minmax(0, 1fr); gap: 4px; }
        .bq-answer { width: min(100%, 118px); }
        .bq-guide { display: none; width: 48px; }
        .bq-guide.is-speaking:not(.asset-missing) { display: flex; }
        .bq-guide-bubble { bottom: 64%; max-width: 132px; padding: 5px 7px; font-size: .56rem; }
      }

      @media (prefers-reduced-motion: reduce) {
        .bq-answer::before, .bq-answer::after { animation: none; opacity: .4; }
        .bq-answer, .bq-answer-visual, .bq-card-aura, .bq-card-particles i,
        .bq-select-countdown, .bq-select-countdown::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
        .bq-guide img, .bq-guide-bubble { animation: none !important; }
        #bq *, #bq *::before, #bq *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; }
      }
    </style>

    <div id="bq">
      <div id="bq-camera-layer"><video id="bq-camera" autoplay muted playsinline aria-label="사용자 카메라"></video></div>
      <div id="bq-readability"></div>
      <div id="bq-camera-status" role="status">
        <strong id="bq-camera-title">카메라를 연결하는 중이에요…</strong>
        <span id="bq-camera-detail">잠시만 기다려주세요</span>
        <button id="bq-camera-retry" hidden>${icon('refresh')} 다시 시도</button>
      </div>

      <div id="bq-ui">
        <header id="bq-header">
          <div id="bq-progress" role="status" aria-label="퀴즈 진행도"><span>QUIZ</span><strong>1 / ${session.questions.length}</strong></div>
          <div id="bq-system-slot"></div>
        </header>

        <section id="bq-question" aria-label="질문">
          <span id="bq-question-tag">QUESTION</span>
          <span id="bq-question-prompt">${question.prompt}</span>
        </section>

        <main id="bq-stage">
          <article class="bq-answer" id="bq-left" data-side="left">
            <div class="bq-card-aura" aria-hidden="true"></div>
            <div class="bq-answer-visual"><img src="${question.left.image}" alt="${question.left.label}"><div class="bq-label">${question.left.label}</div></div>
            <div class="bq-card-particles" aria-hidden="true">${'<i></i>'.repeat(8)}</div>
            <span class="bq-select-countdown" role="status" hidden></span>
          </article>
          <div id="bq-center-guide" aria-hidden="true"></div>
          <article class="bq-answer" id="bq-right" data-side="right">
            <div class="bq-card-aura" aria-hidden="true"></div>
            <div class="bq-answer-visual"><img src="${question.right.image}" alt="${question.right.label}"><div class="bq-label">${question.right.label}</div></div>
            <div class="bq-card-particles" aria-hidden="true">${'<i></i>'.repeat(8)}</div>
            <span class="bq-select-countdown" role="status" hidden></span>
          </article>
          <div id="bq-feedback" aria-live="polite"></div>
          ${import.meta.env.DEV ? '<div id="bq-dev-hint">S: 스쿼트 · ←/→: 답 선택 · ↓: 중앙 · R: 다시하기</div>' : ''}
        </main>

        ${bodyQuizMotionHudMarkup({
          idPrefix: 'bq',
          exercise: question.exercise.key,
          currentCount: 0,
          targetCount: game.targetSquats,
          energyPercent: 0,
          moveLocked: true,
        })}
      </div>

      <div id="bq-guides" aria-live="polite">
        ${Object.entries(BODY_QUIZ_GUIDE_CHARACTERS).map(([key, character]) => `
          <aside class="bq-guide bq-guide--${character.side} asset-missing" data-guide="${key}" data-asset="missing">
            <div class="bq-guide-bubble" role="status"><span></span></div>
            <img src="${character.image}" alt="${character.alt}">
          </aside>
        `).join('')}
      </div>
    </div>
  `

  const root = app.querySelector('#bq')
  const $ = selector => root.querySelector(selector)
  const els = {
    left: $('#bq-left'), right: $('#bq-right'), hud: $('#bq-motion-hud'), feedback: $('#bq-feedback'),
    cameraStatus: $('#bq-camera-status'), cameraTitle: $('#bq-camera-title'), cameraDetail: $('#bq-camera-detail'),
    retry: $('#bq-camera-retry'), systemSlot: $('#bq-system-slot'), progress: $('#bq-progress strong'),
    prompt: $('#bq-question-prompt'),
    guides: [...root.querySelectorAll('.bq-guide')],
  }
  const motionHud = createBodyQuizMotionHud(els.hud)

  for (const guide of els.guides) {
    const image = guide.querySelector('img')
    image.addEventListener('load', () => {
      guide.classList.remove('asset-missing')
      guide.dataset.asset = 'ready'
    }, { once: true })
    image.addEventListener('error', () => { guide.dataset.asset = 'missing' }, { once: true })
  }

  const zoneDetector = createBodyQuizZoneDetector()

  function handleLandmarks(landmarks) {
    if (destroyed || !screenReady || tutorialActive || systemPaused) return
    const now = performance.now() / 1000
    hasPoseFrame = true
    const squat = squatDetector.update(landmarks, now)
    const zone = zoneDetector.update(landmarks)
    if (!squat.tracking || !zone.tracking) {
      // 한두 프레임 confidence가 흔들리는 것은 허용하되, loop에서 grace를
      // 넘긴 추적 손실로 확인되면 선택 시간을 전부 취소한다.
      return
    }
    lastTrackableAt = now
    if (squat.completed) registerSquat()
    currentZone = zone.zone
    if (currentZone === 0) selectAnswer('left')
    else if (currentZone === 2) selectAnswer('right')
    else {
      game.confirmNeutral()
      clearAnswerSelection()
    }
  }

  function registerSquat() {
    const before = game.squatCount
    game.registerSquat()
    if (game.squatCount > before) audioController.squat(game.squatCount, game.targetSquats)
  }

  function selectAnswer(side) {
    const before = game.selectedSide
    game.selectAnswer(side)
    if (game.phase === PHASE.ANSWER_HOLD && game.selectedSide !== before) {
      audioController.enterSelection(side)
    }
  }

  function clearAnswerSelection() {
    const wasHolding = game.phase === PHASE.ANSWER_HOLD
    game.clearSelection()
    if (wasHolding && game.phase !== PHASE.ANSWER_HOLD) audioController.cancelSelection()
  }

  function setCameraStatus(status, error) {
    root.dataset.camera = status
    if (status === 'ready') { els.cameraStatus.hidden = true; return }
    els.cameraStatus.hidden = false
    const failed = status === 'error'
    els.cameraTitle.textContent = failed ? '카메라를 확인해주세요' : '카메라를 연결하는 중이에요…'
    els.cameraDetail.textContent = failed ? '권한과 연결 상태를 확인한 뒤 다시 시도해주세요' : '잠시만 기다려주세요'
    els.retry.hidden = !failed
    if (failed && error) console.warn('[body-quiz] 카메라 시작 실패:', error?.name ?? error)
  }

  const cameraSession = createBodyQuizCameraSession({ videoEl: $('#bq-camera'), onLandmarks: handleLandmarks, onStatus: setCameraStatus })

  function renderQuestionData() {
    root.dataset.questionIndex = String(questionIndex)
    root.dataset.questionId = question.id
    els.progress.textContent = `${questionIndex + 1} / ${session.questions.length}`
    els.prompt.textContent = question.prompt
    for (const [side, answer] of [['left', question.left], ['right', question.right]]) {
      const card = els[side]
      const image = card.querySelector('img')
      image.src = answer.image
      image.alt = answer.label
      card.querySelector('.bq-label').textContent = answer.label
    }
    motionHud.update({
      exercise: question.exercise.key,
      currentCount: game.squatCount,
      targetCount: game.targetSquats,
      energyPercent: game.moveEnergy,
      moveLocked: game.locked,
    })
  }

  function startQuestionClock(now = performance.now()) {
    questionTiming = createBodyQuizQuestionTiming(question.id, now)
    timingCommitted = false
  }

  function resetCurrentQuestion() {
    clearResultEffect()
    audioController.nextQuestion()
    game = new BodyQuizRun(question)
    squatDetector = new BodyQuizSquatDetector({ frameAspect: poseEngineCore.frameAspect })
    currentZone = 1
    zoneDetector.destroy()
    startQuestionClock()
    paint()
  }

  function advanceQuestion() {
    if (questionIndex >= session.questions.length - 1) return false
    clearResultEffect()
    audioController.nextQuestion()
    questionIndex += 1
    question = session.questions[questionIndex]
    game = new BodyQuizRun(question, { requireNeutral: true })
    squatDetector = new BodyQuizSquatDetector({ frameAspect: poseEngineCore.frameAspect })
    currentZone = 1
    zoneDetector.destroy()
    startQuestionClock()
    renderQuestionData()
    return true
  }

  function clearResultEffect() {
    resultFxHandle?.cancel()
    resultFxHandle = null
    resultFxStarted = false
    for (const card of [els.left, els.right]) card.classList.remove('correct', 'wrong')
  }

  function startResultEffect() {
    if (resultFxStarted || !game.done) return
    resultFxStarted = true
    const picked = game.selectedSide === 'left' ? els.left : els.right
    resultFxHandle = createBodyQuizResultFx({
      card: picked,
      correct: game.correct,
      timeoutMs: BODY_QUIZ_RESULT_FX_TIMEOUT_MS,
      onSound: correct => audioController.result(correct),
      onComplete() {
        resultFxHandle = null
        if (!destroyed && !advanceQuestion()) {
          resultFxStarted = true
          audioController.complete()
        }
      },
    })
  }

  function paint() {
    const locked = game.locked
    root.dataset.phase = game.phase
    root.classList.toggle('move-unlocked', !locked && !game.done && !game.needsNeutral)
    motionHud.update({
      exercise: question.exercise.key,
      currentCount: game.squatCount,
      targetCount: game.targetSquats,
      energyPercent: game.moveEnergy,
      moveLocked: locked,
    })

    const selected = game.phase === PHASE.ANSWER_HOLD ? game.selectedSide : null
    for (const [side, el] of [['left', els.left], ['right', els.right]]) {
      el.classList.toggle('zone-active', selected === side)
      el.classList.toggle('zone-muted', !!selected && selected !== side)
      el.classList.toggle('correct', game.done && game.selectedSide === side && game.correct)
      el.classList.toggle('wrong', game.done && game.selectedSide === side && !game.correct)
      const countdown = el.querySelector('.bq-select-countdown')
      countdown.hidden = selected !== side
      const holdProgress = selected === side && game.holdSec > 0
        ? Math.min(1, Math.max(0, game.holdElapsed / game.holdSec))
        : 0
      countdown.style.setProperty('--bq-countdown-progress', `${Math.round(holdProgress * 360)}deg`)
      countdown.textContent = selected === side
        ? String(getAnswerHoldCountdown(game.holdSec, game.holdElapsed))
        : ''
    }
    if (game.phase === PHASE.ANSWER_HOLD) {
      els.feedback.textContent = `${game.selectedSide === 'left' ? question.left.label : question.right.label} 쪽에서 잠깐 기다려요!`
      els.feedback.className = ''
    } else if (game.phase === PHASE.ANSWER_RESULT) {
      const picked = game.selectedSide === 'left' ? els.left : els.right
      picked.classList.add(game.correct ? 'correct' : 'wrong')
      els.feedback.textContent = game.correct ? 'CORRECT! +1' : '괜찮아요, 다시 도전해요!'
      els.feedback.className = game.correct ? 'correct' : 'wrong'
    } else if (!locked && game.needsNeutral) {
      els.feedback.textContent = '가운데로 돌아오면 다음 선택이 시작돼요'
      els.feedback.className = ''
    } else {
      els.feedback.textContent = ''
      els.feedback.className = ''
    }

    const cue = getBodyQuizGuideCue(game)
    const cueKey = `${cue.speaker}:${cue.text}`
    if (root.dataset.guideCue !== cueKey) {
      root.dataset.guideCue = cueKey
      for (const guide of els.guides) {
        const speaking = guide.dataset.guide === cue.speaker
        guide.classList.toggle('is-speaking', speaking)
        const bubble = guide.querySelector('.bq-guide-bubble')
        bubble.querySelector('span').textContent = speaking ? cue.text : ''
        bubble.classList.remove('is-popping')
        if (speaking) {
          void bubble.offsetWidth
          bubble.classList.add('is-popping')
        }
      }
    }
  }

  let raf = null
  let lastT = null
  function loop() {
    raf = requestAnimationFrame(loop)
    const now = performance.now() / 1000
    const dt = lastT === null ? 0 : Math.min(.1, now - lastT)
    lastT = now
    if (!tutorialActive && !systemPaused) {
      const selectionActive = !hasPoseFrame
        || (lastTrackableAt != null && now - lastTrackableAt <= BODY_QUIZ_INPUT_TUNING.selectionTrackingGraceSec)
      const wasHolding = game.phase === PHASE.ANSWER_HOLD
      game.update(dt, { selectionActive })
      if (wasHolding && game.phase === PHASE.MOVE_UNLOCKED) audioController.cancelSelection()
      if (game.phase === PHASE.ANSWER_HOLD) {
        audioController.selectionCountdown(getAnswerHoldCountdown(game.holdSec, game.holdElapsed))
      }
      if (questionTiming && !game.locked) markBodyQuizExerciseCompleted(questionTiming, performance.now())
      if (questionTiming && game.done) {
        markBodyQuizAnswerSelected(questionTiming, performance.now())
        if (!timingCommitted) {
          session.timings.push({ ...questionTiming })
          timingCommitted = true
        }
        startResultEffect()
      }
    }
    paint()
  }
  function startGameLoop() {
    if (!questionTiming) startQuestionClock()
    if (!raf) { lastT = null; raf = requestAnimationFrame(loop); paint() }
  }

  let systemBinding = null
  function mountSystemBar() {
    if (systemBinding || destroyed) return
    els.systemSlot.innerHTML = bodyQuizSystemBarMarkup()
    systemBinding = bindBodyQuizSystemBar(els.systemSlot, {
      onQuit: () => navigate(backTo), onHome: () => navigate('/'), onPause: paused => { systemPaused = paused },
    })
  }

  const onKey = event => {
    if (!screenReady || tutorialActive || systemPaused) return
    audioController.activate()
    if (event.code === 'KeyS') { event.preventDefault(); registerSquat() }
    else if (event.code === 'ArrowLeft') { event.preventDefault(); selectAnswer('left') }
    else if (event.code === 'ArrowRight') { event.preventDefault(); selectAnswer('right') }
    else if (event.code === 'ArrowDown') { event.preventDefault(); game.confirmNeutral(); clearAnswerSelection() }
    else if (event.code === 'KeyR') { event.preventDefault(); resetCurrentQuestion() }
  }
  window.addEventListener('keydown', onKey)
  els.retry.addEventListener('click', () => {
    playBodyQuizButtonSfx()
    cameraSession.start()
  })

  // 진입 즉시 카메라를 준비하되 tutorial 동안 detector 입력은 차단한다.
  if (navigator.mediaDevices?.getUserMedia) cameraSession.start()
  else setCameraStatus('error')

  let tutorialHandle = null
  let playReadinessGate = null
  const playAssets = getBodyQuizPlayAssets(question)

  function activatePlay() {
    if (destroyed) return
    screenReady = true
    void audioController.start(gameId)
    renderQuestionData()
    mountSystemBar()
    startGameLoop()
  }

  if (tutorialPolicy(query)) {
    tutorialActive = true
    tutorialHandle = createBodyQuizTutorial({
      // 튜토리얼은 승인된 고정 레이아웃을 유지한다. 실제 session의 답 위치
      // randomization은 뒤의 play scene에만 적용한다.
      mountEl: root, question: QUESTIONS[0], onIntro: () => navigate(backTo), onHome: () => navigate('/'),
      assetReadiness,
      playAssets,
      loadingScreen,
      onFinish() {
        audioController.activate()
        tutorialActive = false
        tutorialHandle = null
        markTutorialCompleted()
        activatePlay()
      },
    })
  } else {
    playReadinessGate = createBodyQuizLoadingGate(root, { loadingScreen })
    if (assetReadiness.areReady(playAssets)) {
      playReadinessGate.reveal()
      activatePlay()
    } else {
      const preparePlay = () => openBodyQuizReadinessGate({
        gate: playReadinessGate,
        readiness: assetReadiness,
        assets: playAssets,
        message: '게임을 준비하고 있어요',
        isAlive: () => !destroyed,
        onReady: activatePlay,
        onRetry: preparePlay,
      })
      preparePlay()
    }
  }

  onLeave(() => {
    destroyed = true
    if (raf) cancelAnimationFrame(raf)
    window.removeEventListener('keydown', onKey)
    tutorialHandle?.destroy()
    playReadinessGate?.destroy()
    systemBinding?.destroy()
    clearResultEffect()
    audioController.destroy()
    zoneDetector.destroy()
    cameraSession.destroy()
  })
}

// BODY QUIZ 실제 플레이 — 카메라가 무대이고 UI는 그 위에 얹힌다.
// 게임 규칙은 BodyQuizRun, 몸 동작은 기존 MoveDetector/zoneDetector가 맡는다.

import { navigate, onLeave } from '../../core/router.js'
import { icon } from '../../core/icons.js'
import { handSession } from '../../core/handSession.js'
import { poseEngineCore } from '../../core/pose/poseEngine.js'
import { MoveDetector, MOVE } from '../../core/pose/detectors/moves.js'
import { createZoneDetector } from '../../core/pose/detectors/zoneDetector.js'
import { getManifest, getBackTo } from '../registry.js'
import { ensureSysBarStyle } from '../runner/ui/systemBar.js'
import { QUESTIONS } from './questions.js'
import { BodyQuizRun, PHASE } from './game.js'
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

const MOTION_ICON_PATHS = {
  squat: '<circle cx="12" cy="4" r="2"/><path d="m9.5 8.5 2.5-1.5 2.5 1.5 1.8 4.2"/><path d="m9.5 9-2.8 4.2 3.8 2.1-2.2 4.2"/><path d="m14.3 12.5 2.7 2.8 3.4.2"/><path d="m10.5 15.3 4 .2 2.2 4"/>',
  jump: '<circle cx="12" cy="4" r="2"/><path d="m8 8 4 2 4-2"/><path d="m12 10-1 5-4 4"/><path d="m11 15 4 4"/><path d="M4 6 2 4M20 6l2-2"/>',
  run: '<circle cx="13" cy="4" r="2"/><path d="m8 10 3-3 4 3 3 1"/><path d="m12 9-1 5-4 5"/><path d="m11 14 4 2 2 4"/>',
  pose: '<circle cx="12" cy="4" r="2"/><path d="M12 7v7"/><path d="m12 9-5 3"/><path d="m12 9 5 3"/><path d="m12 14-4 6"/><path d="m12 14 4 6"/>',
}

/** BODY QUIZ 안에서 먼저 쓰는 교체형 운동 pictogram. */
export function bodyQuizMotionIcon(key) {
  const paths = MOTION_ICON_PATHS[key] ?? MOTION_ICON_PATHS.pose
  return `<svg class="bq-motion-pictogram" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
}

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

export default function bodyQuizPlay(app, query) {
  const gameId = query.id ?? 'body-quiz'
  const manifest = getManifest(gameId)
  if (!manifest) { navigate('/'); return }

  // 인트로/허브의 손 커서와 PIP가 실제 전신 플레이 위에 남으면 zone 선택과
  // 시야를 방해한다. 카메라 스트림은 공용 엔진이 계속 공유하고 표시만 끈다.
  handSession.setPointerActive(false)

  const backTo = getBackTo(gameId)
  const session = createBodyQuizSession(QUESTIONS)
  if (!session.questions.length) { navigate(backTo); return }
  let questionIndex = 0
  let question = session.questions[questionIndex]
  let game = new BodyQuizRun(question)
  let moveDetector = new MoveDetector()
  let questionTiming = null
  let timingCommitted = false
  let resultShownSec = 0
  let currentZone = 1
  let tutorialActive = false
  let systemPaused = false
  let destroyed = false

  ensureSysBarStyle(app.ownerDocument)

  app.innerHTML = `
    <style>
      #bq, #bq * { box-sizing: border-box; }
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
        display: flex; flex-direction: column; align-items: center; gap: clamp(4px, .8dvh, 9px);
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
      @keyframes bqCardSparkle {
        0%, 32%, 100% { opacity: .14; transform: scale(.42) rotate(0deg); }
        46% { opacity: .92; transform: scale(1.15) rotate(45deg); }
        62% { opacity: .24; transform: scale(.58) rotate(90deg); }
      }
      .bq-answer img { width: 100%; aspect-ratio: 1; object-fit: contain; display: block; }
      .bq-label { min-width: 54%; padding: 4px 16px; border: 3px solid rgba(255,255,255,.95); border-radius: 9999px; text-align: center; color: #42277d; background: rgba(255,255,255,.94); box-shadow: 0 4px 0 rgba(71,47,126,.42); font-size: clamp(1rem, 2vw, 1.45rem); font-weight: 900; }
      .bq-answer.zone-active { --bq-card-scale: 1.07; filter: drop-shadow(0 0 18px #ffe066) drop-shadow(0 14px 24px rgba(0,0,0,.48)); }
      .bq-answer.zone-muted { --bq-card-scale: .96; --bq-card-opacity: .66; }
      .bq-answer.correct { --bq-card-scale: 1.08; filter: drop-shadow(0 0 24px #65f08a) drop-shadow(0 0 46px #ffd23e); }
      .bq-answer.wrong { --bq-card-scale: 1.03; filter: drop-shadow(0 0 24px #ff6c82); }
      #bq-center-guide { align-self: end; justify-self: stretch; position: relative; height: clamp(20px, 5dvh, 52px); opacity: .48; }
      #bq-center-guide::after { content: ''; position: absolute; left: 20%; right: 20%; bottom: 8%; height: 35%; border-radius: 50%; border: 2px solid rgba(117,225,255,.74); background: radial-gradient(ellipse, rgba(89,211,255,.22), transparent 70%); box-shadow: 0 0 18px rgba(83,213,255,.34); }
      #bq-feedback { position: absolute; z-index: 4; left: 50%; bottom: 5%; transform: translateX(-50%); min-height: 1.4em; white-space: nowrap; text-align: center; font-size: clamp(1.2rem, 3vw, 2.15rem); font-weight: 900; text-shadow: 0 3px 0 rgba(24,11,57,.72), 0 0 18px currentColor; }
      #bq-feedback.correct { color: #ffe066; }
      #bq-feedback.wrong { color: #ff9cad; }

      /* 실제 상태에 연결된 SQUAT / MOVE ENERGY. 높이는 낮게, 대비는 강하게. */
      #bq-motion-hud {
        justify-self: center; width: min(72vw, 560px); display: grid; grid-template-columns: auto 1fr auto; align-items: center;
        gap: clamp(8px, 1.2vw, 16px); padding: clamp(8px, 1.2dvh, 13px) clamp(14px, 2vw, 24px);
        border: 4px solid #6fd6ff; border-radius: clamp(18px, 2vw, 28px);
        background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(222,244,255,.94));
        box-shadow: inset 0 2px 0 #fff, 0 6px 0 rgba(28,96,146,.74), 0 12px 30px rgba(0,0,0,.34), 0 0 24px rgba(92,213,255,.48);
        color: #24346f; transition: border-color .2s, box-shadow .2s, transform .2s;
      }
      #bq-motion-hud.unlocked { border-color: #ffe066; box-shadow: inset 0 2px 0 #fff, 0 6px 0 #b9770b, 0 0 30px rgba(255,210,62,.78); }
      #bq-motion-count { display: inline-flex; align-items: center; gap: clamp(7px, .8vw, 10px); min-width: 0; }
      #bq-motion-icon { width: clamp(34px, 3.4vw, 46px); height: clamp(34px, 3.4vw, 46px); flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; border: 2px solid #fff; border-radius: 9999px; color: #fff; background: linear-gradient(180deg, #63ddff, #237bd8); box-shadow: inset 0 2px 0 rgba(255,255,255,.38), 0 3px 0 #1555a3; }
      .bq-motion-pictogram { width: 68%; height: 68%; display: block; }
      #bq-squat { font-size: clamp(1rem, 2vw, 1.4rem); font-weight: 900; white-space: nowrap; }
      #bq-energy { min-width: 0; display: grid; grid-template-columns: auto minmax(70px, 1fr) auto; align-items: center; gap: 8px; }
      #bq-energy-label, #bq-energy-pct { font-size: clamp(.72rem, 1.25vw, .94rem); font-weight: 900; white-space: nowrap; }
      #bq-energy-bar { height: clamp(12px, 1.8dvh, 17px); overflow: hidden; border: 2px solid #fff; border-radius: 9999px; background: rgba(35,23,77,.22); box-shadow: inset 0 2px 5px rgba(24,13,62,.35); }
      #bq-energy-bar i { display: block; width: 0%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #ffd23e, #ff9d2e, #ff4fa4); transition: width .2s ease; }
      #bq-move-state { min-width: 100px; padding: 5px 10px; border-radius: 9999px; text-align: center; color: #fff; background: linear-gradient(180deg, #967fe2, #624db7); box-shadow: 0 3px 0 #43328b; font-size: clamp(.72rem, 1.25vw, .94rem); font-weight: 900; white-space: nowrap; }
      #bq-motion-hud.unlocked #bq-move-state { color: #563700; background: linear-gradient(180deg, #fff39a, #ffd23e); box-shadow: 0 3px 0 #bd7f11; }
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
        #bq-motion-hud { width: min(88vw, 500px); gap: 7px; padding: 5px 10px; border-width: 2px; border-radius: 16px; box-shadow: inset 0 1px 0 #fff, 0 3px 0 rgba(28,96,146,.74), 0 6px 15px rgba(0,0,0,.3); }
        #bq-motion-hud.unlocked { box-shadow: inset 0 1px 0 #fff, 0 3px 0 #b9770b, 0 0 18px rgba(255,210,62,.7); }
        #bq-squat { font-size: clamp(.74rem, 3dvh, .9rem); }
        #bq-motion-count { gap: 5px; }
        #bq-motion-icon { width: 27px; height: 27px; border-width: 1px; box-shadow: 0 2px 0 #1555a3; }
        #bq-energy { gap: 5px; }
        #bq-energy-label, #bq-energy-pct, #bq-move-state { font-size: clamp(.58rem, 2.2dvh, .7rem); }
        #bq-energy-bar { height: 10px; border-width: 1px; }
        #bq-move-state { min-width: 78px; padding: 3px 7px; box-shadow: 0 2px 0 #43328b; }
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
        #bq-motion-hud { width: 96%; padding-inline: 7px; gap: 5px; }
        #bq-energy-label { display: none; }
        #bq-energy { grid-template-columns: minmax(70px, 1fr) auto; }
        #bq-move-state { min-width: 70px; }
        .bq-guide { display: none; width: 48px; }
        .bq-guide.is-speaking:not(.asset-missing) { display: flex; }
        .bq-guide-bubble { bottom: 64%; max-width: 132px; padding: 5px 7px; font-size: .56rem; }
      }

      @media (prefers-reduced-motion: reduce) {
        .bq-answer::before, .bq-answer::after { animation: none; opacity: .4; }
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
          <article class="bq-answer" id="bq-left" data-side="left"><img src="${question.left.image}" alt="${question.left.label}"><div class="bq-label">${question.left.label}</div></article>
          <div id="bq-center-guide" aria-hidden="true"></div>
          <article class="bq-answer" id="bq-right" data-side="right"><img src="${question.right.image}" alt="${question.right.label}"><div class="bq-label">${question.right.label}</div></article>
          <div id="bq-feedback" aria-live="polite"></div>
          ${import.meta.env.DEV ? '<div id="bq-dev-hint">S: 스쿼트 · ←/→: 답 선택 · R: 다시하기</div>' : ''}
        </main>

        <section id="bq-motion-hud" class="locked" aria-label="움직임 에너지">
          <div id="bq-motion-count"><span id="bq-motion-icon" data-motion="${question.exercise.key}">${bodyQuizMotionIcon(question.exercise.key)}</span><div id="bq-squat">SQUAT 0/${game.targetSquats}</div></div>
          <div id="bq-energy"><span id="bq-energy-label">MOVE ENERGY</span><div id="bq-energy-bar"><i></i></div><span id="bq-energy-pct">0%</span></div>
          <div id="bq-move-state">MOVE LOCK</div>
        </section>
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
    prompt: $('#bq-question-prompt'), motionIcon: $('#bq-motion-icon'),
    guides: [...root.querySelectorAll('.bq-guide')],
  }

  for (const guide of els.guides) {
    const image = guide.querySelector('img')
    image.addEventListener('load', () => {
      guide.classList.remove('asset-missing')
      guide.dataset.asset = 'ready'
    }, { once: true })
    image.addEventListener('error', () => { guide.dataset.asset = 'missing' }, { once: true })
  }

  const zoneDetector = createZoneDetector({ lanes: 3, onZoneChange: zone => { currentZone = zone } })

  function handleLandmarks(landmarks) {
    if (destroyed || tutorialActive || systemPaused) return
    const fired = moveDetector.update(landmarks, performance.now() / 1000)
    if (fired.includes(MOVE.SQUAT)) game.registerSquat()
    zoneDetector.update(landmarks)
    currentZone = zoneDetector.getCurrentZone()
    if (currentZone === 0) game.selectAnswer('left')
    else if (currentZone === 2) game.selectAnswer('right')
    else game.clearSelection()
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
    els.motionIcon.dataset.motion = question.exercise.key
    els.motionIcon.innerHTML = bodyQuizMotionIcon(question.exercise.key)
  }

  function startQuestionClock(now = performance.now()) {
    questionTiming = createBodyQuizQuestionTiming(question.id, now)
    timingCommitted = false
    resultShownSec = 0
  }

  function resetCurrentQuestion() {
    game = new BodyQuizRun(question)
    moveDetector = new MoveDetector()
    currentZone = 1
    zoneDetector.destroy()
    startQuestionClock()
    paint()
  }

  function advanceQuestion() {
    if (questionIndex >= session.questions.length - 1) return false
    questionIndex += 1
    question = session.questions[questionIndex]
    game = new BodyQuizRun(question)
    moveDetector = new MoveDetector()
    currentZone = 1
    zoneDetector.destroy()
    startQuestionClock()
    renderQuestionData()
    return true
  }

  function paint() {
    const locked = game.locked
    root.dataset.phase = game.phase
    els.hud.classList.toggle('locked', locked)
    els.hud.classList.toggle('unlocked', !locked)
    $('#bq-move-state').textContent = locked ? 'MOVE LOCK' : 'MOVE UNLOCK'
    $('#bq-squat').textContent = `SQUAT ${game.squatCount}/${game.targetSquats}`
    $('#bq-energy-bar i').style.width = `${game.moveEnergy}%`
    $('#bq-energy-pct').textContent = `${game.moveEnergy}%`

    const selected = game.phase === PHASE.ANSWER_HOLD ? game.selectedSide : null
    for (const [side, el] of [['left', els.left], ['right', els.right]]) {
      el.classList.toggle('zone-active', selected === side)
      el.classList.toggle('zone-muted', !!selected && selected !== side)
      el.classList.remove('correct', 'wrong')
    }
    if (game.phase === PHASE.ANSWER_HOLD) {
      const pct = Math.min(100, Math.round((game.holdElapsed / game.holdSec) * 100))
      els.feedback.textContent = `${game.selectedSide === 'left' ? question.left.label : question.right.label} 선택 중… ${pct}%`
      els.feedback.className = ''
    } else if (game.phase === PHASE.ANSWER_RESULT) {
      const picked = game.selectedSide === 'left' ? els.left : els.right
      picked.classList.add(game.correct ? 'correct' : 'wrong')
      els.feedback.textContent = game.correct ? 'CORRECT! +1' : '괜찮아요, 다시 도전해요!'
      els.feedback.className = game.correct ? 'correct' : 'wrong'
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
      game.update(dt)
      if (questionTiming && !game.locked) markBodyQuizExerciseCompleted(questionTiming, performance.now())
      if (questionTiming && game.done) {
        markBodyQuizAnswerSelected(questionTiming, performance.now())
        if (!timingCommitted) {
          session.timings.push({ ...questionTiming })
          timingCommitted = true
        }
        resultShownSec += dt
        if (resultShownSec >= 1.2) advanceQuestion()
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
    if (tutorialActive || systemPaused) return
    if (event.code === 'KeyS') { event.preventDefault(); game.registerSquat() }
    else if (event.code === 'ArrowLeft') { event.preventDefault(); game.selectAnswer('left') }
    else if (event.code === 'ArrowRight') { event.preventDefault(); game.selectAnswer('right') }
    else if (event.code === 'KeyR') { event.preventDefault(); resetCurrentQuestion() }
  }
  window.addEventListener('keydown', onKey)
  els.retry.addEventListener('click', () => cameraSession.start())

  // 진입 즉시 카메라를 준비하되 tutorial 동안 detector 입력은 차단한다.
  if (navigator.mediaDevices?.getUserMedia) cameraSession.start()
  else setCameraStatus('error')

  let tutorialHandle = null
  if (shouldShowTutorial(query)) {
    tutorialActive = true
    tutorialHandle = createBodyQuizTutorial({
      // 튜토리얼은 승인된 고정 레이아웃을 유지한다. 실제 session의 답 위치
      // randomization은 뒤의 play scene에만 적용한다.
      mountEl: root, question: QUESTIONS[0], onIntro: () => navigate(backTo), onHome: () => navigate('/'),
      onFinish() {
        tutorialActive = false
        tutorialHandle = null
        markTutorialCompleted()
        renderQuestionData()
        mountSystemBar()
        startGameLoop()
      },
    })
  } else {
    renderQuestionData()
    mountSystemBar()
    startGameLoop()
  }

  onLeave(() => {
    destroyed = true
    if (raf) cancelAnimationFrame(raf)
    window.removeEventListener('keydown', onKey)
    tutorialHandle?.destroy()
    systemBinding?.destroy()
    zoneDetector.destroy()
    cameraSession.destroy()
  })
}

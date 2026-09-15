// 바디 퀴즈 튜토리얼 — play.js 위에 얹는 **오버레이**.
//
// ── 왜 별도 라우트가 아니라 오버레이인가 ─────────────────────
//
// ken 지시로 play.js 위 overlay 구조를 쓴다. 실제 게임 화면(카메라 자리·
// 상단바·문제·정답 카드)이 이미 play.js에 있고, 튜토리얼은 그 위를
// 완전히 덮는 정지 화면 4장을 순서대로 보여주는 것뿐이라 별도 라우트로
// 화면을 새로 짜는 것보다 여기 붙는 편이 화면 전환을 하나 줄인다.
//
// ── 실제 게임 상태 머신을 쓰지 않는다 ────────────────────────
//
// 이 오버레이가 보여주는 SQUAT 3/5·MOVE ENERGY 60% 같은 숫자는 **연출용
// 스냅샷**이다(`tutorialSteps.js`). `BodyQuizRun` 인스턴스를 이 파일이
// 직접 건드리는 일은 없다 — 그러면 튜토리얼이 실수로 진짜 판을 진행시킬
// 위험이 아예 생기지 않는다. play.js는 GAME START/스킵(`onFinish`)을
// 받은 뒤에야 `game.reset()`으로 진짜 판을 깨끗하게 시작한다.
//
// ── MOVE LOCK 문구는 여기 없다(2차 수정) ─────────────────────
//
// 처음에는 보드 안에도 "MOVE LOCK / 아직 움직일 수 없어요!" 배지를
// 뒀는데, 이건 **실제 게임 화면(play.js)의 상태 표시**다. 튜토리얼은
// 그 상태를 몸으로 시연하는 자리이지 게임 UI를 복제하는 자리가
// 아니다(ken 지시) — 그래서 뺐다.
//
// ── 답안 사이 중앙 그림(centerImage/squatImages) ─────────────
//
// 좌우 보드 바깥의 boy_point·girl_guide(설명하는 캐릭터)와는 다른
// 그림이다. 이건 코끼리·호랑이 카드 **사이**에 놓여 "지금 단계가 뭘
// 뜻하는지"를 그림 하나로 보여준다 — STEP1 think · STEP3 unlock ·
// STEP4 move는 그림 한 장, STEP2만 스쿼트 down/up 두 장이라 별도
// 슬롯(`#bqt-squat-cycle`)을 쓴다. 어느 스텝이 무슨 그림을 쓰는지는
// `tutorialSteps.js`가 정한다 — 이 파일은 그 값을 그대로 꽂을 뿐이다.

import { icon } from '../../core/icons.js'
import { navigate } from '../../core/router.js'
import * as bgm from '../../core/bgm.js'
import * as sound from '../../core/sound.js'
import { sysBarMarkup, ensureSysBarStyle, bindSysBar } from '../runner/ui/systemBar.js'
import { TUTORIAL_STEPS } from './tutorialSteps.js'
import { getText, DEFAULT_LOCALE } from './tutorialText.js'
import {
  bodyQuizAssetReadiness,
  createBodyQuizLoadingGate,
  getBodyQuizPlayAssets,
  getBodyQuizTutorialAssets,
  openBodyQuizReadinessGate,
} from './assetReadiness.js'

const STORAGE_KEY = 'playzera.bodyQuiz.tutorialCompleted'
const TITLE_IMG = '/assets/body-quiz/tutorial/tutorial_title.png'
const FULLSCREEN_ICON = `
  <svg class="pz-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`

/**
 * BODY QUIZ용 Play Zera 시스템바 마크업.
 * 공통 systemBar의 구조/동작은 유지하고 bitmap icon만 code SVG로 바꾼다.
 * 튜토리얼과 실제 플레이가 이 한 함수를 함께 써서 icon 상태가 어긋나지 않는다.
 */
export function bodyQuizSystemBarMarkup() {
  return sysBarMarkup({
    home: false,
    exit: true,
    bgmMuted: bgm.isMuted(),
    sfxMuted: sound.isMuted(),
  })
    .replace('id="pz-menu" class="pz-sys-btn"', 'id="pz-menu" class="pz-sys-btn bqt-header-action bqt-header-action--menu"')
    .replace(/<img src="[^"]+" alt="메뉴">/, `<span id="bqt-menu-icon">${icon('menu')}</span>`)
    .replace(/<img src="[^"]+" alt="배경음악">/, `<span id="bqt-music-icon">${icon(bgm.isMuted() ? 'musicOff' : 'music')}</span>`)
    .replace(/<img src="[^"]+" alt="효과음">/, `<span id="bqt-sfx-icon">${icon(sound.isMuted() ? 'soundOff' : 'sound')}</span>`)
    .replace(/<img src="[^"]+" alt="전체화면">/, `<span id="bqt-full-icon">${FULLSCREEN_ICON}</span>`)
    .replace('id="pz-exit" class="pz-sys-btn ', 'id="pz-exit" class="pz-sys-btn bqt-header-action bqt-header-action--exit ')
    .replace(/<img src="[^"]+" alt="나가기">/, `<span id="bqt-exit-icon">${icon('exit')}</span>`)
}

/**
 * BODY QUIZ 시스템바 바인딩. 공통 binder가 요구하는 image src 계약을
 * SVG 교체로 번역한다. 반환값 destroy()는 화면 onLeave에서 반드시 부른다.
 */
export function bindBodyQuizSystemBar(root, { onQuit, onHome, onPause } = {}) {
  const $ = selector => root.querySelector(selector)
  const abort = new AbortController()
  const svgState = (selector, getIconName) => ({
    set src(value) { $(selector).innerHTML = icon(getIconName(value)) },
  })
  const imageStateAdapters = {
    '#pz-menu img': svgState('#bqt-menu-icon', value => value.includes('close') ? 'close' : 'menu'),
    '#pz-music img': svgState('#bqt-music-icon', value => value.includes('_off') ? 'musicOff' : 'music'),
    '#pz-sfx img': svgState('#bqt-sfx-icon', value => value.includes('_off') ? 'soundOff' : 'sound'),
  }
  const sysBarRoot = {
    querySelector(selector) {
      return imageStateAdapters[selector] ?? root.querySelector(selector)
    },
  }
  const binding = bindSysBar(sysBarRoot, {
    onToggleMusic: bgm.toggleMute,
    onToggleSfx: sound.toggle,
    onQuit,
    onHome,
    onPause,
  }, abort.signal)

  // dim 클릭은 가장 안전한 "계속하기"와 같다. 박스 안 클릭은 닫지 않는다.
  $('#pz-confirm').addEventListener('click', event => {
    if (event.target === event.currentTarget) $('#pz-resume').click()
  }, { signal: abort.signal })

  return {
    destroy() {
      binding.close()
      abort.abort()
    },
  }
}

/** 봤다고 기억한다. 계정이 생기면 이 함수만 Supabase 쓰기로 바꾼다. */
export function markTutorialCompleted() {
  try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* 프라이빗 모드 등 — 못 써도 게임은 진행된다 */ }
}

export function hasCompletedTutorial() {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

/** 개발·테스트용. 지운 뒤 다시 들어오면 튜토리얼이 처음부터 다시 뜬다. */
export function resetTutorialCompleted() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* 무시 */ }
}

if (typeof window !== 'undefined') {
  window.pzResetBodyQuizTutorial = resetTutorialCompleted
}

/**
 * 이번 진입에서 튜토리얼을 띄워야 하나.
 *
 * ── 개발 중에는 매번 다시 뜬다(2차 수정, ken 지시) ────────────
 *
 * 완료 기록(`markTutorialCompleted`)은 계속 남긴다 — 실제 서비스
 * 빌드에서 쓸 게이트다. 다만 개발 빌드(`import.meta.env.DEV`)에서는
 * 그 기록으로 화면을 막지 않는다: 화면을 고치는 동안 매번 완료
 * 기록을 지웠다 켰다 하지 않아도 다시 볼 수 있어야 한다. 대신 **스킵
 * 버튼**이 있어 다시 안 보고 싶으면 바로 게임으로 넘어갈 수 있다.
 *
 * `dev` 매개변수는 테스트에서 두 갈래(개발용 "항상 뜬다" · 실제
 * 서비스용 "완료했으면 안 뜬다")를 각각 확인하려고 뺀 것이다 —
 * 기본값은 실제 빌드 플래그를 그대로 따른다.
 */
export function shouldShowTutorial(query = {}, { dev = import.meta.env?.DEV } = {}) {
  if (query?.tutorial === '1' || query?.tutorial === 'true') return true
  if (dev) return true
  return !hasCompletedTutorial()
}

/**
 * 오버레이를 만들어 붙인다.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.mountEl   오버레이를 붙일 부모(보통 `#bq`)
 * @param {object} opts.question       questions.js의 문제 하나 — 실제 게임과 같은 문제를 보여준다
 * @param {string} [opts.locale]       'ko' | 'en'
 * @param {() => void} opts.onFinish   GAME START 또는 스킵을 눌렀을 때 — 둘 다 "이제 진짜 게임을 시작하라"는 같은 신호다
 * @param {() => void} [opts.onIntro]  왼쪽 위 인트로 버튼·나가기 확인의 "게임 처음으로"
 * @param {() => void} [opts.onHome]   나가기 확인의 "Home으로"
 * @returns {{ destroy: () => void, getStepIndex: () => number }}
 */
export function createBodyQuizTutorial({
  mountEl,
  question,
  locale = DEFAULT_LOCALE,
  onFinish,
  onIntro,
  onHome,
  assetReadiness = bodyQuizAssetReadiness,
  playAssets = getBodyQuizPlayAssets(question),
}) {
  const text = getText(locale)
  const target = question.exercise.targetReps
  const goIntro = onIntro ?? (() => navigate('/intro?id=body-quiz'))
  const goHome = onHome ?? (() => navigate('/'))
  const headerSysBar = bodyQuizSystemBarMarkup()

  // 햄버거·나가기·확인창은 Play Zera 공통 UI 한 벌을 그대로 쓴다.
  ensureSysBarStyle(mountEl.ownerDocument)

  const root = document.createElement('div')
  root.id = 'bqt-root'
  root.innerHTML = `
    <style>
      #bqt-root, #bqt-root * { box-sizing: border-box; }

      /* ── 전체 배경 — 밝은 놀이방. 어두운 덮개로 죽이지 않는다 ── */
      #bqt-root {
        --bqt-back-gradient: linear-gradient(180deg, #b7c8ff 0%, #6f86e6 55%, #4f63c9 100%);
        --bqt-back-border: 3px solid rgba(255,255,255,0.9);
        --bqt-back-shadow: 0 0 20px rgba(111,134,230,0.6), 0 6px 0 #38449c, 0 10px 22px rgba(0,0,0,0.3);
        --bqt-header-height: clamp(44px, 6dvh, 58px);
        --bqt-header-border: 3px;
        --bqt-header-depth: 5px;
        position: absolute; inset: 0; z-index: 50; overflow: auto;
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
        touch-action: none; user-select: none;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        gap: clamp(4px, 1dvh, 12px);
        padding:
          max(6px, env(safe-area-inset-top))
          max(10px, env(safe-area-inset-right))
          max(8px, env(safe-area-inset-bottom))
          max(10px, env(safe-area-inset-left));
        background-image: url('/assets/body-quiz/tutorial/bg_room.png');
        background-size: cover; background-position: center; background-repeat: no-repeat;
        background-color: #ffe9c7;   /* 그림이 늦게 뜰 때도 놀이방 톤에 가깝게 */
      }
      /* 보드 가독성을 위한 아주 옅은 냉백색 대기감 — 배경을 어둡히지 않는다 */
      #bqt-tint {
        position: absolute; inset: 0; z-index: 1; pointer-events: none;
        background: radial-gradient(60% 55% at 50% 44%, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.06) 55%, rgba(255,255,255,0) 75%);
      }

      /* ── 상단 바 — 좌: 인트로 · 중앙: TUTORIAL · 우: STEP + 공통 시스템바 ── */
      #bqt-topbar {
        position: relative; z-index: 6;
        width: 100%; padding-inline: clamp(4px, 1.5vw, 24px);
        display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: center; gap: clamp(6px, 1vw, 14px);
      }
      #bqt-intro {
        justify-self: start; height: var(--bqt-header-height);
        display: inline-flex; align-items: center; justify-content: center; gap: 7px;
        padding: 0 clamp(16px, 2.2vw, 26px);
        border: var(--bqt-back-border); border-radius: 9999px;
        background: var(--bqt-back-gradient);
        color: #fff; font: inherit; font-size: clamp(0.9rem, 1.5vw, 1.1rem); font-weight: 900;
        box-shadow: var(--bqt-back-shadow);
        cursor: pointer; -webkit-tap-highlight-color: transparent;
        transition: transform 0.12s, filter 0.12s, box-shadow 0.12s;
      }
      #bqt-intro svg { width: 1.1em; height: 1.1em; }
      #bqt-intro:hover { filter: brightness(1.06); transform: scale(1.04); }
      #bqt-intro:active { transform: translateY(3px); box-shadow: none; }

      /* TUTORIAL 타이틀 — 어두운 받침 없이 원본의 밝은 색을 살린다. */
      #bqt-title-wrap {
        justify-self: center; display: flex; align-items: center; justify-content: center;
        background: transparent; padding: 0;
      }
      #bqt-title-img {
        height: clamp(48px, 8.8dvh, 104px); width: auto; object-fit: contain;
        filter: drop-shadow(0 0 18px rgba(120,220,255,0.85)) drop-shadow(0 3px 6px rgba(80,70,150,0.24));
        animation: bqtTitleFloat 3.2s ease-in-out infinite;
      }
      @keyframes bqtTitleFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

      #bqt-page {
        --bqt-header-depth-color: rgba(9,70,120,0.62);
        --bqt-header-glow: rgba(41,182,255,0.42);
        flex: 0 0 auto; height: var(--bqt-header-height);
        display: inline-flex; align-items: center; justify-content: center; gap: 3px;
        background: linear-gradient(180deg, #4fd0ff 0%, #0d84d6 100%);
        border: var(--bqt-header-border) solid #fff; border-radius: 9999px;
        padding: 0 clamp(14px, 2vw, 24px);
        font-weight: 900; font-size: clamp(0.95rem, 1.7vw, 1.4rem); color: #fff;
        box-shadow:
          inset 0 2px 0 rgba(255,255,255,0.42),
          0 0 18px var(--bqt-header-glow),
          0 var(--bqt-header-depth) 0 var(--bqt-header-depth-color),
          0 calc(var(--bqt-header-depth) + 4px) 18px rgba(0,0,0,0.24);
      }
      #bqt-page b { color: #ffe066; font-size: 1.15em; }

      #bqt-header-right {
        justify-self: end; min-width: 0;
        display: flex; align-items: center; justify-content: flex-end;
        gap: clamp(6px, 1vw, 14px);
      }
      #bqt-sysbar { display: contents; }
      /* 공통 시스템바의 동작은 그대로 쓰고, 헤더 버튼만 BODY QUIZ의 코드
         기반 SVG + glossy action 구조로 그린다. menu/exit는 variant만 다르다. */
      #bqt-header-right #pz-topbar {
        position: static; display: flex; align-items: center;
        gap: clamp(6px, 0.8vw, 12px);
      }
      .bqt-header-action {
        --bqt-header-depth-color: rgba(8,73,128,0.64);
        --bqt-header-glow: rgba(64,210,255,0.38);
        flex: 0 0 auto; width: var(--bqt-header-height); height: var(--bqt-header-height);
        display: inline-flex; align-items: center; justify-content: center;
        padding: 0; border: var(--bqt-header-border) solid #fff;
        border-radius: 9999px; color: #fff;
        box-shadow:
          inset 0 2px 0 rgba(255,255,255,0.42),
          0 0 18px var(--bqt-header-glow),
          0 var(--bqt-header-depth) 0 var(--bqt-header-depth-color),
          0 calc(var(--bqt-header-depth) + 4px) 18px rgba(0,0,0,0.24);
        transition: transform 0.12s, filter 0.12s, box-shadow 0.12s;
      }
      .bqt-header-action--menu { background: linear-gradient(180deg, #71e8ff 0%, #168fe9 54%, #075fc4 100%); }
      .bqt-header-action--exit {
        --bqt-header-depth-color: rgba(139,28,45,0.72);
        --bqt-header-glow: rgba(255,91,111,0.38);
        background: linear-gradient(180deg, #ffaaa6 0%, #ff4f62 54%, #d62543 100%);
      }
      .bqt-header-action > span { display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
      .bqt-header-action .pz-ico { width: 52%; height: 52%; stroke-width: 2.35; }
      .bqt-header-action:hover { filter: brightness(1.07); transform: scale(1.04); }
      .bqt-header-action:active { transform: translateY(3px) scale(0.96); box-shadow: none; }
      #bqt-intro:focus-visible, .bqt-header-action:focus-visible,
      #bqt-root .pz-menu-item:focus-visible, #bqt-root .pz-btn:focus-visible {
        outline: 3px solid #ffe066; outline-offset: 3px;
      }

      /* ── 공통 시스템바의 동작 + BODY QUIZ 밝은 visual skin ──
         마크업과 이벤트는 runner/ui/systemBar.js의 정본을 재사용한다.
         이 범위의 selector만 덮어 다른 게임의 시스템바에는 영향을 주지 않는다. */
      #bqt-root #pz-menu-panel {
        display: flex; top: calc(100% + clamp(8px, 1.2dvh, 14px)); right: 0;
        min-width: 0; width: clamp(62px, 5.2vw, 78px);
        padding: clamp(9px, 1.3dvh, 14px);
        gap: clamp(8px, 1.2dvh, 12px);
        border: 3px solid #cbb8f5; outline: 3px solid rgba(255,255,255,0.96);
        border-radius: clamp(22px, 2vw, 30px);
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(240,232,255,0.98));
        box-shadow: 0 6px 0 #ac94dc, 0 14px 32px rgba(52,32,100,0.28);
        opacity: 1; visibility: visible; pointer-events: auto;
        transform: translateY(0) scale(1); transform-origin: top center;
        transition: opacity 0.16s ease, transform 0.16s ease, visibility 0s;
      }
      #bqt-root #pz-menu-panel.hidden {
        display: flex; opacity: 0; visibility: hidden; pointer-events: none;
        transform: translateY(-8px) scale(0.94);
        transition: opacity 0.13s ease, transform 0.13s ease, visibility 0s linear 0.13s;
      }
      #bqt-root .pz-menu-item {
        width: clamp(40px, 3.7vw, 52px); height: clamp(40px, 3.7vw, 52px);
        display: inline-flex; align-items: center; justify-content: center;
        border: 2px solid rgba(255,255,255,0.98); border-radius: 9999px;
        color: #443087;
        background: linear-gradient(180deg, #ffffff 0%, #ddd0fb 100%);
        box-shadow: inset 0 2px 0 rgba(255,255,255,0.78), 0 3px 0 #aa91dc, 0 7px 13px rgba(63,43,112,0.20);
        transition: transform 0.12s ease, filter 0.12s ease, box-shadow 0.12s ease;
      }
      #bqt-root .pz-menu-item > span {
        width: 100%; height: 100%; display: inline-flex; align-items: center; justify-content: center;
      }
      #bqt-root .pz-menu-item .pz-ico { width: 52%; height: 52%; stroke-width: 2.25; }
      #bqt-root .pz-menu-item:hover { filter: brightness(1.05); transform: scale(1.06); }
      #bqt-root .pz-menu-item:active { transform: translateY(2px) scale(0.94); box-shadow: none; }

      #bqt-topbar #pz-confirm {
        position: fixed; inset: 0; display: flex;
        background: rgba(38,25,73,0.46); backdrop-filter: blur(4px);
        opacity: 1; visibility: visible; pointer-events: auto;
        transition: opacity 0.16s ease, visibility 0s;
      }
      #bqt-topbar #pz-confirm.hidden {
        display: flex; opacity: 0; visibility: hidden; pointer-events: none;
        transition: opacity 0.13s ease, visibility 0s linear 0.13s;
      }
      #bqt-root .pz-confirm-box {
        width: min(88vw, 520px); max-width: none;
        padding: clamp(20px, 3.5dvh, 34px) clamp(22px, 4vw, 44px);
        border: 4px solid #cbb8f5; outline: 4px solid rgba(255,255,255,0.95);
        border-radius: clamp(24px, 2.4vw, 34px);
        background: linear-gradient(180deg, #ffffff 0%, #f1e9ff 100%);
        color: #35236f;
        box-shadow: 0 8px 0 #a98fdc, 0 20px 52px rgba(35,19,77,0.36);
      }
      #bqt-root .pz-confirm-box p {
        margin-bottom: clamp(14px, 2.4dvh, 24px);
        color: #35236f; font-size: clamp(1.15rem, 2.4vw, 1.55rem);
      }
      #bqt-root .pz-confirm-actions { gap: clamp(9px, 1.4dvh, 13px); }
      #bqt-root .pz-btn {
        min-height: clamp(44px, 6dvh, 58px);
        border: 3px solid rgba(255,255,255,0.96);
        color: #38236f; font-size: clamp(0.9rem, 1.7vw, 1.1rem);
        background: linear-gradient(180deg, #ffffff 0%, #ded2fa 100%);
        box-shadow: inset 0 2px 0 rgba(255,255,255,0.72), 0 4px 0 #aa91dc, 0 8px 16px rgba(60,37,110,0.20);
        transition: transform 0.12s ease, filter 0.12s ease, box-shadow 0.12s ease;
      }
      #bqt-root #pz-quit {
        color: #573600;
        background: linear-gradient(180deg, #fff3a0 0%, #ffd23e 56%, #f0a91b 100%);
        box-shadow: inset 0 2px 0 rgba(255,255,255,0.64), 0 4px 0 #be8213, 0 8px 16px rgba(102,67,5,0.22);
      }
      #bqt-root #pz-quit-home {
        color: #fff;
        background: linear-gradient(180deg, #9f8df3 0%, #7056d3 56%, #4c35a6 100%);
        box-shadow: inset 0 2px 0 rgba(255,255,255,0.38), 0 4px 0 #39257e, 0 8px 16px rgba(43,27,88,0.28);
      }
      #bqt-root .pz-btn svg { width: 1.1em; height: 1.1em; }
      #bqt-root .pz-btn:hover { filter: brightness(1.05); transform: scale(1.02); }
      #bqt-root .pz-btn:active { transform: translateY(3px) scale(0.98); box-shadow: none; }

      /* ── 무대 — 보드 + 좌우 대형 캐릭터 ── */
      #bqt-stagewrap {
        position: relative; z-index: 2; min-height: 0;
        display: flex; align-items: flex-start; justify-content: center;
      }
      .bqt-char {
        position: absolute; z-index: 4; bottom: 0;
        height: min(46dvh, 520px); width: auto; object-fit: contain;
        filter: drop-shadow(0 14px 18px rgba(0,0,0,0.28));
        pointer-events: none;
      }
      .bqt-char[hidden] { display: none; }
      #bqt-boy  { left: max(-28px, calc(50% - 48vw)); }
      #bqt-girl { right: max(-28px, calc(50% - 48vw)); }

      /* ── 상단 고정(top-anchored) ★ ──
         #bqt-stagewrap은 캐릭터의 발이 바닥에 붙도록 align-items:
         flex-end다. 보드가 그 규칙을 그대로 물려받으면 콘텐츠가 적은
         스텝일수록 보드 키가 작아지고, 아래쪽(발 높이)에 맞춰 떠 있느라
         **보드의 윗변이 스텝마다 다른 높이에서 시작**했다 — "콘텐츠가
         적으면 아래로 처진다"는 지적이 이것이다. align-self:
         flex-start로 보드만 위쪽 기준으로 떼어내면, 보드 키가 스텝마다
         달라져도 윗변(배지·타이틀 자리)은 항상 같은 자리에서 시작한다. */
      #bqt-board {
        position: relative; z-index: 3; align-self: flex-start;
        width: min(72vw, 1280px); max-width: 100%; min-width: 0;
        background: linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(224,247,255,0.90) 100%);
        border-radius: clamp(24px, 2.4vw, 40px);
        border: 6px solid rgba(64,201,255,0.95);
        box-shadow:
          inset 0 0 0 6px rgba(255,255,255,0.75),
          0 18px 0 rgba(30,60,120,0.20),
          0 30px 60px rgba(10,10,40,0.40),
          0 0 60px rgba(64,201,255,0.55);
        backdrop-filter: blur(4px);
        color: #3a2560;
        padding: clamp(8px, 1.35dvh, 18px) clamp(14px, 2.2vw, 38px);
        display: flex; flex-direction: column; justify-content: flex-start;
        gap: clamp(4px, 0.8dvh, 10px);
      }

      /* STEP 제목 패널 */
      #bqt-step-title-panel {
        align-self: center; text-align: center; position: relative;
        padding: 4px clamp(18px, 2.6vw, 36px);
        border-radius: 9999px;
        background: linear-gradient(180deg, #6b3fa0 0%, #4a2a80 100%);
        border: 3px solid rgba(180,220,255,0.9);
        box-shadow: 0 0 22px rgba(140,90,255,0.5), 0 5px 0 rgba(30,10,60,0.4);
      }
      #bqt-step-title {
        font-size: clamp(0.95rem, 2vw, 1.4rem); font-weight: 900; color: #fff;
        text-shadow: 0 0 10px rgba(120,220,255,0.8), 0 2px 3px rgba(0,0,0,0.4);
      }
      #bqt-step-title b { color: #ffe066; }

      /* 문제 배너 — 라벨과 질문을 같은 행에 둔다. 라벨은 왼쪽에 고정하고
         질문은 남은 폭의 가운데에 놓여 긴 문장도 한 줄을 우선한다. */
      #bqt-question-panel {
        display: flex; align-items: center;
        padding: clamp(6px, 1.05dvh, 12px) clamp(12px, 2vw, 28px);
        border-radius: clamp(18px, 2.2vw, 30px);
        background: linear-gradient(180deg, #341166 0%, #1c0d3d 100%);
        border: 4px solid #ff3fa0;
        box-shadow: 0 0 30px rgba(255,63,160,0.6), inset 0 0 24px rgba(120,60,200,0.4);
      }
      #bqt-question-body {
        width: 100%; min-width: 0;
        display: flex; flex-direction: row; align-items: center;
        gap: clamp(12px, 2vw, 30px);
      }
      /* 라벨 — absolute로 띄우지 않고 같은 flex 행의 왼쪽 칸을 지킨다. */
      #bqt-question-tag {
        background: linear-gradient(180deg, #ffe066, #ff9d2e);
        flex: 0 0 auto;
        color: #5a2a00; font-weight: 900; font-size: clamp(0.78rem, 1.25vw, 1rem);
        line-height: 1.2; letter-spacing: 0.12em; padding: 3px 14px; border-radius: 9999px;
        border: 2px solid #fff; box-shadow: 0 3px 8px rgba(0,0,0,0.3);
      }
      #bqt-prompt {
        flex: 1 1 auto; min-width: 0;
        font-size: clamp(1.25rem, 3vw, 2.35rem); font-weight: 900;
        color: #fff8e0; text-align: center; line-height: 1.15;
        white-space: nowrap;
      }

      /* 답안 무대 — 카드 + 중앙 설명 그림 */
      #bqt-stage {
        display: flex; align-items: center; justify-content: center;
        gap: clamp(10px, 3vw, 48px); position: relative; min-height: 0;
        padding: clamp(1px, 0.35dvh, 5px) 0;
      }
      .bqt-answer {
        position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px;
        --bq-card-scale: 1;
        width: clamp(112px, min(18vw, 24dvh), 280px); flex: 0 0 auto;
        transition: transform 0.2s;
      }
      /* 서로 가운데를 바라보는 아주 미세한 각도 — 정면으로 나란히 서
         있는 것보다 "둘이 마주 놓인 선택지"라는 느낌이 살짝 더 든다.
         과한 3D 왜곡은 금지(ken 지시)라 6~7도 안에서만 기울인다. */
      #bqt-left  { --bq-card-tilt: 6deg; transform: perspective(900px) rotateY(var(--bq-card-tilt)) scale(var(--bq-card-scale)); }
      #bqt-right { --bq-card-tilt: -6deg; transform: perspective(900px) rotateY(var(--bq-card-tilt)) scale(var(--bq-card-scale)); }
      .bqt-answer img {
        width: 100%; aspect-ratio: 1; object-fit: contain;
        filter: drop-shadow(0 10px 14px rgba(0,0,0,0.22));
        transition: filter 0.2s;
      }
      .bqt-answer .bqt-label {
        font-weight: 900; font-size: clamp(1.1rem, 2.2vw, 1.5rem); color: #4a2a80;
        background: rgba(255,255,255,0.7); padding: 4px 20px; border-radius: 9999px;
      }
      .bqt-answer.bqt-correct { --bq-card-scale: 1.06; }
      /* 정답 강조는 초록이 아니라 **황금색**이다(ken 지시) — "성공"이
         아니라 "이게 정답"이라는 뜻이라 트로피·별과 같은 톤을 쓴다. */
      .bqt-answer.bqt-correct img {
        filter: drop-shadow(0 0 26px rgba(255,196,60,0.95)) drop-shadow(0 10px 14px rgba(0,0,0,0.22));
      }
      .bqt-answer.bqt-correct .bqt-label {
        background: linear-gradient(180deg, #fff3c4, #ffd23e);
        box-shadow: 0 0 18px rgba(255,196,60,0.7);
      }
      .bqt-correct-badge {
        display: none; position: absolute; top: -20px; right: -18px;
        background: linear-gradient(180deg, #fff3b0 0%, #ffb020 100%);
        color: #5a2a00; font-weight: 900; font-size: clamp(0.85rem, 1.6vw, 1.15rem);
        padding: 6px 16px; border-radius: 9999px; border: 3px solid #fff;
        box-shadow: 0 0 20px rgba(255,176,32,0.9); white-space: nowrap;
        animation: bqtBadgePop 0.9s ease-in-out infinite;
      }
      @keyframes bqtBadgePop { 0%,100% { transform: scale(1) rotate(-3deg); } 50% { transform: scale(1.12) rotate(3deg); } }
      .bqt-answer.bqt-correct .bqt-correct-badge { display: block; }

      /* 정답 쪽 카드 머리 위로 떨어지는 노란 화살표 — "여기!"를 몸짓으로
         가리킨다. 카드 안에 같이 두면 question.correctSide가 바뀌어도
         자리 계산 없이 알아서 정답 카드를 따라간다. */
      .bqt-answer-arrow {
        display: none; color: #ffd23e; font-size: clamp(1.5rem, 3vw, 2.3rem);
        text-shadow: 0 0 16px rgba(255,210,62,0.9);
        animation: bqtArrowBounce 0.8s ease-in-out infinite;
      }
      .bqt-answer.bqt-correct .bqt-answer-arrow { display: block; }
      @keyframes bqtArrowBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(8px); } }

      /* 중앙 설명 그림 — STEP1 think · STEP3 unlock · STEP4 move.
         카드보다 크지 않게(무대의 주인공은 여전히 답안 두 장이다) 카드와
         비슷한 눈높이로만 키운다. */
      #bqt-center-media {
        flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
        width: clamp(104px, min(18vw, 24dvh), 270px);
      }
      #bqt-center-media[hidden] { display: none; }
      #bqt-center-img {
        max-width: 100%; max-height: min(25dvh, 290px); object-fit: contain;
        filter: drop-shadow(0 10px 18px rgba(0,0,0,0.28));
      }
      /* STEP4에서만 — 정답 쪽으로 살짝씩 다가가는 듯한 움직임.
         --bqt-nudge는 render()가 question.correctSide에 맞춰 부호를 정한다. */
      #bqt-center-img.bqt-move-nudge { animation: bqtMoveNudge 0.85s ease-in-out infinite; }
      @keyframes bqtMoveNudge { 0%,100% { transform: translateX(0); } 50% { transform: translateX(var(--bqt-nudge, 12px)); } }

      /* STEP2 전용 — 스쿼트 down↔up이 한 자리에서 번갈아 나타난다(교차
         페이드). 예전에는 두 장을 나란히 두고 파란 테두리로 감쌌는데,
         "동작 하나가 바뀌는 것처럼" 보이는 편이 스쿼트 개념(내려갔다
         올라온다)을 더 잘 전달한다는 지적으로 바꿨다 — 파란 라인 장식은
         뺐다. */
      #bqt-squat-cycle {
        flex: 0 0 auto; width: clamp(104px, min(18vw, 24dvh), 270px);
        display: flex; align-items: center; justify-content: center;
      }
      #bqt-squat-cycle[hidden] { display: none; }
      #bqt-squat-stage { position: relative; width: 100%; aspect-ratio: 1; }
      #bqt-squat-stage img {
        position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;
        filter: drop-shadow(0 10px 18px rgba(0,0,0,0.28));
        opacity: 0; transition: opacity 0.5s ease;
      }
      #bqt-squat-stage img.on { opacity: 1; }

      /* 운동 패널 — STEP2에서 크게, 보드 아래쪽으로 */
      #bqt-exercise {
        align-self: center; display: flex; flex-direction: column; align-items: center; gap: clamp(3px, 0.7dvh, 8px);
        margin-top: clamp(2px, 0.6dvh, 7px);
        padding: clamp(6px, 1dvh, 12px) clamp(18px, 3vw, 36px);
        border-radius: clamp(18px, 2.2vw, 26px);
        background: linear-gradient(180deg, #12245a 0%, #0a173f 100%);
        border: 3px solid #40e0ff;
        box-shadow: 0 0 26px rgba(64,224,255,0.55);
        transition: transform 0.2s, opacity 0.2s;
      }
      #bqt-exercise.compact { opacity: 0.7; margin-top: 0; padding-block: clamp(4px, 0.7dvh, 8px); gap: 2px; }
      #bqt-exercise[hidden] { display: none; }
      /* 핵심만 남긴다(ken 지시) — 스쿼트 카운트 + 에너지바 딱 둘.
         "EXERCISE" 아이콘 라벨은 뺐다. */
      #bqt-squat { font-weight: 900; font-size: clamp(1.3rem, 2.8vw, 1.9rem); color: #fff; }
      #bqt-energy-bar {
        width: min(48vw, 420px); height: clamp(14px, 2dvh, 24px); border-radius: 999px;
        background: rgba(0,0,0,0.4); overflow: hidden; border: 2px solid rgba(64,224,255,0.5);
      }
      #bqt-energy-bar i {
        display: block; height: 100%; width: 0%;
        background: linear-gradient(90deg, #4ee08a, #17c281);
        box-shadow: 0 0 12px rgba(72,235,180,0.9);
      }
      #bqt-energy-label { font-size: clamp(0.85rem, 1.6vw, 1.05rem); font-weight: 800; color: #b7f5da; }
      #bqt-exercise.compact #bqt-squat { font-size: clamp(1rem, 2vw, 1.35rem); }
      #bqt-exercise.compact #bqt-energy-bar { width: min(34vw, 300px); height: clamp(12px, 1.6dvh, 18px); }
      #bqt-exercise.compact #bqt-energy-label { font-size: clamp(0.72rem, 1.25vw, 0.9rem); }

      /* MOVE UNLOCK 대형 배너 */
      #bqt-unlock-banner {
        display: none; align-self: center; align-items: center; justify-content: center; gap: clamp(10px, 2vw, 22px);
        position: relative; margin-top: clamp(2px, 0.6dvh, 7px);
      }
      #bqt-unlock-banner.on { display: flex; }
      #bqt-unlock-banner svg { width: clamp(1.6rem, 3vw, 2.4rem); height: clamp(1.6rem, 3vw, 2.4rem); }
      #bqt-unlock-arrow-left svg  { stroke: #4fe0ff; filter: drop-shadow(0 0 10px rgba(79,224,255,0.9)); }
      #bqt-unlock-arrow-right svg { stroke: #ff5db0; filter: drop-shadow(0 0 10px rgba(255,93,176,0.9)); }
      #bqt-unlock-text {
        font-size: clamp(1.4rem, 3.4vw, 2.3rem); font-weight: 900; letter-spacing: 0.04em;
        background: linear-gradient(180deg, #fff6b0 0%, #ffb020 100%);
        -webkit-background-clip: text; background-clip: text; color: transparent;
        -webkit-text-stroke: clamp(1.5px, 0.22vw, 3px) #7a1e9e;
        text-shadow: 0 0 24px rgba(255,150,220,0.8), 0 6px 18px rgba(0,0,0,0.3);
        animation: bqtUnlockPulse 1s ease-in-out infinite;
      }
      @keyframes bqtUnlockPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
      .bqt-spark {
        position: absolute; font-size: clamp(1rem, 2vw, 1.6rem); color: #ffe066;
        text-shadow: 0 0 10px rgba(255,224,102,0.9);
        animation: bqtSparkFloat 1.4s ease-in-out infinite;
      }
      @keyframes bqtSparkFloat { 0%,100% { transform: translateY(0) scale(1); opacity: 0.8; } 50% { transform: translateY(-10px) scale(1.3); opacity: 1; } }

      /* ── 하단 — 가이드 바 하나 안에 이전·건너뛰기·다음이 다 들어간다 ── */
      #bqt-footer {
        position: relative; z-index: 6; min-width: 0;
        padding-inline: clamp(4px, 1.5vw, 24px);
      }
      #bqt-guidebar {
        display: flex; align-items: center; gap: clamp(10px, 1.6vw, 20px);
        background: linear-gradient(180deg, #ffffff 0%, #eaf7ff 100%);
        border: 4px solid #6fd6ff; border-radius: 9999px;
        padding: clamp(8px, 1.4vh, 14px) clamp(10px, 1.6vw, 16px) clamp(8px, 1.4vh, 14px) clamp(18px, 2.4vw, 28px);
        box-shadow: 0 0 20px rgba(111,214,255,0.5), 0 8px 0 rgba(20,80,120,0.15);
      }
      #bqt-guide-slot {
        flex: 0 0 auto; width: clamp(36px, 4vw, 52px); height: clamp(36px, 4vw, 52px);
        border-radius: 50%; background: linear-gradient(180deg, #ffd23e, #ff9d2e);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 0 0 3px #fff, 0 4px 10px rgba(0,0,0,0.2);
      }
      #bqt-guide-slot svg { width: 55%; height: 55%; stroke: #6b3f00; }
      #bqt-guide {
        flex: 1 1 auto; min-width: 0;
        font-size: clamp(1.15rem, 2.3vw, 1.6rem); font-weight: 800; color: #1b2a6b;
        white-space: pre-line; line-height: 1.3; min-height: 1.3em;
      }
      /* 타이핑 커서 — 다 쳐지고 나면 JS가 지운다(bqtCaretBlink용 클래스 토글) */
      #bqt-guide .bqt-caret {
        display: inline-block; width: 0.08em; margin-left: 2px;
        border-right: 3px solid #1b2a6b; animation: bqtCaretBlink 0.8s steps(1) infinite;
      }
      @keyframes bqtCaretBlink { 50% { border-color: transparent; } }

      /* 이전·다음·게임 시작 셋은 **같은 계열**이다 — 높이·테두리·폰트
         크기·정렬을 통일하고 색만 방향(뒤/앞)에 따라 다르게 둔다(ken 지시:
         "이전 버튼은 다음 버튼과 거의 동일한 스타일로"). 건너뛰기는
         모양은 다르지만 높이·폰트 크기만 이 둘에 맞춘다. */
      #bqt-guidebtns { flex: 0 0 auto; display: flex; align-items: center; gap: clamp(8px, 1.2vw, 14px); }

      #bqt-skip, #bqt-prev, #bqt-next {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        height: clamp(46px, 6.2dvh, 58px); min-height: 0; border-radius: 9999px;
        font: inherit; font-weight: 900; letter-spacing: 0.02em;
        font-size: clamp(1rem, 1.9vw, 1.35rem);
        cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform 0.1s;
      }
      #bqt-skip svg, #bqt-prev svg, #bqt-next svg { width: 1.15em; height: 1.15em; }
      #bqt-skip:active, #bqt-prev:active:not(:disabled), #bqt-next:active { transform: scale(0.95); }

      /* 건너뛰기 — 눈에는 띄되 NEXT보다는 조용하게(실수로 안 눌리게) */
      #bqt-skip {
        padding: 0 clamp(18px, 2.4vw, 28px);
        border: 2px solid rgba(107,63,160,0.35);
        background: rgba(255,255,255,0.6); color: #6b3fa0;
        font-weight: 800;
        box-shadow: 0 0 16px rgba(107,63,160,0.22), 0 5px 0 rgba(86,54,126,0.34), 0 9px 18px rgba(0,0,0,0.2);
      }
      #bqt-skip:hover { background: rgba(255,255,255,0.9); }
      #bqt-skip:active { transform: scale(0.95) translateY(3px); box-shadow: 0 2px 0 rgba(86,54,126,0.34), 0 5px 10px rgba(0,0,0,0.18); }

      /* 이전 — 다음과 같은 파란/보라 톤으로, 같은 필(pill) 모양 */
      #bqt-prev {
        padding: 0 clamp(20px, 2.8vw, 32px);
        border: var(--bqt-back-border);
        background: var(--bqt-back-gradient);
        color: #fff;
        box-shadow: var(--bqt-back-shadow);
      }
      #bqt-prev:disabled { opacity: 0.35; cursor: default; box-shadow: none; transform: none; }

      /* 다음 / 게임 시작 — 대화창 내부 우측, 가장 화려한 버튼 */
      #bqt-next {
        padding: 0 clamp(24px, 3.2vw, 40px);
        border: 3px solid rgba(255,255,255,0.9);
        background: linear-gradient(180deg, #ff8fd0 0%, #ff2fa0 55%, #d600a0 100%);
        color: #fff;
        box-shadow: 0 0 24px rgba(255,47,160,0.75), 0 6px 0 #9c007a, 0 10px 22px rgba(0,0,0,0.35);
      }
      #bqt-next:active { transform: scale(0.95) translateY(3px); }

      @media (max-width: 1180px), (max-height: 760px) {
        .bqt-char { display: none; }
        #bqt-board { width: min(94vw, 920px); }
      }

      /* 휴대폰 가로처럼 높이가 짧은 화면은 폭이 아니라 높이가 병목이다.
         카드·중앙 그림·패널을 같은 비율로 줄여 모든 STEP을 한 화면에 둔다. */
      @media (max-height: 520px) {
        #bqt-root {
          --bqt-back-border: 2px solid rgba(255,255,255,0.9);
          --bqt-back-shadow: 0 3px 0 rgba(56,68,156,0.8), 0 5px 9px rgba(0,0,0,0.2);
          --bqt-header-height: 34px;
          --bqt-header-border: 2px;
          --bqt-header-depth: 3px;
          gap: 3px; padding-block: max(4px, env(safe-area-inset-top)) max(4px, env(safe-area-inset-bottom));
        }
        #bqt-topbar, #bqt-footer { padding-inline: 0; }
        #bqt-intro { padding-inline: clamp(9px, 1.8vw, 14px); font-size: clamp(0.68rem, 2.4dvh, 0.82rem); }
        #bqt-title-img { height: clamp(34px, 10dvh, 46px); }
        #bqt-page { padding-inline: 10px; font-size: 0.78rem; }
        #bqt-header-right { gap: clamp(4px, 0.9vw, 8px); }
        #bqt-header-right #pz-topbar { gap: clamp(4px, 0.7vw, 7px); }
        #bqt-root #pz-menu-panel { width: 54px; padding: 7px; gap: 7px; border-width: 2px; outline-width: 2px; border-radius: 19px; box-shadow: 0 4px 0 #ac94dc, 0 8px 18px rgba(52,32,100,0.24); }
        #bqt-root .pz-menu-item { width: 34px; height: 34px; border-width: 2px; }
        #bqt-root .pz-confirm-box { width: min(86vw, 430px); padding: 12px 20px; border-width: 3px; outline-width: 3px; border-radius: 22px; }
        #bqt-root .pz-confirm-box p { margin-bottom: 9px; font-size: clamp(0.94rem, 3.7dvh, 1.15rem); }
        #bqt-root .pz-confirm-actions { gap: 7px; }
        #bqt-root .pz-btn { min-height: 36px; padding-inline: 16px; border-width: 2px; font-size: clamp(0.74rem, 2.8dvh, 0.9rem); }
        #bqt-board { width: min(96vw, 820px); border-width: 3px; border-radius: 16px; padding: 5px 10px; gap: 3px; box-shadow: inset 0 0 0 3px rgba(255,255,255,0.7), 0 7px 0 rgba(30,60,120,0.18), 0 12px 24px rgba(10,10,40,0.3); }
        #bqt-step-title-panel { padding: 1px 12px; border-width: 2px; box-shadow: 0 3px 0 rgba(30,10,60,0.35); }
        #bqt-step-title { font-size: clamp(0.68rem, 2.4dvh, 0.82rem); }
        #bqt-question-panel { border-width: 2px; border-radius: 12px; padding: 3px clamp(8px, 1.6vw, 12px); }
        #bqt-question-body { gap: clamp(6px, 1.4vw, 12px); }
        #bqt-question-tag { border-width: 1px; padding: 1px 8px; font-size: clamp(0.58rem, 2dvh, 0.7rem); }
        #bqt-prompt { font-size: clamp(0.94rem, 4.2dvh, 1.2rem); line-height: 1.1; }
        #bqt-stage { gap: clamp(6px, 2vw, 18px); padding: 0; }
        .bqt-answer { width: clamp(72px, min(15vw, 20dvh), 104px); gap: 2px; }
        .bqt-answer .bqt-label { padding: 1px 10px; font-size: clamp(0.68rem, 2.5dvh, 0.82rem); }
        #bqt-center-media, #bqt-squat-cycle { width: clamp(72px, min(15vw, 20dvh), 104px); }
        #bqt-center-img { max-height: 20dvh; }
        .bqt-answer-arrow { font-size: 0.9rem; line-height: 0.8; }
        .bqt-correct-badge { top: -8px; right: -8px; border-width: 2px; padding: 2px 7px; font-size: 0.62rem; }
        #bqt-exercise { margin-top: 0; gap: 1px; padding: 3px 14px; border-width: 2px; border-radius: 11px; }
        #bqt-squat, #bqt-exercise.compact #bqt-squat { font-size: clamp(0.78rem, 3dvh, 0.95rem); }
        #bqt-energy-bar, #bqt-exercise.compact #bqt-energy-bar { width: min(40vw, 280px); height: 10px; border-width: 1px; }
        #bqt-energy-label, #bqt-exercise.compact #bqt-energy-label { font-size: clamp(0.58rem, 2dvh, 0.7rem); line-height: 1; }
        #bqt-unlock-banner { margin-top: 0; gap: 7px; }
        #bqt-unlock-banner svg { width: 1rem; height: 1rem; }
        #bqt-unlock-text { font-size: clamp(0.9rem, 3.6dvh, 1.15rem); -webkit-text-stroke-width: 1px; }
        #bqt-guidebar { gap: 6px; border-width: 3px; padding: 4px 6px 4px 10px; box-shadow: 0 4px 0 rgba(20,80,120,0.15); }
        #bqt-guide-slot { width: 28px; height: 28px; box-shadow: 0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,0.18); }
        #bqt-guide { font-size: clamp(0.72rem, 2.6dvh, 0.86rem); line-height: 1.15; min-height: 1.15em; }
        #bqt-guidebtns { gap: 5px; }
        #bqt-skip, #bqt-prev, #bqt-next { height: 38px; gap: 3px; padding-inline: clamp(8px, 1.5vw, 14px); border-width: 2px; font-size: clamp(0.68rem, 2.4dvh, 0.82rem); box-shadow: 0 3px 0 rgba(56,68,156,0.8), 0 5px 9px rgba(0,0,0,0.2); }
        #bqt-skip { box-shadow: 0 3px 0 rgba(86,54,126,0.34), 0 5px 9px rgba(0,0,0,0.16); }
        #bqt-prev { box-shadow: var(--bqt-back-shadow); }
        #bqt-next { box-shadow: 0 3px 0 #9c007a, 0 5px 9px rgba(0,0,0,0.24); }
      }

      @media (max-width: 680px) and (orientation: landscape) {
        #bqt-root { --bqt-header-height: 32px; }
        #bqt-topbar { gap: 4px; }
        #bqt-intro { padding-inline: 8px; gap: 4px; font-size: 0.66rem; }
        #bqt-page { padding-inline: 8px; }
        #bqt-header-right, #bqt-header-right #pz-topbar { gap: 3px; }
        #bqt-question-panel { padding-inline: 7px; }
        #bqt-question-body { gap: 5px; }
        #bqt-question-tag { padding-inline: 6px; font-size: 0.56rem; }
        #bqt-prompt { font-size: 0.9rem; }
        #bqt-guide-slot { display: none; }
        #bqt-guidebar { gap: 4px; padding-left: 8px; }
        #bqt-guide { font-size: 0.68rem; }
        #bqt-guidebtns { gap: 3px; }
        #bqt-skip, #bqt-prev, #bqt-next { padding-inline: 7px; font-size: 0.66rem; }
      }

      @media (max-height: 360px) {
        #bqt-root { --bqt-header-height: 30px; }
        #bqt-title-img { height: 30px; }
        #bqt-page { padding-block: 2px; }
        #bqt-board { padding-block: 3px; gap: 2px; }
        #bqt-step-title-panel { padding-block: 0; }
        #bqt-question-panel { padding-block: 2px; }
        #bqt-question-tag { font-size: 0.54rem; }
        #bqt-prompt { font-size: 0.86rem; }
        .bqt-answer, #bqt-center-media, #bqt-squat-cycle { width: 64px; }
        .bqt-answer .bqt-label { font-size: 0.62rem; }
        #bqt-exercise { padding-block: 2px; }
        #bqt-energy-label { display: none; }
        #bqt-unlock-text { font-size: 0.82rem; }
        #bqt-guidebar { padding-block: 3px; }
        #bqt-skip, #bqt-prev, #bqt-next { height: 34px; }
      }
    </style>

    <div id="bqt-tint"></div>

    <div id="bqt-topbar">
      <button id="bqt-intro" data-pz-hit data-pz-dwell="1000" aria-label="BODY QUIZ 인트로로">
        ${icon('back')}<span>인트로</span>
      </button>
      <div id="bqt-title-wrap"><img id="bqt-title-img" src="${TITLE_IMG}" alt="${text.title}"></div>
      <div id="bqt-header-right">
        <div id="bqt-page"></div>
        <div id="bqt-sysbar">${headerSysBar}</div>
      </div>
    </div>

    <div id="bqt-stagewrap">
      <img class="bqt-char" id="bqt-boy" alt="" hidden>

      <div id="bqt-board">
        <div id="bqt-step-title-panel"><div id="bqt-step-title"></div></div>

        <div id="bqt-question-panel">
          <div id="bqt-question-body">
            <div id="bqt-question-tag">QUESTION</div>
            <div id="bqt-prompt">${question.prompt}</div>
          </div>
        </div>

        <div id="bqt-stage">
          <div class="bqt-answer" id="bqt-left">
            <div class="bqt-answer-arrow">${icon('down')}</div>
            <img src="${question.left.image}" alt="${question.left.label}">
            <div class="bqt-label">${question.left.label}</div>
            <div class="bqt-correct-badge">${text.correctBadge}</div>
          </div>

          <div id="bqt-center-media">
            <img id="bqt-center-img" alt="">
          </div>
          <div id="bqt-squat-cycle" hidden>
            <div id="bqt-squat-stage">
              <img id="bqt-squat-down" class="on" alt="">
              <img id="bqt-squat-up" alt="">
            </div>
          </div>

          <div class="bqt-answer" id="bqt-right">
            <div class="bqt-answer-arrow">${icon('down')}</div>
            <img src="${question.right.image}" alt="${question.right.label}">
            <div class="bqt-label">${question.right.label}</div>
            <div class="bqt-correct-badge">${text.correctBadge}</div>
          </div>
        </div>

        <div id="bqt-exercise">
          <div id="bqt-squat"></div>
          <div id="bqt-energy-bar"><i></i></div>
          <div id="bqt-energy-label"></div>
        </div>

        <div id="bqt-unlock-banner">
          <span id="bqt-unlock-arrow-left">${icon('left')}</span>
          <span id="bqt-unlock-text">${text.moveUnlockBanner}</span>
          <span id="bqt-unlock-arrow-right">${icon('right')}</span>
          <span class="bqt-spark" style="left:-10%; top:-30%;">✦</span>
          <span class="bqt-spark" style="right:-8%; top:10%; animation-delay:0.5s;">✦</span>
        </div>
      </div>

      <img class="bqt-char" id="bqt-girl" alt="" hidden>
    </div>

    <div id="bqt-footer">
      <div id="bqt-guidebar">
        <div id="bqt-guide-slot">${icon('star')}</div>
        <div id="bqt-guide"></div>
        <div id="bqt-guidebtns">
          <button id="bqt-skip" data-pz-hit data-pz-dwell="900">${icon('right')}<span class="bqt-skip-label">${text.skip}</span></button>
          <button id="bqt-prev" data-pz-hit data-pz-dwell="900">${icon('left')}<span>${text.prev}</span></button>
          <button id="bqt-next" data-pz-hit data-pz-dwell="1200"></button>
        </div>
      </div>
    </div>
  `

  mountEl.appendChild(root)

  const $ = sel => root.querySelector(sel)
  const els = {
    page: $('#bqt-page'),
    intro: $('#bqt-intro'),
    stepTitle: $('#bqt-step-title'),
    left: $('#bqt-left'),
    right: $('#bqt-right'),
    boy: $('#bqt-boy'),
    girl: $('#bqt-girl'),
    centerMedia: $('#bqt-center-media'),
    centerImg: $('#bqt-center-img'),
    squatCycle: $('#bqt-squat-cycle'),
    squatDown: $('#bqt-squat-down'),
    squatUp: $('#bqt-squat-up'),
    exercise: $('#bqt-exercise'),
    squat: $('#bqt-squat'),
    energyBar: $('#bqt-energy-bar').firstElementChild,
    energyLabel: $('#bqt-energy-label'),
    banner: $('#bqt-unlock-banner'),
    guide: $('#bqt-guide'),
    skip: $('#bqt-skip'),
    prev: $('#bqt-prev'),
    next: $('#bqt-next'),
  }
  const readinessGate = createBodyQuizLoadingGate(root, { label: '튜토리얼을 준비하고 있어요' })

  // 그림이 없으면 자리를 접는다 — 깨진 이미지 아이콘보다 빈 자리가 낫다.
  // asset이 바뀌어도 이 파일은 안 바뀐다.
  ;[els.boy, els.girl].forEach(img => {
    img.addEventListener('error', () => { img.hidden = true })
    img.addEventListener('load', () => { img.hidden = false })
  })

  const correctEl = () => (question.correctSide === 'left' ? els.left : els.right)

  const sysBarBinding = bindBodyQuizSystemBar(root, {
    onQuit: goIntro,
    onHome: goHome,
  })

  let index = 0
  let screenReady = false
  let transitioning = false
  let destroyed = false

  // ── 하단 대화 — 타이핑 효과 ─────────────────────────────────
  // 글자를 한 글자씩 캐럿 앞에 밀어 넣는다. 스텝을 넘기면 이전 타이핑을
  // 멈추고 새로 시작한다 — 안 그러면 두 스텝의 글자가 섞여 찍힌다.
  let guideTypeTimer = null
  function typeGuideText(fullText) {
    if (guideTypeTimer) { clearInterval(guideTypeTimer); guideTypeTimer = null }
    els.guide.innerHTML = '<span class="bqt-caret"></span>'
    const caretEl = els.guide.firstElementChild
    let i = 0
    guideTypeTimer = setInterval(() => {
      if (!root.isConnected) { clearInterval(guideTypeTimer); guideTypeTimer = null; return }
      i++
      caretEl.before(root.ownerDocument.createTextNode(fullText[i - 1]))
      if (i >= fullText.length) { clearInterval(guideTypeTimer); guideTypeTimer = null }
    }, 26)
  }

  // ── STEP2 — 스쿼트 down↔up 교차 페이드 ────────────────────────
  let squatCycleTimer = null
  function startSquatCycle() {
    stopSquatCycle()
    let showingDown = true
    squatCycleTimer = setInterval(() => {
      if (!root.isConnected) { clearInterval(squatCycleTimer); squatCycleTimer = null; return }
      showingDown = !showingDown
      els.squatDown.classList.toggle('on', showingDown)
      els.squatUp.classList.toggle('on', !showingDown)
    }, 900)
  }
  function stopSquatCycle() {
    if (squatCycleTimer) { clearInterval(squatCycleTimer); squatCycleTimer = null }
    els.squatDown.classList.add('on')
    els.squatUp.classList.remove('on')
  }

  // ── STEP2 — 스쿼트 카운트·에너지가 실제로 차오르는 듯한 연출 ────
  // 최종 값(step.squatProgress)은 그대로다. 0에서 그 값까지 세는 동안
  // "지금 진짜로 움직이고 있다"는 느낌만 더한다.
  let exerciseAnimTimer = null
  function animateExercise(count, pct) {
    if (exerciseAnimTimer) { clearInterval(exerciseAnimTimer); exerciseAnimTimer = null }
    els.energyBar.style.transition = 'none'
    els.energyBar.style.width = '0%'
    els.squat.textContent = `SQUAT 0/${target}`
    els.energyLabel.textContent = 'MOVE ENERGY 0%'
    // 다음 프레임에 transition을 되살려야 0% → 목표% 사이가 실제로 애니메이션된다
    requestAnimationFrame(() => {
      els.energyBar.style.transition = ''
      els.energyBar.style.width = `${pct}%`
    })
    let n = 0
    exerciseAnimTimer = setInterval(() => {
      if (!root.isConnected) { clearInterval(exerciseAnimTimer); exerciseAnimTimer = null; return }
      n++
      els.squat.textContent = `SQUAT ${n}/${target}`
      els.energyLabel.textContent = `MOVE ENERGY ${Math.round((n / target) * 100)}%`
      if (n >= count) { clearInterval(exerciseAnimTimer); exerciseAnimTimer = null }
    }, 220)
  }
  function setExerciseStatic(count, pct) {
    if (exerciseAnimTimer) { clearInterval(exerciseAnimTimer); exerciseAnimTimer = null }
    els.energyBar.style.transition = ''
    els.squat.textContent = `SQUAT ${count}/${target}`
    els.energyBar.style.width = `${pct}%`
    els.energyLabel.textContent = `MOVE ENERGY ${pct}%`
  }

  function render() {
    const step = TUTORIAL_STEPS[index]
    const stepText = text.steps[index]

    root.dataset.step = step.id
    els.page.innerHTML = `<b>${index + 1}</b> / ${TUTORIAL_STEPS.length}`
    els.stepTitle.innerHTML = stepText.title
    typeGuideText(stepText.guide)

    els.boy.src = step.boyImage
    els.girl.src = step.girlImage

    // 중앙 설명 그림 — STEP2만 down/up 두 장, 나머지는 한 장(또는 없음)
    if (step.squatImages) {
      els.centerMedia.hidden = true
      els.centerImg.classList.remove('bqt-move-nudge')
      els.squatCycle.hidden = false
      els.squatDown.src = step.squatImages.down
      els.squatUp.src = step.squatImages.up
      startSquatCycle()
    } else {
      stopSquatCycle()
      if (step.centerImage) {
        els.squatCycle.hidden = true
        els.centerMedia.hidden = false
        els.centerImg.src = step.centerImage
        // STEP4에서만 — 정답 쪽으로 살짝 다가가는 움직임
        if (step.isLast) {
          els.centerImg.style.setProperty('--bqt-nudge', question.correctSide === 'left' ? '-14px' : '14px')
          els.centerImg.classList.add('bqt-move-nudge')
        } else {
          els.centerImg.classList.remove('bqt-move-nudge')
        }
      } else {
        els.centerMedia.hidden = true
        els.squatCycle.hidden = true
      }
    }

    // 운동 패널
    if (step.showExercise === false) {
      els.exercise.hidden = true
      els.exercise.classList.remove('compact')
      if (exerciseAnimTimer) { clearInterval(exerciseAnimTimer); exerciseAnimTimer = null }
    } else {
      els.exercise.hidden = false
      els.exercise.classList.toggle('compact', step.showExercise === 'compact')
      const pct = Math.round((step.squatProgress / target) * 100)
      // 처음 스쿼트 미션을 만나는 스텝(showExercise === true)에서만 0→목표
      // 카운트업을 보여준다. 그 이후(축소 상태 등)는 이미 다 채워진 결과다.
      if (step.showExercise === true) animateExercise(step.squatProgress, pct)
      else setExerciseStatic(step.squatProgress, pct)
    }

    els.banner.classList.toggle('on', !!step.showMoveUnlockBanner)

    // 정답 강조 — 항상 question.correctSide를 따라간다(데이터 중복 없음)
    els.left.classList.remove('bqt-correct')
    els.right.classList.remove('bqt-correct')
    if (step.highlightCorrectSide) correctEl().classList.add('bqt-correct')

    els.prev.disabled = index === 0
    els.next.innerHTML = step.isLast ? `${text.start} ${icon('right')}` : `${text.next} ${icon('right')}`
  }

  function prefetchLikelyNext() {
    const nextIndex = index + 1
    if (nextIndex < TUTORIAL_STEPS.length) {
      assetReadiness.preload(getBodyQuizTutorialAssets(question, nextIndex))
    }
    // 튜토리얼을 보는 동안 실제 play 첫 문제도 decode해 마지막 전환을 숨긴다.
    assetReadiness.preload(playAssets)
  }

  function loadStep(nextIndex, { initial = false } = {}) {
    const assets = getBodyQuizTutorialAssets(question, nextIndex)
    if (!initial && assetReadiness.areReady(assets)) {
      index = nextIndex
      render()
      prefetchLikelyNext()
      return
    }

    transitioning = true
    screenReady = false
    const attempt = () => openBodyQuizReadinessGate({
      gate: readinessGate,
      readiness: assetReadiness,
      assets,
      transition: !initial,
      minMs: initial ? 500 : 400,
      message: initial ? '튜토리얼을 준비하고 있어요' : '다음 단계를 준비하고 있어요',
      isAlive: () => !destroyed,
      onReady() {
        index = nextIndex
        screenReady = true
        transitioning = false
        render()
        prefetchLikelyNext()
      },
      onRetry() {
        transitioning = true
        attempt()
      },
    }).then(result => {
      if (!result.ready) transitioning = false
      return result
    })
    return attempt()
  }

  function goNext() {
    if (!screenReady || transitioning) return
    const step = TUTORIAL_STEPS[index]
    if (step.isLast) { finish(); return }
    loadStep(Math.min(TUTORIAL_STEPS.length - 1, index + 1))
  }

  function goPrev() {
    if (!screenReady || transitioning || index === 0) return
    loadStep(index - 1)
  }

  // 스킵 = "이제 진짜 게임으로" — GAME START와 결과가 같다(ken 지시:
  // "스킵 시 즉시 실제 게임 시작"). 몇 번째 스텝에 있든 상관없다.
  let finished = false
  function finish() {
    if (!screenReady || finished || transitioning) return
    const complete = () => {
      if (finished || destroyed) return
      finished = true
      destroy()
      onFinish?.()
    }
    if (assetReadiness.areReady(playAssets)) {
      complete()
      return
    }
    transitioning = true
    screenReady = false
    const attempt = () => openBodyQuizReadinessGate({
      gate: readinessGate,
      readiness: assetReadiness,
      assets: playAssets,
      transition: true,
      minMs: 400,
      message: '게임을 준비하고 있어요',
      isAlive: () => !destroyed,
      onReady: complete,
      onRetry() {
        transitioning = true
        attempt()
      },
    }).then(result => {
      if (!result.ready) transitioning = false
      return result
    })
    return attempt()
  }

  els.next.addEventListener('click', goNext)
  els.prev.addEventListener('click', goPrev)
  els.skip.addEventListener('click', finish)
  els.intro.addEventListener('click', goIntro)

  const initialAssets = getBodyQuizTutorialAssets(question, 0)
  if (assetReadiness.areReady(initialAssets)) {
    screenReady = true
    readinessGate.reveal()
    render()
    prefetchLikelyNext()
  } else {
    loadStep(0, { initial: true })
  }

  function destroy() {
    if (destroyed) return
    destroyed = true
    sysBarBinding.destroy()
    readinessGate.destroy()
    if (guideTypeTimer) clearInterval(guideTypeTimer)
    if (squatCycleTimer) clearInterval(squatCycleTimer)
    if (exerciseAnimTimer) clearInterval(exerciseAnimTimer)
    els.next.removeEventListener('click', goNext)
    els.prev.removeEventListener('click', goPrev)
    els.skip.removeEventListener('click', finish)
    els.intro.removeEventListener('click', goIntro)
    root.remove()
  }

  return {
    destroy,
    getStepIndex: () => index,
  }
}

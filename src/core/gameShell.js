// 게임 화면의 **공용 뼈대** — 안내 · 카메라 · 결과 · 기록.
//
// ── 왜 생겼나 ────────────────────────────────────────────────
//
// 게임이 넷이 되면서 플레이 화면마다 같은 것이 네 벌 생겼다.
//   동작 안내 오버레이 · 카메라 붙이기와 PIP · 결과 화면 · 기록 남기기
//
// 불 끄기와 돌다리는 규칙만 다르고 **껍데기가 글자 하나까지 같았다.**
// 그대로 두면 결과 화면 문구 하나를 고치는 데 네 파일을 고쳐야 하고,
// 한 군데를 빠뜨리면 게임마다 다른 화면이 된다 — 아이는 매번 새로 배운다.
//
// ── 무엇을 여기 두고 무엇을 게임팩에 두나 ────────────────────
//
//   여기(core)   모든 게임이 똑같이 해야 하는 것 — 안내·카메라·결과·기록
//   게임팩       그 게임만의 것 — 규칙(game.js)과 그리기(play.js의 paint)
//
// 규칙을 여기로 끌어오지 않는다. 게임마다 다른 것을 공용으로 만들면
// 옵션이 계속 늘어나 결국 아무도 못 읽는 함수가 된다.

import { UI } from './uiAssets.js'
import { recordSession } from '../progress/state.js'
import { mountReward, hasReward } from '../progress/rewardView.js'
import { getExercise } from '../progress/exercises.js'
import { getManifest } from '../games/registry.js'
import { poseEngineCore } from './pose/poseEngine.js'
import { createPipOverlay } from './pose/pipOverlay.js'
import { sendResult } from './resultQueue.js'
import { getCurrentPlayerName } from './player.js'
import { burstConfetti } from './confetti.js'

let styleEl = null

function ensureStyle() {
  if (styleEl?.isConnected) return
  styleEl = document.createElement('style')
  styleEl.id = 'pz-game-shell-style'
  styleEl.textContent = `
    /* 게임마다 색은 달라도 **모양과 자리는 같다.** 아이가 매번 새로 배우지 않게. */
    .pz-veil {
      position: absolute; inset: 0; display: flex;
      flex-direction: column; align-items: center; justify-content: center;
      gap: clamp(8px, 1.6vh, 16px); padding: clamp(14px, 3vh, 30px); text-align: center;
      background: rgba(8,6,20,0.94); color: #fff;
      font-family: var(--font-main, 'Jua', sans-serif);
    }
    .pz-veil.off { display: none; }
    .pz-veil h2 { margin: 0; font-size: clamp(1.4rem, 4.2vw, 2.4rem); font-weight: 900; }
    .pz-veil .pz-how { font-size: clamp(1rem, 2.2vw, 1.35rem); font-weight: 800; color: #ffd23e; }
    .pz-veil .pz-why { font-size: clamp(0.85rem, 1.7vw, 1.05rem); font-weight: 800; color: #a78bda; }
    .pz-veil .pz-count { font-size: 0.85rem; font-weight: 800; color: #6b5c96; }
    .pz-guide { z-index: 30; }
    .pz-over  { z-index: 40; }

    .pz-gbtn {
      min-height: 60px; padding: 0 clamp(20px, 3.2vw, 36px); border-radius: 9999px;
      border: none; font: inherit; font-size: clamp(0.95rem, 1.8vw, 1.2rem); font-weight: 900;
      background: #ffd23e; color: #4a2a00; cursor: pointer;
      box-shadow: 0 5px 0 #c89800, 0 10px 26px rgba(0,0,0,0.4);
      -webkit-tap-highlight-color: transparent; transition: transform 0.12s;
    }
    .pz-gbtn:active { transform: translateY(3px); }

    /* 시작 버튼만 그림이다 — 모든 게임에서 같은 그림을 쓴다(src/core/uiAssets.js).
       글자를 못 읽는 아이가 화면마다 다른 버튼을 다시 배우지 않아도 되게. */
    .pz-gbtn.pz-start {
      background: none; box-shadow: none; padding: 0; min-height: 0; border: none;
      filter: drop-shadow(0 8px 20px rgba(0,0,0,0.45));
    }
    .pz-gbtn.pz-start img { display: block; width: clamp(180px, 26vw, 300px); height: auto; }
    .pz-gbtn.alt {
      background: rgba(255,255,255,0.14); color: #fff; box-shadow: none;
      border: 2px solid rgba(255,255,255,0.28);
    }
    .pz-actions { display: flex; gap: 12px; margin-top: 6px; }
    .pz-reward { width: min(520px, 100%); }
    .pz-line { font-size: clamp(0.9rem, 1.9vw, 1.15rem); font-weight: 800; color: #ffd23e; }

    /* 카메라 미리보기 — 내 몸이 잡히고 있다는 걸 보여준다 */
    .pz-pip {
      position: absolute; right: clamp(10px, 2vw, 20px); bottom: clamp(10px, 2vh, 20px);
      width: clamp(120px, 16vw, 200px); aspect-ratio: 16/9; z-index: 4;
      border-radius: 12px; overflow: hidden; border: 2px solid rgba(255,255,255,0.2); background: #000;
    }
    .pz-pip video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
    .pz-pip canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    .pz-pip.off { display: none; }

    /* ── 엔딩 ★ ─────────────────────────────────────────────
       판을 **끝까지 깬 아이만** 보는 화면이다. 결과(점수·배지)보다 먼저 오고,
       읽을 것이 없다 — 잠깐 크게 축하하고 넘어간다.

       모든 게임이 같은 자리에서 같은 모양으로 끝나는 것이 브랜드다
       (CLAUDE.md: 공통 UI는 한 벌이다). 그림만 게임이 갖는다. */
    .pz-ending {
      z-index: 45; padding: 0; gap: 0; background: #0a0418;
      background-size: cover; background-position: center;
      cursor: pointer; overflow: hidden;
    }
    /* 화면비가 그림과 달라도 **안 늘인다**(cover). 늘이면 아이 얼굴이 눌린다. */
    .pz-ending .pz-ending-art {
      position: relative; z-index: 3;
      width: min(62vw, 92vh); height: auto;
      filter: drop-shadow(0 12px 34px rgba(0,0,0,.55));
      animation: pz-ending-pop 700ms cubic-bezier(.2,1.5,.4,1) both;
    }
    @keyframes pz-ending-pop {
      0%   { opacity: 0; transform: scale(.55) rotate(-6deg); }
      70%  { opacity: 1; transform: scale(1.06) rotate(1.5deg); }
      100% { opacity: 1; transform: scale(1) rotate(0); }
    }

    /* ── 아이 둘 ★ ──────────────────────────────────────────
       화면 **아래에서 걸어 들어오듯** 올라온다. 가운데에 놓으면 배너를 가리고,
       위에서 떨어뜨리면 넘어진 것처럼 보인다.

       배너보다 **뒤에**(z-index 3 대 2) 둔다 — 읽을 것이 먼저다. */
    .pz-ending .pz-ending-kid {
      /* 발이 화면 아래에 **닿아** 있어야 길 위에 선 것으로 보인다.
         -2%로 눌러 뒀더니 신발이 잘려서 떠 있는 스티커가 됐다. */
      position: absolute; bottom: 0; z-index: 2;
      height: min(58vh, 44vw); width: auto;
      filter: drop-shadow(0 10px 22px rgba(0,0,0,.45));
      animation: pz-ending-in 620ms cubic-bezier(.2,1.3,.4,1) both;
    }
    .pz-ending .pz-ending-kid.left  { left: 2%;  animation-delay: 320ms; }
    .pz-ending .pz-ending-kid.right { right: 2%; animation-delay: 460ms; }
    /* 다 올라온 뒤에는 **가만히 안 둔다.** 멈춘 그림은 스티커로 보인다 —
       아주 작게 들썩이면 "만세하고 있는 중"으로 읽힌다. */
    .pz-ending .pz-ending-kid.left  { transform-origin: bottom center; }
    @keyframes pz-ending-in {
      0%   { opacity: 0; transform: translateY(38%) scale(.9); }
      70%  { opacity: 1; transform: translateY(-4%) scale(1.02); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    .pz-ending .pz-ending-kid::after { content: ''; }
    /* 등장이 끝나면 들썩임으로 넘어간다 — 두 애니메이션을 이어 붙인다 */
    .pz-ending .pz-ending-kid {
      animation-name: pz-ending-in, pz-ending-bob;
      animation-duration: 620ms, 1500ms;
      animation-timing-function: cubic-bezier(.2,1.3,.4,1), ease-in-out;
      animation-iteration-count: 1, infinite;
      animation-fill-mode: both, none;
    }
    .pz-ending .pz-ending-kid.left  { animation-delay: 320ms, 940ms; }
    .pz-ending .pz-ending-kid.right { animation-delay: 460ms, 1160ms; }
    @keyframes pz-ending-bob {
      0%, 100% { transform: translateY(0) rotate(0); }
      50%      { transform: translateY(-2.5%) rotate(1deg); }
    }

    /* 문을 통과하는 순간의 흰 섬광. 장면이 **끊기지 않고 넘어가게** 덮는다. */
    .pz-ending::before {
      content: ''; position: absolute; inset: 0; background: #fff; z-index: 4;
      animation: pz-ending-flash 900ms ease-out both; pointer-events: none;
    }
    @keyframes pz-ending-flash { 0% { opacity: 1 } 100% { opacity: 0 } }
    @media (prefers-reduced-motion: reduce) {
      .pz-ending .pz-ending-art, .pz-ending .pz-ending-kid, .pz-ending::before {
        animation-duration: 1ms, 1ms;
      }
    }
  `
  document.head.appendChild(styleEl)
}

/**
 * 동작 안내 — **게임에 들어가자마자 무엇을 해야 하는지 보여준다.**
 *
 * 이게 없어서 "무슨 운동이냐"는 말을 들었다. 응원 문구는 이미 하는 중인 사람에게나 읽힌다.
 * 글자를 못 읽는 아이가 버튼을 못 찾고 멈춰 있지 않게 **자동으로도 시작한다.**
 *
 * @returns {{ el:HTMLElement, done:Promise<void>, close:Function }}
 */
export function mountGuide(host, { title, demo = '', how = '', why = '', autoSec = 8 } = {}) {
  ensureStyle()
  const el = document.createElement('div')
  el.className = 'pz-veil pz-guide'
  el.innerHTML = `
    <h2>${title}</h2>
    <div class="pz-demo">${demo}</div>
    <div class="pz-how">${how}</div>
    <div class="pz-why">${why}</div>
    <button class="pz-gbtn pz-start" type="button" aria-label="시작하기">
      <img src="${UI.startButton}" alt="시작하기">
    </button>
    <div class="pz-count"></div>
  `
  host.appendChild(el)

  const countEl = el.querySelector('.pz-count')
  let left = autoSec
  let timer = null
  let closed = false

  const done = new Promise(resolve => {
    const close = () => {
      if (closed) return
      closed = true
      clearInterval(timer)
      el.classList.add('off')
      resolve()
    }
    el.querySelector('.pz-gbtn').addEventListener('click', close)
    countEl.textContent = `${left}초 뒤에 시작해요`
    timer = setInterval(() => {
      left--
      countEl.textContent = left > 0 ? `${left}초 뒤에 시작해요` : ''
      if (left <= 0) close()
    }, 1000)
    el._close = close
  })

  return { el, done, close: () => el._close?.() }
}

/**
 * 결과 화면 — 모든 게임이 같은 자리에서 같은 모양으로 끝난다.
 *
 * 보상(배지·레벨)은 **점수보다 위에** 온다. 방금 몸을 움직인 직후라 감정이 열려 있다.
 */
export function showGameOver(host, { title, line = '', reward = null, onAgain, onQuit } = {}) {
  ensureStyle()
  host.querySelector('.pz-over')?.remove()

  const el = document.createElement('div')
  el.className = 'pz-veil pz-over'
  el.innerHTML = `
    <h2>${title}</h2>
    <div class="pz-reward"></div>
    <div class="pz-line">${line}</div>
    <div class="pz-actions">
      <button class="pz-gbtn" type="button" data-act="again">다시 하기</button>
      <!-- 나가는 버튼의 이름은 **가는 곳**이다. "그만하기"는 무엇이 그만되는지
           (이 판인지 놀이 전체인지) 아이도 부모도 모른다 — 눌러서 도착하는
           곳이 플레이 제라 홈이므로 이름도 그렇게 둔다. 게임마다 다른 말을
           쓰면 아이가 게임을 옮길 때마다 나가는 법을 다시 배운다. -->
      <button class="pz-gbtn alt" type="button" data-act="quit">Home으로</button>
    </div>
  `
  host.appendChild(el)

  const rewardHost = el.querySelector('.pz-reward')
  if (hasReward(reward)) mountReward(rewardHost, reward)
  else rewardHost.remove()

  el.querySelector('[data-act="again"]').addEventListener('click', () => onAgain?.())
  el.querySelector('[data-act="quit"]').addEventListener('click', () => onQuit?.())
  return el
}

/**
 * 엔딩 — **끝까지 깬 아이만 보는 화면.** ★
 *
 * ── 왜 결과 화면과 따로인가 ─────────────────────────────────
 *
 * 결과 화면은 점수·배지·버튼이 있는 **읽는 화면**이다. 거기에 축하까지 얹으면
 * 둘 다 반쯤 된다 — 그림은 UI에 가리고, 버튼은 그림에 묻힌다.
 *
 * 끝냈다는 감정이 제일 큰 순간은 문을 지난 **직후**다. 그때는 아무것도 안
 * 읽히고 그림만 보인다. 읽을 것은 그다음에 온다.
 *
 * ── 저절로 넘어간다 ─────────────────────────────────────────
 *
 * 글자를 못 읽는 아이가 버튼을 못 찾아 멈춰 있으면 안 된다. 아무 데나 눌러도
 * 넘어가고, 안 눌러도 넘어간다(`sec`).
 *
 * @param {HTMLElement} host
 * @param {object} o
 * @param {string} [o.bg]  화면을 덮을 그림 — **게임팩이 갖는다**(테마 그림이다)
 * @param {string} [o.art] 가운데 얹을 글자 그림. 기본은 러너 공용 MISSION COMPLETE
 * @param {string[]} [o.cast] 좌우에 세울 아이들. 최대 둘이다 —
 *   셋이면 배너를 가리고, 하나면 화면 한쪽이 빈다
 * @param {boolean} [o.confetti] 꽃가루를 터뜨리나
 * @param {number} [o.sec] 저절로 넘어가기까지
 * @returns {{ el: HTMLElement, done: Promise<void> }}
 */
export function showEnding(host, { bg = null, art = null, cast = [], confetti = true, sec = 5 } = {}) {
  ensureStyle()
  host.querySelector('.pz-ending')?.remove()

  const el = document.createElement('div')
  el.className = 'pz-veil pz-ending'
  if (bg) el.style.backgroundImage = `url("${bg}")`
  const sides = ['left', 'right']
  el.innerHTML = cast.slice(0, 2)
    .map((src, i) => `<img class="pz-ending-kid ${sides[i]}" src="${src}" alt="">`).join('')
    + (art ? `<img class="pz-ending-art" src="${art}" alt="완료">` : '')
  host.appendChild(el)

  // ── 꽃가루는 **섬광이 걷힌 뒤**에 터진다 ★ ──
  // 같이 터뜨리면 흰 화면에 묻혀 아무것도 안 보인다. 0.5초 기다렸다가
  // 배너가 튀어나오는 박자에 맞춰 쏜다.
  let stopConfetti = () => {}
  const boom = confetti
    ? setTimeout(() => { stopConfetti = burstConfetti(el, { seconds: sec - 0.6 }) }, 500)
    : null

  const done = new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (boom) clearTimeout(boom)
      stopConfetti()
      el.remove()
      resolve()
    }
    // 첫 순간의 클릭은 안 받는다 — 문을 지나며 누르고 있던 손가락이
    // 엔딩을 스치고 지나간다(실제로 결과 화면이 바로 떴다).
    setTimeout(() => el.addEventListener('click', finish), 600)
    const timer = setTimeout(finish, sec * 1000)
    el._close = finish
  })
  return { el, done, close: () => el._close?.() }
}

/**
 * 카메라 + PIP + 랜드마크 구독을 한 번에.
 *
 * 참조 카운팅(acquire/release)을 게임팩마다 손으로 맞추면 반드시 한 곳이 샌다.
 * 카메라가 안 열려도 **조용히 멈추지 않는다** — PIP만 숨기고 게임은 계속된다.
 *
 * @returns {{ ok:boolean, release:Function }}
 */
export async function mountCamera(host, { onFrame, zones = false, enabled = true } = {}) {
  ensureStyle()
  const pip = document.createElement('div')
  pip.className = 'pz-pip' + (enabled ? '' : ' off')
  pip.innerHTML = `<video muted playsinline></video><canvas></canvas>`
  host.appendChild(pip)

  if (!enabled) return { ok: false, release() { pip.remove() } }

  const overlay = createPipOverlay(pip.querySelector('canvas'), { zones })
  let acquired = false, unsub = null, detach = null

  try {
    await poseEngineCore.acquire()
    acquired = true
    detach = poseEngineCore.attach(pip.querySelector('video'))
    unsub = poseEngineCore.onLandmarks(lms => {
      overlay.draw(lms)
      onFrame?.(lms, performance.now() / 1000)
    })
  } catch (e) {
    console.info('[gameShell] 카메라를 못 열었다:', e?.name ?? e)
    pip.classList.add('off')
  }

  return {
    ok: acquired,
    release() {
      unsub?.()
      detach?.()
      overlay.destroy?.()
      if (acquired) { acquired = false; poseEngineCore.release() }
      pip.remove()
    },
  }
}

/**
 * 기록기 — 게임이 넘긴 결과에서 **운동 지표만 골라** 한 번만 남긴다.
 *
 * 무엇을 남길지는 **manifest의 `metrics`가 선언한다.** 게임팩이 제멋대로 키를 넣으면
 * 운동 사전에 없는 지표가 쌓이고, 그건 EXP에도 화면에도 안 잡히는 유령 데이터가 된다.
 *
 * ── 두 군데에 남긴다 ────────────────────────────────────────
 *
 *   기기(progress/state.js)   레벨·배지·마이페이지가 읽는다. **몸으로 한 것만**
 *   서버(resultQueue)         운동 통계의 원천. 키보드 판도 보낸다
 *
 * 키보드로 논 것에 EXP를 주지 않는 이유는 그대로다 — 두드린 건 운동이 아니다.
 * 다만 **서버에는 보낸다.** `input_mode`로 갈라 두면 "몇 번 열어봤나"와
 * "몇 번 움직였나"를 나눠 볼 수 있고, `exercise_summary` 뷰가 motion만 걸러 준다.
 * 안 보내면 그 판은 세상에 없던 일이 된다.
 *
 * ── 자동재생도 `motion=false`다 ★ ────────────────────────────
 *
 * `runner/game/autopilot.js`가 대신 진행한 판은 몸을 하나도 안 움직였으니
 * 키보드 판과 똑같이 **기기에는 안 남긴다**(EXP·배지 없음). 다만 "몇 번
 * 그냥 재생만 했나"를 키보드 판과 섞어 보면 안 되므로, `inputMode`를
 * 따로 넘기면 서버 기록의 `input_mode`만 `'auto'`로 갈린다 — 로컬 저장
 * 여부를 가르는 건 여전히 `motion` 하나뿐이다.
 *
 * @param {object} opts
 * @param {string} opts.gameId
 * @param {boolean} opts.motion  몸으로 했나 — 이것만 기기 저장(EXP·배지)을 가른다
 * @param {string} [opts.inputMode]  서버에 남길 `input_mode`. 안 주면
 *   `motion ? 'motion' : 'keyboard'`로 정한다 — 자동재생처럼 `motion=false`인데
 *   "키보드로 했다"고 적으면 안 되는 경우에만 명시해서 넘긴다.
 * @returns {(snapshot:object) => object|null}  recordSession의 결과(보상) 또는 null
 */
export function makeRecorder({ gameId, motion, inputMode, minActiveSec = 5 }) {
  const keys = (getManifest(gameId)?.metrics ?? []).filter(k => {
    if (getExercise(k)) return true
    console.warn(`[gameShell] ${gameId}의 metrics에 운동 사전에 없는 키: ${k}`)
    return false
  })
  let done = false
  // 한 판의 이름. 중간에 나갔다 들어와도 같은 판이 두 건으로 늘지 않게 한다.
  const runId = `${gameId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return function record(snapshot) {
    if (done || !snapshot) return null
    done = true

    const exercise = {}
    for (const k of keys) if (typeof snapshot[k] === 'number' && snapshot[k] > 0) exercise[k] = snapshot[k]

    // 들어왔다 그냥 나간 것까지 기록하면 "논 날"이 부풀려진다
    const worth = (exercise.active_sec ?? 0) >= minActiveSec ||
                  Object.entries(exercise).some(([k, v]) => k !== 'active_sec' && v > 0)
    if (!worth) return null

    // ── 서버 (기다리지 않는다 — 결과 화면이 저장을 기다릴 이유가 없다) ──
    sendResult({
      gameId,
      playerName: getCurrentPlayerName(),
      score: snapshot.score ?? 0,
      roundsCleared: snapshot.cleared ?? 0,
      extraData: {
        source: gameId,
        // 'motion'만 운동 데이터로 신뢰한다. exercise_summary 뷰가 이 값으로 거른다.
        input_mode: inputMode ?? (motion ? 'motion' : 'keyboard'),
        active_sec: exercise.active_sec ?? 0,
        completed: snapshot.cleared != null && snapshot.cleared === (snapshot.rounds ?? snapshot.stones),
        // ⚠️ `exercise` 키가 없으면 뷰의 `WHERE extra_data ? 'exercise'`에 걸려
        //    **운동 통계에서 통째로 빠진다.** 똥 피하기가 실제로 그래서 한 건도 안 잡혔다.
        exercise,
        run_id: runId,
      },
    })

    // ── 기기 (레벨·배지) — 몸으로 한 것만 ──
    if (!motion) return null
    return recordSession({ gameId, exercise })
  }
}

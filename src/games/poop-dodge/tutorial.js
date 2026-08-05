// 똥 피하기 튜토리얼 — "몸을 옆으로 옮기면 피한다" 하나만 가르친다.
//
// 대상이 4~8세다. **글로 설명하지 않는다.** 검정 실루엣이 실제로 옆으로 비키고
// 똥이 방금 서 있던 자리에 떨어지는 걸 반복해서 보여준다. 아이는 읽지 못해도
// 두 바퀴만 보면 안다.
//
// 넘기는 방법은 머리 위 O — 웜업과 같고, 게임 안에서 쓸 몸동작이다.
// 다만 **손 컨트롤이 꺼져 있으면 O를 만들 방법 자체가 없다.** 그래서 버튼도 같이
// 둔다. 제스처만 두면 카메라를 못 켠 아이는 여기서 갇힌다.

import { navigate, onLeave } from '../../core/router.js'
import * as sound from '../../core/sound.js'
import { handSession } from '../../core/handSession.js'
import { bindHandButton } from '../../core/handControl.js'
import { poseEngineCore } from '../../core/pose/poseEngine.js'
import { isArmsUpCircle, isArmsUpCross, GestureHold } from '../../core/pose/gesture.js'
import { GESTURE } from '../../core/pose/tuning.js'
import { markTutorialSeen } from '../../core/tutorialSeen.js'
import { getPlayRoute } from '../registry.js'

const GAME_ID = 'poop-dodge'

const IMG = {
  bg:       '/assets/image/poop_game_bg.jpg',
  poop:     '/assets/image/poop01_default.png',
  charIdle: '/assets/characters/tutorial/char_tutorial_idle.png',
  charMove: '/assets/characters/tutorial/char_tutorial_move.png',
}

// 데모 한 바퀴의 타이밍(ms).
//
// **지켜야 할 것은 "비키기 시작하는 시점"이 아니라 "다 비킨 시점"이다.**
// MOVE_AT + MOVE_MS 가 FALL_MS 보다 충분히 앞서야 아이 눈에 "먼저 비켰고,
// 그다음에 떨어졌다"로 읽힌다. 둘이 거의 같으면 아슬아슬하게 맞은 것처럼 보인다.
//
//   비키기 시작 1250 → 다 비킴 1750 → 착지 2200   (여유 450ms)
//
// **전체 속도는 아이 기준으로 잡는다.** 처음 잡은 값(한 바퀴 2.6초)은 어른이
// 보기엔 알맞지만 4~8세에게는 무슨 일이 일어났는지 알아채기 전에 지나간다.
// 한 바퀴 3.8초로 늘렸다 — 똥이 떨어지는 걸 보고, 비키는 걸 보고, 결과를 볼 시간.
//
// 이 관계는 test/poopDodgeTutorial.test.js가 지킨다.
export const TUTORIAL_TIMING = {
  CYCLE_MS: 3800,
  FALL_MS:  2200,
  MOVE_AT:  1250,
  MOVE_MS:   500,
  // 다 비킨 뒤 착지까지 최소한 이만큼은 비어 있어야 한다
  MIN_ESCAPE_MARGIN_MS: 180,
}
const { CYCLE_MS, FALL_MS, MOVE_AT, MOVE_MS } = TUTORIAL_TIMING

// 실루엣이 도는 칸 순서. 가운데를 거쳐 좌우로 번갈아 간다 —
// 한 방향으로만 가면 "오른쪽으로 가는 게임"으로 오해한다.
export const LANES = [1, 2, 1, 0]

export default function tutorialPage(app) {
  app.innerHTML = `
    <style>
      #tut-root, #tut-root * { box-sizing: border-box; }
      #tut-root {
        position: fixed; inset: 0; overflow: hidden;
        display: flex; flex-direction: column; align-items: center;
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
        background: #0a0616 url('${IMG.bg}') center/cover no-repeat;
        touch-action: none; user-select: none;
      }
      /* 어둡게 깔아야 검정 실루엣이 읽힌다. 배경을 완전히 가리지는 않는다 —
         "이 게임 안"이라는 감각은 남겨둔다. */
      #tut-scrim { position: absolute; inset: 0; background: rgba(8,4,18,0.82); }

      #tut-head {
        position: relative; z-index: 2; text-align: center;
        padding: clamp(14px, 3vh, 30px) 16px clamp(4px, 1vh, 10px);
      }
      #tut-title {
        font-size: clamp(1.6rem, 5vw, 3rem); font-weight: 900; letter-spacing: 0.12em;
        text-shadow: 0 4px 18px rgba(0,0,0,0.6);
      }
      #tut-sub {
        margin-top: clamp(4px, 1vh, 10px);
        font-size: clamp(1rem, 2.6vw, 1.6rem); font-weight: 800; color: #ffd23e;
      }

      /* ── 데모 무대 ──
         바닥선·캐릭터·화살표가 전부 이 두 값에 맞물려 있다. 하나만 고치면
         화살표가 머리를 뚫거나 캐릭터가 바닥에서 뜬다. */
      #tut-stage {
        position: relative; z-index: 2; flex: 1; width: 100%; min-height: 0;
        --tut-floor: 7%;                       /* 바닥선 높이 */
        /* 실루엣 PNG는 여백이 넉넉해서 박스 크기보다 작게 보인다 — 넉넉히 잡는다 */
        --tut-char-h: clamp(130px, 19vw, 250px); /* 캐릭터 높이 */
      }
      .tut-lane {
        position: absolute; top: 0; bottom: 0; width: 33.3333%;
        border-left: 2px dashed rgba(255,255,255,0.16);
      }
      .tut-lane:first-child { border-left: none; }
      #tut-floor {
        position: absolute; left: 0; right: 0; bottom: var(--tut-floor);
        border-top: 3px solid rgba(255,255,255,0.35);
      }
      #tut-poop {
        position: absolute; width: clamp(48px, 8vw, 96px); aspect-ratio: 1;
        left: 0; top: 0; transform: translate(-50%, -50%);
        background: url('${IMG.poop}') center/contain no-repeat;
      }
      #tut-char {
        position: absolute; bottom: var(--tut-floor); left: 0;
        height: var(--tut-char-h); width: calc(var(--tut-char-h) * 1070 / 1450);
        transform: translateX(-50%);
        background: url('${IMG.charIdle}') center bottom/contain no-repeat;
      }
      #tut-char.moving { background-image: url('${IMG.charMove}'); }
      /* 실루엣 원본은 **왼쪽을 보고 있다.** 오른쪽으로 갈 때만 뒤집는다. */
      #tut-char.to-right { transform: translateX(-50%) scaleX(-1); }

      /* 비킬 방향 화살표 — **캐릭터 머리 위**에 붙어 같이 움직인다.
         두 칸 사이 허공에 두면 누구한테 하는 말인지가 안 읽힌다. */
      #tut-arrow {
        position: absolute; left: 0;
        bottom: calc(var(--tut-floor) + var(--tut-char-h) + 10px);
        transform: translateX(-50%);
        font-size: clamp(3rem, 7vw, 6rem); font-weight: 900; line-height: 1;
        color: #ffd23e;
        text-shadow: 0 0 24px rgba(255,210,62,0.9), 0 4px 12px rgba(0,0,0,0.5);
        opacity: 0; transition: opacity 0.18s;
      }
      #tut-arrow.on { opacity: 1; animation: tutArrow 0.7s ease-in-out infinite; }
      @keyframes tutArrow {
        0%,100% { transform: translateX(-50%) scale(1); }
        50%     { transform: translateX(-50%) scale(1.18); }
      }

      /* 착지 자국 — "여기 떨어졌다"를 남긴다 */
      #tut-splat {
        position: absolute; bottom: var(--tut-floor); left: 0; transform: translateX(-50%);
        width: clamp(56px, 9vw, 110px); height: clamp(14px, 2vw, 26px);
        border-radius: 50%; background: rgba(140,80,40,0.55);
        opacity: 0; transition: opacity 0.25s;
      }
      #tut-splat.on { opacity: 1; }

      /* ── 아래 조작부 ── */
      #tut-foot {
        position: relative; z-index: 2;
        display: flex; flex-direction: column; align-items: center;
        gap: clamp(6px, 1.4vh, 14px);
        padding: 0 16px clamp(14px, 3vh, 30px);
        padding-bottom: max(clamp(14px, 3vh, 30px), env(safe-area-inset-bottom));
      }
      /* 이 화면에서 아이가 읽어야 할 단 한 줄이다. 작으면 못 읽는다. */
      #tut-hint {
        font-size: clamp(1.15rem, 2.8vw, 1.9rem); font-weight: 900; color: #ffe27a;
        text-align: center; text-shadow: 0 2px 10px rgba(0,0,0,0.6);
      }
      #tut-hint b { color: #fff; font-size: 1.3em; }
      #tut-hint.off { opacity: 0.5; }
      #tut-gauge-wrap {
        width: clamp(160px, 26vw, 260px); height: 9px; border-radius: 999px;
        background: rgba(255,255,255,0.18); overflow: hidden;
      }
      #tut-gauge { height: 100%; width: 0; background: #ffd23e; border-radius: 999px; }

      #tut-btns { display: flex; align-items: center; gap: clamp(10px, 1.6vw, 18px); }
      .tut-btn {
        min-height: 60px; padding: 0 clamp(20px, 3vw, 34px);
        border-radius: 9999px; border: none; font: inherit;
        font-size: clamp(0.95rem, 1.8vw, 1.2rem); font-weight: 900;
        cursor: pointer; -webkit-tap-highlight-color: transparent;
        transition: transform 0.12s;
      }
      .tut-btn:active { transform: scale(0.95); }
      #tut-start {
        background: #ffd23e; color: #4a2a00;
        box-shadow: 0 5px 0 #c89800, 0 10px 26px rgba(0,0,0,0.4);
      }
      #tut-back, #tut-hand {
        background: rgba(255,255,255,0.14); color: #fff;
        border: 2px solid rgba(255,255,255,0.28);
      }
      #tut-hand[aria-pressed="true"] { background: #ffd23e; color: #4a2a00; border-color: transparent; }

      #tut-toast {
        position: fixed; left: 50%; top: 14px; transform: translateX(-50%);
        z-index: 120; max-width: min(90vw, 460px); text-align: center;
        padding: 10px 20px; border-radius: 9999px;
        background: rgba(10,6,22,0.9); color: #fff; font-weight: 700;
        font-size: clamp(0.82rem, 1.5vw, 0.98rem);
        opacity: 0; pointer-events: none; transition: opacity 0.2s;
      }
      #tut-toast.on { opacity: 1; }

      /* 가로로 누운 폰 — 세로가 짧으면 무대부터 줄인다 */
      @media (max-height: 560px) {
        #tut-head { padding-top: 8px; }
        #tut-sub  { margin-top: 2px; }
        .tut-btn  { min-height: 52px; }
      }
    </style>

    <div id="tut-root">
      <div id="tut-scrim"></div>

      <div id="tut-head">
        <div id="tut-title">TUTORIAL</div>
        <div id="tut-sub">← 옆으로 몸을 옮겨요 →</div>
      </div>

      <div id="tut-stage">
        <div class="tut-lane" style="left:0"></div>
        <div class="tut-lane" style="left:33.3333%"></div>
        <div class="tut-lane" style="left:66.6666%"></div>
        <div id="tut-floor"></div>
        <div id="tut-splat"></div>
        <div id="tut-poop"></div>
        <div id="tut-char"></div>
        <div id="tut-arrow">→</div>
      </div>

      <div id="tut-foot">
        <div id="tut-hint">🙆 머리 위로 <b>O</b>를 만들면 시작!</div>
        <div id="tut-gauge-wrap"><div id="tut-gauge"></div></div>
        <div id="tut-btns">
          <button class="tut-btn" id="tut-back" data-pz-hit data-pz-dwell="800">← 뒤로</button>
          <button class="tut-btn" id="tut-hand" data-pz-hit data-pz-dwell="800">✋ <span id="tut-hand-label">손으로 하기</span></button>
          <button class="tut-btn" id="tut-start" data-pz-hit data-pz-dwell="1200">▶ 바로 시작</button>
        </div>
      </div>

      <div id="tut-toast"></div>
    </div>
  `

  const $ = sel => app.querySelector(sel)
  const charEl  = $('#tut-char')
  const poopEl  = $('#tut-poop')
  const arrowEl = $('#tut-arrow')
  const splatEl = $('#tut-splat')
  const stageEl = $('#tut-stage')
  const hintEl  = $('#tut-hint')
  const gaugeEl = $('#tut-gauge')

  handSession.setPointerActive(true)

  // ── 토스트 · 손 버튼 ──────────────────────────────────────
  const toastEl = $('#tut-toast')
  let toastTimer = null
  const toast = msg => {
    toastEl.textContent = msg
    toastEl.classList.add('on')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2600)
  }
  const unbindHand = bindHandButton({
    el: $('#tut-hand'),
    labelEl: $('#tut-hand-label'),
    onToast: toast,
  })

  // ── 진행 ──────────────────────────────────────────────────
  let done = false
  const goGame = () => {
    if (done) return
    done = true
    markTutorialSeen(GAME_ID)   // 봤으면 다음부터는 안 뜬다
    sound.activate()
    navigate(getPlayRoute(GAME_ID))
  }
  // **허브가 아니라 인트로로 돌아간다.**
  // 튜토리얼에 오는 길은 둘뿐이고(첫 플레이 · 인트로의 '어떻게 해?') 둘 다 인트로에서
  // 온다. 여기서 허브로 튕기면 "잘못 눌렀네, 다시" 할 때 게임 목록부터 다시 찾아야 한다.
  const goBack = () => {
    if (done) return
    done = true
    navigate(`/intro?id=${GAME_ID}`)
  }

  $('#tut-start').addEventListener('click', goGame)
  $('#tut-back').addEventListener('click', goBack)

  // ── 데모 애니메이션 ────────────────────────────────────────
  //
  // rAF로 직접 그린다. CSS 키프레임으로 하면 "비키는 시점이 착지보다 앞선다"는
  // 규칙이 키프레임 퍼센트 안에 숨어버려서, 타이밍을 고칠 때마다 다시 계산해야 한다.
  const laneCenter = i => stageEl.clientWidth * (i / 3 + 1 / 6)

  let raf = null
  let t0 = performance.now()

  const frame = now => {
    raf = requestAnimationFrame(frame)

    const elapsed = now - t0
    const cycle   = Math.floor(elapsed / CYCLE_MS)
    const t       = elapsed % CYCLE_MS

    const from = LANES[cycle % LANES.length]
    const to   = LANES[(cycle + 1) % LANES.length]
    const dir  = to > from ? 1 : -1

    // 똥 — from 칸으로 떨어진다 (= 지금 실루엣이 서 있는 칸)
    // 바닥선은 CSS의 --tut-floor(7%)와 맞춰야 한다. 어긋나면 허공에서 사라진다.
    const floorY = stageEl.clientHeight * 0.93
    if (t < FALL_MS) {
      poopEl.style.opacity = '1'
      poopEl.style.left = `${laneCenter(from)}px`
      poopEl.style.top  = `${(t / FALL_MS) * floorY}px`
    } else {
      poopEl.style.opacity = '0'
    }

    // 착지 자국은 떨어진 뒤에만
    splatEl.classList.toggle('on', t >= FALL_MS && t < FALL_MS + 700)
    splatEl.style.left = `${laneCenter(from)}px`

    // 실루엣 — MOVE_AT에 비키기 시작해 MOVE_MS 동안 옮긴다
    const p = Math.min(1, Math.max(0, (t - MOVE_AT) / MOVE_MS))
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
    const charX = laneCenter(from) + (laneCenter(to) - laneCenter(from)) * eased
    charEl.style.left = `${charX}px`

    const moving = p > 0 && p < 1
    charEl.classList.toggle('moving', moving)
    charEl.classList.toggle('to-right', dir > 0)

    // 화살표는 비키기 **직전**에 켜고, **캐릭터를 따라다닌다.**
    // 두 칸 사이 허공에 띄우면 누구한테 하는 말인지가 안 읽힌다.
    const showArrow = t > MOVE_AT - 650 && t < MOVE_AT + MOVE_MS
    arrowEl.classList.toggle('on', showArrow)
    arrowEl.textContent = dir > 0 ? '→' : '←'
    arrowEl.style.left = `${charX}px`
  }
  raf = requestAnimationFrame(frame)

  // ── O / X 제스처 ──────────────────────────────────────────
  const oHold = new GestureHold(lms => isArmsUpCircle(lms, GESTURE), GESTURE.confirmHoldSec)
  const xHold = new GestureHold(lms => isArmsUpCross(lms, GESTURE), GESTURE.confirmHoldSec)
  let lastLms = null
  const unsub = poseEngineCore.onLandmarks(lms => { lastLms = lms })

  let gestureRaf = null
  let last = performance.now()
  const gestureTick = now => {
    gestureRaf = requestAnimationFrame(gestureTick)
    if (done) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    // 손이 꺼져 있으면 게이지를 죽이고 안내를 흐리게 — 버튼을 쓰라는 뜻이다
    if (!handSession.enabled) {
      hintEl.classList.add('off')
      gaugeEl.style.width = '0%'
      return
    }
    hintEl.classList.remove('off')

    const oDone = oHold.update(dt, lastLms)
    const xDone = xHold.update(dt, lastLms)
    gaugeEl.style.width = `${Math.round(Math.max(oHold.progress, xHold.progress) * 100)}%`

    if (oDone)      goGame()
    else if (xDone) goBack()
  }
  gestureRaf = requestAnimationFrame(gestureTick)

  onLeave(() => {
    unsub()
    unbindHand()
    clearTimeout(toastTimer)
    if (raf)        cancelAnimationFrame(raf)
    if (gestureRaf) cancelAnimationFrame(gestureRaf)
  })
}

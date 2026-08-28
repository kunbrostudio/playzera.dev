// 팝팝 클리커 — 플레이 화면.
//
// **규칙은 `game.js`가 갖는다.** 여기는 그리고, 감지기가 낸 동작을 넣는다.
// 안내·카메라·결과·기록은 `core/gameShell.js`가 한다 — 불 끄기·돌다리와 같은 뼈대다.
//
// 캔버스가 아니라 **DOM**으로 만든 이유: 클리커 다섯이 화면의 주인공이고, 눌림·빛남·
// 흔들림이 전부 CSS 트랜지션으로 충분하다. 캔버스로 그리면 그림이 도착했을 때
// 스프라이트 좌표를 다시 잡아야 하는데, DOM이면 `background-image`만 바뀐다.
//
// 입력이 둘이다.
//   모션   MoveDetector가 판정한 동작 (진짜 운동)
//   키보드 ↑점프 ↓앉기 ←왼쪽 →오른쪽 스페이스=만세 (카메라 없는 환경)
//
// 키보드로도 게임은 돌아가지만 **기록에는 남기지 않는다.** 키를 누르는 건 운동이 아니다.

import { icon } from '../../core/icons.js'
import { navigate, onLeave } from '../../core/router.js'
import { showReadyScreen } from '../../core/readyScreen.js'
import { handSession } from '../../core/handSession.js'
import { mountGuide, showGameOver, mountCamera, makeRecorder } from '../../core/gameShell.js'
import { getManifest, getBackTo } from '../registry.js'
import { MoveDetector, MOVE } from '../../core/pose/detectors/moves.js'
import { ClickerRun, CLICKERS, PHASE, TIMING, cheer } from './game.js'
import { IMAGES, FALLBACK, bg } from './assets.js'
import * as sfx from './sound.js'

const KEY_TO_MOVE = {
  ArrowUp: MOVE.JUMP, ArrowDown: MOVE.SQUAT,
  ArrowLeft: MOVE.LEFT, ArrowRight: MOVE.RIGHT,
  Space: MOVE.ARMS_UP,
}

export default async function popClickerPlay(app, query) {
  const gameId = query.id ?? 'pop-clicker'
  if (!getManifest(gameId)) { navigate('/'); return }

  // 인트로가 없는 게임이라 나갈 곳은 허브다. `getEntry`를 쓰면 이 화면 자신을 가리켜
  // navigate()가 아무 일도 안 한다 (불 끄기에서 실제로 겪었다).
  const backTo = getBackTo(gameId)

  handSession.setPointerActive(false)

  // 좌우 이동이 있는 게임이라 3분할 선을 보여준다
  const ready = await showReadyScreen(app, { title: '팝팝 클리커', showZones: true })
  if (ready.mode === 'back') { ready.release(); navigate(backTo); return }

  await playScreen(app, { gameId, backTo, mode: ready.mode, release: ready.release })
}

async function playScreen(app, { gameId, backTo, mode, release }) {
  const motion = mode === 'motion'
  const run = new ClickerRun()
  const det = new MoveDetector()

  const record = makeRecorder({ gameId, motion, minActiveSec: 5 })
  let cam = null, raf = null, lastT = null
  let over = false, started = false
  let activeSec = 0          // 실제로 움직인 시간 — 대기·안내는 빼고 센다
  let lastMoveAt = -99

  app.innerHTML = `
    <style>
      #pc, #pc * { box-sizing: border-box; }
      #pc {
        position: fixed; inset: 0; overflow: hidden;
        display: flex; flex-direction: column;
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
        background:
          radial-gradient(120% 80% at 50% 0%, #6a4bd8 0%, #4b2fa8 45%, #2a1866 100%);
        background-image: ${bg(IMAGES.bgRoom)},
          radial-gradient(120% 80% at 50% 0%, #6a4bd8 0%, #4b2fa8 45%, #2a1866 100%);
        background-size: cover; background-position: center;
        touch-action: none; user-select: none;
      }

      /* ── 상단 ── */
      #pc-top {
        display: flex; align-items: center; gap: 10px; flex: none;
        padding: clamp(10px, 2vh, 18px) clamp(12px, 2.4vw, 26px);
      }
      .pc-btn {
        min-height: 46px; padding: 0 16px; border-radius: 9999px;
        background: rgba(255,255,255,0.14); color: #fff;
        border: 2px solid rgba(255,255,255,0.28); font: inherit; font-weight: 800;
        font-size: 0.9rem; cursor: pointer; -webkit-tap-highlight-color: transparent;
      }
      #pc-hud { margin-left: auto; display: flex; align-items: center; gap: clamp(10px, 2vw, 22px); }
      .pc-stat { font-weight: 900; font-size: clamp(0.9rem, 1.8vw, 1.15rem); }
      .pc-stat span { color: #ffd23e; }
      #pc-combo { color: #7ee787; min-width: 4.5em; text-align: right; }
      #pc-combo.off { visibility: hidden; }

      /* ── 라운드 게이지 ── */
      #pc-round { flex: none; padding: 0 clamp(12px, 2.4vw, 26px); }
      #pc-round-bar {
        height: 10px; border-radius: 999px; background: rgba(0,0,0,0.3); overflow: hidden;
      }
      #pc-round-fill {
        height: 100%; width: 0; border-radius: 999px;
        background: linear-gradient(90deg, #7ee787, #ffd23e);
        transition: width 0.3s;
      }
      #pc-round-label { font-size: 0.8rem; font-weight: 800; color: #cbb8ff; margin-top: 4px; text-align: center; }

      /* ── 무대 ── */
      #pc-stage {
        flex: 1 1 auto; min-height: 0; position: relative;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: clamp(8px, 2vh, 22px);
      }

      /* 다음에 올 것 — 묶음일 때만 뜬다 */
      #pc-next {
        display: flex; align-items: center; gap: 8px; min-height: 2.2em;
        font-size: clamp(0.85rem, 1.7vw, 1.05rem); font-weight: 800; color: #cbb8ff;
      }
      #pc-next.off { visibility: hidden; }
      #pc-next .dot {
        width: clamp(26px, 3.4vw, 40px); aspect-ratio: 1; border-radius: 30% 30% 42% 42%;
        border: 2px solid rgba(255,255,255,0.5);
      }

      /* 클리커 다섯 */
      #pc-row {
        display: flex; align-items: flex-end; justify-content: center;
        gap: clamp(8px, 1.8vw, 26px);
        padding: clamp(22px, 4vh, 40px) clamp(12px, 3vw, 40px) clamp(30px, 5vh, 52px);
        border-radius: 999px;
        background: ${bg(IMAGES.stage)}, rgba(255,255,255,0.07);
        background-size: cover; background-position: center;
      }

      .pc-clicker {
        position: relative; flex: 0 0 auto;
        width: clamp(84px, 15vw, 210px); aspect-ratio: 1 / 0.92;
        border-radius: 26% 26% 34% 34%;
        transition: transform 0.09s ease-out, filter 0.15s;
        transform: translateZ(0);
      }
      /* 그림이 오면 이 배경이 아래 CSS 도형을 덮는다 */
      .pc-clicker .art {
        position: absolute; inset: 0; border-radius: inherit;
        background-size: contain; background-repeat: no-repeat; background-position: center bottom;
      }
      /* 그림이 없을 때 보이는 도형 — 젤리 발바닥 느낌 */
      .pc-clicker .fallback {
        position: absolute; inset: 0; border-radius: inherit;
        background: linear-gradient(180deg, var(--top) 0%, var(--face) 55%, var(--edge) 100%);
        box-shadow: 0 8px 0 var(--edge), inset 0 6px 14px rgba(255,255,255,0.45);
      }
      .pc-clicker .fallback::after {
        content: ''; position: absolute; left: 22%; top: 26%; width: 56%; height: 46%;
        border-radius: 46% 46% 40% 40%;
        background: rgba(255,255,255,0.35);
      }
      /* 동작 그림 — **색을 외울 필요를 없애는 장치**(docs/09) */
      .pc-clicker .move {
        position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%);
        width: 62%; aspect-ratio: 1;
        background-size: contain; background-repeat: no-repeat; background-position: center;
        display: flex; align-items: center; justify-content: center;
        font-size: clamp(1.6rem, 3.6vw, 3rem); line-height: 1;
        filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));
      }
      .pc-clicker .label {
        position: absolute; left: 0; right: 0; bottom: -1.6em; text-align: center;
        font-size: clamp(0.7rem, 1.3vw, 0.95rem); font-weight: 900; color: rgba(255,255,255,0.75);
      }

      /* 꺼져 있을 때는 물러나 있는다 — 켜진 것 하나만 눈에 들어와야 한다 */
      .pc-clicker { filter: saturate(0.45) brightness(0.6); }
      .pc-clicker.lit { filter: none; animation: pcPulse 0.9s ease-in-out infinite; }
      .pc-clicker.soon { filter: saturate(0.8) brightness(0.85); }
      .pc-clicker.pressed { transform: translateY(9px) scale(0.94); }
      .pc-clicker.hint { animation: pcHint 0.5s ease-in-out infinite; }

      @keyframes pcPulse {
        0%, 100% { transform: translateY(0) scale(1); }
        50%      { transform: translateY(-6px) scale(1.04); }
      }
      @keyframes pcHint {
        0%, 100% { transform: translateY(0) scale(1.06); }
        50%      { transform: translateY(-12px) scale(1.12); }
      }

      /* 반복 점 */
      .pc-reps {
        position: absolute; left: 0; right: 0; top: -1.5em;
        display: flex; justify-content: center; gap: 5px;
      }
      .pc-reps i {
        width: clamp(7px, 0.9vw, 11px); aspect-ratio: 1; border-radius: 50%;
        background: rgba(255,255,255,0.25); border: 1px solid rgba(255,255,255,0.5);
      }
      .pc-reps i.on { background: #ffd23e; border-color: #ffd23e; }

      /* ── 안내 문구 ── */
      #pc-say {
        text-align: center; min-height: 2.4em;
        font-size: clamp(1.2rem, 3.4vw, 2.4rem); font-weight: 900; color: #ffd23e;
        text-shadow: 0 3px 14px rgba(0,0,0,0.45);
        padding: 0 clamp(12px, 2.4vw, 26px);
      }
      #pc-note { font-size: 0.78rem; color: #b6a4e8; text-align: center; padding-bottom: 6px; }

      /* ── 얼음! ── */
      #pc-freeze {
        position: absolute; inset: 0; display: none;
        flex-direction: column; align-items: center; justify-content: center; gap: 12px;
        background: rgba(20, 40, 90, 0.72); z-index: 20;
        background-image: ${bg(IMAGES.freeze)}; background-size: contain;
        background-repeat: no-repeat; background-position: center;
      }
      #pc-freeze.on { display: flex; }
      #pc-freeze .big { font-size: clamp(2.2rem, 7vw, 4.5rem); font-weight: 900; color: #bfe9ff; }
      #pc-freeze .sub { font-size: clamp(0.9rem, 2vw, 1.3rem); font-weight: 800; }
      #pc-freeze-gauge {
        width: min(320px, 60vw); height: 12px; border-radius: 999px;
        background: rgba(0,0,0,0.35); overflow: hidden;
      }
      #pc-freeze-fill { height: 100%; width: 0; background: #7fe0ff; border-radius: 999px; }

      /* ── 슈퍼 클리커 ── */
      #pc-super {
        position: absolute; inset: 0; display: none;
        flex-direction: column; align-items: center; justify-content: center; gap: clamp(8px, 2vh, 20px);
        background: rgba(10, 5, 30, 0.6); z-index: 15;
      }
      #pc-super.on { display: flex; }
      #pc-super .orb {
        width: min(46vh, 60vw); aspect-ratio: 1 / 0.92; border-radius: 26% 26% 34% 34%;
        background: ${bg(IMAGES.superClicker)},
          linear-gradient(180deg, #ffe08a 0%, #ffb63a 55%, #c97a00 100%);
        background-size: contain; background-repeat: no-repeat; background-position: center;
        box-shadow: 0 14px 0 #a05e00, 0 0 60px rgba(255,200,80,0.5);
        display: flex; align-items: center; justify-content: center;
        font-size: clamp(3rem, 10vw, 7rem);
        transition: transform 0.1s;
      }
      #pc-super .orb.hit { transform: translateY(16px) scale(0.93); }
      #pc-super .cnt { font-size: clamp(1.2rem, 3.4vw, 2.2rem); font-weight: 900; color: #ffd23e; }

      @media (prefers-reduced-motion: reduce) {
        .pc-clicker.lit, .pc-clicker.hint { animation: none; }
      }
    </style>

    <div id="pc">
      <div id="pc-top">
        <button class="pc-btn" id="pc-back">${icon('back')} 그만하기</button>
        <div id="pc-hud">
          <div class="pc-stat">${icon('star')} <span id="pc-score">0</span></div>
          <div class="pc-stat" id="pc-combo">${icon('flame')} <span>0</span></div>
        </div>
      </div>

      <div id="pc-round">
        <div id="pc-round-bar"><div id="pc-round-fill"></div></div>
        <div id="pc-round-label"></div>
      </div>

      <div id="pc-stage">
        <div id="pc-next" class="off">다음 <span class="dot"></span></div>
        <div id="pc-row"></div>
        <div id="pc-say"></div>

        <div id="pc-freeze">
          <div class="big">얼음!</div>
          <div class="sub">움직이지 말고 그대로!</div>
          <div id="pc-freeze-gauge"><div id="pc-freeze-fill"></div></div>
        </div>

        <div id="pc-super">
          <div class="cnt" id="pc-super-cnt"></div>
          <div class="orb" id="pc-super-orb">${icon('target', 1.4)}</div>
          <div class="sub" style="font-weight:900">크게 점프해서 눌러요!</div>
        </div>
      </div>

      ${motion ? '' : '<div id="pc-note">키보드 모드 — ↑점프 ↓앉기 ←→이동 스페이스=만세. 기록에는 남지 않아요.</div>'}
    </div>
  `

  const $ = q => app.querySelector(q)

  // ── 클리커 다섯을 한 번만 그린다. 상태만 갈아 끼운다 ──
  const MOVE_EMOJI = { jump: '🦘', squat: '🧎', left: '⬅️', right: '➡️', armsUp: '🙌' }
  $('#pc-row').innerHTML = CLICKERS.map(c => {
    const f = FALLBACK[c.id]
    return `
      <div class="pc-clicker" data-id="${c.id}"
           style="--top:${f.top}; --face:${f.face}; --edge:${f.edge}">
        <div class="pc-reps"></div>
        <div class="fallback"></div>
        <div class="art" style="background-image:${bg(IMAGES.clicker[c.id].up)}"></div>
        <div class="move" style="background-image:${bg(IMAGES.move[c.move])}">${MOVE_EMOJI[c.move] ?? ''}</div>
        <div class="label">${c.label}</div>
      </div>`
  }).join('')
  const els = Object.fromEntries(
    [...app.querySelectorAll('.pc-clicker')].map(el => [el.dataset.id, el]))

  // ── 화면 갱신 ──────────────────────────────────────────────
  const say = t => { $('#pc-say').textContent = t }

  function paint() {
    const active = run.active
    const soon = run.upcoming

    for (const c of CLICKERS) {
      const el = els[c.id]
      const isActive = active?.id === c.id
      el.classList.toggle('lit', isActive)
      el.classList.toggle('soon', !isActive && soon?.id === c.id)
      el.classList.toggle('hint', isActive && run.needsHint)

      // 반복 점 — 지금 켜진 것에만
      const reps = el.querySelector('.pc-reps')
      if (isActive) {
        const step = run.steps[run.stepIndex]
        reps.innerHTML = Array.from({ length: step.reps },
          (_, i) => `<i class="${i < step.done ? 'on' : ''}"></i>`).join('')
      } else reps.innerHTML = ''
    }

    // 다음에 올 것 미리 보여주기 — **외우는 게 아니라 준비하는 것**(docs/09)
    const nextEl = $('#pc-next')
    nextEl.classList.toggle('off', !soon)
    if (soon) nextEl.querySelector('.dot').style.background = FALLBACK[soon.id].face

    $('#pc-score').textContent = run.score
    const comboEl = $('#pc-combo')
    comboEl.classList.toggle('off', run.combo < 2)
    comboEl.querySelector('span').textContent = run.combo

    const total = run.rounds.reduce((s, r) => s + r.bundles, 0)
    const doneBundles = run.rounds.slice(0, run.roundIndex).reduce((s, r) => s + r.bundles, 0) + run.bundleIndex
    $('#pc-round-fill').style.width = `${Math.min(100, (doneBundles / total) * 100)}%`
    $('#pc-round-label').textContent = run.phase === PHASE.WARMUP
      ? '준비 — 하나씩 눌러봐요'
      : `라운드 ${Math.min(run.roundNo, run.totalRounds)} / ${run.totalRounds}`

    $('#pc-freeze').classList.toggle('on', run.phase === PHASE.FREEZE)
    $('#pc-super').classList.toggle('on', run.phase === PHASE.SUPER)
    if (run.phase === PHASE.SUPER) $('#pc-super-cnt').textContent = `${run.superLeft}번 더!`
    if (active) say(`${active.label}!`)
  }

  /** 눌림 연출 — **감지된 프레임에 바로.** 애니메이션을 기다리지 않는다. */
  function press(clicker, strong) {
    const el = els[clicker.id]
    if (!el) return
    el.querySelector('.art').style.backgroundImage = bg(IMAGES.clicker[clicker.id].down)
    el.classList.add('pressed')
    setTimeout(() => {
      el.classList.remove('pressed')
      el.querySelector('.art').style.backgroundImage = bg(IMAGES.clicker[clicker.id].up)
    }, 110)
    strong ? sfx.pang(clicker.note) : sfx.pop(clicker.note)
  }

  // ── 입력 ───────────────────────────────────────────────────
  function onMove(move, t) {
    if (over) return
    if (!started) return          // 안내 화면 중에는 안 받는다

    lastMoveAt = t
    const before = run.phase
    const r = run.hit(move)
    if (!r.ok) {
      // **오답이 없다** — 아무 일도 하지 않는다 (docs/09)
      if (before === PHASE.FREEZE) $('#pc-freeze-fill').style.width = '0%'
      return
    }

    if (run.phase === PHASE.SUPER || before === PHASE.SUPER) {
      const orb = $('#pc-super-orb')
      orb.classList.add('hit')
      setTimeout(() => orb.classList.remove('hit'), 110)
      sfx.pang(0)
    } else if (r.clicker) {
      press(r.clicker, r.repDone)
    }

    if (r.gameDone) { finish(true); return }
    if (run.phase === PHASE.FREEZE && before !== PHASE.FREEZE) sfx.freeze()
    paint()
  }

  // 카메라
  cam = await mountCamera($('#pc-stage'), {
    enabled: motion,
    zones: true,
    onFrame: (lms, t) => {
      for (const m of det.update(lms, t)) onMove(m, t)
    },
  })
  if (motion && !cam.ok) say('카메라를 못 열었어요 — 키보드로 해요')

  // 키보드 (카메라 없이도 규칙을 확인할 수 있어야 한다)
  const onKey = e => {
    const m = KEY_TO_MOVE[e.code]
    if (!m) return
    e.preventDefault()
    if (e.repeat) return          // 꾹 누르고 있는 건 한 번이다
    onMove(m, performance.now() / 1000)
  }
  window.addEventListener('keydown', onKey)

  // ── 안내 → 시작 ────────────────────────────────────────────
  const guide = mountGuide($('#pc'), {
    title: '팝팝 클리커',
    demo: '<div style="font-size:clamp(2.4rem,9vh,4.4rem)">🦘 🧎 ⬅️ ➡️ 🙌</div>',
    how: '불이 켜진 클리커를 몸으로 눌러요!',
    why: '점프·앉기·좌우·만세를 골고루 — 온몸 운동이에요',
    autoSec: 8,
  })

  guide.done.then(() => {
    started = true
    sfx.unlock()                  // 사용자 제스처 안에서 오디오를 깨운다
    lastT = performance.now() / 1000
    paint()
  })

  // ── 루프 ───────────────────────────────────────────────────
  function frame() {
    raf = requestAnimationFrame(frame)
    const t = performance.now() / 1000
    const dt = lastT == null ? 0 : Math.min(0.05, t - lastT)
    lastT = t
    if (!started || over) return

    // 최근에 움직였으면 운동 중으로 본다. 대기·안내 시간은 빼고 센다.
    if (t - lastMoveAt < 3) activeSec += dt

    const ev = run.tick(dt)
    if (run.phase === PHASE.FREEZE) {
      $('#pc-freeze-fill').style.width = `${Math.min(100, (run._freezeHeld / TIMING.freezeSec) * 100)}%`
    }
    if (ev.skipped || ev.freezeDone) paint()
    else if (run.needsHint) paint()
  }
  raf = requestAnimationFrame(frame)
  paint()

  // ── 끝 ─────────────────────────────────────────────────────
  function snapshot() {
    return run.summary({ ...det.snapshot(), active_sec: Math.round(activeSec) })
  }

  function finish(completed) {
    if (over) return
    over = true
    if (completed) sfx.fanfare()
    const s = snapshot()
    showGameOver($('#pc'), {
      title: completed ? '🎉 다 눌렀어요!' : '수고했어요!',
      line: cheer(run),
      reward: record(s),
      onAgain: () => { cleanup(); playScreen(app, { gameId, backTo, mode, release: () => {} }) },
      onQuit:  () => { cleanup(); navigate(backTo) },
    })
  }

  function cleanup() {
    if (raf) cancelAnimationFrame(raf)
    window.removeEventListener('keydown', onKey)
    guide.close()
    cam?.release()
    sfx.close()
    release?.()
  }

  onLeave(() => {
    if (!over) { over = true; record(snapshot()) }   // 중간에 나가도 기록은 남긴다
    cleanup()
  })

  $('#pc-back').addEventListener('click', () => finish(false))
}

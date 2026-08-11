// 돌다리 건너기 — 플레이 화면.
//
// **규칙은 `game.js`가 갖는다.** 여기는 그리고, 입력을 넣는다.
// 안내·카메라·결과·기록은 **`core/gameShell.js`가 한다** — 불 끄기와 같은 뼈대다.
//
// 입력이 둘이다.
//   모션   BalanceDetector가 판정한 "뜬 발" (진짜 운동)
//   키보드 ← 왼발 / → 오른발을 **누르고 있는 동안** 든 것으로 (카메라 없는 환경)
//
// 키보드로도 게임은 돌아가지만 **기록에는 남기지 않는다.**
// 키를 누르고 있는 건 균형이 아니다.

import { navigate, onLeave } from '../../core/router.js'
import { showReadyScreen } from '../../core/readyScreen.js'
import { handSession } from '../../core/handSession.js'
import { mountGuide, showGameOver, mountCamera, makeRecorder } from '../../core/gameShell.js'
import { getManifest, getBackTo } from '../registry.js'
import { BalanceDetector } from '../../core/pose/detectors/balance.js'
import { BridgeRun, cheer } from './game.js'

const FOOT_LABEL = { left: '왼발', right: '오른발', any: '아무 발' }

export default async function stoneBridgePlay(app, query) {
  const gameId = query.id ?? 'stone-bridge'
  const manifest = getManifest(gameId)
  if (!manifest) { navigate('/'); return }

  // 인트로가 없는 게임이라 나갈 곳은 허브다. `getEntry`를 쓰면 이 화면 자신을 가리켜
  // navigate()가 아무 일도 안 한다 (불 끄기에서 실제로 겪었다).
  const backTo = getBackTo(gameId)

  handSession.setPointerActive(false)

  // 발이 보여야 판정할 수 있다 — 전신이 잡히는 자리에 서는 것이 전제다.
  const ready = await showReadyScreen(app, { title: '돌다리 건너기', showZones: false })
  if (ready.mode === 'back') { ready.release(); navigate(backTo); return }

  await playScreen(app, { gameId, backTo, mode: ready.mode, release: ready.release })
}

async function playScreen(app, { gameId, backTo, mode, release }) {
  const motion = mode === 'motion'
  const game = new BridgeRun()
  const det = new BalanceDetector()

  const record = makeRecorder({ gameId, motion, minActiveSec: 3 })
  let cam = null, raf = null
  let lastT = null
  let keyFoot = null        // 키보드로 든 발
  let over = false, started = false

  app.innerHTML = `
    <style>
      #sb, #sb * { box-sizing: border-box; }
      #sb {
        position: fixed; inset: 0; overflow: hidden;
        display: flex; flex-direction: column;
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
        background: radial-gradient(120% 90% at 50% 0%, #1e3a6b 0%, #16264a 45%, #0e1730 100%);
        touch-action: none; user-select: none;
      }

      #sb-top {
        display: flex; align-items: center; gap: 10px; flex: none;
        padding: clamp(10px, 2vh, 18px) clamp(12px, 2.4vw, 26px);
      }
      .sb-btn {
        min-height: 46px; padding: 0 16px; border-radius: 9999px;
        background: rgba(255,255,255,0.12); color: #fff;
        border: 2px solid rgba(255,255,255,0.26); font: inherit; font-weight: 800;
        font-size: 0.9rem; cursor: pointer; -webkit-tap-highlight-color: transparent;
      }
      #sb-count { margin-left: auto; font-weight: 900; font-size: clamp(0.9rem, 1.8vw, 1.15rem); }
      #sb-count .dot { color: #35507f; margin-left: 4px; }
      #sb-count .dot.on { color: #7ee787; }

      /* ── 강과 돌다리 ── */
      #sb-stage { flex: 1 1 auto; min-height: 0; position: relative; display: flex;
        flex-direction: column; align-items: center; justify-content: center; gap: clamp(10px, 2.4vh, 24px); }

      #sb-river { position: relative; width: min(900px, 92%); height: clamp(120px, 22vh, 200px); }
      /* 물결 — 배경일 뿐이라 조용히 움직인다 */
      #sb-river::before {
        content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 46%;
        background: linear-gradient(180deg, rgba(80,150,255,0.25), rgba(80,150,255,0.05));
        border-radius: 18px;
      }
      #sb-stones {
        position: absolute; inset: 0; display: flex; align-items: flex-end;
        justify-content: space-between; padding: 0 2%;
      }
      .sb-stone {
        width: clamp(44px, 7vw, 76px); aspect-ratio: 1.4;
        border-radius: 50% 50% 40% 40%; background: #4b3a77;
        border: 3px solid rgba(255,255,255,0.14);
        display: flex; align-items: center; justify-content: center;
        font-size: clamp(0.7rem, 1.4vw, 0.9rem); font-weight: 900; color: #a78bda;
        transition: background 0.2s, transform 0.2s;
      }
      .sb-stone.done { background: #35c46a; color: #0e1730; }
      .sb-stone.now  { background: #ffd23e; color: #4a2a00; transform: translateY(-10px) scale(1.12); }

      /* 아이 캐릭터 — 지금 밟고 있는 돌 위에 선다 */
      #sb-hero {
        position: absolute; bottom: 44%; font-size: clamp(2.2rem, 8vh, 4rem); line-height: 1;
        transition: left 0.45s cubic-bezier(.2,.8,.3,1);
        transform: translateX(-50%);
      }

      /* ── 버티기 고리 ── */
      #sb-ring { position: relative; width: clamp(120px, 20vh, 190px); aspect-ratio: 1; }
      #sb-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
      #sb-ring .bg { fill: none; stroke: rgba(0,0,0,0.35); stroke-width: 10; }
      #sb-ring .fg { fill: none; stroke: #7ee787; stroke-width: 10; stroke-linecap: round; transition: stroke-dashoffset 0.1s linear, stroke 0.2s; }
      #sb-ring.wrong .fg { stroke: #ff8a8a; }
      #sb-ring-foot {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 2px;
      }
      #sb-ring-foot .big { font-size: clamp(1.6rem, 5vh, 2.6rem); }
      #sb-ring-foot .lbl { font-size: clamp(0.8rem, 1.6vw, 1rem); font-weight: 900; color: #ffd23e; }

      #sb-foot-area {
        flex: none; display: flex; flex-direction: column; align-items: center; gap: 6px;
        padding: 0 clamp(12px, 2.4vw, 26px) max(clamp(12px, 2.4vh, 24px), env(safe-area-inset-bottom));
      }
      #sb-cheer { font-size: clamp(1rem, 2.6vw, 1.6rem); font-weight: 900; color: #ffd23e; min-height: 1.6em; }
      #sb-stats { display: flex; gap: 14px; font-size: 0.85rem; font-weight: 800; color: #8fa8d8; }
      #sb-stats b { color: #fff; }
      #sb-note { font-size: 0.78rem; color: #6b7fae; }

      /* 안내의 본보기 그림만 이 게임 것이다. 나머지는 core/gameShell.js */
      #sb-demo { font-size: clamp(3rem, 12vh, 5.4rem); line-height: 1; animation: sbWobble 2.4s ease-in-out infinite; }
      @keyframes sbWobble { 0%,100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }

      @media (prefers-reduced-motion: reduce) {
        #sb-demo { animation: none; }
      }
    </style>

    <div id="sb">
      <div id="sb-top">
        <button class="sb-btn" id="sb-back">← 그만하기</button>
        <div id="sb-count"></div>
      </div>

      <div id="sb-stage">
        <div id="sb-river">
          <div id="sb-stones"></div>
          <div id="sb-hero">🧒</div>
        </div>

        <div id="sb-ring">
          <svg viewBox="0 0 120 120">
            <circle class="bg" cx="60" cy="60" r="52"></circle>
            <circle class="fg" cx="60" cy="60" r="52"
                    stroke-dasharray="326.7" stroke-dashoffset="326.7"></circle>
          </svg>
          <div id="sb-ring-foot"><div class="big">🦶</div><div class="lbl"></div></div>
        </div>

      </div>

      <div id="sb-foot-area">
        <div id="sb-cheer"></div>
        <div id="sb-stats"></div>
        ${motion ? '' : '<div id="sb-note">키보드 모드 — ← 왼발 / → 오른발을 누르고 있으면 든 것으로 칩니다. 기록에는 남지 않아요.</div>'}
      </div>

    </div>
  `

  const $ = q => app.querySelector(q)
  const RING = 2 * Math.PI * 52

  // 돌은 한 번만 그린다. 상태만 갈아 끼운다.
  $('#sb-stones').innerHTML = game.stones
    .map(s => `<div class="sb-stone">${FOOT_LABEL[s.foot]}</div>`).join('')
  const stoneEls = [...app.querySelectorAll('.sb-stone')]

  // ── 입력 ────────────────────────────────────────────────
  cam = await mountCamera($('#sb-stage'), {
    enabled: motion,
    onFrame: (lms, t) => det.update(lms, t),
  })
  release?.()   // 준비 화면의 참조는 게임이 잡은 **뒤에** 놓는다 (1 → 2 → 1)

  const onKeyDown = e => {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); keyFoot = 'left' }
    if (e.key === 'ArrowRight') { e.preventDefault(); keyFoot = 'right' }
    if (e.key === 'Escape') finish(true)
  }
  const onKeyUp = e => {
    if ((e.key === 'ArrowLeft' && keyFoot === 'left') ||
        (e.key === 'ArrowRight' && keyFoot === 'right')) keyFoot = null
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  // ── 그리기 ──────────────────────────────────────────────
  function paint(lifted) {
    stoneEls.forEach((el, i) => {
      el.classList.toggle('done', i < game.index)
      el.classList.toggle('now', i === game.index)
    })
    // 캐릭터는 지금 돌 **위에** 선다.
    // 인덱스 비율로 계산하면 돌의 실제 위치와 어긋난다 — 돌은 space-between으로
    // 놓여 있어서 간격이 균등하지 않다. 그려진 돌의 자리를 그대로 읽는다.
    const stone = stoneEls[game.index]
    if (stone) $('#sb-hero').style.left = `${stone.offsetLeft + stone.offsetWidth / 2}px`

    $('#sb-count').innerHTML = `${game.index + 1}번째 돌` +
      game.stones.map((_, i) => `<span class="dot ${i < game.index ? 'on' : ''}">●</span>`).join('')

    $('#sb-ring').classList.toggle('wrong', game.wrongFoot)
    $('#sb-ring').querySelector('.fg').style.strokeDashoffset = String(RING * (1 - game.progress))
    $('#sb-ring-foot').querySelector('.lbl').textContent = FOOT_LABEL[game.needFoot]

    $('#sb-cheer').textContent = cheer({
      wrongFoot: game.wrongFoot, needFoot: game.needFoot, progress: game.progress, lifted,
    })
    $('#sb-stats').innerHTML = `
      <span>건넌 돌 <b>${game.cleared}</b></span>
      <span>버틴 시간 <b>${Math.round(game.balanceSec)}초</b></span>`
  }

  // ── 루프 ────────────────────────────────────────────────
  function loop() {
    raf = requestAnimationFrame(loop)
    const t = performance.now() / 1000
    const dt = lastT === null ? 0 : Math.min(0.1, t - lastT)
    lastT = t
    if (!started) return

    // 감지기는 "지금 어느 발이 떠 있나"만 알려준다. 세는 건 게임 규칙이 한다.
    const lifted = motion ? (det.holding ? det.side : null) : keyFoot
    game.update(dt, lifted)
    paint(lifted)

    if (game.done && !over) finish(false)
  }
  raf = requestAnimationFrame(loop)

  // ── 안내 → 시작 ─────────────────────────────────────────
  const guide = mountGuide($('#sb'), {
    title: '한 발로 서기',
    demo: `<div id="sb-demo">🧍</div>`,
    how: '한 발을 들고 버티면 다음 돌이 나와요',
    why: '왼발·오른발을 번갈아 써요 · 발이 닿아도 처음부터는 아니에요',
  })
  guide.done.then(() => {
    started = true
    lastT = null
    det.reset()       // 안내를 보며 든 발은 기록에 안 넣는다
  })

  // ── 끝 ──────────────────────────────────────────────────
  function finish(early) {
    if (over) return
    over = true
    guide.close()
    if (raf) cancelAnimationFrame(raf)

    const s = game.snapshot()
    showGameOver($('#sb'), {
      title: early ? '오늘은 여기까지!'
                   : (s.cleared === s.stones ? '다 건넜어요! 🎉' : '수고했어요!'),
      line: `${s.cleared}개의 돌을 건너고 ${s.balance_sec}초 버텼어요`,
      reward: record(s),
      onAgain: () => window.location.reload(),
      onQuit: () => navigate(backTo),
    })
  }

  $('#sb-back').addEventListener('click', () => finish(true))

  paint(null)

  onLeave(() => {
    guide.close()
    if (raf) cancelAnimationFrame(raf)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    record(game.snapshot())     // 중간에 나가도 버틴 건 버틴 것이다
    cam?.release()
  })
}

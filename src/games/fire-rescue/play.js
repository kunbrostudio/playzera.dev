// 불 끄기 소방관 — 플레이 화면.
//
// **규칙은 `game.js`가 갖는다.** 여기는 그리고, 입력을 넣고, 기록을 넘긴다.
//
// 입력이 둘이다.
//   모션   HighKneesDetector가 센 걸음 (진짜 운동)
//   키보드 스페이스 연타 (카메라가 안 되는 환경 · 개발 확인용)
//
// 키보드로도 게임이 돌아가지만 **기록에는 남기지 않는다.**
// 손가락으로 두드린 것은 운동이 아니다. 그걸 EXP로 주면 이 서비스의 존재 이유가 무너진다.
//
// 그림은 아직 없다 — 도형과 이모지로 먼저 만든다(똥 피하기 때와 같은 순서).
// 그림이 나오면 이 파일의 `paint()`만 갈아 끼우면 된다.
//
// 안내·카메라·결과·기록은 **`core/gameShell.js`가 한다.** 여기 남은 것은
// 이 게임만의 것 — 무대를 그리는 일뿐이다.

import { navigate, onLeave } from '../../core/router.js'
import { showReadyScreen } from '../../core/readyScreen.js'
import { handSession } from '../../core/handSession.js'
import { mountGuide, showGameOver, mountCamera, makeRecorder } from '../../core/gameShell.js'
import { getManifest, getBackTo } from '../registry.js'
import { HighKneesDetector } from '../../core/pose/detectors/highKnees.js'
import { FireRun, PHASE, waterPower, cheer } from './game.js'

export default async function fireRescuePlay(app, query) {
  const gameId = query.id ?? 'fire-rescue'
  const manifest = getManifest(gameId)
  if (!manifest) { navigate('/'); return }

  // **나갈 곳은 `getBackTo`다.** `getEntry`는 인트로가 없는 게임에서 이 화면 자신을
  // 가리켜서, navigate()가 같은 해시를 다시 넣고 아무 일도 안 일어난다(실제로 겪었다).
  const backTo = getBackTo(gameId)

  // 몸으로 하는 화면이라 손 커서를 내린다. 커서가 시야를 가리고,
  // 달리는 동안 버튼 위를 스쳐 머무르기가 걸릴 수도 있다.
  handSession.setPointerActive(false)

  // 전신이 보이는 자리에 서는 것이 이 게임의 전제다 — 무릎이 안 보이면 못 센다.
  const ready = await showReadyScreen(app, { title: '불 끄기 소방관', showZones: false })
  if (ready.mode === 'back') { ready.release(); navigate(backTo); return }

  await playScreen(app, { gameId, backTo, mode: ready.mode, release: ready.release })
}

async function playScreen(app, { gameId, backTo, mode, release }) {
  const motion = mode === 'motion'
  const game = new FireRun()
  const det = new HighKneesDetector()

  const record = makeRecorder({ gameId, motion })
  let cam = null
  let raf = null
  let lastT = null
  let lastSteps = 0
  let keySteps = 0        // 키보드 모드에서 스페이스로 만든 걸음
  const stepTimes = []    // 케이던스 창 — 물줄기 굵기가 이걸 쓴다
  let over = false
  let started = false     // 안내 화면을 지났나

  app.innerHTML = `
    <style>
      #fr, #fr * { box-sizing: border-box; }
      #fr {
        position: fixed; inset: 0; overflow: hidden;
        display: flex; flex-direction: column;
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
        background: radial-gradient(120% 90% at 50% 0%, #3b2170 0%, #241246 45%, #150a2e 100%);
        touch-action: none; user-select: none;
      }

      /* ── 머리 ── */
      #fr-top {
        display: flex; align-items: center; gap: 10px; flex: none;
        padding: clamp(10px, 2vh, 18px) clamp(12px, 2.4vw, 26px);
      }
      .fr-btn {
        min-height: 46px; padding: 0 16px; border-radius: 9999px;
        background: rgba(255,255,255,0.12); color: #fff;
        border: 2px solid rgba(255,255,255,0.26); font: inherit; font-weight: 800;
        font-size: 0.9rem; cursor: pointer; -webkit-tap-highlight-color: transparent;
      }
      #fr-round { margin-left: auto; font-weight: 900; font-size: clamp(0.9rem, 1.8vw, 1.15rem); }
      #fr-round .dot { color: #4b3a77; margin-left: 4px; }
      #fr-round .dot.on { color: #ffd23e; }

      /* ── 무대 ── */
      #fr-stage {
        flex: 1 1 auto; min-height: 0; position: relative;
        display: flex; align-items: center; justify-content: center;
        gap: clamp(12px, 4vw, 60px); padding: 0 clamp(12px, 3vw, 40px);
      }

      /* 소방관 — 걸음에 맞춰 들썩인다. 내 몸이 화면에 붙어 있다는 느낌이 이 게임의 재미다 */
      #fr-hero { font-size: clamp(3rem, 12vh, 6rem); line-height: 1; transition: transform 0.08s; }
      #fr-hero.step { transform: translateY(-10px); }

      /* 물줄기 — 케이던스가 굵기와 길이를 정한다 */
      #fr-water { flex: 1; height: 14px; max-width: 420px; position: relative; }
      #fr-water i {
        position: absolute; left: 0; top: 50%; transform: translateY(-50%);
        height: 100%; border-radius: 999px;
        background: linear-gradient(90deg, #7ec8ff, rgba(126,200,255,0.15));
        transition: width 0.12s, opacity 0.12s;
      }

      /* 불 — 남은 양이 크기다. 숫자를 못 읽어도 크기는 보인다 */
      #fr-fire { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; }
      #fr-flame {
        font-size: clamp(2.5rem, 16vh, 8rem); line-height: 1;
        transition: transform 0.2s, filter 0.2s;
        filter: drop-shadow(0 0 30px rgba(255,140,40,0.55));
      }
      #fr-house { font-size: clamp(2rem, 9vh, 4.5rem); line-height: 1; }
      #fr-gauge {
        width: clamp(120px, 18vw, 200px); height: 12px; border-radius: 999px;
        background: rgba(0,0,0,0.35); overflow: hidden; border: 2px solid rgba(255,255,255,0.14);
      }
      #fr-gauge i { display: block; height: 100%; background: linear-gradient(90deg, #ff9d2e, #ff5c3d); }

      /* ── 발 ── */
      #fr-foot {
        flex: none; display: flex; flex-direction: column; align-items: center; gap: 8px;
        padding: 0 clamp(12px, 2.4vw, 26px) max(clamp(12px, 2.4vh, 24px), env(safe-area-inset-bottom));
      }
      #fr-cheer { font-size: clamp(1rem, 2.6vw, 1.6rem); font-weight: 900; color: #ffd23e; min-height: 1.6em; }
      #fr-stats { display: flex; gap: 14px; font-size: 0.85rem; font-weight: 800; color: #a78bda; }
      #fr-stats b { color: #fff; }

      /* 쉬는 국면 — **아무것도 요구하지 않는다.** 숨을 고르라고 말해주는 화면이다 */
      #fr-rest {
        position: absolute; inset: 0; z-index: 5; display: none;
        flex-direction: column; align-items: center; justify-content: center; gap: 14px;
        background: rgba(10,6,22,0.82); backdrop-filter: blur(3px);
      }
      #fr-rest.on { display: flex; }
      #fr-rest .big { font-size: clamp(1.4rem, 4vw, 2.4rem); font-weight: 900; }
      #fr-rest .sub { font-size: clamp(0.9rem, 1.8vw, 1.1rem); font-weight: 800; color: #a78bda; }
      #fr-breath {
        width: clamp(90px, 14vw, 140px); aspect-ratio: 1; border-radius: 50%;
        background: radial-gradient(circle, rgba(126,231,135,0.5), rgba(126,231,135,0.05));
        animation: frBreath 4s ease-in-out infinite;
      }
      @keyframes frBreath { 0%,100% { transform: scale(0.75); } 50% { transform: scale(1.1); } }
      #fr-rest .count { font-size: clamp(1.6rem, 5vw, 3rem); font-weight: 900; color: #7ee787; }

      /* 안내의 본보기 동작만 이 게임 것이다. 나머지(판·버튼·결과·PIP)는 core/gameShell.js */
      #fr-demo { display: flex; align-items: flex-end; gap: 6px; height: clamp(90px, 16vh, 150px); }
      #fr-demo span { font-size: clamp(2.6rem, 9vh, 4.6rem); line-height: 1; }
      #fr-demo .l { animation: frStepA 0.7s ease-in-out infinite; }
      #fr-demo .r { animation: frStepB 0.7s ease-in-out infinite; }
      @keyframes frStepA { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-24px); } }
      @keyframes frStepB { 0%,100% { transform: translateY(-24px); } 50% { transform: translateY(0); } }

      #fr-note { font-size: 0.78rem; color: #8d7fb5; }

      @media (prefers-reduced-motion: reduce) {
        #fr-breath, #fr-demo .l, #fr-demo .r { animation: none; }
      }
    </style>

    <div id="fr">
      <div id="fr-top">
        <button class="fr-btn" id="fr-back">← 그만하기</button>
        <div id="fr-round"></div>
      </div>

      <div id="fr-stage">
        <div id="fr-hero">🧑‍🚒</div>
        <div id="fr-water"><i></i></div>
        <div id="fr-fire">
          <div id="fr-flame">🔥</div>
          <div id="fr-house">🏠</div>
          <div id="fr-gauge"><i></i></div>
        </div>

        <div id="fr-rest">
          <div class="big">잘했어요! 숨을 고르자</div>
          <div id="fr-breath"></div>
          <div class="count" id="fr-rest-count"></div>
          <div class="sub">천천히 들이쉬고… 내쉬고…</div>
        </div>

      </div>

      <div id="fr-foot">
        <div id="fr-cheer"></div>
        <div id="fr-stats"></div>
        ${motion ? '' : '<div id="fr-note">키보드 모드 — 스페이스를 두드리면 달린 것으로 칩니다. 기록에는 남지 않아요.</div>'}
      </div>

    </div>
  `

  const $ = q => app.querySelector(q)

  // ── 입력 ────────────────────────────────────────────────
  // 카메라·PIP·참조 카운팅은 셸이 한다. 여기서는 프레임을 감지기에 넘기기만 한다.
  cam = await mountCamera($('#fr-stage'), {
    enabled: motion,
    onFrame: (lms, t) => det.update(lms, t),
  })
  release?.()   // 준비 화면이 들고 있던 참조는 게임이 잡은 **뒤에** 놓는다 (1 → 2 → 1)

  const onKey = e => {
    if (e.code === 'Space') { e.preventDefault(); keySteps++ }
    if (e.key === 'Escape') finish(true)
  }
  window.addEventListener('keydown', onKey)

  // ── 그리기 ──────────────────────────────────────────────
  function paint(cadence, stepped) {
    const power = waterPower(cadence)
    const resting = game.phase === PHASE.REST

    $('#fr-round').innerHTML = `${resting ? '쉬는 시간' : `${game.round + 1}번째 집`}` +
      game.rounds.map((_, i) => `<span class="dot ${i < game.cleared ? 'on' : ''}">●</span>`).join('')

    const fr = game.fireRatio
    $('#fr-flame').style.transform = `scale(${0.45 + fr * 0.85})`
    $('#fr-flame').style.filter = `drop-shadow(0 0 ${10 + fr * 40}px rgba(255,140,40,${0.25 + fr * 0.5}))`
    $('#fr-gauge').firstElementChild.style.width = `${Math.round(fr * 100)}%`

    const w = $('#fr-water').firstElementChild
    w.style.width = `${Math.round(power * 100)}%`
    w.style.opacity = resting ? 0 : String(0.35 + power * 0.65)

    if (stepped) {
      const hero = $('#fr-hero')
      hero.classList.add('step')
      setTimeout(() => hero.classList.remove('step'), 90)
    }

    $('#fr-cheer').textContent = resting ? '' : cheer(fr, power)
    $('#fr-stats').innerHTML = `
      <span>걸음 <b>${game.steps}</b></span>
      <span>달린 시간 <b>${Math.round(game.runSec)}초</b></span>
      <span>끈 불 <b>${game.cleared}</b></span>`

    $('#fr-rest').classList.toggle('on', resting)
    if (resting) $('#fr-rest-count').textContent = Math.ceil(game.restLeft)
  }

  // ── 루프 ────────────────────────────────────────────────
  function loop() {
    raf = requestAnimationFrame(loop)
    const t = performance.now() / 1000
    const dt = lastT === null ? 0 : Math.min(0.1, t - lastT)   // 탭 전환 뒤 큰 dt를 막는다
    lastT = t

    // 안내를 보는 동안에는 불이 자라지 않는다. 설명을 읽는 시간에 벌을 주지 않는다.
    if (!started) {
      if (motion) lastSteps = det.count      // 시범 따라 한 걸음은 기록에 안 넣는다
      return
    }

    let steps = 0
    if (motion) {
      steps = det.count - lastSteps
      lastSteps = det.count
    }
    if (keySteps) { steps += keySteps; keySteps = 0 }

    // 물줄기는 **최근 몇 초의 리듬**을 봐야 한다. 이번 프레임에 걸음이 있었나만 보면
    // 물이 깜빡깜빡 끊겨서 "고장 났나" 싶다. 모션은 감지기가 이미 재고 있고,
    // 키보드는 여기서 같은 방식으로 잰다.
    for (let i = 0; i < steps; i++) stepTimes.push(t)
    while (stepTimes.length && stepTimes[0] < t - 4) stepTimes.shift()
    const keyCadence = stepTimes.length >= 2
      ? Math.round((stepTimes.length - 1) / Math.max(0.5, t - stepTimes[0]) * 60)
      : 0

    game.update(dt, steps)
    paint(motion ? det.cadence : keyCadence, steps > 0)

    if (game.done && !over) finish(false)
  }
  raf = requestAnimationFrame(loop)

  // ── 안내 → 시작 ─────────────────────────────────────────
  // 무엇을 하는 운동인지 **먼저 보여준다.** 판·버튼·자동 시작은 셸이 한다.
  const guide = mountGuide($('#fr'), {
    title: '제자리 달리기',
    demo: `<div id="fr-demo"><span class="l">🦵</span><span>🧑‍🚒</span><span class="r">🦵</span></div>`,
    how: '그 자리에서 무릎을 콩콩 들어 올려요',
    why: '달리면 물이 나와요 · 멈추면 불이 다시 커져요',
  })
  guide.done.then(() => {
    started = true
    lastT = null                        // 안내를 보던 시간이 첫 dt로 들어가지 않게
    if (motion) lastSteps = det.count   // 시범 따라 한 걸음은 세지 않는다
  })

  // ── 끝 ──────────────────────────────────────────────────
  function finish(early) {
    if (over) return
    over = true
    guide.close()
    if (raf) cancelAnimationFrame(raf)

    const s = game.snapshot()
    showGameOver($('#fr'), {
      title: early ? '오늘은 여기까지!'
                   : (s.cleared === s.rounds ? '불을 다 껐어요! 🎉' : '수고했어요!'),
      line: `${s.cleared}개의 불을 끄고 ${s.high_knees}걸음 달렸어요 · ${s.active_sec}초`,
      reward: record(s),
      onAgain: () => window.location.reload(),
      onQuit: () => navigate(backTo),
    })
  }

  $('#fr-back').addEventListener('click', () => finish(true))

  onLeave(() => {
    guide.close()
    if (raf) cancelAnimationFrame(raf)
    window.removeEventListener('keydown', onKey)
    // 나가는 중에도 기록은 남긴다 — 중간에 나가도 움직인 건 움직인 것이다
    record(game.snapshot())
    cam?.release()
  })
}

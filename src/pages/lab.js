// /lab — 감지기 실측 화면. **개발용이다.**
//
// 새 동작을 넣을 때 제일 먼저 답해야 하는 질문은 하나다 —
// **"웹캠이 이걸 실제로 세는가?"**
//
// 합성 프레임 테스트(`test/detectors.test.js`)는 로직이 맞는지는 말해주지만
// 진짜 사람의 흔들림·조명·거리까지는 말해주지 못한다. 반대로 게임에 먼저 붙이면
// 안 세어질 때 원인이 게임인지 감지기인지 알 수 없다.
//
// 그래서 **감지기만 벗겨 놓고 눈으로 보는 자리**를 따로 둔다.
// 숫자가 실시간으로 오르는 걸 보면서 문턱을 조정하면 된다.
//
// 라우터에 `import.meta.env.DEV`에서만 등록된다 — 개발용 더미 게임과 같은 규칙이다.

import { onLeave, navigate } from '../core/router.js'
import { poseEngineCore, isFullBodyVisible, LM } from '../core/pose/poseEngine.js'
import { createPipOverlay } from '../core/pose/pipOverlay.js'
import { handErrorMessage } from '../core/handControl.js'
import { HighKneesDetector, HIGH_KNEES } from '../core/pose/detectors/highKnees.js'
import { BalanceDetector, BALANCE } from '../core/pose/detectors/balance.js'
import { getExercise } from '../progress/exercises.js'
import { matchTargets, matchDetail } from '../core/pose/poseMatch.js'
import { YOGA_POSES, YOGA_THRESHOLD } from '../core/pose/poses.js'

// 여기에 한 줄 넣으면 실측 대상에 뜬다. 감지기를 추가할 때 손대는 유일한 곳.
const LABS = {
  high_knees: {
    label: '제자리 달리기',
    make: () => new HighKneesDetector(),
    // 큰 숫자 하나 + 옆에 붙는 값들. 감지기 안을 들여다보는 창이다.
    read: d => ({
      big: d.count,
      unit: '걸음',
      rows: [
        ['케이던스', `${d.cadence} 걸음/분`],
        ['달리는 중', d.running ? '예' : '아니오'],
        ['달린 시간', `${d.activeSec.toFixed(1)}초`],
        ['왼 무릎', d.left.up ? '들림' : '내림'],
        ['오른 무릎', d.right.up ? '들림' : '내림'],
      ],
      cfg: HIGH_KNEES,
    }),
  },
  balance: {
    label: '한 발 서기',
    make: () => new BalanceDetector(),
    read: d => ({
      big: d.holdSec.toFixed(1),
      unit: '초',
      rows: [
        ['지금', d.holding ? `${d.side === 'left' ? '왼발' : '오른발'} 들림` : '두 발'],
        ['최고 기록', `${d.bestSec.toFixed(1)}초`],
        ['왼발 최고', `${d.bestBySide.left.toFixed(1)}초`],
        ['오른발 최고', `${d.bestBySide.right.toFixed(1)}초`],
        ['합계', `${d.totalSec.toFixed(1)}초`],
      ],
      cfg: BALANCE,
    }),
  },
  // 요가는 감지기가 아니라 **채점기**다. 카운트 대신 자세별 점수를 늘어놓는다.
  // 합성 뼈대로는 "정확히 하면 통과한다"까지만 알 수 있다 —
  // 진짜 아이의 흔들림·옷·조명은 여기서 봐야 한다.
  yoga: {
    label: '요가 자세',
    make: () => ({ lms: null, update(l) { this.lms = l } }),
    read: d => {
      const rows = YOGA_POSES
        .map(p => [p, d.lms ? matchTargets(d.lms, p.targets) : 0])
        .sort((a, b) => b[1] - a[1])
      const [best, bestScore] = rows[0]
      const detail = d.lms ? matchDetail(d.lms, best.targets) : { joints: [] }
      return {
        big: `${best.emoji} ${bestScore.toFixed(2)}`,
        unit: bestScore >= YOGA_THRESHOLD ? ` ${best.name} 통과` : ` ${best.name}`,
        rows: [
          ...rows.map(([p, v]) => [`${p.emoji} ${p.name}`, v.toFixed(2)]),
          ['— 깎아먹는 항목', ''],
          ...detail.joints.slice(0, 3).map(([k, sc, val, tgt]) =>
            [k, `${sc.toFixed(2)} (${Math.round(val)} → ${tgt})`]),
        ],
        cfg: { 문턱: YOGA_THRESHOLD },
      }
    },
  },
}

export function labPage(app, query = {}) {
  let key = LABS[query.d] ? query.d : 'high_knees'
  let lab = LABS[key]
  let det = lab.make()
  let released = false
  let unsub = null
  let detach = null
  let raf = null

  app.innerHTML = `
    <style>
      #lab, #lab * { box-sizing: border-box; }
      #lab {
        position: fixed; inset: 0; overflow-y: auto;
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
        background: linear-gradient(180deg, #2b1b52 0%, #150a2e 100%);
        padding: clamp(12px, 2.4vh, 24px);
      }
      #lab-in { width: min(1100px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
      .lab-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .lab-btn {
        min-height: 42px; padding: 0 16px; border-radius: 9999px;
        background: rgba(255,255,255,0.1); color: #fff;
        border: 2px solid rgba(255,255,255,0.22); font: inherit; font-weight: 800;
        font-size: 0.9rem; cursor: pointer;
      }
      .lab-btn.on { background: #ffd23e; color: #4a2a00; border-color: transparent; }
      .lab-tag { margin-left: auto; font-size: 0.78rem; font-weight: 800; color: #ff9de0; }

      #lab-grid { display: grid; gap: 14px; grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); }
      @media (max-width: 900px) { #lab-grid { grid-template-columns: minmax(0, 1fr); } }
      .lab-card {
        background: rgba(255,255,255,0.07); border: 2px solid rgba(255,255,255,0.12);
        border-radius: 20px; padding: 16px;
      }

      #lab-cam { position: relative; aspect-ratio: 16 / 9; border-radius: 14px; overflow: hidden; background: #000; }
      #lab-cam video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
      #lab-cam canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
      #lab-body {
        position: absolute; left: 10px; top: 10px; padding: 4px 10px; border-radius: 999px;
        font-size: 0.76rem; font-weight: 800; background: rgba(0,0,0,0.6);
      }
      #lab-body.ok { color: #7ee787; } #lab-body.no { color: #ff8a8a; }

      #lab-big { font-size: clamp(3rem, 12vw, 6rem); font-weight: 900; line-height: 1; color: #ffd23e; }
      #lab-big small { font-size: 0.24em; color: #a78bda; margin-left: 8px; }
      .lab-rows { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
      .lab-row { display: flex; justify-content: space-between; gap: 10px; font-size: 0.88rem; font-weight: 800; }
      .lab-row span:last-child { color: #ffd23e; }
      .lab-cfg { margin-top: 12px; font-size: 0.74rem; color: #8d7fb5; line-height: 1.6; word-break: keep-all; }
      #lab-quality { font-size: 0.8rem; font-weight: 800; color: #a78bda; margin-top: 8px; line-height: 1.5; }
      #lab-err { color: #ff8a8a; font-weight: 800; }
    </style>

    <div id="lab">
      <div id="lab-in">
        <div class="lab-top">
          <button class="lab-btn" id="lab-back">← 홈으로</button>
          ${Object.entries(LABS).map(([k, v]) =>
            `<button class="lab-btn lab-pick ${k === key ? 'on' : ''}" data-k="${k}">${v.label}</button>`).join('')}
          <button class="lab-btn" id="lab-reset">↺ 초기화</button>
          <span class="lab-tag">개발용 · 감지기 실측</span>
        </div>

        <div id="lab-grid">
          <div class="lab-card">
            <div id="lab-cam">
              <video id="lab-video" muted playsinline></video>
              <canvas id="lab-canvas"></canvas>
              <div id="lab-body" class="no">전신 확인 중…</div>
            </div>
            <div id="lab-quality"></div>
            <div id="lab-err"></div>
          </div>

          <div class="lab-card">
            <div id="lab-big">0<small></small></div>
            <div class="lab-rows" id="lab-rows"></div>
            <div class="lab-cfg" id="lab-cfg"></div>
          </div>
        </div>
      </div>
    </div>
  `

  const $ = q => app.querySelector(q)
  const overlay = createPipOverlay($('#lab-canvas'), { zones: false })

  function paint() {
    const v = lab.read(det)
    $('#lab-big').innerHTML = `${v.big}<small>${v.unit}</small>`
    $('#lab-rows').innerHTML = v.rows
      .map(([k, val]) => `<div class="lab-row"><span>${k}</span><span>${val}</span></div>`).join('')
    $('#lab-cfg').textContent = Object.entries(v.cfg).map(([k, val]) => `${k} ${val}`).join(' · ')
    const ex = getExercise({ balance: 'balance_sec', yoga: 'pose_holds' }[key] ?? key)
    $('#lab-quality').textContent = ex ? `기준: ${ex.quality}` : ''
  }

  function pick(k) {
    key = k
    lab = LABS[k]
    det = lab.make()
    app.querySelectorAll('.lab-pick').forEach(b => b.classList.toggle('on', b.dataset.k === k))
    paint()
  }

  app.querySelectorAll('.lab-pick').forEach(b => b.addEventListener('click', () => pick(b.dataset.k)))
  $('#lab-reset').addEventListener('click', () => { det = lab.make(); paint() })
  $('#lab-back').addEventListener('click', () => navigate('/'))
  paint()

  // ── 카메라 ────────────────────────────────────────────────
  poseEngineCore.acquire()
    .then(() => {
      detach = poseEngineCore.attach($('#lab-video'))
      unsub = poseEngineCore.onLandmarks(lms => {
        // **감지기는 초를 밖에서 받는다.** 안에서 시계를 읽으면 테스트를 못 쓴다.
        det.update(lms, performance.now() / 1000)   // 요가 채점기는 두 번째 인자를 무시한다
        overlay.draw(lms)
        const ok = isFullBodyVisible(lms)
        const el = $('#lab-body')
        el.className = ok ? 'ok' : 'no'
        el.textContent = ok ? '전신 보임' : '뒤로 물러나 주세요'
      })
      const loop = () => { paint(); raf = requestAnimationFrame(loop) }
      raf = requestAnimationFrame(loop)
    })
    .catch(e => { $('#lab-err').textContent = handErrorMessage(e) })

  onLeave(() => {
    if (raf) cancelAnimationFrame(raf)
    unsub?.()
    detach?.()
    overlay.destroy?.()
    if (!released) { released = true; poseEngineCore.release() }
  })
}

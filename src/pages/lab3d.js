// /lab3d — 3D 러너 **성능 게이트**. 개발용이다.
//
// ── 왜 게임보다 이걸 먼저 만드나 ★ ──────────────────────────
//
// 이 게임의 가장 큰 위험은 **MediaPipe와 GPU를 나눠 쓰는 것**이다. 포즈 인식도
// WebGL이고 three.js도 WebGL이다. 설계로는 장담할 수 없고 **재 봐야** 안다.
//
// 에셋을 발주한 뒤에 "기기에서 안 돌아간다"를 알면 그 그림들이 갈 곳이 없다.
// 그래서 도형만으로 먼저 재고, 통과한 다음에 발주한다.
//
// 통과 기준 (docs/10 §5)
//   렌더 55fps 이상 · 포즈 20fps 이상 · 손 커서 지연 체감 없음
//
// ── 곡률도 여기서 정한다 ─────────────────────────────────────
//
// 휨의 세기는 이 게임의 인상을 좌우하는데 **숫자로는 못 정한다.** 슬라이더로
// 돌려보며 눈으로 고르고, 그 값을 에셋 발주 기준으로 삼는다 —
// "이 각도에서 이렇게 보인다"가 있어야 블렌더에서 실루엣을 잡을 수 있다.

import { onLeave, navigate } from '../core/router.js'
import { poseEngineCore } from '../core/pose/poseEngine.js'
import { handErrorMessage } from '../core/handControl.js'
import { icon } from '../core/icons.js'
import { MoveDetector, MOVE } from '../core/pose/detectors/moves.js'
import { CURVE, kFromRadius, radiusFromK, dropAt, horizonDistance } from '../games/runner3d/curve.js'
import { VIEW, UNITS_PER_SPEED } from '../games/runner3d/scene.js'

export async function lab3dPage(app) {
  app.innerHTML = `
    <style>
      #l3, #l3 * { box-sizing: border-box; }
      #l3 {
        position: fixed; inset: 0; overflow: hidden;
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff; background: #10071f;
      }
      #l3-cv { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
      #l3-ui {
        position: absolute; left: 0; top: 0; z-index: 5;
        display: flex; flex-direction: column; gap: 8px;
        padding: 12px; width: min(340px, 92vw);
      }
      .l3-card {
        background: rgba(10,6,22,0.78); backdrop-filter: blur(8px);
        border: 2px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 12px 14px;
      }
      .l3-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 6px 0; }
      .l3-row .k { font-size: 0.78rem; color: #a78bda; font-weight: 800; }
      .l3-row .v { font-size: 1.05rem; font-weight: 900; font-variant-numeric: tabular-nums; }
      .v.ok { color: #6ee75a; } .v.bad { color: #ff6b6b; } .v.warn { color: #ffb36b; }
      .l3-btn {
        display: inline-flex; align-items: center; gap: 6px;
        min-height: 40px; padding: 0 14px; border-radius: 9999px;
        background: rgba(255,255,255,0.12); color: #fff; border: 2px solid rgba(255,255,255,0.24);
        font: inherit; font-weight: 800; font-size: 0.82rem; cursor: pointer;
      }
      .l3-btn.on { background: #ffd23e; color: #4a2a00; border-color: transparent; }
      #l3-slider { width: 100%; accent-color: #ffd23e; }
      #l3-note { font-size: 0.72rem; color: #8a7ab5; line-height: 1.5; }
      #l3-err { color: #ff9a9a; font-size: 0.78rem; }
      #l3-top { position: absolute; right: 12px; top: 12px; z-index: 6; display: flex; gap: 8px; align-items: flex-start; }
      #l3-hud {
        display: flex; align-items: center; gap: 12px; padding: 8px 16px;
        font-weight: 900; font-variant-numeric: tabular-nums;
      }
      #l3-score { color: #6ee75a; font-size: 1.1rem; }
      #l3-combo { color: #ffd23e; font-size: 0.8rem; }
      /* 맞으면 화면이 한 번 붉어진다. 목숨 숫자만 줄면 아이는 왜 줄었는지 모른다. */
      #l3-flash {
        position: absolute; inset: 0; z-index: 4; pointer-events: none;
        background: radial-gradient(120% 90% at 50% 60%, transparent 40%, rgba(255,60,60,0.55));
        opacity: 0; transition: opacity 0.25s;
      }
      #l3-flash.on { opacity: 1; transition: opacity 0.05s; }
    </style>

    <div id="l3">
      <canvas id="l3-cv"></canvas>
      <div id="l3-top">
        <div class="l3-card" id="l3-hud">
          <span id="l3-life"></span>
          <span id="l3-score">0</span>
          <span id="l3-combo"></span>
        </div>
        <button class="l3-btn" id="l3-back">${icon('back')} 나가기</button>
      </div>
      <div id="l3-flash"></div>
      <div id="l3-ui">
        <div class="l3-card">
          <div class="l3-row"><span class="k">렌더 FPS</span><span class="v" id="l3-fps">–</span></div>
          <div class="l3-row"><span class="k">포즈 FPS</span><span class="v" id="l3-pfps">꺼짐</span></div>
          <div class="l3-row"><span class="k">draw call</span><span class="v" id="l3-dc">–</span></div>
          <div class="l3-row"><span class="k">삼각형</span><span class="v" id="l3-tri">–</span></div>
          <div class="l3-row" style="margin-top:10px">
            <button class="l3-btn" id="l3-pose">${icon('camera')} 포즈 켜기</button>
            <button class="l3-btn" id="l3-dpr">DPR 1.5</button>
          </div>
          <div id="l3-err"></div>
        </div>

        <div class="l3-card">
          <div class="l3-row"><span class="k">휨 (보이는 반지름)</span><span class="v" id="l3-r">–</span></div>
          <input type="range" id="l3-slider" min="60" max="900" step="10" value="600" />
          <div id="l3-note"></div>
        </div>

        <div class="l3-card">
          <div class="l3-row"><span class="k">레벨 (속도·코스)</span><span class="v" id="l3-speed">LV1 · 1.00</span></div>
          <input type="range" id="l3-spd" min="0" max="4" step="1" value="0" />
          <div id="l3-note" style="margin-top:8px">← → 레인 · ↑ 점프 · ↓ 숙이기(누르고 있기)<br>A·S·D 자세(누르고 있기)</div>
        </div>
      </div>
    </div>
  `

  const $ = s => app.querySelector(s)
  const cv = $('#l3-cv')

  // three는 **여기서만** 부른다. 정적으로 import하면 허브 번들에 들어간다.
  const { createScene } = await import('../games/runner3d/scene.js')
  const view = createScene(cv)

  const fit = () => view.resize(cv.clientWidth, cv.clientHeight)
  fit()
  addEventListener('resize', fit)

  // ── 곡률 슬라이더 ──
  const slider = $('#l3-slider')
  const applyCurveUI = () => {
    const R = Number(slider.value)
    view.setCurve(kFromRadius(R))
    $('#l3-r').textContent = `R ${R}`
    const preview = 58   // 지금 게임의 예고 거리(유닛)
    const drop = dropAt(preview, kFromRadius(R)).toFixed(1)
    const realHorizon = horizonDistance(R, VIEW.camHeight).toFixed(0)
    $('#l3-note').innerHTML =
      `${preview}유닛 앞이 <b>${drop}유닛</b> 내려앉는다.<br>` +
      `진짜 구였다면 지평선이 <b>${realHorizon}유닛</b>에서 끊긴다 ` +
      `(필요한 건 ${preview}유닛 — ${realHorizon < preview ? '<b style="color:#ff8a8a">모자란다</b>' : '충분'}).`
  }
  slider.addEventListener('input', applyCurveUI)
  applyCurveUI()

  // ── 속도 ──
  const LEVEL_SPEEDS = [1.0, 1.15, 1.3, 1.45, 1.6]
  let speed = LEVEL_SPEEDS[0]
  $('#l3-spd').addEventListener('input', e => {
    const lv = Number(e.target.value)
    speed = LEVEL_SPEEDS[lv]
    $('#l3-speed').textContent = `LV${lv + 1} · ${speed.toFixed(2)}`
    // 코스도 같이 바꾼다. 속도만 바꾸면 장애물 간격이 그 레벨의 것이 아니다.
    view.setLevel(lv)
  })

  // ── DPR ──
  let dpr = Math.min(1.5, devicePixelRatio || 1)
  $('#l3-dpr').addEventListener('click', () => {
    dpr = dpr > 1.0 ? 1.0 : Math.min(1.5, devicePixelRatio || 1)
    view.setDpr(dpr)
    $('#l3-dpr').textContent = `DPR ${dpr}`
  })
  $('#l3-dpr').textContent = `DPR ${dpr}`

  // ── 포즈 — **켠 채로 재야 의미가 있다** ──
  let poseOn = false
  let poseFrames = 0
  let unsub = null
  let acquired = false
  $('#l3-pose').addEventListener('click', async () => {
    if (poseOn) {
      unsub?.(); unsub = null
      if (acquired) { poseEngineCore.release(); acquired = false }
      poseOn = false
      $('#l3-pose').classList.remove('on')
      $('#l3-pose').innerHTML = `${icon('camera')} 포즈 켜기`
      $('#l3-pfps').textContent = '꺼짐'
      $('#l3-pfps').className = 'v'
      return
    }
    try {
      await poseEngineCore.acquire()
      acquired = true
      // **감지기는 기존 것을 그대로 쓴다.** 3D용 감지기를 새로 만들면 문턱이
      // 두 벌이 되고, 같은 아이의 같은 점프가 게임마다 다르게 세어진다.
      const det = new MoveDetector()
      unsub = poseEngineCore.onLandmarks(lms => {
        poseFrames++
        const c = view.character
        if (!c) return
        const t = performance.now() / 1000
        for (const m of det.update(lms, t)) {
          // **운동량은 판정과 따로 센다.** 늦어서 맞았어도 몸은 움직였다.
          if (m === MOVE.JUMP) { c.jump(); view.run.record('jump') }
          else if (m === MOVE.SQUAT) {
            c.duck(true); setTimeout(() => c.duckEnd(), 400); view.run.record('duck')
          }
          else if (m === MOVE.LEFT) { c.moveLane(-1); view.run.record('side') }
          else if (m === MOVE.RIGHT) { c.moveLane(1); view.run.record('side') }
        }
      })
      poseOn = true
      $('#l3-pose').classList.add('on')
      $('#l3-pose').innerHTML = `${icon('camera')} 포즈 끄기`
      $('#l3-err').textContent = ''
    } catch (e) {
      $('#l3-err').textContent = handErrorMessage(e)
    }
  })

  // ── 판정 반응 ──
  const flash = $('#l3-flash')
  const hud = () => {
    const r = view.run
    // 목숨은 하트 그림으로. 숫자만 있으면 4~8세는 안 읽는다.
    $('#l3-life').innerHTML = Array.from({ length: 5 }, (_, i) =>
      `<span style="opacity:${i < r.lives ? 1 : 0.22}">${icon('heart')}</span>`).join('')
    $('#l3-score').textContent = r.score
    $('#l3-combo').textContent = r.combo > 1 ? `${r.combo} 연속` : ''
  }
  view.onResult(result => {
    if (result === 'hit') {
      flash.classList.add('on')
      setTimeout(() => flash.classList.remove('on'), 160)
    }
    hud()
  })
  hud()

  // ── 루프 ──
  let raf = null
  let last = performance.now()
  let frames = 0
  let acc = 0
  const grade = (el, v, good, ok) => {
    el.className = 'v ' + (v >= good ? 'ok' : v >= ok ? 'warn' : 'bad')
  }

  const loop = now => {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    view.update(dt, speed)
    view.render()

    frames++; acc += dt
    if (acc >= 0.5) {
      const fps = frames / acc
      const pfps = poseFrames / acc
      $('#l3-fps').textContent = fps.toFixed(0)
      grade($('#l3-fps'), fps, 55, 45)
      if (poseOn) {
        $('#l3-pfps').textContent = pfps.toFixed(0)
        grade($('#l3-pfps'), pfps, 20, 15)
      }
      $('#l3-dc').textContent = view.drawCalls
      $('#l3-tri').textContent = view.triangles.toLocaleString()
      frames = 0; poseFrames = 0; acc = 0
    }
  }
  raf = requestAnimationFrame(loop)

  // ── 키보드 — 레인과 점프를 눈으로 본다 ──
  // 0단계는 성능과 느낌을 보는 자리라 포즈로 조종하지 않는다.
  // 실제 조작은 2단계에서 기존 감지기를 그대로 붙인다.
  // 기존 러너와 같은 배치 (`CONFIG.pose.types` 순서)
  const POSE_KEY = { KeyA: 'lunge', KeyS: 'forwardbend', KeyD: 'armsopen' }

  const onKey = e => {
    const c = view.character
    if (!c) return
    // **`e.code`다** — 한글 입력기가 켜져 있으면 `e.key`가 'ㅁ'·'ㄴ'·'ㅇ'로 온다.
    // 방향키는 IME를 안 타서 멀쩡하니, 자세 키만 조용히 안 먹는다(`play3d.js`).
    if (e.code === 'ArrowLeft')  { e.preventDefault(); c.moveLane(-1); view.run.record('side') }
    if (e.code === 'ArrowRight') { e.preventDefault(); c.moveLane(1); view.run.record('side') }
    if (e.code === 'ArrowUp' || e.code === 'Space') { e.preventDefault(); c.jump(); view.run.record('jump') }
    // 숙이기는 **누르고 있는 동안** 유지된다. 허들 아래를 지나갈 시간이 필요하다.
    if (e.code === 'ArrowDown') { e.preventDefault(); if (!e.repeat) { c.duck(true); view.run.record('duck') } }
    // 자세는 **A·S·D**다 — 기존 러너의 키보드 모드와 같다(`screens.js`의 안내).
    // 게임마다 키가 다르면 아이가 매번 다시 배운다.
    const p = POSE_KEY[e.code]
    if (p) { e.preventDefault(); c.setPose(p) }
  }
  const onKeyUp = e => {
    const c = view.character
    if (!c) return
    if (e.code === 'ArrowDown') c.duckEnd()
    // 자세도 **누르고 있는 동안** 유지된다. 표지판을 지나갈 시간이 필요하다.
    if (POSE_KEY[e.code]) c.setPose(null)
  }
  addEventListener('keydown', onKey)
  addEventListener('keyup', onKeyUp)

  $('#l3-back').addEventListener('click', () => navigate('/'))

  // **정리는 라우터의 onLeave로 한다.** 페이지가 hashchange를 직접 들으면
  // 이미 #app이 비워진 뒤에 정리가 돈다 (CLAUDE.md 규칙).
  onLeave(() => {
    cancelAnimationFrame(raf)
    removeEventListener('resize', fit)
    removeEventListener('keydown', onKey)
    removeEventListener('keyup', onKeyUp)
    unsub?.()
    if (acquired) poseEngineCore.release()
    view.dispose()
  })
}

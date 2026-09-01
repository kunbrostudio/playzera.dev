// /labhands — 주먹(Fist) 인식 성능·감각 측정. **개발용이다. 아이가 보는 화면이 아니다.**
//
// ── 왜 만드나 ★ ─────────────────────────────────────────────
//
// ken이 "손이 머물 때는 로딩(머무르기 링)이 뜨지 않고, 주먹을 쥐면 로딩이 떠서
// 클릭이 되게" 해달라고 했다. 그러려면 손가락 모양을 봐야 하는데, 지금
// `core/pointer.js`는 손목(포즈 모델)만 쓴다 — "Hands 모델을 얹으면 프레임이
// 절반이 된다"고 이미 주석에 적혀 있다.
//
// **고치기 전에 잰다.** 포즈만 켰을 때와 포즈+주먹인식을 같이 켰을 때 FPS가
// 실제로 얼마나 떨어지는지, 그리고 주먹 인식 자체가 실전에서 쓸 만한 지연·
// 정확도로 잡히는지를 먼저 본다. 실측 결과(포즈와 FPS 차이 없음, 점수 0.90대)로
// `pointer.js`에 정식으로 붙였다 — 이 화면은 이제 **회귀 확인용**이다.
//
// `core/pose/fistEngine.js`(GestureRecognizer)를 **직접** 쓴다. 여기서만 쓰는
// 별도 로딩 코드를 두면 이 화면이 잰 것과 실제로 배포되는 것이 다른 경로가
// 될 수 있다 — pointer.js와 같은 엔진을 봐야 이 화면의 숫자가 의미 있다.
//
// ── 왜 화면을 따로 만드나 ──────────────────────────────────
//
// 게임에 먼저 붙이면 느려지거나 안 잡힐 때 원인이 카메라인지 판정인지 알 수
// 없다. `#/lab3d`가 포즈+3D를 같이 재는 자리인 것과 같은 이유다.
//
// ── 읽는 법 ────────────────────────────────────────────────
//
// 1) "포즈만" FPS를 먼저 본다 — 지금 게임들이 실제로 받는 프레임이다.
// 2) "주먹인식 켜기"를 누르고 카메라 앞에서 주먹을 쥐었다 폈다 해본다.
// 3) "포즈+주먹인식" FPS가 얼마나 떨어지는지, 링이 자연스럽게 차는지를 본다.

import { onLeave, navigate } from '../core/router.js'
import { poseEngineCore } from '../core/pose/poseEngine.js'
import { fistEngineCore, FIST_SCORE_MIN } from '../core/pose/fistEngine.js'
import { handErrorMessage } from '../core/handControl.js'
import { icon } from '../core/icons.js'

// pointer.js의 머무르기(DEFAULT_DWELL_MS 1200)와 같은 감각으로 맞춰본다 —
// 실전과 비교하려면 이 느낌이어야 한다. 주먹은 이미 확실한 의사표시라
// 머무르기보다 짧게 잡아 시험해본다. **여기서 정한 숫자는 어림값이다.**
const HOLD_MS = 700
const HOLD_DECAY = 0.6        // tuning.js GESTURE 계열과 같은 감소율(dt × 0.6)

export async function labhandsPage(app) {
  app.innerHTML = `
    <style>
      #lh, #lh * { box-sizing: border-box; }
      #lh {
        position: fixed; inset: 0; overflow-y: auto; color: #fff;
        font-family: var(--font-main, 'Jua', sans-serif);
        background: linear-gradient(180deg, #241238 0%, #0b0616 100%);
        padding: clamp(12px, 2.4vh, 24px);
      }
      #lh-in { width: min(1100px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
      .lh-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .lh-btn {
        display: inline-flex; align-items: center; gap: 6px;
        min-height: 40px; padding: 0 14px; border-radius: 9999px;
        background: rgba(255,255,255,0.1); color: #fff; cursor: pointer;
        border: 2px solid rgba(255,255,255,0.2); font: inherit; font-weight: 800; font-size: 0.86rem;
      }
      .lh-btn.on { background: #ffd23e; color: #4a2a00; border-color: transparent; }
      .lh-btn:disabled { opacity: 0.45; cursor: default; }
      .lh-tag { margin-left: auto; font-size: 0.76rem; font-weight: 800; color: #c9a6ff; }

      #lh-grid { display: grid; gap: 14px; grid-template-columns: minmax(0,1.1fr) minmax(0,1fr); }
      @media (max-width: 900px) { #lh-grid { grid-template-columns: minmax(0,1fr); } }
      .lh-card {
        background: rgba(255,255,255,0.06); border: 2px solid rgba(255,255,255,0.14);
        border-radius: 18px; padding: 14px;
      }
      .lh-h { font-size: 0.8rem; font-weight: 800; color: #c9a6ff; margin-bottom: 10px; letter-spacing: 0.02em; }

      #lh-cam { position: relative; width: 100%; border-radius: 12px; overflow: hidden; background: #000; transform: scaleX(-1); }
      #lh-cam video { display: block; width: 100%; height: auto; }
      #lh-cam canvas { position: absolute; inset: 0; width: 100%; height: 100%; }

      .lh-row { display: flex; justify-content: space-between; gap: 10px; font-size: 0.86rem; font-weight: 800; padding: 4px 0; }
      .lh-row span:last-child { color: #ffd23e; text-align: right; font-variant-numeric: tabular-nums; }
      .v.ok { color: #6ee75a !important; } .v.bad { color: #ff6b6b !important; } .v.warn { color: #ffb36b !important; }
      .lh-sub { font-size: 0.72rem; color: #b7a4d6; line-height: 1.6; margin-top: 10px; word-break: keep-all; }
      #lh-err { color: #ff9a9a; font-weight: 800; font-size: 0.82rem; }

      /* 실제 pointer.js 커서 링과 같은 모양 — 여기서 본 느낌이 그대로 실전 느낌이다 */
      #lh-ring-wrap { display: flex; align-items: center; justify-content: center; padding: 10px 0 4px; }
      #lh-ring { width: 120px; height: 120px; }
      #lh-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
      .lh-ring-track { fill: rgba(255,255,255,0.08); stroke: rgba(255,255,255,0.4); stroke-width: 5; }
      .lh-ring-arc { fill: none; stroke: #ffd23e; stroke-width: 8; stroke-linecap: round; stroke-dasharray: 264; stroke-dashoffset: 264; transition: stroke-dashoffset 0.05s linear; }
      #lh-ring.fired .lh-ring-arc { stroke: #6ee75a; }
      #lh-gesture { text-align: center; font-size: 1.1rem; font-weight: 900; margin-top: 6px; }
      #lh-fired { text-align: center; font-size: 0.8rem; font-weight: 800; color: #6ee75a; min-height: 1.4em; }
    </style>

    <div id="lh"><div id="lh-in">
      <div class="lh-top">
        <button class="lh-btn" id="lh-back">← 홈으로</button>
        <button class="lh-btn" id="lh-hands">${icon('camera')} 주먹인식 켜기</button>
        <span class="lh-tag">개발용 · 주먹 인식 성능 측정</span>
      </div>
      <div id="lh-err"></div>

      <div id="lh-grid">
        <div class="lh-card">
          <div class="lh-h">보이는 것</div>
          <div id="lh-cam"><video id="lh-video" muted playsinline></video><canvas id="lh-canvas"></canvas></div>
          <div class="lh-sub">카메라 앞에서 주먹을 쥐었다 폈다 해본다. 점(원)이 손 중심이고,
            초록이면 지금 프레임에서 주먹으로 인식된 상태다.</div>
        </div>

        <div class="lh-card">
          <div class="lh-h">FPS — 포즈만 vs 포즈+주먹인식</div>
          <div class="lh-row"><span>포즈 FPS</span><span class="v" id="lh-pfps">–</span></div>
          <div class="lh-row"><span>주먹인식 FPS</span><span class="v" id="lh-gfps">꺼짐</span></div>
          <div class="lh-row"><span>추론 장치</span><span id="lh-delegate">–</span></div>
          <div class="lh-sub">
            게임 화면은 이미 포즈를 돌리고 있다. "포즈 FPS"가 지금 게임이 실제로
            받는 값이고, 주먹인식을 켰을 때 그게 얼마나 떨어지는지가 이 기능을
            붙일지 말지의 기준이다. (통과 기준 어림: 20fps 이상 유지)
          </div>

          <div class="lh-h" style="margin-top:14px">주먹 인식 결과</div>
          <div class="lh-row"><span>제스처</span><span id="lh-gesture-name">–</span></div>
          <div class="lh-row"><span>점수 (문턱 ${FIST_SCORE_MIN})</span><span id="lh-score">–</span></div>
          <div id="lh-ring-wrap">
            <div id="lh-ring">
              <svg viewBox="0 0 100 100">
                <circle class="lh-ring-track" cx="50" cy="50" r="42" />
                <circle class="lh-ring-arc" cx="50" cy="50" r="42" />
              </svg>
            </div>
          </div>
          <div id="lh-gesture">–</div>
          <div id="lh-fired"></div>
        </div>
      </div>
    </div></div>
  `

  const $ = q => app.querySelector(q)

  let poseUnsub = null
  let poseAttached = false
  let poseFrames = 0
  let gestureFrames = 0
  let raf = null
  let acc = 0
  let last = performance.now()

  let gestureOn = false
  let fistUnsub = null
  let fistAcquired = false
  let latestFist = { isFist: false, score: 0, gestureName: null, landmarks: null }
  let hold = 0
  let firedCount = 0
  let firedFlashUntil = 0
  let released = false
  let detach = null

  const grade = (el, v, good, ok) => {
    el.className = 'v ' + (v >= good ? 'ok' : v >= ok ? 'warn' : 'bad')
  }

  const setRing = p => { $('.lh-ring-arc', $('#lh-ring')).style.strokeDashoffset = String(264 * (1 - p)) }

  const canvas = $('#lh-canvas')
  const ctx = canvas.getContext('2d')
  function resizeCanvas() {
    const v = $('#lh-video')
    canvas.width = v.videoWidth || v.clientWidth || 320
    canvas.height = v.videoHeight || v.clientHeight || 240
  }

  function drawHand(landmarks, isFist) {
    resizeCanvas()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!landmarks) return
    // 손 중심 = 21개 랜드마크 평균. 좌표는 컨테이너가 이미 scaleX(-1)로
    // 통째로 뒤집혀 있어 여기선 원본 좌표를 그대로 쓴다(labcam과 같은 방식).
    let cx = 0, cy = 0
    for (const p of landmarks) { cx += p.x; cy += p.y }
    cx = (cx / landmarks.length) * canvas.width
    cy = (cy / landmarks.length) * canvas.height
    ctx.beginPath()
    ctx.arc(cx, cy, 26, 0, Math.PI * 2)
    ctx.fillStyle = isFist ? 'rgba(110,231,90,0.55)' : 'rgba(255,255,255,0.35)'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = isFist ? '#6ee75a' : '#fff'
    ctx.stroke()
  }

  // ── 포즈 (항상 켬 — 실제 게임과 같은 조건에서 재야 의미가 있다) ──
  try {
    await poseEngineCore.acquire()
    poseAttached = true
    detach = poseEngineCore.attach($('#lh-video'))
    poseUnsub = poseEngineCore.onLandmarks(() => { poseFrames++ })
    $('#lh-delegate').textContent = poseEngineCore.delegate ?? '–'
  } catch (e) {
    $('#lh-err').textContent = handErrorMessage(e)
  }

  // ── 주먹 인식 켜기/끄기 — pointer.js와 같은 fistEngineCore를 빌린다 ──
  $('#lh-hands').addEventListener('click', async () => {
    if (gestureOn) {
      gestureOn = false
      fistUnsub?.(); fistUnsub = null
      if (fistAcquired) { fistEngineCore.release(); fistAcquired = false }
      $('#lh-hands').classList.remove('on')
      $('#lh-hands').innerHTML = `${icon('camera')} 주먹인식 켜기`
      $('#lh-gfps').textContent = '꺼짐'
      $('#lh-gfps').className = 'v'
      $('#lh-gesture-name').textContent = '–'
      $('#lh-score').textContent = '–'
      $('#lh-gesture').textContent = '–'
      latestFist = { isFist: false, score: 0, gestureName: null, landmarks: null }
      hold = 0; setRing(0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }
    $('#lh-hands').disabled = true
    $('#lh-err').textContent = ''
    try {
      await fistEngineCore.acquire()
      fistAcquired = true
      fistUnsub = fistEngineCore.onFist(r => { latestFist = r; gestureFrames++ })
      gestureOn = true
      $('#lh-hands').classList.add('on')
      $('#lh-hands').innerHTML = `${icon('camera')} 주먹인식 끄기`
    } catch (e) {
      $('#lh-err').textContent = `주먹 인식 모델을 못 불러왔다 — ${e?.message ?? e}`
    } finally {
      $('#lh-hands').disabled = false
    }
  })

  // ── 루프 — 실제 판정은 fistEngineCore 안 루프에서 돈다. 여기선 그 결과를
  //          그리고, pointer.js와 같은 감각의 hold 링·FPS만 집계한다.
  function loop(now) {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    if (gestureOn) {
      const { isFist, score, gestureName, landmarks } = latestFist
      drawHand(landmarks, isFist)
      $('#lh-gesture-name').textContent = gestureName ?? '(손 없음)'
      $('#lh-score').textContent = gestureName ? score.toFixed(2) : '–'

      // ── 머무르기(dwell)와 같은 감각의 hold 링 ──
      if (isFist) {
        hold = Math.min(HOLD_MS / 1000, hold + dt)
      } else {
        hold = Math.max(0, hold - dt * HOLD_DECAY)
      }
      const progress = hold / (HOLD_MS / 1000)
      setRing(progress)
      $('#lh-ring').classList.toggle('fired', progress >= 1)
      $('#lh-gesture').textContent = isFist ? '✊ 주먹' : '(주먹 아님)'

      if (progress >= 1) {
        firedCount++
        firedFlashUntil = now + 900
        hold = 0
        setRing(0)
      }
      $('#lh-fired').textContent = now < firedFlashUntil
        ? `확정! (${firedCount}번째)`
        : (firedCount ? `지금까지 ${firedCount}번 확정` : '')
    }

    acc += dt
    if (acc >= 0.5) {
      const pfps = poseFrames / acc
      $('#lh-pfps').textContent = pfps.toFixed(0)
      grade($('#lh-pfps'), pfps, 20, 15)
      if (gestureOn) {
        const gfps = gestureFrames / acc
        $('#lh-gfps').textContent = gfps.toFixed(0)
        grade($('#lh-gfps'), gfps, 20, 15)
      }
      poseFrames = 0; gestureFrames = 0; acc = 0
    }
  }
  raf = requestAnimationFrame(loop)

  $('#lh-back').addEventListener('click', () => navigate('/'))

  onLeave(() => {
    if (raf) cancelAnimationFrame(raf)
    poseUnsub?.()
    detach?.()
    if (poseAttached && !released) { released = true; poseEngineCore.release() }
    fistUnsub?.(); fistUnsub = null
    if (fistAcquired) { fistEngineCore.release(); fistAcquired = false }
  })
}

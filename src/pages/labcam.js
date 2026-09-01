// /labcam — 카메라 실측 화면. **개발용이다. 아이가 보는 화면이 아니다.**
//
// ── 무엇을 재나 ★ ──────────────────────────────────────────
//
// 180cm 어른이 전신 통과를 받으려면 2.6m를 물러서야 했다. 그게 불편해서
// "줌아웃"을 떠올렸지만 **소프트웨어 줌아웃은 없다** — 렌즈가 안 담은 것은
// 어디에도 없다. 담기는 범위를 늘리는 길은 둘뿐이다.
//
//   1. 종횡비를 바꾼다   — 세로(9:16)로 세우면 세로 화각이 넓어진다 (계산상 1.78배)
//   2. 요구를 줄인다     — 그 게임이 진짜 쓰는 관절만 본다   (계산상 2.2배)
//
// 둘 다 **계산일 뿐이다.** 기기가 요청한 종횡비를 정말 주는지, 센서를 어느 쪽으로
// 자르는지는 기기마다 다르다. 여기서 재고 나서 준비 화면을 고친다.
//
// ── 왜 화면을 따로 만드나 ──────────────────────────────────
//
// 게임에 먼저 붙이면 안 통과될 때 원인이 카메라인지 판정인지 알 수 없다.
// `#/lab`이 감지기를 벗겨 놓고 보는 자리인 것과 같은 이유다.
//
// ── 읽는 법 ────────────────────────────────────────────────
//
// **한 자리에 서서 종횡비만 바꿔가며 "지금 기록"을 누른다.**
// 비교할 숫자는 `몸 높이` 하나다 — 프레임 세로에서 코~발목이 차지하는 비율.
// 같은 자리에서 이 값이 작아졌으면 그만큼 화각이 넓어진 것이고,
// 그 비율이 곧 "얼마나 덜 물러서도 되나"다.

import { onLeave, navigate } from '../core/router.js'
import { poseEngineCore, isFullBodyVisible, LM } from '../core/pose/poseEngine.js'
import { createPipOverlay } from '../core/pose/pipOverlay.js'
import { handErrorMessage } from '../core/handControl.js'
import { requiredPoints, checkPoints } from '../core/pose/requirements.js'
import { getAll } from '../games/registry.js'

// 재볼 종횡비. **해상도가 아니라 종횡비가 화각을 정한다** —
// 640×360도 1280×720도 담기는 범위는 같다. 그래서 비율별로만 재면 된다.
const SHAPES = [
  { key: '16:9', label: '가로 16:9', c: { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } } },
  { key: '4:3', label: '가로 4:3', c: { width: { ideal: 960 }, height: { ideal: 720 }, aspectRatio: { ideal: 4 / 3 } } },
  { key: '1:1', label: '정사각 1:1', c: { width: { ideal: 720 }, height: { ideal: 720 }, aspectRatio: { ideal: 1 } } },
  { key: '3:4', label: '세로 3:4', c: { width: { ideal: 720 }, height: { ideal: 960 }, aspectRatio: { ideal: 3 / 4 } } },
  { key: '9:16', label: '세로 9:16', c: { width: { ideal: 720 }, height: { ideal: 1280 }, aspectRatio: { ideal: 9 / 16 } } },
  // 아무것도 안 걸면 기기가 제일 잘 주는 것이 온다. 위의 것들과 견주는 기준선이다.
  { key: 'auto', label: '제약 없음', c: { width: undefined, height: undefined, aspectRatio: undefined } },
]

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 })
const n2 = v => (Number.isFinite(v) ? v.toFixed(2) : '—')
const n3 = v => (Number.isFinite(v) ? v.toFixed(3) : '—')

// 화면 좌표에서 몸이 프레임 세로를 얼마나 차지하나 (0~1). **비교의 기준값이다.**
function bodySpan(lms) {
  if (!lms) return null
  const nose = lms[LM.NOSE]
  const la = lms[LM.L_ANKLE], ra = lms[LM.R_ANKLE]
  if (!nose || !la || !ra) return null
  return Math.abs(mid(la, ra).y - nose.y)
}

// 미터 좌표로 잰 몸 길이. 이게 오면 발목이 화면 밖이어도 몸 크기를 알 수 있고,
// 그러면 `scale` 요구를 통째로 뺄 수 있다 — **이번 측정의 핵심 질문.**
function worldSpan(w) {
  if (!w || !w.length) return null
  const nose = w[LM.NOSE], la = w[LM.L_ANKLE], ra = w[LM.R_ANKLE]
  if (!nose || !la || !ra) return null
  const a = mid(la, ra)
  return Math.hypot(a.x - nose.x, a.y - nose.y, (a.z ?? 0) - (nose.z ?? 0))
}

export function labcamPage(app) {
  const games = getAll().filter(m => Array.isArray(m.detectors) && m.detectors.length)
  let shape = SHAPES[0]
  let busy = false
  let rows = []            // 기록해 둔 줄
  let unsub = null, detach = null, raf = null, released = false
  let lms = null

  app.innerHTML = `
    <style>
      #lc, #lc * { box-sizing: border-box; }
      #lc {
        position: fixed; inset: 0; overflow-y: auto; color: #fff;
        font-family: var(--font-main, 'Jua', sans-serif);
        background: linear-gradient(180deg, #12233f 0%, #070f1e 100%);
        padding: clamp(12px, 2.4vh, 24px);
      }
      #lc-in { width: min(1180px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
      .lc-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .lc-btn {
        min-height: 40px; padding: 0 14px; border-radius: 9999px;
        background: rgba(255,255,255,0.1); color: #fff; cursor: pointer;
        border: 2px solid rgba(255,255,255,0.2); font: inherit; font-weight: 800; font-size: 0.86rem;
      }
      .lc-btn.on { background: #48d1c0; color: #04302b; border-color: transparent; }
      .lc-btn:disabled { opacity: 0.45; cursor: default; }
      .lc-tag { margin-left: auto; font-size: 0.76rem; font-weight: 800; color: #ffb86b; }

      #lc-grid { display: grid; gap: 14px; grid-template-columns: minmax(0,1fr) minmax(0,1fr) minmax(0,1fr); }
      @media (max-width: 1000px) { #lc-grid { grid-template-columns: minmax(0,1fr); } }
      .lc-card {
        background: rgba(255,255,255,0.06); border: 2px solid rgba(255,255,255,0.12);
        border-radius: 18px; padding: 14px;
      }
      .lc-h { font-size: 0.8rem; font-weight: 800; color: #48d1c0; margin-bottom: 10px; letter-spacing: 0.02em; }

      /* 미리보기 상자는 **비율을 고정하지 않는다.** 16:9 상자에 세로 영상을 넣으면
         잘려 보여서, 넓어진 화각을 눈으로 확인할 수가 없다.
         준비 화면의 rdy-pip이 지금 그 상태다 (aspect-ratio 16/9 고정) — 고칠 자리다 */
      #lc-cam { position: relative; width: 100%; border-radius: 12px; overflow: hidden; background: #000; }
      #lc-cam video { display: block; width: 100%; height: auto; transform: scaleX(-1); }
      #lc-cam canvas { position: absolute; inset: 0; width: 100%; height: 100%; }

      .lc-row { display: flex; justify-content: space-between; gap: 10px; font-size: 0.82rem; font-weight: 800; padding: 3px 0; }
      .lc-row span:last-child { color: #ffd23e; text-align: right; }
      .lc-row.no span:last-child { color: #ff8a8a; }
      .lc-row.ok span:last-child { color: #7ee787; }
      .lc-sub { font-size: 0.72rem; color: #8aa4c8; line-height: 1.6; margin-top: 10px; word-break: keep-all; }

      #lc-big { font-size: clamp(2.4rem, 8vw, 3.6rem); font-weight: 900; line-height: 1; color: #48d1c0; }
      #lc-big small { font-size: 0.26em; color: #8aa4c8; margin-left: 6px; }

      table.lc-t { width: 100%; border-collapse: collapse; font-size: 0.76rem; font-weight: 800; }
      table.lc-t th, table.lc-t td { padding: 5px 6px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.1); white-space: nowrap; }
      table.lc-t th:first-child, table.lc-t td:first-child { text-align: left; }
      table.lc-t th { color: #8aa4c8; font-size: 0.7rem; }
      table.lc-t td.win { color: #7ee787; }
      #lc-err { color: #ff8a8a; font-weight: 800; }
    </style>

    <div id="lc"><div id="lc-in">
      <div class="lc-top">
        <button class="lc-btn" id="lc-back">← 홈으로</button>
        ${SHAPES.map(s => `<button class="lc-btn lc-shape" data-k="${s.key}">${s.label}</button>`).join('')}
        <span class="lc-tag">개발용 · 카메라 실측</span>
      </div>

      <div id="lc-grid">
        <div class="lc-card">
          <div class="lc-h">보이는 것</div>
          <div id="lc-cam"><video id="lc-video" muted playsinline></video><canvas id="lc-canvas"></canvas></div>
          <div id="lc-err"></div>
          <div class="lc-sub">
            상자에 비율을 안 걸었다. 세로로 열리면 화면도 세로로 길어진다 —
            그게 안 보이면 실제로 세로로 안 열린 것이다.
          </div>
        </div>

        <div class="lc-card">
          <div class="lc-h">몸 높이 · 프레임 세로 대비</div>
          <div id="lc-big">—<small></small></div>
          <div id="lc-metrics" style="margin-top:10px"></div>
          <div class="lc-sub">
            <b>같은 자리에서</b> 종횡비만 바꿔 비교한다. 이 값이 절반이 되면
            같은 통과 기준을 절반 거리에서 받는다는 뜻이다.
          </div>
          <div class="lc-h" style="margin-top:14px">카메라가 실제로 준 것</div>
          <div id="lc-cam-info"></div>
        </div>

        <div class="lc-card">
          <div class="lc-h">지금 이 자리에서 통과되는 게임</div>
          <div id="lc-games"></div>
          <div class="lc-sub">
            <b>크기 뺌</b>은 몸 크기를 미터 좌표로 알 수 있다고 쳤을 때다.
            그 칸이 줄줄이 통과로 바뀌면 발목 요구를 없애는 것이 답이라는 뜻이다.
          </div>
        </div>
      </div>

      <div class="lc-card">
        <div class="lc-h" style="display:flex;align-items:center;gap:10px">
          <span>기록</span>
          <button class="lc-btn" id="lc-rec" style="min-height:32px;font-size:0.78rem">지금 기록</button>
          <button class="lc-btn" id="lc-clr" style="min-height:32px;font-size:0.78rem">비우기</button>
        </div>
        <div id="lc-table"></div>
      </div>
    </div></div>
  `

  const $ = q => app.querySelector(q)
  const overlay = createPipOverlay($('#lc-canvas'), { zones: false })

  // ── 그리기 ──────────────────────────────────────────────
  const rowHtml = (k, v, cls = '') => `<div class="lc-row ${cls}"><span>${k}</span><span>${v}</span></div>`

  function paintMetrics() {
    const span = bodySpan(lms)
    const w = worldSpan(poseEngineCore.lastWorld)
    $('#lc-big').innerHTML = span == null ? '—<small></small>' : `${n3(span)}<small>× 프레임 세로</small>`

    const nose = lms?.[LM.NOSE]
    const la = lms?.[LM.L_ANKLE], ra = lms?.[LM.R_ANKLE]
    $('#lc-metrics').innerHTML = [
      rowHtml('전신 통과 (지금 기준)', isFullBodyVisible(lms) ? '통과' : '못함',
        isFullBodyVisible(lms) ? 'ok' : 'no'),
      rowHtml('머리 위 여백', nose ? n3(nose.y) : '—'),
      rowHtml('발 아래 여백', la && ra ? n3(1 - mid(la, ra).y) : '—'),
      rowHtml('미터 좌표(world)', w == null ? '안 옴' : `${n2(w)} m`, w == null ? 'no' : 'ok'),
    ].join('')
  }

  function paintCam() {
    const st = poseEngineCore.settings
    const cap = poseEngineCore.capabilities
    const zoom = cap?.zoom
    $('#lc-cam-info').innerHTML = [
      rowHtml('요청', shape.label),
      rowHtml('실제', st ? `${st.width}×${st.height}` : '—'),
      // 요청한 비율과 다르게 열렸으면 그것부터가 결론이다 — 세로를 요청했는데
      // 가로가 오면 이 기기는 세로 스트림을 안 준다는 뜻이고, 그러면 방향은
      // 화면(CSS)에서만 풀어야 한다.
      rowHtml('실제 비율', st?.width ? `${n2(st.width / st.height)} (${st.width >= st.height ? '가로' : '세로'})` : '—'),
      rowHtml('프레임률', st?.frameRate ? `${Math.round(st.frameRate)} fps` : '—'),
      rowHtml('줌 지원', zoom ? `${zoom.min}~${zoom.max}` : '없음', zoom ? 'ok' : 'no'),
      rowHtml('추론', poseEngineCore.delegate ?? '—'),
    ].join('')
  }

  function paintGames() {
    $('#lc-games').innerHTML = games.map(m => {
      const full = checkPoints(lms, requiredPoints(m.detectors, { withScale: true }))
      const lean = checkPoints(lms, requiredPoints(m.detectors, { withScale: false }))
      const mark = r => (r.ok ? '통과' : (r.side === 'bottom' ? '아래 잘림' : r.side === 'top' ? '위 잘림' : '못함'))
      return rowHtml(m.title, `${mark(full)} / <b>${mark(lean)}</b>`, lean.ok ? 'ok' : 'no')
    }).join('') + `<div class="lc-row" style="opacity:0.6"><span>지금 요구 / 크기 뺌</span><span></span></div>`
  }

  function paintTable() {
    if (!rows.length) {
      $('#lc-table').innerHTML = `<div class="lc-sub">한 자리에 서서 종횡비를 바꿔가며 눌러 담는다.</div>`
      return
    }
    // 제일 작은 몸 높이가 제일 넓은 화각이다 — 그 줄을 초록으로
    const best = Math.min(...rows.map(r => r.span ?? Infinity))
    $('#lc-table').innerHTML = `
      <table class="lc-t">
        <tr><th>종횡비</th><th>실제 해상도</th><th>몸 높이</th><th>16:9 대비</th><th>미터</th><th>전신</th></tr>
        ${rows.map(r => `<tr>
          <td>${r.label}</td>
          <td>${r.res}</td>
          <td class="${r.span === best ? 'win' : ''}">${n3(r.span)}</td>
          <td>${r.vs ? `${n2(r.vs)}배` : '—'}</td>
          <td>${r.world == null ? '—' : `${n2(r.world)} m`}</td>
          <td>${r.full ? '통과' : '못함'}</td>
        </tr>`).join('')}
      </table>`
  }

  function paintShapes() {
    app.querySelectorAll('.lc-shape').forEach(b => {
      b.classList.toggle('on', b.dataset.k === shape.key)
      b.disabled = busy
    })
  }

  // ── 종횡비 바꾸기 ────────────────────────────────────────
  async function pick(key) {
    const s = SHAPES.find(x => x.key === key)
    if (!s || busy) return
    shape = s
    busy = true
    paintShapes()
    $('#lc-err').textContent = ''
    try {
      await poseEngineCore.reopen(s.c)
    } catch (e) {
      $('#lc-err').textContent = `${s.label}로는 못 열었다 — ${e?.name ?? e}`
    } finally {
      busy = false
      paintShapes()
      paintCam()
    }
  }

  function record() {
    const st = poseEngineCore.settings
    const span = bodySpan(lms)
    const base = rows.find(r => r.key === '16:9')?.span
    rows = rows.filter(r => r.key !== shape.key).concat({
      key: shape.key,
      label: shape.label,
      res: st ? `${st.width}×${st.height}` : '—',
      span,
      world: worldSpan(poseEngineCore.lastWorld),
      full: isFullBodyVisible(lms),
      vs: base && span ? base / span : null,
    })
    // 16:9를 나중에 담아도 대비가 맞도록 다시 계산한다
    const b = rows.find(r => r.key === '16:9')?.span
    rows = rows.map(r => ({ ...r, vs: b && r.span ? b / r.span : null }))
    rows.sort((a, c) => SHAPES.findIndex(s => s.key === a.key) - SHAPES.findIndex(s => s.key === c.key))
    paintTable()
  }

  app.querySelectorAll('.lc-shape').forEach(b => b.addEventListener('click', () => pick(b.dataset.k)))
  $('#lc-rec').addEventListener('click', record)
  $('#lc-clr').addEventListener('click', () => { rows = []; paintTable() })
  $('#lc-back').addEventListener('click', () => navigate('/'))
  paintShapes(); paintTable(); paintMetrics(); paintCam(); paintGames()

  // ── 카메라 ──────────────────────────────────────────────
  poseEngineCore.acquire()
    .then(() => {
      detach = poseEngineCore.attach($('#lc-video'))
      unsub = poseEngineCore.onLandmarks(l => { lms = l; overlay.draw(l) })
      const loop = () => {
        paintMetrics(); paintGames()
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
      paintCam()
    })
    .catch(e => { $('#lc-err').textContent = handErrorMessage(e) })

  onLeave(() => {
    if (raf) cancelAnimationFrame(raf)
    unsub?.()
    detach?.()
    overlay.destroy?.()
    if (!released) { released = true; poseEngineCore.release() }
  })
}

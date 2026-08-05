// 카메라 준비 화면 — 모든 게임이 같이 쓴다.
//
// 원래는 웜업에만 있었다(`screens.js`의 `showCameraSetup`). 똥 피하기는 준비 화면
// 없이 카메라를 열고 실패하면 **조용히 키보드로 떨어졌다.** 아이는 왜 몸이 안
// 먹히는지 알 길이 없었고, 화면에 너무 가까이 서 있는 게 원인이어도 알 수 없었다.
//
// 이 화면이 하는 일은 하나다 — **몸이 다 보이는 자리에 서게 하는 것.**
//
//   전신이 안 보임 → 빨강 + "뒤로 물러나 주세요"
//   전신이 보임   → 초록 + "좋아요" + O를 들면 시작
//   카메라가 안 됨 → 이유를 적고 키보드로 갈 수 있게
//
// 웜업 것을 그대로 옮기지 않고 다시 썼다. 그쪽은 `style.css`(html/body를 덮어쓴다)와
// `.screen`·`.pip-slot` 같은 클래스에 얽혀 있어서, 가져오면 웜업 CSS가 딸려 온다.
// 여기서는 core만 쓴다 — poseEngineCore · gesture · tuning.

import { poseEngineCore, isFullBodyVisible, isPoseSupported, poseUnsupportedReason } from './pose/poseEngine.js'
import { createPipOverlay } from './pose/pipOverlay.js'
import { isArmsUpCircle, isArmsUpCross, GestureHold } from './pose/gesture.js'
import { GESTURE } from './pose/tuning.js'
import { handErrorMessage } from './handControl.js'

// 빨강↔초록이 경계에서 깜빡이지 않도록, 바뀐 상태가 이만큼 유지될 때만 전환한다.
// (웜업에서 현장 검증된 값이다 — 0.1초로 줄이면 눈에 띄게 떨린다)
export const BODY_SETTLE_SEC = 0.3

/**
 * 카메라 준비 화면을 띄우고, 아이가 고른 결과를 돌려준다.
 *
 * @param {HTMLElement} app  화면을 그릴 컨테이너 (#app)
 * @param {object} opts
 * @param {string}   opts.title      화면 제목
 * @param {boolean}  opts.showZones  3분할 선을 PIP에 그릴지 (좌우 이동 게임이면 true)
 * @returns {Promise<{mode:'motion'|'keyboard'|'back', release:Function}>}
 *
 * ⚠️ **`release()`를 반드시 부른다.** 이 화면은 카메라 참조를 하나 들고 끝난다.
 *    끄지 않고 넘기는 이유는 다음 화면(게임)이 같은 스트림을 이어 쓰기 위해서다 —
 *    여기서 먼저 놓으면 참조가 0이 되어 카메라가 껐다 켜지고, 그 사이 권한 표시등이
 *    깜빡이며 첫 라운드가 버벅인다.
 *
 *    게임이 `acquire()`한 **뒤에** 부르면 참조가 1 → 2 → 1로 흘러 끊기지 않는다.
 *    뒤로 나가는 경우처럼 이어받을 화면이 없으면 곧바로 부른다.
 */
export function showReadyScreen(app, {
  title = '카메라 준비',
  showZones = false,
} = {}) {
  return new Promise(resolve => {
    app.innerHTML = `
      <style>
        #rdy, #rdy * { box-sizing: border-box; }
        #rdy {
          position: fixed; inset: 0; overflow: hidden;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: clamp(14px, 3vh, 32px);   /* 제목 · 영상 · 조작부를 세 덩어리로 떨어뜨린다 */
          padding: clamp(12px, 2.5vh, 28px);
          padding-bottom: max(clamp(12px, 2.5vh, 28px), env(safe-area-inset-bottom));
          font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
          background: linear-gradient(180deg, #2b1b52 0%, #150a2e 100%);
          touch-action: none; user-select: none;
        }
        #rdy-title {
          font-size: clamp(1.2rem, 3vw, 2rem); font-weight: 900;
          text-shadow: 0 3px 14px rgba(0,0,0,0.5);
        }

        /* 영상 — 여기가 이 화면의 주인공이다. 크게 둔다. */
        #rdy-pip {
          position: relative; flex: 0 1 auto;
          width: min(76vw, 46vh * 4 / 3); aspect-ratio: 4 / 3;
          border-radius: 22px; overflow: hidden;
          border: 5px solid rgba(255,255,255,0.22);
          box-shadow: 0 10px 40px rgba(0,0,0,0.5);
          transition: border-color 0.25s, box-shadow 0.25s;
        }
        #rdy-pip.ok      { border-color: #6ee75a; box-shadow: 0 0 0 6px rgba(110,231,90,0.18), 0 10px 40px rgba(0,0,0,0.5); }
        #rdy-pip.missing { border-color: #ff6b6b; box-shadow: 0 0 0 6px rgba(255,107,107,0.18), 0 10px 40px rgba(0,0,0,0.5); }
        /* 영상만 좌우 반전한다. 오버레이는 엔진이 이미 거울 좌표로 주므로 그대로 둔다 —
           여기에 또 걸면 스켈레톤이 몸과 반대로 붙는다. */
        #rdy-video   { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
        #rdy-overlay { position: absolute; inset: 0; width: 100%; height: 100%; }

        /* 영상 아래 묶음 — **여기서 가운데 정렬과 간격을 함께 잡는다.**
           이걸 가로 모드 미디어쿼리 안에만 두는 바람에, 평소에는 블록이라
           폭이 고정된 게이지만 왼쪽으로 붙었다. 정렬 규칙은 기본에 둔다. */
        #rdy-side {
          display: flex; flex-direction: column; align-items: center;
          gap: clamp(8px, 1.6vh, 18px);
        }

        #rdy-status {
          font-size: clamp(1rem, 2.4vw, 1.5rem); font-weight: 900; text-align: center;
          min-height: 1.4em; transition: color 0.2s;
        }
        #rdy-status.ok   { color: #8dff7a; }
        #rdy-status.warn { color: #ffb36b; }

        #rdy-hint { font-size: clamp(0.9rem, 1.9vw, 1.2rem); font-weight: 800; color: #ffe27a; text-align: center; }
        #rdy-hint b { color: #fff; font-size: 1.25em; }
        #rdy-hint.off { display: none; }
        #rdy-gauge-wrap {
          width: clamp(150px, 24vw, 240px); height: 9px; border-radius: 999px;
          background: rgba(255,255,255,0.14); overflow: hidden;
        }
        #rdy-gauge { height: 100%; width: 0; background: #ffd23e; border-radius: 999px; }

        /* 버튼은 "고르는 곳"이라 위 안내글과 한 덩어리로 붙으면 안 읽힌다 */
        #rdy-btns {
          display: flex; align-items: center; justify-content: center; flex-wrap: wrap;
          gap: clamp(10px, 1.6vw, 18px);
          margin-top: clamp(4px, 1.2vh, 14px);
        }
        .rdy-btn {
          min-height: 58px; padding: 0 clamp(18px, 2.8vw, 30px);
          border-radius: 9999px; border: 2px solid rgba(255,255,255,0.28);
          background: rgba(255,255,255,0.12); color: #fff;
          font: inherit; font-size: clamp(0.9rem, 1.7vw, 1.1rem); font-weight: 900;
          cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform 0.12s;
        }
        .rdy-btn:active { transform: scale(0.95); }
        .rdy-btn.go {
          background: #ffd23e; color: #4a2a00; border-color: transparent;
          box-shadow: 0 5px 0 #c89800, 0 10px 26px rgba(0,0,0,0.4);
        }
        .rdy-btn.go:disabled { opacity: 0.4; box-shadow: none; cursor: default; }

        /* 세로가 짧은 가로 모드 — 영상과 조작을 좌우로 나눈다.
           세로로 쌓으면 400px 화면에서 버튼이 밖으로 밀려난다. */
        @media (max-height: 560px) {
          #rdy { flex-direction: row; flex-wrap: wrap; align-content: center; gap: clamp(10px, 2vw, 24px); }
          #rdy-title { width: 100%; text-align: center; font-size: clamp(1rem, 2.4vw, 1.4rem); }
          #rdy-pip { width: min(46vw, 62vh * 4 / 3); }
          /* 정렬·간격은 기본 규칙 그대로 쓰고, 여기서는 폭만 잡는다 */
          #rdy-side { flex: 1 1 240px; min-width: 200px; gap: 10px; }
        }
      </style>

      <div id="rdy">
        <div id="rdy-title">${title}</div>

        <div id="rdy-pip">
          <video id="rdy-video" playsinline muted></video>
          <canvas id="rdy-overlay"></canvas>
        </div>

        <div id="rdy-side">
          <div id="rdy-status">웹캠과 모션 인식을 준비하고 있어요…</div>
          <div id="rdy-hint" class="off">
            ✋ 머리 위 <b>O</b> = 시작 · 팔로 <b>X</b> = 뒤로
          </div>
          <div id="rdy-gauge-wrap"><div id="rdy-gauge"></div></div>
          <div id="rdy-btns">
            <button class="rdy-btn" id="rdy-back" data-pz-hit data-pz-dwell="900">← 뒤로</button>
            <button class="rdy-btn" id="rdy-keyboard" data-pz-hit data-pz-dwell="1200">⌨️ 키보드로 하기</button>
            <button class="rdy-btn go" id="rdy-go" data-pz-hit data-pz-dwell="1200" disabled>▶ 시작</button>
          </div>
        </div>
      </div>
    `

    const $ = s => app.querySelector(s)
    const pipEl   = $('#rdy-pip')
    const videoEl = $('#rdy-video')
    const statusEl = $('#rdy-status')
    const hintEl  = $('#rdy-hint')
    const gaugeEl = $('#rdy-gauge')
    const goBtn   = $('#rdy-go')

    const overlay = createPipOverlay($('#rdy-overlay'), { zones: showZones })

    let settled = false
    let detach = null
    let unsub = null
    let raf = null
    let acquired = false

    // 두 번 불러도 참조가 두 번 빠지지 않게 막는다
    const release = () => {
      if (!acquired) return
      acquired = false
      poseEngineCore.release()
    }

    const finish = mode => {
      if (settled) return
      settled = true
      if (raf) cancelAnimationFrame(raf)
      unsub?.()
      detach?.()
      overlay.destroy?.()
      // 카메라 참조는 호출부에 넘긴다 — 위 주석 참고
      resolve({ mode, release })
    }

    $('#rdy-back').addEventListener('click', () => finish('back'))
    $('#rdy-keyboard').addEventListener('click', () => finish('keyboard'))
    goBtn.addEventListener('click', () => { if (!goBtn.disabled) finish('motion') })

    // 될 수 없는 기기라면 카메라를 열어보지도 않는다
    if (!isPoseSupported()) {
      statusEl.textContent = poseUnsupportedReason() ?? '이 기기에서는 카메라 인식이 어려워요'
      statusEl.classList.add('warn')
      return
    }

    let bodyOk = false
    const applyBodyState = ok => {
      bodyOk = ok
      pipEl.classList.toggle('ok', ok)
      pipEl.classList.toggle('missing', !ok)
      statusEl.classList.toggle('ok', ok)
      statusEl.classList.toggle('warn', !ok)
      statusEl.textContent = ok
        ? '좋아요! 이제 시작할 수 있어요'
        : '⬅ 머리부터 발까지 다 보이게 뒤로 물러나 주세요 ➡'
      goBtn.disabled = !ok
    }

    // O는 전신이 보일 때만 — 캘리브레이션도 게임도 전신 기준이다.
    // X는 **전신을 요구하지 않는다.** 뒤로 나가려는 아이에게 "먼저 물러나세요"를
    // 요구하면 갇힌다. (웜업 튜토리얼 화면들과 같은 규칙)
    const oHold = new GestureHold(lms => isFullBodyVisible(lms) && isArmsUpCircle(lms, GESTURE), GESTURE.startHoldSec)
    const xHold = new GestureHold(lms => isArmsUpCross(lms, GESTURE), GESTURE.confirmHoldSec)

    let lastLms = null
    let settleT = 0
    let last = performance.now()

    const loop = now => {
      raf = requestAnimationFrame(loop)
      if (settled) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      // 전신 여부는 곧바로 뒤집지 않는다 — 경계에서 깜빡인다
      const ok = isFullBodyVisible(lastLms)
      if (ok === bodyOk) settleT = 0
      else {
        settleT += dt
        if (settleT >= BODY_SETTLE_SEC) { settleT = 0; applyBodyState(ok) }
      }

      const oDone = oHold.update(dt, lastLms)
      const xDone = xHold.update(dt, lastLms)
      gaugeEl.style.width = `${Math.round(Math.max(oHold.progress, xHold.progress) * 100)}%`

      if (oDone)      finish('motion')
      else if (xDone) finish('back')
    }

    poseEngineCore.acquire()
      .then(() => {
        acquired = true
        if (settled) { release(); return }   // 로딩 중에 뒤로 나갔으면 그냥 놓는다
        detach = poseEngineCore.attach(videoEl)
        unsub = poseEngineCore.onLandmarks(lms => { lastLms = lms; overlay.draw(lms) })
        hintEl.classList.remove('off')
        applyBodyState(false)
        raf = requestAnimationFrame(loop)
      })
      .catch(err => {
        if (settled) return
        console.warn('[readyScreen] 카메라 시작 실패:', err?.name, err?.message)
        // **왜 안 되는지 화면에 남긴다.** 이유마다 할 일이 다르다
        // (권한 / 다른 앱이 점유 / HTTPS). 뭉뚱그리면 매번 콘솔을 봐야 한다.
        statusEl.textContent = handErrorMessage(err)
        statusEl.classList.add('warn')
        pipEl.classList.add('missing')
      })
  })
}

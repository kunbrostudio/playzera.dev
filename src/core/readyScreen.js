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

import { icon, iconFilled } from './icons.js'
import { poseEngineCore, isFullBodyVisible, isPoseSupported, poseUnsupportedReason } from './pose/poseEngine.js'
import { createPipOverlay } from './pose/pipOverlay.js'
import { isArmsUpCircle, isArmsUpCross, GestureHold } from './pose/gesture.js'
import { GESTURE } from './pose/tuning.js'
import { handErrorMessage } from './handControl.js'

// 빨강↔초록이 경계에서 깜빡이지 않도록, 바뀐 상태가 이만큼 유지될 때만 전환한다.
// (웜업에서 현장 검증된 값이다 — 0.1초로 줄이면 눈에 띄게 떨린다)
export const BODY_SETTLE_SEC = 0.3

// ── 연속 플레이면 자동으로 통과시킨다 ★ ──────────────────────
//
// 게임 → 허브 → 다른 게임을 이어서 하면 이 화면을 매번 보게 된다. 아이는 그 자리에
// 그대로 서 있는데 O를 3초씩 다시 들어야 하니 **금방 지겨워진다.**
//
// 직전에 몸으로 시작한 지 얼마 안 됐고 **지금도 전신이 보이면** 곧바로 넘긴다.
// 안전장치(전신 확인)는 그대로 두고 반복만 없애는 것이다 — 몸이 안 보이면
// 자동 통과는 일어나지 않는다.
//
// 카메라는 참조 카운팅으로 계속 열려 있으므로 다시 여는 비용도 없다.
export const QUICK_RESUME_SEC = 60
let lastMotionAt = 0

/** 테스트·개발용 — 다음 진입을 무조건 정식 절차로 되돌린다. */
export function forgetQuickResume() { lastMotionAt = 0 }

/**
 * 카메라 준비 화면을 띄우고, 아이가 고른 결과를 돌려준다.
 *
 * @param {HTMLElement} app  화면을 그릴 컨테이너 (#app)
 * @param {object} opts
 * @param {string}   opts.title      화면 제목
 * @param {boolean}  opts.showZones  3분할 선을 PIP에 그릴지 (좌우 이동 게임이면 true)
 * @param {boolean}  opts.allowAuto  "자율주행 모드" 선택지를 보여줄지 (아래 참고)
 * @returns {Promise<{mode:'motion'|'keyboard'|'auto'|'back', release:Function}>}
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
  // 칸 수 고르기. 게임이 쓸 때만 넘긴다 — 러너처럼 칸이 없는 게임은 안 넘긴다.
  laneChoices = null,        // 예: [3, 5]
  lanes: lanes0 = 3,         // 처음 눌려 있는 것
  laneLocked = null,         // 고를 수 없는 값 (부모가 3칸으로 잠갔을 때의 5)
  // ── 게임의 세계를 배경으로 깐다 ★ ──
  // 기본은 보라색 그라디언트다. 그건 어느 게임에도 안 어울리지 않지만
  // **어느 게임처럼 보이지도 않는다** — 아이는 방금 고른 게임에서 이 화면으로
  // 넘어오는데, 세계가 한 번 끊겼다 다시 시작한다.
  //
  // 게임이 그림을 넘기면 그걸 깔고 위에 어둠을 덮는다. 어둠을 덮는 이유는
  // 이 화면의 주인공이 **영상 속 아이**이기 때문이다 — 배경이 밝으면
  // 자기 모습이 어디 있는지 못 찾는다.
  backdrop = null,           // 예: '/assets/runner/jurassic/image/fx_title_screen.png'
  // ── 자율주행 모드 ★ ────────────────────────────────────────
  // 카메라도 손도 없이, 코스를 미리 아는 자동조종이 대신 진행하는 모드다
  // (`runner/game/autopilot.js`). "카메라가 없을 때"의 대체가 아니라
  // **카메라가 있어도 고를 수 있는 나란한 선택지**다(ken 요청, 9/2) —
  // "키보드 모드"가 이미 그렇게 항상 떠 있는 것과 같은 이유다. 버튼
  // 이름도 "자동으로 보기"에서 "자율주행 모드"로 바꿨다 — "키보드
  // 모드"와 나란히 있을 때 둘 다 "무엇으로 조작하나"를 뜻하는 말이어야
  // 헷갈리지 않는다(ken 재지적, 9/2).
  //
  // 기본은 꺼져 있다. 이 화면은 게임마다 다 같이 쓰는데, 자동조종을 실제로
  // 구현한 게임(지금은 쥬라기 대탐험 3D뿐)만 켜야 한다 — 켜 놓고 그
  // 게임이 `mode==='auto'`를 처리 안 하면, 버튼은 보이는데 결과가
  // 카메라 모드로 잘못 새는 조용한 사고가 난다.
  allowAuto = false,
} = {}) {
  let lanes = lanes0
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
          background: linear-gradient(180deg, var(--pz-bg-veil-4, #2b1b52) 0%, var(--pz-bg-veil-2, #150a2e) 100%);
          touch-action: none; user-select: none;
        }
        /* 제목과 칸 고르기를 **한 줄에** 둔다.
           칸 버튼을 아래 버튼 무리에 섞으면 "시작"과 나란히 서서
           눌러야 하는 것처럼 보인다 — 이건 고르는 것이지 진행하는 것이 아니다.
           폭은 영상과 맞춘다. 그래야 화면이 한 덩어리로 읽힌다. */
        /* 제목 줄과 아래 덩어리가 **같은 폭**이어야 왼쪽 끝이 맞는다.
           따로 적으면 화면 크기에 따라 하나만 먼저 줄어 어긋난다. */
        #rdy { --rdy-w: min(76vw, 46vh * 16 / 9); }
        /* 배경 그림 — 덮기(cover)로 깐다. 늘이지 않는다 (CLAUDE.md).
           위에 어둠을 덮어 영상 속 아이가 주인공으로 남게 한다. */
        #rdy-bg {
          position: absolute; inset: 0; z-index: 0;
          background-image: linear-gradient(rgba(12,5,32,.72), rgba(12,5,32,.82)),
                            url("${backdrop}");
          background-size: cover; background-position: center;
        }
        #rdy > *:not(#rdy-bg) { position: relative; z-index: 1; }
        #rdy-body { display: flex; flex-direction: column; align-items: center;
                    gap: clamp(14px, 3vh, 32px); width: var(--rdy-w); }
        #rdy-head {
          width: var(--rdy-w);
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        /* 칸 고르기가 없는 게임(러너 등)에서는 제목만 남으므로 가운데로 */
        #rdy-head:not(:has(#rdy-lanes)) { justify-content: center; }
        #rdy-title {
          font-size: clamp(1.2rem, 3vw, 2rem); font-weight: 900;
          text-shadow: 0 3px 14px rgba(0,0,0,0.5);
        }
        #rdy-lanes { display: flex; gap: 8px; }
        .rdy-lane {
          min-height: 44px; padding: 0 clamp(12px, 1.8vw, 20px);
          border-radius: var(--pz-radius-pill, 9999px); border: 2px solid rgba(255,255,255,0.28);
          background: rgba(255,255,255,0.10); color: #fff;
          font: inherit; font-size: clamp(0.82rem, 1.5vw, 1rem); font-weight: 900;
          cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform 0.12s;
        }
        .rdy-lane.on { background: var(--pz-gold, #ffd23e); color: var(--pz-gold-text, #4a2a00); border-color: transparent; }
        .rdy-lane:disabled { opacity: 0.35; cursor: default; }
        .rdy-lane:active { transform: scale(0.95); }

        /* 영상 — 여기가 이 화면의 주인공이다. 크게 둔다. */
        #rdy-pip {
          position: relative; flex: 0 1 auto;
          /* **카메라가 주는 그대로 16:9다.** 4:3 상자에 담으면 cover가 좌우를
             25% 잘라내는데, 칸 판정은 잘린 화면이 아니라 **원본 프레임 전체**를
             등분한다. 그러면 화면의 점선이 진짜 경계와 다른 자리를 가리킨다 —
             3칸에서는 티가 덜 났지만 5칸이면 바로 드러난다. */
          width: 100%; aspect-ratio: 16 / 9;
          border-radius: 22px; overflow: hidden;
          border: 5px solid rgba(255,255,255,0.22);
          box-shadow: 0 10px 40px rgba(0,0,0,0.5);
          transition: border-color 0.25s, box-shadow 0.25s;
        }
        #rdy-pip.ok      { border-color: var(--pz-green-b, #6ee75a); box-shadow: 0 0 0 6px rgba(110,231,90,0.18), 0 10px 40px rgba(0,0,0,0.5); }
        #rdy-pip.missing { border-color: var(--pz-red, #ff6b6b); box-shadow: 0 0 0 6px rgba(255,107,107,0.18), 0 10px 40px rgba(0,0,0,0.5); }
        /* 영상만 좌우 반전한다. 오버레이는 엔진이 이미 거울 좌표로 주므로 그대로 둔다 —
           여기에 또 걸면 스켈레톤이 몸과 반대로 붙는다. */
        #rdy-video   { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
        #rdy-overlay { position: absolute; inset: 0; width: 100%; height: 100%; }

        /* 영상 아래 묶음 — **여기서 가운데 정렬과 간격을 함께 잡는다.**
           이걸 가로 모드 미디어쿼리 안에만 두는 바람에, 평소에는 블록이라
           폭이 고정된 게이지만 왼쪽으로 붙었다. 정렬 규칙은 기본에 둔다. */
        #rdy-side {
          display: flex; flex-direction: column; align-items: center;
          gap: clamp(8px, 1.6vh, 18px); width: 100%;
        }

        #rdy-status {
          font-size: clamp(1rem, 2.4vw, 1.5rem); font-weight: 900; text-align: center;
          min-height: 1.4em; transition: color 0.2s;
        }
        #rdy-status.ok   { color: var(--pz-green-a, #8dff7a); }
        #rdy-status.warn { color: #ffb36b; }

        #rdy-hint { font-size: clamp(0.9rem, 1.9vw, 1.2rem); font-weight: 800; color: #ffe27a; text-align: center; }
        #rdy-hint b { color: #fff; font-size: 1.25em; }
        #rdy-hint.off { display: none; }
        #rdy-gauge-wrap {
          width: clamp(150px, 24vw, 240px); height: 9px; border-radius: var(--pz-radius-pill, 999px);
          background: rgba(255,255,255,0.14); overflow: hidden;
        }
        #rdy-gauge { height: 100%; width: 0; background: var(--pz-gold, #ffd23e); border-radius: var(--pz-radius-pill, 999px); }

        /* 버튼은 "고르는 곳"이라 위 안내글과 한 덩어리로 붙으면 안 읽힌다 */
        #rdy-btns {
          display: flex; align-items: center; justify-content: center; flex-wrap: wrap;
          gap: clamp(10px, 1.6vw, 18px);
          margin-top: clamp(4px, 1.2vh, 14px);
        }
        .rdy-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          min-height: 58px; padding: 0 clamp(18px, 2.8vw, 30px);
          border-radius: var(--pz-radius-pill, 9999px); border: 2px solid rgba(255,255,255,0.28);
          background: rgba(255,255,255,0.12); color: #fff;
          font: inherit; font-size: clamp(0.9rem, 1.7vw, 1.1rem); font-weight: 900;
          cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform 0.12s;
        }
        .rdy-btn:active { transform: scale(0.95); }
        .rdy-btn.go {
          background: var(--pz-gold, #ffd23e); color: var(--pz-gold-text, #4a2a00); border-color: transparent;
          box-shadow: 0 5px 0 var(--pz-gold-shadow, #c89800), 0 10px 26px rgba(0,0,0,0.4);
        }
        .rdy-btn.go:disabled { opacity: 0.4; box-shadow: none; cursor: default; }

        /* 세로가 짧은 가로 모드(폰을 눕힌 화면).
           **제목 줄은 위에 그대로 두고, 그 아래에서 영상과 조작을 좌우로 나눈다.**
           셋을 다 옆으로 늘어놓으면 제목이 영상 옆에 붙어 어디에 속한 말인지
           읽히지 않는다. 세로로 쌓으면 400px 높이에서 버튼이 화면 밖으로 밀려난다. */
        @media (max-height: 560px) {
          #rdy { --rdy-w: min(92vw, 1000px); gap: clamp(8px, 1.6vh, 16px); }
          #rdy-title { font-size: clamp(1rem, 2.4vw, 1.4rem); }
          #rdy-body { flex-direction: row; align-items: center; gap: clamp(12px, 2vw, 26px); }
          #rdy-pip { width: 58%; max-width: calc(62vh * 16 / 9); flex: none; }

          /* **칸 버튼의 오른쪽 끝을 영상의 오른쪽 끝에 맞춘다.**
             제목 줄을 전체 폭으로 두면 버튼이 화면 오른쪽 끝까지 밀려가서
             아래 영상과 아무 관계 없는 자리에 뜬다 — 칸을 나누는 건 영상이다.
             그래서 제목 줄도 영상과 같은 폭을 쓴다. */
          #rdy-head { width: 58%; max-width: calc(62vh * 16 / 9); }

          /* 조작은 영상 오른쪽 칸의 **가운데**에 모은다. 오른쪽으로 붙이면
             글줄이 제각각 끝나서 오른쪽 가장자리만 들쭉날쭉해 보인다. */
          #rdy-side { flex: 1 1 auto; min-width: 0; align-items: center; text-align: center; gap: 8px; }
          #rdy-status, #rdy-hint { text-align: center; }
          #rdy-btns { justify-content: center; margin-top: 4px; }
          .rdy-btn { min-height: 46px; padding: 0 clamp(12px, 2vw, 20px); }
          .rdy-lane { min-height: 38px; padding: 0 clamp(10px, 1.6vw, 16px); }
        }

        /* 세로로 든 폰 — 버튼이 여럿(최대 넷)이면 한 줄에 안 들어가 시작만
           아래로 떨어진다. 그러면 **가장 중요한 버튼이 제일 작아 보인다.**
           order로 시작을 맨 위 전체 폭에 두고(DOM 순서는 안 바꾼다 —
           가로 화면에서는 오른쪽 끝 primary CTA 자리를 그대로 지킨다),
           나머지(뒤로·키보드 모드·자율주행 모드가 있으면 그것까지)는
           그 아래 한 줄에 고르게 나눈다. 열 개수는 실제 보조 버튼 수에
           맞춘다 — 고정해 두면 자동재생이 없는 게임(보조 버튼 둘)에서
           칸 하나가 빈 채로 남는다. */
        @media (max-width: 560px) and (orientation: portrait) {
          #rdy-btns {
            display: grid; width: 100%;
            grid-template-columns: repeat(${allowAuto ? 3 : 2}, 1fr); gap: 10px;
          }
          .rdy-btn { padding: 0 6px; }
          .rdy-btn.go { grid-column: 1 / -1; order: -1; }
        }
      </style>

      <div id="rdy">
        ${backdrop ? '<div id="rdy-bg"></div>' : ''}
        <div id="rdy-head">
          <div id="rdy-title">${title}</div>
          ${laneChoices ? `<div id="rdy-lanes">${laneChoices.map(n => `
            <button class="rdy-lane ${n === lanes0 ? 'on' : ''}" data-lanes="${n}"
                    data-pz-hit data-pz-dwell="1000"
                    ${n === laneLocked ? 'disabled title="놀이 공간이 좁게 설정돼 있어요 (마이페이지)"' : ''}>${n}칸</button>`).join('')}</div>` : ''}
        </div>

        <!-- 영상과 조작을 한 덩어리로 묶는다. 가로 모드에서 이 둘을 좌우로 나누는데,
             묶어 두지 않으면 제목·영상·조작이 각자 접혀 폭이 제각각이 된다. -->
        <div id="rdy-body">
          <div id="rdy-pip">
            <video id="rdy-video" playsinline muted></video>
            <canvas id="rdy-overlay"></canvas>
          </div>

          <div id="rdy-side">
            <div id="rdy-status">웹캠과 모션 인식을 준비하고 있어요…</div>
            <div id="rdy-hint" class="off">
              ${icon('hand')} 머리 위 <b>O</b> = 시작 · 팔로 <b>X</b> = 뒤로
            </div>
            <div id="rdy-gauge-wrap"><div id="rdy-gauge"></div></div>
            <div id="rdy-btns">
              <button class="rdy-btn" id="rdy-back" data-pz-hit data-pz-dwell="900">${icon('back')} 뒤로</button>
              <button class="rdy-btn" id="rdy-keyboard" data-pz-hit data-pz-dwell="1200">${icon('keyboard')} 키보드 모드</button>
              ${allowAuto ? `<button class="rdy-btn" id="rdy-auto" data-pz-hit data-pz-dwell="1200">${icon('zap')} 자율주행 모드</button>` : ''}
              <button class="rdy-btn go" id="rdy-go" data-pz-hit data-pz-dwell="1200" disabled>${iconFilled('play', 0.9)} 시작</button>
            </div>
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

    const overlay = createPipOverlay($('#rdy-overlay'), { zones: showZones, lanes })

    // 칸 고르기 — **누르면 미리보기의 점선이 바로 바뀐다.** 글로 "5칸"이라고 적는 것보다
    // 내 방이 다섯으로 갈린 모습을 보는 편이 빠르다. 좁으면 여기서 바로 안다.
    for (const btn of app.querySelectorAll('.rdy-lane')) {
      btn.addEventListener('click', () => {
        lanes = Number(btn.dataset.lanes)
        overlay.setLanes(lanes)
        for (const b of app.querySelectorAll('.rdy-lane')) b.classList.toggle('on', b === btn)
      })
    }

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
      if (mode === 'motion') {
        lastMotionAt = Date.now()
        // 지금 이 화면이 추적하고 있던 사람을 "이 아이"로 확정한다 — O자세
        // 성공이든 이어서 하기(QUICK_RESUME)든, 둘 다 몸으로 시작을 확인한
        // 순간이다. 확정 뒤에는 다른 사람(돕는 보호자 등)이 더 중앙에 있거나
        // 크게 잡혀도 게임 중 그쪽으로 안 넘어간다 (personLock.js).
        poseEngineCore.confirmLock()
      }
      if (raf) cancelAnimationFrame(raf)
      unsub?.()
      detach?.()
      overlay.destroy?.()
      // ── 자기 화면은 자기가 지운다 ★ ──────────────────────────
      // 예전엔 안 지웠다 — 다음 화면이 `app.innerHTML`을 통째로 새로 쓰는
      // 경우(대부분)는 문제가 없었지만, 그다음 화면이 **덮어쓰지 않고
      // 얹기만 하는 화면**(`runner3d/screens.js`의 `mount` — 타이틀·튜토리얼·
      // 스토리 대화)이면 이 화면의 DOM이 그 밑에 그대로 남는다. 평소엔 위
      // 화면이 불투명해서 안 보이지만, 그 화면의 배경 그림이 아직 로딩
      // 중이면 그 틈에 이 준비 화면이 비쳐 보인다 — 실제로 쥬라기
      // 대탐험(3D)의 인트로 대화 장면에서 카메라 준비 화면이 뚫고
      // 나왔다(9/2). 화면은 끝나면 스스로 지운다.
      $('#rdy')?.remove()
      // 카메라 참조는 호출부에 넘긴다 — 위 주석 참고
      resolve({ mode, release, lanes })
    }

    $('#rdy-back').addEventListener('click', () => finish('back'))
    $('#rdy-keyboard').addEventListener('click', () => finish('keyboard'))
    $('#rdy-auto')?.addEventListener('click', () => finish('auto'))
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
        : '머리부터 발까지 다 보이게 뒤로 물러나 주세요'
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

      // 이어서 하는 중이고 몸이 보이면 그냥 넘어간다 (위 QUICK_RESUME_SEC 주석)
      if (ok && Date.now() - lastMotionAt < QUICK_RESUME_SEC * 1000) {
        statusEl.textContent = '이어서 해요!'
        statusEl.classList.add('ok')
        finish('motion')
        return
      }
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

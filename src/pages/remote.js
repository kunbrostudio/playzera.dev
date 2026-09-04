// 부모 리모컨 부팅 화면 — 다른 디바이스(폰 등)에서 QR로 들어온다. STEP 64~66.
//
// **이 화면은 승인될 때까지만 존재한다.** 1단계(STEP 64)는 승인 후에도
// 여기 남아서 리모컨 전용 UI(게임 그리드 + 시작/끄기 버튼)를 그렸는데,
// ken이 써보고 "새 화면 말고 그냥 플랫폼 그대로 자유롭게 조작하게
// 해달라"고 지적했다(9/4). 그래서 승인되는 순간 이 화면은 할 일이
// 끝난다 — `window.location.hash = '/'`로 **진짜 허브**를 그대로 띄우고,
// 그 뒤로는 `core/remote/controller.js`가 라우터의 `navigate()`를 가로채
// 허브 안 버튼(카드 선택 → 히어로 시작 등)이 로컬이 아니라 주 디바이스를
// 조종하게 만든다. 그래서 여기엔 게임 목록도, 시작 버튼도 없다 — 붙는
// 동안 보여줄 화면 딱 하나(연결 중 / 거부됨 / 시간 초과)뿐이다.
//
// `window.location.hash`를 직접 쓴다 — `navigate()`를 부르면 안 된다.
// 승인되는 순간 `controller.active`가 이미 true라 `navigate()`는 이동을
// 로컬이 아니라 명령으로 바꿔치기한다(그게 이 기능의 핵심이다). 하지만
// 지금 이 화면 자체를 허브로 바꾸는 최초 1회는 **진짜 로컬 이동**이어야
// 하므로 라우터를 안 거치는 원시 API를 쓴다.
//
// **막다른 상태(코드 없음·거부·시간 초과)에 사람을 남겨두지 않는다**
// (ken 지적, 9/4 재테스트) — "다시 시도해 주세요" 문구만 띄우고 멈추면
// 아이도 부모도 이걸 버그로 읽는다. 이 화면엔 어차피 되돌아갈 "이전
// 화면"이 없다(QR 스캔으로 막 들어온 자리라 브라우저 뒤로가기도
// 애매하다) — 그래서 몇 초 뒤 스스로 허브로 넘어가고, 기다리기 싫은
// 사람을 위해 "홈으로" 버튼도 같이 둔다.
import { controller } from '../core/remote/controller.js'
import { icon } from '../core/icons.js'

const AUTO_HOME_MS = 4000   // 이 안에 안 누르면 스스로 허브로 넘어간다

export function remotePage(app, query) {
  const code = (query.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

  app.innerHTML = `
    <style>
      #rmt, #rmt * { box-sizing: border-box; }
      #rmt {
        position: fixed; inset: 0; overflow-y: auto;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 28px 20px calc(28px + env(safe-area-inset-bottom));
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff; text-align: center;
        background: linear-gradient(180deg, #2b1b52 0%, #150a2e 100%);
      }
      #rmt-title { font-size: 1.4rem; font-weight: 900; margin: 8px 0 4px; }
      #rmt-sub { font-size: 0.95rem; opacity: 0.75; margin-bottom: 24px; }
      #rmt-status { font-size: 1.05rem; font-weight: 800; margin: 16px 0; }
      #rmt-status.warn { color: #ffb36b; }
      #rmt-spinner { width: 36px; height: 36px; border-radius: 999px;
        border: 4px solid rgba(255,255,255,0.2); border-top-color: #ffd23e;
        margin: 0 auto 16px; animation: rmt-spin 0.9s linear infinite; }
      @keyframes rmt-spin { to { transform: rotate(360deg); } }
      #rmt-home-btn { margin-top: 8px; min-height: 50px; padding: 0 28px;
        border-radius: 9999px; border: none; background: #ffd23e; color: #4a2a00;
        font: inherit; font-weight: 900; font-size: 1rem; cursor: pointer; }
    </style>
    <div id="rmt">
      <div id="rmt-title">${icon('phone')} 플레이 제라 리모컨</div>
      <div id="rmt-sub">${code ? `코드 ${code}` : ''}</div>
      <div id="rmt-body"></div>
    </div>
  `

  const bodyEl = app.querySelector('#rmt-body')
  let homeTimer = null

  function goHome() {
    clearTimeout(homeTimer)
    window.location.hash = '/'
  }

  function renderStatus(msg, { spinner = false } = {}) {
    bodyEl.innerHTML = `<div id="rmt-status" class="${spinner ? '' : 'warn'}">${spinner ? '<div id="rmt-spinner"></div>' : ''}${msg}</div>`
  }

  /**
   * 되돌아갈 화면이 없는 막다른 상태(코드 없음·거부·시간 초과)용.
   * `AUTO_HOME_MS` 뒤 스스로 허브로 넘어가고, "홈으로" 버튼으로도
   * 바로 갈 수 있다 — 문구만 보여주고 멈추면 그게 곧 버그로 보인다.
   */
  function renderDeadEnd(msg) {
    bodyEl.innerHTML = `
      <div id="rmt-status" class="warn">${msg}</div>
      <button id="rmt-home-btn">${icon('home', 0.95)} 홈으로</button>
    `
    bodyEl.querySelector('#rmt-home-btn').addEventListener('click', goHome)
    clearTimeout(homeTimer)
    homeTimer = setTimeout(goHome, AUTO_HOME_MS)
  }

  if (!code) {
    renderDeadEnd('코드가 없어요. 홈 화면에서 QR을 다시 스캔해 주세요')
    return
  }

  renderStatus('연결하는 중…', { spinner: true })

  controller.connect(code).then(result => {
    if (result === 'approved') {
      window.location.hash = '/'   // 진짜 허브를 그대로 띄운다 — navigate()가 아니라 원시 API(위 주석 참고)
    } else if (result === 'denied') {
      renderDeadEnd('연결이 거부됐어요. 잠시 후 홈으로 돌아가요')
    } else {
      renderDeadEnd('연결 시간이 지났어요. 잠시 후 홈으로 돌아가요')
    }
  })
}

// 부모 리모컨(폰) 화면 — 다른 디바이스(폰 등)에서 QR로 들어온다. STEP 64~66, 76.
//
// ── 이번에 왜 다시 바뀌었나(STEP 76) ★ ─────────────────────────
//
// STEP 66은 승인되는 순간 이 화면을 버리고 **진짜 허브(`/`)를 그대로
// 띄웠다** — 폰이 허브 마크업을 그대로 그리고, `navigate()`가
// `controller.active`를 보고 로컬 이동 대신 명령을 보내는 방식("플랫폼
// 그대로 조종"). ken이 그렇게 요청했었다(9/4).
//
// 그런데 실제로 붙여 보니 그 방식은 "게임 시작"까지만 되고 그 다음이
// 안 됐다 — 게임 화면 안(타이틀·카메라 준비·스토리·결과)은 라우트가
// 아니라서 `navigate()`가 안 걸린다. 그래서 STEP 75가 `focusNav`(방향
// 이동 + 선택)를 만들어 그 구멍을 메웠고, ken은 그 김에 화면 자체도
// 다시 설계했다 — "정말 리모컨을 만드는거야"(D-pad), 참고 이미지
// 4장(차량 공조기 · Apple TV 리모컨 앱 · GameSir 게임패드 · 게임보이)을
// 주며 세 차례에 걸쳐 레이아웃을 확정했다.
//
// **이제 승인 후에도 이 화면 자체가 컨트롤러다.** 허브로 안 넘어간다.
//   ① 상단 탭바 — 나가기·홈·마이프로필·햄버거(음소거는 그 안 팝업).
//      **이 넷은 폰 자신의(컨트롤러 앱) 기본 UI다** — 주 디바이스를
//      조종하는 게 아니다(마이프로필만 예외로 `/me`를 원격으로 열어준다,
//      아래 주석 참고). 착각하기 쉬워서(ken 지적) 아래 D-pad 구역과
//      시각적으로 분리하고, D-pad 위에 "화면 조작"이라는 이름표를 뒀다.
//   ② 가운데 게임 그리드 — **주 디바이스를 직접 조종**한다. 카드를 누르면
//      `controller.sendNavigate(getEntry(id))`로 그 게임이 곧장 시작된다.
//      D-pad로 허브를 뒤져 찾아가는 것보다 빠른 지름길이다(ken: "가운데
//      콘텐츠 리스트가 보여주는 부분은 바로 게임을 찾아서 진행할 수
//      있게 도와주는 구조인거지").
//   ③ 하단 D-pad — **주 디바이스 화면 안**을 짚는다(`dir`/`ok`).
//      좌/우/선택/상/하 순서로 가로 한 줄(ken 지정 순서). 태블릿 화면의
//      `data-pz-hit` 전부가 대상이라 화면마다 따로 손댈 게 없다
//      (`core/focusNav.js` 참고) — 게임 안의 화면들이 이걸로 열린다.
//
// 반응형: 폰은 물론 태블릿에서도 이 화면을 조작할 수 있어야 한다(ken —
// PC는 QR을 찍기 어려우니 범위 밖). 그리드는 폭을 다 쓰고(더 많은 카드가
// 보인다), D-pad만 폭을 ~420px로 묶어 가운데 둔다 — 태블릿 폭 그대로
// 벌리면 좌우 버튼 사이가 멀어져 한 손으로 못 쓴다.
//
// **가운데 그리드는 세로 스크롤, D-pad는 가로 한 줄** — 방향을 다르게
// 둔 것도 ken이 우려한 혼동(그리드 스와이프가 D-pad로 오해되는 것)을
// 줄이려는 선택이다. 스크롤해서 고르는 것과 눌러서 조종하는 것은
// 손짓 자체가 다르다.
import { controller } from '../core/remote/controller.js'
import { loadController } from '../core/remote/remoteStore.js'
import { onLeave } from '../core/router.js'
import { icon } from '../core/icons.js'
import { getAll, getEntry } from '../games/registry.js'

const AUTO_HOME_MS = 4000   // 막다른 상태에서 이 안에 안 누르면 스스로 허브로 넘어간다

export function remotePage(app, query) {
  const code = (query.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

  app.innerHTML = `
    <style>${BOOT_CSS}</style>
    <div id="rmt">
      <div id="rmt-title">${icon('phone')} 플레이 제라 리모컨</div>
      <div id="rmt-sub">${code ? `코드 ${code}` : ''}</div>
      <div id="rmt-body"></div>
    </div>
  `

  const bodyEl = app.querySelector('#rmt-body')
  let homeTimer = null
  const unsubs = []
  onLeave(() => { clearTimeout(homeTimer); for (const fn of unsubs) fn() })

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

  function handleResult(result) {
    if (result === 'approved' || controller.active) { mountController(app, unsubs); return }
    if (result === 'denied') { renderDeadEnd('연결이 거부됐어요. 잠시 후 홈으로 돌아가요'); return }
    renderDeadEnd('연결 시간이 지났어요. 잠시 후 홈으로 돌아가요')
  }

  if (!code) {
    renderDeadEnd('코드가 없어요. 홈 화면에서 QR을 다시 스캔해 주세요')
    return
  }

  if (controller.active) { mountController(app, unsubs); return }

  // 이미 이 코드로 페어링된 적이 있으면(폰이 새로고침됐거나 앱이 다시
  // 켜진 경우) `main.js` 부팅 시 이미 `controller.restore()`가 돌고
  // 있다 — 여기서 또 `connect()`를 부르면 새 remoteId로 겹쳐 붙으려다
  // 주 디바이스가 "다른 리모컨이 이미 있다"고 보고 조용히 무시한다.
  // `resume()`은 진행 중인 시도가 있으면 그걸 그대로 돌려주므로
  // (`_resuming` 가드) 여기서 다시 불러도 안전하다.
  const saved = loadController()
  const reusing = saved && saved.code === code

  renderStatus(reusing ? '다시 연결하는 중…' : '연결하는 중…', { spinner: true })
  const attempt = reusing ? controller.resume() : controller.connect(code)
  attempt.then(handleResult)
}

const BOOT_CSS = `
  #rmt, #rmt * { box-sizing: border-box; }
  #rmt {
    position: fixed; inset: 0; overflow-y: auto;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 28px 20px calc(28px + env(safe-area-inset-bottom));
    font-family: var(--font-main, 'Jua', sans-serif); color: #fff; text-align: center;
    background: linear-gradient(180deg, var(--pz-bg-veil-4, #2b1b52) 0%, var(--pz-bg-veil-2, #150a2e) 100%);
  }
  #rmt-title { font-size: 1.4rem; font-weight: 900; margin: 8px 0 4px; }
  #rmt-sub { font-size: 0.95rem; opacity: 0.75; margin-bottom: 24px; }
  #rmt-status { font-size: 1.05rem; font-weight: 800; margin: 16px 0; }
  #rmt-status.warn { color: #ffb36b; }
  #rmt-spinner { width: 36px; height: 36px; border-radius: 999px;
    border: 4px solid rgba(255,255,255,0.2); border-top-color: var(--pz-gold, #ffd23e);
    margin: 0 auto 16px; animation: rmt-spin 0.9s linear infinite; }
  @keyframes rmt-spin { to { transform: rotate(360deg); } }
  #rmt-home-btn { margin-top: 8px; min-height: 50px; padding: 0 28px;
    border-radius: var(--pz-radius-pill, 9999px); border: none; background: var(--pz-gold, #ffd23e); color: var(--pz-gold-text, #4a2a00);
    font: inherit; font-weight: 900; font-size: 1rem; cursor: pointer; }
`

// ── 승인 후 컨트롤러 UI ──────────────────────────────────────────

function mountController(app, unsubs) {
  app.innerHTML = `
    <style>${CTRL_CSS}</style>
    <div id="ctl">
      <div id="ctl-topbar">
        <button class="ctl-tab" id="ctl-exit" aria-label="나가기">${icon('exit', 1.3)}<span>나가기</span></button>
        <button class="ctl-tab" id="ctl-home" aria-label="홈">${icon('home', 1.3)}<span>홈</span></button>
        <button class="ctl-tab" id="ctl-profile" aria-label="마이프로필">${icon('user', 1.3)}<span>프로필</span></button>
        <div class="ctl-menu-wrap">
          <button class="ctl-tab" id="ctl-menu" aria-label="메뉴">${icon('menu', 1.3)}<span>메뉴</span></button>
          <!-- #pz-menu-panel(systemBar.js, 게임 안 브랜드 공용 메뉴)과는
               다른 메뉴다 — 여기는 폰(컨트롤러) 자신의 것이라 id를 일부러
               다르게 뒀다(test/brandUi.test.js가 "*menu-panel" id를
               게임 화면에만 허용한다). -->
          <div id="ctl-more-panel" class="hidden">
            <button id="ctl-mute" class="ctl-menu-item">${icon('music', 1.1)}<span id="ctl-mute-label">소리 끄기</span></button>
            <div id="ctl-code-line">코드 ${controller.code ?? ''}</div>
            <button id="ctl-disconnect" class="ctl-menu-item warn">${icon('close', 1.1)}<span>연결 끊기</span></button>
          </div>
        </div>
      </div>

      <div id="ctl-grid"></div>

      <div id="ctl-dpad-wrap">
        <div id="ctl-dpad-label">${icon('gamepad', 0.95)} 화면 조작 · <span id="ctl-focus">연결됨</span></div>
        <div id="ctl-dpad-row">
          <button class="ctl-dbtn" id="ctl-left"  aria-label="왼쪽">${icon('left', 1.5)}</button>
          <button class="ctl-dbtn" id="ctl-right" aria-label="오른쪽">${icon('right', 1.5)}</button>
          <button class="ctl-dbtn ok" id="ctl-ok" aria-label="선택">${icon('check', 1.6)}</button>
          <button class="ctl-dbtn" id="ctl-up"    aria-label="위">${icon('up', 1.5)}</button>
          <button class="ctl-dbtn" id="ctl-down"  aria-label="아래">${icon('down', 1.5)}</button>
        </div>
      </div>

      <div id="ctl-exit-confirm" class="hidden">
        <div class="ctl-confirm-box">
          <p>리모컨 연결을 끌까요?</p>
          <div class="ctl-confirm-actions">
            <button class="ctl-btn secondary" id="ctl-exit-cancel">계속 쓰기</button>
            <button class="ctl-btn warn" id="ctl-exit-confirm-btn">${icon('exit', 0.95)} 연결 끄기</button>
          </div>
        </div>
      </div>
    </div>
  `

  const $ = s => app.querySelector(s)
  const grid = $('#ctl-grid')

  // ── 가운데 그리드 — 주 디바이스로 곧장 이동시키는 지름길 ──
  const games = getAll()
  grid.innerHTML = games.map(m => `
    <button class="ctl-card" data-id="${m.id}" title="${m.title}">
      <div class="ctl-card-thumb"><img src="${m.thumbnail}" alt="" loading="lazy" /></div>
      <div class="ctl-card-title">${m.title}</div>
    </button>
  `).join('')
  grid.querySelectorAll('.ctl-card').forEach(card => {
    card.addEventListener('click', () => controller.sendNavigate(getEntry(card.dataset.id)))
  })

  // ── 지금 재생 중인 게임 카드를 강조한다 (STEP 76) ──
  unsubs.push(controller.onState(({ gameId }) => {
    grid.querySelectorAll('.ctl-card').forEach(card => {
      card.classList.toggle('active', !!gameId && card.dataset.id === gameId)
    })
  }))

  // ── 지금 화면 안에서 짚고 있는 것의 이름 ──
  unsubs.push(controller.onFocus(({ label }) => {
    $('#ctl-focus').textContent = label ?? '연결됨'
  }))

  // ── D-pad — 주 디바이스 화면 **안**을 짚는다 ──
  $('#ctl-left').addEventListener('click', () => controller.sendDir('left'))
  $('#ctl-right').addEventListener('click', () => controller.sendDir('right'))
  $('#ctl-up').addEventListener('click', () => controller.sendDir('up'))
  $('#ctl-down').addEventListener('click', () => controller.sendDir('down'))
  $('#ctl-ok').addEventListener('click', () => controller.sendOk())

  // ── 상단 탭바 — 이 폰(컨트롤러 앱) 자신의 기본 UI ──

  // 홈 — 이 화면(그리드)의 맨 위로. **주 디바이스는 안 건드린다.**
  $('#ctl-home').addEventListener('click', () => {
    closeMenu()
    grid.scrollTo({ top: 0, behavior: 'smooth' })
  })

  // 마이프로필 — 계정 이전이라 폰 자신에는 보여줄 게 아직 없다. 대신
  // 주 디바이스의 `/me`(부모 화면)를 원격으로 열어준다 — 나중에 계정이
  // 생기면 이 버튼 안에 폰 자신의 화면이 따로 생길 수 있다.
  $('#ctl-profile').addEventListener('click', () => {
    closeMenu()
    controller.sendNavigate('/me')
  })

  // 햄버거 — 소리 끄기 + 연결 끊기.
  const menuPanel = $('#ctl-more-panel')
  const isMenuOpen = () => !menuPanel.classList.contains('hidden')
  function closeMenu() { menuPanel.classList.add('hidden') }
  $('#ctl-menu').addEventListener('click', e => {
    e.stopPropagation()
    menuPanel.classList.toggle('hidden', isMenuOpen())
  })
  menuPanel.addEventListener('click', e => e.stopPropagation())
  // `document`에 거는 전역 리스너라 화면을 떠날 때 같이 떼지 않으면
  // 다음 화면에서도 계속 돈다 — `unsubs`에 넣어 onLeave/disconnect가
  // 같이 정리하게 한다.
  const onOutsideClick = () => { if (isMenuOpen()) closeMenu() }
  document.addEventListener('click', onOutsideClick)
  unsubs.push(() => document.removeEventListener('click', onOutsideClick))

  $('#ctl-mute').addEventListener('click', () => controller.sendMute())
  unsubs.push(controller.onMuted(({ muted }) => {
    $('#ctl-mute-label').textContent = muted ? '소리 켜기' : '소리 끄기'
    $('#ctl-mute img, #ctl-mute svg')?.remove()
    $('#ctl-mute').insertAdjacentHTML('afterbegin', icon(muted ? 'musicOff' : 'music', 1.1))
  }))

  // 화면을 떠날 때뿐 아니라 여기서 직접 끊을 때도 구독을 먼저 해지한다 —
  // 안 그러면 `renderDisconnected`가 마크업을 갈아치운 뒤에도 옛 리스너가
  // 남아 있다가 `$('#ctl-focus')` 같은 걸 찾아 null을 건드릴 수 있다.
  function disconnectAndShow() {
    for (const fn of unsubs) fn()
    controller.disconnect()
    renderDisconnected(app)
  }

  $('#ctl-disconnect').addEventListener('click', () => { closeMenu(); disconnectAndShow() })

  // 나가기 — 확인을 거친다. 실수로 끊으면 다시 QR을 스캔해야 하니
  // (게임의 "그만하기" 확인창과 같은 이유) 한 번 더 묻는다.
  const confirmBox = $('#ctl-exit-confirm')
  $('#ctl-exit').addEventListener('click', () => confirmBox.classList.remove('hidden'))
  $('#ctl-exit-cancel').addEventListener('click', () => confirmBox.classList.add('hidden'))
  $('#ctl-exit-confirm-btn').addEventListener('click', disconnectAndShow)
}

function renderDisconnected(app) {
  app.innerHTML = `
    <style>${BOOT_CSS}</style>
    <div id="rmt">
      <div id="rmt-title">${icon('phone')} 플레이 제라 리모컨</div>
      <div id="rmt-status" class="warn">연결을 껐어요. 다시 쓰려면 홈 화면에서 QR을 다시 스캔해 주세요</div>
    </div>
  `
}

const CTRL_CSS = `
  #ctl, #ctl * { box-sizing: border-box; }
  #ctl {
    position: fixed; inset: 0; display: flex; flex-direction: column;
    font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
    background: linear-gradient(180deg, var(--pz-bg-veil-4, #2b1b52) 0%, var(--pz-bg-veil-2, #150a2e) 100%);
  }

  /* ── 상단 탭바 — 폰(컨트롤러 앱) 자신의 기본 UI ── */
  #ctl-topbar {
    flex: none; display: flex; align-items: stretch; gap: 4px;
    padding: calc(8px + env(safe-area-inset-top)) 10px 6px;
    border-bottom: 2px solid rgba(255,255,255,0.1);
  }
  .ctl-tab {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
    background: none; border: none; color: rgba(255,255,255,0.85); cursor: pointer;
    padding: 6px 2px; border-radius: 14px; font: inherit; -webkit-tap-highlight-color: transparent;
  }
  .ctl-tab span { font-size: 0.62rem; font-weight: 700; }
  .ctl-tab:active { background: rgba(255,255,255,0.12); }
  .ctl-menu-wrap { position: relative; flex: 1; display: flex; }
  #ctl-more-panel {
    position: absolute; top: 100%; right: 0; z-index: 50; margin-top: 6px;
    background: var(--pz-lavender-panel, #F7F0FF); color: var(--pz-navy, #2a1a6e);
    border: 4px solid var(--pz-lavender-border, #c4a8f5); border-radius: 20px;
    padding: 10px; display: flex; flex-direction: column; gap: 6px; min-width: 180px;
    box-shadow: 0 8px 24px rgba(0,0,0,.4);
  }
  #ctl-more-panel.hidden { display: none; }
  .ctl-menu-item {
    display: flex; align-items: center; gap: 8px; text-align: left;
    background: rgba(255,255,255,0.6); border: none; border-radius: 12px;
    padding: 10px 12px; font: inherit; font-weight: 800; font-size: 0.85rem;
    color: var(--pz-navy, #2a1a6e); cursor: pointer;
  }
  .ctl-menu-item.warn { color: #a4322f; }
  #ctl-code-line { font-size: 0.7rem; opacity: 0.6; text-align: center; padding: 2px 0; }

  /* ── 가운데 게임 그리드 — 주 디바이스를 직접 조종한다 ── */
  #ctl-grid {
    flex: 1; overflow-y: auto; padding: 14px 12px;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px;
    align-content: start;
  }
  .ctl-card {
    background: rgba(255,255,255,0.06); border: 3px solid transparent; border-radius: 18px;
    padding: 8px; cursor: pointer; text-align: left; color: #fff; font: inherit;
    -webkit-tap-highlight-color: transparent; transition: transform .1s, border-color .15s;
  }
  .ctl-card:active { transform: scale(0.96); }
  .ctl-card.active { border-color: var(--pz-gold, #ffd23e); background: rgba(255,210,62,0.14); }
  .ctl-card-thumb { width: 100%; aspect-ratio: 16 / 10; border-radius: 12px; overflow: hidden;
    background: rgba(0,0,0,0.25); margin-bottom: 6px; }
  .ctl-card-thumb img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .ctl-card-title { font-size: 0.78rem; font-weight: 800; line-height: 1.2;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── 하단 D-pad — 주 디바이스 화면 **안**을 짚는다 ── */
  #ctl-dpad-wrap {
    flex: none; padding: 10px 16px calc(14px + env(safe-area-inset-bottom));
    background: rgba(0,0,0,0.22); border-top: 2px solid rgba(255,255,255,0.12);
  }
  #ctl-dpad-label {
    text-align: center; font-size: 0.72rem; font-weight: 800; opacity: 0.85;
    margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;
  }
  #ctl-dpad-label #ctl-focus { color: var(--pz-gold, #ffd23e); }
  #ctl-dpad-row {
    max-width: 420px; margin: 0 auto; display: flex; gap: 8px; justify-content: space-between;
  }
  .ctl-dbtn {
    flex: 1; aspect-ratio: 1; min-height: 52px; max-height: 68px;
    border-radius: 18px; border: none; cursor: pointer; -webkit-tap-highlight-color: transparent;
    background: var(--pz-lavender-light, #d9c8f7); color: var(--pz-navy, #2a1a6e);
    box-shadow: 0 4px 0 var(--pz-lavender, #a78bda);
    display: flex; align-items: center; justify-content: center;
  }
  .ctl-dbtn:active { transform: translateY(3px); box-shadow: none; }
  .ctl-dbtn.ok { background: var(--pz-gold, #ffd23e); color: var(--pz-gold-text, #4a2a00);
    box-shadow: 0 4px 0 var(--pz-gold-shadow, #c89800); }

  /* ── 나가기 확인 ── */
  #ctl-exit-confirm {
    position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center;
    background: rgba(8,3,20,.72);
  }
  #ctl-exit-confirm.hidden { display: none; }
  .ctl-confirm-box {
    background: linear-gradient(var(--pz-navy, #2a1a6e), var(--pz-navy-2, #1c1050));
    border: 4px solid var(--pz-gold, #ffd23e); border-radius: 24px; padding: 24px 28px;
    text-align: center; max-width: min(86vw, 340px);
  }
  .ctl-confirm-box p { margin: 0 0 16px; font-size: 1.05rem; font-weight: 900; }
  .ctl-confirm-actions { display: flex; flex-direction: column; gap: 10px; }
  .ctl-btn {
    min-height: 48px; padding: 0 24px; border-radius: var(--pz-radius-pill, 9999px); border: none;
    cursor: pointer; font: inherit; font-weight: 900; font-size: 0.95rem;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  }
  .ctl-btn.secondary { background: var(--pz-lavender-light, #d9c8f7); color: var(--pz-navy, #2a1a6e); }
  .ctl-btn.warn { background: var(--pz-red, #ff6b6b); color: #fff; }
`

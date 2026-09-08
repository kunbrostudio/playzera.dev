// 리모컨 연결 팝업 — 홈 화면 QR 아이콘을 누르면 뜬다. STEP 64~66.
//
// `home.js`가 직접 그리지 않고 이 모듈을 동적 import로 불러온다 — `qrcode`
// 라이브러리를 이 팝업을 실제로 열 때만 내려받는다(registry.js의 게임팩
// 로더와 같은 이유, 홈 화면 첫 로딩에 안 끼워 넣는다).
//
// 이 디바이스가 지금 어느 역할인지에 따라 여는 내용이 다르다 — 한
// 디바이스가 동시에 둘 다일 수 있다는 걸 몰라도 되게, 버튼 하나가
// 알아서 갈라준다:
//   - `controller.active`(내가 지금 다른 기기를 조종 중) → 작은 "연결
//     끊기" 패널만 보여준다. 여기서 새 QR을 만들 이유가 없다 — 조종하는
//     쪽이 동시에 조종당하는 QR까지 켤 필요는 지금 범위 밖이다.
//   - 그 외(평소, 또는 내가 조종당하는 주 디바이스) → 기존 QR 페어링
//     흐름.
//
// **연결되는 순간 팝업이 스스로 닫힌다**(ken 지적, 9/4) — 1단계는 "연결
// 됐어요!" 카드가 계속 떠 있어서 화면을 막았다. 이제는 승인 직후 짧게
// 초록 글자로 확인해준 뒤 자동으로 사라지고, 이후엔 QR 아이콘 자체가
// 빨간 펄스로 "지금 연결돼 있다"를 알린다(`bindRemoteButton.js`). 다시
// 끊고 싶으면 그 아이콘을 한 번 더 눌러 이 팝업을 다시 열면 된다 —
// 그때는 이미 연결된 상태로 열리므로 자동으로 안 닫히고 "연결 끊기"
// 버튼을 보여준다(아래 `wasConnected` 판단 참고).
//
// **"화면 보기"(미러링) 토글은 걷어냈다**(STEP 73). 태블릿이 화면이고
// 폰은 입력이라는 구조로 정리하면서 미러링 자체를 지웠다 — 이유는
// `session.js` 머리말 참고. 이 패널에 있던 토글·`<video>`도 같이 뺐다.
//
// **QR을 카메라로 찍는 것도 이 팝업 안에서 할 수 있다**(ken 요청, 9/4).
// 지금까지는 폰의 OS 카메라 앱(사진 촬영 시 QR 인식)으로만 스캔할 수
// 있었다 — 이 앱 안에서 직접 카메라를 열어 스캔하는 길이 없었다. 주
// 디바이스 패널 안에 "QR 스캔하기" 버튼을 추가해서, 어느 기기든(폰이든
// 태블릿이든) 자기 카메라로 다른 화면의 QR을 찍어 리모컨이 될 수
// 있게 했다. **`BarcodeDetector` 네이티브 API는 안 쓴다** — iOS
// Safari가 2026년 현재도 전혀 지원 안 한다(모든 iOS 브라우저가 마찬가지,
// WebKit 미구현). 대신 순수 JS 디코더 `jsqr`로 프레임마다 직접 해석한다
// — Safari 포함 어디서나 동작한다.
//
// **"QR 스캔하기"는 이미 연결된 기기에는 안 보인다**(ken 요청, 9/4) —
// 이미 리모컨과 붙어 있는 기기가 또 다른 화면을 스캔해 리모컨이 될
// 이유가 없다. `render(state)`가 `state.connected`를 볼 때마다 버튼과
// "또는" 구분선을 같이 켜고 끈다.
import { remoteSession } from './session.js'
import { controller } from './controller.js'
import { icon } from '../icons.js'
import { handErrorMessage } from '../handControl.js'
import { extractRemoteCode } from './qrUtil.js'

const AUTO_CLOSE_MS = 1100   // "연결됐어요!" 글자를 읽을 시간만 주고 닫는다
const SCAN_INTERVAL_MS = 200 // 매 프레임 디코드는 과하다 — 이 정도면 체감상 즉시다

/**
 * 팝업을 연다. 이미 대기 중/연결된 세션이 있으면 새 코드를 안 뽑고
 * 그 상태를 그대로 보여준다 — 실수로 다시 열었다고 코드가 또 바뀌면
 * 이미 스캔한 QR이 무효가 된다.
 *
 * @param {HTMLElement} root  팝업을 붙일 곳(대개 document.body)
 */
export async function openPairingModal(root) {
  if (controller.active) return openControllerPanel(root)
  return openPrimaryPanel(root)
}

// ── 내가 다른 기기를 조종 중일 때 ────────────────────────────────

function openControllerPanel(root) {
  const wrap = document.createElement('div')
  wrap.id = 'pz-remote-modal'
  wrap.innerHTML = `
    ${MODAL_STYLE}
    <div id="pz-remote-card">
      <button id="pz-remote-close" aria-label="닫기">${icon('close', 1)}</button>
      <div id="pz-remote-title">${icon('qrcode')} 리모컨으로 조종 중</div>
      <div id="pz-remote-status" class="ok">지금 이 기기로 다른 화면을 조종하고 있어요</div>
      <div id="pz-remote-actions">
        <button class="pz-remote-btn warn" id="pz-remote-disconnect">연결 끊기</button>
      </div>
    </div>
  `
  root.appendChild(wrap)
  const $ = s => wrap.querySelector(s)

  const close = () => wrap.remove()
  $('#pz-remote-close').addEventListener('click', close)
  wrap.addEventListener('click', e => { if (e.target === wrap) close() })
  $('#pz-remote-disconnect').addEventListener('click', () => {
    controller.disconnect()
    close()
  })
}

// ── 내가 QR을 여는 주 디바이스일 때(기존 1단계 흐름) ────────────────

async function openPrimaryPanel(root) {
  const wrap = document.createElement('div')
  wrap.id = 'pz-remote-modal'
  wrap.innerHTML = `
    ${MODAL_STYLE}
    <div id="pz-remote-card">
      <button id="pz-remote-close" aria-label="닫기">${icon('close', 1)}</button>
      <div id="pz-remote-title">${icon('phone')} 리모컨 연결</div>
      <div id="pz-remote-sub">부모님 휴대폰으로 QR을 찍어 주세요</div>
      <div id="pz-remote-qr"></div>
      <div id="pz-remote-code"></div>
      <div id="pz-remote-status"></div>
      <div id="pz-remote-actions"></div>
      <div id="pz-remote-divider">또는</div>
      <button class="pz-remote-btn accent" id="pz-remote-scan-link">${icon('camera', 1)} QR 스캔하기</button>
    </div>
  `
  // "QR 스캔하기"는 이 기기가 아직 아무 리모컨과도 안 붙어 있을 때만
  // 뜻이 있다 — 이미 연결됐으면 스캔할 이유가 없다(ken 요청, 9/4).
  // `render(state)`가 매 상태 변화마다 `connected` 여부로 다시 켜고 끈다.
  root.appendChild(wrap)

  const $ = s => wrap.querySelector(s)
  const close = () => { unsub?.(); clearTimeout(autoCloseTimer); wrap.remove() }
  $('#pz-remote-close').addEventListener('click', close)
  wrap.addEventListener('click', e => { if (e.target === wrap) close() })
  // 이 기기가 "찍히는 QR을 보여주는 쪽"이 아니라 "다른 화면을 카메라로
  // 찍어서 그 리모컨이 되는 쪽"을 하고 싶을 때 — 카드 안을 스캐너
  // 화면으로 통째로 바꿔 낀다(아래 `openScanner` 참고). 이 팝업이 갱신할
  // DOM 자리가 스캐너 화면으로 바뀌므로, `render()` 구독은 먼저 끊는다
  // — 안 끊으면 스캐너가 떠 있는 동안 remoteSession이 상태를 바꿀 때
  // (예: 다른 곳에서 누가 이 코드로 join을 시도) `render()`가 이미
  // 지워진 엘리먼트를 찾다가 죽는다.
  $('#pz-remote-scan-link').addEventListener('click', () => {
    unsub?.()
    openScanner(wrap, close)
  })

  // 이 팝업이 열려 있는 동안 "방금 연결됐다"로 판단할 기준선 — 처음부터
  // 이미 연결돼 있었다면(QR 아이콘을 다시 눌러 열었을 때) 자동으로 닫지
  // 않는다. 이번 팝업 세션 중 새로 연결됐을 때만 자동으로 닫는다.
  let wasConnected = remoteSession.isPaired
  let autoCloseTimer = null

  async function drawQr(code) {
    const url = `${location.origin}${location.pathname}#/remote?code=${code}`
    const { default: QRCode } = await import('qrcode')
    const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 1, color: { dark: '#1c1240', light: '#ffffff' } })
    $('#pz-remote-qr').innerHTML = `<img src="${dataUrl}" alt="리모컨 연결 QR" />`
    $('#pz-remote-code').textContent = code
  }

  function render(state) {
    const statusEl = $('#pz-remote-status')
    const actionsEl = $('#pz-remote-actions')
    const divider = $('#pz-remote-divider')
    const scanLink = $('#pz-remote-scan-link')
    if (divider) divider.hidden = !!state.connected
    if (scanLink) scanLink.hidden = !!state.connected
    if (state.pending) {
      statusEl.textContent = '휴대폰이 연결하려고 해요 — 허용할까요?'
      statusEl.className = 'warn'
      actionsEl.innerHTML = `
        <button class="pz-remote-btn go" id="pz-remote-approve">허용</button>
        <button class="pz-remote-btn" id="pz-remote-deny">거부</button>`
      $('#pz-remote-approve').addEventListener('click', () => remoteSession.approve())
      $('#pz-remote-deny').addEventListener('click', () => remoteSession.deny())
    } else if (state.connected) {
      statusEl.textContent = '연결됐어요!'
      statusEl.className = 'ok'
      actionsEl.innerHTML = `<button class="pz-remote-btn warn" id="pz-remote-disconnect">연결 끊기</button>`
      $('#pz-remote-disconnect').addEventListener('click', () => { remoteSession.stop(); startFresh() })
      if (!wasConnected) {
        // 방금 막 연결됐다 — 짧게 보여주고 스스로 닫는다. 재요청은
        // QR 아이콘을 다시 눌러서(이번엔 이미 연결된 상태로 열려
        // 자동으로 안 닫힘).
        clearTimeout(autoCloseTimer)
        autoCloseTimer = setTimeout(close, AUTO_CLOSE_MS)
      }
      wasConnected = true
    } else if (state.waiting) {
      statusEl.textContent = '기다리는 중이에요…'
      statusEl.className = ''
      actionsEl.innerHTML = ''
    }
    // state가 셋 다 false인 순간(= stop() 막 불렀을 때)은 그냥 둔다 — 이
    // 팝업을 여는 두 경로(처음 열기·연결 끊기 버튼) 모두 곧바로 startFresh()를
    // 따로 부르므로, 여기서까지 다시 시작을 걸면 startPairing() 내부의
    // stop() 호출과 서로를 부르며 무한 루프가 된다.
  }

  const unsub = remoteSession.onChange(render)

  async function startFresh() {
    wasConnected = false
    try {
      const code = await remoteSession.startPairing()
      await drawQr(code)
      render({ code, waiting: true, connected: false, pending: false })
    } catch (e) {
      console.warn('[remote] 페어링 시작 실패:', e)
      $('#pz-remote-status').textContent = '연결을 열지 못했어요. 인터넷 연결을 확인해 주세요'
      $('#pz-remote-status').className = 'warn'
    }
  }

  if (remoteSession.isWaiting || remoteSession.isPaired) {
    if (remoteSession.code) await drawQr(remoteSession.code)
    render({ code: remoteSession.code, waiting: remoteSession.isWaiting, connected: remoteSession.isPaired, pending: remoteSession.hasPending })
  } else {
    await startFresh()
  }
}

// ── QR을 카메라로 찍기 ────────────────────────────────────────────
//
// `wrap`(모달 전체)의 카드 안을 스캐너 화면으로 통째로 바꿔 낀다 — 원래
// QR-보여주기 화면으로 되돌아갈 필요가 없다(취소하면 팝업 자체를 닫는다,
// 다시 열고 싶으면 QR 아이콘을 또 누르면 된다). 성공하면 `#/remote?code=`로
// 이동시켜 `pages/remote.js`가 나머지(연결 대기·승인·허브 전환)를 그대로
// 이어받는다 — 연결 로직을 여기서 새로 안 짠다.
function openScanner(wrap, closeModal) {
  const card = wrap.querySelector('#pz-remote-card')
  card.innerHTML = `
    <button id="pz-remote-close" aria-label="닫기">${icon('close', 1)}</button>
    <div id="pz-remote-title">${icon('camera', 1)} QR 스캔하기</div>
    <div id="pz-remote-sub">다른 화면의 QR을 카메라에 비춰 주세요</div>
    <div id="pz-scan-video-wrap"><video id="pz-scan-video" autoplay playsinline muted></video></div>
    <div id="pz-remote-status"></div>
    <div id="pz-remote-actions"><button class="pz-remote-btn" id="pz-scan-cancel">취소</button></div>
  `
  const $ = s => card.querySelector(s)
  const statusEl = $('#pz-remote-status')

  let stream = null
  let scanTimer = null
  let stopped = false
  function stop() {
    stopped = true
    clearInterval(scanTimer)
    stream?.getTracks().forEach(t => t.stop())
  }

  $('#pz-remote-close').addEventListener('click', () => { stop(); closeModal() })
  $('#pz-scan-cancel').addEventListener('click', () => { stop(); closeModal() })

  statusEl.textContent = '카메라를 여는 중…'

  Promise.all([openCamera(), import('jsqr')]).then(([gotStream, { default: jsQR }]) => {
    if (stopped) { gotStream.getTracks().forEach(t => t.stop()); return }   // 그새 취소됐다
    stream = gotStream

    const video = $('#pz-scan-video')
    video.srcObject = stream
    // `autoplay` 속성만으로는 일부 브라우저(특히 iOS Safari)에서 `srcObject`를
    // 나중에 코드로 붙이면 안 켜지는 경우가 있다 — 명시적으로 한 번 더 부른다.
    video.play().catch(() => {})
    statusEl.textContent = 'QR을 카메라에 비춰 주세요'
    statusEl.className = ''

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    scanTimer = setInterval(() => {
      if (video.readyState < video.HAVE_CURRENT_DATA || !video.videoWidth) return
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const result = jsQR(frame.data, frame.width, frame.height)
      if (!result) return
      const code = extractRemoteCode(result.data)
      if (!code) return   // 이 앱이 만든 QR이 아니다 — 계속 찾는다
      stop()
      closeModal()
      window.location.hash = `/remote?code=${code}`
    }, SCAN_INTERVAL_MS)
  }).catch(e => {
    if (stopped) return
    statusEl.textContent = handErrorMessage(e)
    statusEl.className = 'warn'
  })
}

/**
 * 후면 카메라를 우선하되(다른 화면을 찍는 용도), 그 값 자체를 못 받아주는
 * 기기(후면·전면 구분이 애매한 일부 태블릿 등)에서는 카메라 종류를 안
 * 가리고 아무거나 열어 본다 — `facingMode`를 `ideal`이 아니라 맨값으로
 * 주면 일부 브라우저가 이걸 "반드시"로 읽어 `OverconstrainedError`를
 * 던지고 완전히 실패했었다("카메라 연결이 안돼", ken 재테스트 9/4).
 */
async function openCamera() {
  // 브라우저가 안전한 컨텍스트(HTTPS·localhost)가 아니면 `navigator.mediaDevices`
  // 자체가 아예 `undefined`다 — 그 상태로 `.getUserMedia`를 읽으면 이름 없는
  // 생 TypeError가 튀어나와 사람이 못 읽는다("TypeError undefined is not an
  // object", ken 재테스트 9/4 — `192.168.x.x:5173`처럼 IP로 붙은 평문 HTTP라
  // 아이폰 사파리가 카메라 API 자체를 안 내준다). 미리 잡아서
  // `handErrorMessage`가 이미 아는 `SecurityError`로 던진다.
  if (!navigator.mediaDevices?.getUserMedia) {
    const e = new Error('카메라 API를 쓸 수 없는 환경이에요(HTTPS 필요)')
    e.name = 'SecurityError'
    throw e
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
  } catch (e) {
    if (e?.name === 'OverconstrainedError' || e?.name === 'NotFoundError') {
      return navigator.mediaDevices.getUserMedia({ video: true })
    }
    throw e
  }
}

const MODAL_STYLE = `
    <style>
      #pz-remote-modal { position: fixed; inset: 0; z-index: 2000;
        display: flex; align-items: center; justify-content: center;
        background: rgba(10, 4, 24, 0.72); font-family: var(--font-main, 'Jua', sans-serif); }
      #pz-remote-card { width: min(88vw, 380px); background: var(--pz-bg-veil-3, #1c1240); color: #fff;
        border-radius: 24px; padding: 28px 24px; text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5); position: relative; }
      #pz-remote-close { position: absolute; top: 12px; right: 12px;
        width: 36px; height: 36px; border-radius: 999px; border: none;
        background: rgba(255,255,255,0.12); color: #fff; display: flex;
        align-items: center; justify-content: center; cursor: pointer; }
      #pz-remote-title { font-size: 1.25rem; font-weight: 900; margin-bottom: 6px; }
      #pz-remote-sub { font-size: 0.9rem; opacity: 0.75; margin-bottom: 18px; }
      #pz-remote-qr { width: 200px; height: 200px; margin: 0 auto 14px;
        background: #fff; border-radius: 16px; display: flex;
        align-items: center; justify-content: center; overflow: hidden; }
      #pz-remote-qr img { width: 100%; height: 100%; }
      #pz-remote-code { font-size: 1.6rem; font-weight: 900; letter-spacing: 0.25em;
        margin-bottom: 16px; }
      #pz-remote-status { font-size: 0.95rem; font-weight: 800; min-height: 1.4em; margin: 14px 0; }
      #pz-remote-status.ok { color: var(--pz-green-a, #8dff7a); }
      #pz-remote-status.warn { color: var(--pz-gold, #ffd23e); }
      #pz-remote-actions { display: flex; flex-direction: column; gap: 10px; }
      .pz-remote-btn { min-height: 50px; border-radius: var(--pz-radius-pill, 9999px); border: 2px solid rgba(255,255,255,0.25);
        background: rgba(255,255,255,0.10); color: #fff; font: inherit; font-weight: 900;
        font-size: 1rem; cursor: pointer; }
      .pz-remote-btn.go { background: var(--pz-gold, #ffd23e); color: var(--pz-gold-text, #4a2a00); border-color: transparent; }
      .pz-remote-btn.warn { background: var(--pz-red, #ff6b6b); color: #3a0a0a; border-color: transparent; }
      .pz-remote-btn.accent { background: linear-gradient(135deg, var(--pz-blue-start, #0ECAFD), var(--pz-blue-end, #0057EC));
        color: #fff; border-color: transparent; width: 100%; }
      #pz-remote-divider { margin-top: 18px; margin-bottom: 10px; font-size: 0.8rem;
        font-weight: 700; opacity: 0.5; }
      #pz-scan-video-wrap { width: 100%; aspect-ratio: 1; border-radius: 16px; overflow: hidden;
        background: #000; margin-bottom: 4px; }
      #pz-scan-video-wrap video { width: 100%; height: 100%; object-fit: cover; }
    </style>`

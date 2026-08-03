// 손 컨트롤 세션 — 앱 수명 동안 하나만 존재한다.
//
// 화면(허브·인트로)마다 카메라와 포인터를 각자 켜고 끄면 게임 하나 시작하는 데
// 카메라를 세 번 여닫는다. 그때마다 커서가 0.5~1초 끊기고, 방금 닫은 장치를 바로
// 다시 여는 동안 `NotReadableError`가 날 여지도 생긴다.
//
// 그래서 세션은 라우팅과 무관하게 유지된다. 화면은 "지금 커서가 필요한가"만 말한다.
//   · 허브·인트로  → setPointerActive(true)
//   · 게임 플레이  → setPointerActive(false)  (몸과 O/X로 조작하므로 커서가 방해된다)
//
// 카메라 자체는 `poseEngineCore`가 참조 카운팅으로 관리한다. 게임이 자기 PIP에
// 영상을 붙일 때도 같은 스트림을 빌려 쓰므로 재시작이 일어나지 않는다.

import { poseEngineCore, isPoseSupported, poseUnsupportedReason } from './pose/poseEngine.js'
import { createPipOverlay } from './pose/pipOverlay.js'
import { createHandPointer } from './pointer.js'

const PREF_KEY = 'pz_hand_pointer'

const readPref = () => {
  try { return localStorage.getItem(PREF_KEY) === '1' } catch { return false }
}
const writePref = on => {
  try { localStorage.setItem(PREF_KEY, on ? '1' : '0') } catch { /* 무시 */ }
}

let enabled = false
let starting = false
let pointer = null
let overlay = null
let detach = null
let unsub = null
let pipEl = null
let pipVideo = null
let pointerActive = true
const listeners = new Set()

function notify() {
  for (const fn of listeners) { try { fn(enabled) } catch { /* 무시 */ } }
}

// 자기 모습이 보여야 "인식되고 있다"를 안다. 라우트가 바뀌어도 살아 있어야 하므로
// 화면 마크업이 아니라 body에 직접 붙인다.
function ensurePip() {
  if (pipEl) return pipEl
  const style = document.createElement('style')
  style.id = 'pz-hand-pip-style'
  style.textContent = `
    #pz-hand-pip {
      position: fixed; right: 14px; bottom: 92px; z-index: 9998;
      width: 148px; height: 111px; display: none;
      border-radius: 12px; overflow: hidden;
      border: 2px solid rgba(196,168,245,0.5);
      box-shadow: 0 4px 16px rgba(0,0,0,0.45);
      pointer-events: none;
    }
    #pz-hand-pip.on { display: block; }
    #pz-hand-pip video, #pz-hand-pip canvas {
      position: absolute; inset: 0; width: 100%; height: 100%;
    }
    #pz-hand-pip video { object-fit: cover; transform: scaleX(-1); }
  `
  document.head.appendChild(style)

  pipEl = document.createElement('div')
  pipEl.id = 'pz-hand-pip'
  pipEl.innerHTML = `<video muted playsinline></video><canvas></canvas>`
  document.body.appendChild(pipEl)
  pipVideo = pipEl.querySelector('video')
  overlay = createPipOverlay(pipEl.querySelector('canvas'), { zones: false })
  return pipEl
}

function syncVisibility() {
  const show = enabled && pointerActive
  pipEl?.classList.toggle('on', show)
  if (show) pointer?.start()
  else pointer?.stop()
}

export const handSession = {
  get enabled() { return enabled },
  get preferred() { return readPref() },

  // 화면이 바뀔 때 커서 표시 여부만 알린다. 카메라는 건드리지 않는다.
  setPointerActive(active) {
    pointerActive = !!active
    syncVisibility()
  },

  onChange(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  get supported() { return isPoseSupported() },
  get unsupportedReason() { return poseUnsupportedReason() },

  async enable() {
    if (enabled || starting) return
    // 될 수 없는 기기라면 권한 팝업을 띄우기 전에 멈춘다.
    // 허락을 받아놓고 모델 로드에서 실패하는 건 사용자에게 두 번 실망을 준다.
    if (!isPoseSupported()) {
      const err = new Error(poseUnsupportedReason() ?? '지원하지 않는 기기예요')
      err.name = 'PoseUnsupportedError'
      writePref(false)
      throw err
    }
    starting = true
    try {
      ensurePip()
      await poseEngineCore.acquire()
      detach = poseEngineCore.attach(pipVideo)
      unsub = poseEngineCore.onLandmarks(lms => overlay.draw(lms))
      pointer = createHandPointer()
      enabled = true
      writePref(true)
      syncVisibility()
      notify()
    } catch (e) {
      // 안 되는 걸 화면에 들어올 때마다 시도하면 매번 에러 안내를 본다
      writePref(false)
      throw e
    } finally {
      starting = false
    }
  },

  disable({ remember = true } = {}) {
    if (!enabled) {
      if (remember) writePref(false)
      return
    }
    pointer?.destroy()
    pointer = null
    unsub?.(); unsub = null
    detach?.(); detach = null
    overlay?.clear()
    poseEngineCore.release()
    enabled = false
    if (remember) writePref(false)
    pipEl?.classList.remove('on')
    notify()
  },

  // 지난번에 켜뒀다면 다시 켠다. 실패해도 화면을 막지 않는다.
  //
  // ⚠️ iOS Safari는 `getUserMedia`를 **사용자 제스처 안에서만** 허용한다.
  // 페이지가 뜨자마자 부르면 권한이 이미 허용돼 있어도 거부된다.
  // 그래서 바로 켜지 말고 "다음 탭/클릭 한 번"에 켠다. 데스크톱에서는 차이가 없고
  // (어차피 아무 데나 한 번 누르게 된다), 아이폰에서는 이게 유일하게 되는 방법이다.
  //
  // 게임을 마치고 허브로 돌아온 경우처럼 이미 카메라가 열려 있으면 그대로 이어진다.
  async resumeIfPreferred() {
    if (!readPref() || enabled) return false

    // 카메라가 이미 열려 있으면(다른 화면이 붙들고 있는 중) 제스처 없이도 된다
    if (poseEngineCore.isRunning()) {
      try { await this.enable(); return true }
      catch (e) { console.warn('[handSession] 자동 시작 실패:', e?.name, e?.message); return false }
    }

    armFirstGesture()
    return false
  },
}

// 첫 사용자 입력 한 번을 기다렸다가 켠다
let gestureArmed = false
function armFirstGesture() {
  if (gestureArmed) return
  gestureArmed = true
  const onFirst = async () => {
    document.removeEventListener('pointerdown', onFirst)
    document.removeEventListener('keydown', onFirst)
    gestureArmed = false
    if (!readPref() || enabled) return
    try { await handSession.enable() }
    catch (e) { console.warn('[handSession] 제스처 후 시작 실패:', e?.name, e?.message) }
  }
  document.addEventListener('pointerdown', onFirst)
  document.addEventListener('keydown', onFirst)
}

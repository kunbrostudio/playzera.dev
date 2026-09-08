// 리모컨 연결을 **탭이 죽어도 기억한다.** STEP 74.
//
// ── 왜 필요한가 ★ ────────────────────────────────────────────
//
// 부모가 폰을 주머니에 넣거나 다른 앱을 열면 iOS 사파리는 몇 초 안에 그
// 탭의 JS를 재운다 — WebSocket이 끊긴다. 더 나쁜 경우, 메모리가 모자라면
// 탭 자체를 **버린다**(돌아오면 페이지가 처음부터 다시 뜬다). 그러면
// 싱글톤(`controller.js`)이 새로 만들어지면서 "내가 무슨 코드로 누구랑
// 붙어 있었는지"를 통째로 잊는다.
//
// 리모컨이 주 기능이 되는 순간 이건 치명적이다 — 폰을 꺼냈다 켤 때마다
// QR을 다시 찍어야 하니까. 그래서 페어링 정보를 브라우저에 남긴다.
//
// ── 무엇을 저장하나 ──────────────────────────────────────────
//
// `code`만으로는 부족하다. 코드만 들고 다시 붙으면 `remoteId`가 새로
// 뽑히는데, 주 디바이스 입장에서는 **처음 보는 리모컨**이라 승인창을
// 다시 띄운다. `remoteId`까지 같이 기억해야 "아까 그 폰이 돌아왔다"로
// 알아볼 수 있다(`session.js`의 `_onJoin` 참고).
//
// `remoteId`는 무작위 토큰이라 그 자체가 열쇠다 — 알고 있다는 것이 곧
// 승인받았다는 뜻이다. 그래서 별도 인증 없이 재입장을 허용해도 된다.
//
// ── 왜 유효기간을 두나 ───────────────────────────────────────
//
// 안 두면 어제 쓰던 코드로 오늘 아침에 붙으려 시도한다. 그 세션은 이미
// 없으므로 실패하고 지워지긴 하지만, 그동안 화면이 "연결 중"으로 떠 있어
// 사용자는 뭔가 고장 난 줄 안다. 하루가 지난 페어링은 아예 시도하지 않는다.

const KEY_CONTROLLER = 'pz.remote.controller'   // 이 기기가 **조종하는 쪽**일 때
const KEY_PRIMARY = 'pz.remote.primary'         // 이 기기가 **조종당하는 쪽**일 때

/** 이만큼 지난 페어링은 없는 것으로 본다. */
export const MAX_AGE_MS = 12 * 60 * 60 * 1000

// localStorage는 **없을 수도, 던질 수도 있다** — 사파리 비공개 모드,
// 쿠키 차단, 용량 초과. 리모컨은 이게 안 돼도 (재연결만 못 할 뿐) 돌아가야
// 하므로 전부 조용히 실패시킨다.
function read(key, now) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (!v?.code || !v?.remoteId || typeof v.at !== 'number') return null
    if (now - v.at > MAX_AGE_MS) { localStorage.removeItem(key); return null }
    return { code: v.code, remoteId: v.remoteId, at: v.at }
  } catch { return null }
}

function write(key, code, remoteId, now) {
  try { localStorage.setItem(key, JSON.stringify({ code, remoteId, at: now })) }
  catch { /* 저장 못 해도 이번 세션은 그대로 돌아간다 */ }
}

function clear(key) {
  try { localStorage.removeItem(key) }
  catch { /* 무시 */ }
}

// 시각을 밖에서 받는다 — 안에서 `Date.now()`를 읽으면 유효기간을 테스트할
// 수 없다(이 저장소 공통 규칙: "감지기는 시간을 밖에서 받는다").
export const saveController = (code, remoteId, now = Date.now()) => write(KEY_CONTROLLER, code, remoteId, now)
export const loadController = (now = Date.now()) => read(KEY_CONTROLLER, now)
export const clearController = () => clear(KEY_CONTROLLER)

export const savePrimary = (code, remoteId, now = Date.now()) => write(KEY_PRIMARY, code, remoteId, now)
export const loadPrimary = (now = Date.now()) => read(KEY_PRIMARY, now)
export const clearPrimary = () => clear(KEY_PRIMARY)

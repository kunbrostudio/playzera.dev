// 최근 플레이한 게임 — 허브 홈의 "이어서 하기" 레일 데이터.
//
// 아직 계정(아이 선택)이 없으므로 브라우저 단위로 기록한다. 계정이 생기면
// (기획안 2단계) 이 모듈의 read/push 구현만 Supabase로 바꾸면 되고
// 홈 화면은 손대지 않아도 된다.
//
// 저장하는 것은 gameId와 시각뿐이다. 게임 메타데이터는 registry가 갖고 있으므로
// 여기에 복사해두면 제목·썸네일이 바뀔 때 두 곳이 어긋난다.

const KEY = 'pz_recent_games'
const MAX = 8

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw.filter(r => r && typeof r.id === 'string') : []
  } catch {
    return []
  }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))) }
  catch { /* 사파리 프라이빗 모드 등 — 이어서 하기는 없어도 되는 기능이다 */ }
}

// 게임에 들어갈 때 호출. 같은 게임을 다시 하면 맨 앞으로 올라온다.
export function markPlayed(gameId) {
  if (!gameId) return
  const list = read().filter(r => r.id !== gameId)
  list.unshift({ id: gameId, at: Date.now() })
  write(list)
}

// 최근 순 gameId 배열. 지금 registry에 없는 게임(삭제·이름 변경)은 걸러서 준다.
export function getRecentIds(isKnown = () => true) {
  return read().map(r => r.id).filter(isKnown)
}

export function clearRecent() { write([]) }

// 개발 편의 — 브라우저 콘솔에서 `pzResetRecent()` 한 줄로 첫 방문 상태로 되돌린다.
// 이어서 하기 레일이 사라지고 홈이 처음 열었을 때와 같아진다.
if (import.meta.env.DEV) {
  window.pzResetRecent = () => { clearRecent(); location.reload() }
}

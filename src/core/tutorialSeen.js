// 게임별 "튜토리얼을 봤는가" 기억.
//
// 튜토리얼을 매번 띄우면 두 번째부터는 걸림돌이다. 그렇다고 한 번 보고 영영 못
// 보게 하면 한참 뒤에 다시 한 아이가 방법을 물어볼 데가 없다 —
// 그래서 인트로에 "어떻게 해?" 버튼을 두고, 거기서는 언제든 다시 볼 수 있다.
//
// 계정이 생기면 이 모듈의 read/write만 Supabase로 바꾼다. 아이마다 다르게
// 기억해야 하는 값이기 때문이다(형이 봤다고 동생이 아는 건 아니다).

const KEY = 'pz_tutorial_seen'

function readAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    // 값이 깨졌다고 게임을 막을 이유는 없다. 못 본 것으로 친다.
    return {}
  }
}

export function hasSeenTutorial(gameId) {
  return readAll()[gameId] === true
}

export function markTutorialSeen(gameId) {
  try {
    const all = readAll()
    all[gameId] = true
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // 사파리 프라이빗 모드 등에서 쓰기가 막힐 수 있다.
    // 이 경우 튜토리얼이 매번 뜨지만, 게임이 안 되는 것보다는 낫다.
  }
}

// 개발·테스트용. 콘솔에서 pzResetTutorial()로 첫 방문 상태를 만든다.
export function resetTutorialSeen() {
  try { localStorage.removeItem(KEY) } catch { /* 무시 */ }
}

if (typeof window !== 'undefined') {
  window.pzResetTutorial = resetTutorialSeen
}

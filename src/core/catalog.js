// 카탈로그 표시 규칙 — 허브 홈이 쓰는 순수 함수 모음.
//
// home.js에서 떼어낸 이유는 테스트다. DOM·타이머·라우터가 섞인 파일 안에 있으면
// "이어서 하기가 낀 뒤에도 보던 줄에 남는가" 같은 규칙을 확인할 방법이 없다.
// 여기 있는 함수는 전부 입력 → 출력이라 브라우저 없이 검증된다.

export const PER_PAGE = 4     // 한 줄에 4개 — 03 설계 §전체 게임
export const RECENT_MAX = 8   // 이어서 하기 최대 개수
export const NEW_DAYS = 30    // createdAt이 이 안쪽이면 NEW 배지

const TAG_EMOJI = {
  달리기: '🏃', 점프: '🦘', 균형: '🧘', 협동: '🤝',
  피하기: '💨', 순발력: '⚡', 좌우이동: '↔️', 웜업: '🔥',
}

// 배지·라벨 ────────────────────────────────────────────────────

export function isNew(m, now = Date.now()) {
  if (!m?.createdAt) return false
  const t = new Date(m.createdAt).getTime()
  if (Number.isNaN(t)) return false
  const days = (now - t) / 86400000
  return days >= 0 && days <= NEW_DAYS
}

export function playersLabel(p) {
  if (!p) return ''
  return p.min === p.max ? `${p.min}명` : `${p.min}~${p.max}명`
}

// 카테고리 ─────────────────────────────────────────────────────

// 태그 목록을 따로 관리하면 반드시 어긋난다. manifest에서 집계한다.
export function buildCategories(manifests) {
  const count = new Map()
  for (const m of manifests) {
    for (const t of m.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1)
  }
  const tags = [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .map(([key, n]) => ({ key, n, emoji: TAG_EMOJI[key] ?? '🎈', label: key }))
  return [{ key: null, n: manifests.length, emoji: '🎯', label: '전체' }, ...tags]
}

// 히어로 ───────────────────────────────────────────────────────

// 실제로 플레이 가능한 게임 먼저, 그 안에서 최신순.
// 개발용 더미가 히어로를 차지하면 "시작하기"가 전부 준비 중 안내로 끝난다.
// 프로덕션에는 더미가 없으므로 이 정렬은 그냥 최신순이 된다.
export function buildFeatured(manifests, max) {
  return [...manifests]
    .sort((a, b) =>
      (a.placeholder ? 1 : 0) - (b.placeholder ? 1 : 0) ||
      String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
    )
    .slice(0, max)
}

// 한 줄 목록 ──────────────────────────────────────────────────

// 화면에 뿌릴 게임 한 줄을 만든다. **최근에 한 것이 앞, 나머지가 뒤.**
//
// 이전에는 '이어서 하기'와 '전체 게임'을 세로로 나눈 두 줄이었다. 그러면 줄 사이를
// 오가는 세로 이동 수단이 필요하고, 그 버튼이 카드 줄 바로 아래 붙는 순간
// 손 커서로는 조준이 불가능해진다 — 1.2초 겨누는 동안 손이 조금만 내려가면
// 엉뚱한 버튼에 걸린다.
//
// 한 줄로 합치면 화면에서 움직이는 방향이 좌우 하나뿐이다.
// 아이에게도 "왼쪽이 하던 거, 오른쪽이 새로운 거"로 읽힌다.
export function buildRail({ all, recentIds = [], filter = null, query = '' }) {
  const list = searchGames(filter ? all.filter(m => (m.tags ?? []).includes(filter)) : all, query)
  const byId = new Map(list.map(m => [m.id, m]))
  const out = []
  const seen = new Set()

  for (const id of recentIds) {
    const m = byId.get(id)
    if (m && !seen.has(id)) { out.push(m); seen.add(id) }
  }
  for (const m of list) if (!seen.has(m.id)) out.push(m)
  return out
}

// 제목·설명·태그를 훑는 단순 부분 문자열 검색.
//
// 아이는 검색을 못 한다(키보드가 필요하고 손 제스처로는 불가능). 부모·선생님이
// "오늘 균형 게임 뭐 있더라" 할 때 쓰는 도구다. 그래서 정교할 필요가 없다.
export function searchGames(list, query) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return list
  return list.filter(m => {
    const hay = [m.title, m.description, ...(m.tags ?? [])].join(' ').toLowerCase()
    return hay.includes(q)
  })
}

// 좌우 레일이 몇 쪽인지
export function railPageCount(items, perPage = PER_PAGE) {
  return Math.max(1, Math.ceil((items?.length ?? 0) / perPage))
}

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

// 줄 페이지 ────────────────────────────────────────────────────

// 0페이지는 이어서 하기(기록이 있을 때만), 그다음이 전체 게임 4개씩.
//
// 이어서 하기는 세로로 나누지 않고 한 페이지 안에서 좌우로 넘긴다. 성격이 다른
// 목록이라 그렇다 — 전체 게임은 훑는 목록이고, 이어서 하기는 "어제 하던 거"를
// 집는 자리다. 세로 페이지를 잡아먹으면 전체 게임까지 가는 길이 그만큼 길어진다.
export function buildPages({ all, recent = [], filter = null, perPage = PER_PAGE }) {
  const out = []

  if (recent.length) {
    out.push({ label: '이어서 하기', kind: 'recent', items: recent.slice(0, RECENT_MAX) })
  }

  const list = filter ? all.filter(m => (m.tags ?? []).includes(filter)) : all
  if (!list.length) {
    out.push({ label: '전체 게임', kind: 'all', items: [], total: 0 })
  } else {
    for (let i = 0; i < list.length; i += perPage) {
      out.push({ label: '전체 게임', kind: 'all', items: list.slice(i, i + perPage), total: list.length })
    }
  }
  return out
}

// 같은 라벨 안에서 "몇 쪽 중 몇 쪽"인지 — 전체 페이지 번호보다 이쪽이 읽힌다
export function labelPosition(pages, index) {
  const label = pages[index]?.label
  if (label === undefined) return { idx: 0, of: 0 }
  const of = pages.filter(p => p.label === label).length
  const idx = pages.slice(0, index + 1).filter(p => p.label === label).length
  return { idx, of }
}

// 페이지를 다시 만든 뒤 보던 자리를 찾는다.
//
// 인덱스로 기억하면 안 된다 — 게임을 처음 실행하는 순간 '이어서 하기'가 0페이지로
// 새로 끼어들면서 뒤가 통째로 한 칸 밀린다. 그러면 보던 줄 대신 엉뚱한 줄이 뜬다.
// 라벨과 "그 라벨 안에서 몇 쪽째"로 기억하면 밀려도 제자리를 찾는다.
export function findPageAfterRebuild(pages, before) {
  if (!before) return 0
  let seen = 0
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].label !== before.label) continue
    seen++
    if (seen === before.idx) return i
  }
  // 그 쪽이 사라졌으면 같은 라벨의 첫 쪽, 그것도 없으면 맨 앞
  const first = pages.findIndex(p => p.label === before.label)
  return Math.max(0, first)
}

// 이어서 하기 레일이 몇 쪽인지
export function railPageCount(items, perPage = PER_PAGE) {
  return Math.max(1, Math.ceil((items?.length ?? 0) / perPage))
}

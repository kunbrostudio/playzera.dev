// 방향키로 "다음에 갈 곳" 고르기 — **순수 계산.** DOM을 모른다. STEP 75.
//
// ── 왜 따로 뗐나 ─────────────────────────────────────────────
//
// 이 계산이 리모컨 조작감의 전부다. 잘못 고르면 부모가 ▶를 눌렀는데
// 엉뚱한 데로 튀고, 그건 화면을 보고 있어야만 알 수 있는 종류의 버그다.
// 좌표만 넣으면 되는 순수 함수로 두면 화면 없이도 수십 가지 배치를
// 만들어 확인할 수 있다(`test/spatialNav.test.js`).
//
// ── 어떻게 고르나 ────────────────────────────────────────────
//
// TV 리모컨과 같은 규칙이다. ▶를 누르면 **오른쪽에 있는 것 중 가장
// 가까운 것**으로 간다. "가깝다"를 잴 때 축을 나눠서 본다.
//
//   주축 거리   그 방향으로 얼마나 떨어져 있나  (▶면 x 차이)
//   부축 거리   그 방향과 직각으로 얼마나 어긋나 있나  (▶면 y 차이)
//
// 부축에 벌점을 크게 준다(`CROSS_PENALTY`). 안 주면 오른쪽 저 끝
// 위쪽에 있는 버튼이 "바로 옆 조금 아래"보다 가까워 보이는 일이 생긴다 —
// 눈으로 보는 사람에게는 명백히 틀린 선택이다. 사람은 방향키를 누를 때
// **그 줄 안에서** 움직인다고 기대한다.
//
// 겹치는 것은 우대한다. 지금 것과 부축 범위가 겹쳐 있으면(같은 줄에
// 있다는 뜻) 벌점을 깎는다 — 카드가 한 줄로 늘어선 게임 레일에서
// 이게 결정적이다.
//
// ── 안 감싸고 안 넘어간다 ────────────────────────────────────
//
// 줄 끝에서 ▶를 또 누르면 **아무 일도 안 일어난다.** 반대쪽 끝으로
// 감으면(wrap) 3m 떨어져 화면을 보는 사람은 왜 갑자기 저기로 갔는지
// 모른다. 넷플릭스·애플TV도 안 감는다.

/** 부축(직각 방향) 어긋남에 주는 벌점 배수. 클수록 "그 줄 안에서" 움직인다. */
const CROSS_PENALTY = 3

/** 주축으로 이만큼은 움직여야 "그 방향에 있다"고 본다(px). 겹친 것끼리 튀는 걸 막는다. */
const MIN_STEP = 2

const centerOf = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })

/** 두 구간이 겹치나 — 같은 줄/같은 칸에 있는지 판단에 쓴다. */
const overlaps = (a1, a2, b1, b2) => Math.min(a2, b2) - Math.max(a1, b1) > 0

/**
 * `from`에서 `dir` 방향으로 갈 곳을 고른다.
 *
 * @param {{left:number,top:number,width:number,height:number}} from 지금 자리
 * @param {Array<{id:*, rect:{left,top,width,height}}>} candidates 갈 수 있는 곳들
 *   (`from` 자신이 섞여 있어도 된다 — 주축으로 안 움직이므로 걸러진다)
 * @param {'left'|'right'|'up'|'down'} dir
 * @returns {*|null} 고른 후보의 `id`. 그 방향에 아무것도 없으면 null
 */
export function pickInDirection(from, candidates, dir) {
  const horizontal = dir === 'left' || dir === 'right'
  const sign = (dir === 'right' || dir === 'down') ? 1 : -1
  const c0 = centerOf(from)

  let best = null
  let bestScore = Infinity

  for (const cand of candidates) {
    const r = cand.rect
    if (!r || r.width <= 0 || r.height <= 0) continue
    const c = centerOf(r)

    // 주축으로 그 방향에 있어야 한다.
    const along = horizontal ? (c.x - c0.x) * sign : (c.y - c0.y) * sign
    if (along < MIN_STEP) continue

    const cross = horizontal ? Math.abs(c.y - c0.y) : Math.abs(c.x - c0.x)

    // 같은 줄(부축 범위가 겹침)이면 벌점을 깎는다 — 가로로 늘어선 카드
    // 레일에서 옆 카드가 아래줄 카드에 지지 않게 하는 것이 이 항이다.
    const sameLane = horizontal
      ? overlaps(from.top, from.top + from.height, r.top, r.top + r.height)
      : overlaps(from.left, from.left + from.width, r.left, r.left + r.width)

    const score = along + cross * (sameLane ? 1 : CROSS_PENALTY)
    if (score < bestScore) { bestScore = score; best = cand }
  }

  return best ? best.id : null
}

/**
 * 포커스를 처음 잡을 때 어디에 둘지 고른다.
 *
 * **가장 큰 것**을 고른다. 이 디자인 시스템에서는 그 화면이 시키려는
 * 일(시작하기·다음·확인)이 항상 제일 큰 버튼이라, 크기가 곧 중요도다.
 * 화면이 직접 정하고 싶으면 `data-pz-focus-first`를 달면 된다 —
 * 그 판단은 부르는 쪽(`focusNav.js`)이 하고 여기는 크기만 본다.
 *
 * @param {Array<{id:*, rect:{width,height}}>} candidates
 * @returns {*|null}
 */
export function pickPrimary(candidates) {
  let best = null
  let bestArea = 0
  for (const cand of candidates) {
    const r = cand.rect
    if (!r) continue
    const area = r.width * r.height
    if (area > bestArea) { bestArea = area; best = cand }
  }
  return best ? best.id : null
}

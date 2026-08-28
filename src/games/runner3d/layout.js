// 좌우에 물건을 놓는 자리 정하기 — **겹치지 않게.**
//
// ── 왜 줄마다 따로 뿌리면 안 되나 ★ ──────────────────────────
//
// `PropRow`·`DinoRow`는 각자 자기 것만 안다. 야자수 줄은 야자수끼리 고르게 깔고,
// 공룡 줄도 공룡끼리 고르게 깐다 — 그런데 **둘은 서로를 모른다.** 한쪽에 열두 줄이
// 겹쳐 놓이니 브라키오 안에 티라노가 박혀 있는 그림이 나왔다(8/25).
//
// 줄을 늘릴수록 확실히 나빠진다. 줄이 n개면 겹칠 짝은 n²으로 는다.
//
// 고치는 방법은 **자리를 한 곳에서 관리하는 것**이다. 이미 놓인 것들을 들고 있다가,
// 새 후보가 너무 가까우면 다시 뽑는다. 몇 번 해도 안 되면 그중 제일 나은 것을 쓴다 —
// 영원히 도는 것보다 조금 가까운 게 낫다. 물건은 결국 다 놓여야 한다.
//
// ── z는 **고리처럼** 잰다 ★ ─────────────────────────────────
//
// 프롭은 `span`마다 되돌아온다(`PropRow.update`). 그러니 z = -1과 z = -(span-1)은
// 화면에서 **이웃이다.** 그냥 빼서 재면 이 둘을 멀다고 판단하고, 되돌아오는 순간
// 두 물건이 같은 자리에서 만난다. 되돌리기 주기로 나눈 나머지로 재야 한다.
//
// 순수 함수다 — three도 DOM도 모른다. 그래서 테스트가 잡을 수 있다.

/** 되돌리기를 감안한 z 거리. `span`이 주기인 고리 위의 최단 거리다. */
export function wrapDist(a, b, span) {
  const d = Math.abs(a - b) % span
  return Math.min(d, span - d)
}

/**
 * 한쪽(왼쪽 또는 오른쪽) 자리를 관리한다.
 *
 * **쪽마다 하나씩** 만든다. 왼쪽과 오른쪽은 트랙이 갈라놔서 서로 겹칠 일이 없고,
 * 하나로 합치면 쓸데없이 먼 것끼리 비교하느라 느려진다.
 *
 * @param {object} o
 * @param {number} o.span 되돌리기 주기
 * @param {number} [o.tries] 몇 번까지 다시 뽑을지. 크면 촘촘히 놓이고 느리다
 */
export function makePlacer({ span, tries = 40 }) {
  const taken = []
  return {
    /**
     * @param {() => {x:number, z:number}} gen 후보를 뽑는 함수 (난수는 밖에 있다)
     * @param {number} radius 이 물건이 차지하는 반지름
     * @returns {{x:number, z:number}} 정해진 자리
     */
    place(gen, radius) {
      let best = null
      let bestGap = -Infinity
      for (let i = 0; i < tries; i++) {
        const c = gen()
        let gap = Infinity
        for (const t of taken) {
          const dz = wrapDist(c.z, t.z, span)
          const dx = c.x - t.x
          gap = Math.min(gap, Math.hypot(dx, dz) - (radius + t.r))
          if (gap <= bestGap) break        // 이미 진 후보다 — 더 볼 것 없다
        }
        if (gap > 0) {
          taken.push({ x: c.x, z: c.z, r: radius })
          return c
        }
        if (gap > bestGap) { bestGap = gap; best = c }
      }
      // 다 실패했다. **그래도 놓는다** — 안 놓으면 그 물건이 사라진다.
      taken.push({ x: best.x, z: best.z, r: radius })
      return best
    },
    /** 테스트·디버그용. 지금까지 놓인 것들. */
    get taken() { return taken },
  }
}

/**
 * 한 줄(같은 종류) 전체의 자리를 잡는다. `PropRow`·`DinoRow`가 같이 쓴다.
 *
 * 흩뜨리는 규칙이 두 군데 있으면 한쪽만 고치게 된다 — 그래서 여기 하나로 뒀다.
 *
 * ── **큰 것을 먼저 놓는다** ★★ ──────────────────────────────
 *
 * 이 함수를 부르는 순서가 곧 우선순위다. 야자수 서른 그루를 먼저 깔고 나면
 * 반지름 4.5짜리 브라키오가 들어갈 구멍이 안 남는다 — 실제로 그랬다.
 * 좌우 띠는 140×20쯤이고 물건이 차지하는 넓이는 그 3분의 1인데도, 큰 것이
 * 늦게 오면 자리를 못 찾는다. **작은 것은 큰 것 사이에 들어가지만 반대는 안 된다.**
 *
 * 공룡은 모델을 받은 뒤에야(`loadParts`) 만들어지므로 언제나 마지막이다.
 * 그래서 `scene.js`가 공룡 자리를 **미리 잡아 두고** 나중에 넘겨준다.
 *
 * @returns {Array<{x:number, z:number, s:number}>}
 */
export function rowSpots({
  count, span, side, near, spread, scale = 1, radius = 1.4,
  placer = null, lo = 0.75, hi = 0.5, rnd = Math.random,
}) {
  return Array.from({ length: count }, (_, i) => {
    const s = scale * (lo + rnd() * hi)
    // z는 고르게 깔되 칸 안에서 **끝까지** 흔든다. 좁게 흔들면 후보가 늘 같은
    // 띠에 떨어져 배치기가 다시 뽑아도 겹침을 못 피한다.
    const gen = () => ({
      z: -span * ((i + rnd()) / count),
      x: side * (near + rnd() * spread),
    })
    const at = placer ? placer.place(gen, radius * s) : gen()
    return { x: at.x, z: at.z, s }
  })
}

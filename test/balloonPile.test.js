// 바구니에 담긴 풍선 줄의 치수 (STEP 76 후속 라운드 5)
//
// ken의 두 규칙이 서로 잡아당긴다: 한 줄만 쓴다(위로 쌓지 않는다) +
// 바구니 안에 담긴 것처럼 보인다(밖으로 안 삐져나온다). 개수가 늘 때
// 겹침으로 흡수하는 계산이 실제로 그 둘을 지키는지 본다.
import { describe, it, expect } from 'vitest'
import { pileMetrics, ITEM_PCT } from '../src/games/balloon-festival/pile.js'

/** 한 줄의 총 폭(컨테이너 대비 %) — CSS가 만드는 배치를 그대로 계산한다. */
const rowWidth = n => {
  const { itemPct, overlapPct } = pileMetrics(n)
  return n <= 0 ? 0 : itemPct + (n - 1) * (itemPct - overlapPct)
}

describe('pileMetrics — 풍선 크기', () => {
  it('개수와 상관없이 풍선 하나의 크기는 그대로다(한 줄이니 크기가 아니라 겹침으로 푼다)', () => {
    for (const n of [1, 3, 5, 8, 12]) {
      expect(pileMetrics(n).itemPct).toBe(ITEM_PCT)
    }
  })

  it('참고 그림처럼 큼직하다 — 줄 폭의 3분의 1쯤', () => {
    expect(ITEM_PCT).toBeGreaterThan(25)
  })
})

describe('pileMetrics — 줄이 바구니 밖으로 안 나간다 ★', () => {
  it('실제로 나올 수 있는 개수(1~10)에서 줄 폭이 컨테이너를 안 넘는다', () => {
    // 한 단계 최대치가 10개다(CATCH_STAGES 3단계). 그만큼은 확실히 담긴다.
    for (let n = 1; n <= 10; n++) {
      expect(rowWidth(n)).toBeLessThanOrEqual(100.001)
    }
  })

  it('고정 겹침이었다면 넘쳤을 개수에서도 안 넘친다(4차 판과의 차이)', () => {
    // 4차 판은 겹침이 풍선 폭의 32%로 고정이라 5개에서 이미 넘쳤다.
    const fixed = 5 * ITEM_PCT - 4 * (ITEM_PCT * 0.32)
    expect(fixed).toBeGreaterThan(100)      // 옛 방식은 넘쳤다
    expect(rowWidth(5)).toBeLessThanOrEqual(100.001)   // 지금은 안 넘친다
  })
})

describe('pileMetrics — 겹침의 한계', () => {
  it('개수가 늘수록 더 많이 겹친다', () => {
    expect(pileMetrics(8).overlapPct).toBeGreaterThan(pileMetrics(3).overlapPct)
  })

  it('한 개나 없을 때는 겹칠 것이 없으니 최소값이다', () => {
    expect(pileMetrics(1).overlapPct).toBe(pileMetrics(0).overlapPct)
  })

  it('아무리 많아도 상한을 넘지 않는다 — 넘으면 뒤 풍선이 색 조각으로만 남는다', () => {
    const cap = pileMetrics(100).overlapPct
    expect(cap).toBeLessThanOrEqual(ITEM_PCT * 0.8 + 1e-9)
    expect(pileMetrics(1000).overlapPct).toBe(cap)
  })

  it('겹침이 풍선 폭을 넘지 않는다(넘으면 순서가 뒤집혀 보인다)', () => {
    for (const n of [2, 5, 10, 50]) {
      expect(pileMetrics(n).overlapPct).toBeLessThan(ITEM_PCT)
    }
  })
})

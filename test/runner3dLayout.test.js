import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { wrapDist, makePlacer } from '../src/games/runner3d/layout.js'

/** 정해진 난수 — 테스트가 돌 때마다 결과가 바뀌면 아무것도 못 잡는다. */
function seeded(seed = 1) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('좌우 배치 — 겹치지 않게', () => {
  it('z 거리는 **되돌리기 주기**로 잰다', () => {
    // 프롭은 span마다 맨 뒤로 돌아온다. 그러니 -1과 -(span-1)은 화면에서 이웃이다.
    // 그냥 빼면 118 떨어진 걸로 나오고, 되돌아오는 순간 두 물건이 겹친다.
    expect(wrapDist(-1, -119, 120)).toBe(2)
    expect(wrapDist(-10, -20, 120)).toBe(10)
    expect(wrapDist(0, 60, 120)).toBe(60)   // 정확히 반대편이 최대다
  })

  it('★ 반지름이 겹치는 자리에는 안 놓는다', () => {
    const rnd = seeded(7)
    const span = 120
    const placer = makePlacer({ span })
    const put = []
    // 한쪽에 서른 개 — 지금 게임이 두는 양쯤 된다
    for (let i = 0; i < 30; i++) {
      const r = 1.2 + rnd() * 1.5
      const at = placer.place(() => ({
        z: -span * ((i + rnd()) / 30),
        x: -(8 + rnd() * 18),
      }), r)
      put.push({ ...at, r })
    }
    let worst = Infinity
    for (let i = 0; i < put.length; i++) {
      for (let j = i + 1; j < put.length; j++) {
        const a = put[i]; const b = put[j]
        const gap = Math.hypot(a.x - b.x, wrapDist(a.z, b.z, span)) - (a.r + b.r)
        worst = Math.min(worst, gap)
      }
    }
    // 0보다 크면 어떤 둘도 서로의 반지름 안에 없다
    expect(worst, `제일 가까운 둘의 여유 ${worst.toFixed(2)}`).toBeGreaterThan(0)
  })

  it('자리를 못 찾아도 **놓기는 놓는다**', () => {
    // 좁은 곳에 큰 것을 잔뜩 넣으면 여유가 없다. 그때 건너뛰면 물건이 사라져
    // "야자수 스무 그루"라고 적어 둔 것이 열두 그루가 된다 — 화면에서만
    // 티가 나고 코드에서는 안 보이는 종류의 버그다.
    const placer = makePlacer({ span: 10 })
    for (let i = 0; i < 12; i++) placer.place(() => ({ x: 0, z: -5 }), 3)
    expect(placer.taken).toHaveLength(12)
  })
})

describe('Draco는 **양쪽이 한 몸**이다', () => {
  // 내보낼 때만 켜고 받는 쪽을 안 켜면 모델이 통째로 안 뜬다. 화면은 도형
  // 플레이스홀더로 조용히 돌아가서(`models.js`) 콘솔을 안 보면 모른다.
  const py = fs.readFileSync('tools/blender/import_ai.py', 'utf8')
  const js = fs.readFileSync('src/games/runner3d/models.js', 'utf8')

  it('내보내기가 켜져 있으면 로더도 켜져 있다', () => {
    const exports = /export_draco_mesh_compression_enable\s*=\s*True/.test(py)
    expect(exports && /setDRACOLoader/.test(js),
      'import_ai.py가 Draco로 내보내는데 models.js가 DRACOLoader를 안 붙였다').toBe(true)
  })

  it('디코더가 저장소에 있다', () => {
    // CDN에서 받게 두면 오프라인이나 사내망에서 게임이 안 뜬다
    for (const f of ['draco_decoder.wasm', 'draco_wasm_wrapper.js']) {
      expect(fs.existsSync(`public/draco/${f}`), `public/draco/${f}가 없다`).toBe(true)
    }
  })
})

import { describe, it, expect } from 'vitest'
import PoopDodgeGame from '../src/games/poop-dodge/game.js'

// _pickZone은 playerZone과 poops만 본다. 캔버스 없이 그대로 호출한다.
const pick = (playerZone, zonesInFlight) =>
  PoopDodgeGame.prototype._pickZone.call({
    playerZone,
    poops: zonesInFlight.map(zone => ({ zone })),
  })

describe('똥 떨어지는 칸 고르기', () => {
  // 무작위로 떨어뜨리면 가만히 서 있어도 3분의 2는 그냥 지나간다.
  // 운동이 목적인 게임에서 "안 움직여도 되는 순간"이 대부분이면 안 된다.
  it('기본은 플레이어가 서 있는 칸이다', () => {
    expect(pick(0, [])).toBe(0)
    expect(pick(1, [])).toBe(1)
    expect(pick(2, [])).toBe(2)
  })

  it('내 칸에 이미 떨어지는 중이어도 또 겨눈다 — 계속 움직이게', () => {
    expect(pick(1, [1])).toBe(1)
  })

  it('다른 칸 하나가 위험해도 겨눈다 (도망갈 칸이 남아 있다)', () => {
    expect(pick(1, [0])).toBe(1)
  })

  // 남은 한 칸까지 겨누면 어디로 가도 맞는다. 그건 반응이 아니라 운이다.
  it('나머지 두 칸이 이미 위험하면 내 칸을 겨누지 않는다', () => {
    const z = pick(1, [0, 2])
    expect(z).not.toBe(1)
    expect([0, 2]).toContain(z)
  })

  it('세 칸 모두 위험할 때도 최소 한 칸은 비워둔다', () => {
    // 이미 세 칸에 떨어지는 중 = 내 칸도 위험하므로 그냥 내 칸을 겨눈다
    // (새로 다른 칸을 겨눠도 안전한 칸이 늘지 않는다)
    expect(pick(1, [0, 1, 2])).toBe(1)
  })

  it('피할 곳을 남긴 결과가 항상 유효한 칸이다', () => {
    for (let player = 0; player < 3; player++) {
      for (const flight of [[], [0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]]) {
        const z = pick(player, flight)
        expect([0, 1, 2]).toContain(z)
      }
    }
  })
})

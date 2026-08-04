import { describe, it, expect } from 'vitest'
import PoopDodgeGame from '../src/games/poop-dodge/game.js'

// setPlayerZone은 캔버스 없이도 검증할 수 있다.
const mover = () => {
  const g = { playerZone: 1, sideSteps: 0 }
  return {
    move: z => PoopDodgeGame.prototype.setPlayerZone.call(g, z),
    get steps() { return g.sideSteps },
    get zone() { return g.playerZone },
  }
}

// dodgeCount("피한 똥 개수")는 가만히 서 있어도 올라간다 — 운동량이 아니다.
// 운동 데이터로 쓸 수 있는 건 실제로 자리를 옮긴 횟수뿐이다.
describe('똥 피하기 — 몸 이동 횟수', () => {
  it('칸을 옮기면 1회로 센다', () => {
    const m = mover()
    m.move(0)
    m.move(2)
    expect(m.steps).toBe(2)
    expect(m.zone).toBe(2)
  })

  it('같은 칸을 다시 지정하면 세지 않는다', () => {
    const m = mover()
    m.move(0)
    m.move(0)
    m.move(0)
    expect(m.steps).toBe(1)
  })

  // 카메라는 프레임마다 zone을 알려준다. 안 움직였는데 계속 세면
  // "1분에 1800회 이동" 같은 값이 나온다.
  it('제자리에 서 있으면 늘지 않는다', () => {
    const m = mover()
    for (let i = 0; i < 100; i++) m.move(1)
    expect(m.steps).toBe(0)
  })

  it('왔다 갔다 하면 매번 센다', () => {
    const m = mover()
    for (const z of [0, 1, 0, 1, 0]) m.move(z)
    expect(m.steps).toBe(5)
  })
})

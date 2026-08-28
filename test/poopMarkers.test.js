// 발밑 버튼 그리기 — **그림이 없어도 죽으면 안 된다.**
//
// ── 실제로 죽었다 ────────────────────────────────────────────
//
// 폴백(알약 버튼) 쪽에 `sc`가 선언 없이 쓰이고 있었다. 3칸일 때는 버튼 그림 셋이
// 항상 있어서 **그 줄이 한 번도 실행되지 않았고**, 5칸을 붙여 바깥 두 장이
// 비는 순간 `ReferenceError`가 났다.
//
// 그리고 이건 그 버튼만 안 나오는 것으로 끝나지 않았다 — draw가 통째로 던져서
// **캐릭터도 버튼도 다 사라졌다.** 배경만 남아서 "아직 작업이 안 된 화면"처럼 보였다.
//
// 눈으로 잡기 어려운 종류다. 예외는 rAF 안에서 나고 화면은 그냥 조용하다.
import { describe, it, expect } from 'vitest'
import PoopDodgeGame from '../src/games/poop-dodge/game.js'

/** 캔버스 없이 호출용 — 쓰는 것만 있는 가짜 ctx. */
const fakeCtx = () => ({
  beginPath() {}, roundRect() {}, fill() {}, stroke() {}, fillText() {},
  drawImage() {}, save() {}, restore() {}, ellipse() {},
})

const runMarkers = (lanes, img = {}) =>
  PoopDodgeGame.prototype._drawMarkers.call({
    ctx: fakeCtx(),
    lanes,
    playerZone: Math.floor(lanes / 2),
    _img: img,
    _scale: 1,
    _floorH: 120,
    _footing: PoopDodgeGame.prototype._footing,
  }, 1600, 900)

describe('발밑 버튼', () => {
  it.each([3, 5])('%i칸 — 그림이 하나도 없어도 안 던진다 ★', lanes => {
    expect(() => runMarkers(lanes)).not.toThrow()
  })

  it('5칸 — 바깥 두 장만 없어도 안 던진다', () => {
    // 지금 저장소 상태가 이것이다(`_02` 두 장이 아직 없다).
    const img = {}
    for (const n of ['btn_left_default', 'btn_center_default', 'btn_right_default']) {
      img[`btn:${n}`] = { naturalWidth: 200, naturalHeight: 100 }
      img[`btnP:${n}`] = { naturalWidth: 200, naturalHeight: 100 }
    }
    expect(() => runMarkers(5, img)).not.toThrow()
  })
})

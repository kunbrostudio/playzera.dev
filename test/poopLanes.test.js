// 칸 수를 언제 다섯으로 여는가 — **판이 시작할 때 한 번** 정해지는 값이다.
//
// 순수 함수로 떼어 둔 이유가 이 테스트다. 화면과 엮여 있으면 "레벨 5에서 열리나"를
// 확인하려고 브라우저에서 레벨 5까지 놀아야 한다.
import { describe, it, expect } from 'vitest'
import { lanesFor, LANE_CHOICES } from '../src/games/poop-dodge/lanes.js'

describe('준비 화면의 기본 칸 수', () => {
  it('기본은 3칸이다', () => {
    // 처음 켠 아이가 다섯 칸을 만나면 어디로 가야 할지 모른다.
    // 넓히는 것은 **해 보고 고르는 쪽**이지 기본값이 아니다.
    expect(lanesFor()).toBe(3)
  })

  it('부모가 좁은 공간을 켜 두면 3칸이다 ★', () => {
    // 5칸은 집이 좁으면 물리적으로 안 된다. 공간은 아이가 판단할 수 있는 것이
    // 아니라 부모가 아는 것이다. 준비 화면에서 5칸 버튼도 함께 잠긴다.
    expect(lanesFor({ lockNarrow: true })).toBe(3)
  })

  it('고를 수 있는 것은 셋과 다섯뿐이다', () => {
    // 넷은 가운데 칸이 없다 — 아이가 "가운데로"라는 말을 못 쓴다.
    expect(LANE_CHOICES).toEqual([3, 5])
  })
})

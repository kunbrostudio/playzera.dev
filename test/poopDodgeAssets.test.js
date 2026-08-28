// 똥 피하기의 아이도 **프로필로 갈린다.** 러너와 같은 규칙이다.
//
// ── 왜 기계가 보나 ──────────────────────────────────────────
//
// 한쪽 폴더만 채우면 그 프로필을 고른 아이 화면에서 **주인공이 통째로 사라진다.**
// 게임은 멀쩡히 돌고 콘솔도 조용해서(로더가 개별 실패를 삼킨다) 알아채기 어렵다.
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { SKINS } from '../src/core/playerSkin.js'

const POSES = ['char_idle', 'char_move_left', 'char_move_right', 'char_scared', 'char_cheer']

describe('똥 피하기 캐릭터 — 프로필별로 한 벌씩', () => {
  it.each(SKINS)('%s 폴더에 다섯 자세가 다 있다', skin => {
    const missing = POSES.filter(p => !existsSync(`public/assets/characters/${skin}/${p}.png`))
    expect(missing).toEqual([])
  })
})

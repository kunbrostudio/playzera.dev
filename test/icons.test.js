// 화면에 이모지가 다시 늘지 않게 — **기계가 지킨다.**
//
// ── 왜 필요한가 ──────────────────────────────────────────────
//
// 이모지는 기기마다 다른 그림이 뜬다. 한 화면을 고칠 때는 눈에 띄지만, 새 게임을
// 만들면서 `▶ 시작`을 그냥 적는 건 너무 쉽다. 그렇게 하나씩 돌아온다.
//
// ── 무엇은 봐주나 ────────────────────────────────────────────
//
// 셋은 예외다. 각각 이유가 다르다.
//
//   ① 캔버스   `ctx.fillText('💩')`는 SVG를 못 쓴다. 그림이 오기 전의 자리표시다
//   ② 몸동작   🦘점프 🧎앉기 🙌만세는 **아이콘으로 바꾸면 더 나빠진다.**
//              Lucide에 대응이 없고, 번개 모양을 점프라고 하면 아무도 못 읽는다.
//              여기는 진짜 그림(실루엣)이 와야 할 자리다
//   ③ 데이터   배지·운동 사전·요가 자세의 이모지는 **그림이 없을 때의 폴백**이다.
//              화면 코드가 아니라 사전이고, 그림이 오면 저절로 사라진다
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import { ICON_NAMES, icon } from '../src/core/icons.js'

// 화면을 그리는 파일들. 여기에 이모지가 있으면 버튼·라벨에 섞여 나간다.
const SCREENS = [
  'src/core/readyScreen.js',
  'src/core/handControl.js',
  'src/pages/home.js',
  'src/pages/buddy.js',
  'src/pages/me.js',
  'src/pages/start.js',
  'src/games/poop-dodge/intro.js',
  'src/games/poop-dodge/tutorial.js',
  'src/games/runner/screens.js',
  'src/games/runner/legacy-shell.js',
  'src/progress/rewardView.js',
  'src/progress/buddyView.js',
]

// 그림문자 — 흑백 기호(→ ← ✓ ·)는 글자에 가까워 뺀다. 색이 있는 것만 잡는다.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u

/** 주석은 화면에 안 나온다. 판단 근거를 적을 때 이모지를 쓸 수도 있다. */
const codeLines = src => src.split('\n').filter(l => {
  const t = l.trim()
  return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
})

describe('아이콘 사전', () => {
  it('선언한 모양이 전부 그려진다', () => {
    for (const n of ICON_NAMES) expect(() => icon(n), n).not.toThrow()
  })

  it('없는 이름을 물으면 던진다 ★', () => {
    // 조용히 빈 칸을 남기면 버튼에 글자만 남아 화면에서 원인을 못 찾는다.
    expect(() => icon('없는것')).toThrow(/icons/)
  })

  it('색을 박지 않는다 — 버튼 글자색을 따라가야 한다', () => {
    for (const n of ICON_NAMES) {
      expect(icon(n), n).toContain('currentColor')
      expect(icon(n), n).not.toMatch(/#[0-9a-f]{3,6}/i)
    }
  })

  it('크기는 em이다 — 글자와 같이 커지고 작아진다', () => {
    expect(icon('play')).toContain('width="1.05em"')
  })
})

describe('화면에 이모지가 없다 ★', () => {
  it.each(SCREENS)('%s', path => {
    const found = codeLines(readFileSync(path, 'utf8'))
      .filter(l => EMOJI.test(l))
      .map(l => l.trim().slice(0, 70))
    expect(found).toEqual([])
  })
})

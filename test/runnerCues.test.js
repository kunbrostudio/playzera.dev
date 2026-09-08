import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import {
  CUE, hintFor, levelCompleteAsset, cuesMarkup, showHint, CUES_CSS, showJudge, JUDGE,
} from '../src/games/runner/ui/cues.js'
import { ACTION } from '../src/games/runner3d/judge.js'

const mountCues = () => {
  document.body.innerHTML = `<div id="root">${cuesMarkup()}</div>`
  return document.querySelector('#root')
}

describe('판정 연출 — Great! · Miss ★', () => {
  it('머리 위 자리에 뜬다 — 부르는 쪽이 좌표를 준다', () => {
    // 화면 한가운데 고정하면 **어느 칸에서 맞았는지**가 안 보인다. 세 칸을
    // 오가는 게임이라 방금 선 자리에 떠야 아이가 자기 몸과 결과를 잇는다.
    const root = mountCues()
    showJudge(root, 'great', { x: 120, y: 240 })
    const el = root.querySelector('.pz-judge-pop')
    expect(el, '아무것도 안 떴다').toBeTruthy()
    expect(el.style.left).toBe('120px')
    expect(el.style.top).toBe('240px')
    expect(el.className).toContain('great')
  })

  it('★ 실패에 **빨강을 안 쓴다**', () => {
    // 놓친 것은 실패가 아니라 다음 것이 온다는 뜻이다. 경고색은 아이를 굳게
    // 만든다 — 분홍은 눈에 띄면서 야단치지 않는다.
    expect(CUES_CSS).toMatch(/\.pz-judge-pop\.miss\s*\{[^}]*color:\s*var\(--pz-pink-miss,\s*#ff96ab\)/)
    expect(CUES_CSS).not.toMatch(/\.pz-judge-pop\.miss\s*\{[^}]*color:\s*(red|#f00|#ff0000)/i)
  })

  it('두 가지뿐이다 — 잘했다와 놓쳤다', () => {
    expect(Object.keys(JUDGE).sort()).toEqual(['great', 'miss'])
  })

  it('★ 스스로 사라진다 — 한 판에 수십 개가 쌓이면 안 된다', () => {
    const root = mountCues()
    showJudge(root, 'miss', { x: 10, y: 10 })
    const el = root.querySelector('.pz-judge-pop')
    el.dispatchEvent(new Event('animationend'))
    expect(root.querySelector('.pz-judge-pop'), '안 지워졌다').toBe(null)
  })

  it('좌표가 없어도 안 터진다', () => {
    // 캐릭터가 아직 안 만들어졌으면 `headScreen()`이 null을 준다.
    const root = mountCues()
    expect(() => showJudge(root, 'great', null)).not.toThrow()
    expect(root.querySelector('.pz-judge-pop')).toBeTruthy()
  })
})

describe('인게임 연출 — 러너가 같이 쓴다 ★', () => {
  it('선언한 그림이 **실제로 있다**', () => {
    const paths = [
      CUE.left, CUE.right, CUE.up, CUE.down, CUE.pose,
      CUE.start, CUE.missionComplete,
      ...CUE.count, ...CUE.levelComplete,
    ]
    for (const p of paths) {
      expect(fs.existsSync(`public${p}`), `${p}가 없다`).toBe(true)
    }
  })

  it('★ 판정이 시키는 모든 동작에 팻말이 있다', () => {
    // `ACTION`에 동작을 하나 늘려 놓고 팻말을 안 만들면, 아이는 무엇을 하라는
    // 안내 없이 장애물을 만난다. 판정과 힌트는 같은 곳(`judge.js`)에서 나온다.
    for (const [type, action] of Object.entries(ACTION)) {
      if (action === null) continue      // 결승 관문처럼 시키는 게 없는 것
      expect(hintFor(action), `${type}(${action})에 팻말이 없다`).toBeTruthy()
    }
  })

  it('옆으로 피하기는 방향에 따라 다른 팻말이다', () => {
    expect(hintFor('side', -1)).toBe(CUE.left)
    expect(hintFor('side', 1)).toBe(CUE.right)
    expect(hintFor('jump')).toBe(CUE.up)
    expect(hintFor('duck')).toBe(CUE.down)
    expect(hintFor('pose')).toBe(CUE.pose)
  })

  it('시키는 게 없는 이벤트는 팻말도 없다', () => {
    expect(hintFor(null)).toBe(null)
    expect(ACTION.archGate).toBe(null)
  })

  it('레벨이 그림 수보다 많아도 안 터진다', () => {
    // 코스가 늘어나면 레벨이 그림보다 많아진다. 그때 `undefined`가 `src`에
    // 들어가면 화면에 깨진 이미지가 뜬다 — 마지막 그림으로 버틴다.
    const last = CUE.levelComplete[CUE.levelComplete.length - 1]
    expect(levelCompleteAsset(1)).toBe(CUE.levelComplete[0])
    expect(levelCompleteAsset(99)).toBe(last)
    expect(levelCompleteAsset(0)).toBe(CUE.levelComplete[0])
  })

  it('★ 같은 팻말을 다시 넣지 않는다 — 깜빡임', () => {
    // 매 프레임 `src`를 다시 넣으면 애니메이션이 처음으로 돌아가 팻말이 떤다.
    document.body.innerHTML = `<div id="r">${cuesMarkup()}</div>`
    const root = document.querySelector('#r')
    const el = root.querySelector('#pz-hint')
    showHint(root, CUE.up)
    const spy = vi.spyOn(el, 'setAttribute')
    showHint(root, CUE.up)
    expect(spy).not.toHaveBeenCalled()
    showHint(root, CUE.down)
    expect(spy).toHaveBeenCalled()
  })

  it('3D 러너가 이 모듈을 쓴다', () => {
    const src = fs.readFileSync('src/games/runner3d/play3d.js', 'utf8')
    expect(src).toMatch(/from '\.\.\/runner\/ui\/cues\.js'/)
    // 힌트를 `ACTION`에서 끌어오는지 — 종류를 다시 나열하면 판정과 따로 논다
    expect(src).toContain("ACTION[e.type]")
  })

  it('마크업과 모양이 같이 온다', () => {
    for (const id of ['#pz-hint', '#pz-cue']) {
      expect(CUES_CSS, `${id} 규칙이 없다`).toContain(id)
      expect(cuesMarkup(), `${id} 요소가 없다`).toContain(id.slice(1))
    }
  })
})

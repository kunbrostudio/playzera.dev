import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// 글자 키는 **`e.code`로 읽는다.**
//
// 한글 입력기가 켜져 있으면 A·S·D를 눌러도 `e.key`가 'ㅁ'·'ㄴ'·'ㅇ'로 온다.
// 그래서 자세 장애물에서만 키가 조용히 안 먹었다 — 방향키는 IME를 안 타서
// 멀쩡하니, 화면만 보고는 "왜 저기서만 안 되지"가 된다.
//
// 2D 러너가 먼저 겪고 `e.code`로 고쳤는데(`runner/main.js`), 3D 러너를 새로
// 쓰면서 **똑같은 버그를 되풀이했다.** 두 번 겪은 것은 테스트로 못 박는다.
//
// 방향키·Escape·Enter는 IME를 안 타므로 `e.key`로 읽어도 된다.

/** `src/` 아래 모든 js를 훑는다 — 새 게임이 생겨도 자동으로 걸린다. */
function jsFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) jsFiles(p, out)
    else if (name.endsWith('.js')) out.push(p)
  }
  return out
}

describe('글자 키는 e.code로 읽는다 ★', () => {
  it('`e.key`를 글자와 견주는 곳이 없다', () => {
    // `e.key === 'a'` · `e.key.toLowerCase()` 같은 꼴을 찾는다.
    const letterCompare = /\be\.key\s*(?:===?|!==?)\s*['"][a-zA-Z]['"]/
    const lowered = /\be\.key\.toLowerCase\(\)/
    const bad = []
    for (const f of jsFiles('src')) {
      const src = fs.readFileSync(f, 'utf8')
      src.split('\n').forEach((line, i) => {
        if (letterCompare.test(line) || lowered.test(line)) {
          bad.push(`${f}:${i + 1}  ${line.trim()}`)
        }
      })
    }
    expect(bad, `한글 입력기에서 안 먹는다 — e.code를 쓸 것:\n${bad.join('\n')}`)
      .toHaveLength(0)
  })

  it('자세 키가 세 화면에서 같은 물리 키다', () => {
    // 게임마다 키가 다르면 아이가 매번 다시 배운다. 3D 플레이·랩·2D 러너가
    // 전부 A·S·D여야 한다.
    for (const f of ['src/games/runner3d/play3d.js', 'src/pages/lab3d.js']) {
      const src = fs.readFileSync(f, 'utf8')
      expect(src, `${f}에 자세 키가 없다`).toMatch(/KeyA[\s\S]{0,80}KeyS[\s\S]{0,80}KeyD/)
    }
    expect(fs.readFileSync('src/games/runner/main.js', 'utf8')).toContain('KeyA')
  })
})

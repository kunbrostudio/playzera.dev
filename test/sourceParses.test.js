// `src/`의 모든 파일이 **문법적으로 성립하는가.** ★
//
// ── 왜 이런 테스트가 필요한가 ───────────────────────────────
//
// 이 저장소는 CSS와 HTML을 템플릿 문자열(백틱) 안에 담는다 — 3D 러너는
// `style.css`를 안 불러오므로 모양이 코드와 한 몸이다.
//
// 그 안에 주석을 쓰면서 파일 이름을 `이렇게` 감싸는 습관이 있는데, 그 백틱이
// **템플릿 문자열을 거기서 끝내 버린다.** 뒤따르는 CSS가 자바스크립트로
// 읽히면서 파일이 통째로 안 열린다.
//
// 여섯 번 겪었다(8/26~28). 매번 `npm run build`나 관계없는 테스트가 엉뚱한
// 자리에서 터져서, 원인을 찾는 데 시간이 갔다. 여기서 **파일 이름을 대며**
// 잡으면 한 번에 안다.
//
// 문법만 본다 — 실행은 안 한다. import 부작용(카메라·오디오)을 일으키지
// 않으면서 "열리기는 하는가"를 묻는 가장 싼 방법이다.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseAst } from 'rollup/parseAst'

function sources(dir = 'src') {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!e.name.startsWith('_')) out.push(...sources(p)) }
    else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}

describe('소스가 열린다 ★', () => {
  const files = sources()

  it('파일이 있긴 하다', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it.each(files)('%s', file => {
    const code = fs.readFileSync(file, 'utf8')
    try {
      parseAst(code)
    } catch (e) {
      // 백틱은 이 저장소에서 가장 흔한 원인이라 먼저 의심하게 적어 준다
      throw new Error(
        `${file} 이 안 열린다: ${e.message}\n`
        + '템플릿 문자열(CSS·HTML) 안 주석에 백틱을 쓰지 않았는지 먼저 본다.',
      )
    }
  })
})

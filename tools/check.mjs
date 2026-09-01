// 확인을 **한 명령으로.** `npm run check`
//
// ── 왜 만들었나 ★ ───────────────────────────────────────────
//
// 고칠 때마다 테스트 · 빌드 · rollup 바이너리 · 에셋 용량을 따로 돌렸다.
// 네 번 돌리고 네 번 다 읽는데, 그중 쓸모 있는 건 매번 다섯 줄이었다.
// 나머지는 vite 로그와 stats 큐 경고다.
//
// 여기서 한 번에 돌리고 **결과만** 찍는다. 터지면 그때만 자세히 보여준다.
//
// ── 왜 rollup 바이너리를 보나 ────────────────────────────────
//
// `node_modules`가 맥과 리눅스 샌드박스에 같이 물려 있다. 리눅스에서 npm을
// 돌리면 npm이 플랫폼별 선택 의존성을 리눅스 것으로 바꿔 끼우고, 그러면
// **맥에서 `npm run dev`가 안 뜬다**(`@rollup/rollup-darwin-arm64` 없음).
// 실제로 재부팅 뒤에 겪었다. 조용히 사라지는 종류라 매번 확인한다.

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

// 에셋 예산 — 아이가 첫 화면에서 기다리는 시간이다.
// 3D는 GLB라 따로 센다(`docs/04` STEP 19의 근거).
const BUDGET_MB = { 'public/assets/runner3d': 7 }

let bad = 0
const line = (ok, s) => { if (!ok) bad++; console.log(`${ok ? '  ok' : 'FAIL'}  ${s}`) }

function run(cmd) {
  try {
    return { ok: true, out: execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}\n${e.stderr ?? ''}` }
  }
}

function dirSize(rel) {
  const base = join(ROOT, rel)
  if (!existsSync(base)) return 0
  let n = 0
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      // 보관본(`_unused`)은 배포에는 들어가지만 예산에는 안 센다 —
      // 지우지 않고 두는 것이 규칙이라(`CLAUDE.md`) 예산으로 압박하면 안 된다
      if (e.isDirectory()) { if (e.name !== '_unused') walk(p) } else n += statSync(p).size
    }
  }
  walk(base)
  return n / 1024 / 1024
}

console.log('')

// ── 테스트 ──
const t = run('npx vitest run')
const m = t.out.match(/Tests\s+(?:(\d+) failed \|\s*)?(\d+) passed/)
line(t.ok, m ? `테스트 ${m[2]}건 통과${m[1] ? ` · ${m[1]}건 실패` : ''}` : '테스트')
if (!t.ok) console.log(t.out.split('\n').filter(l => /FAIL|×|→ /.test(l)).slice(0, 20).join('\n'))

// ── 빌드 ──
const b = run('npx vite build')
line(b.ok, '빌드')
if (!b.ok) console.log(b.out.split('\n').slice(-25).join('\n'))

// ── 맥에서 dev가 뜨나 ──
line(existsSync(join(ROOT, 'node_modules/@rollup/rollup-darwin-arm64')),
  '맥용 rollup 바이너리 (없으면 맥에서 npm run dev가 안 뜬다)')

// ── 에셋 용량 ──
for (const [rel, cap] of Object.entries(BUDGET_MB)) {
  const mb = dirSize(rel)
  line(mb <= cap, `${rel} ${mb.toFixed(1)}MB / ${cap}MB`)
}

console.log(bad ? `\n${bad}건 확인 필요\n` : '\n다 통과\n')
process.exit(bad ? 1 : 0)

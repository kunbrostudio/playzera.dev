// 배경만 따로 렌더해서 PNG로 뽑는다 — **눈으로만 판정되는 것을 눈으로 보기 위한 도구.**
//
// ── 왜 필요한가 ──────────────────────────────────────────────
//
// 배경 렌더링(색·원근·밀도·접지감)은 테스트로 잡히지 않는다. 그렇다고 매번 게임을
// 켜서 확인하려면 카메라를 열고 레벨을 시작해야 하는데, 배경 값 하나 바꿀 때마다
// 그걸 반복할 수는 없다. 게다가 rAF는 창이 안 그려지면 돌지 않아서 자동화도 어렵다.
//
// `world.draw()`가 캔버스 2D 컨텍스트 하나만 받는 덕에 브라우저 없이 그릴 수 있다.
// 그 성질을 그대로 이용한다 — 배경이 게임 로직과 얽혀 있지 않다는 증거이기도 하다.
//
// ── 쓰는 법 ─────────────────────────────────────────────────
//
//   npm run world                                  # 우주 테마, world.png, 3초 지점
//   npm run world -- out.png 8.5                   # 8.5초 지점 (프롭이 퍼진 상태)
//   npm run world -- out.png 8.5 runner-jungle     # 정글 테마
//
// 시작 직후에는 프롭이 지평선 근처에만 있어 좌우가 비어 보인다. 몇 초 돌린 뒤의
// 프레임을 봐야 실제 플레이 중의 밀도를 판단할 수 있다. 초를 바꿔 여러 장 뽑아
// 비교하는 것을 권한다 — 한 프레임만 보고 밀도를 판단하면 반드시 틀린다.
import { readdir } from 'node:fs/promises'
import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pack = process.argv[4] ?? 'runner-space'

const theme = JSON.parse(readFileSync(`${ROOT}/src/games/${pack}/theme.json`, 'utf8'))
const IMG_DIR = `${ROOT}/public${theme.assetBase}/image`

const { setTheme } = await import(`${ROOT}/src/games/runner/theme.js`)
setTheme(theme)

const { IMG } = await import(`${ROOT}/src/games/runner/assets.js`)
const { CONFIG } = await import(`${ROOT}/src/games/runner/config.js`)
const { World } = await import(`${ROOT}/src/games/runner/game/world.js`)

// assets.js의 loadAssets는 브라우저 Image를 쓴다. IMG는 가변 객체라 여기서 직접 채운다.
for (const f of await readdir(IMG_DIR)) {
  if (f.endsWith('.png')) IMG[f.slice(0, -4)] = await loadImage(`${IMG_DIR}/${f}`)
}

const { w, h } = CONFIG.canvas
const canvas = createCanvas(w, h)

const world = new World()
const warmSec = Number(process.argv[3] ?? 3.0)
for (let t = 0; t < warmSec; t += 1 / 60) world.update(1 / 60, 1.0)
world.draw(canvas.getContext('2d'))

const out = process.argv[2] ?? 'world.png'
writeFileSync(out, canvas.toBuffer('image/png'))
console.log(`-> ${out}  (${pack}, ${warmSec}초 지점)`)

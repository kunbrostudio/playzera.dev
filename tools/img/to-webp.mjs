// 스토리 배경 이미지 런타임 변환 — PNG → WebP. 러너3D 스토리 화면 공용.
//
// ── 왜 있나 ──────────────────────────────────────────────────
//
// ken이 올리는 스토리 합성컷은 1600~1700px PNG로 장당 3MB다. `storyDialogue.js`가
// CSS `background-image`로 거는데, three 텍스처와 달리 CSS 그림은 **받은 만큼
// 그 자리에서 바로 그린다**(`CLAUDE.md` STEP 73 — "90년대 로딩"). 사진풍 렌더를
// 무손실 PNG로 두는 것도 낭비다. WebP q80이면 화질 차이 없이 1/13이다.
//
//   node tools/img/to-webp.mjs --manifest tools/img/odyssey-p0.story.json
//   node tools/img/to-webp.mjs <입력.png> <출력.webp> [--width 1600] [--quality 80]

import sharp from 'sharp'
import { statSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, basename } from 'node:path'

const KB = n => (n / 1024).toFixed(0) + 'KB'
const MB = n => (n / 1048576).toFixed(2) + 'MB'

async function one(inPath, outPath, { width = 1600, quality = 80 } = {}) {
  mkdirSync(dirname(outPath), { recursive: true })
  const inB = statSync(inPath).size
  await sharp(inPath).resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(outPath)
  const outB = statSync(outPath).size
  const meta = await sharp(outPath).metadata()
  return { source: basename(inPath), out: outPath, inB, outB, w: meta.width, h: meta.height }
}

const args = process.argv.slice(2)
const jobs = []
if (args[0] === '--manifest') {
  const man = JSON.parse(readFileSync(args[1], 'utf8'))
  const dir = man.sourceDir.replace('~', process.env.HOME)
  for (const j of man.jobs) jobs.push([`${dir}/${j.source}`, j.out, { width: j.width, quality: j.quality }])
} else {
  const w = args.indexOf('--width'), q = args.indexOf('--quality')
  jobs.push([args[0], args[1], {
    width: w > 0 ? Number(args[w + 1]) : 1600,
    quality: q > 0 ? Number(args[q + 1]) : 80,
  }])
}

let tin = 0, tout = 0
for (const [i, o, opt] of jobs) {
  const r = await one(i, o, opt)
  tin += r.inB; tout += r.outB
  console.log(`${r.source.padEnd(20)} -> ${basename(r.out).padEnd(28)} ${r.w}x${r.h}  ${MB(r.inB)} -> ${KB(r.outB)}  (-${(100 - r.outB / r.inB * 100).toFixed(1)}%)`)
}
console.log(`\nTOTAL  ${MB(tin)} -> ${MB(tout)}`)

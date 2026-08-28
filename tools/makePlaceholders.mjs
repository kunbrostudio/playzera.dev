// 테마가 선언한 이미지를 **도형으로** 만들어 놓는다.
//
// ── 왜 ───────────────────────────────────────────────────────
//
// 그림이 나오기 전에도 게임이 돌아야 구조가 맞는지 알 수 있다. 불 끄기 때도 도형으로
// 먼저 만들었다. 더 중요한 이유가 하나 더 있다 — 이 스크립트는 `theme.json`의 목록을
// 읽어 만들기 때문에 **목록에서 빠진 그림이 그 자리에서 드러난다.** 나중에 진짜 그림을
// 넣을 때 "이 파일은 어디에 쓰이지?" 하고 헤맬 일이 없다.
//
// ── 진짜 그림은 절대 건드리지 않는다 ────────────────────────
//
// 만든 파일 이름을 폴더의 `.placeholders`에 적어둔다. `--force`는 **그 목록에 있는
// 것만** 다시 만든다. 목록에 없는 파일 = 사람이 넣은 진짜 그림이므로 손대지 않는다.
//
// 이 장치가 없을 때 `--force`를 우주 테마에 돌려 **완성된 에셋 74장을 도형으로
// 덮었다.** git에 있어서 되살렸지만, 커밋 전이었으면 그대로 날아갔다.
//
//   node tools/makePlaceholders.mjs src/games/runner-jungle/theme.json
//   node tools/makePlaceholders.mjs src/games/runner-jungle/theme.json --force
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const themePath = process.argv[2]
const force = process.argv.includes('--force')
if (!themePath) { console.error('테마 JSON 경로를 주세요.'); process.exit(1) }

const theme = JSON.parse(readFileSync(resolve(ROOT, themePath), 'utf8'))
const outDir = resolve(ROOT, 'public' + theme.assetBase + '/image')
mkdirSync(outDir, { recursive: true })

// 테마 팔레트에서 색을 빌려온다. 도형이라도 테마마다 색이 달라야 **어느 테마를 보고
// 있는지** 한눈에 안다. 세 테마가 다 같은 파란 하늘이면 그림 없이는 구분이 안 된다.
const PAL = theme.world.palette
const rgb = c => Array.isArray(c) ? `rgb(${c.join(',')})` : c

// 이름에서 역할을 읽어 대충 어울리는 도형을 고른다. 정확할 필요는 없다 —
// **자리와 크기가 맞는지** 보는 것이 목적이다.
//
// ⚠️ **순서가 중요하다.** 위에서부터 먼저 맞는 것을 쓴다. UI·출발선을 앞에 두는 이유는
// `fx_start_button`의 "**star**t"가 별(`star`) 규칙에 걸려 시작 버튼이 별이 됐기 때문이다.
const KIND = [
  [/^fx_|^ico_|^btn_/,     { w: 900, h: 500,  shape: 'label',  c: '#ffd23e' }],
  [/start_line/,           { w: 1600, h: 240, shape: 'ridge',  c: '#ffffff' }],
  [/^obs_sign|^signs_/,    { w: 800, h: 900,  shape: 'sign',   c: '#ffd23e' }],
  [/palm|tree|fern|cycad/, { w: 620, h: 1000, shape: 'tree',   c: '#3f9b2f' }],
  [/waterfall_cliff|fossil|hut|watchtower|rope_bridge/, { w: 900, h: 1000, shape: 'tower', c: '#8a7358' }],
  [/trex|tri_baby|brachio|dino/, { w: 900, h: 900, shape: 'blob', c: '#e07a3c' }],
  [/egg|log_pile/,         { w: 1000, h: 780, shape: 'disc',   c: '#c9b487' }],
  [/torch|pillar|sign_dino/, { w: 700, h: 1000, shape: 'tower', c: '#a8763a' }],
  [/temple|ruin|tower|totem|drum|bones|geyser/, { w: 780, h: 1000, shape: 'tower', c: '#a8763a' }],
  [/waterfall|rock|boulder/, { w: 900, h: 1000, shape: 'tower', c: '#7d8fa0' }],
  [/slide|bridge|post/,    { w: 820, h: 1000, shape: 'tower',  c: '#c08a3e' }],
  [/monkey|tiger|mascot|dino_baby/, { w: 800, h: 1000, shape: 'blob', c: '#c98a4b' }],
  [/pond|bush|flower|nest|lava|mushroom/, { w: 1000, h: 620, shape: 'disc', c: '#4fae35' }],
  [/torch|banana|leaf|star|amber/, { w: 1000, h: 1000, shape: 'star', c: '#f2c94c' }],
  [/^bg_sky$/,             { w: 1600, h: 900, shape: 'sky',    c: PAL.skyFallback }],
  [/ridge|skyline|volcano/, { w: 1600, h: 300, shape: 'ridge', c: PAL.floorNear }],
  [/cloud/,                { w: 1000, h: 560, shape: 'cloud',  c: '#ffffff' }],
  [/bird|sunbeam|ptero/,   { w: 1000, h: 500, shape: 'star',   c: '#ffe9a8' }],
  [/^char_/,               { w: 700, h: 1000, shape: 'kid',    c: '#f5c542' }],
  [/crate|log|vine|gate|branch|bone/, { w: 900, h: 700, shape: 'box', c: '#b5752e' }],
  [/^pose0/,               { w: 700, h: 1000, shape: 'kid',    c: '#ffffff' }],
]
const kindOf = n => (KIND.find(([re]) => re.test(n)) ?? [null, { w: 800, h: 800, shape: 'box', c: '#999999' }])[1]

function draw(name, k) {
  const cv = createCanvas(k.w, k.h)
  const x = cv.getContext('2d')
  const cx = k.w / 2, W = k.w, H = k.h
  x.fillStyle = k.c
  x.strokeStyle = 'rgba(0,0,0,0.35)'
  x.lineWidth = Math.max(4, W * 0.012)

  const box = (l, t, w, h, r = 20) => { x.beginPath(); x.roundRect(l, t, w, h, r); x.fill(); x.stroke() }

  switch (k.shape) {
    case 'sky': { // 위→아래 그라데이션. 도형이 아니라 배경이다.
      // 위는 테마의 하늘색, 아래는 안개색 — 지평선에서 바닥과 이어지게.
      const g = x.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, k.c); g.addColorStop(1, rgb(PAL.fog))
      x.fillStyle = g; x.fillRect(0, 0, W, H); return cv
    }
    case 'ridge': { // 지평선 능선 — 아래가 꽉 차야 타일링했을 때 틈이 없다
      x.beginPath(); x.moveTo(0, H)
      for (let i = 0; i <= 12; i++) x.lineTo((i / 12) * W, H - H * (0.35 + 0.4 * Math.abs(Math.sin(i * 1.7))))
      x.lineTo(W, H); x.closePath(); x.fill(); return cv
    }
    case 'tree': // 기둥 + 잎 뭉치. 바닥에 닿게 그린다.
      x.fillStyle = '#8a5a2b'; box(cx - W * 0.09, H * 0.35, W * 0.18, H * 0.65, 8)
      x.fillStyle = k.c
      for (const [dx, dy, r] of [[-0.28, 0.30, 0.22], [0.28, 0.30, 0.22], [0, 0.16, 0.26]]) {
        x.beginPath(); x.ellipse(cx + W * dx, H * dy, W * r, H * r * 0.6, 0, 0, Math.PI * 2); x.fill(); x.stroke()
      }
      return cv
    case 'tower':
      box(W * 0.16, H * 0.14, W * 0.68, H * 0.86, 18)
      x.fillStyle = 'rgba(255,255,255,0.35)'; box(W * 0.3, H * 0.3, W * 0.4, H * 0.2, 12)
      return cv
    case 'blob':
      x.beginPath(); x.ellipse(cx, H * 0.62, W * 0.32, H * 0.36, 0, 0, Math.PI * 2); x.fill(); x.stroke()
      x.beginPath(); x.arc(cx, H * 0.26, W * 0.24, 0, Math.PI * 2); x.fill(); x.stroke()
      return cv
    case 'disc':
      x.beginPath(); x.ellipse(cx, H * 0.7, W * 0.45, H * 0.28, 0, 0, Math.PI * 2); x.fill(); x.stroke()
      return cv
    case 'star': {
      x.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2, r = i % 2 ? W * 0.16 : W * 0.36
        i ? x.lineTo(cx + Math.cos(a) * r, H * 0.5 + Math.sin(a) * r)
          : x.moveTo(cx + Math.cos(a) * r, H * 0.5 + Math.sin(a) * r)
      }
      x.closePath(); x.fill(); x.stroke(); return cv
    }
    case 'cloud':
      for (const [dx, r] of [[-0.22, 0.2], [0.22, 0.2], [0, 0.27]]) {
        x.beginPath(); x.arc(cx + W * dx, H * 0.55, W * r, 0, Math.PI * 2); x.fill()
      }
      return cv
    case 'kid': // 발이 바닥에 닿아야 접지 확인이 된다
      x.beginPath(); x.arc(cx, H * 0.2, W * 0.2, 0, Math.PI * 2); x.fill(); x.stroke()
      box(cx - W * 0.18, H * 0.36, W * 0.36, H * 0.4, 24)
      box(cx - W * 0.16, H * 0.74, W * 0.12, H * 0.26, 8)
      box(cx + W * 0.04, H * 0.74, W * 0.12, H * 0.26, 8)
      return cv
    case 'box':
      box(W * 0.08, H * 0.2, W * 0.84, H * 0.8, 16); return cv
    case 'sign':
      x.fillStyle = '#7a4a1c'; box(cx - W * 0.05, H * 0.5, W * 0.1, H * 0.5, 6)
      x.fillStyle = k.c; box(W * 0.1, H * 0.06, W * 0.8, H * 0.5, 24)
      return cv
    default: // label — 글자 자리만 잡는 판
      box(W * 0.06, H * 0.2, W * 0.88, H * 0.6, 28); return cv
  }
}

// 이 폴더에서 **내가 만든** 파일 목록. 없으면 빈 목록(= 전부 사람 것으로 본다).
const markerPath = `${outDir}/.placeholders`
const mine = new Set(
  existsSync(markerPath) ? readFileSync(markerPath, 'utf8').split('\n').filter(Boolean) : []
)

let made = 0, kept = 0, real = 0
const names = new Set()
const walk = v => {
  if (typeof v === 'string') names.add(v)
  else if (Array.isArray(v)) v.forEach(walk)
  else if (v && typeof v === 'object') Object.values(v).forEach(walk)
}
walk(theme.sprites); walk(theme.ui)
for (const p of [...theme.world.props.left, ...theme.world.props.right,
                 ...theme.world.horizonFillers, ...theme.world.skyDeco]) names.add(p.name)
names.add(theme.world.sky); names.add(theme.world.skyline); names.add(theme.world.curbStar)
for (const n of theme.images ?? []) names.add(n)

// `_shared/...`는 테마 폴더 밖의 공용 그림이다. 여기서 만들지 않는다.
const wanted = [...names].filter(n => n && !n.includes('/')).sort()
const written = []
for (const name of wanted) {
  const file = `${outDir}/${name}.png`
  const exists = existsSync(file)
  if (exists && !mine.has(name)) { real++; continue }        // 사람이 넣은 진짜 그림
  if (exists && !force) { kept++; written.push(name); continue }
  writeFileSync(file, draw(name, kindOf(name)).toBuffer('image/png'))
  written.push(name)
  made++
}
writeFileSync(markerPath, written.join('\n') + '\n')

console.log(`${theme.id}: 도형 ${made}장 생성 · ${kept}장 유지 · 진짜 그림 ${real}장 보존`)
if (real) console.log(`  (진짜 그림은 --force로도 덮지 않는다. 다시 만들려면 그 파일을 지우고 돌려라)`)
console.log(`  → ${outDir}`)

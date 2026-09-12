// runner3d GLB 런타임 최적화 도구 — Jurassic·Odyssey 이후 모든 3D 러너 테마 공용.
//
// ── 왜 있나 ──────────────────────────────────────────────────
//
// ken이 올리는 원본은 Tripo AI export라 27~60MB·삼각형 100만~200만이다.
// 이 저장소는 실시간 조명이 0개이고(`CLAUDE.md`) 배경 프롭을 InstancedMesh로
// 여러 개 그린다 — 원본을 그대로 쓰면 폰에서 첫 화면이 수십 초 걸린다.
//
// `runner3d/glbProp.js`·`models.js`가 이미 정한 런타임 계약을 그대로 따른다:
//   · 지오메트리 + baseColor 텍스처만 남긴다 (metalRough·normal은 조명이
//     없어 아무 효과가 없다)
//   · 메시는 하나로 합친다 (안 합치면 인스턴싱해도 부품 수만큼 draw call)
//   · 삼각형을 줄여 크기를 낮추는 것이 1차 (원본의 ~95%가 지오메트리)
//   · 그래도 안 깎이는 AI 키트배시(비매니폴드 조각 다수 — 오디세이 자세
//     팻말이 83,490 삼각형에서 더 안 내려간다)는 `--draco`로 압축한다.
//     `glbProp.js`/`models.js`가 이제 Draco 디코더가 붙은 공용 로더를
//     쓴다(`getLoader`) — 비-Draco GLB도 그대로 열리므로 켜도 안전하다.
//     Draco는 정점을 Float32로 디코드하므로 quantize와 달리 로드 후
//     `applyMatrix4`가 안전하다(quantize는 Int16이라 잘렸다, 아래 7번 주석).
//
// ── 쓰는 법 ─────────────────────────────────────────────────
//
//   node tools/glb/optimize.mjs <입력.glb> <출력.glb> [옵션]
//   node tools/glb/optimize.mjs --manifest tools/glb/odyssey-p0.sources.json
//
// 옵션:
//   --ratio <0..1>   목표 삼각형 비율 (기본 0.03). 배경 프롭은 0.02~0.04,
//                    가까이 크게 보이는 랜드마크는 0.05~0.08
//   --error <n>      simplify 허용 오차 (기본 0.02). 크게 줄수록 더 깎지만
//                    실루엣이 뭉개진다
//   --tex <px>       baseColor 텍스처 최대 변 (기본 1024)
//   --tex-quality    JPEG 품질 (기본 82)
//   --keep-normal    normal 맵 유지 (기본: 버림)
//   --keep-mr        metalRough 맵 유지 (기본: 버림)
//   --no-join        메시 합치기 건너뛰기 (재질이 여럿이라 합치면 안 되는 경우)
//   --lock-border    경계 정점 고정 (구멍 뚫린 모델에서 테두리 유지)
//   --draco          Draco 압축 (simplify로 안 깎이는 AI 키트배시용).
//                    런타임 로더는 이미 디코더가 붙어 있다(`models.js`)

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions'
import {
  dedup, weld, simplify, prune, flatten, join, textureCompress,
} from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import draco3d from 'draco3dgltf'
import sharp from 'sharp'
import { readFileSync, statSync, mkdirSync } from 'node:fs'
import { dirname, basename } from 'node:path'

// Draco 인코더/디코더 — `--draco`일 때만 IO에 붙인다(무거워서 지연 로드).
let dracoDeps = null
async function getDracoDeps() {
  if (!dracoDeps) {
    dracoDeps = {
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'draco3d.decoder': await draco3d.createDecoderModule(),
    }
  }
  return dracoDeps
}

const MB = n => (n / 1048576).toFixed(2) + 'MB'

// ── GLB 하나를 파싱해 삼각형·정점·메시·텍스처를 센다 (검증·리포트용) ──
function inspect(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('GLB 매직이 아니다')
  let off = 12, json = null, bin = null
  while (off < buf.length) {
    const clen = dv.getUint32(off, true), ctype = dv.getUint32(off + 4, true)
    const cdata = buf.subarray(off + 8, off + 8 + clen)
    if (ctype === 0x4e4f534a) json = JSON.parse(Buffer.from(cdata).toString('utf8'))
    else if (ctype === 0x004e4942) bin = cdata
    off += 8 + clen
  }
  const accs = json.accessors || []
  let tris = 0, verts = 0
  for (const m of json.meshes || []) for (const p of m.primitives || []) {
    const vc = accs[p.attributes.POSITION]?.count || 0
    verts += vc
    tris += p.indices != null ? Math.floor(accs[p.indices].count / 3) : Math.floor(vc / 3)
  }
  const imgs = (json.images || []).map(im => {
    let w = '?', h = '?', bytes = 0
    if (im.bufferView != null && bin) {
      const bv = json.bufferViews[im.bufferView]
      const b = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)
      bytes = b.length
      if (b[0] === 0x89) { w = b.readUInt32BE(16); h = b.readUInt32BE(20) }        // PNG
      else if (b[0] === 0xff) {                                                    // JPEG
        let o = 2
        while (o < b.length) {
          if (b[o] !== 0xff) { o++; continue }
          const mk = b[o + 1]
          if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) {
            h = b.readUInt16BE(o + 5); w = b.readUInt16BE(o + 7); break
          }
          o += 2 + b.readUInt16BE(o + 2)
        }
      }
    }
    return { mime: im.mimeType || '?', w, h, bytes }
  })
  return {
    tris, verts,
    meshes: (json.meshes || []).length,
    prims: (json.meshes || []).reduce((a, m) => a + (m.primitives || []).length, 0),
    materials: (json.materials || []).length,
    images: imgs,
  }
}

async function optimizeOne(inPath, outPath, opt) {
  const {
    ratio = 0.03, error = 0.02, tex = 1024, texQuality = 82,
    keepNormal = false, keepMr = false, join: doJoin = true, lockBorder = false,
    weldTolerance = 0.0003, draco = false, mergeMaterial = null, fitHeight = null,
  } = opt

  const srcBytes = statSync(inPath).size
  const before = inspect(readFileSync(inPath))

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  if (draco) io.registerDependencies(await getDracoDeps())
  const doc = await io.read(inPath)
  await MeshoptSimplifier.ready

  // 0) 재질 병합 — **AI 키트배시 관문 전용.** ★
  //    `finish_gate.glb`는 부품 20개가 각자 재질·텍스처를 들고 온다(1.88M
  //    삼각형). `join()`은 재질이 다르면 못 합치고, `glbProp.js`/`models.js`는
  //    **첫 메시만** 써서 관문의 1/20만 보인다. 결승 포털은 셰이더 문이
  //    "여기가 끝"을 말하는 물건이라 부품 텍스처가 필요 없다 — 텍스처를 다
  //    버리고 한 재질(단색 baseColorFactor)로 통일하면 `join()`이 1메시로
  //    합친다(`portal.js`가 `MeshBasicMaterial` 단색으로 다시 칠한다).
  //    `mergeMaterial`은 [r,g,b] (0..1).
  if (mergeMaterial) {
    const mats = doc.getRoot().listMaterials()
    const keep = mats[0]
    keep.setBaseColorTexture(null).setMetallicRoughnessTexture(null)
      .setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null)
    keep.setBaseColorFactor([...mergeMaterial, 1]).setMetallicFactor(0).setRoughnessFactor(1)
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) prim.setMaterial(keep)
    }
    for (let i = 1; i < mats.length; i++) mats[i].dispose()
  }

  // 1) 중복 정리 — 같은 accessor·mesh·texture를 하나로
  await doc.transform(dedup())

  // 2) 노드 변환을 지오메트리에 굽는다(flatten) — 늘 한다. `fitHeight`가
  //    정점 좌표를 직접 재므로 노드 변환이 남아 있으면 어긋난다.
  await doc.transform(flatten())

  // 2b) 재질이 같은 메시를 하나로(join). `glbProp.js`/`models.loadGeometry`는
  //     **첫 번째 메시만** 쓰므로 기본은 합친다. `join: false`는 재질이
  //     여럿이라 합칠 수 없고 로더가 멀티메시를 받는 경우(결승 관문 —
  //     `models.loadMeshGroup`).
  if (doJoin) await doc.transform(join())

  // 3) 정점 병합 — AI 메시는 삼각형이 정점을 공유하지 않은 채로 온다
  //    (`CLAUDE.md`: remove_doubles). simplify 전에 반드시 필요하다.
  await doc.transform(weld({ tolerance: weldTolerance }))

  // 4) 삼각형 줄이기 — 여기서 용량의 대부분이 빠진다
  await doc.transform(simplify({
    simplifier: MeshoptSimplifier,
    ratio, error, lockBorder,
  }))

  // 4b) 게임 유닛으로 스케일 — `fitHeight` 유닛 높이, 발밑 y=0, x·z 중심.
  //     `glbProp.loadNormalizedGlb`가 로드 때 하던 정규화를 **빌드 때** 굽는다.
  //     `portal.js`처럼 정규화 안 하는 로더(`models.loadGeometries`)로 관문을
  //     쓸 수 있게 한다(원본 GLB는 0.85유닛짜리라 그냥 쓰면 안 보인다).
  //
  //     ★★★ 관문 mesh 깨짐의 진짜 원인(STEP 88, ken 실플레이 스크린샷) ★★★
  //     `flatten()`은 노드 **계층**만 얕게 만들 뿐, 각 노드의 이동/회전/
  //     스케일을 정점 데이터에 굽지 않는다 — AI 키트배시 부품(`tripo_part_N`)은
  //     각자 로컬 원점 근처의 지오메트리 + **부품마다 다른 노드 translation**
  //     (예: [-0.03, 0.78, 0.03])으로 조립돼 있다. 아래 bbox 계산이 이 노드
  //     translation을 무시하고 **정점 좌표 그 자체**만으로 전체 bbox를 재고
  //     그 결과(cx·cz·lo[1]·s)를 51개 부품 전부에 똑같이 적용했다 — 로컬
  //     원점 부근에 몰려 있던 부품들이 서로 다른 실제 자리(노드 translation)를
  //     무시당한 채 뭉개져, 렌더 시 (여전히 살아 있는) 노드 translation과
  //     (이미 재배치된) 정점 데이터가 겹쳐 눈알·바위·문짝이 서로 침범하는
  //     "깨진" 모양이 됐다. `lockBorder`·Draco는 무관했다(직접 A/B 렌더로
  //     확인 — 지오메트리 단계까지는 항상 멀쩡했고 fitHeight 이후에만 깨졌다).
  //
  //     고친 방법: bbox를 재기 **전에** 노드 transform을 정점에 구워 넣고
  //     (`glbProp.js`/`models.js`가 로드 시점에 하는 것과 같은 일을 빌드
  //     시점에 미리 한다) 노드는 identity로 되돌린다 — 그러면 51개 부품이
  //     **하나의 공통 좌표계**에 정확히 조립된 상태에서 bbox를 재고 균일
  //     스케일+중심 이동을 적용하게 된다.
  if (fitHeight) {
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh()
      if (!mesh) continue
      const m = node.getWorldMatrix()
      const isIdentity = Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[5] - 1) < 1e-9 && Math.abs(m[10] - 1) < 1e-9
        && [1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14].every(i => Math.abs(m[i]) < 1e-9)
      if (isIdentity) continue
      const v = [0, 0, 0]
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION')
        if (pos) {
          for (let i = 0; i < pos.getCount(); i++) {
            pos.getElement(i, v)
            pos.setElement(i, [
              m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
              m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
              m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
            ])
          }
        }
        const nrm = prim.getAttribute('NORMAL')
        if (nrm) {
          // 이동은 법선에 안 먹인다. 이 파이프라인의 부품은 회전 없음+균일
          // 스케일 1이라 역전치 없이 3x3 선형부만 곱해도 정확하다(비균일
          // 스케일 부품은 대상 밖 — 지금 관문 셋 다 여기 해당 없음, 위
          // isIdentity 체크로 이 블록 자체가 회전·비균일 스케일이 있을 때만 돈다).
          for (let i = 0; i < nrm.getCount(); i++) {
            nrm.getElement(i, v)
            const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2]
            const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2]
            const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2]
            const len = Math.hypot(x, y, z) || 1
            nrm.setElement(i, [x / len, y / len, z / len])
          }
        }
      }
      // 노드는 이제 identity — 정점에 이미 구웠으니 런타임(glbProp.js/
      // models.js)이 또 한 번 곱하면(node.matrixWorld) 그대로 통과한다.
      node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1])
    }

    const accessors = new Set(
      doc.getRoot().listMeshes()
        .flatMap(m => m.listPrimitives())
        .map(p => p.getAttribute('POSITION')),
    )
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    const el = [0, 0, 0]
    for (const pos of accessors) {
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, el)
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], el[k]); hi[k] = Math.max(hi[k], el[k]) }
      }
    }
    const s = fitHeight / Math.max(hi[1] - lo[1], 1e-6)
    const cx = (lo[0] + hi[0]) / 2
    const cz = (lo[2] + hi[2]) / 2
    for (const pos of accessors) {
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, el)
        el[0] = (el[0] - cx) * s
        el[1] = (el[1] - lo[1]) * s
        el[2] = (el[2] - cz) * s
        pos.setElement(i, el)
      }
    }
  }

  // 4c) 재질 병합본은 텍스처가 없어 조명 0인 이 엔진에서 **평평한 실루엣**이
  //     된다. `scene.js`의 `bakeShade`와 같은 방식으로 법선 기준 명암을
  //     정점 색(COLOR_0)에 굽는다 — `portal.js`가 `vertexColors`로 읽어
  //     입체가 보인다(윗면 밝게, 옆면 어둡게).
  if (mergeMaterial) {
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const nrm = prim.getAttribute('NORMAL')
        const posA = prim.getAttribute('POSITION')
        if (!posA) continue
        const n = posA.getCount()
        const colors = new Float32Array(n * 3)
        const v = [0, 0, 0]
        for (let i = 0; i < n; i++) {
          let k = 1.0
          if (nrm) {
            nrm.getElement(i, v)
            k = v[1] > 0.5 ? 1.15 : Math.abs(v[0]) > 0.5 ? 0.72 : 0.9
          }
          colors[i * 3] = Math.min(1, mergeMaterial[0] * k)
          colors[i * 3 + 1] = Math.min(1, mergeMaterial[1] * k)
          colors[i * 3 + 2] = Math.min(1, mergeMaterial[2] * k)
        }
        const acc = doc.createAccessor()
          .setType('VEC3')
          .setArray(colors)
          .setBuffer(doc.getRoot().listBuffers()[0])
        prim.setAttribute('COLOR_0', acc)
      }
    }
  }

  // 5) 조명이 없어 효과가 0인 채널을 버린다 → 재질을 baseColor만 남긴다
  for (const mat of doc.getRoot().listMaterials()) {
    if (!keepMr) {
      mat.setMetallicRoughnessTexture(null)
      mat.setMetallicFactor(0).setRoughnessFactor(1)
    }
    if (!keepNormal) mat.setNormalTexture(null)
    mat.setOcclusionTexture(null)
    mat.setEmissiveTexture(null)
  }

  // 6) 남은 텍스처(baseColor) 리사이즈 + 재압축
  await doc.transform(textureCompress({
    encoder: sharp,
    targetFormat: 'jpeg',
    quality: texQuality,
    resize: [tex, tex],
  }))

  // 7) 재질 확장을 통째로 버린다 — `glbProp.js`는 지오메트리 + baseColor
  //    맵만 읽고 `MeshBasicMaterial`을 새로 만든다. KHR_materials_volume 같은
  //    PBR 확장이 남아 있어도 무해하지만(three가 무시), 파일에서 뺀다.
  //
  //    ※ `quantize()`(KHR_mesh_quantization)는 **안 쓴다** — 파일은 25%
  //    작아지지만, `glbProp.js`가 로드 후 `geo.applyMatrix4(node.matrixWorld)`로
  //    노드 변환(quantize가 남기는 dequant 행렬)을 굽는데, 정점 배열이
  //    Int16이라 그 자리에서 잘려 지오메트리가 무너진다. glbProp를 안 고치는
  //    한 quantize는 못 쓴다(shared code, 최소 수정 원칙).
  for (const ext of doc.getRoot().listExtensionsUsed()) ext.dispose()

  // 8) 참조 안 되는 것 제거 + 마지막 중복 정리
  await doc.transform(prune(), dedup())

  // 9) Draco 압축 — simplify로 안 깎이는 비매니폴드 키트배시용. 정점을
  //    Float32로 디코드하므로 `glbProp.js`의 `applyMatrix4`가 안전하다
  //    (quantize는 Int16이라 못 썼다 — 위 7번 주석). 확장을 다 버린(7번)
  //    다음에 새로 하나만 붙인다.
  if (draco) {
    doc.createExtension(KHRDracoMeshCompression)
      .setRequired(true)
      .setEncoderOptions({
        method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
        quantizationVolume: 'mesh',
      })
    await doc.transform(prune(), dedup())
  }

  mkdirSync(dirname(outPath), { recursive: true })
  await io.write(outPath, doc)

  // 9) 출력 검증 — 다시 파싱해서 열리는지·비어 있지 않은지 확인
  const outBytes = statSync(outPath).size
  const after = inspect(readFileSync(outPath))
  const problems = []
  if (after.tris === 0) problems.push('삼각형 0 — 지오메트리가 사라졌다')
  if (after.meshes === 0) problems.push('메시 0')
  if (doJoin && after.meshes > 1) problems.push(`메시가 ${after.meshes}개 — glbProp.js는 첫 번째만 쓴다`)
  if (after.images.some(i => i.mime !== 'image/jpeg')) problems.push('JPEG가 아닌 텍스처가 남았다')

  return {
    source: basename(inPath), out: outPath,
    srcBytes, outBytes, reduction: 1 - outBytes / srcBytes,
    before, after, problems,
  }
}

function report(r) {
  const t = (b) => b.images.map(i => `${i.w}x${i.h}`).join(',') || '없음'
  console.log(`\n━━ ${r.source}  →  ${r.out}`)
  console.log(`   용량   ${MB(r.srcBytes)}  →  ${MB(r.outBytes)}   (−${(r.reduction * 100).toFixed(1)}%)`)
  console.log(`   삼각형 ${r.before.tris.toLocaleString()}  →  ${r.after.tris.toLocaleString()}   (${(r.after.tris / r.before.tris * 100).toFixed(1)}%)`)
  console.log(`   메시   ${r.before.meshes}m/${r.before.prims}p  →  ${r.after.meshes}m/${r.after.prims}p`)
  console.log(`   텍스처 ${r.before.images.length}장 [${t(r.before)}]  →  ${r.after.images.length}장 [${t(r.after)}]`)
  console.log(`   텍스처 용량 ${MB(r.before.images.reduce((a, i) => a + i.bytes, 0))}  →  ${MB(r.after.images.reduce((a, i) => a + i.bytes, 0))}`)
  if (r.problems.length) console.log(`   ⚠️  ${r.problems.join(' / ')}`)
  else console.log(`   ✅ 검증 통과`)
}

// ── CLI ──
const args = process.argv.slice(2)
function flag(name, def) {
  const i = args.indexOf(name)
  if (i < 0) return def
  const v = args[i + 1]
  return (v == null || v.startsWith('--')) ? true : v
}

const results = []
if (args[0] === '--manifest') {
  const man = JSON.parse(readFileSync(args[1], 'utf8'))
  for (const job of man.jobs) {
    results.push(await optimizeOne(
      man.sourceDir.replace('~', process.env.HOME) + '/' + job.source,
      job.out,
      { ratio: job.ratio, error: job.error, tex: job.tex, texQuality: job.texQuality,
        keepNormal: job.keepNormal, keepMr: job.keepMr, join: job.join !== false,
        lockBorder: job.lockBorder, weldTolerance: job.weldTolerance,
        draco: job.draco ?? man.draco ?? false,
        mergeMaterial: job.mergeMaterial ?? null, fitHeight: job.fitHeight ?? null },
    ))
  }
} else {
  const [inPath, outPath] = args
  if (!inPath || !outPath || inPath.startsWith('--')) {
    console.error('사용법: node tools/glb/optimize.mjs <입력.glb> <출력.glb> [옵션]')
    console.error('       node tools/glb/optimize.mjs --manifest <manifest.json>')
    process.exit(1)
  }
  results.push(await optimizeOne(inPath, outPath, {
    ratio: Number(flag('--ratio', 0.03)),
    error: Number(flag('--error', 0.02)),
    tex: Number(flag('--tex', 1024)),
    texQuality: Number(flag('--tex-quality', 82)),
    keepNormal: flag('--keep-normal', false) === true,
    keepMr: flag('--keep-mr', false) === true,
    join: flag('--no-join', false) !== true,
    lockBorder: flag('--lock-border', false) === true,
    weldTolerance: Number(flag('--weld', 0.0003)),
    draco: flag('--draco', false) === true,
  }))
}

for (const r of results) report(r)

const totalOut = results.reduce((a, r) => a + r.outBytes, 0)
const totalSrc = results.reduce((a, r) => a + r.srcBytes, 0)
console.log(`\n━━ 합계  ${MB(totalSrc)}  →  ${MB(totalOut)}   (−${((1 - totalOut / totalSrc) * 100).toFixed(1)}%)`)
if (results.some(r => r.problems.length)) { console.log('\n⚠️  문제가 있는 출력이 있다 — 위 로그 확인'); process.exit(2) }

// GLB 불러오기 — 지오메트리와, **있으면 텍스처까지.**
//
// ── 곡률은 반드시 우리가 씌운다 ★ ──────────────────────────
//
// 휨은 `applyCurve`가 셰이더에 심는 것이라, 우리 손을 거치지 않은 재질은
// **혼자 평평한 세계에 산다** — 야자수만 안 휜다. 그래서 GLB가 재질을 들고 와도
// 그대로 쓰지 않고, 텍스처만 꺼내 **우리 재질에 얹는다.**
//
// ── draw call은 재질 수가 아니라 메시 수다 ★ ────────────────
//
// 처음엔 "재질 1개"를 예산으로 잡고 재질을 통째로 버렸다. 다시 따져 보니
// draw call은 **`InstancedMesh` 개수**로 정해진다 — 종류마다 재질이 달라도
// 한 종류는 한 번 그린다. 그러니 AI가 구워 온 텍스처를 살려도 예산에 안 걸린다.
// 진짜 비용은 텍스처 메모리뿐이고, 그건 512로 줄여 해결한다(`import_ai.py`).
//
// 스크립트로 만든 에셋은 여전히 정점 색만 들고 온다 — 둘 다 같은 길로 온다.
//
// ── 못 불러와도 게임은 돈다 ─────────────────────────────────
//
// 에셋이 아직 없거나 경로가 틀렸을 때 화면이 검게 죽으면 안 된다. 실패하면
// 도형 플레이스홀더가 그대로 남는다 — 2D 러너에서 쓰던 방식과 같다.

import * as THREE from 'three'

const ROOT = '/assets/runner3d'

let loaderPromise = null
/**
 * GLTFLoader는 three 본체에 없다. **이 게임에 들어올 때만** 받는다.
 *
 * ── 왜 Draco를 켜나 ★ ───────────────────────────────────────
 *
 * AI가 주는 "고품질" 모델은 25만 삼각형짜리 스컬프트다. 게임 규격으로 줄이는데,
 * **1만까지 깎으면 UV가 뭉개져 잎사귀가 진흙처럼 보였다**(8/25 알 둥지).
 * 2만5천은 멀쩡했지만 파일이 2MB고, 그런 물건이 넷이면 8MB다 —
 * 아이가 카메라 준비 화면에서 기다리는 시간이다.
 *
 * 삼각형을 더 깎느냐 파일을 키우느냐의 양자택일처럼 보였는데, 셋째 길이 있다.
 * **압축하면 둘 다 안 줄여도 된다.** Draco는 정점 데이터를 8~9할 줄인다 —
 * 알 둥지가 2MB에서 350KB가 됐다. 화면에 그려지는 것은 압축 전과 똑같다.
 *
 * 값은 디코더 wasm 190KB다. 한 번 받아 캐시되고, 3MB 넘게 아끼니 남는 장사다.
 * `/public/draco/`에 둔다 — 번들에 넣으면 이 게임에 안 들어와도 따라온다.
 */
function getLoader() {
  if (!loaderPromise) {
    loaderPromise = Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/loaders/DRACOLoader.js'),
    ]).then(([gltf, draco]) => {
      const d = new draco.DRACOLoader()
      d.setDecoderPath('/draco/')
      const loader = new gltf.GLTFLoader()
      loader.setDRACOLoader(d)
      return loader
    })
  }
  return loaderPromise
}

/**
 * GLB의 재질에서 **기본색 텍스처만** 꺼낸다. 나머지(금속·거칠기·노멀)는 버린다 —
 * 조명이 없으니 쓸 데가 없고, 받아 오면 메모리만 먹는다.
 */
export function baseTexture(mesh) {
  const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  const map = m?.map
  if (!map) return null
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  return map
}

/**
 * GLB 하나에서 지오메트리 하나를 꺼낸다.
 *
 * 블렌더 쪽에서 부품을 **하나로 합쳐** 내보내므로 메시도 하나다. 여럿이면
 * 합쳐야 하는데, 그건 내보내기 규율이 깨졌다는 뜻이라 콘솔에 남긴다.
 *
 * @returns {Promise<THREE.BufferGeometry|null>}
 */
export async function loadGeometry(name, subdir = 'props') {
  try {
    const loader = await getLoader()
    const gltf = await loader.loadAsync(`${ROOT}/${subdir}/${name}.glb`)
    const found = []
    gltf.scene.traverse(o => { if (o.isMesh) found.push(o) })
    if (!found.length) throw new Error('메시가 없다')
    if (found.length > 1) {
      console.warn(`[runder3d] ${name}: 메시가 ${found.length}개다 — 블렌더에서 합쳐야 한다`)
    }
    const geo = found[0].geometry
    // 블렌더의 오브젝트 변환이 남아 있을 수 있다. 굽혀 두면 인스턴싱에서
    // 변환이 두 번 먹는다 — 여기서 한 번에 정리한다.
    found[0].updateWorldMatrix(true, false)
    geo.applyMatrix4(found[0].matrixWorld)
    geo.computeBoundingBox()
    geo.userData.pzMap = baseTexture(found[0])   // 있으면 재질에 얹는다
    return geo
  } catch (e) {
    console.warn(`[runner3d] ${name}.glb 없음 — 도형으로 간다:`, e.message)
    return null
  }
}

/**
 * 여러 개를 한꺼번에. 없는 것은 `null`로 온다 — 부르는 쪽이 도형을 그대로 둔다.
 * @param {Array<[string, string]|string>} names
 */
export async function loadGeometries(names, subdir = 'props') {
  const list = names.map(n => (Array.isArray(n) ? n : [n, subdir]))
  const geos = await Promise.all(list.map(([n, d]) => loadGeometry(n, d)))
  return Object.fromEntries(list.map(([n], i) => [n, geos[i]]))
}

/**
 * **부위가 나뉜** GLB — 공룡처럼 움직이는 것.
 *
 * 블렌더가 `body` · `head` · `tail` 세 노드로 내보낸다(`pzblender.export_parts`).
 * 여기서는 지오메트리와 **붙는 자리**를 함께 꺼낸다 — 게임이 그 자리를 축으로
 * 흔들기 때문이다. 노드 위치를 지오메트리에 굽지 않는 이유가 그것이다.
 *
 * @returns {Promise<{[part: string]: {geo: THREE.BufferGeometry, at: [number,number,number]}}|null>}
 */
export async function loadParts(name, subdir = 'props') {
  try {
    const loader = await getLoader()
    const gltf = await loader.loadAsync(`${ROOT}/${subdir}/${name}.glb`)
    const out = {}
    gltf.scene.traverse(o => {
      if (!o.isMesh) return
      o.geometry.userData.pzMap = baseTexture(o)
      out[o.name] = { geo: o.geometry, at: [o.position.x, o.position.y, o.position.z] }
    })
    // ── 안 잘린 파일도 받는다 ★ ──
    // 공룡을 자르지 않기로 하면서(`import_ai.py`) 메시가 하나로 온다.
    // 그때는 **그것이 몸통**이다 — 머리·꼬리가 없으면 `DinoRow`가
    // 몸 전체를 흔든다.
    if (!out.body) {
      const only = Object.values(out)[0]
      if (!only) throw new Error('메시가 없다')
      return { body: only }
    }
    return out
  } catch (e) {
    console.warn(`[runner3d] ${name}.glb 부위 없음:`, e.message)
    return null
  }
}

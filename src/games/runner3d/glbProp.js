// 배경 GLB 프롭 — 공용 로더.
//
// ── 왜 여기로 뺐나 ────────────────────────────────────────────
//
// `labsea.js`(오디세이 런 바다 구간)가 배·록키 템플·인어·신상을 이
// 순서(GLB 받기 → 지오메트리+베이스텍스처만 뽑기 → 목표 크기로 정규화 →
// `PropRow`로 좌우 반복 배치)로 넣으면서 처음 생겼다. `labisland.js`
// (육지 구간)가 두 번째로 똑같은 순서를 밟게 되면서 — 두 번째부터는
// 복사가 아니라 공용 모듈이다("늘어나는 것은 데이터로 둔다"와 같은
// 원칙을, 로더 자체가 늘어날 때도 적용한다).
//
// ★★ 검게 나오던 원인 — GLTFLoader의 기본 재질을 그대로 썼다 ★★
// glTF 재질은 기본이 `MeshStandardMaterial`(PBR)인데, 이 프로젝트는
// **실시간 조명이 0개**다(`CLAUDE.md`) — 빛을 하나도 안 받는 PBR
// 재질은 새까맣게 찍힌다. `models.js`가 쥬라기 공룡 GLB를 받을 때
// **재질은 버리고 지오메트리+베이스 텍스처만 꺼내 프로젝트의
// `MeshBasicMaterial`에 얹는** 이유가 이것이고, 여기서도 같은 방식을
// 따른다.

import * as THREE from 'three'
import { PropRow } from './props.js'
// Draco 디코더가 붙은 공용 GLTFLoader — 비-Draco GLB도 그대로 연다
// (`models.js` 주석 참고). 오디세이 런의 Draco 압축 팻말을 열려면 필요하다.
import { getLoader } from './models.js'

/**
 * GLB 하나를 받아 **지오메트리+베이스텍스처만** 뽑고 목표 치수로
 * 정규화한다. 배경 프롭(`PropRow` 인스턴싱)과 장애물(개별 `Mesh`, 코스
 * 데이터가 자리를 정한다) 둘 다 이 앞부분(로드+정규화)은 똑같고 뒤
 * (어떻게 씬에 놓는가)만 다르다 — 배경 프롭은 `loadBgGlbProp`(아래,
 * 이 함수를 감싼다)가, 장애물(드래곤·거인 등)은 이 함수를 직접 쓴다.
 *
 * @param {string} url
 * @param {'footprint'|'height'} fitBy 목표 치수를 무엇에 맞출지 — 배처럼
 *   눕는 물건은 가로세로 중 큰 쪽(footprint), 서 있는 구조물은 높이
 *   (height) 기준이 맞다.
 * @param {number} target 맞출 목표 크기(유닛)
 * @param {(m:THREE.Material)=>THREE.Material} withCurve 곡률을 심는 함수
 * @param {(geo: THREE.BufferGeometry, mat: THREE.MeshBasicMaterial) => void} onReady
 * @param {object} [opts]
 * @param {string} [opts.label] 콘솔 경고에 붙는 꼬리표(어느 화면에서 실패했는지)
 * @param {() => boolean} [opts.isAborted] 로드가 끝나기 전에 화면을
 *   나갔는지 — 참이면 씬을 더 안 건드린다(각 페이지가 `onLeave`에서
 *   `true`로 뒤집는 플래그를 넘긴다).
 */
export function loadNormalizedGlb(url, fitBy, target, withCurve, onReady, opts = {}) {
  const { label = 'glbProp', isAborted = () => false } = opts
  getLoader().then(loader => loader.load(
    url,
    gltf => {
      if (isAborted()) return
      const found = []
      gltf.scene.traverse(o => { if (o.isMesh) found.push(o) })
      if (!found.length) return
      if (found.length > 1) console.warn(`[${label}] ${url}에 메시가 여럿이다 — 첫 번째만 쓴다`)
      const node = found[0]

      // `models.js`의 `loadGeometry`와 같은 순서 — 오브젝트 변환을
      // 지오메트리에 구워서 인스턴싱에서 두 번 안 먹게 한다.
      node.updateWorldMatrix(true, false)
      const geo = node.geometry.clone()
      geo.applyMatrix4(node.matrixWorld)

      // 크기·중심을 **재서** 맞춘다 — 원본 축척을 몰라도(1유닛=1m일지
      // 임의 스케일일지) 목표 크기로 나온다. `PropRow`/`InstancedMesh`는
      // 지오메트리 자체가 이미 정규화돼 있어야 한다(개별 오브젝트를
      // 스케일하던 방식은 여기선 안 통한다 — 인스턴스는 배치 시점의
      // 변환만 얹는다).
      const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position)
      const size = box.getSize(new THREE.Vector3())
      const measured = fitBy === 'height' ? size.y : Math.max(size.x, size.z)
      const s = target / Math.max(measured, 1e-6)
      geo.scale(s, s, s)
      const box2 = new THREE.Box3().setFromBufferAttribute(geo.attributes.position)
      const center = box2.getCenter(new THREE.Vector3())
      geo.translate(-center.x, -box2.min.y, -center.z)   // 중심은 x·z만, 바닥은 y=0

      const srcMat = Array.isArray(node.material) ? node.material[0] : node.material
      const map = srcMat?.map ?? null
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4 }
      const mat = withCurve(new THREE.MeshBasicMaterial({
        map, fog: true, side: THREE.DoubleSide,
      }))

      onReady(geo, mat)
    },
    undefined,
    err => console.warn(`[${label}] GLB(${url})를 못 받았다 — 없이 진행한다`, err),
  ))
}

/**
 * @param {string} url
 * @param {'footprint'|'height'} fitBy
 * @param {number} target
 * @param {(m:THREE.Material)=>THREE.Material} withCurve
 * @param {number} span `PropRow`의 되돌리기 주기(유닛)
 * @param {object[]} rowSpecs `PropRow` 생성자에 얹을 옵션들(좌우 각각)
 * @param {object[]} rowsOut 만들어진 PropRow를 밀어 넣을 배열(렌더 루프·dispose가 씀)
 * @param {THREE.Scene} scene
 * @param {object} [opts] `loadNormalizedGlb`에 그대로 넘긴다(`label`·`isAborted`)
 */
export function loadBgGlbProp(url, fitBy, target, withCurve, span, rowSpecs, rowsOut, scene, opts = {}) {
  loadNormalizedGlb(url, fitBy, target, withCurve, (geo, mat) => {
    for (const spec of rowSpecs) {
      const row = new PropRow({ geometry: geo, material: mat, span, ...spec })
      scene.add(row.mesh)
      rowsOut.push(row)
    }
  }, opts)
}

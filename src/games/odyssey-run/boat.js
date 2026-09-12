// 포세이돈 바다 스테이지 — **노 젓는 소년+오디세우스 빌보드.** ★
//
// ken 지시(9/10): "달리는 boy runner 사용 금지. 소년+오디세우스가 배를
// 타고 노 젓는 representation을 재사용." `#/lab-sea`(STEP 54)가 만든
// `_lab/boat_char/<skin>/{row_up,row_pull}.png` 두 컷 빌보드를 그대로 옮겼다.
//
// 판정·레인·점프 상태는 여전히 `character.js`가 가진다 — 이 빌보드는
// **순수 시각**이고, 매 프레임 `character.mesh`의 x·점프를 따라간다.
// (러닝 캐릭터 mesh는 `scene.js`가 `.visible = false`로 숨긴다.)
//
// ── 숙이기·자세 동작 그림(STEP 87) ★ ─────────────────────────
// STEP 86에서 `poseidon_crouch_hint.png`·`pose_hint_01~03.png`를 열어 보니
// "보트 안에서 소년+오디세우스가 그 동작을 하는" 그림이었다 — 추상 다이어그램이
// 아니라 이 빌보드의 **또 다른 프레임**이었다. 당시엔 UI 삽입 지점을 못
// 정해 경로만 준비해 뒀는데(`docs/16`), ken이 "숙이기/자세를 하면 배 그림이
// 그 동작으로 안 바뀐다"고 QA에서 정확히 이 자리를 짚었다. `character.ducking`/
// `character.posing`을 그대로 반영한다 — 상태가 풀리면(장애물을 지났거나
// 자세를 놓으면) 자동으로 기본 노젓기로 돌아간다(과거 상태가 안 섞인다).
import * as THREE from 'three'
import { playerSkin } from '../../core/playerSkin.js'
import { CHAR } from '../runner3d/character.js'

const H = 4.2         // 유닛 — 러닝 캐릭터(4.6)와 비슷하게
const ROW_FPS = 2.2   // 저었다 뺐다 초당 횟수 (달리기 12보다 훨씬 느리다)
const HOP_H = 1.4     // 배가 점프 회피에서 뜨는 높이 — 캐릭터 점프(3.4)보다 낮게

// action 상태(character.ducking/posing) → 동작 그림 경로. 스테이지 전용
// UI 자산(STEP 86)이라 스킨(boy/girl) 구분 없이 하나씩이다 — row_up/pull과
// 달리 동작 그림은 ken이 스킨별로 안 나눠 보냈다.
const ACTION_IMG = {
  crouch: '/assets/runner3d/odyssey/ui/hint_crouch_poseidon.webp',
  lunge: '/assets/runner3d/odyssey/ui/hint_pose_lunge.webp',
  forwardbend: '/assets/runner3d/odyssey/ui/hint_pose_forwardbend.webp',
  armsopen: '/assets/runner3d/odyssey/ui/hint_pose_armsopen.webp',
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error(`[odyssey] 배 그림 없음: ${url}`))
    im.src = url
  })
}

/**
 * 노 젓는 배 빌보드. 성공하면 `{ mesh, update, dispose }`, 실패(그림 없음)면
 * null — 부르는 쪽이 러닝 캐릭터를 도로 보여준다.
 *
 * @param {(m:THREE.Material)=>THREE.Material} withCurve
 * @param {() => boolean} isAborted
 */
export async function makeBoat(withCurve, isAborted = () => false) {
  // 프로필 스킨의 배 그림을 먼저, 없으면 소년 그림으로 — 바다 구간은
  // "달리는 러너 금지"(ken)라 러닝 캐릭터 폴백은 최후의 수단이다. 동행
  // 캐릭터가 프로필과 무관하게 "소년"이기도 하다(`story.js` cast 주석).
  const skins = [...new Set([playerSkin(), 'boy'])]
  let up, pull
  for (const skin of skins) {
    const base = `/assets/runner3d/_lab/boat_char/${skin}/`
    try {
      [up, pull] = await Promise.all([
        loadImage(base + 'row_up.png'),
        loadImage(base + 'row_pull.png'),
      ])
      break
    } catch (e) {
      if (skin === skins[skins.length - 1]) { console.warn(e.message); return null }
    }
  }
  if (isAborted()) return null

  // 두 컷을 가로로 이어 붙인다(`character.js`의 buildAtlas와 같은 이유).
  const cellW = Math.max(up.naturalWidth, pull.naturalWidth)
  const cellH = Math.max(up.naturalHeight, pull.naturalHeight)
  const cv = document.createElement('canvas')
  cv.width = cellW * 2
  cv.height = cellH
  const g = cv.getContext('2d')
  g.drawImage(up, 0, cellH - up.naturalHeight)
  g.drawImage(pull, cellW, cellH - pull.naturalHeight)

  const rowTex = new THREE.CanvasTexture(cv)
  rowTex.colorSpace = THREE.SRGBColorSpace
  rowTex.repeat.set(0.5, 1)
  rowTex.anisotropy = 4
  const ratio = cellW / cellH   // 한 컷(반쪽) 기준 가로세로비 — 기본 지오메트리를 여기 맞춘다

  // ── 동작 그림(숙이기·자세 3종) — 있으면 쓰고, 없어도(로드 실패) 게임은
  // 그대로 돈다(기본 노젓기만 보인다). 개별 실패라 `Promise.all`을 안 쓴다
  // — 하나 늦거나 없다고 나머지 셋까지 죽으면 안 된다.
  const actionTex = {}   // key -> { tex, ratio }
  await Promise.all(Object.entries(ACTION_IMG).map(async ([key, url]) => {
    if (isAborted()) return
    try {
      const img = await loadImage(url)
      const t = new THREE.Texture(img)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      t.needsUpdate = true
      actionTex[key] = { tex: t, ratio: img.naturalWidth / img.naturalHeight }
    } catch (e) {
      console.warn(e.message)   // 이 동작만 기본 노젓기로 남는다
    }
  }))
  if (isAborted()) {
    rowTex.dispose()
    for (const { tex } of Object.values(actionTex)) tex.dispose()
    return null
  }

  const mat = withCurve(new THREE.MeshBasicMaterial({
    map: rowTex, transparent: true, depthWrite: false, alphaTest: 0.35, fog: true,
    side: THREE.DoubleSide,
  }))
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(H * ratio, H), mat)
  mesh.position.set(0, H / 2, 0)   // 뱃바닥이 waterline(y=0)에 붙게
  mesh.frustumCulled = false
  mesh.renderOrder = 5

  // 지금 어느 그림이 + 어느 방향으로 걸려 있나 — 매 프레임 `mat.map`을
  // 다시 대입하지 않는다(상태가 바뀔 때만). 방향(mirror)도 같이 추적해야
  // 한다 — 같은 자세(예: lunge)가 뒤집힌 채로 다시 나오면 `shown`은 안
  // 바뀌어도 `scale.x` 부호는 바뀌어야 한다(STEP 90).
  let shown = 'row'
  let shownMirror = false
  const showAction = (key, mirror) => {
    if (shown === key && shownMirror === mirror) return
    shown = key
    shownMirror = mirror
    const a = actionTex[key]
    mat.map = a.tex
    const s = a.ratio / ratio   // 동작 그림 실제 비율로 폭만 보정(키는 H 그대로)
    mesh.scale.x = mirror ? -s : s   // CSS scaleX(-1)과 같은 효과 — 좌우만 뒤집는다
  }
  const showRow = () => {
    if (shown === 'row') return
    shown = 'row'
    shownMirror = false
    mat.map = rowTex
    mesh.scale.x = 1
  }

  return {
    mesh,
    /**
     * @param {number} now  코스 시각(초)
     * @param {number} x     캐릭터 레인 x (보간된 값)
     * @param {number} jumpOffset  `character.jumpOffset` — 점프 포물선
     *   높이(0~`CHAR.jumpHeight`). ★ 예전엔 `jumping` 불리언으로 0/1.4를
     *   그대로 스냅해서 점프 시작·끝에 뚝 끊겼다(ken QA: "점프 회피 모션이
     *   끊긴다"). 캐릭터와 **같은 곡선**을 `HOP_H` 비율로 줄여 따라가면
     *   시작·끝이 다 0으로 부드럽게 이어진다.
     * @param {'crouch'|'lunge'|'forwardbend'|'armsopen'|null} [action]
     *   `character.ducking`/`character.posing`을 그대로 옮겨 받는다(STEP 87,
     *   `scene.js`). 있으면 그 동작 그림, 없으면(장애물을 지났거나 자세를
     *   놓으면) 기본 노젓기로 자동 복귀한다 — 다른 동작과 안 섞인다.
     * @param {boolean} [mirror] `character.poseMirror` — 사인판이 뒤집혀
     *   나온(`course.js`의 `e.mirror`) 자세라면 이 배 그림도 같이 뒤집는다
     *   (STEP 90, ken QA — "장애물은 뒤집혔는데 배 위 캐릭터는 그대로").
     *   장애물·판정과 **같은 값**을 받아쓰는 것이 핵심이라 여기서 새로
     *   계산하지 않는다 — source of truth는 `character.js`의 `setPose`뿐이다.
     */
    update(now, x, jumpOffset, action = null, mirror = false) {
      mesh.position.x = x
      mesh.position.y = H / 2 + (jumpOffset / CHAR.jumpHeight) * HOP_H
      if (action && actionTex[action]) showAction(action, mirror)
      else showRow()
      if (shown === 'row') rowTex.offset.x = Math.floor(now * ROW_FPS) % 2 === 0 ? 0 : 0.5
    },
    dispose() {
      mesh.geometry.dispose()
      mat.dispose()
      rowTex.dispose()
      for (const { tex } of Object.values(actionTex)) tex.dispose()
    },
  }
}

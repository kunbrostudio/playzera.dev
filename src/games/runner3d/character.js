// 주인공 — **빌보드 스프라이트다.** 3D 모델이 아니다.
//
// ── 왜 ──────────────────────────────────────────────────────
//
// 만들어 둔 그림 12장이 이미 있다(`_shared/char/<skin>/`). 3D 모델로 가면
// 리깅과 애니메이션이 새 작업이고, 남·여 두 벌이 필요하다.
//
// 그리고 이 게임은 **카메라가 뒤에서 따라간다.** 각도가 거의 안 변해서
// 빌보드인 것이 티가 안 난다. 각도가 도는 게임이었다면 다른 답이었을 것이다.
//
// ── 왜 아틀라스인가 ★ ───────────────────────────────────────
//
// 자세마다 `material.map`을 갈아 끼우면 **텍스처 바인딩이 그때마다 바뀐다.**
// 달리기만 해도 초당 12번이고, 점프·숙이기가 섞이면 더 잦다.
//
// 열한 컷을 한 장에 가로로 이어 붙이고 **UV만 옮긴다.** 텍스처는 하나,
// 바인딩은 한 번. 자세가 늘어도 비용은 그대로다.
//
// ── 자세는 상태가 정한다 ─────────────────────────────────────
//
// 점프는 **두 컷**이다 — 뜨기 직전(`jump_prep`)과 공중(`jump_air`).
// 한 컷으로 때우면 아이가 발을 굴렀는지 그냥 떠오른 건지 못 읽는다.
// 숙이기는 `slide` 한 컷이고, **누르고 있는 동안 유지**된다 —
// 허들 아래를 지나가는 동안 계속 숙이고 있어야 하기 때문이다.
//
// ── 레인 ────────────────────────────────────────────────────
//
// 논리는 정수 인덱스(0·1·2)이고 화면은 보간된 x다. 정수만 쓰면 순간이동하고,
// 실수만 쓰면 "지금 몇 번 칸인가"를 아무도 모른다. **둘 다 있어야 한다.**

import * as THREE from 'three'
import { LANE_W } from './ground.js'

export const CHAR = {
  height: 4.6,          // 유닛. 트랙 폭 15에 견줘 아이 키
  runFps: 12,
  laneLerp: 9,          // 레인 이동 보간 — 2D 러너와 같은 값
  jumpSec: 0.75,        // 2D 러너의 `character.jumpDuration`과 같다
  jumpHeight: 3.4,
  prepSec: 0.14,        // 발을 구르는 순간. 이보다 길면 굼떠 보인다
  duckSec: 0.55,        // 누르지 않아도 이만큼은 유지 — 허들을 지날 시간
}

/**
 * 아틀라스에 들어가는 컷과 **키 배율**. 순서가 곧 UV 칸 번호다.
 *
 * ── 왜 배율이 필요한가 ★ ────────────────────────────────────
 *
 * 그림이 전부 900px 높이인데 **저마다 꽉 차게 잘려 있다.** 웅크린 슬라이드도 900,
 * 서서 달리는 컷도 900이다. 그대로 그리면 **웅크린 아이가 선 아이와 같은 키**가 되어
 * 훨씬 커 보인다 — 실제로 숙이기와 런지가 거인처럼 나왔다.
 *
 * 그림 파일은 "이 자세의 실제 키"를 모른다. 코드가 알아야 한다.
 * 서 있는 달리기를 1.0으로 두고 나머지를 눈으로 맞춘다.
 */
const FRAMES = [
  ['char_run01', 1.00], ['char_run02', 1.00], ['char_run03', 1.00],
  ['char_run04', 1.00], ['char_run05', 1.00],
  ['char_jump_prep', 0.72],          // 뛰기 직전 — 무릎을 굽힌다
  ['char_jump_air', 0.80],           // 공중 — 몸을 웅크려 뛴다
  ['char_slide', 0.60],              // 바닥에 웅크림. 가장 낮다
  ['char_stretch_lunge', 0.72],      // 깊은 런지
  ['char_stretch_forwardbend', 0.88],
  ['char_stretch_armsopen', 1.00],
]
const NAMES = FRAMES.map(f => f[0])
const SCALE = FRAMES.map(f => f[1])
const IDX = Object.fromEntries(NAMES.map((n, i) => [n, i]))

/** 자세 이름 → 컷. 자세를 늘릴 때 손대는 유일한 곳. */
const POSE_FRAME = {
  lunge: IDX.char_stretch_lunge,
  forwardbend: IDX.char_stretch_forwardbend,
  armsopen: IDX.char_stretch_armsopen,
}

/** 레인 인덱스 → x. 가운데가 0이다. */
export const laneX = (i, lanes = 3) => (i - (lanes - 1) / 2) * LANE_W

/**
 * 등에 업은 아기 공룡 "말풍선" — **쥬라기 대탐험 스토리 전용, 다른 테마는
 * 안 부른다.** ★
 *
 * ── 왜 캐릭터 그림을 새로 안 그리나 ────────────────────────────
 *
 * 안고 뛰는 포즈를 프로필(남·여)마다 다시 그리면 공수가 기존 12장의 두 배로
 * 는다. 대신 작은 그림 한 장을 캐릭터의 자식 오브젝트로 붙인다 — 달리기·
 * 점프·숙이기 컷은 전혀 안 바뀐다.
 *
 * ── 왜 자식으로 붙이나 ──────────────────────────────────────
 *
 * 캐릭터 메시(`mesh`)에 `add()`하면 위치·자세 전환에 따른 좌우 튐을 따로
 * 계산할 필요가 없다 — 부모가 매 프레임 `apply()`로 자기 위치를 옮기면
 * 자식은 로컬 좌표만 유지한 채 그대로 따라온다.
 *
 * 자리는 눈대중이다(백팩이 있는 등 위쪽, 살짝 오른쪽) — 실제 그림이 들어오면
 * 화면에서 보고 다시 잰다(`CLAUDE.md`: 브라우저에서만 확인되는 것은 추측하지
 * 않는다).
 */
async function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error(`[runner3d] 이미지 없음: ${url}`))
    im.src = url
  })
}

/**
 * 컷을 **한 장으로** 묶는다.
 *
 * 그림마다 가로세로가 다르므로(435×900 ~ 886×900) 칸 폭을 가장 넓은 것에 맞추고
 * 가운데 정렬한다. 안 맞추면 자세가 바뀔 때 아이가 좌우로 튄다.
 * 세로는 **발밑을 맞춘다** — 위로 맞추면 숙인 컷이 공중에 뜬다.
 */
async function buildAtlas(skin) {
  const imgs = await Promise.all(NAMES.map(n => new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error(`[runner3d] ${skin}/${n} 없음`))
    im.src = `/assets/runner/_shared/char/${skin}/${n}.png`
  })))

  const cellH = Math.max(...imgs.map(i => i.naturalHeight))
  const cellW = Math.max(...imgs.map(i => i.naturalWidth))
  const cv = document.createElement('canvas')
  cv.width = cellW * imgs.length
  cv.height = cellH
  const g = cv.getContext('2d')
  imgs.forEach((im, i) => {
    g.drawImage(im, i * cellW + (cellW - im.naturalWidth) / 2, cellH - im.naturalHeight)
  })

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.repeat.set(1 / imgs.length, 1)
  tex.anisotropy = 4
  return { tex, count: imgs.length, ratio: cellW / cellH }
}

/**
 * @param {(m:THREE.Material)=>THREE.Material} withCurve
 * @param {string} skin 'boy' | 'girl'
 * @param {number} lanes
 */
export async function createCharacter(withCurve, skin, lanes = 3) {
  const { tex, count, ratio } = await buildAtlas(skin)

  const mat = withCurve(new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    // 반투명 가장자리가 뒤의 땅을 지우면 발밑에 네모난 구멍이 보인다
    depthWrite: false,
    // 완전히 투명한 픽셀은 아예 버린다 — 정렬 문제를 줄인다
    alphaTest: 0.35,
    fog: true,
    // 런지·옆구리늘리기 자세를 좌우 반전해서 보여줄 때(아래 `setPose`) x를
    // 음수로 스케일한다. 판 하나짜리 빌보드를 한 축만 뒤집으면 감김 순서가
    // 뒤집혀 기본 앞면 컬링에서 통째로 사라지므로 양면으로 그린다
    // (`runner3d/obstacles3d.js`의 사인판과 같은 이유).
    side: THREE.DoubleSide,
  }))

  const H = CHAR.height
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(H * ratio, H), mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 5

  let lane = Math.floor(lanes / 2)      // 논리 — 판정이 보는 값
  let x = laneX(lane, lanes)            // 화면 — 보간된 값
  let runT = 0
  let jumpT = -1
  let duckT = -1
  let duckHeld = false
  let pose = null                       // 'lunge' | 'forwardbend' | 'armsopen'
  // 사인판이 좌우 반전으로 나왔거나(`course.js`), 카메라가 아이의 실제 동작을
  // 보고 반대쪽이 더 잘 맞는다고 판단했을 때(`poseMatch.js`의 `mirrored`) 켠다.
  let poseMirror = false
  let bubble = null                     // { mesh, tex } — 로드된 뒤에만 생긴다
  let carrying = false

  /** 공중 높이. 올라갔다 내려온다. */
  const jumpY = () => (jumpT < 0 ? 0 : Math.sin(Math.PI * (jumpT / CHAR.jumpSec)) * CHAR.jumpHeight)

  /** 지금 그릴 컷. **판정이 아니라 그림만 정한다.** */
  const frameNow = () => {
    if (pose) return POSE_FRAME[pose] ?? IDX.char_run01
    if (duckT >= 0) return IDX.char_slide
    if (jumpT >= 0) return jumpT < CHAR.prepSec ? IDX.char_jump_prep : IDX.char_jump_air
    return Math.floor(runT * CHAR.runFps) % 5   // 달리기 5컷
  }

  const apply = () => {
    const f = frameNow()
    tex.offset.x = f / count
    // **가로세로를 같이 줄인다.** 세로만 줄이면 아이가 납작해져 다른 캐릭터로 보인다.
    // 그림 안의 비율은 아틀라스가 이미 지키고 있으니 여기서는 통째로만 조절한다.
    const s = SCALE[f]
    const flip = pose && poseMirror ? -1 : 1
    mesh.scale.set(s * flip, s, 1)
    // 발이 바닥에 붙어야 한다. 판의 중심은 절반 높이이므로 배율을 곱해 올린다.
    mesh.position.set(x, (H * s) / 2 + jumpY(), 0)
  }
  apply()

  return {
    mesh,
    get lane() { return lane },
    get jumping() { return jumpT >= 0 },
    get ducking() { return duckT >= 0 },
    get posing() { return pose },

    /** 논리는 정수다. 화면은 update가 따라간다. */
    setLane(i) { lane = Math.max(0, Math.min(lanes - 1, i)) },
    moveLane(d) { this.setLane(lane + d) },

    jump() {
      // 숙인 채로 뛰면 두 그림이 겹친다. 하나만 한다.
      if (jumpT >= 0 || duckT >= 0) return
      jumpT = 0
    },

    /** 누르고 있는 동안 유지. 떼면 `duckSec`까지는 남는다. */
    duck(held = true) {
      if (jumpT >= 0) return
      duckHeld = held
      if (held && duckT < 0) duckT = 0
    },
    duckEnd() { duckHeld = false },

    /**
     * 자세 유지(요가 구간). null이면 해제.
     *
     * @param {string|null} p
     * @param {boolean} mirror 좌우 반전해서 보여줄지 — 사인판이 뒤집혀 나왔거나
     *   (`course.js`) 카메라가 본 아이의 실제 자세가 반대쪽일 때(`play3d.js`).
     */
    setPose(p, mirror = false) { pose = p; poseMirror = mirror },

    /**
     * 아기 공룡을 업었나 켜고 끈다. **처음 켤 때만** 그림을 불러온다 —
     * 판마다 새로 만들 필요는 없다.
     *
     * @param {string} url 말풍선 그림. 없으면(로드 실패 포함) 조용히 아무 일도
     *   안 한다 — 이 그림은 스토리 연출이지 판정이 아니라서, 없다고 게임이
     *   멈추면 안 된다(`buildAtlas`의 캐릭터 그림과 다르게 필수가 아니다).
     * @param {boolean} on
     */
    async setCarrying(url, on) {
      carrying = on
      if (on && !bubble && url) {
        try {
          const im = await loadImage(url)
          const tex = new THREE.Texture(im)
          tex.colorSpace = THREE.SRGBColorSpace
          tex.needsUpdate = true
          const bH = H * 0.34
          const bW = bH * (im.naturalWidth / im.naturalHeight)
          const bmat = withCurve(new THREE.MeshBasicMaterial({
            map: tex, transparent: true, depthWrite: false, alphaTest: 0.1, fog: true,
          }))
          const bmesh = new THREE.Mesh(new THREE.PlaneGeometry(bW, bH), bmat)
          // 로컬 좌표 — 원점은 캐릭터 판의 중심(허리 높이 근처). 등 위쪽,
          // 백팩이 있는 자리로 살짝 오른쪽.
          bmesh.position.set(H * ratio * 0.26, H * 0.30, 0.05)
          bmesh.renderOrder = 6
          mesh.add(bmesh)
          bubble = { mesh: bmesh, tex }
        } catch (e) {
          console.warn(e.message)
          return
        }
      }
      if (bubble) bubble.mesh.visible = carrying
    },

    update(dt) {
      runT += dt

      if (jumpT >= 0) {
        jumpT += dt
        if (jumpT >= CHAR.jumpSec) jumpT = -1
      }
      if (duckT >= 0) {
        duckT += dt
        // 누르고 있으면 계속. 떼면 최소 시간까지만 남는다 —
        // 떼자마자 일어나면 허들 아래에서 머리가 튀어나온다.
        if (!duckHeld && duckT >= CHAR.duckSec) duckT = -1
      }

      // 레인 보간. 지수 보간이라 프레임 수가 달라도 같은 느낌이 난다.
      const target = laneX(lane, lanes)
      x += (target - x) * (1 - Math.exp(-CHAR.laneLerp * dt))

      apply()
    },

    dispose() {
      mesh.geometry.dispose(); tex.dispose(); mat.dispose()
      if (bubble) { bubble.mesh.geometry.dispose(); bubble.mesh.material.dispose(); bubble.tex.dispose() }
    },
  }
}

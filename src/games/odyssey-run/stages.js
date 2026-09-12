// 오디세이 런 — **스테이지 셋의 시각 정의(데이터).** ★
//
// `scene.js`가 이 데이터를 읽어 스테이지를 짓고/부순다. 늘어나는 것은
// 데이터로 둔다(`CLAUDE.md`). 실제 조립(three)은 `scene.js`가 한다.
//
// ── 자산 (2026-09-11, STEP 86 — 접근 복구 후 전 스테이지 실제 연결) ──
//
//   기본 하늘   : `_lab/sky_original_jurassic.png` (파란 하늘). Stage 2만
//                 `weather`로 어두운 구름·비·번개를 **덧씌운다**(sky 교체 아님).
//   레인(좌우 피하기) : 거인 / 드래곤(스킬라) / 전사상 GLB
//   점프         : 양떼 / 소용돌이(코드) / 도끼 줄 GLB
//   숙이기       : 키클롭스 게이트 / 포세이돈 인어 듀오 아치 / 이타카 게이트 —
//                 세 스테이지 다 실제 GLB.
//   자세 팻말    : 세 스테이지 다 3종 실제 GLB(1번 lunge는 flip).
//   Finish Gate  : **스테이지마다 다른 GLB** — `odyssey/finish/gate_cyclops.glb`
//                 (51파트) · `gate_poseidon.glb`(59파트) · `gate_ithaca.glb`
//                 (20파트, 구 공용 finish_gate.glb와 같은 원본). 전부 텍스처
//                 살려 멀티메시(`models.loadMeshGroup`), `portal.js`
//                 `shell.group`으로 스테이지별로 갈아 끼운다(`scene.js`
//                 `buildStage`가 stage.portal로 소유). archGate lifecycle은
//                 그대로.
//   Stage 2 배   : `_lab/boat_char/boy/` 빌보드 (러닝 캐릭터 대신).
//   Stage 2 트랙 : `sea.js` — 부표(경계) + 흰 가이드 라인(레인 경계).
//
// ── STEP 87 (ken 실플레이 QA, 2026-09-11) ──
//
//   Stage 2 하늘 : `weather`가 있으면 하늘 그림 자체를 쥬라기 3D 기본
//                 (`backdrop.js BACKDROP_ART.sky`, 어두운 먹구름)으로 바꾼다 —
//                 전엔 배경색만 어둡게 하고 하늘 그림은 그대로였다.
//   Ithaca 배경  : 기존 8종 재사용, row당 count만 올려 밀도 보강. 앵커+방패+
//                 로프+조개 기념물(`bow_monument.glb` — 실제로는 활이 아니었다,
//                 아래 정정)을 size 8→13으로 확대.
//   장애물 폴백 box 제거 : GLB 도착 전엔 그 이벤트를 안 그린다(스테이지
//                 색상 box 폴백 완전 제거) — 포세이돈 색이 파랑이라 그
//                 폴백이 정확히 "파란 박스"로 보였다. `scene.js` 참고.

import * as THREE from 'three'
import { PALETTE, TRACK_W } from '../runner3d/ground.js'

const R3 = '/assets/runner3d'
const LAB = `${R3}/_lab`
const ODY = `${R3}/odyssey`

export const ODYSSEY_SKY = `${LAB}/sky_original_jurassic.png`

// ── 팔레트 ───────────────────────────────────────────────────
const MARBLE = {
  ...PALETTE,
  stone: '#cbb489', stoneLit: '#f1e2b8', stoneDark: '#8f7752',
  gloss: 'rgba(255,244,205,0.16)',
  edge: '#f4cf46', edgeGlow: 'rgba(255,205,60,0.55)',
  lane: 'rgba(58,140,255,0.85)', arrow: 'rgba(255,255,255,0.9)',
  curbA: '#e9dcb9', curbB: '#cdb98d', curbTop: '#3f8a2f',
  gem: '#5fd6ff',
}
const DESERT = {
  ...PALETTE,
  grass: '#c9a86a', grassLit: '#ddc088', grassDark: '#a5834a',
  stone: '#b89a6a', stoneLit: '#d8bd8c', stoneDark: '#8a6f47',
  gloss: 'rgba(255,236,200,0.12)',
  edge: '#f0d060', edgeGlow: 'rgba(240,190,90,0.5)',
  lane: 'rgba(255,244,215,0.85)', arrow: 'rgba(120,90,50,0.85)',
  curbA: '#d8c49a', curbB: '#b8a06a', curbTop: '#7fae4a',
  gem: '#ffe0a0',
}

/**
 * @typedef {object} StageDef
 * @property {string} key
 * @property {string} title
 * @property {string} groundColor
 * @property {[string, number, number]} fog
 * @property {object|null} ground  `createGround` 옵션 — null이면 바닥 트랙 없음(바다)
 * @property {'sides'|'full'|'none'} water
 * @property {boolean} [boat]  달리는 캐릭터 대신 노 젓는 배 빌보드로 그린다(sea)
 * @property {{url,fit,size,rows}[]} props
 * @property {{url,fit,size,motion,y}} lane  좌우 피하기(cube) GLB
 * @property {{kind:'glb'|'whirlpool', url?,fit?,size?,y?}} jump  점프(hurdleLow)
 * @property {{url,fit,size,y}|null} crouch  숙이기(hurdleWide) GLB — **null이면
 *   그 스테이지의 hurdleWide 이벤트를 코스에서 뺀다**(도형 폴백 안 씀 —
 *   ken: "placeholder box 금지"). asset 오면 slot에 채우면 된다.
 * @property {(string|null)[]} pose  자세 팻말 GLB — [lunge, forwardbend, armsopen].
 *   **한 칸이 null이면 그 pose의 poseSign 이벤트를 코스에서 뺀다.**
 * @property {[boolean,boolean,boolean]} [poseFlip]  자세 팻말 GLB를 x축으로
 *   뒤집어 로드할지 — 원본 실루엣이 캐릭터 pose와 반대 방향일 때(ken QA).
 * @property {number} poseSize  자세 팻말 목표 높이
 * @property {string} obstacleColor  도형 폴백 색
 * @property {{clouds?:string}} [weather]  폭풍 오버레이(구름·비·번개) — Stage 2만.
 *   기본 하늘(`ODYSSEY_SKY`)은 그대로, 위에 덧씌운다.
 * @property {boolean} [seaTrack]  물 트랙에 부표 + 흰 가이드 라인(`sea.js`)
 * @property {{name:string, subdir:string}} finishGate  이 스테이지 전용 Finish
 *   Gate 껍데기 — `scene.js`가 `runner3d/portal.js`의 `opts.shell`(멀티메시,
 *   `models.loadMeshGroup`)로 넘긴다. 이름+하위폴더(경로 아님).
 */

const OB = k => `${ODY}/${k}`

/** @type {StageDef[]} */
export const STAGES = [
  // ── Stage 1 — Cyclops Island (Lv1·Lv2) ────────────────────
  {
    key: 'island',
    title: '키클롭스 섬',
    groundColor: '#2f7fb0',
    fog: ['#8fc9e6', 110, 140],
    ground: { palette: MARBLE, grass: false },
    water: 'sides',
    props: [
      { url: `${LAB}/ship_odyssey.glb`, fit: 'footprint', size: 7.4, rows: [
        { count: 6, side: -1, near: 14, spread: 12, radius: 4.2, faceTrack: true, bob: { amp: 0.12, rate: 1.0 } },
        { count: 6, side: 1, near: 14, spread: 12, radius: 4.2, faceTrack: true, bob: { amp: 0.12, rate: 1.0 } },
      ] },
      { url: `${LAB}/temple_odyssey.glb`, fit: 'height', size: 16, rows: [
        { count: 4, side: -1, near: 22, spread: 22, radius: 6, faceTrack: true },
        { count: 4, side: 1, near: 22, spread: 22, radius: 6, faceTrack: true },
      ] },
      { url: `${LAB}/temple_odyssey.glb`, fit: 'height', size: 22, rows: [
        { count: 2, side: -1, near: 40, spread: 20, radius: 8, faceTrack: true },
        { count: 2, side: 1, near: 40, spread: 20, radius: 8, faceTrack: true },
      ] },
    ],
    lane: { url: `${LAB}/island/giant_odyssey.glb`, fit: 'height', size: 6.8, motion: 'float', y: 0 },
    jump: { kind: 'glb', url: OB('island/obstacles/jump_sheep.glb'), fit: 'footprint', size: TRACK_W * 0.9, y: 0.4 },
    crouch: { url: OB('island/obstacles/crouch_cyclops.glb'), fit: 'footprint', size: TRACK_W * 0.98, y: 0 },
    pose: [
      OB('island/obstacles/pose_cyclops_1.glb'),
      OB('island/obstacles/pose_cyclops_2.glb'),
      OB('island/obstacles/pose_cyclops_3.glb'),
    ],
    // pose_cyclops_1(런지) 실루엣이 캐릭터 런지와 반대 방향(ken QA) → 뒤집는다.
    // pose 2·3은 정상.
    poseFlip: [true, false, false],
    poseSize: 6.5,
    obstacleColor: '#cbb489',
    finishGate: { name: 'gate_cyclops', subdir: 'odyssey/finish' },
  },

  // ── Stage 2 — Poseidon Sea (Lv3·Lv4) ──────────────────────
  // 트랙이 바닷물. 바닥 트랙 없음(`ground: null`) + 전면 물 + 부표·가이드 라인.
  // 달리는 캐릭터 대신 노 젓는 배 빌보드(`boat: true`). 폭풍 오버레이(`weather`).
  {
    key: 'sea',
    title: '포세이돈 바다',
    groundColor: '#0d2033',
    fog: ['#16293c', 68, 112],   // 폭풍 — 더 짙고 가깝게(ken QA: "폭풍 느낌이 약함")
    ground: null,
    water: 'full',
    boat: true,
    weather: { clouds: '#2a3240' },   // 어두운 구름 + 비 + 번개(`sea.js`)
    seaTrack: true,                    // 부표 + 흰 가이드 라인
    props: [
      { url: `${LAB}/ship_odyssey.glb`, fit: 'footprint', size: 7.6, rows: [
        { count: 5, side: -1, near: 12, spread: 12, radius: 4.2, faceTrack: true, bob: { amp: 0.16, rate: 1.1 } },
        { count: 5, side: 1, near: 12, spread: 12, radius: 4.2, faceTrack: true, bob: { amp: 0.16, rate: 1.1 } },
      ] },
      { url: `${LAB}/mermaid_odyssey.glb`, fit: 'height', size: 9, rows: [
        { count: 4, side: -1, near: 19, spread: 15, radius: 3, faceTrack: true, rotOffset: Math.PI / 12, bob: { amp: 0.10, rate: 0.9 } },
        { count: 4, side: 1, near: 19, spread: 15, radius: 3, faceTrack: true, rotOffset: Math.PI / 12, bob: { amp: 0.10, rate: 0.9 } },
      ] },
      { url: `${LAB}/godstatue_odyssey.glb`, fit: 'height', size: 22, rows: [
        { count: 1, side: -1, near: 34, spread: 16, radius: 7, faceTrack: true, rotOffset: -Math.PI / 12, rotJitter: 0 },
        { count: 1, side: 1, near: 34, spread: 16, radius: 7, faceTrack: true, rotOffset: -Math.PI / 12, rotJitter: 0 },
      ] },
    ],
    lane: { url: `${LAB}/dragon_odyssey.glb`, fit: 'height', size: 4.6, motion: 'sway', y: 0.15 },
    jump: { kind: 'whirlpool' },   // 카리브디스 소용돌이 (`whirlpool.js`, 유지)
    // STEP 86 — 접근 복구 후 실제 연결. `poseidon_crouch_mermaid.glb`(인어
    // 듀오 아치)를 optimize.mjs로 처리 → `crouch_poseidon.glb`(구
    // poseidon_crouch_gate.glb 대체). pose 3종은 이미 있던 파일명 그대로
    // 재확인·재빌드.
    crouch: { url: OB('sea/obstacles/crouch_poseidon.glb'), fit: 'footprint', size: TRACK_W * 0.98, y: 0 },
    pose: [
      OB('sea/obstacles/pose_poseidon_1.glb'),
      OB('sea/obstacles/pose_poseidon_2.glb'),
      OB('sea/obstacles/pose_poseidon_3.glb'),
    ],
    poseSize: 6.5,
    obstacleColor: '#2f6d9a',
    finishGate: { name: 'gate_poseidon', subdir: 'odyssey/finish' },
  },

  // ── Stage 3 — Ithaca (Lv5·Lv6) ────────────────────────────
  {
    key: 'ithaca',
    title: '이타카',
    groundColor: '#c9a86a',
    fog: ['#e0c69a', 110, 142],
    ground: { palette: DESERT, grass: true },
    water: 'none',
    // 배경 밀도 — landmark + 중형 + 소형 계층(ken QA: "좌우가 비어 보임",
    // STEP 87 — 기존 8종 재사용, GLB 추가 없이 row당 count만 올렸다.
    // `PropRow`/`rowSpots`가 인스턴스마다 위치·회전·크기(0.75~1.25배)를
    // 이미 흩뜨리므로(`layout.js`), count를 늘려도 "복제" 티가 덜 난다 —
    // 늘어난 것은 draw call이 아니라 기존 InstancedMesh의 인스턴스 수뿐이다.
    props: [
      // ── 대형 landmark ──
      // ★ 트로이 목마 — 건물급 랜드마크(ken). 유일해야 랜드마크로 읽혀서
      // count는 그대로 둔다("큰 것은 두 마리만 보여도 무리로 읽힌다").
      { url: `${LAB}/island/horse_odyssey.glb`, fit: 'height', size: 14, rows: [
        { count: 1, side: -1, near: 23, spread: 8, radius: 6, faceTrack: true, rotJitter: 0 },
        { count: 1, side: 1, near: 23, spread: 8, radius: 6, faceTrack: true, rotJitter: 0 },
      ] },
      // 그리스 신전 — 도시 건물. Stage 1에서 쓰던 것 재사용, 원경에 크게.
      // (거대 신상 godstatue는 draw call 여유 위해 뺐다 — goddess1이 신상 역할)
      { url: `${LAB}/temple_odyssey.glb`, fit: 'height', size: 20, rows: [
        { count: 3, side: -1, near: 36, spread: 24, radius: 8, faceTrack: true, rotJitter: 0 },
        { count: 3, side: 1, near: 36, spread: 24, radius: 8, faceTrack: true, rotJitter: 0 },
      ] },
      // ── 중형 ──
      { url: `${LAB}/island/goddess1_odyssey.glb`, fit: 'height', size: 13, rows: [
        { count: 4, side: -1, near: 19, spread: 26, radius: 4.6, faceTrack: true, rotJitter: 0 },
        { count: 4, side: 1, near: 19, spread: 26, radius: 4.6, faceTrack: true, rotJitter: 0 },
      ] },
      { url: `${LAB}/island/knight_odyssey.glb`, fit: 'height', size: 5.6, rows: [
        { count: 7, side: -1, near: 12, spread: 14, radius: 2.5, faceTrack: true },
        { count: 7, side: 1, near: 12, spread: 14, radius: 2.5, faceTrack: true },
      ] },
      // 앵커+방패+로프+조개 해양 기념물(ken이 "bow_monument"로 넘겨준
      // 파일 — 실제로 열어 보니 활이 아니라 이 조합이었다, STEP 87 정정).
      // 배경 소품치고 작아 보인다는 지적(ken QA) → 8 → 13(중형~대형급,
      // goddess1과 같은 급)으로 확대. 좌우 각 1개(총 2곳)는 유지 —
      // 반복시키기보다 존재감을 키우는 쪽으로.
      { url: OB('ithaca/props/bow_monument.glb'), fit: 'height', size: 13, rows: [
        { count: 1, side: -1, near: 28, spread: 10, radius: 5.5, faceTrack: true, rotJitter: 0 },
        { count: 1, side: 1, near: 28, spread: 10, radius: 5.5, faceTrack: true, rotJitter: 0 },
      ] },
      // ── 소형 — 환영 인파 · 보물 ──
      { url: OB('ithaca/props/citizens_1.glb'), fit: 'height', size: 4.4, rows: [
        { count: 5, side: -1, near: 15, spread: 18, radius: 2.2, faceTrack: true },
        { count: 5, side: 1, near: 15, spread: 18, radius: 2.2, faceTrack: true },
      ] },
      { url: OB('ithaca/props/citizens_2.glb'), fit: 'height', size: 4.4, rows: [
        { count: 4, side: -1, near: 26, spread: 18, radius: 2.2, faceTrack: true },
        { count: 4, side: 1, near: 26, spread: 18, radius: 2.2, faceTrack: true },
      ] },
      { url: `${LAB}/island/treasure_odyssey.glb`, fit: 'footprint', size: 3.4, rows: [
        { count: 4, side: -1, near: 10, spread: 18, radius: 1.8 },
        { count: 4, side: 1, near: 10, spread: 18, radius: 1.8 },
      ] },
    ],
    lane: { url: OB('island/props/statue_warrior.glb'), fit: 'height', size: 6.4, motion: 'float', y: 0 },
    jump: { kind: 'glb', url: OB('ithaca/obstacles/jump_axe.glb'), fit: 'footprint', size: TRACK_W * 0.9, y: 0.4 },
    // STEP 86 — 접근 복구 후 실제 연결. ithaca_crouch_gate.glb·
    // ithaca_pose_03.glb 전부 확보돼 있었다(파일 존재는 STEP 85에 이미
    // 확인) — optimize.mjs로 처리해 채운다.
    crouch: { url: OB('ithaca/obstacles/crouch_ithaca.glb'), fit: 'footprint', size: TRACK_W * 0.98, y: 0 },
    pose: [
      OB('ithaca/obstacles/pose_ithaca_1.glb'),   // 런지 — 방향 뒤집음(poseFlip)
      OB('ithaca/obstacles/pose_ithaca_2.glb'),   // 상체숙이기
      OB('ithaca/obstacles/pose_ithaca_3.glb'),   // 팔벌리기 — STEP 86에서 확보
    ],
    // pose_ithaca_1(런지) 실루엣이 캐릭터 런지와 반대 방향(ken QA) → 뒤집는다.
    poseFlip: [true, false, false],
    poseSize: 6.5,
    obstacleColor: '#b89a6a',
    finishGate: { name: 'gate_ithaca', subdir: 'odyssey/finish' },
  },
]

// 자세 팻말 도형 폴백 — GLB 도착 전. 트랙 폭 86%로 크게(ken: "너무 작다").
export const POSE_BOX = { w: TRACK_W * 0.86, h: 6, d: 0.4 }

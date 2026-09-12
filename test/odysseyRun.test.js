// 오디세이 런 — 3 스테이지 · 6 레벨 구조의 약속.
//
// 씬(three.js)은 여기서 못 돌린다 — 순수 config(레벨 표·스테이지 데이터·
// 스토리)와 course 생성만 검증한다. 화면은 ken이 브라우저에서 본다.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { ODYSSEY_LEVELS, ODYSSEY_LEVEL_COUNT, stageOf, isStageFinale } from '../src/games/odyssey-run/levels.js'
import { STAGES, POSE_BOX, ODYSSEY_SKY } from '../src/games/odyssey-run/stages.js'
import { STORY, NEEDS_ART } from '../src/games/odyssey-run/story.js'
import { buildCourse3d } from '../src/games/runner3d/course3d.js'
import { CONFIG } from '../src/games/runner/config.js'
import { getExercise } from '../src/progress/exercises.js'
import manifest from '../src/games/odyssey-run/manifest.json'

const asPath = url => 'public' + url

describe('오디세이 런 — 레벨/속도', () => {
  it('총 6판이다', () => {
    expect(ODYSSEY_LEVEL_COUNT).toBe(6)
    expect(manifest.levels).toBe(6)
  })

  it('★ Lv1 < Lv2 < … < Lv6 — 속도가 전체 게임에서 계속 빨라진다', () => {
    for (let i = 1; i < ODYSSEY_LEVELS.length; i++) {
      expect(ODYSSEY_LEVELS[i].speed, `Lv${i + 1} > Lv${i}`).toBeGreaterThan(ODYSSEY_LEVELS[i - 1].speed)
    }
  })

  it('★ 스테이지 경계에서도 속도가 리셋되지 않는다 (Lv2→3, Lv4→5)', () => {
    expect(ODYSSEY_LEVELS[2].speed).toBeGreaterThan(ODYSSEY_LEVELS[1].speed)  // 섬 → 바다
    expect(ODYSSEY_LEVELS[4].speed).toBeGreaterThan(ODYSSEY_LEVELS[3].speed)  // 바다 → 이타카
  })

  it('approachSec는 속도가 붙는 만큼 줄어든다', () => {
    for (let i = 1; i < ODYSSEY_LEVELS.length; i++) {
      expect(ODYSSEY_LEVELS[i].approachSec).toBeLessThanOrEqual(ODYSSEY_LEVELS[i - 1].approachSec)
    }
  })

  it('엔진의 CONFIG.levels(쥬라기·2D 러너용)는 안 건드린다', () => {
    expect(CONFIG.levels.length).toBe(5)
  })

  it('레벨 → 스테이지 매핑', () => {
    expect([0, 1, 2, 3, 4, 5].map(stageOf)).toEqual([0, 0, 1, 1, 2, 2])
  })

  it('스테이지 마지막 판(Lv2·Lv4·Lv6)에만 Finish Gate가 뜬다', () => {
    expect([0, 1, 2, 3, 4, 5].map(isStageFinale)).toEqual([false, true, false, true, false, true])
  })
})

describe('오디세이 런 — 코스', () => {
  // 씬(`scene.js`)이 실제로 넘기는 옵션 — archGate를 스테이지 경계마다 넣는다.
  const opts = { levels: ODYSSEY_LEVELS, archGate: isStageFinale }

  it('6판 다 만들어지고 속도가 표와 일치한다', () => {
    for (let i = 0; i < 6; i++) {
      const c = buildCourse3d(i, 1, opts)
      expect(c.speed).toBeCloseTo(ODYSSEY_LEVELS[i].speed, 5)
      expect(c.events.length).toBeGreaterThan(0)
      expect(c.duration).toBeGreaterThan(10)
    }
  })

  it('★ archGate 이벤트가 스테이지 마지막 판(Lv2·Lv4·Lv6)에만 있다 — 정식 finish lifecycle', () => {
    for (let i = 0; i < 6; i++) {
      const has = buildCourse3d(i, 1, opts).events.some(e => e.type === 'archGate')
      expect(has, `Lv${i + 1}`).toBe(isStageFinale(i))
    }
  })

  it('archGate 이벤트는 마지막 실장애물 뒤에 온다 (funnel 여유)', () => {
    const c = buildCourse3d(5, 1, opts)
    const gate = c.events.find(e => e.type === 'archGate')
    const lastObstacle = c.events.filter(e => e.type !== 'archGate').at(-1)
    expect(gate.hitTime).toBeGreaterThan(lastObstacle.hitTime + 3)
    expect(c.duration).toBeGreaterThan(gate.hitTime)
  })

  it('네 동작을 다 만든다 — cube · hurdleLow · hurdleWide · poseSign', () => {
    const types = new Set(buildCourse3d(0, 1, opts).events.map(e => e.type))
    expect(types).toEqual(new Set(['cube', 'hurdleLow', 'hurdleWide', 'poseSign']))
  })

  it('poseSign 이벤트는 세 자세(lunge/forwardbend/armsopen)를 다 만든다', () => {
    const poses = new Set(buildCourse3d(0, 1, opts).events.filter(e => e.type === 'poseSign').map(e => e.pose))
    expect(poses).toEqual(new Set(['lunge', 'forwardbend', 'armsopen']))
  })

  // scene.js의 stageCourse 필터를 그대로 재현: crouch/pose 슬롯이 null이면
  // 해당 이벤트를 뺀다. 필터 **메커니즘**은 자산이 나중에 다시 빠지는
  // 경우를 대비해 유지·테스트한다 — 지금 STAGES 데이터 자체는 STEP 86부터
  // 전부 채워져 있다(아래 별도 테스트).
  const POSE_KEYS = ['lunge', 'forwardbend', 'armsopen']
  const applyStageCourseFilter = (events, cfg) => events.filter(e => {
    if (e.type === 'hurdleWide' && !cfg.crouch) return false
    if (e.type === 'poseSign') {
      const k = POSE_KEYS.indexOf(e.pose ?? 'lunge')
      if (k >= 0 && !cfg.pose[k]) return false
    }
    return true
  })

  it('★ 필터 메커니즘 — crouch/pose 슬롯이 null이면 그 이벤트를 뺀다 (placeholder box 안 씀)', () => {
    const raw = buildCourse3d(0, 1, opts).events   // Stage1(Lv1) 코스 — 장애물 종류 다 있음
    const allMissing = applyStageCourseFilter(raw, { crouch: null, pose: [null, null, null] })
    expect(allMissing.some(e => e.type === 'hurdleWide')).toBe(false)
    expect(allMissing.some(e => e.type === 'poseSign')).toBe(false)
    // cube·hurdleLow(점프)는 crouch/pose와 무관 — 항상 남는다
    expect(allMissing.some(e => e.type === 'cube')).toBe(true)
    expect(allMissing.some(e => e.type === 'hurdleLow')).toBe(true)

    const armsopenMissing = applyStageCourseFilter(raw, { crouch: {}, pose: ['x', 'y', null] })
    expect(armsopenMissing.some(e => e.type === 'hurdleWide')).toBe(true)   // crouch는 있음
    expect(new Set(armsopenMissing.filter(e => e.type === 'poseSign').map(e => e.pose)))
      .toEqual(new Set(['lunge', 'forwardbend']))   // armsopen만 빠짐
  })

  it('★ 실제 STAGES는 세 스테이지 다 채워져 있어 필터가 아무것도 안 뺀다 (STEP 86)', () => {
    for (let i = 0; i < 6; i++) {
      const cfg = STAGES[stageOf(i)]
      const raw = buildCourse3d(i, 1, opts).events
      const filtered = applyStageCourseFilter(raw, cfg)
      expect(filtered.length, `Lv${i + 1}`).toBe(raw.length)   // 하나도 안 빠짐
    }
  })

  it('원본 buildCourse3d(0)은 안 바뀐다 — 쥬라기 회귀 방지', () => {
    const jur = buildCourse3d(4)   // CONFIG.levels[4] — 쥬라기 마지막 판
    expect(jur.events.some(e => e.type === 'archGate')).toBe(true)
  })
})

describe('오디세이 런 — 스테이지 정의', () => {
  it('스테이지 셋: 섬 · 바다 · 이타카 — 시각이 다르다', () => {
    expect(STAGES.map(s => s.key)).toEqual(['island', 'sea', 'ithaca'])
    // 하늘은 셋이 공유(ken 지시 9/10). 구분은 groundColor·fog·물·바닥으로.
    expect(new Set(STAGES.map(s => s.groundColor)).size).toBe(3)
    expect(new Set(STAGES.map(s => s.fog[0])).size).toBe(3)
    expect(STAGES.map(s => s.water)).toEqual(['sides', 'full', 'none'])
    expect(STAGES[1].ground).toBeNull()          // 바다 = 바닥 트랙 없음
    expect(STAGES[1].boat).toBe(true)            // 바다 = 노 젓는 배 빌보드
    expect(STAGES[0].boat).toBeFalsy()
  })

  it('★ 세 스테이지가 같은 기본 하늘(ODYSSEY_SKY)을 쓴다 + 파일 존재', () => {
    expect(ODYSSEY_SKY).toMatch(/sky.*\.png$/)
    expect(existsSync(asPath(ODYSSEY_SKY)), ODYSSEY_SKY).toBe(true)
  })

  it('레인 장애물이 스테이지마다 다르다 (거인 · 스킬라=드래곤 · 전사상)', () => {
    const lanes = STAGES.map(s => s.lane.url.split('/').pop())
    expect(lanes).toEqual(['giant_odyssey.glb', 'dragon_odyssey.glb', 'statue_warrior.glb'])
  })

  it('Stage 1 배경에 전사상이 없다 — 그건 Stage 3 레인 장애물', () => {
    expect(STAGES[0].props.map(p => p.url).join(' ')).not.toContain('statue_warrior')
    expect(STAGES[2].lane.url).toContain('statue_warrior')
  })

  it('★ 점프 장애물 — 섬=양떼 GLB · 바다=소용돌이 · 이타카=도끼 줄 GLB', () => {
    expect(STAGES[0].jump.kind).toBe('glb')
    expect(STAGES[0].jump.url).toContain('jump_sheep')
    expect(STAGES[1].jump.kind).toBe('whirlpool')
    expect(STAGES[2].jump.kind).toBe('glb')
    expect(STAGES[2].jump.url).toContain('jump_axe')
  })

  it('★ 숙이기 장애물 — 세 스테이지 다 실제 GLB (STEP 86: 접근 복구 후 전부 연결)', () => {
    expect(STAGES[0].crouch.url).toContain('crouch_cyclops')
    expect(STAGES[1].crouch.url).toContain('crouch_poseidon')
    expect(STAGES[2].crouch.url).toContain('crouch_ithaca')
    for (const s of STAGES) expect(existsSync(asPath(s.crouch.url)), s.crouch.url).toBe(true)
  })

  it('★ 자세 팻말 — 스테이지 전용 세트 3개씩, 다른 스테이지 pose가 안 섞인다', () => {
    // 세 스테이지 다 3종 실제 GLB(STEP 86 — poseidon 3종·ithaca_pose_03 포함).
    expect(STAGES[0].pose.every(u => u && u.includes('pose_cyclops'))).toBe(true)
    expect(STAGES[1].pose.every(u => u && u.includes('pose_poseidon'))).toBe(true)
    expect(STAGES[2].pose.every(u => u && u.includes('pose_ithaca'))).toBe(true)
    for (const s of STAGES) {
      expect(s.pose.length).toBe(3)
      for (const u of s.pose) expect(existsSync(asPath(u)), u).toBe(true)
    }
  })

  it('★ 자세 팻말 방향 뒤집기 (poseFlip) — 런지가 캐릭터와 반대라서', () => {
    expect(STAGES[0].poseFlip).toEqual([true, false, false])
    expect(STAGES[2].poseFlip).toEqual([true, false, false])
  })

  it('자세 팻말이 트랙 폭 가까이 크다 (ken: "너무 작다")', () => {
    for (const s of STAGES) expect(s.poseSize).toBeGreaterThanOrEqual(6)
    expect(POSE_BOX.w).toBeGreaterThan(10)   // 도형 폴백도 크게
  })

  it('★ 스테이지가 참조하는 GLB(레인·점프·숙이기·자세·프롭)가 전부 실제로 존재한다', () => {
    for (const s of STAGES) {
      const urls = [s.lane.url, ...s.pose.filter(Boolean), ...s.props.map(p => p.url)]
      if (s.jump.url) urls.push(s.jump.url)
      if (s.crouch) urls.push(s.crouch.url)
      for (const u of new Set(urls)) {
        expect(u).toMatch(/\.glb$/)
        expect(existsSync(asPath(u)), `${s.key}: ${u}`).toBe(true)
      }
    }
  })

  it('★ Finish Gate — 스테이지마다 다른 GLB, 셋 다 실제로 존재한다 (STEP 86)', () => {
    // 전엔 세 스테이지가 gate.glb 하나를 공유했다 — ken 지시로 스테이지별
    // 실제 asset(51/59/20파트 키트배시)으로 갈렸다. `stages.js`는 이제
    // `finishGate`를 갖고(경로 아닌 이름+하위폴더), `STAGES[i].gate`는 없다.
    const names = STAGES.map(s => s.finishGate.name)
    expect(names).toEqual(['gate_cyclops', 'gate_poseidon', 'gate_ithaca'])
    expect(new Set(names).size).toBe(3)   // 셋 다 달라야 한다
    for (const s of STAGES) {
      expect(s.gate).toBeUndefined()
      const p = `public/assets/runner3d/${s.finishGate.subdir}/${s.finishGate.name}.glb`
      expect(existsSync(p), p).toBe(true)
      // 부품 20~59개 텍스처(석재·금장·banner·삼지창 등)를 살렸다 — 384로
      // 축소 + Draco. 부품이 많아 단일 obstacle GLB보다는 크다 — 3MB 안이면 OK.
      expect(statSync(p).size, `${p} = ${(statSync(p).size / 1048576).toFixed(2)}MB`).toBeLessThan(3 * 1048576)
    }
  })

  it('★ odyssey/ 신규 GLB는 Draco 압축본이다 (장애물 팻말이 안 깎여서) — 각 1.2MB 미만', () => {
    // simplify로 83k삼각형에서 안 내려가는 AI 키트배시라 Draco로 압축했다.
    // 압축이 빠지면 파일이 3MB대로 튀어 에셋 예산이 폭발한다 — 여기서 잡는다.
    // (finish gate는 부품이 훨씬 많은 별도 종류라 위 테스트에서 따로 캡한다.)
    const glbs = STAGES.flatMap(s => [
      ...s.pose, s.jump.url, s.crouch?.url, s.lane.url,
      ...s.props.map(p => p.url),
    ]).filter(u => u && u.includes('/odyssey/') && u.endsWith('.glb'))
    expect(glbs.length).toBeGreaterThan(10)
    for (const u of new Set(glbs)) {
      const bytes = statSync(asPath(u)).size
      expect(bytes, `${u} = ${(bytes / 1048576).toFixed(2)}MB`).toBeLessThan(1.2 * 1048576)
    }
  })

  it('raw 대용량 원본을 안 가리킨다 (최적화본만: _lab/ 또는 odyssey/)', () => {
    for (const s of STAGES) {
      const all = [s.lane.url, ...s.pose, ...s.props.map(p => p.url), s.jump.url, s.crouch?.url].filter(Boolean)
      for (const u of all) expect(u).toMatch(/\/(_lab|odyssey)\//)
    }
  })

  // ★★★ STEP 88 — Finish Gate mesh 깨짐의 진짜 원인 재발 방지 ★★★
  // `optimize.mjs`의 `fitHeight`가 51~59개 부품(`tripo_part_N`, 각자 다른
  // 노드 translation)의 **정점 좌표만** 전역 bbox 기준으로 재배치하고
  // **노드 transform은 그대로 남겨 뒀다** — 그러면 런타임(`models.js`
  // `loadMeshGroup`이 굽는 `node.matrixWorld`)이 이미 재배치된 정점에
  // 원래 노드 이동을 **한 번 더** 얹어 부품끼리 서로 침범·이탈했다(ken
  // 실플레이 스크린샷으로 확인, 브라우저 A/B 렌더로 fitHeight 앞뒤를
  // 대조해 원인을 좁혔다 — lockBorder·Draco는 무관했다). 고친 뒤에는
  // fitHeight가 노드 transform을 정점에 구워 넣고 노드를 identity로
  // 되돌리므로, 최종 GLB의 모든 노드는 identity여야 한다 — 이 값이
  // 다시 non-identity로 돌아오면 조립이 깨진다는 뜻이다.
  it('★ Finish Gate 3종 — fitHeight가 노드 transform을 정점에 구워 넣어 전부 identity다 (mesh 깨짐 재발 방지)', async () => {
    const { NodeIO } = await import('@gltf-transform/core')
    const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
    const draco3d = (await import('draco3dgltf')).default
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    io.registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
    for (const s of STAGES) {
      const p = `public/assets/runner3d/${s.finishGate.subdir}/${s.finishGate.name}.glb`
      const doc = await io.read(p)
      const nodesWithMesh = doc.getRoot().listNodes().filter(n => n.getMesh())
      expect(nodesWithMesh.length, `${p}: 부품 노드 수`).toBeGreaterThan(10)
      for (const node of nodesWithMesh) {
        expect(node.getTranslation(), `${p} / ${node.getName()} translation`).toEqual([0, 0, 0])
        expect(node.getScale(), `${p} / ${node.getName()} scale`).toEqual([1, 1, 1])
        expect(node.getRotation(), `${p} / ${node.getName()} rotation`).toEqual([0, 0, 0, 1])
      }
    }
  })
})

describe('오디세이 런 — 스토리 (sequence 문서 기준)', () => {
  const sceneBeats = () => STORY.beats.filter(b => b.scenes)
  const allScenes = () => [
    ...STORY.intro.scenes,
    ...sceneBeats().flatMap(b => b.scenes),
    ...STORY.finish.scenes,
  ]

  it('인트로 8컷 (Scene 01~08) + 전환 2 (09~13, 14~15) + 마지막', () => {
    expect(STORY.intro.scenes.length).toBe(8)
    expect(sceneBeats().map(b => b.afterLevel)).toEqual([2, 4])
    expect(sceneBeats()[0].scenes.length).toBe(5)   // scene 09~13
    expect(sceneBeats()[1].scenes.length).toBe(2)   // scene 14~15
    expect(STORY.finish.scenes.length).toBeGreaterThan(0)
  })

  it('전환 컷은 스테이지 마지막 판 뒤에 온다 (Lv2·Lv4 완료)', () => {
    for (const b of sceneBeats()) expect(isStageFinale(b.afterLevel - 1)).toBe(true)
  })

  it('★ 스테이지마다 REST 비트 — Lv1(키클롭스)·Lv3(포세이돈)·Lv5(이타카) 안', () => {
    // REST는 스테이지 "안"(같은 스테이지 두 레벨 사이)에서만 — 스테이지 경계
    // (af=2·4)는 이미 전환 스토리가 있다.
    const restAfter = STORY.beats.filter(b => b.rest).map(b => b.afterLevel)
    expect(restAfter).toEqual([1, 3, 5])
    for (const af of [1, 3, 5]) {
      expect(isStageFinale(af - 1), `af=${af}는 스테이지 경계가 아니어야`).toBe(false)
    }
  })

  it('★ REST 비트 — 스테이지 전용 배경 실제 연결 (STEP 86: rest_cyclops/poseidon/ithaca)', () => {
    const expectedBg = { 1: 'rest_cyclops', 3: 'rest_poseidon', 5: 'rest_ithaca' }
    for (const af of [1, 3, 5]) {
      const beat = STORY.beats.find(b => b.afterLevel === af)
      const rest = beat.rest
      expect(rest, `afterLevel:${af} rest`).toBeTruthy()
      expect(rest.seconds).toBe(20)   // 세 스테이지 공통 20초 정책(STEP 89, 대화 포함 전체 휴식시간)
      expect(rest.before.length).toBeGreaterThan(0)
      expect(rest.after.length).toBeGreaterThan(0)
      for (const l of [...rest.before, ...rest.after]) {
        expect(l.speaker, JSON.stringify(l)).toBeTruthy()
        expect(l.text, JSON.stringify(l)).toBeTruthy()   // 대사 텍스트 비어있으면 안 됨
        expect(l.text.trim().length, JSON.stringify(l)).toBeGreaterThan(0)
        expect(STORY.cast[l.speaker], `cast.${l.speaker}`).toBeTruthy()
      }
      // 전용 REST 배경 — 실제 파일로 연결(showRestBeat가 mount()처럼 미리
      // 받아 두고 보여준다). 게임 화면 오버레이가 아니라 이 그림이 깔린다.
      expect(rest.bg, `afterLevel:${af} rest.bg`).toContain(expectedBg[af])
      expect(existsSync(asPath(rest.bg)), rest.bg).toBe(true)
      expect(beat.scenes).toBeUndefined()
    }
  })

  it('★ 키클롭스 REST에 ken 지정 최소 필수 대사가 실제로 들어있다', () => {
    const rest = STORY.beats.find(b => b.afterLevel === 1).rest
    const all = [...rest.before, ...rest.after]
    expect(all.some(l => l.text.includes('10초만 쉬었다가 바로 출발하자'))).toBe(true)
  })

  it('★ 모든 story/rest 대사 텍스트가 비어있지 않다 (공백 문자열도 금지)', () => {
    const restLines = STORY.beats.filter(b => b.rest).flatMap(b => [...b.rest.before, ...b.rest.after])
    for (const l of [...allScenes().flatMap(sc => sc.lines), ...restLines]) {
      expect(typeof l.text).toBe('string')
      expect(l.text.trim().length, JSON.stringify(l)).toBeGreaterThan(0)
    }
  })

  it('모든 대사 줄에 화자가 있다 — 나레이션(얼굴 없는 줄)을 안 섞는다', () => {
    for (const sc of allScenes()) {
      for (const line of sc.lines) {
        expect(typeof line, sc.bg).toBe('object')
        expect(line.speaker, line.text).toBeTruthy()
      }
    }
  })

  it('모든 화자가 cast에 이름과 함께 등록돼 있다', () => {
    const speakers = new Set()
    for (const sc of allScenes()) for (const l of sc.lines) speakers.add(l.speaker)
    for (const sp of speakers) {
      expect(STORY.cast[sp], `cast.${sp}`).toBeTruthy()
      expect(STORY.cast[sp].name, `cast.${sp}.name`).toBeTruthy()
    }
  })

  it('화자명 "소년"으로 통일 + 소년 portrait 연결 (쥬라기 얼굴 재사용)', () => {
    expect(STORY.cast.player.name).toBe('소년')
    expect(STORY.cast.player.boy.default).toContain('story_face_player_boy')
    expect(existsSync(asPath(STORY.cast.player.boy.default))).toBe(true)
    // 동행은 프로필과 무관하게 소년 — girl 스킨도 같은 얼굴
    expect(STORY.cast.player.girl.default).toBe(STORY.cast.player.boy.default)
  })

  it('오디세우스 portrait가 실제로 연결·존재한다 (대사창 왼쪽 얼굴)', () => {
    expect(STORY.cast.odysseus.default).toMatch(/odysseus_portrait\.webp$/)
    expect(existsSync(asPath(STORY.cast.odysseus.default))).toBe(true)
  })

  it('★ 인트로·전환 배경은 scene01~15.webp — 실제로 존재한다', () => {
    for (const sc of [...STORY.intro.scenes, ...sceneBeats().flatMap(b => b.scenes)]) {
      expect(sc.bg, sc.bg).toMatch(/\/odyssey\/story\/scene(0[1-9]|1[0-5])\.webp$/)
      expect(existsSync(asPath(sc.bg)), sc.bg).toBe(true)
    }
  })

  it('★ 엔딩(finish) 배경은 scene18·19.webp — 가족 상봉·작별, 실제로 존재한다 (STEP 92)', () => {
    for (const sc of STORY.finish.scenes) {
      expect(sc.bg, sc.bg).toMatch(/\/odyssey\/story\/scene(18|19)\.webp$/)
      expect(existsSync(asPath(sc.bg)), sc.bg).toBe(true)
    }
    // 둘 다 실제로 쓰였는지 — 하나만 있고 나머지가 빠지면 안 된다.
    expect(STORY.finish.scenes.map(sc => sc.bg).some(bg => bg.includes('scene18'))).toBe(true)
    expect(STORY.finish.scenes.map(sc => sc.bg).some(bg => bg.includes('scene19'))).toBe(true)
  })

  it('Scene 16·17(활 시험) 원본은 보존(미사용) — 화살 미니게임 범위라 이번(STEP 92)도 제외', () => {
    // img_scene16·17은 활 시험(Hidden Stage) 컷이라 어떤 활성 흐름에도 안 들어간다.
    for (const sc of allScenes()) {
      expect(sc.bg).not.toMatch(/scene1[67]\./)
    }
    expect(NEEDS_ART.some(n => /scene16-17/.test(n.slot))).toBe(true)
  })

  it('★ 타이틀·홈 이미지가 실제 신규 asset이다 (STEP 86 — odyssey_intro/thumbnail.png)', () => {
    // 스토리컷(scene01~15) 재사용 아님 — 전용 인트로/썸네일 그림.
    expect(manifest.titleBg).toContain('/ui/intro.webp')
    expect(manifest.thumbnail).toContain('/ui/thumbnail.webp')
    expect(manifest.hero).toBe(manifest.thumbnail)   // 쥬라기 manifest 관례(thumbnail===hero)
    for (const p of [manifest.titleBg, manifest.thumbnail, manifest.hero]) {
      expect(existsSync(asPath(p)), p).toBe(true)
    }
  })

  it('★ Intro 시작/속도 버튼 — logo 없는 배경에서 하단으로 내리되 바닥엔 안 붙는다(STEP 88)', () => {
    const css = readFileSync('src/games/runner3d/screens.js', 'utf8')
    // logo가 없을 때만(:has로 한정) 컨테이너를 flex-end로, margin-bottom으로
    // 바닥과 거리를 둔다 — 쥬라기(logo 있음)는 이 규칙에 안 걸린다.
    expect(css).toMatch(/#r3-title:not\(:has\(\.logo\)\) \{ justify-content: flex-end; \}/)
    expect(css).toMatch(/#r3-title:not\(:has\(\.logo\)\) \.r3-title-actions \{ margin-bottom: clamp\(/)
  })

  it('★ 자세/숙이기 힌트 그림 4장 — 변환·배치는 됐으나 UI 삽입 지점은 미정(STEP 86)', () => {
    // ken이 준 poseidon_crouch_hint·pose_hint_01~03은 실제로는 "보트 안에서
    // 캐릭터가 그 동작을 하는" 그림이었다(추상 다이어그램 아님) — 열어서
    // 확인 후 이 프로젝트의 1=lunge/2=forwardbend/3=armsopen 번호 관례로
    // 매핑했다. runner/ui/cues.js의 CUE.pose는 스테이지 공용 아이콘 1장이라
    // 자세별로 바꾸려면 그 공용 모듈을 손대야 한다 — 이번 범위 밖이라
    // 런타임 경로만 준비해 뒀다(아직 아무 화면도 이 파일을 안 읽는다).
    const hints = [
      '/assets/runner3d/odyssey/ui/hint_crouch_poseidon.webp',
      '/assets/runner3d/odyssey/ui/hint_pose_lunge.webp',
      '/assets/runner3d/odyssey/ui/hint_pose_forwardbend.webp',
      '/assets/runner3d/odyssey/ui/hint_pose_armsopen.webp',
    ]
    for (const p of hints) expect(existsSync(asPath(p)), p).toBe(true)
  })

  it('★ 스테이지1→2 전환: 포세이돈(폭풍) 컷이 세이렌 컷보다 먼저 온다 (ken QA — 순서 반대였음)', () => {
    // scene11 실제 그림 = 세이렌(잔잔한 바다, 노래하는 인어), scene12 실제
    // 그림 = 포세이돈 폭풍(번개·삼지창) — 대사와 그림이 뒤바뀌어 있었다.
    const scenes = STORY.beats.find(b => b.afterLevel === 2).scenes
    const poseidonIdx = scenes.findIndex(sc => sc.lines.some(l => l.text.includes('포세이돈')))
    const sirenIdx = scenes.findIndex(sc => sc.lines.some(l => l.text.includes('세이렌')))
    expect(poseidonIdx).toBeGreaterThan(-1)
    expect(sirenIdx).toBeGreaterThan(-1)
    expect(poseidonIdx, '포세이돈 컷이 세이렌보다 먼저').toBeLessThan(sirenIdx)
    // 그림도 실제 내용과 맞게 — 포세이돈 대사는 scene12(폭풍 그림), 세이렌
    // 대사는 scene11(세이렌 그림).
    expect(scenes[poseidonIdx].bg).toMatch(/scene12\.webp$/)
    expect(scenes[sirenIdx].bg).toMatch(/scene11\.webp$/)
  })
})

describe('오디세이 런 — REST 비트 + Skip 정책 ★', () => {
  const play3d = readFileSync('src/games/runner3d/play3d.js', 'utf8')
  const dlg = readFileSync('src/games/runner3d/storyDialogue.js', 'utf8')

  it('showRestBeat — 게임 화면 위 오버레이 (mount/전체화면 그림 안 씀)', () => {
    expect(dlg).toMatch(/export function showRestBeat/)
    const fn = dlg.slice(dlg.indexOf('export function showRestBeat'))
    // 스토리 컷의 mount()를 안 쓴다 — 배경 없는 .r3s 오버레이를 직접 만든다
    expect(fn).not.toMatch(/mount\(app/)
    expect(fn).toMatch(/background: transparent/)
    // 대사창 CSS는 한 벌 재사용
    expect(fn).toMatch(/r3-story-box/)
    expect(fn).toMatch(/r3-story-line/)
    // REST 카운트다운(화면 맨 위 중앙, STEP 89) + 스킵
    expect(fn).toMatch(/REST \$\{masterLeft\}/)
    expect(fn).toMatch(/r3-rest-skip/)
  })

  it('play3d — beat.rest를 스토리 컷 전에 처리, home/title/skip 분기', () => {
    expect(play3d).toMatch(/import \{ showStoryScene, showRestBeat \}/)
    expect(play3d).toMatch(/if \(beat\.rest\) \{/)
    const seg = play3d.slice(play3d.indexOf('if (beat.rest)'), play3d.indexOf('const beatScenes'))
    expect(seg).toMatch(/showRestBeat\(root,/)
    expect(seg).toMatch(/restRes === 'home'/)
    expect(seg).toMatch(/restRes === 'title'/)
  })

  it('★ REST/스토리 중 세계 정지 — started=false가 level++ 직후 (점수·시간·스폰 정지)', () => {
    const noC = play3d.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    // 레벨 완료 블록: level++ 다음 바로 started = false
    expect(noC).toMatch(/level\+\+[\s\S]{0,80}started = false/)
    // 루프는 started가 false면 update를 안 부른다
    expect(noC).toMatch(/if \(!started \|\| over \|\| paused\)/)
  })

  it('★ Skip은 모든 대화창에 항상 있다 — 마지막 컷도 예외 없음(ken: 절대 누락 금지)', () => {
    // 인트로(마지막 장면도 예외 없이 true — 전엔 !isLast로 마지막에서 숨겼음)
    const introSeg = play3d.slice(play3d.indexOf('manifest.story?.intro'), play3d.indexOf('break title'))
    expect(introSeg).toMatch(/skippable: true, startAction: isLast/)
    expect(introSeg).not.toMatch(/skippable: !isLast/)
    // 전환 컷 루프 — 더 이상 마지막 컷에서 숨기지 않는다
    const beatSeg = play3d.slice(play3d.indexOf('const beatScenes'), play3d.indexOf('if (beat.carry)'))
    expect(beatSeg).toMatch(/skippable: true/)
    expect(beatSeg).not.toMatch(/skippable: fIdx < beatScenes\.length - 1/)
    expect(beatSeg).toMatch(/result === 'skip'/)
    // 피니시 스토리 루프
    const finSeg = play3d.slice(play3d.indexOf('manifest.story.finish'))
    expect(finSeg).toMatch(/skippable: true/)
    expect(finSeg).not.toMatch(/skippable: k < scenes\.length - 1/)
    expect(finSeg).toMatch(/res === 'skip'/)
    // REST는 애초에 스킵 버튼이 조건 없이 마크업에 항상 박혀 있다(storyDialogue.js)
    expect(dlg.slice(dlg.indexOf('export function showRestBeat'))).toMatch(/id="r3-rest-skip"/)
  })

  it('★ 모든 대화창(스토리 컷·REST)에 [이전][다음][스킵]이 항상 같이 있다 (ken 정책 통일, STEP 88)', () => {
    // showStoryScene — 인트로/전환/피니시 전부 이 마크업 하나를 공유한다.
    const storySeg = dlg.slice(dlg.indexOf('export function showStoryScene'), dlg.indexOf('export function showRestBeat'))
    expect(storySeg).toMatch(/id="r3-story-prev"/)
    expect(storySeg).toMatch(/id="r3-story-next"/)
    expect(storySeg).toMatch(/\$\{skippable \? `/)   // 스킵은 항상 켜져 있다(위 테스트가 skippable:true 확인)

    // showRestBeat — STEP 87이 "다음"을 "이전"으로 바꿔버렸던 것을 되돌려,
    // 이전+다음+스킵 셋이 항상 같이 뜬다(마지막 대사에서 "다음" → 정상 완료).
    const restSeg = dlg.slice(dlg.indexOf('export function showRestBeat'))
    expect(restSeg).toMatch(/id="r3-rest-prev"/)
    expect(restSeg).toMatch(/id="r3-rest-next"/)
    expect(restSeg).toMatch(/id="r3-rest-skip"/)
    // 첫 줄에서 이전은 disabled, 카운트다운 중엔 이전·다음 둘 다 hidden(스킵은 안 숨김)
    expect(restSeg).toMatch(/prevBtn\.disabled = li === 0/)
    expect(restSeg).not.toMatch(/nextBtn\.disabled/)   // 다음은 비활성화하지 않는다(ken: 다음은 늘 눌림)
    expect(restSeg).toMatch(/prevBtn\.hidden = true[\s\S]{0,20}nextBtn\.hidden = true/)
  })

  it('★ 이름·대사 텍스트는 왼쪽 정렬 (.r3s의 center를 덮는다)', () => {
    const css = readFileSync('src/games/runner3d/screens.js', 'utf8')
    const nameBlock = css.slice(css.indexOf('.r3-story-name {'), css.indexOf('.r3-story-name {') + 200)
    const lineBlock = css.slice(css.indexOf('.r3-story-line {'), css.indexOf('.r3-story-line {') + 220)
    expect(nameBlock).toMatch(/text-align:\s*left/)
    expect(lineBlock).toMatch(/text-align:\s*left/)
  })
})

describe('오디세이 런 — Stage 2 폭풍 + 트랙 시각화 ★', () => {
  const scene = readFileSync('src/games/odyssey-run/scene.js', 'utf8')
  const sea = readFileSync('src/games/odyssey-run/sea.js', 'utf8')

  it('Stage 2만 폭풍 — 기본 하늘(ODYSSEY_SKY)은 그대로', () => {
    expect(STAGES[1].weather).toBeTruthy()
    expect(STAGES[0].weather).toBeUndefined()
    expect(STAGES[2].weather).toBeUndefined()
    // sky 텍스처는 안 바꾼다 — weather는 오버레이
    expect(ODYSSEY_SKY).toMatch(/sky.*\.png$/)
  })

  it('sea.js — 비(LineSegments) + 번개 + 어두운 구름 + 부표 + 흰 가이드 라인', () => {
    expect(sea).toMatch(/LineSegments/)          // 비
    expect(sea).toMatch(/AdditiveBlending/)      // 번개(빛)
    expect(sea).toMatch(/createClouds/)          // 어두운 구름
    expect(sea).toMatch(/CylinderGeometry/)      // 부표
    expect(sea).toMatch(/guideTexture/)          // 흰 가이드 라인
    expect(sea).toMatch(/depthWrite: false/)     // 번개는 깊이 안 씀
  })

  it('scene.js — water:full일 때 makeSea, 낡은 로프 박스 제거', () => {
    expect(scene).toMatch(/import \{ makeSea \}/)
    expect(scene).toMatch(/makeSea\(\{ scene, withCurve/)
    expect(scene).not.toMatch(/로프 레인 —/)   // 옛 얇은 박스 주석
  })

  it('Stage 2 트랙 시각화 켜짐 (seaTrack)', () => {
    expect(STAGES[1].seaTrack).toBe(true)
  })

  it('★ 비는 대각으로 흐른다(바람) — 수직 낙하만이 아니다', () => {
    expect(sea).toMatch(/WIND_X/)
    // 낙하(y)뿐 아니라 옆으로도(x) 매 프레임 밀린다
    expect(sea).toMatch(/arr\[bi\] \+= drift/)
  })

  it('★ 번개가 더 진하게(불투명 흰색) + 더 자주 친다', () => {
    expect(sea).toMatch(/color: '#ffffff', transparent: true, opacity: 1,/)
    // 3~7초 주기(전엔 5~12초)
    expect(sea).toMatch(/lightningWait = 3 \+ Math\.random\(\) \* 4/)
  })

  it('★ 포세이돈 하늘·안개가 STEP 84보다 더 어둡다 (폭풍 강화)', () => {
    expect(STAGES[1].fog[0]).toBe('#16293c')
    expect(scene).toMatch(/cfg\.weather \? '#131f2d'/)
  })
})

describe('오디세이 런 — poseFlip (자세 팻말 방향) ★', () => {
  const scene = readFileSync('src/games/odyssey-run/scene.js', 'utf8')

  it('scene.js swap이 flip 시 geo.scale(-1,1,1) — 원본 실루엣이 반대 방향', () => {
    expect(scene).toMatch(/if \(flip\) geo\.scale\(-1, 1, 1\)/)
    expect(scene).toMatch(/cfg\.poseFlip\?\.\[i\] === true/)
  })
})

describe('오디세이 런 — 배 점프 회피 모션 보간 ★', () => {
  const boat = readFileSync('src/games/odyssey-run/boat.js', 'utf8')
  const character = readFileSync('src/games/runner3d/character.js', 'utf8')
  const scene = readFileSync('src/games/odyssey-run/scene.js', 'utf8')

  it('character.js가 연속값 jumpOffset을 내준다 (jumping 불리언과 별개)', () => {
    expect(character).toMatch(/get jumpOffset\(\) \{ return jumpY\(\) \}/)
  })

  it('boat.js가 jumping 스냅 대신 jumpOffset 포물선을 따라간다 (ken QA: 점프 모션이 끊김)', () => {
    expect(boat).not.toMatch(/jumping \? 1\.4 : 0/)
    expect(boat).toMatch(/jumpOffset \/ CHAR\.jumpHeight\) \* HOP_H/)
  })

  it('scene.js가 character.jumpOffset을 넘긴다 (jumping 아님)', () => {
    expect(scene).toMatch(/boat\.update\(now, character\.mesh\.position\.x, character\.jumpOffset, action, mirror\)/)
  })

  it('★ 배 빌보드 — 숙이기·자세 성공 시 동작 그림으로 전환 (ken QA — STEP 87)', () => {
    // scene.js: ducking/posing을 boat.update의 4번째 인자로 넘긴다.
    expect(scene).toMatch(/character\.ducking \? 'crouch' : character\.posing/)
    // boat.js: 동작마다 실제 이미지가 있고, 없으면(action 없음) 기본 노젓기로.
    const boat2 = readFileSync('src/games/odyssey-run/boat.js', 'utf8')
    for (const key of ['crouch', 'lunge', 'forwardbend', 'armsopen']) {
      expect(boat2, key).toMatch(new RegExp(`${key}: '/assets/runner3d/odyssey/ui/hint_`))
    }
    expect(boat2).toMatch(/showRow\(\)/)
  })

  // ★★★ STEP 90 — Poseidon 자세 방향 동기화 ★★★
  // ken QA: "포즈 장애물은 좌우 반전되는데 배 위 소년/오디세우스는 그대로라
  // 서로 반대 방향으로 보인다." Poseidon(Lv3·Lv4)엔 lunge·forwardbend
  // 사인판이 있고(`course.js`의 `MIRROR_POSES`), 이 둘만 사이클마다
  // 번갈아 좌우로 뒤집힌다(armsopen은 좌우대칭이라 대상 아님) — 이게 ken이
  // 말한 "2곳"이다. 장애물 mesh는 `e.mirror`로 뒤집히는데(`scene.js`
  // `rec.obj.scale.set(e.mirror ? -1 : 1, 1, 1)`), 배 빌보드는 이 값을
  // 아예 안 받고 있었다. 고친 방식은 **새 계산을 추가하지 않는 것** —
  // `character.setPose(p, mirror)`가 이미 그 사인판의 mirror를 받아서
  // `poseMirror`로 들고 있으므로(러닝 캐릭터 자신도 이 값으로 뒤집는다,
  // `character.js` `apply()`), 그 값을 그대로 읽어 배에도 옮긴다 —
  // 장애물·(숨겨진) 캐릭터·배 셋이 전부 같은 source of truth를 쓴다.
  it('★ Poseidon 자세 방향 동기화 — 장애물이 뒤집히면 배 위 캐릭터 그림도 같은 값(character.poseMirror)으로 뒤집힌다', () => {
    // character.js: setPose가 받은 mirror를 그대로 내주는 getter가 있다
    // (새 계산 없음 — 사인판 판정에 이미 쓰던 값을 재사용).
    expect(character).toMatch(/get poseMirror\(\) \{ return poseMirror \}/)
    // scene.js: 그 값을 boat.update의 5번째 인자로 넘긴다 — posing이 없을
    // 땐(크로치 등, 좌우 대칭) mirror를 강제로 false로 둔다.
    expect(scene).toMatch(/const mirror = character\.posing \? character\.poseMirror : false/)
    // boat.js: mirror에 따라 배 빌보드의 scale.x 부호만 바꾼다(CSS
    // scaleX(-1)과 같은 효과) — 새 이미지·복제 없이 기존 텍스처를 그대로 뒤집는다.
    const boat2 = readFileSync('src/games/odyssey-run/boat.js', 'utf8')
    expect(boat2).toMatch(/mesh\.scale\.x = mirror \? -s : s/)
    // 같은 자세(key)가 반복돼도 mirror가 바뀌면 다시 그려야 한다 —
    // `shown === key`만 보고 조기 반환하면 방향 전환을 놓친다.
    expect(boat2).toMatch(/if \(shown === key && shownMirror === mirror\) return/)
  })
})

describe('오디세이 런 — 스테이지 전환 순서 ★', () => {
  const play3d = readFileSync('src/games/runner3d/play3d.js', 'utf8')
  const noComments = s => s.split('\n')
    .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')

  it('레벨 완료 → 스토리 → 다음 스테이지 화면 (setLevel이 스토리 뒤)', () => {
    const src = noComments(play3d)
    expect(src).not.toMatch(/level\+\+\s*view\.setLevel\(level\)/)
    // setLevel 직후 같은 블록에서 started=true (사이에 passing 리셋만 있다)
    expect(src).toMatch(/view\.setLevel\(level\)\s*(passing = false\s*)?started = true/)
  })

  it('★ passThrough는 마지막 레벨에서만 finish 한다 (스테이지 경계는 레벨 완료로)', () => {
    const src = noComments(play3d)
    // archGate → passThrough. passThrough 안에서 finish는 level >= LEVELS - 1 가드.
    expect(src).toMatch(/function passThrough\(\)/)
    expect(src).toMatch(/if \(level >= LEVELS - 1\) \{/)
    expect(src).toMatch(/setTimeout\(\(\) => \{ if \(!left && !over\) finish\(true\) \}, PASS_MS\)/)
    // 스테이지 전환에서 passing 가드가 안 풀리면 두 번째 관문이 안 걸린다
    expect(src).toMatch(/passing = false/)
  })
})

describe('오디세이 런 — Finish Gate lifecycle ★', () => {
  const scene = readFileSync('src/games/odyssey-run/scene.js', 'utf8')
  const portal = readFileSync('src/games/runner3d/portal.js', 'utf8')

  it('정식 결승 포털(runner3d/portal.js)을 재사용한다 — 새 finish 시스템 안 만든다', () => {
    expect(scene).toMatch(/import \{ createPortal \} from '\.\.\/runner3d\/portal\.js'/)
    expect(scene).toMatch(/createPortal\(withCurve, kUniform/)
  })

  it('archGate 이벤트를 스테이지 경계마다 넣는다 (courseOpts.archGate = isStageFinale)', () => {
    expect(scene).toMatch(/archGate: isStageFinale/)
  })

  it('포털 자리·funnel을 쥬라기 scene.js와 같은 방식으로 준다', () => {
    expect(scene).toMatch(/course\.events\.find\(e => e\.type === 'archGate'\)/)
    expect(scene).toMatch(/stage\.portal\.place\(/)
    expect(scene).toMatch(/stage\.portal\.active = !!gateEvent/)
    expect(scene).toMatch(/gz > -PORTAL_FUNNEL/)
  })

  it('★ 포털은 스테이지 소유 — 스테이지마다 다른 관문 GLB(STEP 86)', () => {
    // 전엔 씬 레벨 싱글턴(세 스테이지 공유)이었다. 이제 buildStage 안에서
    // cfg.finishGate로 만들고 stage.portal로 내주며, 스테이지 dispose에서
    // 같이 정리된다(스테이지 전용 GLB라 스테이지 수명과 같이 가야 한다).
    expect(scene).toMatch(/shell: \{ name: cfg\.finishGate\.name, subdir: cfg\.finishGate\.subdir, group: true \}/)
    expect(scene).toMatch(/disposers\.push\(\(\) => portal\.dispose\(\)\)/)
    expect(scene).toMatch(/added\.push\(portal\.group\)/)
    expect(scene).toMatch(/portal,\n/)   // buildStage가 반환하는 stage 객체에 portal 포함
  })

  it('portal.js는 껍데기·문·불을 파라미터로 받되 기본값은 쥬라기 그대로 (하위호환)', () => {
    expect(portal).toMatch(/shell: shellCfg = \{ name: 'finish_portal', subdir: 'obstacles' \}/)
    expect(portal).toMatch(/fire: fireCfg = FIRE/)
    // fire를 null로 주면 탑 불꽃을 안 만든다
    expect(portal).toMatch(/if \(fireCfg\) \{/)
  })

  it('★ completion은 정확히 1회 — passThrough(passing) + finish(over) 이중 가드', () => {
    const play = readFileSync('src/games/runner3d/play3d.js', 'utf8')
    // passThrough: 이미 지났으면 아무것도 안 한다
    expect(play).toMatch(/function passThrough\(\)\s*\{\s*if \(passing \|\| over\) return/)
    // finish: 이미 끝났으면 아무것도 안 한다
    expect(play).toMatch(/function finish\(cleared\)\s*\{\s*if \(over\) return\s*over = true/)
    // 마지막 레벨만 여기서 finish (스테이지 경계는 루프의 now>=duration이 레벨 완료)
    expect(play).toMatch(/if \(level >= LEVELS - 1\) \{[\s\S]*?setTimeout\([\s\S]*?finish\(true\)[\s\S]*?PASS_MS\)/)
    // 통과 연출 중 나가면 안 끝낸다
    expect(play).toMatch(/if \(!left && !over\) finish\(true\)/)
  })

  it('★ 스테이지 전환 뒤 passing 가드를 풀어야 다음 관문이 걸린다', () => {
    const play = readFileSync('src/games/runner3d/play3d.js', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(play).toMatch(/view\.setLevel\(level\)\s*passing = false\s*started = true/)
  })

  it('★ 늦게 오는 껍데기 GLB 콜백이 dispose된 포털을 오염시키지 않는다', () => {
    // portal.js: disposed 플래그 + isAborted → 받은 지오메트리만 버리고 리턴
    expect(portal).toMatch(/let disposed = false/)
    expect(portal).toMatch(/const gone = \(\) => disposed \|\| isAborted\(\)/)
    expect(portal).toMatch(/if \(gone\(\)\) \{ g\.dispose\?\.\(\); return \}/)
    expect(portal).toMatch(/dispose\(\)\s*\{\s*disposed = true/)
    // 씬은 aborted를 넘긴다
    expect(scene).toMatch(/isAborted: \(\) => aborted/)
  })

  it('★ 스테이지 장애물 late 콜백도 stageGone/aborted로 막힌다 (기존 가드 유지)', () => {
    expect(scene).toMatch(/let stageGone = false/)
    expect(scene).toMatch(/isAborted: \(\) => aborted \|\| stageGone/)
    // dispose가 stageGone을 세운다
    expect(scene).toMatch(/stageGone = true/)
  })

  // ★★★ STEP 88 BLOCKER — Ithaca(마지막 레벨)가 Finish Gate를 실제로
  // 통과하기 전에 Result 화면이 먼저 떴다(ken 실플레이). 원인: STEP 87이
  // 스테이지 경계용 `duration` 안전망을 3초 → 0.9초로 줄였는데, 그 값이
  // `passThrough()`의 `PASS_MS`(900ms) `setTimeout`과 실시간으로 거의
  // 같아져서 — `requestAnimationFrame` 루프의 duration 체크와 지연될 수
  // 있는 `setTimeout`이 **경쟁**하게 됐다. 브라우저가 setTimeout을 조금만
  // 늦게 돌려도(백그라운드 tab throttle·GC 등) duration 체크가 먼저 이겨
  // `finish(true)`를 곧장 불러 통과 연출 없이 Result로 튀었다.
  //
  // 고친 방식은 "duration 값을 다시 조정"이 아니라 **경로를 하나로
  // 합친 것**이다 — 마지막 레벨의 duration 안전망도 `finish(true)`를
  // 직접 안 부르고 `passThrough()`를 부른다. `passThrough()`는 `passing`
  // 가드로 멱등해서, 정상 판정이 이미 지나갔으면 조용히 무시되고, 혹시
  // 안 지나갔을 때만 그제야 정식 통과 연출(폭죽 → PASS_MS → finish)을
  // 시작한다 — 어느 경로가 이기든 Result 진입은 항상 passThrough를 거친다.
  it('★ final Ithaca level does not show Result before finish gate pass — duration 안전망도 passThrough()를 거친다', () => {
    const play = readFileSync('src/games/runner3d/play3d.js', 'utf8')
    const durationIdx = play.indexOf('if (view.now >= view.course.duration)')
    // "raf = requestAnimationFrame(loop)"는 loop() 안(재귀 예약)에도 있고
    // loop 정의가 끝난 뒤(최초 시작)에도 있다 — durationIdx **뒤에서** 찾아야
    // loop()의 끝(=마지막 레벨 분기가 끝나는 자리)을 잡는다.
    const loopEndIdx = play.indexOf('raf = requestAnimationFrame(loop)', durationIdx)
    const loopSeg = play.slice(durationIdx, loopEndIdx)
    // 레벨 완료 분기(level < LEVELS-1)와 마지막 레벨 분기(else)를 가른다.
    const elseSeg = loopSeg.slice(loopSeg.lastIndexOf('} else {'))
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(elseSeg.trim().length, 'else 분기를 못 찾았다').toBeGreaterThan(0)
    expect(elseSeg).toMatch(/passThrough\(\)/)
    expect(elseSeg).not.toMatch(/finish\(true\)/)
  })

  it('★ Result appears only after final finish gate pass — finish(true) 직접 호출 경로가 단 하나(passThrough의 PASS_MS 타이머)뿐이다', () => {
    const play = readFileSync('src/games/runner3d/play3d.js', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    const calls = [...play.matchAll(/finish\(true\)/g)]
    expect(calls.length, '코드 안 finish(true) 호출 개수').toBe(1)
    // 그 하나가 정말 passThrough()의 PASS_MS setTimeout 안인지 확인
    expect(play).toMatch(/setTimeout\(\(\) => \{ if \(!left && !over\) finish\(true\) \}, PASS_MS\)/)
  })

  it('Stage1/Stage2 완료 흐름(레벨 완료 배너 → 전환 스토리 → 다음 스테이지)은 회귀 없음', () => {
    const play = readFileSync('src/games/runner3d/play3d.js', 'utf8')
    // level < LEVELS-1 분기는 그대로 showCue → 스토리 → setLevel 순서
    const startIdx = play.indexOf('if (level < LEVELS - 1) {')
    const ifSeg = play.slice(startIdx, play.indexOf('} else {', startIdx))
    expect(ifSeg).toMatch(/showCue\(root, levelCompleteAsset\(cleared\), 1200\)/)
    expect(ifSeg).toMatch(/view\.setLevel\(level\)/)
    expect(ifSeg).not.toMatch(/passThrough\(\)/)   // 이 분기는 여전히 duration만으로 레벨을 넘긴다
  })

  // ── STEP 89 — Ithaca(Lv6) 조기 종료 실사용 재현 ★ ─────────────
  // 실제로 Claude in Chrome + `requestAnimationFrame`을 수동으로 돌리는
  // 임시 디버그 훅으로 Lv1→Lv6를 전부 실행해 봤다(테스트가 아니라 라이브
  // 실행 추적). 결과: 정식 archGate → passThrough 경로(Lv2·Lv4·Lv6 전부)는
  // **완벽하게 정상 동작**했다 — Result는 항상 passThrough 이후에만 떴다.
  // 재현된 "Finish Gate 전에 게임이 끝난다"는 증상은 `finish(false)`
  // (목숨 소진에 의한 정식 게임오버)였다: Lv1~Lv6가 **하나의 공유 목숨
  // 풀**(기본 5개, 레벨마다 안 채워짐)을 쓰는데, Lv6가 가장 길고(3사이클)
  // 가장 빠른(speed 1.85) 레벨이라 소진 위험이 제일 크고, "매우 빠르게"
  // (2.5배속) 설정에서 특히 두드러졌다 — "보통" 배속으로는 Lv1~3 목숨
  // 100% 유지로 재현됐다. 즉 완료 흐름 자체엔 버그가 없었다 — 아래
  // 테스트들은 ken이 요청한 정확한 이름으로, 그 구조적 보증을 고정한다.
  it('Ithaca Lv6 remains active until finish gate pass — over/passing이 오직 passThrough 경로로만 세워진다', () => {
    const play = readFileSync('src/games/runner3d/play3d.js', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    // `over = true`를 대입하는 곳은 finish() 안 단 한 곳뿐이다 — 다른 어떤
    // 코드 경로도 직접 `over`를 세워 루프를 멈추지 않는다.
    const overAssigns = [...play.matchAll(/\bover = true/g)]
    expect(overAssigns.length, '`over = true` 대입 개수').toBe(1)
    // `passing = true`도 passThrough() 안 한 곳뿐이다.
    const passingAssigns = [...play.matchAll(/\bpassing = true/g)]
    expect(passingAssigns.length, '`passing = true` 대입 개수').toBe(1)
  })

  it('finish gate is spawned after final course segment — Lv6의 archGate도 마지막 실장애물 뒤에 온다', () => {
    const c = buildCourse3d(5, 1, { levels: ODYSSEY_LEVELS, archGate: isStageFinale })   // Lv6 (index 5)
    const gate = c.events.find(e => e.type === 'archGate')
    const lastObstacle = c.events.filter(e => e.type !== 'archGate').at(-1)
    expect(gate, 'Lv6엔 archGate가 있어야 한다').toBeTruthy()
    expect(gate.hitTime).toBeGreaterThan(lastObstacle.hitTime)
    expect(c.duration).toBeGreaterThan(gate.hitTime)
  })

  it('passThrough triggers completion only once — passing/over 이중 가드로 재호출은 조용히 무시된다', () => {
    const play = readFileSync('src/games/runner3d/play3d.js', 'utf8')
    expect(play).toMatch(/function passThrough\(\)\s*\{\s*if \(passing \|\| over\) return/)
  })

  it('replay does not reuse previous completion state — "다시 하기"가 location.reload()라 모듈 상태가 안 남는다', () => {
    const play = readFileSync('src/games/runner3d/play3d.js', 'utf8')
    // over_() 결과 화면의 "다시 하기"도, 시스템 바 나가기의 restartGame도
    // 전부 전체 새로고침이다 — over/passing/level 같은 클로저 변수는
    // 다음 판에서 전부 새로 만들어진다(메모리에 남는 상태가 없다).
    expect(play).toMatch(/const restartGame = \(\) => location\.reload\(\)/)
    expect(play).toMatch(/onAgain: \(\) => location\.reload\(\)/)
  })
})

describe('오디세이 런 — preload / 중복 fetch 방지 ★', () => {
  const models = readFileSync('src/games/runner3d/models.js', 'utf8')
  const scene = readFileSync('src/games/odyssey-run/scene.js', 'utf8')
  const play = readFileSync('src/games/runner3d/play3d.js', 'utf8')

  it('warmGlb는 GLTFLoader를 안 거친다 — 파싱·Draco 디코드 중복 없음', () => {
    // 바이트만 받는다: bare FileLoader, arraybuffer
    expect(models).toMatch(/warmLoader = new THREE\.FileLoader\(\)/)
    expect(models).toMatch(/setResponseType\('arraybuffer'\)/)
    // getLoader(GLTFLoader)를 안 부른다
    const start = models.indexOf('export function warmGlb')
    const warm = models.slice(start, models.indexOf('\n}', start) + 2)
    expect(warm).not.toMatch(/getLoader\(\)/)
  })

  it('three 내장 URL 캐시를 켠다 (모듈 로드 시, 새 캐시 프레임워크 아님)', () => {
    expect(models).toMatch(/THREE\.Cache\.enabled = true/)
  })

  it('warmGlb는 이미 캐시에 있으면 건너뛴다 (file: 키)', () => {
    expect(models).toMatch(/warmed\.has\(url\) \|\| THREE\.Cache\.get\(`file:\$\{url\}`\)/)
  })

  it('preloadStage는 장애물 GLB만 당긴다 (배경 프롭 제외 = critical만)', () => {
    const fn = scene.slice(scene.indexOf('preloadStage('), scene.indexOf('headScreen()'))
    expect(fn).toMatch(/cfg\.lane\.url/)
    expect(fn).toMatch(/\.\.\.cfg\.pose/)
    expect(fn).toMatch(/cfg\.jump\.url/)
    expect(fn).toMatch(/cfg\.crouch/)
    expect(fn).not.toMatch(/cfg\.props/)   // 프롭은 안 당긴다
    // 스테이지가 안 바뀌면 아무것도 안 한다
    expect(fn).toMatch(/if \(s === curStage\) return/)
  })

  it('play3d는 전환 스토리 직전에 preloadStage를 부른다 (setLevel보다 먼저)', () => {
    const idxPreload = play.indexOf('view.preloadStage?.(level)')
    const idxCue = play.indexOf('showCue(root, levelCompleteAsset(cleared)')
    const idxSetLevel = play.indexOf('view.setLevel(level)\n')
    expect(idxPreload).toBeGreaterThan(-1)
    expect(idxPreload).toBeLessThan(idxCue)          // 배너 앞
    expect(idxPreload).toBeLessThan(idxSetLevel)     // setLevel 앞
  })
})

describe('오디세이 런 — Supabase 미설정 가드 ★', () => {
  it('URL이 placeholder면 네트워크를 안 친다', () => {
    const gr = readFileSync('src/core/gameResult.js', 'utf8')
    expect(gr).toMatch(/isSupabaseConfigured/)
    expect(gr).toMatch(/SUPABASE_NOT_CONFIGURED/)
    const sb = readFileSync('src/core/supabase.js', 'utf8')
    expect(sb).toMatch(/example\.supabase\.co/)
    for (const f of ['src/core/resultQueue.js', 'src/games/runner/stats.js']) {
      expect(readFileSync(f, 'utf8')).toMatch(/SUPABASE_NOT_CONFIGURED/)
    }
  })
})

describe('오디세이 런 — 게임팩 배선', () => {
  it('manifest.metrics는 전부 운동 사전에 있다', () => {
    for (const k of manifest.metrics) expect(getExercise(k), k).toBeTruthy()
  })

  it('play.js가 story를 config 모듈에서 합친다 — manifest.json엔 story가 없다', () => {
    expect(manifest.story).toBeUndefined()
    const play = readFileSync('src/games/odyssey-run/play.js', 'utf8')
    expect(play).toContain("import { STORY } from './story.js'")
    expect(play).toMatch(/makeRunner3dPlay\(\{\s*\.\.\.manifest,\s*story: STORY\s*\}/)
  })

  it('씬·스테이지 파일이 raw 대용량 GLB를 안 가리킨다', () => {
    const scene = readFileSync('src/games/odyssey-run/scene.js', 'utf8')
    const stages = readFileSync('src/games/odyssey-run/stages.js', 'utf8')
    expect(scene + stages).not.toMatch(/playzera-assets/)
  })
})

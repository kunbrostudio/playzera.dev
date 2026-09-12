// 오디세이 런 — **스토리 대사·컷 구성(config).** ★
//
// source of truth: `play_zera_odyssey_run_story_sequence_with_image_names.md`
// (ken 정리, `~/Downloads/`). scene 번호·이미지·대사·화자를 그 문서 그대로 옮겼다.
//
// `play.js`가 이걸 `manifest.story`에 합쳐 엔진(`play3d.js`)에 넘긴다 —
// 스토리를 `play.js`에 하드코딩하지 않는다. 대사창 UI·연출은
// `runner3d/storyDialogue.js` 한 벌을 그대로 쓴다.
//
// ── 컷이 뜨는 자리 (문서 기준) ──────────────────────────────
//
//   intro         Lv1 시작 전            — Scene 01~08 (길 잃음 → 소년 → 키클롭스 섬 → 탈출)
//   beats[af=1]   Lv1 완료(스테이지1 안)  — REST(대사창 오버레이 + 화면 위 20초 카운트다운, scene 없음)
//   beats[af=2]   Lv2 완료(스테이지1 끝)  — Scene 09·10·12(포세이돈)·11(세이렌)·13
//   beats[af=3]   Lv3 완료(스테이지2 안)  — REST
//   beats[af=4]   Lv4 완료(스테이지2 끝)  — Scene 14~15 (이타카 상륙 → 가족을 향해)
//   beats[af=5]   Lv5 완료(스테이지3 안)  — REST
//   finish        Lv6 완료(스테이지3 끝)  — Scene 18·19(가족 상봉 → 작별) → 결과 화면
//
// REST는 스테이지 안(같은 스테이지의 두 레벨 사이)에서만 쓴다 — 스테이지가
// 바뀌는 지점(af=2·4)은 이미 전환 스토리가 있다.
//
// Scene 16·17(활 시험)과 Final Shot 히든 게임은 **화살 미니게임 범위 —
// 이번(STEP 92)도 미사용**. `img_scene16·17.png` 원본은 보존한다 — 나중에
// 화살 미니게임을 붙일 때 `beats`에 끼워 넣으면 된다. Scene 18·19(재회·작별)는
// STEP 92부터 `finish`에 들어가 실제 엔딩으로 쓰인다.
//
// ── 화자 얼굴(portrait) ─────────────────────────────────────
//
//   소년      : 쥬라기 런의 소년 얼굴 재사용(ken 허용). 동행은 프로필과
//               무관하게 항상 "소년"이라(ken) boy/girl 두 스킨 다 같은 그림.
//   오디세우스: `story/odysseus_portrait.webp` — scene03(도움 요청 장면)에서
//               정면 얼굴을 크롭해 만들었다(원본 스타일 그대로, `tools` 없이
//               sharp 크롭 1회). ken이 전용 아트를 주면 이 경로만 교체.
//   키클롭스  : portrait 미확보(액션 컷이라 정면 크롭이 안 나온다) → 이름만.

const IMG = '/assets/runner3d/odyssey/story'
const IMG_UI = '/assets/runner3d/odyssey/ui'   // 인트로·썸네일·REST 배경(STEP 86)
const S = n => `${IMG}/scene${String(n).padStart(2, '0')}.webp`
const BOY_FACE = '/assets/runner/jurassic/image/story_face_player_boy_default.png'
const ODYSSEUS_FACE = `${IMG}/odysseus_portrait.webp`

/** 접근 복구/전달 시 채울 것 — `tools/*` 파이프라인으로 처리. */
export const NEEDS_ART = [
  { slot: 'cyclops_portrait', want: '키클롭스 얼굴 (대사창)', note: '선택 — scene08이 액션 컷이라 정면 크롭 불가, ken 전용 아트 필요' },
  { slot: 'scene16-17', want: '활 시험(Hidden Stage) 컷', note: 'img_scene16·17 원본 있음, 화살 미니게임 범위라 이번(STEP 92)도 미사용' },
]

export const STORY = {
  cast: {
    // 동행 캐릭터 = 플레이어의 대리인(소년). 얼굴은 쥬라기 소년 재사용.
    // storyDialogue의 `faceFor`가 `cast.player[playerSkin()]`로 갈라서 두
    // 스킨을 다 채운다 — 오디세이 동행은 프로필과 무관하게 "소년"이다(ken).
    player: {
      name: '소년',
      boy: { default: BOY_FACE },
      girl: { default: BOY_FACE },
    },
    odysseus: { name: '오디세우스', default: ODYSSEUS_FACE },
    cyclops: { name: '키클롭스' /* portrait 미확보 — 이름만, `NEEDS_ART` */ },
    // 엔딩(scene18·19)의 가족 — 여러 명이 한목소리로 말하는 줄이라 개인
    // 얼굴을 안 쓴다(cyclops와 같은 이유, 이름만). STEP 92.
    family: { name: '가족' },
  },

  // ── 인트로 (Lv1 시작 전) — Scene 01~08 ────────────────────
  intro: {
    scenes: [
      { bg: S(1), lines: [
        { text: '전쟁은 끝났는데… 우리가 어디까지 온 거지?', speaker: 'odysseus' },
        { text: '아무리 찾아도 이타카로 가는 길을 찾을 수가 없어.', speaker: 'odysseus' },
      ] },
      { bg: S(2), lines: [
        { text: '안녕하세요! 오디세우스!', speaker: 'player' },
        { text: '어이쿠! 깜짝이야! 넌 누구니?', speaker: 'odysseus' },
        { text: '전 이 제라 월드를 탐험하는 모험가예요!', speaker: 'player' },
      ] },
      { bg: S(3), lines: [
        { text: '반가운 작은 모험가야! 나를 가족에게 돌아갈 수 있도록 길을 찾아줄래?', speaker: 'odysseus' },
      ] },
      { bg: S(4), lines: [
        { text: '물론이죠! 제가 도와줄게요! 저랑 같이 집으로 돌아갈 길을 찾아봐요.', speaker: 'player' },
        { text: '고맙구나! 작은 모험가!', speaker: 'odysseus' },
      ] },
      { bg: S(5), lines: [
        { text: '작은 모험가야! 저 섬에 가면 길을 찾을 수 있을지도 몰라!', speaker: 'odysseus' },
        { text: '저 섬은 뭔가 불길해요. 안 가는 게 좋을 것 같은데요…', speaker: 'player' },
      ] },
      { bg: S(6), lines: [
        { text: '사실 그게 아니라 내가 너무 배가 고프구나. 며칠 먹질 못했어.', speaker: 'odysseus' },
        { text: '그… 그래요. 어쩔 수 없죠. 함께 가봐요.', speaker: 'player' },
      ] },
      { bg: S(7), lines: [
        { text: '오! 저기 동굴이 보여! 저 안에 먹을 게 있을 것 같아.', speaker: 'odysseus' },
        { text: '아! 저 동굴 안에 뭔가 있는 거 같은데요!!', speaker: 'player' },
      ] },
      { bg: S(8), fx: 'quake', stinger: 'start', lines: [
        { text: '누가 감히! 내 섬에 마음대로 들어와!', speaker: 'cyclops' },
        { text: '으아앗! 외눈박이 거인이다! 도망쳐!', speaker: 'odysseus' },
        { text: '어서 배로 도망가요! 저를 따라오세요!', speaker: 'player' },
      ] },
    ],
  },

  beats: [
    // ── 스테이지 1 안 — Lv1 → Lv2 사이 짧은 휴식(REST) ★ ────────
    // 화면 위 20초 카운트다운(`showRestBeat`, STEP 89) + 전용 REST 배경
    // (STEP 86, `ui/rest_cyclops.webp`). Lv1 완료 배너 뒤에 온다.
    {
      afterLevel: 1,
      rest: {
        seconds: 20,   // REST 전체(대화 포함) 20초 — 세 스테이지 공통 정책(STEP 89)
        bg: `${IMG_UI}/rest_cyclops.webp`,
        before: [
          { text: '헥헥… 힘들어. 이제 괜찮으려나?', speaker: 'odysseus' },
          { text: '하지만 아직 배까지는 시간이 좀 더 필요해요. 잠깐 쉬었다가 다시 출발해요.', speaker: 'player' },
          // ken이 지정한 최소 필수 대사 — 문구 그대로(STEP 84). REST가
          // STEP 89부터 20초로 늘어서 "10초만"이라는 숫자가 실제 시간과
          // 안 맞게 됐다 — 대사 내용은 이전 지시대로 안 건드렸다. ken
          // 확인 후 문구를 "잠깐만"처럼 숫자를 빼는 쪽으로 바꿀지 검토 필요.
          { text: '10초만 쉬었다가 바로 출발하자!', speaker: 'odysseus' },
        ],
        after: [
          { text: '앗! 다시 외눈박이 거인이 쫓아왔어요!', speaker: 'player' },
          { text: '안되겠어! 다시 도망치자!', speaker: 'odysseus' },
        ],
      },
    },

    // ── 스테이지 1 → 2 전환 — Scene 09~13 ────────────────────
    // ★ scene11·12 그림-대사 자리가 바뀌어 있었다(ken QA) — scene11은
    // 실제로 **세이렌**(잔잔한 바다에서 노래하는 인어 둘) 그림이고, scene12가
    // **포세이돈 폭풍**(번개·삼지창) 그림이다. "포세이돈 먼저 → 세이렌 다음"
    // 순서가 되도록 대사와 그림을 바꿔 끼웠다(그림 파일 자체는 안 바꿈).
    {
      afterLevel: 2,
      scenes: [
        { bg: S(9), lines: [
          { text: '헥헥! 큰일 날 뻔했네요.', speaker: 'player' },
          { text: '미안해! 나 때문에…', speaker: 'odysseus' },
        ] },
        { bg: S(10), lines: [
          { text: '괜찮아요! 그럼 다시 집으로 향해 가자구요!', speaker: 'player' },
          { text: '알았어! 작은 모험가!', speaker: 'odysseus' },
        ] },
        { bg: S(12), fx: 'quake', lines: [   // 포세이돈 폭풍 그림 — 먼저
          { text: '이제 더 힘든 여정이 우릴 기다리고 있어요!', speaker: 'player' },
          { text: '포세이돈의 폭풍을 헤치고!!', speaker: 'player' },
        ] },
        { bg: S(11), lines: [                // 세이렌 그림 — 다음
          { text: '세이렌의 노래를 견뎌서!', speaker: 'player' },
        ] },
        { bg: S(13), lines: [
          { text: '스킬라와 카리브디스의 위험을 빠져나가면 오디세우스의 집 이타카로 갈 수 있어요!', speaker: 'player' },
          { text: '그래! 영리한 작은 모험가야! 함께 해줘서 고마워!', speaker: 'odysseus' },
        ] },
      ],
    },

    // ── 스테이지 2 안 — Lv3 → Lv4 사이 짧은 휴식(REST) ★ ────────
    // Cyclops REST와 같은 구조(`showRestBeat` 재사용) — 포세이돈 전용 대사·배경.
    {
      afterLevel: 3,
      rest: {
        seconds: 20,   // REST 전체(대화 포함) 20초 — 세 스테이지 공통 정책(STEP 89)
        bg: `${IMG_UI}/rest_poseidon.webp`,
        before: [
          { text: '파도가 정말 거세군… 잠깐 숨을 고르자.', speaker: 'odysseus' },
          { text: '좋아요! 조금만 쉬면 다시 갈 수 있어요!', speaker: 'player' },
        ],
        after: [
          { text: '오디세우스! 다시 출발할 수 있어요!', speaker: 'player' },
          { text: '좋아! 다시 가보자!', speaker: 'odysseus' },
        ],
      },
    },

    // ── 스테이지 2 → 3 전환 — Scene 14~15 ──────────────────
    {
      afterLevel: 4,
      scenes: [
        { bg: S(14), lines: [
          { text: '자! 이제 도착했어요! 당신이 찾던 이타카예요.', speaker: 'player' },
          { text: '그래! 고마운 작은 모험가야!', speaker: 'odysseus' },
          { text: '네 덕분에 내 사랑하는 고향 이타카에 도착하게 되었어!', speaker: 'odysseus' },
        ] },
        { bg: S(15), fx: 'confetti', lines: [
          { text: '자! 그럼 이제 가족을 만나러 가보자구요!', speaker: 'player' },
          { text: '그래! 사랑하는 나의 가족을 만나러 가자!', speaker: 'odysseus' },
        ] },
      ],
    },

    // ── 스테이지 3 안 — Lv5 → Lv6 사이 짧은 휴식(REST) ★ ────────
    // 마지막 판 직전 — "이제 진짜 마지막" 뉘앙스.
    {
      afterLevel: 5,
      rest: {
        seconds: 20,   // REST 전체(대화 포함) 20초 — 세 스테이지 공통 정책(STEP 89)
        bg: `${IMG_UI}/rest_ithaca.webp`,
        before: [
          { text: '드디어 거의 다 왔군… 잠깐 숨을 고르자.', speaker: 'odysseus' },
          { text: '여기까지 왔으니 조금만 쉬었다가 마지막으로 가요!', speaker: 'player' },
        ],
        after: [
          { text: '준비됐어요! 이제 정말 마지막이에요!', speaker: 'player' },
          { text: '그래! 가자, 작은 모험가!', speaker: 'odysseus' },
        ],
      },
    },
  ],

  // ── 마지막 (Lv6 완료) → 결과 화면 ────────────────────────
  // ★ STEP 92 — 1차 마감: 가족 상봉(scene18) + 소년과 작별(scene19)을
  // 실제 엔딩으로 넣는다(ken 지정 대사 그대로). Scene 16·17(활 시험)과
  // Final Shot 히든 게임은 **화살 미니게임 범위**라 이번에도 제외 —
  // `img_scene16·17.png` 원본은 보존만 해 둔다(나중에 그 기능을 붙일 때 씀).
  // `play3d.js`의 `finish()`가 이 scenes를 다 보여준 뒤 결과 화면(`showGameOver`)
  // 으로 이어간다 — "게임 마무리 flow 안에 포함"은 그 경로 그대로, 여기서는
  // 내용만 바꾼다.
  finish: {
    scenes: [
      { bg: S(18), fx: 'confetti', lines: [
        { text: '내가 왔소! 나의 사랑하는 가족!', speaker: 'odysseus' },
        { text: '드디어 왔군요! 살아서 돌아와줘서 고마워요! 사랑하는 오디세우스!', speaker: 'family' },
      ] },
      { bg: S(19), lines: [
        { text: '반가운 작은 탐험가여! 그대 덕분에 이렇게 나의 고향 이타카로 돌아와서 사랑하는 가족을 만날 수 있었어. 너무 고마워!', speaker: 'odysseus' },
        { text: '정말 잘됐어요! 저도 오디세우스와 함께 모험을 해서 즐거웠어요! 그럼, 사랑하는 가족들과 행복하게 사세요! 전 다른 모험을 하러 떠날게요! 안녕', speaker: 'player' },
        { text: '그래! 잘가~ 정말 고마워! 작은 탐험가!', speaker: 'family' },
      ] },
    ],
  },
}

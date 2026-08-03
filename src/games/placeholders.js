// 더미 게임 카드 — **개발 중에만** 목록에 섞인다.
//
// 게임이 2개뿐이면 홈의 세로 스크롤·하단 4칸 바·이어서 하기 레일 페이징이
// 전부 "동작할 자리가 없어서" 확인이 안 된다. 실제 게임이 늘어나는 속도를
// 기다릴 수 없으니 채워 넣는다.
//
// 안전장치
//   · `import.meta.env.DEV`일 때만 registry에 들어간다 → 프로덕션 빌드에는 없음
//   · `placeholder: true` — 홈에서 클릭해도 라우팅하지 않고 안내만 띄운다
//   · 실제 게임이 추가될 때마다 여기서 한 줄씩 지우면 된다
//
// 썸네일은 이미 있는 에셋을 돌려 쓴다. 카드 비율·NEW 배지·인원 배지·태그 줄바꿈이
// 실제 데이터에서 어떻게 보이는지가 목적이라 그림 자체는 아무거나 상관없다.

const POOP = n => `/assets/image/poop${String(n).padStart(2, '0')}_default.png`
const WU = f => `/assets/warmup/image/${f}.png`

// [id, 제목, 설명, 썸네일, 태그, 최대인원, createdAt]
const RAW = [
  ['cat-paw',      '고양이 발 잡기',     '재빠르게 손을 뻗어 잡아요!',       '/assets/image/poop02_smile.png',       ['순발력', '피하기'],        1, '2026-07-28'],
  ['fridge-hunt',  '냉장고 괴물',        '숨은 재료를 찾아 던져요',          '/assets/image/poop06_anger.png',       ['협동', '순발력'],          2, '2026-07-25'],
  ['star-jump',    '별 따기 점프',       '높이 뛰어 별을 모아요',            WU('bg_star_deco_yellow'),              ['점프', '달리기'],          1, '2026-07-22'],
  ['balloon-pop',  '풍선 터뜨리기',      '손을 뻗어 풍선을 터뜨려요',        '/assets/image/poop11_heart.png',       ['균형', '순발력'],          1, '2026-07-10'],
  ['rocket-ride',  '로켓 타고 슝',       '몸을 기울여 로켓을 조종해요',      WU('bg_rocket_pink'),                   ['균형'],                    1, '2026-06-30'],
  ['bunny-hop',    '토끼 따라 뛰기',     '토끼처럼 폴짝폴짝',                WU('bg_mascot_bunny_blue'),             ['점프', '달리기'],          1, '2026-06-24'],
  ['robot-dance',  '로봇 춤 따라하기',   '동작을 똑같이 따라해요',           WU('bg_mascot_robot_blue'),             ['균형', '협동'],            2, '2026-06-18'],
  ['planet-run',   '행성 달리기',        '행성을 뛰어넘으며 달려요',         WU('bg_planet_purple'),                 ['달리기', '점프'],          1, '2026-06-12'],
  ['slide-down',   '미끄럼틀 내려가기',  '몸을 숙여 빠르게 내려와요',        WU('bg_tower_purple_slide'),            ['균형', '피하기'],          1, '2026-06-05'],
  ['cannon-aim',   '대포 조준',          '팔로 각도를 맞춰 발사해요',        WU('bg_tower_cannon_blue'),             ['균형'],                    1, '2026-05-28'],
  ['spiral-climb', '나선 계단 오르기',   '제자리에서 다리를 높이 들어요',    WU('bg_tower_spiral_slide'),            ['달리기', '균형'],          1, '2026-05-20'],
  ['pose-copy',    '포즈 따라하기',      '사인판 자세를 1초 유지해요',       WU('pose01'),                           ['균형'],                    1, '2026-05-14'],
  ['stretch-time', '스트레칭 시간',      '천천히 몸을 늘려요',               WU('pose02'),                           ['균형'],                    1, '2026-05-08'],
  ['arms-open',    '팔 벌려 날기',       '양팔을 활짝 펴고 날아가요',        WU('pose03'),                           ['균형', '점프'],            1, '2026-04-30'],
  ['dodge-rain',   '비 피하기',          '좌우로 움직여 빗방울을 피해요',    POOP(5),                                ['피하기', '순발력'],        1, '2026-04-22'],
  ['team-relay',   '이어달리기',         '둘이 번갈아 달려요',               POOP(12),                               ['협동', '달리기'],          4, '2026-04-15'],
  ['sleep-quiet',  '조용히 잠들기',      '움직이지 않고 버텨요',             POOP(7),                                ['균형'],                    1, '2026-04-02'],
  ['dizzy-spin',   '빙글빙글 돌기',      '제자리에서 한 바퀴 돌아요',        POOP(8),                                ['균형', '순발력'],          1, '2026-03-20'],
]

// 함수로 감싸는 이유 — 최상단에서 `RAW.map(...)`을 즉시 실행하면 그 결과가
// 모듈 초기화 부작용으로 잡혀 프로덕션 빌드에서 트리 셰이킹되지 않는다.
// (`if (import.meta.env.DEV)`가 `if (false)`로 접혀도 배열은 번들에 남는다.)
// 호출부가 사라지면 이 함수와 RAW가 통째로 빠진다.
export const getPlaceholderManifests = () => RAW.map(
  ([id, title, description, thumbnail, tags, maxPlayers, createdAt]) => ({
    id,
    title,
    description,
    thumbnail,
    ageRange: '4-8',
    players: { min: 1, max: maxPlayers },
    gestures: ['O', 'X'],
    detectors: [],
    tags,
    metrics: [],
    status: 'active',
    createdAt,
    placeholder: true,
  })
)

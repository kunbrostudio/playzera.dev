# 플레이 제라 (Play Zera) 시스템 설계 v3

> 쿤브로스튜디오 × 자파리센터
> 개정일: 2026년 7월 28일 (v1: 6월 / v2: 7월 28일)

---

## 개정 요약 (v2 → v3)

| 모듈 | v2 | v3 |
|---|---|---|
| `core/pointer.js` | — | **신설** — 손 포인터 + 머무르기 + 입력 추상화 |
| `core/pose/gesture.js` | O/X 전담 | **확인·화면전환 전용** (웜업 코드 이관) |
| `core/pose/detectors/` | — | **게임플레이 입력** (playzera 구조 + warm-up 이식) |
| `core/pose.js` | 랜드마크 공급 | 유지 + 거리/추적 상태 판정 추가 |
| `core/metrics.js` | 운동 데이터 수집 | + **미러링 지연 보정** |
| `core/env.js` | — | **신설** — 세팅 티어 감지, 지연 캘리브레이션 |
| `core/remote.js` | — | **신설** — 보조 컨트롤러 (선택) |
| manifest | `category` | **`tags` 배열** |
| 기준 해상도 | 노트북 (1280+) | **폰 가로 (모바일 우선)** |

---

## 1. 폴더 구조 (v3)

```
playzera.dev/
├── index.html
├── vite.config.js
├── netlify.toml
├── .env / .env.example
├── supabase/
│   ├── schema.sql
│   └── migrations/
│
├── src/
│   ├── main.js
│   │
│   ├── core/                     ← 게임팩에서 수정 금지
│   │   ├── supabase.js
│   │   ├── router.js
│   │   ├── registry.js           ← 게임팩 manifest 자동 수집
│   │   ├── pose.js               ← MediaPipe 랜드마크 공급
│   │   ├── pointer.js            ← 손 포인터 + 머무르기      ★신설
│   │   ├── gesture.js            ← 게임 중 O/X 판정
│   │   ├── metrics.js            ← 운동 데이터 수집
│   │   ├── env.js                ← 세팅 티어 / 지연 보정      ★신설
│   │   ├── remote.js             ← 보조 컨트롤러 (선택)      ★신설
│   │   ├── dataStore.js          ← 저장/조회
│   │   └── session.js            ← 세션/플레이어 컨텍스트
│   │
│   ├── ui/
│   │   ├── components/
│   │   │   ├── GameCard.js
│   │   │   ├── Rail.js           ← 좌우 슬라이드 레일
│   │   │   ├── ScrollBar.js      ← 하단 4칸 세로 이동 바
│   │   │   ├── FilterPopup.js    ← 카테고리 팝업
│   │   │   └── DwellTarget.js    ← 머무르기 대상 래퍼
│   │   └── styles/global.css
│   │
│   ├── games/
│   │   ├── warmup-obstacle/
│   │   │   ├── manifest.json
│   │   │   ├── game.js
│   │   │   └── assets/
│   │   └── poop-dodge/
│   │
│   └── pages/
│       ├── home.js
│       ├── ready.js              ← 플레이어 준비 / 카메라 게이트
│       ├── game.js
│       ├── records.js
│       ├── children.js
│       ├── settings.js
│       └── remote.js             ← 보조 컨트롤러 (선택)
```

---

## 2. 라우팅 (v3)

```
/#/                → 홈 (게임 허브)
/#/ready?id=       → 플레이어 준비 / 카메라 인식 확인
/#/game?id=        → 게임 플레이
/#/records         → 오늘 기록
/#/children        → 아이 관리 (2단계)
/#/settings        → 설정
/#/remote?code=    → 보조 컨트롤러 (선택 기능)
```

---

## 3. 입력 추상화 ★ v3 핵심

### 원칙: UI는 입력이 무엇인지 몰라야 한다

손·마우스·터치 세 가지를 지원하되, 화면 코드가 세 갈래로 나뉘면 안 된다. `pointer.js`가 전부 흡수해서 **두 개의 이벤트만** 내보낸다.

```
손 포인터  ─┐
마우스     ─┼─→  pointer.js  ─→  focus(el) / activate(el)
터치       ─┘
```

```js
import { pointer } from './core/pointer.js'

pointer.init({ mode: 'auto' })   // 'hand' | 'mouse' | 'touch' | 'auto'

pointer.on('focus',    (el) => { /* 하이라이트 */ })
pointer.on('activate', (el) => { /* 실행 */ })

pointer.setDwell(1200)           // 머무르기 시간 (손 전용)
pointer.enable() / pointer.disable()
```

### 입력별 동작

| 입력 | focus 발생 | activate 발생 | 머무르기 |
|---|---|---|---|
| 손 포인터 | 손 위치가 대상 위 | 머무르기 완료 | **적용** |
| 마우스 | 호버 | **클릭 즉시** | 미적용 |
| 터치 | — | **탭 즉시** | 미적용 |

**마우스·터치에 머무르기를 적용하면 안 된다.** 즉시 반응하지 않으면 고장으로 인식된다.

### 머무르기 시간 규칙

되돌리기 난이도에 비례시킨다. `DwellTarget` 컴포넌트가 `data-dwell` 속성으로 개별 지정.

| 대상 | 시간 |
|---|---|
| 스크롤 / 페이지 이동 | 500ms |
| 카테고리 선택 | 600ms |
| 게임 시작 (카드) | 1200ms |

---

## 4. pointer.js — 손 포인터 엔진 ★신설

### 좌표 산출

`pose.js`의 손목 랜드마크(LEFT_WRIST 15 / RIGHT_WRIST 16)만 사용한다. **Hands 모델을 추가하지 않는다.**

```
① 활성 손 선택
   양 손목 중 더 높이 올라간 쪽. 한 번 잡으면 유지(락온).

② 활성 박스 계산 (체격 자동 스케일)
   기준 단위 = 어깨 너비 (LEFT_SHOULDER 11 ↔ RIGHT_SHOULDER 12)
   box.width  = 어깨너비 × 2.6
   box.height = 어깨너비 × 1.8
   box.center = 어깨 중점에서 위로 어깨너비 × 0.3

   → 5세와 8세의 팔 길이 차이가 자동 보정된다.

③ 화면 좌표 매핑
   screenX = clamp((wristX - box.left) / box.width,  0, 1) × screenW
   screenY = clamp((wristY - box.top)  / box.height, 0, 1) × screenH

④ 떨림 보정
   One Euro Filter (minCutoff 1.0 / beta 0.007 / dCutoff 1.0)
   → 정지 시 떨림 제거, 이동 시 지연 최소화
```

**떨림 보정은 선택이 아니다.** 원본 랜드마크는 프레임마다 흔들려서 커서가 벌벌 떨린다. 이것 없이 테스트하면 첫 시도에서 "못 쓰겠다"는 결론이 난다.

### 켜고 끄기 (Midas touch 방지)

포인터가 항상 켜져 있으면 아이가 몸을 긁다가 클릭된다.

```
활성화:  손목 y < 어깨 y  (손을 어깨 위로 들었을 때)
비활성:  손을 내리면 → 포인터 페이드아웃, 진행 중 머무르기 취소
```

자연스럽고 아이가 설명 없이 이해한다.

### 머무르기 판정

```js
// 대상 진입 시 타이머 시작
// 대상을 벗어나면 즉시 리셋 (부분 진행 유지 안 함)
// 완료 시 activate 발행 → 쿨다운 400ms

const HYSTERESIS_PX = 12   // 경계에서 깜빡임 방지
```

경계에서 포커스가 깜빡이면 링이 계속 리셋되어 영영 클릭이 안 된다. 히스테리시스를 반드시 넣는다.

### UI 설계 제약

미러링 지연(티어 B, 100~200ms)이 얹히면 커서가 손을 늦게 따라온다. 이산적인 O/X보다 **연속 제어인 포인터가 지연에 훨씬 민감하다.**

- 최소 타겟 크기 **96×96px** (기준 해상도에서)
- 타겟 간 간격 최소 12px
- 정밀 포인팅을 요구하는 UI 금지 (드래그, 슬라이더, 작은 체크박스)
- 화면 가장자리 6px은 타겟 배치 금지 (박스 클램프로 도달 불가)

---

## 5. pose.js — 랜드마크 공급

```js
import { poseEngine } from './core/pose.js'

await poseEngine.init(videoElement, {
  onFrame: (landmarks, timestamp) => {},
  onLost:  () => {},
  onFound: () => {}
})

poseEngine.getLandmarks()
poseEngine.isTracking()
poseEngine.getDistanceHint()   // 'ok' | 'too-close' | 'too-far'
poseEngine.destroy()
```

**거리 판정** — 어깨 너비가 프레임 폭에서 차지하는 비율로 산출.

```
ratio = shoulderWidth / frameWidth
ratio > 0.34  → 'too-close'   (너무 가까움)
ratio < 0.12  → 'too-far'     (너무 멂)
그 외          → 'ok'          (약 1.5~2m)
```

셀피 반전 보정은 pose.js에서 일괄 처리한다. 하위 모듈은 보정된 좌표만 다룬다.

---

## 6. gesture.js — 확인 · 화면 전환 제스처

> ⚠️ **v3 초판 정정** — 초판은 이 모듈을 "게임 플레이 중 전용"으로 기술했으나 실제 구현은 반대다. `warm-up-web/public/js/input/gestureRecognizer.js` 첫 줄: *"메뉴/화면 전환용 손동작 인식 (달리기 중 좌우/점프/숙이기와는 별개)"*. 게임플레이 입력은 별도 detector가 담당한다.

### 정본은 이미 존재한다

새로 짜지 않는다. 아래 파일을 `core`로 승격·이관하는 것이 작업의 전부다.

| 원본 | 이관 위치 |
|---|---|
| `warm-up-web/.../input/gestureRecognizer.js` | `src/core/pose/gesture.js` |
| `warm-up-web/.../input/poseMatcher.js` | `src/core/pose/detectors/poseMatchDetector.js` |
| `warm-up-web/.../config.js` 의 `gesture` 블록 | `src/core/pose/tuning.js` |

```js
import { isArmsUpCircle, isArmsUpCross, GestureHold } from './core/pose/gesture.js'

// 사용 패턴 (기존 코드 그대로)
const oHold = new GestureHold(lms => isArmsUpCircle(lms, TUNING.gesture), 3.0)
// 매 프레임
if (oHold.update(dt, landmarks)) { /* 발동 */ }
oHold.progress   // 0~1 — 링 UI에 그대로 사용
```

### 검증된 판정 규칙 — 바꾸지 말 것

현장 테스트로 다듬어진 값들이다. 리팩터링 중에 "정리"하고 싶어지더라도 **동작을 바꾸면 안 된다.**

| 규칙 | 이유 (코드 주석 근거) |
|---|---|
| **O만 머리 위 유지 요구, X는 미요구** | X를 머리 위로 제한하면 플레이 중 인식률이 급락 |
| **X는 상반신(어깨·손목)만으로 판정** | 전신 기준이면 달리기·점프 중 발목이 프레임 이탈 → 정지 화면에선 되는데 플레이 중엔 안 되던 문제의 원인 |
| **놓쳤을 때 `dt × 0.6` 속도로 감소** | 즉시 리셋하면 한두 프레임 흔들림에도 처음부터 다시 → "잘 안 된다"는 체감 |
| **`bodyHeight` 비율 기준 임계값** | 아이/어른, 카메라 거리와 무관하게 동작 |

### 튜닝 상수 (`config.js` 원본값)

```js
gesture: {
  startHoldSec:        3.0,   // 카메라 준비 화면: O 유지 → 시작
  confirmHoldSec:      1.5,   // 종료 확인 / 게임오버: O·X 유지
  tutorialHoldSec:     1.0,   // 튜토리얼: O=건너뛰기, X=이전
  duringPlayExitHoldSec: 1.5, // 플레이 중: X 유지 → 종료 확인창
  armsUpMargin:  0.12,   // O: 손목이 코보다 bodyHeight×0.12 위
  closeMargin:   0.28,   // O: 두 손목 거리 < bodyHeight×0.28
  crossSeparation: 0.15, // X: 두 손목이 어깨너비×0.15 이상 벌어짐
}
```

settings 화면의 민감도 슬라이더는 이 값들에 배율을 곱하는 방식으로 구현한다. 원본 상수를 덮어쓰지 않는다.

---

## 6-1. 게임플레이 입력 — detector 아키텍처

게임플레이 입력은 gesture.js가 아니라 **detector**가 담당한다. `playzera.dev`에 이미 플러그형 구조가 있다.

```
src/core/pose/
├── poseEngine.js              ← 랜드마크 공급 (싱글턴)
├── gesture.js                 ← O/X (확인·전환)
├── tuning.js                  ← 모든 임계값 집약
└── detectors/
    ├── zoneDetector.js        ← 좌우 3구역        (playzera 기존)
    ├── jumpDetector.js        ← 점프 상태머신     (playzera 기존)
    ├── squatDetector.js       ← 앉기              (playzera 기존)
    ├── runDetector.js         ← 제자리 달리기     (playzera 기존)
    ├── laneDetector.js        ← 레인 이동 + 캘리브레이션  ★warm-up 이식
    ├── duckDetector.js        ← 숙이기            ★warm-up 이식
    └── poseMatchDetector.js   ← 스트레칭 포즈 유사도 ★warm-up 이식
```

### 두 프로젝트의 강점을 합친다

| | playzera | warm-up | 채택 |
|---|---|---|---|
| 구조 | **플러그형 detector** | 모놀리식 `MotionDetector` | **playzera** |
| 튜닝값 | 기본값 수준 | **현장 검증 + 교훈 주석** | **warm-up** |
| 부가 모듈 | — | `gestureRecognizer`, `poseMatcher` | **warm-up** |
| 랜드마크 스무딩 | 없음 | **EMA (alpha 0.35)** | **warm-up** |
| 전신 가시성 판정 | 없음 | **`isFullBodyVisible()`** | **warm-up** |

`warm-up`의 `MotionDetector`는 레인·점프·숙이기가 한 클래스에 뭉쳐 있다. 이를 playzera의 detector 규격(`create*Detector({ onX })` → `{ update, reset, destroy }`)에 맞춰 쪼갠다.

**단, 임계값과 캘리브레이션 로직은 그대로 옮긴다.** 구조만 바꾸고 수치는 손대지 않는다.

### manifest 연동

```json
"gestures": ["O", "X"],
"detectors": ["lane", "jump", "duck", "poseMatch"]
```

허브는 `manifest.detectors`에 선언된 것만 생성한다. 선언하지 않은 detector는 CPU를 쓰지 않는다.

---

## 7. env.js — 실행 환경 감지 & 지연 보정 ★신설

```js
import { env } from './core/env.js'

env.tier            // 'A' | 'B' | 'C' | 'D'
env.isMirroring     // 미러링 추정 여부
env.latencyMs       // 캘리브레이션으로 측정된 표시 지연
env.inputMode       // 'hand' | 'mouse' | 'touch'

await env.calibrateLatency()   // 1회 측정
```

### 지연 캘리브레이션

미러링(티어 B)은 화면이 100~200ms 늦게 표시된다. 아이는 늦은 화면을 보고 반응하므로 **측정 반응속도에 지연이 그대로 얹힌다.** 운동 데이터가 플랫폼 핵심인 이상 방치할 수 없다.

```
① 화면에 큰 원이 갑자기 나타남   → t_render 기록
② 아이가 O 동작                  → t_gesture 기록
③ 3회 반복하여 중앙값 산출
④ baseline(직접 화면 기준값)과의 차이 = latencyMs

저장 시: reaction_raw_ms(원본) + reaction_adj_ms(보정) 둘 다 기록
```

원본을 반드시 남긴다. 보정식이 나중에 바뀌어도 재계산할 수 있어야 한다.

### 티어 판정 (휴리스틱)

```
터치 이벤트 존재 + 화면 < 900px        → C (폰 단독)
터치 이벤트 존재 + 외부 디스플레이 감지 → A 또는 B
마우스 + 화면 ≥ 1280px                 → D
```

정확히 구분되지 않는 경우 설정에서 사용자가 직접 선택하게 한다. **티어는 결과 저장 시 함께 기록한다.**

---

## 8. remote.js — 보조 컨트롤러 (선택) ★신설

손 포인터가 잘 안 될 때 다른 폰으로 접속해 리모컨처럼 쓴다.

```js
import { remote } from './core/remote.js'

remote.enable()          // 설정에서 켤 때만 동작
remote.getPairCode()     // 'A7K2' — 화면에 표시
remote.on('command', ({ type, payload }) => {})

// 명령: FOCUS_NEXT | FOCUS_PREV | ACTIVATE | BACK | SCROLL | START | PAUSE | STOP
```

### v1의 두 번째 기기와 무엇이 다른가

| | v1 카메라 폰 (폐기) | v3 보조 컨트롤러 |
|---|---|---|
| 전송량 | 초당 30회 포즈 데이터 | 이벤트당 1회 |
| 끊겼을 때 | **게임 정지** | 아무 일 없음 |
| 필수 여부 | 필수 | **완전 선택** |

### 지켜야 할 계약

1. `remote.js`가 로드되지 않아도 앱은 정상 동작한다.
2. 어떤 화면도 remote 연결을 전제로 렌더링하지 않는다.
3. 연결이 끊겨도 UI에 경고를 띄우지 않는다 (조용히 손 포인터로 복귀).

이 원칙을 어기면 v1의 실패를 반복한다.

---

## 9. 게임팩 인터페이스

### registry.js

```js
const manifests = import.meta.glob('../games/*/manifest.json', { eager: true })

registry.getAll()
registry.get(id)
registry.getByTag('점프')          // ★ category → tag 기반으로 변경
registry.getAllTags()              // 필터 팝업용 태그 목록 + 개수
registry.getRecent(limit)          // '이어서 하기' 레일용
await registry.loadGame(id)
```

### game.js 규격

```js
export default class WarmupObstacleGame {
  constructor(canvas, ctx) {}   // ctx: { manifest, players, metrics }

  init()
  startRound(n)
  onGesture(gesture, meta)      // 제스처 수신 (허브가 호출)
  update(deltaTime)
  render()
  pause() / resume() / destroy()

  on(event, cb)
  // 'roundEnd' | 'gameEnd' | 'scoreUpdate' | 'lifeUpdate' | 'judge'
  //
  // 'judge' 필수 발행 — 운동 데이터의 원천
  //   { result: 'success'|'fail', reactionMs: 420, gesture: 'O', round: 2 }
}
```

**게임팩이 지켜야 할 계약**

1. 랜드마크를 직접 만지지 않는다. `onGesture`로만 입력을 받는다.
2. `pointer.js`를 사용하지 않는다. 포인터는 홈의 게임 목록 전용이다. 게임팩의 스타트·확인 화면은 O/X(`gesture.js`)로 만든다.
3. 판정마다 `judge`를 발행한다.
4. 저장을 직접 하지 않는다. `gameEnd`만 던지면 허브가 저장한다.
5. `manifest.gestures`에 선언하지 않은 제스처는 수신되지 않는다.

---

## 10. 운동 데이터 수집

```js
import { metrics } from './core/metrics.js'

metrics.start({ gameId, sessionId, players, tier: env.tier, latencyMs: env.latencyMs })

const summary = metrics.stop()
// {
//   playTimeSec, gestureCount,
//   reactionRawAvgMs, reactionAdjAvgMs, reactionMinMs,
//   accuracy, activityScore, byRound: [...]
// }
```

### 활동량(activityScore)

```
프레임마다: 주요 관절(손목·팔꿈치·어깨·엉덩이·무릎)의
            이전 프레임 대비 이동 거리 합산 → 누적

정규화:     어깨 너비를 기준 단위로 스케일링
            → 카메라 거리 편차 제거
            누적값 / 플레이 시간 = 분당 활동량
```

**어깨 너비 정규화는 필수.** 없으면 앞에 선 아이가 무조건 활동량이 높게 나온다.

---

## 11. 데이터베이스 스키마 (v3)

v2 대비 변경: `game_results`에 실행 환경 컬럼 추가, 반응속도 원본/보정 분리.

```sql
CREATE TABLE centers (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE children (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id   UUID REFERENCES centers(id),
  name        TEXT NOT NULL,
  birth_year  INTEGER,
  class_name  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_children_center ON children(center_id, name);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  center_id   UUID REFERENCES centers(id),
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);

CREATE TABLE game_results (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id       TEXT REFERENCES sessions(id),
  center_id        UUID REFERENCES centers(id),
  child_id         UUID REFERENCES children(id),   -- nullable = 1단계
  player_name      TEXT NOT NULL,
  game_id          TEXT NOT NULL,
  game_tags        TEXT[],                         -- ★ category 대체

  -- 실행 환경 ★신설
  env_tier         TEXT,                           -- 'A'|'B'|'C'|'D'
  env_latency_ms   INTEGER,                        -- 측정된 표시 지연
  input_mode       TEXT,                           -- 'hand'|'mouse'|'touch'

  -- 게임 성과
  score            INTEGER DEFAULT 0,
  rounds_cleared   INTEGER DEFAULT 0,
  success_count    INTEGER DEFAULT 0,
  fail_count       INTEGER DEFAULT 0,

  -- 운동 데이터
  play_time_sec    INTEGER,
  gesture_count    INTEGER,
  reaction_raw_ms  INTEGER,                        -- ★ 원본
  reaction_adj_ms  INTEGER,                        -- ★ 지연 보정
  reaction_min_ms  INTEGER,
  accuracy         NUMERIC(4,3),
  activity_score   NUMERIC(10,2),
  extra_metrics    JSONB DEFAULT '{}',

  played_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_results_session ON game_results(session_id, played_at);
CREATE INDEX idx_results_child   ON game_results(child_id, played_at);

CREATE TABLE metric_events (
  id          BIGSERIAL PRIMARY KEY,
  result_id   UUID REFERENCES game_results(id) ON DELETE CASCADE,
  round_no    INTEGER,
  gesture     TEXT,
  result      TEXT,
  reaction_ms INTEGER,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_events_result ON metric_events(result_id);
```

**`metric_events`를 두는 이유** — 요약값만 저장하면 역량 산출식을 바꿀 때 재계산이 불가능하다. 원본 판정 로그가 있으면 지표 정의가 바뀌어도 과거 데이터를 다시 계산할 수 있다.

**`env_tier` / `env_latency_ms`를 두는 이유** — 티어 B(미러링)와 티어 A(케이블)의 반응속도는 구조적으로 다르다. 이 값 없이는 두 데이터를 비교할 수 없다.

### RLS

```sql
ALTER TABLE game_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE children      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon insert" ON game_results  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon select" ON game_results  FOR SELECT TO anon USING (true);
```

> ⚠️ 가정 사용이 늘고 아이 개인정보가 들어가는 2단계부터 anon 전면 허용을 유지할 수 없다. 인증 도입이 3단계 전 필수 선행 과제.

### 1→2단계 마이그레이션

```sql
UPDATE game_results r
SET    child_id = c.id
FROM   children c
WHERE  r.child_id IS NULL
  AND  r.center_id = c.center_id
  AND  r.player_name = c.name;
```

---

## 12. 게임 실행 흐름

```
홈 화면
  registry.getRecent() / getAll() → 레일 + 그리드 렌더
  pointer.init({ mode:'auto' }) → focus/activate 구독
      ↓ 카드 activate
/#/ready?id=  플레이어 준비
  poseEngine.init(video) → 거리·인식 확인
  env.calibrateLatency() (티어 B일 때만)
      ↓ O 동작 또는 탭
/#/game?id=
  ① registry.loadGame(id)
  ② pointer.disable()            ← 게임 중엔 포인터 끔
  ③ gestureEngine.enable(manifest.gestures)
  ④ metrics.start({ tier, latencyMs })
  ⑤ game.init() → startRound(1)
      ↓ 루프
  gestureEngine → game.onGesture()
  game 'judge'  → metrics.record()
      ↓ game 'gameEnd'
  ⑥ metrics.stop()
  ⑦ dataStore.saveResult()
  ⑧ pointer.enable() → 결과 화면
  ⑨ game.destroy() / poseEngine 유지
```

**②와 ⑧이 중요하다.** 게임 중 포인터가 살아 있으면 아이의 팔 동작이 UI를 건드린다. 게임 진입 시 반드시 끈다.

---

## 13. 디자인 토큰 (v3)

기준 해상도가 **폰 가로(약 850×390 CSS px)** 로 내려간다. 노트북은 확대 대응.

```css
:root {
  --color-bg:      #0f1729;
  --color-panel:   #16213e;
  --color-accent:  #00CF00;
  --color-accent2: #ffe600;
  --color-danger:  #ff4757;
  --color-text:    #e8f4f8;
  --color-sub:     #8892a4;

  --radius-card:   16px;
  --radius-btn:    50px;

  --font-main: 'Pretendard', 'Noto Sans KR', sans-serif;

  --header-height: 56px;
  --scrollbar-height: 64px;
  --dwell-ring: 5px;
  --target-min: 96px;          /* 머무르기 최소 타겟 */
}
```

**`--sidebar-width` 삭제** — 사이드바 제거.

### 공용 컴포넌트

| 클래스 | 설명 |
|---|---|
| `.btn-primary` / `.btn-ghost` | 액션 버튼 |
| `.game-card` | 게임 카드 (썸네일·제목·태그·인원) |
| `.rail` | 좌우 슬라이드 레일 + 양끝 화살표 |
| `.scrollbar-4` | 하단 4칸 세로 이동 바 |
| `.filter-popup` | 카테고리 팝업 |
| `.dwell-target` | 머무르기 대상 (링 오버레이 자동) |
| `.badge-new` | NEW 배지 |
| `.gesture-hint` | O/X 안내 오버레이 |

---

## 14. 환경변수 / 배포

```bash
VITE_SUPABASE_URL=https://ertftzicofegagiqtqjo.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_DEFAULT_CENTER_CODE=ZAFARI2026
```

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**HTTPS 필수** — `getUserMedia`는 보안 컨텍스트에서만 동작. Netlify가 기본 제공.

---

## 15. 정리 작업 체크리스트

### 멀티디바이스 잔재 (v2에서 이월)
- [ ] `src/core/channel.js` 삭제
- [ ] `pages/control.js`, `pages/camera.js` 삭제
- [ ] `MSG` 상수 및 참조 제거
- [ ] 라우터에서 `/control`, `/camera` 제거
- [ ] Supabase Realtime 구독 제거 (DB 클라이언트는 유지)
- [ ] QR 코드 생성 로직·라이브러리 제거
- [ ] `session` 쿼리 파라미터 의존 제거

### v3 신규 정리
- [ ] manifest `category` → `tags` 마이그레이션
- [ ] manifest `orientation` 제거 (가로 고정)
- [ ] 사이드바 컴포넌트 및 `--sidebar-width` 제거
- [ ] 게임팩의 `setPlayerZone` → `onGesture` 확인
- [ ] 모바일 우선 기준선으로 CSS 재작성 (폰 가로 → 노트북 확대)
- [ ] 모든 클릭 가능 요소를 `DwellTarget`으로 래핑
- [ ] 타겟 최소 크기 96px 검수

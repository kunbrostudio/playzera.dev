# 플레이 제라 통합 작업 순서

> 실제 코드 조사 기준 (2026-07-28)
> 대상: `playzera.dev` (똥 피하기) + `warm-up-web` (JAPARI RUN)

---

## 0. 현재 상태 스냅샷

### playzera.dev — 허브가 될 프로젝트

```
Vite 6 + Supabase JS + Netlify
├── src/core/
│   ├── pose/                  ← 플러그형 detector 구조 ⭐ 살릴 것
│   │   ├── poseEngine.js      (89줄)
│   │   ├── index.js           (52줄, 호환 레이어)
│   │   └── detectors/         zone / jump / squat / run
│   ├── channel.js             (85줄)  ❌ 삭제 대상
│   ├── gameResult.js          (59줄)
│   ├── router.js  supabase.js  sound.js  bgm.js
├── src/games/
│   ├── registry.js            (8줄)   ⭐ 패턴 존재
│   └── poop-dodge/            game.js (646줄) + manifest.json
├── src/pages/
│   ├── game.js                (2190줄) ⚠️ 최대 작업 구간
│   ├── home.js                (242줄)  poop-dodge 전용 스플래시
│   ├── camera.js  control.js           ❌ 레거시, 미사용 (DEVLOG 명시)
└── public/assets/image/       버튼·똥 캐릭터 에셋
```

### warm-up-web — 이관될 게임팩

```
Express 4 + 순수 ES모듈 (번들러 없음) + Render
├── server/server.js           (약 70줄)  ❌ 삭제 → Supabase
├── data/records.json          33건, .gitignore됨 ⚠️
├── public/js/
│   ├── input/
│   │   ├── poseEngine.js      (5.4KB) EMA 스무딩 + isFullBodyVisible ⭐
│   │   ├── gestureRecognizer.js (3.5KB) O/X + GestureHold ⭐⭐ 정본
│   │   ├── motionDetector.js  (3.5KB) 레인/점프/숙이기 (모놀리식)
│   │   └── poseMatcher.js     (2.8KB) 스트레칭 포즈 유사도 ⭐
│   ├── game/                  world / obstacles / character / course
│   ├── config.js              (3.7KB) ⭐⭐ 현장 검증 튜닝값 전부
│   ├── main.js                (22KB)  게임 루프 + 화면 전환
│   ├── screens.js             (23KB)  타이틀·카메라준비·튜토리얼·게임오버
│   ├── stats.js               (3.3KB) 운동 데이터 → 공통 스키마
│   ├── assets.js  audio.js
└── public/assets/             89개 파일
```

### 안전 확인 완료
- `.env` · `dist/` · `node_modules` — 양쪽 모두 git 추적 안 됨 ✅
- 두 배포(Render / Netlify) 모두 살아있음 — **통합 검증 전까지 그대로 유지** ✅

### ⚠️ 최대 변수 — MediaPipe가 서로 다른 라이브러리다

| | warm-up | playzera |
|---|---|---|
| 라이브러리 | `@mediapipe/tasks-vision@0.10.14` | `@mediapipe/pose` + `camera_utils` |
| API 세대 | **Tasks API (현행)** | **Solutions API (지원 종료)** |
| 로드 방식 | ES module `import()` | `<script>` 태그 → `window.Pose` |
| 좌우 반전 | 수동 (`1 - x`) | `selfieMode: true` 옵션 |
| 랜드마크 스무딩 | 자체 EMA (alpha 0.35) | `smoothLandmarks: true` |
| GPU | `delegate: 'GPU'` | 옵션 없음 |

**두 라이브러리는 API가 완전히 달라서 공존시킬 수 없다.** 하나로 통일해야 하고, **`tasks-vision`(warm-up 쪽)으로 통일**한다.

이유:
- playzera가 쓰는 Solutions API는 **구글이 지원을 종료**했다. Safari 호환 문제가 있어도 고쳐지지 않는다.
- Tasks API가 성능·모델 선택·delegate 제어 면에서 우위
- warm-up 쪽 코드가 이미 이 API 기준으로 튜닝돼 있다

→ **STEP 4의 실제 작업량이 예상보다 크다.** 단순 detector 이식이 아니라 **똥 피하기의 포즈 인식을 tasks-vision으로 이식**하는 작업이 포함된다. `selfieMode`·`smoothLandmarks` 같은 옵션이 사라지므로 동등 기능을 수동 구현해야 한다.

---

## ⚠️ STEP 0 — 먼저 할 일 (통합과 무관, 즉시)

### 0-1. Render 기록 회수

`data/`가 `.gitignore`에 있고 Render는 재배포 시 디스크가 초기화된다. **배포본에 쌓인 기록이 있다면 지금 회수하지 않으면 다음 배포에 사라진다.**

```bash
curl https://japari-run.onrender.com/api/records?limit=1000 > render_records_backup.json
curl https://japari-run.onrender.com/api/records/summary
```

로컬 `data/records.json`(33건)도 별도 보관.

- [x] Render 기록 백업 → **0건 (`[]`)**. 배포본 기록은 이미 유실됨
- [x] 로컬 records.json 백업 → `~/Documents/playzera_records_33.json`
- [x] 건수 확인 — **로컬 33건이 유일하게 남은 기록**

> 파일 저장 방식으로는 운동 데이터가 쌓이지 않는다는 것이 실증됐다. STEP 1-4가 그래서 필요하다.
>
> ⚠️ zsh에서 URL에 `?`가 있으면 따옴표로 감싸야 한다 — `curl "https://...?limit=1000"`

### 0-2. 폴더 정리

```
Documents/
├── playzera.dev/        ← 정본
├── warm-up-web/         ← 이관 원본 (통합 후에도 당분간 보존)
└── _archive/
    ├── play-zera/
    ├── warm-up/
    └── jafari.dev/
```

- [ ] `play-zera`, `warm-up`, `jafari.dev` 내용 확인 후 `_archive/`로 이동
- [ ] 삭제하지 말 것 — 이름만 바꿔 보관

---

## STEP 1 — 통합 준비 (동작 변경 없음)

목표: 두 게임이 **한 저장소에서 각자 예전처럼** 돌아가게 만든다. 아직 아무것도 개선하지 않는다.

### 1-1. 브랜치

```bash
cd playzera.dev
git checkout -b integrate-warmup
```

Netlify 자동배포는 `main`만 걸려 있으므로 작업 중 배포는 건드려지지 않는다. (확인 필요)

### 1-2. 웜업 파일 이관

```
warm-up-web/public/js/*        → playzera.dev/src/games/warmup-obstacle/
warm-up-web/public/css/style.css → playzera.dev/src/games/warmup-obstacle/style.css
warm-up-web/public/assets/*    → playzera.dev/public/assets/warmup/
```

**주의: 에셋 경로가 전부 깨진다.** `assets.js`의 경로 상수를 `/assets/warmup/...`으로 일괄 변경.

- [ ] 파일 복사
- [ ] `assets.js` 경로 수정
- [ ] `style.css` 클래스명 충돌 확인 → 필요 시 `.wu-` 접두사

### 1-3. 임시 라우트로 동작 확인

`router.js`에 임시 경로를 추가해 웜업이 통째로 뜨는지만 본다. 게임팩 인터페이스는 아직 안 맞춰도 된다.

```js
'/warmup-legacy': () => import('../games/warmup-obstacle/main.js')
```

**검증 기준 — 크롬**
- [ ] `npm run dev` → `/#/warmup-legacy` 진입
- [ ] 타이틀 → 카메라 준비 → O 3초 → 캘리브레이션 → 플레이 → 게임오버까지 완주
- [ ] 콘솔 에러 0
- [ ] `/#/` (똥 피하기)도 여전히 정상

**검증 기준 — Safari** ★신규
- [ ] 맥 Safari에서 위와 동일하게 완주
- [ ] 아이폰 Safari에서 완주 (Netlify 프리뷰 배포 필요 — HTTPS 필수)
- [ ] 영상이 전체화면으로 튀지 않음
- [ ] 프레임 20fps 이상

> Safari 검증을 여기서 하는 이유 — 나중에 발견하면 이미 쌓인 코드 전체를 의심해야 한다. **두 게임이 원래대로 도는 이 시점이 브라우저 차이를 격리하기 가장 쉬운 순간이다.**

> 여기까지가 가장 위험한 구간이다. **이 검증을 통과하기 전에는 다음 STEP으로 넘어가지 않는다.**

### 1-4. server API → Supabase ✅ 코드 작성 완료

> **새 테이블을 만들지 않는다.** 조사해보니 `playzera.dev`의 기존 `game_results` 테이블이 이미 `extra_data JSONB`를 갖고 있어(`001_extend_game_results.sql`) 게임별 지표를 그대로 흡수할 수 있다. 초안의 `game_records` 신설 계획은 폐기.

**작성된 파일**

| 파일 | 내용 |
|---|---|
| `supabase/migrations/002_warmup_records.sql` | 스키마 완화 + `exercise_summary` 뷰 |
| `src/games/warmup-obstacle/stats.js` | `fetch` → `saveResult()` 전환 |
| `scripts/import-warmup-records.mjs` | 기존 33건 임포트 |

**매핑**

| records.json | game_results |
|---|---|
| `score.stars` | `score` |
| `levelReached` | `rounds_cleared` |
| `userId` | `player_name` |
| `startedAt` | `played_at` |
| `gameId: 'japari-run'` | `game_id: 'warmup-obstacle'` (통일) |
| `durationSec` · `exercise.*` · `completed` | `extra_data` JSONB |

**부수 효과 — 기존 버그 하나 해소**
`schema.sql`의 `session_id TEXT NOT NULL`인데 `gameResult.js`의 `saveResult()`는 `sessionId` 기본값으로 `null`을 넘긴다. 즉 **세션 없이 저장하면 NOT NULL 위반으로 실패**하는 상태였다. 002 마이그레이션에서 `session_id`·`player_name`을 nullable로 완화하면서 함께 해결된다.

**실행 순서**

```bash
# 1. Supabase 대시보드 SQL Editor에서 002 실행

# 2. 미리보기 (아무것도 안 넣음)
node scripts/import-warmup-records.mjs

# 3. 실제 임포트
node scripts/import-warmup-records.mjs --commit
```

임포트 스크립트는 `extra_data.legacy_id`로 중복을 걸러서 **여러 번 실행해도 안전**하다.

- [x] 마이그레이션 SQL 작성
- [x] `stats.js` Supabase 전환 (`flushPending`도 함께)
- [x] 임포트 스크립트 작성
- [x] Supabase 대시보드에서 002 실행
- [x] 임포트 실행 — **33건 삽입 완료**
- [x] 게임 완주 후 실제 저장 확인 — 실시간 기록 생성 확인
- [ ] `warm-up-web/server/` 삭제 (통합본 검증 후)

### 1-5. 저장 누락 · 데이터 정합 수정 ★ 실제 데이터 확인 후 발견

첫 실시간 기록을 조회해보니 세 가지 문제가 드러났다. 운동 데이터가 플랫폼의 핵심이므로 데이터가 더 쌓이기 전에 수정했다.

**① 미션 완료 시 저장 누락 (가장 심각)**

```js
stats.completed = missionDone || ...
await showMissionComplete(stats);   // ← save() 없음
// 루프 → 타이틀로 → new Stats()로 덮어씀
```

5레벨 완주, 즉 **운동량이 가장 많은 판이 통째로 유실**되고 있었다. `handleQuit`·`handleGameOver`에는 저장이 있었는데 정상 완주 경로만 빠져 있었다.
→ `showMissionComplete()` 앞에 `await stats.save()` 추가.

**② `duration_sec`이 운동 시간이 아니었다**

`stats = new Stats()`가 `gameFlow` 루프 맨 위에 있어 `startedAt`이 **타이틀 화면 도착 시점**에 찍혔다. 타이틀·카메라 준비·튜토리얼에 머문 시간이 전부 포함된 것.

실측: `duration_sec 58` / `active_sec 6` → 52초가 메뉴 시간

→ `playStartedAt`을 분리해 카운트다운 직후(`markPlayStart()`)에 설정. 세션 시작 시각은 `extra_data.session_started_at`으로 보존.

> **임포트된 33건은 교정 전 값이다.** 리포트에서 `duration_sec`을 운동량으로 쓰면 안 된다. `active_sec`이 정답.

**③ 이탈 경로에서 기록 유실**

| 경로 | 이전 | 이후 |
|---|---|---|
| 종료 확인 → 종료 | ✅ | ✅ |
| 게임오버 | ✅ | ✅ |
| 미션 완료 | ❌ | ✅ (①) |
| 탭 닫기 · 새로고침 | ❌ | ✅ `pagehide` |
| 허브 홈으로 라우팅 | ❌ | ✅ `hashchange` |
| 백그라운드 전환 (iOS) | ❌ | ✅ `visibilitychange` |

`pagehide` 시점에는 비동기 요청이 브라우저에 취소되므로 Supabase를 부르지 않는다. **`localStorage`에 동기로 써두고 다음 접속 때 `flushPending()`이 전송**한다. 이미 있던 큐 구조를 그대로 활용.

**④ `visibilitychange` 함정 — 이탈 저장을 넣자 새로 생긴 위험**

`visibilitychange`는 **탭을 잠깐 전환할 때도** 발동한다. 여기서 "저장 완료"로 표시해버리면 사용자가 돌아와 완주해도 그 기록이 저장되지 않는다. 부분 기록이 최종 기록을 밀어내는 셈.

해결: `Stats`에 `runId`(판 식별자)를 두고

| 함수 | 동작 |
|---|---|
| `queueOnExit()` | 큐에 **upsert** (같은 `runId`면 교체). `_saved`는 켜지 않음 |
| `save()` 성공 시 | `_saved = true` + 큐에서 같은 `runId` **제거** |

이러면 백그라운드 전환이 몇 번 일어나도 큐는 1건으로 유지되고, 나중에 완주하면 그 기록이 큐를 대체한다. 탭을 진짜 닫으면 큐에 남아 다음 접속 때 전송된다.

**⑤ 멱등성** — `Stats._saved`로 Supabase insert가 한 번만 일어나게 했다. 움직임 판정(`hasMovement`)도 `Stats` 안으로 옮겨 호출처마다 중복돼 있던 가드를 제거.

- [x] 미션 완료 경로에 `save()` 추가
- [x] `playStartedAt` 분리 + `markPlayStart()`
- [x] `pagehide` / `visibilitychange` / `hashchange` 이탈 저장
- [x] `runId` 기반 큐 upsert/dequeue (백그라운드 전환 대응)
- [x] `_saved` 멱등 플래그 · `hasMovement` 게터
- [x] 시나리오 검증 16건 통과 (탭 전환 후 완주 · 백그라운드 3회 · 탭 닫기 · 중복 · 무동작 · 네트워크 실패 · 재시도)
- [ ] **실기기 검증**: 미션 완주 → 저장 확인 / 플레이 중 탭 닫기 → 재접속 시 큐 전송 확인

> 저장 경로를 늘리는 작업은 **중복과 유실이 동시에 위험해진다.** 경로가 하나면 안 되거나 되거나지만, 다섯 개가 되면 "두 번 저장"과 "아무도 저장 안 함"이 둘 다 생길 수 있다. `runId` + `_saved` 두 장치가 그 경계를 지킨다.

### 1-6. 키보드 모드 기록 분리 ★ 데이터 신뢰도

**문제** — 점프·앉기·피하기 카운트는 장애물 성공 여부와 무관하게 **몸 동작 횟수**를 센다. 운동량 지표로는 올바른 설계다. 그런데 **키보드 모드에서는 방향키만 눌러도 카운트가 올라간다.** 손가락 운동이지 유아체육이 아니다.

개발·검증은 대부분 키보드로 이뤄지므로, 구분하지 않으면 "이 아이 이번 달 점프 300회" 리포트에 테스트 기록이 섞인다. 운동 데이터 누적이 플랫폼의 존재 이유인 이상 방치할 수 없다.

**해결** — 기록을 지우지 않고 `extra_data.input_mode`로 표시한 뒤 통계 뷰에서 거른다.

| `input_mode` | 의미 | 운동 통계 |
|---|---|---|
| `motion` | 카메라로 몸 인식 | ✅ 집계 |
| `keyboard` | 키보드·터치 조작 | ❌ 제외 |
| `unknown` | Render 시절 임포트 33건 (모드 불명) | ❌ 제외 |

**뷰 두 개로 분리**

| 뷰 | 용도 |
|---|---|
| `exercise_summary` | **운동 데이터** — `motion`만 |
| `play_summary_by_mode` | 개발·검증용 — 모드별 현황 |

- [x] `Stats.inputMode` + `setInputMode()`
- [x] `main.js` 카메라 준비 화면에서 모드 확정 시 주입
- [x] `extra_data.input_mode` 저장
- [x] 임포트 스크립트에 `'unknown'` 표시
- [x] `003_input_mode.sql` — 기존 기록 보정 + 뷰 재정의
- [x] Supabase에서 003 실행
- [x] **검증 완료 (2026-07-31)** — 아래 참조

**검증 결과**

```
콘솔  [stats] 저장 시도 — [keyboard] 점프 0 / 앉기 0 / 피하기 2 / 활동 8초  ※ 운동 통계에서 제외됨
      [stats] ✔ Supabase 저장 완료 (run_id ms8siyge-vgeem4)

DB    keyboard   1건   활동 8초   피하기 2   ← 새 기록, 통계에서 분리됨
      unknown   38건   활동 4157초           ← 임포트 33 + 초기 테스트 5
```

콘솔 값과 DB 값이 정확히 일치. `keyboard`가 별도 행으로 분리되어 운동 통계를 오염시키지 않는다.

> ⚠️ `CREATE OR REPLACE VIEW`는 컬럼을 제거할 수 없다(`42P16: cannot drop columns from view`). 002의 `exercise_summary`에서 `total_duration_sec`을 빼는 변경이라 `DROP VIEW` 후 재생성해야 했다. 뷰 컬럼 구성을 바꿀 때 반복될 이슈.

> **모션 모드로 플레이한 기록이 아직 하나도 없다.** 003 실행 직후 `exercise_summary`는 비어 있는 것이 정상이다. 이 뷰에 첫 줄이 생기는 순간이 플레이 제라의 실질적인 데이터 시작점이다.

**임포트 대상 데이터 (미리보기 확인됨)**

```
33건 · 2026-07-24 ~ 07-27
총 플레이 79.0분 / 실제 활동 56.9분
좌우 이동 307회 · 점프 136회 · 앉기 122회
미션 완료 2/33회
```

---

## STEP 2 — 허브 껍데기

목표: 게임 목록에서 두 게임을 골라 실행하고 돌아올 수 있게. **디자인은 나중.**

### 2-1. registry 확장

```js
// src/games/registry.js
import poopDodge from './poop-dodge/manifest.json'
import warmup    from './warmup-obstacle/manifest.json'

export const GAME_REGISTRY = {
  'poop-dodge':      { manifest: poopDodge, load: () => import('./poop-dodge/game.js') },
  'warmup-obstacle': { manifest: warmup,    load: () => import('./warmup-obstacle/game.js') },
}
export const getAll = () => Object.values(GAME_REGISTRY).map(g => g.manifest)
```

### 2-2. manifest 통일

기존 `poop-dodge/manifest.json`은 `minAge`/`maxAge`/`emoji`를 쓰고 v3 규격과 다르다. 양쪽을 규격에 맞춘다.

```json
{
  "id": "warmup-obstacle",
  "title": "인터랙션 웜업 장애물 피하기",
  "description": "장애물을 피하고 포즈를 따라해요!",
  "thumbnail": "/assets/warmup/image/title.png",
  "ageRange": "4-8",
  "players": { "min": 1, "max": 1 },
  "gestures": ["O", "X"],
  "detectors": ["lane", "jump", "duck", "poseMatch"],
  "tags": ["달리기", "점프", "균형", "웜업"],
  "metrics": ["sideSteps", "jumps", "squats", "poseHolds"],
  "status": "active",
  "createdAt": "2026-07-20"
}
```

- [ ] 두 manifest를 v3 규격으로 통일
- [ ] `poop-dodge/game.js`에서 `emoji`/`minAge` 참조 수정

### 2-3. home.js를 임시 목록으로

242줄짜리 poop-dodge 스플래시를 지우고, `registry.getAll()`을 도는 단순 리스트로 교체. **버튼 두 개짜리 텍스트 목록으로 충분하다.**

- [ ] home.js 교체
- [ ] 게임 → 홈 복귀 동선 (`destroy()` 후 라우팅)

**검증 기준**
- [ ] 홈에서 두 게임 각각 실행 → 완주 → 홈 복귀
- [ ] 두 번 연속 실행해도 카메라·오디오 정상 (destroy 누락 확인)

---

## STEP 3 — 멀티디바이스 제거

가장 코드량이 많지만 **전부 삭제**라 위험도는 낮다.

### 3-1. 파일 삭제

- [ ] `src/core/channel.js`
- [ ] `src/pages/camera.js`
- [ ] `src/pages/control.js`

### 3-2. `src/pages/game.js` (2190줄) 정리

`channel` / `MSG` 참조가 20곳 이상. 확인된 지점:

| 라인 | 내용 |
|---|---|
| 3-4 | `import channel`, `MSG`, `MAX_DEVICES` |
| 61-86 | `channel.join`, `trackPresence`, 역할 분기 |
| 1067-1088 | 역할 선택 UI (컨트롤러/카메라 카드), presence 카운트 |
| 1424 | `channel.send(MSG.ROUND_CHANGE)` |
| 1467-1481 | `GAME_START/PAUSE/STOP/POSE_UPDATE/GAME_EXIT` 수신 |
| 1498 | `onPresenceSync` |

```bash
grep -n "channel\|MSG\.\|_role\|presence\|MAX_DEVICES\|sessionId" src/pages/game.js
```

**삭제 후 남아야 할 것**
- 역할 분기 없이 바로 게임 화면 진입
- 시작/일시정지/정지는 로컬 함수 직접 호출
- 포즈 입력은 로컬 detector에서 직접 수신

- [ ] import 및 전 참조 제거
- [ ] 역할 선택 UI 블록 삭제
- [ ] 라우터에서 `/control`, `/camera` 제거
- [ ] QR 라이브러리 의존 제거
- [ ] `session` 쿼리 파라미터 의존 제거

**검증 기준**
- [ ] `grep -c "channel" src/` → 0
- [ ] 똥 피하기 실행 → 플레이 → 결과까지 정상
- [ ] 네트워크 탭에 Realtime 웹소켓 없음

> game.js가 2190줄이라 이 STEP만 하루 이상 걸릴 수 있다. 한 번에 다 지우지 말고 **역할 선택 → 메시지 수신 → presence 순으로 나눠서** 각 단계마다 실행 확인.

---

## STEP 4 — 포즈 엔진 통합

### 4-0. 선행 — MediaPipe 라이브러리 통일 ⚠️

**이 STEP에서 가장 큰 작업이다.** 두 프로젝트가 서로 다른 세대의 MediaPipe를 쓰고 있어 공존이 불가능하다.

**방향: `tasks-vision`으로 통일** (warm-up 쪽 채택, playzera를 이식)

playzera가 `@mediapipe/pose`의 옵션으로 공짜로 얻던 기능들을 직접 구현해야 한다.

| 잃는 것 | 대체 방법 |
|---|---|
| `selfieMode: true` | warm-up 방식대로 `1 - x` 수동 반전 (poseEngine에서 일괄) |
| `smoothLandmarks: true` | warm-up의 EMA 스무딩 (`emaAlpha: 0.35`) 사용 |
| `window.Camera` 유틸 | `getUserMedia` 직접 호출 (warm-up 코드 그대로) |
| `modelComplexity: 1` | `pose_landmarker_lite` 또는 `_full` 모델 선택 |

- [ ] `poseEngineCore`를 tasks-vision 기반으로 재작성 (warm-up `poseEngine.js`가 베이스)
- [ ] `<script>` 태그 동적 로드 제거 → ES module import
- [ ] `zoneDetector` 등 기존 detector가 반전된 좌표를 받는지 확인
- [ ] `camera_utils` 의존 제거

**검증**: 똥 피하기의 좌우 구역 인식이 이식 전과 동일하게 동작해야 한다. 반전 처리가 이중으로 걸리거나 빠지면 좌우가 뒤집힌다 — 가장 흔한 실수 지점.

### 4-1. 목표 구조

```
src/core/pose/
├── poseEngine.js              ← tasks-vision 기반 (warm-up 코드가 베이스)
│                                 + EMA 스무딩 + isFullBodyVisible + 수동 반전
├── gesture.js                 ← warm-up gestureRecognizer.js 그대로
├── tuning.js                  ← warm-up config.js의 motion/gesture/pose 블록
└── detectors/
    ├── zoneDetector.js  jumpDetector.js  squatDetector.js  runDetector.js   (기존 구조 유지)
    ├── laneDetector.js        ★ motionDetector.js에서 분리
    ├── duckDetector.js        ★ motionDetector.js에서 분리
    └── poseMatchDetector.js   ★ poseMatcher.js 래핑
```

### 4-2. 이관 원칙

**구조만 바꾸고 수치는 손대지 않는다.** `config.js`의 값들은 현장 테스트로 다듬어진 것이고, 주석에 그 이유가 적혀 있다.

절대 바꾸지 말 것:

| 규칙 | 근거 |
|---|---|
| O만 머리 위 요구, X는 미요구 | X를 머리 위로 제한하면 플레이 중 인식률 급락 |
| X는 어깨·손목만으로 판정 | 전신 기준이면 달리기 중 발목 프레임 이탈 |
| GestureHold 감소율 `dt × 0.6` | 즉시 리셋하면 프레임 흔들림에 처음부터 다시 |
| 임계값은 `bodyHeight` 비율 | 아이/어른·카메라 거리 무관 |
| EMA `emaAlpha: 0.35` | 랜드마크 떨림 제거 |

- [ ] `gesture.js` 이관 (수정 없이 복사 → import 경로만)
- [ ] `tuning.js`로 상수 집약
- [ ] `motionDetector.js`를 lane/duck으로 분리, playzera detector 규격에 맞춤
- [ ] `poseMatcher.js` → `poseMatchDetector.js` 래핑
- [ ] `poseEngine.js`에 EMA 스무딩 + `isFullBodyVisible()` 이식
- [ ] `src/core/pose/index.js` 호환 레이어 제거 (더 이상 불필요)

### 4-3. manifest 기반 detector 활성화

```js
const detectors = manifest.detectors.map(name => createDetector(name, tuning))
poseEngine.onLandmarks(lms => detectors.forEach(d => d.update(lms)))
```

**검증 기준**
- [ ] 웜업 게임 플레이 감각이 이관 전과 동일 (레인·점프·숙이기·포즈)
- [ ] O/X 인식률이 이관 전과 동일
- [ ] 똥 피하기의 zoneDetector도 정상

---

## STEP 5 — 게임팩화

### 5-1. 웜업 게임 정리

`main.js`(22KB)와 `screens.js`(23KB)에서 **허브가 담당할 화면을 덜어낸다.**

| screens.js 함수 | 처리 |
|---|---|
| `showTitle()` | **유지** — 게임팩 고유 스타트 화면 |
| `showCameraSetup()` | **허브로 이관** — 전 게임 공용 |
| `showTutorial1/2()` | **유지** — 게임별 튜토리얼 |
| `showCountdown()` | 유지 |
| `showLevelBanner()` | 유지 |
| `showGameOver()` | **허브로 이관** — 결과 화면 공용화 |
| `showMissionComplete()` | **허브로 이관** |

- [ ] `showCameraSetup` → `src/pages/ready.js`
- [ ] `showGameOver` / `showMissionComplete` → 허브 결과 화면
- [ ] `main.js`를 `game.js` 클래스 규격으로 래핑
- [ ] `judge` 이벤트 발행 추가 (운동 데이터 원천)

### 5-2. 게임팩 인터페이스

```js
export default class WarmupObstacleGame {
  constructor(canvas, ctx) {}
  init()
  onGesture(gesture, meta)
  update(dt) / render()
  pause() / resume() / destroy()
  on(event, cb)   // roundEnd | gameEnd | scoreUpdate | judge
}
```

- [ ] 웜업을 규격에 맞춤
- [ ] 똥 피하기도 동일 규격으로 (기존 `setPlayerZone` → `onGesture`)

---

## STEP 6 — 손 포인터

`src/core/pointer.js` 신규. 설계 상세는 **02 시스템설계 v3 §4** 참조.

핵심만:
- 손목 랜드마크(15/16)만 사용, Hands 모델 추가 없음
- 활성 박스는 어깨 너비 기준 자동 스케일
- One Euro Filter 필수
- 손을 어깨 위로 들면 활성, 내리면 비활성
- 경계 히스테리시스 12px
- **머무르기 감소율은 `GestureHold`와 동일하게** (`dt × 0.6`)

- [ ] `pointer.js` 구현
- [ ] `focus` / `activate` 이벤트로 마우스·터치 통합
- [ ] 머무르기 링 UI 컴포넌트

> `GestureHold`의 `progress`가 이미 있으므로 링 UI 로직은 재사용 가능.

---

## STEP 7 — 홈 화면

**03 화면설계 v3 §화면1** 대로 구현.

- [ ] 이어서 하기 레일 (좌우, 4개씩 페이지 이동, 가속 없음)
- [ ] 전체 게임 4열 그리드
- [ ] 하단 4칸 바 (맨위·위·아래·맨아래)
- [ ] 카테고리 팝업 (태그 필터)
- [ ] 우상단 계정 + 햄버거
- [ ] 사이드바 없음

---

## STEP 8 — 똥 피하기 개조

> ⚠️ **선행 과제 (기획)** — 똥 피하기는 좌우 3구역 이동 게임이다. 어떤 입력 체계로 갈지 먼저 정해야 한다.
> - (a) `zoneDetector` 유지 — 좌우 이동 그대로
> - (b) `laneDetector`로 교체 — 웜업과 동일 감각으로 통일
> - (c) O/X 이지선다로 재설계 — 게임 규칙 자체를 바꿔야 함
>
> **(b)를 권한다.** 튜닝이 검증돼 있고 게임 규칙을 안 바꿔도 된다.

- [ ] 입력 체계 결정
- [ ] detector 교체
- [ ] 스타트 화면 추가 (O/X)
- [ ] `judge` 이벤트 발행

---

## 브라우저 호환성 ★

### 왜 이제 중요해졌나

v3에서 **"폰이 본체"**로 방향을 잡았다. 아이폰 사용자에게는 **모든 브라우저가 Safari(WebKit)** 다 — iOS의 크롬·파이어폭스도 내부 엔진은 WebKit이라 "크롬으로 우회"가 통하지 않는다.

**Safari는 부차적 대상이 아니라 주 타깃이다.** 지금까지 노트북 크롬으로만 테스트해 왔다면 검증되지 않은 영역이 넓다.

### 코드 점검 결과 — 기본기는 갖춰져 있음

크롬 전용 API는 사용하지 않는다. iOS 필수 대응도 대부분 되어 있다.

| 항목 | 상태 | 비고 |
|---|---|---|
| `playsinline` | ✅ 양쪽 다 있음 | 없으면 iOS에서 영상이 전체화면으로 튄다 |
| `muted` + `autoplay` | ✅ warm-up | 자동재생 차단 회피 |
| AudioContext webkit 폴백 | ✅ 양쪽 다 | `window.webkitAudioContext` |
| Fullscreen webkit 폴백 | ✅ warm-up | `webkitRequestFullscreen` |
| 오디오 언락 (첫 입력 시) | ✅ warm-up | `armFirstInteractionAudioUnlock()` |
| HTTPS | ✅ | Netlify 기본 제공, `getUserMedia` 필수 조건 |

### 남는 위험

| 위험 | 내용 | 대응 |
|---|---|---|
| **WASM SIMD 하한선** | `tasks-vision`은 Safari 16.4+ 필요 | 지원 하한선 명시 + 미지원 시 안내 화면 |
| **`delegate: 'GPU'`** | Safari WebGL 성능이 크롬보다 낮음. 프레임이 떨어지면 반응속도 측정이 부정확해진다 | **CPU 폴백 분기 추가** |
| **레거시 Solutions API** | Safari 호환 이슈가 있어도 수정 안 됨 | STEP 4-0에서 제거 |
| **iOS 저사양 기기** | 카메라 + AI + 미러링 동시 구동 시 발열·스로틀링 | 충전 연결 안내, 프레임 하한 감지 |

### 실기기 테스트 매트릭스

**STEP 1과 STEP 9의 검증 항목에 포함시킨다.** 코드 리뷰로는 확인할 수 없는 영역이다.

| 기기 | 브라우저 | 확인 항목 |
|---|---|---|
| 아이폰 (최신) | Safari | 카메라·O/X 인식·가로 모드·프레임 |
| 아이폰 (구형) | Safari | **지원 하한선 확인용** |
| 안드로이드 | Chrome | 카메라·프레임 |
| 맥 | Safari | 데스크톱 Safari 동작 |
| 맥·PC | Chrome | 기준선 (현재 유일하게 검증된 환경) |

체크 항목:
- [ ] 카메라 권한 요청이 뜨는가
- [ ] 영상이 전체화면으로 튀지 않는가 (`playsinline`)
- [ ] O/X 인식률이 크롬과 비슷한가
- [ ] 프레임이 20fps 이상 유지되는가
- [ ] 오디오가 첫 터치 후 나오는가
- [ ] 20분 연속 플레이 시 발열·스로틀링 정도
- [ ] 미러링(AirPlay) 중에도 카메라가 유지되는가

> 마지막 항목이 특히 중요하다. **AirPlay 미러링과 카메라 동시 사용**은 티어 B의 전제인데 검증된 적이 없다.

---

## STEP 9 — 배포 전환

- [ ] 통합본을 Netlify 프리뷰로 배포, 실기기 검증 (폰 가로 + 미러링)
- [ ] `main` 머지
- [ ] 웜업 Render 배포는 **1주일 더 유지** 후 중단
- [ ] `warm-up-web/` → `_archive/`

---

## 작업 순서 요약

```
0  기록 백업 + 폴더 정리        ← 즉시
1  한 저장소로 합치기 (동작 동일) ← 가장 위험 · Safari 검증 여기서
2  허브 껍데기 (목록 → 실행)
3  멀티디바이스 제거 (game.js)   ← 가장 김
4  포즈 엔진 통합 + MediaPipe 통일 ← 작업량 큼
5  게임팩화
6  손 포인터
7  홈 화면
8  똥 피하기 개조               ← 기획 선행 필요
9  배포 전환
```

**작업량이 큰 세 구간**: STEP 1(에셋 경로 89개), STEP 3(`game.js` 2190줄), STEP 4(MediaPipe 세대 교체).

**STEP 1의 검증을 통과하기 전에는 절대 다음으로 넘어가지 않는다.** 두 게임이 한 저장소에서 예전처럼 돌아가는 상태가 모든 이후 작업의 기준점이다.

---

## 진행 상황

| STEP | 내용 | 상태 |
|---|---|---|
| 0 | 기록 백업 (Render 0건 / 로컬 33건) | ✅ |
| 0 | 폴더 정리 (`_archive/`) | ⬜ |
| **1** | **통합 준비** | 🔶 **진행중** |
| 1-2 | 웜업 파일 이관 · 에셋 경로 (89개 전부 200) | ✅ |
| 1-3 | 임시 라우트 (`warmupLegacy.js`, `legacy-shell.js`) | ✅ |
| 1-3 | 크롬 — 화면 전환 · 콘솔 0 · 회귀 | ✅ |
| 1-3 | 크롬 — 키보드 모드 완주 | ⬜ |
| 1-3 | 크롬 — 모션 모드 (몸 필요) | ⬜ |
| 1-3 | **Safari 완주 검증** | ⬜ |
| 1-4 | 마이그레이션 SQL · stats.js · 임포트 스크립트 | ✅ |
| 1-4 | Supabase 002 실행 + 33건 임포트 | ✅ |
| 1-5 | 저장 누락 3건 수정 (미션완료 · duration · 이탈) | ✅ |
| 1-5 | 키보드 모드 저장 검증 | ✅ |
| 1-5 | 모션 모드 검증 (몸 필요) | ⬜ |
| 1-6 | 키보드 모드 기록 분리 (`input_mode`) | ✅ |
| 1-6 | Supabase 003 실행 + 분리 확인 | ✅ |
| 2 | 허브 껍데기 | ⬜ |
| 3 | 멀티디바이스 제거 | ⬜ |
| **4** | **포즈 엔진 통합** (+MediaPipe 통일) | ⬜ **작업량 상향** |
| 5 | 게임팩화 | ⬜ |
| 6 | 손 포인터 | ⬜ |
| 7 | 홈 화면 | ⬜ |
| 8 | 똥 피하기 개조 | ⬜ |
| 9 | 배포 전환 | ⬜ |

### 다음에 할 일

> **STEP 1의 데이터 파이프라인은 검증 완료.** 남은 것은 몸·기기가 필요한 검증 두 가지.

**1. 모션 모드 검증** — 카메라 켜고 한 판. 이게 `exercise_summary`의 첫 줄이 되고 플레이 제라의 실질적인 운동 데이터 1호가 된다.

```sql
SELECT * FROM exercise_summary;   -- 지금은 비어 있음이 정상
```

**2. Safari 검증** — Netlify 프리뷰 배포 필요 (아이폰은 HTTPS 필수라 로컬 `npm run dev`로는 카메라가 안 열린다)

**3. STEP 2 허브 껍데기** — 위 둘과 병행 가능

---

### 검증용 쿼리 모음

```sql
-- 모드별 현황
SELECT * FROM play_summary_by_mode;

-- 실제 운동 데이터 (motion만)
SELECT * FROM exercise_summary;

-- 최근 기록
SELECT played_at,
       extra_data->>'input_mode'        AS 모드,
       extra_data->>'duration_sec'      AS 플레이초,
       extra_data->>'active_sec'        AS 활동초,
       extra_data->'exercise'->>'jumps' AS 점프,
       extra_data->>'run_id'            AS run_id
FROM game_results
WHERE game_id = 'warmup-obstacle'
ORDER BY played_at DESC LIMIT 5;

-- 중복 저장 확인 (비어 있어야 정상)
SELECT extra_data->>'run_id' AS run_id, count(*)
FROM game_results
WHERE game_id = 'warmup-obstacle' AND extra_data ? 'run_id'
GROUP BY 1 HAVING count(*) > 1;

-- 임포트 vs 실제 플레이
SELECT count(*) FILTER (WHERE extra_data ? 'legacy_id')     AS 임포트,
       count(*) FILTER (WHERE NOT extra_data ? 'legacy_id') AS 실제플레이
FROM game_results WHERE game_id = 'warmup-obstacle';
```

브라우저 콘솔에서 큐 상태:

```js
JSON.parse(localStorage.getItem('pz_pending_records') || '[]')
```

| 테스트 | 기대 결과 |
|---|---|
| 키보드로 5레벨 완주 | 행 +1, `completed = true` |
| `duration_sec` vs `active_sec` | 둘이 비슷해야 함 (메뉴 시간 제외됐으므로) |
| 플레이 중 탭 닫기 → 재접속 | 콘솔 `[stats] 큐 1건 전송 완료`, 행 +1 |
| 플레이 중 홈으로 이동 → 재접속 | 위와 동일 |
| 플레이 중 다른 탭 보다가 돌아와 완주 | 행 **+1만** (부분 기록이 남으면 안 됨) |
| 아무것도 안 하고 종료 | 행 증가 없음 (의도된 동작) |

큐 상태는 브라우저 콘솔에서 직접 볼 수 있다:

```js
JSON.parse(localStorage.getItem('pz_pending_records') || '[]')
```

`run_id`로 중복 여부도 확인 가능:

```sql
SELECT extra_data->>'run_id' AS run_id, count(*)
FROM game_results WHERE game_id = 'warmup-obstacle'
  AND extra_data ? 'run_id'
GROUP BY 1 HAVING count(*) > 1;
```

결과가 비어 있어야 정상이다 (같은 판이 두 번 저장된 게 없음).

**2. 모션 모드 검증** — 공간 될 때

**3. Safari 검증** — Netlify 프리뷰 배포 필요 (아이폰은 HTTPS 필수라 로컬 `npm run dev`로는 카메라가 안 열린다)

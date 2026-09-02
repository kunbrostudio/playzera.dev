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

## STEP 2 — 허브 껍데기 ✅ 코드 작성 완료

목표: 게임 목록에서 두 게임을 골라 실행하고 돌아올 수 있게. **디자인은 나중.**

### 2-1. registry 확장 ✅

`entry` 필드를 추가했다. 게임팩 인터페이스 통일(STEP 5) 전까지는 게임마다 진입 경로가 다르기 때문이다 — 허브가 그 차이를 알 필요는 없고, registry만 알면 된다.

```js
export const GAME_REGISTRY = {
  'poop-dodge': {
    manifest: poopDodgeManifest,
    entry: '/intro?id=poop-dodge',
    intro: () => import('./poop-dodge/intro.js'),
    load:  () => import('./poop-dodge/game.js'),
  },
  'warmup-obstacle': {
    manifest: warmupManifest,
    entry: '/warmup',
    load:  () => import('./warmup-obstacle/main.js'),
  },
}
export const getAll   = () => …            // status !== 'hidden'인 manifest 목록
export const getEntry = id => …            // 허브 목록에서 쓸 진입 라우트
```

STEP 5 이후 `/play?id=...` 하나로 합쳐지면서 `entry`·`intro`는 사라진다.

### 2-2. manifest 통일 ✅

`emoji`/`minAge`/`maxAge`는 **어디서도 참조되지 않고 있었다**(`grep "manifest\."` 결과 실사용은 `manifest.rounds` 하나뿐). 그래서 규격 교체에 따르는 수정 작업이 없었다.

`rounds`는 v3 규격에 없지만 `game.js`가 실제로 쓰므로 게임별 확장 필드로 남겼다.

- [x] 두 manifest를 v3 규격으로 통일 (`warmup-obstacle/manifest.json` 신규)
- [x] `emoji`/`minAge` 참조 수정 — **불필요했음** (사용처 없음)

> 썸네일은 `title.png`가 아니라 실제 파일명인 `fx_title_screen.png`.

### 2-3. home.js를 임시 목록으로 ✅

242줄짜리 스플래시는 **지우지 않고** `src/games/poop-dodge/intro.js`로 옮겼다. 에셋·연출이 이미 만들어져 있고 게임팩 소유가 맞는 화면이다. 좌상단에 "← 게임 목록" 버튼만 추가했다.

`home.js`는 `getAll()`을 도는 카드 목록으로 새로 썼다.

- [x] home.js 교체 (썸네일 + 제목 + 설명 + 연령·태그)
- [x] 게임 → 홈 복귀 동선

### 2-4. ★ 라우터에 정리 훅 (`onLeave`)

계획에 없던 작업. **웜업이 재진입되지 않는 문제** 때문에 필요해졌다.

기존 `main.js`는 모듈 최상단에서 DOM을 잡고 IIFE로 부팅했다. 모듈 캐시가 남아 허브 → 웜업 → 허브 → 웜업으로 다시 들어오면 아무 일도 일어나지 않았고(새로고침 필요), 웹캠·rAF·`window` 리스너도 그대로 살아 있었다.

`main.js`를 `boot()` / `destroy()`로 재구성했다.

| 새던 자원 | 정리 방법 |
|---|---|
| `window`/`document` 리스너 | `AbortController` signal 일괄 해제 |
| 렌더 rAF | `rafId` 저장 → `cancelAnimationFrame` |
| 레벨 대기 `setInterval` | `timers` Set에 등록 → 일괄 clear |
| 웹캠 스트림 | `poseEngine.release()` — **`stop()`은 루프만 멈출 뿐 트랙은 살아 있었다** |
| 대기 중인 화면 Promise | `screens.abortScreens()` |

정리 시점은 페이지가 각자 `hashchange`를 듣는 방식으로는 잡히지 않는다. 라우터의 리스너가 먼저 등록돼 있어 **이미 `#app`을 비운 뒤에** 정리가 돌기 때문이다. 라우터가 렌더 직전에 직접 부르도록 `onLeave(fn)`를 뒀다.

```js
// pages/warmup.js
onLeave(() => { destroy(); unmountWarmupStyle() })   // boot()보다 먼저 등록
await boot()
```

**두 가지 미묘한 지점**

- `gameFlow`의 모든 `await` 뒤에 `if (!running) return`. `abortScreens()`가 대기 Promise를 즉시 resolve시키므로, 확인이 없으면 이미 사라진 DOM을 상대로 다음 단계를 진행한다.
- `destroy()`에서 `stats`·`poseEngine`을 **`null`로 밀지 않는다.** 위 `return`에 닿기 전 마이크로태스크가 이들을 건드릴 수 있다. 다음 `boot()`이 어차피 새로 만든다.

### 2-5. ★ 홈 화면 · BGM 동선 · 웜업 허브 버튼

임시 텍스트 목록을 보고 나서 정리한 세 가지.

**① 홈을 설계 레이아웃으로** — 껍데기를 두 번 만들 이유가 없어 STEP 7 §화면1을 앞당겼다. 상세는 아래 STEP 7 절.

**② BGM은 허브에서 나오지 않는다**

허브에서 똥 피하기 BGM이 흘러나오고 있었다. `bgm.js`가 `_currentSrc`를 모듈 수준에 들고 있어서, 게임을 한 번 하면 그 곡이 그대로 남고 홈에서 `play()`를 부르는 순간 이어서 재생된다.

| 화면 | BGM |
|---|---|
| 허브 홈 | **없음** — 진입 시 `bgm.stop()` |
| 똥 피하기 인트로 | `bgm.load('poop-dodge')` → `play()` |
| 똥 피하기 플레이 | 기존 그대로 |
| 웜업 | 자체 BGM(`bgm_strawberry_lane`), 진입 시 허브 BGM `stop()` |

게임의 BGM 시작점은 **스플래시**다. 게임의 첫 화면이 곧 게임이다.

**③ 웜업에도 허브 복귀 버튼**

똥 피하기 스플래시에만 있었다. `legacy-shell.js` 좌상단에 `#btn-hub`를 추가하고 `setInPlayUi(on)`으로 종료 버튼과 **배타적으로** 토글한다.

플레이 중에는 허브 버튼을 숨긴다. 열어두면 종료 확인 플로우를 건너뛰고, 그 경로에 있는 `stats.save()`도 함께 건너뛰기 때문이다. (`destroy()`의 `queueOnExit`이 받아주긴 하지만 "저장됐다"는 피드백 없이 사라지는 건 다른 문제다.)

### 2-6. 라우트 구조

```
/            home.js     게임 목록 허브
/intro?id=   intro.js    게임별 스플래시 (registry의 intro 로더 호출)
/game?id=    game.js     똥 피하기 (기존 그대로)
/warmup      warmup.js   웜업 게임팩
/control     ❌ STEP 3에서 삭제
/camera      ❌ STEP 3에서 삭제
```

`/warmup-legacy`와 `pages/warmupLegacy.js`는 제거됐다. `legacy-shell.js`는 STEP 5까지 유지.

**검증 기준**

- [x] `npm run build` 통과 (83 modules)
- [ ] 홈에서 두 게임 각각 실행 → 완주 → 홈 복귀
- [ ] **웜업 두 번 연속 실행** — 새로고침 없이 타이틀부터 다시 시작되는가
- [ ] 웜업에서 나올 때 **카메라 표시등이 꺼지는가** (`release()` 확인)
- [ ] 재진입 후 방향키가 **한 번만** 먹는가 (리스너 중복 확인)
- [ ] 재진입 후 캐릭터 속도가 정상인가 (rAF 중복 확인)
- [ ] 웜업 플레이 중 홈으로 나가기 → 재진입 시 큐 전송 확인 (`[stats] 큐 1건 전송 완료`)
- [ ] 허브 BGM(Kingdom)과 웜업 BGM(strawberry lane)이 겹치지 않는가

---

## 자동 테스트 ★

```bash
npm test          # 1회 실행
npm run test:watch
```

Vitest + jsdom. **순수 로직만** 본다. 61건.

| 파일 | 지키는 규칙 |
|---|---|
| `test/recent.test.js` | 중복 제거·최신순·최대 8건·깨진 localStorage 방어 |
| `test/catalog.test.js` | NEW 배지 경계·카테고리 집계·히어로 정렬·페이지 수학·페이지 기억 |
| `test/stats.test.js` | game_results 매핑·멱등 저장·`input_mode` 분리·이탈 큐·`flushPending` |

**Supabase는 부르지 않는다.** `gameResult.js`를 모킹한다 — 테스트 기록이 실제 DB에 쌓이면 운동 통계가 오염된다.

**왜 순수 로직만인가** — 지금 UI는 매일 바뀐다. 여기에 촘촘한 UI 테스트를 깔면 관리 비용이 개발보다 커진다. 반면 위 세 파일이 지키는 것은 **틀려도 화면에 안 보이고 데이터만 조용히 오염되는 종류**다. 그래서 값이 싸고 효과가 크다.

이 테스트를 붙이려고 `src/core/catalog.js`를 새로 만들었다. 페이지 구성 규칙이 DOM·타이머·라우터와 섞인 `home.js` 안에 있으면 "이어서 하기가 낀 뒤에도 보던 줄에 남는가" 같은 것을 확인할 방법이 없다.

### 자동화되지 않는 것

| 영역 | 이유 |
|---|---|
| 포즈 인식 정확도 | 실제 사람의 움직임이 필요하다 |
| 프레임·발열 | 실기기에서만 측정된다 |
| iOS Safari | 시뮬레이터로는 카메라·자동재생 동작이 다르다 |
| 레이아웃·CSS | 브라우저가 실제로 그려야 안다 |

**브라우저 자동화(Playwright)를 붙이면** 콘솔 에러 0 · 재진입 시 리스너 중복 · rAF 중복 · 카메라 트랙 미해제 · 페이징/필터/선택까지 자동화된다. STEP 2 검증 체크리스트의 상당 부분이 여기 해당한다. 구조가 안정되면 도입한다.

> 카메라도 Chromium의 `--use-file-for-fake-video-capture`로 영상 파일을 웹캠 대신 물릴 수 있다. 다만 **사람이 점프하는 실제 영상**을 픽스처로 찍어둬야 의미가 있다.

---

## STEP 3 — 멀티디바이스 제거 ✅ 코드 작업 완료

가장 코드량이 많지만 **전부 삭제**라 위험도는 낮다.

### 결과

| | 이전 | 이후 |
|---|---|---|
| `src/pages/game.js` | 2190줄 | **688줄** |
| 삭제 파일 | — | `core/channel.js` · `pages/control.js` · `pages/camera.js` |
| 프로덕션 번들 | 345 kB | **278 kB** (Realtime 웹소켓 코드가 통째로 빠짐) |
| `grep -c channel src/` | 20곳 이상 | **0** (주석 1줄만) |

**지운 함수** — `showModeSelection` · `showSessionEntry` · `showRoleSelection` · `_roleCard` · `showMonitorView` · `showControllerView` · `showWebcamView` · `genSession`

**남긴 것** — 모바일 가로 코치마크 · 솔로 게임 · 이름 입력

### 새 진입 흐름

```
홈 → 인트로 → (시작) → 이름 입력 → 플레이
```

"혼자 하기 / 여러 대로 하기" 선택 화면이 사라졌다. 허브가 생긴 뒤로는 맞지 않는 단계였다.

**뒤로 나가는 곳은 허브가 아니라 그 게임의 인트로다.** 한 단계씩 되짚어야 "잘못 눌렀다" 싶을 때 되돌아가는 비용이 작다.

### 곁들여 정리한 것

- **정리 시점을 `onLeave`로 옮겼다.** `game.js`도 `hashchange`를 직접 듣고 있었다 — 라우터 리스너가 먼저 걸려 있어 이미 `#app`을 비운 뒤에 `poseEngine.destroy()`가 돌았다. 웹캠을 늦게 끊으면 다음 화면에서 카메라 표시등이 남는다. (웜업에서 이미 겪은 것과 같은 문제.)
- 나가기 버튼들이 각자 정리 코드를 복사해 갖고 있었다. `onLeave` 하나로 모으고 버튼은 `navigate()`만 한다.
- `session_id`는 여러 대를 묶던 값이라 `null`로 저장한다. 002 마이그레이션에서 nullable로 완화해둔 것이 여기서 쓰인다.
- `getTodayResults(sessionId)` 삭제 — 컨트롤러 화면 전용이었고 `session_id`로 묶는다는 전제가 사라졌다.

### 3-1. 파일 삭제

- [x] `src/core/channel.js`
- [x] `src/pages/camera.js`
- [x] `src/pages/control.js`

### 3-2. `src/pages/game.js` 정리

- [x] import 및 전 참조 제거
- [x] 역할 선택 UI 블록 삭제
- [x] 라우터에서 `/control`, `/camera` 제거
- [x] `session` 쿼리 파라미터 의존 제거
- [x] QR 라이브러리 의존 — **없었다** (세션 코드를 텍스트로만 표시하고 있었음)

> 초안은 "한 번에 다 지우지 말고 역할 선택 → 메시지 수신 → presence 순으로 나눠서"였다. 실제로는 **함수 단위로 통째로 잘라내는 편이 안전했다.** 지울 대상이 `showModeSelection`·`showSessionEntry`·`showRoleSelection`·`showMonitorView`·`showControllerView`·`showWebcamView` 여섯 덩어리로 이미 나뉘어 있었고, 남길 것(`showOrientationCoach`·`showSoloGame`·`_askPlayerName`)이 이들을 전혀 참조하지 않았다. 참조를 하나씩 지우는 방식이었다면 중간 상태마다 반쯤 부서진 코드가 남았을 것이다.

**검증 기준**
- [x] `grep -c "channel" src/` → **0** (주석 1줄만)
- [x] 빌드 통과 · 테스트 61건 통과
- [ ] 똥 피하기 실행 → 플레이 → 결과까지 정상 **(브라우저 확인 필요)**
- [ ] 네트워크 탭에 Realtime 웹소켓 없음 **(브라우저 확인 필요)**
- [ ] 게임에서 나갈 때 카메라 표시등이 꺼지는가 (`onLeave` 이관 확인)

---

## 똥 피하기 개선 ★ (STEP 8 일부 선반영)

STEP 3 직후 플레이해보고 나온 세 가지.

### ① PIP에 스켈레톤 + 3분할 라인

영상만 띄우면 자기 모습은 보이지만 **어느 칸에 서 있는지**가 안 보인다. 경계선과 현재 칸을 함께 그리면 "선을 넘으면 칸이 바뀐다"가 한눈에 읽힌다.

`src/core/pose/pipOverlay.js` 신규. PIP도 120×90 → 200×150으로 키웠다.

| 그리는 것 | 이유 |
|---|---|
| 3분할 점선 | 칸 경계 |
| 현재 칸 색 채우기 | 지금 어디 있는지 |
| 스켈레톤 (몸통·팔다리) | 인식되고 있다는 확인 |
| 골반 중심 흰 원 | **칸 판정의 기준점** — 이게 보여야 "왜 안 바뀌지"를 이해한다 |

> ⚠️ 오버레이 캔버스에는 `scaleX(-1)`을 걸지 않는다. `selfieMode: true`라 랜드마크 x가 이미 거울 좌표이고 영상은 CSS로 뒤집혀 있어 둘이 같은 좌표계다. 여기에 반전을 또 걸면 좌우가 어긋난다. **STEP 4에서 `selfieMode`가 사라지면 이 지점을 다시 확인해야 한다.**

얼굴 랜드마크는 그리지 않는다 — 작은 PIP에서 뭉쳐 보이기만 한다.

### ② 나가는 곳: 허브가 아니라 인트로

게임이 끝나면 허브까지 튕겨나가고 있었다. 같은 게임을 한 판 더 하는 게 다른 게임을 고르는 것보다 훨씬 잦은데, 매번 두 단계를 되짚어야 했다.

| 지점 | 이동 |
|---|---|
| 게임오버 `그만하기` | **인트로** |
| 이름 입력에서 뒤로 | **인트로** |
| 햄버거 `🚪 게임 나가기` | **인트로** |
| 햄버거 `🏠 게임 목록으로` ★신규 | 허브 |
| 인트로 `← 게임 목록` | 허브 |

**모든 게임에 같은 규칙이다.** 웜업은 이미 이 구조였다 — 종료·게임오버가 자기 타이틀로 돌아가고, 타이틀에만 허브 버튼이 있다.

목적지는 `registry`의 `entry`에서 읽는다. 게임마다 하드코딩하지 않는다.

### ③ 똥이 플레이어 자리로 떨어진다

무작위로 떨어뜨리면 **가만히 서 있어도 3분의 2는 그냥 지나간다.** 운동이 목적인 게임에서 "안 움직여도 되는 순간"이 대부분이면 앉은 자세로 게임이 끝난다.

기본값을 `playerZone`으로 바꿨다. 규칙이 단순해서 아이에게도 설명이 필요 없다 — 오면 옆으로 비킨다.

**다만 도망갈 칸은 반드시 남긴다.** 다른 두 칸에 이미 떨어지는 중인데 남은 한 칸까지 겨누면 어디로 가도 맞는다. 그건 반응이 아니라 운이다. `_pickZone()`이 이 경계를 지키고, `test/poopDodge.test.js`가 그걸 검증한다.

### ④ 카메라 미해제 — 게임 사이를 넘어가는 버그 ⚠️

**증상** — 똥 피하기를 하고 나와 웜업에 들어가면 "카메라를 사용할 수 없어요"가 뜬다. 크롬 사이트 정보에는 카메라가 **"지금 사용 중"**으로 표시된다.

**원인** — `camera_utils`의 `Camera.stop()`은 프레임 루프만 멈춘다. `video`에 물린 MediaStream 트랙은 그대로 살아 있다. 그래서 똥 피하기를 나와도 웹캠이 잡힌 채로 남고, 웜업의 `getUserMedia`가 **이미 열려 있는 장치를 다른 해상도(640×360 16:9)로** 요청하다 실패한다.

> 웜업 쪽에서 이미 같은 성격의 버그를 고쳤었다(STEP 2, `poseEngine.release()`). `stop()`이 트랙을 안 끊는다는 게 **라이브러리를 가리지 않는 공통 함정**이라는 뜻이다. STEP 4에서 tasks-vision으로 통일할 때도 이 지점을 반드시 확인한다.

**고친 것** — `core/pose/poseEngine.js`가 video 참조를 들고 있다가 `stop()`에서 트랙을 직접 끊는다.

**곁들여** — 실패 이유를 화면에 구분해 보여준다. 이유마다 할 일이 다른데 한 줄로 뭉뚱그리면 매번 콘솔을 봐야 한다.

| `err.name` | 화면 안내 |
|---|---|
| `NotAllowedError` | 권한이 꺼져 있어요 — 자물쇠에서 허용 |
| `NotReadableError` | 다른 앱·게임이 카메라를 쓰고 있어요 |
| `NotFoundError` | 연결된 카메라를 찾지 못했어요 |
| `OverconstrainedError` | 이 화질을 지원하지 않아요 |
| `SecurityError` | HTTPS가 아니면 열 수 없어요 |

### ⑤ 이름 입력 화면 제거

웜업은 이름을 묻지 않는다. `CONFIG.userId`로 고정값을 쓴다. 똥 피하기만 시작 버튼과 게임 사이에 키보드 입력을 끼워 넣고 있었다.

**4~8세에게 그건 벽이다.** 키보드가 없는 기기라면 더 그렇다. 그리고 매번 손으로 적는 이름은 오타 하나로 다른 사람이 되어 운동 기록이 갈라진다 — 누가 했는지는 결국 계정이 정할 몫이다.

`src/core/player.js` 신규. `getCurrentPlayerName()` 하나만 두고 양쪽 게임이 여기를 본다. 기획안 2단계에서 아이 선택이 들어오면 이 함수만 바꾸면 된다.

> 값은 웜업이 원래 쓰던 `'local-default'` 그대로다. `game_results`에 이미 이 값으로 쌓인 기록이 있어서 규약을 둘로 만들면 안 된다.

새 흐름: `인트로 → 시작 → (모바일이면 가로 안내) → 바로 플레이`

### ⑥ 손동작(O/X) 연결 + 제스처 모듈 공용화

O/X 인식기가 웜업 전용이었다. 똥 피하기에도 붙이면서 정본을 core로 올렸다. **STEP 4-2의 앞부분을 앞당겨 처리한 셈이다.**

```
warmup-obstacle/input/gestureRecognizer.js → src/core/pose/gesture.js
warmup-obstacle/config.js 의 gesture 블록   → src/core/pose/tuning.js
```

로직과 수치는 **한 글자도 바꾸지 않았다.** 웜업 쪽 `gestureRecognizer.js`는 재export만 남겨 import 경로를 유지했고(STEP 4-2에서 제거), `config.js`의 `gesture`는 `tuning.js`를 가리킨다 — 값이 두 벌이면 반드시 어긋난다.

**MediaPipe 통일(4-0)을 기다릴 필요가 없었다.** 판정 함수가 정규화 랜드마크 배열만 받고, Solutions와 tasks-vision이 같은 형식을 주기 때문이다.

**똥 피하기에 연결한 지점**

| 상황 | 손동작 |
|---|---|
| 플레이 중 | X 유지 1.5초 → 잠시 멈춤 |
| 일시정지 | O = 계속하기 · X = 게임 나가기(인트로) |
| 게임오버 | O = 다시 하기 · X = 그만하기(인트로) |
| 인트로·이름 입력 | ❌ 아직 카메라가 안 켜져 있다 → STEP 5 공용 준비 화면 |

플레이 중 손동작을 X 하나로 제한한 이유 — 똥 피하기는 **몸 위치**로 조종하는 게임이다. 팔을 벌려도 골반은 안 움직이니 칸 판정과 겹치지 않지만, 손동작을 늘릴수록 겹칠 여지가 생긴다.

> **발동 직후 1.2초 입력을 닫는다.** 없으면 이렇게 된다 — X를 1.5초 유지해 일시정지가 열렸는데 팔은 아직 엇갈린 채다. 다음 프레임부터 메뉴의 X(게임 나가기)가 다시 쌓여 1.5초 뒤 그대로 나가버린다. 팔을 내릴 시간을 주고 "팔을 내려주세요"라고 말해준다.

`test/gesture.test.js` 15건 — O가 머리 위를 요구하고 X는 요구하지 않는 것, 발목이 안 보여도 X가 잡히는 것, `dt × 0.6` 감소율까지 고정했다.

> 난이도가 실질적으로 올라갔다. 라운드 5(1.2초마다 생성)에서 아이가 따라올 수 있는지는 실제로 해봐야 안다. 버거우면 `ROUNDS`의 `spawnMs`를 늘리는 쪽이 맞다 — 조준을 확률로 낮추면 "안 움직여도 되는 순간"이 다시 생긴다.

---

---

## 아이패드 실기기 검증에서 나온 것 ★ (2026-08-04)

### ① 똥 피하기가 운동 데이터를 한 건도 안 남기고 있었다 ⚠️

`exercise_summary`·`play_summary_by_mode` 두 뷰 모두 `WHERE extra_data ? 'exercise'`로 거른다. 똥 피하기는 `extra_data`에 `dodge_count`·`hit_count`만 넣고 있어서 **집계에서 통째로 빠졌다.** 세 판을 했는데 웜업 것만 보였던 이유다.

빠진 것이 세 가지였다.

| | 문제 |
|---|---|
| `exercise` 키 없음 | 두 뷰의 필터에 걸려 제외 |
| `input_mode` 없음 | 모션/키보드를 못 가른다 |
| `active_sec` 없음 | 운동 시간이 0 |

그리고 **셀 몸 동작 자체가 없었다.** `dodgeCount`는 "피한 똥 개수"라 가만히 서 있어도 올라간다. 운동량이 아니다. `setPlayerZone`에서 **실제로 칸을 옮긴 횟수**를 세도록 했다(웜업의 `countSideStep`과 같은 기준).

> 운동 데이터가 플랫폼의 존재 이유인데 게임 하나가 무기여하고 있었다. **새 게임팩을 만들 때 반드시 확인할 항목이다.** STEP 5의 게임팩 인터페이스에 이 스키마를 규격으로 못 박아야 한다.

`active_sec`도 라운드 배너·카운트다운을 뺀 실제 플레이 시간만 센다 — 웜업에서 `duration_sec`에 메뉴 시간이 섞였던 실수를 반복하지 않는다.

### ② 하단 4칸 바가 손으로는 영원히 눌리지 않았다 ⚠️

활성 박스 하단이 `BOX_BOTTOM = 0.5`(어깨 아래 0.5×어깨너비)인데 커서가 꺼지는 기준은 `RAISE_OFF = 0.30`이었다. **박스 아래쪽에 닿기 전에 커서가 먼저 꺼진다.**

```
도달 가능 범위 = (0.30 + 1.7) / (0.5 + 1.7) = 90.9%
→ 화면 아래 9.1%가 사각지대
→ 하단 4칸 바 높이가 정확히 그 자리(7vh)
```

`BOX_BOTTOM 0.45` / `RAISE_OFF 0.85`로 조정했다. 팔을 완전히 내리면 lift가 -1.4 근처까지 가므로 "쉬는 자세"와는 여전히 구분된다. 바 높이도 `clamp(64px, 9vh, 96px)`로 키웠다 — 03 설계의 최소 타겟 96×96을 세로로도 지킨다.

> **두 상수가 서로를 제약한다는 걸 코드가 말해주지 않았다.** 주석으로 관계를 명시해뒀다.

### ③ 손 제스처 플로우 — 두 번 조준은 너무 멀다

마우스에서는 "카드 클릭 → 히어로 확인 → 시작하기"가 자연스럽다. 손에서는 아니다. **팔을 두 번 조준하는 동안 아이는 이미 지친다.**

| 입력 | 카드 위에 올림 | 확정 |
|---|---|---|
| 마우스 | 히어로 즉시 변경 | 클릭 = 선택 → 시작하기로 실행 |
| 손 포인터 | 히어로 즉시 변경 | **머무르기 완료 = 바로 실행** |

이미 1.2초를 겨눴다는 것 자체가 충분히 분명한 의사표시다.

구현은 커스텀 이벤트로 갈랐다.

- `pz-pointer-enter` — 커서가 대상에 진입. 마우스의 `mouseenter`에 대응
- `pz-dwell` — 머무르기 완료. **cancelable**이라 화면이 가로채면 `click()`을 보내지 않는다

포인터 코드는 "손일 때 다르게 굴어야 하는 곳"을 알 필요가 없다. 화면이 필요하면 가로챈다.

**마우스를 올리기만 해도 히어로가 바뀐다.** "이게 무슨 게임이지"를 누르기 전에 확인할 수 있어야 한다.

---

## STEP 4 — 포즈 엔진 통합

### 4-0. MediaPipe 라이브러리 통일 ✅ 코드 작업 완료

**결과**

| | 이전 | 이후 |
|---|---|---|
| 라이브러리 | 게임마다 다름 (Solutions / tasks-vision) | **tasks-vision 하나** |
| 좌표계 | 게임마다 다름 | **거울 좌표 하나** |
| 로드 방식 | `<script>` 태그 + `window.Pose` | ES module `import()` |
| 카메라 | `camera_utils` | `getUserMedia` 직접 |
| 엔진 파일 | core 105줄 + 웜업 167줄 | core 1개 + 웜업 어댑터 63줄 |

**핵심은 좌표계였다.** 이전에는 똥 피하기가 `selfieMode`로 거울 좌표를, 웜업이 원본을 받아 `motionDetector` 안에서 `1 - hip.x`로 뒤집었다. **이 상태로 엔진을 합치면 한쪽은 반드시 좌우가 뒤집힌다.**

엔진이 한 번만 뒤집어 내보내도록 했다. 구독자는 뒤집을 필요도, 기억할 필요도 없다.

```
카메라 원본 → (1 - x) → EMA 스무딩 → 구독자
```

> 반전을 스무딩보다 **먼저** 한다. 순서를 바꾸면 스무딩 버퍼에는 원본이, 구독자에게는 반전값이 가서 두 좌표계가 한 배열 안에 섞인다.

**걷어낸 반전은 두 곳뿐이었다** — `motionDetector`의 `1 - hip.x`, 웜업 `poseEngine`의 스켈레톤 드로잉. `gesture.js`는 좌우 **순서**를 비교하고 `poseMatcher.js`는 각도 + 미러 채점이라 둘 다 반전에 무관하다.

**조사하며 나온 것**

`core/pose/detectors/`의 `jumpDetector` · `squatDetector` · `runDetector`는 **아무도 쓰지 않았다.** 플러그형 구조를 만들며 미리 넣어두고 연결하지 않은 것들이라 삭제했다. 실제로 쓰이던 건 `zoneDetector` 하나다.

**곁들여**

- **GPU → CPU 폴백.** delegate 생성이 실패하면 CPU로 재시도한다. Safari WebGL이나 저사양 기기에서 여기서 포기하면 "카메라를 사용할 수 없어요"가 되지만, CPU로도 게임은 돌아간다. 실제로 무엇으로 떨어졌는지는 `poseEngineCore.delegate`에 남는다.
- **`setPaused()`.** 타이틀·결과 화면에서 카메라는 열어둔 채 추론만 쉰다. 껐다 켜면 권한 표시등이 깜빡이고 재시작이 느리다.
- **에러를 삼키지 않는다.** `start()`가 실패 이유를 그대로 던지고, 양쪽 게임이 `NotAllowedError`/`NotReadableError` 등을 화면 문구로 바꾼다.
- `pipOverlay`에 `{ zones: false }` — 웜업은 캘리브레이션 기준으로 좌우를 재므로 고정된 3분할 선이 거짓 안내가 된다.

**검증 기준**

- [x] 빌드 통과 · 테스트 94건 통과 (`isFullBodyVisible` · zoneDetector 거울 좌표 12건 추가)
- [x] **똥 피하기: 오른쪽으로 가면 오른쪽 칸** — 반전 이중 적용 없음
- [x] 웜업: 오른쪽으로 가면 캐릭터가 오른쪽 레인
- [x] 웜업 스켈레톤이 몸과 겹쳐 보임
- [x] 두 게임 연속 실행 시 카메라 정상
- [x] 크롬 실기기 확인 완료 (2026-08-02)

> 좌우 반전이 한 번에 맞은 이유 — 뒤집는 지점을 엔진 한 곳으로 몰았기 때문이다. 게임마다 뒤집던 구조였다면 "어디서 뒤집었는지" 조합을 다 확인해야 했다.

---

### 참고 — 이전 계획 (그대로 진행됨)

**이 STEP에서 가장 큰 작업이다.** 두 프로젝트가 서로 다른 세대의 MediaPipe를 쓰고 있어 공존이 불가능하다.

**방향: `tasks-vision`으로 통일** (warm-up 쪽 채택, playzera를 이식)

playzera가 `@mediapipe/pose`의 옵션으로 공짜로 얻던 기능들을 직접 구현해야 한다.

| 잃는 것 | 대체 방법 |
|---|---|
| `selfieMode: true` | warm-up 방식대로 `1 - x` 수동 반전 (poseEngine에서 일괄) |
| `smoothLandmarks: true` | warm-up의 EMA 스무딩 (`emaAlpha: 0.35`) 사용 |
| `window.Camera` 유틸 | `getUserMedia` 직접 호출 (warm-up 코드 그대로) |
| `modelComplexity: 1` | `pose_landmarker_lite` 또는 `_full` 모델 선택 |

- [x] `poseEngineCore`를 tasks-vision 기반으로 재작성 (warm-up `poseEngine.js`가 베이스)
- [x] `<script>` 태그 동적 로드 제거 → ES module import
- [x] `zoneDetector` 등 기존 detector가 반전된 좌표를 받는지 확인
- [x] `camera_utils` 의존 제거

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

- [x] `gesture.js` 이관 (수정 없이 복사 → import 경로만) — **똥 피하기 O/X 붙이며 선처리**
- [x] `tuning.js`로 상수 집약 — 웜업 `config.js`도 여기를 가리킨다
- [ ] 웜업 `input/gestureRecognizer.js` 재export 껍데기 제거 (core 직접 참조로)
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
- [x] **포즈 판정 — 채점이 잘못돼 있었다 (2026-08-04, 아래 참조)**
- [ ] 웜업 게임 플레이 감각이 이관 전과 동일 (레인·점프·숙이기·포즈)

### 포즈가 인식되지 않던 이유 ★ — 자세가 아니라 채점이 문제였다

"웹캠으로 하면 포즈 장애물이 인식이 안 된다"는 제보. 원인은 **관절 채점이 완벽한 자세를 감점하고 있었던 것**이다.

목표각이 이렇게 잡혀 있었다.

```
lElbow  목표 165° ± 30    ← "팔을 펴라"
lKnee   목표 172° ± 20    ← "다리를 펴라"
```

그런데 채점은 `|현재각 - 목표각|`, 즉 **양방향**이었다. 관절은 180°에서 멈추므로 팔을 아무리 쭉 펴도 180°인데, 그게 목표 165°에서 15° 벗어난 것으로 계산됐다.

```
쭉 편 팔  180°  →  |180-165|/30 = 0.50점
쭉 편 다리 180°  →  |180-172|/20 = 0.60점
```

그래서 **기하학적으로 완벽한 T포즈가 0.696점** — 기준 0.75를 못 넘었다. 아이가 자세를 아무리 정확히 잡아도 통과할 수 없는 상태였다.

`'min'` 판정을 추가했다 — **목표를 넘긴 만큼은 감점하지 않는다.** "더 펴라"는 요구를 초과 달성했다고 깎을 이유가 없다. 굽히는 관절(런지 앞무릎 105°, 상체 숙이기 고관절 75°)은 양쪽 다 의미가 있으므로 양방향 그대로 뒀다.

```
완벽한 T포즈  0.696 → 0.941
```

**임계값(0.75)은 건드리지 않았다.** 기준을 낮추면 잘못된 자세도 통과한다 — 운동 데이터가 목적인 서비스에서 그건 숫자만 늘리는 짓이다. 고칠 것은 기준이 아니라 자를 재는 방식이었다.

`test/poseMatcher.test.js`가 이 규칙을 지킨다. 특히 **"목표가 150°를 넘는 관절은 전부 min이어야 한다"** — 새 포즈를 추가할 때 같은 함정에 다시 빠지는 걸 막는다.

**곁들여 고친 것**

- 점수를 넣는 시점이 어긋나 있었다. `activePoseType`을 `run.update()` **전에** 읽어서, 포즈 구간에 막 들어선 프레임에는 활성 포즈를 모르는 채로 0점이 들어갔다. 이제 `run`이 `poseScoreFn`으로 **자기가 아는 시점에** 직접 물어본다.
- **진단 오버레이**(`input/poseDebug.js`). `#/play?id=warmup-obstacle?debug=pose`로 켜면 관절별 점수·현재각·목표각이 실시간으로 뜬다. "인식이 안 된다"는 그 자체로는 고칠 수 없는 정보다 — 랜드마크가 없는 건지, 다리가 프레임 밖인지, 기준이 빡빡한 건지가 이 화면에서 갈린다.

### 사인판 그림과 판정이 다른 동작이었다 ★

`forwardbend` 사인판과 캐릭터 그림은 둘 다 **옆구리 늘리기**다(한 팔을 머리 위로 넘기고 몸통을 옆으로 기울인다). 그런데 코드는 **상체를 앞으로 접기**(고관절 75°)를 보고 있었다.

옆구리를 늘리면 고관절이 150~175°다. 목표 75°에서 완전히 벗어나 **0점** — 아이가 그림대로 정확히 해도 통과할 수 없었다.

**그림이 정답이다.** 그림을 코드에 맞추는 게 아니라 코드를 그림에 맞췄다. 판정의 핵심은 **비대칭 + 기울기**다.

| | 목표 | 판정 |
|---|---|---|
| `torsoTilt` | 22° 이상 | 몸통이 옆으로 기울었나 (가중치 최대) |
| `lShoulder` | 130° 이상 | 위로 넘긴 팔 |
| `rShoulder` | 35° 이하 | 내린 팔 |
| 무릎 | 172° 이상 | 다리는 곧게 |

셋이 **동시에** 맞아야 한다. 기울이지 않고 팔만 들면 `torsoTilt` 0점, 기울이기만 하면 `lShoulder` 0점이다. 운동이 안 되는 통과를 막는 게 목적이다.

> 키 이름 `forwardbend`는 그대로 뒀다 — 에셋 파일명(`obs_sign_stretch_forwardbend.png` 등)이 이 이름이다. 코드에 경고 주석을 남겼다.

**`torsoTilt`를 새로 넣었다.** 관절각만으로는 "서 있음"과 "옆으로 기움"을 구별할 수 없다. 몸통(어깨 중점→골반 중점)이 수직에서 몇 도 벗어났는지가 이 동작의 본질이다.

### 화면 비율 보정 ★ — 각도가 찌그러져 있었다

랜드마크의 x는 **가로 폭**으로, y는 **세로 높이**로 각각 0~1 정규화된다. 16:9면 x 1.0이 y 1.0보다 1.78배 긴 거리다. **그 좌표로 잰 각도는 가로로 눌린 만큼 틀리다.**

```
같은 옆구리 늘리기의 몸통 기울기
  보정함  21.0°   ← 실제 각도
  보정안함 12.2°   ← 계산상 각도
```

축에 나란한 자세(T포즈: 팔 수평 + 몸통 수직)는 우연히 영향이 없어서 오래 안 보였다. **비스듬한 자세는 통째로 어긋난다** — 옆구리 늘리기도 런지도 전부 여기 해당한다.

`jointAngles`가 x에 프레임 비율을 곱해 실제 비율로 되돌린 뒤 잰다. 비율은 `poseEngineCore.frameAspect`가 실제 트랙 해상도에서 읽어온다. 이제 **카메라가 16:9든 4:3이든 같은 자세가 같은 각도로 나온다**(테스트가 지킨다).

### 런지 — 2D 카메라로는 안 되는 동작 ⚠️ 결정 필요

| 동작 | 점수 | |
|---|---|---|
| 팔 벌리기 (T포즈) | 0.92 | ✅ |
| 옆구리 늘리기 | 0.98 | ✅ |
| 런지 — 옆으로 서서 | 0.78 | ⚠️ 겨우 |
| 런지 — 정면 보고 | **0.48** | ❌ |

MediaPipe는 화면상의 x·y만 준다. **깊이가 없다.** 그래서 카메라와 나란한 평면(좌우·위아래) 동작은 잘 잡고, 카메라 쪽으로 뻗는 동작은 뭉개진다. 정면 런지는 앞무릎이 굽었는데도 화면에서는 곧게 편 것으로 보인다.

옆으로 서면 잡히지만, **그러면 레인 이동(골반 x)이 망가진다.** 좌우로 뛰면서 하는 게임이라 서로 배타적이다.

**제안: 런지를 좌우 평면 동작으로 교체한다**(만세·한 발 들기·스쿼트 등). 2D 카메라로 노는 게임이면 동작 자체를 2D에 맞춰 고르는 게 맞다. 기준을 느슨하게 푸는 쪽은 가짜 통과를 늘려서 운동 데이터를 망친다.

→ 사인판·캐릭터 그림을 새로 그려야 하므로 **에셋 결정이 선행된다.**
- [ ] O/X 인식률이 이관 전과 동일
- [ ] 똥 피하기의 zoneDetector도 정상

---

## STEP 5 — 게임팩화

### 5-0. 화면 소유권 분리 ✅ (2026-08-04)

**라우터가 게임 이름을 아는 구조를 걷어냈다.**

문제는 `/tutorial`을 만들면서 드러났다. 라우터가 `games/poop-dodge/tutorial.js`를 직접 import하고 있었다. 게임을 하나 더 넣으면 import를 또 더해야 하고, 그러면 **홈 화면 하나 여는 데 모든 게임 코드가 번들에 딸려 온다.** 게임이 20개가 되면 첫 로딩이 그만큼 느려진다.

```
이전                              이후
/game?id=   똥 피하기 전용        /play?id=      전부 여기로
/warmup     웜업 전용             /intro?id=     게임팩이 있으면
/tutorial   라우터가 직접 import  /tutorial?id=  게임팩이 있으면
```

`src/pages/`의 넷(`home`·`intro`·`tutorial`·`play`)은 이제 **디스패처**다. `?id=`로 registry를 찾아 게임팩이 등록한 로더를 부르고 `#app`을 넘길 뿐, 내용은 모른다.

| 옮긴 것 | 어디로 |
|---|---|
| `src/pages/game.js` (똥 피하기 전용이었다) | `src/games/poop-dodge/play.js` |
| `src/pages/warmup.js` | `src/games/warmup-obstacle/play.js` |
| 라우터의 튜토리얼 import | `registry.tutorial` 로더 |

**규약은 default export 하나다.** 이름으로 찾으면(`Object.values(mod)[0]` 같은 식) 모듈이 상수를 export하는 순간 엉뚱한 값을 부른다 — 실제로 튜토리얼이 `TUTORIAL_TIMING`을 export하면서 그럴 뻔했다.

`registry.entry` 문자열도 없앴다. 게임마다 진입 경로를 손으로 적어두면 라우트를 바꿀 때 registry와 라우터 두 곳을 맞춰야 한다. 이제 `getEntry(id)`가 **인트로가 있으면 인트로, 없으면 플레이**로 만들어 준다.

> 옛 경로(`/game`·`/warmup`)는 라우터가 새 경로로 넘겨준다. 북마크나 기록에 남은 링크가 깨지면 "왜 안 되지"부터 시작해야 한다. 게임 모듈 import는 아니고 문자열 매핑이라 번들에는 영향이 없다.

**검증** — 홈 → 인트로 → 튜토리얼 → 플레이 경로, 웜업 `/play?id=warmup-obstacle` 진입, 옛 경로 리다이렉트 둘 다 브라우저에서 확인. 콘솔 에러 0건.

남은 것은 아래 5-1(공용 화면 이관)과 5-2(게임팩 클래스 규격)다.

### 5-1 · 5-2. 공용 게임 셸과 게임팩 규격 ✅ (2026-08-09)

**게임이 넷이 되자 껍데기가 네 벌이 됐다.** 불 끄기와 돌다리는 규칙만 다르고
안내 오버레이·카메라 붙이기·PIP·결과 화면·기록 남기기가 **글자 하나까지 같았다.**
그대로 두면 결과 화면 문구 하나를 고치는 데 네 파일을 고쳐야 하고, 한 군데를
빠뜨리면 게임마다 다른 화면이 된다 — **아이는 매번 새로 배운다.**

`src/core/gameShell.js` 하나로 모았다.

| 함수 | 하는 일 |
|---|---|
| `mountGuide(host, {...})` | 동작 안내 + 시작 버튼 + 자동 시작. `done` 프라미스로 시작을 알린다 |
| `showGameOver(host, {...})` | 결과 — 보상(배지·레벨)을 **점수보다 위에** 그린다 |
| `mountCamera(host, {...})` | acquire/attach/onLandmarks/PIP/release를 한 덩어리로 |
| `makeRecorder({...})` | 스냅샷에서 **운동 지표만 골라 한 번만** 기록 |

경계는 이렇게 그었다.

```
core        모든 게임이 똑같이 해야 하는 것 — 안내 · 카메라 · 결과 · 기록
게임팩      그 게임만의 것 — 규칙(game.js) · 그리기(play.js의 paint)
```

**규칙을 셸로 끌어오지 않았다.** 게임마다 다른 것을 공용으로 만들면 옵션이 계속 늘어
결국 아무도 못 읽는 함수가 된다. 셸은 "화면의 앞뒤"만 갖는다.

효과 — `fire-rescue/play.js` 405 → 322줄, `stone-bridge/play.js` 383 → 287줄.
줄 수보다 중요한 건 **결과 화면이 한 벌**이 된 것이다.

#### 게임팩 규격 (여기가 정본)

```
games/<id>/
  manifest.json   제목·썸네일·태그 + **metrics(이 게임이 만드는 운동 지표)**
  game.js         규칙만. DOM·카메라를 모른다. update(dt, input) · snapshot()
  play.js         화면. 셸을 쓰고, 자기 무대만 그린다
registry.js 에 한 줄
```

- 화면 모듈은 **default export가 렌더 함수**여야 한다
- `snapshot()`이 돌려주는 **지표 이름은 운동 사전(`progress/exercises.js`) 그대로**
- `manifest.metrics`는 **선언이다.** 셸의 기록기가 이 목록으로 스냅샷을 거른다
- 나갈 곳은 `getBackTo(id)`. `getEntry(id)`는 인트로가 없으면 자기 자신을 가리킨다

**말로만 있던 규격이 실제로 어긋나 있었다.** 웜업 manifest의 metrics는
`sideSteps`·`poseHolds`(카멜)인데 사전의 키는 `side_steps`·`pose_holds`(스네이크)였고,
똥 피하기는 `dodges`·`hits`라고 적혀 있었다 — **운동 지표가 아니라 게임 점수다.**
아무도 안 읽는 필드라 몇 달을 그대로 있었다. 둘 다 고치고 `test/gamePack.test.js`로 묶었다.

**남은 것** — 똥 피하기·웜업은 아직 자기 결과 화면을 쓴다. 똥 피하기는 결과 화면이
HUD·햄버거 메뉴와 얽혀 있고 **아이폰 검증을 통과한 코드**라, 지금 건드리는 이득보다
회귀 위험이 크다. 다음에 그 화면을 고칠 일이 생길 때 함께 옮긴다.

### 5-0b. 카메라 준비 화면 공용화 🔶 (2026-08-04)

`core/readyScreen.js`. **똥 피하기에는 이 화면이 아예 없었다** — 곧장 게임을 띄우고 카메라가 안 되면 조용히 키보드로 떨어졌다. 아이는 왜 몸이 안 먹히는지 알 수 없었고, 화면에 너무 가까이 서서 전신이 안 잡히는 경우가 특히 그랬다. **고칠 수 있는 문제인데 고칠 방법을 알려주지 않았다.**

화면이 하는 일은 하나다 — 몸이 다 보이는 자리에 서게 하는 것.

| 상태 | 표시 |
|---|---|
| 전신 안 보임 | 빨강 테두리 + "머리부터 발까지 다 보이게 뒤로 물러나 주세요" · 시작 버튼 잠김 |
| 전신 보임 | 초록 테두리 + "좋아요!" · O 3초 또는 시작 버튼 |
| 카메라 실패 | 이유를 그대로(`handErrorMessage`) + 키보드로 갈 수 있게 |

**웜업 것을 옮기지 않고 다시 썼다.** 그쪽은 `style.css`(html/body를 덮어쓴다)와 `.screen`·`.pip-slot` 클래스에 얽혀 있어서, 가져오면 웜업 CSS가 통째로 딸려 온다. core만 쓰는 자체 DOM/CSS로 만들었다.

가져온 것은 **판단 규칙**이다.

- 전신 여부는 `BODY_SETTLE_SEC = 0.3` 동안 유지돼야 뒤집는다. 경계에서 빨강↔초록이 깜빡이며 소리까지 반복되는 걸 막는다(웜업 현장 검증값)
- **O는 전신을 요구하고 X는 요구하지 않는다.** 뒤로 나가려는 아이에게 "먼저 물러나세요"를 요구하면 갇힌다

> ⚠️ **카메라 참조를 호출부에 넘긴다.** `showReadyScreen`은 `{ mode, release }`를 돌려주고, 게임이 `acquire()`한 **뒤에** `release()`를 부른다. 참조가 1 → 2 → 1로 흘러 카메라가 끊기지 않는다. 준비 화면이 먼저 놓으면 0이 되어 껐다 켜지고, 그 사이 권한 표시등이 깜빡이며 첫 라운드가 버벅인다.
>
> 검증 — 준비 화면과 게임의 `srcObject.id`가 같고 트랙이 계속 `live`인 것을 브라우저에서 확인했다.

**"키보드로 하기"를 고르면 카메라를 아예 열지 않는다.** 물어봐 놓고 무시하면 물어본 의미가 없고, 켜둔 만큼 발열도 는다. (확인: 키보드 선택 후 추론용 video 엘리먼트까지 사라진다 = 참조 0으로 정리됨)

**남은 것** — 웜업은 아직 자기 `showCameraSetup`을 쓴다. 캘리브레이션이 얽혀 있어 따로 뗀다. 그때까지는 준비 화면이 두 벌이다.

### 5-0c — 게임 화면 잔손질 (2026-08-04)

**방향키로 가운데 칸에 갈 수 없었다.** 왼쪽=0번칸, 오른쪽=2번칸으로 **절대 위치**를 찍고 있었다. 가운데는 스페이스바였는데 화면 어디에도 그런 안내가 없다. 몸으로 할 때는 옆으로 한 걸음씩 옮기는 게임이니 키보드도 같아야 한다 — `playerZone ± 1`(0~2로 자름)로 바꿨다.

**바닥 경계선을 지웠다.** 캐릭터가 버튼을 밟고 서 있는 지금은 "여기가 바닥"이 이미 읽힌다. 배경 위를 가로지르는 흰 선만 남아 화면을 잘라 보이게 했다.

**소리·음악은 HUD 아이콘 두 개가 전부다.** 일시정지 메뉴에도 같은 항목이 있어서 상태가 두 곳에 그려졌고, 한쪽만 고치면 서로 다른 말을 한다. 아이콘은 늘 보이니 메뉴에 또 둘 이유가 없다. 메뉴는 다섯 줄로 짧아졌다(계속하기 · 다시 시작 · 손 컨트롤 · 나가기 · 게임 목록).

### 5-0d — 소리가 통째로 안 나던 이유 ★ (2026-08-04)

**없는 파일이 `200 OK`로 온다.**

해시 라우팅이라 서버가 모르는 경로를 전부 `index.html`로 돌려준다. Vite dev도 그렇고, `netlify.toml`의 `/* → /index.html 200`도 그렇다. 그런데 `bgm.load`와 `sound.load`가 **`res.ok`만 보고** 있었다.

```
/assets/audio/poop-dodge/bgm/bgm.mp3   → 200, text/html   ← 없는 파일
/assets/audio/common/Kingdom.mp3       → 200, audio/mpeg   ← 진짜 파일
```

결과가 두 겹으로 나빴다.

- **배경음악**: 게임 전용 곡이 "있다"고 판단해 HTML 문서를 `<audio>`에 물렸다 → 무음
- **효과음**: 같은 이유로 캐시가 HTML로 채워졌고, `_playOrSynth`가 "캐시가 있다"고 보고 그걸 재생하려다 조용히 실패했다 → **합성음 폴백까지 막혔다**

그래서 배경음악도 효과음도 하나도 안 났다. 에셋 폴더에는 `.gitkeep`뿐인데 코드는 파일이 있다고 믿고 있었던 것이다.

`core/audioProbe.js`의 `audioFileExists()`로 **Content-Type이 `audio/`인지까지** 본다. 두 모듈이 같은 함수를 쓴다.

> 상태 코드만 보는 존재 확인은 SPA 폴백이 있는 곳에서는 항상 거짓말을 한다.
> 이미지·폰트·JSON 등 다른 선택적 에셋을 이런 식으로 확인하는 코드가 생기면 같은 함정에 빠진다.

### 5-0e — 화면 크기별 조정 (2026-08-04)

| 고친 것 | 왜 |
|---|---|
| 목숨 3 → **5** | 라운드가 53 → 150초로 3배 길어졌는데 목숨이 그대로면 끝까지 가는 아이가 거의 없다 |
| 하트 칸을 `MAX_LIVES`에 연동 | 3으로 박혀 있어서 목숨을 늘려도 화면에는 3칸만 나왔다 |
| 동그라미 5개 → **`LEVEL 1/5`** | 하트(목숨)와 모양이 겹쳐 "이게 목숨인가 레벨인가"가 안 읽혔다 |
| **다시 시작 제거** | 게임이 끝나면 '다시 하기'가 있다. 중간 재시작은 운동 기록만 버린다 |
| 카운트다운 중 메뉴 허용 | `_running`까지 요구해서 배너·카운트다운 3초 동안 메뉴가 안 열렸다 |
| `FLOOR_H` 110 고정 → **`min(110, 높이×0.16)`** | 가로로 누운 폰(세로 400px)에서 110px은 화면의 27%다. 그만큼 똥이 떨어질 거리가 짧아 피할 시간이 없었다 |
| 배경을 **cover**로 | `drawImage(bg, 0,0,w,h)`는 늘린다. 세로로 든 폰에서 가로로 긴 배경이 짓눌려 찌그러졌다. 잘려도 비율은 지킨다 |
| 좁은 화면(≤620px)은 소리·음악을 **메뉴로** | 세로로 든 폰에서 아이콘 셋이 하트를 밀어내 햄버거가 화면 밖으로 나갔다. 상태는 한 곳이고 그리는 자리만 폭에 따라 바뀐다 |

검증(계산 확인) — 낙하 거리 932×400에서 72.5% → **84%**, 배경은 400×932에서 1398×932로 그려져 **비율 유지**(가로만 잘림).

### 5-0f — 세로로 든 폰의 위쪽 줄 (2026-08-04)

세로 모드는 **위쪽 가로 공간이 없다.** 글자를 단 버튼들이 서로 겹치고 화면 밖으로 밀려났다.

| 화면 | 넓을 때 | 좁을 때 |
|---|---|---|
| 인트로 상단 | `← 게임 목록` · `✋ 손 컨트롤 모드` · `❔ 어떻게 해?` | **아이콘만** (46×46 원형) |
| 게임 HUD 목숨 | ❤️×5 | **❤️ 5/5** (같은 정보를 1/5 폭에) |
| 게임 HUD 레벨 | `LEVEL 1/5` | `LV 1/5` (≤480px) |

두 표현을 **다 그려두고 CSS가 고른다.** 폭을 JS로 재서 갈아끼우면 회전할 때마다 다시 그려야 하고, 그리는 시점과 회전 시점이 어긋나면 잘못된 쪽이 남는다. 글자를 접어도 `aria-label`은 남긴다.

> **햄버거가 가장 먼저 밀려난다.** flex 줄의 마지막이라 공간이 모자라면 오른쪽으로 나간다(300px 폭에서 `left: 302`로 화면 밖). 그런데 그건 게임을 빠져나갈 유일한 길이다. ≤480px에서 여백·글자를 한 번 더 조여 자리를 만들었다 — 400px에서 메뉴 오른쪽 끝이 392px로 들어온다.

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

## STEP 6 — 손 포인터 ✅ 코드 작업 완료

`src/core/pointer.js` 신규. 설계 상세는 **02 시스템설계 v3 §4** 참조.

허브는 이 앱에서 **마우스가 필요한 유일한 지점**이었다. 게임 안은 전부 몸으로 된다.

- [x] `pointer.js` 구현 — 손목(15/16)만, Hands 모델 없음
- [x] 활성 박스 어깨 너비 기준 자동 스케일
- [x] One Euro Filter
- [x] 손을 어깨 위로 들면 활성, 내리면 비활성
- [x] 경계 히스테리시스 12px
- [x] 머무르기 감소율 `dt × 0.6` (`GestureHold`와 동일)
- [x] 머무르기 링 UI
- [ ] 게임 안 화면에도 적용 (지금은 허브만 — 게임 안은 O/X로 충분하다)

### 대상 지정 방식

DOM 속성으로 표시한다. 화면이 바뀌어도 포인터 코드를 손댈 일이 없다.

```html
<button data-pz-hit data-pz-dwell="1200">
```

| 대상 | 머무르기 | 근거 (03 설계 §머무르기 시간) |
|---|---|---|
| 게임 카드 · 시작하기 | 1200ms | 잘못 누르면 게임이 바뀐다 |
| 카테고리 · 필터 | 600ms | 목록이 바뀌어 놀랄 수 있다 |
| 하단 4칸 바 · 레일 화살표 | 500ms | 되돌리기 쉽다 |

### 만들며 정한 것

**카메라 시점 — 첫 번은 버튼, 이후 기억.** 손을 보려면 카메라가 먼저 켜져 있어야 해서 "손 들면 켜기"는 불가능하다. 진입 즉시 자동으로 켜면 첫 방문에 권한 팝업이 바로 뜨고 허브에 머무르는 내내 발열이 붙는다. `localStorage`에 켠 사실을 기억해 다음부터는 자동으로 켠다.

> 실패하면 기억을 지운다. 안 되는 걸 들어올 때마다 시도하면 매번 에러 토스트를 본다.

**머무르기 감소를 두 갈래로 나눴다.**

| 상황 | 처리 |
|---|---|
| 버튼 사이로 잠깐 미끄러짐 | `dt × 0.6`으로 천천히 감소 |
| 다른 버튼으로 옮김 | 즉시 0 |

옆 버튼으로 진행도를 물려주면 **엉뚱한 버튼이 대신 눌린다.** 손 떨림에는 관대하고 의도적 이동에는 단호해야 한다.

**대상 쪽에도 표시를 준다.** 커서 링만으로는 "이게 눌리는 중인가"가 안 읽힌다. 겨눠진 버튼에 `.pz-hover`로 노란 테두리가 붙는다.

**허브를 떠날 때 카메라를 놓는다** — 게임이 자기 해상도로 다시 열어야 한다. 다만 이때는 "껐다"고 기억하지 않는다. 게임을 마치고 돌아오면 다시 켜져야 한다.

### 검증 기준

- [x] 빌드 · 테스트 94건 통과
- [x] "✋ 손으로 고르기" → 카메라 켜짐 → 손을 어깨 위로 들면 커서 등장
- [x] 커서가 떨리지 않음 (One Euro Filter)
- [x] 카드 위에 1.2초 머무르면 선택됨
- [x] 팔을 내리면 커서가 사라짐
- [x] 게임 갔다 돌아오면 자동으로 다시 켜짐 (카메라 주고받기 정상)
- [x] **크롬 검증 완료 (2026-08-02)**
- [ ] 실기기(아이폰 Safari) — STEP 9
- [ ] 아이 손 크기·거리에서의 감도 — 실제 사용자 확인 필요

---

## STEP 7 — 홈 화면 🔶 레이아웃 선반영

**03 화면설계 v3 §화면1** 대로 구현. STEP 2에서 임시 목록 대신 **설계 레이아웃을 먼저 넣었다** — 껍데기를 두 번 만들 이유가 없다.

- [x] **히어로 배너** — 화면설계 v3에는 없던 요소. 아래 참조
- [x] **고정 히어로 + 한 줄 페이징** — 자유 스크롤 폐기. 아래 참조
- [x] 이어서 하기 — 줄 영역의 앞 페이지 (기록 있을 때만)
- [x] 전체 게임 4열 — 한 줄씩 페이지로
- [x] 하단 4칸 바 (맨위·위·아래·맨아래) — 한계 방향만 opacity 0.32
- [x] 카테고리 팝업 (태그 필터 동작, 닫기 버튼 없음 = "전체"가 곧 닫기)
- [x] 우상단 계정 + 햄버거 — **자리만**. 누르면 "준비 중" 토스트
- [x] 사이드바 없음
- [ ] 손 포인터 + 머무르기 (STEP 6 이후)
- [ ] 계정(아이 선택) 실제 동작 — 기획안 2단계
- [x] 카테고리 목록을 manifest `tags`에서 자동 집계 (게임 수 많은 태그 순)

**더미 게임 18개** — `src/games/placeholders.js`. 게임이 2개면 세로 스크롤·하단 4칸 바·레일 페이징이 동작할 자리가 없어 확인이 안 된다.

- `import.meta.env.DEV`일 때만 registry에 들어간다 → **프로덕션 빌드에는 없다** (빌드 후 `grep`으로 확인)
- `placeholder: true` — 누르면 라우팅하지 않고 "준비 중" 안내만. 대신 최근 목록에는 넣어서 레일 페이징(4개씩)을 눌러볼 수 있다
- 실제 게임이 늘 때마다 이 파일에서 한 줄씩 지운다

> 배열을 모듈 최상단에서 즉시 만들면 `if (false)`로 접혀도 번들에 남는다. 함수로 감싸야 호출부와 함께 통째로 빠진다.

**이어서 하기 데이터** — `src/core/recent.js`, localStorage `pz_recent_games`에 `{id, at}` 최대 8건. 계정이 생기면 이 모듈의 read/push만 Supabase로 바꾸면 되고 홈 화면은 손대지 않는다. 기록이 없으면 레일 전체를 숨긴다.

**게임 카드 ↔ manifest** — 썸네일 `thumbnail`, 제목 `title`, 태그 최대 2개 `tags`, 인원 배지 `players`, NEW 배지는 `createdAt` 30일 이내 자동.

### 히어로 배너 ★ 화면설계에 없던 요소

요즘 OTT 홈의 상단 구성. 선택된 게임이 전체 폭 배경으로 깔리고 그 위에 메타·제목·설명·CTA가 얹힌다. 톤앤매너와 UI 요소는 기존 그대로다.

**히어로에는 아래 목록에서 선택된 게임이 뜬다.** 카드 클릭은 실행이 아니라 **선택**이고, 실제 실행은 히어로의 `▶ 시작하기` 하나뿐이다.

> 실행 지점을 하나로 몰아둔 이유 — 아이가 목록을 훑다가 잘못 눌러 게임이 켜지는 사고가 없다. STEP 6에서 손 포인터 머무르기가 붙어도 같은 구조 그대로 간다. (03 설계는 카드 머무르기 1.2초로 바로 실행이었는데, 큰 화면에서 한 번 확인하고 시작하는 편이 낫다.)

| 항목 | 처리 |
|---|---|
| 표시 대상 | 선택된 게임. 아무것도 안 골랐으면 추천 로테이션 |
| 추천 대상 | **플레이 가능한 게임 먼저, 그 안에서 최신순** 최대 5개 |
| 자동 전환 | **선택 전까지만** 6초 간격. 카드나 점을 고르는 순간 멈춘다 |
| 멈춤 | 선택했을 때 · 히어로에 마우스를 올린 동안 · 탭이 백그라운드일 때 |
| 선택 표시 | 해당 카드에 노란 테두리 + 글로우. 필터로 다시 그려도 유지 |
| 스크롤 | 히어로가 화면 밖일 때만 위로 올린다 — 훑는 중에 매번 튀면 비교가 안 된다 |
| 배경 | manifest `hero` (와이드 전용 이미지) |
| 배경 폴백 | `hero`가 없으면 `thumbnail`을 크게 늘려 블러 처리 |
| 포스터 | 오른쪽에 썸네일 카드 — 배경만으로는 무슨 게임인지 안 읽히는 경우가 있다 |
| CTA | `▶ 시작하기`(진입) · `＋ 전체 게임 보기`(그리드로 스크롤) |
| 헤더 | 히어로 위 투명 오버레이. 24px 이상 스크롤하면 반투명 배경이 깔린다 |

**히어로 대상 정렬에 `placeholder`를 먼저 태운 이유** — 더미가 히어로를 차지하면 "시작하기"가 전부 준비 중 안내로 끝난다. 프로덕션에는 더미가 없으므로 이 정렬은 그냥 최신순이 된다.

**자동 전환 타이머는 `onLeave`에서 정리한다.** 홈을 떠난 뒤에도 살아 있으면 이미 사라진 DOM을 6초마다 건드린다. `visibilitychange` 리스너도 함께 뗀다.

> `hero` 필드가 있는 게임은 지금 둘뿐이다(`poop_game_bg.jpg`, `fx_title_screen.png`). 새 게임을 추가할 때 **1920×1080급 와이드 이미지**를 같이 넣으면 블러 폴백을 쓰지 않는다.

### 고정 히어로 + 한 줄 페이징 ★ 구조 변경

**자유 스크롤을 폐기했다.**

카드 클릭이 "선택"이고 실행은 히어로에서 하는 구조인데, 스크롤로 히어로가 사라지면 **선택의 결과가 안 보인다.** 클릭만 두 번 하고 아무 일도 안 일어난 것처럼 느껴진다. 히어로를 고정하면 선택 → 확인 → 시작이 한 화면에서 끝난다.

돌아보면 03 설계의 하단 4칸 바가 원래 **"한 줄씩"** 이동이다. 자유 스크롤 쪽이 예외였다.

**결정적인 이유는 STEP 6이다.** 손 포인터 머무르기는 1.2초 동안 조준하는데, 그동안 카드가 움직이면 못 맞춘다. 위치 고정이 사실상 전제 조건이다.

```
화면 = 히어로(가변) + 한 줄(고정) + 하단 4칸 바(고정)   ← 어느 것도 스크롤하지 않는다
페이지 = [이어서 하기 …] + [전체 게임 4개씩 …]
```

| 항목 | 처리 |
|---|---|
| 세로 이동 | 하단 4칸 바 · 마우스 휠 · 방향키 ↑↓ · 터치 세로 스와이프(40px) |
| 가로 이동 | 이어서 하기 좌우 화살표 · 방향키 ←→ · 터치 가로 스와이프 |
| 휠 | 트랙패드는 한 번에 이벤트가 수십 개 온다 → 420ms 쿨다운으로 한 쪽씩 |
| 줄 제목 | `이어서 하기 2/2` · `전체 게임 20개 · 3/5` |
| 필터 변경 | 전체 게임 첫 쪽으로 이동 (이어서 하기는 필터와 무관) |
| 카드 높이 | `clamp(104px, 17vh, 190px)` — 비율로 두면 넓은 화면에서 줄이 커져 히어로를 누른다 |

**이어서 하기는 세로로 나누지 않고 한 페이지 안에서 좌우로 넘긴다.** 성격이 다른 목록이라 그렇다 — 전체 게임은 훑는 목록이고, 이어서 하기는 "어제 하던 거"를 집는 자리다. 최대 8개뿐이라 좌우 한 번이면 끝나고, 세로 페이지를 잡아먹으면 전체 게임까지 가는 길이 그만큼 길어진다. 중복은 `recent.js`가 거른다 — 같은 게임을 다시 하면 뒤 항목을 지우고 맨 앞으로 올린다.

> 좌우 화살표 자리는 **어느 페이지에서든 항상 비워둔다**(`visibility: hidden`). 필요할 때만 자리를 만들면 페이지를 넘길 때 카드 폭이 달라져 화면이 덜컥거린다.

**페이지 기억은 인덱스가 아니라 (라벨, 그 라벨 안 몇 쪽째)로 한다.** 더미를 처음 고르는 순간 '이어서 하기'가 0페이지로 새로 끼어들면서 뒤가 통째로 한 칸 밀린다. 인덱스로 기억하면 보던 줄 대신 엉뚱한 줄이 뜬다.

**히어로 점 인디케이터는 제거했다.** 선택이 아래 목록에서 이뤄지니 위에 또 다른 선택 수단을 두면 조작 지점이 둘로 갈린다.

**⚠️ 카테고리 필터가 필수가 됐다.** 20개면 5페이지, 50개면 13페이지다. 03 설계는 "50개 이후엔 전체가 기본값이면 안 된다"고 썼는데, 이 구조에서는 그 시점이 앞당겨진다. **20개를 넘어가면 첫 화면 기본 필터를 정해야 한다.**

### 히어로 영상 (슬롯만)

manifest `heroVideo` 필드를 열어뒀다. 에셋은 아직 없다.

- **선택 0.8초 뒤에** 재생 — 목록을 훑을 때마다 켜졌다 꺼지면 산만하고 디코딩도 낭비다
- `muted` + `loop` + `playsinline` + `preload="none"` — 이 조합이면 iOS Safari도 자동재생된다
- 이미지 위에 0.6초 페이드인. 재생 실패(자동재생 차단 등)하면 **이미지 그대로 둔다**
- 지연 중에 다른 게임을 고르면 취소. 페이지 이탈·백그라운드 전환 시 정지 후 `src` 해제

> 넣을 때 권장 — 6초 내외 루프, 음성 없음, 2MB 이하. "폰이 본체"라 데이터가 비용이다.

### 하단 4칸 바 폐기 → 한 줄 레일 + 전체 보기 팝업 ★ 구조 변경 (실기기 피드백)

아이패드 검증에서 **하단 4칸 바에 손이 닿지 않았다.** 원인은 두 가지가 겹친 것이었다.

1. 손 커서의 활성 상자 아래끝(`BOX_BOTTOM 0.5`)이 손 내림 판정(`RAISE_OFF 0.30`)보다 커서 화면 맨 아래 9%가 죽은 영역이었다 — 하필 바가 있던 자리다.
2. 더 근본적으로, **세로로 인접한 두 타겟은 머무르기와 상극이다.** 카드를 1.2초 겨누는 동안 손이 조금만 내려가면 바로 아래 붙은 이동 버튼에 걸린다.

그래서 세로축을 아예 없앴다.

```
히어로(고정) + 게임 한 줄(좌우 페이징) + [☷ 전체 보기]
                                            └→ 팝업: 검색 · 카테고리 · 세로 스크롤 ▲▼
```

| 항목 | 처리 |
|---|---|
| 목록 순서 | 최근에 한 것 먼저, 그다음 나머지 (`buildRail`) — '이어서 하기'를 별도 줄로 두지 않는다 |
| 이동 방향 | 좌우 하나뿐. 화살표는 줄 **양 끝**에 둔다(카드와 가로로 떨어짐) |
| 좁은 화면 | 한 줄에 2개(`perPage()`) — 4개를 넣으면 두 줄로 쌓여 세로축이 부활한다 |
| 전체 보기 | 팝업. 격자 + 검색 + 카테고리 칩 + ▲▼ 스크롤 버튼(카드와 가로로 떨어져 있다) |
| 검색 | **부모·선생님용.** 아이는 키보드를 못 쓰고 손 제스처로도 불가능하다 |
| 카테고리 | 넓은 화면은 칩 한 줄(가로 스크롤), 900px 이하는 버튼 하나로 접어 카테고리 팝업을 연다 |
| 카드 동작 | 올려놓기(마우스 hover · 손 커서 진입) → 히어로 즉시 변경 / 손 머무르기 완료 → **바로 실행** |
| 팝업의 클릭 | **실행.** 레일에서는 여전히 '선택'이다 — 아래 참조 |

**손 머무르기를 완료하면 바로 실행한다.** "카드에서 1.2초 → 히어로로 옮겨 다시 1.2초"는 아이에게 너무 멀다. 이미 1.2초를 겨눴다는 것 자체가 충분히 분명한 의사표시다.

**전체 보기 팝업에서는 마우스 클릭도 실행이다** (레일에서는 여전히 '선택'). 팝업에는 **히어로가 안 보이기 때문**이다. 선택만 하고 팝업이 닫히면 누른 결과가 어디에도 안 보인 채 홈으로 돌아가고, 시작하려면 시작하기를 또 눌러야 한다 — 자유 스크롤을 폐기했던 것과 정확히 같은 문제다. 게다가 손 머무르기는 이미 바로 실행이라, 클릭만 다르게 두면 같은 카드가 입력 수단에 따라 다르게 동작한다. 전체 보기는 '고르러 들어간' 화면이라 잘못 눌러 게임이 켜질 걱정도 적다.

### 버그 — 팝업 카드에서 제목·태그가 통째로 사라졌다

증상: 전체 보기 팝업에 썸네일만 보이고 게임 이름과 태그가 하나도 안 나왔다. CSS에는 분명히 있었다.

원인은 **그리드 행 높이**였다. `#pz-all-grid`는 높이가 정해진(`overflow-y: auto`) 그리드인데 `grid-auto-rows`를 안 정해두니, 자동 행이 컨테이너 높이를 행 개수만큼 **똑같이 나눠 가졌다.**

```
카드 내용 = 255px   ←  썸네일 178 + 제목 22 + 태그 22 + 여백
행 높이   = 147px   ←  컨테이너 645px ÷ 4행
```

카드에는 `overflow: hidden`이 걸려 있다(이미지 하나가 삐져나오면 아래 카드까지 밀리는 걸 막으려고 넣은 것이다). 그래서 넘친 108px — 정확히 제목과 태그 — 이 조용히 잘려 나갔다. **아무 에러도 없고, CSS를 읽어서는 찾을 수 없는 종류의 버그다.**

브라우저에서 실제 박스를 재서 찾았다.

```js
card.getBoundingClientRect().height  // 147.82
card.scrollHeight                    // 255      ← 여기서 드러난다
```

고친 방법:

- `#pz-all-grid { grid-auto-rows: max-content }` — 행이 내용만큼 자란다
- `#pz-rail-row`에도 같이 넣었다. 지금은 우연히 4px 여유로 안 잘렸을 뿐 같은 함정이다
- 팝업 썸네일을 `clamp(92px, 12vh, 150px)`로 낮췄다 — 한 화면에 세 줄이 들어와야 한다(손 제스처 스크롤은 느리다)

> **교훈.** `overflow: hidden`은 레이아웃을 지켜주는 대신 **잘못된 레이아웃을 숨긴다.** 화면에서 뭔가 안 보이는데 CSS는 멀쩡해 보이면 `scrollHeight`와 `getBoundingClientRect().height`를 비교한다. 두 값이 다르면 잘린 것이다.

### 가로로 누운 폰 (932×400) — 세로가 부족할 때

같은 팝업을 가로 모드에서 열었더니 ▲▼ 스크롤 버튼이 카테고리 칩 줄과 **겹쳐 보였다.**

원인은 스크롤 레일의 **고정 높이**였다. `.pz-scroll-btn`이 `height: clamp(96px, 14vh, 140px)` 두 개 + 간격 12px = 최소 204px인데 본문이 그보다 짧으면, `justify-content: center`가 넘친 만큼을 **위아래로 똑같이 밀어낸다.** 위로 밀린 쪽이 칩 줄을 덮었다.

- `.pz-scroll-btn { flex: 1 1 0; min-height: 48px; max-height: clamp(96px, 14vh, 140px) }` — 남은 높이를 나눠 갖는다. 본문을 넘칠 수 없다
- `#pz-all-scroll { min-height: 0 }`

**칩 줄을 접는 조건을 폭에서 폭 또는 높이로 바꿨다.** 932×400은 폭이 900을 넘어서 칩이 한 줄로 펼쳐졌고, 그 한 줄이 목록과 버튼 자리를 통째로 먹었다.

```css
@media (max-width: 900px), (max-height: 620px) { /* 칩 → 버튼 하나 */ }
```

접힌 버튼은 **검색창과 같은 줄 오른쪽 끝**에 붙인다(`#pz-all-search-row`를 flex row로, 버튼에 `margin-left: auto`). 줄을 새로 만들면 접은 의미가 없다. 세로 620px 이하에서는 머리글 여백·썸네일도 함께 줄이고, 480px 이하에서는 카드 태그를 접어 한 줄을 더 번다 — 고르는 데 꼭 필요한 건 썸네일과 이름이고 태그는 카테고리 버튼이 대신한다.

### hover로 떠오른 카드의 윗머리가 잘렸다

`.pz-card:hover`는 `translateY(-3px)`로 살짝 떠오른다. 그런데 **맨 윗줄만** 머리가 잘려 보였다. 스크롤 컨테이너(`#pz-all-grid`)는 패딩 박스 경계에서 자르는데 위쪽 여유가 0이었기 때문이다.

`#pz-all-grid { padding-top: 8px }`을 주고, 바로 위 칩 줄의 아래 여백을 12 → 4px로 줄여 전체 간격은 그대로 뒀다.

> 이런 건 "동작은 하는데 싼티 나는" 부류다. transform으로 움직이는 요소는 **움직일 만큼의 여백이 클리핑 경계 안쪽에 있는지** 항상 같이 본다.

### 접힌 카테고리는 모달이 아니라 셀렉트 박스로

접힌 카테고리 버튼이 **기존 카테고리 팝업(모달)을 재활용**하고 있었다. 전체 보기 팝업 위에 두 번째 모달을 얹는 꼴이었고, 둘 다 `.pz-backdrop { z-index: 200 }`이라 **나중에 그려진 전체 보기가 위를 덮었다.** 눌러도 아무 일이 없는 것처럼 보이다가, 전체 보기를 닫으면 그제야 뒤에 열려 있던 카테고리 팝업이 나타났다.

z-index만 올려도 "보이기는" 한다. 그래도 모달 두 겹이면 닫기 순서와 손 커서 타겟이 계속 두 겹으로 남는다. 그래서 **버튼 바로 아래로 펼치는 목록**(`#pz-cat-drop`)으로 바꿨다.

| 항목 | 처리 |
|---|---|
| 위치 | 버튼 기준 `position: absolute`, 아래 8px, 오른쪽 정렬 |
| 크기 | `min(560px, 100vw - 56px)` · `max-height: min(340px, 52vh)` — 9개가 3열로 들어간다 |
| 닫힘 | 항목 선택 · 바깥 클릭 · Esc · 목록 스크롤 · 팝업 열고 닫을 때 |
| Esc | **안쪽부터** 닫는다. 목록이 열려 있으면 목록만, 아니면 팝업 |
| 손 커서 | 그냥 된다 — `data-pz-hit` + `elementFromPoint`라 DOM에 나타나는 즉시 잡힌다 |

**네이티브 `<select>`는 여전히 쓸 수 없다.** 열리는 목록이 OS가 그리는 창이라 손 커서가 닿지 않는다. 화면 위 요소가 아니어서 커서 좌표로 항목을 고를 방법 자체가 없다.

`#pz-cat-backdrop { z-index: 210 }`은 남겨뒀다. 이제 둘이 겹칠 일은 없지만 같은 z-index에서 순서가 그리기 순서로 정해지는 함정에 한 번 당했다.

---

## STEP 8 — 똥 피하기 개조

> ⚠️ **선행 과제 (기획)** — 똥 피하기는 좌우 3구역 이동 게임이다. 어떤 입력 체계로 갈지 먼저 정해야 한다.
> - (a) `zoneDetector` 유지 — 좌우 이동 그대로
> - (b) `laneDetector`로 교체 — 웜업과 동일 감각으로 통일
> - (c) O/X 이지선다로 재설계 — 게임 규칙 자체를 바꿔야 함
>
> **(b)를 권한다.** 튜닝이 검증돼 있고 게임 규칙을 안 바꿔도 된다.

- [x] **입력 체계 결정 — (a) 좌우 이동 유지 (2026-08-04)**
- [x] 라운드 시간 재조정 (53초 → 150초)
- [x] 플레이어 캐릭터 추가
- [x] 인트로에 손 컨트롤 켜기 버튼
- [x] 튜토리얼 화면
- [ ] `judge` 이벤트 발행
- [ ] 캐릭터 이미지 리사이즈 (지금 5MB)

### 입력 체계 — (a) 좌우 이동 유지로 결정

점프·숙이기를 넣으면 `total_jumps`·`total_squats`가 잡히지만 STEP 4-1(lane/duck detector 분리)이 선행돼야 하고 게임 감각도 달라진다. **게임 규칙은 그대로 두고 시간과 밀도로 운동량을 확보하는 쪽**을 택했다.

### 라운드 시간 — 53초 → 150초

```
이전  12 / 11 / 10 / 10 / 10  =  53초
이후  25 / 28 / 30 / 32 / 35  = 150초
```

**밀도는 그대로 두고 시간만 늘렸다.** 초당 낙하 수를 0.38~0.71개 사이로 묶어서 난이도 곡선은 유지된다. 시간을 3배로 늘리면서 밀도까지 올리면 딴 게임이 된다.

최고 속도만 500 → 420으로 낮췄다. **10초를 버티는 것과 35초를 버티는 것은 다른 일이다.** 같은 속도로 3배를 끌면 목숨 3개로 끝까지 못 간다.

떨어지는 똥 총량이 약 28개 → 83개가 된다. `_pickZone()`이 기본적으로 플레이어가 선 칸을 겨누므로, 이 숫자가 거의 그대로 좌우 이동 횟수가 된다. **운동 데이터가 자릿수로 달라진다.**

### 플레이어 캐릭터

지금까지 플레이어 위치는 존 색면으로만 보였다. 아이 입장에서 "내가 어디 있는지"가 색으로만 표시되는 셈이었다.

**위치를 칸이 아니라 픽셀로 들고 있는다.** 칸만 들고 있으면 칸을 바꾸는 순간 순간이동한다 — 아이가 몸을 옆으로 옮겼는데 화면 속 캐릭터가 텔레포트하면 "나를 따라온다"가 안 읽힌다. 한 칸을 190ms에 건너간다.

| 표정 | 언제 |
|---|---|
| `char_idle` | 서 있을 때 (정면) |
| `char_move_left` / `_right` | 이동 중 — 가는 방향을 본다. 통통 튀는 모션 |
| `char_scared` | 맞았을 때 0.7초 |
| `char_cheer` | 라운드 클리어 |

- 임시 표정(놀람·환호)은 이동 표정보다 우선한다. 맞자마자 옆으로 뛰면 놀란 표정이 먼저다
- 라운드가 시작될 때 표정을 초기화한다 — 지난 라운드 환호가 새 라운드까지 남지 않게
- 화면 크기가 바뀌면 `_charX = null`로 되돌린다. 픽셀 위치라 칸 폭이 바뀌면 엉뚱한 칸에 서 있게 된다
- **캐릭터를 똥보다 먼저 그린다.** 그래야 바닥에 닿는 똥이 캐릭터 위로 겹쳐 "맞았다"가 읽힌다
- 발밑에 타원 그림자 — 없으면 공중에 뜬 것처럼 보인다

`stepToward()`와 `ROUNDS`/`TOTAL_SECONDS`는 export해서 테스트가 지킨다. 이 게임에서 캔버스 없이 검증되는 몇 안 되는 조각이다.

> ⚠️ **캐릭터 이미지가 5MB다.** 원본이 1070×1450인데 화면에서는 170px 남짓으로 그려진다. "폰이 본체"라 데이터가 비용이다 — 실기기 확인 후 리사이즈한다.

### 손 컨트롤을 켜는 버튼 — 허브 밖에도 있어야 한다

인트로에서 손 컨트롤이 꺼져 있으면 **켤 방법이 없었다.** START·뒤로 버튼에 `data-pz-hit`은 붙어 있어서 커서로 겨눌 수는 있는데, 정작 그 커서를 켜는 버튼이 허브에만 있었다. 손으로만 조작하는 아이는 인트로에서 갇힌다.

켜고 끄는 판단과 **카메라 오류 문구를 `core/handControl.js`로 옮겼다.** 화면마다 문구를 따로 쓰면 반드시 갈린다 — 같은 `NotReadableError`인데 허브에서는 "다른 앱이 카메라를 쓰고 있어요", 인트로에서는 "카메라 오류"가 뜨는 식이다. 허브도 이 모듈을 쓰도록 바꿨다(중복 32줄 제거).

> 좌상단 버튼 세 개(`← 게임 목록` · `✋ 손으로 하기` · `❔ 어떻게 해?`)는 **가로로** 늘어놓았다. 세로로 쌓으면 1.2초 겨누는 동안 손이 조금만 내려가도 아래 버튼에 걸린다 — 허브 하단 바에서 겪은 것과 같은 문제다.

### 튜토리얼 — 규칙 하나만, 보여주기만

**글로 설명하지 않는다.** 4~8세는 대부분 못 읽는다. 검정 실루엣이 실제로 옆으로 비키고, 방금 서 있던 자리에 똥이 떨어지는 걸 반복한다. 두 바퀴면 안다.

가장 중요한 건 타이밍이다.

```
0ms   똥이 내 칸으로 떨어지기 시작
760   비키기 시작
1060  다 비킴          ← 여기서 착지까지 240ms가 비어 있어야 한다
1300  착지 (방금 있던 자리)
```

처음 잡은 값은 `MOVE_AT 950 + MOVE_MS 320 = 1270`이라 착지(1300)까지 **30ms**밖에 안 남았다. 계산상으로는 "먼저 비켰다"가 맞지만 **눈에는 동시에 보인다** — 아슬아슬하게 맞은 것처럼 읽힌다. 지켜야 할 것은 "비키기 시작한 시점"이 아니라 **"다 비킨 시점"** 이다. `test/poopDodgeTutorial.test.js`가 이 관계를 지킨다.

칸 순서는 `[1, 2, 1, 0]` — 가운데를 거쳐 좌우로 번갈아 간다. 한 방향으로만 가면 "오른쪽으로 가는 게임"으로 배운다.

| 항목 | 처리 |
|---|---|
| 넘기기 | 머리 위 **O** (웜업과 같고, 게임에서 쓸 몸동작이다) |
| **버튼도 함께** | 손 컨트롤이 꺼져 있으면 O를 만들 방법 자체가 없다. 제스처만 두면 카메라를 못 켠 아이는 여기서 갇힌다 |
| 노출 | 처음 한 번. `pz_tutorial_seen`에 **게임별로** 기억한다 |
| 다시 보기 | 인트로 좌상단 `❔ 어떻게 해?` |
| 값이 깨지면 | 안 본 것으로 친다. 튜토리얼이 한 번 더 뜨는 게 게임이 안 되는 것보다 낫다 |

> 라우터에 `/tutorial`이 똥 피하기 것으로 박혀 있다. 게임이 늘 때마다 import를 하나씩 더하는 건 오래 못 간다 — **STEP 5에서 게임팩이 자기 튜토리얼을 들고 오는 구조로 바꾼다.**

### 실사용 피드백 반영 (2026-08-04 2차)

**튜토리얼**

| 고친 것 | 왜 |
|---|---|
| 한 바퀴 2.6초 → **3.8초** | 어른 눈에는 알맞았지만 4~8세에게는 무슨 일이 일어났는지 알아채기 전에 지나간다 |
| 캐릭터를 바닥선 18% → **7%** 로 내림 | 화면 가운데 떠 있어 무대가 비어 보였다 |
| 화살표를 **캐릭터 머리 위로** + 96px로 확대 | 두 칸 사이 허공에 두니 누구한테 하는 말인지 안 읽혔다 |
| `← 게임 목록` → **`← 뒤로`(인트로)** | 튜토리얼에 오는 길은 인트로뿐인데 허브로 튕기면 게임 목록부터 다시 찾아야 한다 |
| O 안내 문구 18px → **30px** | 이 화면에서 아이가 읽어야 할 단 한 줄이다 |

바닥선·캐릭터 높이·화살표 위치를 `--tut-floor`·`--tut-char-h` 두 변수에 묶었다. 따로 두면 하나만 고쳤을 때 화살표가 머리를 뚫거나 캐릭터가 바닥에서 뜬다.

**인트로** — 손 컨트롤·튜토리얼 버튼을 우상단 햄버거 옆으로 옮겼다. 왼쪽은 나가는 길, 오른쪽은 이 게임의 설정이라는 구분이다. 라벨은 `손 컨트롤 모드`로 통일했다(허브·튜토리얼도 같은 문구).

**게임 화면**

- **하단 버튼이 화면이 커질수록 같이 커졌다.** 존 너비의 66%로 잡아둬서 큰 모니터에서는 화면 절반을 버튼이 먹었다. **높이 기준**(`FLOOR_H * 0.86`)으로 바꿨다 — 이 버튼들은 "지금 어느 칸인지" 표시일 뿐이라 클 이유가 없다.
- 캐릭터를 168 → 210으로 키우고 바닥선보다 조금 내려 세워 버튼 줄 **앞으로** 나오게 했다. 처음엔 0.45만큼 내렸다가 캐릭터가 버튼을 통째로 가려서 0.16으로 줄였다.
- 그리는 순서가 곧 앞뒤 관계다 — `존 → 버튼 → 캐릭터 → 똥`. 캐릭터는 버튼보다 앞, 똥보다 뒤(바닥에 닿는 똥이 캐릭터를 덮어야 "맞았다"가 읽힌다).
- 손동작 안내 띠를 아래 → **위(top 76px)** 로 옮겼다. 아래에 있으니 가운데 칸 버튼을 가렸다.
- 일시정지 메뉴에 **손 컨트롤 모드**를 넣었다. 카메라 없이 키보드로 들어온 아이가 게임을 나가지 않고 카메라를 켤 수 있다 — 지금까지는 허브까지 돌아가야 했다.

### 3차 — 버튼 크기와 멈춘 화면의 손 커서

**버튼이 손톱만 해진 진짜 이유는 PNG 여백이었다.** `btn_left_default.png`는 800×800인데 **실제 그림은 570×359**다 — 세로로 45%만 채우고 나머지는 투명하다. 박스 높이로 크기를 잡으니 보이는 그림은 그 절반도 안 됐다.

여백 비율을 상수로 박아두면 에셋이 바뀔 때 조용히 어긋난다. 그래서 **불투명 영역을 로드 시점에 직접 재서**(`measureArtBox`) 그 부분만 잘라 그린다. 크기 기준도 그림 높이(`BTN_ART_H`)다.

```
이전 1: zw * 0.66     → 큰 모니터에서 화면 절반을 버튼이 먹음
이전 2: FLOOR_H * 0.86 → 여백 때문에 보이는 건 40px
지금  : 그림 높이 68px × _scale, 여백 잘라냄
```

**캐릭터 발 위치를 버튼 그림에 묶었다.** 화면 높이 기준으로 따로 계산하면 창 크기가 바뀔 때 한쪽만 움직여서 캐릭터가 버튼 위에 뜨거나 파묻힌다. `_footing(h)`이 둘의 공통 기준이고, 발은 버튼 그림 위에서 26% 지점에 딛는다 — **버튼을 발판처럼 밟고 선 모양**이 된다.

**멈춘 화면에서만 손 커서를 켠다.**

플레이 중에는 커서가 방해라 진입할 때 꺼둔다(몸 위치로 조종하는 게임이라 손을 들 일이 없다). 그런데 그 상태로는 X로 연 일시정지 메뉴를 손으로 고를 수 없었다 — 거기서부터는 마우스가 필요했다. `openMenu`/`showGameOver`에서 켜고 `closeMenu`/`startGame`에서 끈다. 메뉴 버튼 7개와 게임오버 버튼 2개에 `data-pz-hit`을 붙였다.

> ⚠️ **`setPointerActive(true)` 하나로는 아무 일도 안 일어났다.**
>
> 이 페이지는 **자기 `poseEngine`으로 카메라를 직접 연다.** `handSession`과는 별개다.
> 몸으로만 놀던 아이는 손 컨트롤을 켤 이유가 없었으므로 `handSession.enabled`가
> 계속 false고, handSession은 `enabled && pointerActive`일 때만 커서를 그린다.
> 즉 "보이게 해달라"고만 했지 켜지지 않은 것을 켠 적이 없었다.
>
> `showHandCursor()`가 **카메라가 이미 돌고 있으면 handSession을 붙인다.**
> 권한 팝업도 재시작도 없다 — `poseEngineCore`가 참조 카운팅으로 같은 스트림을 나눠 준다.
>
> `enable({ remember: false })` 옵션을 새로 뒀다. 아이가 손 컨트롤을 **고른 게 아니라**
> 멈춤 화면이 필요해서 켠 것이라, 취향으로 저장하면 다음 방문에 허브가 멋대로
> 카메라를 켠다. (`disable({ remember })`와 짝이 맞는다)

> **카메라 미리보기가 두 개 겹쳤다.** 게임이 만든 PIP(스켈레톤 + 3분할 선)와 `handSession`이 띄우는 PIP가 둘 다 우하단이다. 멈춰 있는 동안에는 "내 손이 어디 있나"가 중요하니 손 쪽을 남기고 게임 PIP를 숨긴다. 단, 손 커서가 꺼져 있으면 손 PIP도 안 뜨므로 그때는 게임 PIP를 그대로 둔다 — 무조건 숨기면 멈춘 동안 카메라 화면이 통째로 사라진다.

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

## iOS Safari 대비 ★ (STEP 9 선행)

실기기에 올리기 전에 코드에서 걷어낸 것들. 체크리스트는 **`docs/STEP9_아이폰검증.md`**.

### 반드시 깨졌을 것 — 자동 시작 제스처

**iOS Safari는 `getUserMedia`를 사용자 제스처 안에서만 허용한다.** 권한이 이미 허용돼 있어도 페이지 로드 직후 호출하면 거부된다.

손 포인터를 "한 번 켜면 기억해서 자동으로" 만들었는데, 이게 아이폰에서는 **매번 실패**한다. 자동 시작을 **첫 탭 한 번**으로 미뤘다. 데스크톱에서는 차이가 없고(어차피 아무 데나 누르게 된다), 아이폰에서는 이게 유일하게 되는 방법이다.

> 이미 카메라가 열려 있으면(게임에서 허브로 돌아온 경우) 제스처 없이 바로 이어진다.

### 지원 하한선을 먼저 판정한다

`tasks-vision`은 WASM SIMD를 요구한다. Safari는 **16.4+**. 그 이전 기기에서는 카메라 권한만 받아놓고 모델 로드에서 실패한다 — 허락을 받고 실망시키는 순서다.

`isPoseSupported()`로 **카메라를 열기 전에** 판정하고, 안 되는 기기에서는 "손으로 고르기" 버튼 자체를 숨긴다.

> ⚠️ **SIMD 프로브 바이트열은 눈으로 검산이 안 된다.** 처음 쓴 판은 `i8x16.splat` 뒤에 `drop`이 붙어 반환값이 비는 바람에 **어디서나 false**였다. 그대로 뒀으면 모든 기기에서 "브라우저가 오래됐어요"가 떴을 것이다. `test/support.test.js`가 이걸 고정한다.

### 화면

| 문제 | 처리 |
|---|---|
| `100vh`가 주소창을 포함해 아래가 잘림 | `100dvh` 폴백 (Safari 15.4+) |
| 노치가 좌상단 버튼을 가림 | 헤더에 `env(safe-area-inset-left/right)` |
| 홈 인디케이터에 하단 4칸 바가 깔림 | `env(safe-area-inset-bottom)` |
| 노치 옆 배경이 흰색 | `viewport-fit=cover` |

### 배포

`netlify.toml`에 브랜치 프리뷰 설정을 넣었다. `main` 자동 배포는 그대로라 검증이 끝날 때까지 운영본은 건드려지지 않는다.

> **교차 출처 격리(COOP/COEP)는 켜지 않았다.** 켜면 `SharedArrayBuffer`로 MediaPipe가 빨라지지만, jsdelivr에서 받아오는 WASM·모델이 CORP 헤더 없이 오면 전부 차단된다. 속도를 얻으려다 인식 자체가 죽는다.

---

## STEP 9 — 배포 전환

**절차와 체크리스트는 `docs/STEP9_아이폰검증.md`에 있다.** 여기는 진행 상태만 둔다.

- [x] 브랜치 프리뷰 배포 (`integrate-warmup--curious-dodol-c6e9f0.netlify.app`)
- [x] **아이폰 Safari 실기기 검증 통과 (2026-08-04)** — 홈 레일·전체 보기 팝업·카테고리 셀렉트·손 도달성 전부 정상
- [x] **`main` 머지 → 프로덕션이 허브로 전환 (2026-08-04)**
- [x] 병합 직후 프로덕션 확인 — 루트가 허브 · 더미 미노출 · 카메라 권한 재요청 · 기록 저장 전부 정상
- [ ] 웜업 Render 배포는 **1주일 더 유지** 후 중단 (~8/11)
- [ ] `warm-up-web/` → `_archive/`
- [ ] `play-zera`, `warm-up`, `jafari.dev` → `_archive/` (STEP 0-2)

> 7월 2일 코드가 5주 만에 내려갔다. 아이패드 검증에서 옛 똥 피하기가 뜨던 문제가 이걸로 끝났다.

### 똥 피하기 운동 데이터 1호 — 그리고 드러난 문제

병합 확인 중에 `play_summary_by_mode`에 **`poop-dodge / motion` 행이 처음 생겼다.** STEP 8에서 `extra_data.exercise`를 넣은 것이 실제로 작동한 것이다.

| game_id | input_mode | sessions | active_sec | jumps | squats | side_steps |
|---|---|---|---|---|---|---|
| **poop-dodge** | **motion** | **1** | **18** | **0** | **0** | **2** |
| warmup-obstacle | keyboard | 3 | 117 | 24 | 3 | 24 |
| warmup-obstacle | motion | 3 | 150 | 17 | 12 | 20 |
| warmup-obstacle | unknown | 38 | 4157 | 188 | 159 | 391 |

**저장은 됐는데, 저장된 값이 거의 없다.** 18초에 좌우 이동 2회다. 웜업 모션 3판(150초, 점프 17·앉기 12·좌우 20)과 비교하면 운동량이 자릿수로 차이 난다.

원인은 게임 설계다. 똥 피하기는 **좌우 3구역 이동뿐**이라 `zoneDetector` 하나만 돈다. 점프도 앉기도 없으니 `total_jumps`·`total_squats`가 구조적으로 0이다. 게다가 3구역은 이동 폭이 짧아 한 번 옮기는 데 드는 운동량 자체가 작다.

> **"운동 데이터가 쌓이는 것이 이 서비스의 존재 이유"라면, 똥 피하기는 지금 제 몫을 못 하고 있다.**
> STEP 8에 남겨둔 "입력 체계 결정"이 취향 문제가 아니라 데이터 문제라는 게 이 숫자로 확인됐다.
> 떨어지는 똥을 **점프로 넘거나 숙여서 피하는** 동작을 넣으면 같은 게임에서 세 축이 다 잡힌다.

---

## STEP 10 — 캐릭터 성장 (버디 · 배지 · 레벨)

기획은 `docs/05_playzera_캐릭터성장_기획.md`, 화면 설계는 `docs/06_playzera_화면설계_성장.md`.
여기는 **무엇을 왜 그렇게 만들었나**를 남긴다.

### 10-1 뼈대 (화면 없음) ✅

| 파일 | 하는 일 |
|---|---|
| `progress/level.js` | 운동량 → EXP → 레벨. **점수는 연료가 아니다** |
| `progress/badges.js` | 배지 14개 = 데이터. 아이콘은 모티프 라이브러리 10장을 돌려 쓴다 |
| `progress/conditions.js` | 조건 네 종류 — `total` · `daysInWindow` · `variety` · `event` |
| `progress/state.js` | localStorage 하나. **화면은 여기만 거친다** (계정이 생기면 이 파일만 바꾼다) |
| `progress/rewardView.js` | 게임 결과에 붙는 배지·게이지 |
| `buddies/registry.js` | 버디 3종 × 단계 4개(egg·hatch·grow·hero) |
| `profiles/registry.js` | 아바타 2종 |

**왜 EXP를 점수에서 뽑지 않았나** — 점수로 올리면 아이는 점수를 잘 내는 법을 찾고,
그건 대체로 "덜 움직이는 법"이다. 실제로 똥 피하기의 `dodgeCount`는 **가만히 서 있어도 오른다.**
연료는 `active_sec` · `jumps` · `squats` · `side_steps` · `pose_holds`뿐이다.

**LV1 = 300 EXP의 근거** — 실제 기록에서 역산했다. 똥 피하기 1판 ≈ 190, 웜업 1판 ≈ 77.
하루 두세 판이면 이틀 안에 넘는다 = **부화까지 하루 이틀.** 첫 보상이 멀면 그전에 그만둔다.

**"연속"을 쓰지 않는 이유** — 아이는 자기가 놀 수 있는지를 못 정한다. 아프거나 여행 가서
하루 빠졌다고 기록이 사라지면 벌처럼 느껴진다. 전부 `daysInWindow`(기간 내 n일)다.

### 10-2 화면 ✅ (크롬 검증)

```
/start   첫 실행 — 프로필 → 알 → 시작        (세 걸음을 넘지 않는다)
/        허브에 버디 자리 + 빨간 점
/buddy   내 친구 — 버디 크게 · 별 · 게이지 · 내 배지 · 꾸미기
```

**별은 레벨이 아니라 열린 단계 수다.** 레벨은 50까지 간다 — 별 50개는 셀 수도 없고 화면에도
안 들어간다. 단계는 넷뿐이고 "지금까지 몇 번 컸나"라 아이가 센다. 숫자 `LV.n`은 옆에 작게.

**꾸미기 = 형태 갈아입기를 먼저 넣었다.** 설계에는 2차로 미뤄뒀지만
`unlockedStages`/`wearStage`가 이미 있어 비용이 거의 없었고, 무엇보다
**"형태는 옷이지 운명이 아니다"**(docs/05 §2)가 눈에 보여야 규칙으로 성립한다.
알 모습 그대로 레벨 40이 될 수 있다. 아이템 꾸미기는 자리만 두고 2차.

**못 딴 배지도 보여준다** — 회색 실루엣으로. "저건 어떻게 따지?"가 다음에 또 오는 이유다.
지우면 아이는 남은 게 있는 줄도 모른다.

### 겪은 것

**1. 버디 자리를 히어로 오른쪽 아래 구석에 뒀더니 `[☷ 전체 보기]` 바로 위 35px이었다.**
이 프로젝트가 이미 한 번 밟은 지뢰다(`home.js` 머리말 "왜 좌우 하나뿐인가" — 하단 4칸 바를
걷어낸 이유와 같다). 1.2초 겨누는 동안 손이 조금만 올라가면 버디로 튄다.
→ **포스터 왼쪽 옆**으로 옮겼다. 포스터와는 가로로 이웃하고, 위아래로는 헤더·레일에서 멀다.
오프셋에 포스터의 크기 식을 그대로 써서 포스터가 커지면 같이 비킨다.

**2. 자리를 `translateY(-50%)`로 잡고 hover에 `scale`만 적었더니 카드가 아래로 반쯤 내려갔다.**
transform은 덮어쓰기다. hover/active도 `translateY(-50%)`를 이어서 써야 한다.

**3. 배지·꾸미기 판이 넓은 화면에서 왼쪽 구석에 몰렸다.**
`grid`의 `auto-fill`은 내용이 없어도 빈 트랙을 만들어 폭을 다 채운다. 그래서 4칸짜리
꾸미기가 왼쪽에 붙었고 `justify-content: center`로도 안 고쳐졌다(트랙이 이미 폭을 먹었으므로).
→ **flex-wrap**으로 바꿨다. 있는 것만 세고 가운데로 모은다.

**4. 프로필 그림이 안 떴다.** 코드가 `girl.png`를 찾는데 파일은 `profile_girl.png`였다.
→ **id에서 경로를 계산하지 않는다.** 그림 이름은 디자인 쪽에서 오는 것이라 우리가 못 정한다.
`profiles/registry.js`가 파일명을 데이터로 들고 있고, 코드가 그걸 따라간다. 테스트로 묶었다.

**5. 배지 아이콘 테스트가 옛 규칙을 지키고 있었다** (`badgeIcon('jump_20') === 'jump_20.png'`).
실제 그림이 나오고 보니 **그림은 모티프 단위로 그려진다**(점프·별·하트·시계…).
배지마다 그림을 따로 그리면 비슷한 그림을 여러 장 그리게 된다. 아이콘을 라이브러리로 돌려 쓰고
배지가 `icon`으로 하나를 고르는 방식으로 바꿨다 — **그림 10장으로 배지 14개를 덮는다.**
테스트도 새 규칙(모든 배지의 icon이 ICONS 안에 있다 · 모르는 배지는 star로 떨어진다)으로 고쳤다.

### 빨간 점의 규칙

아이는 글자를 못 읽는다. "가볼 데가 생겼다"를 알리는 수단이 점 하나뿐이라
**켜지고 꺼지는 조건이 정확해야 한다.** 안 꺼지면 곧 무시하게 되고, 안 켜지면 딴 배지를 못 본다.

```
소식 있음 = 레벨 > 마지막으로 본 레벨  또는  배지 수 > 마지막으로 본 배지 수
/buddy에 들어가면 markBuddySeen()
```

`seen`이 없는 옛 저장본은 **지금까지 쌓인 걸 소식으로 친다.** 반대로 하면 그동안 딴 배지를
영영 못 보고 넘어간다. 이 네 가지를 전부 테스트로 묶었다.

### 10-3 `/me` 마이페이지 (부모 화면) ✅ (크롬 검증)

**하루 목표는 30분으로 정했다.** WHO는 아동에게 하루 60분 이상을 권한다 —
이 앱은 **그중 일부를 맡는 것으로 본다.** 나머지는 바깥에서 뛰어야 한다.
화면 앞에서 30분을 넘기는 걸 목표로 삼게 하고 싶지 않다.

목업에서 고친 네 가지(docs/06 §5)를 그대로 지켰다.

| 목업 | 여기 |
|---|---|
| 최고 기록 2,450점 | `6번 · 60분 · 좌우 150회` — **점수는 부산물이다** |
| 활동 시간 2시간 40분 (누적) | `19 / 30분` — **목표 대비**, 넘겨도 게이지는 가득에서 멈춘다 |
| 3일 연속 출석 | 이번 주에 3일 |
| 피하기 30회 | 좌우 이동 30회 (`side_steps`) |

목표에 닿으면 "**오늘 목표를 채웠어요. 여기서 멈춰도 좋아요**"라고 말한다.
"더"가 아니라 "꾸준히"가 이 서비스가 파는 것이라, 그 말을 화면이 직접 해야 한다.

주간 꺾은선은 **라이브러리 없이 인라인 SVG**다. 점 7개짜리 선 하나에 번들을 늘릴 이유가 없다.
눈금 상한은 `max(목표, 최고치)`라 **목표선이 늘 화면 안에 있다** — 목표가 밖에 있으면
목표 대비로 읽으라는 말이 무색해진다.

`data-pz-hit`은 **한 개도 없다.** 들어올 때 `setPointerActive(false)`로 손 커서를 내리고
나갈 때 되돌린다. 켜진 채로 들어오면 작은 요소들 위에서 커서가 제멋대로 눌린다.

### 겪은 것 (10-3)

**6. 누적 합계만 있어서 "오늘"을 만들 수 없었다.**
`totals`는 전체 합계뿐이라 오늘도 이번 주도 말할 수 없었고, **역산할 방법도 없었다.**
→ `recordSession()`이 한 판을 **세 군데(전체·날짜별·게임별)에 동시에** 더한다.
판이 끝난 그 순간에만 셋을 다 알 수 있다.

**7. `{ ...EMPTY }`가 얕은 복사였다.** `totals`·`days` 같은 통이 **모듈 상수의 것과 같은 객체**라,
거기 운동량을 더하면 `EMPTY`가 오염됐다. `pzResetProgress()`로 지워도 지운 값이 되살아난다.
→ 읽을 때마다 통을 새로 만든다(`fresh()`). 테스트로 묶었다.

**8. 배지 진행도가 `300 / 600`으로 나왔다.** 단위 없는 초다. 부모는 이게 초인지 회인지 모르고,
활동 시간은 애초에 분으로 보여주는 화면이라 여기만 초면 어긋난다.
→ 조건 종류를 아는 곳(`report.js`)에서 단위까지 붙여 문장을 만든다 — `5 / 10분` · `7 / 20회` · `1 / 3일`.

**9. 꺾은선 꼭짓점의 숫자가 위로 잘렸다.** 위쪽 여백이 16px인데 라벨을 점보다 12px 위에 뒀다.
→ 여백을 28px로 늘리고 라벨 위치에 하한을 걸었다.

### 10-4 `/me`를 가로형 두 단으로 (8/9)

처음 만든 `/me`는 카드를 세로로 쌓은 것이었다. 그건 **폰 레이아웃을 넓은 화면에
그대로 늘린 것**이라, PC에서는 가로가 텅 비고 스크롤만 길었다. 부모는 대개 PC나
태블릿 가로로 본다.

```
┌──────────────┬───────────────┐
│ 프로필        │               │
│ 오늘의 활동    │   버디 크게    │   ← 왼쪽 아이 정보 · 오른쪽 캐릭터
├──────────────┼───────────────┤
│ 주간 리포트    │  게임별 기록    │   ← 키가 비슷한 것끼리
├──────────────┴───────────────┤
│ 배지 (전체 폭, 안에서 두 단)      │
└──────────────────────────────┘
```

**버디를 오른쪽에 크게 두는 건 장식이 아니다.** 부모가 보는 숫자와 아이가 보는 친구가
같은 화면에 있어야 "이 분들이 저 친구를 키운 것"이 읽힌다.

그림·별·게이지는 `/buddy`에서 쓰던 것을 **`progress/buddyView.js`로 빼서 같이 쓴다.**
같은 친구가 화면마다 다르게 보이면 아이에게는 같은 친구가 아니다. 숨 쉬는 속도,
발밑 그림자, 별의 개수를 한 곳에서 정한다. 부모 화면에만 한 줄 더 붙는다 —
"다음 모습 '친구'는 LV.5에서 열려요". 아이 화면에는 없다, 못 읽으니까.

### 10-5 `/me` 2차 — 카드형·슬라이드·전체 보기 (8/9)

| 바꾼 것 | 왜 |
|---|---|
| 오늘의 활동을 **프로필 카드 안으로** | 따로 띄우면 "누구의 오늘인지"가 끊긴다. 줄 하나로만 나눈다 |
| 게임별 기록 = **썸네일 카드** | 이름만 있는 줄보다 무슨 게임인지 한눈에 온다. 썸네일은 manifest에 이미 있다 |
| 게임·배지 = **좌우 슬라이드 + 전체 보기 팝업** | 세로로 다 늘어놓으면 게임이 20개가 되는 순간 화면이 무너진다. 허브가 같은 이유로 같은 구조다 |
| 배지 갈래를 **셀렉트로** | 줄마다 갈래 이름을 적던 것을 걷어냈다. 목록이 짧아진 만큼 **배지 그림을 키웠다** |
| 카드 좌우 끝선 정렬 | 카드 안쪽 여백을 `--pad` 하나로 통일하고 화살표를 트랙 **안쪽**에 뒀다. 밖으로 빼면 끝선이 어긋나 보인다 |

**화살표는 갈 수 있는 방향만 보여준다.** 눌러도 안 움직이는 버튼은 없는 게 낫고,
맨 앞에서 왼쪽 화살표가 첫 카드를 가리는 것도 막는다.

팝업 안의 격자는 `repeat(auto-fill, minmax(160px, 1fr))`다 — 고정 폭으로 두면
오른쪽에 어중간한 여백이 남는다. 세로 스크롤은 **팝업 안에서만** 돈다.

### 10-6 `/me` 3차 — 리포트를 팝업으로 (8/9)

| 바꾼 것 | 왜 |
|---|---|
| 주간 리포트 카드를 **팝업으로** | 첫 화면에 늘 필요한 건 "오늘 어땠나" 하나다. 지난 기록은 궁금할 때 여는 것이라 상시로 두면 화면만 길어지고 정작 오늘이 눈에 안 들어온다 |
| 프로필 카드에 `📈 활동 리포트` 버튼 | 여는 자리를 "누구의 기록인지" 옆에 둔다 |
| 팝업에 **주간/월간 탭 + 숫자 대시보드** | 그래프만으로는 "며칠 지켰나"를 못 읽는다. 논 날·합계·평균·목표 달성일·논 횟수·최고 기록일을 칸으로 나눴다 |
| 게임별 전체 보기를 **카드 격자로** | 가로줄 목록이 배지 팝업과 따로 놀았다. 목록에서만 다른 모양을 쓰면 같은 것으로 안 보인다 |

**주간과 월간은 같은 함수를 쓴다** — `report.js`의 `periodSummary(s, n)`.
기간마다 따로 만들면 둘 중 하나만 고치는 일이 반드시 생긴다.
꺾은선도 `chartSVG(days, opts)` 하나다. 점이 30개가 되면 값 표시를 끄고
가로 눈금을 5일 간격으로 찍는다 — 다 적으면 글자가 겹친다.

**평균은 논 날로만 나눈다.** 쉰 날로 나누면 꾸준히 논 아이의 평균이 깎인다.
그 문장을 팝업 아래에 직접 적어 뒀다 — 부모가 숫자를 오해하면 아이에게 간다.

### 겪은 것 (10-4)

**10. 격자 줄로 쌓았더니 카드 사이에 커다란 빈틈이 생겼다.**
왼쪽을 `profile` / `today` 두 줄로 두고 오른쪽 버디가 두 줄을 걸치게 했더니,
버디의 높이가 줄 높이를 늘려 왼쪽 카드가 줄 가운데로 떠 버렸다.
→ **옆 칸이 여러 줄을 걸치면 쌓는 건 격자 줄이 아니라 한 칸 안의 flex로 한다.**
같은 실수를 아래쪽(주간+게임별)에서 한 번 더 했다.

**11. 버디 그림이 카드를 뚫고 나와 헤더까지 덮었다.**
`max-height`만 줬는데, 안쪽 `img`의 `max-height: 100%`가 **높이가 auto인 부모**를
기준으로 계산되지 못해 원본 크기(512px)로 펼쳐졌다.
→ 그림 칸에 **확정 높이**를 준다. 퍼센트는 확정 높이가 있어야 풀린다.

**12. 배지 카드 옆에 빈 공간이 남았다.** 배지는 14줄이라 어떤 카드보다도 길다.
옆에 짧은 카드를 두는 배치를 두 번 시도했고 둘 다 옆자리가 비었다.
→ 배지를 아래 **전체 폭**으로 내리고 `columns: 2`로 흘렸다. 격자로 나누면 갈래가
칸 경계에서 잘리는데, 단 나눔은 갈래(`break-inside: avoid`)를 통째로 옮겨 준다.

### 겪은 것 — 허브에서 BGM이 계속 났다 (8/9)

**소리를 켜는 곳은 둘, 끄는 곳은 하나였다.**

```
켠다   main.js (앱 시작 시 bgmPlay())   ·  게임팩 (인트로·플레이)
끈다   허브 홈 화면이 그려질 때 stop()
```

허브가 자기 렌더에서 껐지만 그건 **순서에 기대는 방식**이다. 켜는 쪽이 나중에 돌면
그대로 새어 나온다. 실제로 그랬다 — 허브에서 음악이 계속 났다.

고친 방향은 "허브에서 한 번 더 끄기"가 아니다.

1. **`main.js`의 자동 재생을 지웠다.** 게임 소리를 앱 시작이 켤 이유가 없다.
2. **끄는 판단을 라우터로 옮겼다.** 경로가 `/intro` · `/tutorial` · `/play`가 아니면 끈다.
   화면이 늘어도(`/buddy`·`/me`가 그랬다) 규칙이 따라온다 — 화면마다 stop()을 적을 필요가 없다.
   게임 경로끼리 옮길 때는 끄지 않는다. 거기서 끊으면 같은 곡이 화면마다 처음부터 다시 난다.

라우터가 게임 *이름*을 아는 게 아니라 **경로의 종류**를 안다. 게임을 추가해도 이 파일은 그대로다.

`bgm.isPlaying()`을 새로 내보냈다. Audio 객체는 DOM에 없어서 밖에서 확인할 방법이 없었고,
"소리가 나나"를 귀로만 확인하면 이런 문제를 또 놓친다. 자동재생이 막혔을 때도 조용히
삼키지 않고 콘솔에 이유를 남긴다.

> **검증하다 헛짚은 것** — 브라우저 콘솔에서 `import('/src/core/bgm.js')`로 상태를 봤는데
> 계속 "안 나온다"고 나왔다. Vite HMR이 수정된 모듈을 `?t=…` 붙은 URL로 서빙하고 있어서
> **앱이 쓰는 인스턴스와 내가 부른 인스턴스가 서로 달랐다.** 모듈 상태를 콘솔에서 볼 때는
> `performance.getEntriesByType('resource')`에서 앱이 실제로 받은 URL을 찾아 그걸 import해야 한다.
> (그걸로 다시 재니 인트로 `true` · 허브·내 친구·마이페이지 `false`로 의도대로였다)

### 남은 것

- [ ] 부화·해금 전용 연출 (알이 깨지는 장면)
- [ ] 아이템 꾸미기 (2차)
- [ ] `/me`를 부모만 열게 할지 (아이가 눌러도 해로울 건 없다 — 설정이 생기면 그때)
- [ ] 정할 것 — 버디 기본 이름, `기록 보기`와 `마이페이지` 합치기

---

## STEP 11 — 운동 체계 (유산소 · 균형)

**정본은 `docs/07_playzera_운동체계.md`다.** 여기는 진행 상태와 겪은 것만 둔다.

세던 넷(점프·앉기·좌우·포즈)이 전부 "제자리에서 몸통·다리"라
**유산소와 균형이 통째로 비어 있었다.** 그 둘을 메웠다.

- [x] 운동 사전 `progress/exercises.js` — 지표 이름·EXP·단위·품질 문턱의 정본
- [x] `EXP_WEIGHTS`·`METRICS`를 사전에서 가져오게 (level.js·report.js에서 걷어냄)
- [x] 제자리 달리기 감지기 (`high_knees` · `active_sec`)
- [x] 한 발 서기 감지기 (`balance_sec`)
- [x] 합성 프레임 테스트 20건 — **카메라 없이 세는 규칙을 검증한다**
- [x] `/lab` 실측 화면 (DEV 전용) — 웹캠으로 실제로 세는지 눈으로 본다
- [x] 배지 둘 추가 (달리기 대장 100걸음 · 외발 서기 챔피언 60초)
- [x] **불 끄기 소방관** (달리기) — 게임팩 추가, 크롬 검증 (8/9)
- [x] **돌다리 건너기** (균형) — 게임팩 추가 (8/9). 실기기 확인은 보류
- [ ] 아이 실측으로 문턱 조정 (케이던스 40걸음/분, 균형 EXP 2)

### 11-1 불 끄기 소방관 (8/9)

**유산소를 게임으로 만든 첫 번째 시도.** 제자리 달리기로 물을 뿜어 불을 끈다.

```
게임팩   games/fire-rescue/  manifest · game.js(규칙) · play.js(화면)
지표     high_knees · active_sec
구성     3채(45·55·65초 상한) + 사이에 12초 숨 고르기
```

**멈추면 불이 다시 커진다.** 이 한 줄이 게임의 전부다 — 초당 regen만큼 불이 자라고
한 걸음이 물 2를 붓는다. regen이 0이면 천천히 걸어도 언젠가 꺼지고, 그건 유산소가 아니다.
반대로 너무 크면 아이가 아무리 달려도 안 꺼진다. 분당 100걸음(4~8세가 가볍게 달리는 속도)이
초당 3.3 물이라, regen을 그 절반 아래(0.8~1.6)로 뒀다.

**실패가 없다.** 불이 커져도 목숨이 줄지 않고 게임도 안 끝난다. 느린 아이는 오래 걸릴 뿐이다.
이 나이대에 "졌다"를 만들면 다음에 안 온다. 대신 라운드마다 시간 상한을 둬서 늘어지지 않게 했다.

**라운드 사이에 반드시 쉰다** — docs/07의 안전 규칙(30초 달리고 숨 고르기)을 화면으로 옮겼다.
쉬는 동안에는 아무것도 요구하지 않고, 숨 쉬는 원과 남은 초만 보여준다.
못 참고 뛰는 아이의 걸음은 세어 주되 **운동 시간에는 넣지 않는다.**

**키보드 모드는 기록에 남기지 않는다.** 스페이스 연타로도 게임은 돌아간다(카메라 없는
환경·개발 확인용). 하지만 손가락으로 두드린 걸 EXP로 주면 "운동 데이터가 존재 이유"라는
말이 무너진다. 게임과 기록을 갈라 둔 이유가 이것이다.

그림은 도형·이모지로 먼저 만들었다(똥 피하기 때와 같은 순서). 썸네일도 임시 SVG라
그림이 나오면 `public/assets/games/fire-rescue/thumb.svg`만 갈아 끼우면 된다 — manifest는 그대로.

**규칙은 카메라 없이 테스트한다** (`test/fireRescue.test.js` 16건).
멈추면 뒤로 가는지, 실패가 없는지, 쉬는 시간이 운동 시간에 안 섞이는지,
한 판이 4분 안에 끝나는지. 크롬에서는 키보드 모드로 3채 완주까지 확인했다.

**겪은 것 두 가지 (첫 실사용에서 바로 나왔다)**

**1. [그만하기]가 안 먹혔다.** 나갈 곳을 `getEntry(id)`로 잡았는데, 인트로가 없는 게임은
entry가 **플레이 화면 자신**이다. `navigate()`가 같은 해시를 다시 넣으니 hashchange가
안 나고 아무 일도 안 일어난다.
→ `getBackTo(id)`를 새로 뒀다 — 인트로가 있으면 인트로로, 없으면 허브로. 테스트로 묶었다.

**2. "이게 무슨 운동이냐"는 말을 들었다.** 게임에 들어가자마자 불부터 보이니
아이는 무엇을 해야 하는지 모른다. 응원 문구("무릎을 높이 들어봐!")는 이미 하는 중인
사람에게나 읽힌다.
→ **동작을 먼저 보여주는 안내 화면**을 넣었다. 다리가 번갈아 올라가는 본보기 + 한 줄 설명
("그 자리에서 무릎을 콩콩 들어 올려요") + 시작 버튼. 글자를 못 읽는 아이가 버튼을 못 찾고
멈춰 있지 않게 8초 뒤 자동으로 시작한다. 안내를 보는 동안 불은 자라지 않는다 —
설명을 읽는 시간에 벌을 주지 않는다.

> 테스트를 쓰다 헛짚은 것 — "쉬는 동안 뛰어도 운동 시간이 안 는다"를 확인하려고
> `restSec`만큼 돌렸는데, 첫 라운드를 끄고 남은 시간이 이미 흐른 뒤라 쉬는 시간이
> 중간에 끝나고 다음 라운드가 시작됐다. `restLeft`를 보고 **남은 만큼만** 돌려야 한다.

### 11-2 돌다리 건너기 (8/9)

**균형을 게임으로 만든 것.** 한 발로 버티면 다음 돌이 나온다.

```
게임팩   games/stone-bridge/  manifest · game.js(규칙) · play.js(화면)
지표     balance_sec · active_sec
구성     돌 5개 — 왼발 2초 · 오른발 2초 · 왼발 2.5초 · 오른발 2.5초 · 아무 발 3초
```

**돌마다 어느 발로 설지가 정해져 있다.** 한쪽만 하면 그쪽만 늘고, 아이는 잘 되는 쪽만
하려 한다. 반대 발을 들면 세어 주지 않고 "왼발을 들어야 해!"라고 알려준다.
마지막 돌만 편한 발로 둔다.

**버티다 놓쳐도 0으로 돌아가지 않는다.** 발이 닿으면 게이지가 **초당 0.5씩 줄 뿐이다.**
매번 처음부터면 이 나이대는 두 번째 돌에서 그만둔다. (감지기 쪽에도 0.4초 유예가 따로 있다)

**실패가 없다.** 시간이 다 되면 "도와줄게!"로 다음 돌로 건너간다.
못 버틴 돌도 **버틴 만큼은 기록에 남는다.**

유지 시간은 3초를 넘기지 않는다 — docs/07 안전 규칙. 테스트로 못 박았다.

규칙 테스트 17건. 키보드 모드는 ← 왼발 / → 오른발을 **누르고 있는 동안** 든 것으로 치되,
불 끄기와 같은 이유로 기록에는 남기지 않는다 — 키를 누르고 있는 건 균형이 아니다.

> **검증하다 또 헛짚었다** — 키를 눌러도 게이지가 안 찼다. 코드 문제가 아니라
> **창이 앞에 없으면 `requestAnimationFrame`이 아예 안 돈다**(`frames: 0`으로 확인).
> 스크린샷을 찍어 창을 그리게 하자 바로 돌기 시작했다. 이 함정은 이 프로젝트에서
> 세 번째다(보상 게이지 · 히어로 영상 · 여기). **자동화로 게임 화면을 확인할 때는
> 창이 실제로 그려지고 있는지부터 본다.**

### 11-3 요가 자세 사전 (8/9)

**정본은 `docs/07` 5-1.** 여기는 진행 상태만 둔다.

- [x] `core/pose/poseMatch.js` — 웜업의 채점기를 core로 올렸다. 웜업 파일은 목표값만 남은 껍데기
      (기존 17건 그대로 통과 = 동작 보존). STEP 4-1/4-2의 detector 재배치가 여기까지 왔다
- [x] `poseFeatures`에 **비율** 추가 — `stance`·`armSpan`·`footLift`·`handGap`.
      각도만으로는 세모↔초승달, 나무↔산, 용사↔홍학이 안 갈린다
- [x] `core/pose/poses.js` — 서서 하는 요가 7자세를 **데이터로**
- [x] `test/yogaPoses.test.js` — 자세끼리 **혼동 표**로 검증 (카메라 없이)
- [x] `#/lab`에 요가 채점 탭 — 몸을 쓸 수 있을 때 바로 실측
- [ ] 게임으로 만들기 (동물 요가 — 정리 막)

**표가 목표값을 두 번 고치게 했다.** 나무가 산으로 0.74점, 홍학이 용사로 0.78점을 받았다.
둘 다 "두 발이 바닥에 있나"를 안 보고 있었기 때문이다. 지금은 대각선 0.96 이상,
나머지 0.66 이하(문턱 0.68).

### 판단

**감지기는 시간을 밖에서 받는다.** 안에서 `performance.now()`를 읽으면
합성 프레임으로 테스트할 수 없다. 이 하나 때문에 20건이 카메라 없이 돈다.

**달리기는 캘리브레이션을 안 한다.** 다리는 대부분의 시간을 아래에 두고 있으니
최근 2초에서 무릎이 가장 낮았던 위치가 곧 "서 있을 때"다. 준비 화면을 안 거치는
게임에도 그냥 붙고, 아이가 카메라에서 멀어져도 따라간다.

**균형은 횟수가 아니라 초다.** "몇 번 섰나"는 발을 들었다 놨다만 해도 오른다.
흔들려 발이 닿는 0.4초는 봐주되, **닿아 있던 시간은 초에 더하지 않는다.**

### 겪은 것

**1. 무릎을 든 채로 시작하면 첫 걸음을 놓쳤다.** 기준선이 든 위치로 잡혀서다.
→ 창에서 찾은 값이 골반보다 키의 12%도 안 내려가 있으면 서 있는 자세가 아니라고
보고 몸 비율로 어림한다. **정상일 때는 관찰값을 그대로 쓴다** — 어림값이 상시
끼어들면 과다 카운트가 난다.

**2. 앉아 있는 사람에게서 1걸음이 세어졌다.** `/lab`을 만들자마자 첫 프레임에서 잡혔다.
MediaPipe는 **화면 밖 관절의 좌표를 지어낸다** — 좌표만 보면 그럴듯하다.
→ `visibility < 0.5` 프레임은 통째로 버린다. 두 감지기 모두, 테스트로 묶었다.

> 합성 프레임 테스트와 `/lab`은 **둘 다 필요하다.** 앞의 것은 사람의 흔들림·조명·거리를
> 모르고, 뒤의 것만 보면 왜 틀렸는지를 모른다. 실제로 2번은 `/lab`이, 1번은 테스트가 잡았다.

---

## 정리 회차 (8/11)

중간점검에서 나온 세 가지를 순서대로 처리했다.

### 1. 커밋 정리

`main`에 46개 변경(새 파일 31개)이 쌓여 있었다 — 성장 시스템 이후 전부 미커밋.
한 커밋으로 뭉치면 "언제 뭐가 들어왔나"를 되짚을 수 없어 **일곱 덩어리로 나눈
`COMMIT_PLAN.sh`**를 만들었다(실행은 사람이).

### 2. 새 게임의 기록이 서버로 안 가고 있었다 ★

**불 끄기·돌다리의 기록이 기기 밖으로 나가지 않았다.** `progress/state.js`
(localStorage)에는 쌓이는데 Supabase에는 한 건도 없었다. "운동 데이터가 쌓이는 것이
이 서비스의 존재 이유"인데 새로 만든 유산소·균형 기록이 그 아이의 브라우저에만 남았다.

원인은 저장이 **게임팩마다 손으로** 붙어 있었던 것이다 — 똥 피하기와 웜업만
`saveResult`를 부르고 새 게임은 아무도 안 붙였다. 잊어버릴 수 있는 구조 자체가 문제다.

→ `core/resultQueue.js`를 만들고 **셸의 기록기가 부른다.** 앞으로 만드는 게임은 그냥 따라온다.

- **실패하면 큐에 넣는다.** 아이가 노는 곳은 거실이고 와이파이는 끊긴다.
  그때 기록이 사라지면 아이가 움직인 사실이 사라진다. 앱이 뜰 때 다시 보낸다
- **키보드 판도 서버에는 보낸다.** EXP는 안 주지만(두드린 건 운동이 아니다)
  `input_mode`로 갈라 두면 "몇 번 열어봤나"와 "몇 번 움직였나"를 나눠 볼 수 있다.
  안 보내면 그 판은 세상에 없던 일이 된다
- 같은 판이 두 건이 되지 않게 `run_id`로 묶는다

> ⚠️ `extra_data.exercise` 키가 없으면 `exercise_summary` 뷰의
> `WHERE extra_data ? 'exercise'`에 걸려 **통계에서 통째로 빠진다.**
> 똥 피하기가 실제로 그래서 한 건도 안 잡혔던 적이 있다. 테스트로 묶었다.

### 3. 에셋 다이어트 — 87MB → 47MB

| 한 것 | 줄인 양 |
|---|---|
| 아무도 안 쓰는 파일 30개를 `_unused/`로 (**삭제 아님**) | 25MB |
| `audio/Kingdom.mp4` — 실제 BGM은 `audio/common/Kingdom.mp3`다 | 2.8MB |
| 스프라이트 최대 1000px · 배경 1600px으로 재인코딩 | 10MB |

`mat_sidewalk_*` 넷만 17MB였다. 화면에서 210px로 그려지는 똥 피하기 캐릭터가
원본 1086×1448이었다.

**검증** — 웜업 이미지 60장 전부 로드, 똥 피하기 인트로 이미지 6장 전부 로드.
`loadAssets()`가 `image missing` 경고 없이 끝나는 것으로 확인했다.

> 미사용 판정은 **파일 이름을 코드에서 찾는 방식**이다. `sfx_${n}.wav`처럼
> 이름을 조립하는 경우가 있어 접두사(`sfx_`·`bg_`·`obs_`…)를 떼고 한 번 더 본다.
> 버디·배지·프로필처럼 **데이터로 참조되는 폴더는 통째로 제외**한다 —
> registry에 이름이 있으니 코드에서 안 보이는 게 정상이다.

---

## STEP 12 — 웜업 배경 개선 (8/11)

### 왜

웜업(달리며 장애물 피하기)은 **에셋만 바꾸면 다른 컨셉의 게임이 되는 틀**이라
여러 벌 만들 계획인데, 그 전에 배경 퀄리티가 디자인 시안에 못 미쳤다.

시안과 구현을 겹쳐 보니 차이는 **에셋 퀄리티가 아니라 오브젝트가 놓인 자리**였다.

| 시안 | 구현(이전) |
|---|---|
| 트랙 밖도 밝은 청색 바닥 | 어두운 보라 여백 |
| 모든 오브젝트에 그림자·받침 | `drawImage` 한 줄 — 접지감 0 |
| 별 박힌 두툼한 연석이 트랙과 바닥을 이음 | 골드 선 두 줄 |
| 근경이 화면 밖으로 잘릴 만큼 큼 | 전부 비슷한 중간 크기 |
| 원경이 하늘빛으로 날아감 | `globalAlpha` 0.55 → 어두워짐 |

**새 에셋 0장**으로 전부 `game/world.js` 안에서 고쳤다.

### 한 것

**① 바닥을 밝은 청색으로.** 도드라짐을 명도가 아니라 **색상 대비**에서 낸다 —
바깥이 청색, 트랙이 보라. 그래야 오브젝트가 어둠이 아니라 바닥 위에 선다.
광택은 소실점으로 모이는 **넓은 띠** 5개로 냈다(가는 선을 여러 개 그으면
먼 구간에서 모아레가 난다 — 예전 보도블럭 텍스처에서 겪은 그것이다).

**② 연석.** 카메라가 트랙 한가운데 위에 있으므로 **윗면**과 **안쪽 세로면**
둘만 보인다. 원근에서 "높이"는 화면 y를 위로 끌어올리는 것이라, 윗면은
사다리꼴 띠가 되고 세로면은 그 띠와 지면선 사이의 리본이 된다.
윗면에 별과 청록 등이 번갈아 흘러간다(예전 `_drawRailStars`를 여기로 옮겼다).

**③ 그림자와 프롭 받침.** 발밑에 원근에 따라 납작해지는 타원. 한 줄인데
접지감의 절반이 여기서 나온다. 별 장식은 **떠 있는 것**이라 살짝 띄우고
그림자를 흐리게 했다 — 건물과 똑같이 세웠더니 바닥에 떨어진 소품 같았다.

**④ 크기 계급·좌우 뒤집기·셔플백.** `tier`(hero 1.5 / mid 1.0 / small 0.82)로
근경 대비를 만들고, 오른쪽 프롭은 뒤집어 안쪽을 보게 했다. 프롭 선택은
인덱스 순환에서 셔플백으로 바꿨다.

**⑤ 공기원근.** 먼 것을 옅게 한다. **바닥이 밝아진 뒤에야 이게 성립한다** —
예전 어두운 바닥에서는 알파를 낮추면 어두운 색이 비쳐 먼 것이 그을려 보였다.

### 겪은 것

**받침(disc)은 받침이 아니었다.** `_unused/`의 원형 플랫폼 4종을 건물 아래
깔려고 되살렸는데, 열어 보니 그림 자체에 별·돔·미끄럼틀이 이미 올라간
**완성된 오브젝트**였다. 그 위에 건물을 얹으니 물건이 겹쳤다. 바닥에 흩어
놓는 **낮은 프롭**으로 용도를 바꿨다 — 시안에서도 이 플랫폼들은 건물 밑이
아니라 바닥 여기저기에 놓여 있다.

**하단 1/3이 늘 비어 있었다.** `SIDE_ROWS.spread`가 커서 오브젝트가 화면
아래에 닿기 전에 옆으로 빠져나갔다. 1650 → 1250, 900 → 700으로 줄이고
수명을 1.25 → 1.4로 늘리자 근경이 **모서리에 잘린 채** 지나간다.
그 잘림이 공간의 깊이를 만든다.

**같은 물건이 좌우에 나란히 섰다.** 인덱스 순환(`idx % length`)이라 좌우
목록 길이와 스폰 주기가 같으면 규칙적으로 겹친다. 셔플백으로 바꿨는데
**통 한 바퀴가 끝나는 경계**에서 또 겹쳤다(통 마지막이 대포, 새 통 첫 장도 대포).
최근 4개 + 반대편의 최근 4개를 함께 피하도록 했다.

**연석을 얇게 만들면 없느니만 못하다.** 처음 폭 78·높이 27은 원근에 눌려
"색이 조금 다른 띠"로만 보였다. 폭 72·높이 44에 안쪽 세로면을 진하게 깔아야
물건으로 읽힌다.

### 실기기에서 나온 것 (8/11 저녁) ★

크롬에서 실제로 돌려 보니 오프스크린 렌더에서 안 보이던 것 셋이 나왔다.

**① 건물이 투명했다 — 알파는 안개가 아니다.**

거리에 따라 `globalAlpha`를 낮춰 공기원근을 흉내 냈다. 배경이 단색이면 그럴듯하지만
이 화면은 **뒤에 스카이라인이 있다.** 건물 너머로 그게 그대로 비쳐 유령이 됐다.

안개는 색을 **섞는** 것이지 비치게 하는 것이 아니다. 스프라이트마다 색을 섞으려면
오프스크린 캔버스에 티끌마다 캐시를 떠야 해서 무겁다. 그런데 이 세계에서는
**깊이가 곧 화면 y**다(지평선이 가장 멀고 아래가 가장 가깝다). 그래서 지평선에서
아래로 옅어지는 띠 하나를 화면 전체에 씌우면 그게 곧 거리 안개다 — `_drawDepthFog`.
오브젝트를 건드리지 않으니 무엇도 투명해지지 않는다.

> 띠의 **위쪽도 0에서 시작해야 한다.** 지평선에서 곧바로 진하게 들어가면
> 스카이라인 밑동을 가로지르는 자 대고 그은 듯한 선이 생긴다.

**② 가까이서 속도가 죽고 뒤 건물과 겹쳤다.**

`spread`를 1650 → 700까지 줄인 대가였다. 하단을 채우려고 줄인 건데, 옆으로 못 벗어나니
근경에서 자리가 거의 안 바뀌어 **멈춘 것처럼** 보이고 뒤따라오는 것과 포개졌다.
1020/1680으로 되돌리고 수명을 1.4 → 1.15로 줄였다.

**③ 배경이 트랙을 침범해 시선을 뺏었다.**

`baseOffset` 80은 너무 가까웠고 `TIER.hero` 1.5는 너무 컸다. 190/430과 1.18로.
**주인공은 트랙 위의 아이다** — 아이가 봐야 하는 것은 장애물이지 로켓이 아니다.

> 이 셋을 고치자 이번엔 좌우가 휑해졌다. `SIDE_SPAWN_GAP`을 0.62 → 0.46으로 낮춰
> 되돌렸다. **자리(spread·baseOffset)와 밀도(gap)는 따로 다뤄야 한다** —
> 한 값으로 둘 다 맞추려 하면 계속 한쪽이 어긋난다.

**교훈**: 오프스크린 렌더는 색·구성·접지감을 보는 데는 충분하지만 **움직임과 겹침은
못 본다.** 정지 프레임에서 "가까이서 느려진다"는 보이지 않는다. 도구는 반복을 줄여줄 뿐
실기기 확인을 대신하지 못한다.

### 배경을 눈으로 보는 법 — `npm run world`

```bash
npm run world                    # world.png, 3초 지점
npm run world -- out.png 8.5     # 8.5초 지점
```

배경은 테스트로 안 잡히고, 게임을 켜려면 카메라를 열고 레벨을 시작해야 한다.
`world.draw()`가 캔버스 컨텍스트 하나만 받는 덕에 브라우저 없이 그릴 수 있어서
`tools/renderWorld.mjs`로 뽑는다. **한 프레임만 보고 밀도를 판단하면 틀린다** —
프롭이 흘러가므로 초를 바꿔 여러 장 비교해야 한다.

### 남은 것

- **실기기에서 못 봤다.** 여기까지 전부 오프스크린 렌더로만 확인했다.
  실제 캔버스 크기·기기 색감에서 다시 봐야 한다.
- 2.5D의 남은 한계는 **스프라이트 각도가 고정**이라는 것이다. 시안은 좌측
  타워가 오른쪽을, 우측 로켓이 왼쪽을 본다. 뒤집기는 좌우 대칭인 것에만 먹힌다.
  3D에서 다시 뽑을 때 **좌45°/우45° 두 벌**로 뽑으면 해결된다.
- 다음은 **테마 팩**이다. 지금 `world.js`에 프롭 목록·하늘 장식 좌표·연석 색·
  지평선 실루엣이 전부 코드로 박혀 있어서, 정글 테마를 만들려면 파일을 통째로
  복사해야 한다. 이걸 JSON으로 빼면 **에셋 폴더 + JSON 한 장 = 새 게임**이 된다.
  개선을 먼저 끝낸 이유가 이것이다 — 무엇을 담아야 할지 모르는 채로 스키마를
  먼저 만들면 개선할 때마다 스키마를 고치게 된다.

---

## STEP 13 — 러너 테마화 (8/12)

### 왜

웜업은 **에셋만 바꾸면 다른 게임이 되는 틀**이다. 그런데 그 상태로 정글 버전을
만들려면 폴더를 통째로 복사하는 수밖에 없었다. 3,400줄짜리 사본이 늘고,
오늘 고친 버그를 다음에 두 번 고쳐야 한다.

**함정이 하나 더 있었다.** `config.js`에 `gameId: 'japari-run'`이 박혀 있었다.
폴더를 복사하고 이 줄을 못 보면 새 게임의 운동 기록이 웜업 기록에 합쳐진다.
"정글에서 아이가 얼마나 뛰었나"를 영영 못 묻게 되고, 섞인 건 되돌리기 어렵다.
이 서비스의 존재 이유가 운동 데이터인데 거기가 깨진다.

### 무엇을 갈랐나

```
src/games/runner/          엔진 — 코스·판정·원근·화면 구조 (게임을 모른다)
  theme.js                 테마 홀더. 꽂기 전에 읽으면 즉시 터진다
  index.js                 makeRunnerPlay(theme) → 게임팩의 play.js
src/games/runner-space/    manifest.json + theme.json + play.js(3줄)  ← 웜업
src/games/runner-jungle/   같은 모양                                   ← 새 게임
public/assets/runner/space/ · /jungle/
```

| | 테마 | 엔진 |
|---|---|---|
| 그림·소리·색 | ✓ | |
| 무엇이 놓이나(프롭 목록·좌표) | ✓ | |
| 기록 키(`game_id`) | ✓ | |
| 어디에 놓이나(원근·줄 배치·밀도) | | ✓ |
| 코스 진행·판정·상태 머신 | | ✓ |

**규칙은 테마에 넣지 않았다.** "이 장애물은 점프로 넘는다" 같은 것이 섞이면 테마가
두 번째 소스코드가 된다. 그건 다음 회차의 `actions.js` + `course.json`이 맡는다.

### 한 것

- 경로 **32곳**(`screens.js` 13 · `legacy-shell.js` 5 · `main.js` 3 · `style.css` 3 …)을
  `assetBase`에서 받게 했다
- 이미지 이름 목록을 `assets.js`에서 걷어내고 테마가 선언하게 했다 —
  정글의 나무를 `bg_rocket_pink`라고 부를 수는 없다(`CLAUDE.md`의 파일명 규칙)
- `world.js`의 프롭·팔레트·하늘 장식·지평선 실루엣을 테마로. **판단 근거 주석은 남겼다** —
  새 테마를 만드는 사람이 왜 이런 모양인지 알아야 값을 고를 수 있다
- 알파를 붙여 쓰는 색은 `[r,g,b]` 배열로 통일. 문자열로 두면 테마마다
  `rgba(126,168,240,0.46)` 같은 것을 알파 개수만큼 적어야 하고 하나만 고쳐도 어긋난다
- `stats.js`의 `GAME_ID`를 테마에서. **우주는 `warmup-obstacle`을 그대로 뒀다** —
  예전 `japari-run`에서 한 번 옮겼고 또 바꾸면 쌓인 기록이 다시 갈린다

### CSS는 JSON을 못 읽는다

타이틀 배경만 `style.css`에 경로가 박혀 있었다. 여기에 두면 테마마다 CSS를 복사해야 한다.
변수(`--rn-title-bg`)만 두고 값은 `theme.js`가 `:root`에 꽂는다.

### 도형 플레이스홀더 — `tools/makePlaceholders.mjs`

```bash
node tools/makePlaceholders.mjs src/games/runner-jungle/theme.json
```

`theme.json`의 목록을 읽어 이름에서 역할을 짐작해 도형을 만든다(75장). 그림이 나오기
전에도 게임이 돌아 구조를 검증할 수 있고, 더 중요하게는 **목록에서 빠진 그림이 그 자리에서
드러난다.** 이미 있는 파일은 덮지 않아서 진짜 그림이 한 장씩 도착해도 된다.

### 테스트로 잠근 것 — `test/runnerTheme.test.js` (24건)

새 테마에서 키 하나가 빠져도 **화면은 멀쩡해 보인다.** 캔버스는 아무 말 없이 안 그리고
게임은 돌아간다. 며칠 뒤에야 "정글은 왜 바닥이 검지?" 하고 발견한다.
똥 피하기가 `extra_data.exercise`를 빠뜨려 운동 통계에서 통째로 빠졌던 사고와 같은 종류다.

- 두 테마가 스프라이트 키 **구조가 같은지** (한쪽에만 있는 키는 다른 쪽에서 터진다)
- 팔레트 21개가 다 있고 알파용 색이 배열인지
- `theme.id === manifest.id`, 두 테마의 id와 `assetBase`가 서로 다른지
- **선언한 그림 파일이 실제로 있는지**
- 엔진 코드 9개 파일에 `/assets/runner/` 경로가 남아 있지 않은지

### 겪은 것

`setTheme()` 전에 `theme()`을 읽으면 즉시 던지게 했더니 **`stats.test.js` 15건이
바로 깨졌다.** 그게 맞다 — 조용히 `undefined`가 흘러다니면 게임 이름 없는 행이 쌓인다.
테스트에 `setTheme(spaceTheme)` 한 줄을 넣어 해결했다.

### 겪은 것 ② — 러너 게임 둘이 다 안 켜졌다 ★

정글을 붙인 직후 **우주까지 같이 죽었다.** 원인은 한 줄이었다.

```js
export const STAGE_HTML = `... <img src="${ui('menu')}"> ...`   // ✗
```

`legacy-shell.js`의 스테이지 마크업이 **상수**였다. 안에 테마 경로를 넣는 순간
그 템플릿 리터럴이 **import 시점에 평가**된다. 그때는 `setTheme()`이 아직 안 불렸으니
`ui()`가 던지고, 모듈 로드 자체가 실패해 두 게임이 다 안 켜졌다.

```js
export function stageHtml() { return `...` }   // ✓
```

**함정의 모양이 특이하다.** 테마를 읽는 코드가 함수 안에 있으면 안전한데, 상수
초기화식(템플릿 리터럴·객체 리터럴) 안에 있으면 import가 곧 실행이다. 눈으로는
구분이 잘 안 간다. `npm run build`도 통과했고 테스트 333건도 다 통과했다 —
**아무도 모듈을 그냥 import해 보지 않았기 때문이다.**

→ `test/runnerBoot.test.js`를 만들었다. **`setTheme()`을 부르지 않고** 러너 모듈
11개를 import만 해 본다. 그게 이 테스트의 전부다.

같이 나온 것 하나 더 — 경로 일괄 치환(`sed`)이 `runner-space/manifest.json`의
`thumbnail`·`hero`까지 건드려 허브 카드가 검게 나왔다. **JSON은 템플릿이 아니다.**
기계적 치환을 돌린 뒤에는 `.json`·`.css`처럼 코드가 아닌 파일을 따로 확인해야 한다.

### 겪은 것 ③ — 정글이 우주 하늘을 썼다 ★★

정글 플레이 화면에 **밤하늘과 보라 구름**이 떴다. 바닥은 초록, 트랙은 황토(팔레트는
테마에서 오니 맞다). 그림만 앞 테마 것이었다.

원인은 `main.js`의 이 한 줄.

```js
let assetsReady = false;   // 앱 수명 동안 하나
```

우주를 먼저 열면 `true`가 되고, **정글은 로딩을 통째로 건너뛴다.** 두 테마가
`bg_sky`·`char_run01`·`signs_up` 같은 **같은 이름**을 열 개 넘게 쓰므로,
`IMG['bg_sky']`에 남아 있던 우주 하늘이 그대로 그려졌다.

고친 것 둘.

- 로딩 완료 여부를 불리언이 아니라 **테마 id**로 기억한다 (`assetsReadyFor(id)`)
- `loadAssets()`가 시작할 때 **`IMG`를 비운다.** 안 비우면 이번 테마에 없는 이름이
  살아남아, 나중에 이름이 겹치는 자리에서 옛 그림이 튀어나온다

**이게 STEP 13에서 가장 위험한 종류의 버그였다.** 예외도 경고도 없고 게임은 멀쩡히
돈다. "왜 정글인데 밤하늘이지?" 하고 눈으로 발견할 때까지 아무 신호가 없다.
테마를 공유 전역(`IMG`)에 담는 구조는 **바뀔 때 비우는 책임**이 반드시 따라온다.

→ `runnerTheme.test.js`에 두 건 추가: 두 테마가 같은 이름을 열 개 넘게 쓴다는 것을
먼저 확인하고(그래서 위험하다), `loadAssets()`가 앞 테마 그림을 비우는지 본다.

> 곁가지 — 도형 생성기에서 `fx_start_button`이 **별**로 그려졌다. `/star/` 정규식이
> "**star**t"에 걸렸다. 규칙 순서를 바꿔 UI를 먼저 잡게 했다.

### 세 번째 테마 — 쥬라기 (8/12)

정글 그림을 기다리는 동안 **구조가 진짜로 값싼지** 확인하려고 하나 더 만들었다.

만든 것: `runner-jurassic/`의 `theme.json` · `manifest.json` · `play.js`(3줄) +
registry 한 줄 + 도형 74장. **엔진 코드는 한 줄도 안 건드렸다.**

색으로 세 세계가 갈린다 — 우주는 밤·보라, 정글은 한낮·초록, 쥬라기는 새벽·호박.
같은 트랙 구조를 써도 다른 곳으로 느껴지는 건 팔레트에서 나온다.

**테스트를 자동 수집으로 바꿨다.** `runnerTheme.test.js`가 `src/games/runner-*`를
스스로 찾는다. 목록을 손으로 적어두면 네 번째 테마를 만들 때 이 파일 고치는 걸
잊고, **그 테마만 아무 검사 없이 지나간다.** 검사가 없는 게 제일 위험하다.
"테마가 둘 이상이다"를 검사하는 테스트도 넣었다 — 하나뿐이면 나머지 비교가
전부 자기 자신과 하는 것이라 아무것도 못 잡는다.

**플레이스홀더도 팔레트를 읽게 했다.** 하늘·능선 색이 코드에 박혀 있어서 세 테마가
전부 같은 파란 하늘이었다. 도형이라도 색이 달라야 어느 테마를 보는지 한눈에 안다.

### 쥬라기 컨셉아트 반영 (8/12)

컨셉아트가 나와서 임시로 잡아둔 값을 통째로 갈았다.

**팔레트를 새벽 호박빛 → 한낮 파랑으로.** 아트는 밝은 낮이었다. 그런데 정글도 한낮이라
하늘색만으로는 안 갈린다 — **트랙 색으로 갈랐다.** 정글은 황토(`#b8823a`),
쥬라기는 짙은 갈색 자갈(`#5a4a3d`). 바닥은 둘 다 초록이지만 트랙이 확실히 다르다.

**프롭을 아트에 있는 물건으로.** T-Rex 두개골 게이트(`obs_skull_gate`)·화석 박힌 바위·
폭포 절벽·초가 오두막·밧줄 다리·공룡알 둘·아기 공룡 셋·횃불 기둥·공룡 간판.
익룡 두 마리와 화산은 하늘 장식으로.

**연석에 벽돌 이음매를 넣었다.** 아트의 연석은 사암 블록이 이어진 물건인데 코드는
민무늬 띠를 그리고 있었다. 이음매가 지나가는 것이 **속도감의 절반**이다(나머지 절반은
셰브론). 먼 구간은 안 그린다 — 간격이 1px 밑으로 내려가면 모아레가 되는 건
바닥 이음선에서 이미 겪었다.

> 아트에서 아기 공룡들이 **원형 돌 받침 위**에 서 있다. 엔진에 받침 기능을 다시
> 넣을 수도 있었지만, **받침까지 한 장으로 그리는 편**이 낫다 — 그림자가 스프라이트
> 맨 아래에 정확히 깔리고 엔진에 옵션이 늘지 않는다. 발주서에 그렇게 적었다.

### 겪은 것 ④ — `--force`로 완성된 에셋을 도형으로 덮었다 ★★

플레이스홀더 색을 고친 뒤 세 테마를 한꺼번에 다시 뽑았다.

```bash
for t in space jungle jurassic; do node tools/makePlaceholders.mjs ... --force; done
```

**우주는 완성된 에셋 74장이 들어 있는 폴더였다.** git에 있어서 `git checkout --`으로
되살렸지만, 커밋 전이었으면 그대로 날아갔다.

"이미 있는 파일은 안 덮는다"는 규칙은 있었는데 `--force`가 그걸 통째로 무시했다.
**`--force`의 의미가 "내가 만든 것을 다시 만든다"가 아니라 "전부 덮는다"였던 것이 문제다.**

고친 방식: 만든 파일 이름을 폴더의 `.placeholders`에 적어둔다. `--force`는 **그 목록에
있는 것만** 다시 만들고, 목록에 없으면 사람이 넣은 진짜 그림으로 보고 건너뛴다.
이제 우주에 `--force`를 돌리면 `진짜 그림 74장 보존`이라고 찍고 아무것도 안 한다.

> 되살릴 수 있었던 이유는 에셋이 git에 있었기 때문이다. **생성 도구는 사람이 만든
> 것과 도구가 만든 것을 구분할 수 있어야 한다** — 구분할 수 없으면 언젠가 덮는다.

### 정글 에셋 1차 도착 (8/13)

9장이 들어왔다 — 원숭이·호랑이·티키토템·사원게이트·폭포·밧줄다리·오두막슬라이드·
북기둥·출발선. 넣을 때 두 가지를 손봤다.

**글로우를 잘라냈다.** 컨셉 시트용 발광 헤일로가 이미지 전체에 낮은 알파로 깔려
있었다. 그대로 두면 초록 바닥 위에 네모난 빛 자국이 남고, **물건 아래로 번진 만큼
공중에 뜬다**(아래 여백 = 공중부양, `docs/08` ①번 규칙). 알파 128 기준으로 잘라
물건이 이미지 바닥에 닿게 만들었다.

**크기를 규칙에 맞췄다.** 1254~1536px로 와서 긴 변 1000(출발선만 1600)으로 줄였다.

넣은 9장은 `.placeholders` 목록에서 뺐다 — **`--force`로도 안 덮인다.**

### 남은 것

- **정글·쥬라기는 아직 대부분 도형이다.** 발주서는 `docs/08`
- `actions.js` + `course.json`으로 규칙을 데이터화 (정글에 제자리 달리기·한 발 버티기·
  동물 요가를 넣기로 했다. 셋 다 감지기가 이미 있어 새 코드가 거의 없다)
- 러너는 아직 `core/gameShell.js`를 안 쓰고 `legacy-shell.js`를 들고 있다.
  테마 추출과 셸 이전을 같이 하면 무엇이 화면을 깨뜨렸는지 못 찾아서 이번엔 뒀다

---

## STEP 14 — 팝팝 클리커 (8/13)

기획은 `docs/09`. 여기는 만들면서 정해진 것과 겪은 것만 적는다.

### 캘리브레이션을 없앴다 ★

**"게임마다 3초씩 가만히 서 있으라고 하면 지겹지 않겠나"**는 물음에서 시작했다.
코드를 열어 보니 이미 두 갈래로 갈라져 있었다.

| | 방식 |
|---|---|
| 러너 `motionDetector.js` | 3초 서 있게 하고 기준선을 잡는다 |
| `highKnees`·`balance` | **캘리브레이션 없음** — 롤링 기준선 |

나중에 만든 쪽이 이미 버린 길이었다. `core/pose/detectors/moves.js`도 그쪽을 따랐다.

**저장해서 여러 게임이 공유하는 방식은 택하지 않았다.** 지겨움은 줄지만
앉은 채로 잡힌 기준·바뀐 카메라 각도·다른 아이의 몸이 그대로 남고,
**그게 틀렸다는 걸 아무도 모른다.** 이 프로젝트에서 조용히 틀리는 것이 제일 위험하다.

준비 화면은 없애지 않고 **연속 플레이면 자동 통과**시켰다(`QUICK_RESUME_SEC = 60`).
전신이 보일 때만 넘어가므로 안전장치는 그대로다.

### 문턱값을 한 벌로

점프·앉기·좌우가 러너 게임팩 안에 갇혀 있었다. `core/pose/tuning.js`에 `MOVES`로
올리고 러너의 `config.motion`이 그걸 가져다 쓰게 했다 — `GESTURE`와 같은 방식이다.
**러너의 판정 로직은 건드리지 않았다.** 값도 그대로다.

### 겪은 것 ① — 스쿼트에서 일어나는 걸 점프로 셌다 ★

합성 프레임 테스트가 바로 잡았다. 원인이 둘이었다.

**롤링 기준선을 `highKnees`처럼 "가장 낮았던 위치"로 잡았다.** 무릎은 서 있을 때가
항상 제일 낮지만 **골반은 앉으면 더 내려간다** — 앉는 순간 기준선이 따라 내려가서
앉기가 영영 안 잡혔다. 중앙값으로 바꿨다(아이는 대부분의 시간을 서 있다).

그리고 **일어나는 순간은 골반이 빠르게 올라가 점프로도 보인다.** 중앙값 기준선이면
일어나도 기준선을 넘지 않아 대부분 해결되지만, 실제 몸은 살짝 넘칠 수 있어
`squatToJumpLockSec = 0.35`로 직후 잠깐 점프를 막았다.

> 이 버그는 **웹캠으로는 못 찾았을 것이다.** 사람이 앉았다 일어나면 점프 카운트가
> 하나 오르는데, 화면을 보고 있으면 "방금 내가 뛰었나?" 하고 넘어간다.

### 겪은 것 ② — `str.replace`가 두 곳을 바꿨다

`this._squatting = false`가 생성자와 `_squat()` 양쪽에 있었는데 파이썬
`str.replace`가 둘 다 고쳐서, 함수 안에 초기화 코드가 박혔다. 테스트는 통과했지만
(중앙값 수정만으로 그 케이스가 풀려서) **점프 잠금이 죽은 채 남을 뻔했다.**
기계적 치환 뒤에는 결과를 눈으로 봐야 한다 — 이번 회차에서 두 번째다.

### 오답을 없앤 것이 규칙이 됐다

`hit()`이 틀린 동작에 `{ ok: false }`만 돌려주고 화면도 아무것도 하지 않는다.
빨간 X도 목숨 차감도 없다. 시간이 지나면 힌트가 커지고, 더 지나면 조용히 넘어간다.
테스트로 잠갔다(`run.lives`가 아예 없다는 것까지).

### 에셋 없이 만들었다

그림이 하나도 없어서 **클리커를 CSS로 그리고** `background-image`를 그 위에 얹었다.
파일이 오면 404가 나던 자리가 그림으로 바뀐다. 러너처럼 로더를 두지 않은 이유는
DOM이라 브라우저가 알아서 처리하고, 로더를 두면 "없는 파일" 경고만 잔뜩 나기 때문이다.

소리도 파일이 없어서 WebAudio로 합성했다. **불러오는 지연이 없다는 게 더 크다** —
이 게임의 생명은 동작에서 소리까지 150ms 안이다. 클리커마다 음정이 달라
연속 묶음이 짧은 멜로디가 된다(소개서의 그 아이디어).

### 남은 것

- **실기기 검증** — 라운드 68회가 적당한지, 팔 문턱 6%가 맞는지, 오검출로 클리커
  두 개가 눌리지 않는지. 전부 아이가 움직여 봐야 안다
- 그림·소리 에셋 (목록은 `pop-clicker/assets.js`가 정본)
- 러너를 `moves.js`로 이관 — 클리커가 잘 돌면

---

## STEP 15 — 공용 UI · 트랙 (8/13)

### 공용 UI를 `_shared/`로

방향 힌트 5장 · 메뉴 아이콘 4장 · 음소거 버튼 4장은 **모든 게임에서 같은 그림**이다.
테마마다 복사해 두면 세 벌이 되고, 아이콘 하나를 고칠 때 한 곳을 빠뜨리면
게임마다 다른 아이콘이 뜬다.

`theme.js`의 `img()`가 이름에 `/`가 있으면 테마 폴더 밖에서 찾게 했다.

```
img('bg_sky')            → /assets/runner/space/image/bg_sky.png
img('_shared/signs_up')  → /assets/runner/_shared/signs_up.png
```

테마 셋의 중복본 39장을 지웠다. 생성기는 `_shared/` 이름을 건너뛰고,
테스트는 힌트·메뉴·음소거가 전부 `_shared/`를 가리키는지 검사한다.

### 겪은 것 — 레인 구분선이 3등분이 아니었다 ★

```js
const nearX = cx + hwN * f * 2 * 1.5;   // f = ±1/3
```

`(1/3) × 2 × 1.5 = 1.0`이라 **구분선이 트랙 가장자리에 딱 붙어** 그려지고 있었다.
화면에는 테두리 선만 두 줄 보이고 3등분은 눈에 띄지 않았다. 레인이 셋이면
경계는 중앙에서 ±hw/3이다 — 그게 전부인데 배수가 두 개 더 붙어 있었다.

**아이가 "내가 어느 칸에 있나"를 알아야 좌우 이동이 게임이 된다.** 굵기도 올렸다
(번짐 16 → 본체 8 → 흰 코어 2.5의 세 겹).

### 트랙 돌길 무늬

단색 사다리꼴은 색이 아무리 좋아도 **판때기**로 보인다. 가로 줄눈 + 줄마다 반 칸씩
어긋난 세로 이음으로 돌길을 냈다. 격자로 딱 맞추면 타일이 되고 어긋내면 길이 된다.

> 줄눈에 `floorSeam`(잔디용 초록)을 쓰지 않았다. 갈색 트랙에 얹으면 얼룩이 된다 —
> 돌 사이 그늘은 어느 테마에서나 검다.

먼 구간은 `p < 0.14`에서 아예 건너뛴다. 모아레는 보도블럭·연석에서 두 번 겪었고
같은 규율을 그대로 썼다.

바닥의 세로 이음선은 개수를 절반으로 줄였다 — 촘촘하면 잔디가 **타일 바닥**처럼 보인다.

---

## STEP 16 — 정글·쥬라기 에셋 투입 (8/14~15)

디자인 쪽에서 그림이 들어오기 시작했다. **쥬라기 14장 + 정글 19장 + 공용 UI 2장 + 하늘.**
여기서 고친 것 대부분은 에셋 자체가 아니라 **놓이는 방식**이었다 — STEP 12에서 배운 것과 같다.

### 하늘 · 능선 — 늘이지 말고 덮거나 이어 붙인다

| 것 | 어떻게 |
|---|---|
| 하늘 | **덮기(cover)** — 상자에 맞춰 늘이면 구름이 옆으로 눌린다. 비율을 지킨 채 상자를 다 덮게 키우고 넘치는 만큼 자른다. 아래로 넘친 부분은 능선·바닥이 덮으니 손해가 없다 |
| 능선 | `skylineMode: "center"` — 중앙에 한 장을 놓아 **게이트를 소실점에 맞추고** 거기서 좌우로 이어 붙인다 |

능선을 예전처럼 `x = -step`부터 타일링하면 게이트가 서너 개로 늘어나고 **어느 것도
트랙과 안 맞는다.** 랜드마크가 있는 그림은 한 번 놓고 시작해야 "저기로 달려간다"가 된다.
우주의 빌딩처럼 어디를 잘라도 같은 그림이면 `"tile"`이 맞다 — 그래서 모드가 둘이다.

크기는 `skylineH`로 뺐다. 처음엔 폭을 화면(1600)에 맞췄더니 높이가 500을 넘어
위쪽을 다 덮고 **그 뒤에 있어야 할 화산이 통째로 가려졌다.**

### 겪은 것 — 화산이 능선 앞에 있었다 ★

`skyDeco`를 스카이라인 **뒤에** 그리는 그룹과 앞에 그리는 그룹으로 갈랐다(`behind: true`).
화산은 뒤, 구름·익룡은 앞이다. 그리는 순서가 곧 깊이인데 배열 하나에 다 들어 있었다.

### 겪은 것 — 근경에 노치가 있었다 ★★

트랙 앞쪽 좌우 모서리에 초록이 쐐기처럼 비쳤다. **우주·정글·쥬라기 세 게임 다** 있던 것이다.

원인: 연석 윗면이 `yAt(p) - lift(p)`에 있어서 `p=1`(화면 바닥)에서 lift(44px)만큼
**위에서 끝난다.** 그 아래 삼각형에는 아무것도 없다.

고친 법: 트랙·연석을 `P_OVER = 1.3`까지 그려 화면 밖으로 넘긴다. y와 반폭이 **둘 다 p에
선형**이라 p를 1보다 크게 잡아도 같은 직선이 이어질 뿐이다 — 모양은 그대로고 잘려서 안 보인다.

### 좌우 프롭 — 줄은 자리의 기준이지 자리가 아니다

줄(`SIDE_ROWS`)마다 `baseOffset`·`spread`가 고정이라 같은 줄의 물건들이 **정확히 같은
궤적**을 따라 흘렀다. 화면에는 나무가 한 줄로 늘어선 가로수길처럼 보였다.

물건마다 세 가지를 어긋낸다 — 옆으로(`jOff`, **바깥쪽으로만** 크게. 안쪽으로 밀면 트랙 침범),
벌어지는 속도(`jSpread`), 앞뒤(`jDepth`). 스폰 간격에도 흔들림을 줬다:
물건만 흩어지고 박자가 일정하면 여전히 기계적으로 보인다.

밀도는 줄을 둘에서 **셋**으로 늘려 올렸다. 간격을 좁히면 같은 줄 안에서 앞뒤가 겹친다.

### 겪은 것 — 잔디가 수직으로 떨어졌다 ★

풀 획을 줄마다 x 고정으로 두고 y만 내렸더니, 달리는 게 아니라 **비가 오는** 것처럼 보였다.

실제로 달리면 발밑의 풀은 소실점에서 나와 바깥으로 벌어지며 지나간다. 포기마다
중심에서의 비율을 고정하고 x를 깊이에 따라 벌렸다 — 세로 이음선이 그리는 것과
**같은 부챗살**이다. 둘이 같은 선을 타야 바닥이 한 덩어리로 흐른다.

난수는 시드로 고정한다. 매 프레임 다시 뽑으면 잔디밭 전체가 지글거린다.

### 겪은 것 — 위쪽이 허옇게 떴다 ★

지평선 아래 잔디가 바랜 것처럼 보였다. 범인이 셋이었고 **전부 하늘색을 바닥에 얹는 것**이었다.

1. `_drawFloorGloss`의 광택 빛줄기 — 우주의 젖은 바닥용이다. 초록에 얹으니 바닥이
   통째로 떠서 **팔레트를 아무리 어둡게 해도 색이 안 잡혔다**
2. 지평선 헤이즈 0.30
3. `_drawDepthFog`가 지평선 **아래로 250px**을 덮고 있었다

잔디 테마에서는 ①③을 끄고 ②를 0으로, 안개 띠는 지평선 **위로** 올렸다(top −110, span 150).
안개는 능선 밑동의 자른 듯한 경계를 지우려고 있는 것이지 바닥을 덮으려는 게 아니다.
초록 위의 하늘색은 원경으로 안 읽히고 그냥 바랜 자국으로 보인다.

### START 버튼 — 앱 전체 공용 `/assets/ui/`

`_shared/`는 러너들끼리 공용인데, START 버튼은 **똥 피하기·팝팝 클리커도 같이 쓴다.**
그래서 러너 밖에 층을 하나 더 뒀다.

```
img('_shared/signs_up')  → /assets/runner/_shared/signs_up.png   러너 공용
img('ui/btn_start')      → /assets/ui/btn_start.png              앱 공용
```

경로의 정본은 `src/core/uiAssets.js` 하나다. 화면 코드가 문자열로 경로를 적기 시작하면
다시 흩어진다. `gameShell`의 안내 화면 `▶ 시작하기` CSS 버튼도 이 그림으로 바꿔서,
셸을 쓰는 게임은 자동으로 따라온다. 테마가 START를 자기 폴더로 되돌리면 테스트가 잡는다.

### 허브 히어로에 로고

**4~8세는 글자를 못 읽는다.** 로고는 아이가 "저 게임"이라고 알아보는 유일한 표지다.
`manifest.logo`가 있으면 글자 제목 대신 그림이 뜬다. 없는 게임은 글자로 남는다.

### 주인공은 테마가 아니다 ★

플레이어 13장이 왔다. **`_shared/`에 한 벌만 두고 세 테마가 같이 쓴다.**

배경은 테마지만 주인공은 테마가 아니다. 테마마다 복사해 두면 우주만 옛 그림이 남는
식으로 갈라지고, 아이는 게임을 옮길 때마다 **자기 캐릭터가 바뀌는 걸 본다.**
러너의 새 버전이 생겨도 배경만 그리면 된다 — `sprites.character`는 손대지 않는다.

테마가 캐릭터를 자기 폴더로 되돌리면 테스트가 잡는다(`_shared/`로 시작하는지 검사).

> 서 있는 프레임(`char_idle_*`)은 따로 오지 않았다. `char_run01`·`char_run04`가 두 발
> 다 딛고 선 자세라 그 둘을 번갈아 쓴다 — 무게중심이 살짝 옮겨져 대기 동작이 된다.
> 전용 프레임이 오면 `idle` 배열 두 줄만 바꾸면 된다.
>
> 우주의 옛 캐릭터는 **지우지 않고** `public/assets/runner/space/_unused/`로 옮겼다.

### 겪은 것 — 장애물을 공용으로 만들었다가 되돌렸다 ★

우주의 큐브·허들·자세 표지판까지 `_shared/`로 올려 셋이 같이 쓰게 했다.
근거는 "규칙의 그림은 같아야 아이가 다시 안 배운다"였고, 그 자체는 맞다.

**그런데 놓아 보니 안 맞았다.** 보라 네온 큐브가 정글 흙바닥과 쥬라기 돌길 위에서
그 세계의 물건으로 안 보였다. 규칙을 알려주는 것은 **모양**이고, 모양만 같으면
색과 재질은 세계를 따라가야 한다 — 큐브는 큐브고 허들은 허들이되 정글 것은 티키
석상이고 우주 것은 네온 상자다.

그래서 경계를 다시 그었다.

| 층 | 무엇 | 왜 |
|---|---|---|
| `_shared/` | 캐릭터 · 방향 힌트 · 메뉴 · 카운트다운 · 레벨 완료 · 시상대 · GO · 자세 실루엣 | **화면 위의 연출**이라 세계와 상관이 없다 |
| 테마 | 장애물 전부 · 관문 · 출발선 · 배경 | **바닥에 놓이는 물건**이라 세계를 따라야 한다 |

가르는 기준은 "규칙이냐 세계냐"가 아니라 **"바닥에 놓이냐 화면에 뜨냐"**였다.
테스트가 양쪽을 다 본다 — 연출은 `_shared/`를 가리키는지, 장애물·출발선은
**가리키지 않는지**.

> 정글 장애물 8장(티키 큐브 3 · 덩굴 허들 2 · 표지판 3)이 8/16에 들어왔다.
> 쥬라기는 그림이 오는 중이라 도형을 되살려 자리를 지킨다.

### 여자아이 캐릭터 — 성별이 아니라 아이가 고른다 ★

플레이어가 두 벌이 됐다. `_shared/char/boy/` · `_shared/char/girl/`.

**무엇으로 고를 것인가**를 먼저 정했다.

| 안 | 왜 아닌가 |
|---|---|
| 가입 성별을 따른다 | 가입은 부모가 하고 캐릭터는 아이가 논다. 남자아이가 분홍으로 달리고 싶을 수 있고 막을 이유가 없다. **가입 없이도 게임이 돌아가므로** 비회원은 자기가 아닌 캐릭터를 받는다 |
| 게임 안에서 묻는다 | 4~8세에게 게임 시작 전의 벽이다. 캘리브레이션을 없앤 것과 같은 이유 |

결론은 **`/start`에서 이미 고른 프로필을 그대로 쓴다**. 새 화면도 새 저장값도 없다.
계정이 생겨도 이 값이 우선이고, 가입 성별은 기본값을 고를 때만 쓴다.

바꾸는 자리는 `/buddy`다 — 아이 화면이고, 버디·배지와 함께 "나"에 관한 것이 한곳에 모인다.
버튼이 셋으로 늘어 하단이 줄바꿈되면 **머무르기 타겟이 세로로 인접**해지므로
`nowrap` + 패딩 축소로 한 줄을 지켰다(하단 4칸 바에서 겪은 그것).

### 구현 — 테마가 아니라 스킨으로 갈린다

캐릭터 경로만 한 겹 더 갈린다.

```
img('_shared/char_run01') → /assets/runner/_shared/char/<skin>/char_run01.png
```

`skin`은 `src/core/playerSkin.js`가 `state.profile`을 읽어 정한다(없으면 `boy`).
**테마 JSON에 남녀 목록을 따로 두지 않았다** — 테마 수 × 성별 수만큼 늘어나고,
새 러너를 만들 때마다 캐릭터 24줄을 다시 적어야 한다.

> `assets.js`의 로딩 캐시 키에 스킨을 넣었다. 테마 id만 보면 남자아이로 한 판 하고
> 프로필을 바꿔도 앞의 그림이 그대로 남는다 — 정글이 우주 하늘을 쓴 것과 같은 함정이다.

테스트가 **두 벌 다 있는지** 본다. 한쪽만 채우면 그 프로필을 고른 아이 화면에서
주인공이 통째로 사라진다.

> 여자아이는 11장이다(`char_jump_air_b` 없음). 지금 쓰지 않는 여벌이라 문제는 없다.

### 똥 피하기도 같은 아이로

플레이 화면(5자세)과 튜토리얼이 `playerSkin()`을 따른다. `/assets/characters/<skin>/`.

인트로 타이틀은 **아이 캐릭터를 얹었다가 되돌렸다.** 로고 위에 주인공이 둘이 됐다 —
이 화면의 얼굴은 게임 이름과 똥이다.

튜토리얼은 전용 그림(`char_tutorial_*`)을 따로 갖고 있었는데 게임과 같은 것을 쓰게 했다.
**화면을 넘길 때마다 다른 아이가 나오면 "내 캐릭터"라는 감각이 안 생긴다.**

남녀 열 장이 8/16에 다 들어왔다. 옛 그림은 `characters/_unused/`에 있다.

### 겪은 것 — 캐릭터가 찌그러졌다 ★

`_drawCharacter()`가 가로를 상수로 갖고 있었다.

```js
const CHAR_RATIO = 1070 / 1450   // 옛 그림의 가로/세로
const cw = ch * CHAR_RATIO
```

새 그림은 서 있기 0.42, 달리기 0.68로 **자세마다 비율이 다르다.** 하나로 박아 두면
새 그림이 올 때마다 찌그러진다. 높이만 맞추고 가로는 `img.width / img.height`로 읽는다.

### 겪을 뻔한 것 — 상수 초기화식 안의 함수 호출 ★

`intro.js`의 `IMG`는 모듈 최상단 상수라, 거기에 `playerSkin()`을 그냥 적으면
**import 시점에 한 번** 돈다. /buddy에서 캐릭터를 바꿔도 새로고침 전까지 옛 아이가 남는다.
`tutorial.js`도 같은 모양이었다.

러너의 `STAGE_HTML`이 import 시점에 테마를 읽어 게임 둘이 통째로 죽은 적이 있다
(STEP 13). **상수 초기화식 안의 함수 호출은 눈으로 잘 안 보인다** — `IMG`는 getter로,
튜토리얼은 함수로 바꿨다.

### 남은 것

- 정글 `bg_banana_bunch` · `bg_lily_pond` · `bg_star_leaf_small` · `bg_temple_ruin` · `bg_torch`
- 쥬라기 `bg_boulder_mossy` · `bg_fern_cluster` · `bg_hut_watchtower` · `bg_log_pile` · `bg_rope_bridge` · `bg_torch_pillar`
- 두 테마의 `obs_*` · `fx_*` 도형은 **버렸다** — 우주의 진짜 그림을 `_shared/`로 공유한다

도형 플레이스홀더는 **프롭 목록에서 뺐다.** 진짜 그림이 있는데 회색 네모를 섞으면
풍성한 게 아니라 덜 된 화면으로 보인다. 그림이 오면 한 줄로 되돌아온다.

---

## STEP 17 — 똥 피하기 5칸 (8/17)

칸을 다섯으로 늘렸다. 그림보다 **판정과 기록**이 일이었다.

### 겪을 뻔한 것 — 경계에서 떨린다 ★★

`zoneDetector`가 골반 x를 등분해 자르기만 했다. 히스테리시스가 없다.

3칸일 때는 한 칸이 화면의 33%라 견뎠다. 5칸은 20%다. **흔들림 폭은 그대로인데 칸이
좁아지니 같은 코드가 다르게 동작한다.** 경계에 선 아이는 MediaPipe의 미세 떨림만으로
칸이 초당 몇 번씩 바뀐다.

화면이 깜빡이는 것으로 끝나지 않는다 — **`sideSteps`가 가만히 서 있는 아이에게서
올라간다.** 이 프로젝트에서 운동 데이터 오염은 그냥 버그가 아니다.

고친 법: 지금 칸 안에 있으면 경계에서 **칸 너비의 18%만큼 더** 벗어나야 옆 칸으로
인정한다. 들어갈 때와 나올 때 문턱이 다르다.

> 여유를 **비율**로 뒀다. 절대값으로 두면 3칸에서 넉넉하던 것이 5칸에서 칸의 절반이
> 되어 아예 못 넘어간다. 이 프로젝트의 다른 문턱들이 전부 `bodyHeight` 비율인 것과 같다.

브라우저로는 못 잡는 종류라 합성 좌표로 테스트한다 — 경계에서 ±0.01로 200프레임
흔들어도 칸 변경이 0이어야 한다.

### 언제 5칸이 되나 — 카메라 준비 화면에서 아이가 고른다

"라운드가 오르면 넓어진다"가 먼저 떠오르는데 두 가지가 걸렸다.

1. 아이가 혼란스럽다. 발밑 버튼이 셋이었다가 다섯이 되면 방금 배운 것이 어긋난다
2. **기록이 섞인다.** 한 판 안에서 칸 수가 바뀌면 그 판의 `side_steps`가 무엇을
   뜻하는지 아무도 말할 수 없다

그래서 칸 수는 **판이 시작할 때 한 번** 정하고 끝까지 간다(`poop-dodge/lanes.js`).

처음에는 성장 레벨로 자동 전환했는데 되돌렸다 — **어느 날 갑자기 판이 넓어지고
아이는 왜 그런지 모른다.** 지금은 카메라 준비 화면에 `3칸 / 5칸` 버튼을 두고
아이가 고른다. 누르면 **미리보기의 점선이 바로 바뀐다** — "5칸이면 내 방이 이렇게
갈린다"를 눈으로 보고 정하는 것이라, 좁으면 거기서 바로 안다.

제목은 왼쪽, 칸 버튼은 오른쪽에 두어 한 줄로 묶었다. 아래 버튼 무리에 섞으면
"시작"과 나란히 서서 눌러야 하는 것처럼 보인다 — **이건 고르는 것이지 진행하는 것이
아니다.**

### 겪은 것 — 점선이 거짓말을 하고 있었다 ★★

준비 화면의 미리보기 상자가 `4:3`인데 카메라는 **16:9로 요청**한다(640×360).
`object-fit: cover`가 **좌우를 25% 잘라낸다.**

그런데 칸 판정은 잘린 화면이 아니라 **원본 프레임 전체**를 등분한다. 즉 화면에
그려지던 점선이 실제 경계와 다른 자리를 가리키고 있었다. 3칸에서는 티가 덜 났고
5칸이면 바로 드러난다.

상자를 `16:9`로 바꿨다 — 카메라가 주는 그대로다. 잘리는 데가 없어 점선이 진짜
경계를 가리킨다. **칸 수가 비율을 바꾸는 게 아니라, 처음부터 16:9였어야 했다.**

### 부모가 잠근다 — `/me`의 "좁은 공간"

**5칸은 집이 좁으면 물리적으로 안 된다.** 카메라에 2m가 담긴다면 한 칸이 40cm인데
아이 몸통이 30cm다. 칸 옮기기가 큰 동작이 아니라 발 옮기기가 되면 운동량이
**오히려 줄어든다.**

공간은 아이가 판단할 수 있는 것이 아니라 부모가 아는 것이라, 잠금은 `/me`에 두고
레벨보다 세게 만들었다.

### 기록에 칸 수를 남긴다 ★

같은 거리를 걸어도 5칸이 3칸보다 `side_steps`가 더 세진다. 안 남기면 두 판의 숫자가
한 통에 섞이고 **섞인 것은 되돌릴 수 없다.** `saveResult`의 `extra_data.lanes`에 넣는다.

> 성장 통계(`recordSession`)에는 안 넣었다. 아이 한 명의 누적이라 3칸·5칸이 어차피
> 섞이고, 넣어도 조용히 버려진다 — **조용히 버려지는 필드를 두지 않는다.**

### 겪은 것 — 5칸에서 화면이 통째로 죽었다 ★★

배경만 나오고 **캐릭터도 발밑 버튼도 사라졌다.** "아직 작업이 안 된 화면"처럼 보였다.

원인은 `_drawMarkers()`의 폴백(알약 버튼) 쪽에 `sc`가 **선언 없이** 쓰이고 있던 것이다.
3칸일 때는 버튼 그림 셋이 항상 있어서 **그 줄이 한 번도 실행되지 않았고**, 5칸을 붙여
바깥 두 장이 비는 순간 `ReferenceError`가 났다.

그리고 그 버튼만 안 나오는 것으로 끝나지 않았다 — 예외가 draw 전체를 끊어서
그 뒤에 그려질 것이 다 사라졌다. **rAF 안에서 난 예외는 화면에 아무 말도 하지 않는다.**

> 죽은 코드에 숨어 있던 버그다. 눈으로는 못 잡고 브라우저 콘솔을 열어야 보인다.
> 그래서 `_drawMarkers`를 가짜 ctx로 불러 **그림이 없어도 안 던지는지** 테스트한다.

바깥 두 칸은 알약으로 떨어뜨리지 않고 **옆 칸 그림을 빌려 쓴다.** 그림 셋과 알약 둘이
섞이면 덜 된 화면으로 보인다.

### 색과 버튼 — 다섯 벌을 두고 3칸은 가운데 셋

3칸의 분홍·파랑·보라가 예전 그대로 남는다. 칸이 늘어날 때 색이 통째로 재배치되면
아이는 익숙한 "내 칸 색"을 잃는다. PIP 오버레이도 같은 팔레트를 쓴다 —
카메라 화면에서 파란 칸에 서 있는데 게임에서는 보라 칸이면 둘을 같은 것으로 못 읽는다.

5칸 버튼 그림(노랑·초록)은 8/17에 들어왔다. 기존 세 장과 **가로를 맞춰** 넣는다 —
그리는 쪽이 그림 높이를 기준으로 크기를 잡으므로 세로는 저마다 달라도 된다.

### 화면 정렬 두 곳

**게임 HUD** — 입력 배지(`⌨️ 키보드`)가 화면에 절대 배치(`top:58px, left:12px`)라
레벨 칩과 왼쪽 끝이 어긋났다. HUD 여백은 화면 폭을 따라 `clamp`으로 변하는데 배지만
고정값이었다. 배지를 **왼쪽 덩어리 안으로** 넣어 자동으로 맞게 했다.
HUD는 좌·중·우 세 덩어리이고 `align-items: flex-start`로 윗줄을 맞춘다 —
왼쪽만 두 줄이라 가운데 정렬하면 나머지가 아래로 처진다.

**준비 화면 가로 모드** — 제목·영상·조작 셋이 각자 접혀 폭이 제각각이었다.
영상과 조작을 `#rdy-body`로 **묶고**, 제목 줄과 같은 폭(`--rdy-w`)을 쓰게 했다.
가로에서는 제목 줄을 위에 그대로 두고 그 아래에서 영상(왼쪽)과 조작(오른쪽)을 나눈다.
셋을 다 옆으로 늘어놓으면 제목이 영상 옆에 붙어 어디에 속한 말인지 안 읽힌다.

---

## STEP 18 — 아이콘과 모바일 정렬 (8/18)

### 이모지를 걷어냈다 — `src/core/icons.js`

✋ ⌨️ 🚪 는 **기기마다 다른 그림이 뜬다.** 애플·구글·삼성이 각자 그리고 색과 두께가
제각각이라, 버튼 안에서 특히 튄다 — 글자는 얇은데 이모지만 알록달록 두껍다.

Lucide 모양의 인라인 SVG로 바꿨다. **Obra shadcn/ui 킷이 번들하는 그 세트**라
디자인 쪽에서 Figma로 시안을 그려도 같은 그림이 나온다.

라이브러리는 안 넣었다. 이 프로젝트는 바닐라 ES 모듈이라 `lucide-react`는 못 쓰고,
`lucide-static`은 1500여 개 중 열 개 쓰자고 의존성이 하나 는다. 쓰는 것만 적어 두고
늘어나면 그때 넣어도 늦지 않다.

색은 `currentColor`다 — 버튼마다 아이콘 색을 따로 적기 시작하면 테마를 바꿀 때
한 곳을 빠뜨린다.

> 없는 이름을 물으면 **던진다.** 조용히 빈 칸을 남기면 버튼에 글자만 남아
> "왜 아이콘이 없지"를 화면에서 못 찾는다.

### 플랫폼 전체로 (8/18)

허브 홈 · 마이페이지 · 내 친구 · 시작 화면 · 러너(준비·튜토리얼·리포트·HUD) ·
팝팝 클리커 · 불 끄기 · 돌다리 · 보상 화면까지 훑었다. 아이콘 40개.

정렬 스타일(`.pz-ico`)은 `global.css`에 **한 번만** 뒀다. 화면마다 `<style>`에 넣으면
새 화면을 만들 때 빠뜨리고, 그러면 아이콘이 글자 옆에서 혼자 위로 떠 있는 채로 나간다.

**남긴 것 셋** — 이유가 각각 다르다.

| 무엇 | 왜 안 바꾸나 |
|---|---|
| 캔버스 (`ctx.fillText('💩')`) | SVG를 못 쓴다. 그림이 오기 전의 자리표시다 |
| 몸동작 (🦘점프 · 🧎앉기 · 🙌만세) | **아이콘으로 바꾸면 더 나빠진다.** Lucide에 대응이 없고, 번개 모양을 점프라고 하면 아무도 못 읽는다. 진짜 실루엣 그림이 와야 할 자리다 |
| 데이터 (배지 · 운동 사전 · 요가 자세) | 그림이 없을 때의 **폴백**이다. 화면 코드가 아니라 사전이고, 그림이 오면 저절로 사라진다 |

화면 파일에 이모지가 다시 들어오면 테스트가 잡는다. 한 화면을 고칠 때는 눈에 띄지만
새 게임을 만들면서 `▶ 시작`을 그냥 적는 건 너무 쉽다 — 그렇게 하나씩 돌아온다.

### 모바일 정렬 셋

| 곳 | 무엇 |
|---|---|
| 준비 화면 가로 | 칸 버튼의 오른쪽 끝을 **영상의 오른쪽 끝**에 맞춘다. 제목 줄을 전체 폭으로 두면 버튼이 화면 끝까지 밀려가 아래 영상과 관계없는 자리에 뜬다 — 칸을 나누는 건 영상이다 |
| 준비 화면 가로 | 오른쪽 조작은 **가운데** 정렬. 오른쪽으로 붙이면 글줄이 제각각 끝나 가장자리만 들쭉날쭉해 보인다 |
| 준비 화면 세로 | 버튼 셋이 한 줄에 안 들어가 시작만 아래로 떨어졌다. **가장 중요한 버튼이 제일 작아 보인다.** 위에 둘, 아래에 시작 하나를 두 칸 폭으로 깐다 |

안내 문구의 양 끝 화살표(`⬅ … ➡`)는 뺐다. 좁은 화면에서 줄이 바뀌면 화살표만
다음 줄로 떨어져 어디를 가리키는지 알 수 없었다.

---

## STEP 19 — AI 3D 에셋 파이프라인 (8/20~25)

정글·쥬라기의 좌우 배경과 트랙 장애물을 **스크립트 저폴리에서 AI 생성 GLB로** 바꿨다.
손으로 만든 야자수까지는 봐줄 만했지만 바위·공룡은 도형 티가 났다.

### 정본은 GLB가 아니라 `tools/blender/import_ai.py`다

받은 파일을 그대로 쓰지 않는다. Tripo·Meshy가 뱉는 것은 크기도 원점도 방향도
제각각이라, 그대로 넣으면 공룡이 트랙을 뚫거나 관문 틈이 아이보다 좁아진다.
**치수는 판정의 일부다** — `obstacles3d.js`의 `KINDS`가 기준이고 스크립트가 거기에 맞춘다.

받는 곳은 `tools/ai_inbox/`, 이름이 슬롯과 다르면 **건너뛴다.** 실수가 아니라
안전장치다. 엉뚱한 모델이 장애물 자리에 들어가면 아이가 화면 보고 판단한 것과
판정이 어긋난다.

### 겪은 것

- **에셋이 찢어져 보였다.** 삼각형을 10~14%만 남겼는데, 디시메이트는 면과 함께
  **UV를 뭉갠다.** 텍스처가 있는 모델에서는 폴리 예산이 곧 화질이다.
  1만~1.4만으로 올리고 텍스처를 1024~1536으로 올려 해결했다.
  → **저폴리 예산(500~1500)은 정점 색 에셋의 것이지, 텍스처 에셋의 것이 아니다.**
- **삼각형은 병목이 아니었다.** 9만 1250 삼각형이 60fps로 돌았다. draw call은
  `InstancedMesh` 개수로 정해지므로 종류마다 텍스처가 달라도 값이 안 는다.
  진짜 비용은 **텍스처 메모리와 다운로드 용량**뿐이다.
- **공룡 머리가 깨져 보였다.** Meshy 파일 탓인 줄 알았는데 **내가 자른 것**이었다.
  부위별로 흔들려고 메시를 몸통·머리·꼬리로 절단했더니 단면이 뚫린 채 남았고,
  머리를 돌리는 순간 목에 구멍이 벌어졌다. → **자르지 않는다.** 통짜 메시를
  정점 셰이더로 변형한다(`animateDino`).
- **`antialias: false`였다.** DPR을 1.5로 묶어 둔 채 안티앨리어싱까지 꺼 두니
  모든 모서리가 계단이었다. 에셋 품질 문제로 오래 헤맸다.
- **glTF는 알파가 있는 이미지를 만나면 PNG로 굽는다.** 2048에서 28MB가 나왔다.
  `alpha_mode = "NONE"`으로 JPEG 길을 열어 준다.
- **유령 정점** — 디시메이트가 면에 안 붙은 정점을 남기는데 블렌더 경계상자는
  그걸 세고 glTF는 안 내보낸다. 관문 틈을 3.4로 시켰는데 파일은 5.1이었다.
- **줄인 다음에 맞춘다.** 맞추고→줄이고→다시 맞추면 두 번째 맞추기가
  디시메이트가 뭉갠 값 위에서 계산한다.
- **넓은 장애물은 늘 가운데다.** `lane: 0`을 그대로 쓰면 `laneX(0,3)` = -5로
  왼쪽 칸에 선다. 트랙을 다 막는 것들은 `FULL_WIDTH`로 묶어 x를 0으로 고정한다.
- **관문은 통째로 늘이지 않는다.** x를 1.77배 하면 돌 무늬가 뭉개진다.
  기둥은 옮기고 가로대만 늘인다.

### 모션 — 뼈대 없이 흔든다

`InstancedMesh`가 스킨드 메시를 못 쓴다. 리깅된 파일을 받아도 마리 수만큼
draw call이 들어 못 쓴다. 그래서 정점 셰이더로 흔든다. 위상은 인스턴스 행렬의
x·z에서 뽑아 마리마다 어긋나게 한다 — 안 그러면 열 마리가 한 몸처럼 고개를 젓는다.

**진폭이 안 보였던 이유가 둘이었다.**

1. **유닛으로 줬다.** 0.16유닛은 11유닛짜리 브라키오에서 1.5%다. 비율로 바꿨다 —
   크기가 바뀔 때마다 다시 맞출 필요도 없어진다.
2. **끄덕임을 키로 나눴다.** `-z / 키`인데 앞뒤 폭은 키의 3분의 1쯤이라
   비율이 0.18에서 멈췄다. 진폭의 5분의 1만 쓴 셈이다. **재는 자를 앞뒤 폭으로**
   바꾸고, 몸 가운데를 축으로 시소처럼 흔든다 — AI GLB는 정면 축이 제각각이라
   앞쪽만 올리면 어떤 공룡은 꼬리만 까딱거린다.

### 지금 들어간 것

| 무엇 | 어디서 |
|---|---|
| 공룡 6종 (브라키오·티라노·스테고·랩터·파라·익룡) | Tripo — 용량이 작은 쪽을 골랐다 |
| 관문 둘 · 알 받침 · 낮은 허들 · 자세 팻말 셋 | Meshy |
| 야자수 · 화석 바위 · 알 둥지 · 해골 관문 | 아직 스크립트 저폴리 |

익룡은 **하늘에 띄웠다.** 날개를 편 자세라 땅에 두면 넘어진 것처럼 보인다.
높이 있으니 크게 흔들어도 어지럽지 않고 오히려 나는 것으로 읽힌다.

에셋 총합 **6.52MB** (테스트가 7MB에서 잡는다). 자세 팻말은 넓은 판에 납작한 색과
사람 그림 하나뿐이라 1536이 필요 없어 1152로 내렸다 — 예산 숫자를 올리는 대신
실제로 줄인 것이다.

### 정글 에셋 2차와 배치 (8/25)

여덟 개가 더 왔다. 이름은 슬롯에 맞춰 배정했다 — `hurdle_low`는 드디어 **진짜 낮은 바**다.

| 파일 | 슬롯 | 무엇 |
|---|---|---|
| dinosaur+fossil | `fossil_rock` | 배경 — 티라노 화석 바위 |
| 부활절+달걀 | `egg_nest` | 배경 — 잎에 파묻힌 알 |
| 열대+섬 | `flower_bush` | 배경 **신규** — 꽃 수풀 |
| fantasy+egg | `egg_block` | 트랙 — 좌우로 피한다 |
| jungle+arch | `hurdle_low` | 트랙 — **뛰어넘는다** |
| 열대+석재+프레임 | `gate_arch` | 트랙 — 결승 |
| jungle+sign | `sign_armsopen` | 트랙 — 자세 |
| 장식용+간판 | `sign_forwardbend` | 트랙 — 자세 |

### 겹침은 **줄마다 따로 뿌려서** 생긴 것이었다 ★

`PropRow`·`DinoRow`가 각자 자기 것만 고르게 깔았다. 야자수 줄은 야자수끼리,
공룡 줄은 공룡끼리 — **둘은 서로를 모른다.** 한쪽에 열두 줄이 겹쳐 놓이니
브라키오 안에 티라노가 박혔다. 줄이 n개면 겹칠 짝은 n²으로 는다.

자리를 한 곳에서 관리하게 했다(`layout.js`). 이미 놓인 것들을 들고 있다가 새
후보가 가까우면 다시 뽑고, 몇 번 해도 안 되면 그중 제일 나은 것을 쓴다 —
안 놓으면 "야자수 서른 그루"가 조용히 스무 그루가 된다.

두 가지가 발목을 잡았다.

- **z는 고리처럼 잰다.** 프롭은 `span`마다 되돌아오므로 z=-1과 z=-139는
  화면에서 **이웃이다.** 그냥 빼면 멀다고 판단하고, 되돌아오는 순간 둘이 만난다.
- **큰 것을 먼저 놓는다.** 공룡은 GLB를 받은 뒤에야 만들어져 언제나 마지막인데,
  야자수 서른 그루를 깔고 나면 반지름 4.5짜리가 들어갈 구멍이 안 남는다.
  실측한 여유가 **-1.67**이었다. **작은 것은 큰 것 사이에 끼지만 반대는 안 된다.**
  자리만 미리 예약해 두고 모델이 오면 그 자리에 세운다 → 여유 **+0.02**.

### 어지러웠던 것은 공룡이 많아서였다

종마다 세 마리씩 36마리였다. 움직이는 것이 많으면 눈이 쉴 데가 없고,
**아이가 봐야 할 곳은 트랙이다.** 16마리로 줄이고 야자수를 18 → 30,
수풀 16을 새로 넣었다. 밀도는 그대로인데 훨씬 조용하다 —
배경을 채우는 일은 가만히 서 있는 것들이 해야 한다.

방향도 고쳤다. ±π/2로 트랙 옆면을 보게 했더니 옆모습만 계속 보였는데,
**공룡의 얼굴은 앞에 있다.** ±π/4로 틀어 3/4 각을 줬다. 완전히 정면으로
돌리지 않는 이유는 그러면 종이 인형처럼 납작해 보이기 때문이다.
익룡은 `π`라 등을 보이고 날았다 — 세계가 아이 쪽으로 흐르므로 **θ≈0이
날아오는 방향**이다.

### Draco — 깎느냐 키우느냐의 셋째 길 ★

Tripo "고품질"로 뽑은 넷은 25만 삼각형짜리 스컬프트다. 다른 것과 같이 1만으로
깎았더니 **잎사귀가 진흙이 됐다** — 데시메이트가 UV를 같이 뭉갠다.
2만5천이 버티는 선인데 파일이 2MB고, 그런 물건이 넷이면 8MB다.

압축하면 둘 다 안 줄여도 된다. 알 둥지가 **1만 971KB → 2만5천 483KB**가 됐다.
삼각형은 2.5배인데 파일은 절반이다. 값은 디코더 wasm 190KB 한 번이다.

**양쪽이 한 몸이다.** 내보내기만 켜고 `models.js`에서 `DRACOLoader`를 안 붙이면
모델이 통째로 안 뜨는데, 화면은 도형으로 조용히 돌아가서 콘솔을 안 보면 모른다.
테스트가 둘의 짝을 지킨다(`test/runner3dLayout.test.js`).

전체 **5.53MB** (테스트 상한 7MB). 공룡도 500KB → 190KB가 됐다.

### 그 밖에 고친 것

- **디시메이트는 한 번에 안 끝난다.** 25만짜리에 0.04를 줬는데 9만에서 멈췄다.
  collapse는 **경계 모서리를 못 접는다** — AI 모델은 물샐틈없지 않아 경계가 많다.
  남은 것을 다시 재서 또 건다. 안 줄면 멈춘다.
- **`flat` 맞추기에서 앞뒤를 안 건드렸다.** 폭을 14배 늘리면서 깊이만 원본대로
  두니 14미터 너비에 **0.27 두께** — 판지로 오린 것처럼 보인다. 높이 배율을
  따라가게 해 1.37이 됐고, 판정 상자(d=0.8)와 비슷해졌다.
- **끄덕임을 키로 나누고 있었다.** 공룡의 앞뒤 폭은 키의 3분의 1이라 비율이
  0.18에서 멈춰 **진폭의 5분의 1만** 썼다. 자를 앞뒤 폭으로 바꾸고 몸 가운데를
  축으로 시소처럼 흔든다 — AI GLB는 정면 축이 파일마다 달라서, 앞쪽만 올리면
  어떤 공룡은 꼬리만 까딱거린다.

### "깨져 보인다"의 마지막 정체 — 예산이 재는 것이 틀렸다 ★★

세 번째로 같은 말을 들었다. 이번에는 **재고 나서** 고쳤다.

먼저 의심한 것은 Draco의 UV 양자화였다. 12비트로 UV를 격자에 붙이면 아틀라스
섬 경계의 정점이 옆 섬으로 넘어가고, 그러면 잎사귀 자리에 돌 무늬가 찍힌다 —
증상과 딱 맞는 설명이었다. **16비트로 올려 봤더니 화면이 똑같았다.** 파일만 18%
커졌다. 재보지 않고 고쳤으면 엉뚱한 값을 정본으로 남길 뻔했다.

기하는 멀쩡했다. 최장 모서리가 21.5유닛짜리에서 2.2, 중앙값 0.097 — 튀는 삼각형이
하나도 없다. 그러니 깨진 것은 **UV뿐**이고, UV를 뭉개는 것은 디시메이트다.

| 삼각형 | 결과 |
|---|---|
| 1만 | 잎사귀가 진흙 |
| 2만5천 | 알 껍질에 잎 조각이 박혀 얼룩덜룩 |
| **9만(안 깎음)** | **깨끗하다** |

**어느 선까지는 괜찮다는 값이 없었다.** 이 파일들의 UV는 자잘한 섬 수백 개를
빽빽이 채운 아틀라스라 모서리를 접을 때마다 경계가 뭉개진다. 한 번의 collapse가
자연히 멈추는 자리가 이 메시가 견디는 한계다.

그래서 안 깎기로 했고, 총량이 5.5MB → **10.0MB**가 됐다. 테스트 상한을 7 → 11MB로
올렸다 — **예산을 못 맞춰서 올린 게 아니라, 예산이 재던 것이 틀렸기 때문이다.**
7MB를 지키려고 세 번 화면을 상하게 했고, 이 게임은 이미 MediaPipe 포즈 모델을
내려받는다. 에셋은 카메라 준비 화면 동안 받으므로 그 시간에 묻힌다.
다음에 또 올리게 되면 그때는 **줄일 방법을 먼저** 찾는다.

### 앞뒤가 있는 물건은 아무렇게나 안 돌린다 ★

화석 바위는 **한 면에만** 공룡 뼈가 새겨져 있다. `rot: rnd() * 2π`로 뒀더니
절반이 뒷면을 보였고, 화면에는 그냥 커다란 갈색 덩어리가 서 있었다.
`faceTrack`을 붙여 ±0.5rad만 흔든다 — 3/4 각이라 새겨진 면이 계속 보인다.
발자국 바위도 같다.

### 허들은 눌러 늘이지 않는다

`flat=True`는 폭과 높이를 따로 맞춘다. 원본 비율이 1 : 0.443인데 14.25 : 2.2를
요구하니 **가로로 2.9배 눌렸다** — 기둥이 납작하게 퍼지고 무늬가 늘어졌다.

관문에서 쓴 방법이 그대로 답이었다(`_fit_gate`). 균등 배율로 높이를 맞춘 뒤
**기둥은 평행이동하고 가운데만 늘린다**(`_widen`). 돌기둥은 모양이 남고
늘어나는 것은 통나무·덩굴뿐이다. 기둥과 가운데를 가르는 자리는 양 끝에서 30%다 —
관문처럼 틈으로 잴 수가 없다. 허들은 뛰어넘는 물건이라 밑에 뚫린 데가 없다.

### 정글 에셋 3차 (8/25)

| 파일 | 슬롯 | 무엇 |
|---|---|---|
| dragon+toy | `dino_ptero2` | 하늘 — 익룡 둘째 종 |
| 만화풍+간판 | `sign_lunge` | 트랙 — 자세. **이로써 팻말 셋이 같은 화풍** |
| 열대+암석섬 | `rock_footprint` | 배경 — 오래 회색 도형이던 자리 |

익룡은 높이대를 갈랐다(9와 14). 한 종류만 띄웠을 때는 같은 새가 네 마리 도는
것으로 보였는데, **하늘은 높이가 달라 크기 비교가 안 돼서 종이 하나뿐인 게
땅보다 더 티가 난다.** 하늘 배치기를 따로 뒀다 — 땅과 섞지 않는 이유는 높이가
달라 애초에 부딪힐 일이 없기 때문이다.

`sign_post`는 **뺐다.** 그림이 오지 않은 슬롯이라 갈색 막대기가 서 있었고,
그건 배경이 아니라 버그로 보인다. 자리 표시가 화면에 남아 있는 것보다 없는 게 낫다.

### ★★ "깨져 보인다"의 진짜 원인 — 메시가 갈라져 있었다 (8/25)

**네 번 틀렸고 다섯 번째에 맞혔다.** 틀린 답들을 남겨 둔다 — 같은 길로 다시
들어가지 않으려면 어디서 새는지 알아야 한다.

| 짐작 | 한 일 | 결과 |
|---|---|---|
| 삼각형을 너무 깎았다 | 1만 → 2만5천 | 여전히 깨짐 |
| Draco UV 양자화 | 12 → 16비트 | **화면이 똑같음.** 파일만 +18% |
| 이 메시의 한계다 | 안 깎기(9만), 예산 7 → 11MB | 여전히 깨짐 |
| **메시가 갈라져 있다** | **깎기 전에 붙이기** | **해결** |

결정적인 단서는 블렌더 **솔리드 뷰**였다. 텍스처를 끄고 봐도 표면이 파편
투성이였다 — 그러면 UV도 텍스처도 압축도 아니고 **기하**다.

재보니 원본이 이랬다.

```
삼각형 190만 · 정점 110만 · 비매니폴드 모서리 35만
```

AI가 주는 메시는 삼각형이 **정점을 공유하지 않은 채로** 온다. 통짜가 아니라
갈라진 조각 더미인 것이다. 데시메이트 collapse는 **경계 모서리를 못 접으므로**,
목표 비율을 맞추려고 접을 수 있는 안쪽만 마구 무너뜨리고 갈라진 자리는
뾰족한 파편으로 남긴다.

깎기 전에 `remove_doubles(dist=3e-4)`를 한 줄 넣었다.

```
비매니폴드 13만 → 177
디시메이트가 목표치에 정확히 도달 (전에는 9만에서 멈췄다)
1만2천 삼각형에서도 매끈하다
```

### 예산을 되돌렸다 — 7MB

지난 회차에 "안 깎는 수밖에 없다"며 11MB로 올렸었다. **그 결론이 틀렸으므로
예산도 되돌린다.** 3만 삼각형이 9만5천과 화면에서 구별이 안 되고,
총량은 10.0MB → **5.65MB**다.

> **막혔을 때 예산부터 늘리지 않는다.** 그때는 아직 원인을 모르는 것이다.
> 지난번 "예산이 재던 것이 틀렸다"는 판단은 그럴듯했지만, 사실은 원인을
> 못 찾은 것을 예산 탓으로 돌린 것이었다.

### 허들 — 기둥 경계를 **재서** 찾는다

`_widen`이 "양 끝에서 30%"로 어림하고 있었다. 그 선이 기둥 안쪽을 잘라
기둥 일부가 같이 늘어났고, 그래서 여전히 찌그러져 보였다.

허들에는 관문 같은 틈이 없어 틈으로는 못 잰다. 대신 **바닥에 닿는 곳**이
기둥이다. x를 48칸으로 나눠 각 칸의 밑면 높이를 보면 기둥 자리는 0 근처이고
가로대만 있는 자리는 떠 있다. 그 경계가 진짜 기둥 안쪽이다.

### 곡률 R=900 (8/25, `#/lab3d`에서 눈으로)

600은 트랙이 눈에 띄게 말려 올라가 원경이 좁아 보였다. 900이면 58유닛 앞이
1.9유닛 내려앉는다 — 세계가 둥글다는 것만 말하고 길은 곧게 읽힌다.

**곡률을 바꾸면 안개도 따라가야 한다.** 접힘선이 √(h/k)라 85 → 104로 밀려나서,
안개를 88에 그냥 두면 접힘선 앞부터 잔디가 바랜다. 108/138로 옮겼다.
테스트가 이 짝을 지킨다(전에 잡혔다).

### 자세 키가 안 먹었다 — 한글 입력기 ★

"장애물 피하기 끝부분의 포즈로 피하기는 키가 안 먹힌다."

한글 입력기가 켜져 있으면 A·S·D를 눌러도 `e.key`가 **'ㅁ'·'ㄴ'·'ㅇ'**로 온다.
방향키는 IME를 안 타서 멀쩡하니, **자세 장애물에서만** 조용히 안 먹는다 —
화면만 보고는 "왜 저기서만 안 되지"가 된다.

`e.code`는 입력기·자판 배열과 무관하게 물리적 키 위치를 준다.

**2D 러너가 먼저 겪고 이미 고쳐 둔 버그였다**(`runner/main.js`에 주석까지 있다).
3D 러너를 새로 쓰면서 그대로 되풀이했다. 두 번 겪은 것은 테스트로 못 박았다 —
`test/keyboardIme.test.js`가 `src/` 전체에서 `e.key`를 글자와 견주는 곳을 잡는다.

### 바닥이 연했던 이유 — 색공간을 안 말해 줬다 ★

`#3f8a2f`로 칠한 잔디가 화면에서는 `#87c475`쯤으로 떠 있었다. 색을 고른 사람
잘못이 아니라, `ground.js`의 캔버스 텍스처에 **`colorSpace`를 안 붙여서**다.
three는 그 픽셀을 이미 선형인 값으로 보고 출력할 때 한 번 더 밝게 편다.

원경 띠(`backdrop.js`)는 처음부터 sRGB를 붙이고 있었다. 그래서 둘의 잔디 색을
같게 적어 두고 **테스트로 그걸 지키고 있었는데도** 화면에서는 접힘선에 색이
갈렸다. 값이 같은데 화면이 다르면 대개 한쪽만 색공간을 말해 주고 있는 것이다.

안개 색(`fogColor`)도 같이 내렸다. 잔디가 제 색으로 어두워졌는데 안개를 그대로
두면 안개가 닿는 데부터 바닥이 허옇게 뜬다.

**트랙·연석은 일부러 안 고쳤다.** 같은 문제를 안고 있지만 지금 돌길 톤은 그
상태로 확인받은 것이라, 색공간만 고치면 승인받은 그림이 통째로 어두워진다.
제대로 하려면 sRGB를 붙이면서 `PALETTE`의 돌 색을 지금 밝기로 다시 올려
적어야 하고, 그건 화면을 보면서 할 일이다. 코드에 **미룬 것**이라고 적어 뒀다.

### ★★ 카메라 모드에 자세 판정이 아예 없었다 (8/25)

키 버그를 고치다 발견했다. `setPose`를 부르는 곳이 **키보드 핸들러뿐**이었다.

```
카메라 모드 → MoveDetector가 점프·앉기·좌우만 본다
            → 자세는 아무도 안 본다
            → 자세 팻말은 무조건 HIT
            → pose_holds는 언제나 빈 배열
```

**어른이 키보드로 테스트할 때만 도는 길에 판정을 붙여 뒀던 것이다.**
아이가 카메라로 놀면 방금 만든 그 팻말 셋이 그냥 벽이었다.

`core/pose/poseMatch.js`를 2D 러너와 **같이** 쓰도록 붙였다. 채점기가 두 벌이
되면 반드시 어긋나고, 아이는 같은 동작을 게임마다 다르게 판정받는다.

세 자세를 매 프레임 다 채점하지 않는다. **지금 다가오는 팻말이 시키는 것만**
본다(`scene.js`의 `askedPose`) — 값이 세 배로 드는 것도 있지만, 무엇보다
아무 자세나 맞으면 아이는 아무거나 하고 지나간다. 그건 통과 의식이지 운동이 아니다.

### 그리고 `record('pose')`는 **아무 데서도 안 부르고 있었다**

키보드로 해도 `pose_holds`는 빈 배열이었다. manifest에 선언해 두고 값은 0인,
가장 나쁜 종류의 구멍이다 — 화면에는 아무 일도 없어 보인다.

기존 테스트 둘은 **이름이 맞는지만** 봤다. 사전에 있는 이름인가, manifest에
선언됐는가. 둘 다 통과하면서 데이터는 안 쌓였다.

**이름이 맞는 것과 데이터가 쌓이는 것은 다른 문제다.** 테스트를 하나 더 뒀다 —
`judge.js`가 셀 줄 아는 종류를 읽어서, 화면이 그걸 **실제로 부르는지** 본다.
카메라 블록 안에 자세 채점이 있는지도 같이 본다(키보드 쪽에 있는 것으로는 안 된다).

자세는 **한 팻말에 한 번만** 센다. 누르고 있는 동안 유지되는 값이라
프레임마다 세면 "1초 서 있기"가 60회가 된다.

### 장애물 다듬기 셋 (8/25)

**① 허들이 세로로 눌려 보였다.** `_widen`이 기둥만 옮기고 나머지를 통째로
늘렸는데, 기둥 옆의 **무늬 있는 통나무**가 4배로 늘어나 잎사귀가 납작해졌다.
가로대 한가운데는 민무늬라 늘려도 티가 안 난다 — 안쪽 45%만 늘리고
기둥과 그 옆 장식은 통째로 민다. 높이도 2.2 → 3.2로 올렸다(균등 배율이
커지는 만큼 덜 늘려도 된다). **판정에는 영향이 없다** — 이 장애물은 상자
높이가 아니라 "떠 있었나"로 가른다.

**② 숙이기 관문에 부스러기 셋이 붙어 있었다.** 5~6면짜리 조각이 하늘과
길바닥에 점처럼 떠 있었다. 면 수로는 못 거른다 — 이 모델들은 잎사귀·돌·이빨이
각각 떨어진 **키트배시**라 정상 부품도 5~90면이다. **크기**로 본다:
부스러기는 전체의 0.5~0.9%인데 제일 작은 잎사귀도 3.7%다(`_drop_specks`).

> 붙인 **뒤에** 걸러야 한다. 안 붙인 메시는 삼각형 하나하나가 다 섬이다.
> 처음에 완성 파일에서 재 봤더니 669개 섬이 나왔는데, 그건 glTF가 UV
> 이음매마다 정점을 쪼갠 결과였다 — **재는 자리를 잘못 골랐던 것이다.**

**③ 자세 팻말과 캐릭터의 좌우가 반대였다.** 팻말은 앞에서 본 사람이고
캐릭터는 뒤에서 본 사람이라 같은 동작이 화면에서 반대로 보이는 것인데,
4~8세에게는 그냥 다른 동작이다. `_shared/pose01~03` 실루엣 힌트는 캐릭터와
같은 쪽이니 **팻말만 혼자 반대**였다 — 팻말을 뒤집었다(`_mirror_x`).

판정은 안 바뀐다. `poseMatch.matchTargets`가 원본과 거울을 **둘 다** 채점해
높은 쪽을 쓰므로 아이가 어느 다리를 앞으로 내밀든 통과한다.

> **2D 러너의 팻말도 같은 방향이다.** 거기도 캐릭터와 반대인데, 이미 세 테마에
> 아홉 장이 나가 있어 손대지 않았다. 맞추려면 2D 팻말 아홉 장을 같이 뒤집어야 한다.

### UI 옮기기 1단계 — HUD를 공용으로 (8/25)

3D 러너의 HUD는 텍스트 칩 세 개뿐이었다. 2D 러너에는 이미 플레이 제라 UI가
있는데, 그걸 3D에 **다시 짜면 같은 UI가 두 벌**이 된다. 코스와 자세 채점기를
이미 공유하고 있으니 HUD도 같은 규율로 뒀다.

`src/games/runner/ui/hud.js` — 레벨 배지 · 별 · 목숨 하트 · 운동 카운트.

**모양(CSS)도 같이 넣었다.** `style.css`에 두면 3D는 그 파일을 안 불러서
뼈대만 나온다 — 마크업과 모양은 한 몸이라 같이 움직여야 한다. 2D의
`style.css`에서 그 28줄을 걷어내 이 모듈로 옮겼고, 2D도 여기서 받아 쓴다.

**숫자를 해석하지 않는다.** `stars` 칸에 무엇을 넣을지는 게임이 정한다 —
2D는 주워 모은 별, 3D는 점수다. HUD가 그걸 알면 게임을 아는 모듈이 된다.
테스트가 이 모듈에 게임 이름이 들어오는지 본다.

2D는 **id와 마크업을 그대로** 뒀다. `main.js`가 그 이름들로 붙어 있어서,
바꾸면 검증 끝난 게임을 건드리게 된다.

남은 단계 — ② 인게임 연출(방향 힌트·카운트다운·POSE 배너·레벨 완료)
③ 화면 버튼(◀▼▶ · A·S·D) ④ 카메라 준비 화면 ⑤ 튜토리얼 ⑥ 인트로

### UI 옮기기 2단계 — 인게임 연출 (8/26)

`src/games/runner/ui/cues.js` — 방향 힌트 · 카운트다운 · 레벨 완료 배너.

**그림은 `_shared/` 상수다.** `CLAUDE.md`의 "바닥에 놓이는 것은 테마, 화면에 뜨는
것은 공용"이 여기 그대로 적용된다 — 화살표 팻말과 카운트다운 숫자는 우주에서든
쥬라기에서든 같은 것을 가리키므로 테마를 안 받는다.

**힌트는 `judge.js`의 `ACTION`에서 끌어온다.** 여기서 이벤트 종류를 다시 나열하면
판정과 힌트가 따로 논다 — 아이가 화살표대로 했는데 판정은 틀렸다고 하는 일이 생긴다.
테스트가 "`ACTION`이 시키는 모든 동작에 팻말이 있는지"를 본다.

**큐브 힌트는 아직 그 칸에 서 있을 때만 띄운다.** 이미 비켜 있는데 화살표가
남아 있으면 "엉뚱한 방향으로 가라"가 된다.

**같은 팻말을 다시 넣지 않는다.** 매 프레임 `src`를 다시 대입하면 애니메이션이
처음으로 돌아가 팻말이 떤다. 테스트가 잡는다.

**그리는 방법은 2D와 다르다.** 2D는 자기 캔버스에 그리고(`game/obstacles.js`의
`_drawHint`) 3D는 DOM으로 덮는다. 억지로 합치면 검증 끝난 2D 화면이 미묘하게
움직이고 얻는 것이 없다 — **그림과 대응만** 공유한다.

#### 겪은 것

- **`onLeave`는 라우터가 하나만 들고 있다.** 카운트다운 취소용으로 두 번째
  `onLeave`를 걸었더니 뒤에 오는 정리 블록이 그걸 덮어써서 **아무 일도 안 했다.**
  기존 정리 블록 안에서 같이 세우는 것으로 고쳤다.
- 글자 배너(`#r3-banner`)는 부르는 곳이 없어져 걷어냈다.

### 2단계 다듬기 + 3단계 화면 버튼 (8/26)

#### 고친 것 셋

**① 힌트가 너무 위에 있었다.** `top: 7%`면 상단 HUD와 붙어서 잘 안 보인다 —
화면 맨 위는 눈이 잘 안 가는 자리다. 17%로 내려 하늘이 빈 구간에 띄웠다.

**② 레벨 배너 직후에 장애물이 코앞이었다.** 배너 뒤에서 다음 레벨이 이미
굴러가고 있었다. 코스의 `firstDelay`가 2초인데 배너가 1.2초를 가리므로
**아이가 볼 수 있는 화면은 0.8초**뿐이었다. 배너가 뜨는 동안 세계를 멈춰
`firstDelay`가 배너가 끝난 뒤부터 흐르게 했다.

**③ 좌우 피하기가 거의 매번 오른쪽이었다 — 내 버그다.** 막힌 칸만 정하고
방향은 화면이 그때그때 계산하게 뒀는데, 가운데가 막혔을 때 늘 오른쪽을 골랐다.
아이는 대개 가운데에 서 있으므로 사실상 **"오른쪽만 하는 게임"**이 됐다.

피할 곳도 스폰 때 함께 정한다(`assignCubeLane`의 `hintLane`). 빈 칸 중에서
뽑아 이벤트에 적어 두므로 팻말이 도중에 반대로 뒤집히지도 않는다.
2D 러너도 같은 방식이다. 테스트가 "한쪽만 나오는지"를 본다.

> **남은 반복**: 큐브 리듬은 `cubeGap: 3.0` × `cubeCount: 6`으로 고정이고
> 막는 칸은 언제나 아이가 선 칸이다(의도된 규칙 — "매번 실제로 피해야 하는
> 장애물"). 리듬에 흔들림을 주려면 `runner/game/course.js`를 고쳐야 하는데
> **2D 러너의 밸런스도 같이 바뀐다.** 지금은 안 건드렸다.

#### 3단계 — 화면 버튼

`src/games/runner/ui/touchPad.js` — ◀▼▶ · A·S·D.

**마크업·모양뿐 아니라 배선까지 공용이다.** 게임마다 새로 짜면 `pointerleave`를
빠뜨려서, 누른 채로 손가락이 버튼 밖으로 나갔을 때 **앉은 채로 굳는다** —
화면은 멀쩡해 보이고 아이만 이상해지는 종류의 버그다. 테스트가 잡는다.

3D에서 자세 버튼은 키보드와 **같은 길**(`holdPose`)로 들어간다. 입구가 둘이 되면
운동량을 세는 자리도 둘이 된다 — 이미 한 번 겪은 실수다.

`style.css`에서 터치 컨트롤 규칙도 이 모듈로 옮겼다(HUD와 같은 이유).

### 4~6단계 — 앞 화면 셋 (8/26)

**타이틀 · 튜토리얼 · 준비 화면.** 셋 다 `/intro?id=`·`/tutorial?id=` 라우트를
쓰지 않고 **플레이 안에** 뒀다. 이유가 둘이다.

① **카메라를 두 번 켜게 된다.** 튜토리얼에서 몸을 움직여 보려면 카메라가 필요한데
라우트가 갈리면 화면마다 열고 닫는다 — 참조가 0이 되어 껐다 켜지고 권한
표시등이 깜빡인다(`CLAUDE.md`의 카메라 규칙).
② **기존 러너 셋이 이미 그렇게 한다.** "러너는 자체 타이틀 화면이 인트로 역할을
한다"(`registry.js`). 화면을 하나 더 두면 아이가 거치는 단계가 는다.

흐름: **타이틀 → 카메라 준비 → 튜토리얼(처음 한 번) → 안내 → 카운트다운 → 플레이**

#### 준비 화면에 세계를 깐다

`showReadyScreen`에 `backdrop` 옵션을 더했다. 기본 보라색 그라디언트는 어느
게임에도 안 어울리지 않지만 **어느 게임처럼 보이지도 않는다** — 아이는 방금
고른 게임에서 넘어오는데 거기서 세계가 한 번 끊긴다.

그림 위에 어둠을 덮는다. 이 화면의 주인공은 **영상 속 아이**라, 배경이 밝으면
자기 모습이 어디 있는지 못 찾는다.

#### 튜토리얼은 몸으로 해봐야 넘어간다

읽고 넘어가는 설명은 4~8세에게 안 남는다. 동작을 실제로 하면 체크가 켜지고
넷을 다 채워야 넘어간다. 세 가지를 지켰다.

- **감지기는 플레이와 같은 것**(`MoveDetector`·`matchPose`)이다. 튜토리얼에서만
  다른 문턱으로 통과시키면 **여기서 됐던 아이가 판에서 안 된다.**
- **좌우는 하나로 친다.** 왼쪽만 되는 아이에게 오른쪽까지 시키면 튜토리얼이
  관문이 된다. 여기서 볼 것은 "몸을 옆으로 옮길 줄 아나"다.
- **건너뛰기가 늘 열려 있다.** 그리고 키보드·화면 버튼으로도 통과된다 —
  카메라를 못 쓰는 아이가 여기서 막히면 게임 자체를 못 한다.

그림은 **인게임 힌트와 같은 것**을 쓴다(`ui/cues.js`). 다른 그림을 보여주면
아이가 배운 것과 판에서 만나는 것이 달라진다. 테스트가 이 짝을 지킨다.

#### ★ 엔진에 박혀 있던 `game_id`를 뺐다

`runner3d/play3d.js`에 `GAME_ID = 'jurassic-run-3d'`가 적혀 있었다. 3D 게임이
하나뿐일 때는 티가 안 났지만, **러너를 전부 3D로 옮기기로 한 이상**
두 번째 3D 게임의 운동 데이터가 쥬라기 기록에 합쳐진다. 섞인 것은 되돌릴 수 없다.

`makeRunner3dPlay(manifest)`로 바꿨다 — 2D 엔진의 `makeRunnerPlay(theme)`와
같은 모양이다. 엔진은 규칙만 알고 이름·그림은 게임팩이 갖는다.
타이틀 로고·배경도 manifest에서 온다.

#### 겪은 것

- **안내(`mountGuide`)를 튜토리얼보다 먼저 걸었다.** 안내의 자동 넘김(6초)이
  튜토리얼 뒤에서 혼자 돌아, 아이가 동작을 익히는 동안 이미 지나가 버렸다.
  순서를 뒤집었다.
- 템플릿 문자열 안 주석에 백틱을 넣어 빌드가 두 번 깨졌다. HTML 주석이라도
  \` 안에서는 문자열이 끊긴다.

### 공통 UI + 소리 (8/26)

3D 러너에는 **메뉴도 종료 버튼도 소리도 없었다.** 2.5D에는 다 있는 것들이라
아이가 게임을 옮기면 "나가는 법"이 달라졌다.

#### `runner/ui/systemBar.js` — 메뉴 · 종료 · 확인창

그림은 `_shared/` 한 벌이다. 이 버튼들은 세계가 아니라 **앱의 것**이라
테마를 안 받는다.

- **메뉴가 열려 있으면 판이 멈춘다.** 안 멈추면 아이가 메뉴를 보는 사이에
  장애물이 지나가고, 돌아왔을 때 목숨이 줄어 있다
- **종료는 확인창을 거친다.** 바로 나가면 그때까지의 운동 기록을 저장하는
  경로를 건너뛴다 — 2D가 플레이 중에 허브 버튼을 감추는 것과 같은 이유다
- **음소거 아이콘은 토글 결과를 보고 바꾼다.** 화면이 자기 상태를 따로 들면
  실제 음소거와 어긋나 "소리는 나는데 아이콘은 꺼짐"이 된다
- 크기는 전부 `clamp()`다. px로 박으면 작은 화면을 덮고 큰 화면에서 점이 된다

> **2D는 안 건드렸다.** 2D 상단바에는 "팔로 X"로 나가는 제스처 게이지가
> 붙어 있어서 지금 합치면 그 기능을 잃거나 공용 모듈이 부푼다.
> 2.5D를 걷어낼 때 정리하는 편이 낫다.

#### 소리 — `audio.js`가 테마에 묶여 있었다

`initAudio()`가 `theme()`을 직접 읽어서, 2.5D 테마 홀더에 꽂혀 있어야만
소리가 났다. **3D에서는 쓸 수가 없었다** — 같은 게임인데 한쪽만 조용했다.

`initAudio({ base, bgm })`으로 열었다. 안 넘기면 예전처럼 테마에서 읽으니
2.5D 호출부는 한 글자도 안 바뀐다. 3D는 manifest에서 경로를 넘긴다.

붙인 것: BGM(첫 상호작용에서 잠금 해제) · 카운트다운 삐 · 출발 · 회피 성공 ·
부딪힘 부저 · 레벨 완료 · 미션 완료 · 게임오버 아르페지오 · 버튼음.

**나갈 때 BGM을 끈다.** `CLAUDE.md` 규칙이고 2D에서 실제로 새어 나간 적이 있다.
테스트가 정리 블록에 `stopBgm()`이 있는지 본다.

#### 튜토리얼 카드에 진짜 장애물 그림

화살표 팻말만 보여 주면 "무엇을 피하는지"가 안 남는다. 2.5D 튜토리얼이 알·허들·
관문 그림을 크게 보여 주는 이유가 그것이다. `manifest.tutorialArt`로 받아
쓰고, 없으면 힌트 팻말로 물러난다.

그림 높이로 맞추고 폭을 제한했다 — 가로가 긴 관문과 세로가 긴 알이 섞여 있어
폭으로 맞추면 관문이 카드를 뚫고 나간다.

#### 테스트가 잡아 준 것

`audio.js` 주석에 예시 경로를 적었더니 **"러너 엔진 코드에 에셋 경로가 박혀
있지 않다"** 테스트가 걸렸다. 테스트를 느슨하게 하는 대신 주석을 고쳤다 —
그 그물은 넓어야 값을 한다.

### 인트로·튜토리얼 다듬기 + BGM 새는 것 (8/26)

**① 타이틀이 두 겹으로 겹쳤다.** 배경으로 `hero`(허브 썸네일)를 깔았는데
그 그림에 이미 게임 로고가 박혀 있었다. 그 위에 우리 로고를 또 얹으니
"JURASSIC RUN"이 두 번 보였다. **글자 없는 판**을 따로 받아
`manifest.titleBg`로 두고, 없으면 `hero`로 물러난다.

**② 인트로에 메뉴·허브 버튼을 넣었다.** 2.5D 타이틀의 "← 게임 목록"과 같은
자리다. **플레이 중에는 없다** — 거기서 바로 나가면 운동 기록을 저장하는
경로를 건너뛴다.

**③ 튜토리얼을 두 장으로 나눴다.** 2.5D와 같은 구성이다.

```
① 몸을 움직여 보세요   — 옆으로 · 점프 · 앉기
② COPY THE POSE       — 런지 · 상체 숙이기 · 팔 벌리기
```

넷을 한 장에 몰아 봤는데 카드가 작아지고, 무엇보다 **성격이 다른 둘이 섞였다.**
앞의 셋은 순간 동작이고 자세는 잠깐 유지하는 것이다. 건너뛰기는 **장마다**
있다 — 한 번에 전부 건너뛰면 자세만 어려운 아이가 앞의 셋도 못 해본다.

자세 이름도 한 곳으로 모았다(`POSE_BUTTONS`의 `label`/`full`). 버튼에는
"숙이기", 튜토리얼에는 "상체 숙이기" — 따로 적으면 아이가 둘을 다른 것으로 배운다.

### ★★ BGM이 허브까지 따라간 이유 — `onLeave`를 늦게 걸었다

**라우터는 정리 함수를 하나만 들고 있다**(`onLeave`). 등록이 파일 아래쪽에
있었는데, **준비 화면에서 "뒤로"를 누르면 거기까지 가기 전에 떠난다** —
정리가 아예 안 걸린 채로 화면이 바뀌었고 BGM은 계속 났다.

정리를 **맨 앞에** 걸고 목록(`cleanups`)에 쌓는 방식으로 바꿨다. 자원을 잡는
자리마다 바로 넣으면 "이 길로 나가면 안 꺼진다"는 구멍이 안 생긴다.
테스트가 **`onLeave`가 첫 화면보다 먼저이고 한 번만 불리는지**를 본다.

> `router.js`의 `GAME_ROUTES`가 끄는 것은 `core/bgm.js`(앱 BGM)다.
> 러너는 자기 오디오를 따로 들고 있어 라우터가 모른다 — 게임이 꺼야 한다.

### 준비 화면의 "뒤로"는 타이틀로 간다

허브로 보내면 아이가 카메라 화면을 한 번 잘못 눌렀을 때 게임 밖으로 튕겨
나간다. 되돌아갈 자리는 방금 온 화면이다 — 타이틀↔준비를 오갈 수 있게 했다.

### BGM이 늦게 났다 — `preload`가 없었다

효과음에는 `preload = 'auto'`가 붙어 있었는데 **BGM에는 없었다.** mp3는 몇 백
KB라 첫 상호작용 때 그제야 받기 시작했고, 그래서 음악이 몇 초 늦게 났다.
`preload`와 `load()`를 붙여 아이가 타이틀을 보는 동안 받아 둔다.

### ★★ 인트로가 멈춘 이유 — 약속을 한쪽에서만 풀었다 (8/26)

증상이 셋으로 보였는데 **원인은 하나**였다.

```
인트로에서 "게임 목록" 누름 → 화면이 비고 똥 피하기 배경이 드러남
카메라에서 뒤로 → 인트로 → "게임 목록" → 멈춤
```

`showTitle3d`가 START에서만 `resolve`하고 허브 버튼은 콜백(`onHub`)으로
빼 뒀다. 허브를 누르면 **화면만 지워지고 약속은 영원히 안 풀렸다** —
부르는 쪽은 `await`에서 멈춘 채였고, `#app`이 비니 그 아래 `body` 배경
(직전 게임의 것)이 드러나 "똥 피하기 배경"으로 보였다.

`showReadyScreen`이 `mode`를 돌려주는 것과 같은 모양으로 맞췄다.

> **화면을 떠나는 길이 둘이면 결과도 둘이어야 한다.** 한쪽을 콜백으로
> 빼는 순간 그 길에서는 흐름이 끊긴다. 테스트가 두 길 모두 `await`를
> 푸는지 본다.

### 모서리 버튼이 화면 한가운데로 끌려왔다

`.r3s`가 flex 가운데 정렬인데 `.r3s > *:not(.r3s-bg) { position: relative }`가
**절대 위치를 덮어썼다.** 왼쪽 위에 두려던 "게임 목록"이 로고 옆에 붙어 있었다.
`.r3s-corner`를 선택자에서 빼고 모서리 전용 래퍼로 분리했다.

### 인트로에도 햄버거 메뉴

2.5D 타이틀과 같다 — 음악·효과음·전체화면. **종료 버튼은 없다.**
타이틀에서 나가는 길은 왼쪽 위 "게임 목록"이고, 아직 판이 시작되지 않아
저장할 운동도 없다.

메뉴 아이콘을 열 때 **지금 음소거 상태를 읽어** 그림을 정한다 — 인트로에서
음악을 끄고 판에 들어갔다 돌아오면 아이콘이 켜짐으로 되돌아가 있었다.

### 튜토리얼이 안 나온 이유 — 내가 게이트를 걸었다

`hasSeenTutorial`로 첫 판에만 띄웠다. **한 번 보고 나면 다시는 안 떴다.**

2.5D 러너 셋은 매 판 띄운다(`runner/main.js`의 `step` 흐름). 거기 맞췄다 —
넘어가는 데 1초도 안 걸리고(건너뛰기), 몸으로 하는 게임에서는 판 시작 전에
한 번 움직여 보는 것 자체가 준비운동이다.

순서도 테스트로 못 박았다: **타이틀 → 카메라 준비 → 튜토리얼.**
튜토리얼을 카메라 앞에 두면 "몸을 움직여 보세요"라고 해 놓고 카메라가 꺼져 있다.

### ★★ 공통 UI를 한 벌로 모았다 — 이것이 브랜드다 (8/27)

실기기 테스트에서 나온 여섯 가지가 **전부 같은 원인**이었다. 하나씩 고치는 대신
공통 UI를 한 모듈(`runner/ui/systemBar.js`)로 모으고 화면들이 거기서 받아 쓰게 했다.

> "전혀 다른 컨셉과 다른 방식의 게임을 하더라도 이런 공통 ui 요소들로 인해
> 플레이 제라 속 게임을 하고 있구나라는 느낌은 사용자에게 계속 전달해야지!
> 이건 매우 중요한 요소야! 브랜드의 핵심 키라고!" — ken

게임마다 컨셉과 규칙이 달라도 **나가는 법·소리 끄는 법·홈으로 가는 법**이 같아야
한다. 다르면 그건 게임 모음이지 플랫폼이 아니고, 아이는 게임을 옮길 때마다
조작을 다시 배운다.

#### 메뉴 아이콘이 햄버거 밖에 나와 있었다 — 두 벌이 됐기 때문

타이틀이 자기만의 메뉴를 `#r3-menu-panel`로 따로 그렸다. 마크업은 인게임 바를
베꼈지만 **닫는 CSS(`display: none`)는 공용 id(`#pz-menu-panel`)에만 걸려 있었다.**
그래서 아무도 열지 않았는데 음악·효과음·전체화면 아이콘 셋이 화면 오른쪽에
그대로 붙어 있었다.

→ **마크업을 베끼면 모양은 안 따라온다.** 한 벌만 두면 어긋날 자리가 없다.
`titleMenuMarkup`·`bindTitleMenu`를 지우고 `sysBarMarkup`/`bindSysBar`로 바꿨다.
`sysBarMarkup({ home, exit })`이 화면마다 무엇을 보일지만 정한다.

| 화면 | Home | 햄버거 | 나가기 |
|---|:---:|:---:|:---:|
| 타이틀 | ● | ● | — (아직 판이 없다) |
| 튜토리얼 | ● | ● | ● |
| 플레이 | — | ● | ● |

플레이 중에 Home이 없는 이유는 전과 같다 — 거기서 한 번에 나가면 **그때까지의
운동을 저장하는 경로를 건너뛴다.** 대신 나가기 → 확인창 안에 홈으로 가는 길을 둔다.

#### 나가기는 한 단계씩 뒤로 간다

전에는 나가기가 곧장 허브였다. 한 번 더 하고 싶어 누른 아이가 게임 밖으로 튕기고,
다시 들어오려면 허브에서 카드를 찾아야 했다.

확인창을 셋으로 만들고 **세로로** 쌓았다 — 가로로 서면 좁은 화면에서 줄이 넘치고,
머무르기 커서로 가운데를 겨누기 어렵다.

```
계속하기        → 판으로
게임 처음으로   → 이 게임의 타이틀
Home으로        → 플레이 제라 허브
```

3D는 라우트가 그대로라 `navigate`로는 화면이 안 바뀐다(해시가 같으면 라우터가
아무것도 안 한다). `location.reload()`로 `play3d`를 처음부터 돌린다 — 결과 화면의
"한 번 더"가 이미 같은 길을 쓴다. 2.5D는 `quitRequested`가 이미 타이틀로
돌아가므로 버튼만 하나 더 달았다.

#### "게임 목록" → "Home"

**나가는 버튼의 이름은 가는 곳이다.** "그만하기"는 무엇이 그만되는지(이 판인지
놀이 전체인지) 아이도 부모도 모르고, "게임 목록"은 게임마다 다르게 적혀 있었다.
허브의 이름을 **Home** 하나로 통일했다 — 결과 화면(`gameShell.js`)·2.5D 타이틀·
똥 피하기 인트로/일시정지까지 전부.

#### 튜토리얼에도 나가는 길을 뒀다

판이 시작되기 전 화면이라 나가는 길이 **더** 필요한데 여기만 없었다. Home·햄버거·
나가기를 다 붙이고, 결과를 `'done' | 'title' | 'hub'` 셋으로 돌려준다 —
**화면을 떠나는 길이 여럿이면 결과도 그만큼이어야 한다.**

카드도 키웠다. 폭 `clamp(130px,19vw,240px)` → `clamp(168px,25vw,320px)`,
그림 높이 `clamp(64px,13vh,140px)` → `clamp(96px,19vh,210px)`.

#### 곁다리로 잡힌 것 — 0짜리 기록

나가는 길마다 "지금까지의 운동을 저장"을 부르는데, **판이 시작도 안 한
화면**(튜토리얼·안내)에서 나가면 0짜리 기록이 하나 남았다. 하루 목표 30분 집계에
"놀았지만 아무것도 안 한 판"이 섞인다. 카운트다운이 끝난 뒤부터가 판이다(`played`).

#### 테스트로 못 박았다 (`test/brandUi.test.js`)

새 게임을 붙일 때마다 되풀이될 종류의 실수라 규칙 자체를 검사한다.

- 화면이 자기 id로 메뉴 패널을 만들지 않는다 (허용 목록 넷 — **왜 아직 못 옮겼는지
  주석에 적혀 있다.** 새 화면은 못 들어온다)
- 메뉴는 **닫힌 것이 기본**이다 (CSS 규칙 + 마크업 둘 다)
- 확인창은 세로로 쌓고, 셋의 순서가 2.5D와 3D에서 같다
- 화면에 뜨는 글자에 "게임 목록"이 없다
- 공용 버튼은 전부 손 커서로 눌린다(`data-pz-hit`)

아직 안 옮긴 둘은 `legacy-shell.js`(2.5D — 러너는 전부 3D로 가므로 옮기기 전에
사라진다)와 똥 피하기(메뉴 안에 손 컨트롤 토글·팔로 X 게이지가 더 있어 공용 바에
그 자리를 만들어야 한다)다.

**557 → 567건.**

### 앞 화면을 줄이고, 판정에 답을 붙였다 (8/28)

#### 안내 화면을 걷어냈다

튜토리얼 뒤에 `mountGuide`(제목 · "길을 따라 달리며 피하고 넘고 숙여요" ·
"좌우·점프·앉기를 골고루")가 있었다. **방금 튜토리얼에서 세 동작을 직접 해보고
온 아이에게 같은 말을 글로 한 번 더 읽히는 셈**이었고, 넘기려면 버튼을 한 번 더
눌러야 했다. 몸으로 하는 게임에서 화면이 하나 늘면 그만큼 안 움직이는 시간이 는다.

튜토리얼 → **바로 3 · 2 · 1 · START!**

#### 판정에 즉시 답을 붙였다 — Great! / Miss

전에는 빨간 섬광과 하트 하나가 전부였다. 4~8세는 "무엇 때문에 줄었나"를 스스로
못 잇는다 — 방금 그 장애물을 지나온 **자기 머리 위**에 글자가 떠야 원인과 결과가
붙는다. 그래서 화면 한가운데가 아니라 캐릭터 위다(`scene.headScreen()`이 3D
좌표를 화면 픽셀로 바꿔 준다). 세 칸을 오가는 게임이라 **자리가 곧 정보**다.

**실패에 빨강을 안 쓴다.** 놓친 것은 실패가 아니라 다음 것이 온다는 뜻이고,
경고색은 아이를 굳게 만든다. 분홍(`#ff96ab`)은 눈에 띄면서 야단치지 않는다.

**그림 파일로 안 만들었다.** PNG로 두면 테마 수만큼 는다. 획이 굵은 폰트에
`paint-order: stroke`로 테두리를 두르면 그림과 구별이 안 가고, 게임이 늘어도
파일은 그대로다. `text-shadow` 네 겹으로 테두리를 흉내 내면 모서리가 각지는데,
글자가 클수록 티가 난다.

소리는 이미 있던 것을 그대로 쓴다 — 피하면 `sfx_dodge`, 맞으면 `playMissBuzz()`.

#### 뒤로 가는 길이 한 단계씩이다

```
튜토리얼 ─뒤로→ 카메라 준비 ─뒤로→ 타이틀 ─Home→ 허브
```

이걸 만들려고 **튜토리얼을 3D 씬보다 앞으로 옮겼다.** 전에는 씬을 다 만든 뒤에
띄웠는데, 그러면 준비 화면으로 돌아가려고 이미 만든 씬을 도로 부숴야 한다.
튜토리얼에 필요한 카메라는 준비 화면이 잡아 둔 참조로 충분하다(`ready`가 아직
안 놓았다).

앞 화면 고리가 **둘**이 됐다(`title:` 라벨 + 안쪽 고리). 하나로 두면 튜토리얼의
"뒤로"가 타이틀까지 튕겨 나간다.

뒤로 버튼은 **아래 줄, 건너뛰기 옆**이다 — 바로 앞 화면(카메라 준비)의 뒤로가
거기 있어서 두 화면을 오갈 때 손이 같은 자리를 찾는다.

#### 튜토리얼의 왼쪽 위 Home을 뺐다

앞뒤로 오가는 화면에 **한 번에 밖으로 나가는 문**까지 두니 고를 것이 셋이 됐다
(뒤로 · 건너뛰기 · Home). 4~8세에게 셋이면 그중 하나는 잘못 눌린다. 허브로
가는 길은 남아 있다 — 오른쪽 위 나가기 → 확인창의 "Home으로".

**567 → 575건.**

### ★★ 결승 포털과 엔딩 (8/28)

마지막 레벨을 다 달리면 나오는 **거대한 공룡 두개골 포털**을 넣었다.
문을 지나면 MISSION COMPLETE 엔딩이 뜨고, 그다음에 결과 화면이 온다.

#### 받은 모델은 그대로 못 쓴다 — 뒷면이 벽이었다

Tripo가 준 GLB는 **정면만 보고 만든 것**이라 뒤가 벽돌 벽이다. 그대로 두면
아이가 문을 지나는 게 아니라 벽에 부딪히는 그림이 된다 — 결승선인데 통과가
안 되는 셈이다.

부품을 통째로 지우진 않았다. 뒷벽 판이 문보다 넓어서, 다 지우면 문 위쪽까지
뻥 뚫려 하늘이 보인다. **문 앞 기둥 사이 기둥꼴에 든 면만** 턴다(`_cut`).

##### 자를 자리는 **비율**로 적는다

원본 치수로 적으면 AI가 다시 뽑을 때마다 숫자를 고쳐야 한다.
경계상자 대비 `x(−1…1)` · `y(0=앞)` · `z(0=바닥)`로 적으면 모델이 바뀌어도
같은 자리를 가리킨다.

##### ★ 자르기는 **깎기 전**이다

처음엔 다 끝난 뒤에 잘랐다. 구멍 테두리가 **톱니처럼 삐죽삐죽했다** —
면 중심으로 지우는데 그때는 삼각형이 이미 커서 반쯤 걸친 면이 그대로 남는다.

원본(200만 삼각형)에서는 삼각형이 1mm도 안 된다. 거기서 자르면 테두리가
매끄럽고, 이어지는 디시메이트는 **경계 모서리를 못 접으니** 그 테두리를 그대로
지킨다 — 전에 "안 줄어드는 이유"였던 성질이 여기서는 도움이 됐다.

#### ★★ 부품이 59개, 텍스처도 59장

이 모델은 지금까지와 종류가 다르다. 키트배시라 **부품마다 자기 텍스처**를
들고 온다. 그대로 합치면 재질이 59개인 메시가 되고, three.js는 재질마다 한 번씩
그린다 — **draw call 59개.** 우리 예산이 20이다.

보통은 Cycles로 굽는다. 하지만 그건 **다시 그리는** 일이라 200만 삼각형에서
오래 걸리고 결과가 굽기 설정에 좌우된다. 확인해 보니 **59개 전부 UV가 0…1
안에** 있었다 — 그러면 그림을 타일로 늘어놓고 UV를 그 칸으로 옮기기만 하면
된다(`_atlas`). 픽셀은 축소만 되고 결과가 매번 똑같다.

- 칸 크기는 **삼각형 수**로 준다(512 / 256 / 128). 큰 부품이 곧 크게 보이는 부품이다
- 칸 가장자리는 **늘려 채운다.** 딱 붙이면 밉맵이 옆 칸 색을 빨아들여 테두리에
  엉뚱한 색 실선이 생긴다. UV를 안으로 미는 방법도 있지만 그건 그림이 미세하게
  줄어드는 것이라 무늬가 어긋난다

결과: **2048 한 장 · draw call 1개 · 5만 삼각형 · 664KB.**
`gate_arch.glb`(543KB)는 쓸 데가 없어져 `_unused/`로 옮겼다.
3D 에셋 총량은 6.4MB(보관본 포함).

#### 문은 그림이 아니라 셰이더다

모델에 문짝이 그려져 있었지만 빼냈다(`_take_door`). 구운 텍스처는 아무리
밝게 칠해도 **안 움직인다** — 4~8세에게 "여기가 끝이다, 들어가라"를 말해 주는
것은 반짝임이다.

그 자리에 판 하나를 세운다. 위로 흐르는 결 + 숨쉬기 + 반짝이 알갱이, 그리고
가까워질수록 밝아진다(`uOpen`).

##### ★ `depthWrite: false`가 핵심이다

켜 두면 이 판이 깊이 버퍼를 채워서 **애써 뚫어 놓은 통로가 지워진다** —
아이 눈에는 문이 아니라 노란 벽이 된다. 가산 합성 + `depthWrite: false` +
`renderOrder`가 한 벌이다.

#### 불도 그림 파일로 안 만들었다

스프라이트 시트를 만들면 **테마마다 는다.** 불은 우주에서도 정글에서도
불이라 셰이더 한 벌이면 된다 — 값 노이즈로 결을 주고, 위로 갈수록 크게
흔들어 혀처럼 만든다.

#### ★ 자리는 눈대중이 아니라 **재서** 옮겨 적는다

불 위치를 어림으로 `x = 8.35`라 적었더니 **탑 바깥 허공에 떠 있었다.**
메시에서 재니 7.49였다(트랙 밖에서 제일 높은 곳의 무게중심). 문도 마찬가지로
스크립트가 재서 돌려준 값을 쓴다 — 손으로 적으면 모델을 다시 뽑을 때 조용히
어긋나고, 문은 벽에 남고 빛만 허공에 뜬다.

#### 결승선에서 마지막 피하기를 시키지 않는다

문은 5.3이고 트랙은 15다. 바깥 레인으로 달려온 아이는 문이 아니라 돌기둥에
박힌다 — 마지막 순간에 "피하기"를 하나 더 시키는 셈이고, 그건 결승선이 아니다.

문을 트랙만큼 넓히려면 기둥을 바깥으로 밀고 가운데를 늘려야 하는데
(`_fit_gate`) **거기 해골이 있다.** 늘리면 해골이 옆으로 퍼진다.

규칙을 바꾸는 대신 연출로 풀었다. 26유닛 앞부터 조용히 가운데 레인으로
옮긴다(`PORTAL_FUNNEL`) — 레인 보간이 있어서 끌려가는 게 아니라 스스로
달려 들어가는 것처럼 보인다. 판정은 어차피 통과다(`judge.js`).

#### 끝나는 순간은 문 앞이 아니라 **문 뒤**다

판정이 걸리는 자리는 아이가 문 **앞**에 선 때다. 거기서 바로 끝내면 화면이
문 앞에서 툭 끊긴다. 900ms 더 굴려서 문이 카메라 뒤로 넘어가게 두면,
그동안 뚫어 놓은 통로 안이 한 번 보이고 그다음에 엔딩이 온다(`PASS_MS`).

#### 엔딩과 결과 화면은 따로다

결과 화면은 점수·배지·버튼이 있는 **읽는 화면**이다. 거기에 축하까지 얹으면
둘 다 반쯤 된다 — 그림은 UI에 가리고 버튼은 그림에 묻힌다.

끝냈다는 감정이 제일 큰 순간은 문을 지난 **직후**다. 그때는 아무것도 안
읽히고 그림만 보인다. 읽을 것은 그다음에 온다.

`core/gameShell.js`의 `showEnding`이다 — **모든 게임이 같이 쓴다.** 흰 섬광으로
장면을 잇고, 눌러도 넘어가고 안 눌러도 넘어간다(4초). 뜨자마자 0.6초는 클릭을
안 받는다 — 문을 지나며 누르고 있던 손가락이 엔딩을 스치고 지나가서 결과
화면이 곧바로 떴다.

**못 깬 아이에게는 안 띄운다.** 목숨이 다한 아이에게 축하 화면은 놀림이다.

#### 엔딩 그림은 **자리만** 잡아 뒀다

`/assets/runner/jurassic/image/fx_ending.png` — 지금은 타이틀 배경 위에 공용
MISSION COMPLETE 글자를 얹은 **임시 그림**이다. ken이 준 진짜 엔딩 그림을
**같은 이름으로 덮으면** 바로 적용된다(manifest의 `endingBg`).

#### 곁다리 — 백틱을 여섯 번 밟았다

CSS·HTML을 백틱 문자열에 담는데, 그 안 주석에서 파일 이름을 \`이렇게\` 감싸면
문자열이 거기서 끝나고 파일이 통째로 안 열린다. 매번 관계없는 테스트가 엉뚱한
자리에서 터져서 원인을 찾는 데 시간이 갔다.

`test/sourceParses.test.js`를 세웠다 — `src/`의 모든 파일이 파싱되는지만 보고,
안 되면 **파일 이름을 대며** 백틱을 먼저 의심하라고 말한다.

**575 → 693건.**

### 엔딩을 제대로 차렸다 (8/28, 키보드 검증 뒤)

#### 결승선이 너무 빨리 지나갔다

마지막 포즈 팻말 **1.5초** 뒤에 결승선이 있었다. 자세를 잡고 있던 아이가
팻말을 지나자마자 끝나 버려서 알아차릴 새가 없다. 결승선은 마지막 장애물이
아니라 **도착 지점**이고, 도착에는 다가가는 시간이 있어야 한다.

`CONFIG.course.finishGap = 5.0`으로 뺐다. **speed로 안 나눈다** — 다른 간격은
규칙이라 레벨이 빨라지면 좁아져야 맞지만, 이건 연출이라 같은 시간 동안 보여야
한다. 나누면 하필 결승선이 나오는 마지막 레벨(speed 1.6)에서 제일 짧아진다.

5초면 포털이 안개에서 걸어 나오고 → 아이가 가운데로 모이고(26유닛) →
문이 밝아지는 것까지 다 보인다.

#### 꽃가루 — `core/confetti.js`

빵빠레다. **그림 파일 없이** 캔버스 하나에 사각형을 그린다 — 스프라이트
시트를 만들면 게임·테마 수만큼 는다.

- **양옆 아래에서 비스듬히** 쏜다. 가운데에서 위로 뿌리면 분수처럼 보인다 —
  아이가 아는 그림은 축포다
- **세 번 나눠** 터뜨린다(380ms 간격). 한 번에 다 뿌리면 한순간에 지나간다
- **섬광이 걷힌 뒤** 0.5초에 시작한다. 같이 터뜨리면 흰 화면에 묻힌다
- `pointer-events: none` — 엔딩은 아무 데나 눌러 넘어갈 수 있어야 하는데
  캔버스가 그 클릭을 먹으면 아이는 화면이 멈춘 줄 안다
- 2D 컨텍스트가 없으면 **조용히 넘어간다.** 꽃가루가 없다고 엔딩이 안 뜨면
  그게 더 큰 문제다

#### 진짜 그림으로 교체

| 무엇 | 어디 | 왜 거기 |
|---|---|---|
| 엔딩 배경 | `jurassic/image/fx_ending.jpg` | 쥬라기 세계 그림이라 **테마**가 갖는다 |
| MISSION COMPLETE | `_shared/fx_mission_complete.png` | 화면에 뜨는 것이라 **공용** |
| 만세하는 아이 둘 | `_shared/char/<skin>/char_cheer.png` | 캐릭터 세트 **안**이다 |

배경만 **JPEG**로 갔다. 알파가 없는 전면 그림이라 PNG면 2.9MB인데 JPEG q88은
463KB다 — 아이가 마지막에 기다리는 시간이 6배 차이난다.

만세 그림을 `char/<skin>/`에 넣은 이유: 따로 폴더를 만들면 나중에 캐릭터를
바꿀 때 **한 장만 옛 그림으로 남는다**(`CLAUDE.md`: 주인공은 테마가 아니다).

##### 아이는 둘 다 세운다

지금 달리던 캐릭터 하나만 세울 수도 있었다. 그런데 이 화면은 "네가 해냈다"
보다 **"우리가 다 왔다"**에 가깝고, 한쪽만 서면 화면 반이 빈다. 프로필로
갈리는 것은 달리는 캐릭터다(`playerSkin`).

- 화면 **아래에서 올라온다.** 가운데에 놓으면 배너를 가리고, 위에서 떨어뜨리면
  넘어진 것처럼 보인다
- 배너보다 **뒤에** 선다(z-index 2 대 3) — 읽을 것이 먼저다
- 다 올라온 뒤에는 아주 작게 들썩인다. 멈춘 그림은 스티커로 보인다
- 좌우 등장에 140ms 시차를 뒀다. 동시에 튀어나오면 기계 같다
- 발이 화면 아래에 **닿아야** 한다. `bottom: -2%`로 눌렀더니 신발이 잘려
  떠 있는 스티커가 됐다

**693 → 697건.**

### 남은 것

- 결승 포털·엔딩 실기기 확인 — 문 반짝임·불 크기·깔때기 26유닛·꽃가루 양
- 똥 피하기·2.5D 러너의 메뉴를 공용 바로 (위 허용 목록 비우기)
- 2.5D 러너에도 Great!/Miss를 붙일지 — 지금은 3D만 쓴다(`showJudge`는 공용이다)
- `palm` — 스크립트 저폴리다. 서른 그루로 늘려 놔서 여기가 제일 눈에 띈다
- `gate_wide`(숙이는 관문)만 Meshy다 — 정글 토템 화풍으로 맞추려면 한 장 더
- `hurdle_low`의 소스가 **여전히 관문 그림이다.** 1 : 0.443 비율을 14.25 : 2.2로
  만들려니 기둥이 작고 가로대가 길어진다. 눌러 늘이는 것보다는 낫지만,
  제대로 하려면 **낮은 바 그림**(가로:세로 ≈ 5:1)이 따로 필요하다
- `egg_block`·`sign_armsopen`도 Meshy지만 화풍이 크게 튀지는 않는다

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
| **1** | **통합 준비** | ✅ Safari 검증 완료 (8/4) |
| 1-2 | 웜업 파일 이관 · 에셋 경로 (89개 전부 200) | ✅ |
| 1-3 | 임시 라우트 (`warmupLegacy.js`, `legacy-shell.js`) | ✅ |
| 1-3 | 크롬 — 화면 전환 · 콘솔 0 · 회귀 | ✅ |
| 1-3 | 크롬 — 키보드 모드 완주 | ⬜ |
| 1-3 | 크롬 — 모션 모드 인식 확인 (STEP 4-0 검증에서) | ✅ |
| 1-3 | **Safari 완주 검증** | ✅ 아이폰 실기기 (8/4) |
| 1-4 | 마이그레이션 SQL · stats.js · 임포트 스크립트 | ✅ |
| 1-4 | Supabase 002 실행 + 33건 임포트 | ✅ |
| 1-5 | 저장 누락 3건 수정 (미션완료 · duration · 이탈) | ✅ |
| 1-5 | 키보드 모드 저장 검증 | ✅ |
| 1-5 | 모션 모드 검증 — `exercise_summary` 첫 줄 확인 | ✅ |
| 1-6 | 키보드 모드 기록 분리 (`input_mode`) | ✅ |
| 1-6 | Supabase 003 실행 + 분리 확인 | ✅ |
| **2** | **허브 껍데기** | ✅ 크롬 검증 완료 |
| 2-1 | registry 확장 (`entry`·`getAll`·`getEntry`) | ✅ |
| 2-2 | manifest v3 통일 (양쪽) | ✅ |
| 2-3 | home = 게임 목록 · 스플래시 → `poop-dodge/intro.js` | ✅ |
| 2-4 | 라우터 `onLeave` + 웜업 `boot()`/`destroy()` | ✅ |
| 2-5 | 홈 = §화면1 레이아웃 · BGM 동선 · 웜업 허브 버튼 | ✅ |
| 2-6 | `npm run build` 통과 | ✅ |
| 2 | 크롬 재진입·카메라 해제 검증 | ✅ |
| **3** | **멀티디바이스 제거** | ✅ 크롬 검증 완료 |
| 3-1 | `channel.js`·`control.js`·`camera.js` 삭제 | ✅ |
| 3-2 | `game.js` 2190 → 688줄 · 번들 345 → 278kB | ✅ |
| 3-3 | 정리 시점 `onLeave` 이관 · `session_id` 제거 | ✅ |
| — | 자동 테스트 (Vitest 61건) | ✅ |
| **4** | **포즈 엔진 통합** | 🔶 4-0 완료 |
| 4-0 | MediaPipe·좌표계 통일 (tasks-vision + 거울) | ✅ 크롬 검증 완료 |
| 4-1/2 | detector 재배치 (lane/duck 분리, poseMatch 래핑) | ⬜ |
| **5** | **게임팩화** | 🔶 5-0 화면 소유권 분리 완료 (8/4) / 공용 화면·클래스 규격 남음 |
| **6** | **손 포인터** | ✅ 크롬 검증 완료 |
| 7 | 홈 화면 | 🔶 레일+팝업 구조 아이폰 검증 완료 (8/4) / 계정 남음 |
| 8 | 똥 피하기 개조 | 🔶 조준 낙하·O/X·PIP 선반영 / **입력 체계 결정 시급** — 운동량이 안 잡힌다 |
| **9** | **배포 전환** | ✅ `main` 병합 완료 (8/4) / Render 중단·`_archive` 남음 |
| **11** | **운동 체계** | 🔶 사전·감지기 둘·`/lab`·게임 둘 완료 (8/9) / **실기기 검증과 문턱 조정이 남음** |
| **10** | **캐릭터 성장** | ✅ 뼈대·`/start`·`/buddy`·허브 버디 자리·`/me` 완료 (8/9, 크롬) / 연출·아이템은 2차 |

### 여기까지 — 크롬에서 몸으로만 도는 상태가 됐다

```
허브(손 포인터로 게임 선택) → 게임 진입 → 몸으로 플레이 → O/X로 종료 → 허브
```

마우스를 잡아야 하는 지점이 없다. STEP 0~6 중 **5(게임팩화)와 4-1/4-2(detector 재배치)만 남았고**, 둘 다 화면에 보이는 변화가 아닌 내부 구조 정리다.

**운동 데이터 1호** (2026-08-02 21:01 KST)

```
warmup-obstacle · local-default · 1세션 · 활동 36초 · 점프 2 · 앉기 3 · 피하기 6
```

`input_mode = 'motion'`만 들어오는 뷰라 카메라로 몸을 움직여 만든 진짜 기록이다.

### 2026-08-04 — 아이폰 Safari 검증 통과

가장 위험하다고 적어뒀던 관문을 넘었다. 브랜치 프리뷰(`integrate-warmup--…netlify.app`)에서 아이폰 Safari로 확인했고, **손 포인터·레일·전체 보기 팝업·카테고리 셀렉트·게임 진입이 전부 정상**이었다.

이제 남은 것은 `main` 병합뿐이다. 절차는 `docs/STEP9_아이폰검증.md` §7.

> 아래 "Safari 검증" 항목은 당시 판단 근거로 남겨둔다.

### 다음에 할 일

**1. ~~Safari 검증~~ (완료)** — 남은 것 중 가장 위험했다. Netlify 프리뷰 배포가 필요하다(아이폰은 HTTPS 필수라 로컬 `npm run dev`로는 카메라가 안 열린다). v3에서 "폰이 본체"로 방향을 잡은 이상 **아이폰은 부차적 대상이 아니라 주 타깃**이다.

특히 확인할 것 — `tasks-vision`의 WASM SIMD 하한선(Safari 16.4+), GPU delegate 실패 시 CPU 폴백이 실제로 도는지, 손 포인터가 저사양 기기에서 쓸 만한 프레임을 내는지.

**2. 아이 손으로 포인터 감도** — 어른 팔 길이로 맞춰진 상태다. 어깨 너비 비율로 스케일하므로 이론상 무관하지만, 실제 4~8세가 써봐야 안다. 조정 지점은 `pointer.js`의 `BOX_HALF_W`(휘두르는 크기)와 `RAISE_ON/OFF`(드는 높이).

**3. STEP 5 게임팩화** — 공용 카메라 준비 화면(`pages/ready.js`)이 생기면 인트로에서도 O로 시작할 수 있다. 지금은 카메라가 게임 진입 후에 켜져서 인트로에 손동작이 없다.

**4. 키보드 모드 완주 검증** — 아직 안 했다. 카메라 없는 환경 폴백이 온전한지.

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

---

## STEP 20 — 카메라 화각 측정 (9/1)

**왜 시작했나.** 빔 프로젝터 있는 곳에서 쥬라기 런 3D를 테스트하다 막혔다.
180cm 어른이 전신 통과를 받으려면 **2.6m를 물러서야 했다.** 거실에서 그만큼
뒤로 갈 자리가 없으면 게임을 시작조차 못 한다. 아이는 더 작으니 낫겠지만,
"자리를 찾아 헤매는" 첫 경험은 그대로다.

### 처음 떠올린 답이 틀렸다 — "줌아웃"

ken의 제안은 "플랫폼 안에 줌아웃 기능을 넣자"였다. **이건 불가능하다.**
소프트웨어 줌아웃은 없다 — 렌즈가 안 담은 것은 어디에도 없다.
`track.getCapabilities().zoom`도 대개 1배 이상(줌인)만 준다.

담기는 범위를 늘리는 길은 둘뿐이다.

| 길 | 계산상 이득 | 근거 |
|---|---|---|
| 종횡비를 세로로 | 1.78배 | 16:9 → 9:16이면 세로 화각이 그만큼 넓다 |
| 요구 관절을 줄인다 | 2.2배 | 코~발목(전신) 대신 그 게임이 진짜 쓰는 점만 |

곱하면 3.9배. 2.6m → 0.67m다. **다만 전부 계산이다.**

### 그래서 재는 화면부터 만들었다 — `#/labcam`

기기가 요청한 종횡비를 정말 주는지, 센서를 어느 쪽으로 자르는지는 기기마다
다르다. 맥북캠은 세로 스트림을 아예 안 줄 수도 있다. **재기 전에 고치면
안 되는 것을 고치게 된다** — 이 저장소에서 이미 두 번 겪었다(Draco 양자화·에셋 예산).

한 자리에 서서 종횡비만 바꿔가며 담는다. 비교하는 값은 하나다 —
**프레임 세로에서 코~발목이 차지하는 비율.** 이 값이 절반이 되면
같은 기준을 절반 거리에서 받는다.

### 요구 관절을 두 종류로 나눴다 (`pose/requirements.js`)

감지기가 읽는 점은 성격이 둘이다.

- **move** — 판정에 직접 쓰는 점. 없으면 그 동작을 셀 수 없다
- **scale** — 몸 크기(`bodyHeight` = 코~발목)를 재는 점. 문턱이 전부 몸 비율이라 필요하다

이 구분이 이 STEP의 핵심이다. **`scale`은 없앨 수 있는 요구다.**
MediaPipe가 world landmarks(미터 좌표)를 주면 화면에 발목이 없어도 몸 크기를
알 수 있다. 그러면 여덟 게임 중 여섯에서 발목 요구가 사라진다 —
제자리 달리기와 한 발 서기만 발목이 곧 그 동작이라 남는다.

`detectors` 필드는 지금까지 아무도 안 읽었다. 이제 이걸로 요구를 정하게 되므로
모르는 이름이 적히면 **요구가 텅 빈 채로 통과**된다. `metrics`에서 겪은 것과
같은 종류라 같은 방식으로 막았다(`test/poseRequirements.test.js`).

### 엔진에 `reopen()`을 넣었다

종횡비를 바꾸려면 카메라를 다시 열어야 한다. 측정용으로 따로 만들지 않고
엔진에 둔 이유는, **화면 방향이 바뀌면 프로덕션에서도 이 길로 오기** 때문이다.
재는 길과 쓰는 길이 같아야 잰 숫자가 실제로 그 뜻이 된다.

두 가지를 조심했다.

- **먼저 놓고 연다.** 같은 장치를 놓기 전에 다른 해상도로 열면 `NotReadableError`다
- **붙어 있는 `<video>`를 들고 있어야 한다.** 스트림을 갈아끼우면 화면들이
  죽은 스트림을 붙들고 검은 화면이 된다. `_attached` 집합을 새로 뒀다

랜드마커는 다시 만들지 않는다 — 스트림과 무관하고, 다시 만들면 2초 가까이 멈춘다.
대신 EMA 버퍼는 비운다(종횡비가 바뀌면 이전 좌표와 섞으면 안 된다).

### 미리보기 상자에 비율을 걸지 않았다

`#/labcam`의 미리보기는 `aspect-ratio`가 없다. 16:9 상자에 세로 영상을 넣으면
`object-fit: cover`가 잘라내서 **넓어진 화각을 눈으로 확인할 수가 없다.**

준비 화면(`core/readyScreen.js`)의 `#rdy-pip`이 지금 정확히 그 상태다
(`aspect-ratio: 16/9` 고정). 카메라를 세로로 열어 놔도 저 상자가 도로 잘라낸다 —
**고치는 단계에서 같이 봐야 하는 자리다.**

### 남은 것

측정은 ken이 몸으로 한다. 결과에 따라 갈린다.

- 세로가 실제로 넓으면 → 방향 자동 따라가기(판 중에는 잠금)
- world 좌표가 오면 → `scale` 요구를 빼고 준비 화면을 게임별로
- 둘 다 안 되면 → 계산이 틀린 것이다. 그때 다시 생각한다

어느 쪽이든 `#rdy-pip` 비율 고정과 "뒤로 물러나 주세요"(위가 잘렸을 때도
같은 말을 한다)는 고친다. `checkPoints()`가 위/아래를 이미 구분해서 돌려준다.

---

## STEP 21 — 허브 레일에 손 스와이프 넘기기 (9/1)

**왜 시작했나.** ken이 모바일에서 손 커서로 게임 목록을 넘기다 불편함을 겪었다.
좌우 화살표가 카드 옆에 바짝 붙어 있고(간격 10~16px), 모바일에서는 폭도
44~60px로 좁다. 겨눔 시간은 화살표 0.5초·카드 1.2초.

### 처음 받은 제안(`play-zera-gesture-control-ux-spec.md`)과 왜 그대로 안 갔나

ken이 가져온 기획서는 **Open Palm(펼친 손) = 탐색, Fist(주먹) = 선택**로 나누고,
스와이프로 화살표를 완전히 대체하는 안이었다. 정교하지만 손가락 마디(MCP)로
펼침/주먹을 구분하려면 MediaPipe **Hands** 모델이 있어야 한다.

`pointer.js`는 처음부터 **손목(포즈 모델)만 쓴다** — 주석에 이유가 적혀 있다:
"Hands 모델을 얹으면 프레임이 절반이 된다." 게임 화면은 이미 포즈 모델을
돌리고 있어서, 여기에 Hands까지 얹는 비용을 실측 없이 들이는 건 이 저장소의
"고치기 전에 잰다" 원칙에 어긋난다.

그래서 **손가락 구분 없이, 손목이 얼마나 빨리 옆으로 움직였나**로만 판정하는
쪽으로 범위를 좁혔다. 화살표는 지우지 않고 남겨뒀다 — 스와이프가 안 먹히거나
아이가 낯설어할 때의 대체 수단으로.

### `core/swipeGate.js` — 순수 판정 로직

`moves.js`의 사이드스텝과 겉보기엔 비슷하지만 다르다.

- 사이드스텝(운동 지표)은 **돌아와야 1회**다 — 반복이 곧 운동이니까
- 스와이프(UI 조작)는 **돌아올 필요가 없다** — 넘긴 뒤에는 다음 카드를 보러 가야 한다

대신 "카드를 찾아 천천히 이동"과 "휙 젓기"를 갈라야 하는데, 그 둘은 **이동
거리가 아니라 짧은 시간(창, window) 안의 속도**로 갈린다. 그래서 `SwipeGate`는
최근 350ms 안의 커서 x 이동만 보고, 화면 폭의 14%를 넘으면 방향을 낸다.
쿨다운(550ms)을 둬서 한 번의 큰 동작이 여러 페이지를 건너뛰지 않게 했다.

감지기가 아니라서 `progress/exercises.js`에 없다 — 운동으로 안 센다.

### `pointer.js` 연동

`data-pz-swipe` 속성이 붙은 영역 안에서만 판정을 돈다. 영역이 바뀌면(다른
버튼을 겨누다 들어왔거나 나갔거나) `SwipeGate`를 리셋한다 — 그 전 움직임이
스와이프로 잘못 잡히면 안 된다. 스와이프가 확정되면 그 프레임의 대상(dwell) 판정을
건너뛴다 — 젓는 동작 중에 지나친 카드가 눌리면 안 된다(문서의 "Swipe 중에는
Select 금지"와 같은 결론에 다른 길로 도달했다).

`home.js`의 `#pz-rail-wrap`에 `data-pz-swipe`를 달고 `pz-swipe` 이벤트로
기존 `goRail()`을 그대로 부른다 — 페이지 전환 애니메이션(`pz-row-left/right`)도
화살표 클릭과 같은 길을 타서 따로 손댈 게 없었다.

### 남은 것

실기기(모바일)에서 문턱(14%)·창(350ms)·쿨다운(550ms)이 맞는 감으로 느껴지는지
확인 안 됐다 — 다른 튜닝값들처럼 어림값이다. 기획서의 나머지(Fist 선택,
양손 정책)는 Hands 모델 도입 여부가 먼저 정해져야 다음을 논할 수 있다.

### 이어서 — 화살표 제거 + 피크(peek) 카드 (9/1)

ken 피드백대로 좌우 화살표를 완전히 지우고, `#pz-rail-wrap` 양옆에 다음/이전
카드가 **살짝 걸쳐 보이는** `.pz-peek` 조각을 뒀다. 화살표를 안 겨눠도
"옆에 더 있다"가 눈에 보이고, 마우스·터치 사용자도 같은 힌트를 받는다.

세 번의 스크린샷 피드백으로 다듬었다.

1. 처음엔 폭 20~40px·불투명도 0.5라 거의 안 보였다 → `clamp(64px, 11vw, 118px)`·
   불투명도 0.75로 키움.
2. gap이 0이라 진짜 카드에 바짝 붙어 있었다 → `:not(:empty)` 방향별 margin.
3. 페이지 전환 애니메이션이 `#pz-rail-row`에만 걸려 있어 피크가 따로 놀았다
   ("아주 엉망") → 애니메이션 클래스를 `#pz-rail-wrap` 전체로 옮김. 왼쪽 피크는
   `margin-left: auto` 대신 컨테이너에 `justify-content: flex-end`를 줘서
   반대쪽 카드가 나오게 했다.

### 이어서 — 연속 동일 방향 스와이프 오판 (9/1) ★

**증상.** 오른쪽으로 스와이프해 페이지를 넘긴 뒤, **또 오른쪽으로** 넘기려고
손을 다시 오른쪽으로 뻗으려면 먼저 손을 원위치(왼쪽)로 되돌려야 한다. 그런데
그 되돌리는 동작 자체가 빠르고 큰 반대 방향 이동이라, 쿨다운(시간)만 지나면
바로 재판정하던 예전 `SwipeGate`가 이걸 "왼쪽 스와이프"로 잘못 확정시켰다.

**원인.** 확정 뒤 다음 판정을 여는 조건이 **시간(cooldownMs)** 하나뿐이었다.
손이 진짜 멈췄는지는 안 봤다.

**고침.** `SwipeGate`에 확정 뒤 "정리 중(settling)" 상태를 추가했다. 쿨다운
시간이 지나도, 창(window) 안 움직임 폭이 문턱의 `settleFrac`(기본 35%) 아래로
떨어지기 전까지는 어떤 방향도 내지 않는다. 손이 실제로 멈추는 순간에야
그 지점을 새 기준점으로 삼아 다음 스와이프를 받는다 — `pointer.js`·
`home.js` 쪽은 안 건드렸다, `SwipeGate`의 API(생성자 옵션·`push`·`reset`)가
그대로라서.

`test/swipeGate.test.js`에 재현 테스트를 추가했다(★ 표시) — 확정 직후 손이
빠르게 되돌아가도 안 걸리고, 진짜로 멈춘 뒤에야 다음 스와이프가 먹히는 걸
고정했다. 720건 전체 통과.

### 이어서 — "손이 머물면 로딩이 안 뜨고, 주먹을 쥐면 로딩이 뜬다" (9/1)

스와이프를 고쳐도 ken은 여전히 컨트롤이 어렵다고 했다. 원인을 더 좁혀보니
**머무르기(로딩) 링이 손을 대상 위에 올리자마자 바로 채워지기 시작하는 것** 자체가
스와이프와 뒤섞여 헷갈림을 키우고 있었다. 요청: 손을 얹기만 해서는 로딩이
안 뜨고, **주먹을 쥐어야** 로딩이 뜨고 그게 차면 클릭된다.

문자 그대로의 "주먹"은 손가락 모양을 봐야 하는데 `pointer.js`는 손목(포즈
모델)만 쓴다. 두 가지 길을 ken에게 물었다 — ① 손목 깊이(z) 기반 "미는 동작"으로
대체(성능 비용 없음, 진짜 주먹은 아님) ② 진짜 주먹 인식(MediaPipe Hands 계열
모델 추가, 성능 실측 먼저 필요). **ken이 ②를 골랐다.**

`#/labhands` 신설 — `#/lab3d`가 포즈+3D를 동시에 재던 것과 같은 방식으로,
포즈와 **GestureRecognizer**(tasks-vision, 손 모양을 Open_Palm/Closed_Fist 등으로
이미 분류해준다 — 손가락 마디를 직접 계산할 필요가 없다)를 동시에 돌려 FPS를
잰다. 실전과 같은 감각을 보려고 `pointer.js`의 머무르기 링과 같은 모양의
hold 링도 넣었다 — 주먹을 700ms 유지하면 확정되고 dt×0.6로 풀린다
(tuning.js의 GESTURE 계열과 같은 감소율).

**아직 게임에 붙이지 않았다.** ken이 `npm run dev` → `#/labhands`에서 실제로
저어보고 FPS·인식 감각을 확인한 뒤에, 쓸 만하면 `pointer.js`에 정식으로
붙이고 아니면 ①안으로 돌아간다.

### 실측 결과 → 정식 연결 (9/1)

ken이 `#/labhands`에서 직접 확인 — 포즈 FPS 22, 주먹인식 켜도 22(차이 없음),
GPU delegate, 점수 0.90대로 10번 다 확정됨. "잘 인식하는데 아주 좋아."

적용 범위를 물었다 — 홈 레일 카드만 vs 앱 전체(`data-pz-hit` 전부). **ken이
앱 전체를 골랐다.** 모든 손 커서 버튼이 이제 "머무르면 미리보기만, 주먹을
쥐어야 로딩이 차고 확정된다"로 바뀐다.

**`core/pose/fistEngine.js` 신설.** `poseEngineCore`와 같은 모양(acquire·
release 참조 카운팅, onFist 구독)의 별도 엔진이다. 포즈 엔진에 얹지 않은
이유 — 주먹 인식은 손 커서로 버튼을 확정할 때만 필요한데, 포즈는 게임 판정에도
쓰여 앱이 켜 있는 내내 필요하다. 게임 플레이 중에는 `pointer.js` 자체가 꺼지므로
(`handSession.js`, 몸과 O/X로 조작) 같이 꺼진다 — 판정 경로는 이 모델을 실을
일이 없다. `poseEngine.js`의 `MP_VERSION`을 export해서 같이 쓴다 — 버전이
갈리면 한쪽만 고장 나는 조합이 생길 수 있어서.

**`pointer.js` 변경.** `tick()`의 확정 분기 하나만 바뀐다 — 대상 위에 있어도
`confirming = !fistReady || isFist`가 참이어야 `dwell`이 쌓인다. 거짓이면
대상을 벗어났을 때와 같은 dt × 0.6으로 풀린다. **주먹 인식이 못 켜졌으면
(`!fistReady`) 예전처럼 머무르기만으로 확정한다** — 모델 하나 못 받았다고
앱 전체를 아무도 못 누르게 되는 걸 막는 폴백이다. `pz-hover`·
`pz-pointer-enter`(미리보기)는 그대로 손을 얹기만 해도 뜬다 — 바뀐 건
"로딩이 언제 차는가"뿐이다.

`start()`/`stop()`이 빠르게 반복될 수 있어(화면 전환마다 `handSession`이
토글) `fistGen` 카운터로 늦게 도착한 `acquire()` 결과가 이미 멈춘 뒤에
구독을 걸지 않게 막았다.

**`#/labhands`도 `fistEngineCore`를 직접 쓰도록 정리.** 처음엔 자체
GestureRecognizer 로딩 코드를 따로 갖고 있었는데, 그러면 이 화면이 잰 것과
실제로 배포되는 경로가 달라질 수 있다 — 같은 엔진을 봐야 숫자가 계속 의미
있다. 이제 이 화면은 회귀 확인용이다.

720건 → 722건(신규 파일 2개가 `sourceParses` 대상에 잡혀 늘었다), 빌드 통과.
번들(허브가 여는 `index-*.js`)이 3.5kB 늘었다 — `fistEngine.js` 클래스
정의만큼이고, 실제 모델·tasks-vision 라이브러리는 CDN에서 그대로 지연 로드된다.

**실기기에서 아직 확인 안 됨.** 문턱(`FIST_SCORE_MIN` 0.6)·머무르기 시간
(1200ms, 기존 `DEFAULT_DWELL_MS` 그대로 — 이번엔 안 바꿨다)이 어른(ken)
기준으로만 재봤다. 아이 손은 더 작고 인식 각도도 다를 수 있어 실기기 검증이
필요하다.

---

## STEP 22 — 스와이프를 "끝에서 무장 → 당기기"로 (9/1)

**증상.** 주먹 게이트(STEP 21 이어서)는 ken이 "너무 잘된다"고 했지만, 스와이프는
여전히 "손이 좌우로 움직일 때 계속 움직여서 의도와 다르게 넘어가고 어지럽다"고
했다.

**원인.** 예전 `swipeGate.js`는 레일 **전체 폭**에서 손이 빠르게만 움직이면
방향을 냈다. 카드를 찾아 손을 옮기는 것과 넘기려는 것을 **속도로는 못 가른다**
— 지난 STEP에서 고친 "연속 스와이프 오판"과는 다른 문제였다. 그건 방향을
잘못 읽는 버그였고, 이번엔 애초에 걸리면 안 되는데 걸리는 오탐지였다.

**방향을 정하기 전에 먼저 계획만 세웠다.** ken이 "바로 작업은 하지 말고
계획을 세워보자"고 해서 세 가지 안(주먹 게이트+당기기 / 페이지네이션 버튼화 /
문턱만 올리기)을 제시했는데, ken이 더 나은 아이디어를 냈다 — **"오른쪽 끝에
손을 가져가면 왼쪽 화살표가 뜨고, 그 상태에서 우→좌로 이동시키면 넘어간다.
왼쪽 끝은 반대로."** 즉 손이 화면 끝에 **먼저 닿아야(무장)** 하고, **그다음
정해진 방향으로 당겨야만** 확정되는 방식. 손을 얹기만 하면 로딩이 안 뜨고
주먹을 쥐어야 뜨는 것과 같은 구조 — "머무는 것"과 "확정하는 것"을 가른다.

### 결정 사항 (ken이 그 자리에서 정함)

| 질문 | 답 |
|---|---|
| 무장 판정 자리 | 지금 피크(peek) 카드가 걸쳐 보이는 자리 그대로. 좁으면 나중에 넓힌다 |
| 무장에 머무름(dwell) 필요? | 아니오 — 닿는 즉시 무장 |
| 확정까지 당기는 거리 | "조금만 움직여도 반응하면 좋겠다" — 구체값은 위임 |
| 화살표 디자인 | 밝고 눈에 띄게, 게임 아이콘 느낌, **오른쪽 끝에서 뜬다**(무장한 쪽에 뜬다는 뜻으로 해석), 텍스트도 같이 |
| 추가 요청 | 페이지 전환 시 "이동하는 모습"이 잘 보이게 |

### `core/edgeSwipe.js` — `EdgeSwipeGate`

`swipeGate.js`(시간 창 + 속도)와는 완전히 다른 모델이다. 무장 자리(`enterZone`)와
확정 판정(`update`)이 분리돼 있다.

- `enterZone(side, x, now)` — 손이 `'left'`/`'right'` 무장 자리에 닿으면 부른다.
  이미 그 방향으로 무장돼 있으면 아무 일도 안 한다(기준점을 새로 안 잡는다) —
  무장한 채 살짝 흔들려도 처음 닿은 자리 기준으로 계속 잰다.
- `update(x, screenW, now)` — 매 프레임. 무장 방향으로 `pullFrac`(기본 3.5%)
  이상 당기면 확정, 반대로 `cancelFrac`(5%) 이상 물러나면 무장 해제,
  `timeoutMs`(3초) 넘으면 저절로 풀린다(안전장치).
- 문턱을 예전(14%)보다 훨씬 낮게 잡았다 — "끝에 먼저 닿아야 한다"가 이미
  의도를 걸러주므로, 확정까지는 조금만 당겨도 반응해야 손맛이 산다(ken 요청).

`test/edgeSwipe.test.js` 9건 — 무장·확정·취소·시간 초과·같은 방향 재진입(기준점
유지)·반대쪽으로 전환·`reset()`·화면 폭 비례를 고정했다.

**`swipeGate.js`는 지웠다.** `pointer.js` 말고는 아무도 안 썼고, 새 모델이
옛 모델의 상위 호환이 아니라 **아예 다른 판정**(시간창+속도 vs 위치+무장)이라
남겨둘 이유가 없었다. STEP 21의 "연속 스와이프 오판" 기록은 문서에 남긴다 —
같은 실수(속도만으로 의도를 읽으려 한 것)를 다시 안 하기 위해서다.

### `pointer.js` 연동

`swipeAttr`(`data-pz-swipe`, 존재만 봄) → `swipeZoneAttr`(`data-pz-swipe-zone`,
**값**을 본다 — `'left'`/`'right'`)로 바꿨다. 매 프레임 커서 아래 무장 자리를
찾아 `enterZone`을 부르고, 무장 중이면 `update`로 확정 여부를 본다.

이벤트를 둘로 나눴다.

| 이벤트 | 시점 | 용도 |
|---|---|---|
| `pz-swipe-arm` (`detail.side`) | 무장 상태가 바뀔 때만(도배 안 함) | 화살표 힌트 켜고 끄기 |
| `pz-swipe` (`detail.dir`) | 확정될 때 | `goRail()` 호출 |

전에는 `pz-swipe`를 무장 자리 엘리먼트(`zone.dispatchEvent`, bubbles)에 쐈지만,
이번엔 **`document`에 쏜다.** 무장이 된 뒤에는 손이 무장 자리를 벗어나 레일
가운데 쪽으로 이동하며 당기는 동작이 자연스러운데(오른쪽 끝에서 왼쪽으로 당기면
곧바로 그 자리를 벗어난다), 그 시점엔 더 이상 무장 엘리먼트 위에 커서가 없어
그 엘리먼트에 이벤트를 쏴도 의미가 없다. `document`는 항상 유효한 과녁이다.

손을 내리거나(`hide()`) 포인터가 꺼지면(`stop()`) 무장 중이었다면
`pz-swipe-arm`(`side: null`)을 한 번 더 쏴서 힌트가 화면에 남지 않게 한다.

### `home.js` 연동

- `.pz-peek`에 `pointer-events: auto` + `data-pz-swipe-zone="left"/"right"`를
  달았다. 예전엔 `pointer-events: none`이라 `elementFromPoint`가 그 자리를
  아예 못 찾았다 — 화살표 버튼처럼 보이면 안 돼서 막아뒀던 속성인데, 클릭
  핸들러가 원래 없으니 켜도 눌러서 뭐가 되는 일은 없다.
- `#pz-swipe-hint-left`/`-right` — 밝은 노란 알약(커서 강조색과 같은 `#ffd23e`)
  + 화살표 아이콘 + "이전"/"다음" 텍스트. 화살표는 **당겨야 할 방향으로**
  튄다(왼쪽 힌트는 오른쪽으로, 오른쪽 힌트는 왼쪽으로) — 가만히 있으면 장식으로
  안 읽혀서 살짝 바운스를 줬다. `pz-swipe-arm`을 듣고 `on` 클래스만 토글한다.
- 페이지 전환 애니메이션(`pzRowLeft`/`pzRowRight`)을 34px·0.26s에서
  `clamp(48px, 6vw, 110px)`·0.34s·`cubic-bezier(0.16,1,0.3,1)`로 키웠다 —
  이동이 잘 안 보인다는 요청. 화면 폭에 비례해 거리를 잡아 작은 화면에서도
  "슬쩍 지나가는" 느낌이 안 나게 했다.
- 문서 주석에서 `swipeGate.js` 언급을 `edgeSwipe.js`로 정정했다.

722건 그대로(swipeGate 9건 빠지고 edgeSwipe 9건 늘어 상쇄), 빌드 통과.

**실기기에서 아직 확인 안 됨.** `pullFrac`(3.5%)·`cancelFrac`(5%)이 어른 기준
어림값이다. 아이 손 움직임 폭은 다를 수 있어 실기기 검증이 필요하다.

### 이어서 — 카메라 미리보기가 힌트를 가림 + 힌트 문구 (9/1)

ken 스크린샷 — 손 컨트롤 카메라 미리보기(`#pz-hand-pip`, `handSession.js`)가
오른쪽 아래 고정이라 레일 오른쪽 끝(피크·스와이프 힌트)과 같은 자리를 덮고
있었다. **기능은 멀쩡했다** — pip은 `pointer-events: none`이라 손 커서의
`elementFromPoint` 판정은 그 밑을 그대로 통과한다. 다만 눈에 안 보이니
ken이 확정 방식을 오해했다(아래 참고). 헤더 아래 오른쪽 위로 옮겼다 —
페이지마다 레이아웃을 모르는 전역 컴포넌트라 "헤더 높이는 대개 비슷하다"에
기대는 어림 배치다. 화면마다 실제로 안 겹치는지는 확인이 더 필요하다.

ken이 물었다 — "화살표 표지에 손을 가져가야 이동이 되게 만든 거야?" **아니다.**
무장(`enterZone`)은 끝에 닿는 순간 되고, 그 뒤로는 화면 어디를 지나든 무장
방향으로 당긴 거리만 잰다(`update`가 badge 위치를 전혀 모른다) — 마치 폰
잠금화면의 스와이프 화살표처럼, 화살표는 "이 방향으로 밀면 된다"는 안내일
뿐 눌러야 하는 과녁이 아니다. pip이 힌트를 가려서 이 동작이 눈에 안 보였던
게 오해의 원인이었을 가능성이 크다.

힌트 문구도 바꿨다 — "다음"/"이전"(결과)에서 "왼쪽으로 끌기"/"오른쪽으로
끌기"(동작)로. ken이 제안한 "좌측으로 스와이프"/"좌측으로 끌기" 중 "끌기"
쪽을 썼다 — 실제로 하는 동작(당기기)과 더 맞아떨어진다.

## STEP 23 — 자동 넘어감 버그 + 홈 히어로 정리 (9/1)

### 레일 스와이프 — 끝에 닿기만 해도 자동으로 넘어가던 버그

ken 보고 — "손을 끝으로 가져가기만 했고 스와이프 동작을 하진 않았는데
여전히 자동으로 넘어가버려." STEP 22의 `EdgeSwipeGate`는 무장(`enterZone`)
자리를 좁혀서 "카드를 보려는 동작"과 "넘기려는 동작"은 잘 갈랐지만, 그
다음 "당겼다"의 판정이 **무장 순간에 고정한 anchor**를 기준으로 시간 제한
없이 누적하는 방식이었다. 손을 가만히 대고만 있어도 미세한 떨림이 수 초에
걸쳐 쌓여 결국 문턱(`pullFrac` 3.5%)을 넘었다 — "당기는 동작" 없이도
확정된 이유다.

고친 방법은 `swipeGate.js`(이번에 지운 옛 파일)가 이미 썼던 시간 창 기법을
여기 다시 쓰는 것. 무장 순간에 anchor를 한 번 고정하지 않고, **최근
`windowMs`(기본 400ms) 안의 표본 중 가장 오래된 것**을 매 프레임 새 기준점
으로 삼는다(`samples` 배열, 오래된 표본은 프레임마다 걷어낸다). 가만히
있으면 기준점도 같이 흘러가므로 떨림이 아무리 오래 쌓여도 한 창 안에서의
이동 거리는 0에 가깝다. 실제로 짧은 시간 안에 먼 거리를 움직이는 동작만
문턱을 넘는다.

고치기 전에 쟀다(`node`로 시뮬레이션) — 6초에 걸쳐 1px씩(총 60px) 미끄러지는
"가만히 대고 있기"는 창(400ms) 안에서 4px 안팎이라 안 걸렸고, 200ms 안에
40px을 움직이는 "진짜 당기기"는 걸렸다. `test/edgeSwipe.test.js`에 이 두
경우를 포함해 4건을 더 넣었다(총 13건) — 옛 테스트(정적 anchor 기준으로
짠 것들)는 전부 창 시간(400ms) 안에서 확정되는 짧은 시나리오라 로직을
바꿔도 그대로 통과했다.

### 홈 히어로 오른쪽 — 썸네일·캐릭터 버튼 정리, 카메라 미리보기로 교체

ken 요청(스크린샷 — 히어로 오른쪽에 게임 썸네일과 "LV.2" 캐릭터 버튼이
겹쳐 있던 자리) — 둘 다 없애고 그 자리에 카메라 미리보기를 넣는다.

- **게임 썸네일(`#pz-hero-poster`) 삭제.** 레일 카드에도 같은 그림이 있어
  중복이었다 — ken "썸네일 이미지는 필요없어보여."
- **캐릭터 버튼(`#pz-buddy`) 홈에서 삭제.** `renderBuddy()`·`goBuddy` 이벤트
  바인딩·전용 import(`getProgress`/`hasStarted`/`buddyNews`/`levelFromTotals`/
  `buddyImage`/`currentStage`, 다른 곳에서 안 쓰는 걸 확인하고 지웠다)까지
  같이 걷어냈다.
- **`#pz-hand-pip`을 그 자리로.** 전역 컴포넌트(`handSession.js`)라 페이지
  코드를 못 건드리니, `body:has(#pz-hub) #pz-hand-pip {...}`로 홈 페이지에서만
  위치·크기를 덮어썼다(1101px 이상 너비에서만 — 좁은 화면은 옛 썸네일도
  그 지점에서 숨었으므로 같은 기준을 따랐다).
- **캐릭터 접근은 `/me`로.** 마이페이지 버디 카드(`#me-buddy-card`) 오른쪽
  위에 텍스트 버튼 "내 친구 크게 보기 →"를 추가해 `/buddy`로 보낸다 — ken이
  "일단 텍스트 버튼으로"라고 해서 꾸미지 않고 자리부터 만들었다.

renderHero()에서 지운 변수(`heroPoster`/`heroPosterImg`)를 참조하던 세 줄도
같이 정리했다(안 하면 홈 진입마다 `ReferenceError`).

726건 통과(edgeSwipe 4건 늘어 722 → 726), `npm run build` 통과.

**실기기에서 아직 확인 안 됨.** `pullFrac`(3.5%)·`windowMs`(400ms)가 아이
손 움직임 기준으로 맞는지는 여전히 어림값이다.

## STEP 24 — 오른쪽은 고쳤는데 왼쪽에서 여전히 자동으로 넘어감 (9/1)

ken 재보고 — "오른쪽에서는 완벽해! 그런데 왼쪽에서는 여전히 그대로 스와이프
동작 하지도 않았는데 넘어가버려. 좌에서 우로." STEP 23의 롤링 윈도우는
"가만히 있는데 쌓이는" 건 막았지만, 다른 실패 모드가 남아 있었다 — **무장하는
동작 자체의 관성.** 몸을 가로질러 반대쪽 끝까지 손을 뻗는 쪽은 도착 직후
손이 관성으로 살짝 더 들어갔다가 자연스럽게 되튄다. 이 되튐은 몇백ms 안에
벌어지는 "짧은 시간에 먼 거리 이동"이라 롤링 윈도우 혼자로는 진짜 당기기와
위치만으로는 구별이 안 된다 — 둘이 같은 모양이다.

`EdgeSwipeGate`에 `armGraceMs`(정착 유예, 기본 200ms)를 추가했다. 무장
직후 이 시간 동안은 매 프레임 기준점을 지금 자리로 계속 다시 잡는다("아직
안 멎었다"로 보고 판정을 안 연다) — 세션 맨 처음에 고쳤던 옛 `swipeGate.js`의
"정리 중(settling)" 상태와 같은 발상을 여기 다시 썼다. 유예가 끝나는 순간의
자리가 "정착한 자리"가 되고, 그 뒤로 움직인 것만 진짜 당기기로 잰다.

값은 node로 되튐을 흉내 낸 시뮬레이션으로 골랐다 — 150ms는 격렬한 되튐엔
부족했고(여전히 확정돼 버림), 200ms에서는 순한 것도 격렬한 것도 다 걸리지
않으면서 진짜 당기기(250~300ms 안에 확정)는 그대로 통과했다. 왼쪽·오른쪽
대칭으로 확인했다. 다만 이건 흉내 낸 숫자다 — **아이 손으로 실제 되튐의
폭·시간이 얼마나 되는지는 여전히 실기기 확인이 안 됐다.**

`test/edgeSwipe.test.js`를 두 describe로 나눴다 — "창(windowMs) 로직"은
`armGraceMs: 0`으로 꺼서 창 트리밍만 격리해서 보고, "정착 유예"는 기본값
그대로 두고 되튐 재현·진짜 당기기·드리프트를 확인한다(9 → 17건).

730건 통과, `npm run build` 통과.

**근본적으로 위치 데이터만으로는 "의도적인 당기기"와 "도착 직후의 매끄러운
되튐"을 완벽히 구별할 수 없다** — 모양이 같기 때문이다. `armGraceMs`는 이
둘을 시간으로 가르는 절충안이지 완전한 해법이 아니다. 실기기에서 여전히
자동으로 넘어간다면 다음 손잡이는 `armGraceMs`를 올리거나(응답이 그만큼
느려진다) `pullFrac`을 올리는 것(ken이 "조금만 당겨도 반응하면 좋겠다"고
했던 값이라 임의로 올리지 않고 물어보고 정한다).

## STEP 25 — 홈 레일 썸네일 반응형 버그 (9/1)

ken 스크린샷 4장(포트레이트 400×909, 900×400대 두 종류, iPhone 12 Pro
가로) — 두 가지를 지적했다.

**1) 썸네일 박스 비율이 화면마다 다르게 보인다.** `.pz-card-thumb`이
`height: clamp(96px, 16vh, 170px)`로 높이를 **뷰포트 높이**에서 가져오는데,
폭은 그리드 칸(뷰포트 **폭**)에서 온다 — 서로 다른 축을 따라가니 화면
비율이 바뀔 때마다 박스 모양 자체가 늘어나거나 뭉개졌다. 세로로 긴 폰에서는
거의 정사각형, 가로로 누운 폰에서는 폭만 넓은 띠가 됐다. `aspect-ratio: 16 / 10`
로 바꿔 폭에서 높이를 계산하게 했다 — /me 페이지의 게임 카드(.g-thumb)가
이미 쓰던 값과 통일했다.

**2) 가로로 누운 폰이 세로로 선 좁은 폰과 똑같이 2개만 보인다.** `perPage()`가
`window.innerWidth <= 900`으로만 2/4를 갈랐다. 그런데 가로로 누운 폰(예:
iPhone 12 Pro 844×390)도 폭이 900 이하라 세로로 선 좁은 폰(예: 390×844)과
똑같이 2개 취급을 받았다 — 909px 폭(4개 보임)과 844px 폭(2개 보임)을 나란히
비교한 ken이 "다르게 보인다"고 지적. 세로로 선 폰의 폭은 대개 480 아래이므로
그 경계를 900에서 480으로 낮추고, 481~900px 구간에 3열 티어를 새로 넣었다.

`#pz-rail-row`의 열 수(CSS)와 `perPage()`(JS)는 **반드시 같은 문턱을 써야
한다** — 어긋나면 카드가 두 줄로 쌓여 "레일은 한 줄"이라는 STEP 21의 전제가
깨진다. 그래서 두 문턱(480·900)을 나란히 뒀다.

작업 중 템플릿 문자열 안 주석에 또 백틱을 썼다(`16vh`를 감쌌다) —
`test/sourceParses.test.js`가 그대로 잡았다. 이걸로 이 파일 규칙을 어긴
게 일곱 번째다.

730건 그대로(순수 함수 변경 없음), `npm run build` 통과.

### 이어서 — "여전히 이상하다"는 사실 다른 원인이었다 (더미 카드 끄기)

위 수정 뒤에도 ken이 iPhone 12 Pro·SE 포트레이트 스크린샷을 다시 보내며
"그대로인데"라고 했다. 확인해 보니 두 스크린샷 속 문제 카드(냉장고 괴물·
별 따기 점프·고양이 발 잡기 등)는 전부 `placeholders.js`의 **개발용 더미**
였다 — 실제 게임이 아니라 레일 페이징을 테스트하려고 넣어둔 카드다.

`identify`로 실제 파일 치수를 재서 확인했다. 더미가 재활용하는 아이콘은
정사각형(300×300, 1000×1000)인데, 실제 서비스에 노출되는 세 게임(똥
피하기·쥬라기 대탐험·인터랙션 웜업)의 썸네일은 전부 1.78:1 가로 이미지다
(1672×941, 1600×901). 새로 고친 16:10 박스에 정사각형 이미지를 넣으면
좌우로 크게 여백이 남아 아이콘이 작게 떠 보인다 — 반응형 버그가 아니라
더미 자산이 애초에 가로 썸네일용이 아니었던 것이다.

ken이 "이제 더미 데이터는 빼자"고 했다. `games/registry.js`의
`if (import.meta.env.DEV) { ... }` 더미 주입 블록을 주석 처리했다 —
**지우지는 않았다**, `placeholders.js`도 그대로다. 나중에 레일 스크롤·
페이징을 다시 눈으로 확인해야 하면 주석만 풀면 된다. `getPlaceholderManifests`
import는 그 재활성화 경로를 위해 남겨뒀다.

`test/gamePack.test.js`가 이미 `!g.placeholder`로 더미를 걸러내고 있어서
더미가 있든 없든 통과한다 — 이번에도 그대로 730건, `npm run build` 통과.

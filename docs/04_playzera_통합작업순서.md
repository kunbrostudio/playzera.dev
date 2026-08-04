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
- [ ] **아이폰 Safari 실기기 검증** ← 지금 여기. 8/4 홈 구조 변경분이 아직 실기기에서 안 돌았다
- [ ] `main` 머지 → 프로덕션이 허브로 전환
- [ ] 병합 직후 프로덕션 확인 (루트 화면 · 카메라 권한 재요청 · 더미 미노출 · 기록 저장)
- [ ] 웜업 Render 배포는 **1주일 더 유지** 후 중단
- [ ] `warm-up-web/` → `_archive/`

> **프로덕션은 아직 7월 2일 코드다.** 아이패드 검증에서 옛 똥 피하기가 뜬 이유가 이것이고,
> 병합 전까지는 계속 그렇다. 검증이 이 작업의 유일한 관문이다.

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
| **1** | **통합 준비** | 🔶 Safari만 남음 |
| 1-2 | 웜업 파일 이관 · 에셋 경로 (89개 전부 200) | ✅ |
| 1-3 | 임시 라우트 (`warmupLegacy.js`, `legacy-shell.js`) | ✅ |
| 1-3 | 크롬 — 화면 전환 · 콘솔 0 · 회귀 | ✅ |
| 1-3 | 크롬 — 키보드 모드 완주 | ⬜ |
| 1-3 | 크롬 — 모션 모드 인식 확인 (STEP 4-0 검증에서) | ✅ |
| 1-3 | **Safari 완주 검증** | ⬜ |
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
| 5 | 게임팩화 | ⬜ |
| **6** | **손 포인터** | ✅ 크롬 검증 완료 |
| 7 | 홈 화면 | 🔶 레이아웃·필터·레일·포인터 완료 / 계정 남음 |
| 8 | 똥 피하기 개조 | 🔶 조준 낙하·O/X·PIP 선반영 / 입력 체계 결정 남음 |
| 9 | 배포 전환 | ⬜ |

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

### 다음에 할 일

**1. Safari 검증** — 남은 것 중 가장 위험하다. Netlify 프리뷰 배포가 필요하다(아이폰은 HTTPS 필수라 로컬 `npm run dev`로는 카메라가 안 열린다). v3에서 "폰이 본체"로 방향을 잡은 이상 **아이폰은 부차적 대상이 아니라 주 타깃**이다.

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

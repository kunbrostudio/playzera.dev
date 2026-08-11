# 플레이 제라 — 작업 안내

카메라로 아이(4~8세)의 몸 동작을 인식해 노는 웹 게임 허브. 운동 데이터가 쌓이는 것이 이 서비스의 존재 이유다.

## 먼저 읽을 것

**`docs/04_playzera_통합작업순서.md`** 하나면 지금 상태를 다 알 수 있다. 진행 표 · 무엇을 왜 그렇게 정했는지 · 겪은 버그와 원인이 전부 여기 있다. **작업 로그이자 정본이다.**

나머지는 참조용이다.

| 문서 | 언제 본다 |
|---|---|
| `docs/01_playzera_기획안_v4.md` | "왜 이 서비스인가", 실행 환경, 조작 체계, 로드맵 (**현재 상태 기준**) |
| `docs/02_playzera_시스템설계_v3.md` | 포즈 엔진·손 포인터 설계 근거 |
| `docs/03_playzera_화면설계_v3.md` | 홈 레이아웃, 머무르기 시간 규칙 |
| `docs/07_playzera_운동체계.md` | **무엇을 운동으로 세는가** — 동작·카메라 한계·품질 문턱 |
| `docs/STEP9_아이폰검증.md` | 실기기 검증 체크리스트 |

## 지금 구조

```
src/core/
  router.js       해시 라우팅 + onLeave(정리 훅)
  handSession.js  손 컨트롤 세션 (앱 수명 동안 하나)
  pointer.js      손목 커서 + 머무르기
  catalog.js      홈의 페이지·배지·카테고리 규칙 (순수 함수)
  recent.js       이어서 하기 (localStorage)
  player.js       현재 아이 — 계정 전 임시
  handControl.js  손 컨트롤 켜기 + 카메라 오류 문구 (화면들이 같이 쓴다)
  tutorialSeen.js 게임별 "튜토리얼 봤나" 기억
  readyScreen.js  카메라 준비 화면 (게임들이 같이 쓴다)
  gameShell.js    게임 화면 공용 뼈대 — 안내·카메라·결과·기록
  resultQueue.js  서버 저장 + 실패 시 큐 (게임팩이 직접 부르지 않는다)
  pose/
    poseEngine.js tasks-vision 래퍼. 카메라 스트림을 참조 카운팅으로 공유
    gesture.js    O/X 판정
    tuning.js     제스처 튜닝값 (현장 검증됨 — 함부로 바꾸지 말 것)
    pipOverlay.js 스켈레톤·3분할 오버레이
    detectors/    동작 감지기 — highKnees(달리기) · balance(한 발 서기)
    poseMatch.js  자세 채점 — 관절 각도 + 몸 비율 (웜업·요가가 같이 쓴다)
    poses.js      요가 자세 사전 (서서 하는 것만)
src/progress/     성장 — 레벨·배지·조건·저장. **화면은 state.js만 거친다**
  exercises.js    운동 사전 — 동작·단위·EXP·품질 문턱. **지표 이름의 정본**
  level.js        운동량 → EXP → 레벨 (점수는 연료가 아니다)
  badges.js       배지 목록 = 데이터. 아이콘은 모티프 라이브러리를 돌려 쓴다
  conditions.js   조건 네 종류 (total · daysInWindow · variety · event)
  state.js        localStorage 하나 — 계정이 생기면 여기만 바꾼다
  rewardView.js   게임 결과에 붙는 배지·레벨 게이지
  report.js       부모 화면용 집계 — 하루 목표 30분·주간·게임별 (순수 함수)
  buddyView.js    버디 그림·별·게이지 (/buddy와 /me가 같이 쓴다)
src/buddies/      버디 registry + 종류별 manifest.json (단계 egg·hatch·grow·hero)
src/profiles/     아바타 registry
src/pages/        home · intro · tutorial · play · start · buddy · me
                  앞의 넷은 디스패처, 뒤의 셋은 성장 화면이다
src/games/
  registry.js     게임팩 목록. 게임을 추가할 때 손대는 유일한 파일
  poop-dodge/     intro.js · tutorial.js · play.js · game.js
  fire-rescue/    play.js · game.js — 제자리 달리기로 불 끄기 (유산소)
  stone-bridge/   play.js · game.js — 한 발로 버텨 돌다리 건너기 (균형)
  warmup-obstacle/play.js · main.js · …
  placeholders.js 개발용 더미
test/             Vitest — 순수 로직만
```

**게임팩 규격** — `manifest.json`(제목·썸네일·`metrics`) + `game.js`(규칙만, DOM을 모른다)
+ `play.js`(화면, `core/gameShell.js`를 쓴다) + registry 한 줄.
`manifest.metrics`는 **이 게임이 만드는 운동 지표의 선언**이고, 셸의 기록기가 그 목록으로
스냅샷을 거른다. 사전에 없는 이름을 적으면 테스트가 잡는다.

**화면은 게임팩이 소유한다.** `src/pages/`의 넷은 내용이 없다 — `?id=`로 registry를
찾아 게임팩이 등록한 로더를 부를 뿐이다. 라우터도 허브도 게임 이름을 모른다.

```
/              허브
/intro?id=     게임팩 스플래시   (없으면 건너뜀)
/tutorial?id=  게임팩 튜토리얼   (없으면 건너뜀)
/play?id=      게임팩 플레이

/start         첫 실행 — 프로필·알 고르기 (한 번)
/buddy         내 친구 — 버디·배지·꾸미기 (아이 화면)
/me            마이페이지 (부모 화면) — 손 커서를 붙이지 않는다
```

게임팩이 등록하는 화면 모듈은 **default export가 렌더 함수**여야 한다.

## 규칙

- **카메라는 앱 전체에서 하나다.** `poseEngineCore.acquire()`/`release()`로 빌려 쓴다. 화면마다 열고 닫으면 커서가 끊기고 `NotReadableError`가 난다.
- **좌표는 거울 좌표 하나다.** 엔진이 `1 - x`를 한 번만 한다. 구독자는 뒤집지 않는다.
- **정리는 라우터의 `onLeave`로 한다.** 페이지가 `hashchange`를 직접 들으면 이미 `#app`이 비워진 뒤에 정리가 돈다.
- **`pose/tuning.js`의 값은 현장에서 다듬어진 것이다.** 구조는 바꿔도 수치는 근거 없이 건드리지 않는다.
- 카드 클릭은 **선택**이고 실행은 히어로의 시작 버튼 하나뿐이다.
- **BGM은 게임 안에서만 난다.** 켜는 건 게임팩, 끄는 건 라우터(`GAME_ROUTES`)다. 화면이 각자 끄면 켜는 쪽과 순서가 엉켜 소리가 샌다 — 실제로 허브에서 음악이 계속 났다.
- 개발용 더미 게임은 `import.meta.env.DEV`에서만 목록에 들어간다.
- **늘어나는 것은 데이터로 둔다.** 게임·버디·배지·아이콘·프로필 전부 registry 한 줄 + 그림 한 장으로 추가된다. 화면 코드는 개수를 모른다.
- **그림 파일 이름을 id에서 계산하지 않는다.** 이름은 디자인 쪽에서 온다 — registry가 파일명을 데이터로 들고 코드가 따라간다.
- **기록 저장은 셸이 한다.** 게임팩이 직접 `saveResult`를 부르지 않는다 — 붙이는 걸 잊으면 그 게임의 운동 데이터가 통째로 사라진다(실제로 그랬다).
- **EXP는 몸을 움직여야 오르는 값에서만 나온다.** 점수·`dodgeCount`는 가만히 서 있어도 오른다.
- **지표를 코드 여기저기에 문자열로 적지 않는다.** 동작은 `progress/exercises.js` 한 줄로 추가된다 — EXP 가중치도 마이페이지 칸도 거기서 나온다.
- **횟수만 세지 않는다.** 각 동작에 품질 문턱이 있고 감지기가 그걸 지킨다. 대충 흔들어도 오르는 값은 운동 데이터가 아니다.
- **감지기는 시간을 밖에서 받는다.** 안에서 `performance.now()`를 읽으면 합성 프레임으로 테스트할 수 없다.
- **`visibility`가 낮은 프레임은 버린다.** MediaPipe는 화면 밖 관절의 좌표를 지어낸다 — 앉아 있는 사람에게서 걸음이 세어졌다.
- 아이 화면은 전부 손 커서로 되어야 하고(`data-pz-hit`), 부모 화면(`/me`)에는 붙이지 않는다.
- **머무르기 타겟을 세로로 인접하게 두지 않는다.** 1.2초 겨누는 동안 손이 조금만 움직이면 옆 버튼이 눌린다. 하단 4칸 바도, 허브 버디 자리도 이걸로 한 번씩 옮겼다.

## 확인 명령

```bash
npm run dev     # localhost:5173
npm test        # Vitest (309건)
npm run build   # 프로덕션 빌드
```

개발용 화면: `#/lab` — 감지기가 웹캠으로 실제로 세는지 눈으로 본다 (DEV에서만)

브라우저 콘솔에서
- `pzResetRecent()` — 이어서 하기 기록을 지운다
- `pzResetProgress()` — 버디·배지·레벨을 지워 `/start`부터 다시 본다

## 지금 위치

`main` 브랜치. 게임 4개(똥 피하기·웜업·불 끄기·돌다리), 테스트 309건.
STEP 5(게임팩화)·10(성장)·11(운동 체계)까지 코드가 들어갔고 **크롬에서만 확인됐다.**

**지금 막혀 있는 것은 실기기 검증이다.** 불의 성장률·달리기 케이던스 문턱·균형 EXP·
요가 자세 문턱은 전부 아이가 실제로 움직여 봐야 정해지는 값이라 어림으로 두었다.
`#/lab`에서 감지기와 요가 채점을 눈으로 볼 수 있다.

남은 것: 실기기 문턱 조정 · 동물 요가 게임 · 부화 연출 · 똥 피하기/웜업을 공용 셸로 ·
STEP 9 마무리(Render 중단·`_archive` 정리).

## 일하는 방식

- 문서에 적힌 판단 근거를 먼저 읽는다. 이유가 적혀 있는 결정은 대개 이유가 있다.
- 코드를 고치면 `docs/04`의 해당 STEP에 **무엇을 왜 그렇게 했는지** 남긴다. 체크박스만 채우지 않는다.
- 브라우저에서만 확인되는 것(카메라·프레임·좌우 반전)은 추측하지 말고 확인을 요청한다.

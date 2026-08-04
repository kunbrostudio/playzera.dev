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
  pose/
    poseEngine.js tasks-vision 래퍼. 카메라 스트림을 참조 카운팅으로 공유
    gesture.js    O/X 판정
    tuning.js     제스처 튜닝값 (현장 검증됨 — 함부로 바꾸지 말 것)
    pipOverlay.js 스켈레톤·3분할 오버레이
src/pages/        home · intro · game(똥 피하기) · warmup
src/games/        poop-dodge · warmup-obstacle · placeholders(개발용 더미)
test/             Vitest — 순수 로직만
```

## 규칙

- **카메라는 앱 전체에서 하나다.** `poseEngineCore.acquire()`/`release()`로 빌려 쓴다. 화면마다 열고 닫으면 커서가 끊기고 `NotReadableError`가 난다.
- **좌표는 거울 좌표 하나다.** 엔진이 `1 - x`를 한 번만 한다. 구독자는 뒤집지 않는다.
- **정리는 라우터의 `onLeave`로 한다.** 페이지가 `hashchange`를 직접 들으면 이미 `#app`이 비워진 뒤에 정리가 돈다.
- **`pose/tuning.js`의 값은 현장에서 다듬어진 것이다.** 구조는 바꿔도 수치는 근거 없이 건드리지 않는다.
- 카드 클릭은 **선택**이고 실행은 히어로의 시작 버튼 하나뿐이다.
- 개발용 더미 게임은 `import.meta.env.DEV`에서만 목록에 들어간다.

## 확인 명령

```bash
npm run dev     # localhost:5173
npm test        # Vitest (98건)
npm run build   # 프로덕션 빌드
```

브라우저 콘솔에서 `pzResetRecent()` — 이어서 하기 기록을 지워 첫 방문 상태로.

## 지금 위치

`integrate-warmup` 브랜치. STEP 0~6 완료(크롬 검증), **아이폰 Safari 검증이 남아 있다.**
남은 것: STEP 4-1/4-2(detector 재배치) · STEP 5(게임팩화) · STEP 9(배포 전환).

## 일하는 방식

- 문서에 적힌 판단 근거를 먼저 읽는다. 이유가 적혀 있는 결정은 대개 이유가 있다.
- 코드를 고치면 `docs/04`의 해당 STEP에 **무엇을 왜 그렇게 했는지** 남긴다. 체크박스만 채우지 않는다.
- 브라우저에서만 확인되는 것(카메라·프레임·좌우 반전)은 추측하지 말고 확인을 요청한다.

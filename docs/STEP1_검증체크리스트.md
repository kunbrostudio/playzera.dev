# STEP 1 검증 체크리스트

브랜치: `integrate-warmup` / 커밋: `ece46ef`
**포트: 5174** (5173은 meet-meet가 쓰는 중)

```bash
cd ~/Documents/playzera.dev
git branch --show-current   # integrate-warmup 인지 확인
npm run dev
```

## ✅ 브라우저로 확인 완료 (2026-07-29)

| 항목 | 결과 |
|---|---|
| `/assets/warmup/` 네트워크 요청 | ✅ 이미지 81 + 오디오 8 **전부 200/206**, 404 없음 |
| 콘솔 에러 | ✅ 0 (favicon 404와 확장프로그램 메시지는 앱과 무관) |
| 화면 전환 전체 | ✅ 타이틀 → 카메라 준비 → 튜토리얼1 → 튜토리얼2 → 카운트다운 → 플레이 |
| MediaPipe 포즈 파이프라인 | ✅ 카메라 준비 화면에 스켈레톤 렌더링됨 → `@vite-ignore` 수정 유효 |
| 전신 미검출 안내 | ✅ 빨강 테두리 + "뒤로 물러나 주세요" 정상 |
| 키보드 입력 경로 | ✅ 피하기/점프/앉기 HUD 카운트 증가 확인 |
| `/#/` 똥 피하기 홈 회귀 | ✅ 배경·폰트·레이아웃 정상 |
| 웜업 → 홈 이동 시 style.css 언마운트 | ✅ 홈 레이아웃 안 깨짐 |
| 허브 BGM ↔ 웜업 BGM 전환 | ✅ 홈=Kingdom 재생 / 웜업=Kingdom 정지 |

## ⬜ 남은 검증 ①: 키보드 모드 완주 — **몸 안 써도 됨**

카메라 준비 화면에서 **"카메라 없이 키보드로 플레이"** 를 누르면 방향키(◀▲▼▶)와 A·S·D로 전부 조작됩니다. 책상에서 조용히 할 수 있습니다.

> ⚠️ **탭을 앞에 두고 하세요.** 백그라운드 탭은 Chrome이 `requestAnimationFrame`을 완전히 멈춥니다(측정값 0fps). 게임 루프가 정지해 캐릭터가 뜬 채로 굳고 장애물이 안 나옵니다 — 버그가 아니라 브라우저 동작입니다.

- [ ] 레벨 1 완주 → 레벨 배너 → 레벨 2 진입
- [ ] 장애물(큐브/허들/포즈 사인판)이 순서대로 나오는가
- [ ] 목숨 차감 · 별 획득이 정상인가
- [ ] 효과음 (dodge, hint_pop, level_complete)
- [ ] 게임오버 또는 미션 완료 화면까지 도달
- [ ] BGM 한 곡만 들리는가 (겹쳐 들리면 안 됨)
- [ ] 햄버거 메뉴 → 음악/효과음/전체화면 토글
- [ ] 똥 피하기도 플레이 → 결과까지 정상

## ⬜ 남은 검증 ②: 모션 모드 — **몸이 필요함**

여기가 STEP 1의 진짜 합격 기준입니다. 장소가 될 때 하시면 됩니다.

- [ ] 머리 위 O 3초 → 캘리브레이션 진입
- [ ] **레인 이동 / 점프 / 앉기 / 포즈 인식이 이관 전과 같은 감각인가**
- [ ] **O/X 인식률이 이관 전과 같은가**

---

## 알려진 제약 (STEP 1 범위에서는 정상)

| 현상 | 이유 | 해소 시점 |
|---|---|---|
| 웜업 → 홈 → 웜업 재진입 시 게임이 다시 시작 안 됨 (콘솔에 `[warmup-legacy] 재진입 감지` 경고) | `main.js`가 모듈 최상단 IIFE로 부팅되고 ES 모듈 캐시가 재실행을 막음 | STEP 5 게임팩화 (`init()`/`destroy()`) |
| 게임 종료 후 기록 저장 실패 → localStorage 큐잉 | `stats.js`가 아직 `/api/records`로 POST. Express 서버가 없음 | STEP 1-4 Supabase 전환 |
| 웜업 나가도 카메라 스트림이 계속 잡혀 있을 수 있음 | `poseEngine.stop()` 호출 지점 없음 | STEP 5 |

## 이번에 바꾼 것

| 파일 | 변경 |
|---|---|
| `src/games/warmup-obstacle/**` | `warm-up-web/public/js/*` 전체 이관 (14개 파일) |
| `src/games/warmup-obstacle/style.css` | `public/css/style.css` 이관, `url()` 경로를 `/assets/warmup/`로 |
| `public/assets/warmup/` | 이미지 81 + 오디오 8 |
| `assets.js` `audio.js` `main.js` `screens.js` | 상대경로 `assets/…` → 절대경로 `/assets/warmup/…` |
| `input/poseEngine.js` | MediaPipe CDN 동적 import에 `/* @vite-ignore */` 추가 ⚠️ |
| `src/games/warmup-obstacle/legacy-shell.js` | 신규 — `index.html`의 `#stage` 마크업 + style.css 링크 마운트/언마운트 |
| `src/pages/warmupLegacy.js` | 신규 — 임시 페이지 |
| `src/core/router.js` | `/warmup-legacy` 라우트 추가 |
| `src/core/bgm.js` | `_suspended` 플래그 — `stop()`이 자동재생 fallback까지 무력화 ⚠️ |

⚠️ `bgm.js`의 `_suspended`가 없으면 `stop()`을 불러도 **첫 클릭 시 fallback이 허브 BGM을 되살립니다.** 브라우저 검증 중 발견한 실제 버그였습니다.

⚠️ `@vite-ignore`가 없으면 Vite가 CDN URL을 `../../../../https:/cdn.jsdelivr.net/…`으로 재작성해 포즈 인식이 통째로 죽습니다. 나중에 이 줄을 건드리지 마세요.

## CSS 충돌 검사 결과

`style.css`(68개 셀렉터) ↔ `global.css`(5개) — **클래스명 충돌 0건**. `.wu-` 접두사 불필요.
단 `style.css`가 `html, body`와 `*`를 덮어쓰므로 전역 import 대신 `<link>` 마운트/언마운트 방식으로 격리했습니다.

## 정적 검증 완료분

- `npm run build` 통과, 경고 0
- `assets.js` 이미지 60개 전부 실제 파일 존재
- 하드코딩 경로 23개 전부 실제 파일 존재
- 효과음 7종 전부 존재
- `dist/assets/warmup/` 이미지 81 + 오디오 8 정상 복사

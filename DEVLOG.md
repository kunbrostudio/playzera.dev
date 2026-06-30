# playzera.dev 개발 정리 문서

> 유아체육 멀티디바이스 게임 웹앱 — 개발 내역 및 파일 구조 가이드  
> 작성일: 2026-06-30

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택 & 인프라](#2-기술-스택--인프라)
3. [프로젝트 폴더 구조](#3-프로젝트-폴더-구조)
4. [파일별 상세 설명](#4-파일별-상세-설명)
5. [구현된 기능 목록](#5-구현된-기능-목록)
6. [핵심 기술 결정 사항](#6-핵심-기술-결정-사항)
7. [게임 추가 방법 (플러그인 구조)](#7-게임-추가-방법-플러그인-구조)
8. [알려진 임시 처리 사항](#8-알려진-임시-처리-사항)

---

## 1. 프로젝트 개요

**playzera.dev**는 유치원·어린이집 체육 수업을 위한 멀티 디바이스 게임 웹앱입니다.

### 핵심 사용 시나리오

| 디바이스 | 역할 |
|----------|------|
| TV / 노트북 | 게임 화면 (모니터) — 아이들이 보는 메인 화면 |
| 선생님 스마트폰 | 컨트롤러 — 게임 시작/정지/라운드 제어 |
| 카메라 스마트폰 | 웹캠 — 아이 동작 인식 후 모니터로 포즈 데이터 전송 |

### 현재 구현된 게임

- **똥 피하기 (poop-dodge)** — 하늘에서 떨어지는 똥을 몸으로 피하는 게임. 좌/가운데/우 3구역 중 아이의 실제 위치를 인식해 플레이.

---

## 2. 기술 스택 & 인프라

### 프론트엔드

| 항목 | 내용 |
|------|------|
| 번들러 | Vite |
| 언어 | Vanilla JavaScript (프레임워크 없음) |
| 라우팅 | 해시 기반 SPA (`/#/`, `/#/game?id=poop-dodge`) |
| 스타일 | 인라인 CSS-in-JS (컴포넌트별) + `global.css` |
| 폰트 | Jua (Google Fonts) |
| 포즈 인식 | MediaPipe Pose (CDN 로드) |

### 백엔드 / 인프라

| 항목 | 내용 |
|------|------|
| 호스팅 | Netlify (GitHub 자동 배포) |
| 데이터베이스 | Supabase (PostgreSQL) |
| 실시간 통신 | Supabase Realtime (멀티디바이스 채널) |
| GitHub | `kunbrostudio/playzera.dev` (main 브랜치) |
| Supabase URL | `https://ertftzicofegagiqtqjo.supabase.co` |

---

## 3. 프로젝트 폴더 구조

```
playzera.dev/
├── src/
│   ├── main.js                    # 앱 진입점 (라우터 초기화, BGM 시작)
│   ├── core/                      # 핵심 모듈
│   │   ├── router.js              # 해시 기반 SPA 라우터
│   │   ├── bgm.js                 # 배경음악 관리 싱글턴
│   │   ├── sound.js               # 효과음 관리
│   │   ├── channel.js             # Supabase Realtime 멀티디바이스 통신
│   │   ├── supabase.js            # Supabase 클라이언트 초기화
│   │   ├── gameResult.js          # 게임 결과 저장 / 조회
│   │   └── pose.js                # MediaPipe 포즈 엔진
│   ├── pages/                     # 라우트별 페이지 컴포넌트
│   │   ├── home.js                # 메인 홈 화면 (현재: poop-dodge 스플래시)
│   │   ├── game.js                # 게임 전체 플로우 관리
│   │   ├── camera.js              # 웹캠 전용 페이지 (레거시)
│   │   └── control.js             # 컨트롤러 전용 페이지 (레거시)
│   ├── games/                     # 게임 플러그인 디렉토리
│   │   ├── registry.js            # 게임 자동 등록 레지스트리
│   │   └── poop-dodge/
│   │       ├── manifest.json      # 게임 메타데이터
│   │       └── game.js            # 게임 로직 & 렌더링 클래스
│   └── ui/
│       └── styles/
│           └── global.css         # 전역 CSS (배경, 폰트, CSS 변수)
├── public/
│   └── assets/
│       ├── image/                 # 게임 이미지 에셋
│       └── audio/
│           └── Kingdom.mp3        # 앱 전체 BGM
├── supabase/
│   └── schema.sql                 # DB 스키마 (Supabase에 직접 실행)
├── index.html                     # 단일 HTML 진입점
├── vite.config.js                 # Vite 설정
├── netlify.toml                   # Netlify 배포 설정
└── package.json
```

---

## 4. 파일별 상세 설명

### `src/main.js` — 앱 진입점

앱이 시작될 때 가장 먼저 실행되는 파일.

- 라우터 모듈을 import해 해시 기반 라우팅 활성화
- BGM을 즉시 재생 시도 (브라우저 자동재생 차단 시 첫 인터랙션에서 자동 시작)

```js
import './core/router.js'
import { play as bgmPlay } from './core/bgm.js'
bgmPlay()
```

---

### `src/core/router.js` — SPA 라우터

해시 변화(`hashchange` 이벤트)를 감지해 알맞은 페이지 컴포넌트를 렌더링합니다.

**지원 라우트:**

| 해시 | 컴포넌트 | 설명 |
|------|----------|------|
| `/#/` | `home.js` | 메인 홈 (현재 poop-dodge 스플래시) |
| `/#/game?id=poop-dodge` | `game.js` | 게임 플로우 |
| `/#/game?id=poop-dodge&session=ABC-123` | `game.js` | 세션 직접 진입 |

**주요 export:**

- `navigate(path)` — 해시 변경으로 페이지 이동
- `reload()` — 같은 URL에서 강제 재렌더링 (해시가 동일할 때 hashchange가 미발생하는 문제 해결용)

> **[임시]** 향후 플레이 제라 메인 허브가 추가되면 `/#/` → 허브, `/#/game?id=...` → 개별 게임으로 분리 예정

---

### `src/core/bgm.js` — 배경음악 관리

앱 전체에서 단일 Audio 인스턴스를 공유하는 싱글턴 모듈.

**특징:**

- `loop: true`, 볼륨 `0.45`로 자동 반복 재생
- 브라우저 자동재생 차단 시 첫 `click` / `touchstart` / `keydown` 에서 자동 시작
- 음소거 시 `volume = 0`으로 처리 (오디오 컨텍스트를 유지해 즉시 복원 가능)
- 화면 이동 시에도 음악이 끊기지 않음 (앱 전체 공유)

**주요 export:**

```js
play()        // BGM 재생 시도 (이미 재생 중이면 무시)
stop()        // BGM 정지
toggleMute()  // 음소거 토글 → 현재 뮤트 상태(boolean) 반환
isMuted()     // 현재 음소거 여부
```

---

### `src/core/sound.js` — 효과음 관리

게임 내 효과음(피격, 회피 성공, 카운트다운 등)을 관리합니다.

**주요 export:**

```js
activate()    // AudioContext 활성화 (첫 터치 이벤트에서 호출 필요)
toggle()      // 효과음 전체 온/오프
isMuted()     // 현재 음소거 여부
playSuccess() // 회피 성공음
playHit()     // 피격음
playBeep()    // 카운트다운 삐 소리
playGo()      // GO! 소리
playRoundClear() // 라운드 클리어음
playGameClear()  // 게임 클리어음
playGameOver()   // 게임 오버음
```

---

### `src/core/channel.js` — 멀티디바이스 실시간 통신

Supabase Realtime을 이용해 모니터·컨트롤러·웹캠 간 메시지를 주고받습니다.

**메시지 타입 (`MSG`):**

| 메시지 | 발신 | 수신 | 의미 |
|--------|------|------|------|
| `GAME_START` | 컨트롤러 | 모니터 | 게임/라운드 시작 |
| `GAME_PAUSE` | 컨트롤러 | 모니터 | 일시정지 |
| `GAME_STOP` | 컨트롤러 | 모니터 | 강제 정지 |
| `GAME_EXIT` | 컨트롤러 | 전체 | 게임 종료 → 홈 복귀 |
| `ROUND_CHANGE` | 모니터 | 컨트롤러 | 라운드 번호 업데이트 |
| `POSE_UPDATE` | 웹캠 | 모니터 | 아이 위치(zone) 전달 |

**주요 export:**

```js
join(sessionId)           // 채널 입장
leave()                   // 채널 퇴장
send(type, payload)       // 메시지 전송
on(type, handler)         // 메시지 수신 핸들러 등록
trackPresence(data)       // Presence 데이터 등록 (role, ts)
onPresenceSync(handler)   // 접속자 수 변경 콜백
getPresenceCount()        // 현재 접속자 수
getPresenceByRole(role)   // 특정 역할 접속자 수
```

---

### `src/core/gameResult.js` — 게임 결과

Supabase에 게임 플레이 결과를 저장하고 조회합니다.

```js
save({ sessionId, gameId, playerName, score, roundsCleared, dodgeCount, hitCount })
getTodayResults(sessionId)  // 오늘 해당 세션의 전체 결과 조회
```

---

### `src/core/pose.js` — MediaPipe 포즈 엔진

MediaPipe Pose를 사용해 카메라 영상에서 사람의 좌/가운데/우 위치를 감지합니다.

- 엉덩이(Hip) 관절 좌표의 X값으로 3구역(zone 0/1/2) 판별
- 카메라 없을 경우 키보드(← / Space / →) 폴백 자동 지원

```js
poseEngine.init(videoElement, { onZoneChange, onPoseUpdate })
poseEngine.destroy()
poseEngine.isRunning   // 카메라 실행 중 여부
poseEngine.currentZone // 현재 zone (0=왼, 1=가운데, 2=오른)
```

---

### `src/pages/home.js` — 홈 화면

> **[임시]** 현재는 poop-dodge 전용 스플래시 화면. 향후 게임 허브로 교체 예정.

**구성 요소:**

- 캐릭터 + 타이틀 로고 + START 버튼 (이미지 로드 실패 시 CSS 버튼으로 자동 전환)
- 우상단 햄버거 메뉴 (`ico_menu.png`) → 드롭다운 패널
  - BGM 온/오프 (`btn_main_music.png` ↔ `btn_main_music_off.png`)
  - 효과음 온/오프 (`btn_main_audio.png` ↔ `btn_main_audio_off.png`)
- 반응형: 세로 모드 / 가로 모드 / 소형 화면 모두 대응
- START 버튼 터치 시 `sound.activate()` 호출 (AudioContext 활성화)

---

### `src/pages/game.js` — 게임 전체 플로우 관리

게임 진입부터 종료까지 전체 화면 흐름을 담당하는 핵심 파일 (2170줄).

**화면 흐름:**

```
gamePage()
 ├─ showModeSelection()     # 솔로 / 여러 대 선택
 │   ├─ [솔로]
 │   │   ├─ showOrientationCoach()  # 모바일 가로모드 안내
 │   │   ├─ _askPlayerName()        # 이름 입력
 │   │   └─ showSoloGame()          # 솔로 게임 실행
 │   └─ [여러 대]
 │       ├─ showSessionEntry()      # 세션 코드 입력 / 방 만들기
 │       ├─ showRoleSelection()     # 모니터 / 컨트롤러 / 웹캠 선택
 │       └─ [역할별]
 │           ├─ showMonitorView()   # TV 게임 화면
 │           ├─ showControllerView()# 선생님 컨트롤 패널
 │           └─ showWebcamView()    # 카메라 + 포즈 인식
 └─ _askPlayerName()        # 이름 입력 (공통 모달)
```

**솔로 게임 HUD:**

- 라운드 pip 인디케이터
- 타이머 (남은 시간, 3초 이하 적색 전환)
- 점수
- 하트 (목숨)
- 오디오 토글 버튼 (`btn_main_audio.png` 이미지)
- 메뉴 버튼 (`ico_menu.png` 이미지) → 일시정지 팝업

**일시정지 팝업 메뉴:**

- 계속하기 (초록)
- 다시 시작 (회색)
- 음악 켜짐/꺼짐 — BGM 토글
- 소리 켜짐/꺼짐 — 효과음 토글
- 게임 종료 (레드)

**뒤로가기 처리 — 동일 URL 재렌더링 문제 해결:**

```
// 같은 해시에서 뒤로가기 → hashchange 미발생 → reload()로 강제 재렌더링
const target = `/game?id=${gameId}&session=${sessionId}`
if (window.location.hash === '#' + target) reload()
else navigate(target)
```

**솔로 뒤로가기 — `__back__` 센티넬 패턴:**

```
while (true) {
  const result = await showSoloGame(app, gameId, entry)
  if (result === '__back__') continue  // 이름 입력 취소 → 모드 선택으로 복귀
  return
}
```

---

### `src/games/registry.js` — 게임 레지스트리

`games/` 폴더의 게임들을 자동으로 수집해 등록하는 모듈.

```js
export const GAME_REGISTRY = {
  'poop-dodge': {
    manifest: { id, title, emoji, description, thumbnail, minAge, maxAge, rounds },
    load: () => import('./poop-dodge/game.js')   // 동적 import
  }
}
```

> 새 게임 추가 시 이 파일에 항목 하나만 추가하면 전체 플로우에 자동 연결됩니다.

---

### `src/games/poop-dodge/manifest.json` — 게임 메타데이터

```json
{
  "id": "poop-dodge",
  "title": "똥 피하기",
  "emoji": "💩",
  "description": "하늘에서 떨어지는 똥을 피하세요!",
  "thumbnail": "/assets/image/poop_game_tit.png",
  "minAge": 4,
  "maxAge": 8,
  "rounds": 5
}
```

---

### `src/games/poop-dodge/game.js` — 게임 로직 & 렌더링

Canvas 2D 기반 게임 클래스. 라운드 관리, 물리, 렌더링, 오버레이 메시지를 모두 담당.

**게임 구조:**

```
PoopDodgeGame
 ├─ init()                 # 캔버스 초기화, 리사이즈 등록
 ├─ startRound(n)          # 라운드 시작 (배너 → 카운트다운 → 루프)
 ├─ update(dt)             # 물리 업데이트 (똥 이동, 충돌, 점수)
 ├─ render()               # 매 프레임 전체 렌더링
 │   ├─ _drawZones()       # 존 배경 + 경고 + 에너지 라인
 │   ├─ _drawPoops()       # 똥 오브젝트 (회전 + 흔들림)
 │   ├─ _drawMarkers()     # 하단 방향 버튼 이미지
 │   └─ _renderParticles() # 파티클 이펙트
 ├─ setPlayerZone(zone)    # 외부에서 플레이어 위치 설정 (포즈 / 키보드)
 ├─ pause() / resume()
 └─ destroy()              # RAF 취소, 이벤트 해제
```

**존별 에너지 라인 (최종 구현):**

- 포인트 그린 `rgb(90, 255, 145)` 단일 색상으로 통합
- 존 좌우 경계에 그라디언트 글로우 (안쪽으로 페이드)
- 1.1초 주기 에너지 펄스: 위→아래로 이동하는 흰색 빛 (트레일 포함)
- 실선 `strokeStyle` + `shadowBlur: 28` 네온 글로우 + 흰색 코어 라인 (`shadowBlur: 8`)

**라운드 설정:**

| 라운드 | 시간 | 낙하 속도 | 스폰 주기 |
|--------|------|-----------|-----------|
| 1 | 12초 | 180px/s | 3000ms |
| 2 | 11초 | 260px/s | 2400ms |
| 3 | 10초 | 340px/s | 2000ms |
| 4 | 10초 | 420px/s | 1600ms |
| 5 | 10초 | 500px/s | 1200ms |

**판정 메시지:**

| 상황 | 메시지 | 스타일 |
|------|--------|--------|
| 회피 성공 | ✅ 피했어요! | 흰 필 + 초록 테두리 |
| 2콤보 이상 | 🔥 N COMBO! +N | 주황 |
| 피격 | 💥 맞았어요! | 흰 필 + 빨강 테두리 |

---

### `src/ui/styles/global.css` — 전역 스타일

- body 배경: `poop_game_bg.jpg` (화면 전환 시 깜빡임 방지)
- CSS 변수: `--color-bg`, `--color-accent`, `--font-main` 등
- 기본 리셋 및 전체화면 레이아웃

---

## 5. 구현된 기능 목록

### 라우팅 & 네비게이션

- [x] 해시 기반 SPA 라우터 (`router.js`)
- [x] `navigate()` / `reload()` 구분 (동일 URL 재진입 처리)
- [x] 솔로 뒤로가기 `__back__` 센티넬 + while 루프 패턴
- [x] 모니터 대기화면 뒤로가기 (`reload()` 강제 재렌더링)

### 홈 화면

- [x] 캔디랜드 배경 + 캐릭터 + 타이틀 로고 + START 버튼
- [x] 이미지 로드 실패 시 CSS 버튼 자동 대체
- [x] 우상단 햄버거 메뉴 (BGM / 효과음 온오프)
- [x] 반응형 레이아웃 (세로/가로 모드, 소형 스마트폰)

### BGM & 효과음

- [x] 앱 시작 즉시 BGM 재생 (`Kingdom.mp3`)
- [x] 브라우저 자동재생 차단 → 첫 인터랙션 시 자동 재생 (fallback)
- [x] 화면 이동 시에도 BGM 연속 재생 (싱글턴)
- [x] BGM / 효과음 독립 토글 (홈 메뉴 + 게임 일시정지 메뉴)
- [x] 게임 내 다양한 효과음 (회피, 피격, 카운트다운, 클리어, 오버)

### 게임 플로우

- [x] 솔로 모드 (1대 플레이) 전체 플로우
- [x] 여러 대 모드 (세션 코드 기반 멀티디바이스) 전체 플로우
- [x] 세션 코드 직접 URL 입력으로 바로 진입 가능
- [x] 모바일 가로 모드 안내 화면 (세로일 때 표시)
- [x] 아이 이름 입력 모달
- [x] 역할 선택 (모니터 / 컨트롤러 / 웹캠)
- [x] 게임 오버 / 게임 클리어 결과 화면
- [x] 결과 Supabase 저장
- [x] 컨트롤러의 오늘 기록 보기

### 게임 플레이

- [x] 5라운드 구성, 라운드별 난이도 상승
- [x] 3구역 존 시스템 (좌/가운데/우)
- [x] MediaPipe 포즈 인식으로 실제 몸 위치 감지
- [x] 키보드 폴백 (← / Space / →)
- [x] 실시간 Supabase Realtime 멀티 디바이스 동기화
- [x] 웹캠 디바이스의 포즈 데이터 모니터로 전송
- [x] 파티클 이펙트 (회피 성공 / 피격 / 라운드 클리어)
- [x] 콤보 시스템 (2콤보 이상 보너스 점수)
- [x] 화면 흔들림 (피격 시 shake 이펙트)
- [x] 포인트 그린 에너지 라인 (플레이어 위치 시각화)

### UI / UX

- [x] 캔디랜드 테마 디자인 (둥근 카드, 보라 계열 컬러 팔레트)
- [x] 화면 전환 시 배경 깜빡임 없음 (body background 고정)
- [x] 게임 오버레이 메시지 (흰 필 + 컬러 테두리 pill 스타일)
- [x] 게임 HUD 아이콘 버튼 (이미지 기반, 배경 없음)
- [x] 일시정지 메뉴 팝업 (계속하기 / 다시 시작 / BGM / 효과음 / 종료)
- [x] 모든 카드 화면 반응형 (landscape 저해상도 스크롤 지원)
- [x] PIP 카메라 미리보기 (소형 뷰)
- [x] 전체화면 버튼 (모니터 모드)

---

## 6. 핵심 기술 결정 사항

### 동일 URL 재진입 문제

해시 SPA에서 `navigate('/game?id=poop-dodge')`를 이미 그 해시에 있을 때 호출하면 `hashchange` 이벤트가 발생하지 않아 화면이 재렌더링되지 않습니다.

**해결:**

```js
// router.js
export function reload() { render() }  // 강제 재렌더링

// 사용처
if (window.location.hash === '#' + target) reload()
else navigate(target)
```

### BGM 브라우저 자동재생 차단 대응

대부분의 브라우저는 사용자 인터랙션 없이 오디오 재생을 차단합니다.

**해결:**

```js
try {
  await audio.play()
} catch (_) {
  // 첫 인터랙션(클릭/터치/키)에서 재생
  document.addEventListener('click', resume, { once: true })
  document.addEventListener('touchstart', resume, { once: true })
  document.addEventListener('keydown', resume, { once: true })
}
```

### 음소거 구현 방식

`audio.pause()` 대신 `audio.volume = 0`을 사용합니다. 이유: 오디오 컨텍스트를 유지해 음소거 해제 시 즉시 소리가 복원됩니다. `pause()`는 다시 `play()`를 비동기 호출해야 하며 오토플레이 정책에 다시 걸릴 수 있습니다.

### 반응형 카드 화면 패턴

모든 카드 화면(모드 선택, 이름 입력 등)에서 공통으로 사용하는 가로 모드 대응 패턴:

```css
/* 높이가 좁을 때 (가로 모드 모바일) */
@media (max-height: 560px) {
  #root { overflow-y: auto; align-items: flex-start; }
  #outer {
    width: 100%; min-height: 100vh;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 16px 0;
  }
}
```

콘텐츠가 화면에 들어오면 중앙 정렬, 넘치면 스크롤.

---

## 7. 게임 추가 방법 (플러그인 구조)

새 게임을 추가하는 과정:

### Step 1. 게임 폴더 생성

```
src/games/새게임이름/
├── manifest.json
└── game.js
```

### Step 2. manifest.json 작성

```json
{
  "id": "새게임이름",
  "title": "게임 제목",
  "emoji": "🎮",
  "description": "게임 설명",
  "thumbnail": "/assets/image/게임_썸네일.png",
  "minAge": 4,
  "maxAge": 8,
  "rounds": 5
}
```

### Step 3. game.js 클래스 구현

```js
export default class NewGame {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.onRoundEnd    = options.onRoundEnd    ?? (() => {})
    this.onGameEnd     = options.onGameEnd     ?? (() => {})
    this.onScoreUpdate = options.onScoreUpdate ?? (() => {})
    this.onLifeUpdate  = options.onLifeUpdate  ?? (() => {})
  }
  init()              { /* 초기화 */ }
  startRound(n)       { /* 라운드 시작 */ }
  setPlayerZone(zone) { /* 0=왼, 1=가운데, 2=오른 */ }
  pause()  { }
  resume() { }
  destroy(){ }
}
```

### Step 4. registry.js에 등록

```js
import newManifest from './새게임이름/manifest.json'
export const GAME_REGISTRY = {
  'poop-dodge': { ... },
  '새게임이름': {
    manifest: newManifest,
    load: () => import('./새게임이름/game.js')
  }
}
```

---

## 8. 알려진 임시 처리 사항

| 항목 | 현재 상태 | 향후 계획 |
|------|-----------|-----------|
| `home.js` | poop-dodge 전용 스플래시 화면 | 플레이 제라 메인 허브로 교체 |
| 게임 선택 | poop-dodge 하드코딩 (`GAME_ID = 'poop-dodge'`) | 허브에서 registry 기반 동적 선택 |
| `pages/camera.js` | 레거시 파일 (현재 미사용) | 웹캠 역할이 game.js 내부로 통합됨 |
| `pages/control.js` | 레거시 파일 (현재 미사용) | 컨트롤러 역할이 game.js 내부로 통합됨 |
| `btn_main_ranking.png` | 에셋만 준비됨 | 메뉴에 랭킹 기능 추가 시 사용 |
| `btn_main_screen.png` | 에셋만 준비됨 | 전체화면 메뉴 버튼으로 활용 예정 |
| `btn_main_winner.png` | 에셋만 준비됨 | 우승자 발표 화면 추가 시 사용 |

---

*playzera.dev — 아이들이 몸으로 즐기는 체육 수업 게임 플랫폼*

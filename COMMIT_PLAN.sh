#!/usr/bin/env bash
# 커밋 계획 — 한 번에 하나씩 확인하며 실행하세요.
#
# 지금 main에 46개 변경이 쌓여 있습니다(새 파일 31개). 한 커밋으로 뭉치면
# 나중에 "언제 뭐가 들어왔나"를 되짚을 수 없어 다섯 덩어리로 나눴습니다.
set -e
cd "$(dirname "$0")"

# 1. 성장 시스템 — 레벨·배지·버디·프로필과 화면들
git add src/progress/ src/buddies/ src/profiles/ \
        src/pages/start.js src/pages/buddy.js src/pages/me.js \
        public/assets/badges public/assets/buddies public/assets/profiles \
        "docs/05_playzera_캐릭터성장_기획.md" "docs/06_playzera_화면설계_성장.md" \
        test/progress.test.js test/report.test.js
git commit -m "STEP 10 성장 시스템 — 레벨·배지·버디 + /start·/buddy·/me

- progress/: 운동량 → EXP → 레벨, 배지 조건 네 종류, localStorage 한 곳
- 기록을 전체·날짜별·게임별 세 축으로 나눠 저장 (역산이 불가능해서)
- 부모 화면은 목표 대비로만 보여준다. 누적 자랑은 아이를 지치게 한다
- 그림 파일 이름을 id에서 계산하지 않는다 — registry가 데이터로 들고 간다"

# 2. 운동 체계 — 사전·감지기·검증 화면
git add src/core/pose/detectors/ src/core/pose/poseMatch.js src/core/pose/poses.js \
        src/games/warmup-obstacle/input/poseMatcher.js \
        src/pages/lab.js src/core/router.js \
        "docs/07_playzera_운동체계.md" \
        test/detectors.test.js test/yogaPoses.test.js test/poseMatcher.test.js
git commit -m "STEP 11 운동 체계 — 유산소·균형 감지기 + 요가 자세 사전

- 세던 넷이 전부 '제자리 몸통·다리'라 유산소와 균형이 통째로 비어 있었다
- 감지기는 시간을 밖에서 받는다 → 카메라 없이 합성 프레임으로 검증
- visibility 낮은 프레임은 버린다. MediaPipe는 화면 밖 관절을 지어낸다
- 자세 채점기를 core로 올리고 요가 7자세를 데이터로 (혼동 표로 검증)
- #/lab — 웹캠으로 실제로 세는지 눈으로 보는 개발용 화면"

# 3. 새 게임 둘
git add src/games/fire-rescue/ src/games/stone-bridge/ \
        public/assets/games/ src/games/registry.js \
        src/games/poop-dodge/manifest.json src/games/warmup-obstacle/manifest.json \
        test/fireRescue.test.js test/stoneBridge.test.js test/gamePack.test.js
git commit -m "게임 둘 추가 — 불 끄기 소방관(유산소) · 돌다리 건너기(균형)

- 멈추면 불이 다시 커진다. 그게 유산소의 정의다
- 실패가 없다. 시간이 다 되면 다음으로 넘어간다 — 4~8세에 '졌다'는 다음을 막는다
- 라운드 사이 숨 고르기 (docs/07 안전 규칙)
- 키보드 모드는 기록에 남기지 않는다. 두드린 건 운동이 아니다
- manifest.metrics를 운동 사전 키로 맞춤 (웜업이 카멜, 똥피하기가 점수였다)"

# 4. 공용 게임 셸
git add src/core/gameShell.js
git commit -m "STEP 5-1·5-2 공용 게임 셸 — 안내·카메라·결과·기록을 한 벌로

게임이 넷이 되자 껍데기가 네 벌이 됐다. 결과 화면 문구 하나를 고치는 데
네 파일을 고쳐야 했고, 한 군데를 빠뜨리면 게임마다 다른 화면이 된다.
core = 모든 게임이 똑같이 하는 것 / 게임팩 = 규칙과 그리기"

# 5. 서버 저장 구멍 막기
git add src/core/resultQueue.js src/core/gameShell.js src/main.js test/resultQueue.test.js
git commit -m "새 게임의 기록이 서버로 안 가던 것 — 셸이 대신 보낸다

불 끄기·돌다리는 localStorage에만 쌓이고 Supabase에는 한 건도 없었다.
저장이 게임팩마다 손으로 붙어 있었기 때문이다(똥 피하기·웜업만 붙였다).
셸이 부르게 하면 앞으로 만드는 게임은 그냥 따라온다.

- 실패하면 큐에 넣고 다음 접속 때 다시 보낸다 (거실 와이파이는 끊긴다)
- 키보드 판도 서버에는 보낸다. input_mode로 갈리고 뷰가 motion만 거른다
  안 보내면 그 판은 세상에 없던 일이 된다"

# 6. 에셋 다이어트
git add -A public/assets _unused
git commit -m "에셋 87MB → 47MB (미사용 25MB는 _unused로 옮김, 삭제 아님)

- 아무도 안 쓰는 파일 30개 — mat_sidewalk_* 넷만 17MB였다
- audio/Kingdom.mp4 2.8MB — 실제 BGM은 audio/common/Kingdom.mp3다
- 스프라이트 최대 1000px, 배경 1600px으로 맞춤. 화면에서 210px로 그려지는
  캐릭터가 1086x1448이었다
- 확인: 웜업 이미지 60장 전부 로드, 똥 피하기 인트로 이미지 6장 전부 로드"

# 7. 나머지 (허브 버디 자리 · BGM 누수 수정 · 문서)
git add -A
git commit -m "허브 버디 자리 + BGM 누수 수정 + 문서 갱신

- BGM을 켜는 곳은 둘, 끄는 곳은 하나여서 허브에서 음악이 계속 났다
  → main.js의 자동 재생을 지우고 라우터가 경로로 판단한다
- 버디 자리를 포스터 옆으로 (전체 보기 버튼 위 35px = 머무르기 지뢰)"

echo
echo "완료. 확인 후 push 하세요:  git push origin main"

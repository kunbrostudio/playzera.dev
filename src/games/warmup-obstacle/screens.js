// DOM 오버레이 화면들 — 타이틀/카메라 셋업/튜토리얼/카운트다운/배너/리포트
import { CONFIG } from './config.js';
import { playSfx, playGameOverJingle } from './audio.js';
import { isArmsUpCircle, isArmsUpCross, GestureHold } from './input/gestureRecognizer.js';
import { isFullBodyVisible } from './input/poseEngine.js';

const overlay = () => document.getElementById('overlay');
const stage = () => document.getElementById('stage');

function clear() { overlay().innerHTML = ''; }

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}

// quitCheck(): 종료 확정 여부를 폴링 — 카메라 준비/튜토리얼처럼 자체 대기 루프가 있는
// 화면에서 "게임 종료" 확정 시 화면이 멈추지 않고 즉시 정리되도록 함
function armQuitPoll(quitCheck, onQuit) {
  if (!quitCheck) return null;
  return setInterval(() => { if (quitCheck()) onQuit(); }, 150);
}

// ── 타이틀 ──
// 세로(포트레이트) 화면에서는 세로 전용 타이틀 이미지로, 전체 뷰포트를 꽉 채워 표시.
// 가로(모바일 가로 포함)에서는 기존 가로 메인 이미지를 그대로 사용.
export function showTitle() {
  return new Promise(resolve => {
    clear();
    document.body.classList.add('on-title'); // 타이틀 동안만 #stage가 세로 전체화면으로 확장(포트레이트 한정)
    const s = el(`
      <div class="screen title-bg">
        <div class="title-start-wrap">
          <img class="start-img-btn" id="btn-start" src="/assets/warmup/image/fx_start_button_1.png" alt="START">
        </div>
      </div>`);
    overlay().appendChild(s);
    s.querySelector('#btn-start').onclick = () => {
      playSfx('button_press');
      document.body.classList.remove('on-title');
      clear();
      resolve();
    };
  });
}

// ── 카메라 셋업 + 캘리브레이션 ──
// poseInit: () => Promise (웹캠+모델 준비), calibrate: (onDone) => void
// quitCheck: () => boolean — 게임 종료가 확정되면 즉시 이 화면을 정리하고 resolve
// pipEl: 실제 웹캠 미리보기(#pip) DOM 엘리먼트 — 준비되면 이 화면의 레이아웃 흐름 안(.pip-slot)으로
//        잠깐 옮겨서 어두운 필터에 가리지 않고, 버튼과도 겹치지 않게 크게 보여준다
// getLandmarks: () => 최신 랜드마크 — 있으면 버튼 클릭 대신 "머리 위로 동그라미(O) 3초 유지"
//        손동작으로도 캘리브레이션을 시작할 수 있게 함
export function showCameraSetup({ poseInit, startCalibration, isCalibrated, quitCheck, pipEl, getLandmarks }) {
  return new Promise(resolve => {
    clear();
    const s = el(`
      <div class="screen dark cam-setup">
        <h1>카메라 준비</h1>
        <!-- 가로가 짧은 모바일 가로모드에서는 .cam-body를 좌우 배치로 바꿔서(미디어쿼리)
             영상+텍스트/버튼이 화면 높이 안에 다 들어오게 함(세로모드/데스크톱은 기존처럼 세로 배치) -->
        <div class="cam-body">
          <div class="pip-slot" id="pip-slot"></div>
          <div class="cam-controls">
            <p id="cam-status" class="cam-status">웹캠과 모션 인식을 준비하고 있어요…</p>
            <div style="margin-top:.6%">
              <button class="btn hidden" id="btn-calib">준비 완료! 차렷 자세로 측정</button>
            </div>
            <div class="gesture-hint hidden" id="gesture-hint">
              ✋ 양손을 머리 위로 모아 <b>동그라미</b>를 3초 유지하면 시작돼요
              <div class="gesture-gauge"><div class="gesture-gauge-fill" id="gesture-gauge-fill"></div></div>
            </div>
            <div style="margin-top:1%">
              <button class="btn secondary" id="btn-skip">카메라 없이 키보드로 플레이</button>
            </div>
          </div>
        </div>
      </div>`);
    overlay().appendChild(s);
    const status = s.querySelector('#cam-status');
    const btnCalib = s.querySelector('#btn-calib');
    const pipSlot = s.querySelector('#pip-slot');
    const gestureHint = s.querySelector('#gesture-hint');
    const gaugeFill = s.querySelector('#gesture-gauge-fill');

    let settled = false;
    let calibIv = null;
    let gestureRaf = null;
    let bodyRaf = null;
    let bodyOk = !getLandmarks; // 손동작 인식이 없으면 전신 체크 자체가 불가능하니 그냥 통과시킴
    const stopGestureLoop = () => { if (gestureRaf) cancelAnimationFrame(gestureRaf); gestureRaf = null; };
    const stopBodyLoop = () => { if (bodyRaf) cancelAnimationFrame(bodyRaf); bodyRaf = null; };

    const finish = result => {
      if (settled) return;
      settled = true;
      clearInterval(calibIv);
      clearInterval(quitIv);
      stopGestureLoop();
      stopBodyLoop();
      // overlay를 비우기 전에 #pip를 원래 자리(#stage)로 반드시 되돌려 놓아야 함 —
      // 안 그러면 clear()의 innerHTML='' 에 딸려서 웹캠 video/canvas가 통째로 사라진다.
      if (pipEl && pipEl.parentElement === pipSlot) {
        pipEl.classList.remove('docked', 'body-ok', 'body-missing');
        stage()?.appendChild(pipEl);
      }
      clear();
      resolve(result);
    };
    const quitIv = armQuitPoll(quitCheck, () => finish({ mode: 'quit' }));

    s.querySelector('#btn-skip').onclick = () => { playSfx('button_press'); finish({ mode: 'keyboard' }); };

    const startCalib = () => {
      if (!bodyOk) return;
      playSfx('button_press');
      if (btnCalib) btnCalib.disabled = true;
      stopGestureLoop();
      stopBodyLoop();
      gestureHint.classList.add('hidden');
      // 측정 단계로 넘어가면 위치 안내(흔들림/초록 강조)는 더 이상 필요 없으므로 정리
      status.classList.remove('warn', 'ok');
      pipSlot?.classList.remove('body-ok', 'body-missing');
      status.textContent = '차렷 자세로 잠깐 서 있어 주세요… 측정 중';
      startCalibration();
      calibIv = setInterval(() => {
        if (isCalibrated()) {
          clearInterval(calibIv);
          status.textContent = '측정 완료!';
          playSfx('go');
          setTimeout(() => finish({ mode: 'motion' }), 700);
        }
      }, 200);
    };

    poseInit()
      .then(() => {
        if (settled) return;
        if (pipEl && pipSlot) { pipSlot.appendChild(pipEl); pipEl.classList.add('docked'); }

        if (getLandmarks) {
          // O(동그라미) 손동작만으로 시작 — 버튼은 필요 없음. 전신이 화면에 다 들어와 있는지
          // 계속 체크해서 안 보이면 빨강(도는 빛무리), 다 보이면 초록(퍼지는 파동)으로 바꿔
          // 위치를 안내하고, 전신이 보여야만(bodyOk) 동그라미 유지가 캘리브레이션으로 이어진다.
          const applyBodyState = ok => {
            bodyOk = ok;
            // 상태 클래스는 PIP(테두리 색)와 슬롯(도는 링/퍼지는 파동) 양쪽에 모두 적용
            for (const elm of [pipEl, pipSlot]) {
              elm.classList.toggle('body-ok', ok);
              elm.classList.toggle('body-missing', !ok);
            }
            status.classList.toggle('ok', ok);
            status.classList.toggle('warn', !ok);
            status.textContent = ok
              ? '✅ 좋아요! 준비 완료 — 이제 시작할 수 있어요'
              : '⬅ 전신(머리~발)이 보이도록 뒤로 물러나 주세요 ➡';
            if (ok) playSfx('hint_pop'); // 준비됐다는 걸 소리로도 알려줌
          };
          applyBodyState(false);

          // 경계선에서 인식이 미세하게 떨릴 때 빨강↔초록이 깜빡이며 소리까지 반복되지 않도록,
          // 바뀐 상태가 이 시간만큼 유지될 때만 실제로 전환한다.
          const BODY_STATE_SETTLE_SEC = 0.3;
          let settleT = 0;
          let lastBodyT = performance.now();
          const bodyLoop = () => {
            const now = performance.now();
            const dt = (now - lastBodyT) / 1000; lastBodyT = now;
            const ok = isFullBodyVisible(getLandmarks());
            if (ok === bodyOk) settleT = 0;
            else {
              settleT += dt;
              if (settleT >= BODY_STATE_SETTLE_SEC) { settleT = 0; applyBodyState(ok); }
            }
            bodyRaf = requestAnimationFrame(bodyLoop);
          };
          bodyRaf = requestAnimationFrame(bodyLoop);

          gestureHint.classList.remove('hidden');
          const hold = new GestureHold(lms => isFullBodyVisible(lms) && isArmsUpCircle(lms, CONFIG.gesture), CONFIG.gesture.startHoldSec);
          let last = performance.now();
          const loop = () => {
            const now = performance.now();
            const dt = (now - last) / 1000; last = now;
            const done = hold.update(dt, getLandmarks());
            gaugeFill.style.width = `${hold.progress * 100}%`;
            if (done) { startCalib(); return; }
            gestureRaf = requestAnimationFrame(loop);
          };
          gestureRaf = requestAnimationFrame(loop);
        } else {
          // 손동작 인식을 쓸 수 없는 경우(예외적 상황)를 위한 대체 수단 — 버튼으로 진행
          status.textContent = '웹캠 인식 성공! 전신이 보이면 버튼을 눌러 주세요.';
          btnCalib.classList.remove('hidden');
          btnCalib.onclick = startCalib;
        }
      })
      .catch(err => {
        console.warn('camera init failed:', err);
        if (!settled) status.textContent = '카메라를 사용할 수 없어요. 키보드 모드로 플레이할 수 있어요.';
      });
  });
}

// ── 튜토리얼 1: 회피/점프/숙이기 ──
// waitAction(name): 해당 동작 1회 감지 시 resolve하는 Promise 생성 함수
// quitCheck: () => boolean — 게임 종료가 확정되면 즉시 이 화면을 정리하고 resolve
// getLandmarks: () => 최신 랜드마크 — 있으면 O(머리 위 동그라미)=건너뛰기, X(엑스)=이전 화면으로
// resolve값: 'next'(정상 진행/건너뛰기) | 'back'(이전 화면으로)
export function showTutorial1(waitAction, quitCheck, getLandmarks) {
  return new Promise(resolve => {
    clear();
    const s = el(`
      <div class="screen dark">
        <h1>TUTORIAL</h1>
        <h2>몸을 움직여 보세요!</h2>
        <div class="tut-row">
          <div class="tut-card" id="tc-dodge">
            <img src="/assets/warmup/image/obs_cube_star_center.png" alt="">
            <div class="key">◀ 옆으로 피하기 ▶</div>
            <div class="desc">몸을 왼쪽/오른쪽으로 움직여요</div>
            <div class="check"></div>
          </div>
          <div class="tut-card" id="tc-jump">
            <img src="/assets/warmup/image/obs_hurdle_low.png" alt="">
            <div class="key">▲ 점프</div>
            <div class="desc">제자리에서 폴짝 뛰어요</div>
            <div class="check"></div>
          </div>
          <div class="tut-card" id="tc-duck">
            <img src="/assets/warmup/image/obs_hurdle_wide.png" alt="">
            <div class="key">▼ 앉기</div>
            <div class="desc">무릎을 굽혀 웅크려요</div>
            <div class="check"></div>
          </div>
        </div>
        <button class="btn secondary" id="btn-tut-skip">건너뛰기</button>
        <div class="gesture-hint hidden" id="tut1-gesture-hint">
          ✋ 머리 위 <b>동그라미(O)</b>=건너뛰기 · 팔로 <b>엑스(X)</b>=이전 화면
          <div class="gesture-gauge"><div class="gesture-gauge-fill" id="tut1-gauge-fill"></div></div>
        </div>
      </div>`);
    overlay().appendChild(s);

    let settled = false;
    let gestureRaf = null;
    const stopGestureLoop = () => { if (gestureRaf) cancelAnimationFrame(gestureRaf); gestureRaf = null; };
    const finish = (result = 'next') => {
      if (settled) return;
      settled = true;
      clearInterval(quitIv);
      stopGestureLoop();
      clear();
      resolve(result);
    };
    const quitIv = armQuitPoll(quitCheck, () => finish('next'));

    let remaining = 3;
    const done = id => {
      const card = s.querySelector(id);
      if (card.classList.contains('done')) return;
      card.classList.add('done');
      card.querySelector('.check').textContent = 'OK!';
      playSfx('dodge');
      if (--remaining === 0) setTimeout(() => finish('next'), 800);
    };
    waitAction('dodge', () => done('#tc-dodge'));
    waitAction('jump', () => done('#tc-jump'));
    waitAction('duck', () => done('#tc-duck'));
    s.querySelector('#btn-tut-skip').onclick = () => { playSfx('button_press'); finish('next'); };

    if (getLandmarks) {
      const hint = s.querySelector('#tut1-gesture-hint');
      const gaugeFill = s.querySelector('#tut1-gauge-fill');
      hint.classList.remove('hidden');
      const oHold = new GestureHold(lms => isArmsUpCircle(lms, CONFIG.gesture), CONFIG.gesture.tutorialHoldSec);
      const xHold = new GestureHold(lms => isArmsUpCross(lms, CONFIG.gesture), CONFIG.gesture.tutorialHoldSec);
      let last = performance.now();
      const loop = () => {
        const now = performance.now();
        const dt = (now - last) / 1000; last = now;
        const lms = getLandmarks();
        const oDone = oHold.update(dt, lms);
        const xDone = xHold.update(dt, lms);
        gaugeFill.style.width = `${Math.max(oHold.progress, xHold.progress) * 100}%`;
        if (oDone) { playSfx('button_press'); finish('next'); return; }
        if (xDone) { playSfx('button_press'); finish('back'); return; }
        gestureRaf = requestAnimationFrame(loop);
      };
      gestureRaf = requestAnimationFrame(loop);
    }
  });
}

// ── 튜토리얼 2: 포즈 따라하기 ──
// getPoseScore(pose): 현재 유사도 0~1
// quitCheck: () => boolean — 게임 종료가 확정되면 즉시 이 화면을 정리하고 resolve
// isKeyboard: 키보드 모드일 때만 A/S/D 안내 표시
// getLandmarks: () => 최신 랜드마크 — 있으면 O(머리 위 동그라미)=건너뛰기, X(엑스)=이전 화면으로
// resolve값: 'next'(정상 진행/건너뛰기) | 'back'(이전 화면으로)
export function showTutorial2(getPoseScore, quitCheck, isKeyboard, getLandmarks) {
  return new Promise(resolve => {
    clear();
    const poses = [
      { key: 'lunge', img: 'obs_sign_stretch_lunge', sil: 'pose01', label: '런지', keyLabel: 'A' },
      { key: 'forwardbend', img: 'obs_sign_stretch_forwardbend', sil: 'pose02', label: '상체 숙이기', keyLabel: 'S' },
      { key: 'armsopen', img: 'obs_sign_stretch_armsopen', sil: 'pose03', label: '팔 벌리기', keyLabel: 'D' },
    ];
    const s = el(`
      <div class="screen dark">
        <h1>TUTORIAL</h1>
        <h2>COPY THE POSE — 사인판의 자세를 따라해요</h2>
        ${isKeyboard ? `<p class="kbd-hint">⌨️ 키보드 모드: <b>A</b> · <b>S</b> · <b>D</b> 키를 누르고 있으면 해당 자세를 취한 걸로 인식돼요</p>` : ''}
        <div class="tut-row">
          ${poses.map(p => `
            <div class="tut-card" id="tp-${p.key}">
              <img src="/assets/warmup/image/${p.img}.png" alt="">
              <div class="key">${p.label}${isKeyboard ? ` (${p.keyLabel})` : ''}</div>
              <div class="desc">1초 유지하면 성공!</div>
              <div class="check"></div>
            </div>`).join('')}
        </div>
        <button class="btn secondary" id="btn-tut2-skip">건너뛰기</button>
        <div class="gesture-hint hidden" id="tut2-gesture-hint">
          ✋ 머리 위 <b>동그라미(O)</b>=건너뛰기 · 팔로 <b>엑스(X)</b>=이전 화면
          <div class="gesture-gauge"><div class="gesture-gauge-fill" id="tut2-gauge-fill"></div></div>
        </div>
      </div>`);
    overlay().appendChild(s);

    let settled = false;
    const finish = (result = 'next') => {
      if (settled) return;
      settled = true;
      cancelAnimationFrame(raf);
      clearInterval(quitIv);
      clear();
      resolve(result);
    };
    const quitIv = armQuitPoll(quitCheck, () => finish('next'));

    const held = { lunge: 0, forwardbend: 0, armsopen: 0 };
    const doneSet = new Set();

    const oHold = getLandmarks ? new GestureHold(lms => isArmsUpCircle(lms, CONFIG.gesture), CONFIG.gesture.tutorialHoldSec) : null;
    const xHold = getLandmarks ? new GestureHold(lms => isArmsUpCross(lms, CONFIG.gesture), CONFIG.gesture.tutorialHoldSec) : null;
    const gestureHint = s.querySelector('#tut2-gesture-hint');
    const gaugeFill = s.querySelector('#tut2-gauge-fill');
    if (getLandmarks) gestureHint.classList.remove('hidden');

    let last = performance.now();
    let raf;
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000; last = now;
      for (const p of poses) {
        if (doneSet.has(p.key)) continue;
        const score = getPoseScore(p.key);
        held[p.key] = score >= CONFIG.pose.matchThreshold ? held[p.key] + dt : 0;
        if (held[p.key] >= 1.0) {
          doneSet.add(p.key);
          const card = s.querySelector(`#tp-${p.key}`);
          card.classList.add('done');
          card.querySelector('.check').textContent = 'OK!';
          playSfx('dodge');
        }
      }
      if (doneSet.size === poses.length) {
        setTimeout(() => finish('next'), 800);
        return;
      }

      if (getLandmarks) {
        const lms = getLandmarks();
        const oDone = oHold.update(dt, lms);
        const xDone = xHold.update(dt, lms);
        gaugeFill.style.width = `${Math.max(oHold.progress, xHold.progress) * 100}%`;
        if (oDone) { playSfx('button_press'); finish('next'); return; }
        if (xDone) { playSfx('button_press'); finish('back'); return; }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    s.querySelector('#btn-tut2-skip').onclick = () => { playSfx('button_press'); finish('next'); };
  });
}

// ── 카운트다운 3-2-1-START ──
export function showCountdown() {
  return new Promise(resolve => {
    clear();
    const s = el(`<div class="screen"><img id="cd-img" style="height:40%" src="/assets/warmup/image/fx_count_3.png"></div>`);
    overlay().appendChild(s);
    const img = s.querySelector('#cd-img');
    const seq = [
      ['/assets/warmup/image/fx_count_3.png', 'countdown_beep'],
      ['/assets/warmup/image/fx_count_2.png', 'countdown_beep'],
      ['/assets/warmup/image/fx_count_1.png', 'countdown_beep'],
      ['/assets/warmup/image/fx_start_word.png', 'go'],
    ];
    let i = 0;
    const step = () => {
      if (i >= seq.length) { clear(); resolve(); return; }
      img.src = seq[i][0];
      playSfx(seq[i][1]);
      i++;
      setTimeout(step, i === seq.length ? 800 : 1000);
    };
    step();
  });
}

// ── 레벨 완료 배너 ──
export function showLevelBanner(levelNum) {
  return new Promise(resolve => {
    clear();
    playSfx('level_complete');
    const s = el(`<div class="screen"><img style="height:34%" src="/assets/warmup/image/fx_level_complete_${levelNum}.png"></div>`);
    overlay().appendChild(s);
    setTimeout(() => { clear(); resolve(); }, 1400);
  });
}

// ── 게임 오버 (목숨 소진) ──
// resolve값: 'retry'(바로 다시 도전 — 타이틀 생략) | 'quit'(타이틀로)
// getLandmarks: () => 최신 랜드마크 — 있으면 "머리 위로 엑스(X)" 손동작으로도 종료하기 가능
export function showGameOver(getLandmarks) {
  return new Promise(resolve => {
    clear();
    playGameOverJingle();
    const s = el(`
      <div class="screen dark">
        <h1>GAME OVER</h1>
        <p style="margin-bottom:3%">목숨을 모두 사용했어요! 다시 도전해볼까요?</p>
        <div style="display:flex; gap:20px;">
          <button class="btn" id="btn-go-retry">다시 하기</button>
          <button class="btn secondary" id="btn-go-quit">종료하기</button>
        </div>
        <div class="gesture-hint hidden" id="go-gesture-hint">
          ✋ 팔로 <b>엑스(X)</b>를 만들어 유지하면 종료돼요
          <div class="gesture-gauge"><div class="gesture-gauge-fill" id="go-gauge-fill"></div></div>
        </div>
      </div>`);
    overlay().appendChild(s);

    let settled = false;
    let gestureRaf = null;
    const stopGestureLoop = () => { if (gestureRaf) cancelAnimationFrame(gestureRaf); gestureRaf = null; };
    const finish = result => {
      if (settled) return;
      settled = true;
      stopGestureLoop();
      clear();
      resolve(result);
    };

    s.querySelector('#btn-go-retry').onclick = () => { playSfx('button_press'); finish('retry'); };
    s.querySelector('#btn-go-quit').onclick = () => { playSfx('button_press'); finish('quit'); };

    if (getLandmarks) {
      const hint = s.querySelector('#go-gesture-hint');
      const gaugeFill = s.querySelector('#go-gauge-fill');
      hint.classList.remove('hidden');
      const hold = new GestureHold(lms => isArmsUpCross(lms, CONFIG.gesture), CONFIG.gesture.confirmHoldSec);
      let last = performance.now();
      const loop = () => {
        const now = performance.now();
        const dt = (now - last) / 1000; last = now;
        const done = hold.update(dt, getLandmarks());
        gaugeFill.style.width = `${hold.progress * 100}%`;
        if (done) { playSfx('button_press'); finish('quit'); return; }
        gestureRaf = requestAnimationFrame(loop);
      };
      gestureRaf = requestAnimationFrame(loop);
    }
  });
}

// ── 미션 컴플리트 + 운동 리포트 ──
export function showMissionComplete(stats) {
  return new Promise(resolve => {
    clear();
    playSfx('mission_complete');
    const rec = stats.toRecord();
    const e = rec.exercise;
    const poseTotal = e.poseHolds.reduce((s, p) => s + p.holdSec, 0);
    const s = el(`
      <div class="screen dark">
        <img style="height:22%" src="/assets/warmup/image/fx_mission_complete.png">
        <img style="height:18%; margin-top:1%" src="/assets/warmup/image/fx_podium.png">
        <div class="report">
          <table>
            <tr><td>⭐ 획득한 별</td><td>${rec.score.stars}</td></tr>
            <tr><td>🏃 옆으로 피하기</td><td>${e.sideSteps}회</td></tr>
            <tr><td>🦘 점프</td><td>${e.jumps}회</td></tr>
            <tr><td>🧎 앉았다 일어나기</td><td>${e.squats}회</td></tr>
            <tr><td>🧘 스트레칭 유지</td><td>${Math.round(poseTotal)}초</td></tr>
            <tr><td>⏱️ 운동 시간</td><td>${Math.floor(rec.durationSec / 60)}분 ${rec.durationSec % 60}초</td></tr>
          </table>
          <div class="save-status" id="save-status">기록 저장 중…</div>
        </div>
        <div style="margin-top:2%">
          <button class="btn" id="btn-again">다시 하기</button>
        </div>
      </div>`);
    overlay().appendChild(s);

    stats.save().then(r => {
      s.querySelector('#save-status').textContent =
        r.ok ? '✓ 운동 기록이 저장되었어요!' : '오프라인 — 기록은 나중에 자동 저장돼요';
    });

    s.querySelector('#btn-again').onclick = () => { playSfx('button_press'); clear(); resolve(); };
  });
}

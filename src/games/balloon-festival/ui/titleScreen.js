// 풍선 팡팡 — 타이틀 화면.
//
// ken이 준 커버 그림(`assets.js`의 TITLE_IMAGE, manifest.json의 썸네일과 같은
// 그림)을 그대로 배경에 깔고 시작 버튼 하나만 얹는다. 시작 버튼 그림은
// `core/uiAssets.js`의 공용 그림을 쓴다 — "카드 클릭은 선택, 실행은 히어로의
// 시작 버튼 하나"(CLAUDE.md)와 다른 게임들이 이미 쓰는 것과 같은 그림이라
// 아이가 게임마다 다른 버튼을 다시 배우지 않는다.
//
// ── Play Mode 선택 ★ (STEP 104, 디자인 정리 STEP 106) ───────────
//
// 시작 버튼 위에 작은 모드 셀렉터 버튼("👤 혼자 하기 ▾")을 두고, 누르면
// 팝업이 뜬다. 팝업의 뼈대(상자·액션 묶음·버튼)는 오디세이 런의 속도
// 설정 팝업(`runner3d/screens.js`의 `#r3-speed-popup`)이 이미 정한
// 이 저장소의 패턴을 그대로 따른다 — `.pz-confirm-box`/`.pz-confirm-actions`/
// `.pz-btn`(`runner/ui/systemBar.js`)을 받아 쓴다(오디세이 런 파일 자체는
// 안 건드린다, read-only 참고). STEP 106에서는 그 위에 이 게임만의 카드
// 모양(`.bf-mode-*`)을 얹어 "각 옵션이 다른 색 버튼처럼 보인다"는 지적을
// 정리했다 — 기본은 전부 같은 톤(짙은 보라 카드)이고, 선택된 카드만
// 골드 테두리+은은한 글로우로 표시한다(카드 전체를 노랗게 채우지 않는다).
// 선택 로직(모드 배열/quota)은 `../modes.js`가 정본이다 — 이 파일은
// 그리기만 한다.
import { UI } from '../../../core/uiAssets.js'
import { icon } from '../../../core/icons.js'
import { ensureSysBarStyle } from '../../runner/ui/systemBar.js'
import { TITLE_IMAGE } from '../assets.js'
import { PLAY_MODE_LIST, getPlayMode, getPlayableMode, DEFAULT_PLAY_MODE } from '../modes.js'

/**
 * @param {HTMLElement} app
 * @param {string} [initialModeId] 이미 골라둔 모드가 있으면(같은 세션 안
 *   재도전 등) 그 상태로 팝업을 연다 — 없으면 SOLO부터 시작한다.
 * @returns {Promise<{ result: 'start'|'home', mode: string }>}
 */
export function showTitleScreen(app, initialModeId = DEFAULT_PLAY_MODE) {
  ensureSysBarStyle(app.ownerDocument ?? document)
  return new Promise(resolve => {
    let modeId = getPlayableMode(initialModeId).id

    app.innerHTML = `
      <style>
        #bf-title { position: fixed; inset: 0; overflow: hidden; background: #000; }
        #bf-title img.cover {
          position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
        }
        #bf-title::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 40%, rgba(10,6,20,0.75) 100%);
        }
        #bf-title .home {
          position: absolute; top: clamp(10px, 2vh, 20px); left: clamp(10px, 2vw, 20px); z-index: 2;
          min-height: 48px; padding: 0 16px; border-radius: 9999px;
          background: rgba(0,0,0,0.35); color: #fff; border: 2px solid rgba(255,255,255,0.3);
          font: inherit; font-weight: 800; font-size: 0.9rem; cursor: pointer;
          display: flex; align-items: center; gap: 6px; -webkit-tap-highlight-color: transparent;
        }
        /* 시작 버튼 + 모드 버튼을 한 세로 묶음으로 하단 CTA 자리에 둔다
           (ken 요청, STEP 103 — "중앙에 너무 걸쳐 있다, 많이 아래로").
           묶음을 통째로 bottom 고정(퍼센트가 아니라 뷰포트 여백)하면
           커버 그림이 object-fit: cover로 위아래가 잘려도 항상 화면 맨
           아래 근처에 뜬다. 가로 정렬만 가운데(손 커서로 겨누기 쉬운
           자리). 모드 버튼이 시작 버튼 바로 위에 있어 "시작하기 전에
           고르는 것"이라는 순서가 자연히 읽힌다. */
        #bf-title .actions {
          position: absolute; left: 50%; bottom: clamp(20px, 6vh, 56px); transform: translateX(-50%);
          z-index: 2; display: flex; flex-direction: column; align-items: center;
          gap: clamp(10px, 2vh, 18px);
        }
        /* 모드 셀렉터 — START보다 확실히 작고(min-height 낮음, 폰트 작음),
           반투명 짙은 보라 배경 + 밝은 테두리로 "정식 selector"처럼
           보이게 한다(요청: 임시 버튼처럼 보이지 않게). 끝의 ▾가 "누르면
           더 있다"는 걸 말로 안 해도 알린다. */
        #bf-title .mode-btn {
          min-height: 40px; padding: 0 clamp(14px, 3vw, 22px); border-radius: 9999px;
          background: rgba(28, 16, 66, 0.62); color: #fff;
          border: 1.5px solid rgba(255, 255, 255, 0.55);
          font: inherit; font-weight: 800; font-size: clamp(0.8rem, 1.7vw, 0.95rem); cursor: pointer;
          display: flex; align-items: center; gap: 8px; -webkit-tap-highlight-color: transparent;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
          transition: background .15s, border-color .15s, transform .1s;
        }
        #bf-title .mode-btn:hover, #bf-title .mode-btn:focus-visible {
          background: rgba(42, 26, 110, 0.75); border-color: var(--pz-gold, #ffd23e);
          outline: none;
        }
        #bf-title .mode-btn:active { transform: scale(.95); background: rgba(15, 8, 40, 0.8); }
        #bf-title .mode-btn .sub { opacity: .8; font-size: .85em; }
        #bf-title .mode-btn .caret { opacity: .7; font-size: .8em; margin-left: 2px; }
        #bf-title .start {
          background: none; border: none; padding: 0; cursor: pointer;
          filter: drop-shadow(0 8px 22px rgba(0,0,0,0.5));
          animation: bf-title-pulse 1.4s ease-in-out infinite;
          -webkit-tap-highlight-color: transparent;
        }
        #bf-title .start img { display: block; width: clamp(200px, 30vw, 320px); height: auto; }
        @keyframes bf-title-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.05); }
        }
        @media (prefers-reduced-motion: reduce) { #bf-title .start { animation: none; } }
        /* 모바일 가로처럼 세로가 짧은 화면 — 세로 묶음이 타이틀 글자를
           밀어붙이지 않게 가로로 눕힌다(오디세이 런 타이틀이 같은
           문제를 같은 기준(max-height: 560px)으로 푼 방식과 맞췄다). */
        @media (max-height: 560px) {
          #bf-title .actions { flex-direction: row; gap: clamp(12px, 2.6vw, 24px); bottom: clamp(12px, 4vh, 32px); }
          #bf-title .start img { width: clamp(140px, 20vw, 220px); }
          #bf-title .mode-btn { min-height: 38px; font-size: clamp(0.75rem, 1.6vw, 0.95rem); }
        }

        /* ── 모드 선택 팝업 (STEP 106 디자인 정리) ──────────────────
           뼈대(오버레이 dim + 중앙 정렬)는 오디세이 런 속도 팝업과 같다.
           상자 자체는 공용 확인창 상자(pz-confirm-box)를 그대로 쓰되,
           이 팝업만 카드 목록이 세로로 길어질 수 있어(3개 옵션 + 헤더)
           최대 높이와 내부 스크롤을 추가한다 — 작은 화면에서 화면
           밖으로 안 잘리게. */
        #bf-mode-popup {
          position: fixed; inset: 0; z-index: 5;
          display: flex; align-items: center; justify-content: center;
          background: rgba(8, 3, 20, .68);
          padding: clamp(12px, 4vh, 32px) clamp(12px, 4vw, 24px);
        }
        #bf-mode-popup.hidden { display: none; }
        /* 요청: 굵은 골드 테두리가 너무 강하면 톤을 낮춘다 — 2px(기존
           확인창 4px)로 얇게, 그림자도 부드럽게. 배경은 살짝 더
           투명하게(인트로 그림이 비쳐 팝업이 화면을 짓누르지 않게). */
        #bf-mode-popup .pz-confirm-box {
          position: relative;   /* close-x가 이 상자 기준 오른쪽 위에 앉는다 */
          border-width: 2px; background: linear-gradient(rgba(30,18,68,.94), rgba(20,12,52,.96));
          max-height: 100%; overflow-y: auto; box-shadow: 0 16px 44px rgba(0,0,0,.45);
        }
        #bf-mode-popup .pz-confirm-box > p {
          position: relative; padding-right: 34px;   /* 오른쪽 위 닫기(X)와 안 겹치게 */
        }
        /* 닫기 — 옵션과 같은 비중으로 보이면 안 된다(요청 6번). 상자
           오른쪽 위의 작은 원형 X 하나로 줄였다. 손 커서 dwell 대상도
           아니고(팝업은 마우스/터치 전제, 이 화면 다른 버튼들과 동일한
           관례) 시각적 무게만 가볍게 뺐다. */
        #bf-mode-popup .close-x {
          /* 상자 안쪽에 둔다(음수 offset으로 밖에 걸치면 위 overflow-y:auto와
             상호작용해 잘릴 수 있다) — 상자 padding 안, 오른쪽 위 모서리. */
          position: absolute; top: 10px; right: 10px; width: 32px; height: 32px;
          border-radius: 50%; border: none; background: rgba(255,255,255,0.12); color: #fff;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        #bf-mode-popup .close-x:hover { background: rgba(255,255,255,0.22); }
        #bf-mode-popup .close-x svg { width: 16px; height: 16px; }

        /* ── 옵션 카드 — 공통 베이스(요청 3번: 전부 같은 톤) ───────── */
        .bf-mode-opt {
          background: rgba(255, 255, 255, 0.05); color: #fff;
          border: 2px solid rgba(255, 255, 255, 0.14); box-shadow: none;
          border-radius: 20px; min-height: 68px; padding: 12px 18px;
          display: flex; align-items: center; gap: 14px; text-align: left;
          transition: border-color .15s, background .15s, box-shadow .15s;
        }
        .bf-mode-opt:hover:not(:disabled), .bf-mode-opt:focus-visible:not(:disabled) {
          border-color: rgba(255,255,255,0.32); background: rgba(255,255,255,0.09); outline: none;
        }
        .bf-mode-opt .icon { font-size: 1.7rem; line-height: 1; flex: 0 0 auto; }
        .bf-mode-opt .text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .bf-mode-opt .label { font-size: 1.05rem; font-weight: 900; display: flex; align-items: center; gap: 8px; }
        .bf-mode-opt .people { font-size: 0.82rem; font-weight: 700; opacity: 0.75; }
        .bf-mode-opt .check {
          flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: var(--pz-gold, #ffd23e); color: var(--pz-gold-text, #4a2a00);
          opacity: 0; transform: scale(0.6); transition: opacity .15s, transform .15s;
        }
        .bf-mode-opt .check svg { width: 15px; height: 15px; }
        /* 선택됨 — 카드를 전부 노랗게 채우지 않는다(요청 3번). 골드
           테두리 + 은은한 글로우 + 체크 아이콘만으로 "이게 선택됨"을
           또렷이 알린다. */
        .bf-mode-opt.on {
          border-color: var(--pz-gold, #ffd23e); background: rgba(255, 210, 62, 0.10);
          box-shadow: 0 0 0 1px var(--pz-gold, #ffd23e) inset, 0 0 18px rgba(255, 210, 62, 0.30);
        }
        .bf-mode-opt.on .check { opacity: 1; transform: scale(1); }
        /* 준비 중(STEP 105) — 흐리게 + 눌러도 반응 없음. 되는 척 보이면 안 된다. */
        .bf-mode-opt:disabled { opacity: .48; cursor: not-allowed; }
        .bf-mode-opt .badge {
          padding: 3px 11px; border-radius: 9999px; font-size: .72rem; font-weight: 900;
          letter-spacing: .02em; white-space: nowrap;
        }
        .bf-mode-opt .badge.soon { background: rgba(255,255,255,0.14); color: #fff; }
        /* DUO — Family Co-op이 처음 나가는 버전임을 은은하게만 알린다(요청
           4번 — "너무 강하게 강조하지 않는다"). 옵션 색 자체는 SOLO와
           완전히 같은 베이스를 쓴다. */
        .bf-mode-opt .badge.beta {
          background: rgba(127, 227, 255, 0.18); color: #bdf1ff; border: 1px solid rgba(127,227,255,.4);
        }
        /* 모바일 가로처럼 낮은 화면 — 카드 높이·아이콘·글자를 줄여서 3장 +
           헤더가 화면 밖으로 안 밀려나게 한다(넘치면 위쪽 상자의
           overflow-y: auto 스크롤이 받는다). */
        @media (max-height: 480px) {
          .bf-mode-opt { min-height: 52px; padding: 8px 14px; gap: 10px; }
          .bf-mode-opt .icon { font-size: 1.35rem; }
          .bf-mode-opt .label { font-size: 0.92rem; }
          .bf-mode-opt .people { font-size: 0.74rem; }
          #bf-mode-popup .pz-confirm-box > p { font-size: clamp(0.9rem, 2.2vw, 1.15rem); }
        }
      </style>
      <div id="bf-title">
        <img class="cover" src="${TITLE_IMAGE}" alt="풍선 팡팡">
        <button class="home" type="button" aria-label="Home으로">${icon('home')} Home</button>
        <div class="actions">
          <button class="mode-btn" id="bf-mode-btn" type="button" aria-haspopup="true">
            <span id="bf-mode-icon"></span> <span id="bf-mode-label"></span> <span class="caret">▾</span>
          </button>
          <button class="start" type="button" aria-label="시작하기">
            <img src="${UI.startButton}" alt="시작하기">
          </button>
        </div>
      </div>
      <div id="bf-mode-popup" class="hidden">
        <div class="pz-confirm-box">
          <button class="close-x" id="bf-mode-close" type="button" aria-label="닫기">${icon('close')}</button>
          <p>같이 하는 인원을 골라 주세요</p>
          <div class="pz-confirm-actions">
            ${PLAY_MODE_LIST.map(m => `
              <button class="bf-mode-opt" data-id="${m.id}"
                      ${m.available ? '' : 'disabled aria-disabled="true"'}>
                <span class="icon">${m.icon}</span>
                <span class="text">
                  <span class="label">${m.label}${m.betaBadge ? `<span class="badge beta">${m.betaBadge}</span>` : ''}</span>
                  <span class="people">${m.sublabel}</span>
                </span>
                ${m.available
                  ? `<span class="check">${icon('check')}</span>`
                  : `<span class="badge soon">${m.badge ?? '준비 중'}</span>`}
              </button>`).join('')}
          </div>
        </div>
      </div>
    `

    // ── 모드 버튼/팝업 배선 ────────────────────────────────────
    const modeIconEl = app.querySelector('#bf-mode-icon')
    const modeLabelEl = app.querySelector('#bf-mode-label')
    const popup = app.querySelector('#bf-mode-popup')
    const syncModeButton = () => {
      const m = getPlayMode(modeId)
      modeIconEl.textContent = m.icon
      modeLabelEl.textContent = m.label
      app.querySelectorAll('.bf-mode-opt').forEach(b => b.classList.toggle('on', b.dataset.id === modeId))
    }
    syncModeButton()
    app.querySelector('#bf-mode-btn').addEventListener('click', () => popup.classList.remove('hidden'))
    app.querySelector('#bf-mode-close').addEventListener('click', () => popup.classList.add('hidden'))
    app.querySelectorAll('.bf-mode-opt').forEach(b => {
      b.addEventListener('click', () => {
        // disabled 버튼은 브라우저가 click을 안 보내지만, 손 커서·프로그램
        // 클릭이 우회해도 준비 중 모드는 절대 안 골라지게 한 번 더 막는다.
        if (b.disabled || !getPlayMode(b.dataset.id).available) return
        modeId = b.dataset.id
        syncModeButton()
        popup.classList.add('hidden')
      })
    })

    app.querySelector('.start').addEventListener('click', () => resolve({ result: 'start', mode: modeId }))
    app.querySelector('.home').addEventListener('click', () => resolve({ result: 'home', mode: modeId }))
  })
}

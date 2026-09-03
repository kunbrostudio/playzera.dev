// BGM 루프 + SFX (+ 음소거 상태 관리 — 플레이 제라 다른 게임과 동일한 UX)
//
// 효과음 **이름**은 엔진이 정한다(판정에 쓰는 이름이라 테마마다 달라지면 코드가 갈린다).
// 실제 소리 파일은 테마 폴더에서 온다 — 이름은 같고 내용이 다르다.
// ── 소리 경로를 **밖에서 받는다** ★ ─────────────────────────
//
// 전에는 `theme()`을 직접 읽었다. 그러면 2.5D 테마 홀더에 꽂혀 있어야만
// 소리가 나서 **3D 러너에서는 쓸 수가 없었다** — 같은 게임인데 한쪽만 조용했다.
//
// `initAudio({ base, bgm })`으로 열어 뒀다. 안 넘기면 예전처럼 테마에서 읽으니
// 2.5D 쪽 호출부는 한 글자도 안 바뀐다.
import { theme, audioUrl } from './theme.js';
const SFX_NAMES = ['countdown_beep','go','dodge','hint_pop','button_press','level_complete','mission_complete'];

const sfx = {};
let bgm = null;
let unlocked = false;
let bgmMuted = false;
let sfxMuted = false;
let wantBgmPlaying = false; // 게임 흐름상 "지금 BGM이 재생 중이어야 하는지" (음소거와 별개)

/**
 * @param {object} [o]
 * @param {string} [o.base] 소리 폴더. 게임팩의 manifest에서 온다.
 *   안 넘기면 테마에서 읽는다 — 2.5D 러너의 기존 동작이다.
 *   **여기에 경로를 적지 않는다** — 테스트가 엔진 코드의 에셋 경로를 잡는다.
 * @param {string} [o.bgm]  배경음악 파일 이름
 */
export function initAudio({ base = null, bgm: bgmFile = null } = {}) {
  const url = f => (base ? `${base}/${f}` : audioUrl(f));
  for (const n of SFX_NAMES) {
    sfx[n] = new Audio(url(`sfx_${n}.wav`));
    sfx[n].preload = 'auto';
  }
  bgm = new Audio(url(bgmFile ?? theme().audio.bgm));
  bgm.loop = true;
  bgm.volume = 0.45;
  // ── 미리 받아 둔다 ★ ──
  // 효과음에는 `preload`가 붙어 있었는데 BGM에는 없었다. mp3는 몇 백 KB라
  // **첫 상호작용 때 그제야 받기 시작해서 음악이 몇 초 늦게 났다.**
  // 여기서 시작해 두면 아이가 타이틀을 보는 동안 받아 놓는다.
  bgm.preload = 'auto';
  bgm.load();
}

export function unlockAudio() { unlocked = true; }

export function playSfx(name, volume = 1) {
  if (!unlocked || sfxMuted || !sfx[name]) return;
  const a = sfx[name].cloneNode();
  a.volume = volume;
  a.play().catch(() => {});
}

export function startBgm() {
  wantBgmPlaying = true;
  if (unlocked && !bgmMuted && bgm) bgm.play().catch(() => {});
}
export function stopBgm() {
  wantBgmPlaying = false;
  if (bgm) { bgm.pause(); bgm.currentTime = 0; }
}

// ── 코드로 즉석 합성하는 짧은 효과음 (전용 오디오 파일이 없는 판정용) ──
let actx = null;
function getActx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  return actx;
}

// 장애물 못 피함/포즈 실패 — 짧은 "부웅" 하강음
export function playMissBuzz() {
  if (!unlocked || sfxMuted) return;
  try {
    const ctx = getActx();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t0);
    osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.22);
    gain.gain.setValueAtTime(0.22, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.26);
  } catch { /* AudioContext 미지원 등은 조용히 무시 */ }
}

// 목숨 소진(게임 오버) — 귀여운 하강 아르페지오
export function playGameOverJingle() {
  if (!unlocked || sfxMuted) return;
  try {
    const ctx = getActx();
    const t0 = ctx.currentTime;
    const notes = [392.00, 329.63, 261.63, 196.00]; // G4-E4-C4-G3
    notes.forEach((f, i) => {
      const start = t0 + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch { /* 무시 */ }
}

// ── 스토리 연출음 (폭발·불꽃·대사 넘김·성공 배경음) ★ ───────────
//
// 쥬라기 대탐험의 스토리 장면 전용이지만, 여기 두는 이유는 위 판정음과
// 같다 — 장면 하나 때문에 새 mp3 파일을 받는 라운드를 또 돌리지 않으려고.
// 실제 곡·효과음 생성 도구는 이 프로젝트 용도로는 못 쓴다(게임 파이프라인
// 전용) — 코드로 합성하는 게 유일한 선택이면서, 마침 이미 있는 방식이다.

function noiseBuffer(ctx, sec) {
  const n = Math.max(1, Math.round(ctx.sampleRate * sec));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// 화산 폭발/지진 — 번개 같은 크랙 + 여러 번 흩어져 터지는 쿵 + 굴러가는
// 저역 rumble(천둥 꼬리). 한 번의 "쿵"만으로는 심심하다는 요청(ken, 9/2)에
// 맞춰 타이밍·피치를 매번 흩뜨려서 터질 때마다 다르게 들리게 했고, 전체
// 볼륨도 키웠다(판정음보다 이 소리가 장면의 주인공이라 더 커도 된다).
export function playQuakeBoom() {
  if (!unlocked || sfxMuted) return;
  try {
    const ctx = getActx();
    const t0 = ctx.currentTime;

    // 번개 크랙 — 아주 짧고 날카로운 고역 노이즈 한 번
    const crack = ctx.createBufferSource();
    crack.buffer = noiseBuffer(ctx, 0.08);
    const crackHp = ctx.createBiquadFilter();
    crackHp.type = 'highpass';
    crackHp.frequency.setValueAtTime(1800, t0);
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.001, t0);
    crackGain.gain.linearRampToValueAtTime(0.45, t0 + 0.006);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
    crack.connect(crackHp).connect(crackGain).connect(ctx.destination);
    crack.start(t0);

    // 연달아 터지는 쿵 2~3번 — 간격·피치를 매번 흩뜨린다("다양하게 터지는 느낌")
    const booms = 2 + Math.floor(Math.random() * 2);
    let at = t0 + 0.05;
    for (let i = 0; i < booms; i++) {
      const start = at;
      const peak = 95 - i * 10 + Math.random() * 14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(peak, start);
      osc.frequency.exponentialRampToValueAtTime(28 + Math.random() * 10, start + 0.55);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.75, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.8);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.85);

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx, 0.7);
      const nf = ctx.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.setValueAtTime(450 + Math.random() * 200, start);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.001, start);
      ng.gain.linearRampToValueAtTime(0.34, start + 0.05);
      ng.gain.exponentialRampToValueAtTime(0.001, start + 0.7);
      noise.connect(nf).connect(ng).connect(ctx.destination);
      noise.start(start);

      at += 0.22 + Math.random() * 0.22;
    }

    // 천둥처럼 뒤에서 길게 우르릉거리는 저역 rumble
    const rumbleStart = t0 + 0.1;
    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuffer(ctx, 1.6);
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.setValueAtTime(220, rumbleStart);
    rf.frequency.linearRampToValueAtTime(130, rumbleStart + 1.6);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.001, rumbleStart);
    rg.gain.linearRampToValueAtTime(0.3, rumbleStart + 0.3);
    rg.gain.exponentialRampToValueAtTime(0.001, rumbleStart + 1.6);
    rumble.connect(rf).connect(rg).connect(ctx.destination);
    rumble.start(rumbleStart);
  } catch { /* 무시 */ }
}

// 엔딩 폭죽 — 반짝이는 아르페지오 + 톡톡 튀는 스파클
export function playFirework() {
  if (!unlocked || sfxMuted) return;
  try {
    const ctx = getActx();
    const t0 = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5-E5-G5-C6
    notes.forEach((f, i) => {
      const start = t0 + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    [0.05, 0.22].forEach(delay => {
      const start = t0 + delay;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx, 0.12);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(3500, start);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, start);
      g.gain.linearRampToValueAtTime(0.14, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
      noise.connect(hp).connect(g).connect(ctx.destination);
      noise.start(start);
    });
  } catch { /* 무시 */ }
}

// 게임 시작 신호 — 인트로 마지막 장면에서 한 번(`scene.stinger === 'start'`).
// 짧고 씩씩한 상승음 3개 + 끝에 힘주는 스퀘어 파형 한 음. 폭발음(트라이앵글·
// 저역 위주)과 톤이 달라서 뒤이어 울려도 안 묻힌다.
export function playGameStart() {
  if (!unlocked || sfxMuted) return;
  try {
    const ctx = getActx();
    const t0 = ctx.currentTime;
    const notes = [392.00, 493.88, 587.33, 783.99]; // G4-B4-D5-G5
    notes.forEach((f, i) => {
      const last = i === notes.length - 1;
      const start = t0 + i * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = last ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(last ? 0.22 : 0.18, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + (last ? 0.5 : 0.16));
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + (last ? 0.52 : 0.18));
    });
  } catch { /* 무시 */ }
}

// 대사 줄이 바뀔 때 — 짧은 "톡" 한 번
export function playLineBlip() {
  if (!unlocked || sfxMuted) return;
  try {
    const ctx = getActx();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(720, t0);
    gain.gain.setValueAtTime(0.001, t0);
    gain.gain.linearRampToValueAtTime(0.14, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.1);
  } catch { /* 무시 */ }
}

// 엔딩 배경음악 — 귀여운 성공 멜로디 루프. 실제 파일 대신 장조 5음계를
// 실로폰처럼(트라이앵글 파형) 튕겨서 만든다. `bgmMuted`는 다음 마디
// 시작(약 2.9초 주기)에 반영된다 — 정교한 실시간 음소거보다 훨씬 간단하고,
// 엔딩 화면에서 음소거를 튕기는 일은 드물어서 그 정도면 충분하다.
let victoryTimer = null;
export function startVictoryLoop() {
  if (victoryTimer) return;
  const bar = () => {
    if (unlocked && !bgmMuted) {
      try {
        const ctx = getActx();
        const t0 = ctx.currentTime;
        const melody = [523.25, 659.25, 783.99, 1046.50, 880.00, 783.99, 659.25, 523.25];
        melody.forEach((f, i) => {
          const start = t0 + i * 0.34;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, start);
          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.32);
        });
      } catch { /* 무시 */ }
    }
    victoryTimer = setTimeout(bar, 2900);
  };
  bar();
}
export function stopVictoryLoop() {
  if (victoryTimer) { clearTimeout(victoryTimer); victoryTimer = null; }
}

export function isBgmMuted() { return bgmMuted; }
export function toggleBgmMute() {
  bgmMuted = !bgmMuted;
  if (bgm) {
    if (bgmMuted) bgm.pause();
    else if (wantBgmPlaying && unlocked) bgm.play().catch(() => {});
  }
  return bgmMuted;
}

export function isSfxMuted() { return sfxMuted; }
export function toggleSfxMute() { sfxMuted = !sfxMuted; return sfxMuted; }

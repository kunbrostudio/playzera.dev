import * as sound from '../../core/sound.js'

// 라운드 구성 — **한 판이 2분 반은 가야 한다.**
//
// 이전에는 12/11/10/10/10 = 53초였다. 5레벨을 다 깨도 1분이 안 됐다.
// 운동이 목적인 게임에서 53초는 준비운동도 안 되는 시간이고, 실제로 첫 모션
// 기록이 활동 18초 · 좌우 이동 2회로 남았다(STEP 9 참조).
//
// 늘린 방식 — **똥 밀도(초당 낙하 수)는 그대로 두고 시간만 늘렸다.**
// 밀도를 같이 올리면 난이도가 딴 게임이 된다. duration을 늘리고 spawnMs를
// 그에 맞춰 미세 조정해 초당 0.4~0.5개를 유지한다.
//
// 최고 속도는 500 → 420으로 낮췄다. 10초를 버티는 것과 35초를 버티는 것은
// 다른 일이다. 같은 속도로 3배를 끌면 목숨 3개로는 끝까지 못 간다.
export const ROUNDS = [
  { duration: 25, speed: 180, spawnMs: 2600 },   // 배우는 구간 — 길고 느리게
  { duration: 28, speed: 230, spawnMs: 2200 },
  { duration: 30, speed: 290, spawnMs: 1900 },
  { duration: 32, speed: 350, spawnMs: 1600 },
  { duration: 35, speed: 420, spawnMs: 1400 },   // 마지막 — 빠르지만 감당 가능하게
]

// 한 판 총 시간(초). 테스트가 이 값을 지킨다.
export const TOTAL_SECONDS = ROUNDS.reduce((s, r) => s + r.duration, 0)

// 목숨 5개. 라운드가 53초 → 150초로 3배 길어졌는데 목숨이 그대로면
// 끝까지 가는 아이가 거의 없다. 실패는 배우는 과정이지 벽이 아니어야 한다.
export const MAX_LIVES = 5
const WARN_PX       = 80
const BASE_W        = 1280
const MAX_PARTICLES = 80
// 하단 버튼 영역의 **기준** 높이. 실제 값은 _floorH가 화면에 맞춰 줄인다.
const FLOOR_H_BASE  = 110

// ── 플레이어 캐릭터 ──────────────────────────────────────────────
const CHAR_H        = 210   // 기준 높이(px). _scale이 곱해진다
const CHAR_RATIO    = 1070 / 1450   // 원본 가로/세로
// 캐릭터 발이 버튼의 윗부분 어디에 닿는가(버튼 그림 높이 대비).
// **캐릭터가 버튼 위에 올라선 것처럼 보여야 한다.** 그래서 발 위치를 화면 높이가
// 아니라 **버튼 그림 위치에 묶는다** — 따로 두면 화면 크기가 바뀔 때 한쪽만 움직여
// 캐릭터가 버튼 위에 떠 있거나 파묻힌다.
const CHAR_FOOT_ON_BTN = 0.26

// 버튼 그림의 기준 높이(px, _scale이 곱해진다). 여백 뺀 **보이는 그림** 기준이다.
const BTN_ART_H     = 68
const CHAR_MOVE_MS  = 190   // 한 칸을 건너는 데 걸리는 시간
const CHAR_SCARED_MS = 700  // 맞았을 때 놀란 표정을 유지하는 시간
const CHAR_HOP_PX   = 10    // 이동 중 위아래로 통통 튀는 폭

// PNG에서 **실제로 그림이 있는 사각형**을 찾는다(알파 > 12인 픽셀의 경계).
//
// 투명 여백을 포함한 박스로 배치하면 보이는 크기가 에셋마다 제멋대로다.
// 실패하면(캔버스 오염 등) null을 돌려주고 호출부가 전체 이미지로 폴백한다.
function measureArtBox(img) {
  try {
    const w = img.naturalWidth, h = img.naturalHeight
    if (!w || !h) return null
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const cx = c.getContext('2d', { willReadFrequently: true })
    cx.drawImage(img, 0, 0)
    const d = cx.getImageData(0, 0, w, h).data
    let minX = w, minY = h, maxX = -1, maxY = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 12) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
  } catch {
    return null
  }
}

// 목표까지 한 걸음. 넘어가면 목표에 딱 붙인다.
//
// 캔버스 없이 검증할 수 있도록 따로 뺐다 — 이 게임에서 순수 함수로 떨어지는
// 몇 안 되는 조각이고, "덜컥거리며 지나친다" 같은 버그가 나는 자리다.
export function stepToward(current, target, maxStep) {
  const dx = target - current
  if (Math.abs(dx) <= maxStep) return target
  return current + Math.sign(dx) * maxStep
}

// 존별 테마 색상 (왼쪽=분홍, 가운데=파랑, 오른쪽=보라)
const ZONE_COLORS = [
  { fill: 'rgba(255,100,160,{a})', warn: 'rgba(255,60,60,{a})', line: 'rgba(255,180,210,0.6)' },
  { fill: 'rgba(80,150,255,{a})',  warn: 'rgba(255,60,60,{a})', line: 'rgba(150,200,255,0.6)' },
  { fill: 'rgba(160,80,255,{a})',  warn: 'rgba(255,60,60,{a})', line: 'rgba(200,150,255,0.6)' },
]

export default class PoopDodgeGame {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.ctx    = canvas.getContext('2d')
    this.onRoundEnd    = options.onRoundEnd    ?? (() => {})
    this.onGameEnd     = options.onGameEnd     ?? (() => {})
    this.onScoreUpdate = options.onScoreUpdate ?? (() => {})
    this.onLifeUpdate  = options.onLifeUpdate  ?? (() => {})

    this.playerZone = 1
    this.lives      = MAX_LIVES
    this.score      = 0
    this.round      = 0
    this.poops      = []
    this.stars      = []
    this.dodgeCount = 0
    this.hitCount   = 0
    this.sideSteps  = 0     // 실제로 자리를 옮긴 횟수 = 운동량
    this._activeMs  = 0     // 실제 플레이 시간(배너·카운트다운 제외)

    this._combo       = 0
    this._shakeAmount = 0
    this._particles   = []
    this._paused      = false
    this._running     = false
    this._rafId       = null
    this._spawnTimer  = 0
    this._roundTimer  = 0
    this._lastTime    = 0
    this._warnZones   = new Set()
    this._overlayLock = false

    // 캐릭터 — 위치는 칸이 아니라 **픽셀**로 들고 있는다.
    // 칸만 들고 있으면 칸을 바꾸는 순간 순간이동한다. 아이가 자기 몸을
    // 옆으로 옮겼는데 화면 속 캐릭터가 텔레포트하면 "따라오는" 느낌이 안 난다.
    this._charX      = null    // null이면 첫 프레임에 목표 위치로 스냅
    this._charPose   = 'idle'  // idle | left | right | scared | cheer
    this._charPoseMs = 0       // 임시 표정(놀람·환호)이 남은 시간
    this._charHopMs  = 0

    // 이미지 에셋
    this._img = {}
    this._loadImages()
  }

  _loadImages() {
    const load = (key, src, measure = false) => {
      const img = new Image()
      img.onload  = () => {
        // 버튼 PNG는 여백이 크다 — 800×800인데 실제 그림은 570×359다(세로 45%).
        // 박스 크기로 배치하면 "왜 이렇게 작지?"가 되고, 여백 비율을 상수로 박아두면
        // 에셋이 바뀔 때 조용히 어긋난다. **불투명 영역을 직접 재서** 그 부분만 그린다.
        if (measure) img._artBox = measureArtBox(img)
        this._img[key] = img
      }
      img.onerror = () => {}
      img.src = src
    }
    load('bg',   '/assets/image/poop_game_bg.jpg')
    load('poop', '/assets/image/poop01_default.png')
    load('btnL', '/assets/image/btn_left_default.png',    true)
    load('btnC', '/assets/image/btn_center_default.png',  true)
    load('btnR', '/assets/image/btn_right_default.png',   true)
    load('btnLP', '/assets/image/btn_left_pressed.png',   true)
    load('btnCP', '/assets/image/btn_center_pressed.png', true)
    load('btnRP', '/assets/image/btn_right_pressed.png',  true)

    // 플레이어 캐릭터. 하나라도 없으면 그 표정만 idle로 떨어진다(게임은 계속된다).
    load('charIdle',   '/assets/characters/char_idle.png')
    load('charLeft',   '/assets/characters/char_move_left.png')
    load('charRight',  '/assets/characters/char_move_right.png')
    load('charScared', '/assets/characters/char_scared.png')
    load('charCheer',  '/assets/characters/char_cheer.png')
  }

  // ── 논리 픽셀 ────────────────────────────────────────────────
  get lw() { return this.canvas.offsetWidth  || this.canvas.width }
  get lh() { return this.canvas.offsetHeight || this.canvas.height }
  get _scale() { return Math.min(2.2, Math.max(0.6, this.lw / BASE_W)) }

  // 하단 버튼 영역 높이 — **화면 세로에 따라 줄인다.**
  //
  // 110px 고정이었다. 가로로 누운 폰(세로 400px)에서는 그게 화면의 27%다.
  // 그만큼 똥이 떨어질 거리가 짧아져 피할 시간이 없다. 세로의 16%를 넘지 않게 하면
  // 캐릭터와 버튼이 아래로 붙고 낙하 거리가 그만큼 길어진다.
  get _floorH() { return Math.min(FLOOR_H_BASE, this.lh * 0.16) }

  init() {
    this._fitCanvas()
    window.addEventListener('resize', this._onResize)
  }

  _fitCanvas() {
    const dpr = window.devicePixelRatio || 1
    this.canvas.width  = this.lw * dpr
    this.canvas.height = this.lh * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // 화면 크기가 바뀌면 칸 폭이 달라진다. 캐릭터 위치는 픽셀이라
  // 그대로 두면 엉뚱한 칸에 서 있게 된다 — 다음 프레임에 다시 맞춘다.
  _onResize = () => { this._fitCanvas(); this._charX = null }

  // ── 공개 API ────────────────────────────────────────────────

  // 칸을 옮길 때마다 **몸 이동 1회**로 센다.
  //
  // 이 게임의 dodgeCount는 "피한 똥 개수"라 운동량이 아니다. 가만히 서 있어도
  // 다른 칸에 떨어지면 올라간다. 운동 데이터로 쓸 수 있는 건 실제로 자리를
  // 옮긴 횟수뿐이다. (웜업의 countSideStep과 같은 기준)
  setPlayerZone(zone) {
    if (zone !== this.playerZone) this.sideSteps++
    this.playerZone = zone
  }

  async startRound(roundNumber) {
    this.round      = roundNumber
    this.poops      = []
    this._particles = []
    this._combo     = 0
    this._warnZones.clear()
    this._paused = false
    // 지난 라운드의 환호가 새 라운드 시작까지 남지 않도록
    this._charPose   = 'idle'
    this._charPoseMs = 0

    const cfg = ROUNDS[roundNumber - 1]
    this._roundTimer = cfg.duration * 1000
    this._spawnTimer = 0

    await this._showBanner(roundNumber)
    await this._countdown()

    this._running  = true
    this._lastTime = performance.now()
    this._loop()
  }

  pause()  { this._paused = true }
  resume() {
    if (!this._paused) return
    this._paused   = false
    this._lastTime = performance.now()
    this._loop()
  }

  destroy() {
    this._running = false
    cancelAnimationFrame(this._rafId)
    window.removeEventListener('resize', this._onResize)
    this._particles = []
  }

  // ── 게임 루프 ────────────────────────────────────────────────

  _loop() {
    if (!this._running || this._paused) return
    const now = performance.now()
    const dt  = Math.min(now - this._lastTime, 100)
    this._lastTime = now
    this.update(dt)
    this.render()
    this._rafId = requestAnimationFrame(() => this._loop())
  }

  update(dt) {
    const cfg   = ROUNDS[this.round - 1]
    const h     = this.lh
    const floor = h - this._floorH

    this._roundTimer -= dt
    this._spawnTimer -= dt
    // 실제로 똥이 떨어지는 동안만 센다. 라운드 배너·카운트다운은 운동 시간이 아니다.
    // (웜업에서 duration_sec에 메뉴 시간이 섞여 있던 것과 같은 실수를 피한다)
    this._activeMs += dt
    this._warnZones.clear()

    if (this._shakeAmount > 0) {
      this._shakeAmount = Math.max(0, this._shakeAmount - dt * 0.07)
    }

    if (this._spawnTimer <= 0) {
      this._spawnTimer = cfg.spawnMs
      this._spawnPoop(cfg.speed)
    }

    const survived = []
    for (const p of this.poops) {
      p.y   += (cfg.speed * dt) / 1000
      p.rot += p.rotSpeed * dt

      if (p.y >= floor - WARN_PX) this._warnZones.add(p.zone)

      if (p.y >= floor) {
        if (p.zone === this.playerZone) {
          this._onHit(p)
        } else {
          this._combo++
          const comboBonus = this._combo >= 2 ? this._combo * 5 : 0
          this.dodgeCount++
          this.score += 10 + comboBonus
          this.onScoreUpdate(this.score)
          this._showJudge(true)
          sound.playSuccess()
          this._spawnParticles('dodge', p.x, floor, 8)
        }
        continue
      }
      survived.push(p)
    }
    this.poops = survived

    this._updateParticles(dt)
    this._updateCharacter(dt)

    if (this._roundTimer <= 0) {
      this._running = false
      this._endRound()
    }
  }

  // 캐릭터를 플레이어가 선 칸으로 **끌고 간다.**
  //
  // 아이가 옆으로 비키면 캐릭터도 같은 방향으로 달려간다. 목표에 도착하기 전에
  // 아이가 또 움직이면 가던 방향에서 그대로 방향만 바꾼다 — 그래서 목표를
  // 매 프레임 다시 읽는다.
  _updateCharacter(dt) {
    const zw     = this.lw / 3
    const target = zw * this.playerZone + zw / 2

    if (this._charX === null) { this._charX = target }   // 첫 프레임

    const before = this._charX
    this._charX  = stepToward(this._charX, target, (zw / CHAR_MOVE_MS) * dt)
    const moved  = this._charX - before

    // 임시 표정(놀람·환호)이 남아 있으면 그게 우선이다
    if (this._charPoseMs > 0) {
      this._charPoseMs -= dt
      if (this._charPoseMs > 0) return
    }

    if (Math.abs(moved) < 0.01) {
      this._charPose  = 'idle'
      this._charHopMs = 0
    } else {
      this._charPose   = moved > 0 ? 'right' : 'left'
      this._charHopMs += dt
    }
  }

  _setCharPose(pose, ms) {
    this._charPose   = pose
    this._charPoseMs = ms
  }

  // 떨어질 칸을 고른다 — **기본은 플레이어가 서 있는 칸이다.**
  //
  // 무작위로 떨어뜨리면 가만히 서 있어도 3분의 2는 그냥 지나간다. 운동이 목적인
  // 게임에서 "안 움직여도 되는 순간"이 대부분이면 앉은 자세로 게임이 끝난다.
  // 내가 선 자리로 온다는 규칙은 아이에게도 단순하다 — 오면 옆으로 비킨다.
  _pickZone() {
    const zone = this.playerZone
    const inFlight = new Set(this.poops.map(p => p.zone))

    // 다만 도망갈 칸은 반드시 남겨둔다. 다른 두 칸에 이미 똥이 떨어지는 중인데
    // 남은 한 칸까지 겨누면 어디로 가도 맞는다 — 그건 반응이 아니라 운이다.
    if (!inFlight.has(zone) && inFlight.size >= 2) {
      return [...inFlight][0]
    }
    return zone
  }

  _spawnPoop(speed) {
    const zone = this._pickZone()
    const w    = this.lw
    const zw   = w / 3
    const sc   = this._scale
    this.poops.push({
      zone,
      x:          zw * zone + zw / 2 + (Math.random() - 0.5) * (zw * 0.35),
      y:          -64 * sc,
      rot:        (Math.random() - 0.5) * 0.3,
      rotSpeed:   (Math.random() - 0.5) * 0.002,
      size:       (52 + Math.random() * 20) * sc,
      wobble:     Math.random() * Math.PI * 2,
      wobbleAmp:  (5 + Math.random() * 8) * sc,
      wobbleFreq: 0.002 + Math.random() * 0.002,
    })
  }

  _onHit(poop) {
    this._combo = 0
    this.hitCount++
    this.lives--
    this.onLifeUpdate(this.lives)
    this._showJudge(false)
    this._setCharPose('scared', CHAR_SCARED_MS)
    sound.playHit()
    this._shakeAmount = 14
    this._spawnParticles('hit', poop.x, this.lh - this._floorH, 12)

    if (this.lives <= 0) {
      this._running = false
      this._endGame()
    }
  }

  async _endRound() {
    cancelAnimationFrame(this._rafId)
    const bonus = 100 * this.round
    this.score += bonus
    this.onScoreUpdate(this.score)

    sound.playRoundClear()
    this._setCharPose('cheer', 2400)   // 클리어 오버레이가 떠 있는 동안 계속 환호
    this._spawnCelebration()

    await this._showOverlay(
      `✅ 라운드 ${this.round} 클리어!`,
      `+${bonus}점`,
      '#7c3aed',
      1500
    )

    this.onRoundEnd(this.round, this.score)

    if (this.round < 5 && this.lives > 0) {
      await this.startRound(this.round + 1)
    } else {
      this._endGame()
    }
  }

  // 지금까지의 성적. **끝났을 때와 중간에 그만둘 때가 같은 값을 쓴다.**
  // 두 곳에서 따로 만들면 한쪽만 고쳐져서 기록이 어긋난다.
  snapshot() {
    return {
      score:         this.score,
      roundsCleared: this.round,
      dodgeCount:    this.dodgeCount,
      hitCount:      this.hitCount,
      sideSteps:     this.sideSteps,
      activeSec:     Math.round(this._activeMs / 1000),
      cleared:       this.lives > 0,
    }
  }

  _endGame() {
    cancelAnimationFrame(this._rafId)
    const stats = this.snapshot()
    if (stats.cleared) sound.playGameClear()
    else               sound.playGameOver()
    this.onGameEnd(stats)
  }

  // ── 파티클 ────────────────────────────────────────────────────

  _spawnParticles(type, x, y, count) {
    if (this._particles.length >= MAX_PARTICLES) return
    const isDodge = type === 'dodge'
    const colors  = isDodge
      ? ['#ff96c8', '#96c8ff', '#c896ff', '#ffe94d', '#96ffcc']
      : ['#ff4757', '#ff6b81', '#ff9f43']
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8
      const spd   = 60 + Math.random() * 120
      this._particles.push({
        x, y,
        vx:    Math.cos(angle) * spd,
        vy:    Math.sin(angle) * spd - (isDodge ? 80 : 20),
        life:  1,
        decay: 0.022 + Math.random() * 0.018,
        size:  isDodge ? (3 + Math.random() * 5) : (5 + Math.random() * 7),
        color: colors[Math.floor(Math.random() * colors.length)],
      })
    }
    if (this._particles.length > MAX_PARTICLES) {
      this._particles.splice(0, this._particles.length - MAX_PARTICLES)
    }
  }

  _spawnCelebration() {
    const w = this.lw
    const colors = ['#ff96c8', '#96c8ff', '#c896ff', '#ffe94d', '#96ffcc', '#ffb347']
    for (let i = 0; i < 40; i++) {
      this._particles.push({
        x:     Math.random() * w,
        y:     Math.random() * 80,
        vx:    (Math.random() - 0.5) * 220,
        vy:    60 + Math.random() * 240,
        life:  1,
        decay: 0.005 + Math.random() * 0.008,
        size:  5 + Math.random() * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
      })
    }
  }

  _updateParticles(dt) {
    const dtS = dt / 1000
    this._particles = this._particles.filter(p => {
      p.x   += p.vx * dtS
      p.y   += p.vy * dtS
      p.vy  += 260 * dtS
      p.life -= p.decay
      return p.life > 0
    })
  }

  _renderParticles() {
    const ctx = this.ctx
    for (const p of this._particles) {
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle   = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // ── 렌더링 ────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx
    const w   = this.lw
    const h   = this.lh

    ctx.save()

    if (this._shakeAmount > 0.5) {
      ctx.translate(
        (Math.random() - 0.5) * this._shakeAmount,
        (Math.random() - 0.5) * this._shakeAmount
      )
    }

    // 배경 이미지 (캔디랜드)
    if (this._img.bg) {
      // **늘리지 않고 덮는다(cover).** 0,0,w,h로 그리면 세로로 든 폰에서
      // 가로로 긴 배경이 짓눌려 찌그러진다. 잘리는 건 괜찮아도 비율이 깨지면
      // 캔디랜드가 아니라 뭉개진 그림이 된다.
      const iw = this._img.bg.naturalWidth  || w
      const ih = this._img.bg.naturalHeight || h
      const k  = Math.max(w / iw, h / ih)
      const dw = iw * k, dh = ih * k
      ctx.drawImage(this._img.bg, (w - dw) / 2, (h - dh) / 2, dw, dh)
    } else {
      // 폴백 그라디언트
      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, '#87ceeb')
      bg.addColorStop(1, '#98d975')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
    }

    // 그리는 순서가 곧 앞뒤 관계다.
    //   존 → 버튼 → 캐릭터 → 똥 → 파티클
    // 캐릭터는 버튼보다 **뒤에** 그려 앞으로 나오게 하고,
    // 똥보다는 **먼저** 그려 바닥에 닿는 똥이 캐릭터를 덮게 한다("맞았다"가 읽힌다).
    this._drawZones(w, h)
    this._drawMarkers(w, h)
    this._drawCharacter(w, h)
    this._drawPoops()
    this._renderParticles()

    ctx.restore()
  }

  _drawCharacter(w, h) {
    const ctx  = this.ctx
    // 발은 버튼 그림 윗부분에 딛는다 — 버튼을 발판처럼 밟고 선 모양이 된다
    const ft   = this._footing(h)
    const floor = ft.top + ft.artH * CHAR_FOOT_ON_BTN
    if (this._charX === null) this._charX = (w / 3) * this.playerZone + w / 6

    const img =
      this._img[{ left: 'charLeft', right: 'charRight', scared: 'charScared', cheer: 'charCheer' }[this._charPose]]
      ?? this._img.charIdle
    if (!img) return

    const ch = CHAR_H * this._scale
    const cw = ch * CHAR_RATIO

    // 달릴 때만 통통 튄다. 서 있을 때 흔들리면 산만하다.
    const hop = this._charPose === 'left' || this._charPose === 'right'
      ? Math.abs(Math.sin(this._charHopMs * 0.018)) * CHAR_HOP_PX * this._scale
      : 0

    const x = this._charX - cw / 2
    const y = floor - ch + hop * 0.35 - hop   // 발이 바닥선에 닿는다

    // 발밑 그림자 — 없으면 캐릭터가 공중에 뜬 것처럼 보인다
    ctx.save()
    ctx.globalAlpha = 0.28
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.ellipse(this._charX, floor - 4, cw * 0.30, ch * 0.055, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.drawImage(img, x, y, cw, ch)
  }

  _drawZones(w, h) {
    const ctx   = this.ctx
    const zw    = w / 3
    const floor = h - this._floorH
    const now   = Date.now()

    // 활성 존 컬러 오버레이 (반투명)
    const pulse = 0.08 + 0.05 * Math.sin(now * 0.003)
    const zc    = ZONE_COLORS[this.playerZone]
    ctx.fillStyle = zc.fill.replace('{a}', pulse.toFixed(3))
    ctx.fillRect(this.playerZone * zw, 0, zw, floor)

    // 경고 존 (빨간 깜빡임)
    const warnAlpha = 0.16 + 0.14 * Math.abs(Math.sin(now * 0.009))
    for (const z of this._warnZones) {
      ctx.fillStyle = `rgba(255,50,50,${warnAlpha.toFixed(3)})`
      ctx.fillRect(z * zw, 0, zw, floor)
    }

    // 레인 구분 빔 (흰 광선)
    for (const x of [zw, zw * 2]) {
      const bw   = Math.max(16, zw * 0.05)
      const beam = ctx.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0)
      beam.addColorStop(0,   'rgba(255,255,255,0)')
      beam.addColorStop(0.5, 'rgba(255,255,255,0.28)')
      beam.addColorStop(1,   'rgba(255,255,255,0)')
      ctx.fillStyle = beam
      ctx.fillRect(x - bw / 2, 0, bw, floor)
    }

    // 바닥 경계선은 지웠다.
    // 캐릭터가 버튼을 밟고 서 있는 지금은 "여기가 바닥"이 이미 읽힌다.
    // 배경 위를 가로지르는 흰 선만 남아서 화면을 잘라 보이게 했다.

    // 활성 존 에너지 라인 — 포인트 그린 + 흐르는 펄스
    const GR = 90, GG = 255, GB = 145   // 포인트 그린 RGB
    const baseAlpha = 0.72 + 0.18 * Math.sin(now * 0.003)
    const FLOW_MS   = 1100
    const flowT     = (now % FLOW_MS) / FLOW_MS   // 0→1 반복 (위→아래)
    const pulseY    = flowT * floor
    const trailLen  = floor * 0.22

    const epx1  = this.playerZone * zw
    const epx2  = (this.playerZone + 1) * zw
    const glowW = Math.max(22, zw * 0.058)

    const drawEnergyEdge = (edgeX, dir) => {
      const rx = dir > 0 ? edgeX : edgeX - glowW

      // 1) 베이스 수평 글로우
      const hg = ctx.createLinearGradient(edgeX, 0, edgeX + dir * glowW, 0)
      hg.addColorStop(0,    `rgba(${GR},${GG},${GB},${baseAlpha.toFixed(2)})`)
      hg.addColorStop(0.45, `rgba(${GR},${GG},${GB},${(baseAlpha * 0.25).toFixed(2)})`)
      hg.addColorStop(1,    `rgba(${GR},${GG},${GB},0)`)
      ctx.fillStyle = hg
      ctx.fillRect(rx, 0, glowW, floor)

      // 2) 에너지 펄스 (위→아래로 이동하는 빛)
      const y0 = Math.max(0, pulseY - trailLen)
      const y1 = Math.min(floor, pulseY + trailLen * 0.14)
      if (y1 > y0) {
        const vg = ctx.createLinearGradient(0, y0, 0, y1)
        vg.addColorStop(0,    `rgba(${GR},${GG},${GB},0)`)
        vg.addColorStop(0.6,  `rgba(${GR},${GG},${GB},0.6)`)
        vg.addColorStop(0.88, `rgba(255,255,255,1)`)
        vg.addColorStop(1,    `rgba(${GR},${GG},${GB},0)`)
        ctx.fillStyle = vg
        ctx.fillRect(rx, y0, glowW, y1 - y0)
      }

      // 3) 네온 실선 (그린 글로우 + 화이트 코어)
      ctx.save()
      ctx.shadowColor = `rgb(${GR},${GG},${GB})`
      ctx.shadowBlur  = 28
      ctx.strokeStyle = `rgba(${GR},${GG},${GB},${Math.min(1, baseAlpha + 0.2).toFixed(2)})`
      ctx.lineWidth   = 4
      ctx.beginPath()
      ctx.moveTo(edgeX, 0)
      ctx.lineTo(edgeX, floor)
      ctx.stroke()
      ctx.shadowBlur  = 8
      ctx.strokeStyle = `rgba(220,255,240,0.85)`
      ctx.lineWidth   = 1.4
      ctx.stroke()
      ctx.restore()
    }

    drawEnergyEdge(epx1,  1)
    drawEnergyEdge(epx2, -1)
  }

  _drawPoops() {
    const ctx = this.ctx
    const now = Date.now()
    const img = this._img.poop

    for (const p of this.poops) {
      const wobbleX = Math.sin(now * p.wobbleFreq + p.wobble) * p.wobbleAmp
      ctx.save()
      ctx.translate(p.x + wobbleX, p.y)
      ctx.rotate(p.rot)

      if (img) {
        const sz = p.size * 1.4
        ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz)
      } else {
        ctx.font         = `${p.size}px serif`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('💩', 0, 0)
      }
      ctx.restore()
    }
  }

  // 발판 기하 — 버튼과 캐릭터가 **같은 값**을 본다.
  // 둘이 따로 계산하면 화면 크기가 바뀔 때 한쪽만 움직여서 어긋난다.
  _footing(h) {
    const artH = BTN_ART_H * this._scale
    const cy   = h - this._floorH * 0.52
    return { artH, cy, top: cy - artH / 2 }
  }

  _drawMarkers(w, h) {
    const ctx  = this.ctx
    const zw   = w / 3
    const { cy } = this._footing(h)

    // default / pressed 이미지 쌍
    const defaultImgs = [this._img.btnL,  this._img.btnC,  this._img.btnR]
    const pressedImgs = [this._img.btnLP, this._img.btnCP, this._img.btnRP]

    const fallbackColors = ['#ff64a0', '#5096ff', '#a050ff']
    const labels = ['◀ 왼쪽', '가운데', '오른쪽 ▶']

    for (let i = 0; i < 3; i++) {
      const cx       = zw * i + zw / 2
      const isActive = i === this.playerZone
      const img      = isActive ? (pressedImgs[i] ?? defaultImgs[i]) : defaultImgs[i]

      if (img) {
        // **여백을 뺀 그림 부분만** 그린다. 크기 기준도 그림 높이다.
        // 존 너비의 몇 %로 잡던 때는 큰 모니터에서 화면 절반을 버튼이 먹었고,
        // 박스 높이로 잡았더니 여백 때문에 손톱만 해졌다.
        const box = img._artBox ?? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }
        const ar  = box.w / box.h
        let drawH = this._footing(h).artH
        let drawW = drawH * ar
        const maxW = zw * 0.62
        if (drawW > maxW) { drawW = maxW; drawH = drawW / ar }
        ctx.drawImage(img, box.x, box.y, box.w, box.h,
                      cx - drawW / 2, cy - drawH / 2, drawW, drawH)
      } else {
        // 폴백: 컬러 알약 버튼
        const btnW = Math.min(zw - 24, zw * 0.82)
        const btnH = Math.min(this._floorH - 20, 60 * sc)
        ctx.beginPath()
        ctx.roundRect(cx - btnW / 2, cy - btnH / 2, btnW, btnH, btnH / 2)
        ctx.fillStyle   = isActive ? fallbackColors[i] : `${fallbackColors[i]}99`
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth   = isActive ? 3 : 1
        ctx.stroke()
        const fs = Math.max(12, Math.min(22, 16 * sc))
        ctx.font          = `bold ${fs}px var(--font-main, sans-serif)`
        ctx.textAlign     = 'center'
        ctx.textBaseline  = 'middle'
        ctx.fillStyle     = '#fff'
        ctx.fillText(labels[i], cx, cy)
      }
    }
  }

  // ── 오버레이 헬퍼 (DOM) ──────────────────────────────────────

  get _overlayEl() {
    return this.canvas.parentElement?.querySelector('#game-overlay')
  }

  _showJudge(dodged) {
    if (this._overlayLock) return
    const el = this._overlayEl
    if (!el) return
    const color = dodged ? '#2a8a30' : '#c0392b'
    const borderColor = dodged ? '#6ee75a' : '#ff6b6b'
    const comboLine = dodged && this._combo >= 2
      ? `<div style="font-size:1.2rem;color:#c07800;margin-top:4px;">🔥 ${this._combo} COMBO! +${this._combo * 5}</div>`
      : ''
    el.innerHTML = `
      <div style="
        background:rgba(255,255,255,0.92);
        border:4px solid ${borderColor};
        border-radius:60px;
        padding:14px 32px;
        display:inline-flex;flex-direction:column;align-items:center;
        box-shadow:0 4px 20px rgba(0,0,0,0.22);
        color:${color};font-size:2rem;font-weight:800;
        font-family:var(--font-main);
      ">
        <div>${dodged ? '✅ 피했어요!' : '💥 맞았어요!'}</div>
        ${comboLine}
      </div>`
    el.style.color   = ''
    el.style.fontSize = ''
    el.style.opacity  = '1'
    clearTimeout(this._judgeTimer)
    this._judgeTimer = setTimeout(() => { el.style.opacity = '0'; el.innerHTML = '' }, 900)
  }

  _showOverlay(title, sub, color, ms) {
    return new Promise(resolve => {
      this._overlayLock = true
      const el = this._overlayEl
      if (!el) { this._overlayLock = false; return resolve() }
      el.innerHTML = `
        <div style="
          background:rgba(255,255,255,0.92);
          border:4px solid rgba(196,168,245,0.8);
          border-radius:60px;
          padding:18px 44px;
          display:inline-flex;flex-direction:column;align-items:center;
          box-shadow:0 4px 20px rgba(0,0,0,0.22);
          color:${color};font-family:var(--font-main);
        ">
          <div style="font-size:2rem;font-weight:800;">${title}</div>
          ${sub ? `<div style="font-size:1.15rem;margin-top:6px;opacity:0.75;">${sub}</div>` : ''}
        </div>`
      el.style.color    = ''
      el.style.fontSize = ''
      el.style.opacity  = '1'
      setTimeout(() => {
        el.style.opacity = '0'
        el.innerHTML = ''
        this._overlayLock = false
        resolve()
      }, ms)
    })
  }

  _showBanner(round) {
    const msgs = ['', '준비하세요!', '조금 더 빠르게!', '더 빠르게!', '엄청 빠르다!', '최고 속도!']
    return this._showOverlay(`ROUND ${round}`, msgs[round] ?? '', '#7c3aed', 1500)
  }

  _countdown() {
    const el = this._overlayEl
    return new Promise(resolve => {
      let n = 3
      const tick = () => {
        if (!el) { resolve(); return }
        const isGo = n === 0
        const text = isGo ? 'GO!' : String(n)
        const color = isGo ? '#2a8a30' : '#c4a8f5'
        const borderColor = isGo ? '#6ee75a' : '#a78bda'
        el.innerHTML = `
          <div style="
            background:rgba(255,255,255,0.92);
            border:4px solid ${borderColor};
            border-radius:9999px;
            min-width:120px;
            padding:18px 40px;
            display:inline-flex;align-items:center;justify-content:center;
            box-shadow:0 4px 20px rgba(0,0,0,0.22);
            color:${color};font-size:${isGo ? '3.6rem' : '4.5rem'};font-weight:900;
            font-family:var(--font-main);
          ">${text}</div>`
        el.style.color    = ''
        el.style.fontSize = ''
        el.style.opacity  = '1'
        if (isGo) {
          sound.playGo()
          setTimeout(() => { el.style.opacity = '0'; el.innerHTML = ''; resolve() }, 700)
        } else {
          sound.playBeep()
          setTimeout(() => {
            el.style.opacity = '0'
            n--
            setTimeout(tick, 200)
          }, 700)
        }
      }
      tick()
    })
  }
}

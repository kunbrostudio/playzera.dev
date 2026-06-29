import * as sound from '../../core/sound.js'

const ROUNDS = [
  { duration: 12, speed: 180, spawnMs: 3000 },
  { duration: 11, speed: 260, spawnMs: 2400 },
  { duration: 10, speed: 340, spawnMs: 2000 },
  { duration: 10, speed: 420, spawnMs: 1600 },
  { duration: 10, speed: 500, spawnMs: 1200 },
]

const MAX_LIVES    = 3
const WARN_PX      = 80
const BASE_W       = 1280   // 디자인 기준 너비
const MAX_PARTICLES = 80

export default class PoopDodgeGame {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.ctx    = canvas.getContext('2d')
    this.onRoundEnd   = options.onRoundEnd   ?? (() => {})
    this.onGameEnd    = options.onGameEnd    ?? (() => {})
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
  }

  // ── 논리 픽셀 (DPR 적용 후에도 CSS 픽셀 기준으로 좌표 처리) ──
  get lw() { return this.canvas.offsetWidth  || this.canvas.width }
  get lh() { return this.canvas.offsetHeight || this.canvas.height }
  get _scale() { return Math.min(2.2, Math.max(0.6, this.lw / BASE_W)) }

  init() {
    this._fitCanvas()
    this._buildStars()
    window.addEventListener('resize', this._onResize)
  }

  _fitCanvas() {
    const dpr = window.devicePixelRatio || 1
    this.canvas.width  = this.lw * dpr
    this.canvas.height = this.lh * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  _buildStars() {
    const w = this.lw, h = this.lh
    this.stars = Array.from({ length: 60 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h * 0.75,
      r: Math.random() * 1.5 + 0.5,
      a: Math.random() * 0.6 + 0.2,
    }))
  }

  _onResize = () => { this._fitCanvas(); this._buildStars() }

  // ── 공개 API ────────────────────────────────────────────────

  setPlayerZone(zone) { this.playerZone = zone }

  async startRound(roundNumber) {
    this.round      = roundNumber
    this.poops      = []
    this._particles = []
    this._combo     = 0
    this._warnZones.clear()
    this._paused = false

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
    const cfg  = ROUNDS[this.round - 1]
    const h    = this.lh
    const floor = h - 90

    this._roundTimer -= dt
    this._spawnTimer -= dt
    this._warnZones.clear()

    // 스크린 흔들림 감쇠
    if (this._shakeAmount > 0) {
      this._shakeAmount = Math.max(0, this._shakeAmount - dt * 0.07)
    }

    // 스폰
    if (this._spawnTimer <= 0) {
      this._spawnTimer = cfg.spawnMs
      this._spawnPoop(cfg.speed)
    }

    // 똥 업데이트
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

    if (this._roundTimer <= 0) {
      this._running = false
      this._endRound()
    }
  }

  _spawnPoop(speed) {
    const zone = Math.floor(Math.random() * 3)
    const w    = this.lw
    const zw   = w / 3
    const sc   = this._scale
    this.poops.push({
      zone,
      x:          zw * zone + zw / 2 + (Math.random() - 0.5) * (zw * 0.4),
      y:          -56 * sc,
      rot:        Math.random() * Math.PI * 2,
      rotSpeed:   (Math.random() - 0.5) * 0.004,
      size:       (48 + Math.random() * 16) * sc,
      wobble:     Math.random() * Math.PI * 2,     // 흔들림 위상
      wobbleAmp:  (5 + Math.random() * 8) * sc,    // 흔들림 폭
      wobbleFreq: 0.002 + Math.random() * 0.002,   // 흔들림 주기
    })
  }

  _onHit(poop) {
    this._combo = 0
    this.hitCount++
    this.lives--
    this.onLifeUpdate(this.lives)
    this._showJudge(false)
    sound.playHit()
    this._shakeAmount = 14
    this._spawnParticles('hit', poop.x, this.lh - 90, 12)

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
    this._spawnCelebration()

    await this._showOverlay(
      `✅ 라운드 ${this.round} 클리어!`,
      `+${bonus}점`,
      '#00CF00',
      1500
    )

    this.onRoundEnd(this.round, this.score)

    if (this.round < 5 && this.lives > 0) {
      await this.startRound(this.round + 1)
    } else {
      this._endGame()
    }
  }

  _endGame() {
    cancelAnimationFrame(this._rafId)
    const cleared = this.lives > 0
    if (cleared) sound.playGameClear()
    else         sound.playGameOver()
    this.onGameEnd({
      score:         this.score,
      roundsCleared: this.round,
      dodgeCount:    this.dodgeCount,
      hitCount:      this.hitCount,
    })
  }

  // ── 파티클 ────────────────────────────────────────────────────

  _spawnParticles(type, x, y, count) {
    if (this._particles.length >= MAX_PARTICLES) return
    const isDodge = type === 'dodge'
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8
      const spd   = 60 + Math.random() * 120
      this._particles.push({
        x, y,
        vx:    Math.cos(angle) * spd,
        vy:    Math.sin(angle) * spd - (isDodge ? 80 : 20),
        life:  1,
        decay: 0.022 + Math.random() * 0.018,
        size:  isDodge ? (3 + Math.random() * 4) : (5 + Math.random() * 6),
        color: isDodge ? '#00CF00' : '#ff4757',
      })
    }
    // 상한선 유지
    if (this._particles.length > MAX_PARTICLES) {
      this._particles.splice(0, this._particles.length - MAX_PARTICLES)
    }
  }

  _spawnCelebration() {
    const w = this.lw
    for (let i = 0; i < 30; i++) {
      const colors = ['#00CF00', '#ffe600', '#ff6b6b', '#4ecdc4', '#a8edea']
      this._particles.push({
        x:     Math.random() * w,
        y:     Math.random() * 80,
        vx:    (Math.random() - 0.5) * 200,
        vy:    60 + Math.random() * 220,
        life:  1,
        decay: 0.006 + Math.random() * 0.008,
        size:  5 + Math.random() * 9,
        color: colors[Math.floor(Math.random() * colors.length)],
      })
    }
  }

  _updateParticles(dt) {
    const dtS = dt / 1000
    this._particles = this._particles.filter(p => {
      p.x   += p.vx * dtS
      p.y   += p.vy * dtS
      p.vy  += 260 * dtS  // 중력
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

    // 스크린 흔들림
    if (this._shakeAmount > 0.5) {
      ctx.translate(
        (Math.random() - 0.5) * this._shakeAmount,
        (Math.random() - 0.5) * this._shakeAmount
      )
    }

    // 배경
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#0d1b2a')
    bg.addColorStop(1, '#162032')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    // 별
    for (const s of this.stars) {
      ctx.globalAlpha = s.a
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()
    }
    ctx.globalAlpha = 1

    this._drawZones(w, h)
    this._drawPoops()
    this._drawMarkers(w, h)
    this._renderParticles()

    ctx.restore()
  }

  _drawZones(w, h) {
    const ctx   = this.ctx
    const zw    = w / 3
    const floor = h - 90
    const now   = Date.now()

    // 플레이어 구역 펄스 하이라이트
    const pulse = 0.07 + 0.04 * Math.sin(now * 0.003)
    ctx.fillStyle = `rgba(0,207,0,${pulse.toFixed(3)})`
    ctx.fillRect(this.playerZone * zw, 0, zw, floor)

    // 경고 구역 (시간 기반 깜빡임)
    const warnAlpha = 0.12 + 0.12 * Math.abs(Math.sin(now * 0.009))
    for (const z of this._warnZones) {
      ctx.fillStyle = `rgba(255,71,87,${warnAlpha.toFixed(3)})`
      ctx.fillRect(z * zw, 0, zw, floor)
    }

    // 구역 구분 점선
    ctx.setLineDash([8, 10])
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth   = 1
    for (const x of [zw, zw * 2]) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, floor)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // 바닥 라인
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth   = 1
    ctx.beginPath()
    ctx.moveTo(0, floor)
    ctx.lineTo(w, floor)
    ctx.stroke()
  }

  _drawPoops() {
    const ctx = this.ctx
    const now = Date.now()
    for (const p of this.poops) {
      // 좌우 흔들림 (wobble)
      const wobbleX = Math.sin(now * p.wobbleFreq + p.wobble) * p.wobbleAmp
      ctx.save()
      ctx.translate(p.x + wobbleX, p.y)
      ctx.rotate(p.rot)
      ctx.font          = `${p.size}px serif`
      ctx.textAlign     = 'center'
      ctx.textBaseline  = 'middle'
      ctx.fillText('💩', 0, 0)
      ctx.restore()
    }
  }

  _drawMarkers(w, h) {
    const ctx  = this.ctx
    const sc   = this._scale
    const zw   = w / 3
    const cy   = h - 45
    const r    = Math.round(36 * sc)
    const fs   = Math.max(11, Math.min(22, 15 * sc))
    const labels = ['◀ 왼쪽', '가운데', '오른쪽 ▶']

    for (let i = 0; i < 3; i++) {
      const cx      = zw * i + zw / 2
      const isPlayer = i === this.playerZone
      const isWarn   = this._warnZones.has(i)
      const bx       = cx - zw / 2 + 12
      const bw       = zw - 24

      ctx.beginPath()
      ctx.roundRect(bx, cy - r, bw, r * 2, 12)

      if (isPlayer) {
        ctx.fillStyle = 'rgba(0,207,0,0.18)'; ctx.fill()
        ctx.shadowColor = '#00CF00'
        ctx.shadowBlur  = isWarn ? 0 : 20 * sc
        ctx.strokeStyle = '#00CF00'; ctx.lineWidth = 3; ctx.stroke()
        ctx.shadowBlur  = 0
      } else if (isWarn) {
        ctx.fillStyle = 'rgba(255,71,87,0.18)'; ctx.fill()
        ctx.shadowColor = '#ff4757'
        ctx.shadowBlur  = 20 * sc
        ctx.strokeStyle = '#ff4757'; ctx.lineWidth = 3; ctx.stroke()
        ctx.shadowBlur  = 0
      } else {
        ctx.fillStyle   = 'rgba(255,255,255,0.05)'; ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.stroke()
      }

      ctx.font          = `bold ${fs}px Pretendard, sans-serif`
      ctx.textAlign     = 'center'
      ctx.textBaseline  = 'middle'
      ctx.fillStyle     = isPlayer ? '#00CF00' : isWarn ? '#ff4757' : 'rgba(255,255,255,0.5)'
      ctx.fillText(labels[i], cx, cy)
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
    const comboLine = dodged && this._combo >= 2
      ? `<div style="font-size:1.3rem;color:#ffe600;margin-top:6px;">🔥 ${this._combo} COMBO! +${this._combo * 5}</div>`
      : ''
    el.innerHTML    = `<div>${dodged ? '✅ 피했어요!' : '💥 맞았어요!'}</div>${comboLine}`
    el.style.color  = dodged ? '#00CF00' : '#ff4757'
    el.style.fontSize = '2.2rem'
    el.style.opacity  = '1'
    clearTimeout(this._judgeTimer)
    this._judgeTimer = setTimeout(() => { el.style.opacity = '0'; el.innerHTML = '' }, 900)
  }

  _showOverlay(title, sub, color, ms) {
    return new Promise(resolve => {
      this._overlayLock = true
      const el = this._overlayEl
      if (!el) { this._overlayLock = false; return resolve() }
      el.innerHTML  = `<div style="font-size:2rem;font-weight:800;">${title}</div><div style="font-size:1.2rem;margin-top:8px;opacity:0.8;">${sub}</div>`
      el.style.color   = color
      el.style.fontSize = '1rem'
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
    return this._showOverlay(`ROUND ${round}`, msgs[round] ?? '', '#ffe600', 1500)
  }

  _countdown() {
    const el = this._overlayEl
    return new Promise(resolve => {
      let n = 3
      const tick = () => {
        if (!el) { resolve(); return }
        if (n === 0) {
          el.textContent  = 'GO!'
          el.style.color  = '#00CF00'
          el.style.fontSize = '4rem'
          el.style.opacity  = '1'
          sound.playGo()
          setTimeout(() => { el.style.opacity = '0'; resolve() }, 700)
          return
        }
        el.textContent    = String(n)
        el.style.color    = '#ffe600'
        el.style.fontSize = '5rem'
        el.style.opacity  = '1'
        sound.playBeep()
        setTimeout(() => {
          el.style.opacity = '0'
          n--
          setTimeout(tick, 200)
        }, 700)
      }
      tick()
    })
  }
}

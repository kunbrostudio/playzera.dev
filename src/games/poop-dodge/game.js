import * as sound from '../../core/sound.js'

const ROUNDS = [
  { duration: 12, speed: 180, spawnMs: 3000 },
  { duration: 11, speed: 260, spawnMs: 2400 },
  { duration: 10, speed: 340, spawnMs: 2000 },
  { duration: 10, speed: 420, spawnMs: 1600 },
  { duration: 10, speed: 500, spawnMs: 1200 },
]

const MAX_LIVES     = 3
const WARN_PX       = 80
const BASE_W        = 1280
const MAX_PARTICLES = 80
const FLOOR_H       = 110  // 하단 버튼 영역 높이

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

    // 이미지 에셋
    this._img = {}
    this._loadImages()
  }

  _loadImages() {
    const load = (key, src) => {
      const img = new Image()
      img.onload  = () => { this._img[key] = img }
      img.onerror = () => {}
      img.src = src
    }
    load('bg',   '/assets/image/poop_game_bg.jpg')
    load('poop', '/assets/image/poop01_default.png')
    load('btnL', '/assets/image/btn_left_default.png')
    load('btnC', '/assets/image/btn_center_default.png')
    load('btnR', '/assets/image/btn_right_default.png')
    load('btnLP', '/assets/image/btn_left_pressed.png')
    load('btnCP', '/assets/image/btn_center_pressed.png')
    load('btnRP', '/assets/image/btn_right_pressed.png')
  }

  // ── 논리 픽셀 ────────────────────────────────────────────────
  get lw() { return this.canvas.offsetWidth  || this.canvas.width }
  get lh() { return this.canvas.offsetHeight || this.canvas.height }
  get _scale() { return Math.min(2.2, Math.max(0.6, this.lw / BASE_W)) }

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

  _onResize = () => { this._fitCanvas() }

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
    const cfg   = ROUNDS[this.round - 1]
    const h     = this.lh
    const floor = h - FLOOR_H

    this._roundTimer -= dt
    this._spawnTimer -= dt
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
    sound.playHit()
    this._shakeAmount = 14
    this._spawnParticles('hit', poop.x, this.lh - FLOOR_H, 12)

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
      ctx.drawImage(this._img.bg, 0, 0, w, h)
    } else {
      // 폴백 그라디언트
      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, '#87ceeb')
      bg.addColorStop(1, '#98d975')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
    }

    this._drawZones(w, h)
    this._drawPoops()
    this._drawMarkers(w, h)
    this._renderParticles()

    ctx.restore()
  }

  _drawZones(w, h) {
    const ctx   = this.ctx
    const zw    = w / 3
    const floor = h - FLOOR_H
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

    // 바닥 경계선
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth   = 2
    ctx.beginPath()
    ctx.moveTo(0, floor)
    ctx.lineTo(w, floor)
    ctx.stroke()

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

  _drawMarkers(w, h) {
    const ctx  = this.ctx
    const sc   = this._scale
    const zw   = w / 3
    const cy   = h - FLOOR_H / 2

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
        // 원본 비율 유지: 존 너비의 82%를 기준으로 높이 계산
        const drawW = Math.min(zw - 32, zw * 0.66)
        const drawH = drawW * (img.naturalHeight / img.naturalWidth)
        ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH)
      } else {
        // 폴백: 컬러 알약 버튼
        const btnW = Math.min(zw - 24, zw * 0.82)
        const btnH = Math.min(FLOOR_H - 20, 60 * sc)
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

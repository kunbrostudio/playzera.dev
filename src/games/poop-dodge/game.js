const ROUNDS = [
  { duration: 12, speed: 180, spawnMs: 3000 },
  { duration: 11, speed: 260, spawnMs: 2400 },
  { duration: 10, speed: 340, spawnMs: 2000 },
  { duration: 10, speed: 420, spawnMs: 1600 },
  { duration: 10, speed: 500, spawnMs: 1200 },
]

const MAX_LIVES = 3
const WARN_PX = 80     // 바닥 위 이 px부터 경고
const POOP_SIZE = 56

export default class PoopDodgeGame {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.onRoundEnd = options.onRoundEnd ?? (() => {})
    this.onGameEnd = options.onGameEnd ?? (() => {})
    this.onScoreUpdate = options.onScoreUpdate ?? (() => {})
    this.onLifeUpdate = options.onLifeUpdate ?? (() => {})

    this.playerZone = 1
    this.lives = MAX_LIVES
    this.score = 0
    this.round = 0
    this.poops = []
    this.stars = []
    this.dodgeCount = 0
    this.hitCount = 0

    this._paused = false
    this._running = false
    this._rafId = null
    this._spawnTimer = 0
    this._roundTimer = 0
    this._lastTime = 0
    this._warnZones = new Set()

    // 콜백 큐: 동시에 하나의 오버레이만 표시
    this._overlayLock = false
  }

  init() {
    this._fitCanvas()
    this._buildStars()
    window.addEventListener('resize', this._onResize)
  }

  _fitCanvas() {
    this.canvas.width = this.canvas.offsetWidth
    this.canvas.height = this.canvas.offsetHeight
  }

  _buildStars() {
    const { width: w, height: h } = this.canvas
    this.stars = Array.from({ length: 60 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h * 0.75,
      r: Math.random() * 1.5 + 0.5,
      a: Math.random() * 0.6 + 0.2,
    }))
  }

  _onResize = () => {
    this._fitCanvas()
    this._buildStars()
  }

  // ── 공개 API ────────────────────────────────────────────

  setPlayerZone(zone) {
    this.playerZone = zone
  }

  async startRound(roundNumber) {
    this.round = roundNumber
    this.poops = []
    this._warnZones.clear()
    this._paused = false

    const cfg = ROUNDS[roundNumber - 1]
    this._roundTimer = cfg.duration * 1000
    this._spawnTimer = 0

    // 라운드 배너
    await this._showBanner(roundNumber)
    // 카운트다운 3→2→1→GO
    await this._countdown()

    this._running = true
    this._lastTime = performance.now()
    this._loop()
  }

  pause() {
    this._paused = true
  }

  resume() {
    if (!this._paused) return
    this._paused = false
    this._lastTime = performance.now()
    this._loop()
  }

  destroy() {
    this._running = false
    cancelAnimationFrame(this._rafId)
    window.removeEventListener('resize', this._onResize)
  }

  // ── 게임 루프 ────────────────────────────────────────────

  _loop() {
    if (!this._running || this._paused) return
    const now = performance.now()
    const dt = Math.min(now - this._lastTime, 100)
    this._lastTime = now
    this.update(dt)
    this.render()
    this._rafId = requestAnimationFrame(() => this._loop())
  }

  update(dt) {
    const cfg = ROUNDS[this.round - 1]
    this._roundTimer -= dt
    this._spawnTimer -= dt
    this._warnZones.clear()

    const h = this.canvas.height
    const floor = h - 90  // 구역 마커 위

    // 스폰
    if (this._spawnTimer <= 0) {
      this._spawnTimer = cfg.spawnMs
      this._spawnPoop(cfg.speed)
    }

    // 똥 업데이트
    const survived = []
    for (const p of this.poops) {
      p.y += (cfg.speed * dt) / 1000
      p.rot += p.rotSpeed * dt

      if (p.y >= floor - WARN_PX) {
        this._warnZones.add(p.zone)
      }

      if (p.y >= floor) {
        // 충돌 판정
        if (p.zone === this.playerZone) {
          this._onHit(p)
        } else {
          this.dodgeCount++
          this.score += 10
          this.onScoreUpdate(this.score)
          this._showJudge(true)
        }
        continue
      }
      survived.push(p)
    }
    this.poops = survived

    // 라운드 시간 종료
    if (this._roundTimer <= 0) {
      this._running = false
      this._endRound()
    }
  }

  _spawnPoop(speed) {
    const zone = Math.floor(Math.random() * 3)
    const w = this.canvas.width
    const zw = w / 3
    this.poops.push({
      zone,
      x: zw * zone + zw / 2 + (Math.random() - 0.5) * (zw * 0.4),
      y: -POOP_SIZE,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.004,
      size: POOP_SIZE + Math.random() * 16 - 8,
    })
  }

  _onHit(poop) {
    this.hitCount++
    this.lives--
    this.onLifeUpdate(this.lives)
    this._showJudge(false)
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
    const stats = {
      score: this.score,
      roundsCleared: this.round,
      dodgeCount: this.dodgeCount,
      hitCount: this.hitCount,
    }
    this.onGameEnd(stats)
  }

  // ── 렌더링 ────────────────────────────────────────────────

  render() {
    const ctx = this.ctx
    const { width: w, height: h } = this.canvas

    // 배경 그라디언트
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
  }

  _drawZones(w, h) {
    const ctx = this.ctx
    const zw = w / 3
    const floor = h - 90

    // 플레이어 구역 하이라이트
    ctx.fillStyle = 'rgba(0,207,0,0.1)'
    ctx.fillRect(this.playerZone * zw, 0, zw, floor)

    // 경고 구역 빨간 오버레이
    for (const z of this._warnZones) {
      ctx.fillStyle = 'rgba(255,71,87,0.18)'
      ctx.fillRect(z * zw, 0, zw, floor)
    }

    // 구역 구분 점선
    ctx.setLineDash([8, 10])
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    for (const x of [zw, zw * 2]) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, floor)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // 바닥 라인
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, floor)
    ctx.lineTo(w, floor)
    ctx.stroke()
  }

  _drawPoops() {
    const ctx = this.ctx
    for (const p of this.poops) {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.font = `${p.size}px serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('💩', 0, 0)
      ctx.restore()
    }
  }

  _drawMarkers(w, h) {
    const ctx = this.ctx
    const zw = w / 3
    const cy = h - 45
    const labels = ['◀ 왼쪽', '가운데', '오른쪽 ▶']

    for (let i = 0; i < 3; i++) {
      const cx = zw * i + zw / 2
      const isPlayer = i === this.playerZone
      const isWarn = this._warnZones.has(i)

      const r = 36
      ctx.beginPath()
      ctx.roundRect(cx - zw / 2 + 12, cy - r, zw - 24, r * 2, 12)

      if (isPlayer) {
        ctx.fillStyle = 'rgba(0,207,0,0.18)'
        ctx.fill()
        // glow
        ctx.shadowColor = '#00CF00'
        ctx.shadowBlur = isWarn ? 0 : 18
        ctx.strokeStyle = '#00CF00'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.shadowBlur = 0
      } else if (isWarn) {
        ctx.fillStyle = 'rgba(255,71,87,0.18)'
        ctx.fill()
        ctx.shadowColor = '#ff4757'
        ctx.shadowBlur = 18
        ctx.strokeStyle = '#ff4757'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.shadowBlur = 0
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      ctx.font = 'bold 15px Pretendard, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = isPlayer ? '#00CF00' : isWarn ? '#ff4757' : 'rgba(255,255,255,0.5)'
      ctx.fillText(labels[i], cx, cy)
    }
  }

  // ── 오버레이 헬퍼 (DOM) ──────────────────────────────────

  get _overlayEl() {
    return this.canvas.parentElement?.querySelector('#game-overlay')
  }

  _showJudge(dodged) {
    if (this._overlayLock) return
    const el = this._overlayEl
    if (!el) return
    el.textContent = dodged ? '✅ 피했어요!' : '💥 맞았어요!'
    el.style.color = dodged ? '#00CF00' : '#ff4757'
    el.style.fontSize = '2.2rem'
    el.style.opacity = '1'
    clearTimeout(this._judgeTimer)
    this._judgeTimer = setTimeout(() => { el.style.opacity = '0' }, 800)
  }

  _showOverlay(title, sub, color, ms) {
    return new Promise(resolve => {
      this._overlayLock = true
      const el = this._overlayEl
      if (!el) { this._overlayLock = false; return resolve() }
      el.innerHTML = `<div style="font-size:2rem;font-weight:800;">${title}</div><div style="font-size:1.2rem;margin-top:8px;opacity:0.8;">${sub}</div>`
      el.style.color = color
      el.style.fontSize = '1rem'
      el.style.opacity = '1'
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
          el.textContent = 'GO!'
          el.style.color = '#00CF00'
          el.style.fontSize = '4rem'
          el.style.opacity = '1'
          setTimeout(() => { el.style.opacity = '0'; resolve() }, 700)
          return
        }
        el.textContent = String(n)
        el.style.color = '#ffe600'
        el.style.fontSize = '5rem'
        el.style.opacity = '1'
        setTimeout(() => { el.style.opacity = '0'; n--; setTimeout(tick, 200) }, 700)
      }
      tick()
    })
  }
}

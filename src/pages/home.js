import { navigate } from '../core/router.js'
import { GAME_REGISTRY } from '../games/registry.js'

const GAMES = Object.entries(GAME_REGISTRY).map(([id, { manifest }]) => ({
  id,
  emoji: manifest.emoji,
  title: manifest.title,
  desc: manifest.description ?? '',
}))

export function homePage(app) {
  const gameCards = GAMES.map(g => `
    <div class="card game-card" data-id="${g.id}" style="
      cursor:pointer;min-width:200px;text-align:center;
      transition:transform 0.15s,box-shadow 0.15s;
    ">
      <div style="font-size:3.5rem;margin-bottom:12px;">${g.emoji}</div>
      <div style="font-size:1.1rem;font-weight:700;color:var(--color-text);">${g.title}</div>
      <div style="font-size:0.8rem;color:var(--color-sub);margin-top:6px;">${g.desc}</div>
    </div>
  `).join('')

  app.innerHTML = `
    <div style="
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      height:100vh;gap:32px;padding:24px;font-family:var(--font-main);
    ">
      <div style="text-align:center;">
        <h1 style="font-size:2.8rem;font-weight:800;color:var(--color-accent);margin-bottom:6px;">Playzera</h1>
        <p style="color:var(--color-sub);">유아체육 게임 플랫폼</p>
      </div>

      <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;">
        ${gameCards}
      </div>

      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        <button class="btn-ghost" id="btn-control" style="font-size:0.9rem;">🎮 선생님 컨트롤러</button>
        <button class="btn-ghost" id="btn-camera" style="font-size:0.9rem;">📷 카메라 모드</button>
      </div>
    </div>
  `

  // 게임 카드 hover
  app.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-4px)'
      card.style.boxShadow = '0 8px 32px rgba(0,207,0,0.2)'
    })
    card.addEventListener('mouseleave', () => {
      card.style.transform = ''
      card.style.boxShadow = ''
    })
    card.addEventListener('click', () => {
      navigate(`/game?id=${card.dataset.id}`)
    })
  })

  app.querySelector('#btn-control').addEventListener('click', () => navigate('/control'))
  app.querySelector('#btn-camera').addEventListener('click', () => navigate('/camera'))
}

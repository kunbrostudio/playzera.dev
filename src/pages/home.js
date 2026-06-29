import { navigate } from '../core/router.js'

export function homePage(app) {
  app.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:16px;">
      <h1 style="font-size:2.5rem;font-weight:800;color:var(--color-accent)">Playzera</h1>
      <p style="color:var(--color-sub);margin-bottom:24px">유아체육 게임 플랫폼</p>
      <button class="btn-primary" id="btn-game">게임 화면 (TV)</button>
      <button class="btn-ghost" id="btn-control">컨트롤러 (선생님)</button>
      <button class="btn-ghost" id="btn-camera">카메라 모드</button>
    </div>
  `
  app.querySelector('#btn-game').addEventListener('click', () => navigate('/game'))
  app.querySelector('#btn-control').addEventListener('click', () => navigate('/control'))
  app.querySelector('#btn-camera').addEventListener('click', () => navigate('/camera'))
}

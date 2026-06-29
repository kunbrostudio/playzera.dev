import { navigate } from '../core/router.js'

export function cameraPage(app, query) {
  const session = query.session ?? '(없음)'

  app.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:12px;">
      <h2 style="color:var(--color-text)">카메라 모드</h2>
      <p style="color:var(--color-sub)">session: ${session}</p>
      <button class="btn-ghost" id="btn-home">홈으로</button>
    </div>
  `
  app.querySelector('#btn-home').addEventListener('click', () => navigate('/'))
}

import { navigate } from '../core/router.js'

export function controlPage(app, query) {
  const session = query.session ?? '(없음)'

  app.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:12px;">
      <h2 style="color:var(--color-accent2)">선생님 컨트롤러</h2>
      <p style="color:var(--color-sub)">session: ${session}</p>
      <button class="btn-ghost" id="btn-home">홈으로</button>
    </div>
  `
  app.querySelector('#btn-home').addEventListener('click', () => navigate('/'))
}

import { homePage } from '../pages/home.js'
import { gamePage } from '../pages/game.js'
import { controlPage } from '../pages/control.js'
import { cameraPage } from '../pages/camera.js'

const routes = {
  '/': homePage,
  '/game': gamePage,
  '/control': controlPage,
  '/camera': cameraPage,
}

function parseHash() {
  const hash = window.location.hash.replace('#', '') || '/'
  const [path, qs] = hash.split('?')
  const query = Object.fromEntries(new URLSearchParams(qs))
  return { path: path || '/', query }
}

function render() {
  const { path, query } = parseHash()
  const page = routes[path] ?? routes['/']
  const app = document.getElementById('app')
  app.innerHTML = ''
  page(app, query)
}

export function navigate(path) {
  window.location.hash = path
}

window.addEventListener('hashchange', render)
window.addEventListener('load', render)

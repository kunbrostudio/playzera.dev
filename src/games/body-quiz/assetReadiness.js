// BODY QUIZ 화면 전용 asset readiness.
//
// 이 파일은 intro/tutorial/play의 첫 인상에 꼭 필요한 이미지만 기다린다.
// Play Zera 전체 로더로 올리지 않은 이유는 화면별 critical 범위와 전환
// 규칙을 BODY QUIZ에서 먼저 검증하기 위해서다.

import { TUTORIAL_STEPS } from './tutorialSteps.js'
import { showLoadingScreen } from '../../core/loadingScreen.js'

const INTRO_HERO = '/assets/body-quiz/intro/thum_bodyquiz.png'
const TUTORIAL_BG = '/assets/body-quiz/tutorial/bg_room.png'
const TUTORIAL_TITLE = '/assets/body-quiz/tutorial/tutorial_title.png'

export const BODY_QUIZ_CRITICAL_ASSETS = Object.freeze({
  intro: Object.freeze([INTRO_HERO]),
  tutorialShell: Object.freeze([
    TUTORIAL_BG,
    TUTORIAL_TITLE,
    TUTORIAL_STEPS[0].boyImage,
    TUTORIAL_STEPS[0].girlImage,
  ]),
})

function uniqueAssets(assets) {
  const seen = new Set()
  return assets.filter(asset => {
    const src = typeof asset === 'string' ? asset : asset?.src
    if (!src || seen.has(src)) return false
    seen.add(src)
    return true
  })
}

export function getBodyQuizTutorialAssets(question, stepIndex = 0) {
  const step = TUTORIAL_STEPS[stepIndex]
  return uniqueAssets([
    ...BODY_QUIZ_CRITICAL_ASSETS.tutorialShell,
    question?.left?.image,
    question?.right?.image,
    step?.boyImage,
    step?.girlImage,
    step?.centerImage,
    step?.squatImages?.down,
    step?.squatImages?.up,
  ])
}

export function getBodyQuizPlayAssets(question) {
  // 카메라와 header/HUD 아이콘은 code UI다. 지정 guide asset은 아직 저장소에
  // 없고 선택 요소라 critical에 넣지 않는다. 첫 문제 답 카드만 필수다.
  return uniqueAssets([question?.left?.image, question?.right?.image])
}

function delay(ms) {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve()
}

/**
 * memoized image load + decode loader. 결과는 reject하지 않고 상태로 돌려줘
 * 화면이 fallback 또는 재시도 UI를 선택할 수 있게 한다.
 */
export function createBodyQuizAssetReadiness({ ImageCtor = globalThis.Image } = {}) {
  const cache = new Map()
  // Native Promise에는 상태 조회가 없어 성공 URL을 별도로 추적한다.
  const readySources = new Set()

  function loadSource(src) {
    if (cache.has(src)) return cache.get(src)

    const pending = new Promise(resolve => {
      if (!ImageCtor) {
        resolve({ src, ok: false, error: new Error('Image is unavailable') })
        return
      }

      let image
      try {
        image = new ImageCtor()
      } catch (error) {
        resolve({ src, ok: false, error })
        return
      }
      let settled = false
      let decoding = false
      const finish = result => {
        if (settled) return
        settled = true
        image.onload = null
        image.onerror = null
        if (result.ok) readySources.add(src)
        else readySources.delete(src)
        resolve({ src, image, ...result })
      }
      const decodeAfterLoad = async () => {
        if (decoding || settled) return
        decoding = true
        if (typeof image.decode === 'function') {
          try {
            await image.decode()
            finish({ ok: true, decoded: true })
            return
          } catch (error) {
            // 일부 브라우저는 이미 load된 이미지에도 decode()를 reject한다.
            // onload 완료 자체가 안전한 fallback이므로 broken으로 보지 않는다.
            finish({ ok: true, decoded: false, decodeError: error })
            return
          }
        }
        finish({ ok: true, decoded: false })
      }

      image.onload = decodeAfterLoad
      image.onerror = () => finish({ ok: false, error: new Error(`Failed to load ${src}`) })
      try {
        image.src = src
      } catch (error) {
        finish({ ok: false, error })
        return
      }
      if (image.complete && image.naturalWidth > 0) decodeAfterLoad()
    })

    cache.set(src, pending)
    return pending
  }

  async function loadAsset(asset) {
    const descriptor = typeof asset === 'string' ? { src: asset } : asset
    const primary = await loadSource(descriptor.src)
    if (primary.ok || !descriptor.fallback) return primary
    const fallback = await loadSource(descriptor.fallback)
    return fallback.ok
      ? { ...fallback, requestedSrc: descriptor.src, usedFallback: true }
      : { ...primary, fallbackError: fallback.error }
  }

  async function preload(assets) {
    return Promise.all(uniqueAssets(assets).map(loadAsset))
  }

  async function waitFor(assets, { minMs = 500, maxMs = 9000 } = {}) {
    const list = uniqueAssets(assets)
    let timeoutId = null
    const timeout = new Promise(resolve => {
      timeoutId = setTimeout(() => resolve({ timedOut: true, results: [] }), maxMs)
    })
    const loaded = preload(list).then(results => ({ timedOut: false, results }))
    const [outcome] = await Promise.all([Promise.race([loaded, timeout]), delay(minMs)])
    if (timeoutId !== null) clearTimeout(timeoutId)

    const failed = outcome.timedOut
      ? list.map(asset => ({ src: typeof asset === 'string' ? asset : asset.src, ok: false, timedOut: true }))
      : outcome.results.filter(result => !result.ok)
    return {
      ready: !outcome.timedOut && failed.length === 0,
      timedOut: outcome.timedOut,
      results: outcome.results,
      failed,
    }
  }

  function areReady(assets) {
    return uniqueAssets(assets).every(asset => {
      const descriptor = typeof asset === 'string' ? { src: asset } : asset
      return readySources.has(descriptor.src) || (descriptor.fallback && readySources.has(descriptor.fallback))
    })
  }

  function invalidate(assets) {
    for (const asset of uniqueAssets(assets)) {
      const descriptor = typeof asset === 'string' ? { src: asset } : asset
      cache.delete(descriptor.src)
      readySources.delete(descriptor.src)
      if (descriptor.fallback) {
        cache.delete(descriptor.fallback)
        readySources.delete(descriptor.fallback)
      }
    }
  }

  return { preload, waitFor, areReady, invalidate }
}

export const bodyQuizAssetReadiness = createBodyQuizAssetReadiness()

const GATE_STYLE_ID = 'body-quiz-asset-gate-style'

function ensureGateStyle(doc) {
  if (doc.getElementById(GATE_STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = GATE_STYLE_ID
  style.textContent = `
    .bq-readiness-host { position: relative; }
    .bq-readiness-host[data-bq-readiness="loading"] > :not(.bq-asset-gate):not(style),
    .bq-readiness-host[data-bq-readiness="error"] > :not(.bq-asset-gate):not(style) { visibility: hidden !important; }
    .bq-readiness-host[data-bq-readiness="transition"] > :not(.bq-asset-gate):not(style) { pointer-events: none !important; }
    .bq-asset-gate {
      position: absolute; inset: 0; z-index: 2147483000; overflow: hidden;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 14px; padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right))
        max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
      background: radial-gradient(circle at 50% 42%, #563f91 0%, #251446 58%, #130a29 100%);
      color: #fff; text-align: center; font-family: var(--font-main, 'Jua', sans-serif);
    }
    .bq-asset-gate[hidden] { display: none; }
    .bq-asset-gate strong { font-size: clamp(1rem, 2.5vmin, 1.45rem); }
    .bq-asset-gate span { max-width: 34rem; color: #eee8ff; font-size: clamp(.75rem, 1.8vmin, 1rem); line-height: 1.4; }
    .bq-asset-gate button { min-height: 44px; padding: 0 26px; border: 3px solid #fff; border-radius: 9999px; background: linear-gradient(180deg,#fff59c,#ffcf35); color: #542f00; font: inherit; font-weight: 900; box-shadow: 0 5px 0 #a96a12; cursor: pointer; }
    .bq-asset-gate button:active { transform: translateY(3px); box-shadow: 0 2px 0 #a96a12; }
  `
  doc.head.appendChild(style)
}

/** 화면 콘텐츠를 실제로 막는 BODY QUIZ 로컬 interaction gate. */
export function createBodyQuizLoadingGate(host, { loadingScreen = showLoadingScreen } = {}) {
  const doc = host.ownerDocument
  ensureGateStyle(doc)
  host.classList.add('bq-readiness-host')
  const overlay = doc.createElement('div')
  overlay.className = 'bq-asset-gate'
  overlay.setAttribute('role', 'status')
  overlay.setAttribute('aria-live', 'polite')
  overlay.innerHTML = `<strong></strong><span></span><button type="button" hidden>다시 시도</button>`
  overlay.hidden = true
  host.appendChild(overlay)
  const title = overlay.querySelector('strong')
  const detail = overlay.querySelector('span')
  const retry = overlay.querySelector('button')
  let retryHandler = null
  let loadingHandle = null

  function releaseLoadingScreen() {
    loadingHandle?.release()
    loadingHandle = null
  }

  function setButtonsDisabled(disabled) {
    for (const button of host.querySelectorAll('button')) {
      if (overlay.contains(button)) continue
      if (disabled) {
        if (!button.hasAttribute('data-bq-was-disabled')) button.dataset.bqWasDisabled = button.disabled ? '1' : '0'
        button.disabled = true
      } else if (button.hasAttribute('data-bq-was-disabled')) {
        button.disabled = button.dataset.bqWasDisabled === '1'
        delete button.dataset.bqWasDisabled
      }
    }
  }

  function showLoading({ transition = false } = {}) {
    host.dataset.bqReadiness = transition ? 'transition' : 'loading'
    overlay.hidden = true
    overlay.classList.remove('is-error')
    retry.hidden = true
    retryHandler = null
    setButtonsDisabled(true)
    // BODY QUIZ의 partial content는 local gate가 숨기고, 사용자가 보는 것은
    // 프로젝트 공식 Play Zera Loading Screen 한 벌뿐이다.
    if (!loadingHandle) loadingHandle = loadingScreen(doc.body, { immediate: true })
  }

  function showError({ onRetry, timedOut = false } = {}) {
    host.dataset.bqReadiness = 'error'
    overlay.hidden = false
    overlay.classList.add('is-error')
    title.textContent = '화면을 준비하지 못했어요'
    detail.textContent = timedOut ? '네트워크 상태를 확인하고 다시 시도해주세요' : '필요한 이미지를 불러오지 못했어요. 다시 시도해주세요'
    retry.hidden = false
    retryHandler = onRetry
    setButtonsDisabled(true)
    releaseLoadingScreen()
  }

  function reveal() {
    host.dataset.bqReadiness = 'ready'
    overlay.hidden = true
    setButtonsDisabled(false)
    releaseLoadingScreen()
  }

  function onRetryClick() { retryHandler?.() }
  retry.addEventListener('click', onRetryClick)

  return {
    overlay,
    showLoading,
    showError,
    reveal,
    destroy() {
      retry.removeEventListener('click', onRetryClick)
      releaseLoadingScreen()
      setButtonsDisabled(false)
      overlay.remove()
      host.classList.remove('bq-readiness-host')
      delete host.dataset.bqReadiness
    },
  }
}

/** 실패/timeout은 broken 화면 공개 대신 bounded retry state로 남긴다. */
export async function openBodyQuizReadinessGate({ gate, readiness = bodyQuizAssetReadiness, assets, transition = false, message, onReady, onRetry, isAlive = () => true, minMs = 500, maxMs = 9000 }) {
  gate.showLoading({ transition, message })
  const result = await readiness.waitFor(assets, { minMs, maxMs })
  if (!isAlive()) return result
  if (result.ready) {
    gate.reveal()
    onReady?.(result)
  } else {
    console.warn('[body-quiz] critical asset readiness failed:', result)
    gate.showError({ timedOut: result.timedOut, onRetry: () => {
      readiness.invalidate?.(assets)
      onRetry?.()
    } })
  }
  return result
}

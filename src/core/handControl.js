// 손 컨트롤을 켜는 흐름과 실패 안내 문구.
//
// 허브에만 있던 코드다. 인트로·튜토리얼에서도 손을 켤 수 있어야 해서 뺐다.
// **문구를 화면마다 따로 쓰면 반드시 갈린다** — 같은 카메라 오류인데 허브에서는
// "다른 앱이 카메라를 쓰고 있어요", 인트로에서는 "카메라 오류"가 뜨는 식이다.
//
// 화면은 버튼 생김새만 각자 가지고, 켜고 끄는 판단과 안내는 여기를 쓴다.

import { handSession } from './handSession.js'

// getUserMedia가 던지는 이름들. 그대로 노출하면 아이도 부모도 못 읽는다.
const MESSAGE_BY_NAME = {
  NotAllowedError:      '카메라 권한을 허용해 주세요',
  NotFoundError:        '카메라를 찾지 못했어요',
  NotReadableError:     '다른 앱이 카메라를 쓰고 있어요',
  OverconstrainedError: '카메라가 이 화질을 지원하지 않아요',
  SecurityError:        'HTTPS에서만 쓸 수 있어요',
}

export function handErrorMessage(err) {
  // 지원 하한선에 걸린 경우는 이미 사람이 읽을 문장이 담겨 있다
  if (err?.name === 'PoseUnsupportedError' && err.message) return err.message
  return (
    MESSAGE_BY_NAME[err?.name] ??
    // 모르는 오류는 **감추지 않는다.** 실기기에서 이름이라도 봐야 원인을 찾는다.
    `카메라 오류: ${err?.name || ''} ${err?.message || ''}`.trim()
  )
}

// 켜기를 시도하고 결과를 문장으로 돌려준다. 예외를 던지지 않는다 —
// 호출부가 매번 try/catch를 쓰면 그 안에서 문구가 또 갈린다.
export async function turnHandOn() {
  try {
    await handSession.enable()
    return { ok: true, message: '손을 어깨 위로 들면 커서가 나와요' }
  } catch (err) {
    console.warn('[handControl] 손 컨트롤 시작 실패:', err?.name, err?.message)
    return { ok: false, message: handErrorMessage(err), error: err }
  }
}

/**
 * 화면에 붙일 ✋ 버튼 하나를 만들어 준다.
 *
 * 미지원 기기에서는 **버튼 자체를 숨긴다.** 눌러봐야 안 되는 버튼을 보여주는 것보다
 * 없는 편이 낫다. 이유는 콘솔에 남긴다.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.el       이미 만들어 둔 버튼 엘리먼트
 * @param {HTMLElement} opts.labelEl  라벨 텍스트가 들어갈 곳 (없으면 el)
 * @param {Function}    opts.onToast  안내 문구를 보여줄 함수
 * @returns {Function} 정리 함수 — 페이지의 onLeave에 넣는다
 */
export function bindHandButton({ el, labelEl = el, onToast = () => {} }) {
  if (!el) return () => {}

  if (!handSession.supported) {
    el.style.display = 'none'
    console.info('[handControl] 손 컨트롤 미지원:', handSession.unsupportedReason)
    return () => {}
  }

  const sync = () => {
    labelEl.textContent = handSession.enabled ? '손 컨트롤 끄기' : '손 컨트롤 모드'
    el.setAttribute('aria-pressed', String(handSession.enabled))
  }
  sync()

  const onClick = async () => {
    if (handSession.enabled) {
      handSession.disable()
      sync()
      return
    }
    labelEl.textContent = '켜는 중…'
    const { message } = await turnHandOn()
    onToast(message)
    sync()
  }

  el.addEventListener('click', onClick)
  const offChange = handSession.onChange(sync)

  return () => {
    el.removeEventListener('click', onClick)
    offChange()
  }
}

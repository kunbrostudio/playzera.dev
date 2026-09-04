// 홈 화면 QR 아이콘 버튼 배선. STEP 66.
//
// `handControl.js`의 `bindHandButton`과 같은 자리 — 버튼 엘리먼트 하나를
// 받아 클릭 배선과 상태 반영을 다 처리하고, 정리 함수를 돌려준다.
//
// 이 버튼은 두 가지 상태를 동시에 알아야 한다: 내가 QR을 열어 누군가를
// 받아들이는 **주 디바이스**(`remoteSession`)일 수도 있고, QR을 스캔해서
// 다른 기기를 조종하는 **리모컨**(`controller`)일 수도 있다 — 승인된
// 폰은 진짜 허브를 그대로 띄우므로(STEP 66) 똑같은 홈 화면·같은 버튼이
// 양쪽 역할 모두에서 쓰인다. 둘 중 하나라도 "연결됨"이면 빨간 펄스를
// 켠다.
//
// `session.js`·`controller.js`를 여기서 정적 import하면 안 된다 —
// `router.js`(정적) → `home.js`(정적) → 이 파일(정적) → `session.js`
// (정적) → `router.js`(정적)로 원이 닫혀서, `router.js`가 자기 top-level
// 코드를 다 돌기도 전에 `session.js`가 `onRouteChange`를 부르다가
// "초기화 전에 접근"으로 죽는다(TDZ). `pairingModal.js`가 애초에
// 동적 import였던 이유(qrcode 라이브러리 지연 로딩)와 다른 이유로,
// 여기도 동적 import로 그 원을 끊는다.
export function bindRemoteButton({ el }) {
  if (!el) return () => {}

  let offA = () => {}
  let offB = () => {}
  let disposed = false

  const onClick = () => {
    import('./pairingModal.js').then(m => m.openPairingModal(document.body))
  }
  el.addEventListener('click', onClick)

  Promise.all([import('./session.js'), import('./controller.js')]).then(([{ remoteSession }, { controller }]) => {
    if (disposed) return
    const sync = () => el.classList.toggle('pz-remote-live', remoteSession.isPaired || controller.active)
    offA = remoteSession.onChange(sync)
    offB = controller.onChange(sync)
    sync()
  })

  return () => {
    disposed = true
    el.removeEventListener('click', onClick)
    offA()
    offB()
  }
}

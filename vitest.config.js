import { defineConfig } from 'vitest/config'

// 순수 로직 테스트만 돌린다.
//
// 브라우저가 실제로 그려주는 것(레이아웃·CSS·카메라·MediaPipe)은 여기서 확인할 수 없다.
// 그건 실기기 검증 영역이고, 자동화하려면 Playwright가 따로 필요하다.
// 여기서 잡는 것은 "규칙이 규칙대로 도는가" — 값이 어긋나면 조용히 데이터가 오염되는 쪽이다.
export default defineConfig({
  test: {
    environment: 'jsdom',   // localStorage를 쓰는 모듈(recent, Stats 큐) 때문에 필요
    include: ['test/**/*.test.js'],
    globals: false,
  },
})

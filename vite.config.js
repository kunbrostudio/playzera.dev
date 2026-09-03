import { defineConfig } from 'vite'
export default defineConfig({
  base: '/',
  build: { outDir: 'dist' },
  // host: true — 맥 localhost뿐 아니라 같은 와이파이의 다른 기기(휴대폰
  // 등)에서도 열 수 있게 0.0.0.0으로 듣는다(ken 요청, 9/2). `npm run dev`가
  // 뜨면 터미널에 "Network:" 줄로 접속 주소가 같이 뜬다.
  server: { host: true }
})

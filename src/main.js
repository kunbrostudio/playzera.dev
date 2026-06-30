import './core/router.js'
import { play as bgmPlay } from './core/bgm.js'

// 앱 시작 시 BGM 즉시 시도 — 차단 시 첫 인터랙션에서 자동 재생
bgmPlay()

import poopDodgeManifest from './poop-dodge/manifest.json'

export const GAME_REGISTRY = {
  'poop-dodge': {
    manifest: poopDodgeManifest,
    load: () => import('./poop-dodge/game.js'),
  },
}

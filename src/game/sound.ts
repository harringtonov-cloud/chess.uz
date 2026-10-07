import { audio } from '../engine/audio'
import { ASSETS } from '../assets'

let loaded = false

export async function loadSounds(): Promise<void> {
  if (loaded) return
  const entries: [string, string | undefined][] = [
    ['move', ASSETS.sfx_move],
    ['capture', ASSETS.sfx_capture],
    ['check', ASSETS.sfx_check],
    ['mate', ASSETS.sfx_mate],
    ['fail', ASSETS.sfx_fail],
    ['tick', ASSETS.sfx_tick],
    ['click', ASSETS.sfx_click],
    ['bgm_lobby', ASSETS.bgm_lobby],
    ['bgm_game', ASSETS.bgm_game],
  ]
  await Promise.all(
    entries
      .filter(([, url]) => Boolean(url))
      .map(([key, url]) => audio.load(key, url!).catch(() => undefined)),
  )
  loaded = true
}

export function sfx(key: string, volume = 0.7): void {
  audio.playSfx(key, { volume })
}

export function playLobbyBgm(): void {
  if (ASSETS.bgm_lobby) audio.playBgm('bgm_lobby', { volume: 0.32 })
  else if (ASSETS.bgm_game) audio.playBgm('bgm_game', { volume: 0.28 })
}

export function playGameBgm(): void {
  if (ASSETS.bgm_game) audio.playBgm('bgm_game', { volume: 0.28 })
  else if (ASSETS.bgm_lobby) audio.playBgm('bgm_lobby', { volume: 0.22 })
}

export function stopBgm(): void {
  audio.stopBgm()
}

export function toggleMute(): boolean {
  audio.setMuted(!audio.muted)
  return audio.muted
}

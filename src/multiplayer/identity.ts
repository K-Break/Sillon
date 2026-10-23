export const PLAYER_COLORS = [
  '#10b981', // Emerald
  '#6366f1', // Indigo
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#a855f7', // Purple
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#3b82f6', // Blue
  '#e11d48', // Rose
]

const COOL_WORDS = ['GROOV', 'TEMPO', 'VINYL', 'DISCO', 'TRACK', 'AUDIO', 'BEATS', 'WAVES', 'CHORD', 'SOUND']

export function generateRoomCode(): string {
  const word = COOL_WORDS[Math.floor(Math.random() * COOL_WORDS.length)]
  const suffix = Math.floor(10 + Math.random() * 90)
  return `${word}${suffix}`
}

export function pickRandomColor(): string {
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]
}

export function getLocalPlayerProfile(spotifyName?: string | null): { name: string; color: string } {
  let name = spotifyName || localStorage.getItem('sillon_mp_name') || ''
  let color = localStorage.getItem('sillon_mp_color') || ''

  if (!color || !PLAYER_COLORS.includes(color)) {
    color = pickRandomColor()
    localStorage.setItem('sillon_mp_color', color)
  }

  if (!name) {
    name = `Mélomane ${Math.floor(10 + Math.random() * 90)}`
  }

  return { name, color }
}

export function saveLocalPlayerProfile(name: string, color: string) {
  if (name.trim()) localStorage.setItem('sillon_mp_name', name.trim())
  if (color) localStorage.setItem('sillon_mp_color', color)
}

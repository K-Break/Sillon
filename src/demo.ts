import type { PlaylistSummary, Track } from './types'

/** Données de démonstration : titres et artistes inventés, aucun contenu Spotify. */
const RAW: [string, string, string][] = [
  ['Marée haute', 'Odile Varenne', 'Salines'],
  ['Papier carbone', 'Les Heures Creuses', 'Copie conforme'],
  ['Neige en août', 'Maëlys Ardent', 'Saisons inversées'],
  ['Le dernier tram', 'Cobalt Park', 'Terminus'],
  ['Cartes postales', 'Iris & Moreau', 'Courrier lent'],
  ['Fréquence 88', 'Baltic Radio', 'Ondes courtes'],
  ['Sable fin', 'Théo Marchetti', 'Dunes'],
  ['Les yeux ouverts', 'Anaïs Dorval', 'Veille'],
  ['Mille-feuille', 'Orchestre de poche', 'Pâtisserie'],
  ['Rouge-gorge', 'Camille Estève', 'Petites choses'],
  ['Voie lactée', 'Nadir', 'Altitude'],
  ['Matin de grève', 'Les Fanfarons', 'Pavés'],
  ['Cendres', 'Lune Rousse', 'Brasier'],
  ['Lundi pluvieux', 'Hugo Delmas', 'Semaine'],
  ['Autoroute du sud', 'Pierre Bellanger', 'Péage'],
  ['Silence radio', 'Vapeur', 'Brouillage'],
  ['Pointillés', 'Sofia Kern', 'Tracés'],
  ['Cerf-volant', 'Lou Mercier', 'Vent debout'],
  ['Minuit moins une', 'Les Heures Creuses', 'Copie conforme'],
  ['Brume', 'Odile Varenne', 'Salines'],
  ['Zinc', 'Cobalt Park', 'Terminus'],
  ['Eau tiède', 'Théo Marchetti', 'Dunes'],
  ['Oranger', 'Anaïs Dorval', 'Veille'],
  ['Grand huit', 'Les Fanfarons', 'Pavés'],
  ['Chambre claire', 'Iris & Moreau', 'Courrier lent'],
  ['Fil rouge', 'Camille Estève', 'Petites choses'],
  ['Dernière danse', 'Baltic Radio', 'Ondes courtes'],
  ['Pierre ponce', 'Nadir', 'Altitude'],
  ['Cabane', 'Lou Mercier', 'Vent debout'],
  ['Ciel de traîne', 'Maëlys Ardent', 'Saisons inversées'],
]

const EXTRA: [string, string, string][] = [
  ['Sous la table', 'Hugo Delmas', 'Semaine'],
  ['Phare', 'Lune Rousse', 'Brasier'],
  ['Courant d\'air', 'Sofia Kern', 'Tracés'],
  ['Mauvaise graine', 'Vapeur', 'Brouillage'],
  ['Passage à niveau', 'Pierre Bellanger', 'Péage'],
  ['Écume', 'Orchestre de poche', 'Pâtisserie'],
]

const make = ([name, artists, album]: [string, string, string], i: number, prefix: string): Track => ({
  id: `${prefix}${i}`,
  uri: `demo:${prefix}${i}`,
  name,
  artists,
  album,
  image: null,
  durationMs: 150_000 + ((i * 37_000) % 120_000),
})

export const DEMO_TRACKS: Track[] = RAW.map((r, i) => make(r, i, 'd'))
export const DEMO_EXTRA: Track[] = EXTRA.map((r, i) => make(r, i, 'e'))

export const DEMO_PLAYLISTS: PlaylistSummary[] = [
  { id: 'demo', name: 'Playlist de démonstration', image: null, total: DEMO_TRACKS.length, readable: true },
]

export function searchDemo(q: string): Track[] {
  const n = q.trim().toLowerCase()
  return [...DEMO_TRACKS, ...DEMO_EXTRA].filter(
    (t) => t.name.toLowerCase().includes(n) || t.artists.toLowerCase().includes(n),
  )
}

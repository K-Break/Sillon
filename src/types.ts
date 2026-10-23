export interface Track {
  id: string
  uri: string
  name: string
  artists: string
  album: string
  image: string | null
  durationMs: number
}

export interface PlaylistSummary {
  id: string
  name: string
  image: string | null
  total: number
  /** Spotify ne renvoie le contenu que des playlists dont on est propriétaire ou collaborateur. */
  readable: boolean
}

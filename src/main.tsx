import { createRoot } from 'react-dom/client'
import '@fontsource-variable/instrument-sans'
import './styles.css'
import App from './App'

// Pas de <StrictMode> : l'échange du code d'autorisation Spotify ne doit s'exécuter qu'une fois.
createRoot(document.getElementById('root')!).render(<App />)

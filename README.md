# Sillon

Classe une playlist Spotify en comparant deux sons à la fois, seul ou **à plusieurs en direct**. L'app construit l'ordre, puis l'enregistre comme **nouvelle playlist privée** dans ton compte Spotify.

## Lancer le projet

Prérequis : Node 20 ou plus, et un compte Spotify **Premium** (obligatoire pour le propriétaire de l'app et pour la lecture audio).

1. Va sur <https://developer.spotify.com/dashboard> et crée une app.
   - API utilisées : **Web API** et **Web Playback SDK**.
   - Redirect URI : `http://127.0.0.1:5173/callback` en local (Spotify refuse `localhost`), ou `https://ton-app.vercel.app/callback` une fois déployé sur Vercel.
2. Copie `.env.example` en `.env` et colle le Client ID :
   ```
   VITE_SPOTIFY_CLIENT_ID=ton_client_id
   ```
3. Installe et lance :
   ```bash
   npm install
   npm run dev
   ```
4. Ouvre <http://127.0.0.1:5173> (pas `localhost`).

Sans Client ID, le bouton « Essayer avec une playlist de démo » permet de tester tout le parcours, sans audio.

---

## Mode Multijoueur en direct 👥

Tu peux faire le tri à plusieurs sur la même session en temps réel :

1. Clique sur **« Jouer à plusieurs »** ou sur le badge **« Multijoueur »** dans la barre supérieure.
2. Un code de salle unique (ex: `GROOV42`) est généré.
3. Copie et envoie le lien d'invitation (ex: `https://ton-app.vercel.app/?room=GROOV42`).
4. **Curseurs en direct** : vous voyez les souris de tous les participants bouger et cliquer à l'écran, avec leur pseudo et couleur.
5. **Vote majoritaire** :
   - À chaque duel, chaque joueur vote (`←`, `→` ou égalité).
   - Dès qu'une option recueille la majorité absolue des votes (ou lorsque tous les joueurs ont voté), le duel est automatiquement tranché et validé !
   - Même principe pour les paliers : chacun vote pour son palier préféré (1 à 5).
6. **Invités sans compte Spotify** :
   - Les personnes qui n'ont pas de compte Spotify (ou qui ne sont pas dans la liste des 5 utilisateurs autorisés Spotify) peuvent **rejoindre en mode invité** simplement en saisissant un pseudo.
   - Elles participent pleinement aux votes, voient les curseurs et l'avancement en direct.
7. **Audio indépendant** :
   - Chaque joueur disposant de Spotify Premium écoute sur son propre compte et son propre casque.
   - Cela protège contre les limites d'écoute et évite de couper la musique d'un ami.

---

## Limites et protection d'API (Spotify Widevine 429)

- Spotify limite les demandes de licence audio (Widevine) lors de relances trop rapides de sons.
- Sillon intègre un régulateur automatique (`PlayGate`) :
  - Espacement minimal de 0,9s entre lancements ;
  - Recliquer sur le même son se replace dans le morceau sans redemander de licence ;
  - En cas de 429 ou d'échec de licence, l'application s'impose une pause pédagogique avec compte à rebours plutôt que de saturer le serveur Spotify.

---

## Comment le tri fonctionne

1. **Paliers.** Chaque son est écouté une fois et rangé dans l'un des 5 paliers (touches 1 à 5).
2. **Duels.** À l'intérieur d'un palier, chaque son est inséré dans la liste déjà triée par recherche dichotomique : il est comparé au son du milieu, puis au quart, etc. Cela demande environ log2(n) duels par son, au lieu de comparer tous les sons entre eux.
3. Les paliers sont affinés **du meilleur au moins bon**. Tu peux t'arrêter à tout moment : le haut de la liste est déjà précis, le reste garde l'ordre des paliers (indiqué « ordre approximatif » dans le résultat).

Raccourcis : `1`–`5` ranger · `←` `→` choisir / voter · `↓` égalité · `1` `2` écouter · `espace` pause · `Z` annuler · `S` passer.

---

## Structure du code

```
src/engine.ts               Moteur de tri dichotomique pur et testé (npm test)
src/multiplayer/room.ts     Gestionnaire de salle en temps réel (relais géré WebRTC P2P)
src/multiplayer/useMultiplayer.ts  Hook React pour la synchronisation, votes et curseurs
src/components/             Interface utilisateur :
  ├── MultiplayerCursors.tsx  Couche de rendu des curseurs et réactions live
  ├── RoomModal.tsx          Modal de création, partage de lien et liste de joueurs
  ├── JoinBanner.tsx         Accueil d'un joueur invité par lien
  ├── DuelStage.tsx          Duels avec affichage des votes en direct et majorité
  ├── TierStage.tsx          Paliers avec votes en direct
  ├── Result.tsx             Écran de résultat et export Spotify
src/spotify/player.ts       Web Playback SDK + protection anti-429 (PlayGate)
```

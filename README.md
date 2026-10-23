# Sillon

Classe une playlist Spotify en comparant deux sons à la fois. L'app construit l'ordre, puis l'enregistre comme **nouvelle playlist privée** dans ton compte.

## Lancer le projet

Prérequis : Node 20 ou plus, et un compte Spotify **Premium** (obligatoire pour le propriétaire de l'app et pour la lecture audio).

1. Va sur <https://developer.spotify.com/dashboard> et crée une app.
   - API utilisées : **Web API** et **Web Playback SDK**.
   - Redirect URI : `http://127.0.0.1:5173/callback` (Spotify refuse `localhost`).
2. Copie `.env.example` en `.env` et colle le Client ID :
   ```
   VITE_SPOTIFY_CLIENT_ID=ton_client_id
   ```
3. Installe et lance :
   ```
   npm install
   npm run dev
   ```
4. Ouvre <http://127.0.0.1:5173> (pas `localhost`).

Sans Client ID, le bouton « Essayer avec une playlist de démo » permet de tester tout le parcours, sans audio.

## Ajouter des collègues

En mode développeur, Spotify limite l'app à **5 utilisateurs autorisés**. Dans le dashboard : *User Management*, ajoute leur nom et l'e-mail de leur compte Spotify. Chacun doit aussi avoir un compte Premium pour écouter dans le navigateur. Un compte non ajouté reçoit une erreur 403 à la connexion.

## Limites imposées par Spotify (février 2026)

- Le contenu d'une playlist n'est lisible que si elle t'appartient ou si tu en es collaborateur. Pour la playlist de quelqu'un d'autre : colle les liens de ses sons dans l'onglet « Coller des liens ».
- Recherche : 10 résultats par page.
- Les extraits de 30 secondes de l'API ne sont plus fournis : la lecture passe par le Web Playback SDK (Premium, navigateur de bureau avec DRM).
- Quota partagé en mode développeur : en cas de dépassement, l'app affiche un message et il faut attendre.

## Comment le tri fonctionne

1. **Paliers.** Chaque son est écouté une fois et rangé dans l'un des 5 paliers (touches 1 à 5).
2. **Duels.** À l'intérieur d'un palier, chaque son est inséré dans la liste déjà triée par recherche dichotomique : il est comparé au son du milieu, puis au quart, etc. Cela demande environ log2(n) duels par son, au lieu de comparer tous les sons entre eux.
3. Les paliers sont affinés **du meilleur au moins bon**. Tu peux t'arrêter à tout moment : le haut de la liste est déjà précis, le reste garde l'ordre des paliers (indiqué « ordre approximatif » dans le résultat).

Un duel peut aussi se terminer par une égalité. Annuler est possible à tout moment (touche Z). Le côté gauche ou droit du son à classer est tiré au hasard pour éviter un biais de position.

Raccourcis : `1`–`5` ranger · `←` `→` choisir · `↓` égalité · `1` `2` écouter (pendant les duels) · `espace` pause · `Z` annuler · `S` passer.

## Structure

```
src/engine.ts          moteur de tri pur et testé (npm test)
src/spotify/auth.ts    connexion PKCE
src/spotify/api.ts     endpoints Web API (/items, /me/playlists, recherche, liens)
src/spotify/player.ts  Web Playback SDK + lecteur de démo
src/components/        écrans : accueil, sélection, paliers, duels, résultat
```

La progression est sauvegardée dans le navigateur (localStorage) : tu peux fermer l'onglet et reprendre plus tard depuis l'accueil.

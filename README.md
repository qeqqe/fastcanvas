# Fastfetch Spotify Canvas

Shows the Spotify Canvas of the track you're playing (or the album cover if it has none) as your fastfetch logo.

## Showcase

<https://github.com/user-attachments/assets/dba217df-87bb-4916-8afd-80af3994f876>

## Requirements

- A terminal with the Kitty graphics protocol (kitty, Ghostty, WezTerm, …) and `kitten`
- Node.js 20.12+ and pnpm
- `ffmpeg` and `fastfetch`
- **Spotify Premium.** Since February 2026, Spotify developer apps in Development Mode only work if the app owner has an active Premium subscription.

## Setup

1. **Clone and install**

   ```sh
   git clone https://github.com/qeqqe/fastfetch-spotify-canvas.git ~/fastfetch-spotify-canvas
   ~/fastfetch-spotify-canvas/install.sh
   ```

   This checks dependencies, builds, creates `.env`, and links `fetchcanvas` into `~/.local/bin`, so it works in any shell. Re-run it after a `git pull` to rebuild.

2. **Create a Spotify app**
   - Go to the [Spotify developer dashboard](https://developer.spotify.com/dashboard) and create an app with **Web API** selected.
   - Add the redirect URI `http://127.0.0.1:5555/callback`. It must be exactly this; `localhost` is not allowed.
   - Put the Client ID and Client Secret in `.env`.

3. **Get your `sp_dc` cookie**

   Log in at [open.spotify.com](https://open.spotify.com), then open DevTools → Application → Cookies → `https://open.spotify.com` and copy the value of `sp_dc` into `.env`. It lasts about a year, and logging out of the web player invalidates it.

4. **Authorize**

   ```sh
   pnpm run auth
   ```

   This opens your browser. Once you approve, `SPOTIFY_REFRESH_TOKEN` is written to `.env`.

5. **Run**

   ```sh
   fetchcanvas
   ```

## How it works

- Your current (or most recently played) track comes from the official Web API, using your app's refresh token.
- The canvas comes from the same internal GraphQL query the Spotify web player uses, authenticated with your `sp_dc` cookie. The video is converted to a GIF with ffmpeg.
- Media is cached per track in `~/images/fastfetch/media`.

## Troubleshooting

Logs from the last run are in `~/.cache/fastfetch-canvas.log`. To uninstall, delete `~/.local/bin/fetchcanvas`.

- **`Refresh token rejected`**: run `pnpm run auth` again, and check that the app owner still has Premium.
- **`Canvas lookup failed, using album cover`**: the canvas side relies on unofficial web player internals that Spotify changes from time to time.
  - `sp_dc cookie is invalid or expired`: grab a fresh cookie.
  - `Web player token refused`: Spotify rotated its TOTP secret. Wait for the secrets source to update, or point `SPOTIFY_SECRETS_URL` at a source that has the new one.

---

Thanks to [bartleyg/my-spotify-canvas](https://github.com/bartleyg/my-spotify-canvas) for the original Canvas reverse engineering, and [This PR](https://github.com/kushagrasinghx/BitChord/pull/46) for the current GraphQL query.

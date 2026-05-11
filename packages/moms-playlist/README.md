# moms-playlist

Build a personalised Spotify playlist for mom: scrape Billboard Hot 100 year-end charts for her coming-of-age years, let Claude pick the 20 most emotionally resonant songs, then drop them into a private Spotify playlist.

## Usage

```bash
pnpm moms-playlist -- --year 1958 --hometown "Detroit, MI"
```

## Environment variables

Add these to the root `.env` file:

```
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=
ANTHROPIC_API_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=
```

## One-time Spotify OAuth setup

You need a `SPOTIFY_REFRESH_TOKEN` that has the `playlist-modify-private` and `playlist-modify-public` scopes. Do this once:

### 1. Create a Spotify app

1. Go to <https://developer.spotify.com/dashboard> and create a new app.
2. Set the **Redirect URI** to `http://127.0.0.1:8888/callback`.
3. Copy the **Client ID** and **Client Secret** into your `.env`.

### 2. Get an authorization code

Open this URL in your browser (replace `YOUR_CLIENT_ID`):

```
https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback&scope=playlist-modify-private%20playlist-modify-public
```

Authorize the app. Your browser will redirect to `http://127.0.0.1:8888/callback?code=AQD...` and show an **ERR_CONNECTION_REFUSED** error — this is expected, nothing needs to be running on that port. Just copy the `code` value from the address bar before closing the tab.

### 3. Exchange the code for a refresh token

Run this curl command (replace the placeholders):

```bash
curl -s -X POST https://accounts.spotify.com/api/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \
  -d "grant_type=authorization_code&code=YOUR_CODE&redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback"
```

The response includes a `refresh_token`. Copy it into your `.env` as `SPOTIFY_REFRESH_TOKEN`.

The refresh token does not expire (unless you revoke it), so you only need to do this once.

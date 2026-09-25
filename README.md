# StreamPull

A small local Next.js app that wraps [yt-dlp](https://github.com/yt-dlp/yt-dlp) with a UI, so you can download a single YouTube video or a whole playlist without touching the command line — pick quality, audio-only extraction, subtitles, and watch live per-item progress.

Everything runs on your own machine. Nothing is uploaded anywhere; the app just drives `yt-dlp` and `ffmpeg` locally and writes files to a folder you choose.

## Download the app

The desktop app has yt-dlp and ffmpeg built in — install it, paste a link, download. Nothing else to set up. Get it from the [Releases page](https://github.com/M7MOD-OSMAN/ytgrab/releases):

- **Windows** — `StreamPull-Setup-x.y.z.exe`. It installs for your user only (no admin prompt) and adds a desktop shortcut. The installer isn't code-signed yet, so Windows may say "Windows protected your PC": click **More info → Run anyway**.
- **Linux (Ubuntu, Debian, Mint…)** — `StreamPull-x.y.z-amd64.deb`, then `sudo apt install ./StreamPull-x.y.z-amd64.deb`.
- **Other Linux** — `StreamPull-x.y.z-x86_64.AppImage`: `chmod +x` it and run it. On Ubuntu 24+ an AppImage may need `--no-sandbox`; the `.deb` doesn't.

The app keeps yt-dlp up to date on its own (checked once a day), since YouTube changes often enough to break older versions.

## Run from source

### 1. Install the two things this app drives

When running from source you need **yt-dlp** and **ffmpeg** on your PATH. The app will tell you if either is missing and show you these same commands.

**Windows** (PowerShell or Windows Terminal):
```powershell
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```
Close and reopen your terminal afterward so the new commands are on PATH.

**macOS** (with [Homebrew](https://brew.sh)):
```bash
brew install yt-dlp ffmpeg
```

**Linux** (Debian/Ubuntu):
```bash
sudo apt update && sudo apt install ffmpeg
pip install --user -U yt-dlp
```
Fedora: `sudo dnf install ffmpeg && pip install --user -U yt-dlp`
Arch: `sudo pacman -S ffmpeg yt-dlp`

yt-dlp updates often to keep up with YouTube's changes. If downloads start failing, use the "Check for updates" behavior built into the app's `/api/update-ytdlp` route, or just re-run the install command above.

### 2. Install and run StreamPull

Requires [Node.js](https://nodejs.org) 20 or newer and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev
```

Open **http://localhost:3000**. Note: use `localhost`, not `127.0.0.1` — both work here since the dev config explicitly allows both, but if you ever hit a page that loads but doesn't respond to clicks in a Next.js app, that mismatch is usually why.

For a slightly faster, production-mode run instead:
```bash
pnpm build
pnpm start
```

Both scripts bind to `127.0.0.1` only (not your whole network), since this app can write files to your disk and run `yt-dlp`/`ffmpeg` on your behalf — you don't want that reachable from other devices on your Wi-Fi.

## What it does

- Paste a video or playlist link → **Analyze** to preview it (thumbnail, title, duration; full item list for playlists)
- Pick **Video (MP4)** with a quality cap, or **Audio** (MP3/M4A/Opus)
- For playlists: select specific items or grab the whole thing. Private/deleted videos in a playlist are automatically skipped rather than failing the whole job
- Optional: embed subtitles, thumbnail, and metadata; cap the download rate; use cookies from a browser or an uploaded `cookies.txt` for private/age-restricted/members-only content
- Live progress per item over the whole download, with cancel and cleanup-partial-files controls
- Re-running a finished download skips files you already have (via a `.ytgrab-archive.txt` file dropped in each output folder) — safe to resume an interrupted playlist grab
- A **History** tab lists everything downloaded this session, with search and status filters

## Notes on scope

- This app talks to `yt-dlp`, which supports 1000+ sites, not only YouTube — but the UI copy and defaults are written for YouTube specifically, since that's what it was built for.
- Job history lives in server memory for the running session — restarting the app clears it. Files already on disk aren't affected.
- Only download content you have the right to save — respect the source site's terms of service and applicable copyright law. This is a personal-use tool.

## Building the desktop app

Build on the platform you're packaging for (Linux packages need Linux):

```bash
pnpm desktop:bin     # download the yt-dlp and ffmpeg builds to bundle
pnpm desktop:build   # installer in dist-desktop/ (add -- --dir for an unpacked app)
pnpm desktop:start   # run the built app from source
node scripts/smoke-desktop.mjs dist-desktop/win-unpacked/StreamPull.exe
```

Releases are built by CI: bump `version` in `package.json`, push a tag such as `v0.2.0`, and [`.github/workflows/desktop.yml`](.github/workflows/desktop.yml) builds and smoke-tests the Windows and Linux installers, then attaches them to a GitHub Release.

The app bundles [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Unlicense) and an LGPL build of [FFmpeg](https://ffmpeg.org) from [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds); their licenses ship in the app's `resources/bin/licenses/`.

## Project layout

```
src/lib/binaries.ts     cross-platform yt-dlp/ffmpeg discovery
src/lib/ytdlp.ts        info-fetch + download argument building
src/lib/jobs.ts         job queue, process spawning, live progress parsing
src/app/api/            REST + SSE endpoints the UI talks to
src/proxy.ts            desktop-only: API answers the app window alone
src/components/         UI (dark theme, StreamPull design system)
desktop/app/            Electron shell: starts the server, opens the window
scripts/                binary fetching, desktop build, smoke test
```

## Who made this

Built by **Mahmoud Othman**.

- WhatsApp: [+20 101 749 5064](https://wa.me/201017495064)
- GitHub: [M7MOD-OSMAN](https://github.com/M7MOD-OSMAN)
- LinkedIn: [mahmoud-othman](https://www.linkedin.com/in/mahmoud-othman-875bb318b/)
- Facebook: [M7moud.osman](https://www.facebook.com/M7moud.osman)

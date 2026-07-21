# Vehicle Log Viewer

Open-source, browser-based CAN log analyzer. Upload a log file and DBC, map channels, parse in the browser, then explore signals on **Graph** or raw frames on **Trace**.

This repository is the **community edition** — fully client-side, no login, no server-side parsing.

For the commercial hosted edition with additional features, see the link in the app toolbar or visit your production URL configured via `VITE_COMMERCIAL_URL`.

## Features

- **Graph** — time-series charts, signal groups, zoom/pan, cursors, project save/load
- **Trace** — searchable CAN frame table with detail panel
- **Formats** — BLF, ASC, CSV, MF4 (client-side parsing, no server upload)
- **Export** — CSV export for loaded or all parsed signals
- **Project files** — save and restore workspace layout (`.blfproject.json`)

## Quick start

```bash
pnpm install
cp .env.example .env.development
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. **File → Load log** — BLF / ASC / CSV / MF4
2. **File → Load DBC** — one or more DBC files
3. **File → Channels** — assign DBCs to CAN channels
4. **File → Parse** — decode signals in the browser
5. Switch **View → Graph** or **Trace**
6. Optional: **File → Export CSV** or save/import a project

## Deploy (Cloudflare Workers)

```bash
cp wrangler.example.jsonc wrangler.jsonc
# Edit wrangler.jsonc (production URL)
cp .env.example .env.production
pnpm cf:deploy
```

This edition serves a static client-side app — no database required.

## Third-party notices

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## License

MIT — see [LICENSE](./LICENSE).

# Architecture

Vehicle Log Viewer is a **fully client-side** CAN log analysis app built with React, TanStack Router, and browser-side parsers for BLF / ASC / CSV / MF4 plus DBC decoding.

The repository is organized around one core idea:

> Load raw CAN logs and DBC files in the browser, build an in-memory analysis session, then expose the same session through three UI surfaces: **Graph**, **Trace**, and **DBC**.

## High-level flow

```text
User files
  ├─ CAN log (.blf / .asc / .csv / .log / .mf4)
  └─ DBC files (.dbc)
        ↓
Browser file reads
        ↓
Format-specific parsers in src/lib/can/
        ↓
ClientAnalysisSession (single local workspace state)
        ├─ rawFrames
        ├─ decoded signal points
        ├─ DBC metadata
        ├─ channel ↔ DBC mapping
        └─ saved workspace layout
        ↓
UI tabs
  ├─ Graph  (decoded signals / chart workspace)
  ├─ Trace  (raw frames / decoded row detail)
  └─ DBC    (DBC browser / bit layout / attributes)
```

## Runtime model

### Single-page app shell

- `src/router.tsx` creates the TanStack Router instance
- `src/routes/index.tsx` is the main analysis screen
- The root route keeps the app inside one workspace and switches between:
  - `graph`
  - `trace`
  - `dbc`

This means all three views share the same loaded files and session state.

### Session-first architecture

The main client-side state container is `ClientAnalysisSession` in `src/modules/analyses/client-session.ts`.

It owns:

- loaded log file name, size, and raw `ArrayBuffer`
- loaded DBC files
- detected CAN channels
- channel mapping
- extracted raw frame rows
- parsed signal catalog
- decoded point series
- trace rows and DBC lookup indices
- parse status / progress / error state

The session is exposed to React through `useSyncExternalStore`, so the app can keep one mutable analysis workspace without adding a global client state library.

## Core modules

### 1. Log parsing

Location: `src/lib/can/`

Parsers are implemented in the browser and do not require a backend.

- `blf-reader.ts` — Vector BLF reader
- `asc-reader.ts` — Vector ASC / `.log` reader
- `csv-reader.ts` — CSV reader
- `mf4-reader.ts` — ASAM MDF4 reader
- `iterate-log.ts` — chooses parser by filename / extension

Shared frame shape:

- timestamp
- channel
- arbitration ID
- extended/remote/error flags
- CAN FD flags
- data bytes

The parser stage is intentionally **loss-light**: it first turns every supported format into a common frame model before higher-level decoding happens.

### 2. DBC loading and decoding

Location: `src/lib/can/client-decode.ts`

Responsibilities:

- load and normalize DBC text
- index DBC messages by CAN ID
- map selected DBC files to selected CAN channels
- decode matching frames into signal values
- build raw frame rows for Trace
- build signal catalogs and point series for Graph

Important behavior:

- parsing is **channel-aware**, so the same arbitration ID can decode differently on different channels
- raw frames stay available even when no DBC matches
- Graph points and Trace names are derived from the same underlying mapping

### 3. DBC catalog / viewer model

Location: `src/lib/can/dbc-catalog.ts`

This module builds a richer inspection model from DBC text for the DBC tab:

- messages
- signals
- nodes
- comments
- attributes
- value tables
- global/network metadata

This is separate from the runtime decode index because the DBC tab needs browse-oriented structures, not just ID lookup.

### 4. Project/workspace persistence

Location:

- `src/lib/analysis-project.ts`
- `src/lib/analysis-workspace-layout.ts`
- `src/lib/analysis-workspace.ts`

Project export/import stores:

- loaded log filename + size hint
- DBC filename list
- channel mapping
- added signals
- visible signals
- groups
- chart mode and zoom mode
- view window and Y ranges
- cursor positions
- current viewer tab

The exported file is `.blfproject.json`.

## UI architecture

### Main route and tab layout

`src/routes/index.tsx` renders a shared top toolbar and one of three panes:

- `SignalViewer` for Graph
- `FrameViewer` for Trace
- `DbcViewer` for DBC

The active tab is persisted into the layout snapshot so imported projects can reopen in the same view.

### Graph

Main modules:

- `src/blocks/signal-viewer/index.tsx`
- `src/blocks/signal-workspace/use-signal-workspace.ts`
- `src/blocks/signal-workspace/signal-chart.tsx`
- `src/blocks/signal-workspace/signal-table-panel.tsx`

The Graph tab is a small workspace inside the app:

- left side: plotted signals table
- right side: custom SVG chart
- dialog: searchable signal picker
- toolbar actions: shortcuts/help and chart controls

The chart implementation is custom rather than Recharts-driven, because the app needs:

- stacked vs overlay modes
- cursor-driven inspection
- diff cursor
- per-series Y ranges
- box zoom / axis zoom / pan
- stepped signal rendering
- value-label axes for enumerated signals

### Trace

Main modules:

- `src/blocks/frame-viewer/index.tsx`
- `src/blocks/frame-viewer/FrameTable.tsx`
- `src/blocks/frame-viewer/FrameDetailPanel.tsx`
- `src/blocks/frame-viewer/frame-filter.ts`
- `src/blocks/frame-viewer/frame-bit-heatmap.ts`
- `src/blocks/frame-viewer/frame-sparkline.ts`

Trace uses pre-extracted `rawFrames` from the session and layers on:

- filtering
- search matches
- table selection
- DBC-aware row decoding
- message-level sparkline summaries
- bit-flip heatmap for repeated frames of one message ID

### DBC

Main modules:

- `src/blocks/dbc-viewer/index.tsx`
- `src/blocks/dbc-viewer/message-list.tsx`
- `src/blocks/dbc-viewer/signal-table.tsx`
- `src/blocks/dbc-viewer/bit-matrix.tsx`
- `src/blocks/dbc-viewer/detail-panel.tsx`
- `src/blocks/dbc-viewer/bit-layout.ts`

The DBC tab is independent from signal parsing in the sense that:

- you can browse DBC content without parsing a log
- it provides a documentation / reverse-engineering view of the database itself

The layout is optimized for fast inspection:

- message list
- signal table
- bit matrix
- collapsible detail panel
- alternate node/network scopes

## Data lifecycle

### Loading a log

1. User selects a log file
2. `ClientAnalysisSession.loadLog()` validates size and format
3. `extractRawFramesFromLog()` scans frames into a common raw row model
4. Channels are detected from the parsed frames
5. Graph/Trace reset to uploaded state

### Loading DBC files

1. User adds one or more `.dbc` files
2. DBC text is read in-browser
3. Files are stored in session by generated local IDs
4. No decode happens yet until channel mapping + parse

### Parsing

1. User maps DBC files to channels
2. `decodeLogWithDbcs()` iterates log frames again
3. Matching frame IDs are decoded into signal values
4. A signal catalog + point arrays are built
5. Trace rows are annotated with frame/message names
6. Graph becomes ready and auto-adds the first signal when appropriate

## Deployment model

The app is designed for static hosting.

- local development: `pnpm dev`
- production build: `pnpm build`
- GitHub Pages build: `pnpm build:pages`

No server-side parsing, database, queue, or worker is required for the community edition.

## Important implementation constraints

- Large files are bounded by client-side limits to avoid freezing the tab
- Parsing progress is surfaced to the UI during long browser-side decode
- Raw frame extraction and decoded signal generation are separated so Trace can still work well
- Channel mapping is explicit and persisted in project files
- The app intentionally keeps file contents local for privacy

## Key files

| Path | Purpose |
|------|---------|
| `src/routes/index.tsx` | Main page and Graph/Trace/DBC tab switching |
| `src/modules/analyses/client-session.ts` | Local analysis session state |
| `src/lib/can/client-decode.ts` | DBC decode pipeline, raw rows, parse results |
| `src/lib/can/iterate-log.ts` | Format detection and parser dispatch |
| `src/lib/analysis-project.ts` | Project export/import schema |
| `src/blocks/signal-workspace/` | Graph workspace |
| `src/blocks/frame-viewer/` | Trace UI |
| `src/blocks/dbc-viewer/` | DBC browser UI |


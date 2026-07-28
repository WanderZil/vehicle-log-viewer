# Screenshots

本仓库的 README/文档默认使用 `docs/samples/` 下的截图（`graph.png` / `Trace.png` / `DBC.png`）。

如果你希望也在这里维护一份备份截图，只要保证文件名与文档引用一致即可；否则无需填写本目录。

## Required files

| File | View | How to capture |
|------|------|----------------|
| `graph.png` | **Graph** — signal chart, table, cursors | Load a log + DBC, parse, add a few signals, enable cursors |
| `Trace.png` | **Trace** — frame table + detail panel | Same session; switch **View → Trace**, select a row |
| `DBC.png` | **DBC** — message list, bit layout, signal details | **View → DBC**; select a message with multiple signals |

## Optional files

| File | Suggested content |
|------|-------------------|
| `channel-mapping.png` | **File → Channel mapping** dialog |
| `workflow.png` | Full window after **File → Parse** (toolbar + filename visible) |

## Guidelines

- **Format:** PNG (preferred) or WebP
- **Width:** 1400–1920 px; keep UI readable when scaled in GitHub README (~800 px display width)
- **Theme:** Light or dark — pick one and use it for all shots
- **Privacy:** Use sample logs and DBCs only; blur or omit proprietary names if needed
- **No browser chrome:** Crop to the app window; hide bookmarks bar and personal URLs

After adding files, verify links in README and `docs/guide.md` render correctly on GitHub.

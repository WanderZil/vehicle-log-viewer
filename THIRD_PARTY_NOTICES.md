# Third-Party Notices

This project uses the following open-source libraries. Each library is subject to its own license.

## Runtime dependencies

| Package | License | Purpose |
|---------|---------|---------|
| React / React DOM | MIT | UI framework |
| TanStack Router / Start / Query / Table / Form | MIT | Routing, SSR shell, data fetching, tables |
| Vite / Nitro | MIT | Build tooling |
| Tailwind CSS | MIT | Styling |
| shadcn/ui / Base UI / Radix | MIT | UI primitives |
| candied | ISC | DBC file parsing |
| pako | MIT / Zlib | BLF/MF4 decompression |
| recharts | MIT | Signal charts |
| lucide-react | ISC | Icons |
| Paraglide JS | MIT | Internationalization |
| zod | MIT | Validation |
| next-themes | MIT | Theme switching |
| sonner | MIT | Toast notifications |
| @dnd-kit/* | MIT | Drag and drop |
| uuid / nanoid | MIT / ISC | ID generation |

## Development dependencies

| Package | License | Purpose |
|---------|---------|---------|
| TypeScript | Apache-2.0 | Type checking |
| Prettier | MIT | Code formatting |
| Wrangler | MIT | Cloudflare Workers deploy |

For the full dependency tree and exact license texts, run:

```bash
pnpm licenses list
```

## CAN format notes

- **BLF**, **ASC**, **MF4**, and **DBC** are industry file formats. Parsers in `src/lib/can/` are original implementations aligned with published format specifications.
- This repository does not include Vector CANoe, ASAM MDF tooling, or OEM DBC file contents.

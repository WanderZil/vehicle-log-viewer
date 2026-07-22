# Sealed — do not touch until commercial launch

**Status:** frozen community edition, ready to publish later  
**Branch:** `clean-main`  
**Tag:** `sealed/community-v0.2.0`  
**Sealed on:** 2026-07-22

## Purpose

This repo is the **open-source / community edition** of Vehicle Log Viewer.
It was stripped of ShipAny boilerplate and sealed so it can be published for
traffic diversion **after** the commercial product is polished and live.

## Do not

- Do not casually edit this branch while polishing the commercial product
- Do not push the old `main` / `oss-strip-shipany` branches (they contain
  ShipAny history / intermediate cleanup work)
- Do not force-push over `clean-main` / this sealed tag unless intentional

## When commercial is ready to launch

1. Confirm commercial site is live and stable
2. Set `VITE_COMMERCIAL_URL` to the commercial production URL
3. Optional quick checks: `pnpm install && pnpm build && pnpm dev`
4. Publish **only** from `clean-main` (or a new orphan/clean history derived
   from this sealed tag) — never from the old ShipAny-tainted `main`
5. Example:

```bash
cd /Users/echo/Documents/website/vehicle_log_viewer_oss
git checkout clean-main
git checkout sealed/community-v0.2.0   # restore exact sealed snapshot if needed
# set VITE_COMMERCIAL_URL, then:
git push -u origin clean-main
# if remote main must be replaced with clean history:
# git push origin clean-main:main --force
```

## Companion private repo

Commercial / SaaS work lives in:

`/Users/echo/Documents/website/blf_analyze_online`

Keep feature work there. Sync selected public-safe improvements into this
repo only when you intentionally prepare the next community release.

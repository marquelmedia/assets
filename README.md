# MARQUELMEDIA Assets

Shared, generic/global media assets reused across MARQUELMEDIA properties — the
marketing site and provisioned client sites alike.

This repo is **GitHub Pages enabled**, so everything tracked here is served publicly
from the repo root:

```
https://marquelmedia.github.io/assets/img/logo.svg
```

Within a site's own build, the same files are referenced relative to the site root,
e.g. `/assets/img/logo.svg` or `/assets/img/placeholder-product.png`.

> Keep only genuinely shared, reusable media here. Per-tenant branding lives with the
> client configuration, not in this repo.

## Structure

```
assets/
├── .githooks/
│   └── pre-commit             # Optimizes staged media + refreshes metadata on commit
├── .github/workflows/
│   └── media.yml              # CI: fails if media is unoptimized or metadata is stale
├── tools/
│   ├── optimize.ts            # Bun media optimizer (image compression / SVG minify)
│   ├── variants.ts            # Generates modern-format (WebP) siblings for rasters
│   ├── manifest.ts            # Generates img/manifest.json + CATALOG.md
│   └── *.test.ts              # bun test suites for the tools
├── img/                       # Image assets
│   ├── devices/
│   │   └── iphone.png         # iPhone device mockup
│   ├── stores/
│   │   ├── app-store.png      # Apple App Store badge
│   │   └── play-store.png     # Google Play Store badge
│   ├── logo.svg / logo.png    # Primary MARQUELMEDIA logo (angular "M")
│   ├── logo-alt.svg           # Alternate logo lockup
│   ├── mark.svg               # Logo mark only
│   ├── icon.svg               # General-purpose icon
│   ├── app-icon.svg           # App icon
│   ├── type.svg               # Wordmark / type treatment
│   ├── no.svg                 # No / error / unavailable glyph
│   ├── ash.gif                # Animated loading indicator
│   ├── rotate.png             # "Rotate device" indicator
│   ├── placeholder-product.png# Fallback image for products with no photo
│   ├── glass.png / pixel.png  # Tiny (1×1 / 2×2) utility pixels used as spacers/overlays
│   ├── *.webp                 # Generated WebP variants of rasters (opt-in via <picture>)
│   └── manifest.json          # Generated asset metadata (served publicly)
├── type/
│   └── emojis.json            # Emoji definitions / mappings
├── CATALOG.md                 # Generated visual catalog of every asset
├── package.json               # Metadata + tooling & git helper scripts
├── bunfig.toml                # bun test coverage thresholds
├── bun.lockb                  # Bun lock file
├── README.md
└── TODO.md                    # Tracked future enhancements
```

## Usage

- **Reference by path**: from any site, use root-relative paths (`/assets/img/…`) or the
  public GitHub Pages URL (`https://marquelmedia.github.io/assets/img/…`).
- **Adding assets**: add only shared/global media; keep filenames lowercase and
  descriptive. Design sources (e.g. `.psd`) are intentionally kept out of git so the
  published repo stays lean.

## Tooling

This repo owns its own Bun-driven maintenance tooling under `tools/` (the shared
platform tooling in `../tools/` stays focused on tenant builds). There are **no runtime
dependencies**; the only devDependencies are the media optimizers (`sharp` + `svgo`).

```bash
bun run optimize          # optimize img/ in place (lossless by default)
bun run optimize:check    # non-zero exit if anything can still shrink
bun run variants          # (re)build/prune WebP siblings for rasters
bun run variants:check    # non-zero exit if a variant is missing/stale/orphaned
bun run manifest          # (re)generate img/manifest.json + CATALOG.md
bun run manifest:check    # non-zero exit if metadata is stale
bun run test              # unit tests for the tools (bun test)
bun run test:coverage     # tests + coverage (thresholds enforced via bunfig.toml)
bun run hooks             # enable the pre-commit hook (core.hooksPath=.githooks)
bun tools/optimize.ts --lossy   # allow palette PNGs / mozjpeg for extra savings
```

- **Lossless by default** — PNGs are recompressed and SVGs minified with `viewBox`
  and element ids preserved, so cross-site CSS/JS referencing the markup keeps working.
- **WebP variants** — for each raster large enough to benefit, `variants.ts` emits a
  sibling `.webp` (kept only when actually smaller; tiny pixels are skipped). These are
  purely additive — the original path keeps working, and consumers opt in via
  `<picture>`/`<source srcset>`. The manifest cross-links each source to its variant.
- **Pre-commit hook** — `.githooks/pre-commit` optimizes staged media, rebuilds their
  WebP variants, and refreshes `img/manifest.json` + `CATALOG.md`, re-staging results.
  Enable it once with `bun run hooks` (also wired via `postinstall` on `bun install`).
- **CI gate** — `.github/workflows/media.yml` runs `optimize:check` + `variants:check`
  + `manifest:check` on pushes/PRs, so unoptimized media, missing variants, or stale
  metadata never land.
- **Metadata** — `img/manifest.json` (also served publicly) lists every asset's type,
  size, dimensions, content hash, public URL, and variant links; [`CATALOG.md`](./CATALOG.md)
  is the human-readable view. Both are generated — never hand-edit them.
- **Tests** — each tool exports pure helpers and guards its CLI with `import.meta.main`,
  so `tools/*.test.ts` exercise them with temp-dir fixtures (`bun test`). Coverage
  thresholds (line/function ≥ 0.9) are enforced via `bunfig.toml` and run in CI.

Git helper scripts (`pull`, `commit`, `deploy`) are thin Bun/git wrappers for the
submodule's release flow. Because GitHub Pages serves this repo from its **`main`**
branch, asset changes only go live once `main` is advanced from `development`. The
platform release (`bun run deploy` → `tools/deploy.ts`) does this automatically as its
"publish source repos" step (alongside `mktg`); running `bun run deploy` here does the
same thing standalone.

## Related documentation

- [Frontend Documentation](../docs/frontend/) — how the frontend consumes these assets
- [Build Tools Documentation](../docs/tools/) — tenant build & branding tooling

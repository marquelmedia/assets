# Assets TODO

Tracks maintenance and enhancements for the shared assets repo.

## Done

- **Media optimization pipeline** — `tools/optimize.ts` (lossless image compression +
  SVG minify), the `.githooks/pre-commit` hook, and the `media.yml` CI gate.
- **Modern-format variants** — `tools/variants.ts` generates/prunes WebP siblings for
  rasters (kept only when smaller).
- **Asset metadata** — `img/manifest.json` (type, size, dimensions, content hash,
  public URL, variant links) via `tools/manifest.ts`.
- **Asset library documentation** — generated `CATALOG.md`.

## Not planned

Considered and intentionally left out of scope for this repo:

- **Organize by category** — assets are referenced by fixed `/assets/img/...` paths
  across the marketing and client sites; a flat layout avoids a cross-repo migration.
- **Asset search** — `CATALOG.md` + `img/manifest.json` already cover discovery for a
  small, curated set; a dedicated search UI isn't warranted.
- **Asset versioning** — per-file content hashes already ship in `img/manifest.json`;
  consumers can cache-bust with `?v=<hash>` when needed.
- **Lazy loading** — a consumer-side concern (`loading="lazy"`), not owned here.
- **CDN integration** — GitHub Pages already serves these publicly with CDN caching.

## Ideas (only if a need arises)

- AVIF variants alongside WebP (a toggle in `tools/variants.ts`).

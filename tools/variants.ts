#!/usr/bin/env bun
/**
 * Modern-format variant generation for raster assets.
 *
 * For every raster source (.png .jpg .jpeg .gif) large enough to benefit, emits a
 * sibling WebP (e.g. img/logo.png -> img/logo.webp) — but only keeps it when it is
 * actually smaller than the source. Consumers opt in via <picture>/<source srcset>;
 * the original path keeps working unchanged, so nothing breaks by adding these.
 *
 * WebP is generated losslessly from PNG/GIF sources (UI art, no quality loss) and
 * lossy from JPEG sources (already lossy). Animated GIFs become animated WebP.
 *
 * Usage:
 *   bun tools/variants.ts             # generate/refresh/prune variants under img/
 *   bun tools/variants.ts --check     # CI mode: exit 1 if any variant is missing/stale/orphaned
 *   bun tools/variants.ts a.png b.gif # only (re)build variants for the given sources
 */
import { readdir, readFile, writeFile, stat, unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import sharp from 'sharp';

const IMG_DIR = 'img';
const RASTER = new Set(['.png', '.jpg', '.jpeg', '.gif']);
const MIN_SOURCE_BYTES = 1024; // tiny sources (spacers/pixels) never benefit
const MIN_SAVINGS = 16; // bytes; ignore negligible differences

type Flags = { check: boolean; files: string[] };

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { check: false, files: [] };
  for (const arg of argv) {
    if (arg === '--check') flags.check = true;
    else if (arg === '--yes') continue;
    else if (!arg.startsWith('-')) flags.files.push(arg);
  }
  return flags;
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const variantPath = (src: string) => src.slice(0, -extname(src).length) + '.webp';

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function encodeWebp(src: string, input: Buffer): Promise<Buffer> {
  const ext = extname(src).toLowerCase();
  const pipeline = sharp(input, { animated: ext === '.gif' });
  const lossy = ext === '.jpg' || ext === '.jpeg';
  return pipeline
    .webp(lossy ? { quality: 80, effort: 6 } : { lossless: true, effort: 6 })
    .toBuffer();
}

/**
 * Decide the desired state for one source's variant and reconcile it.
 * Returns a short status string when something changed / is out of date.
 */
async function reconcile(
  src: string,
  flags: Flags,
): Promise<{ changed: boolean; note?: string }> {
  const input = await readFile(src);
  const out = variantPath(src);

  // Too small to bother — variant should not exist.
  if (input.length < MIN_SOURCE_BYTES) {
    if (await exists(out)) {
      if (flags.check) return { changed: true, note: `orphan  ${out} (source too small)` };
      await unlink(out);
      return { changed: true, note: `removed  ${out}` };
    }
    return { changed: false };
  }

  let webp: Buffer;
  try {
    webp = await encodeWebp(src, input);
  } catch (err) {
    return { changed: true, note: `! failed ${src}: ${(err as Error).message}` };
  }

  const worthKeeping = input.length - webp.length > MIN_SAVINGS;
  const current = (await exists(out)) ? await readFile(out) : null;

  if (!worthKeeping) {
    // WebP not smaller — make sure no stale variant lingers.
    if (current) {
      if (flags.check) return { changed: true, note: `orphan  ${out} (not smaller than source)` };
      await unlink(out);
      return { changed: true, note: `removed  ${out}` };
    }
    return { changed: false };
  }

  if (current && current.equals(webp)) return { changed: false };

  if (flags.check) {
    return { changed: true, note: current ? `stale   ${out}` : `missing ${out}` };
  }
  await writeFile(out, webp);
  const pct = ((1 - webp.length / input.length) * 100).toFixed(1);
  return { changed: true, note: `wrote   ${out}  (-${pct}% vs ${extname(src).slice(1)})` };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  // Determine the raster sources to reconcile.
  let sources: string[] = [];
  if (flags.files.length) {
    for (const f of flags.files) {
      if (RASTER.has(extname(f).toLowerCase()) && (await exists(f))) sources.push(f);
    }
  } else {
    for await (const f of walk(IMG_DIR)) {
      if (RASTER.has(extname(f).toLowerCase())) sources.push(f);
    }
  }

  const notes: string[] = [];
  let changed = false;
  for (const src of sources) {
    const r = await reconcile(src, flags);
    if (r.changed) changed = true;
    if (r.note) notes.push('  ' + r.note);
  }

  // Full runs also prune orphaned .webp whose source no longer exists.
  if (!flags.files.length) {
    const sourceSet = new Set(sources.map(variantPath));
    for await (const f of walk(IMG_DIR)) {
      if (extname(f).toLowerCase() !== '.webp') continue;
      if (sourceSet.has(f)) continue;
      changed = true;
      if (flags.check) notes.push(`  orphan  ${f} (no source)`);
      else {
        await unlink(f);
        notes.push(`  removed  ${f}`);
      }
    }
  }

  if (flags.check) {
    if (changed) {
      console.error('WebP variants out of date:');
      console.error(notes.join('\n'));
      console.error("\nRun 'bun run variants' and commit the result.");
      process.exit(1);
    }
    console.log('WebP variants up to date.');
    return;
  }

  console.log(notes.length ? notes.join('\n') : 'No variant changes.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

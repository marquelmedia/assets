#!/usr/bin/env bun
/**
 * Media optimization for the shared assets repo.
 *
 * These assets are served publicly (GitHub Pages) and reused across the marketing
 * site and every client site, so keeping them lean directly cuts bandwidth for all
 * of them. This is the repo's own maintenance tool, meant to run locally and in CI.
 *
 *   Raster (.png .jpg .jpeg .gif) -> re-encoded with sharp (lossless by default)
 *   Vector (.svg)                 -> minified with svgo (viewBox + ids preserved)
 *
 * Usage:
 *   bun tools/optimize.ts            # optimize in place (writes only when smaller)
 *   bun tools/optimize.ts --check    # CI mode: exit 1 if anything can still shrink
 *   bun tools/optimize.ts --dir img  # limit to a subtree (default: img)
 *   bun tools/optimize.ts a.png b.svg# optimize only the given files (used by the hook)
 *   bun tools/optimize.ts --yes      # never prompt (implied when non-interactive)
 *
 * By default optimization is lossless. Pass --lossy to also allow palette-quantized
 * PNGs and mozjpeg re-encoding for extra savings on photos/screenshots.
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import sharp from 'sharp';
import { optimize as svgoOptimize } from 'svgo';

export type Flags = { check: boolean; lossy: boolean; dir: string; files: string[] };

export const RASTER = new Set(['.png', '.jpg', '.jpeg', '.gif']);
export const MIN_SAVINGS = 16; // bytes; ignore churn smaller than this

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = { check: false, lossy: false, dir: 'img', files: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') flags.check = true;
    else if (arg === '--lossy') flags.lossy = true;
    else if (arg === '--yes') continue; // accepted for CLI consistency; no prompts here
    else if (arg === '--dir') flags.dir = argv[++i] ?? flags.dir;
    else if (arg.startsWith('--dir=')) flags.dir = arg.slice('--dir='.length);
    else if (!arg.startsWith('-')) flags.files.push(arg); // explicit file targets
  }
  return flags;
}

export async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue; // skip .DS_Store, dotfiles
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

export function isMedia(file: string): 'raster' | 'vector' | null {
  const ext = extname(file).toLowerCase();
  if (RASTER.has(ext)) return 'raster';
  if (ext === '.svg') return 'vector';
  return null;
}

export async function optimizeRaster(
  file: string,
  input: Buffer,
  lossy: boolean,
): Promise<Buffer> {
  const ext = extname(file).toLowerCase();
  const animated = ext === '.gif';
  const pipeline = sharp(input, { animated });
  switch (ext) {
    case '.png':
      return pipeline
        .png({ compressionLevel: 9, effort: 10, palette: lossy })
        .toBuffer();
    case '.jpg':
    case '.jpeg':
      return pipeline
        .jpeg(lossy ? { mozjpeg: true, quality: 80 } : { mozjpeg: true })
        .toBuffer();
    case '.gif':
      return pipeline.gif({ effort: 10 }).toBuffer();
    default:
      return input;
  }
}

export function optimizeVector(input: Buffer): Buffer {
  const result = svgoOptimize(input.toString('utf8'), {
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            // Keep ids so cross-site CSS/JS that targets the markup keeps working.
            // (viewBox is preserved by default in svgo v4.)
            cleanupIds: false,
          },
        },
      },
    ],
  });
  return Buffer.from(result.data, 'utf8');
}

export async function collectTargets(flags: Flags): Promise<string[] | null> {
  if (flags.files.length) {
    const targets: string[] = [];
    for (const f of flags.files) {
      try {
        if ((await stat(f)).isFile()) targets.push(f);
      } catch {
        // deleted/moved staged file — nothing to optimize
      }
    }
    return targets;
  }
  try {
    if (!(await stat(flags.dir)).isDirectory()) throw new Error();
  } catch {
    return null; // signals "directory not found"
  }
  const targets: string[] = [];
  for await (const f of walk(flags.dir)) targets.push(f);
  return targets;
}

/** Optimize (or, in check mode, evaluate) one file. Returns its byte delta + note. */
export async function optimizeFile(
  file: string,
  flags: Flags,
): Promise<{ before: number; saved: number; note?: string; failed?: boolean }> {
  const kind = isMedia(file);
  if (!kind) return { before: 0, saved: 0 };

  const input = await readFile(file);
  let output: Buffer;
  try {
    output =
      kind === 'vector'
        ? optimizeVector(input)
        : await optimizeRaster(file, input, flags.lossy);
  } catch (err) {
    return { before: input.length, saved: 0, note: `! skipped ${file}: ${(err as Error).message}`, failed: true };
  }

  const saved = input.length - output.length;
  if (saved <= MIN_SAVINGS) return { before: input.length, saved: 0 };

  const pct = ((saved / input.length) * 100).toFixed(1);
  if (flags.check) {
    return { before: input.length, saved, note: `  ${file}  (-${saved}B, -${pct}%)` };
  }
  await writeFile(file, output);
  return { before: input.length, saved, note: `  optimized ${file}  (-${saved}B, -${pct}%)` };
}

export async function run(argv: string[]): Promise<number> {
  const flags = parseFlags(argv);
  const targets = await collectTargets(flags);
  if (targets === null) {
    console.error(`Directory not found: ${flags.dir}`);
    return 1;
  }

  let totalBefore = 0;
  let totalSaved = 0;
  const shrinkable: string[] = [];
  let failures = 0;

  for (const file of targets) {
    const r = await optimizeFile(file, flags);
    totalBefore += r.before;
    totalSaved += r.saved;
    if (r.failed) failures++;
    if (r.note) {
      if (flags.check && !r.failed) shrinkable.push(r.note);
      else console[r.failed ? 'error' : 'log'](r.note);
    }
  }

  const pctTotal = totalBefore ? ((totalSaved / totalBefore) * 100).toFixed(1) : '0.0';

  if (flags.check) {
    if (shrinkable.length) {
      console.error(
        `Media not fully optimized (${shrinkable.length} file(s), ~${totalSaved}B / ${pctTotal}% recoverable):`,
      );
      console.error(shrinkable.join('\n'));
      console.error("\nRun 'bun run optimize' and commit the result.");
      return 1;
    }
    console.log('Media already optimized.');
  } else {
    console.log(
      totalSaved > 0
        ? `\nDone. Saved ${totalSaved}B (${pctTotal}%).`
        : '\nDone. Nothing to optimize.',
    );
  }

  return failures ? 1 : 0;
}

// Only run the CLI when executed directly, so tests can import the pure helpers.
if (import.meta.main) run(process.argv.slice(2)).then((code) => process.exit(code));

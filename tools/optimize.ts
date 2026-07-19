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

type Flags = { check: boolean; lossy: boolean; dir: string; files: string[] };

const RASTER = new Set(['.png', '.jpg', '.jpeg', '.gif']);
const MIN_SAVINGS = 16; // bytes; ignore churn smaller than this

function parseFlags(argv: string[]): Flags {
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

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue; // skip .DS_Store, dotfiles
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function optimizeRaster(
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

function optimizeVector(input: Buffer): Buffer {
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

async function collectTargets(flags: Flags): Promise<string[]> {
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
    console.error(`Directory not found: ${flags.dir}`);
    process.exit(1);
  }
  const targets: string[] = [];
  for await (const f of walk(flags.dir)) targets.push(f);
  return targets;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const targets = await collectTargets(flags);

  let totalBefore = 0;
  let totalAfter = 0;
  const shrinkable: string[] = [];
  let failures = 0;

  for (const file of targets) {
    const ext = extname(file).toLowerCase();
    const isRaster = RASTER.has(ext);
    const isVector = ext === '.svg';
    if (!isRaster && !isVector) continue;

    const input = await readFile(file);
    let output: Buffer;
    try {
      output = isVector
        ? optimizeVector(input)
        : await optimizeRaster(file, input, flags.lossy);
    } catch (err) {
      console.error(`  ! skipped ${file}: ${(err as Error).message}`);
      failures++;
      continue;
    }

    const saved = input.length - output.length;
    totalBefore += input.length;
    totalAfter += saved > MIN_SAVINGS ? output.length : input.length;

    if (saved > MIN_SAVINGS) {
      const pct = ((saved / input.length) * 100).toFixed(1);
      if (flags.check) {
        shrinkable.push(`  ${file}  (-${saved}B, -${pct}%)`);
      } else {
        await writeFile(file, output);
        console.log(`  optimized ${file}  (-${saved}B, -${pct}%)`);
      }
    }
  }

  const savedTotal = totalBefore - totalAfter;
  const pctTotal = totalBefore
    ? ((savedTotal / totalBefore) * 100).toFixed(1)
    : '0.0';

  if (flags.check) {
    if (shrinkable.length) {
      console.error(
        `Media not fully optimized (${shrinkable.length} file(s), ~${savedTotal}B / ${pctTotal}% recoverable):`,
      );
      console.error(shrinkable.join('\n'));
      console.error("\nRun 'bun run optimize' and commit the result.");
      process.exit(1);
    }
    console.log('Media already optimized.');
  } else {
    console.log(
      savedTotal > 0
        ? `\nDone. Saved ${savedTotal}B (${pctTotal}%).`
        : '\nDone. Nothing to optimize.',
    );
  }

  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

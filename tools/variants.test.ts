import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { randomFillSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  parseFlags,
  variantPath,
  exists,
  encodeWebp,
  reconcile,
  collectSources,
  run,
  type Flags,
} from './variants';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'variants-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const flags = (over: Partial<Flags> = {}): Flags => ({
  check: false,
  files: [],
  dir,
  ...over,
});

/** A flat-color PNG large enough (>1KB) to benefit from WebP. */
async function solidPng(path: string, w = 256, h = 256): Promise<void> {
  await sharp({
    create: { width: w, height: h, channels: 4, background: { r: 30, g: 90, b: 200, alpha: 1 } },
  })
    .png({ compressionLevel: 0 })
    .toFile(path);
}

describe('parseFlags', () => {
  test('defaults + flags', () => {
    expect(parseFlags([])).toEqual({ check: false, files: [], dir: 'img' });
    expect(parseFlags(['--check', '--yes', '--dir=x', 'a.png'])).toEqual({
      check: true,
      files: ['a.png'],
      dir: 'x',
    });
  });
});

describe('variantPath', () => {
  test.each([
    ['img/logo.png', 'img/logo.webp'],
    ['img/devices/iphone.png', 'img/devices/iphone.webp'],
    ['a.gif', 'a.webp'],
  ])('%s -> %s', (src, out) => {
    expect(variantPath(src)).toBe(out);
  });
});

describe('exists', () => {
  test('true for a file, false otherwise', async () => {
    const f = join(dir, 'x');
    await writeFile(f, 'hi');
    expect(await exists(f)).toBe(true);
    expect(await exists(join(dir, 'nope'))).toBe(false);
  });
});

describe('encodeWebp', () => {
  test('encodes lossless from png and lossy from jpg', async () => {
    const p = join(dir, 'a.png');
    await solidPng(p);
    const webp = await encodeWebp(p, await readFile(p));
    expect(webp.subarray(0, 4).toString('latin1')).toBe('RIFF');

    const jpg = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    expect((await encodeWebp('a.jpg', jpg)).length).toBeGreaterThan(0);
  });
});

describe('reconcile', () => {
  test('writes a webp when it is smaller', async () => {
    const p = join(dir, 'a.png');
    await solidPng(p);
    const r = await reconcile(p, flags());
    expect(r.changed).toBe(true);
    expect(await exists(variantPath(p))).toBe(true);
    // second reconcile is a no-op (byte-identical)
    expect((await reconcile(p, flags())).changed).toBe(false);
  });
  test('check mode reports missing without writing', async () => {
    const p = join(dir, 'a.png');
    await solidPng(p);
    const r = await reconcile(p, flags({ check: true }));
    expect(r.changed).toBe(true);
    expect(r.note).toContain('missing');
    expect(await exists(variantPath(p))).toBe(false);
  });
  test('tiny source: no variant desired', async () => {
    const p = join(dir, 'tiny.png');
    await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
      .png()
      .toFile(p);
    expect((await reconcile(p, flags())).changed).toBe(false);
  });
  test('tiny source with stale variant gets pruned', async () => {
    const p = join(dir, 'tiny.png');
    await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
      .png()
      .toFile(p);
    await writeFile(variantPath(p), 'stale');
    expect((await reconcile(p, flags({ check: true }))).note).toContain('orphan');
    const r = await reconcile(p, flags());
    expect(r.note).toContain('removed');
    expect(await exists(variantPath(p))).toBe(false);
  });
  test('source where webp is not smaller: no variant kept', async () => {
    // Source bytes are already an optimal lossless WebP (with a .png name), so a
    // re-encode can't shrink it -> the variant is not worth keeping.
    const noise = Buffer.alloc(128 * 128 * 3);
    randomFillSync(noise);
    const rawPng = await sharp(noise, { raw: { width: 128, height: 128, channels: 3 } })
      .png()
      .toBuffer();
    const p = join(dir, 'notsmaller.png');
    await writeFile(p, await encodeWebp('n.png', rawPng));
    expect((await reconcile(p, flags())).changed).toBe(false);
    // and a lingering variant is pruned
    await writeFile(variantPath(p), 'stale');
    expect((await reconcile(p, flags({ check: true }))).note).toContain('orphan');
    await reconcile(p, flags());
    expect(await exists(variantPath(p))).toBe(false);
  });
  test('encode failure is reported', async () => {
    const p = join(dir, 'bad.png');
    await writeFile(p, Buffer.alloc(2048, 1)); // >MIN_SOURCE_BYTES but not a real image
    const r = await reconcile(p, flags());
    expect(r.note).toContain('failed');
  });
});

describe('collectSources', () => {
  test('explicit files filter to existing rasters', async () => {
    const a = join(dir, 'a.png');
    await solidPng(a);
    const got = await collectSources(flags({ files: [a, join(dir, 'x.svg'), join(dir, 'missing.png')] }));
    expect(got).toEqual([a]);
  });
  test('directory walk collects rasters', async () => {
    await solidPng(join(dir, 'a.png'));
    await writeFile(join(dir, 'note.txt'), 'x');
    expect(await collectSources(flags())).toEqual([join(dir, 'a.png')]);
  });
});

describe('run', () => {
  test('generates variants and prunes orphans', async () => {
    await solidPng(join(dir, 'a.png'));
    await writeFile(join(dir, 'orphan.webp'), 'no source');
    expect(await run(['--dir=' + dir])).toBe(0);
    expect(await exists(join(dir, 'a.webp'))).toBe(true);
    expect(await exists(join(dir, 'orphan.webp'))).toBe(false);
  });
  test('check mode: missing then satisfied', async () => {
    await solidPng(join(dir, 'a.png'));
    expect(await run(['--check', '--dir=' + dir])).toBe(1);
    expect(await run(['--dir=' + dir])).toBe(0);
    expect(await run(['--check', '--dir=' + dir])).toBe(0);
  });
  test('explicit file mode does not prune', async () => {
    const a = join(dir, 'a.png');
    await solidPng(a);
    await writeFile(join(dir, 'orphan.webp'), 'keep me');
    expect(await run([a])).toBe(0);
    expect(await exists(join(dir, 'orphan.webp'))).toBe(true);
  });
});

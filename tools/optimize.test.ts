import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  parseFlags,
  isMedia,
  optimizeVector,
  optimizeRaster,
  collectTargets,
  optimizeFile,
  run,
} from './optimize';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'optimize-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">
  <!-- a comment -->
  <rect id="keepme" x="0" y="0" width="10" height="10" fill="#ff0000"></rect>
</svg>`;

async function bloatedPng(path: string, w = 200, h = 200): Promise<void> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 4, background: { r: 10, g: 80, b: 160, alpha: 1 } },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  await writeFile(path, buf);
}

describe('parseFlags', () => {
  test('defaults', () => {
    expect(parseFlags([])).toEqual({ check: false, lossy: false, dir: 'img', files: [] });
  });
  test('flags and files', () => {
    expect(parseFlags(['--check', '--lossy', '--yes', 'a.png', 'b.svg'])).toEqual({
      check: true,
      lossy: true,
      dir: 'img',
      files: ['a.png', 'b.svg'],
    });
  });
  test('--dir value and --dir= form', () => {
    expect(parseFlags(['--dir', 'x']).dir).toBe('x');
    expect(parseFlags(['--dir=y']).dir).toBe('y');
  });
});

describe('isMedia', () => {
  test.each([
    ['a.png', 'raster'],
    ['a.JPG', 'raster'],
    ['a.gif', 'raster'],
    ['a.svg', 'vector'],
    ['a.txt', null],
    ['a.webp', null],
  ])('%s -> %s', (file, expected) => {
    expect(isMedia(file)).toBe(expected as never);
  });
});

describe('optimizeVector', () => {
  test('shrinks and preserves viewBox + ids', () => {
    const out = optimizeVector(Buffer.from(SVG)).toString('utf8');
    expect(out.length).toBeLessThan(SVG.length);
    expect(out).toContain('viewBox');
    expect(out).toContain('keepme');
    expect(out).not.toContain('a comment');
  });
});

describe('optimizeRaster', () => {
  test('recompresses png smaller (lossless)', async () => {
    const input = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const out = await optimizeRaster('x.png', input, false);
    expect(out.length).toBeLessThan(input.length);
  });
  test('handles gif and jpeg branches', async () => {
    const gif = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .gif()
      .toBuffer();
    expect((await optimizeRaster('x.gif', gif, false)).length).toBeGreaterThan(0);
    const jpg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .jpeg()
      .toBuffer();
    expect((await optimizeRaster('x.jpg', jpg, true)).length).toBeGreaterThan(0);
  });
  test('unknown ext returns input unchanged', async () => {
    const input = Buffer.from('nope');
    expect(await optimizeRaster('x.bmp', input, false)).toBe(input);
  });
});

describe('collectTargets', () => {
  test('explicit files: keeps existing, drops missing', async () => {
    const a = join(dir, 'a.png');
    await bloatedPng(a);
    const targets = await collectTargets({
      check: false,
      lossy: false,
      dir: 'img',
      files: [a, join(dir, 'missing.png')],
    });
    expect(targets).toEqual([a]);
  });
  test('directory walk finds nested files', async () => {
    await mkdir(join(dir, 'sub'), { recursive: true });
    await bloatedPng(join(dir, 'a.png'));
    await bloatedPng(join(dir, 'sub', 'b.png'));
    const targets = await collectTargets({ check: false, lossy: false, dir, files: [] });
    expect(targets?.sort()).toEqual([join(dir, 'a.png'), join(dir, 'sub', 'b.png')].sort());
  });
  test('missing directory returns null', async () => {
    expect(
      await collectTargets({ check: false, lossy: false, dir: join(dir, 'nope'), files: [] }),
    ).toBeNull();
  });
});

describe('optimizeFile', () => {
  test('writes a smaller file when not in check mode', async () => {
    const a = join(dir, 'a.png');
    await bloatedPng(a);
    const before = (await stat(a)).size;
    const r = await optimizeFile(a, { check: false, lossy: false, dir, files: [] });
    expect(r.saved).toBeGreaterThan(0);
    expect((await stat(a)).size).toBeLessThan(before);
    expect(r.note).toContain('optimized');
  });
  test('check mode reports but does not write', async () => {
    const a = join(dir, 'a.png');
    await bloatedPng(a);
    const before = (await stat(a)).size;
    const r = await optimizeFile(a, { check: true, lossy: false, dir, files: [] });
    expect(r.saved).toBeGreaterThan(0);
    expect((await stat(a)).size).toBe(before);
  });
  test('non-media returns zero delta', async () => {
    const t = join(dir, 'a.txt');
    await writeFile(t, 'hi');
    expect(await optimizeFile(t, { check: false, lossy: false, dir, files: [] })).toEqual({
      before: 0,
      saved: 0,
    });
  });
  test('corrupt raster is reported as a failure', async () => {
    const a = join(dir, 'a.png');
    await writeFile(a, Buffer.from('not a real png'));
    const r = await optimizeFile(a, { check: false, lossy: false, dir, files: [] });
    expect(r.failed).toBe(true);
    expect(r.note).toContain('skipped');
  });
});

describe('run', () => {
  test('optimizes a directory in place', async () => {
    await bloatedPng(join(dir, 'a.png'));
    const before = (await stat(join(dir, 'a.png'))).size;
    expect(await run(['--dir', dir])).toBe(0);
    expect((await stat(join(dir, 'a.png'))).size).toBeLessThan(before);
    // idempotent: a second pass reports nothing left to do
    expect(await run(['--dir', dir])).toBe(0);
    expect(await run(['--check', '--dir', dir])).toBe(0);
  });
  test('check mode fails on unoptimized media', async () => {
    await bloatedPng(join(dir, 'a.png'));
    expect(await run(['--check', '--dir', dir])).toBe(1);
  });
  test('missing directory returns 1', async () => {
    expect(await run(['--dir', join(dir, 'nope')])).toBe(1);
  });
  test('explicit file target', async () => {
    const a = join(dir, 'a.png');
    await bloatedPng(a);
    expect(await run([a])).toBe(0);
  });
  test('failures surface as exit 1', async () => {
    await writeFile(join(dir, 'a.png'), Buffer.from('bad'));
    expect(await run(['--dir', dir])).toBe(1);
  });
});

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  svgDimensions,
  describe as describeAsset,
  linkVariants,
  renderCatalog,
  build,
  run,
  type Asset,
} from './manifest';

let dir: string;
let img: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'manifest-'));
  img = join(dir, 'img');
  await mkdir(img, { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const asset = (over: Partial<Asset>): Asset => ({
  path: 'img/x.png',
  type: 'png',
  bytes: 10,
  width: 1,
  height: 1,
  hash: 'abc',
  url: 'u',
  ...over,
});

describe('svgDimensions', () => {
  test('prefers width/height attributes', () => {
    expect(svgDimensions('<svg width="120" height="48" viewBox="0 0 10 10">')).toEqual({
      width: 120,
      height: 48,
    });
  });
  test('falls back to viewBox', () => {
    expect(svgDimensions('<svg viewBox="0 0 24 36">')).toEqual({ width: 24, height: 36 });
  });
  test('returns nulls when nothing is present', () => {
    expect(svgDimensions('<svg>')).toEqual({ width: null, height: null });
  });
});

describe('describe', () => {
  test('png dimensions + hash + url', async () => {
    const p = join(img, 'a.png');
    await sharp({ create: { width: 12, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
      .png()
      .toFile(p);
    const a = await describeAsset(p, 'https://base');
    expect(a.type).toBe('png');
    expect(a.width).toBe(12);
    expect(a.height).toBe(8);
    expect(a.hash).toHaveLength(12);
    expect(a.url).toBe(`https://base/${p.split('/').join('/')}`);
  });
  test('svg dimensions from markup', async () => {
    const p = join(img, 'a.svg');
    await writeFile(p, '<svg width="30" height="30" viewBox="0 0 30 30"></svg>');
    const a = await describeAsset(p);
    expect(a.width).toBe(30);
  });
  test('animated gif reports frames', async () => {
    const p = join(img, 'a.gif');
    // two-frame gif
    const frame = await sharp({
      create: { width: 4, height: 4, channels: 4, background: { r: 1, g: 1, b: 1, alpha: 1 } },
    })
      .gif()
      .toBuffer();
    await writeFile(p, frame);
    const a = await describeAsset(p);
    expect(a.type).toBe('gif');
  });
  test('unreadable raster leaves dimensions null', async () => {
    const p = join(img, 'bad.png');
    await writeFile(p, Buffer.from('not an image'));
    const a = await describeAsset(p);
    expect(a.width).toBeNull();
    expect(a.height).toBeNull();
  });
});

describe('linkVariants', () => {
  test('links webp back to its source', () => {
    const assets = [asset({ path: 'img/logo.png', type: 'png' }), asset({ path: 'img/logo.webp', type: 'webp' })];
    linkVariants(assets);
    expect(assets[0].variants).toEqual(['img/logo.webp']);
    expect(assets[1].variantOf).toBe('img/logo.png');
  });
  test('variant without a source is left unlinked', () => {
    const assets = [asset({ path: 'img/orphan.webp', type: 'webp' })];
    linkVariants(assets);
    expect(assets[0].variantOf).toBeUndefined();
  });
});

describe('renderCatalog', () => {
  test('renders rows, dimensions, frames and em dash', () => {
    const out = renderCatalog([
      asset({ path: 'img/a.png', width: 10, height: 20, bytes: 2048 }),
      asset({ path: 'img/anim.gif', type: 'gif', width: 5, height: 5, frames: 3 }),
      asset({ path: 'img/x.svg', type: 'svg', width: null, height: null }),
    ]);
    expect(out).toContain('| ![img/a.png](img/a.png) |');
    expect(out).toContain('10×20');
    expect(out).toContain('· 3f');
    expect(out).toContain('| — |');
    expect(out).toContain('2.0 KB');
  });
});

describe('build', () => {
  test('collects, sorts, and links assets', async () => {
    await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
      .png()
      .toFile(join(img, 'logo.png'));
    await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
      .webp()
      .toFile(join(img, 'logo.webp'));
    await writeFile(join(img, 'note.txt'), 'ignored');
    const { assets, manifest, catalog } = await build(img, 'https://base');
    expect(assets.map((a) => a.path)).toEqual([join(img, 'logo.png'), join(img, 'logo.webp')]);
    expect(JSON.parse(manifest).assets).toHaveLength(2);
    expect(catalog).toContain('Asset Catalog');
  });
});

describe('run', () => {
  const opts = () => ({
    imgDir: img,
    manifestPath: join(img, 'manifest.json'),
    catalogPath: join(dir, 'CATALOG.md'),
  });
  test('generate then check round-trips', async () => {
    await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
      .png()
      .toFile(join(img, 'a.png'));
    expect(await run(['--check'], opts())).toBe(1); // nothing written yet
    expect(await run([], opts())).toBe(0);
    expect(await run(['--check'], opts())).toBe(0);
    const parsed = JSON.parse(await readFile(join(img, 'manifest.json'), 'utf8'));
    expect(parsed.assets[0].path).toContain('a.png');
  });
});

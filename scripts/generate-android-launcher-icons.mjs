/**
 * Regenerates android/app/src/main/res/mipmap-* launcher PNGs from
 * public/logo-purple-light.webp (light purple lock, same as in-app Logo).
 *
 * Adaptive foregrounds keep artwork inside the 72dp safe zone of a 108dp layer.
 * Run: npm run generate:android-icons (after npm install).
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'public/logo-purple-light.webp');
const androidRes = join(root, 'android/app/src/main/res');

/** Legacy / pre-adaptive full launcher (square) */
const LAUNCHER_PX = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

/** Adaptive icon foreground layer (108dp base × density) */
const FOREGROUND_PX = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

async function writeLauncher(folder, px) {
  const dir = join(androidRes, folder);
  mkdirSync(dir, { recursive: true });
  const buf = await sharp(src)
    .resize(px, px, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  await sharp(buf).toFile(join(dir, 'ic_launcher.png'));
  await sharp(buf).toFile(join(dir, 'ic_launcher_round.png'));
}

async function writeForeground(folder, layerPx) {
  const dir = join(androidRes, folder);
  mkdirSync(dir, { recursive: true });
  const safePx = Math.floor((layerPx * 72) / 108);
  const maxLogo = Math.max(1, Math.floor(safePx * 0.88));
  const resized = await sharp(src)
    .resize(maxLogo, maxLogo, {
      fit: 'contain',
      position: 'centre',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const { width, height } = await sharp(resized).metadata();
  const w = width ?? maxLogo;
  const h = height ?? maxLogo;
  const left = Math.floor((layerPx - w) / 2);
  const top = Math.floor((layerPx - h) / 2);
  await sharp({
    create: {
      width: layerPx,
      height: layerPx,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toFile(join(dir, 'ic_launcher_foreground.png'));
}

for (const [folder, px] of Object.entries(LAUNCHER_PX)) {
  await writeLauncher(folder, px);
}
for (const [folder, px] of Object.entries(FOREGROUND_PX)) {
  await writeForeground(folder, px);
}

console.log('Android launcher mipmaps updated from logo-purple-light.webp');

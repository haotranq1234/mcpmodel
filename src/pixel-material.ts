export type PixelMaterialStyle = "solid" | "hand_painted" | "metal" | "cloth" | "organic" | "bone" | "crystal";

export interface PixelPatch {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface PixelMaterialOptions {
  baseColor: string;
  width: number;
  height: number;
  style?: PixelMaterialStyle;
  accentColors?: string[];
  seed?: number;
  contrast?: number;
  noiseDensity?: number;
  edgeHighlight?: boolean;
  tileSize?: number;
}

type Rgb = [number, number, number];

function clamp(value: number, min = 0, max = 255): number {
  return Math.max(min, Math.min(max, value));
}

function parseHex(value: string): Rgb {
  const hex = value.slice(1, 7);
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}

function toHex([red, green, blue]: Rgb): string {
  return `#${[red, green, blue].map(value => Math.round(clamp(value)).toString(16).padStart(2, "0")).join("")}`;
}

function tone(color: string, amount: number, hueBias: Rgb = [0, 0, 0]): string {
  const rgb = parseHex(color);
  const target = amount >= 0 ? 255 : 0;
  const strength = Math.abs(amount);
  return toHex(rgb.map((value, index) => value + (target - value) * strength + hueBias[index] * strength) as Rgb);
}

function hash(x: number, y: number, seed: number): number {
  let value = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263) ^ Math.imul(seed + 101, 1442695041);
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 0x1_0000_0000;
}

export function generatePixelMaterial(options: PixelMaterialOptions): PixelPatch[] {
  const style = options.style ?? "solid";
  if (style === "solid") return [];
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const seed = Math.floor(options.seed ?? 1);
  const contrast = clamp(options.contrast ?? 0.22, 0, 1);
  const density = clamp(options.noiseDensity ?? 0.18, 0, 0.9);
  const tile = Math.max(4, Math.min(64, Math.floor(options.tileSize ?? 16)));
  const accents = options.accentColors ?? [];
  const shadowBias: Rgb = style === "bone" ? [8, 2, -12] : style === "organic" ? [-10, 3, 8] : [-4, 0, 10];
  const shadow = tone(options.baseColor, -contrast, shadowBias);
  const deepShadow = tone(options.baseColor, -Math.min(0.72, contrast * 1.65), shadowBias);
  const highlight = tone(options.baseColor, Math.min(0.72, contrast * 1.12), style === "bone" ? [10, 4, -6] : [2, 2, 8]);
  const glint = tone(options.baseColor, Math.min(0.9, contrast * 1.8));
  const pixels: PixelPatch[] = [];
  const put = (x: number, y: number, color: string, patchWidth = 1, patchHeight = 1) => {
    if (x < width && y < height) pixels.push({ x, y, width: Math.min(patchWidth, width - x), height: Math.min(patchHeight, height - y), color });
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const localX = x % tile;
      const localY = y % tile;
      const random = hash(x, y, seed);
      let selected: string | undefined;
      if (options.edgeHighlight !== false && (localX === 0 || localY === 0)) selected = highlight;
      if (localX === tile - 1 || localY === tile - 1) selected = shadow;
      if (style === "metal") {
        if (localY === 2 && localX > 1 && localX < tile - 2) selected = glint;
        else if (localY >= tile - 3) selected = deepShadow;
        else if ((localX + localY) % 11 === 0 && random < 0.42) selected = highlight;
      } else if (style === "cloth") {
        if ((localX + localY) % 4 === 0 && random < 0.5) selected = shadow;
        else if ((localX - localY + tile) % 7 === 0 && random < 0.35) selected = highlight;
      } else if (style === "organic") {
        const wave = Math.round(tile * 0.45 + Math.sin((x + seed) * 0.55) * tile * 0.16);
        if (localY === wave || localY === wave + 1) selected = shadow;
        else if (Math.abs(localY - wave) === 2 && random < 0.55) selected = highlight;
      } else if (style === "bone") {
        if (random < density * 0.38) selected = random < density * 0.08 ? deepShadow : shadow;
        else if ((localX + localY * 2 + seed) % 13 === 0) selected = highlight;
      } else if (style === "crystal") {
        if ((localX + localY + seed) % Math.max(5, Math.floor(tile / 2)) === 0) selected = accents[0] ?? glint;
        else if ((localX - localY + tile * 4) % tile === 1) selected = highlight;
        else if (localY > tile * 0.68) selected = shadow;
      } else if (style === "hand_painted") {
        if (random < density * 0.55) selected = random < density * 0.16 ? deepShadow : shadow;
        else if (random > 1 - density * 0.32) selected = highlight;
      }
      if (!selected && random < density * 0.18) selected = shadow;
      if (!selected && accents.length && random > 1 - density * 0.08) selected = accents[Math.floor(random * accents.length) % accents.length];
      if (selected) put(x, y, selected);
    }
  }
  return pixels;
}

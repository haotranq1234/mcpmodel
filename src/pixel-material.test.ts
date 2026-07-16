import assert from "node:assert/strict";
import test from "node:test";
import { generatePixelMaterial } from "./pixel-material.js";

test("generates deterministic hand-painted pixel materials", () => {
  const options = { baseColor: "#345A78", width: 32, height: 32, style: "organic" as const, seed: 42, accentColors: ["#7BC8B4"] };
  const first = generatePixelMaterial(options);
  const second = generatePixelMaterial(options);
  assert.deepEqual(first, second);
  assert.ok(first.length > 80);
  assert.ok(new Set(first.map(pixel => pixel.color)).size >= 3);
  assert.ok(first.every(pixel => pixel.x >= 0 && pixel.y >= 0 && pixel.x + pixel.width <= 32 && pixel.y + pixel.height <= 32));
});

test("keeps solid materials patch-free", () => {
  assert.deepEqual(generatePixelMaterial({ baseColor: "#222222", width: 16, height: 16, style: "solid" }), []);
});

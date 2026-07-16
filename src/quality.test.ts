import assert from "node:assert/strict";
import test from "node:test";
import { buildCutePet } from "./pet-generator.js";
import { analyzeModelQuality, type ProjectSnapshot } from "./quality.js";

function snapshotFromPet(): ProjectSnapshot {
  const model = buildCutePet({ name: "Quality Fox", species: "fox", accessory: "bow", animation_set: "full" });
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const cube of model.cubes) {
    cube.from.forEach((value, axis) => { min[axis] = Math.min(min[axis], value); });
    cube.to.forEach((value, axis) => { max[axis] = Math.max(max[axis], value); });
  }
  return {
    open: true,
    bounds: { min, max, size: max.map((value, axis) => value - min[axis]) },
    groups: model.groups.map(group => ({ name: group.name, rotation: group.rotation })),
    cubes: model.cubes.map(cube => ({ name: cube.name, from: cube.from, to: cube.to, rotation: cube.rotation, inflate: cube.inflate })),
    textures: model.textures.map(texture => ({ name: texture.name, width: texture.width, height: texture.height })),
    animations: model.animations.map(animation => ({ name: animation.name, length: animation.length, loop: animation.loop })),
  };
}

test("awards a high pet quality score to the layered generator", () => {
  const report = analyzeModelQuality(snapshotFromPet(), "pet");
  assert.equal(report.ok, true);
  assert.ok(report.score >= 90, JSON.stringify(report.findings));
  assert.ok(["S", "A"].includes(report.grade));
  assert.equal(report.next_actions.length, 0);
});

test("detects a crude unrigged pet", () => {
  const report = analyzeModelQuality({
    open: true,
    bounds: { min: [-2, 0, -2], max: [2, 8, 2], size: [4, 8, 4] },
    groups: [{ name: "root" }],
    cubes: [
      { name: "cube", from: [-2, 0, -2], to: [2, 5, 2], rotation: [0, 0, 0] },
      { name: "cube", from: [-2, 5, -2], to: [2, 8, 2], rotation: [0, 0, 0] },
    ],
    textures: [{ name: "plain.png" }],
    animations: [],
  }, "pet");
  assert.ok(report.score < 60);
  assert.ok(report.next_actions.length > 0);
  assert.ok(report.findings.some(finding => finding.code === "flat_face"));
});

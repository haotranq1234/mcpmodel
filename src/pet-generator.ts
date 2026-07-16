import { z } from "zod";
import { modelSpecSchema, type ModelSpec } from "./schemas.js";

const colorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);

export const petSpecies = ["fox", "wolf", "cat", "rabbit"] as const;
export const petAccessories = ["none", "bow", "scarf", "collar", "crown"] as const;

export const petGeneratorSchema = z.object({
  name: z.string().min(1).max(120),
  species: z.enum(petSpecies).default("fox"),
  accessory: z.enum(petAccessories).default("bow"),
  scale: z.number().positive().max(10).default(1),
  format: z.string().min(1).default("free"),
  animation_set: z.enum(["none", "core", "full"]).default("full"),
  colors: z.object({
    primary: colorSchema.optional(),
    secondary: colorSchema.optional(),
    dark: colorSchema.optional(),
    eyes: colorSchema.optional(),
    accent: colorSchema.optional(),
    highlight: colorSchema.optional(),
  }).default({}),
});

export type PetGeneratorInput = z.input<typeof petGeneratorSchema>;
type Vec3 = [number, number, number];
type CubeInput = {
  name: string;
  parent: string;
  from: Vec3;
  to: Vec3;
  texture: string;
  origin?: Vec3;
  rotation?: Vec3;
  inflate?: number;
  shade?: boolean;
};

const PALETTES = {
  fox: { primary: "#E87532", secondary: "#FFF0D2", dark: "#34231F", eyes: "#33221E", accent: "#F58FA7", highlight: "#FFFFFF" },
  wolf: { primary: "#788493", secondary: "#DCE4E8", dark: "#29323B", eyes: "#244A62", accent: "#7EC7D8", highlight: "#FFFFFF" },
  cat: { primary: "#B88A68", secondary: "#F3D6B8", dark: "#3D2D28", eyes: "#4E7B4A", accent: "#E89BB0", highlight: "#FFFFFF" },
  rabbit: { primary: "#E9E3DE", secondary: "#FFF8EE", dark: "#4A3A3A", eyes: "#493238", accent: "#F3A7B8", highlight: "#FFFFFF" },
} as const;

function cleanName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "cute_pet";
}

function closedTrack(bone: string, channel: "rotation" | "position" | "scale", length: number, middle: Array<[number, Vec3]>) {
  return {
    bone,
    keyframes: [
      { time: 0, channel, vector: [0, 0, 0] as Vec3, interpolation: "catmullrom" as const },
      ...middle.map(([time, vector]) => ({ time, channel, vector, interpolation: "catmullrom" as const })),
      { time: length, channel, vector: [0, 0, 0] as Vec3, interpolation: "catmullrom" as const },
    ],
  };
}

export function buildCutePet(input: PetGeneratorInput): ModelSpec {
  const options = petGeneratorSchema.parse(input);
  const id = cleanName(options.name);
  const scale = options.scale;
  const n = (value: number) => Number((value * scale).toFixed(4));
  const v = (value: Vec3): Vec3 => [n(value[0]), n(value[1]), n(value[2])];
  const palette = { ...PALETTES[options.species], ...options.colors };
  const textureNames = {
    primary: `${id}_primary.png`, secondary: `${id}_secondary.png`, dark: `${id}_dark.png`,
    eyes: `${id}_eyes.png`, accent: `${id}_accent.png`, highlight: `${id}_highlight.png`,
  };
  const cubes: Array<Record<string, unknown>> = [];
  const add = (cube: CubeInput) => {
    const face = { texture: cube.texture };
    cubes.push({
      name: cube.name,
      parent: cube.parent,
      from: v(cube.from),
      to: v(cube.to),
      origin: v(cube.origin ?? [
        (cube.from[0] + cube.to[0]) / 2,
        (cube.from[1] + cube.to[1]) / 2,
        (cube.from[2] + cube.to[2]) / 2,
      ]),
      rotation: cube.rotation ?? [0, 0, 0],
      inflate: n(cube.inflate ?? 0),
      shade: cube.shade ?? true,
      box_uv: false,
      faces: { north: face, south: face, east: face, west: face, up: face, down: face },
    });
  };

  const groups: Array<Record<string, unknown>> = [
    { id: "root", name: id, origin: v([0, 0, 0]) },
    { id: "vfx", name: "vfx", parent: "root", origin: v([0, 0, 0]) },
    { id: "body", name: "body", parent: "root", origin: v([0, 6, 2.5]) },
    { id: "torso", name: "torso", parent: "body", origin: v([0, 7, 0]) },
    { id: "neck", name: "neck", parent: "torso", origin: v([0, 9, -1]) },
    { id: "head", name: "h_head", parent: "neck", origin: v([0, 11, -3]) },
    { id: "muzzle", name: "h_muzzle", parent: "head", origin: v([0, 11, -7]) },
    { id: "left_eye", name: "h_left_eye", parent: "head", origin: v([-2.2, 12.6, -7.2]) },
    { id: "right_eye", name: "h_right_eye", parent: "head", origin: v([2.2, 12.6, -7.2]) },
    { id: "left_ear", name: "h_left_ear", parent: "head", origin: v([-3.1, 15.5, -3.7]), rotation: [0, -8, -10] },
    { id: "right_ear", name: "h_right_ear", parent: "head", origin: v([3.1, 15.5, -3.7]), rotation: [0, 8, 10] },
    { id: "front_left_leg", name: "front_left_leg", parent: "body", origin: v([-2.1, 4.5, -0.2]) },
    { id: "front_right_leg", name: "front_right_leg", parent: "body", origin: v([2.1, 4.5, -0.2]) },
    { id: "back_left_leg", name: "back_left_leg", parent: "body", origin: v([-2.1, 4.5, 4.4]) },
    { id: "back_right_leg", name: "back_right_leg", parent: "body", origin: v([2.1, 4.5, 4.4]) },
    // Static shaping belongs to the cubes, not nested bones. This avoids compounded
    // rotations that make a tail look disconnected in side/back views.
    { id: "tail", name: "tail", parent: "body", origin: v([0, 7, 5.8]) },
    { id: "tail_mid", name: "tail_mid", parent: "tail", origin: v([1.25, 8.9, 8.5]) },
    { id: "tail_tip", name: "tail_tip", parent: "tail_mid", origin: v([3, 10.6, 11.2]) },
    { id: "accessory", name: `accessory_${options.accessory}`, parent: "neck", origin: v([0, 9.2, -1.3]) },
    { id: "hitbox", name: "hitbox", origin: v([0, 7, 0]) },
  ];

  // Layered body masses: a readable primary silhouette plus cream chest and small fur breaks.
  add({ name: "body_core", parent: "torso", from: [-3.1, 4.2, -0.8], to: [3.1, 9.2, 6.1], texture: textureNames.primary, inflate: 0.12 });
  add({ name: "rump_fluff", parent: "torso", from: [-3.35, 5, 3.1], to: [3.35, 9.5, 6.5], texture: textureNames.primary, inflate: 0.08 });
  add({ name: "cream_chest", parent: "torso", from: [-2.35, 5.5, -1.08], to: [2.35, 8.9, -0.82], texture: textureNames.secondary });
  add({ name: "chest_fluff_left", parent: "torso", from: [-2.8, 7.1, -1.25], to: [-0.1, 9.6, -0.76], texture: textureNames.secondary, rotation: [0, 0, 8] });
  add({ name: "chest_fluff_right", parent: "torso", from: [0.1, 7.1, -1.25], to: [2.8, 9.6, -0.76], texture: textureNames.secondary, rotation: [0, 0, -8] });

  // Oversized chibi head with layered cheeks, muzzle, eyes and tiny expression details.
  add({ name: "head_core", parent: "head", from: [-4.55, 8.7, -7.05], to: [4.55, 16.15, 0.15], texture: textureNames.primary, inflate: 0.12 });
  add({ name: "forehead_fluff", parent: "head", from: [-1.5, 15.2, -7.32], to: [1.5, 16.65, -6.72], texture: textureNames.primary, rotation: [0, 0, 45] });
  add({ name: "left_cheek", parent: "head", from: [-4.78, 9.25, -7.38], to: [-0.35, 12.55, -6.98], texture: textureNames.secondary, rotation: [0, 0, 3] });
  add({ name: "right_cheek", parent: "head", from: [0.35, 9.25, -7.38], to: [4.78, 12.55, -6.98], texture: textureNames.secondary, rotation: [0, 0, -3] });
  add({ name: "muzzle_left", parent: "muzzle", from: [-2.6, 9.35, -7.9], to: [0.05, 11.75, -7.1], texture: textureNames.secondary, inflate: 0.06 });
  add({ name: "muzzle_right", parent: "muzzle", from: [-0.05, 9.35, -7.9], to: [2.6, 11.75, -7.1], texture: textureNames.secondary, inflate: 0.06 });
  add({ name: "nose", parent: "muzzle", from: [-0.8, 10.65, -8.35], to: [0.8, 11.65, -7.82], texture: textureNames.dark, inflate: 0.04 });
  add({ name: "smile_left", parent: "muzzle", from: [-0.95, 9.7, -8.12], to: [-0.08, 9.98, -7.88], texture: textureNames.dark, rotation: [0, 0, -12], shade: false });
  add({ name: "smile_right", parent: "muzzle", from: [0.08, 9.7, -8.12], to: [0.95, 9.98, -7.88], texture: textureNames.dark, rotation: [0, 0, 12], shade: false });

  for (const side of [-1, 1] as const) {
    const eyeParent = side < 0 ? "left_eye" : "right_eye";
    const sideName = side < 0 ? "left" : "right";
    const x0 = side < 0 ? -3.25 : 1.25;
    add({ name: `${sideName}_eye`, parent: eyeParent, from: [x0, 11.45, -7.48], to: [x0 + 2, 14.35, -7.12], texture: textureNames.eyes, rotation: [0, 0, side * -3], shade: false });
    add({ name: `${sideName}_eye_big_shine`, parent: eyeParent, from: [x0 + 0.3, 13.25, -7.7], to: [x0 + 0.95, 13.95, -7.42], texture: textureNames.highlight, shade: false });
    add({ name: `${sideName}_eye_small_shine`, parent: eyeParent, from: [x0 + 1.2, 12.35, -7.7], to: [x0 + 1.55, 12.72, -7.42], texture: textureNames.highlight, shade: false });
    const blushX = side < 0 ? -4.18 : 3.15;
    add({ name: `${sideName}_blush`, parent: "head", from: [blushX, 10.15, -7.6], to: [blushX + 1.05, 10.65, -7.25], texture: textureNames.accent, rotation: [0, 0, side * -5], shade: false });
  }

  const rabbit = options.species === "rabbit";
  const earTop = rabbit ? 22 : 20;
  const earWidth = rabbit ? 2.6 : 3.6;
  for (const side of [-1, 1] as const) {
    const parent = side < 0 ? "left_ear" : "right_ear";
    const sideName = side < 0 ? "left" : "right";
    const center = side * 3.05;
    add({ name: `${sideName}_ear_outer`, parent, from: [center - earWidth / 2, 14.7, -5.7], to: [center + earWidth / 2, earTop, -1.9], texture: textureNames.primary, rotation: [0, side * 4, side * 7] });
    add({ name: `${sideName}_ear_inner`, parent, from: [center - earWidth * 0.27, 15.65, -5.98], to: [center + earWidth * 0.27, earTop - 1, -5.64], texture: textureNames.accent, rotation: [0, side * 4, side * 7], shade: false });
    if (!rabbit) add({ name: `${sideName}_ear_tip`, parent, from: [center - 0.9, earTop - 1.3, -5.45], to: [center + 0.9, earTop + 0.25, -2.6], texture: textureNames.dark, rotation: [0, side * 4, side * 7] });
  }

  // Three-layer legs and paws produce better side silhouettes than single rectangular posts.
  const legs = [
    ["front_left_leg", -2.1, -0.25], ["front_right_leg", 2.1, -0.25],
    ["back_left_leg", -2.1, 4.35], ["back_right_leg", 2.1, 4.35],
  ] as const;
  for (const [parent, x, z] of legs) {
    add({ name: `${parent}_upper`, parent, from: [x - 1.05, 1.6, z - 1.1], to: [x + 1.05, 5.8, z + 1.1], texture: textureNames.primary, inflate: 0.06 });
    add({ name: `${parent}_paw`, parent, from: [x - 1.28, 0.15, z - 1.55], to: [x + 1.28, 2.05, z + 1.2], texture: textureNames.secondary, inflate: 0.08 });
    add({ name: `${parent}_toe_line`, parent, from: [x - 0.12, 0.35, z - 1.76], to: [x + 0.12, 1.1, z - 1.5], texture: textureNames.primary, shade: false });
  }

  if (rabbit) {
    add({ name: "round_tail", parent: "tail", from: [-1.8, 6.2, 5.7], to: [1.8, 9.8, 9.3], texture: textureNames.secondary, inflate: 0.5 });
  } else {
    const tailScale = options.species === "cat" ? 0.72 : options.species === "wolf" ? 0.88 : 1;
    add({ name: "tail_base_fluff", parent: "tail", from: [-1.55 * tailScale, 5.65, 5.05], to: [1.55 * tailScale, 9.35, 9.15], texture: textureNames.primary, origin: [0, 7, 5.8], rotation: [15, 0, -6], inflate: 0.12 });
    add({ name: "tail_middle_fluff", parent: "tail_mid", from: [-0.25 * tailScale, 7.35, 8.05], to: [3.65 * tailScale, 11.55, 12.35], texture: textureNames.primary, origin: [1.25, 8.9, 8.5], rotation: [-8, 0, -14], inflate: 0.15 });
    add({ name: "tail_cream_tip", parent: "tail_tip", from: [2.15 * tailScale, 9.65, 11.15], to: [5.25 * tailScale, 13.3, 14.4], texture: textureNames.secondary, origin: [3, 10.6, 11.2], rotation: [-12, 0, -18], inflate: 0.16 });
  }

  if (options.accessory === "bow") {
    add({ name: "bow_knot", parent: "accessory", from: [-0.75, 8.15, -7.45], to: [0.75, 9.55, -6.65], texture: textureNames.accent, rotation: [0, 0, 45], inflate: 0.06 });
    add({ name: "bow_left", parent: "accessory", from: [-3, 7.65, -7.3], to: [-0.55, 9.7, -6.72], texture: textureNames.accent, rotation: [0, 0, 14] });
    add({ name: "bow_right", parent: "accessory", from: [0.55, 7.65, -7.3], to: [3, 9.7, -6.72], texture: textureNames.accent, rotation: [0, 0, -14] });
  } else if (options.accessory === "scarf") {
    add({ name: "scarf_band", parent: "accessory", from: [-3.15, 8.2, -1.55], to: [3.15, 9.45, 0.9], texture: textureNames.accent, inflate: 0.08 });
    add({ name: "scarf_tail", parent: "accessory", from: [1.2, 5.6, 0.2], to: [2.7, 8.7, 1], texture: textureNames.accent, rotation: [0, 0, -12] });
  } else if (options.accessory === "collar") {
    add({ name: "collar_band", parent: "accessory", from: [-3.15, 8.15, -1.45], to: [3.15, 9.25, 0.65], texture: textureNames.accent, inflate: 0.05 });
    add({ name: "collar_tag", parent: "accessory", from: [-0.65, 7.55, -1.9], to: [0.65, 8.75, -1.28], texture: textureNames.highlight, rotation: [0, 0, 45] });
  } else if (options.accessory === "crown") {
    add({ name: "crown_band", parent: "accessory", from: [-2.5, 15.9, -4.9], to: [2.5, 17, -1.9], texture: textureNames.accent });
    for (const x of [-1.75, 0, 1.75]) add({ name: `crown_point_${x}`, parent: "accessory", from: [x - 0.45, 16.6, -4.65], to: [x + 0.45, 18.5 + (x === 0 ? 0.5 : 0), -2.1], texture: textureNames.accent, rotation: [0, 0, x * -4] });
  }

  const animations: Array<Record<string, unknown>> = [];
  if (options.animation_set !== "none") {
    animations.push({
      name: "idle_cute", length: 4, loop: "loop", snapping: 20,
      tracks: [
        closedTrack("body", "position", 4, [[1, [0, 0.18, 0]], [2, [0, -0.08, 0]], [3, [0, 0.12, 0]]]),
        closedTrack("head", "rotation", 4, [[1, [2, -3, 1]], [2, [-1, 3, -1]], [3, [1, -2, 1]]]),
        closedTrack("tail", "rotation", 4, [[1, [6, 8, 5]], [2, [-4, -8, -5]], [3, [5, 7, 4]]]),
        closedTrack("tail_mid", "rotation", 4, [[1, [-4, -10, -5]], [2, [5, 10, 5]], [3, [-3, -8, -4]]]),
        closedTrack("left_ear", "rotation", 4, [[1.6, [0, 0, -5]], [1.85, [0, 0, 3]]]),
        closedTrack("right_ear", "rotation", 4, [[2.6, [0, 0, 5]], [2.85, [0, 0, -3]]]),
        { bone: "left_eye", keyframes: [
          { time: 0, channel: "scale", vector: [1, 1, 1], interpolation: "linear" },
          { time: 2.65, channel: "scale", vector: [1, 1, 1], interpolation: "step" },
          { time: 2.72, channel: "scale", vector: [1, 0.08, 1], interpolation: "step" },
          { time: 2.82, channel: "scale", vector: [1, 1, 1], interpolation: "step" },
          { time: 4, channel: "scale", vector: [1, 1, 1], interpolation: "linear" },
        ] },
        { bone: "right_eye", keyframes: [
          { time: 0, channel: "scale", vector: [1, 1, 1], interpolation: "linear" },
          { time: 2.65, channel: "scale", vector: [1, 1, 1], interpolation: "step" },
          { time: 2.72, channel: "scale", vector: [1, 0.08, 1], interpolation: "step" },
          { time: 2.82, channel: "scale", vector: [1, 1, 1], interpolation: "step" },
          { time: 4, channel: "scale", vector: [1, 1, 1], interpolation: "linear" },
        ] },
      ],
    });
    animations.push({
      name: "walk_bouncy", length: 0.6, loop: "loop", snapping: 20,
      tracks: [
        closedTrack("body", "position", 0.6, [[0.15, [0, 0.3, 0]], [0.3, [0, -0.08, 0]], [0.45, [0, 0.3, 0]]]),
        closedTrack("head", "rotation", 0.6, [[0.15, [2, 0, 0]], [0.3, [-2, 0, 0]], [0.45, [2, 0, 0]]]),
        closedTrack("front_left_leg", "rotation", 0.6, [[0.15, [24, 0, 0]], [0.3, [0, 0, 0]], [0.45, [-24, 0, 0]]]),
        closedTrack("front_right_leg", "rotation", 0.6, [[0.15, [-24, 0, 0]], [0.3, [0, 0, 0]], [0.45, [24, 0, 0]]]),
        closedTrack("back_left_leg", "rotation", 0.6, [[0.15, [-20, 0, 0]], [0.3, [0, 0, 0]], [0.45, [20, 0, 0]]]),
        closedTrack("back_right_leg", "rotation", 0.6, [[0.15, [20, 0, 0]], [0.3, [0, 0, 0]], [0.45, [-20, 0, 0]]]),
        closedTrack("tail", "rotation", 0.6, [[0.15, [4, 10, 4]], [0.3, [0, 0, 0]], [0.45, [-4, -10, -4]]]),
      ],
    });
  }
  if (options.animation_set === "full") {
    animations.push({
      name: "skill_cute_pounce", length: 1.25, loop: "once", snapping: 20,
      markers: [{ time: 0.72, color: 2, label: "pounce_impact" }],
      tracks: [
        { bone: "body", keyframes: [
          { time: 0, channel: "position", vector: [0, 0, 0] }, { time: 0.35, channel: "position", vector: [0, -0.65, 0.6], interpolation: "catmullrom" },
          { time: 0.72, channel: "position", vector: [0, 2.4, -2.8], interpolation: "catmullrom" }, { time: 1.25, channel: "position", vector: [0, 0, 0], interpolation: "catmullrom" },
        ] },
        { bone: "head", keyframes: [
          { time: 0, channel: "rotation", vector: [0, 0, 0] }, { time: 0.35, channel: "rotation", vector: [12, 0, 0], interpolation: "catmullrom" },
          { time: 0.72, channel: "rotation", vector: [-10, 0, 0], interpolation: "catmullrom" }, { time: 1.25, channel: "rotation", vector: [0, 0, 0], interpolation: "catmullrom" },
        ] },
        { bone: "tail", keyframes: [
          { time: 0, channel: "rotation", vector: [0, 0, 0] }, { time: 0.35, channel: "rotation", vector: [-18, 0, 0], interpolation: "catmullrom" },
          { time: 0.72, channel: "rotation", vector: [20, 0, 0], interpolation: "catmullrom" }, { time: 1.25, channel: "rotation", vector: [0, 0, 0], interpolation: "catmullrom" },
        ] },
      ],
    });
    animations.push({
      name: "death", length: 3.2, loop: "once", snapping: 20,
      tracks: [
        { bone: "body", keyframes: [
          { time: 0, channel: "rotation", vector: [0, 0, 0] }, { time: 1.1, channel: "rotation", vector: [0, 0, 72], interpolation: "catmullrom" },
          { time: 3.2, channel: "rotation", vector: [0, 0, 88], interpolation: "linear" },
        ] },
        { bone: "head", keyframes: [
          { time: 0, channel: "rotation", vector: [0, 0, 0] }, { time: 1.1, channel: "rotation", vector: [8, 0, -14], interpolation: "catmullrom" },
          { time: 3.2, channel: "rotation", vector: [12, 0, -18], interpolation: "linear" },
        ] },
        { bone: "tail", keyframes: [
          { time: 0, channel: "rotation", vector: [0, 0, 0] }, { time: 1.2, channel: "rotation", vector: [-25, 0, 0], interpolation: "catmullrom" },
          { time: 3.2, channel: "rotation", vector: [-35, 0, 0], interpolation: "linear" },
        ] },
      ],
    });
  }

  return modelSpecSchema.parse({
    project: { name: options.name, format: options.format, texture_width: 32, texture_height: 32, box_uv: false },
    mode: "replace",
    groups,
    locators: [
      { id: "mouth_socket", name: "mouth_socket", parent: "muzzle", position: v([0, 10.4, -8.5]) },
      { id: "back_fx", name: "back_fx", parent: "torso", position: v([0, 9.8, 2.5]) },
      { id: "skill_origin", name: "skill_origin", parent: "vfx", position: v([0, 1, -8]) },
    ],
    textures: Object.entries(palette).map(([key, fill]) => ({
      name: textureNames[key as keyof typeof textureNames], width: 32, height: 32, fill, use_as_default: key === "primary",
    })),
    cubes,
    animations,
  });
}

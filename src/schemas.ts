import { z } from "zod";

export const vector2Schema = z.tuple([z.number().finite(), z.number().finite()]);
export const vector3Schema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);

const animationScalarSchema = z.union([
  z.number().finite(),
  z.string().min(1).max(256).describe("Molang expression supported by Blockbench"),
]);
const animationVector3Schema = z.tuple([
  animationScalarSchema,
  animationScalarSchema,
  animationScalarSchema,
]);

const displayTransformSchema = z.object({
  rotation: vector3Schema.optional(),
  translation: vector3Schema.optional(),
  scale: vector3Schema.optional(),
  rotation_pivot: vector3Schema.optional(),
  scale_pivot: vector3Schema.optional(),
  mirror: z.tuple([z.boolean(), z.boolean(), z.boolean()]).optional(),
});

export const displaySettingsSchema = z.object({
  thirdperson_righthand: displayTransformSchema.optional(),
  thirdperson_lefthand: displayTransformSchema.optional(),
  firstperson_righthand: displayTransformSchema.optional(),
  firstperson_lefthand: displayTransformSchema.optional(),
  ground: displayTransformSchema.optional(),
  gui: displayTransformSchema.optional(),
  head: displayTransformSchema.optional(),
  fixed: displayTransformSchema.optional(),
});

const faceSchema = z.object({
  uv: z.tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
  ]).optional(),
  texture: z.string().min(1).optional(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  enabled: z.boolean().optional(),
  tint: z.number().int().optional(),
  cullface: z.enum(["", "north", "south", "east", "west", "up", "down"]).optional(),
});

export const groupSchema = z.object({
  id: z.string().min(1).optional().describe("Stable ID used by parent and animation references"),
  name: z.string().min(1),
  parent: z.string().min(1).optional().describe("Parent group ID or name"),
  origin: vector3Schema.default([0, 0, 0]),
  rotation: vector3Schema.default([0, 0, 0]),
  visibility: z.boolean().default(true),
  mirror_uv: z.boolean().default(false),
});

export const locatorSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  parent: z.string().min(1).optional().describe("Parent group ID or name"),
  position: vector3Schema,
});

export const cubeSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  parent: z.string().min(1).optional().describe("Parent group ID or name"),
  from: vector3Schema,
  to: vector3Schema,
  origin: vector3Schema.optional(),
  rotation: vector3Schema.default([0, 0, 0]),
  inflate: z.number().finite().default(0),
  shade: z.boolean().default(true),
  visibility: z.boolean().default(true),
  box_uv: z.boolean().default(true),
  mirror_uv: z.boolean().default(false),
  uv_offset: vector2Schema.default([0, 0]),
  faces: z.object({
    north: faceSchema.optional(),
    south: faceSchema.optional(),
    east: faceSchema.optional(),
    west: faceSchema.optional(),
    up: faceSchema.optional(),
    down: faceSchema.optional(),
  }).optional(),
});

export const pixelPatchSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive().default(1),
  height: z.number().int().positive().default(1),
  color: z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
});

export const textureSchema = z.object({
  name: z.string().min(1),
  width: z.number().int().positive().max(4096).optional(),
  height: z.number().int().positive().max(65_536).optional(),
  uv_width: z.number().int().positive().max(4096).optional(),
  uv_height: z.number().int().positive().max(4096).optional(),
  fill: z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/).default("#00000000"),
  data_url: z.string().startsWith("data:image/").optional(),
  base64_png: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  pixels: z.array(pixelPatchSchema).max(100_000).default([]),
  render_mode: z.enum(["default", "emissive", "additive", "layered"]).default("default"),
  render_sides: z.enum(["auto", "front", "double"]).default("auto"),
  wrap_mode: z.enum(["limited", "repeat", "clamp"]).default("limited"),
  frame_time: z.number().int().positive().max(10_000).default(1),
  frame_order_type: z.enum(["custom", "loop", "backwards", "back_and_forth"]).default("loop"),
  frame_order: z.string().max(10_000).default(""),
  frame_interpolate: z.boolean().default(false),
  use_as_default: z.boolean().default(false),
}).refine(
  (value) => [value.data_url, value.base64_png, value.path].filter(Boolean).length <= 1,
  "Use only one texture source: data_url, base64_png, or path",
).refine(
  (value) => value.pixels.length === 0 || !value.data_url && !value.base64_png && !value.path,
  "Pixel patches currently require a generated texture without data_url, base64_png, or path",
);

export const keyframeSchema = z.object({
  time: z.number().nonnegative().finite(),
  channel: z.enum(["rotation", "position", "scale"]),
  vector: animationVector3Schema.optional(),
  data_points: z.array(animationVector3Schema).min(1).max(2).optional(),
  interpolation: z.enum(["linear", "step", "catmullrom", "bezier"]).default("linear"),
  bezier_linked: z.boolean().optional(),
  bezier_left_time: vector3Schema.optional(),
  bezier_left_value: vector3Schema.optional(),
  bezier_right_time: vector3Schema.optional(),
  bezier_right_value: vector3Schema.optional(),
}).refine((value) => Boolean(value.vector) !== Boolean(value.data_points), {
  message: "Provide exactly one of vector or data_points",
});

export const animationSchema = z.object({
  name: z.string().min(1),
  length: z.number().positive().finite(),
  loop: z.enum(["once", "hold", "loop"]).default("loop"),
  snapping: z.number().positive().finite().default(20),
  markers: z.array(z.object({
    time: z.number().nonnegative().finite(),
    color: z.number().int().min(0).max(7).default(0),
    label: z.string().min(1).max(128).optional().describe("Documentation label; Blockbench stores marker time/color"),
  })).max(1_000).default([]),
  tracks: z.array(z.object({
    bone: z.string().min(1).describe("Group ID or name"),
    keyframes: z.array(keyframeSchema).min(1),
  })).default([]),
});

export const modelSpecSchema = z.object({
  project: z.object({
    name: z.string().min(1),
    format: z.string().min(1).default("free"),
    texture_width: z.number().int().positive().max(4096).default(64),
    texture_height: z.number().int().positive().max(4096).default(64),
    box_uv: z.boolean().default(true),
    display_settings: displaySettingsSchema.default({}),
  }),
  mode: z.enum(["replace", "append"]).default("replace"),
  groups: z.array(groupSchema).max(10_000).default([]),
  locators: z.array(locatorSchema).max(10_000).default([]),
  cubes: z.array(cubeSchema).max(50_000).default([]),
  textures: z.array(textureSchema).max(256).default([]),
  animations: z.array(animationSchema).max(1_000).default([]),
});

export type ModelSpec = z.infer<typeof modelSpecSchema>;

export function validateModelReferences(spec: ModelSpec): string[] {
  const errors: string[] = [];
  const groupRefs = new Map<string, number>();
  const textureNames = new Set<string>();

  for (const [index, group] of spec.groups.entries()) {
    for (const ref of [group.id, group.name]) {
      if (!ref) continue;
      if (groupRefs.has(ref) && groupRefs.get(ref) !== index) errors.push(`Duplicate group reference: ${ref}`);
      groupRefs.set(ref, index);
    }
  }
  for (const texture of spec.textures) {
    if (textureNames.has(texture.name)) errors.push(`Duplicate texture name: ${texture.name}`);
    textureNames.add(texture.name);
    for (const patch of texture.pixels) {
      const width = texture.width ?? spec.project.texture_width;
      const height = texture.height ?? spec.project.texture_height;
      if (patch.x + patch.width > width || patch.y + patch.height > height) {
        errors.push(`Pixel patch is outside texture '${texture.name}' (${width}x${height})`);
      }
    }
  }
  for (const group of spec.groups) {
    if (spec.mode === "replace" && group.parent && !groupRefs.has(group.parent)) {
      errors.push(`Group '${group.name}' references missing parent '${group.parent}'`);
    }
  }
  for (const cube of spec.cubes) {
    if (cube.from.some((value, index) => value >= cube.to[index])) {
      errors.push(`Cube '${cube.name}' must have from values smaller than to values`);
    }
    if (spec.mode === "replace" && cube.parent && !groupRefs.has(cube.parent)) {
      errors.push(`Cube '${cube.name}' references missing parent '${cube.parent}'`);
    }
    for (const [direction, face] of Object.entries(cube.faces ?? {})) {
      if (spec.mode === "replace" && face?.texture && !textureNames.has(face.texture)) {
        errors.push(`Cube '${cube.name}' face '${direction}' references missing texture '${face.texture}'`);
      }
    }
  }
  for (const locator of spec.locators) {
    if (spec.mode === "replace" && locator.parent && !groupRefs.has(locator.parent)) {
      errors.push(`Locator '${locator.name}' references missing parent '${locator.parent}'`);
    }
  }
  for (const animation of spec.animations) {
    for (const marker of animation.markers) {
      if (marker.time > animation.length) errors.push(`Animation '${animation.name}' has a marker after its length`);
    }
    for (const track of animation.tracks) {
      if (spec.mode === "replace" && !groupRefs.has(track.bone)) {
        errors.push(`Animation '${animation.name}' references missing bone '${track.bone}'`);
      }
      for (const keyframe of track.keyframes) {
        if (keyframe.time > animation.length) {
          errors.push(`Animation '${animation.name}' has a keyframe after its length`);
        }
      }
    }
  }
  return errors;
}

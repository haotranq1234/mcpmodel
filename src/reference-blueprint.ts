import { z } from "zod";
import { animationSchema, groupSchema, locatorSchema, modelSpecSchema, type ModelSpec } from "./schemas.js";
import { generatePixelMaterial, type PixelMaterialStyle } from "./pixel-material.js";

const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const color = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
const refId = z.string().min(1).max(96).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/);

const common = {
  id: refId,
  name: z.string().min(1).max(120),
  parent: z.string().min(1),
  mirror_x: z.boolean().default(false).describe("Duplicate the generated part across the X=0 plane"),
};

const boxPrimitive = z.object({
  kind: z.literal("box"), ...common,
  material: refId,
  from: vec3,
  to: vec3,
  origin: vec3.optional(),
  rotation: vec3.default([0, 0, 0]),
  inflate: z.number().finite().default(0),
  shade: z.boolean().default(true),
});

const taperedStackPrimitive = z.object({
  kind: z.literal("tapered_stack"), ...common,
  material: refId,
  start: vec3,
  end: vec3,
  start_size: vec3,
  end_size: vec3,
  segments: z.number().int().min(2).max(64),
  start_rotation: vec3.default([0, 0, 0]),
  end_rotation: vec3.default([0, 0, 0]),
  overlap: z.number().min(0).max(0.45).default(0.08),
});

const chainPrimitive = z.object({
  kind: z.literal("chain"), ...common,
  material: refId,
  start: vec3,
  end: vec3,
  links: z.number().int().min(2).max(128),
  link_size: vec3,
  alternating_roll: z.number().min(0).max(90).default(45),
});

const raggedPanelPrimitive = z.object({
  kind: z.literal("ragged_panel"), ...common,
  material: refId,
  center: vec3,
  width: z.number().positive().max(1_000),
  height: z.number().positive().max(1_000),
  depth: z.number().positive().max(1_000),
  strips: z.number().int().min(2).max(128),
  raggedness: z.number().min(0).max(0.8).default(0.28),
  gap_ratio: z.number().min(0).max(0.7).default(0.12),
});

const crystalPrimitive = z.object({
  kind: z.literal("crystal_cluster"), ...common,
  material: refId,
  glow_material: refId.optional(),
  center: vec3,
  size: vec3,
  spikes: z.number().int().min(3).max(32).default(7),
  spread: z.number().min(0.1).max(2).default(0.75),
});

const skullPrimitive = z.object({
  kind: z.literal("skull"), ...common,
  bone_material: refId,
  dark_material: refId,
  eye_material: refId,
  center: vec3,
  size: vec3,
  teeth: z.number().int().min(2).max(12).default(6),
});

const ribcagePrimitive = z.object({
  kind: z.literal("ribcage"), ...common,
  bone_material: refId,
  core_material: refId.optional(),
  center: vec3,
  size: vec3,
  ribs: z.number().int().min(2).max(12).default(5),
});

const armorPlatePrimitive = z.object({
  kind: z.literal("armor_plate"), ...common,
  material: refId,
  trim_material: refId,
  from: vec3,
  to: vec3,
  trim: z.number().positive().max(16).default(0.35),
  rotation: vec3.default([0, 0, 0]),
});

const organicFinPrimitive = z.object({
  kind: z.literal("organic_fin"), ...common,
  material: refId,
  root: vec3,
  tip: vec3,
  root_width: z.number().positive().max(1_000),
  tip_width: z.number().nonnegative().max(1_000).default(0.15),
  thickness: z.number().positive().max(1_000),
  segments: z.number().int().min(2).max(32).default(5),
  bend: vec3.default([0, 0, 0]).describe("Quadratic path offset used to curve fins, tails, cloth, flames, and horns"),
  twist: z.tuple([z.number().finite(), z.number().finite()]).default([0, 0]),
});

const layeredArmorPrimitive = z.object({
  kind: z.literal("layered_armor"), ...common,
  material: refId,
  trim_material: refId.optional(),
  center: vec3,
  size: vec3,
  layers: z.number().int().min(2).max(24).default(4),
  layer_offset: vec3.default([0, -0.8, 0.35]),
  scale_step: vec3.default([-0.07, -0.04, -0.06]).describe("Fractional size change per layer"),
  rotation: vec3.default([0, 0, 0]),
  rotation_step: vec3.default([0, 0, 4]),
  trim_thickness: z.number().min(0).max(8).default(0.18),
});

const cageFramePrimitive = z.object({
  kind: z.literal("cage_frame"), ...common,
  material: refId,
  from: vec3,
  to: vec3,
  rail_thickness: z.number().positive().max(32).default(0.35),
  vertical_bars: z.number().int().min(0).max(32).default(2),
  horizontal_bars: z.number().int().min(0).max(32).default(1),
  depth_braces: z.number().int().min(0).max(32).default(0),
  rotation: vec3.default([0, 0, 0]),
});

export const referencePrimitiveSchema = z.discriminatedUnion("kind", [
  boxPrimitive,
  taperedStackPrimitive,
  chainPrimitive,
  raggedPanelPrimitive,
  crystalPrimitive,
  skullPrimitive,
  ribcagePrimitive,
  armorPlatePrimitive,
  organicFinPrimitive,
  layeredArmorPrimitive,
  cageFramePrimitive,
]);

export const referenceBlueprintSchema = z.object({
  reference: z.object({
    source_image: z.string().min(1).optional().describe("Local path, URL, attachment name, or file ID used only for provenance"),
    subject: z.string().min(1).max(240),
    style: z.string().min(1).max(240).default("Minecraft / Blockbench voxel model"),
    detected_views: z.array(z.enum(["hero", "front", "back", "left", "right", "top", "detail", "pose"])).max(32).default([]),
    confidence: z.number().min(0).max(1).default(0.8),
    assumptions: z.array(z.string().min(1).max(500)).max(64).default([]),
  }),
  project: z.object({
    name: z.string().min(1).max(120),
    format: z.string().min(1).default("free"),
    texture_width: z.number().int().positive().max(4096).default(64),
    texture_height: z.number().int().positive().max(4096).default(64),
    box_uv: z.boolean().default(false),
    target_cube_budget: z.tuple([z.number().int().positive(), z.number().int().positive()]).default([120, 450]),
  }),
  art_direction: z.object({
    geometry_style: z.enum(["voxel", "fancy_voxel", "organic_layered"]).default("fancy_voxel"),
    texture_style: z.enum(["flat", "hand_painted_pixel", "material_aware"]).default("material_aware"),
    silhouette_priority: z.number().min(0).max(1).default(0.85),
    uv_layout: z.enum(["shared", "packed_faces"]).default("packed_faces"),
    paint_passes: z.array(z.enum(["base", "shadow", "highlight", "accent", "wear", "emissive"])).min(1).max(6)
      .default(["base", "shadow", "highlight", "accent"]),
  }).default({
    geometry_style: "fancy_voxel",
    texture_style: "material_aware",
    silhouette_priority: 0.85,
    paint_passes: ["base", "shadow", "highlight", "accent"],
    uv_layout: "packed_faces",
  }),
  palette: z.array(z.object({
    id: refId,
    name: z.string().min(1).max(120).optional(),
    color,
    render_mode: z.enum(["default", "emissive", "additive", "layered"]).default("default"),
    style: z.enum(["solid", "hand_painted", "metal", "cloth", "organic", "bone", "crystal"]).default("hand_painted"),
    accent_colors: z.array(color).max(8).default([]),
    seed: z.number().int().min(0).max(1_000_000).default(1),
    contrast: z.number().min(0).max(1).default(0.22),
    noise_density: z.number().min(0).max(0.9).default(0.18),
    edge_highlight: z.boolean().default(true),
    tile_size: z.number().int().min(4).max(64).default(8),
  })).min(1).max(64),
  groups: z.array(groupSchema).min(1).max(2_000),
  locators: z.array(locatorSchema).max(2_000).default([]),
  primitives: z.array(referencePrimitiveSchema).min(1).max(5_000),
  animations: z.array(animationSchema).max(256).default([]),
});

export const referenceBuildToolSchema = z.object({
  blueprint: referenceBlueprintSchema,
  dry_run: z.boolean().default(false).describe("Compile and validate only. Never changes Blockbench when true."),
});

export type ReferenceBlueprint = z.infer<typeof referenceBlueprintSchema>;
export type ReferenceBlueprintInput = z.input<typeof referenceBlueprintSchema>;
type Vec3 = [number, number, number];
type CubeDraft = {
  name: string;
  parent: string;
  from: Vec3;
  to: Vec3;
  origin?: Vec3;
  rotation?: Vec3;
  inflate?: number;
  shade?: boolean;
  material: string;
};

function round(value: number): number {
  return Number(value.toFixed(4));
}

function vector(values: number[]): Vec3 {
  return [round(values[0]), round(values[1]), round(values[2])];
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixVector(a: Vec3, b: Vec3, t: number): Vec3 {
  return vector(a.map((value, axis) => mix(value, b[axis], t)));
}

function organicPoint(root: Vec3, tip: Vec3, bend: Vec3, t: number): Vec3 {
  const arc = Math.sin(Math.PI * t);
  return vector(root.map((value, axis) => mix(value, tip[axis], t) + bend[axis] * arc));
}

function mirrorDraft(cube: CubeDraft): CubeDraft {
  return {
    ...cube,
    name: `${cube.name}_mirrored`,
    from: [-cube.to[0], cube.from[1], cube.from[2]],
    to: [-cube.from[0], cube.to[1], cube.to[2]],
    origin: cube.origin ? [-cube.origin[0], cube.origin[1], cube.origin[2]] : undefined,
    rotation: cube.rotation ? [cube.rotation[0], -cube.rotation[1], -cube.rotation[2]] : undefined,
  };
}

function clean(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "part";
}

export interface ReferenceCompileResult {
  spec: ModelSpec;
  report: {
    source_image?: string;
    subject: string;
    confidence: number;
    primitive_count: number;
    cube_count: number;
    group_count: number;
    texture_count: number;
    animation_count: number;
    target_cube_budget: [number, number];
    within_budget: boolean;
    warnings: string[];
    primitive_breakdown: Record<string, number>;
    painted_pixel_count: number;
    flat_material_count: number;
    texture_style_breakdown: Record<string, number>;
    uv_tiles_used: Record<string, number>;
    uv_tile_overflow: Record<string, number>;
  };
}

export function compileReferenceBlueprint(input: ReferenceBlueprintInput): ReferenceCompileResult {
  const blueprint = referenceBlueprintSchema.parse(input);
  const materialIds = new Set(blueprint.palette.map(material => material.id));
  const groupRefs = new Set<string>();
  for (const group of blueprint.groups) {
    groupRefs.add(group.name);
    if (group.id) groupRefs.add(group.id);
  }
  const warnings: string[] = [];
  const ids = new Set<string>();
  for (const primitive of blueprint.primitives) {
    if (ids.has(primitive.id)) throw new Error(`Duplicate reference primitive ID '${primitive.id}'`);
    ids.add(primitive.id);
    if (!groupRefs.has(primitive.parent)) throw new Error(`Primitive '${primitive.name}' references missing group '${primitive.parent}'`);
    const candidates = [
      "material" in primitive ? primitive.material : undefined,
      "glow_material" in primitive ? primitive.glow_material : undefined,
      "bone_material" in primitive ? primitive.bone_material : undefined,
      "dark_material" in primitive ? primitive.dark_material : undefined,
      "eye_material" in primitive ? primitive.eye_material : undefined,
      "core_material" in primitive ? primitive.core_material : undefined,
      "trim_material" in primitive ? primitive.trim_material : undefined,
    ].filter((value): value is string => Boolean(value));
    for (const material of candidates) {
      if (!materialIds.has(material)) throw new Error(`Primitive '${primitive.name}' references missing material '${material}'`);
    }
  }

  const drafts: CubeDraft[] = [];
  const emit = (cube: CubeDraft, mirrorX = false) => {
    if (cube.from.some((value, axis) => value >= cube.to[axis])) {
      throw new Error(`Generated cube '${cube.name}' has invalid bounds`);
    }
    drafts.push(cube);
    const centerX = (cube.from[0] + cube.to[0]) / 2;
    if (mirrorX && Math.abs(centerX) > 0.0001) drafts.push(mirrorDraft(cube));
  };

  const box = (name: string, parent: string, center: Vec3, size: Vec3, material: string, rotation: Vec3 = [0, 0, 0], mirrorX = false) => {
    const half = size.map(value => Math.max(0.01, value) / 2);
    emit({
      name, parent, material, origin: center, rotation,
      from: vector(center.map((value, axis) => value - half[axis])),
      to: vector(center.map((value, axis) => value + half[axis])),
    }, mirrorX);
  };

  for (const primitive of blueprint.primitives) {
    const prefix = clean(primitive.id);
    if (primitive.kind === "box") {
      emit({
        name: primitive.name, parent: primitive.parent, material: primitive.material,
        from: primitive.from, to: primitive.to, origin: primitive.origin, rotation: primitive.rotation,
        inflate: primitive.inflate, shade: primitive.shade,
      }, primitive.mirror_x);
    } else if (primitive.kind === "tapered_stack") {
      for (let index = 0; index < primitive.segments; index++) {
        const t = primitive.segments === 1 ? 0 : index / (primitive.segments - 1);
        const center = mixVector(primitive.start, primitive.end, t);
        const size = mixVector(primitive.start_size, primitive.end_size, t).map(value => value * (1 + primitive.overlap)) as Vec3;
        const rotation = mixVector(primitive.start_rotation, primitive.end_rotation, t);
        box(`${prefix}_${index + 1}`, primitive.parent, center, size, primitive.material, rotation, primitive.mirror_x);
      }
    } else if (primitive.kind === "organic_fin") {
      for (let index = 0; index < primitive.segments; index++) {
        const t0 = index / primitive.segments;
        const t1 = (index + 1) / primitive.segments;
        const start = organicPoint(primitive.root, primitive.tip, primitive.bend, t0);
        const end = organicPoint(primitive.root, primitive.tip, primitive.bend, t1);
        const center = mixVector(start, end, 0.5);
        const delta = end.map((value, axis) => value - start[axis]) as Vec3;
        const length = Math.max(0.05, Math.hypot(...delta));
        const t = (t0 + t1) / 2;
        const width = Math.max(0.05, mix(primitive.root_width, primitive.tip_width, t));
        const yaw = Math.atan2(delta[0], delta[2]) * 180 / Math.PI;
        const pitch = -Math.atan2(delta[1], Math.hypot(delta[0], delta[2])) * 180 / Math.PI;
        const roll = mix(primitive.twist[0], primitive.twist[1], t);
        box(`${prefix}_segment_${index + 1}`, primitive.parent, center, [width, length * 1.12, primitive.thickness], primitive.material, [round(pitch), round(yaw), round(roll)], primitive.mirror_x);
      }
    } else if (primitive.kind === "layered_armor") {
      for (let index = 0; index < primitive.layers; index++) {
        const center = vector(primitive.center.map((value, axis) => value + primitive.layer_offset[axis] * index));
        const size = vector(primitive.size.map((value, axis) => Math.max(0.05, value * (1 + primitive.scale_step[axis] * index))));
        const rotation = vector(primitive.rotation.map((value, axis) => value + primitive.rotation_step[axis] * index));
        box(`${prefix}_plate_${index + 1}`, primitive.parent, center, size, primitive.material, rotation, primitive.mirror_x);
        if (primitive.trim_material && primitive.trim_thickness > 0) {
          const trim = Math.min(primitive.trim_thickness, size[1] * 0.45);
          const trimCenter: Vec3 = [center[0], center[1] - size[1] / 2 + trim / 2, center[2] - size[2] / 2 - trim / 2];
          box(`${prefix}_trim_${index + 1}`, primitive.parent, trimCenter, [size[0] * 1.04, trim, trim], primitive.trim_material, rotation, primitive.mirror_x);
        }
      }
    } else if (primitive.kind === "cage_frame") {
      const center = vector(primitive.from.map((value, axis) => (value + primitive.to[axis]) / 2));
      const size = vector(primitive.to.map((value, axis) => value - primitive.from[axis]));
      if (size.some(value => value <= 0)) throw new Error(`Cage frame '${primitive.name}' must have from values smaller than to values`);
      const rail = Math.min(primitive.rail_thickness, Math.min(...size) * 0.48);
      const [cx, cy, cz] = center;
      const [sx, sy, sz] = size;
      for (const y of [cy - sy / 2 + rail / 2, cy + sy / 2 - rail / 2]) {
        for (const z of [cz - sz / 2 + rail / 2, cz + sz / 2 - rail / 2]) {
          box(`${prefix}_rail_x_${drafts.length}`, primitive.parent, [cx, y, z], [sx, rail, rail], primitive.material, primitive.rotation, primitive.mirror_x);
        }
      }
      for (const x of [cx - sx / 2 + rail / 2, cx + sx / 2 - rail / 2]) {
        for (const z of [cz - sz / 2 + rail / 2, cz + sz / 2 - rail / 2]) {
          box(`${prefix}_rail_y_${drafts.length}`, primitive.parent, [x, cy, z], [rail, sy, rail], primitive.material, primitive.rotation, primitive.mirror_x);
        }
      }
      for (const x of [cx - sx / 2 + rail / 2, cx + sx / 2 - rail / 2]) {
        for (const y of [cy - sy / 2 + rail / 2, cy + sy / 2 - rail / 2]) {
          box(`${prefix}_rail_z_${drafts.length}`, primitive.parent, [x, y, cz], [rail, rail, sz], primitive.material, primitive.rotation, primitive.mirror_x);
        }
      }
      for (let index = 1; index <= primitive.vertical_bars; index++) {
        const x = primitive.from[0] + sx * index / (primitive.vertical_bars + 1);
        for (const z of [primitive.from[2] + rail / 2, primitive.to[2] - rail / 2]) {
          box(`${prefix}_vertical_${index}_${z < cz ? "front" : "back"}`, primitive.parent, [x, cy, z], [rail, sy, rail], primitive.material, primitive.rotation, primitive.mirror_x);
        }
      }
      for (let index = 1; index <= primitive.horizontal_bars; index++) {
        const y = primitive.from[1] + sy * index / (primitive.horizontal_bars + 1);
        for (const z of [primitive.from[2] + rail / 2, primitive.to[2] - rail / 2]) {
          box(`${prefix}_horizontal_${index}_${z < cz ? "front" : "back"}`, primitive.parent, [cx, y, z], [sx, rail, rail], primitive.material, primitive.rotation, primitive.mirror_x);
        }
      }
      for (let index = 1; index <= primitive.depth_braces; index++) {
        const x = primitive.from[0] + sx * index / (primitive.depth_braces + 1);
        box(`${prefix}_depth_${index}`, primitive.parent, [x, cy, cz], [rail, rail, sz], primitive.material, primitive.rotation, primitive.mirror_x);
      }
    } else if (primitive.kind === "chain") {
      const delta = primitive.end.map((value, axis) => value - primitive.start[axis]);
      const yaw = Math.atan2(delta[0], delta[2]) * 180 / Math.PI;
      const pitch = -Math.atan2(delta[1], Math.hypot(delta[0], delta[2])) * 180 / Math.PI;
      for (let index = 0; index < primitive.links; index++) {
        const t = primitive.links === 1 ? 0 : index / (primitive.links - 1);
        const center = mixVector(primitive.start, primitive.end, t);
        const roll = index % 2 ? primitive.alternating_roll : -primitive.alternating_roll;
        box(`${prefix}_link_${index + 1}`, primitive.parent, center, primitive.link_size, primitive.material, [round(pitch), round(yaw), roll], primitive.mirror_x);
      }
    } else if (primitive.kind === "ragged_panel") {
      const stripWidth = primitive.width / primitive.strips;
      const visibleWidth = stripWidth * (1 - primitive.gap_ratio);
      const patterns = [0.05, 0.46, 0.18, 0.72, 0.32, 0.6, 0.12, 0.82];
      for (let index = 0; index < primitive.strips; index++) {
        const cut = patterns[index % patterns.length] * primitive.raggedness * primitive.height;
        const height = primitive.height - cut;
        const x = primitive.center[0] - primitive.width / 2 + stripWidth * (index + 0.5);
        const y = primitive.center[1] + primitive.height / 2 - height / 2;
        box(`${prefix}_strip_${index + 1}`, primitive.parent, [x, y, primitive.center[2]], [visibleWidth, height, primitive.depth], primitive.material, [0, 0, index % 2 ? 1.5 : -1.5], primitive.mirror_x);
      }
    } else if (primitive.kind === "crystal_cluster") {
      box(`${prefix}_core`, primitive.parent, primitive.center, primitive.size.map(value => value * 0.48) as Vec3, primitive.glow_material ?? primitive.material, [0, 0, 45], primitive.mirror_x);
      const directions: Vec3[] = [
        [0, 1, 0], [0.65, 0.76, 0], [-0.65, 0.76, 0], [0, 0.72, 0.69], [0, 0.72, -0.69],
        [0.5, 0.6, 0.62], [-0.5, 0.6, 0.62], [0.5, 0.6, -0.62], [-0.5, 0.6, -0.62],
      ];
      for (let index = 0; index < primitive.spikes; index++) {
        const direction = directions[index % directions.length];
        const length = primitive.size[1] * (0.55 + (index % 4) * 0.09);
        const center = vector(primitive.center.map((value, axis) => value + direction[axis] * length * primitive.spread * 0.4));
        const thickness = Math.max(0.15, Math.min(primitive.size[0], primitive.size[2]) * (0.18 + (index % 3) * 0.035));
        const pitch = round(direction[2] * 42);
        const roll = round(-direction[0] * 42);
        box(`${prefix}_spike_${index + 1}`, primitive.parent, center, [thickness, length, thickness], index % 3 === 0 && primitive.glow_material ? primitive.glow_material : primitive.material, [pitch, 0, roll], primitive.mirror_x);
      }
    } else if (primitive.kind === "skull") {
      const [sx, sy, sz] = primitive.size;
      const [cx, cy, cz] = primitive.center;
      box(`${prefix}_cranium`, primitive.parent, [cx, cy + sy * 0.16, cz], [sx, sy * 0.58, sz], primitive.bone_material, [0, 0, 0], primitive.mirror_x);
      box(`${prefix}_face`, primitive.parent, [cx, cy - sy * 0.15, cz - sz * 0.16], [sx * 0.82, sy * 0.38, sz * 0.72], primitive.bone_material, [0, 0, 0], primitive.mirror_x);
      box(`${prefix}_jaw`, primitive.parent, [cx, cy - sy * 0.4, cz - sz * 0.2], [sx * 0.64, sy * 0.2, sz * 0.58], primitive.bone_material, [0, 0, 0], primitive.mirror_x);
      for (const side of [-1, 1]) {
        box(`${prefix}_eye_${side < 0 ? "left" : "right"}`, primitive.parent, [cx + side * sx * 0.22, cy, cz - sz * 0.53], [sx * 0.24, sy * 0.19, Math.max(0.12, sz * 0.08)], primitive.eye_material, [0, 0, side * -4], primitive.mirror_x);
        box(`${prefix}_cheek_${side < 0 ? "left" : "right"}`, primitive.parent, [cx + side * sx * 0.37, cy - sy * 0.2, cz - sz * 0.3], [sx * 0.18, sy * 0.28, sz * 0.3], primitive.bone_material, [0, 0, side * 12], primitive.mirror_x);
      }
      box(`${prefix}_nose`, primitive.parent, [cx, cy - sy * 0.16, cz - sz * 0.56], [sx * 0.18, sy * 0.16, Math.max(0.12, sz * 0.08)], primitive.dark_material, [0, 0, 45], primitive.mirror_x);
      const toothWidth = sx * 0.58 / primitive.teeth;
      for (let index = 0; index < primitive.teeth; index++) {
        const x = cx - sx * 0.29 + toothWidth * (index + 0.5);
        box(`${prefix}_tooth_${index + 1}`, primitive.parent, [x, cy - sy * 0.42, cz - sz * 0.52], [toothWidth * 0.72, sy * (index % 2 ? 0.12 : 0.16), Math.max(0.1, sz * 0.09)], primitive.bone_material, [0, 0, 0], primitive.mirror_x);
      }
    } else if (primitive.kind === "ribcage") {
      const [sx, sy, sz] = primitive.size;
      const [cx, cy, cz] = primitive.center;
      box(`${prefix}_sternum`, primitive.parent, [cx, cy, cz - sz * 0.42], [sx * 0.1, sy * 0.9, sz * 0.1], primitive.bone_material, [0, 0, 0], primitive.mirror_x);
      box(`${prefix}_spine`, primitive.parent, [cx, cy, cz + sz * 0.32], [sx * 0.12, sy, sz * 0.12], primitive.bone_material, [0, 0, 0], primitive.mirror_x);
      for (let index = 0; index < primitive.ribs; index++) {
        const t = primitive.ribs === 1 ? 0 : index / (primitive.ribs - 1);
        const y = cy + sy * 0.34 - t * sy * 0.68;
        const width = sx * (0.94 - Math.abs(t - 0.45) * 0.4);
        for (const side of [-1, 1]) {
          box(`${prefix}_rib_${index + 1}_${side < 0 ? "left" : "right"}`, primitive.parent, [cx + side * width * 0.27, y, cz - sz * 0.15], [width * 0.52, sy * 0.075, sz * 0.12], primitive.bone_material, [0, side * 8, side * (10 + index * 2)], primitive.mirror_x);
        }
      }
      if (primitive.core_material) box(`${prefix}_core`, primitive.parent, [cx, cy, cz - sz * 0.5], [sx * 0.32, sy * 0.38, sz * 0.18], primitive.core_material, [0, 0, 45], primitive.mirror_x);
    } else if (primitive.kind === "armor_plate") {
      const center = vector(primitive.from.map((value, axis) => (value + primitive.to[axis]) / 2));
      emit({ name: primitive.name, parent: primitive.parent, material: primitive.material, from: primitive.from, to: primitive.to, origin: center, rotation: primitive.rotation }, primitive.mirror_x);
      const [fx, fy, fz] = primitive.from;
      const [tx, ty] = primitive.to;
      const depth = Math.max(0.08, primitive.trim);
      const z = fz - depth / 2;
      box(`${prefix}_trim_top`, primitive.parent, [(fx + tx) / 2, ty - primitive.trim / 2, z], [tx - fx + primitive.trim, primitive.trim, depth], primitive.trim_material, primitive.rotation, primitive.mirror_x);
      box(`${prefix}_trim_bottom`, primitive.parent, [(fx + tx) / 2, fy + primitive.trim / 2, z], [tx - fx + primitive.trim, primitive.trim, depth], primitive.trim_material, primitive.rotation, primitive.mirror_x);
      box(`${prefix}_trim_left`, primitive.parent, [fx + primitive.trim / 2, (fy + ty) / 2, z], [primitive.trim, ty - fy, depth], primitive.trim_material, primitive.rotation, primitive.mirror_x);
      box(`${prefix}_trim_right`, primitive.parent, [tx - primitive.trim / 2, (fy + ty) / 2, z], [primitive.trim, ty - fy, depth], primitive.trim_material, primitive.rotation, primitive.mirror_x);
    }
  }

  const textureNames = new Map(blueprint.palette.map(material => [material.id, `material_${clean(material.id)}.png`]));
  const materialsById = new Map(blueprint.palette.map(material => [material.id, material]));
  const uvTilesUsed: Record<string, number> = {};
  const uvTileOverflow: Record<string, number> = {};
  const allocateFace = (materialId: string) => {
    const texture = textureNames.get(materialId);
    const material = materialsById.get(materialId);
    if (!texture || !material) throw new Error(`Missing compiled texture for material '${materialId}'`);
    if (blueprint.art_direction.uv_layout === "shared") return { texture };
    const tile = Math.min(material.tile_size, blueprint.project.texture_width, blueprint.project.texture_height);
    const columns = Math.max(1, Math.floor(blueprint.project.texture_width / tile));
    const rows = Math.max(1, Math.floor(blueprint.project.texture_height / tile));
    const capacity = columns * rows;
    const allocation = uvTilesUsed[materialId] ?? 0;
    uvTilesUsed[materialId] = allocation + 1;
    if (allocation >= capacity) uvTileOverflow[materialId] = (uvTileOverflow[materialId] ?? 0) + 1;
    const index = allocation % capacity;
    const x = index % columns * tile;
    const y = Math.floor(index / columns) * tile;
    return { texture, uv: [x, y, x + tile, y + tile] as [number, number, number, number] };
  };
  const cubes = drafts.map(draft => {
    return {
      name: draft.name,
      parent: draft.parent,
      from: draft.from,
      to: draft.to,
      origin: draft.origin,
      rotation: draft.rotation ?? [0, 0, 0],
      inflate: draft.inflate ?? 0,
      shade: draft.shade ?? true,
      box_uv: false,
      faces: {
        north: allocateFace(draft.material), south: allocateFace(draft.material),
        east: allocateFace(draft.material), west: allocateFace(draft.material),
        up: allocateFace(draft.material), down: allocateFace(draft.material),
      },
    };
  });
  const [minBudget, maxBudget] = blueprint.project.target_cube_budget;
  if (minBudget > maxBudget) throw new Error("target_cube_budget minimum must be <= maximum");
  if (cubes.length < minBudget) warnings.push(`Compiled ${cubes.length} cubes, below target minimum ${minBudget}; add silhouette/detail primitives.`);
  if (cubes.length > maxBudget) warnings.push(`Compiled ${cubes.length} cubes, above target maximum ${maxBudget}; reduce repeated detail.`);
  if (blueprint.reference.detected_views.length < 2) warnings.push("Only one reference view was detected; side/back depth will require assumptions and turntable correction.");
  if (blueprint.reference.confidence < 0.65) warnings.push("Reference analysis confidence is low; build as a draft and request more views before finalizing.");
  if (Object.keys(uvTileOverflow).length) {
    const summary = Object.entries(uvTileOverflow).map(([material, count]) => `${material}:${count}`).join(", ");
    warnings.push(`Packed UV capacity overflowed (${summary}); increase texture size or reduce tile_size to avoid repeated face regions.`);
  }

  const textureStyleBreakdown: Record<string, number> = {};
  let paintedPixelCount = 0;
  let flatMaterialCount = 0;
  const compiledTextures = blueprint.palette.map((material, index) => {
    textureStyleBreakdown[material.style] = (textureStyleBreakdown[material.style] ?? 0) + 1;
    if (material.style === "solid") flatMaterialCount++;
    const pixels = generatePixelMaterial({
      baseColor: material.color,
      width: blueprint.project.texture_width,
      height: blueprint.project.texture_height,
      style: material.style as PixelMaterialStyle,
      accentColors: material.accent_colors,
      seed: material.seed,
      contrast: material.contrast,
      noiseDensity: material.noise_density,
      edgeHighlight: material.edge_highlight,
      tileSize: material.tile_size,
    });
    paintedPixelCount += pixels.length;
    return {
      name: textureNames.get(material.id), width: blueprint.project.texture_width, height: blueprint.project.texture_height,
      fill: material.color, pixels, render_mode: material.render_mode, use_as_default: index === 0,
    };
  });
  if (blueprint.art_direction.texture_style !== "flat" && flatMaterialCount > blueprint.palette.length / 2) {
    warnings.push("Most materials are solid even though the art direction requests painted pixels; use metal/cloth/organic/bone/crystal styles and accents.");
  }
  if (blueprint.art_direction.geometry_style === "organic_layered" && !blueprint.primitives.some(primitive => primitive.kind === "organic_fin")) {
    warnings.push("Organic layered geometry was requested without organic_fin primitives; use them for fins, tails, cloth, horns, or flame silhouettes.");
  }

  const spec = modelSpecSchema.parse({
    project: {
      name: blueprint.project.name,
      format: blueprint.project.format,
      texture_width: blueprint.project.texture_width,
      texture_height: blueprint.project.texture_height,
      box_uv: blueprint.project.box_uv,
    },
    mode: "replace",
    groups: blueprint.groups,
    locators: blueprint.locators,
    textures: compiledTextures,
    cubes,
    animations: blueprint.animations,
  });
  const primitiveBreakdown: Record<string, number> = {};
  for (const primitive of blueprint.primitives) primitiveBreakdown[primitive.kind] = (primitiveBreakdown[primitive.kind] ?? 0) + 1;
  return {
    spec,
    report: {
      source_image: blueprint.reference.source_image,
      subject: blueprint.reference.subject,
      confidence: blueprint.reference.confidence,
      primitive_count: blueprint.primitives.length,
      cube_count: cubes.length,
      group_count: blueprint.groups.length,
      texture_count: blueprint.palette.length,
      animation_count: blueprint.animations.length,
      target_cube_budget: blueprint.project.target_cube_budget,
      within_budget: cubes.length >= minBudget && cubes.length <= maxBudget,
      warnings,
      primitive_breakdown: primitiveBreakdown,
      painted_pixel_count: paintedPixelCount,
      flat_material_count: flatMaterialCount,
      texture_style_breakdown: textureStyleBreakdown,
      uv_tiles_used: uvTilesUsed,
      uv_tile_overflow: uvTileOverflow,
    },
  };
}

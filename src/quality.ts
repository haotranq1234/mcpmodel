export type QualityProfile = "generic" | "pet" | "weapon" | "golem";

export interface ProjectSnapshot {
  open?: boolean;
  name?: string;
  bounds?: { min: number[]; max: number[]; size: number[] } | null;
  groups?: Array<{ name: string; rotation?: number[] }>;
  cubes?: Array<{ name: string; from: number[]; to: number[]; rotation?: number[]; inflate?: number }>;
  textures?: Array<{
    name: string; width?: number; height?: number; uv_width?: number; uv_height?: number;
    unique_colors?: number; opaque_pixels?: number; transparent_pixels?: number; transparency_ratio?: number;
  }>;
  animations?: Array<{ name: string; length: number; loop: string; tracks?: Array<{ name: string; keyframes: number }> }>;
}

export interface QualityFinding {
  severity: "error" | "warning" | "suggestion" | "pass";
  code: string;
  message: string;
  points: number;
}

function includesAny(names: string[], patterns: string[]): boolean {
  return patterns.some(pattern => names.some(name => name.includes(pattern)));
}

function semanticPair(names: string[], left: string, right: string): boolean {
  return includesAny(names, [left]) && includesAny(names, [right]);
}

export function analyzeModelQuality(snapshot: ProjectSnapshot, profile: QualityProfile = "generic") {
  const groups = snapshot.groups ?? [];
  const cubes = snapshot.cubes ?? [];
  const textures = snapshot.textures ?? [];
  const animations = snapshot.animations ?? [];
  const groupNames = groups.map(group => group.name.toLowerCase());
  const cubeNames = cubes.map(cube => cube.name.toLowerCase());
  const animationNames = animations.map(animation => animation.name.toLowerCase());
  const findings: QualityFinding[] = [];
  const add = (severity: QualityFinding["severity"], code: string, message: string, points: number) => {
    findings.push({ severity, code, message, points });
  };

  if (!snapshot.open) add("error", "no_project", "Không có project Blockbench đang mở.", -100);
  if (cubes.length === 0) add("error", "no_geometry", "Model chưa có hình học.", -60);
  if (textures.length === 0) add("error", "no_texture", "Model chưa có texture.", -25);

  const sizes = cubes.map(cube => cube.to.map((value, axis) => Math.abs(value - cube.from[axis])));
  const thinDetails = sizes.filter(size => Math.min(...size) <= 0.55).length;
  const rotatedCubes = cubes.filter(cube => (cube.rotation ?? []).some(value => Math.abs(value) >= 2)).length;
  const rotatedGroups = groups.filter(group => (group.rotation ?? []).some(value => Math.abs(value) >= 2)).length;
  const thinRatio = cubes.length ? thinDetails / cubes.length : 0;
  const rotationRatio = cubes.length ? (rotatedCubes + rotatedGroups) / (cubes.length + groups.length) : 0;
  const uniqueCubeNames = new Set(cubeNames).size;
  const measuredTextures = textures.filter(texture => typeof texture.unique_colors === "number");
  const flatTextures = measuredTextures.filter(texture => (texture.unique_colors ?? 0) <= 2);
  const flatTextureRatio = measuredTextures.length ? flatTextures.length / measuredTextures.length : null;
  const averageTextureColors = measuredTextures.length
    ? measuredTextures.reduce((sum, texture) => sum + (texture.unique_colors ?? 0), 0) / measuredTextures.length
    : null;

  if (uniqueCubeNames < cubes.length * 0.8) {
    add("warning", "generic_names", "Nhiều cube trùng tên; đặt tên theo bộ phận giúp AI sửa model chính xác hơn.", -5);
  } else if (cubes.length) {
    add("pass", "semantic_names", "Cube được đặt tên đủ rõ để sửa theo bộ phận.", 2);
  }
  if (thinRatio < 0.12 && cubes.length >= 10) {
    add("suggestion", "low_detail_layering", "Thiếu các lớp mỏng cho mắt, má, viền, lông hoặc điểm nhấn silhouette.", -7);
  } else if (thinRatio >= 0.16) {
    add("pass", "detail_layering", `Tỷ lệ chi tiết mỏng ${(thinRatio * 100).toFixed(0)}% tạo độ đọc tốt ở quy mô Minecraft.`, 4);
  }
  if (rotationRatio < 0.07 && cubes.length >= 12) {
    add("suggestion", "boxy_silhouette", "Hình học gần như toàn khối vuông; thêm góc 5°, 22.5° hoặc 45° cho tai, lông, đuôi và phụ kiện.", -8);
  } else if (rotationRatio >= 0.1) {
    add("pass", "shaped_silhouette", "Model có đủ góc xoay để phá silhouette hình hộp.", 4);
  }
  if (flatTextureRatio !== null && flatTextureRatio > 0.5) {
    add("warning", "flat_textures", `${flatTextures.length}/${measuredTextures.length} texture chỉ có tối đa 2 màu; phong cách Fancy cần shadow, highlight, hue-shift và accent pixel.`, -24);
  } else if (averageTextureColors !== null && averageTextureColors >= 5) {
    add("pass", "painted_textures", `Texture có trung bình ${averageTextureColors.toFixed(1)} màu, đủ nền tảng cho chất liệu pixel phân lớp.`, 6);
  }

  if (profile === "pet") {
    if (cubes.length < 28) add("warning", "pet_too_simple", `Pet chỉ có ${cubes.length} cube; pack tham chiếu đẹp thường dùng khoảng 21–34 cube và pet nhiều lớp nên hướng tới 28–55.`, -10);
    else if (cubes.length > 70) add("suggestion", "pet_overbuilt", `Pet có ${cubes.length} cube; cân nhắc giảm chi tiết không ảnh hưởng silhouette.`, -4);
    else add("pass", "pet_cube_budget", `${cubes.length} cube nằm trong ngân sách hợp lý cho pet chi tiết.`, 5);

    if (groups.length < 16) add("warning", "pet_rig_sparse", `Rig chỉ có ${groups.length} group; cần tách mắt, tai, chân, đuôi và VFX để animation có sức sống.`, -10);
    else add("pass", "pet_rig_density", `${groups.length} group đủ cho chuyển động phân lớp.`, 5);

    const required: Array<[string, string[]]> = [
      ["body", ["body"]], ["torso", ["torso"]], ["head", ["h_head"]], ["vfx", ["vfx"]], ["hitbox", ["hitbox"]],
    ];
    for (const [label, patterns] of required) {
      if (!includesAny(groupNames, patterns)) add("warning", `missing_${label}`, `Thiếu bone chuẩn '${patterns[0]}'.`, -4);
    }
    for (const [label, left, right] of [
      ["eyes", "left_eye", "right_eye"], ["ears", "left_ear", "right_ear"],
      ["front legs", "front_left_leg", "front_right_leg"], ["back legs", "back_left_leg", "back_right_leg"],
    ] as const) {
      if (!semanticPair(groupNames, left, right)) add("suggestion", `missing_${label.replaceAll(" ", "_")}_pair`, `Nên có cặp ${label} trái/phải độc lập để giữ đối xứng và animation.`, -3);
    }
    const faceFeatures = ["eye", "shine", "cheek", "muzzle", "nose", "smile", "blush"];
    const featureCount = faceFeatures.filter(feature => includesAny(cubeNames, [feature])).length;
    if (featureCount < 4) add("warning", "flat_face", "Khuôn mặt thiếu phân lớp; nên có mắt, highlight, má, mõm và mũi tách riêng.", -10);
    else add("pass", "layered_face", `Khuôn mặt có ${featureCount}/${faceFeatures.length} nhóm chi tiết chibi.`, 6);
    if (!includesAny(groupNames.concat(cubeNames), ["tail"])) add("suggestion", "missing_tail", "Pet không có đuôi nhận diện riêng.", -4);

    const animationChecks: Array<[string, string[]]> = [
      ["idle", ["idle"]], ["walk", ["walk"]], ["skill", ["skill", "attack", "throw", "slash", "pounce"]], ["death", ["death"]],
    ];
    for (const [label, patterns] of animationChecks) {
      if (!includesAny(animationNames, patterns)) add("suggestion", `missing_${label}_animation`, `Thiếu animation ${label}; bộ pet chuyên nghiệp nên có idle, walk, skill và death.`, -4);
    }
    const walk = animations.find(animation => animation.name.toLowerCase().includes("walk"));
    if (walk && (walk.length < 0.35 || walk.length > 0.9)) add("suggestion", "walk_timing", `Walk dài ${walk.length}s; pack tham chiếu dùng nhịp khoảng 0.5s để chuyển động gọn.`, -3);
    const idle = animations.find(animation => animation.name.toLowerCase().includes("idle"));
    if (idle && (idle.length < 1.5 || idle.length > 8)) add("suggestion", "idle_timing", `Idle dài ${idle.length}s; khoảng 2–6s thường tự nhiên hơn.`, -2);
  }

  if (profile === "weapon") {
    if (cubes.length < 18) add("warning", "weapon_too_simple", "Vũ khí thiếu lớp silhouette; pack tham chiếu trung bình khoảng 38 cube.", -10);
    if (thinRatio < 0.25) add("suggestion", "weapon_needs_edges", "Vũ khí cần nhiều phiến mỏng cho lưỡi, viền sáng và hoa văn.", -8);
    if (!includesAny(groupNames, ["blade", "handle", "guard"])) add("warning", "weapon_rig", "Thiếu blade/handle/guard tách riêng.", -8);
  }

  if (profile === "golem") {
    if (cubes.length < 70) add("suggestion", "golem_detail", "Golem chiến đấu nên có nhiều khớp, bàn tay, đạo cụ và lớp giáp hơn.", -8);
    if (groups.length < 20) add("warning", "golem_rig", "Rig golem cần upper/lower limbs, hands, weapon, projectile và hitbox.", -10);
  }

  const bounds = snapshot.bounds?.size ?? null;
  if (bounds && bounds.every(Number.isFinite)) {
    const smallest = Math.min(...bounds.filter(value => value > 0));
    const largest = Math.max(...bounds);
    if (smallest > 0 && largest / smallest > 5.5) add("suggestion", "extreme_proportions", "Tỷ lệ bao tổng thể quá dài/mỏng; kiểm tra lại silhouette ở góc bên.", -4);
  }

  const deductions = findings.filter(finding => finding.points < 0).reduce((sum, finding) => sum - finding.points, 0);
  const bonuses = findings.filter(finding => finding.points > 0).reduce((sum, finding) => sum + finding.points, 0);
  const score = Math.max(0, Math.min(100, 100 - deductions + Math.min(10, bonuses)));
  const grade = score >= 92 ? "S" : score >= 84 ? "A" : score >= 72 ? "B" : score >= 60 ? "C" : "D";
  return {
    ok: !findings.some(finding => finding.severity === "error"),
    profile,
    assessment: measuredTextures.length ? "structural_and_texture" : "structural",
    visual_review_required: true,
    score,
    grade,
    metrics: {
      cubes: cubes.length, groups: groups.length, textures: textures.length, animations: animations.length,
      thin_detail_ratio: Number(thinRatio.toFixed(3)), rotation_ratio: Number(rotationRatio.toFixed(3)),
      flat_texture_ratio: flatTextureRatio === null ? null : Number(flatTextureRatio.toFixed(3)),
      average_texture_colors: averageTextureColors === null ? null : Number(averageTextureColors.toFixed(2)), bounds,
    },
    findings,
    next_actions: findings
      .filter(finding => finding.severity === "warning" || finding.severity === "suggestion")
      .sort((a, b) => a.points - b.points)
      .slice(0, 6)
      .map(finding => finding.message),
  };
}

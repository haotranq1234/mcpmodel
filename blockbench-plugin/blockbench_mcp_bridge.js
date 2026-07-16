/* Blockbench MCP Bridge - local, structured Blockbench automation */
(() => {
  const PLUGIN_ID = 'blockbench_mcp_bridge';
  const PLUGIN_VERSION = '0.4.0';
  const FACE_DIRECTIONS = ['north', 'south', 'east', 'west', 'up', 'down'];
  let socket = null;
  let reconnectTimer = null;
  let manualDisconnect = false;
  let actions = [];
  let pluginSettings = [];
  const CONFIG_KEY = 'blockbench_mcp_bridge_config';
  const DEFAULT_CONFIG = { host: '127.0.0.1', port: 32145, token: 'blockbench-mcp-local' };

  function getBridgeConfig() {
    try {
      const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      const host = ['127.0.0.1', 'localhost', '::1'].includes(stored.host) ? stored.host : DEFAULT_CONFIG.host;
      const port = Number.isInteger(Number(stored.port)) && Number(stored.port) >= 1 && Number(stored.port) <= 65535
        ? Number(stored.port) : DEFAULT_CONFIG.port;
      return { host, port, token: String(stored.token || DEFAULT_CONFIG.token) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function bridgeUrl() {
    const { host, port } = getBridgeConfig();
    return `ws://${host}:${port}`;
  }

  function projectSummary() {
    if (!Project) return null;
    return {
      name: Project.name,
      format: Format && Format.id,
      cubes: Cube.all.length,
      groups: Group.all.length,
      locators: Locator.all.length,
      textures: Texture.all.length,
      animations: Animation.all.length,
    };
  }

  function send(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  function connect(showFeedback = false) {
    manualDisconnect = false;
    clearTimeout(reconnectTimer);
    if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;

    try {
      socket = new WebSocket(bridgeUrl());
    } catch (error) {
      scheduleReconnect();
      if (showFeedback) Blockbench.showQuickMessage(`MCP: ${error.message}`, 2500);
      return;
    }

    socket.addEventListener('open', () => {
      send({
        type: 'hello',
        token: getBridgeConfig().token,
        client: {
          name: 'Blockbench Desktop',
          blockbenchVersion: Blockbench.version,
          pluginVersion: PLUGIN_VERSION,
          project: projectSummary(),
        },
      });
    });

    socket.addEventListener('message', async (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === 'hello_ack') {
        if (showFeedback) Blockbench.showQuickMessage('MCP đã kết nối', 1800);
        return;
      }
      if (message.type !== 'request' || typeof message.id !== 'string') return;
      try {
        const result = await handleRequest(message.method, message.params || {});
        send({ type: 'response', id: message.id, result });
      } catch (error) {
        send({
          type: 'response',
          id: message.id,
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
      }
    });

    socket.addEventListener('close', () => {
      socket = null;
      if (!manualDisconnect) scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      if (showFeedback) Blockbench.showQuickMessage(`Không thể kết nối ${bridgeUrl()}`, 2500);
    });
  }

  function disconnect() {
    manualDisconnect = true;
    clearTimeout(reconnectTimer);
    if (socket) socket.close(1000, 'Disconnected by user');
    socket = null;
    Blockbench.showQuickMessage('MCP đã ngắt kết nối', 1800);
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(false), 2000);
  }

  function assertVector(value, length, label) {
    if (!Array.isArray(value) || value.length !== length || value.some(number => !Number.isFinite(number))) {
      throw new Error(`${label} must be an array of ${length} finite numbers`);
    }
  }

  function validateSpec(spec) {
    if (!spec || !spec.project || typeof spec.project.name !== 'string') {
      throw new Error('A valid project specification is required');
    }
    if (!Formats[spec.project.format || 'free']) {
      throw new Error(`Unknown Blockbench format '${spec.project.format}'`);
    }
    const refs = new Set();
    const textureNames = new Set((spec.textures || []).map(texture => texture.name));
    for (const group of spec.groups || []) {
      assertVector(group.origin, 3, `Group '${group.name}' origin`);
      assertVector(group.rotation, 3, `Group '${group.name}' rotation`);
      if (group.id) refs.add(group.id);
      refs.add(group.name);
    }
    if (spec.mode === 'append') {
      Group.all.forEach(group => {
        refs.add(group.uuid);
        refs.add(group.name);
      });
      Texture.all.forEach(texture => textureNames.add(texture.name));
    }
    for (const group of spec.groups || []) {
      if (group.parent && !refs.has(group.parent)) throw new Error(`Missing parent '${group.parent}'`);
    }
    for (const cube of spec.cubes || []) {
      assertVector(cube.from, 3, `Cube '${cube.name}' from`);
      assertVector(cube.to, 3, `Cube '${cube.name}' to`);
      if (cube.from.some((value, index) => value >= cube.to[index])) {
        throw new Error(`Cube '${cube.name}' has invalid bounds`);
      }
      if (cube.parent && !refs.has(cube.parent)) throw new Error(`Missing parent '${cube.parent}'`);
      Object.values(cube.faces || {}).forEach(face => {
        if (face && face.texture && !textureNames.has(face.texture)) {
          throw new Error(`Missing texture '${face.texture}'`);
        }
      });
    }
    for (const locator of spec.locators || []) {
      assertVector(locator.position, 3, `Locator '${locator.name}' position`);
      if (locator.parent && !refs.has(locator.parent)) throw new Error(`Missing parent '${locator.parent}'`);
    }
    for (const animation of spec.animations || []) {
      for (const track of animation.tracks || []) {
        if (!refs.has(track.bone)) throw new Error(`Missing animation bone '${track.bone}'`);
      }
    }
  }

  function makeTextureDataUrl(texture, defaultWidth, defaultHeight) {
    if (texture.data_url) return texture.data_url;
    if (texture.base64_png) return `data:image/png;base64,${texture.base64_png}`;
    if (texture.path) return null;
    const width = texture.width || defaultWidth;
    const height = texture.height || defaultHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    if (texture.fill && texture.fill !== '#00000000') {
      context.fillStyle = texture.fill;
      context.fillRect(0, 0, width, height);
    }
    for (const patch of texture.pixels || []) {
      context.fillStyle = patch.color;
      context.fillRect(patch.x, patch.y, patch.width || 1, patch.height || 1);
    }
    return canvas.toDataURL('image/png');
  }

  function createTexture(textureSpec, projectSpec) {
    const options = {
      name: textureSpec.name,
      render_mode: textureSpec.render_mode || 'default',
      render_sides: textureSpec.render_sides || 'auto',
      wrap_mode: textureSpec.wrap_mode || 'limited',
      frame_time: textureSpec.frame_time || 1,
      frame_order_type: textureSpec.frame_order_type || 'loop',
      frame_order: textureSpec.frame_order || '',
      frame_interpolate: Boolean(textureSpec.frame_interpolate),
      use_as_default: Boolean(textureSpec.use_as_default),
      uv_width: textureSpec.uv_width || projectSpec.texture_width,
      uv_height: textureSpec.uv_height || projectSpec.texture_height,
      keep_size: true,
    };
    const texture = new Texture(options);
    if (textureSpec.path) {
      if (Blockbench.isWeb) throw new Error('Texture paths require Blockbench Desktop');
      texture.fromPath(textureSpec.path);
    } else {
      texture.fromDataURL(makeTextureDataUrl(textureSpec, projectSpec.texture_width, projectSpec.texture_height));
    }
    texture.add(false, true);
    texture.uv_width = textureSpec.uv_width || projectSpec.texture_width;
    texture.uv_height = textureSpec.uv_height || projectSpec.texture_height;
    if (textureSpec.use_as_default && typeof texture.setAsDefaultTexture === 'function') {
      texture.setAsDefaultTexture();
    }
    return texture;
  }

  function resolveGroup(ref, groupMap) {
    if (!ref) return 'root';
    const group = groupMap.get(ref) || Group.all.find(candidate => candidate.uuid === ref || candidate.name === ref);
    if (!group) throw new Error(`Cannot resolve group '${ref}'`);
    return group;
  }

  function createGroup(groupSpec, groupMap) {
    const parent = resolveGroup(groupSpec.parent, groupMap);
    const group = new Group({
      name: groupSpec.name,
      origin: groupSpec.origin,
      rotation: groupSpec.rotation,
      visibility: groupSpec.visibility,
      mirror_uv: groupSpec.mirror_uv,
    }).addTo(parent).init();
    if (groupSpec.id) groupMap.set(groupSpec.id, group);
    groupMap.set(groupSpec.name, group);
    groupMap.set(group.uuid, group);
    return group;
  }

  function createGroupsInDependencyOrder(groupSpecs, groupMap) {
    const pending = groupSpecs.slice();
    const created = [];
    while (pending.length) {
      let progress = false;
      for (let index = 0; index < pending.length; index++) {
        const spec = pending[index];
        const parentReady = !spec.parent || groupMap.has(spec.parent) || Group.all.some(group => group.uuid === spec.parent || group.name === spec.parent);
        if (!parentReady) continue;
        created.push(createGroup(spec, groupMap));
        pending.splice(index, 1);
        index--;
        progress = true;
      }
      if (!progress) throw new Error(`Circular or unresolved group hierarchy: ${pending.map(group => group.name).join(', ')}`);
    }
    return created;
  }

  function createCube(cubeSpec, groupMap, textureMap) {
    const faceOptions = {};
    for (const direction of FACE_DIRECTIONS) {
      const source = cubeSpec.faces && cubeSpec.faces[direction];
      if (!source) continue;
      const face = { ...source };
      if (source.texture) face.texture = textureMap.get(source.texture).uuid;
      faceOptions[direction] = face;
    }
    const origin = cubeSpec.origin || cubeSpec.from.map((value, index) => (value + cubeSpec.to[index]) / 2);
    const cube = new Cube({
      name: cubeSpec.name,
      from: cubeSpec.from,
      to: cubeSpec.to,
      origin,
      rotation: cubeSpec.rotation,
      inflate: cubeSpec.inflate,
      shade: cubeSpec.shade,
      visibility: cubeSpec.visibility,
      box_uv: cubeSpec.box_uv,
      mirror_uv: cubeSpec.mirror_uv,
      uv_offset: cubeSpec.uv_offset,
      faces: faceOptions,
      autouv: 0,
    }).addTo(resolveGroup(cubeSpec.parent, groupMap)).init();
    if (Object.keys(faceOptions).length === 0 && textureMap.size) {
      cube.applyTexture(textureMap.values().next().value, true);
    }
    return cube;
  }

  function createLocator(locatorSpec, groupMap) {
    if (!Format.locators) throw new Error(`Format '${Format.id}' does not support locators`);
    return new Locator({
      name: locatorSpec.name,
      from: locatorSpec.position,
    }).addTo(resolveGroup(locatorSpec.parent, groupMap)).init();
  }

  function applyDisplaySettings(displaySettings) {
    for (const [slot, data] of Object.entries(displaySettings || {})) {
      if (!DisplayMode.slots.includes(slot)) continue;
      Project.display_settings[slot] = new DisplaySlot(slot).extend(data);
    }
  }

  function createAnimation(animationSpec, groupMap) {
    if (!Format.animation_mode) throw new Error(`Format '${Format.id}' does not support animations`);
    const animation = new Animation({
      name: animationSpec.name,
      length: animationSpec.length,
      loop: animationSpec.loop,
      snapping: animationSpec.snapping,
    }).add(false);
    for (const track of animationSpec.tracks || []) {
      const group = resolveGroup(track.bone, groupMap);
      const animator = new BoneAnimator(group.uuid, animation, group.name);
      animation.animators[group.uuid] = animator;
      for (const keyframe of track.keyframes) {
        const points = keyframe.data_points || [keyframe.vector];
        animator.addKeyframe({
          time: keyframe.time,
          channel: keyframe.channel,
          interpolation: keyframe.interpolation,
          data_points: points.map(vector => ({ x: vector[0], y: vector[1], z: vector[2] })),
          bezier_linked: keyframe.bezier_linked,
          bezier_left_time: keyframe.bezier_left_time,
          bezier_left_value: keyframe.bezier_left_value,
          bezier_right_time: keyframe.bezier_right_time,
          bezier_right_value: keyframe.bezier_right_value,
        });
      }
    }
    for (const markerSpec of animationSpec.markers || []) {
      animation.markers.push(new TimelineMarker({ time: markerSpec.time, color: markerSpec.color }));
    }
    animation.setLength(animationSpec.length);
    return animation;
  }

  async function applyModel(spec) {
    validateSpec(spec);
    const replacing = spec.mode !== 'append';
    if (replacing || !Project) {
      newProject(spec.project.format || 'free');
    }
    if (!Project) throw new Error('Blockbench could not create a project');

    Project.name = spec.project.name;
    Project.texture_width = spec.project.texture_width;
    Project.texture_height = spec.project.texture_height;
    Project.box_uv = spec.project.box_uv;
    applyDisplaySettings(spec.project.display_settings);

    const groupMap = new Map();
    const textureMap = new Map();
    if (!replacing) {
      Group.all.forEach(group => {
        groupMap.set(group.uuid, group);
        groupMap.set(group.name, group);
      });
      Texture.all.forEach(texture => textureMap.set(texture.name, texture));
      Undo.initEdit({ outliner: true, elements: [], textures: [], animations: [] });
    }

    try {
      for (const textureSpec of spec.textures || []) {
        const texture = createTexture(textureSpec, spec.project);
        textureMap.set(texture.name, texture);
      }
      const groups = createGroupsInDependencyOrder(spec.groups || [], groupMap);
      const locators = (spec.locators || []).map(locator => createLocator(locator, groupMap));
      const cubes = (spec.cubes || []).map(cube => createCube(cube, groupMap, textureMap));
      const animations = (spec.animations || []).map(animation => createAnimation(animation, groupMap));
      Canvas.updateAll();
      Project.saved = false;
      if (!replacing) Undo.finishEdit('Apply MCP model');
      Blockbench.showQuickMessage(`MCP: ${groups.length} bones, ${cubes.length} cubes`, 2200);
      return {
        ok: true,
        project: projectSummary(),
        created: {
          groups: groups.map(group => ({ name: group.name, uuid: group.uuid })),
          locators: locators.map(locator => ({ name: locator.name, uuid: locator.uuid })),
          cubes: cubes.map(cube => ({ name: cube.name, uuid: cube.uuid })),
          textures: (spec.textures || []).map(texture => texture.name),
          animations: animations.map(animation => animation.name),
        },
        bounds: calculateBounds(),
      };
    } catch (error) {
      if (!replacing) Undo.cancelEdit();
      throw error;
    }
  }

  function findByIdOrName(items, id, type) {
    const item = items.find(candidate => candidate.uuid === id || candidate.name === id);
    if (!item) throw new Error(`Cannot find ${type} '${id}'`);
    return item;
  }

  function patchModel(options) {
    if (!Project) throw new Error('No open project');
    const cubePatches = options.cubes || [];
    const groupPatches = options.groups || [];
    const removeCubes = options.remove_cubes || [];
    const touchedCubes = new Set();
    const touchedGroups = new Set();
    const removed = [];
    Undo.initEdit({ outliner: true, elements: Cube.all.slice() });
    try {
      for (const patch of cubePatches) {
        const cube = findByIdOrName(Cube.all, patch.id, 'cube');
        const from = patch.from || cube.from;
        const to = patch.to || cube.to;
        assertVector(from, 3, `Cube '${cube.name}' from`);
        assertVector(to, 3, `Cube '${cube.name}' to`);
        if (from.some((value, axis) => value >= to[axis])) throw new Error(`Cube '${cube.name}' patch has invalid bounds`);
        const data = {};
        for (const key of ['name', 'from', 'to', 'origin', 'rotation', 'inflate', 'visibility']) {
          if (patch[key] !== undefined) data[key] = patch[key];
        }
        cube.extend(data);
        touchedCubes.add(cube);
      }
      for (const patch of groupPatches) {
        const group = findByIdOrName(Group.all, patch.id, 'group');
        const data = {};
        for (const key of ['name', 'origin', 'rotation', 'visibility']) {
          if (patch[key] !== undefined) data[key] = patch[key];
        }
        group.extend(data);
        touchedGroups.add(group);
      }
      for (const ref of removeCubes) {
        const cube = findByIdOrName(Cube.all, ref, 'cube');
        removed.push({ name: cube.name, uuid: cube.uuid });
        cube.remove();
      }
      Canvas.updateAll();
      Project.saved = false;
      Undo.finishEdit('Patch MCP model');
      return {
        ok: true,
        updated: {
          cubes: [...touchedCubes].map(cube => ({ name: cube.name, uuid: cube.uuid })),
          groups: [...touchedGroups].map(group => ({ name: group.name, uuid: group.uuid })),
        },
        removed: { cubes: removed },
        bounds: calculateBounds(),
      };
    } catch (error) {
      Undo.cancelEdit();
      throw error;
    }
  }

  function calculateBounds() {
    if (!Cube.all.length) return null;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    Cube.all.forEach(cube => {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], cube.from[axis] - cube.inflate);
        max[axis] = Math.max(max[axis], cube.to[axis] + cube.inflate);
      }
    });
    return { min, max, size: max.map((value, axis) => value - min[axis]) };
  }

  function getProjectState(options = {}) {
    if (!Project) return { open: false };
    return {
      open: true,
      name: Project.name,
      format: Format.id,
      texture_size: [Project.texture_width, Project.texture_height],
      box_uv: Project.box_uv,
      saved: Project.saved,
      bounds: calculateBounds(),
      groups: Group.all.map(group => ({
        uuid: group.uuid,
        name: group.name,
        parent: group.parent === 'root' ? null : group.parent.uuid,
        origin: group.origin.slice(),
        rotation: group.rotation.slice(),
        children: group.children.length,
      })),
      locators: Locator.all.map(locator => ({
        uuid: locator.uuid,
        name: locator.name,
        parent: locator.parent === 'root' ? null : locator.parent.uuid,
        position: (locator.from || locator.position || [0, 0, 0]).slice(),
      })),
      cubes: Cube.all.map(cube => {
        const result = {
          uuid: cube.uuid,
          name: cube.name,
          parent: cube.parent === 'root' ? null : cube.parent.uuid,
          from: cube.from.slice(),
          to: cube.to.slice(),
          origin: cube.origin.slice(),
          rotation: cube.rotation.slice(),
          inflate: cube.inflate,
          box_uv: cube.box_uv,
          uv_offset: (cube.uv_offset || [0, 0]).slice(),
        };
        if (options.include_uv) {
          result.faces = Object.fromEntries(FACE_DIRECTIONS.map(direction => [direction, {
            uv: (cube.faces[direction].uv || [0, 0, 0, 0]).slice(),
            texture: cube.faces[direction].texture,
            enabled: cube.faces[direction].enabled,
          }]));
        }
        return result;
      }),
      textures: Texture.all.map(texture => ({
        uuid: texture.uuid,
        name: texture.name,
        width: texture.width,
        height: texture.height,
        uv_width: texture.uv_width,
        uv_height: texture.uv_height,
        render_mode: texture.render_mode,
      })),
      animations: Animation.all.map(animation => ({
        uuid: animation.uuid,
        name: animation.name,
        length: animation.length,
        loop: animation.loop,
        markers: animation.markers.map(marker => ({ time: marker.time, color: marker.color })),
        tracks: Object.values(animation.animators).map(animator => ({
          name: animator.name,
          keyframes: animator.keyframes.length,
        })),
      })),
      display_settings: Object.fromEntries(Object.entries(Project.display_settings).map(([slot, value]) => [slot, value.export ? value.export() : value])),
    };
  }

  function setCamera(options) {
    if (!Preview.selected) throw new Error('No active Blockbench preview');
    const preview = Preview.selected;
    preview.setProjectionMode(Boolean(options.orthographic));
    if (!options.orthographic) preview.setFOV(options.fov || 45);
    preview.camera.position.set(...options.position);
    preview.controls.target.set(...options.target);
    preview.camera.lookAt(preview.controls.target);
    if (typeof preview.controls.update === 'function') preview.controls.update();
    preview.render();
    return { ok: true, position: options.position, target: options.target, orthographic: Boolean(options.orthographic) };
  }

  function capturePreview(options) {
    if (!Preview.selected) throw new Error('No active Blockbench preview');
    return new Promise((resolve, reject) => {
      try {
        Preview.selected.screenshot({
          width: options.width || 640,
          height: options.height || 640,
          crop: Boolean(options.crop),
        }, dataUrl => resolve({
          data_url: dataUrl,
          width: options.width || 640,
          height: options.height || 640,
        }));
      } catch (error) {
        reject(error);
      }
    });
  }

  function saveProject(options) {
    if (!Project) throw new Error('No open project');
    if (Blockbench.isWeb) throw new Error('Saving to a path requires Blockbench Desktop');
    let path = String(options.path || '');
    if (!path) throw new Error('Save path is required');
    if (!path.toLowerCase().endsWith('.bbmodel')) path += '.bbmodel';
    const content = Codecs.project.compile({ bitmaps: true });
    Codecs.project.write(content, path);
    Project.save_path = path;
    Project.saved = true;
    return { ok: true, path, project: Project.name };
  }

  function openProject(options) {
    if (Blockbench.isWeb) throw new Error('Opening a local path requires Blockbench Desktop');
    const path = String(options.path || '');
    if (!path.toLowerCase().endsWith('.bbmodel')) throw new Error('Only .bbmodel projects are supported');
    return new Promise((resolve, reject) => {
      const result = Blockbench.read([path], { readtype: 'text', extensions: ['bbmodel'] }, files => {
        try {
          const file = files && files[0];
          if (!file || typeof file.content !== 'string') throw new Error('Blockbench could not read the project');
          if (file.content.startsWith('<lz>')) throw new Error('Compressed .bbmodel is not supported by this importer; save it uncompressed first');
          const model = JSON.parse(file.content);
          Codecs.project.load(model, { name: file.name, path: file.path });
          resolve({ ok: true, path, project: projectSummary() });
        } catch (error) {
          reject(error);
        }
      });
      if (result === false) reject(new Error(`Could not read '${path}'`));
    });
  }

  function exportModel(options) {
    if (!Project) throw new Error('No open project');
    if (Blockbench.isWeb) throw new Error('Exporting to a path requires Blockbench Desktop');
    let path = String(options.path || '');
    if (!path) throw new Error('Export path is required');
    const codecId = String(options.codec || (Format.codec && Format.codec.id) || 'project');
    if (codecId === 'project') return saveProject({ path });
    const codec = Codecs[codecId];
    if (!codec) throw new Error(`Unknown codec '${codecId}'`);
    if (Format.codec !== codec) throw new Error(`Codec '${codecId}' is not valid for the active format '${Format.id}'`);
    if (!path.toLowerCase().endsWith(`.${codec.extension.toLowerCase()}`)) path += `.${codec.extension}`;
    const content = codec.compile();
    codec.write(content, path);
    return { ok: true, path, codec: codecId, format: Format.id };
  }

  function listCapabilities() {
    return {
      blockbench_version: Blockbench.version,
      active_format: Project ? Format.id : null,
      formats: Object.values(Formats).map(format => ({
        id: format.id,
        name: format.name,
        animation: Boolean(format.animation_mode),
        bone_rig: Boolean(format.bone_rig),
        display_mode: Boolean(format.display_mode),
        meshes: Boolean(format.meshes),
        locators: Boolean(format.locators),
        codec: format.codec && format.codec.id,
      })),
      active_codec: Project && Format.codec ? {
        id: Format.codec.id,
        name: Format.codec.name,
        extension: Format.codec.extension,
      } : null,
    };
  }

  function auditModel(options) {
    if (!Project) throw new Error('No open project');
    const profile = options.profile || 'generic';
    const issues = [];
    const add = (severity, code, message, target) => issues.push({ severity, code, message, target });
    const duplicateCheck = (items, type) => {
      const seen = new Map();
      items.forEach(item => {
        const key = item.name.toLowerCase();
        if (seen.has(key)) add('warning', 'duplicate_name', `Duplicate ${type} name '${item.name}'`, item.uuid);
        else seen.set(key, item.uuid);
      });
    };
    duplicateCheck(Group.all, 'group');
    duplicateCheck(Cube.all, 'cube');
    duplicateCheck(Texture.all, 'texture');

    const textureByUuid = new Map(Texture.all.map(texture => [texture.uuid, texture]));
    Cube.all.forEach(cube => {
      if (cube.from.some((value, axis) => value >= cube.to[axis])) {
        add('error', 'invalid_bounds', `Cube '${cube.name}' has zero or negative size`, cube.uuid);
      }
      if (cube.parent === 'root' && Format.animation_mode) {
        add('warning', 'unrigged_cube', `Cube '${cube.name}' is not inside a bone`, cube.uuid);
      }
      FACE_DIRECTIONS.forEach(direction => {
        const face = cube.faces[direction];
        if (!face || !face.enabled || face.texture === false) return;
        const texture = textureByUuid.get(face.texture);
        if (!texture) {
          add('error', 'missing_texture', `Cube '${cube.name}' face '${direction}' has no valid texture`, cube.uuid);
          return;
        }
        const uv = face.uv;
        const width = texture.getUVWidth();
        const height = texture.getUVHeight();
        if (Math.min(uv[0], uv[2]) < 0 || Math.max(uv[0], uv[2]) > width || Math.min(uv[1], uv[3]) < 0 || Math.max(uv[1], uv[3]) > height) {
          add('error', 'uv_out_of_bounds', `Cube '${cube.name}' face '${direction}' exceeds ${width}x${height}`, cube.uuid);
        }
      });
    });

    const isPowerOfTwo = value => value > 0 && (value & (value - 1)) === 0;
    Texture.all.forEach(texture => {
      if (!isPowerOfTwo(texture.uv_width) || !isPowerOfTwo(texture.uv_height)) {
        add('info', 'non_power_of_two_uv', `Texture '${texture.name}' UV size is ${texture.uv_width}x${texture.uv_height}`, texture.uuid);
      }
      if (texture.height > texture.uv_height && texture.height % texture.uv_height !== 0) {
        add('warning', 'invalid_frame_strip', `Animated texture '${texture.name}' height is not a multiple of UV frame height`, texture.uuid);
      }
    });

    Animation.all.forEach(animation => {
      for (const animator of Object.values(animation.animators)) {
        const byChannel = {};
        for (const keyframe of animator.keyframes || []) {
          if (keyframe.time > animation.length + 0.0001) {
            add('error', 'keyframe_after_length', `Animation '${animation.name}' has a keyframe after ${animation.length}s`, keyframe.uuid);
          }
          (byChannel[keyframe.channel] ||= []).push(keyframe);
        }
        if (animation.loop === 'loop') {
          for (const [channel, keyframes] of Object.entries(byChannel)) {
            keyframes.sort((a, b) => a.time - b.time);
            const first = keyframes[0];
            const last = keyframes[keyframes.length - 1];
            if (first.time > 0.0001 || Math.abs(last.time - animation.length) > 0.0001) {
              add('warning', 'loop_endpoint_missing', `Loop '${animation.name}' / '${animator.name}' / '${channel}' lacks 0s or end keyframe`, animator.uuid);
            } else if (JSON.stringify(first.getArray()) !== JSON.stringify(last.getArray())) {
              add('warning', 'loop_discontinuity', `Loop '${animation.name}' / '${animator.name}' / '${channel}' does not close cleanly`, animator.uuid);
            }
          }
        }
      }
    });

    const groupNames = new Set(Group.all.map(group => group.name.toLowerCase()));
    if (['pet', 'entity'].includes(profile)) {
      for (const required of ['body', 'torso', 'h_head', 'hitbox']) {
        if (!groupNames.has(required)) add('warning', 'missing_rig_bone', `Recommended rig bone '${required}' is missing`, required);
      }
      if (!groupNames.has('vfx')) add('info', 'missing_vfx_root', "A 'vfx' bone makes skill props easier to animate", 'vfx');
    }
    if (profile === 'weapon' && Format.display_mode) {
      for (const slot of ['firstperson_righthand', 'thirdperson_righthand', 'gui', 'ground', 'fixed']) {
        const displaySlot = Project.display_settings[slot];
        if (!displaySlot || typeof displaySlot.export !== 'function' || !displaySlot.export()) {
          add('warning', 'missing_display_transform', `Display transform '${slot}' is not configured`, slot);
        }
      }
    }
    if (!Texture.all.length) add('warning', 'no_texture', 'Project has no texture', Project.uuid);
    if (!Cube.all.length) add('warning', 'no_geometry', 'Project has no cubes', Project.uuid);

    const counts = {
      errors: issues.filter(issue => issue.severity === 'error').length,
      warnings: issues.filter(issue => issue.severity === 'warning').length,
      info: issues.filter(issue => issue.severity === 'info').length,
    };
    return {
      ok: counts.errors === 0,
      profile,
      score: Math.max(0, 100 - counts.errors * 15 - counts.warnings * 5 - counts.info),
      counts,
      metrics: {
        groups: Group.all.length,
        cubes: Cube.all.length,
        locators: Locator.all.length,
        textures: Texture.all.length,
        animations: Animation.all.length,
        bounds: calculateBounds(),
      },
      issues,
    };
  }

  async function handleRequest(method, params) {
    switch (method) {
      case 'ping': return { ok: true, version: PLUGIN_VERSION };
      case 'get_project_state': return getProjectState(params);
      case 'apply_model': return await applyModel(params);
      case 'patch_model': return patchModel(params);
      case 'set_camera': return setCamera(params);
      case 'capture_preview': return await capturePreview(params);
      case 'save_project': return saveProject(params);
      case 'open_project': return await openProject(params);
      case 'export_model': return exportModel(params);
      case 'list_capabilities': return listCapabilities();
      case 'audit_model': return auditModel(params);
      default: throw new Error(`Unsupported MCP method '${method}'`);
    }
  }

  Plugin.register(PLUGIN_ID, {
    title: 'Blockbench MCP Bridge',
    author: 'OpenAI Codex',
    description: 'Secure local bridge for AI-driven Blockbench modeling, texturing, animation, preview, and saving.',
    icon: 'hub',
    version: PLUGIN_VERSION,
    min_version: '5.0.0',
    variant: 'both',
    tags: ['Modeling', 'Animation', 'Developer Tools'],
    onload() {
      // A local plugin can be loaded before the Settings dialog/sidebar is mounted.
      // In that case, using the existing General category avoids a startup crash.
      // Keep local bridge settings dependency-free so file plugins can load even
      // before Blockbench mounts the Settings dialog. Environment/config defaults
      // remain 127.0.0.1:32145 with token "blockbench-mcp-local".
      pluginSettings = [];

      actions = [
        new Action('blockbench_mcp_connect', {
          name: 'Connect Blockbench MCP', icon: 'link', click: () => connect(true),
        }),
        new Action('blockbench_mcp_disconnect', {
          name: 'Disconnect Blockbench MCP', icon: 'link_off', click: disconnect,
        }),
        new Action('blockbench_mcp_configure', {
          name: 'Configure Blockbench MCP', icon: 'settings_ethernet', click: () => {
            const config = getBridgeConfig();
            new Dialog('blockbench_mcp_config_dialog', {
              title: 'Blockbench MCP Bridge',
              form: {
                host: { label: 'Host (loopback only)', type: 'text', value: config.host },
                port: { label: 'Port', type: 'number', value: config.port, min: 1, max: 65535 },
                token: { label: 'Token', type: 'password', value: config.token },
              },
              onConfirm(form) {
                if (!['127.0.0.1', 'localhost', '::1'].includes(String(form.host))) {
                  Blockbench.showQuickMessage('MCP host must be loopback', 2500);
                  return;
                }
                localStorage.setItem(CONFIG_KEY, JSON.stringify({ host: String(form.host), port: Number(form.port), token: String(form.token) }));
                this.hide();
                if (socket) socket.close(1000, 'Configuration changed');
                socket = null;
                connect(true);
              },
            }).show();
          },
        }),
        new Action('blockbench_mcp_status', {
          name: 'Blockbench MCP Status', icon: 'info', click: () => {
            const connected = socket && socket.readyState === WebSocket.OPEN;
            Blockbench.showMessageBox({
              title: 'Blockbench MCP Bridge',
              icon: connected ? 'check_circle' : 'link_off',
              message: `${connected ? 'Connected' : 'Disconnected'}\n${bridgeUrl()}\nProject: ${Project ? Project.name : 'none'}`,
            });
          },
        }),
      ];
      actions.forEach(action => MenuBar.menus.tools.addAction(action));
      connect(false);
    },
    onunload() {
      manualDisconnect = true;
      clearTimeout(reconnectTimer);
      if (socket) socket.close(1000, 'Plugin unloaded');
      actions.forEach(action => action.delete());
      pluginSettings.forEach(setting => setting.delete());
      actions = [];
      pluginSettings = [];
    },
  });
})();

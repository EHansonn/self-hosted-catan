/* eslint-disable react-hooks/immutability -- Three.js mutates its own meshes/materials; numeric board coordinates and React props remain read-only. */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TERRAIN, type BoardProps, type BuildPiece } from "./Board";
import {
  harborLabelPosition,
  harborTransformForEdge,
} from "./portOrientation";

type Stage = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  group: THREE.Group;
  dirty: boolean;
  textures: Map<string, THREE.Texture>;
  targets: { element: HTMLElement; point: THREE.Vector3 }[];
  motions: {
    start: number;
    duration: number;
    update: (progress: number) => void;
  }[];
  lastAnimationId: string | null;
  disposeGroup: () => void;
  reset: () => void;
};
export default function ThreeBoard(props: BoardProps & { reset: number }) {
  const container = useRef<HTMLDivElement>(null),
    stage = useRef<Stage | null>(null),
    live = useRef(props);
  useEffect(() => {
    live.current = props;
  }, [props]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = container.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      const frame = requestAnimationFrame(() => setFailed(true));
      return () => cancelAnimationFrame(frame);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor("#0a303f", 0);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => {
      controls.enableDamping = !reducedMotion.matches;
    };
    updateMotion();
    reducedMotion.addEventListener("change", updateMotion);
    controls.enablePan = false;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI * 0.38;
    controls.minDistance = 7;
    controls.maxDistance = 40;
    scene.add(new THREE.HemisphereLight("#e1f5f3", "#534330", 2.4));
    const sun = new THREE.DirectionalLight("#ffe0ac", 3.5);
    sun.position.set(-5, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    const group = new THREE.Group();
    scene.add(group);
    const textures = new Map<string, THREE.Texture>();
    const disposeGroup = () => {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          materials.forEach((m) => {
            const map = (m as THREE.MeshStandardMaterial).map;
            if (map && map.userData.label) map.dispose();
            m.dispose();
          });
        }
      });
      group.clear();
    };
    const reset = () => {
      const boardRadius = Math.max(
        ...live.current.board.vertices.map((vertex) =>
          Math.hypot(vertex.x, vertex.y),
        ),
      );
      const size = Math.max(13, boardRadius * 2.35);
      const ratio = el.clientWidth / Math.max(el.clientHeight, 1);
      let distance = size * Math.max(1, 0.92 / ratio);
      controls.target.set(0, 0, 0);
      // Fit the coast and modeled harbors, including perspective foreshortening on narrow screens.
      for (let i = 0; i < 3; i++) {
        camera.position.set(0, distance * (ratio < 1 ? 1.2 : 0.85), distance * (ratio < 1 ? 0.62 : 0.78));
        controls.update();
        camera.updateMatrixWorld();
        let extent = 0;
        for (const vertex of live.current.board.vertices) {
          const length = Math.hypot(vertex.x, vertex.y) || 1;
          const projected = new THREE.Vector3(
            vertex.x + (vertex.x / length) * 1.35,
            0.9,
            vertex.y + (vertex.y / length) * 1.35,
          ).project(camera);
          extent = Math.max(
            extent,
            Math.abs(projected.x),
            Math.abs(projected.y),
          );
        }
        if (Math.abs(extent - 0.87) < 0.015) break;
        distance *= extent / 0.87;
      }
    };
    const state: Stage = {
      scene,
      camera,
      renderer,
      controls,
      group,
      textures,
      targets: [],
      motions: [],
      lastAnimationId: null,
      dirty: true,
      disposeGroup,
      reset,
    };
    stage.current = state;
    const resize = () => {
      camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
      reset();
      state.dirty = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    const down = { x: 0, y: 0 };
    let hoveredBuild: BuildPiece | null = null;
    const raycast = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      return ray.intersectObjects(group.children, true);
    };
    const pointerDown = (e: PointerEvent) => {
      down.x = e.clientX;
      down.y = e.clientY;
    };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) return;
      const hits = raycast(e);
      const pick = hits.find((hit) => hit.object.userData.pick !== undefined);
      if (pick) {
        live.current.onPick(pick.object.userData.pick);
        return;
      }
      const contextual = hits.find(
        (hit) => hit.object.userData.buildHint !== undefined,
      );
      if (contextual)
        live.current.onBuildPick?.(
          contextual.object.userData.buildHint,
          contextual.object.userData.buildId,
        );
    };
    const pointerMove = (e: PointerEvent) => {
      const contextual = raycast(e).find(
        (hit) => hit.object.userData.buildHint !== undefined,
      );
      const next = (contextual?.object.userData.buildHint as
        | BuildPiece
        | undefined) || null;
      if (next === hoveredBuild) return;
      hoveredBuild = next;
      live.current.onBuildHint?.(next);
    };
    const pointerLeave = () => {
      if (!hoveredBuild) return;
      hoveredBuild = null;
      live.current.onBuildHint?.(null);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    el.addEventListener("pointerleave", pointerLeave);
    const contextLost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    controls.addEventListener("change", () => (state.dirty = true));
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;
      controls.update();
      if (state.motions.length) {
        const now = performance.now();
        state.motions = state.motions.filter((motion) => {
          const progress = Math.min(1, (now - motion.start) / motion.duration);
          motion.update(progress);
          return progress < 1;
        });
        state.dirty = true;
      }
      if (state.dirty) {
        renderer.render(scene, camera);
        for (const target of state.targets) {
          const p = target.point.clone().project(camera);
          target.element.style.left = `${((p.x + 1) / 2) * el.clientWidth}px`;
          target.element.style.top = `${((1 - p.y) / 2) * el.clientHeight}px`;
          target.element.hidden = p.z > 1 || p.z < -1;
        }
        state.dirty = false;
      }
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      reducedMotion.removeEventListener("change", updateMotion);
      controls.dispose();
      state.targets.forEach((t) => t.element.remove());
      disposeGroup();
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      el.removeEventListener("pointerleave", pointerLeave);
      renderer.domElement.remove();
      stage.current = null;
    };
  }, []);
  useEffect(() => {
    stage.current?.reset();
    if (stage.current) stage.current.dirty = true;
  }, [props.reset, props.board.tiles.length]);
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    s.disposeGroup();
    s.targets.forEach((t) => t.element.remove());
    s.targets = [];
    s.motions = [];
    const animation =
      props.animation &&
      props.animation.id !== s.lastAnimationId &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? props.animation
        : null;
    if (animation) s.lastAnimationId = animation.id;
    const { board, players, robber, kind, highlights } = props;
    const color = (id: string) =>
      players.find((p) => p.id === id)?.color || "#fff";
    const material = (color: string, extra = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
    const terrainTexture = (
      terrain: keyof typeof TERRAIN,
    ): THREE.CanvasTexture => {
      const cached = s.textures.get(terrain);
      if (cached) return cached as THREE.CanvasTexture;

      // Match the bright 2D board treatment: vivid terrain color first, then
      // enough of the painted atlas to retain its natural detail.
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d")!;
      const tex = TERRAIN[terrain];
      const paintBase = () => {
        ctx.globalAlpha = 1;
        ctx.fillStyle = tex.color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      };
      paintBase();
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = Math.min(
        4,
        s.renderer.capabilities.getMaxAnisotropy(),
      );
      s.textures.set(terrain, map);

      const image = new Image();
      image.onload = () => {
        const cellWidth = image.naturalWidth / 3;
        const cellHeight = image.naturalHeight / 2;
        paintBase();
        ctx.globalAlpha = 0.28;
        ctx.drawImage(
          image,
          tex.col * cellWidth,
          tex.row * cellHeight,
          cellWidth,
          cellHeight,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "#ffe39c";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        map.needsUpdate = true;
        s.dirty = true;
      };
      image.src = "/textures/terrain-atlas.png";
      return map;
    };
    const add = (
      geometry: THREE.BufferGeometry,
      mat: THREE.Material | THREE.Material[],
      x: number,
      y: number,
      z: number,
    ) => {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      s.group.add(mesh);
      return mesh;
    };
    const animate = (
      duration: number,
      update: (progress: number) => void,
    ) => {
      update(0);
      s.motions.push({ start: performance.now(), duration, update });
    };
    const easeOut = (progress: number) => 1 - Math.pow(1 - progress, 3);
    const spring = (progress: number) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2);
    };
    const numberToken = (
      value: number,
      x: number,
      z: number,
    ) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.beginPath();
      ctx.arc(128, 128, 116, 0, Math.PI * 2);
      ctx.fillStyle = "#fffdf1";
      ctx.fill();
      ctx.strokeStyle = "#c4ae81";
      ctx.lineWidth = 10;
      ctx.stroke();
      const hot = value === 6 || value === 8;
      const tint = hot ? "#bd1111" : "#064c18";
      ctx.fillStyle = tint;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `900 ${value >= 10 ? 88 : 105}px Arial Black, Arial, sans-serif`;
      ctx.fillText(String(value), 128, 108);
      const pipCount = 6 - Math.abs(7 - value);
      const pipSpacing = 24;
      for (let pip = 0; pip < pipCount; pip++) {
        ctx.beginPath();
        ctx.arc(
          128 + (pip - (pipCount - 1) / 2) * pipSpacing,
          184,
          8,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = Math.min(8, s.renderer.capabilities.getMaxAnisotropy());
      map.userData.label = true;
      const token = new THREE.Group();
      token.position.set(x, 0, z);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.37, 0.075, 32),
        material("#b99b68", { roughness: 0.7 }),
      );
      base.position.y = 0.205;
      base.castShadow = true;
      base.receiveShadow = true;
      token.add(base);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.7),
        new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          alphaTest: 0.03,
          depthTest: true,
          depthWrite: true,
          side: THREE.DoubleSide,
          toneMapped: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      );
      face.position.y = 0.247;
      face.rotation.x = -Math.PI / 2;
      token.add(face);
      s.group.add(token);
      return token;
    };
    const robberMarker = (x: number, z: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.beginPath();
      ctx.arc(128, 128, 116, 0, Math.PI * 2);
      ctx.fillStyle = "#fff6d9";
      ctx.fill();
      ctx.lineWidth = 13;
      ctx.strokeStyle = "#f1c65a";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(128, 128, 88, 0, Math.PI * 2);
      ctx.fillStyle = "#d8edf1";
      ctx.fill();
      ctx.lineWidth = 9;
      ctx.strokeStyle = "#244958";
      ctx.stroke();
      ctx.save();
      ctx.translate(48, 47);
      ctx.scale(6.65, 6.65);
      ctx.strokeStyle = "#173b4b";
      ctx.lineWidth = 2.15;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const path of [
        "M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z",
        "M16.5 18c1-2 2.5-5 2.5-9a7 7 0 0 0-7-7H6.635a1 1 0 0 0-.768 1.64L7 5l-2.32 5.802a2 2 0 0 0 .95 2.526l2.87 1.456",
        "m15 5 1.425-1.425",
        "m17 8 1.53-1.53",
        "M9.713 12.185 7 18",
      ])
        ctx.stroke(new Path2D(path));
      ctx.restore();
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = Math.min(8, s.renderer.capabilities.getMaxAnisotropy());
      map.userData.label = true;
      const marker = new THREE.Group();
      marker.position.set(x, 0, z);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.215, 0.235, 0.09, 32),
        material("#d8b967", { roughness: 0.68 }),
      );
      base.position.y = 0.225;
      base.castShadow = true;
      base.receiveShadow = true;
      marker.add(base);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.43, 0.43),
        new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          alphaTest: 0.03,
          depthTest: true,
          depthWrite: true,
          side: THREE.DoubleSide,
          toneMapped: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      );
      face.position.y = 0.274;
      face.rotation.x = -Math.PI / 2;
      marker.add(face);
      s.group.add(marker);
      return marker;
    };
    const portColor = (resource: (typeof board.ports)[number]["resource"]) =>
      resource === "wood"
        ? "#3d9852"
        : resource === "brick"
          ? "#c96b51"
          : resource === "sheep"
            ? "#8bcf52"
            : resource === "wheat"
              ? "#e6b62d"
              : resource === "ore"
                ? "#77969a"
                : "#4aa8bd";
    const portBadgeTexture = (
      resource: (typeof board.ports)[number]["resource"],
      ratio: string,
    ) => {
      const textureKey = `port-badge-${resource}`;
      const cached = s.textures.get(textureKey);
      if (cached) return cached;
      const canvas = document.createElement("canvas");
      canvas.width = 384;
      canvas.height = 384;
      const ctx = canvas.getContext("2d")!;
      const paintBadge = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#fff8df";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = `${portColor(resource)}24`;
        ctx.fillRect(18, 18, 348, 242);
        ctx.fillStyle = "#dff1ed";
        ctx.fillRect(18, 270, 348, 96);
        ctx.strokeStyle = "#6b897f";
        ctx.lineWidth = 7;
        ctx.strokeRect(18, 270, 348, 96);
        ctx.fillStyle = "#243e47";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "900 74px Arial Black, Arial, sans-serif";
        ctx.fillText(ratio, 192, 320);
      };
      paintBadge();
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.userData.label = true;
      map.anisotropy = Math.min(8, s.renderer.capabilities.getMaxAnisotropy());
      s.textures.set(textureKey, map);

      const image = new Image();
      image.onload = () => {
        paintBadge();
        const spriteIndex =
          resource === "any"
            ? 5
            : ["wood", "brick", "sheep", "wheat", "ore"].indexOf(resource);
        const cellWidth = image.naturalWidth / 4;
        const cellHeight = image.naturalHeight / 4;
        ctx.drawImage(
          image,
          (spriteIndex % 4) * cellWidth,
          Math.floor(spriteIndex / 4) * cellHeight,
          cellWidth,
          cellHeight,
          82,
          27,
          220,
          220,
        );
        map.needsUpdate = true;
        s.dirty = true;
      };
      image.src = "/textures/game-sprites.png";
      return map;
    };
    const addPortModel = (
      edge: (typeof board.edges)[number],
      resource: (typeof board.ports)[number]["resource"],
    ) => {
      const a = board.vertices[edge.a];
      const b = board.vertices[edge.b];
      const transform = harborTransformForEdge(a, b);
      const {
        centerX,
        centerZ,
        rotationY,
      } = transform;
      const harbor = new THREE.Group();
      harbor.position.set(centerX, 0, centerZ);
      harbor.rotation.y = rotationY;
      s.group.add(harbor);
      const portAdd = (
        geometry: THREE.BufferGeometry,
        mat: THREE.Material | THREE.Material[],
        x: number,
        y: number,
        z: number,
      ) => {
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        harbor.add(mesh);
        return mesh;
      };
      const timber = "#936234";
      for (const x of [-0.34, 0.34]) {
        portAdd(
          new THREE.BoxGeometry(0.14, 0.09, 0.78),
          material(timber),
          x,
          0.18,
          0.4,
        );
        for (const z of [0.08, 0.7])
          portAdd(
            new THREE.CylinderGeometry(0.035, 0.045, 0.34, 8),
            material("#6f4829"),
            x,
            0.2,
            z,
          );
      }
      for (const z of [0.12, 0.32, 0.52, 0.72])
        portAdd(
          new THREE.BoxGeometry(0.78, 0.035, 0.08),
          material("#b88448"),
          0,
          0.235,
          z,
        );

      const hullShape = new THREE.Shape();
      hullShape.moveTo(-0.43, -0.17);
      hullShape.lineTo(0.31, -0.17);
      hullShape.lineTo(0.49, 0);
      hullShape.lineTo(0.31, 0.17);
      hullShape.lineTo(-0.43, 0.17);
      hullShape.lineTo(-0.5, 0);
      hullShape.closePath();
      const hullGeometry = new THREE.ExtrudeGeometry(hullShape, {
        depth: 0.15,
        bevelEnabled: true,
        bevelSegments: 1,
        bevelSize: 0.025,
        bevelThickness: 0.025,
      });
      hullGeometry.center();
      const hull = portAdd(
        hullGeometry,
        material("#704225", { roughness: 0.68 }),
        0,
        0.22,
        0.94,
      );
      hull.rotation.x = -Math.PI / 2;
      portAdd(
        new THREE.BoxGeometry(0.63, 0.055, 0.24),
        material("#d5a45c"),
        -0.02,
        0.31,
        0.94,
      );

      const badgePosition = harborLabelPosition(transform);
      const badgeFrame = add(
        new THREE.BoxGeometry(0.74, 0.065, 0.7),
        material("#75411f", { roughness: 0.72 }),
        badgePosition.x,
        0.29,
        badgePosition.z,
      );
      badgeFrame.rotation.y = 0;
      const badgeFace = add(
        new THREE.PlaneGeometry(0.65, 0.61),
        new THREE.MeshBasicMaterial({
          map: portBadgeTexture(
            resource,
            resource === "any" ? "3:1" : "2:1",
          ),
          toneMapped: false,
        }),
        badgePosition.x,
        0.326,
        badgePosition.z,
      );
      badgeFace.rotation.x = -Math.PI / 2;

      const accent = portColor(resource);
      if (resource === "wood") {
        portAdd(
          new THREE.CylinderGeometry(0.02, 0.03, 0.18, 6),
          material("#634529"),
          0.27,
          0.43,
          0.93,
        );
        portAdd(
          new THREE.ConeGeometry(0.12, 0.24, 7),
          material(accent),
          0.27,
          0.58,
          0.93,
        );
      } else if (resource === "brick") {
        for (const [x, y, z] of [
          [0.2, 0.38, 0.88],
          [0.34, 0.38, 0.88],
          [0.27, 0.49, 0.88],
        ])
          portAdd(
            new THREE.BoxGeometry(0.13, 0.09, 0.1),
            material(accent),
            x,
            y,
            z,
          );
      } else if (resource === "sheep") {
        portAdd(
          new THREE.SphereGeometry(0.12, 12, 8),
          material("#f7f3df"),
          0.26,
          0.45,
          0.91,
        );
        portAdd(
          new THREE.SphereGeometry(0.065, 10, 7),
          material("#35494c"),
          0.37,
          0.47,
          0.91,
        );
      } else if (resource === "wheat") {
        for (const x of [0.19, 0.27, 0.35]) {
          portAdd(
            new THREE.CylinderGeometry(0.012, 0.016, 0.26, 6),
            material("#9a741c"),
            x,
            0.45,
            0.9,
          );
          portAdd(
            new THREE.SphereGeometry(0.035, 8, 6),
            material(accent),
            x,
            0.59,
            0.9,
          );
        }
      } else if (resource === "ore") {
        for (const [x, scale] of [[0.2, 0.12], [0.34, 0.09]] as const)
          portAdd(
            new THREE.DodecahedronGeometry(scale, 0),
            material(accent, { flatShading: true }),
            x,
            0.42,
            0.9,
          );
      } else {
        for (const [index, cargoColor] of ["#4a9c58", "#cf7259", "#d9af2e"].entries())
          portAdd(
            new THREE.BoxGeometry(0.11, 0.11, 0.11),
            material(cargoColor),
            0.18 + index * 0.13,
            0.4,
            0.9,
          );
      }

      const description = document.createElement("span");
      const portName = resource === "any" ? "General" : TERRAIN[resource].label;
      description.className = "sr-only";
      description.setAttribute("role", "img");
      description.setAttribute(
        "aria-label",
        `${portName} harbor, trade ${resource === "any" ? "3:1" : "2:1"}`,
      );
      container.current!.appendChild(description);
      s.targets.push({
        element: description,
        point: new THREE.Vector3(
          badgePosition.x,
          0.34,
          badgePosition.z,
        ),
      });
    };
    const boardRadius = Math.max(
      ...board.vertices.map((vertex) => Math.hypot(vertex.x, vertex.y)),
    );
    const seaRadius = boardRadius + 1.45;
    const sea = add(
      new THREE.CylinderGeometry(
        seaRadius - 0.05,
        seaRadius,
        0.22,
        64,
      ),
      material("#347ab0", { metalness: 0.05, roughness: 0.72 }),
      0,
      -0.28,
      0,
    );
    sea.receiveShadow = true;
    for (const tile of board.tiles) {
      const map = terrainTexture(tile.terrain);
      add(
        new THREE.CylinderGeometry(0.99, 0.99, 0.27, 6),
        material("#bb9965"),
        tile.x,
        -0.01,
        tile.y,
      );
      const shape = new THREE.Shape();
      for (let k = 0; k < 6; k++) {
        const a = ((30 + k * 60) * Math.PI) / 180;
        const x = Math.cos(a) * 0.97,
          y = Math.sin(a) * 0.97;
        if (k === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, (uv.getX(i) + 1) / 2, (uv.getY(i) + 1) / 2);
      const top = add(
        geo,
        material("#ffffff", {
          map,
          bumpMap: map,
          bumpScale: 0.04,
          emissive: "#ffffff",
          emissiveMap: map,
          emissiveIntensity: 0.08,
          side: THREE.DoubleSide,
        }),
        tile.x,
        0.14,
        tile.y,
      );
      top.rotation.x = -Math.PI / 2;
      const animationAnchor = document.createElement("span");
      animationAnchor.className = "three-animation-anchor";
      animationAnchor.dataset.animationTile = String(tile.id);
      animationAnchor.setAttribute("aria-hidden", "true");
      container.current!.appendChild(animationAnchor);
      s.targets.push({
        element: animationAnchor,
        point: new THREE.Vector3(tile.x, 0.32, tile.y),
      });
      if (animation?.rolledTiles.includes(tile.id)) {
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: "#fff29b",
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const glow = add(
          new THREE.CylinderGeometry(1.015, 1.015, 0.035, 6),
          glowMaterial,
          tile.x,
          0.185,
          tile.y,
        );
        animate(1050, (progress) => {
          const wave = Math.sin(Math.PI * progress);
          glowMaterial.opacity = wave * 0.58;
          glow.scale.setScalar(0.94 + progress * 0.13);
          glow.position.y = 0.185 + wave * 0.08;
        });
      }
      // Small textured terrain features leave the token and all six build corners clear.
      if (tile.terrain === "wood") {
        for (const [dx, dz, h] of [
          [-0.5, -0.3, 0.36],
          [-0.2, -0.58, 0.44],
          [0.28, -0.5, 0.32],
          [0.55, 0.2, 0.38],
          [-0.45, 0.42, 0.3],
        ]) {
          add(
            new THREE.CylinderGeometry(0.025, 0.04, 0.2, 6),
            material("#6d5131"),
            tile.x + dx,
            0.22,
            tile.y + dz,
          );
          add(
            new THREE.ConeGeometry(0.17, h, 7),
            material("#77956a", { map }),
            tile.x + dx,
            0.3 + h / 2,
            tile.y + dz,
          );
        }
      } else if (tile.terrain === "ore") {
        for (const [dx, dz, h] of [
          [-0.4, -0.37, 0.5],
          [0.05, -0.52, 0.66],
          [0.45, -0.27, 0.36],
        ]) {
          const rock = add(
            new THREE.ConeGeometry(0.28, h, 5),
            material("#bbc3c3", { map, flatShading: true }),
            tile.x + dx,
            0.14 + h / 2,
            tile.y + dz,
          );
          rock.rotation.y = tile.id * 0.8 + dx;
        }
      }
      if (kind === "tile" && highlights.includes(tile.id)) {
        top.userData.pick = tile.id;
        const selected = props.selected === tile.id;
        const shadow = add(
          new THREE.RingGeometry(
            selected ? 0.38 : 0.4,
            selected ? 0.59 : 0.56,
            48,
          ),
          new THREE.MeshBasicMaterial({
            color: "#173744",
            transparent: true,
            opacity: 0.48,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
          tile.x,
          0.253,
          tile.y + 0.035,
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.renderOrder = 18;
        const marker = add(
          new THREE.RingGeometry(
            selected ? 0.37 : 0.39,
            selected ? 0.54 : 0.51,
            48,
          ),
          new THREE.MeshBasicMaterial({
            color: selected ? "#fff39a" : "#ddeb75",
            transparent: true,
            opacity: selected ? 1 : 0.94,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
          }),
          tile.x,
          0.27,
          tile.y,
        );
        marker.rotation.x = -Math.PI / 2;
        marker.renderOrder = 20;
        marker.userData.pick = tile.id;
        const markerRim = add(
          new THREE.RingGeometry(
            selected ? 0.53 : 0.5,
            selected ? 0.59 : 0.56,
            48,
          ),
          new THREE.MeshBasicMaterial({
            color: "#ffffff",
            transparent: true,
            opacity: selected ? 1 : 0.9,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
          }),
          tile.x,
          0.272,
          tile.y,
        );
        markerRim.rotation.x = -Math.PI / 2;
        markerRim.renderOrder = 21;
        markerRim.userData.pick = tile.id;
      }
      if (tile.number) numberToken(tile.number, tile.x, tile.y);
      if (tile.id === robber) {
        const marker = robberMarker(tile.x + 0.43, tile.y + 0.22);
        if (animation?.robber?.to === tile.id) {
          const from = board.tiles[animation.robber.from];
          const destination = marker.position.clone();
          marker.position.set(from.x + 0.43, destination.y, from.y + 0.22);
          animate(760, (progress) => {
            const moved = easeOut(progress);
            const lift = Math.sin(Math.PI * progress) * 0.7;
            marker.position.x = THREE.MathUtils.lerp(
              from.x + 0.43,
              destination.x,
              moved,
            );
            marker.position.z = THREE.MathUtils.lerp(
              from.y + 0.22,
              destination.z,
              moved,
            );
            marker.position.y = destination.y + lift;
          });
        }
      }
    }
    for (const port of board.ports)
      addPortModel(board.edges[port.edge], port.resource);
    for (const e of board.edges) {
      const enabled = kind === "edge" && highlights.includes(e.id);
      const contextual = !!props.buildOptions?.road.includes(e.id);
      if (!e.owner && !enabled && !contextual) continue;
      const a = board.vertices[e.a],
        b = board.vertices[e.b];
      const rotation = Math.atan2(b.x - a.x, b.y - a.y);
      const arrival = animation?.placements.find(
        (placement) => placement.kind === "road" && placement.id === e.id,
      );
      if (e.owner || enabled) {
        const road = add(
          new THREE.BoxGeometry(0.13, 0.14, 0.73),
          material(e.owner ? color(e.owner) : "#ffe2a2", {
            emissive: enabled ? "#94712d" : "#000000",
            emissiveIntensity: 0.8,
          }),
          (a.x + b.x) / 2,
          0.26,
          (a.y + b.y) / 2,
        );
        road.rotation.y = rotation;
        if (arrival && e.owner) {
          const destinationY = road.position.y;
          animate(580, (progress) => {
            const placed = spring(progress);
            road.scale.set(placed, placed, Math.max(0.03, placed));
            road.position.y = destinationY + (1 - easeOut(progress)) * 0.42;
          });
        }
        if (enabled) road.userData.pick = e.id;
      }
      if (!e.owner && (enabled || contextual)) {
        const hit = add(
          new THREE.BoxGeometry(0.4, 0.2, 1),
          new THREE.MeshBasicMaterial({ visible: false }),
          (a.x + b.x) / 2,
          0.3,
          (a.y + b.y) / 2,
        );
        hit.rotation.y = rotation;
        if (enabled) hit.userData.pick = e.id;
        if (contextual) {
          hit.userData.buildHint = "road" satisfies BuildPiece;
          hit.userData.buildId = e.id;
        }
      }
    }
    for (const v of board.vertices) {
      const enabled = kind === "vertex" && highlights.includes(v.id);
      const contextualType: BuildPiece | undefined = props.buildOptions?.city.includes(
        v.id,
      )
        ? "city"
        : props.buildOptions?.settlement.includes(v.id)
          ? "settlement"
          : undefined;
      const arrival = animation?.placements.find(
        (placement) =>
          placement.id === v.id &&
          (placement.kind === "settlement" || placement.kind === "city"),
      );
      if (v.owner) {
        const building = [add(
          new THREE.BoxGeometry(v.city ? 0.32 : 0.23, 0.23, 0.23),
          material(color(v.owner)),
          v.x,
          0.33,
          v.y,
        )];
        const roof = add(
          new THREE.CylinderGeometry(0, 0.22, 0.2, 4),
          material(color(v.owner)),
          v.x,
          0.54,
          v.y,
        );
        building.push(roof);
        roof.rotation.y = Math.PI / 4;
        if (v.city)
          building.push(add(
            new THREE.BoxGeometry(0.16, 0.4, 0.18),
            material(color(v.owner)),
            v.x + 0.2,
            0.42,
            v.y,
          ));
        if (arrival) {
          const destinations = building.map((piece) => piece.position.y);
          animate(620, (progress) => {
            const placed = spring(progress);
            building.forEach((piece, index) => {
              piece.scale.setScalar(Math.max(0.03, placed));
              piece.position.y =
                destinations[index] + (1 - easeOut(progress)) * 0.5;
            });
          });
        }
      }
      if (enabled) {
        const pick = add(
          new THREE.CylinderGeometry(0.24, 0.24, 0.08, 24),
          material("#ffe2a2", {
            emissive: "#c2943b",
            emissiveIntensity: 1,
            transparent: true,
            opacity: 0.85,
          }),
          v.x,
          0.23,
          v.y,
        );
        pick.userData.pick = v.id;
      }
      if (contextualType) {
        const hit = add(
          new THREE.CylinderGeometry(0.31, 0.31, 0.22, 24),
          new THREE.MeshBasicMaterial({ visible: false }),
          v.x,
          0.32,
          v.y,
        );
        hit.userData.buildHint = contextualType;
        hit.userData.buildId = v.id;
        if (enabled) hit.userData.pick = v.id;
      }
    }
    for (const id of highlights) {
      let x = 0,
        z = 0;
      if (kind === "vertex") {
        const v = board.vertices[id];
        x = v.x;
        z = v.y;
      } else if (kind === "edge") {
        const e = board.edges[id];
        x = (board.vertices[e.a].x + board.vertices[e.b].x) / 2;
        z = (board.vertices[e.a].y + board.vertices[e.b].y) / 2;
      } else if (kind === "tile") {
        x = board.tiles[id].x;
        z = board.tiles[id].y;
      } else continue;
      const element = document.createElement("button");
      element.className = `three-pick-target ${kind}-target${props.selected === id ? " selected" : ""}`;
      element.setAttribute(
        "aria-label",
        `${kind === "vertex" ? "Build at corner" : kind === "edge" ? "Build road" : "Move robber to hex"} ${id}`,
      );
      element.title = element.getAttribute("aria-label")!;
      element.onclick = () => live.current.onPick(id);
      container.current!.appendChild(element);
      s.targets.push({ element, point: new THREE.Vector3(x, 0.3, z) });
    }
    s.dirty = true;
  }, [props]);
  return (
    <div
      className="three-board"
      ref={container}
      aria-label="Three.js 3D island board"
    >
      {failed && (
        <div className="board-loading">
          3D is unavailable on this browser.
          <button onClick={() => props.onMode("2d")}>Use 2D view</button>
        </div>
      )}
    </div>
  );
}

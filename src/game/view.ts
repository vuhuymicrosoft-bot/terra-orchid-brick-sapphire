import * as THREE from "three";
import { B, itemColor } from "./defs";
import type { Game } from "./engine";
import { buildChunk } from "./mesh";
import { chunkKey, chunkOf } from "./world";

const RADIUS = 3;
const EYE = 1.52;

export class WorldView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  labelRoot: HTMLElement | null = null;
  private readonly chunks = new Map<string, { solid: THREE.Mesh | null; water: THREE.Mesh | null }>();
  private readonly solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly waterMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  private readonly highlight: THREE.LineSegments;
  private readonly hand: THREE.Mesh;
  private readonly handMat: THREE.MeshLambertMaterial;
  private readonly mobMesh: THREE.InstancedMesh;
  private readonly dropMesh: THREE.InstancedMesh;
  private readonly dropColor = new THREE.Color();
  private readonly points: THREE.Points;
  private readonly pointPos: Float32Array;
  private readonly pointCol: Float32Array;
  private readonly lights: THREE.PointLight[] = [];
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly sunBall: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly avatars: THREE.Group[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly sky = new THREE.Color("#8ec8ea");
  private readonly night = new THREE.Color("#0c1424");
  private readonly day = new THREE.Color("#8ec8ea");
  private readonly dawn = new THREE.Color("#f0b07a");
  private readonly dusk = new THREE.Color("#e08a55");
  private lightScan = 0;
  private readonly torchPos: THREE.Vector3[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(this.day, 1);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 160);
    this.camera.rotation.order = "YXZ";
    this.scene.fog = new THREE.Fog(this.day, 22, 62);
    this.hemi = new THREE.HemisphereLight("#d7ecff", "#3d4a34", 0.85);
    this.sun = new THREE.DirectionalLight("#fff4e0", 1.15);
    this.sun.position.set(30, 48, 16);
    this.scene.add(this.hemi, this.sun);
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight("#ffb15e", 0, 16, 2);
      this.scene.add(l);
      this.lights.push(l);
    }
    this.sunBall = new THREE.Mesh(
      new THREE.SphereGeometry(4, 12, 8),
      new THREE.MeshBasicMaterial({ color: "#ffe1a8" }),
    );
    this.scene.add(this.sunBall);
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      const u = Math.random();
      const v = Math.random();
      const th = Math.PI * 2 * u;
      const ph = Math.acos(2 * v - 1);
      const r = 90;
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.65 + 10;
      starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: "#fff", size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0 }),
    );
    this.scene.add(this.stars);
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01));
    this.highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: "#fffaf2" }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);
    this.handMat = new THREE.MeshLambertMaterial({ color: "#c49658" });
    this.hand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.42), this.handMat);
    this.hand.position.set(0.34, -0.32, -0.58);
    this.camera.add(this.hand);
    this.scene.add(this.camera);
    this.mobMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.38, 10, 8),
      new THREE.MeshLambertMaterial({ color: "#6fbf48" }),
      8,
    );
    this.mobMesh.count = 0;
    this.scene.add(this.mobMesh);
    this.dropMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.22),
      new THREE.MeshLambertMaterial({ color: "#fff" }),
      48,
    );
    this.dropMesh.count = 0;
    this.scene.add(this.dropMesh);
    this.pointPos = new Float32Array(160 * 3);
    this.pointCol = new Float32Array(160 * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(this.pointPos, 3));
    pg.setAttribute("color", new THREE.BufferAttribute(this.pointCol, 3));
    this.points = new THREE.Points(
      pg,
      new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.9 }),
    );
    this.scene.add(this.points);
    const palette = [0xe07a45, 0x3e9a62, 0x5ee0d0, 0xd4b483, 0x8eb4d6, 0xc45b6e, 0xe8d7a0, 0x7d8a9a];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      const color = palette[i] ?? 0xe07a45;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.7, 0.3), new THREE.MeshLambertMaterial({ color }));
      body.position.y = 0.86;
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.34, 0.34),
        new THREE.MeshLambertMaterial({ color: 0xf3efe4 }),
      );
      head.position.y = 1.48;
      g.add(body, head);
      g.visible = false;
      this.scene.add(g);
      this.avatars.push(g);
    }
  }

  resize() {
    const c = this.renderer.domElement;
    const w = Math.max(1, c.clientWidth);
    const h = Math.max(1, c.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private rebuild(key: string, cx: number, cz: number, world: Game["world"]) {
    const prev = this.chunks.get(key);
    prev?.solid?.geometry.dispose();
    prev?.water?.geometry.dispose();
    if (prev?.solid) this.scene.remove(prev.solid);
    if (prev?.water) this.scene.remove(prev.water);
    const built = buildChunk(world, cx, cz);
    const entry: { solid: THREE.Mesh | null; water: THREE.Mesh | null } = { solid: null, water: null };
    if (built.solid) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(built.solid.pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(built.solid.nor, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(built.solid.col, 3));
      entry.solid = new THREE.Mesh(geo, this.solidMat);
      this.scene.add(entry.solid);
    }
    if (built.water) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(built.water.pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(built.water.nor, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(built.water.col, 3));
      entry.water = new THREE.Mesh(geo, this.waterMat);
      this.scene.add(entry.water);
    }
    this.chunks.set(key, entry);
  }

  private stream(game: Game) {
    const pcx = chunkOf(Math.floor(game.x));
    const pcz = chunkOf(Math.floor(game.z));
    let best: { key: string; cx: number; cz: number; d: number } | null = null;
    for (let cx = pcx - RADIUS; cx <= pcx + RADIUS; cx++) {
      for (let cz = pcz - RADIUS; cz <= pcz + RADIUS; cz++) {
        const key = chunkKey(cx, cz);
        const has = this.chunks.has(key);
        const dirty = game.world.dirty.has(key);
        if (has && !dirty) continue;
        const d = (cx - pcx) ** 2 + (cz - pcz) ** 2;
        if (!best || d < best.d) best = { key, cx, cz, d };
      }
    }
    if (best) {
      this.rebuild(best.key, best.cx, best.cz, game.world);
      game.world.dirty.delete(best.key);
    }
    for (const key of this.chunks.keys()) {
      const [cx, cz] = key.split(",").map(Number);
      if (Math.abs(cx! - pcx) > RADIUS + 1 || Math.abs(cz! - pcz) > RADIUS + 1) {
        const entry = this.chunks.get(key);
        entry?.solid?.geometry.dispose();
        entry?.water?.geometry.dispose();
        if (entry?.solid) this.scene.remove(entry.solid);
        if (entry?.water) this.scene.remove(entry.water);
        this.chunks.delete(key);
      }
    }
  }

  get meshed() {
    return this.chunks.size > 0;
  }

  sync(game: Game, dt: number) {
    this.stream(game);
    const bob =
      game.onGround && Math.hypot(game.vx, game.vz) > 1.2 ? Math.sin(performance.now() / 140) * 0.035 : 0;
    this.camera.position.set(game.x, game.y + EYE + bob, game.z);
    if (game.invuln > 0.45) {
      this.camera.position.x += (Math.random() - 0.5) * 0.05;
      this.camera.position.y += (Math.random() - 0.5) * 0.04;
    }
    this.camera.rotation.y = game.yaw;
    this.camera.rotation.x = game.pitch;
    const swing = game.swing > 0 ? Math.sin((0.4 - game.swing) * 16) * 0.45 : 0;
    this.hand.rotation.x = -0.55 + swing;
    this.hand.position.z = -0.58 - Math.max(0, swing) * 0.08;
    const held = game.slots[game.selected];
    this.handMat.color.set(held ? itemColor(held.id) : "#e7c2a4");
    this.hand.visible = game.mode === "play";

    if (game.aim && game.mode === "play") {
      this.highlight.visible = true;
      this.highlight.position.set(game.aim.x + 0.5, game.aim.y + 0.5, game.aim.z + 0.5);
      const mat = this.highlight.material as THREE.LineBasicMaterial;
      mat.color.set(game.mine.on ? "#e8943a" : "#fffaf2");
    } else this.highlight.visible = false;

    this.paintSky(game);
    this.paintMobs(game);
    this.paintDrops(game);
    this.paintParticles(game);
    this.paintAvatars(game);
    this.paintLights(game, dt);
    this.renderer.render(this.scene, this.camera);
  }

  private paintSky(game: Game) {
    const u = game.phase();
    const underwater = game.eyeInWater();
    if (underwater) this.sky.set("#1c6ea3");
    else if (u < 0.08) this.sky.copy(this.night).lerp(this.dawn, u / 0.08);
    else if (u < 0.18) this.sky.copy(this.dawn).lerp(this.day, (u - 0.08) / 0.1);
    else if (u < 0.48) this.sky.copy(this.day);
    else if (u < 0.62) this.sky.copy(this.day).lerp(this.dusk, (u - 0.48) / 0.14);
    else if (u < 0.75) this.sky.copy(this.dusk).lerp(this.night, (u - 0.62) / 0.13);
    else if (u < 0.92) this.sky.copy(this.night);
    else this.sky.copy(this.night).lerp(this.dawn, (u - 0.92) / 0.08);
    this.renderer.setClearColor(this.sky, 1);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.sky);
    fog.near = underwater ? 0.4 : 18;
    fog.far = underwater ? 16 : 58;
    const dayF = underwater ? 0.45 : game.dayFactor();
    this.hemi.intensity = 0.25 + dayF * 0.6;
    this.hemi.color.copy(this.sky);
    this.sun.intensity = 0.08 + dayF * 1.15;
    this.sun.color.set(dayF > 0.5 ? "#fff2d4" : "#9bb4d6");
    const ang = u * Math.PI * 2;
    this.sun.position.set(Math.cos(ang) * 40, Math.sin(ang) * 36 + 8, 18);
    this.sunBall.position.copy(this.camera.position).addScaledVector(this.sun.position.clone().normalize(), 80);
    (this.stars.material as THREE.PointsMaterial).opacity = underwater ? 0 : Math.max(0, 1 - dayF * 1.3);
    this.stars.position.copy(this.camera.position);
  }

  private paintMobs(game: Game) {
    const n = Math.min(8, game.mobs.length);
    this.mobMesh.count = n;
    for (let i = 0; i < n; i++) {
      const m = game.mobs[i]!;
      const squash = 1 + Math.sin(performance.now() / 160 + m.id) * 0.06;
      this.dummy.position.set(m.x, m.y + 0.38 * squash, m.z);
      this.dummy.scale.set(1, squash, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mobMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.dummy.scale.set(1, 1, 1);
    this.mobMesh.instanceMatrix.needsUpdate = true;
  }

  private paintDrops(game: Game) {
    const n = Math.min(48, game.drops.length);
    this.dropMesh.count = n;
    for (let i = 0; i < n; i++) {
      const d = game.drops[i]!;
      this.dummy.position.set(d.x, d.y + 0.12, d.z);
      this.dummy.rotation.set(0, d.age, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.dropMesh.setMatrixAt(i, this.dummy.matrix);
      this.dropColor.set(itemColor(d.id));
      this.dropMesh.setColorAt(i, this.dropColor);
    }
    this.dropMesh.instanceMatrix.needsUpdate = true;
    if (this.dropMesh.instanceColor) this.dropMesh.instanceColor.needsUpdate = true;
  }

  private paintParticles(game: Game) {
    const n = Math.min(160, game.particles.length);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const p = game.particles[i]!;
      this.pointPos[i * 3] = p.x;
      this.pointPos[i * 3 + 1] = p.y;
      this.pointPos[i * 3 + 2] = p.z;
      c.set(p.color);
      this.pointCol[i * 3] = c.r;
      this.pointCol[i * 3 + 1] = c.g;
      this.pointCol[i * 3 + 2] = c.b;
    }
    const pos = this.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = this.points.geometry.getAttribute("color") as THREE.BufferAttribute;
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.points.geometry.setDrawRange(0, n);
  }

  private paintAvatars(game: Game) {
    const list = [...game.remotes.values()];
    for (let i = 0; i < this.avatars.length; i++) {
      const g = this.avatars[i]!;
      const r = list[i];
      if (!r) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      g.position.set(r.x, r.y, r.z);
      g.rotation.y = r.yaw + Math.PI;
    }
    this.paintLabels(game, list);
  }

  private paintLabels(game: Game, list: { name: string; x: number; y: number; z: number }[]) {
    const root = this.labelRoot;
    if (!root) return;
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    while (root.children.length < list.length) {
      const el = document.createElement("div");
      el.className = "name-tag";
      root.appendChild(el);
    }
    for (let i = 0; i < root.children.length; i++) {
      const el = root.children[i] as HTMLElement;
      const r = list[i];
      if (!r) {
        el.style.display = "none";
        continue;
      }
      const v = new THREE.Vector3(r.x, r.y + 2.05, r.z).project(this.camera);
      if (v.z > 1) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "block";
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
      el.textContent = r.name || "Bạn";
    }
    void game;
  }

  private paintLights(game: Game, dt: number) {
    this.lightScan -= dt;
    if (this.lightScan <= 0) {
      this.lightScan = 0.35;
      this.torchPos.length = 0;
      const px = game.x;
      const py = game.y;
      const pz = game.z;
      const found: { d: number; x: number; y: number; z: number }[] = [];
      for (const [k, id] of game.world.mods) {
        if (id !== B.torch && id !== B.lamp && id !== B.heart) continue;
        const [xs, ys, zs] = k.split(",");
        const x = Number(xs);
        const y = Number(ys);
        const z = Number(zs);
        const d = (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2 + (z + 0.5 - pz) ** 2;
        if (d < 26 * 26) found.push({ d, x, y, z });
      }
      found.sort((a, b) => a.d - b.d);
      for (const f of found.slice(0, this.lights.length)) this.torchPos.push(new THREE.Vector3(f.x + 0.5, f.y + 0.6, f.z + 0.5));
    }
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i]!;
      const p = this.torchPos[i];
      if (!p) {
        l.intensity = 0;
        continue;
      }
      l.position.copy(p);
      l.intensity = 2.1;
    }
  }

  dispose() {
    for (const entry of this.chunks.values()) {
      entry.solid?.geometry.dispose();
      entry.water?.geometry.dispose();
    }
    this.chunks.clear();
    this.solidMat.dispose();
    this.waterMat.dispose();
    this.handMat.dispose();
    this.renderer.dispose();
  }
}

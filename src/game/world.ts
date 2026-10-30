import { B, Biome, CS, H, SEA, blockDef } from "./defs";

export interface Tree {
  kind: "none" | "oak" | "spruce" | "cactus";
  h: number;
  surf: number;
}

export function hash3(x: number, y: number, z: number, s: number): number {
  let n =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(z | 0, 1274126177) ^
    Math.imul(s | 0, 2146121005);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function vnoise2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const v00 = hash3(x0, 0, z0, seed);
  const v10 = hash3(x0 + 1, 0, z0, seed);
  const v01 = hash3(x0, 0, z0 + 1, seed);
  const v11 = hash3(x0 + 1, 0, z0 + 1, seed);
  const a = v00 * (1 - sx) + v10 * sx;
  const b = v01 * (1 - sx) + v11 * sx;
  return a * (1 - sz) + b * sz;
}

function fbm2(x: number, z: number, seed: number): number {
  return (
    vnoise2(x, z, seed) * 0.55 +
    vnoise2(x * 2.03, z * 2.03, seed + 101) * 0.3 +
    vnoise2(x * 4.01, z * 4.01, seed + 251) * 0.15
  );
}

function noise3(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const ty = y - y0;
  const tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const sz = tz * tz * (3 - 2 * tz);
  const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;
  const v = (ix: number, iy: number, iz: number) => hash3(x0 + ix, y0 + iy, z0 + iz, seed);
  const x00 = lerp(v(0, 0, 0), v(1, 0, 0), sx);
  const x10 = lerp(v(0, 1, 0), v(1, 1, 0), sx);
  const x01 = lerp(v(0, 0, 1), v(1, 0, 1), sx);
  const x11 = lerp(v(0, 1, 1), v(1, 1, 1), sx);
  return lerp(lerp(x00, x10, sy), lerp(x01, x11, sy), sz);
}

export function surfaceY(x: number, z: number, seed: number): number {
  const n = fbm2(x * 0.028, z * 0.028, seed);
  const broad = fbm2(x * 0.007, z * 0.007, seed + 9);
  let h = 24 + Math.floor((n - 0.5) * 12 + (broad - 0.5) * 8);
  if (h < 16) h = 16;
  if (h > 34) h = 34;
  return h;
}

export function biomeAt(x: number, z: number, seed: number): Biome {
  const t = fbm2(x * 0.0045, z * 0.0045, seed + 77);
  if (t > 0.62) return "desert";
  if (t < 0.36) return "snow";
  return "meadow";
}

export function makeTree(x: number, z: number, seed: number): Tree {
  const surf = surfaceY(x, z, seed);
  const biome = biomeAt(x, z, seed);
  const none: Tree = { kind: "none", h: 0, surf };
  if (surf <= SEA + 1) return none;
  const r = hash3(x, 11, z, seed);
  let local = true;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (dx === 0 && dz === 0) continue;
      if (hash3(x + dx, 11, z + dz, seed) < r) local = false;
    }
  }
  if (!local) return none;
  if (biome === "desert") {
    if (r < 0.22) return { kind: "cactus", h: 2 + ((hash3(x, 12, z, seed) * 2) | 0), surf };
    return none;
  }
  if (biome === "snow") {
    if (r < 0.28) return { kind: "spruce", h: 5 + ((hash3(x, 12, z, seed) * 3) | 0), surf };
    return none;
  }
  if (r < 0.32) return { kind: "oak", h: 4 + ((hash3(x, 12, z, seed) * 2) | 0), surf };
  return none;
}

function oreAt(x: number, y: number, z: number, seed: number): number {
  const r = hash3(x >> 1, y >> 1, z >> 1, seed + 400);
  const j = hash3(x, y, z, seed + 401);
  if (j > 0.7) return 0;
  if (y > 4 && y < 12 && r < 0.05) return B.crystal;
  if (y < 18 && r < 0.065) return B.iron;
  if (y < 26 && r < 0.08) return B.copper;
  if (y < 36 && r < 0.1) return B.coalOre;
  return 0;
}

export function chunkOf(v: number): number {
  return Math.floor(v / CS);
}

export function chunkKey(cx: number, cz: number): string {
  return cx + "," + cz;
}

function cellIndex(lx: number, y: number, lz: number): number {
  return (lx + lz * CS) * H + y;
}

interface Veg {
  tx: number;
  tz: number;
  kind: Tree["kind"];
  h: number;
  surf: number;
}

function vegetation(x: number, y: number, z: number, surf: number, biome: Biome, seed: number, trees: Veg[]): number {
  for (const t of trees) {
    const dx = x - t.tx;
    const dz = z - t.tz;
    const adx = Math.abs(dx);
    const adz = Math.abs(dz);
    if (adx > 3 || adz > 3) continue;
    if (t.kind === "cactus") {
      if (dx === 0 && dz === 0 && y > t.surf && y <= t.surf + t.h) return B.cactus;
      continue;
    }
    const top = t.surf + t.h;
    if (dx === 0 && dz === 0 && y > t.surf && y <= top) return t.kind === "spruce" ? B.slog : B.log;
    if (t.kind === "oak") {
      if (adx <= 2 && adz <= 2 && y >= top - 2 && y <= top + 1) {
        if (adx === 2 && adz === 2 && (y === top + 1 || y === top - 2)) continue;
        if ((adx === 2 || adz === 2) && hash3(x, y, z, seed + 3) < 0.28) continue;
        return B.leaves;
      }
    } else if (y > t.surf + 1 && y <= top + 1) {
      const rad = Math.min(2, Math.floor((top + 1 - y) / 2));
      if (dx === 0 && dz === 0 && y === top + 1) return B.sleaves;
      if ((dx !== 0 || dz !== 0) && adx <= rad && adz <= rad) return B.sleaves;
    }
  }
  if (y === surf + 1 && surf > SEA) {
    let trunk = false;
    for (const t of trees) if (t.tx === x && t.tz === z && t.kind !== "none") trunk = true;
    if (!trunk) {
      const r = hash3(x, 50, z, seed);
      if (biome === "meadow" && r < 0.16) return B.tallgrass;
      if (biome === "meadow" && r < 0.21) return B.flower;
      if (biome === "desert" && r < 0.07) return B.bush;
      if (biome === "snow" && r < 0.09) return B.bush;
    }
  }
  if (y <= SEA && surf < SEA) return B.water;
  return B.air;
}

function ground(x: number, y: number, z: number, surf: number, biome: Biome, seed: number): number {
  const depth = surf - y;
  if (depth > 4 && y > 3) {
    const c = noise3(x * 0.09, y * 0.11, z * 0.09, seed + 7);
    if (c > 0.74) return B.air;
  }
  if (depth > 5) {
    const ore = oreAt(x, y, z, seed);
    if (ore) return ore;
    if (biome === "desert" && depth < 8) return hash3(x, y, z, seed) < 0.45 ? B.sandstone : B.stone;
    if (depth > 7 && depth < 12 && hash3(x, y, z, seed + 4) < 0.05) return B.gravel;
    if (y < 14 && hash3(x, y, z, seed + 5) < 0.045) return B.clay;
    return B.stone;
  }
  if (y === surf) {
    if (surf <= SEA + 1) return B.sand;
    if (biome === "desert") return B.sand;
    if (biome === "snow") return B.snow;
    return B.grass;
  }
  if (biome === "desert") return depth < 3 ? B.sand : B.sandstone;
  if (biome === "snow" && depth === 1 && hash3(x, y, z, seed) < 0.16) return B.ice;
  return B.dirt;
}

export function naturalAt(x: number, y: number, z: number, seed: number): number {
  if (y < 0 || y >= H) return y < 0 ? B.bedrock : B.air;
  if (y <= 1) return B.bedrock;
  const surf = surfaceY(x, z, seed);
  const biome = biomeAt(x, z, seed);
  if (y > surf) {
    const trees: Veg[] = [];
    for (let tx = x - 3; tx <= x + 3; tx++) {
      for (let tz = z - 3; tz <= z + 3; tz++) {
        const t = makeTree(tx, tz, seed);
        if (t.kind !== "none") trees.push({ tx, tz, kind: t.kind, h: t.h, surf: t.surf });
      }
    }
    return vegetation(x, y, z, surf, biome, seed, trees);
  }
  return ground(x, y, z, surf, biome, seed);
}

export class World {
  readonly seed: number;
  readonly mods = new Map<string, number>();
  readonly columns = new Map<string, Uint8Array>();
  readonly dirty = new Set<string>();

  constructor(seed: number, mods?: Iterable<[number, number, number, number]>) {
    this.seed = seed >>> 0 || 1;
    if (mods) {
      for (const [x, y, z, id] of mods) this.mods.set(x + "," + y + "," + z, id);
    }
  }

  get(x: number, y: number, z: number): number {
    if (y < 0 || y >= H) return y < 0 ? B.bedrock : B.air;
    const cx = chunkOf(x);
    const cz = chunkOf(z);
    const key = chunkKey(cx, cz);
    let col = this.columns.get(key);
    if (!col) col = this.generate(cx, cz);
    const lx = x - cx * CS;
    const lz = z - cz * CS;
    return col[cellIndex(lx, y, lz)] ?? B.air;
  }

  solid(x: number, y: number, z: number): boolean {
    return !!blockDef(this.get(x, y, z))?.solid;
  }

  set(x: number, y: number, z: number, id: number) {
    if (y < 0 || y >= H) return;
    const base = naturalAt(x, y, z, this.seed);
    const key = x + "," + y + "," + z;
    if (id === base) this.mods.delete(key);
    else this.mods.set(key, id);
    const cx = chunkOf(x);
    const cz = chunkOf(z);
    const col = this.columns.get(chunkKey(cx, cz));
    if (col) {
      const lx = x - cx * CS;
      const lz = z - cz * CS;
      col[cellIndex(lx, y, lz)] = id;
    }
    this.mark(cx, cz);
    const lx = x - cx * CS;
    const lz = z - cz * CS;
    if (lx === 0) this.mark(cx - 1, cz);
    if (lx === CS - 1) this.mark(cx + 1, cz);
    if (lz === 0) this.mark(cx, cz - 1);
    if (lz === CS - 1) this.mark(cx, cz + 1);
  }

  private mark(cx: number, cz: number) {
    this.dirty.add(chunkKey(cx, cz));
  }

  generate(cx: number, cz: number): Uint8Array {
    const data = new Uint8Array(CS * CS * H);
    const x0 = cx * CS;
    const z0 = cz * CS;
    const trees: Veg[] = [];
    for (let tx = x0 - 3; tx < x0 + CS + 3; tx++) {
      for (let tz = z0 - 3; tz < z0 + CS + 3; tz++) {
        const t = makeTree(tx, tz, this.seed);
        if (t.kind !== "none") trees.push({ tx, tz, kind: t.kind, h: t.h, surf: t.surf });
      }
    }
    for (let lx = 0; lx < CS; lx++) {
      for (let lz = 0; lz < CS; lz++) {
        const x = x0 + lx;
        const z = z0 + lz;
        const surf = surfaceY(x, z, this.seed);
        const biome = biomeAt(x, z, this.seed);
        for (let y = 0; y < H; y++) {
          const mod = this.mods.get(x + "," + y + "," + z);
          let id: number;
          if (mod !== undefined) id = mod;
          else if (y <= 1) id = B.bedrock;
          else if (y > surf) id = vegetation(x, y, z, surf, biome, this.seed, trees);
          else id = ground(x, y, z, surf, biome, this.seed);
          data[cellIndex(lx, y, lz)] = id;
        }
      }
    }
    const key = chunkKey(cx, cz);
    this.columns.set(key, data);
    this.dirty.add(key);
    return data;
  }

  evict(px: number, pz: number) {
    if (this.columns.size < 70) return;
    const pcx = chunkOf(Math.floor(px));
    const pcz = chunkOf(Math.floor(pz));
    for (const k of this.columns.keys()) {
      const [cx, cz] = k.split(",").map(Number);
      if (Math.abs(cx! - pcx) > 5 || Math.abs(cz! - pcz) > 5) this.columns.delete(k);
    }
  }

  exportMods(): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    for (const [k, id] of this.mods) {
      const [xs, ys, zs] = k.split(",");
      out.push([Number(xs), Number(ys), Number(zs), id]);
    }
    return out;
  }
}

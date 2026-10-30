import { B, CS, H, blockDef } from "./defs";
import { World } from "./world";

export interface MeshArrays {
  pos: Float32Array;
  nor: Float32Array;
  col: Float32Array;
}

const FACES: ReadonlyArray<{ n: readonly [number, number, number]; v: readonly (readonly [number, number, number])[] }> = [
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const SHADE = [0.62, 0.62, 1, 0.42, 0.78, 0.68];

function occludes(nid: number, self: number): boolean {
  if (nid === self && (self === B.leaves || self === B.sleaves || self === B.water || self === B.glass || self === B.ice)) {
    return true;
  }
  return !!blockDef(nid)?.opaque;
}

function pushFace(
  pos: number[],
  nor: number[],
  col: number[],
  x: number,
  y: number,
  z: number,
  face: (typeof FACES)[number],
  sx0: number,
  sy0: number,
  sz0: number,
  sx1: number,
  sy1: number,
  sz1: number,
  r: number,
  g: number,
  b: number,
) {
  const quad = face.v.map(([vx, vy, vz]) => {
    const px = x + sx0 + (sx1 - sx0) * vx;
    const py = y + sy0 + (sy1 - sy0) * vy;
    const pz = z + sz0 + (sz1 - sz0) * vz;
    return [px, py, pz] as const;
  });
  const [a, c, d, e] = quad;
  const tri = [a, c, d, a, d, e];
  const nx = face.n[0];
  const ny = face.n[1];
  const nz = face.n[2];
  for (const p of tri) {
    if (!p) continue;
    pos.push(p[0], p[1], p[2]);
    nor.push(nx, ny, nz);
    col.push(r, g, b);
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function tint(hex: string, shade: number, jitter: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const k = shade * jitter;
  return [Math.min(1, r * k), Math.min(1, g * k), Math.min(1, b * k)];
}

function emitBox(
  pos: number[],
  nor: number[],
  col: number[],
  x: number,
  y: number,
  z: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  hex: string,
  jitter: number,
) {
  FACES.forEach((face, i) => {
    const [r, g, b] = tint(hex, SHADE[i] ?? 1, jitter);
    pushFace(pos, nor, col, x, y, z, face, x0, y0, z0, x1, y1, z1, r, g, b);
  });
}

function pack(pos: number[], nor: number[], col: number[]): MeshArrays | null {
  if (pos.length === 0) return null;
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col) };
}

export function buildChunk(world: World, cx: number, cz: number): { solid: MeshArrays | null; water: MeshArrays | null } {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const wpos: number[] = [];
  const wnor: number[] = [];
  const wcol: number[] = [];
  const x0 = cx * CS;
  const z0 = cz * CS;
  for (let lx = 0; lx < CS; lx++) {
    for (let lz = 0; lz < CS; lz++) {
      const x = x0 + lx;
      const z = z0 + lz;
      for (let y = 0; y < H; y++) {
        const id = world.get(x, y, z);
        if (id === B.air) continue;
        const def = blockDef(id);
        if (!def) continue;
        const jitter = 0.93 + ((x * 13 + y * 7 + z * 17) & 7) * 0.01;
        if (id === B.water) {
          for (let i = 0; i < FACES.length; i++) {
            const face = FACES[i]!;
            const nid = world.get(x + face.n[0], y + face.n[1], z + face.n[2]);
            if (occludes(nid, id)) continue;
            const [r, g, b] = tint(def.color, SHADE[i] ?? 1, jitter);
            pushFace(wpos, wnor, wcol, x, y, z, face, 0, 0, 0, 1, 1, 1, r, g, b);
          }
          continue;
        }
        if (id === B.tallgrass || id === B.flower || id === B.bush) {
          emitBox(pos, nor, col, x, y, z, 0.32, 0, 0.32, 0.68, id === B.flower ? 0.42 : 0.62, 0.68, def.color, jitter);
          continue;
        }
        if (id === B.torch) {
          emitBox(pos, nor, col, x, y, z, 0.42, 0, 0.42, 0.58, 0.62, 0.58, "#e7a05a", 1);
          emitBox(pos, nor, col, x, y, z, 0.38, 0.62, 0.38, 0.62, 0.78, 0.62, "#ffe1a8", 1);
          continue;
        }
        if (id === B.lamp) {
          emitBox(pos, nor, col, x, y, z, 0.28, 0, 0.28, 0.72, 0.55, 0.72, "#e0a050", 1);
          emitBox(pos, nor, col, x, y, z, 0.34, 0.55, 0.34, 0.66, 0.72, 0.66, "#fff1c4", 1);
          continue;
        }
        if (id === B.ladder) {
          emitBox(pos, nor, col, x, y, z, 0.36, 0, 0.36, 0.64, 1, 0.64, def.color, jitter);
          continue;
        }
        if (id === B.doorOpen) {
          emitBox(pos, nor, col, x, y, z, 0.4, 0, 0.08, 0.55, 1, 0.92, def.color, jitter);
          continue;
        }
        for (let i = 0; i < FACES.length; i++) {
          const face = FACES[i]!;
          const nid = world.get(x + face.n[0], y + face.n[1], z + face.n[2]);
          if (occludes(nid, id)) continue;
          const [r, g, b] = tint(def.color, (SHADE[i] ?? 1) * (id === B.heart ? 1.25 : 1), jitter);
          pushFace(pos, nor, col, x, y, z, face, 0, 0, 0, 1, 1, 1, r, g, b);
        }
      }
    }
  }
  return { solid: pack(pos, nor, col), water: pack(wpos, wnor, wcol) };
}

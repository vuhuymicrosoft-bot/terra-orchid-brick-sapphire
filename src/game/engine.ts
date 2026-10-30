import { AudioBus } from "./audio";
import {
  B,
  CHEST_SLOTS,
  DAY,
  H,
  HOTBAR,
  I,
  REACH,
  RECIPES,
  SEA,
  SLOTS,
  blockDef,
  clamp,
  foodHeal,
  isTool,
  lerp,
  maxStack,
  toolInfo,
  type Recipe,
  type Stack,
} from "./defs";
import { Input } from "./input";
import { writeSave, type SaveData } from "./save";
import { World, biomeAt, makeTree, surfaceY } from "./world";

export interface Mob {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  hp: number;
  hop: number;
  onGround: boolean;
}

export interface Drop {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  id: number;
  n: number;
  dura: number;
  age: number;
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  color: string;
}

export interface RemoteBody {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  tx: number;
  ty: number;
  tz: number;
  tyaw: number;
  hp: number;
}

export type Mode = "play" | "inv" | "pause" | "dead" | "chest" | "help" | "won";

const HW = 0.28;
const PH = 1.68;
const EYE = 1.52;

function emptySlots(n: number): (Stack | null)[] {
  return Array.from({ length: n }, () => null);
}

export interface EditEvent {
  x: number;
  y: number;
  z: number;
  id: number;
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getX: () => number;
      getZ: () => number;
      setKeys?: (codes: string[]) => void;
    };
  }
}

export class Game {
  world: World;
  input: Input;
  sfx: AudioBus;
  x = 0;
  y = 8;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0;
  pitch = 0;
  onGround = false;
  hp = 10;
  maxHp = 10;
  invuln = 0;
  time = 40;
  mode: Mode = "play";
  slots: (Stack | null)[];
  selected = 0;
  chests = new Map<string, (Stack | null)[]>();
  chestKey: string | null = null;
  mobs: Mob[] = [];
  drops: Drop[] = [];
  particles: Particle[] = [];
  spawnX = 0;
  spawnY = 8;
  spawnZ = 0;
  rev = 1;
  mine = { x: 0, y: 0, z: 0, t: 0, on: false };
  aim: { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null = null;
  placeHold = 0;
  swing = 0;
  coyote = 0;
  jumpBuf = 0;
  regen = 0;
  dayLabel = "Ban ngày";
  toast = "";
  toastT = 0;
  won = false;
  heartX = 0;
  heartY = 0;
  heartZ = 0;
  heartNear = false;
  sens = 0.0022;
  persist = true;
  onEdit: ((e: EditEvent) => void) | null = null;
  onTime: ((t: number, force: boolean) => void) | null = null;
  onWin: ((name: string) => void) | null = null;
  onChest: ((key: string, slots: (Stack | null)[]) => void) | null = null;
  remotes = new Map<string, RemoteBody>();
  private saveAcc = 0;
  private mobSpawn = 2;
  private nextMob = 1;
  private fallVy = 0;
  playerName = "Bạn";

  constructor(
    sfx: AudioBus,
    input: Input,
    save: SaveData | null,
    seed?: number,
    sharedMods?: Iterable<[number, number, number, number]>,
  ) {
    this.sfx = sfx;
    this.input = input;
    if (save) {
      this.world = new World(save.seed, save.mods);
      this.slots = save.slots.map((s) => (s ? { ...s } : null));
      while (this.slots.length < SLOTS) this.slots.push(null);
      this.slots.length = SLOTS;
      this.selected = clamp(save.selected | 0, 0, HOTBAR - 1);
      this.hp = clamp(save.hp, 1, 10);
      this.time = save.time;
      this.spawnX = save.spawnX;
      this.spawnY = save.spawnY;
      this.spawnZ = save.spawnZ;
      this.x = save.x;
      this.y = save.y;
      this.z = save.z;
      this.yaw = save.yaw || 0;
      this.pitch = save.pitch || 0;
      this.won = !!save.won;
      for (const [k, arr] of Object.entries(save.chests)) {
        const slots = emptySlots(CHEST_SLOTS);
        arr.forEach((s, i) => {
          if (s && i < CHEST_SLOTS) slots[i] = { ...s };
        });
        this.chests.set(k, slots);
      }
    } else {
      this.world = new World(seed ?? 1, sharedMods);
      this.slots = emptySlots(SLOTS);
      const spawn = this.findSpawn();
      this.spawnX = spawn.x;
      this.spawnY = spawn.y;
      this.spawnZ = spawn.z;
      this.x = spawn.x;
      this.y = spawn.y;
      this.z = spawn.z;
    }
    if (!this.findHeart()) this.carveHeart();
    this.syncLabel(true);
    this.installProbe();
  }

  private installProbe() {
    window.__controlsTest = {
      getYaw: () => this.yaw,
      getSpeed: () => Math.hypot(this.vx, this.vz),
      getX: () => this.x,
      getZ: () => this.z,
      setKeys: (codes: string[]) => this.input.setOverride(codes),
    };
  }

  detachProbe() {
    if (window.__controlsTest?.getX() === this.x || window.__controlsTest) delete window.__controlsTest;
  }

  bump() {
    this.rev++;
  }

  private findSpawn(): { x: number; y: number; z: number } {
    const seed = this.world.seed;
    for (let ring = 0; ring < 48; ring++) {
      for (let a = 0; a < 10; a++) {
        const x = Math.round(Math.cos((a / 10) * Math.PI * 2) * ring * 3);
        const z = Math.round(Math.sin((a / 10) * Math.PI * 2) * ring * 3);
        if (!this.columnClear(x, z)) continue;
        return { x: x + 0.5, y: surfaceY(x, z, seed) + 1, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: surfaceY(0, 0, seed) + 1, z: 0.5 };
  }

  private columnClear(x: number, z: number): boolean {
    const seed = this.world.seed;
    const base = surfaceY(x, z, seed);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const xx = x + dx;
        const zz = z + dz;
        const s = surfaceY(xx, zz, seed);
        if (Math.abs(s - base) > 1) return false;
        if (biomeAt(xx, zz, seed) !== "meadow") return false;
        if (makeTree(xx, zz, seed).kind !== "none") return false;
        if (s <= SEA) return false;
      }
    }
    return true;
  }

  dayFactor(): number {
    const u = this.phase();
    if (u < 0.05) return lerp(0.22, 1, u / 0.05);
    if (u < 0.5) return 1;
    if (u < 0.62) return lerp(1, 0.18, (u - 0.5) / 0.12);
    if (u < 0.92) return 0.18;
    return lerp(0.18, 0.22, (u - 0.92) / 0.08);
  }

  phase(): number {
    return (((this.time % DAY) + DAY) % DAY) / DAY;
  }

  private syncLabel(force = false) {
    const u = this.phase();
    const label =
      u < 0.05 || u >= 0.92 ? "Bình minh" : u < 0.48 ? "Ban ngày" : u < 0.62 ? "Hoàng hôn" : "Ban đêm";
    const day = Math.floor(this.time / DAY) + 1;
    const text = `Ngày ${day} · ${label}`;
    if (force || text !== this.dayLabel) {
      this.dayLabel = text;
      this.bump();
    }
  }

  step(dt: number) {
    const a = this.input.pull();
    this.handleMenus(a.edge);
    this.swing = Math.max(0, this.swing - dt);
    this.toastTick(dt);
    this.lerpRemotes(dt);
    if (this.mode !== "play") return;

    const prevU = this.phase();
    this.time += dt;
    const u = this.phase();
    const night = (p: number) => p >= 0.62 && p < 0.92;
    if (night(prevU) && !night(u)) this.sfx.play("dawn");
    this.syncLabel();
    this.invuln = Math.max(0, this.invuln - dt);

    if (a.edge("Digit1")) this.sel(0);
    if (a.edge("Digit2")) this.sel(1);
    if (a.edge("Digit3")) this.sel(2);
    if (a.edge("Digit4")) this.sel(3);
    if (a.edge("Digit5")) this.sel(4);
    if (a.edge("Digit6")) this.sel(5);
    if (a.edge("Digit7")) this.sel(6);
    if (a.edge("Digit8")) this.sel(7);
    if (a.edge("Digit9")) this.sel(8);
    if (a.scroll) {
      this.selected = (this.selected + a.scroll + HOTBAR) % HOTBAR;
      this.bump();
    }
    if (a.edge("KeyQ")) this.dropSelected();

    this.look(a.lookDx, a.lookDy);
    this.move(dt);
    this.resolveAim();
    this.minePlace(a, dt);
    this.updateMobs(dt);
    this.updateDrops(dt);
    this.updateParticles(dt);
    this.spawnMobs(dt);
    this.regenTick(dt);
    this.watchHeart();
    this.world.evict(this.x, this.z);

    this.saveAcc += dt;
    if (this.saveAcc > 8) {
      this.saveAcc = 0;
      this.save();
    }
  }

  private sel(i: number) {
    this.selected = i;
    this.bump();
  }

  private look(dx: number, dy: number) {
    if (this.input.override) return;
    this.yaw -= dx * this.sens;
    this.pitch = clamp(this.pitch - dy * this.sens, -1.35, 1.35);
  }

  private handleMenus(edge: (code: string) => boolean) {
    if (edge("KeyE")) {
      if (this.mode === "play") this.mode = "inv";
      else if (this.mode === "inv" || this.mode === "chest") this.closeMenus();
      this.bump();
      return;
    }
    if (edge("Escape")) {
      if (this.mode === "play") this.mode = "pause";
      else if (this.mode === "pause" || this.mode === "help" || this.mode === "won") this.mode = "play";
      else this.closeMenus();
      this.bump();
      return;
    }
    if (edge("KeyF") && this.mode === "play") this.tryInteract();
    if (edge("KeyH") && this.mode === "play") {
      this.mode = "help";
      this.bump();
    }
  }

  closeMenus() {
    this.mode = "play";
    this.chestKey = null;
    this.bump();
  }

  private basis() {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    return { fx, fz, rx, rz };
  }

  lookDir() {
    const { fx, fz } = this.basis();
    const cp = Math.cos(this.pitch);
    return { x: fx * cp, y: Math.sin(this.pitch), z: fz * cp };
  }

  private move(dt: number) {
    const { fx, fz, rx, rz } = this.basis();
    let strafe = (this.input.down("KeyD") || this.input.down("ArrowRight") ? 1 : 0) -
      (this.input.down("KeyA") || this.input.down("ArrowLeft") ? 1 : 0);
    let forward = (this.input.down("KeyW") || this.input.down("ArrowUp") ? 1 : 0) -
      (this.input.down("KeyS") || this.input.down("ArrowDown") ? 1 : 0);
    if (Math.abs(this.input.joyX) + Math.abs(this.input.joyY) > 0.12) {
      strafe = this.input.joyX;
      forward = this.input.joyY;
    }
    const len = Math.hypot(strafe, forward);
    if (len > 1) {
      strafe /= len;
      forward /= len;
    }
    const sprint = this.input.down("ShiftLeft") || this.input.down("ShiftRight");
    const inWater = this.submerged();
    const onLadder = this.onClimb();
    const speed = inWater ? 2.8 : sprint && forward > 0.2 ? 7.1 : 4.8;
    const wishX = (fx * forward + rx * strafe) * speed;
    const wishZ = (fz * forward + rz * strafe) * speed;
    const rate = this.onGround ? 28 : inWater ? 8 : 10;
    const k = 1 - Math.exp(-rate * dt);
    this.vx += (wishX - this.vx) * k;
    this.vz += (wishZ - this.vz) * k;

    const jump = this.input.down("Space") || this.input.jumpHeld;
    if (jump) this.jumpBuf = 0.12;
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.onGround) this.coyote = 0.1;
    else this.coyote = Math.max(0, this.coyote - dt);

    if (onLadder) {
      if (this.input.down("KeyW") || this.input.down("ArrowUp") || jump || this.input.joyY > 0.4) this.vy = 4.3;
      else if (this.input.down("KeyS") || this.input.down("ArrowDown") || this.input.joyY < -0.4) this.vy = -4.6;
      else this.vy = 0;
      this.jumpBuf = 0;
    } else if (inWater) {
      this.vy -= 8 * dt;
      if (jump) this.vy += 16 * dt;
      this.vy = clamp(this.vy, -3, 4);
    } else if (this.jumpBuf > 0 && this.coyote > 0) {
      this.vy = 8.5;
      this.jumpBuf = 0;
      this.coyote = 0;
      this.onGround = false;
      this.sfx.play("jump");
    } else {
      this.vy -= 28 * dt;
      if (!jump && this.vy > 3) this.vy = 3;
      if (this.vy < -22) this.vy = -22;
    }

    this.fallVy = this.vy;
    this.integrate(dt);
    if (this.onGround && this.fallVy < -13) {
      const dmg = Math.floor((-this.fallVy - 13) * 0.45);
      if (dmg > 0) this.damage(dmg);
    }
    if (this.touchCactus() && this.invuln <= 0) this.damage(1);
    if (this.y < 1) {
      this.y = this.spawnY;
      this.x = this.spawnX;
      this.z = this.spawnZ;
      this.vy = 0;
    }
  }

  private integrate(dt: number) {
    this.x += this.vx * dt;
    if (this.overlaps(this.x, this.y, this.z)) {
      if (this.onGround && Math.abs(this.vx) > 0.2) {
        if (!this.overlaps(this.x, this.y + 1.05, this.z)) this.y += 1.05;
      }
      if (this.overlaps(this.x, this.y, this.z)) {
        if (this.vx > 0) this.x = Math.floor(this.x + HW) - HW - 0.001;
        else if (this.vx < 0) this.x = Math.floor(this.x - HW) + 1 + HW + 0.001;
        this.vx = 0;
      }
    }
    this.z += this.vz * dt;
    if (this.overlaps(this.x, this.y, this.z)) {
      if (this.onGround && Math.abs(this.vz) > 0.2) {
        if (!this.overlaps(this.x, this.y + 1.05, this.z)) this.y += 1.05;
      }
      if (this.overlaps(this.x, this.y, this.z)) {
        if (this.vz > 0) this.z = Math.floor(this.z + HW) - HW - 0.001;
        else if (this.vz < 0) this.z = Math.floor(this.z - HW) + 1 + HW + 0.001;
        this.vz = 0;
      }
    }
    this.y += this.vy * dt;
    if (this.overlaps(this.x, this.y, this.z)) {
      if (this.vy <= 0) {
        this.y = Math.floor(this.y) + 1;
        this.onGround = true;
      } else {
        this.y = Math.floor(this.y + PH) - PH - 0.001;
        this.onGround = false;
      }
      this.vy = 0;
    } else if (this.vy < -0.2) this.onGround = false;
  }

  private overlaps(x: number, y: number, z: number): boolean {
    const x0 = Math.floor(x - HW);
    const x1 = Math.floor(x + HW);
    const y0 = Math.floor(y + 0.001);
    const y1 = Math.floor(y + PH - 0.001);
    const z0 = Math.floor(z - HW);
    const z1 = Math.floor(z + HW);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        for (let iz = z0; iz <= z1; iz++) {
          if (this.world.solid(ix, iy, iz)) return true;
        }
      }
    }
    return false;
  }

  private hitsPlayer(bx: number, by: number, bz: number): boolean {
    return (
      this.x + HW > bx + 0.02 &&
      this.x - HW < bx + 0.98 &&
      this.y < by + 0.98 &&
      this.y + PH > by + 0.02 &&
      this.z + HW > bz + 0.02 &&
      this.z - HW < bz + 0.98
    );
  }

  private submerged(): boolean {
    return (
      this.world.get(Math.floor(this.x), Math.floor(this.y + 0.4), Math.floor(this.z)) === B.water ||
      this.world.get(Math.floor(this.x), Math.floor(this.y + 1.1), Math.floor(this.z)) === B.water
    );
  }

  eyeInWater(): boolean {
    return this.world.get(Math.floor(this.x), Math.floor(this.y + EYE), Math.floor(this.z)) === B.water;
  }

  private onClimb(): boolean {
    const a = blockDef(this.world.get(Math.floor(this.x), Math.floor(this.y + 0.4), Math.floor(this.z)));
    const b = blockDef(this.world.get(Math.floor(this.x), Math.floor(this.y + 1.05), Math.floor(this.z)));
    return !!(a?.climb || b?.climb);
  }

  private touchCactus(): boolean {
    const x0 = Math.floor(this.x - HW - 0.02);
    const x1 = Math.floor(this.x + HW + 0.02);
    const y0 = Math.floor(this.y);
    const y1 = Math.floor(this.y + PH);
    const z0 = Math.floor(this.z - HW - 0.02);
    const z1 = Math.floor(this.z + HW + 0.02);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) if (this.world.get(x, y, z) === B.cactus) return true;
      }
    }
    return false;
  }

  private resolveAim() {
    const eye = { x: this.x, y: this.y + EYE, z: this.z };
    const d = this.lookDir();
    this.aim = raycast(this.world, eye.x, eye.y, eye.z, d.x, d.y, d.z, REACH);
  }

  private minePlace(
    a: { mineEdge: boolean; placeEdge: boolean },
    dt: number,
  ) {
    const attack = this.input.mine;
    if (a.mineEdge) {
      const mob = this.mobInCone(2.6);
      if (mob) this.hitMob(mob);
    }
    if (attack && this.aim && this.swing <= 0.05) {
      const { x, y, z } = this.aim;
      if (!this.mine.on || this.mine.x !== x || this.mine.y !== y || this.mine.z !== z) {
        this.mine = { x, y, z, t: 0, on: true };
      }
      const id = this.world.get(x, y, z);
      const def = blockDef(id);
      if (def && def.hardness < Infinity && id !== B.water) {
        if (id === B.heart && !this.crystalPick()) {
          this.mine.t = 0;
          if (a.mineEdge) this.say("Tim khe chỉ vỡ dưới cuốc tinh thể.");
        } else {
          const tool = toolInfo(this.slots[this.selected]?.id ?? 0);
          let speed = 0.55;
          if (def.tool === "any" || def.tool === "none") speed = Math.max(1.2, tool.speed);
          else if (tool.kind === def.tool) speed = tool.speed;
          else if (tool.kind === "hand" && (def.tool === "shovel" || def.tool === "axe")) speed = 1.15;
          this.mine.t += (dt * speed) / def.hardness;
          this.swing = 0.12;
          if (Math.random() < 0.28) this.sfx.play("mine");
          if (this.mine.t >= 1) this.breakBlock(x, y, z, id);
        }
      }
    } else if (!attack) {
      this.mine.on = false;
      this.mine.t = 0;
    }

    const place = this.input.place;
    if (place) {
      if (a.placeEdge || this.placeHold <= 0) {
        this.tryUse();
        this.placeHold = 0.18;
      }
      this.placeHold -= dt;
    } else this.placeHold = 0;
  }

  private crystalPick(): boolean {
    const tool = toolInfo(this.slots[this.selected]?.id ?? 0);
    return tool.kind === "pick" && tool.tier >= 4;
  }

  private tryUse() {
    const slot = this.slots[this.selected];
    if (!slot) return;
    const heal = foodHeal(slot.id);
    if (heal > 0) {
      if (this.hp >= this.maxHp) return;
      this.hp = Math.min(this.maxHp, this.hp + heal);
      this.consumeSlot(this.selected, 1);
      this.sfx.play("eat");
      this.bump();
      return;
    }
    const def = blockDef(slot.id);
    if (!def?.place || !this.aim) return;
    const x = this.aim.x + this.aim.nx;
    const y = this.aim.y + this.aim.ny;
    const z = this.aim.z + this.aim.nz;
    if (y < 1 || y >= H) return;
    const cur = this.world.get(x, y, z);
    const cd = blockDef(cur);
    if (cur !== B.air && !cd?.replace && cur !== B.water) return;
    if (def.solid && this.hitsPlayer(x, y, z)) return;
    if ((slot.id === B.torch || slot.id === B.lamp || slot.id === B.ladder) && !this.supported(x, y, z, slot.id)) {
      this.say("Cần tựa vào khối đặc.");
      return;
    }
    if (slot.id === B.door) {
      if (y + 1 >= H) return;
      const above = this.world.get(x, y + 1, z);
      const ad = blockDef(above);
      if (above !== B.air && !ad?.replace) return;
      if (this.hitsPlayer(x, y + 1, z)) return;
      this.commitBlock(x, y, z, B.door);
      this.commitBlock(x, y + 1, z, B.door);
    } else {
      if (slot.id === B.chest && !this.chests.has(keyOf(x, y, z))) {
        this.chests.set(keyOf(x, y, z), emptySlots(CHEST_SLOTS));
      }
      this.commitBlock(x, y, z, slot.id);
    }
    this.consumeSlot(this.selected, 1);
    this.sfx.play("place");
    this.burst(x + 0.5, y + 0.5, z + 0.5, def.color, 6);
    this.bump();
  }

  private supported(x: number, y: number, z: number, id: number): boolean {
    const solid = (xx: number, yy: number, zz: number) => this.world.solid(xx, yy, zz);
    if (id === B.tallgrass || id === B.flower || id === B.bush) return solid(x, y - 1, z);
    return (
      solid(x, y - 1, z) ||
      solid(x + 1, y, z) ||
      solid(x - 1, y, z) ||
      solid(x, y, z + 1) ||
      solid(x, y, z - 1) ||
      solid(x, y + 1, z)
    );
  }

  private commitBlock(x: number, y: number, z: number, id: number) {
    const prev = this.world.get(x, y, z);
    if (prev === id) return;
    this.world.set(x, y, z, id);
    this.onEdit?.({ x, y, z, id });
    if (id === B.air && prev === B.heart) {
      /* win handled by breaker */
    }
  }

  applyRemote(x: number, y: number, z: number, id: number) {
    const prev = this.world.get(x, y, z);
    if (prev === id) return;
    this.world.set(x, y, z, id);
    if (prev === B.heart && id === B.air) this.say("Tim khe đã vỡ. Ánh sáng tràn ra khỏi đá.");
    if (prev === B.chest && id === B.air) this.chests.delete(keyOf(x, y, z));
    this.bump();
  }

  applyTime(t: number, force: boolean) {
    if (force || t > this.time + 0.35 || Math.abs(t - this.time) > 3) {
      this.time = t;
      this.syncLabel(true);
    }
  }

  private breakBlock(x: number, y: number, z: number, id: number) {
    if (id === B.heart && !this.crystalPick()) return;
    if (id === B.chest) {
      const key = keyOf(x, y, z);
      const slots = this.chests.get(key);
      if (slots) {
        for (const s of slots) if (s) this.giveOrDrop(x + 0.5, y + 0.5, z + 0.5, s.id, s.n, s.dura);
        this.chests.delete(key);
        this.onChest?.(key, emptySlots(CHEST_SLOTS));
      }
    }
    this.commitBlock(x, y, z, B.air);
    const drop = rollDrop(id);
    if (drop) this.giveOrDrop(x + 0.5, y + 0.5, z + 0.5, drop.id, drop.n, -1);
    this.wearTool();
    this.sfx.play("break");
    this.burst(x + 0.5, y + 0.5, z + 0.5, blockDef(id)?.color ?? "#ccc", 10);
    this.mine.on = false;
    this.mine.t = 0;
    this.popSupport(x, y, z);
    if (id === B.log || id === B.slog) this.decayLeaves(x, y, z, id);
    if (id === B.heart) this.win();
    this.bump();
  }

  private popSupport(x: number, y: number, z: number) {
    const around: [number, number, number][] = [
      [x, y + 1, z],
      [x, y - 1, z],
      [x + 1, y, z],
      [x - 1, y, z],
      [x, y, z + 1],
      [x, y, z - 1],
    ];
    for (const [xx, yy, zz] of around) {
      const id = this.world.get(xx, yy, zz);
      if (
        (id === B.torch || id === B.lamp || id === B.ladder || id === B.tallgrass || id === B.flower || id === B.bush) &&
        !this.supported(xx, yy, zz, id)
      ) {
        this.commitBlock(xx, yy, zz, B.air);
        if (id === B.torch || id === B.lamp || id === B.ladder) this.giveOrDrop(xx + 0.5, yy + 0.4, zz + 0.5, id, 1, -1);
      }
    }
  }

  private decayLeaves(x: number, y: number, z: number, logId: number) {
    const leaf = logId === B.slog ? B.sleaves : B.leaves;
    const origin: [number, number, number][] = [];
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        for (let dz = -4; dz <= 4; dz++) {
          if (this.world.get(x + dx, y + dy, z + dz) === leaf) origin.push([x + dx, y + dy, z + dz]);
        }
      }
    }
    const anchored = (lx: number, ly: number, lz: number) => {
      const q: [number, number, number][] = [[lx, ly, lz]];
      const seen = new Set<string>([keyOf(lx, ly, lz)]);
      for (let i = 0; i < q.length && i < 70; i++) {
        const [cx, cy, cz] = q[i]!;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            for (let oz = -1; oz <= 1; oz++) {
              if (!ox && !oy && !oz) continue;
              const nx = cx + ox;
              const ny = cy + oy;
              const nz = cz + oz;
              if (Math.abs(nx - lx) > 4 || Math.abs(ny - ly) > 5 || Math.abs(nz - lz) > 4) continue;
              const key = keyOf(nx, ny, nz);
              if (seen.has(key)) continue;
              const id = this.world.get(nx, ny, nz);
              if (id === logId) return true;
              if (id === leaf) {
                seen.add(key);
                q.push([nx, ny, nz]);
              }
            }
          }
        }
      }
      return false;
    };
    for (const [lx, ly, lz] of origin) {
      if (anchored(lx, ly, lz)) continue;
      this.commitBlock(lx, ly, lz, B.air);
      if (Math.random() < 0.07) this.giveOrDrop(lx + 0.5, ly + 0.5, lz + 0.5, I.apple, 1, -1);
      else if (Math.random() < 0.18) this.giveOrDrop(lx + 0.5, ly + 0.5, lz + 0.5, I.stick, 1, -1);
    }
  }

  private win() {
    this.won = true;
    this.mode = "won";
    this.sfx.play("dawn");
    this.say("Tim khe đã vỡ. Ánh sáng tràn ra khỏi đá.");
    this.onWin?.(this.playerName);
    this.save();
    this.bump();
  }

  private tryInteract() {
    const t = this.aim;
    if (!t) {
      this.say("Nhìn vào rương, cửa, giường hoặc lò.");
      return;
    }
    const id = this.world.get(t.x, t.y, t.z);
    if (id === B.chest) {
      const key = keyOf(t.x, t.y, t.z);
      if (!this.chests.has(key)) this.chests.set(key, emptySlots(CHEST_SLOTS));
      this.chestKey = key;
      this.mode = "chest";
      this.bump();
      return;
    }
    if (id === B.bed) {
      this.trySleep(t.x, t.y, t.z);
      return;
    }
    if (id === B.door || id === B.doorOpen) {
      const next = id === B.door ? B.doorOpen : B.door;
      this.commitBlock(t.x, t.y, t.z, next);
      for (const dy of [-1, 1]) {
        const other = this.world.get(t.x, t.y + dy, t.z);
        if (other === B.door || other === B.doorOpen) this.commitBlock(t.x, t.y + dy, t.z, next);
      }
      this.sfx.play("place");
      return;
    }
    if (id === B.heart) this.say("Tim khe chỉ vỡ dưới cuốc tinh thể. Giữ đào.");
    if (id === B.bench || id === B.furnace) this.say("Mở túi (E) để chế tại đây.");
  }

  private trySleep(x: number, y: number, z: number) {
    const near = this.mobs.some((m) => Math.hypot(m.x - this.x, m.y - this.y, m.z - this.z) < 8);
    if (near) {
      this.say("Không ngủ được — có rêu đang nhảy gần đây.");
      return;
    }
    if (!this.world.solid(x, y + 1, z)) {
      this.spawnX = x + 0.5;
      this.spawnY = y + 1;
      this.spawnZ = z + 0.5;
    }
    const u = this.phase();
    const night = u >= 0.5 && u < 0.94;
    if (!night) {
      this.say("Đã nhớ chỗ này. Ngủ khi trời tối để tới bình minh.");
      this.save();
      return;
    }
    const dayIndex = Math.floor(this.time / DAY);
    this.time = (dayIndex + 1) * DAY + 1.5;
    this.hp = Math.min(this.maxHp, this.hp + 3);
    this.mobs = [];
    this.syncLabel(true);
    this.sfx.play("dawn");
    this.say("Bạn ngủ đến bình minh.");
    this.onTime?.(this.time, true);
    this.save();
    this.bump();
  }

  say(text: string) {
    this.toast = text;
    this.toastT = 4.2;
    this.bump();
  }

  private toastTick(dt: number) {
    if (this.toastT <= 0) return;
    this.toastT -= dt;
    if (this.toastT <= 0) {
      this.toast = "";
      this.bump();
    }
  }

  private findHeart(): boolean {
    for (const [k, id] of this.world.mods) {
      if (id !== B.heart) continue;
      const [xs, ys, zs] = k.split(",");
      this.heartX = Number(xs);
      this.heartY = Number(ys);
      this.heartZ = Number(zs);
      return true;
    }
    return false;
  }

  private carveHeart() {
    const sx = Math.floor(this.spawnX);
    const sz = Math.floor(this.spawnZ);
    let hx = sx + 8 + (this.world.seed % 5);
    let hz = sz + 4 + (this.world.seed % 3);
    if (Math.hypot(hx - sx, hz - sz) < 6) hx += 6;
    const hy = 8;
    for (let x = hx - 2; x <= hx + 2; x++) {
      for (let z = hz - 2; z <= hz + 2; z++) {
        for (let y = hy - 1; y <= hy + 3; y++) this.world.set(x, y, z, B.air);
        this.world.set(x, hy - 1, z, B.cobble);
        this.world.set(x, hy + 3, z, B.cobble);
      }
    }
    for (let y = hy; y <= hy + 2; y++) {
      for (let x = hx - 2; x <= hx + 2; x++) {
        this.world.set(x, y, hz - 2, B.cobble);
        this.world.set(x, y, hz + 2, B.cobble);
      }
      for (let z = hz - 2; z <= hz + 2; z++) {
        this.world.set(hx - 2, y, z, B.cobble);
        this.world.set(hx + 2, y, z, B.cobble);
      }
    }
    this.world.set(hx, hy, hz, B.heart);
    this.world.set(hx - 1, hy, hz, B.torch);
    this.world.set(hx + 1, hy, hz, B.torch);
    this.heartX = hx;
    this.heartY = hy;
    this.heartZ = hz;
  }

  private watchHeart() {
    if (this.won || this.heartNear) return;
    const d = Math.hypot(this.x - (this.heartX + 0.5), this.y - this.heartY, this.z - (this.heartZ + 0.5));
    if (d < 7) {
      this.heartNear = true;
      this.say("Tim khe đang sáng dưới này. Chỉ cuốc tinh thể phá được nó.");
    }
  }

  private giveOrDrop(x: number, y: number, z: number, id: number, n: number, dura: number) {
    const left = this.addItem(id, n, dura);
    if (left > 0) this.spawnDrop(x, y, z, id, left, dura);
  }

  addItem(id: number, n: number, dura = -1): number {
    const max = maxStack(id);
    const toolDura = dura >= 0 ? dura : isTool(id) ? toolInfo(id).dura : -1;
    if (max > 1) {
      for (const s of this.slots) {
        if (s && s.id === id && s.n < max) {
          const add = Math.min(max - s.n, n);
          s.n += add;
          n -= add;
          if (n <= 0) {
            this.bump();
            return 0;
          }
        }
      }
    }
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        const add = Math.min(max, n);
        this.slots[i] = { id, n: add, dura: max > 1 ? -1 : toolDura };
        n -= add;
        if (n <= 0) {
          this.bump();
          return 0;
        }
      }
    }
    this.bump();
    return n;
  }

  private consumeSlot(i: number, n: number) {
    const s = this.slots[i];
    if (!s) return;
    s.n -= n;
    if (s.n <= 0) this.slots[i] = null;
  }

  countOf(id: number): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.n;
    return n;
  }

  private consume(id: number, n: number) {
    let left = n;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const take = Math.min(s.n, left);
      s.n -= take;
      left -= take;
      if (s.n <= 0) this.slots[i] = null;
      if (left <= 0) break;
    }
  }

  private wearTool() {
    const s = this.slots[this.selected];
    if (!s || !isTool(s.id)) return;
    s.dura -= 1;
    if (s.dura <= 0) {
      this.slots[this.selected] = null;
      this.sfx.play("break");
    }
    this.bump();
  }

  canCraft(r: Recipe): boolean {
    if (r.station === "bench" && !this.near(B.bench)) return false;
    if (r.station === "furnace" && !this.near(B.furnace)) return false;
    for (const [id, n] of r.need) if (this.countOf(id) < n) return false;
    return true;
  }

  craft(id: string) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r || !this.canCraft(r)) return;
    for (const [nid, n] of r.need) this.consume(nid, n);
    const dura = isTool(r.out) ? toolInfo(r.out).dura : -1;
    const left = this.addItem(r.out, r.n, dura);
    if (left > 0) this.spawnDrop(this.x, this.y + 0.8, this.z, r.out, left, dura);
    this.sfx.play("craft");
    this.bump();
  }

  near(id: number): boolean {
    const px = Math.floor(this.x);
    const py = Math.floor(this.y);
    const pz = Math.floor(this.z);
    for (let y = py - 2; y <= py + 2; y++) {
      for (let x = px - 4; x <= px + 4; x++) {
        for (let z = pz - 4; z <= pz + 4; z++) if (this.world.get(x, y, z) === id) return true;
      }
    }
    return false;
  }

  swapWithSelected(index: number) {
    if (index === this.selected) return;
    const tmp = this.slots[index] ?? null;
    this.slots[index] = this.slots[this.selected] ?? null;
    this.slots[this.selected] = tmp;
    this.bump();
  }

  swapChest(index: number) {
    if (!this.chestKey) return;
    const slots = this.chests.get(this.chestKey);
    if (!slots || index < 0 || index >= slots.length) return;
    const tmp = slots[index] ?? null;
    slots[index] = this.slots[this.selected] ?? null;
    this.slots[this.selected] = tmp;
    this.onChest?.(this.chestKey, slots.map((s) => (s ? { ...s } : null)));
    this.bump();
  }

  applyChest(key: string, slots: (Stack | null)[]) {
    const next = emptySlots(CHEST_SLOTS);
    slots.forEach((s, i) => {
      if (s && i < CHEST_SLOTS) next[i] = { ...s };
    });
    this.chests.set(key, next);
    this.bump();
  }

  private dropSelected() {
    const s = this.slots[this.selected];
    if (!s) return;
    const { fx, fz } = this.basis();
    this.spawnDrop(this.x + fx * 0.6, this.y + 1.1, this.z + fz * 0.6, s.id, 1, s.dura);
    this.consumeSlot(this.selected, 1);
    this.bump();
  }

  private spawnDrop(x: number, y: number, z: number, id: number, n: number, dura: number) {
    if (this.drops.length > 48) this.drops.shift();
    this.drops.push({
      x,
      y,
      z,
      vx: (Math.random() - 0.5) * 2,
      vy: 2.4,
      vz: (Math.random() - 0.5) * 2,
      id,
      n,
      dura,
      age: 0,
    });
  }

  private updateDrops(dt: number) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]!;
      d.age += dt;
      d.vy -= 26 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      if (this.world.solid(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z))) {
        d.y = Math.floor(d.y) + 1;
        d.vy *= -0.2;
        d.vx *= 0.6;
        d.vz *= 0.6;
      }
      const dx = this.x - d.x;
      const dy = this.y + 0.7 - d.y;
      const dz = this.z - d.z;
      const dist = Math.hypot(dx, dy, dz);
      if (d.age > 0.35 && dist < 2.2 && dist > 0.01) {
        d.x += (dx / dist) * 6 * dt;
        d.y += (dy / dist) * 6 * dt;
        d.z += (dz / dist) * 6 * dt;
      }
      if (d.age > 0.3 && dist < 0.9) {
        const left = this.addItem(d.id, d.n, d.dura);
        if (left <= 0) {
          this.drops.splice(i, 1);
          this.sfx.play("pickup");
        } else d.n = left;
      } else if (d.age > 90) this.drops.splice(i, 1);
    }
  }

  private mobInCone(range: number): Mob | null {
    const dir = this.lookDir();
    let best: Mob | null = null;
    let bestD = range;
    for (const m of this.mobs) {
      const dx = m.x - this.x;
      const dy = m.y + 0.4 - (this.y + EYE);
      const dz = m.z - this.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > range || dist < 0.001) continue;
      const dot = (dx / dist) * dir.x + (dy / dist) * dir.y + (dz / dist) * dir.z;
      if (dot < 0.45) continue;
      if (dist < bestD) {
        best = m;
        bestD = dist;
      }
    }
    return best;
  }

  private hitMob(m: Mob) {
    const tool = toolInfo(this.slots[this.selected]?.id ?? 0);
    const dmg = tool.kind === "sword" || tool.kind === "hand" ? tool.dmg : Math.max(1, tool.dmg - 1);
    m.hp -= dmg;
    const { fx, fz } = this.basis();
    m.vx = fx * 5;
    m.vz = fz * 5;
    m.vy = 4.2;
    this.swing = 0.28;
    this.sfx.play("hit");
    this.burst(m.x, m.y + 0.4, m.z, "#7dce55", 6);
    if (isTool(this.slots[this.selected]?.id ?? 0)) this.wearTool();
    if (m.hp <= 0) {
      this.spawnDrop(m.x, m.y + 0.3, m.z, I.gel, 1, -1);
      this.mobs = this.mobs.filter((x) => x !== m);
    }
    this.bump();
  }

  private updateMobs(dt: number) {
    const day = this.dayFactor();
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i]!;
      m.hop -= dt;
      const surf = surfaceY(Math.floor(m.x), Math.floor(m.z), this.world.seed);
      if (day > 0.72 && m.y >= surf) m.hp -= 3.2 * dt;
      if (m.hp <= 0) {
        this.spawnDrop(m.x, m.y, m.z, I.gel, 1, -1);
        this.mobs.splice(i, 1);
        continue;
      }
      const dx = this.x - m.x;
      const dz = this.z - m.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (m.onGround && m.hop <= 0) {
        m.vx = (dx / dist) * 2.3;
        m.vz = (dz / dist) * 2.3;
        m.vy = 7.1;
        m.hop = 0.7 + Math.random() * 0.4;
      }
      m.vy -= 28 * dt;
      this.integrateBody(m, dt, 0.28, 0.78);
      if (Math.hypot(m.x - this.x, m.y + 0.3 - (this.y + 0.7), m.z - this.z) < 0.95 && this.invuln <= 0) {
        this.damage(2);
        this.vx = Math.sign(this.x - m.x) * 5 || 2;
        this.vz = Math.sign(this.z - m.z) * 5 || 2;
        this.vy = 5;
      }
      if (dist > 40) this.mobs.splice(i, 1);
    }
  }

  private integrateBody(m: Mob, dt: number, hw: number, h: number) {
    const old = { x: this.x, y: this.y, z: this.z, vx: this.vx, vy: this.vy, vz: this.vz, onGround: this.onGround };
    this.x = m.x;
    this.y = m.y;
    this.z = m.z;
    this.vx = m.vx;
    this.vy = m.vy;
    this.vz = m.vz;
    this.onGround = m.onGround;
    const prevHw = HW;
    const prevH = PH;
    void prevHw;
    void prevH;
    this.x += this.vx * dt;
    if (this.overlapBox(this.x, this.y, this.z, hw, h)) {
      this.x = m.x;
      this.vx = 0;
    }
    this.z += this.vz * dt;
    if (this.overlapBox(this.x, this.y, this.z, hw, h)) {
      this.z = m.z;
      this.vz = 0;
    }
    this.y += this.vy * dt;
    if (this.overlapBox(this.x, this.y, this.z, hw, h)) {
      if (this.vy <= 0) {
        this.y = Math.floor(this.y) + 1;
        this.onGround = true;
      } else {
        this.y = Math.floor(this.y + h) - h - 0.001;
        this.onGround = false;
      }
      this.vy = 0;
    } else if (this.vy < -0.2) this.onGround = false;
    m.x = this.x;
    m.y = this.y;
    m.z = this.z;
    m.vx = this.vx;
    m.vy = this.vy;
    m.vz = this.vz;
    m.onGround = this.onGround;
    this.x = old.x;
    this.y = old.y;
    this.z = old.z;
    this.vx = old.vx;
    this.vy = old.vy;
    this.vz = old.vz;
    this.onGround = old.onGround;
  }

  private overlapBox(x: number, y: number, z: number, hw: number, h: number): boolean {
    const x0 = Math.floor(x - hw);
    const x1 = Math.floor(x + hw);
    const y0 = Math.floor(y + 0.001);
    const y1 = Math.floor(y + h - 0.001);
    const z0 = Math.floor(z - hw);
    const z1 = Math.floor(z + hw);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        for (let iz = z0; iz <= z1; iz++) if (this.world.solid(ix, iy, iz)) return true;
      }
    }
    return false;
  }

  private spawnMobs(dt: number) {
    this.mobSpawn -= dt;
    if (this.mobSpawn > 0) return;
    this.mobSpawn = 2.6;
    if (this.mobs.length >= 5) return;
    const night = this.phase() >= 0.6 && this.phase() < 0.92;
    if (!night && this.dayFactor() > 0.55) return;
    for (let tries = 0; tries < 8; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 12 + Math.random() * 10;
      const x = Math.floor(this.x + Math.cos(ang) * dist);
      const z = Math.floor(this.z + Math.sin(ang) * dist);
      const surf = surfaceY(x, z, this.world.seed);
      if (this.world.get(x, surf, z) === B.water) continue;
      if (this.world.get(x, surf + 1, z) !== B.air) continue;
      if (Math.hypot(x - this.x, z - this.z) < 8) continue;
      this.mobs.push({
        id: this.nextMob++,
        x: x + 0.5,
        y: surf + 1,
        z: z + 0.5,
        vx: 0,
        vy: 0,
        vz: 0,
        hp: 8,
        hop: 0.2,
        onGround: true,
      });
      return;
    }
  }

  damage(n: number) {
    if (this.invuln > 0 || this.mode === "dead" || this.mode === "won") return;
    this.hp = Math.max(0, this.hp - n);
    this.invuln = 0.75;
    this.sfx.play("hurt");
    this.bump();
    if (this.hp <= 0) {
      this.mode = "dead";
      this.sfx.play("die");
      this.save();
      this.bump();
    }
  }

  respawn() {
    this.hp = this.maxHp;
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.z = this.spawnZ;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.invuln = 1.6;
    this.mode = "play";
    this.bump();
    this.save();
  }

  private regenTick(dt: number) {
    if (this.hp <= 0 || this.hp >= this.maxHp) return;
    if (this.dayFactor() < 0.6) return;
    this.regen += dt;
    if (this.regen > 7) {
      this.hp = Math.min(this.maxHp, this.hp + 1);
      this.regen = 3;
      this.bump();
    }
  }

  burst(x: number, y: number, z: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 140) this.particles.shift();
      this.particles.push({
        x,
        y,
        z,
        vx: (Math.random() - 0.5) * 3.2,
        vy: Math.random() * 3,
        vz: (Math.random() - 0.5) * 3.2,
        life: 0.35 + Math.random() * 0.25,
        color,
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= 8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
  }

  private lerpRemotes(dt: number) {
    const k = 1 - Math.exp(-12 * dt);
    for (const r of this.remotes.values()) {
      r.x += (r.tx - r.x) * k;
      r.y += (r.ty - r.y) * k;
      r.z += (r.tz - r.z) * k;
      let dyaw = r.tyaw - r.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      r.yaw += dyaw * k;
    }
  }

  setRemote(id: string, name: string, x: number, y: number, z: number, yaw: number, hp: number) {
    let r = this.remotes.get(id);
    if (!r) {
      r = { id, name, x, y, z, yaw, tx: x, ty: y, tz: z, tyaw: yaw, hp };
      this.remotes.set(id, r);
      this.bump();
      return;
    }
    r.name = name || r.name;
    r.tx = x;
    r.ty = y;
    r.tz = z;
    r.tyaw = yaw;
    r.hp = hp;
  }

  dropRemote(id: string) {
    if (this.remotes.delete(id)) this.bump();
  }

  aimName(): string {
    if (!this.aim) return "";
    const id = this.world.get(this.aim.x, this.aim.y, this.aim.z);
    if (id === B.air || id === B.water) return "";
    return blockDef(id)?.name ?? "";
  }

  save() {
    if (!this.persist) return;
    writeSave({
      v: 2,
      seed: this.world.seed,
      x: this.x,
      y: this.y,
      z: this.z,
      yaw: this.yaw,
      pitch: this.pitch,
      hp: this.hp,
      time: this.time,
      selected: this.selected,
      spawnX: this.spawnX,
      spawnY: this.spawnY,
      spawnZ: this.spawnZ,
      slots: this.slots.map((s) => (s ? { ...s } : null)),
      mods: this.world.exportMods(),
      chests: Object.fromEntries(
        [...this.chests.entries()].map(([k, slots]) => [k, slots.map((s) => (s ? { ...s } : null))]),
      ),
      won: this.won,
    });
  }
}

function keyOf(x: number, y: number, z: number): string {
  return x + "," + y + "," + z;
}

function rollDrop(id: number): { id: number; n: number } | null {
  if (id === B.stone) return { id: B.cobble, n: 1 };
  if (id === B.coalOre) return { id: I.coal, n: 1 };
  if (id === B.leaves || id === B.sleaves) {
    const r = Math.random();
    if (r < 0.06) return { id: I.apple, n: 1 };
    if (r < 0.16) return { id: I.stick, n: 1 };
    return null;
  }
  if (id === B.tallgrass || id === B.flower || id === B.bush) return null;
  if (id === B.heart || id === B.bedrock || id === B.water || id === B.air) return null;
  if (id === B.doorOpen) return { id: B.door, n: 1 };
  return { id, n: 1 };
}

export function raycast(
  world: World,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  reach: number,
): { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx >= 0 ? 1 : -1;
  const stepY = dy >= 0 ? 1 : -1;
  const stepZ = dz >= 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY;
  let tMaxZ = dz === 0 ? Infinity : (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let dist = 0;
  for (let i = 0; i < 48; i++) {
    const id = world.get(x, y, z);
    if (id !== B.air && id !== B.water) return { x, y, z, nx, ny, nz };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > reach) return null;
      x += stepX;
      dist = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > reach) return null;
      y += stepY;
      dist = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      if (tMaxZ > reach) return null;
      z += stepZ;
      dist = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
    if (dist > reach) return null;
  }
  return null;
}

export function syncParts(game: Game, size = 700) {
  const mods = game.world.exportMods();
  const parts = Math.max(1, Math.ceil(mods.length / size));
  const out: {
    t: "sync";
    seed: number;
    time: number;
    part: number;
    parts: number;
    mods: [number, number, number, number][];
  }[] = [];
  for (let i = 0; i < parts; i++) {
    out.push({
      t: "sync",
      seed: game.world.seed,
      time: game.time,
      part: i,
      parts,
      mods: mods.slice(i * size, (i + 1) * size),
    });
  }
  return out;
}

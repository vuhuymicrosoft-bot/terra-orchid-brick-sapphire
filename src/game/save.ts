import { SLOTS, type Stack } from "./defs";

export interface SaveData {
  v: 2;
  seed: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  time: number;
  selected: number;
  spawnX: number;
  spawnY: number;
  spawnZ: number;
  slots: (Stack | null)[];
  mods: [number, number, number, number][];
  chests: Record<string, (Stack | null)[]>;
  won?: boolean;
}

const KEY = "kheda3d-v1";
const SFX_KEY = "kheda-sfx";

function validStack(s: unknown): s is Stack {
  if (!s || typeof s !== "object") return false;
  const o = s as Stack;
  return typeof o.id === "number" && typeof o.n === "number" && o.n > 0 && typeof o.dura === "number";
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (!data || data.v !== 2 || typeof data.seed !== "number") return null;
    if (!Array.isArray(data.slots)) return null;
    data.slots = data.slots.map((s) => (validStack(s) ? s : null));
    while (data.slots.length < SLOTS) data.slots.push(null);
    data.slots.length = SLOTS;
    if (!data.chests || typeof data.chests !== "object") data.chests = {};
    if (!Array.isArray(data.mods)) data.mods = [];
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

export function clearSave() {
  localStorage.removeItem(KEY);
}

export function hasSave(): boolean {
  return !!localStorage.getItem(KEY);
}

export function loadSfx(): boolean {
  return localStorage.getItem(SFX_KEY) !== "0";
}

export function writeSfx(on: boolean) {
  localStorage.setItem(SFX_KEY, on ? "1" : "0");
}

export function hashSeed(text: string): number {
  const t = text.trim();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return (n >>> 0) || 1;
  }
  let h = 2166136261;
  const s = t || String(Math.floor(Math.random() * 1e9));
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) || 1;
}

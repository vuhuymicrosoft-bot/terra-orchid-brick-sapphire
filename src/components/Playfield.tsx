import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Backpack, Heart, Pause, Pickaxe, Volume2, VolumeX, X } from "lucide-react";
import { AudioBus } from "@/game/audio";
import {
  B,
  HOTBAR,
  RECIPES,
  SLOTS,
  isTool,
  itemColor,
  itemMark,
  itemName,
  stationLabel,
  toolInfo,
  type Stack,
} from "@/game/defs";
import { Game, syncParts } from "@/game/engine";
import { Input } from "@/game/input";
import type { Launch } from "@/game/launch";
import { hashSeed, loadSave, loadSfx, writeSfx, type SaveData } from "@/game/save";
import { WorldView } from "@/game/view";
import { useP2PRoom, type P2PRoomHandle } from "@/lib/multiplayer/use-p2p-room";

interface Props {
  launch: Launch;
  onQuit: () => void;
}

export default function Playfield({ launch, onQuit }: Props) {
  if (launch.role === "solo") return <Arena launch={launch} net={null} onQuit={onQuit} />;
  return <Online launch={launch} onQuit={onQuit} />;
}

function Online({ launch, onQuit }: Props) {
  const net = useP2PRoom({ room: launch.room, name: launch.name });
  return <Arena launch={launch} net={net} onQuit={onQuit} />;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function Arena({ launch, net, onQuit }: Props & { net: P2PRoomHandle | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const inputRef = useRef<Input | null>(null);
  const netRef = useRef(net);
  netRef.current = net;
  const publishRef = useRef<() => void>(() => {});
  const stopRef = useRef<(() => void) | null>(null);
  const greeted = useRef(new Set<string>());
  const syncBuf = useRef(new Map<number, [number, number, number, number][]>());
  const pending = useRef<{ from: string; data: Record<string, unknown> }[]>([]);
  const timeSent = useRef(0);
  const [tick, setTick] = useState(0);
  const [touch, setTouch] = useState(false);
  const [locked, setLocked] = useState(false);
  const [sfxOn, setSfxOn] = useState(true);
  const [booting, setBooting] = useState(launch.role === "guest");
  const [waited, setWaited] = useState(false);
  const [error, setError] = useState("");
  const [meshed, setMeshed] = useState(false);
  const coordRef = useRef<HTMLSpanElement>(null);
  const aimRef = useRef<HTMLDivElement>(null);
  const mineRef = useRef<HTMLElement>(null);
  const stickRef = useRef<HTMLElement>(null);
  const lookLast = useRef({ id: -1, x: 0, y: 0 });

  publishRef.current = () => {
    const g = gameRef.current;
    const n = netRef.current;
    if (!g || !n) return;
    n.broadcast({
      t: "p",
      x: round(g.x),
      y: round(g.y),
      z: round(g.z),
      yaw: round(g.yaw),
      hp: g.hp,
      name: g.playerName,
    });
    if (launch.role === "host" && performance.now() - timeSent.current > 2000) {
      timeSent.current = performance.now();
      n.broadcast({ t: "time", time: g.time });
    }
  };

  function start(save: SaveData | null, seed: number | undefined, mods?: [number, number, number, number][], time?: number) {
    const canvas = canvasRef.current;
    if (!canvas || gameRef.current) return;
    const audio = new AudioBus(loadSfx());
    audio.unlock();
    const input = new Input();
    input.attach(canvas);
    inputRef.current = input;
    let view: WorldView;
    try {
      view = new WorldView(canvas);
      view.labelRoot = labelsRef.current;
    } catch {
      input.destroy();
      setError("Máy này không mở được đồ họa 3D.");
      return;
    }
    const game = new Game(audio, input, save, seed, mods);
    if (typeof time === "number") game.applyTime(time, true);
    game.playerName = launch.name;
    game.persist = launch.role !== "guest";
    const link = netRef.current;
    if (link) {
      game.onEdit = (e) => netRef.current?.send({ t: "b", ...e });
      game.onTime = (t, force) => netRef.current?.send({ t: "time", time: t, force });
      game.onWin = (who) => netRef.current?.send({ t: "win", name: who });
      game.onChest = (key, slots) => netRef.current?.send({ t: "chest", key, slots });
    }
    for (const item of pending.current) applyNet(game, item.from, item.data);
    pending.current = [];
    gameRef.current = game;
    setBooting(false);
    setTick((n) => n + 1);
    let alive = true;
    const stopLoop = runLoop(canvas, game, view, () => {
      if (alive) setTick((n) => n + 1);
    }, (ready) => {
      if (alive) setMeshed(ready);
    }, coordRef, aimRef, mineRef, () => publishRef.current());
    stopRef.current = () => {
      alive = false;
      stopLoop();
      game.save();
      game.detachProbe();
      input.destroy();
      view.dispose();
      gameRef.current = null;
      inputRef.current = null;
    };
  }

  useEffect(() => {
    setSfxOn(loadSfx());
    const coarse = window.matchMedia("(pointer: coarse)");
    const update = () => setTouch(coarse.matches || window.innerWidth < 860);
    update();
    coarse.addEventListener("change", update);
    window.addEventListener("resize", update);
    const lock = () => setLocked(document.pointerLockElement === canvasRef.current);
    document.addEventListener("pointerlockchange", lock);
    return () => {
      coarse.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("pointerlockchange", lock);
    };
  }, []);

  useEffect(() => {
    if (launch.role === "guest") return;
    const save = launch.fresh ? null : loadSave();
    if (!launch.fresh && !save) {
      setError("Không thấy bản lưu.");
      return;
    }
    start(save, hashSeed(launch.seedText || String(Date.now() % 100000)));
    const hide = () => {
      if (document.hidden) gameRef.current?.save();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      stopRef.current?.();
      stopRef.current = null;
    };
    // Mount once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (launch.role !== "guest") return;
    const t = window.setTimeout(() => setWaited(true), 12000);
    return () => window.clearTimeout(t);
  }, [launch.role]);

  useEffect(() => {
    if (!net) return;
    return net.onMessage((from, data) => {
      if (!isRecord(data) || typeof data.t !== "string") return;
      if (data.t === "sync") {
        const seed = data.seed;
        const part = data.part;
        const parts = data.parts;
        const mods = data.mods;
        const time = data.time;
        if (typeof seed !== "number" || typeof part !== "number" || typeof parts !== "number" || !Array.isArray(mods)) return;
        if (gameRef.current) return;
        syncBuf.current.set(part, mods as [number, number, number, number][]);
        if (syncBuf.current.size < parts) return;
        const all: [number, number, number, number][] = [];
        for (let i = 0; i < parts; i++) all.push(...(syncBuf.current.get(i) ?? []));
        start(null, seed, all, typeof time === "number" ? time : 40);
        return;
      }
      const game = gameRef.current;
      if (!game) {
        pending.current.push({ from, data });
        return;
      }
      applyNet(game, from, data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net?.onMessage]);

  useEffect(() => {
    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, []);

  useEffect(() => {
    const game = gameRef.current;
    const link = netRef.current;
    if (!link || !game) return;
    for (const peer of link.peers) {
      if (greeted.current.has(peer.id)) continue;
      greeted.current.add(peer.id);
      const ids = [link.selfId, ...link.peers.map((p) => p.id).filter((id) => id !== peer.id)];
      ids.sort();
      if (ids[0] !== link.selfId) continue;
      for (const part of syncParts(game)) link.send(part, peer.id);
    }
    for (const id of [...game.remotes.keys()]) {
      if (!link.peers.some((p) => p.id === id)) game.dropRemote(id);
    }
  }, [net?.peers, tick]);

  const game = gameRef.current;
  void tick;

  return (
    <main className="game-root">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        onClick={() => {
          const g = gameRef.current;
          if (!g || touch || g.mode !== "play") return;
          canvasRef.current?.requestPointerLock();
        }}
        onPointerDown={(e) => {
          gameRef.current?.sfx.unlock();
          if (e.pointerType === "mouse") return;
          lookLast.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse") return;
          const last = lookLast.current;
          if (last.id !== e.pointerId) return;
          inputRef.current?.addLook((e.clientX - last.x) * 1.7, (e.clientY - last.y) * 1.7);
          lookLast.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => {
          lookLast.current = { id: -1, x: 0, y: 0 };
        }}
      />
      <div className="name-tags" ref={labelsRef} />
      {game && game.mode === "play" && <div className="cross" />}
      <div className="hud-top">
        <div>
          <div className="hearts" aria-label="Máu">
            {Array.from({ length: 10 }, (_, i) => (
              <Heart key={i} className={game && game.hp > i ? "pip on" : "pip"} />
            ))}
          </div>
          <div className="day-chip" style={{ marginTop: "0.4rem" }}>
            {game?.dayLabel ?? "Đang vào khe"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {launch.role !== "solo" && <div className="room-chip">Phòng {launch.room.replace("khe-", "")}</div>}
          <div className="coord-chip" style={{ marginTop: "0.35rem" }}>
            <span ref={coordRef}>0 0 0</span>
            {net && <span> · {net.joined ? `${net.peers.length + 1} người` : "đang nối"}</span>}
          </div>
        </div>
      </div>
      <div className="icon-row">
        <button className="btn-icon" aria-label="Túi đồ" onClick={() => openInv(game)}>
          <Backpack size={18} />
        </button>
        <button
          className="btn-icon"
          aria-label={sfxOn ? "Tắt tiếng" : "Bật tiếng"}
          onClick={() => {
            const next = !sfxOn;
            setSfxOn(next);
            writeSfx(next);
            if (game) game.sfx.on = next;
          }}
        >
          {sfxOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button className="btn-icon" aria-label="Tạm dừng" onClick={() => openPause(game)}>
          <Pause size={18} />
        </button>
      </div>
      {game && (
        <div className="hud-bottom">
          <div className="aim-name" ref={aimRef} />
          <div className="mine-track">
            <i ref={mineRef} />
          </div>
          <div className="held-name">{game.slots[game.selected] ? itemName(game.slots[game.selected]!.id) : "Tay không"}</div>
          <div className="hotbar">
            {game.slots.slice(0, HOTBAR).map((s, i) => (
              <button
                key={i}
                className={i === game.selected ? "slot on" : "slot"}
                onClick={() => {
                  game.selected = i;
                  game.bump();
                  setTick((n) => n + 1);
                }}
              >
                <SlotFace stack={s} />
              </button>
            ))}
          </div>
        </div>
      )}
      {game?.toast && <div className="toast">{game.toast}</div>}
      {game && game.mode === "play" && !touch && !locked && meshed && <div className="lock-hint">Bấm để nhìn quanh</div>}
      {(booting || (game && !meshed)) && !error && (
        <div className="boot-note">
          {waited && booting ? "Chưa thấy chủ phòng. Giữ đúng mã và bảo họ đứng trong khe." : "Đang dựng đất đá..."}
        </div>
      )}
      {error && (
        <div className="panel">
          <div className="sheet">
            <h2>Chưa vào được</h2>
            <p>{error}</p>
            <button className="btn-primary" onClick={onQuit}>
              Về tiêu đề
            </button>
          </div>
        </div>
      )}
      {game && game.mode !== "play" && <Menu game={game} onQuit={onQuit} onChange={() => setTick((n) => n + 1)} />}
      {touch && game && (
        <div className="touch-layer">
          <Stick
            knobRef={stickRef}
            onChange={(x, y) => {
              const input = inputRef.current;
              if (!input) return;
              input.joyX = x;
              input.joyY = y;
            }}
          />
          <div className="touch-actions">
            <button
              className="touch-btn"
              onPointerDown={() => inputRef.current && (inputRef.current.jumpHeld = true)}
              onPointerUp={() => inputRef.current && (inputRef.current.jumpHeld = false)}
              onPointerLeave={() => inputRef.current && (inputRef.current.jumpHeld = false)}
            >
              Nhảy
            </button>
            <button
              className="touch-btn primary"
              onPointerDown={() => inputRef.current?.setMine(true)}
              onPointerUp={() => inputRef.current?.setMine(false)}
              onPointerLeave={() => inputRef.current?.setMine(false)}
            >
              <Pickaxe size={18} /> Đào
            </button>
            <button
              className="touch-btn"
              onPointerDown={() => inputRef.current?.setPlace(true)}
              onPointerUp={() => inputRef.current?.setPlace(false)}
              onPointerLeave={() => inputRef.current?.setPlace(false)}
            >
              Đặt
            </button>
            <button className="touch-btn" onClick={() => openInv(game)}>
              Túi
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Stick({ knobRef, onChange }: { knobRef: RefObject<HTMLElement | null>; onChange: (x: number, y: number) => void }) {
  function set(e: ReactPointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (r.top + r.height / 2 - e.clientY) / (r.height / 2);
    const l = Math.hypot(x, y) || 1;
    if (l > 1) {
      x /= l;
      y /= l;
    }
    onChange(x, y);
    if (knobRef.current) knobRef.current.style.transform = `translate(calc(-50% + ${x * 28}px), calc(-50% + ${-y * 28}px))`;
  }
  return (
    <div
      className="stick"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e);
      }}
      onPointerUp={() => {
        onChange(0, 0);
        if (knobRef.current) knobRef.current.style.transform = "translate(-50%, -50%)";
      }}
    >
      <i ref={knobRef} />
    </div>
  );
}

function SlotFace({ stack }: { stack: Stack | null }) {
  if (!stack) return null;
  const max = isTool(stack.id) ? toolInfo(stack.id).dura : 0;
  return (
    <>
      <i className="swatch" style={{ background: itemColor(stack.id) }} />
      {itemMark(stack.id) && <span className="mark">{itemMark(stack.id)}</span>}
      {stack.n > 1 && <span className="count">{stack.n}</span>}
      {max > 0 && <i className="dura" style={{ transform: `scaleX(${Math.max(0, stack.dura) / max})` }} />}
    </>
  );
}

function Menu({ game, onQuit, onChange }: { game: Game; onQuit: () => void; onChange: () => void }) {
  if (game.mode === "dead") {
    return (
      <div className="panel">
        <div className="sheet">
          <h2>Bạn đã gục</h2>
          <p>Giường nhớ chỗ tỉnh lại. Không có giường thì về bãi cỏ đầu tiên.</p>
          <button
            className="btn-primary"
            onClick={() => {
              game.respawn();
              onChange();
            }}
          >
            Tỉnh lại
          </button>
        </div>
      </div>
    );
  }
  if (game.mode === "won") {
    return (
      <div className="panel">
        <div className="sheet">
          <h2>Tim khe đã vỡ</h2>
          <p>Ánh sáng tràn ra khỏi đá. Khe vẫn còn đó nếu bạn muốn xây tiếp.</p>
          <div className="actions">
            <button
              className="btn-primary"
              onClick={() => {
                game.mode = "play";
                game.bump();
                onChange();
              }}
            >
              Ở lại
            </button>
            <button className="btn-ghost" onClick={onQuit}>
              Về tiêu đề
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (game.mode === "pause" || game.mode === "help") {
    return (
      <div className="panel">
        <div className="sheet">
          <h2>{game.mode === "help" ? "Cách chơi" : "Tạm dừng"}</h2>
          <p>
            W A S D đi, Space nhảy, Shift chạy. Chuột trái đào, chuột phải đặt hoặc ăn. E túi đồ, F dùng, Q vứt, H trợ giúp. Trên điện thoại: cần trái để đi, kéo màn hình để nhìn.
          </p>
          <p>Tim khe nằm trong hốc đá dưới sâu, gần chỗ bạn bắt đầu. Cần cuốc tinh thể.</p>
          <div className="actions">
            <button
              className="btn-primary"
              onClick={() => {
                game.closeMenus();
                onChange();
              }}
            >
              Chơi tiếp
            </button>
            <button className="btn-ghost" onClick={onQuit}>
              Về tiêu đề
            </button>
          </div>
        </div>
      </div>
    );
  }
  const chest = game.mode === "chest" && game.chestKey ? game.chests.get(game.chestKey) : null;
  const recipes = [...RECIPES].sort((a, b) => Number(game.canCraft(b)) - Number(game.canCraft(a)));
  return (
    <div className="panel">
      <div className="sheet">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>{game.mode === "chest" ? "Rương" : "Túi và chế tạo"}</h2>
          <button
            className="btn-icon"
            aria-label="Đóng"
            onClick={() => {
              game.closeMenus();
              onChange();
            }}
          >
            <X size={18} />
          </button>
        </div>
        <p>
          {game.near(B.bench) ? "Có bàn chế cạnh bạn. " : "Đặt bàn chế để làm đồ đá và đồng. "}
          {game.near(B.furnace) ? "Lò đang gần." : "Đặt lò và có than để nung thỏi."}
        </p>
        {chest && (
          <div className="bag" style={{ marginBottom: "0.7rem" }}>
            {chest.map((s, i) => (
              <button
                key={i}
                className="slot"
                onClick={() => {
                  game.swapChest(i);
                  onChange();
                }}
              >
                <SlotFace stack={s} />
              </button>
            ))}
          </div>
        )}
        <div className="bag">
          {game.slots.slice(0, SLOTS).map((s, i) => (
            <button
              key={i}
              className={i === game.selected ? "slot on" : "slot"}
              onClick={() => {
                if (i < HOTBAR) game.selected = i;
                else game.swapWithSelected(i);
                game.bump();
                onChange();
              }}
            >
              <SlotFace stack={s} />
            </button>
          ))}
        </div>
        <div className="recipe-list">
          {recipes.map((r) => (
            <button
              key={r.id}
              className="recipe"
              disabled={!game.canCraft(r)}
              onClick={() => {
                game.craft(r.id);
                onChange();
              }}
            >
              <span>
                {itemName(r.out)} ×{r.n}
                <small>
                  {r.need.map(([id, n]) => `${itemName(id)} ×${n}`).join(", ")} · {stationLabel(r.station)}
                </small>
              </span>
              <i className="swatch" style={{ position: "relative", width: "1.4rem", height: "1.4rem", background: itemColor(r.out) }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function openInv(game: Game | null) {
  if (!game) return;
  if (game.mode === "play") game.mode = "inv";
  else if (game.mode === "inv" || game.mode === "chest") game.closeMenus();
  game.bump();
}

function openPause(game: Game | null) {
  if (!game) return;
  game.mode = game.mode === "play" ? "pause" : "play";
  game.bump();
}

function applyNet(game: Game, from: string, data: Record<string, unknown>) {
  if (data.t === "b" && typeof data.x === "number" && typeof data.y === "number" && typeof data.z === "number" && typeof data.id === "number") {
    game.applyRemote(data.x, data.y, data.z, data.id);
  } else if (data.t === "time" && typeof data.time === "number") {
    game.applyTime(data.time, !!data.force);
  } else if (data.t === "win" && typeof data.name === "string") {
    game.say(`${data.name} đã phá Tim khe.`);
  } else if (data.t === "chest" && typeof data.key === "string" && Array.isArray(data.slots)) {
    game.applyChest(data.key, data.slots as (Stack | null)[]);
  } else if (data.t === "p" && from && typeof data.x === "number" && typeof data.y === "number" && typeof data.z === "number") {
    game.setRemote(from, String(data.name ?? "Bạn"), data.x, data.y, data.z, Number(data.yaw) || 0, Number(data.hp) || 10);
  }
}

function runLoop(
  canvas: HTMLCanvasElement,
  game: Game,
  view: WorldView,
  onRev: () => void,
  onMesh: (v: boolean) => void,
  coordRef: RefObject<HTMLSpanElement | null>,
  aimRef: RefObject<HTMLDivElement | null>,
  mineRef: RefObject<HTMLElement | null>,
  publish: () => void,
) {
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let seen = game.rev;
  let sendAt = 0;
  let meshNoted = false;
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    let steps = 0;
    while (acc >= 1 / 60 && steps < 4) {
      game.step(1 / 60);
      acc -= 1 / 60;
      steps++;
    }
    if (game.mode !== "play" && document.pointerLockElement === canvas) document.exitPointerLock();
    view.resize();
    view.sync(game, dt);
    if (!meshNoted && view.meshed) {
      meshNoted = true;
      onMesh(true);
    }
    if (coordRef.current) coordRef.current.textContent = `${Math.floor(game.x)} ${Math.floor(game.y)} ${Math.floor(game.z)}`;
    if (aimRef.current) aimRef.current.textContent = game.aimName();
    if (mineRef.current) mineRef.current.style.transform = `scaleX(${game.mine.on ? Math.min(1, game.mine.t) : 0})`;
    if (now - sendAt > 90) {
      sendAt = now;
      publish();
    }
    if (game.rev !== seen) {
      seen = game.rev;
      onRev();
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}

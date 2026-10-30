import { lazy, Suspense, useEffect, useState } from "react";
import { clearSave, hasSave } from "@/game/save";
import type { Launch } from "@/game/launch";

const Playfield = lazy(() => import("@/components/Playfield"));

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `khe-${s}`;
}

function normRoom(raw: string) {
  const t = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!t) return "";
  const body = t.startsWith("KHE") ? t.slice(3) : t;
  return `khe-${body.slice(0, 6)}`;
}

export function GameScreen() {
  const [saved, setSaved] = useState(false);
  const [seed, setSeed] = useState("");
  const [name, setName] = useState("Bạn");
  const [room, setRoom] = useState("");
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  useEffect(() => {
    setSaved(hasSave());
  }, [launch]);

  function go(next: Launch) {
    setConfirmNew(false);
    setLaunch(next);
  }

  function quit() {
    setLaunch(null);
    setSaved(hasSave());
  }

  if (launch) {
    return (
      <Suspense fallback={<main className="game-root boot-note">Đang mở khe...</main>}>
        <Playfield launch={launch} onQuit={quit} />
      </Suspense>
    );
  }

  return (
    <main className="game-root">
      <div className="title-wrap">
        <div>
          <div className="voxel-mark" aria-hidden="true">
            <i className="v-grass" />
            <i className="v-dirt" />
            <i className="v-stone" />
            <i className="v-log" />
            <i className="v-sand" />
            <i className="v-crystal" />
          </div>
          <div className="brand-kicker">Thế giới khối</div>
          <h1>Khe Đá</h1>
          <p className="lede">
            Đào, xây và chế tạo trong khe đá 3D. Ban đêm rêu nhảy ra từ bóng tối. Tim khe nằm sâu bên dưới — chỉ cuốc tinh thể phá được nó. Có thể vào một mình, hoặc mở phòng để bạn cùng xây.
          </p>
          <div className="actions">
            {saved && (
              <button
                className="btn-primary"
                onClick={() => go({ role: "solo", room: "", name: name.trim() || "Bạn", seedText: "", fresh: false })}
              >
                Tiếp tục
              </button>
            )}
            <button
              className="btn-primary"
              onClick={() => {
                if (saved) setConfirmNew(true);
                else go({ role: "solo", room: "", name: name.trim() || "Bạn", seedText: seed, fresh: true });
              }}
            >
              Chơi một mình
            </button>
            <button
              className="btn-ghost"
              onClick={() =>
                go({
                  role: "host",
                  room: roomCode(),
                  name: name.trim() || "Bạn",
                  seedText: seed,
                  fresh: true,
                })
              }
            >
              Tạo phòng
            </button>
            <button
              className="btn-ghost"
              disabled={!normRoom(room)}
              onClick={() =>
                go({
                  role: "guest",
                  room: normRoom(room),
                  name: name.trim() || "Bạn",
                  seedText: "",
                  fresh: true,
                })
              }
            >
              Vào phòng
            </button>
          </div>
          {confirmNew && (
            <div className="actions">
              <button
                className="btn-primary"
                onClick={() => {
                  clearSave();
                  go({ role: "solo", room: "", name: name.trim() || "Bạn", seedText: seed, fresh: true });
                }}
              >
                Xóa thế giới cũ và chơi mới
              </button>
              <button className="btn-ghost" onClick={() => setConfirmNew(false)}>
                Để sau
              </button>
            </div>
          )}
          <label className="field">
            Tên trong phòng
            <input className="seed-input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            Hạt giống thế giới mới
            <input
              className="seed-input"
              value={seed}
              placeholder="Để trống là ngẫu nhiên"
              onChange={(e) => setSeed(e.target.value)}
            />
          </label>
          <label className="field">
            Mã phòng
            <input
              className="seed-input"
              value={room}
              placeholder="AB12"
              onChange={(e) => setRoom(e.target.value)}
            />
          </label>
        </div>
        <aside className="side-card">
          <h2>Cách chơi</h2>
          <ul>
            <li>W A S D để đi, chuột để nhìn, giữ chuột trái để đào.</li>
            <li>Chuột phải để đặt khối hoặc ăn. E mở túi và chế tạo.</li>
            <li>Gỗ thành ván, ván thành cuốc. Bàn chế làm đồ đá, lò nung ra thỏi.</li>
            <li>Đêm hãy thắp đuốc. F dùng giường, cửa và rương.</li>
            <li>Tạo phòng rồi đưa mã cho bạn. Cả hai cùng đào một khe.</li>
          </ul>
        </aside>
      </div>
    </main>
  );
}

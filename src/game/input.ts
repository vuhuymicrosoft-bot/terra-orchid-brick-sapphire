export class Input {
  private held = new Set<string>();
  private edges = new Set<string>();
  override: string[] | null = null;
  lookDx = 0;
  lookDy = 0;
  scroll = 0;
  mine = false;
  place = false;
  mineEdge = false;
  placeEdge = false;
  /** Strafe -1..1, from the touch stick. */
  joyX = 0;
  /** Forward -1..1, stick up is positive. */
  joyY = 0;
  jumpHeld = false;
  private canvas: HTMLCanvasElement | null = null;
  private cleanups: Array<() => void> = [];

  attach(canvas: HTMLCanvasElement) {
    this.destroy();
    this.canvas = canvas;
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.held.add(e.code);
      this.edges.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      this.held.delete(e.code);
    };
    const blur = () => {
      this.held.clear();
      this.mine = false;
      this.place = false;
    };
    const md = (e: MouseEvent) => {
      if (e.button === 0) {
        this.mine = true;
        this.mineEdge = true;
      } else if (e.button === 2) {
        this.place = true;
        this.placeEdge = true;
        e.preventDefault();
      }
    };
    const mu = (e: MouseEvent) => {
      if (e.button === 0) this.mine = false;
      if (e.button === 2) this.place = false;
    };
    const mm = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas) {
        this.lookDx += e.movementX;
        this.lookDy += e.movementY;
      }
    };
    const wheel = (e: WheelEvent) => {
      this.scroll += Math.sign(e.deltaY);
      e.preventDefault();
    };
    const menu = (e: Event) => e.preventDefault();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("mousemove", mm);
    canvas.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("contextmenu", menu);
    this.cleanups.push(() => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("mousemove", mm);
      canvas.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", menu);
    });
  }

  addLook(dx: number, dy: number) {
    this.lookDx += dx;
    this.lookDy += dy;
  }

  setMine(on: boolean) {
    if (on && !this.mine) this.mineEdge = true;
    this.mine = on;
  }

  setPlace(on: boolean) {
    if (on && !this.place) this.placeEdge = true;
    this.place = on;
  }

  down(code: string): boolean {
    if (this.override) return this.override.includes(code);
    return this.held.has(code);
  }

  setOverride(codes: string[]) {
    this.override = codes;
  }

  pull() {
    const edges = this.edges;
    this.edges = new Set();
    const mineEdge = this.mineEdge;
    const placeEdge = this.placeEdge;
    this.mineEdge = false;
    this.placeEdge = false;
    const lookDx = this.lookDx;
    const lookDy = this.lookDy;
    const scroll = this.scroll;
    this.lookDx = 0;
    this.lookDy = 0;
    this.scroll = 0;
    const edge = (code: string) => {
      if (this.override) return false;
      return edges.has(code);
    };
    return { edge, mineEdge, placeEdge, lookDx, lookDy, scroll };
  }

  destroy() {
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
    this.canvas = null;
    this.held.clear();
  }
}

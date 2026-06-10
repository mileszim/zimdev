// The operator's side of the ZIM-35: orbit/dolly input, click picking,
// the film-transport state machine, tween animation, and the render loop.
import { Foley } from "./audio";
import { AsciiRenderer } from "./renderer";
import { buildSLR, findPart, partById, type ActionId, type Part } from "./slr";

export const COLS = 152;
export const ROWS = 64;
export const CELL_ASPECT = 0.6; // glyph width / line height
export const ROLL_SIZE = 36;

export const SPEEDS = [
  { label: "1", s: 1 },
  { label: "1/2", s: 0.5 },
  { label: "1/4", s: 0.25 },
  { label: "1/8", s: 0.125 },
  { label: "1/15", s: 1 / 15 },
  { label: "1/30", s: 1 / 30 },
  { label: "1/60", s: 1 / 60 },
  { label: "1/125", s: 1 / 125 },
  { label: "1/250", s: 1 / 250 },
  { label: "1/500", s: 1 / 500 },
  { label: "1/1000", s: 1 / 1000 },
];
export const FSTOPS = [1.8, 2.8, 4, 5.6, 8, 11, 16];
export const FOCUS = ["0.45m", "0.7m", "1m", "1.5m", "3m", "7m", "INF"];
const SCENE_EV = 13; // ZIMCHROME 400 in good light; 1/125 @ f/8 meters dead-on

export interface Exposure {
  n: number;
  roll: number;
  speed: string;
  fstop: number;
  meter: number;
  thumb: string;
}

export type Busy = "idle" | "firing" | "winding" | "rewinding";

export interface Snapshot {
  frame: number;
  cocked: boolean;
  shutterIdx: number;
  apertureIdx: number;
  focusIdx: number;
  muted: boolean;
  roll: number;
  busy: Busy;
  status: string;
  hover: string | null;
  exposures: Exposure[];
  meter: number;
}

export const INITIAL_SNAPSHOT: Snapshot = {
  frame: 0,
  cocked: false,
  shutterIdx: 7,
  apertureIdx: 4,
  focusIdx: 4,
  muted: false,
  roll: 1,
  busy: "idle",
  status: "ZIM-35 ONLINE -- WIND THE LEVER TO LOAD FRAME 1",
  hover: null,
  exposures: [],
  meter: 0,
};

interface Tween {
  set: (v: number) => void;
  from: number;
  to: number;
  dur: number;
  el: number;
  ease: (t: number) => number;
  done?: () => void;
}

const easeInOut = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;

const ACTION_HINTS: Record<ActionId, string> = {
  fire: "CLICK TO FIRE",
  wind: "CLICK TO WIND",
  "shutter-dial": "CLICK TO STEP (SHIFT REVERSES)",
  aperture: "CLICK TO STEP (SHIFT REVERSES)",
  focus: "CLICK TO STEP (SHIFT REVERSES)",
  rewind: "CLICK TO REWIND ROLL",
};

export function meterDelta(shutterIdx: number, apertureIdx: number): number {
  const n = FSTOPS[apertureIdx];
  const t = SPEEDS[shutterIdx].s;
  const evSet = Math.log2((n * n) / t);
  return Math.round((SCENE_EV - evSet) * 10) / 10;
}

export class Engine {
  private renderer = new AsciiRenderer(COLS, ROWS);
  private parts: Part[] = buildSLR();
  private foley = new Foley();
  private viewport: HTMLElement;
  private pre: HTMLPreElement;
  onChange?: (s: Snapshot) => void;

  // orbit
  private yaw = -0.55;
  private pitch = 0.3;
  private dist = 9.2;
  private vyaw = 0;
  private vpitch = 0;
  private dragging = false;
  private moved = 0;
  private lastX = 0;
  private lastY = 0;
  private lastInteract = 0;
  private idleRamp = 0;
  private reducedMotion = false;

  // animation
  private tweens: Tween[] = [];
  private crankVel = 0;
  private iris = 1;
  private irisLabel = "";
  private hoverId = -1;
  private dirty = true;
  private raf = 0;
  private lastT = 0;
  private rewindTimer = 0;
  private lastFrameText = "";

  // camera state
  private frame = INITIAL_SNAPSHOT.frame;
  private cocked = INITIAL_SNAPSHOT.cocked;
  private shutterIdx = INITIAL_SNAPSHOT.shutterIdx;
  private apertureIdx = INITIAL_SNAPSHOT.apertureIdx;
  private focusIdx = INITIAL_SNAPSHOT.focusIdx;
  private roll = INITIAL_SNAPSHOT.roll;
  private busy: Busy = "idle";
  private status = INITIAL_SNAPSHOT.status;
  private hoverLabel: string | null = null;
  private exposures: Exposure[] = [];

  private cleanups: Array<() => void> = [];

  constructor(viewport: HTMLElement, pre: HTMLPreElement) {
    this.viewport = viewport;
    this.pre = pre;
  }

  start() {
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.lastInteract = performance.now();

    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement | Window,
      ev: string,
      fn: (e: any) => void,
      opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(ev, fn, opts);
      this.cleanups.push(() => el.removeEventListener(ev, fn));
    };

    on(this.viewport, "pointerdown", this.onPointerDown);
    on(this.viewport, "pointermove", this.onPointerMove);
    on(this.viewport, "pointerup", this.onPointerUp);
    on(this.viewport, "pointerleave", this.onPointerLeave);
    on(this.viewport, "wheel", this.onWheel, { passive: false });
    on(window, "keydown", this.onKey);

    const ro = new ResizeObserver(() => this.fitFont());
    ro.observe(this.viewport);
    this.cleanups.push(() => ro.disconnect());
    this.fitFont();

    this.lastT = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      this.step(t);
    };
    this.raf = requestAnimationFrame(loop);
    this.emit();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.rewindTimer);
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.foley.dispose();
  }

  // ---- public controls (HUD buttons + keyboard) ----------------------

  fire = () => {
    this.foley.ensure();
    if (this.busy !== "idle") return;
    if (!this.cocked) {
      this.foley.dud();
      this.setStatus(
        this.frame >= ROLL_SIZE
          ? "ROLL EXHAUSTED -- REWIND [R] TO RELOAD"
          : "SHUTTER NOT COCKED -- WIND THE LEVER [W]",
      );
      return;
    }
    this.busy = "firing";
    const speed = SPEEDS[this.shutterIdx];
    const fstop = FSTOPS[this.apertureIdx];
    const holdMs = Math.min(1400, Math.max(50, speed.s * 1000));
    const hole = Math.max(0.05, 0.5 * Math.pow(1.8 / fstop, 0.8));
    const button = findPart(this.parts, "fire");
    this.irisLabel = speed.s >= 0.2 ? `[ EXPOSING ${speed.label}s AT F/${fstop} ]` : "";

    this.tween((v) => { button.offset[1] = v; }, 0, -0.05, 70, easeIn, () => {
      this.foley.shutterOpen();
      const thumb = this.captureThumb();
      this.tween((v) => { this.iris = v; }, 1, speed.s >= 0.2 ? 0 : hole, 90, easeIn, () => {
        window.setTimeout(() => {
          if (speed.s >= 1 / 30) this.foley.shutterClose();
          this.tween((v) => { this.iris = v; }, this.iris, 1, 140, easeOut, () => {
            this.irisLabel = "";
            this.cocked = false;
            this.busy = "idle";
            this.exposures = [...this.exposures, {
              n: this.frame,
              roll: this.roll,
              speed: speed.label,
              fstop,
              meter: meterDelta(this.shutterIdx, this.apertureIdx),
              thumb,
            }];
            this.setStatus(`FRAME ${this.frame} EXPOSED AT ${speed.label} F/${fstop} -- WIND TO ADVANCE`);
          });
          this.tween((v) => { button.offset[1] = v; }, -0.05, 0, 120, easeOut);
        }, holdMs);
      });
    });
    this.emit();
  };

  wind = () => {
    this.foley.ensure();
    if (this.busy !== "idle") return;
    const lever = findPart(this.parts, "wind");
    if (this.cocked) {
      this.foley.dud();
      this.setStatus("SHUTTER ALREADY COCKED -- FIRE [SPACE]");
      return;
    }
    if (this.frame >= ROLL_SIZE) {
      this.busy = "winding";
      this.foley.dud();
      this.tween((v) => { lever.angle = v; }, 0, -0.18, 90, easeOut, () => {
        this.tween((v) => { lever.angle = v; }, -0.18, 0, 110, easeOut, () => { this.busy = "idle"; });
      });
      this.setStatus("ROLL EXHAUSTED -- REWIND [R] TO RELOAD");
      return;
    }
    this.busy = "winding";
    this.foley.ratchet();
    this.tween((v) => { lever.angle = v; }, 0, -2.15, 380, easeInOut, () => {
      this.frame += 1;
      this.cocked = true;
      this.tween((v) => { lever.angle = v; }, -2.15, 0, 260, easeOut, () => {
        this.busy = "idle";
        this.setStatus(
          this.frame === 1
            ? "FRAME 1 LOADED -- SHUTTER COCKED, READY"
            : `FRAME ${this.frame} OF ${ROLL_SIZE} -- SHUTTER COCKED`,
        );
      });
      this.emit();
    });
    this.emit();
  };

  rewind = () => {
    this.foley.ensure();
    if (this.busy !== "idle") return;
    if (this.frame === 0) {
      this.foley.dud();
      this.setStatus("NO FILM WOUND -- NOTHING TO REWIND");
      return;
    }
    this.busy = "rewinding";
    this.crankVel = 17;
    this.setStatus("REWINDING...");
    this.rewindTimer = window.setInterval(() => {
      if (this.frame > 0) {
        this.frame -= 1;
        this.foley.tick();
        this.emit();
      }
      if (this.frame === 0) {
        window.clearInterval(this.rewindTimer);
        window.setTimeout(() => {
          this.crankVel = 0;
          const crank = findPart(this.parts, "rewind");
          this.tween((v) => { crank.angle = v; }, crank.angle % (Math.PI * 2), 0, 200, easeOut);
          const shots = this.exposures.filter((e) => e.roll === this.roll).length;
          this.setStatus(
            shots > 0
              ? `ROLL ${this.roll} DEVELOPED (${shots} EXPOSURES) -- FRESH ZIMCHROME 400 LOADED`
              : "ROLL REWOUND -- FRESH ZIMCHROME 400 LOADED",
          );
          this.roll += 1;
          this.cocked = false;
          this.busy = "idle";
          this.emit();
        }, 260);
      }
    }, 110);
    this.emit();
  };

  cycleShutter = (d: number) => {
    this.foley.ensure();
    const n = SPEEDS.length;
    this.shutterIdx = ((this.shutterIdx + d) % n + n) % n;
    const dial = findPart(this.parts, "shutter-dial");
    this.tween((v) => { dial.angle = v; }, dial.angle, dial.angle - d * (Math.PI * 2 / n), 110, easeOut);
    this.foley.click();
    this.setStatus(`SHUTTER SPEED ${SPEEDS[this.shutterIdx].label}${this.shutterIdx === 0 ? " SEC" : ""}`);
  };

  cycleAperture = (d: number) => {
    this.foley.ensure();
    const n = FSTOPS.length;
    this.apertureIdx = ((this.apertureIdx + d) % n + n) % n;
    const ring = findPart(this.parts, "aperture");
    this.tween((v) => { ring.angle = v; }, ring.angle, ring.angle + d * 0.22, 110, easeOut);
    this.foley.click();
    this.setStatus(`APERTURE F/${FSTOPS[this.apertureIdx]}`);
  };

  cycleFocus = (d: number) => {
    this.foley.ensure();
    const n = FOCUS.length;
    this.focusIdx = ((this.focusIdx + d) % n + n) % n;
    const ring = findPart(this.parts, "focus");
    this.tween((v) => { ring.angle = v; }, ring.angle, ring.angle + d * 0.38, 130, easeOut);
    this.foley.click();
    this.setStatus(`FOCUS ${FOCUS[this.focusIdx]}`);
  };

  toggleMute = () => {
    this.foley.ensure();
    this.foley.muted = !this.foley.muted;
    this.setStatus(this.foley.muted ? "FOLEY MUTED" : "FOLEY LIVE");
  };

  dolly = (d: number) => {
    this.dist = Math.min(14, Math.max(5.5, this.dist + d));
    this.poke();
  };

  // ---- input ----------------------------------------------------------

  private onPointerDown = (e: PointerEvent) => {
    this.foley.ensure();
    this.viewport.setPointerCapture(e.pointerId);
    this.dragging = true;
    this.moved = 0;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.poke();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.dragging) {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.yaw += dx * 0.009;
      this.pitch = Math.min(1.15, Math.max(-0.12, this.pitch + dy * 0.009));
      this.vyaw = dx * 0.009;
      this.vpitch = dy * 0.009;
      this.poke();
    } else {
      const id = this.pickFromEvent(e, 1);
      if (id !== this.hoverId) {
        this.hoverId = id;
        const part = id > 0 ? partById(this.parts, id) : undefined;
        this.hoverLabel = part
          ? part.action
            ? `${part.name} -- ${ACTION_HINTS[part.action]}`
            : part.name
          : null;
        this.viewport.style.cursor = part?.action ? "pointer" : "grab";
        this.dirty = true;
        this.emit();
      }
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.moved < 6) {
      const id = this.pickFromEvent(e, 2);
      const part = id > 0 ? partById(this.parts, id) : undefined;
      if (part?.action) this.dispatch(part.action, e.shiftKey ? -1 : 1);
    }
    this.poke();
  };

  private onPointerLeave = () => {
    this.dragging = false;
    if (this.hoverId !== -1) {
      this.hoverId = -1;
      this.hoverLabel = null;
      this.dirty = true;
      this.emit();
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.dolly(e.deltaY * 0.004);
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const k = e.key.toLowerCase();
    if (k === " ") { e.preventDefault(); this.fire(); }
    else if (k === "w" || k === "a") this.wind();
    else if (k === "r") this.rewind();
    else if (k === "s") this.cycleShutter(-1);
    else if (k === "d") this.cycleShutter(1);
    else if (k === "z") this.cycleAperture(-1);
    else if (k === "x") this.cycleAperture(1);
    else if (k === ",") this.cycleFocus(-1);
    else if (k === ".") this.cycleFocus(1);
    else if (k === "m") this.toggleMute();
    else if (k === "arrowleft") { this.yaw -= 0.08; this.poke(); }
    else if (k === "arrowright") { this.yaw += 0.08; this.poke(); }
    else if (k === "arrowup") { this.pitch = Math.min(1.15, this.pitch + 0.06); this.poke(); }
    else if (k === "arrowdown") { this.pitch = Math.max(-0.12, this.pitch - 0.06); this.poke(); }
  };

  private dispatch(action: ActionId, dir: number) {
    if (action === "fire") this.fire();
    else if (action === "wind") this.wind();
    else if (action === "rewind") this.rewind();
    else if (action === "shutter-dial") this.cycleShutter(dir);
    else if (action === "aperture") this.cycleAperture(dir);
    else if (action === "focus") this.cycleFocus(dir);
  }

  private pickFromEvent(e: PointerEvent, radius: number): number {
    const rect = this.pre.getBoundingClientRect();
    if (rect.width === 0) return -1;
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * COLS);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * ROWS);
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return -1;
    return this.renderer.pickAt(col, row, radius);
  }

  // ---- internals -------------------------------------------------------

  private poke() {
    this.lastInteract = performance.now();
    this.idleRamp = 0;
    this.dirty = true;
  }

  private setStatus(s: string) {
    this.status = s;
    this.emit();
  }

  private tween(
    set: (v: number) => void,
    from: number,
    to: number,
    dur: number,
    ease: (t: number) => number,
    done?: () => void,
  ) {
    this.tweens.push({ set, from, to, dur, el: 0, ease, done });
    this.dirty = true;
  }

  private step(t: number) {
    const dt = Math.min(50, t - this.lastT);
    this.lastT = t;

    if (this.tweens.length > 0) {
      const finished: Tween[] = [];
      for (const tw of this.tweens) {
        tw.el += dt;
        const p = Math.min(1, tw.el / tw.dur);
        tw.set(tw.from + (tw.to - tw.from) * tw.ease(p));
        if (p >= 1) finished.push(tw);
      }
      this.tweens = this.tweens.filter((tw) => !finished.includes(tw));
      finished.forEach((tw) => tw.done?.());
      this.dirty = true;
    }

    if (this.crankVel > 0) {
      const crank = findPart(this.parts, "rewind");
      crank.angle += (this.crankVel * dt) / 1000;
      this.dirty = true;
    }

    // drift momentum after a flick
    if (!this.dragging && (Math.abs(this.vyaw) > 0.0004 || Math.abs(this.vpitch) > 0.0004)) {
      this.yaw += this.vyaw;
      this.pitch = Math.min(1.15, Math.max(-0.12, this.pitch + this.vpitch));
      this.vyaw *= 0.92;
      this.vpitch *= 0.92;
      this.dirty = true;
    }

    // slow idle turntable
    if (!this.reducedMotion && !this.dragging && t - this.lastInteract > 5000) {
      this.idleRamp = Math.min(1, this.idleRamp + dt / 2500);
      this.yaw += (dt / 1000) * 0.12 * easeInOut(this.idleRamp);
      this.dirty = true;
    }

    if (!this.dirty) return;
    this.dirty = this.iris < 1 || this.tweens.length > 0 || this.crankVel > 0;

    this.lastFrameText = this.renderer.render(this.parts, {
      yaw: this.yaw,
      pitch: this.pitch,
      dist: this.dist,
      targetY: 0.15,
      fov: (28 * Math.PI) / 180,
      cellAspect: CELL_ASPECT,
      iris: this.iris,
      irisLabel: this.irisLabel,
      hoverId: this.hoverId,
    });
    this.pre.textContent = this.lastFrameText;
  }

  private fitFont() {
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const fs = Math.min(rect.width / (COLS * CELL_ASPECT), rect.height / ROWS);
    this.pre.style.fontSize = `${fs}px`;
    this.pre.style.lineHeight = `${fs}px`;
    this.dirty = true;
  }

  /** Downsample the current frame into a little contact-print thumbnail. */
  private captureThumb(): string {
    const tw = 26, th = 9;
    const src = this.lastFrameText.split("\n");
    const lines: string[] = [];
    for (let y = 0; y < th; y++) {
      let line = "";
      const sy = Math.min(ROWS - 1, Math.floor(((y + 0.5) / th) * ROWS));
      for (let x = 0; x < tw; x++) {
        const sx = Math.min(COLS - 1, Math.floor(((x + 0.5) / tw) * COLS));
        line += src[sy]?.[sx] ?? " ";
      }
      lines.push(line);
    }
    return lines.join("\n");
  }

  private emit() {
    this.onChange?.({
      frame: this.frame,
      cocked: this.cocked,
      shutterIdx: this.shutterIdx,
      apertureIdx: this.apertureIdx,
      focusIdx: this.focusIdx,
      muted: this.foley.muted,
      roll: this.roll,
      busy: this.busy,
      status: this.status,
      hover: this.hoverLabel,
      exposures: this.exposures,
      meter: meterDelta(this.shutterIdx, this.apertureIdx),
    });
  }
}

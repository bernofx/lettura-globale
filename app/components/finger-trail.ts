type TrailPoint = { x: number; y: number };

const TRAIL_LIFETIME_MS = 420;
const REDUCED_TRAIL_LIFETIME_MS = 160;
const HALO_COLOR = "#d9d2fb";
const CORE_COLOR = "#ffffff";

/**
 * A light trail that follows a dragging finger or mouse on a canvas overlay.
 * New segments are drawn opaque and the whole canvas fades a little every
 * frame, so the trail is one continuous ribbon (no darker overlaps at the
 * joints) that dissolves evenly. The loop runs only while something is visible.
 */
export class FingerTrail {
  private last: TrailPoint | null = null;
  private pending: Array<[TrailPoint, TrailPoint]> = [];
  private frame = 0;
  private lastFrameAt = 0;
  private lastInputAt = 0;
  private readonly lifetime: number;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.lifetime = reduced ? REDUCED_TRAIL_LIFETIME_MS : TRAIL_LIFETIME_MS;
  }

  /** Adds a point in viewport coordinates (clientX/clientY). */
  add(x: number, y: number) {
    const bounds = this.canvas.getBoundingClientRect();
    const point = { x: x - bounds.left, y: y - bounds.top };
    this.pending.push([this.last ?? point, point]);
    this.last = point;
    this.lastInputAt = performance.now();
    this.schedule();
  }

  /** Ends the current stroke so the next drag does not connect to it. */
  end() {
    this.last = null;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.pending = [];
    this.last = null;
  }

  private schedule() {
    if (!this.frame) this.frame = requestAnimationFrame((time) => this.draw(time));
  }

  private draw(time: number) {
    this.frame = 0;
    const { canvas } = this;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(canvas.clientWidth * density);
    const height = Math.round(canvas.clientHeight * density);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(density, 0, 0, density, 0, 0);

    // Fade what is already drawn: after `lifetime` about 2% of it remains.
    const elapsed = this.lastFrameAt ? Math.min(time - this.lastFrameAt, this.lifetime) : 0;
    this.lastFrameAt = time;
    if (elapsed > 0) {
      context.globalCompositeOperation = "destination-out";
      context.fillStyle = `rgba(0, 0, 0, ${1 - Math.pow(0.02, elapsed / this.lifetime)})`;
      context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      context.globalCompositeOperation = "source-over";
    }

    context.lineCap = context.lineJoin = "round";
    for (const [color, lineWidth] of [[HALO_COLOR, 16], [CORE_COLOR, 5]] as const) {
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.beginPath();
      for (const [from, to] of this.pending) {
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
      }
      context.stroke();
    }
    this.pending = [];

    if (performance.now() - this.lastInputAt < this.lifetime) {
      this.schedule();
    } else {
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      this.lastFrameAt = 0;
    }
  }
}

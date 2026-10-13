// Polylane's dot lanes in the hero's right column: columns of dots, with Fern beams (the agent) running down them.
// Beams overlap, so one enters at the top as the last leaves at the bottom. Each beam lights the dots around it from
// its real position, even off canvas, so the glow arrives before the beam and leaves after it.
const PITCH = 8,
  LANE_GAP = 32,
  TAIL = 200,
  // Leading edge: dots just ahead of the head fade in instead of popping on as the head crosses them.
  EDGE = 16,
  SPEED = 0.09,
  GLOW_X = 64,
  GLOW_Y = 110,
  // Lane offsets from the right, cycled per beam.
  PATTERN = [4, 2, 6, 3, 5, 1];

const HUES = ["#33e6c5", "#4fa8ff", "#a47bff", "#ffc53d", "#ff7ab8"];

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smooth(e0: number, e1: number, x: number): number {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
}

export function drawLanes(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let w = 0,
    h = 0,
    lanes: number[] = [],
    frame = 0,
    inView = true;
  const running = () => inView && !document.hidden && !reduced.matches;

  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    const count = Math.max(1, Math.floor(w / LANE_GAP)),
      inset = (w - (count - 1) * LANE_GAP) / 2;
    lanes = Array.from({ length: count }, (_, i) => inset + i * LANE_GAP);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint(performance.now());
  }

  function dot(x: number, y: number, r: number, color: string, alpha: number) {
    if (alpha <= 0.004) return;
    ctx!.globalAlpha = Math.min(1, alpha);
    ctx!.fillStyle = color;
    ctx!.beginPath();
    ctx!.arc(x, y, r, 0, Math.PI * 2);
    ctx!.fill();
  }

  // Every beam starts above the canvas, far enough that its glow is not visible yet, and ends below it once its
  // tail and glow have left. A new beam starts halfway through the previous one's run.
  function beams(now: number) {
    const reach = GLOW_Y * 2.5,
      travel = h + TAIL + 2 * reach,
      duration = travel / SPEED,
      interval = duration / 2,
      // Open mid-run, with a beam already partway down.
      t = interval * 0.9 + (reduced.matches ? 0 : now),
      last = Math.floor(t / interval),
      out: { x: number; head: number }[] = [];
    for (let i = last; i >= 0 && t - i * interval <= duration; i--)
      out.push({
        x:
          lanes[
            Math.max(0, lanes.length - 1 - PATTERN[i % PATTERN.length])
          ] ?? 0,
        head: -reach + (t - i * interval) * SPEED,
      });
    return out;
  }

  function paint(now: number) {
    const dark = document.documentElement.dataset.theme === "dark",
      base = dark ? "#8b8d93" : "#8a8c93",
      body = dark ? "#3ff35d" : "#06a22a",
      lead = dark ? "#e6ffea" : "#06c735",
      active = beams(now);
    ctx!.clearRect(0, 0, w, h);

    for (const lx of lanes) {
      for (let y = PITCH / 2; y < h; y += PITCH) {
        let glow = 0;
        for (const b of active) {
          // Distance to the beam as a segment, head to tail, so the light runs along the whole beam.
          const along =
              y > b.head ? y - b.head : y < b.head - TAIL ? b.head - TAIL - y : 0,
            fall = y < b.head ? 1 - (0.6 * Math.min(TAIL, b.head - y)) / TAIL : 1,
            dx = lx - b.x;
          glow +=
            fall *
            Math.exp(
              -(dx * dx) / (2 * GLOW_X * GLOW_X) -
                (along * along) / (2 * GLOW_Y * GLOW_Y),
            );
        }
        glow = Math.min(1, glow);
        dot(lx, y, 1.2, base, (dark ? 0.16 : 0.12) * smooth(0, 40, y) + 0.22 * glow);
        if (glow > 0.03) {
          const hue = HUES[Math.floor(hash(y, lx) * HUES.length)];
          dot(lx, y, 1.4, hash(lx, y) < 0.5 ? hue : body, glow * 0.55);
        }
      }
    }

    for (const b of active)
      for (const [offset, strength, length] of [
        [0, 1, 1],
        [-LANE_GAP / 4, 0.4, 0.55],
        [LANE_GAP / 4, 0.4, 0.55],
      ]) {
        const x = b.x + offset;
        for (
          let y = Math.floor((b.head + EDGE) / PITCH) * PITCH + PITCH / 2;
          y > b.head - TAIL * length;
          y -= PITCH
        ) {
          if (y < -PITCH || y > h + PITCH) continue;
          const k =
              y > b.head
                ? 1 - (y - b.head) / EDGE
                : Math.pow(1 - (b.head - y) / (TAIL * length), 1.4),
            near = y > b.head - PITCH * 1.5,
            color = near
              ? lead
              : hash(x, y) < 0.1 + 0.4 * (b.head - y) / (TAIL * length)
                ? HUES[Math.floor(hash(y, x) * 3)]
                : body;
          dot(x, y, 1.3 + 0.9 * k * strength, color, k * strength);
        }
      }
    ctx!.globalAlpha = 1;
  }

  function tick(now: number) {
    paint(now);
    frame = running() ? requestAnimationFrame(tick) : 0;
  }
  function start() {
    if (!frame && running()) frame = requestAnimationFrame(tick);
  }

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver((entries) => {
    inView = entries.some((e) => e.isIntersecting);
    start();
  }).observe(canvas);
  document.addEventListener("visibilitychange", start);
  new MutationObserver(() => paint(performance.now())).observe(
    document.documentElement,
    { attributes: true, attributeFilter: ["data-theme"] },
  );
  reduced.addEventListener("change", () =>
    reduced.matches ? paint(0) : start(),
  );
  resize();
  start();
}

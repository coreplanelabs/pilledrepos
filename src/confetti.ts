/** One short celebration when a top-ten repo page opens. */
export function celebrateRank(rank: number | undefined): void {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (!rank || rank > 10 || reduced.matches) return;
  const canvas = document.createElement("canvas");
  canvas.id = "rank-confetti";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return;
  }
  const width = innerWidth,
    height = innerHeight,
    ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);
  const colors = ["#3FF35D", "#AB69EB", "#FFC857", "#FAFAFA"];
  const particles = Array.from({ length: 72 }, (_, i) => ({
    x: width * 0.5,
    y: Math.min(height * 0.28, 220),
    vx: (Math.random() - 0.5) * Math.min(width * 0.9, 720),
    vy: -180 - Math.random() * 320,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 10,
    color: colors[i % colors.length],
  }));
  let frame = 0,
    start = performance.now();
  function stop() {
    cancelAnimationFrame(frame);
    canvas.remove();
    reduced.removeEventListener("change", stop);
  }
  reduced.addEventListener("change", stop);
  function draw(now: number) {
    const seconds = (now - start) / 1000;
    if (seconds >= 3) {
      stop();
      return;
    }
    context!.clearRect(0, 0, width, height);
    context!.globalAlpha = Math.min(1, 3 - seconds);
    for (const p of particles) {
      context!.save();
      context!.translate(
        p.x + p.vx * seconds,
        p.y + p.vy * seconds + 240 * seconds * seconds,
      );
      context!.rotate(p.rotation + p.spin * seconds);
      context!.fillStyle = p.color;
      context!.fillRect(-3, -5, 6, 10);
      context!.restore();
    }
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
}

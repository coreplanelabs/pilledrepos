export function helpPosition(anchor: { left: number; right: number; top: number; bottom: number }, size: { width: number; height: number }, viewport: { width: number; height: number }): { left: number; top: number } {
  const gap = 10, inset = 12;
  const left = Math.max(inset, Math.min((anchor.left + anchor.right - size.width) / 2, viewport.width - size.width - inset));
  const preferred = anchor.top - size.height - gap;
  const top = Math.max(inset, Math.min(preferred >= inset ? preferred : anchor.bottom + gap, viewport.height - size.height - inset));
  return { left, top };
}

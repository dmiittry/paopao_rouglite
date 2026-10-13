// Original geometric illustrations generated from a catalogue ID. No external assets.
export function emblem(id, icon = "✦", color = "#d8b574") {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const count = 5 + (hash % 4),
    points = Array.from({ length: count * 2 }, (_, i) => {
      const r = i % 2 ? 23 : 43,
        a = (Math.PI * i) / count - Math.PI / 2;
      return `${60 + Math.cos(a) * r},${60 + Math.sin(a) * r}`;
    }).join(" ");
  return `<svg class="emblem" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="53" fill="none" stroke="${color}" opacity=".16"/><circle cx="60" cy="60" r="46" fill="none" stroke="${color}" opacity=".32" stroke-dasharray="2 5"/><polygon points="${points}" fill="${color}" fill-opacity=".07" stroke="${color}" stroke-opacity=".5"/><path d="M12 60h20m56 0h20M60 12v20m0 56v20" stroke="${color}" opacity=".55"/><text x="60" y="72" text-anchor="middle" fill="${color}" font-family="Georgia,serif" font-size="36">${icon}</text></svg>`;
}
export const escapeHTML = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

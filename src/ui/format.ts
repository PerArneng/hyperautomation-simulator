/** Formatting used across the app. Amounts are kr. */
export function kr(value: number, digits = 1): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(digits)} bn kr`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(digits)} M kr`;
  if (abs >= 1e4) return `${sign}${Math.round(abs / 1e3)} k kr`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} k kr`;
  return `${sign}${Math.round(abs)} kr`;
}

export function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits).replace("-", "−")}%`;
}

export function num(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dateLong(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function monthYear(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function efficiency(level: number): string {
  const m = 1 / Math.max(0.05, 1 - level);
  return m < 1.995 ? `×${m.toFixed(2)}` : `×${m.toFixed(m < 10 ? 1 : 0)}`;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", html = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

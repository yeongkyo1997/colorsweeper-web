// 판 좌표 계산 헬퍼

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 북쪽부터 시계 방향
export const DIRS8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
export const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

export function offsetCells(i, w, h, offsets) {
  const x = i % w, y = (i / w) | 0, out = [];
  for (const [dx, dy] of offsets) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
  }
  return out;
}

export const neighbors = (i, w, h) => offsetCells(i, w, h, DIRS8);
export const knightCells = (i, w, h) => offsetCells(i, w, h, KNIGHT);

export function rayCells(i, w, h, d) {
  const [dx, dy] = DIRS8[d];
  const out = [];
  for (let x = (i % w) + dx, y = ((i / w) | 0) + dy; x >= 0 && y >= 0 && x < w && y < h; x += dx, y += dy) {
    out.push(y * w + x);
  }
  return out;
}

export function lineCells(w, h) {
  const rows = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => y * w + x));
  const cols = Array.from({ length: w }, (_, x) => Array.from({ length: h }, (_, y) => y * w + x));
  return { rows, cols };
}

export const isSingle = (m) => m !== 0 && (m & (m - 1)) === 0;
export const bitIndex = (m) => 31 - Math.clz32(m);

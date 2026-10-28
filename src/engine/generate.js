// 퍼즐 생성기. 원본 PuzzleInfo(X, Y, ColorCount, RuleSet, Seed) 에 해당하는 옵션을 받는다.
import {
  ARROWS, knightCells, lineCells, mulberry32, neighbors, offsetCells, rayCells, shuffle,
} from './grid.js';
import { buildConstraints, lineValue, solve, solveKnown } from './solver.js';

const RUNES = ['ᚠ', 'ᚱ', 'ᛟ', 'ᛉ', 'ᚦ'];
const HIDE_RATIO = 0.4; // 은폐 규칙에서 감출 단서의 최대 비율
const PREVIEW_RATIO = 0.12;
const DISGUISE_RATIO = 0.3;

const sameCount = (sol, i, cells) => cells.filter((j) => sol[j] === sol[i]).length;

// 대칭: 행/열 위 구간의 색을 좌우(상하) 대칭으로 만든다
function placeSymmetry(p, rnd) {
  const { w, h, sol } = p;
  const used = new Set();
  const target = Math.max(2, Math.round((w * h) / 18));
  for (let tries = 0; tries < 200 && p.symbols.filter(Boolean).length < target * 2; tries++) {
    const horiz = rnd() < 0.5;
    const dim = horiz ? w : h;
    const len = 3 + Math.floor(rnd() * Math.min(4, dim - 2));
    const start = Math.floor(rnd() * (dim - len + 1));
    const fixed = Math.floor(rnd() * (horiz ? h : w));
    const cells = Array.from({ length: len }, (_, t) => (horiz ? fixed * w + start + t : (start + t) * w + fixed));
    if (cells.some((c) => used.has(c))) continue;
    cells.forEach((c) => used.add(c));
    for (let t = 0; t < len / 2; t++) {
      sol[cells[len - 1 - t]] = sol[cells[t]];
      if (t !== len - 1 - t) p.equal.push([cells[t], cells[len - 1 - t]]);
    }
    p.symbols[cells[0]] = horiz ? '▶' : '▼';
    p.symbols[cells[len - 1]] = horiz ? '◀' : '▲';
  }
}

// 패턴: 같은 룬 칸들의 주변 8칸 배치를 똑같이 만든다
function placePattern(p, rnd) {
  const { w, h, sol } = p;
  const used = new Set();
  const block = (i) => [i, ...neighbors(i, w, h)];
  const inner = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) inner.push(y * w + x);
  const pairs = Math.max(1, Math.round((w * h) / 32));
  let rune = 0;
  for (let tries = 0; tries < 300 && rune < Math.min(pairs, RUNES.length); tries++) {
    const [a, b] = shuffle(inner, rnd);
    if ([...block(a), ...block(b)].some((c) => used.has(c))) continue;
    if (block(a).some((c) => block(b).includes(c))) continue;
    block(a).concat(block(b)).forEach((c) => used.add(c));
    const offs = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    for (const off of offs) {
      const [ca] = offsetCells(a, w, h, [off]);
      const [cb] = offsetCells(b, w, h, [off]);
      sol[cb] = sol[ca];
      p.equal.push([ca, cb]);
    }
    p.symbols[a] = p.symbols[b] = RUNES[rune++];
  }
}

function countClue(kind, cells, value, extra = {}) {
  return { type: 'count', kind, cells, values: [value], shown: value, ...extra };
}

export function generate(opts) {
  const {
    w, h, colors, seed,
    cellRule = 'standard', lineRule = null,
    hide = false, preview = false, disguise = false,
  } = opts;
  const rnd = mulberry32(seed);
  const n = w * h;
  const p = {
    w, h, colors, seed, opts,
    sol: Array.from({ length: n }, () => Math.floor(rnd() * colors)),
    clues: [], couples: [], equal: [], lineClues: [],
    symbols: new Array(n).fill(null),
  };

  if (cellRule === 'symmetry') placeSymmetry(p, rnd);
  if (cellRule === 'pattern') placePattern(p, rnd);
  const { sol } = p;

  // 칸 단서: 기본은 표준(주변 8칸)
  for (let i = 0; i < n; i++) {
    const cells = neighbors(i, w, h);
    p.clues[i] = countClue('standard', cells, sameCount(sol, i, cells));
  }
  if (cellRule === 'knight') {
    for (let i = 0; i < n; i++) {
      const cells = knightCells(i, w, h);
      if (sameCount(sol, i, cells) === 1 && rnd() < 0.5) p.clues[i] = countClue('knight', cells, 1);
    }
  }
  if (cellRule === 'ray') {
    for (let i = 0; i < n; i++) {
      if (rnd() > 0.45) continue;
      const dirs = [0, 1, 2, 3, 4, 5, 6, 7].filter((d) => rayCells(i, w, h, d).length >= 2);
      if (!dirs.length) continue;
      const dir = dirs[Math.floor(rnd() * dirs.length)];
      const cells = rayCells(i, w, h, dir);
      p.clues[i] = countClue('ray', cells, sameCount(sol, i, cells), { dir, arrow: ARROWS[dir] });
    }
  }
  if (cellRule === 'couple') {
    const used = new Set();
    const limit = Math.max(2, Math.round(n / 9));
    for (const i of shuffle([...Array(n).keys()], rnd)) {
      if (p.couples.length >= limit || used.has(i)) continue;
      const mates = offsetCells(i, w, h, [[1, 0], [0, 1], [-1, 0], [0, -1]])
        .filter((j) => !used.has(j) && p.clues[j].shown === p.clues[i].shown);
      if (!mates.length) continue;
      const j = mates[Math.floor(rnd() * mates.length)];
      used.add(i).add(j);
      p.couples.push([i, j]);
      p.clues[i] = { type: 'couple', cells: p.clues[i].cells, shown: p.clues[i].shown };
      p.clues[j] = { type: 'couple', cells: p.clues[j].cells, shown: p.clues[j].shown };
    }
  }
  if (disguise) {
    // 위장: 일부 표준 숫자를 2배로 보여 준다. 플레이어는 어느 것인지 모르므로 짝수는 모두 n 또는 n/2.
    for (const cl of p.clues) {
      if (cl.kind !== 'standard') continue;
      const v = cl.values[0];
      if (v > 0 && v * 2 <= cl.cells.length && rnd() < DISGUISE_RATIO) {
        cl.shown = v * 2;
        cl.disguised = true;
      }
      cl.values = cl.shown > 0 && cl.shown % 2 === 0 ? [cl.shown / 2, cl.shown] : [cl.shown];
    }
  }
  if (preview) {
    for (const i of shuffle([...Array(n).keys()], rnd).slice(0, Math.round(n * PREVIEW_RATIO))) {
      if (p.clues[i].type === 'count') p.clues[i].preview = true;
    }
  }
  if (lineRule) {
    const { rows, cols } = lineCells(w, h);
    for (const [axis, list] of [['row', rows], ['col', cols]]) {
      list.forEach((cells, index) => {
        const color = lineRule === 'block' ? Math.floor(rnd() * colors) : undefined;
        const value = lineValue(lineRule, cells.map((c) => sol[c]), color);
        p.lineClues.push({ axis, index, cells, kind: lineRule, value, color });
      });
    }
  }

  const sys = buildConstraints(p);

  // 추리로 풀릴 때까지 주어진 칸을 늘린 뒤, 필요 없는 칸은 다시 뺀다
  const given = new Int8Array(n).fill(-1);
  const order = shuffle([...Array(n).keys()], rnd);
  for (const i of order.slice(0, Math.max(2, Math.round(n * 0.06)))) given[i] = sol[i];
  for (;;) {
    const known = solveKnown(p, given, sys);
    const i = order.find((k) => known[k] < 0);
    if (i === undefined) break;
    given[i] = sol[i];
  }
  for (const i of order) {
    if (given[i] < 0) continue;
    given[i] = -1;
    if (!solve(p, given, sys)) given[i] = sol[i];
  }
  p.given = Array.from(given);

  // 은폐: 감춰도 여전히 추리로 풀리는 숫자 단서만 감춘다
  if (hide) {
    let left = Math.round(n * HIDE_RATIO);
    for (const i of shuffle([...Array(n).keys()], rnd)) {
      const cl = p.clues[i];
      if (!left) break;
      if (cl.type !== 'count' || cl.preview) continue;
      cl.hidden = true;
      if (solve(p, given, sys)) left--;
      else cl.hidden = false;
    }
  }
  return p;
}

// 퍼즐 생성기. 원본 PuzzleInfo(X, Y, ColorCount, RuleSet, Seed) 에 해당하는 옵션을 받는다.
import {
  ARROWS, DIRS8, knightCells, lineCells, mulberry32, neighbors, offsetCells, rayCells, shuffle,
} from './grid.js';
import { buildConstraints, lineValue, solve, solveKnown } from './solver.js';

const RUNES = ['ᚠ', 'ᚱ', 'ᛟ', 'ᛉ', 'ᚦ'];
const DISGUISE_RATIO = 0.5;

const sameCount = (sol, i, cells) => cells.filter((j) => sol[j] === sol[i]).length;

// A 에서 B 쪽으로 한 칸 이동하는 방향 (DIRS8 번호)
function dirToward(a, b, w) {
  const dx = Math.sign((b % w) - (a % w));
  const dy = Math.sign(((b / w) | 0) - ((a / w) | 0));
  return DIRS8.findIndex(([x, y]) => x === dx && y === dy);
}

// 원본 RayRule.RandomizeOption(0x2144644): 상하좌우 중 한 방향, 값 ≤ 4, 정확히 ⌊칸 수/4⌋칸
function placeRay(p, rnd) {
  const { w, h, sol } = p;
  const options = [];
  for (let i = 0; i < w * h; i++) {
    const dirs = [0, 2, 4, 6].filter((d) => {
      const cells = rayCells(i, w, h, d);
      return cells.length >= 1 && sameCount(sol, i, cells) <= 4;
    });
    if (dirs.length) options.push([i, dirs]);
  }
  for (const [i, dirs] of shuffle(options, rnd).slice(0, Math.floor((w * h) / 4))) {
    const dir = dirs[Math.floor(rnd() * dirs.length)];
    const cells = rayCells(i, w, h, dir);
    p.clues[i] = countClue('ray', cells, sameCount(sol, i, cells), { dir, arrow: ARROWS[dir] });
  }
}

// 원본 CoupleRule.RandomizeOption(0x212b154): 표준 숫자가 같은 상하좌우 이웃 쌍을 모아
// 다른 색 쌍을 우선해(같은 색이면 +0.3) 겹치지 않게 ⌈⌊칸 수/5⌋/2⌉쌍 고른다
function placeCouple(p, rnd) {
  const { w, h, sol } = p;
  const cand = [];
  for (let i = 0; i < w * h; i++) {
    for (const j of offsetCells(i, w, h, [[1, 0], [0, 1]])) {
      if (p.clues[i].shown === p.clues[j].shown) cand.push({ i, j, key: rnd() + (sol[i] === sol[j] ? 0.3 : 0) });
    }
  }
  cand.sort((a, b) => a.key - b.key);
  const limit = Math.ceil(Math.floor((w * h) / 5) / 2);
  const used = new Set();
  for (const { i, j } of cand) {
    if (p.couples.length >= limit) break;
    if (used.has(i) || used.has(j)) continue;
    used.add(i).add(j);
    p.couples.push([i, j]);
    for (const [a, b] of [[i, j], [j, i]]) {
      p.clues[a] = { type: 'couple', partner: b, dir: dirToward(a, b, w), cells: p.clues[a].cells, shown: p.clues[a].shown };
    }
  }
}

// 원본 SymmetryRule.RandomizeOption/FindPalin(0x2148228, 0x2148bb0):
// 정답에 이미 있는 회문 구간(가로·세로·두 대각선, 짝수 2칸 이상·홀수 3칸 이상)을 찾아
// 길이 + 2×색 종류 + 난수[0,3) 순으로 골라 총 길이가 ⌊칸 수/5⌋가 될 때까지 둔다
function placeSymmetry(p, rnd) {
  const { w, h, sol } = p;
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? y * w + x : -1);
  const segs = [];
  [[1, 0], [0, 1], [1, 1], [1, -1]].forEach(([dx, dy], line) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      for (const even of [0, 1]) {
        // 홀수: (x,y) 가 중심, 짝수: (x,y) 와 다음 칸 사이가 중심
        for (let r = even ? 0 : 1; ; r++) {
          const a = at(x - r * dx, y - r * dy);
          const b = at(x + (r + even) * dx, y + (r + even) * dy);
          if (a < 0 || b < 0 || sol[a] !== sol[b]) break;
          const cells = [];
          for (let t = -r; t <= r + even; t++) cells.push(at(x + t * dx, y + t * dy));
          const score = cells.length + 2 * new Set(cells.map((c) => sol[c])).size + rnd() * 3;
          segs.push({ a, b, cells, line, score });
        }
      }
    }
  });
  segs.sort((s, t) => t.score - s.score);
  const budget = Math.floor((w * h) / 5);
  const chosen = [];
  let total = 0;
  for (const s of segs) {
    if (total >= budget) break;
    const ends = new Set(chosen.flatMap((c) => [c.a, c.b]));
    if (ends.has(s.a) || ends.has(s.b)) continue;
    if (chosen.some((c) => c.line === s.line && c.cells.some((x) => s.cells.includes(x)))) continue;
    chosen.push(s);
    total += s.cells.length;
  }
  for (const s of chosen) {
    for (const [a, b] of [[s.a, s.b], [s.b, s.a]]) {
      p.clues[a] = { type: 'symmetry', partner: b, dir: dirToward(a, b, w) };
    }
  }
}

// 원본 PatternRule.RandomizeOption(0x213bbc8): 칸마다 "주변 8칸이 내 색과 같은가" 무늬를 구해
// 같은 무늬 칸이 2개 이상인 무리 중 가중치 높은 것부터 최대 3무리, 표시 칸이 ⌊칸 수/15⌋를 넘으면 멈춘다
function placePattern(p, rnd) {
  const { w, h, sol } = p;
  const n = w * h;
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    let code = 0;
    DIRS8.forEach((off, k) => {
      const [j] = offsetCells(i, w, h, [off]);
      if (j !== undefined && sol[j] === sol[i]) code |= 1 << k;
    });
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(i);
  }
  const pool = [...groups].filter(([, cells]) => cells.length >= 2).map(([code, cells]) => {
    const same = DIRS8.filter((_, k) => code & (1 << k)).length;
    return { code, cells, weight: 2 * cells.length + (same ? 30 : 0) + (same >= 3 ? 10 : 0) + rnd() };
  });
  const limit = Math.floor(n / 15);
  const ids = shuffle([0, 1, 2, 3, 4], rnd);
  let marked = 0;
  for (let k = 0; k < 3 && marked <= limit && pool.length; k++) {
    pool.sort((a, b) => b.weight - a.weight);
    const g = pool.shift();
    const symbol = ids[k];
    p.patterns.push({ symbol, code: g.code, cells: g.cells });
    for (const i of g.cells) p.clues[i] = { type: 'pattern', symbol, rune: RUNES[symbol] };
    marked += g.cells.length;
    // 새로 표시한 칸 옆에 있는 칸 수만큼 다른 무리의 가중치를 낮춘다
    const near = new Set(g.cells.flatMap((i) => neighbors(i, w, h)));
    for (const o of pool) o.weight -= o.cells.filter((c) => near.has(c)).length;
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
    clues: [], couples: [], patterns: [], lineClues: [],
  };
  const { sol } = p;

  // 칸 단서: 기본은 표준(주변 8칸). 다른 칸 규칙이 있는 칸은 그 규칙 단서로 바뀐다(원본 Map.GetFirstRuleAndValue).
  for (let i = 0; i < n; i++) {
    const cells = neighbors(i, w, h);
    p.clues[i] = countClue('standard', cells, sameCount(sol, i, cells));
  }
  if (cellRule === 'knight') {
    // 원본 KnightRule.Init(0x2137474): 나이트 이동 칸 중 같은 색이 정확히 1칸인 칸은 모두 표시
    for (let i = 0; i < n; i++) {
      const cells = knightCells(i, w, h);
      if (sameCount(sol, i, cells) === 1) p.clues[i] = countClue('knight', cells, 1);
    }
  }
  if (cellRule === 'ray') placeRay(p, rnd);
  if (cellRule === 'couple') placeCouple(p, rnd);
  if (cellRule === 'symmetry') placeSymmetry(p, rnd);
  if (cellRule === 'pattern') placePattern(p, rnd);
  if (lineRule) {
    const { rows, cols } = lineCells(w, h);
    for (const [axis, list] of [['row', rows], ['col', cols]]) {
      list.forEach((cells, index) => {
        const color = lineRule === 'block' ? Math.floor(rnd() * colors) : undefined;
        const value = lineValue(lineRule, cells.map((c) => sol[c]), color);
        p.lineClues.push({ axis, index, cells, kind: lineRule, value, values: [value], color });
      });
    }
  }
  if (disguise) {
    // 원본 DisguisedZeroRule: 숫자 단서(표준·방향·줄)마다 50% 확률로 2배를 보여 준다.
    // 플레이어는 어느 것인지 모르므로 0·홀수는 그대로, 짝수 k 는 k 또는 k/2.
    const maxOf = (cl) => {
      if (cl.kind === 'standard') return cl.cells.length + 1;
      if (cl.kind === 'ray') return cl.cells.length;
      const L = cl.cells.length;
      return { streak: L, block: Math.ceil(L / 2), duo: Math.floor(L / 2) }[cl.kind];
    };
    for (const cl of [...p.clues.filter((c) => c.kind === 'standard' || c.kind === 'ray'), ...p.lineClues]) {
      const v = cl.values[0];
      cl.shown = v;
      if (rnd() < DISGUISE_RATIO && v * 2 <= maxOf(cl)) {
        cl.shown = v * 2;
        cl.disguised = v > 0;
      }
      cl.values = cl.shown > 0 && cl.shown % 2 === 0 ? [cl.shown / 2, cl.shown] : [cl.shown];
    }
  }

  const sys = buildConstraints(p);
  const canPreview = (i) => preview && p.clues[i].type === 'count';
  const previewLimit = Math.floor((h * h) / 2);
  const previewCount = () => p.clues.filter((c) => c.preview).length;

  // 원본 NeoPuzzleBuilder.BottomUp: 주어진 칸 없이(패턴 룬 칸만 열고) 시작해, 막히면 아직 추리하지 못한
  // 칸 하나를 무작위로 연다. 미리보기 규칙이면 먼저 미리보기로 열어 보고, 다시 뽑히면 그때 연다.
  const given = new Int8Array(n).fill(-1);
  for (const g of p.patterns) for (const i of g.cells) given[i] = sol[i];
  for (;;) {
    const known = solveKnown(p, given, sys);
    const rest = [...Array(n).keys()].filter((k) => known[k] < 0);
    if (!rest.length) break;
    const i = rest[Math.floor(rnd() * rest.length)];
    if (canPreview(i) && !p.clues[i].preview && previewCount() < previewLimit) p.clues[i].preview = true;
    else given[i] = sol[i];
  }
  // TopDown: 무작위 순서로(패턴 칸은 마지막에) 필요 없는 칸을 닫는다.
  // 미리보기 규칙이면 주어진 칸을 바로 닫지 않고 미리보기로 바꾼 뒤, 미리보기를 닫는다.
  const order = shuffle([...Array(n).keys()], rnd).sort(
    (a, b) => (p.clues[a].type === 'pattern') - (p.clues[b].type === 'pattern'),
  );
  const tryChange = (apply, undo) => {
    apply();
    if (!solve(p, given, sys)) undo();
  };
  for (const i of order) {
    if (given[i] < 0) continue;
    if (!preview) tryChange(() => { given[i] = -1; }, () => { given[i] = sol[i]; });
    else if (canPreview(i) && !p.clues[i].preview) {
      tryChange(() => { given[i] = -1; p.clues[i].preview = true; }, () => { given[i] = sol[i]; p.clues[i].preview = false; });
    }
  }
  if (preview) {
    for (const i of order) {
      if (p.clues[i].preview) tryChange(() => { p.clues[i].preview = false; }, () => { p.clues[i].preview = true; });
    }
  }
  p.given = Array.from(given);

  // 원본 TopDownHideBehind: 비율 없이, 풀이가 유지되는 한 단서를 모두 가린다.
  // 순서는 표준 → 방향·줄 → 기사, 같은 순위 안에서는 무작위. 미리보기·커플·대칭·패턴은 가리지 않는다.
  if (hide) {
    const rank = { standard: 0, ray: 1, streak: 1, block: 1, duo: 1, knight: 2 };
    const targets = [
      ...p.clues.filter((c) => c.type === 'count' && !c.preview),
      ...p.lineClues,
    ].map((c) => ({ c, key: rank[c.kind] + rnd() * 0.5 }));
    targets.sort((a, b) => a.key - b.key);
    for (const { c } of targets) tryChange(() => { c.hidden = true; }, () => { c.hidden = false; });
  }
  return p;
}

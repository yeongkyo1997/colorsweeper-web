// 제약 전파 풀이기.
// cand[i] = 칸 i 에 가능한 색 비트마스크, known[i] = 플레이어가 칠한(확정해 본) 색 또는 -1.
// 모든 전파는 정답과 모순되지 않는 추론만 하므로, 생성된 정답은 항상 후보에 남는다.
import { bitIndex, isSingle } from './grid.js';

function countRange(cand, S, bit) {
  let a = 0;
  const open = [];
  for (const j of S) {
    if (cand[j] === bit) a++;
    else if (cand[j] & bit) open.push(j);
  }
  return [a, open];
}

// 색 bit 인 칸이 S 안에 V 중 하나만큼 있어야 할 때 후보를 줄인다
function applyCount(cand, S, bit, V) {
  const [a, open] = countRange(cand, S, bit);
  if (!open.length) return false;
  const ok = V.filter((v) => v >= a && v <= a + open.length);
  if (!ok.length) return false;
  if (ok[ok.length - 1] === a) {
    for (const j of open) cand[j] &= ~bit;
    return true;
  }
  if (ok[0] === a + open.length) {
    for (const j of open) cand[j] = bit;
    return true;
  }
  return false;
}

// 숫자 단서(표준·기사·방향·위장·미리보기): self 칸과 같은 색이 cells 에 values 중 하나만큼 있다
function countConstraint(self, clue) {
  return {
    scope: [self, ...clue.cells],
    propagate(cand, known) {
      if (clue.hidden || (known[self] < 0 && !clue.preview)) return false;
      let changed = false;
      if (!isSingle(cand[self])) {
        // 미리보기: 색을 모르는 칸은 단서를 만족할 수 없는 색을 뺀다
        for (let c = 0; 1 << c <= cand[self]; c++) {
          const bit = 1 << c;
          if (!(cand[self] & bit)) continue;
          const [a, open] = countRange(cand, clue.cells, bit);
          if (!clue.values.some((v) => v >= a && v <= a + open.length)) {
            cand[self] &= ~bit;
            changed = true;
          }
        }
      }
      if (isSingle(cand[self])) changed = applyCount(cand, clue.cells, cand[self], clue.values) || changed;
      return changed;
    },
  };
}

// 커플: 두 칸의 (표준) 숫자가 같다
function coupleConstraint(A, SA, B, SB) {
  return {
    scope: [A, B, ...SA, ...SB],
    propagate(cand, known) {
      if (known[A] < 0 || known[B] < 0) return false;
      const [a1, o1] = countRange(cand, SA, cand[A]);
      const [a2, o2] = countRange(cand, SB, cand[B]);
      const V = [];
      for (let v = Math.max(a1, a2); v <= Math.min(a1 + o1.length, a2 + o2.length); v++) V.push(v);
      const c1 = applyCount(cand, SA, cand[A], V);
      const c2 = applyCount(cand, SB, cand[B], V);
      return c1 || c2;
    },
  };
}

// 대칭·패턴: 짝지어진 칸의 색이 같다
function equalConstraint(pairs) {
  return {
    scope: [...new Set(pairs.flat())],
    propagate(cand) {
      let changed = false;
      for (const [i, j] of pairs) {
        const m = cand[i] & cand[j];
        if (m !== cand[i] || m !== cand[j]) {
          cand[i] = cand[j] = m;
          changed = true;
        }
      }
      return changed;
    },
  };
}

// 줄 단서 상태 = (직전 색 + 1) + 6 * (현재 블록 길이 + 16 * 누적값)
const enc = (last, run, acc) => last + 1 + 6 * (run + 16 * acc);
const dec = (s) => [(s % 6) - 1, ((s / 6) | 0) % 16, (s / 96) | 0];

export const LINE_SPECS = {
  // 연속: 가장 긴 블록 길이 = value
  streak: (value) => ({
    step(s, c) {
      const [last, run, acc] = dec(s);
      const r = c === last ? run + 1 : 1;
      const m = Math.max(acc, r);
      return m > value ? -1 : enc(c, r, m);
    },
    accept: (s) => dec(s)[2] === value,
  }),
  // 블록: color 색 블록 수 = value
  block: (value, color) => ({
    step(s, c) {
      const [last, , acc] = dec(s);
      const n = acc + (c === color && last !== color ? 1 : 0);
      return n > value ? -1 : enc(c, 0, n);
    },
    accept: (s) => dec(s)[2] === value,
  }),
  // 듀오: 길이가 정확히 2인 블록 수 = value
  duo: (value) => ({
    step(s, c) {
      const [last, run, acc] = dec(s);
      if (c === last) return enc(c, Math.min(run + 1, 3), acc);
      const n = acc + (run === 2 ? 1 : 0);
      return n > value ? -1 : enc(c, 1, n);
    },
    accept: (s) => {
      const [, run, acc] = dec(s);
      return acc + (run === 2 ? 1 : 0) === value;
    },
  }),
};

export function lineValue(kind, colors, color) {
  let max = 0, blocks = 0, duos = 0, run = 0;
  colors.forEach((c, t) => {
    run = t > 0 && c === colors[t - 1] ? run + 1 : 1;
    max = Math.max(max, run);
    if (c === color && run === 1) blocks++;
    if (t === colors.length - 1 || colors[t + 1] !== c) if (run === 2) duos++;
  });
  return { streak: max, block: blocks, duo: duos }[kind];
}

// 줄 전체를 DP 로 훑어 각 칸에 가능한 색만 남긴다
function lineConstraint(cells, colors, spec) {
  return {
    scope: cells,
    propagate(cand) {
      const L = cells.length;
      const fw = [new Set([enc(-1, 0, 0)])];
      for (let t = 0; t < L; t++) {
        const next = new Set();
        for (const s of fw[t])
          for (let c = 0; c < colors; c++) {
            if (!(cand[cells[t]] & (1 << c))) continue;
            const u = spec.step(s, c);
            if (u >= 0) next.add(u);
          }
        fw.push(next);
      }
      let alive = new Set([...fw[L]].filter(spec.accept));
      const allowed = new Array(L).fill(0);
      for (let t = L - 1; t >= 0; t--) {
        const prev = new Set();
        for (const s of fw[t])
          for (let c = 0; c < colors; c++) {
            if (!(cand[cells[t]] & (1 << c))) continue;
            if (alive.has(spec.step(s, c))) {
              prev.add(s);
              allowed[t] |= 1 << c;
            }
          }
        alive = prev;
      }
      let changed = false;
      cells.forEach((j, t) => {
        const m = cand[j] & allowed[t];
        if (m && m !== cand[j]) {
          cand[j] = m;
          changed = true;
        }
      });
      return changed;
    },
  };
}

export function buildConstraints(p) {
  const cons = [];
  p.clues.forEach((cl, i) => {
    if (cl && cl.type === 'count') cons.push(countConstraint(i, cl));
  });
  for (const [a, b] of p.couples) cons.push(coupleConstraint(a, p.clues[a].cells, b, p.clues[b].cells));
  if (p.equal.length) cons.push(equalConstraint(p.equal));
  for (const lc of p.lineClues) cons.push(lineConstraint(lc.cells, p.colors, LINE_SPECS[lc.kind](lc.value, lc.color)));
  const cellCons = Array.from({ length: p.w * p.h }, () => []);
  cons.forEach((c, k) => c.scope.forEach((j) => cellCons[j].push(k)));
  return { cons, cellCons };
}

function fixpoint(sys, cand, known, start) {
  const { cons, cellCons } = sys;
  const inQ = new Uint8Array(cons.length);
  const q = [];
  for (const k of start) if (!inQ[k]) { inQ[k] = 1; q.push(k); }
  while (q.length) {
    const k = q.pop();
    inQ[k] = 0;
    const c = cons[k];
    const before = c.scope.map((j) => cand[j]);
    if (!c.propagate(cand, known)) continue;
    c.scope.forEach((j, t) => {
      if (cand[j] === before[t]) return;
      for (const k2 of cellCons[j]) if (!inQ[k2]) { inQ[k2] = 1; q.push(k2); }
    });
  }
}

function initCand(p, known) {
  const full = (1 << p.colors) - 1;
  return Int32Array.from(known, (v) => (v >= 0 ? 1 << v : full));
}

// 주어진 칸에서 시작해 추리만으로 끝까지 풀리는지
export function solve(p, given, sys = buildConstraints(p)) {
  return solveKnown(p, given, sys).every((v) => v >= 0);
}

// 추리로 확정할 수 있는 데까지 칠한 결과
export function solveKnown(p, given, sys = buildConstraints(p)) {
  const known = Int8Array.from(given);
  const cand = initCand(p, known);
  let start = sys.cons.map((_, k) => k);
  for (;;) {
    fixpoint(sys, cand, known, start);
    const next = new Set();
    for (let i = 0; i < known.length; i++) {
      if (known[i] < 0 && isSingle(cand[i])) {
        known[i] = bitIndex(cand[i]);
        for (const k of sys.cellCons[i]) next.add(k);
      }
    }
    if (!next.size) break;
    start = [...next];
  }
  return known;
}

// 지금 칠해진 칸만으로 바로 확정할 수 있는 칸
export function hintCells(p, filled, sys = buildConstraints(p)) {
  const known = Int8Array.from(filled);
  const cand = initCand(p, known);
  fixpoint(sys, cand, known, sys.cons.map((_, k) => k));
  const out = [];
  for (let i = 0; i < known.length; i++) if (known[i] < 0 && isSingle(cand[i])) out.push(i);
  return out;
}

// 제약 전파 풀이기.
// cand[i] = 칸 i 에 가능한 색 비트마스크, known[i] = 플레이어가 칠한(확정해 본) 색 또는 -1.
// 모든 전파는 정답과 모순되지 않는 추론만 하므로, 생성된 정답은 항상 후보에 남는다.
import { DIRS8, bitIndex, isSingle, offsetCells, rayCells } from './grid.js';

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

// 커플(원본 CoupleRule): 칠해진 A 의 방향 표시는 이웃 B 와 (보이지 않는) 표준 숫자가 같다는 뜻
function coupleConstraint(A, SA, B, SB) {
  return {
    scope: [A, B, ...SA, ...SB],
    propagate(cand, known) {
      if (known[A] < 0) return false;
      const [a1, o1] = countRange(cand, SA, cand[A]);
      const lo = a1, hi = a1 + o1.length;
      let changed = false;
      const V = new Set();
      // B 의 색 후보마다 B 숫자의 가능 범위가 A 와 겹치는지 본다
      for (let c = 0; 1 << c <= cand[B]; c++) {
        const bit = 1 << c;
        if (!(cand[B] & bit)) continue;
        const [a2, o2] = countRange(cand, SB, bit);
        const from = Math.max(lo, a2), to = Math.min(hi, a2 + o2.length);
        if (from > to) {
          cand[B] &= ~bit;
          changed = true;
        } else for (let v = from; v <= to; v++) V.add(v);
      }
      const values = [...V].sort((x, y) => x - y);
      if (values.length) changed = applyCount(cand, SA, cand[A], values) || changed;
      if (isSingle(cand[B]) && values.length) changed = applyCount(cand, SB, cand[B], values) || changed;
      return changed;
    },
  };
}

// 대칭(원본 SymmetryRule.ApplyRule 0x2149d20): 칠해진 화살표 칸 A 의 짝은 화살표 방향 위의
// 아직 안 칠한 칸이거나, 처음 만나는 반대 방향 화살표 칸이다. 가능한 짝마다 회문을 가정해 보고
// 어느 경우에도 성립하는 것만 남긴다.
function symmetryConstraint(A, ray, isReverse) {
  return {
    scope: [A, ...ray],
    propagate(cand, known) {
      if (known[A] < 0) return false;
      const partners = [];
      for (let k = 0; k < ray.length; k++) {
        const P = ray[k];
        if (known[P] < 0) partners.push(k);
        else if (isReverse(P)) { partners.push(k); break; }
      }
      const cells = [A, ...ray];
      const union = new Int32Array(cells.length);
      let feasible = 0;
      for (const k of partners) {
        const seg = cells.slice(0, k + 2);
        const next = cells.map((c) => cand[c]);
        let ok = true;
        for (let t = 0; t < seg.length / 2 && ok; t++) {
          const u = t, v = seg.length - 1 - t;
          const m = next[u] & next[v];
          if (!m) ok = false;
          next[u] = next[v] = m;
        }
        if (!ok) continue;
        feasible++;
        next.forEach((m, t) => { union[t] |= m; });
      }
      if (!feasible) return false;
      let changed = false;
      cells.forEach((c, t) => {
        const m = cand[c] & union[t];
        if (m && m !== cand[c]) { cand[c] = m; changed = true; }
      });
      return changed;
    },
  };
}

// 패턴(원본 PatternRule.ApplyRule 0x213e064): 같은 룬 칸들은 주변 8칸이 "내 색과 같은가/다른가"
// 무늬가 같다(판 밖은 다름). 칠해진 룬 칸들에서 위치별로 알려진 같음/다름을 모아 나머지에 적용한다.
function patternConstraint(group, w, h, offsetsOf) {
  const neigh = group.map(offsetsOf); // 칸별 8방향 이웃 (판 밖은 -1)
  return {
    scope: [...new Set([...group, ...neigh.flat().filter((j) => j >= 0)])],
    propagate(cand, known) {
      const act = group.map((c, g) => [c, g]).filter(([c]) => known[c] >= 0);
      if (act.length < 1) return false;
      const state = new Array(8).fill(0); // 1 = 같음, 2 = 다름
      for (const [c, g] of act) {
        const bit = cand[c];
        neigh[g].forEach((j, k) => {
          let s = 0;
          if (j < 0 || !(cand[j] & bit)) s = 2;
          else if (cand[j] === bit) s = 1;
          if (s) state[k] |= s;
        });
      }
      let changed = false;
      for (const [c, g] of act) {
        const bit = cand[c];
        neigh[g].forEach((j, k) => {
          if (j < 0 || state[k] === 0 || state[k] === 3) return;
          const m = state[k] === 1 ? cand[j] & bit : cand[j] & ~bit;
          if (m && m !== cand[j]) { cand[j] = m; changed = true; }
        });
      }
      return changed;
    },
  };
}

// 줄 단서 상태 = (직전 색 + 1) + 6 * (현재 블록 길이 + 16 * 누적값)
const enc = (last, run, acc) => last + 1 + 6 * (run + 16 * acc);
const dec = (s) => [(s % 6) - 1, ((s / 6) | 0) % 16, (s / 96) | 0];

export const LINE_SPECS = {
  // 연속: 가장 긴 블록 길이 ∈ values (위장이면 k 또는 k/2)
  streak: (values) => ({
    step(s, c) {
      const [last, run, acc] = dec(s);
      const r = c === last ? run + 1 : 1;
      const m = Math.max(acc, r);
      return m > Math.max(...values) ? -1 : enc(c, r, m);
    },
    accept: (s) => values.includes(dec(s)[2]),
  }),
  // 블록: color 색 블록 수 ∈ values
  block: (values, color) => ({
    step(s, c) {
      const [last, , acc] = dec(s);
      const n = acc + (c === color && last !== color ? 1 : 0);
      return n > Math.max(...values) ? -1 : enc(c, 0, n);
    },
    accept: (s) => values.includes(dec(s)[2]),
  }),
  // 듀오: 길이가 정확히 2인 블록 수 ∈ values
  duo: (values) => ({
    step(s, c) {
      const [last, run, acc] = dec(s);
      if (c === last) return enc(c, Math.min(run + 1, 3), acc);
      const n = acc + (run === 2 ? 1 : 0);
      return n > Math.max(...values) ? -1 : enc(c, 1, n);
    },
    accept: (s) => {
      const [, run, acc] = dec(s);
      return values.includes(acc + (run === 2 ? 1 : 0));
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
  for (const [a, b] of p.couples) {
    cons.push(coupleConstraint(a, p.clues[a].cells, b, p.clues[b].cells));
    cons.push(coupleConstraint(b, p.clues[b].cells, a, p.clues[a].cells));
  }
  p.clues.forEach((cl, i) => {
    if (cl.type !== 'symmetry') return;
    const back = (cl.dir + 4) % 8;
    const isReverse = (j) => p.clues[j].type === 'symmetry' && p.clues[j].dir === back;
    cons.push(symmetryConstraint(i, rayCells(i, p.w, p.h, cl.dir), isReverse));
  });
  const offsetsOf = (i) => DIRS8.map((off) => offsetCells(i, p.w, p.h, [off])[0] ?? -1);
  for (const g of p.patterns) cons.push(patternConstraint(g.cells, p.w, p.h, offsetsOf));
  for (const lc of p.lineClues) {
    const con = lineConstraint(lc.cells, p.colors, LINE_SPECS[lc.kind](lc.values, lc.color));
    // 은폐로 가려진 줄 단서는 쓰지 않는다
    cons.push({ scope: con.scope, heavy: true, propagate: (cand) => !lc.hidden && con.propagate(cand) });
  }
  const cellCons = Array.from({ length: p.w * p.h }, () => []);
  cons.forEach((c, k) => c.scope.forEach((j) => cellCons[j].push(k)));
  return { cons, cellCons };
}

function fixpoint(sys, cand, known, start) {
  const { cons, cellCons } = sys;
  const inQ = new Uint8Array(cons.length);
  // 줄 DP 처럼 무거운 제약은 가벼운 제약이 더 할 일이 없을 때만 돌린다
  const light = [], heavy = [];
  const push = (k) => {
    if (inQ[k]) return;
    inQ[k] = 1;
    (cons[k].heavy ? heavy : light).push(k);
  };
  for (const k of start) push(k);
  while (light.length || heavy.length) {
    const k = light.length ? light.pop() : heavy.shift();
    inQ[k] = 0;
    const c = cons[k];
    const before = c.scope.map((j) => cand[j]);
    if (!c.propagate(cand, known)) continue;
    c.scope.forEach((j, t) => {
      if (cand[j] !== before[t]) for (const k2 of cellCons[j]) push(k2);
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

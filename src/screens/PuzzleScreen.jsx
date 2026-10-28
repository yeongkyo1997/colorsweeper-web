import React, { useEffect, useMemo, useRef, useState } from 'react';
import { generate } from '../engine/generate.js';
import { buildConstraints, hintCells } from '../engine/solver.js';
import { CELL_RULES, LINE_RULES, SPECIAL_RULES, describeConfig } from '../engine/rules.js';
import { neighbors, isSingle, bitIndex } from '../engine/grid.js';

export const PALETTE = ['#e8505b', '#2f9bdc', '#f6c344', '#3dbf7a', '#9b6be0'];
const MAX_LIVES = 3;
// 원본 GameSettings 기본값(0x209b8a4): DoubleTabDuration 0.8초, PuzzlePresenter 무적 시간 1초
const DOUBLE_TAP_MS = 800;
const INVINCIBLE_MS = 1000;
// DIRS8 순서(북쪽부터 시계 방향)
const COUPLE_MARKS = ['▲', '◥', '▶', '◢', '▼', '◣', '◀', '◤'];
const SYMMETRY_MARKS = ['⇧', '⬀', '⇨', '⬂', '⇩', '⬃', '⇦', '⬁'];

const freshGame = (p) => ({
  filled: p.given.slice(),
  marks: new Array(p.w * p.h).fill(0),
  lives: MAX_LIVES,
  wrong: null,
  hint: [],
  peek: [],
  closed: false,
  start: Date.now(),
  end: null,
});
const freshSketch = (n) => ({ filled: new Array(n).fill(-1), marks: new Array(n).fill(0), history: [] });

function clueLabel(cl) {
  if (cl.kind === 'knight') return '♞';
  if (cl.kind === 'ray') return `${cl.shown}${cl.arrow}`;
  return String(cl.shown);
}

export default function PuzzleScreen({ config, title, onExit, onResult, onNext, onRegenerate, allowRetry = true }) {
  const p = useMemo(() => generate(config), [config]);
  const sys = useMemo(() => buildConstraints(p), [p]);
  const n = p.w * p.h;
  const allBits = (1 << p.colors) - 1;
  const [g, setG] = useState(() => freshGame(p));
  const [sk, setSk] = useState(() => freshSketch(n));
  const [sketchOn, setSketchOn] = useState(false);
  const [color, setColor] = useState(0);
  const [xMode, setXMode] = useState(false);
  const [safety, setSafety] = useState(false);
  const [pending, setPending] = useState(null);
  const [autoArmed, setAutoArmed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const drag = useRef(null);
  const lastTap = useRef({ key: null, t: 0 });
  const invincibleUntil = useRef(0);
  const autoTap = useRef(0);
  if (import.meta.env.DEV) window.__puzzle = p;

  const { filled, marks } = g;
  const remaining = filled.filter((v) => v < 0).length;
  const status = g.lives <= 0 ? 'lose' : remaining === 0 ? 'win' : 'play';

  // 결과는 한 번만 알린다
  const reported = useRef(false);
  useEffect(() => {
    if (status === 'play' || reported.current) return;
    reported.current = true;
    onResult?.(status === 'win');
  }, [status, onResult]);

  useEffect(() => {
    if (status !== 'play') return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [status]);

  // 스케치를 켜면 실제 칸 위에 스케치 칸이 겹쳐 보인다
  const view = filled.map((v, i) => (v >= 0 ? v : sketchOn ? sk.filled[i] : -1));
  const isSketch = (i) => filled[i] < 0 && view[i] >= 0;

  const pushSketch = (entries, apply) => {
    const next = { filled: sk.filled.slice(), marks: sk.marks.slice(), history: [...sk.history, entries] };
    apply(next);
    setSk(next);
  };

  // 원본 GameSettings.DoubleTabDuration: 같은 대상을 0.8초 안에 다시 누르면 두 번 누름
  const isDoubleTap = (key) => {
    const t = Date.now();
    const hit = lastTap.current.key === key && t - lastTap.current.t < DOUBLE_TAP_MS;
    lastTap.current = hit ? { key: null, t: 0 } : { key, t };
    return hit;
  };

  // X 를 칠할 수 있는 칸: 열리지 않은 칸. 스케치 중에는 스케치로 칠하지 않았고 실제 X 가 없는 칸
  const xTarget = (i, bit) => filled[i] < 0 && (!sketchOn || (sk.filled[i] < 0 && !(marks[i] & bit)));
  const hasX = (i, bit) => ((sketchOn ? sk.marks[i] : marks[i]) & bit) !== 0;

  // 원본 PuzzleView.MarkXOnNearbyCells·MarkXOnLineCells: 대상이 모두 X 면 모두 지우고, 아니면 모두 붙인다
  const toggleXRange = (cells, c) => {
    const bit = 1 << c;
    const targets = cells.filter((j) => xTarget(j, bit));
    if (!targets.length) return;
    const on = !targets.every((j) => hasX(j, bit));
    setPending(null);
    if (sketchOn) {
      pushSketch(targets.map((j) => ({ i: j, f: sk.filled[j], m: sk.marks[j] })), (s) => {
        for (const j of targets) s.marks[j] = on ? s.marks[j] | bit : s.marks[j] & ~bit;
      });
    } else {
      const next = marks.slice();
      for (const j of targets) next[j] = on ? next[j] | bit : next[j] & ~bit;
      setG({ ...g, marks: next, hint: [] });
    }
  };

  // 드래그 중 X 상태 강제. 스케치에서는 한 번의 드래그가 되돌리기 한 단위
  const setX = (i, on, bit, newGroup) => {
    if (sketchOn) {
      setSk((cur) => {
        if (!!(cur.marks[i] & bit) === on) return cur;
        const entry = { i, f: cur.filled[i], m: cur.marks[i] };
        const history = newGroup
          ? [...cur.history, [entry]]
          : [...cur.history.slice(0, -1), [...cur.history[cur.history.length - 1], entry]];
        const m = cur.marks.slice();
        m[i] = on ? m[i] | bit : m[i] & ~bit;
        return { ...cur, marks: m, history };
      });
    } else {
      setG((cur) => {
        if (cur.filled[i] >= 0 || !!(cur.marks[i] & bit) === on) return cur;
        const m = cur.marks.slice();
        m[i] = on ? m[i] | bit : m[i] & ~bit;
        return { ...cur, marks: m, hint: [] };
      });
    }
  };

  // 원본 PuzzlePresenter.TrySweep
  const paint = (i) => {
    const bit = 1 << color;
    if (sketchOn) {
      // 스케치: 정답 검사도, 하트 감소도 없다
      pushSketch([{ i, f: sk.filled[i], m: sk.marks[i] }], (s) => {
        s.filled[i] = s.filled[i] === color ? -1 : color;
      });
      return;
    }
    // 원본 CheckCellProtected(GuardOnce): 그 색 X 가 있으면 이번에는 X 만 지운다
    if (marks[i] & bit) {
      setPending(null);
      setG({ ...g, marks: marks.map((m, j) => (j === i ? m & ~bit : m)), hint: [] });
      return;
    }
    if (Date.now() < invincibleUntil.current) return;
    // 터치 안전: 첫 탭은 미리보기, 같은 칸을 같은 색으로 한 번 더 눌러야 칠한다
    if (safety && !(pending && pending.i === i && pending.color === color)) {
      setPending({ i, color });
      return;
    }
    setPending(null);
    if (p.sol[i] === color) {
      const next = filled.slice();
      next[i] = color;
      setG({ ...g, filled: next, hint: [], end: next.includes(-1) ? null : Date.now() });
    } else {
      const lives = g.lives - 1;
      invincibleUntil.current = Date.now() + INVINCIBLE_MS;
      setG({
        ...g,
        lives,
        wrong: i,
        marks: marks.map((m, j) => (j === i ? m | bit : m)),
        hint: [],
        end: lives <= 0 ? Date.now() : null,
      });
      setTimeout(() => setG((cur) => (cur.wrong === i ? { ...cur, wrong: null } : cur)), 450);
    }
  };

  // 열린 칸의 영향 범위(원본 MarkXOnNearbyCells): 기사·방향은 그 규칙 칸, 나머지는 주변 8칸
  const rangeOf = (i) => {
    const cl = p.clues[i];
    return cl.type === 'count' ? cl.cells : neighbors(i, p.w, p.h);
  };

  const tap = (i) => {
    if (status === 'win') {
      setG({ ...g, peek: g.peek.includes(i) ? g.peek.filter((j) => j !== i) : [...g.peek, i] });
      return;
    }
    if (status !== 'play') return;
    if (filled[i] >= 0) {
      if (isDoubleTap(i)) toggleXRange(rangeOf(i), filled[i]);
      return;
    }
    lastTap.current = { key: null, t: 0 };
    // X 모드에서는 누르는 순간 이미 X 를 토글했다(원본 XMarkSetting=Drag)
    if (!xMode) paint(i);
  };

  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-i]');
    return el ? Number(el.dataset.i) : null;
  };

  const onPointerDown = (e) => {
    const i = cellAt(e.clientX, e.clientY);
    if (i == null || e.button > 0) return;
    const d = { start: i, last: i, x: e.clientX, y: e.clientY, on: null, bit: 1 << color };
    if (xMode && status === 'play' && xTarget(i, d.bit)) {
      d.on = !hasX(i, d.bit);
      setPending(null);
      setX(i, d.on, d.bit, true);
    }
    drag.current = d;
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    // 빠르게 끌어도 지나간 칸을 놓치지 않도록 이전 위치부터 촘촘히 훑는다
    const steps = Math.max(1, Math.ceil(Math.hypot(e.clientX - d.x, e.clientY - d.y) / 6));
    for (let s = 1; s <= steps; s++) {
      const i = cellAt(d.x + ((e.clientX - d.x) * s) / steps, d.y + ((e.clientY - d.y) * s) / steps);
      if (i == null || i === d.last) continue;
      d.last = i;
      // 원본 PuzzleView.DragCell: 첫 칸에서 정한 상태를 지나가는 빈칸에 그대로 칠한다
      if (d.on != null && xTarget(i, d.bit)) setX(i, d.on, d.bit, false);
    }
    d.x = e.clientX;
    d.y = e.clientY;
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (cellAt(e.clientX, e.clientY) === d.start) tap(d.start);
  };

  // 원본 PuzzleView.GetAutoFillableCells: X 가 아닌 색이 하나만 남은 빈칸을 그 색으로 칠한다
  const autoSweep = () => {
    if (status !== 'play') return;
    setPending(null);
    if (sketchOn) {
      const targets = [];
      for (let i = 0; i < n; i++) {
        const free = allBits & ~(marks[i] | sk.marks[i]);
        if (view[i] < 0 && isSingle(free)) targets.push([i, bitIndex(free)]);
      }
      if (!targets.length) return;
      pushSketch(targets.map(([i]) => ({ i, f: sk.filled[i], m: sk.marks[i] })), (s) => {
        for (const [i, c] of targets) s.filled[i] = c;
      });
      return;
    }
    const next = filled.slice();
    const nextMarks = marks.slice();
    let lives = g.lives;
    let wrong = null;
    for (let i = 0; i < n; i++) {
      const free = allBits & ~marks[i];
      if (filled[i] >= 0 || !isSingle(free)) continue;
      const c = bitIndex(free);
      if (p.sol[i] === c) next[i] = c;
      else {
        lives--;
        wrong = i;
        nextMarks[i] |= 1 << c;
      }
    }
    if (wrong == null && next.every((v, i) => v === filled[i])) return;
    if (wrong != null) invincibleUntil.current = Date.now() + INVINCIBLE_MS;
    const end = lives <= 0 || !next.includes(-1) ? Date.now() : null;
    setG({ ...g, filled: next, marks: nextMarks, lives, wrong, hint: [], end });
    if (wrong != null) setTimeout(() => setG((cur) => (cur.wrong === wrong ? { ...cur, wrong: null } : cur)), 450);
  };

  // 원본 PaletteView.OnAutoSweepButtonClick: 버튼도 0.8초 안에 두 번 눌러야 실행된다
  const onAutoButton = () => {
    const t = Date.now();
    if (t - autoTap.current < DOUBLE_TAP_MS) {
      autoTap.current = 0;
      setAutoArmed(false);
      autoSweep();
    } else {
      autoTap.current = t;
      setAutoArmed(true);
      setTimeout(() => setAutoArmed((v) => (Date.now() - autoTap.current >= DOUBLE_TAP_MS ? false : v)), DOUBLE_TAP_MS);
    }
  };

  const undoSketch = () => {
    if (!sk.history.length) return;
    const last = sk.history[sk.history.length - 1];
    const next = { filled: sk.filled.slice(), marks: sk.marks.slice(), history: sk.history.slice(0, -1) };
    for (const { i, f, m } of [...last].reverse()) {
      next.filled[i] = filled[i] >= 0 ? -1 : f;
      next.marks[i] = filled[i] >= 0 ? 0 : m;
    }
    setSk(next);
  };

  // 원본 AssumptionCellUI.ResetWhenFalse: 스케치를 끄면 스케치가 지워진다
  const toggleSketch = () => {
    if (sketchOn) setSk(freshSketch(n));
    setPending(null);
    setSketchOn(!sketchOn);
  };

  const showHint = () => {
    if (status === 'play' && !sketchOn) setG({ ...g, hint: hintCells(p, filled, sys) });
  };

  const retry = () => {
    reported.current = false;
    invincibleUntil.current = 0;
    setG(freshGame(p));
    setSk(freshSketch(n));
    setSketchOn(false);
    setPending(null);
  };

  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      const num = Number(e.key);
      if (num >= 1 && num <= p.colors) setColor(num - 1);
      else if (k === 'x') setXMode((v) => !v);
      else if (k === 'h') showHint();
      else if (k === 's') toggleSketch();
      else if (k === 'z' && sketchOn) undoSketch();
      else if (k === 'a') autoSweep();
      else if (k === 't') { setSafety((v) => !v); setPending(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const elapsed = Math.floor(((g.end ?? now) - g.start) / 1000);
  const time = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const hintSet = new Set(g.hint);

  const clueContent = (i) => {
    const cl = p.clues[i];
    // 원본처럼 커플·대칭·패턴 표시는 칠한 뒤에만 보이고, 그 칸의 숫자를 대신한다
    if (cl.type === 'couple') return <span className="clue mark couple">{COUPLE_MARKS[cl.dir]}</span>;
    if (cl.type === 'symmetry') return <span className="clue mark sym">{SYMMETRY_MARKS[cl.dir]}</span>;
    if (cl.type === 'pattern') return <span className="clue mark rune">{cl.rune}</span>;
    if (cl.type !== 'count') return null;
    if (g.peek.includes(i)) {
      return <span className="clue">{clueLabel(cl)}{cl.disguised && <small>={cl.shown / 2}</small>}</span>;
    }
    if (cl.hidden) return status === 'play' ? <span className="concealed">?</span> : null;
    if (cl.cells.every((j) => filled[j] >= 0)) return null;
    return <span className="clue">{clueLabel(cl)}</span>;
  };

  const cellEl = (i) => {
    const pend = pending?.i === i && filled[i] < 0;
    const c = pend ? pending.color : view[i];
    const sketched = isSketch(i);
    const real = filled[i] >= 0;
    const cl = p.clues[i];
    return (
      <button
        key={i}
        data-i={i}
        className={[
          'cell',
          real ? 'filled' : '',
          sketched ? 'sketched' : '',
          pend ? 'pending' : '',
          g.wrong === i ? 'wrong' : '',
          hintSet.has(i) ? 'hint' : '',
          p.given[i] >= 0 ? 'given' : '',
        ].join(' ')}
        style={c >= 0 ? { '--c': PALETTE[c] } : undefined}
      >
        {real && clueContent(i)}
        {!real && cl.preview && <span className="clue preview">{clueLabel(cl)}</span>}
        {!real && !sketched && (marks[i] > 0 || (sketchOn && sk.marks[i] > 0)) && (
          <span className="marks">
            {Array.from({ length: p.colors }, (_, k) => {
              const bit = 1 << k;
              if (marks[i] & bit) return <b key={k} style={{ color: PALETTE[k] }}>✕</b>;
              if (sketchOn && sk.marks[i] & bit) return <b key={k} className="sk" style={{ color: PALETTE[k] }}>✕</b>;
              return null;
            })}
          </span>
        )}
      </button>
    );
  };

  // 원본 InfoCellUI.OnClick: 색이 있는 줄 단서를 두 번 누르면 그 줄 빈칸에 그 색 X 를 토글한다
  const onLineTap = (lc) => {
    if (status !== 'play' || lc.color == null) return;
    if (isDoubleTap(`${lc.axis}${lc.index}`)) toggleXRange(lc.cells, lc.color);
  };

  const lineClueEl = (lc) => {
    const done = lc.cells.every((j) => filled[j] >= 0);
    return (
      <div
        key={`${lc.axis}${lc.index}`}
        className={`lclue ${lc.axis} ${lc.kind}${done ? ' done' : ''}${lc.hidden ? ' hidden' : ''}`}
        onClick={() => onLineTap(lc)}
      >
        {lc.kind === 'block' && <i style={{ background: PALETTE[lc.color] }} />}
        {lc.hidden && status === 'play' ? '?' : lc.shown ?? lc.value}
      </div>
    );
  };

  const hasLines = p.lineClues.length > 0;
  const boardChildren = [];
  if (hasLines) {
    boardChildren.push(<div key="corner" className="corner">{LINE_RULES.find((r) => r.id === p.opts.lineRule)?.name}</div>);
    p.lineClues.filter((l) => l.axis === 'col').forEach((l) => boardChildren.push(lineClueEl(l)));
  }
  for (let y = 0; y < p.h; y++) {
    if (hasLines) boardChildren.push(lineClueEl(p.lineClues.find((l) => l.axis === 'row' && l.index === y)));
    for (let x = 0; x < p.w; x++) boardChildren.push(cellEl(y * p.w + x));
  }

  const activeRules = [
    CELL_RULES.find((r) => r.id === (p.opts.cellRule ?? 'standard')),
    ...(p.opts.cellRule && p.opts.cellRule !== 'standard' ? [CELL_RULES[0]] : []),
    LINE_RULES.find((r) => r.id === p.opts.lineRule),
    ...SPECIAL_RULES.filter((r) => p.opts[r.id]),
  ].filter(Boolean);

  return (
    <div className="app puzzle">
      <header>
        <button className="back" onClick={onExit}>← 나가기</button>
        <div className="title">
          <h1>{title}</h1>
          <small>{describeConfig(config)}</small>
        </div>
      </header>

      <div className="play">
      {/* 판은 화면 너비와 높이 중 좁은 쪽에 맞춘다(--ratio = 판의 가로/세로 비) */}
      <div className="play-main" style={{ '--ratio': (p.w + (hasLines ? 0.7 : 0)) / (p.h + (hasLines ? 0.8 : 0)) }}>
      <div className="stats">
        <span className="lives">{'♥'.repeat(Math.max(g.lives, 0))}<i>{'♥'.repeat(MAX_LIVES - Math.max(g.lives, 0))}</i></span>
        <span>남은 칸 {remaining}</span>
        <span>{time}</span>
      </div>

      <div
        className={'board' + (sketchOn ? ' sketch-on' : '') + (xMode ? ' x-on' : '')}
        style={{
          gridTemplateColumns: `${hasLines ? 'minmax(20px, 0.7fr) ' : ''}repeat(${p.w}, minmax(0, 1fr))`,
          '--cols': p.w + (hasLines ? 0.7 : 0),
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {boardChildren}
      </div>
      </div>

      <div className="play-side">
      <div className="palette">
        {Array.from({ length: p.colors }, (_, k) => (
          <button
            key={k}
            className={'swatch' + (k === color ? ' on' : '')}
            style={{ background: PALETTE[k] }}
            onClick={() => setColor(k)}
            aria-label={`색 ${k + 1}`}
          >
            {xMode && '✕'}
          </button>
        ))}
      </div>

      <div className="tools">
        <button className={xMode ? 'on' : ''} onClick={() => setXMode(!xMode)}>X 표시</button>
        <button className={autoArmed ? 'armed' : ''} onClick={onAutoButton}>
          {autoArmed ? '한 번 더' : '자동 칠하기'}
        </button>
        <button className={sketchOn ? 'on sketch' : ''} onClick={toggleSketch}>스케치</button>
        {sketchOn && (
          <>
            <button onClick={undoSketch} disabled={!sk.history.length}>되돌리기</button>
            <button onClick={() => setSk(freshSketch(n))} disabled={!sk.history.length}>스케치 지우기</button>
          </>
        )}
        {!sketchOn && <button onClick={showHint}>힌트</button>}
        <button className={safety ? 'on' : ''} onClick={() => { setSafety(!safety); setPending(null); }}>터치 안전</button>
      </div>
      {sketchOn && <p className="sketch-note">스케치 중: 가정해서 칠해 보는 모드입니다. 정답 판정과 하트에 영향이 없고, 끄면 지워집니다.</p>}

      <ul className="rules">
        {activeRules.map((r) => (
          <li key={r.id}><b>{r.name}</b> {r.desc}</li>
        ))}
      </ul>
      <p className="help">
        색을 고르고 빈칸을 눌러 칠하세요. 틀리면 하트가 줄고 1초 동안 칠할 수 없습니다.
        X 표시를 켜고 누르거나 끌면 X를 칠하고 지웁니다. X가 있는 칸을 그 색으로 누르면 X가 먼저 지워집니다.
        열린 칸을 두 번 누르면 그 칸 범위의 빈칸에, 색이 있는 줄 단서를 두 번 누르면 그 줄에 X를 붙이거나 뗍니다.
        자동 칠하기는 두 번 눌러야 하며, 색이 하나만 남은 칸을 모두 칠합니다. 터치 안전을 켜면 같은 칸을 두 번 눌러야 칠해집니다.
        <span className="keys"><br />단축키: 1–{p.colors} 색 · X 표시 · A 자동 칠하기 · S 스케치 · Z 스케치 되돌리기 · H 힌트 · T 터치 안전</span>
      </p>
      </div>
      </div>

      {status !== 'play' && !g.closed && (
        <div className="overlay">
          <div className="modal">
            <h2>{status === 'win' ? '클리어!' : '게임 오버'}</h2>
            <p>{status === 'win' ? `${time} 만에 완성했습니다.` : '하트를 모두 잃었습니다.'}</p>
            <div className="modal-actions">
              {status === 'win' && onNext && <button onClick={onNext}>다음 스테이지</button>}
              {onRegenerate && <button onClick={onRegenerate}>새 퍼즐</button>}
              {status === 'lose' && !onRegenerate && allowRetry && <button onClick={retry}>다시 하기</button>}
              {status === 'win' && (
                <button className="ghost" onClick={() => setG({ ...g, closed: true })}>판 보기</button>
              )}
              <button className="ghost" onClick={onExit}>나가기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { generate } from '../engine/generate.js';
import { buildConstraints, hintCells } from '../engine/solver.js';
import { CELL_RULES, LINE_RULES, SPECIAL_RULES, describeConfig } from '../engine/rules.js';

export const PALETTE = ['#e8505b', '#2f9bdc', '#f6c344', '#3dbf7a', '#9b6be0'];
const MAX_LIVES = 3;

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
  const [g, setG] = useState(() => freshGame(p));
  const [sk, setSk] = useState(() => freshSketch(n));
  const [sketchOn, setSketchOn] = useState(false);
  const [color, setColor] = useState(0);
  const [xMode, setXMode] = useState(false);
  const [now, setNow] = useState(Date.now());
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

  const paint = (i) => {
    if (status === 'win') {
      setG({ ...g, peek: g.peek.includes(i) ? g.peek.filter((j) => j !== i) : [...g.peek, i] });
      return;
    }
    if (status !== 'play' || filled[i] >= 0) return;
    const bit = 1 << color;
    if (sketchOn) {
      // 스케치: 정답 검사도, 하트 감소도 없다
      pushSketch([{ i, f: sk.filled[i], m: sk.marks[i] }], (s) => {
        if (xMode) s.marks[i] ^= bit;
        else s.filled[i] = s.filled[i] === color ? -1 : color;
      });
      return;
    }
    if (xMode) {
      setG({ ...g, marks: marks.map((m, j) => (j === i ? m ^ bit : m)), hint: [] });
      return;
    }
    if (marks[i] & bit) return;
    if (p.sol[i] === color) {
      const next = filled.slice();
      next[i] = color;
      setG({ ...g, filled: next, hint: [], end: next.includes(-1) ? null : Date.now() });
      if (sk.filled[i] >= 0 || sk.marks[i]) {
        setSk({ ...sk, filled: sk.filled.map((v, j) => (j === i ? -1 : v)), marks: sk.marks.map((v, j) => (j === i ? 0 : v)) });
      }
    } else {
      const lives = g.lives - 1;
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

  // 충족된 숫자 칸을 두 번 누르면 단서 범위의 빈칸에 그 색 X 를 표시한다
  const autoMark = (i) => {
    const cl = p.clues[i];
    if (status !== 'play' || filled[i] < 0 || cl.type !== 'count' || cl.hidden || cl.values.length !== 1) return;
    const c = filled[i];
    if (cl.cells.filter((j) => view[j] === c).length !== cl.values[0]) return;
    const targets = cl.cells.filter((j) => view[j] < 0);
    if (!targets.length) return;
    if (sketchOn) {
      pushSketch(targets.map((j) => ({ i: j, f: sk.filled[j], m: sk.marks[j] })), (s) => {
        for (const j of targets) s.marks[j] |= 1 << c;
      });
    } else {
      const next = marks.slice();
      for (const j of targets) next[j] |= 1 << c;
      setG({ ...g, marks: next });
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

  const showHint = () => {
    if (status === 'play') setG({ ...g, hint: hintCells(p, filled, sys) });
  };

  const retry = () => {
    reported.current = false;
    setG(freshGame(p));
    setSk(freshSketch(n));
    setSketchOn(false);
  };

  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      const num = Number(e.key);
      if (num >= 1 && num <= p.colors) setColor(num - 1);
      else if (k === 'x') setXMode((v) => !v);
      else if (k === 'h') showHint();
      else if (k === 's') setSketchOn((v) => !v);
      else if (k === 'z' && sketchOn) undoSketch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const elapsed = Math.floor(((g.end ?? now) - g.start) / 1000);
  const time = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const hintSet = new Set(g.hint);

  const clueContent = (i) => {
    const cl = p.clues[i];
    if (cl.type !== 'count') return null;
    if (g.peek.includes(i)) {
      return <span className="clue">{clueLabel(cl)}{cl.disguised && <small>={cl.shown / 2}</small>}</span>;
    }
    if (cl.hidden) return status === 'play' ? <span className="concealed">?</span> : null;
    if (cl.cells.every((j) => filled[j] >= 0)) return null;
    return <span className="clue">{clueLabel(cl)}</span>;
  };

  const cellEl = (i) => {
    const c = view[i];
    const sketched = isSketch(i);
    const real = filled[i] >= 0;
    const cl = p.clues[i];
    return (
      <button
        key={i}
        className={[
          'cell',
          real ? 'filled' : '',
          sketched ? 'sketched' : '',
          g.wrong === i ? 'wrong' : '',
          hintSet.has(i) ? 'hint' : '',
          p.given[i] >= 0 ? 'given' : '',
        ].join(' ')}
        style={c >= 0 ? { '--c': PALETTE[c] } : undefined}
        onClick={() => paint(i)}
        onDoubleClick={() => autoMark(i)}
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
        {p.symbols[i] && <span className="symbol">{p.symbols[i]}</span>}
        {cl.type === 'couple' && <span className="symbol couple">▲</span>}
      </button>
    );
  };

  const lineClueEl = (lc) => {
    const done = lc.cells.every((j) => filled[j] >= 0);
    return (
      <div key={`${lc.axis}${lc.index}`} className={`lclue ${lc.axis}${done ? ' done' : ''}`}>
        {lc.kind === 'block' && <i style={{ background: PALETTE[lc.color] }} />}
        {lc.value}
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

      <div className="stats">
        <span className="lives">{'♥'.repeat(Math.max(g.lives, 0))}<i>{'♥'.repeat(MAX_LIVES - Math.max(g.lives, 0))}</i></span>
        <span>남은 칸 {remaining}</span>
        <span>{time}</span>
      </div>

      <div
        className={'board' + (sketchOn ? ' sketch-on' : '')}
        style={{
          gridTemplateColumns: `${hasLines ? 'minmax(20px, 0.7fr) ' : ''}repeat(${p.w}, minmax(0, 1fr))`,
          '--cols': p.w + (hasLines ? 1 : 0),
        }}
      >
        {boardChildren}
      </div>

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
        <button className={sketchOn ? 'on sketch' : ''} onClick={() => setSketchOn(!sketchOn)}>스케치</button>
        {sketchOn && (
          <>
            <button onClick={undoSketch} disabled={!sk.history.length}>되돌리기</button>
            <button onClick={() => setSk(freshSketch(n))} disabled={!sk.history.length}>스케치 지우기</button>
          </>
        )}
        <button onClick={showHint}>힌트</button>
      </div>
      {sketchOn && <p className="sketch-note">스케치 중: 가정해서 칠해 보는 모드입니다. 정답 판정과 하트에 영향이 없습니다.</p>}

      <ul className="rules">
        {activeRules.map((r) => (
          <li key={r.id}><b>{r.name}</b> {r.desc}</li>
        ))}
      </ul>
      <p className="help">
        색을 고르고 빈칸을 눌러 칠하세요. 틀리면 하트가 줄어듭니다. 충족된 숫자 칸을 두 번 누르면 주변에 X가 표시됩니다.
        <br />단축키: 1–{p.colors} 색 · X 표시 · S 스케치 · Z 스케치 되돌리기 · H 힌트
      </p>

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

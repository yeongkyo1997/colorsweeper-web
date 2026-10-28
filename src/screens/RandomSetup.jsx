import React, { useState } from 'react';
import { CELL_RULES, LINE_RULES, SPECIAL_RULES } from '../engine/rules.js';
import { load, save } from '../storage.js';

const SIZES = [6, 8, 10, 12];
const DEFAULT = { size: 8, colors: 3, cellRule: 'standard', lineRule: null, hide: false, preview: false, disguise: false };

export default function RandomSetup({ onStart, onBack }) {
  const [s, setS] = useState(() => ({ ...DEFAULT, ...load('random-settings', {}) }));
  const set = (patch) => setS((prev) => ({ ...prev, ...patch }));

  const start = () => {
    save('random-settings', s);
    const { size, ...rest } = s;
    onStart({ ...rest, w: size, h: size });
  };

  return (
    <div className="app setup">
      <header>
        <button className="back" onClick={onBack}>← 처음으로</button>
        <h1>랜덤 모드</h1>
      </header>

      <section>
        <h3>판 크기</h3>
        <div className="chips">
          {SIZES.map((v) => (
            <button key={v} className={s.size === v ? 'on' : ''} onClick={() => set({ size: v })}>{v}×{v}</button>
          ))}
        </div>
      </section>
      <section>
        <h3>색 개수</h3>
        <div className="chips">
          {[2, 3, 4, 5].map((v) => (
            <button key={v} className={s.colors === v ? 'on' : ''} onClick={() => set({ colors: v })}>{v}색</button>
          ))}
        </div>
      </section>
      <section>
        <h3>칸 규칙</h3>
        <div className="chips">
          {CELL_RULES.map((r) => (
            <button key={r.id} title={r.desc} className={s.cellRule === r.id ? 'on' : ''} onClick={() => set({ cellRule: r.id })}>{r.name}</button>
          ))}
        </div>
        <p className="desc">{CELL_RULES.find((r) => r.id === s.cellRule).desc}</p>
      </section>
      <section>
        <h3>라인 규칙</h3>
        <div className="chips">
          <button className={!s.lineRule ? 'on' : ''} onClick={() => set({ lineRule: null })}>없음</button>
          {LINE_RULES.map((r) => (
            <button key={r.id} title={r.desc} className={s.lineRule === r.id ? 'on' : ''} onClick={() => set({ lineRule: r.id })}>{r.name}</button>
          ))}
        </div>
        {s.lineRule && <p className="desc">{LINE_RULES.find((r) => r.id === s.lineRule).desc}</p>}
      </section>
      <section>
        <h3>특수 규칙</h3>
        {SPECIAL_RULES.map((r) => (
          <label key={r.id} className="rule-toggle">
            <input type="checkbox" checked={!!s[r.id]} onChange={(e) => set({ [r.id]: e.target.checked })} />
            {r.name} <small>{r.desc}</small>
          </label>
        ))}
      </section>
      {s.lineRule && s.size >= 12 && <p className="desc">큰 판에 라인 규칙을 쓰면 퍼즐을 만드는 데 1초쯤 걸릴 수 있습니다.</p>}
      <button className="primary" onClick={start}>시작</button>
    </div>
  );
}

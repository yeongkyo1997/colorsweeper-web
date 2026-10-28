import React, { useState } from 'react';
import { CELL_RULES, LINE_RULES, SPECIAL_RULES } from '../engine/rules.js';
import { PALETTE } from './PuzzleScreen.jsx';

export default function Title({ go }) {
  const [guide, setGuide] = useState(false);
  return (
    <div className="app title-screen">
      <div className="logo">
        {'COLOR'.split('').map((ch, i) => (
          <span key={i} style={{ background: PALETTE[i % PALETTE.length] }}>{ch}</span>
        ))}
        <h1>Sweeper</h1>
      </div>
      <nav className="menu">
        <button onClick={() => go('stage')}><b>스테이지</b><small>월드별로 준비된 퍼즐</small></button>
        <button onClick={() => go('daily')}><b>데일리</b><small>매일 바뀌는 난이도별 퍼즐</small></button>
        <button onClick={() => go('random')}><b>랜덤</b><small>규칙을 골라 직접 만드는 퍼즐</small></button>
        <button className="ghost" onClick={() => setGuide(!guide)}>규칙 안내 {guide ? '닫기' : '보기'}</button>
      </nav>
      {guide && (
        <div className="guide">
          {[['칸 규칙', CELL_RULES], ['라인 규칙', LINE_RULES], ['특수 규칙', SPECIAL_RULES]].map(([name, list]) => (
            <section key={name}>
              <h3>{name}</h3>
              <ul className="rules">
                {list.map((r) => <li key={r.id}><b>{r.name}</b> {r.desc}</li>)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

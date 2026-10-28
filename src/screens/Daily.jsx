import React from 'react';
import { DAILY_LEVELS, dailyConfig, describeConfig } from '../engine/rules.js';

export default function Daily({ date, daily, onPlay, onBack }) {
  const today = daily.days[date] ?? {};
  const wins = Object.values(daily.days).reduce((a, d) => a + Object.values(d).filter((r) => r === 'win').length, 0);
  const losses = Object.values(daily.days).reduce((a, d) => a + Object.values(d).filter((r) => r === 'lose').length, 0);

  return (
    <div className="app setup">
      <header>
        <button className="back" onClick={onBack}>← 처음으로</button>
        <h1>데일리</h1>
        <small>{date}</small>
      </header>

      <div className="streak">
        <div><b>{daily.streak}</b><small>현재 스트릭</small></div>
        <div><b>{daily.best}</b><small>최고 스트릭</small></div>
        <div><b>{wins}</b><small>클리어</small></div>
        <div><b>{losses}</b><small>실패</small></div>
      </div>
      <p className="desc">난이도마다 하루에 한 번만 도전할 수 있습니다. 클리어하면 스트릭이 오르고, 실패하면 0이 됩니다.</p>

      <div className="daily-list">
        {DAILY_LEVELS.map((lv) => {
          const r = today[lv.id];
          return (
            <button key={lv.id} disabled={!!r} className={r ?? ''} onClick={() => onPlay(lv)}>
              <b>{lv.name}</b>
              <small>{describeConfig(dailyConfig(date, lv))}</small>
              <span className="state">{r === 'win' ? '✓ 클리어' : r === 'lose' ? '✕ 실패' : '도전하기'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

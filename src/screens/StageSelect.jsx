import React from 'react';
import { STAGES_PER_WORLD, WORLDS, WORLD_UNLOCK, describeConfig, stageConfig } from '../engine/rules.js';

export const clearedCount = (progress, world) => (progress[world.id] ?? []).length;
export const worldOpen = (progress, wi) => wi === 0 || clearedCount(progress, WORLDS[wi - 1]) >= WORLD_UNLOCK;
export const stageOpen = (progress, world, k) => k === 0 || (progress[world.id] ?? []).includes(k - 1);

export default function StageSelect({ progress, worldIndex, setWorldIndex, onPlay, onBack }) {
  const world = WORLDS[worldIndex];
  const done = progress[world.id] ?? [];
  const totalCleared = WORLDS.reduce((a, w) => a + clearedCount(progress, w), 0);

  return (
    <div className="app setup">
      <header>
        <button className="back" onClick={onBack}>← 처음으로</button>
        <h1>스테이지</h1>
        <small>클리어 {totalCleared} / {WORLDS.length * STAGES_PER_WORLD}</small>
      </header>

      <div className="worlds">
        {WORLDS.map((w, wi) => {
          const open = worldOpen(progress, wi);
          return (
            <button
              key={w.id}
              className={(wi === worldIndex ? 'on ' : '') + (open ? '' : 'locked')}
              disabled={!open}
              onClick={() => setWorldIndex(wi)}
            >
              {open ? '' : '🔒 '}{w.name}
              <small>{clearedCount(progress, w)}/{STAGES_PER_WORLD}</small>
            </button>
          );
        })}
      </div>

      <section>
        <h3>월드 {world.name}</h3>
        <p className="desc">{describeConfig(stageConfig(world, 0)).split(' · ').slice(2).join(' · ')}</p>
        <div className="stages">
          {Array.from({ length: STAGES_PER_WORLD }, (_, k) => {
            const open = stageOpen(progress, world, k);
            const cfg = stageConfig(world, k);
            return (
              <button key={k} disabled={!open} className={done.includes(k) ? 'cleared' : ''} onClick={() => onPlay(worldIndex, k)}>
                <b>{k + 1}</b>
                <small>{done.includes(k) ? '✓ 클리어' : open ? `${cfg.w}×${cfg.h}` : '🔒'}</small>
              </button>
            );
          })}
        </div>
        {worldIndex < WORLDS.length - 1 && !worldOpen(progress, worldIndex + 1) && (
          <p className="desc">이 월드에서 {WORLD_UNLOCK}개를 클리어하면 다음 월드가 열립니다.</p>
        )}
      </section>
    </div>
  );
}

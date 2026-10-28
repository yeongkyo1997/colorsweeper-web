import React, { useCallback, useRef, useState } from 'react';
import PuzzleScreen from './screens/PuzzleScreen.jsx';
import Title from './screens/Title.jsx';
import RandomSetup from './screens/RandomSetup.jsx';
import StageSelect from './screens/StageSelect.jsx';
import Daily from './screens/Daily.jsx';
import { STAGES_PER_WORLD, WORLDS, dailyConfig, stageConfig, todayKey } from './engine/rules.js';
import { load, save } from './storage.js';

const randomSeed = () => (Math.random() * 2 ** 31) | 0;

export default function App() {
  const [screen, setScreen] = useState({ name: 'title' });
  const [progress, setProgress] = useState(() => load('stage-progress', {}));
  const [worldIndex, setWorldIndex] = useState(0);
  const [daily, setDaily] = useState(() => load('daily', { streak: 0, best: 0, days: {} }));

  const go = (name) => setScreen({ name });

  const playStage = (wi, k) =>
    setScreen({ name: 'puzzle', kind: 'stage', wi, k, config: stageConfig(WORLDS[wi], k), key: `s${wi}-${k}` });

  const screenRef = useRef(screen);
  screenRef.current = screen;

  const onResult = useCallback((win) => {
    const cur = screenRef.current;
    if (cur.kind === 'stage' && win) {
      const id = WORLDS[cur.wi].id;
      const next = { ...progress, [id]: [...new Set([...(progress[id] ?? []), cur.k])] };
      save('stage-progress', next);
      setProgress(next);
    }
    if (cur.kind === 'daily') {
      const day = { ...(daily.days[cur.date] ?? {}), [cur.level]: win ? 'win' : 'lose' };
      const streak = win ? daily.streak + 1 : 0;
      const next = { streak, best: Math.max(daily.best, streak), days: { ...daily.days, [cur.date]: day } };
      save('daily', next);
      setDaily(next);
    }
  }, [progress, daily]);

  if (screen.name === 'puzzle') {
    const { kind } = screen;
    const extra = {};
    if (kind === 'stage') {
      const { wi, k } = screen;
      if (k + 1 < STAGES_PER_WORLD) extra.onNext = () => playStage(wi, k + 1);
      else if (wi + 1 < WORLDS.length) extra.onNext = () => { setWorldIndex(wi + 1); playStage(wi + 1, 0); };
    }
    if (kind === 'random') {
      extra.onRegenerate = () => {
        const config = { ...screen.config, seed: randomSeed() };
        setScreen({ ...screen, config, key: `r${config.seed}` });
      };
    }
    if (kind === 'daily') extra.allowRetry = false;
    return (
      <PuzzleScreen
        key={screen.key}
        config={screen.config}
        title={screen.title ?? (kind === 'stage' ? `${WORLDS[screen.wi].name} ${screen.k + 1}` : '')}
        onExit={() => go(kind === 'stage' ? 'stage' : kind)}
        onResult={onResult}
        {...extra}
      />
    );
  }
  if (screen.name === 'random') {
    return (
      <RandomSetup
        onBack={() => go('title')}
        onStart={(cfg) => {
          const config = { ...cfg, seed: randomSeed() };
          setScreen({ name: 'puzzle', kind: 'random', title: '랜덤', config, key: `r${config.seed}` });
        }}
      />
    );
  }
  if (screen.name === 'stage') {
    return (
      <StageSelect
        progress={progress}
        worldIndex={worldIndex}
        setWorldIndex={setWorldIndex}
        onPlay={playStage}
        onBack={() => go('title')}
      />
    );
  }
  if (screen.name === 'daily') {
    const date = todayKey();
    return (
      <Daily
        date={date}
        daily={daily}
        onBack={() => go('title')}
        onPlay={(lv) =>
          setScreen({
            name: 'puzzle', kind: 'daily', date, level: lv.id,
            title: `데일리 ${lv.name}`, config: dailyConfig(date, lv), key: `d${date}${lv.id}`,
          })
        }
      />
    );
  }
  return <Title go={go} />;
}

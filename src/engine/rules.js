// 원본 RuleType(Rule / OptionRule)과 PuzzleRule 목록. 설명은 원본 안내를 바탕으로 다시 썼다.
import { hashSeed, mulberry32 } from './grid.js';

export const CELL_RULES = [
  { id: 'standard', name: '표준', desc: '숫자는 자신을 뺀 주변 8칸 중 자신과 같은 색인 칸의 개수입니다.' },
  { id: 'knight', name: '기사', desc: '♞ 칸은 체스 나이트가 갈 수 있는 칸 중 정확히 1칸만 자신과 같은 색입니다. 그런 칸에는 모두 ♞가 붙습니다.' },
  { id: 'ray', name: '방향', desc: '숫자와 화살표(상하좌우)가 있는 칸: 화살표 방향으로 판 끝까지, 자신과 같은 색인 칸이 숫자만큼 있습니다.' },
  { id: 'couple', name: '커플', desc: '칠한 칸에 삼각형이 나오면, 삼각형이 가리키는 이웃 칸과 (보이지 않는) 표준 숫자가 서로 같습니다.' },
  { id: 'symmetry', name: '대칭', desc: '칠한 칸에 화살표가 나오면, 화살표 방향(대각선 포함)에 짝 화살표 칸이 있고 두 칸 사이(양 끝 포함)의 색은 대칭입니다.' },
  { id: 'pattern', name: '패턴', desc: '같은 룬 칸들은 주변 8칸이 "자신과 같은 색인가"의 배치가 서로 같습니다(판 밖은 다른 색). 룬 칸은 처음부터 열려 있습니다.' },
];

export const LINE_RULES = [
  { id: 'streak', name: '연속', desc: '줄 단서는 그 줄에서 같은 색이 이어진 가장 긴 길이입니다.' },
  { id: 'block', name: '블록', desc: '줄 단서는 그 줄에서 표시된 색의 블록(이어진 칸 묶음) 개수입니다.' },
  { id: 'duo', name: '듀오', desc: '줄 단서(기울임 숫자)는 그 줄에서 길이가 정확히 2인 블록의 개수입니다.' },
];

export const SPECIAL_RULES = [
  { id: 'hide', name: '은폐', desc: '퍼즐이 풀리는 한 최대한 많은 숫자 단서(줄 단서 포함)가 ?로 가려집니다.' },
  { id: 'preview', name: '미리보기', desc: '일부 빈칸은 칠하기 전부터 숫자가 보입니다. 처음 열린 칸 대신 쓰이므로 숫자로 그 칸의 색을 추리하세요.' },
  { id: 'disguise', name: '위장', desc: '숫자 단서(줄 단서 포함)의 절반쯤이 실제 값의 2배로 표시됩니다. 0과 홀수는 진짜, 짝수 k는 k 또는 k/2입니다.' },
];

export const ruleName = (id) =>
  [...CELL_RULES, ...LINE_RULES, ...SPECIAL_RULES].find((r) => r.id === id)?.name ?? id;

export function describeConfig(cfg) {
  const parts = [ruleName(cfg.cellRule ?? 'standard')];
  if (cfg.lineRule) parts.push(ruleName(cfg.lineRule));
  for (const s of SPECIAL_RULES) if (cfg[s.id]) parts.push(s.name);
  return `${cfg.w}×${cfg.h} · ${cfg.colors}색 · ${parts.join(' + ')}`;
}

// 스테이지: 원본 업적 목록의 월드 이름을 따랐다
const STAGE_SIZES = [5, 6, 6, 7, 7, 8, 8, 9];
export const WORLDS = [
  { id: 'basic', name: 'Basic', cfg: {} },
  { id: 'hide', name: 'Hide', cfg: { hide: true } },
  { id: 'color2', name: '2 Color', cfg: { colors: 2 } },
  { id: 'color4', name: '4 Color', cfg: { colors: 4 } },
  { id: 'knight', name: 'Knight', cfg: { cellRule: 'knight' } },
  { id: 'ray', name: 'Ray', cfg: { cellRule: 'ray' } },
  { id: 'pattern', name: 'Pattern', cfg: { cellRule: 'pattern' } },
  { id: 'couple', name: 'Couple', cfg: { cellRule: 'couple' } },
  { id: 'symmetry', name: 'Symmetry', cfg: { cellRule: 'symmetry' } },
  { id: 'block', name: 'Block', cfg: { lineRule: 'block' } },
  { id: 'streak', name: 'Streak', cfg: { lineRule: 'streak' } },
  { id: 'duo', name: 'Duo', cfg: { lineRule: 'duo' } },
  { id: 'preview', name: 'Preview', cfg: { preview: true } },
  { id: 'disguise', name: 'Disguised', cfg: { disguise: true } },
];
export const STAGES_PER_WORLD = STAGE_SIZES.length;
export const WORLD_UNLOCK = 4; // 이전 월드에서 이만큼 클리어하면 다음 월드가 열린다

export function stageConfig(world, k) {
  const s = STAGE_SIZES[k];
  return { colors: 3, ...world.cfg, w: s, h: s, seed: hashSeed('stage', world.id, k) };
}

// 데일리: 날짜와 난이도로 규칙과 시드가 정해진다
export const DAILY_LEVELS = [
  { id: 'easy', name: '쉬움', size: 6, colors: 3 },
  { id: 'normal', name: '보통', size: 8, colors: 3 },
  { id: 'hard', name: '어려움', size: 10, colors: 4 },
];

export function dailyConfig(date, level) {
  const rnd = mulberry32(hashSeed('daily', date, level.id));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)].id;
  const cfg = { w: level.size, h: level.size, colors: level.colors, seed: hashSeed('daily-seed', date, level.id) };
  if (level.id !== 'easy') cfg.cellRule = pick(CELL_RULES);
  if (level.id === 'hard' && rnd() < 0.6) cfg.lineRule = pick(LINE_RULES);
  if (rnd() < (level.id === 'easy' ? 0.3 : 0.5)) cfg[pick(SPECIAL_RULES)] = true;
  return cfg;
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

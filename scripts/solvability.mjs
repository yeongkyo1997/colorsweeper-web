// 규칙·조합별로 퍼즐을 만들어 힌트만 따라 끝까지 풀리는지와 생성 시간을 잰다. 사용법: node scripts/solvability.mjs [big]
const base = new URL('../src/engine/', import.meta.url).href;
const { generate } = await import(base+'generate.js');
const { hintCells, buildConstraints } = await import(base+'solver.js');
const sizes = process.argv[2]==='big' ? [[12,12,5]] : [[6,6,2],[8,8,3],[10,10,4]];
const cases = [
  {}, {hide:true}, {preview:true}, {disguise:true},
  {cellRule:'knight'},{cellRule:'ray'},{cellRule:'couple'},{cellRule:'symmetry'},{cellRule:'pattern'},
  {lineRule:'streak'},{lineRule:'block'},{lineRule:'duo'},
  {cellRule:'knight',lineRule:'block',hide:true,preview:true,disguise:true},
];
for (const c of cases) for (const [w,h,colors] of sizes) {
  let ok=0, giv=0, t=Date.now(), N=10, steps=0;
  for (let s=1;s<=N;s++){ const p=generate({w,h,colors,seed:s*7919,...c}); giv+=p.given.filter(v=>v>=0).length;
    // 정답이 모든 단서를 만족하는지 + 힌트만으로 끝까지
    const sys=buildConstraints(p); const f=p.given.slice(); let k; while((k=hintCells(p,f,sys)).length){ for(const i of k){ if(f[i]>=0) continue; f[i]=p.sol[i]; } steps++; }
    if(f.every(v=>v>=0)) ok++; }
  console.log(JSON.stringify(c).padEnd(80), `${w}x${h}c${colors} solvable ${ok}/${N} givens ${(giv/N).toFixed(1)} ${((Date.now()-t)/N)|0}ms`);
}

// 원본 규칙 코드 분석 결과의 정의로 생성된 단서 값을 다시 계산해 맞는지 검사한다. 사용법: node scripts/verify-rules.mjs [big]
const base = new URL('../src/engine/', import.meta.url).href;
const { generate } = await import(base+'generate.js');
const D8=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
let errors=0; const err=(m)=>{ if(errors++<15) console.log('  ✗',m); };
const big = process.argv[2]==='big';
const sizes = big ? [[12,12,5]] : [[6,6,3],[8,8,3],[10,10,4]];
for (const cfg of [{cellRule:'knight'},{cellRule:'ray'},{cellRule:'couple'},{cellRule:'symmetry'},{cellRule:'pattern'},{lineRule:'streak',disguise:true},{lineRule:'block'},{lineRule:'duo',hide:true},{disguise:true},{preview:true,hide:true}]) {
 let t0=Date.now(), N=big?3:8;
 for (const [w,h,colors] of sizes) for (let s=1;s<=N;s++){
  const p=generate({w,h,colors,seed:s*101+7,...cfg}); const S=p.sol; const n=w*h;
  const at=(x,y)=>x>=0&&y>=0&&x<w&&y<h?y*w+x:-1; const X=i=>i%w, Y=i=>(i/w)|0;
  const std=i=>D8.map(([dx,dy])=>at(X(i)+dx,Y(i)+dy)).filter(j=>j>=0&&S[j]===S[i]).length;
  p.clues.forEach((c,i)=>{
   if(c.kind==='standard'){ const v=std(i); if(!(c.shown===v || (c.disguised&&c.shown===2*v))) err(`standard ${i}`); }
   if(c.kind==='knight'){ const k=[[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]].map(([dx,dy])=>at(X(i)+dx,Y(i)+dy)).filter(j=>j>=0&&S[j]===S[i]).length; if(k!==1) err('knight'); }
   if(c.kind==='ray'){ if(c.dir%2) err('ray diagonal'); const v=c.cells.filter(j=>S[j]===S[i]).length; if(v>4) err('ray >4'); if(!(c.shown===v||(c.disguised&&c.shown===2*v))) err('ray value'); }
   if(c.type==='couple'){ if(std(i)!==std(c.partner)) err('couple'); if(Math.abs(X(i)-X(c.partner))+Math.abs(Y(i)-Y(c.partner))!==1) err('couple adj'); }
   if(c.type==='symmetry'){ const [dx,dy]=D8[c.dir]; const seg=[i]; let j=i; while(j!==c.partner){ j=at(X(j)+dx,Y(j)+dy); if(j<0){err('sym ray');break;} seg.push(j);} if(seg.length<2) err('sym len'); for(let t=0;t<seg.length;t++) if(S[seg[t]]!==S[seg[seg.length-1-t]]) err('sym palin'); }
  });
  if(cfg.cellRule==='knight'){ for(let i=0;i<n;i++){ const k=[[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]].map(([dx,dy])=>at(X(i)+dx,Y(i)+dy)).filter(j=>j>=0&&S[j]===S[i]).length; if(k===1&&p.clues[i].kind!=='knight') err('knight missing'); } }
  if(cfg.cellRule==='ray'){ const c=p.clues.filter(c=>c.kind==='ray').length; if(c!==Math.floor(n/4)) err(`ray count ${c}`); }
  if(cfg.cellRule==='couple'){ const lim=Math.ceil(Math.floor(n/5)/2); if(p.couples.length>lim) err('couple count'); }
  if(cfg.cellRule==='pattern'){ const code=i=>D8.reduce((m,[dx,dy],k)=>{const j=at(X(i)+dx,Y(i)+dy);return j>=0&&S[j]===S[i]?m|1<<k:m;},0);
    if(p.patterns.length>3) err('pattern groups');
    for(const g of p.patterns){ if(g.cells.length<2) err('pattern size'); const all=[...Array(n).keys()].filter(i=>code(i)===g.code); if(all.length!==g.cells.length) err('pattern not whole group'); } }
  for(const lc of p.lineClues){ const cs=lc.cells.map(c=>S[c]); let max=0,bl=0,du=0,run=0; cs.forEach((c,t)=>{run=t&&c===cs[t-1]?run+1:1;max=Math.max(max,run); if(c===lc.color&&run===1)bl++; if((t===cs.length-1||cs[t+1]!==c)&&run===2)du++;});
    const v={streak:max,block:bl,duo:du}[lc.kind]; const sh=lc.shown??lc.value; if(!(sh===v||(lc.disguised&&sh===2*v))) err(`line ${lc.kind}`); }
  if(cfg.preview) for(const c of p.clues) if(c.preview&&c.hidden) err('preview hidden');
 }
 console.log(JSON.stringify(cfg).padEnd(40), `ok-so-far errors=${errors}`, ((Date.now()-t0)/(N*sizes.length)|0)+'ms/puzzle');
}
if (errors) process.exit(1);

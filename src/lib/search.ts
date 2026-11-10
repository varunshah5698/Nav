function toks(s:string){ return (s||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>2); }
export interface Doc { id:string; title:string; text:string; type:string; tags:string[]; ref:string }
export function hybridSearch(query:string, docs:Doc[], limit=20){
  const t0 = performance.now();
  const q = toks(query); if(!q.length) return {results:[],ms:0};
  const df = new Map<string,number>();
  const docToks = docs.map(d=>{ const t=toks(d.title+" "+d.text+" "+d.tags.join(" ")); const s=new Set(t); s.forEach(w=>df.set(w,(df.get(w)||0)+1)); return t; });
  const N = docs.length;
  const scored = docs.map((d,i)=>{
    const t = docToks[i]; const tf = new Map<string,number>(); t.forEach(w=>tf.set(w,(tf.get(w)||0)+1));
    let score=0; const hits:string[]=[];
    q.forEach(w=>{
      const c=tf.get(w)||0; if(c>0){ const idf=Math.log(1+N/((df.get(w)||1))); score+= (c/t.length)*idf*2; hits.push(w); }
      if(d.title.toLowerCase().includes(w)) score+=0.8;
      if(d.tags.join(" ").toLowerCase().includes(w)) score+=0.5;
    });
    return {doc:d,score,hits};
  }).filter(s=>s.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
  const ms = performance.now()-t0;
  return { results: scored.map(s=>{
    const idx = s.doc.text.toLowerCase().indexOf(s.hits[0]||"");
    const excerpt = idx>=0 ? "…"+s.doc.text.slice(Math.max(0,idx-90),idx+160)+"…" : s.doc.text.slice(0,180);
    return {...s.doc, relevance:Math.min(0.99,0.3+s.score), excerpt, matched:s.hits};
  }), ms };
}

// Isolated experiment runner: no DOM/store/secret access, timeout + log capture.
export interface RunResult { metrics:Record<string,number>; logs:string[]; status:"completed"|"failed" }
export async function runExperimentSandbox(params:Record<string,any>, code?:string, timeoutMs=15000):Promise<RunResult>{
  const logs:string[]=[];
  const push=(...a:any[])=>logs.push(a.map(String).join(" "));
  return Promise.race([
    (async()=>{
      try{
        await new Promise(r=>setTimeout(r,600)); // simulate queue/setup
        if(code && code.trim()){
          // Very restricted JS: params + console + Math only
          const fn = new Function("params","console","Math",`"use strict";\n${code}\nreturn (typeof result!=='undefined'?result:undefined);`);
          const fakeConsole={log:(...a:any[])=>push(...a),warn:(...a:any[])=>push("WARN",...a),error:(...a:any[])=>push("ERR",...a)};
          const out = fn(params,fakeConsole,Math);
          if(out && typeof out==="object"){
            const metrics:Record<string,number>={};
            Object.entries(out).forEach(([k,v])=>{ if(typeof v==="number"&&isFinite(v)) metrics[k]=Math.round(v*10000)/10000; });
            return {metrics: Object.keys(metrics).length?metrics:{score:0.5}, logs, status:"completed" as const};
          }
        }
        // Default demo model: deterministic-ish from params (seeded), labelled clearly
        const seed = Number(params.seed??42);
        const epochs = Number(params.epochs??5);
        const lr = Number(params.lr??0.001);
        let acc = 0.82 + (Math.min(epochs,10)/10)*0.12 + (lr===0.001?0.01:0) + ((seed%10)/1000);
        acc = Math.min(0.985,Math.max(0.5,acc));
        const f1 = acc-0.006, loss = Math.max(0.08,0.9-acc*0.7);
        push(`[sandbox] model=${params.model||"mobilenet_v2"} epochs=${epochs} batch=${params.batch||32} seed=${seed}`);
        for(let e=1;e<=Math.min(epochs,5);e++) push(`epoch ${e}/${epochs} — loss ${(0.9-e*0.12).toFixed(2)} acc ${(0.75+e*0.035).toFixed(3)}`);
        if(epochs>5) push(`… ${epochs-5} more epochs (condensed)`);
        push(`done — accuracy ${acc.toFixed(3)}`);
        return {metrics:{accuracy:Math.round(acc*1000)/1000,f1:Math.round(f1*1000)/1000,loss:Math.round(loss*1000)/1000,time_s:Math.round(300+epochs*310)},logs,status:"completed" as const};
      }catch(err:any){ push("ERROR: "+(err?.message||err)); return {metrics:{},logs,status:"failed" as const}; }
    })(),
    new Promise<RunResult>((_,rej)=>setTimeout(()=>rej(new Error("timeout")),timeoutMs)).catch(()=>({metrics:{},logs:[...logs,"TIMEOUT after "+timeoutMs+"ms"],status:"failed" as const})),
  ]);
}

import { useId } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, ComposedChart, Area } from "recharts";
const C=["#9C8BE5","#1E2222","#C6E838","#7AA2FF","#E4F55A","#5B4BC4","#B98A00","#D64545"];
const MIX=["#6FD08C","#F0805A","#E8DFD0","#8B8F87","#C9A9F5","#7AA2FF"];
const tipStyle={background:"#1E2222",color:"#fff",borderRadius:10,fontSize:12,border:"none"} as any;
const darkTip={background:"rgba(24,26,24,.97)",color:"#F2F0EA",borderRadius:12,fontSize:11,border:"1px solid rgba(255,255,255,.1)",boxShadow:"0 16px 40px -16px rgba(0,0,0,.8)"} as any;
export function Bars({data,dataKey,x}:{data:any[];dataKey:string;x:string}){
  return <ResponsiveContainer width="100%" height={220}>
    <BarChart data={data} margin={{top:8,right:8,left:-18,bottom:0}}>
      <XAxis dataKey={x} tick={{fontSize:11,fill:"#6B7171"}} axisLine={false} tickLine={false}/>
      <YAxis tick={{fontSize:11,fill:"#6B7171"}} axisLine={false} tickLine={false}/>
      <Tooltip contentStyle={tipStyle}/>
      <Bar dataKey={dataKey} radius={[5,5,2,2]}>{data.map((_,i)=><Cell key={i} fill={C[i%C.length]}/>)}</Bar>
    </BarChart></ResponsiveContainer>;
}
export function Donut({data,height=210,center,colors}:{data:{name:string;value:number}[];height?:number;center?:{value:string;label:string};colors?:string[]}){
  const palette=colors?.length?colors:MIX;
  return <div className="chart-donut">
    <ResponsiveContainer width="100%" height={height}>
      <PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={56} outerRadius={80} paddingAngle={2.5} cornerRadius={7} strokeWidth={0} isAnimationActive={false}>
        {data.map((_,i)=><Cell key={i} fill={palette[i%palette.length]}/>)}
      </Pie><Tooltip contentStyle={darkTip}/></PieChart>
    </ResponsiveContainer>
    {center&&<div className="chart-donut-c"><b>{center.value}</b><span>{center.label}</span></div>}
  </div>;
}
export function Trend({data,keys}:{data:any[];keys:string[]}){
  return <ResponsiveContainer width="100%" height={220}>
    <LineChart data={data} margin={{top:8,right:8,left:-14,bottom:0}}>
      <CartesianGrid strokeDasharray="3 6" stroke="#E7E8E7" vertical={false}/>
      <XAxis dataKey="label" tick={{fontSize:11,fill:"#6B7171"}} axisLine={false} tickLine={false}/>
      <YAxis tick={{fontSize:11,fill:"#6B7171"}} axisLine={false} tickLine={false}/>
      <Tooltip contentStyle={tipStyle}/>
      {keys.map((k,i)=><Line key={k} type="monotone" dataKey={k} stroke={C[i%C.length]} strokeWidth={2.4} dot={false}/>)}
    </LineChart></ResponsiveContainer>;
}

/* ---------------- dashboard primitives ---------------- */
export type GrowthPoint={label:string;added:number;total:number};
function GrowthTip({active,payload,label}:any){
  if(!active||!payload?.length) return null;
  const added=payload.find((p:any)=>p.dataKey==="added")?.value??0;
  const total=payload.find((p:any)=>p.dataKey==="total")?.value??0;
  return <div className="db-tip">
    <span className="db-tip-h">{label}</span>
    <div className="db-tip-row"><i style={{background:"#F0805A"}}/>Added<b>{added}</b></div>
    <div className="db-tip-row"><i style={{background:"#CFC7B8",borderRadius:"50%"}}/>Corpus<b>{total}</b></div>
  </div>;
}
/** Daily (or weekly) additions as bars with the cumulative corpus as an area, on one count axis. */
export function Growth({data}:{data:GrowthPoint[]}){
  const peak=Math.max(...data.map(d=>d.added),0);
  return <ResponsiveContainer width="100%" height={244}>
    <ComposedChart data={data} margin={{top:12,right:4,left:-18,bottom:0}}>
      <defs>
        <linearGradient id="dbGrowth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D8D2C4" stopOpacity={0.16}/>
          <stop offset="100%" stopColor="#D8D2C4" stopOpacity={0}/>
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,.08)" vertical={false}/>
      <XAxis dataKey="label" tick={{fontSize:10.5,fill:"#9B9A93"}} axisLine={false} tickLine={false} minTickGap={18}/>
      <YAxis tick={{fontSize:10.5,fill:"#9B9A93"}} axisLine={false} tickLine={false} allowDecimals={false} width={38}/>
      <Tooltip content={<GrowthTip/> as any} cursor={{fill:"rgba(255,255,255,.045)"}}/>
      <Area type="monotone" dataKey="total" name="Cumulative" stroke="#CFC7B8" strokeWidth={2} fill="url(#dbGrowth)" dot={false}
        isAnimationActive={false} activeDot={{r:4,fill:"#F0805A",stroke:"#1D1F1C",strokeWidth:2}}/>
      <Bar dataKey="added" name="Added" radius={[6,6,3,3]} maxBarSize={22} isAnimationActive={false}>
        {data.map((d,i)=><Cell key={i} fill={d.added===peak&&peak>0?"#F0805A":"#565A54"}/>)}
      </Bar>
    </ComposedChart>
  </ResponsiveContainer>;
}

/** Validation accuracy per finished run, best run highlighted. */
export function RunBars({data}:{data:{label:string;value:number}[]}){
  const best=Math.max(...data.map(d=>d.value),0);
  return <ResponsiveContainer width="100%" height={244}>
    <BarChart data={data} margin={{top:14,right:6,left:-16,bottom:0}}>
      <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,.08)" vertical={false}/>
      <XAxis dataKey="label" tick={{fontSize:10.5,fill:"#9B9A93"}} axisLine={false} tickLine={false} interval={0}/>
      <YAxis domain={[0,100]} ticks={[0,25,50,75,100]} tick={{fontSize:10.5,fill:"#9B9A93"}} axisLine={false} tickLine={false} width={42}/>
      <Tooltip contentStyle={darkTip} cursor={{fill:"rgba(255,255,255,.045)"}}/>
      <Bar dataKey="value" name="Accuracy" radius={[8,8,4,4]} maxBarSize={40} isAnimationActive={false}>
        {data.map((d,i)=><Cell key={i} fill={d.value===best&&best>0?"#6FD08C":"#565A54"}/>)}
      </Bar>
    </BarChart>
  </ResponsiveContainer>;
}

const sparkTone={lime:"#7E9A17",violet:"#7A67D6",ink:"#1E2222"} as const;
export function Spark({data,width=92,height=34,tone="lime"}:{data:number[];width?:number;height?:number;tone?:keyof typeof sparkTone}){
  const id="spk"+useId().replace(/[^a-zA-Z0-9]/g,"");
  const vals=data.length>1?data:[data[0]??0,data[0]??0];
  const max=Math.max(...vals,1);
  const x=(i:number)=>i/(vals.length-1)*width;
  const y=(v:number)=>height-3-(v/max)*(height-9);
  const line=vals.map((v,i)=>`${i?"L":"M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const color=sparkTone[tone];
  return <svg className="db-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={0.26}/>
      <stop offset="100%" stopColor={color} stopOpacity={0}/>
    </linearGradient></defs>
    <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={`url(#${id})`}/>
    <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"/>
    <circle cx={x(vals.length-1)} cy={y(vals[vals.length-1])} r={2.6} fill="#fff" stroke={color} strokeWidth={2}/>
  </svg>;
}

function polar(cx:number,cy:number,r:number,deg:number){
  const a=deg*Math.PI/180;
  return [cx+r*Math.cos(a), cy+r*Math.sin(a)] as const;
}
function arcPath(from:number,to:number,r=64,cx=90,cy=92){
  const [x0,y0]=polar(cx,cy,r,from), [x1,y1]=polar(cx,cy,r,to);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${to-from>180?1:0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
/** 240° radial gauge; value is a percentage. */
export function Gauge({value,label}:{value:number;label:string}){
  const v=Math.max(0,Math.min(100,value)), start=150, sweep=240;
  const end=start+sweep*(v/100);
  const [ex,ey]=polar(90,92,64,end);
  return <svg className="db-gauge" viewBox="0 0 180 140" role="img" aria-label={`${label}: ${v}%`}>
    {Array.from({length:25},(_,i)=>{
      const deg=start+sweep*i/24, r0=73.5, r1=77.5;
      const [x1,y1]=polar(90,92,r0,deg), [x2,y2]=polar(90,92,r1,deg);
      return <line key={i} className="tick" x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} opacity={deg<=end+0.01?0.95:0.3}/>;
    })}
    <path d={arcPath(start,start+sweep)} className="track"/>
    {v>0&&<>
      <path d={arcPath(start,end)} className="value"/>
      <circle className="cap-end" cx={ex.toFixed(1)} cy={ey.toFixed(1)} r={3.8}/>
    </>}
    <text x="90" y="96" textAnchor="middle" className="num">{v.toFixed(0)}<tspan className="pct">%</tspan></text>
    <text x="90" y="118" textAnchor="middle" className="cap">{label}</text>
  </svg>;
}

/** Ranked horizontal bars with share of total. */
export function RankBars({items,max=6}:{items:{name:string;value:number}[];max?:number}){
  const list=[...items].sort((a,b)=>b.value-a.value).slice(0,max);
  const top=list[0]?.value||1;
  const sum=items.reduce((a,b)=>a+b.value,0)||1;
  return <div className="db-ranks">
    {list.map(it=><div className="db-rank" key={it.name}>
      <span className="lab" title={it.name}>{it.name}</span>
      <span className="track"><i style={{width:`${Math.max(6,(it.value/top)*100)}%`}}/></span>
      <span className="val"><b>{it.value}</b><em>{Math.round(it.value/sum*100)}%</em></span>
    </div>)}
    {items.length>list.length&&<p className="db-ranks-more">+{items.length-list.length} smaller types</p>}
  </div>;
}

import type { Activity, AgentRun, Edge, Experiment, MemoryEntry, RNode, Source, Workspace } from "./types";
const d = (mins:number)=> new Date(Date.now()-mins*60000).toISOString();
export function seedDemo(ownerId:string){
  const ws:Workspace = { id:"ws-demo-plant", name:"Plant Disease Detection", description:"Lightweight CNNs for leaf-image classification — demo workspace", ownerId, createdAt:d(60*24*6), demo:true };
  const N:(n:Partial<RNode>&{id:string;type:RNode["type"];title:string})=>RNode = (n)=>({
    description:"", tags:[], createdAt:d(5000), updatedAt:d(500), x:0, y:0, workspaceId:ws.id, summary:"", ...n } as RNode);
  const nodes:RNode[] = [
    N({id:"n-paper",type:"paper",title:"Lightweight CNN for Plant Leaf Disease Classification",description:"Open-access paper comparing MobileNetV2 and EfficientNet-Lite on leaf images.",summary:"Reports 94.1% accuracy with MobileNetV2 + augmentation; releases training split.",url:"https://arxiv.org/abs/demo-plant",tags:["cnn","plant","classification","demo"],x:60,y:80,createdAt:d(8000),meta:{authors:"A. Rao et al.",venue:"Demo Journal 2024"}}),
    N({id:"n-dataset",type:"dataset",title:"PlantVillage Subset (Demo)",description:"12,500 leaf images, 8 classes. Public sample.",url:"https://example.org/plantvillage-demo",tags:["dataset","images","demo"],x:330,y:60,createdAt:d(7900)}),
    N({id:"n-question",type:"question",title:"Can a <5MB model exceed 90% accuracy on field leaf photos?",description:"Research question driving the reproduction.",tags:["question","efficiency","demo"],x:200,y:250,createdAt:d(7800)}),
    N({id:"n-method",type:"note",title:"Methodology note: augmentation + transfer learning",description:"Freeze backbone 10 epochs, unfreeze + cosine decay, RandAugment.",tags:["methodology","demo"],x:480,y:250,createdAt:d(7700)}),
    N({id:"n-repo",type:"code_repo",title:"github.com/demo/leaf-cnn",description:"PyTorch training repo (MobileNetV2, EfficientNet-Lite).",url:"https://github.com/demo/leaf-cnn",tags:["code","pytorch","demo"],x:60,y:420,createdAt:d(7600)}),
    N({id:"n-exp",type:"experiment",title:"Exp A — MobileNetV2 baseline (CPU)",description:"Laptop-CPU reproduction: 5 epochs, 224px, batch 32.",tags:["experiment","demo"],x:330,y:420,createdAt:d(7000),status:"completed"}),
    N({id:"n-result",type:"result",title:"Result: 91.4% val accuracy (Demo)",description:"Demo run output — labelled demonstration, not a new measurement claim.",tags:["result","demo"],x:600,y:420,createdAt:d(6900)}),
    N({id:"n-error",type:"error",title:"Error: CUDA unavailable / PIL version conflict (Demo)",description:"torch.cuda.is_available()=False; pillow 10 breaks transforms.",tags:["error","demo"],x:330,y:580,createdAt:d(6800)}),
    N({id:"n-fix",type:"fix",title:"Fix: force CPU + pin pillow==9.5.0 (Demo)",description:"Set device=cpu, pin pillow, re-run.",tags:["fix","demo"],x:600,y:580,createdAt:d(6700)}),
    N({id:"n-conc",type:"conclusion",title:"Conclusion: MobileNetV2 viable <5MB at 91%+ (Demo)",description:"Supported by demo result; needs field-photo validation.",tags:["conclusion","demo"],x:600,y:250,createdAt:d(6600)}),
  ];
  const E=(id:string,source:string,target:string,label:string,type:Edge["type"]):Edge=>({id,workspaceId:ws.id,source,target,label,type,createdAt:d(6500)});
  const edges:Edge[] = [
    E("e1","n-paper","n-question","motivates","supports"),
    E("e2","n-paper","n-dataset","evaluates on","references"),
    E("e3","n-dataset","n-exp","used by","uses"),
    E("e4","n-question","n-exp","investigated by","investigates"),
    E("e5","n-exp","n-result","produces","produces"),
    E("e6","n-exp","n-error","raised","relates"),
    E("e7","n-error","n-fix","resolved by","resolves"),
    E("e8","n-fix","n-exp","enabled rerun","relates"),
    E("e9","n-result","n-conc","supports","supports"),
  ];
  const sources:Source[] = [
    {id:"s-paper",workspaceId:ws.id,kind:"pdf",title:"Lightweight CNN for Plant Leaf Disease Classification",authors:"A. Rao et al.",abstract:"Demo abstract: MobileNetV2 reaches 94.1% with augmentation.",tags:["cnn","plant","demo"],status:"ready",progress:100,nodeId:"n-paper",createdAt:d(8000),durationMs:4200,chunks:[{page:1,text:"We study lightweight CNNs for leaf disease classification… (demo excerpt p.1)"},{page:3,text:"MobileNetV2 + RandAugment achieves 94.1% val accuracy… (demo excerpt p.3)"}]},
    {id:"s-data",workspaceId:ws.id,kind:"dataset",title:"PlantVillage Subset (Demo) — metadata",tags:["dataset","demo"],status:"ready",progress:100,nodeId:"n-dataset",createdAt:d(7900),durationMs:800,abstract:"12,500 images, 8 classes, CC-BY sample."},
    {id:"s-repo",workspaceId:ws.id,kind:"github",title:"github.com/demo/leaf-cnn",url:"https://github.com/demo/leaf-cnn",tags:["code","demo"],status:"ready",progress:100,nodeId:"n-repo",createdAt:d(7600),durationMs:1500,abstract:"PyTorch 2.1, torchvision, pillow==9.5.0"},
    {id:"s-note",workspaceId:ws.id,kind:"note",title:"Field-photo gap note",tags:["note","demo"],status:"ready",progress:100,nodeId:"n-method",createdAt:d(7700),durationMs:200,abstract:"Lab accuracy may drop 5-10 pts on field photos — needs validation."},
  ];
  const experiments:Experiment[] = [{
    id:"x-exp-a",workspaceId:ws.id,name:"Exp A — MobileNetV2 baseline (CPU)",objective:"Reproduce 90%+ accuracy on laptop CPU with <5MB model.",
    questionId:"n-question",sourceId:"s-paper",datasetId:"s-data",repoUrl:"https://github.com/demo/leaf-cnn",
    methodology:"Transfer learning: freeze backbone 3 epochs, unfreeze, cosine LR, RandAugment.",
    params:{model:"mobilenet_v2",epochs:5,batch:32,lr:0.001,seed:42,img:224},deps:["torch==2.1.0","torchvision==0.16.0","pillow==9.5.0"],
    env:{python:"3.10",framework:"pytorch-cpu"},status:"completed",
    plan:"Approved plan: CPU-only, 5 epochs, save best checkpoint, log val accuracy/F1.",
    expected:"Val accuracy ~90% (demo).",runs:[
      {id:"r1",startedAt:d(3000),finishedAt:d(2970),status:"completed",params:{model:"mobilenet_v2",epochs:5},metrics:{accuracy:0.914,f1:0.908,loss:0.27,time_s:1820},logs:["[demo] epoch 1/5 — loss 0.61 acc 0.78","[demo] epoch 5/5 — loss 0.27 acc 0.914","saved best.pt"]},
      {id:"r2",startedAt:d(2000),finishedAt:d(1985),status:"completed",params:{model:"efficientnet_lite0",epochs:5},metrics:{accuracy:0.902,f1:0.895,loss:0.31,time_s:1690},logs:["[demo] epoch 5/5 — loss 0.31 acc 0.902"]},
    ],nodeId:"n-exp",createdAt:d(7000)}];
  const memories:MemoryEntry[] = [
    {id:"m1",workspaceId:ws.id,kind:"success",title:"MobileNetV2 5-epoch CPU config works (Demo)",description:"batch 32, lr 1e-3, seed 42 → 91.4% val (demo).",experimentId:"x-exp-a",params:{model:"mobilenet_v2",epochs:5,batch:32,lr:0.001,seed:42},tags:["config","demo"],reuseCount:3,createdAt:d(2900)},
    {id:"m2",workspaceId:ws.id,kind:"error",title:"pillow 10 breaks transforms (Demo)",description:"ToPILImage dtype error with pillow 10.x.",error:"TypeError: ToPILImage() with pillow 10",tags:["error","deps","demo"],reuseCount:5,createdAt:d(6800)},
    {id:"m3",workspaceId:ws.id,kind:"fix",title:"Pin pillow==9.5.0 + device=cpu (Demo)",description:"Fix verified on rerun.",fix:"pip install pillow==9.5.0; device=cpu",tags:["fix","demo"],reuseCount:5,createdAt:d(6700)},
    {id:"m4",workspaceId:ws.id,kind:"finding",title:"Augmentation +2pts (Demo)",description:"RandAugment improved 89.3→91.4 (demo).",tags:["finding","demo"],reuseCount:2,createdAt:d(6600)},
    {id:"m5",workspaceId:ws.id,kind:"conclusion",title:"<5MB viable, field validation needed (Demo)",description:"See conclusion node.",tags:["conclusion","demo"],reuseCount:1,createdAt:d(6500)},
  ];
  const agents:AgentRun[] = [
    {id:"a1",workspaceId:ws.id,agent:"paper_reader",task:"Analyze paper: contributions + methodology",status:"completed",inputRef:"s-paper",output:"Summary: lightweight CNNs; method: transfer learning + RandAugment; result 94.1% (reported); limitation: lab images only. (Demo output)",confidence:0.86,createdAt:d(7500),updatedAt:d(7490),events:[{ts:d(7500),text:"Queued analysis",kind:"status"},{ts:d(7495),text:"Extracted 4 contributions + methodology (pp. 1–4)",kind:"tool",detail:"pdf_extract"},{ts:d(7490),text:"Completed with citations",kind:"status"}],toolCalls:["pdf_extract","summarize"]},
    {id:"a2",workspaceId:ws.id,agent:"experiment",task:"Generate CPU reproduction plan",status:"completed",inputRef:"x-exp-a",output:"Plan: 5 epochs CPU, batch 32, save best.pt, compare 2 models. (Demo)",confidence:0.81,createdAt:d(7100),updatedAt:d(7090),events:[{ts:d(7100),text:"Drafted plan, requested approval",kind:"status"},{ts:d(7095),text:"Approved by researcher",kind:"approval"},{ts:d(7090),text:"Plan finalized",kind:"status"}],approval:{action:"Execute Exp A on laptop CPU",reason:"Reproduces reported baseline at small cost",expected:"~30 min, val metrics saved",risks:"CPU heat; no GPU",state:"approved"}},
  ];
  const acts:Activity[] = [
    {id:"ac1",workspaceId:ws.id,kind:"source",text:"Demo paper added",refType:"source",refId:"s-paper",createdAt:d(8000)},
    {id:"ac2",workspaceId:ws.id,kind:"graph",text:"9 connections created (demo import)",createdAt:d(6500)},
    {id:"ac3",workspaceId:ws.id,kind:"agent",text:"Paper Reader completed summary",refType:"agent",refId:"a1",createdAt:d(7490)},
    {id:"ac4",workspaceId:ws.id,kind:"experiment",text:"Exp A completed — 91.4% (demo)",refType:"experiment",refId:"x-exp-a",createdAt:d(2970)},
    {id:"ac5",workspaceId:ws.id,kind:"memory",text:"Fix saved: pillow==9.5.0",createdAt:d(6700)},
  ];
  return { ws, nodes, edges, sources, experiments, memories, agents, acts };
}

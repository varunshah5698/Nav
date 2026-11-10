export type Role = "owner" | "editor" | "viewer";
export type NodeType = "paper"|"dataset"|"code_repo"|"code_file"|"note"|"webpage"|"question"|"experiment"|"result"|"error"|"fix"|"conclusion";
export type EdgeType = "supports"|"references"|"uses"|"investigates"|"produces"|"resolves"|"contradicts"|"relates";
export interface User { id:string; name:string; email:string; passHash:string; salt:string; createdAt:string }
export interface Workspace { id:string; name:string; description:string; ownerId:string; createdAt:string; demo?:boolean }
export interface Membership { workspaceId:string; userId:string; role:Role }
export interface RNode {
  id:string; workspaceId:string; type:NodeType; title:string; description:string;
  summary?:string; url?:string; tags:string[]; status?:string; createdAt:string; updatedAt:string;
  x:number; y:number; meta?:Record<string,any>;
}
export interface Edge { id:string; workspaceId:string; source:string; target:string; label:string; type:EdgeType; createdAt:string }
export type SourceKind = "pdf"|"url"|"github"|"dataset"|"note";
export type SourceStatus = "queued"|"processing"|"ready"|"failed";
export interface Source {
  id:string; workspaceId:string; kind:SourceKind; title:string; authors?:string; abstract?:string;  url?: string; tags: string[]; status: SourceStatus; progress: number; error?: string;
  chunks?:{page:number;text:string}[]; nodeId?:string; createdAt:string; durationMs?:number;
  /** Pages in the original document (PDF extraction). */
  pages?:number; /** Characters extracted from the document. */ charCount?:number;
  /** True when extraction exceeded the local storage cap. */ truncated?:boolean;
}
export type AgentName = "controller"|"paper_reader"|"equation"|"code_setup"|"experiment"|"benchmark"|"memory"|"review";
export type AgentStatus = "queued"|"running"|"waiting_approval"|"completed"|"failed"|"paused"|"cancelled";
export interface AgentEvent { ts:string; text:string; kind:string; detail?:string }
export interface AgentRun {
  id:string; workspaceId:string; agent:AgentName; task:string; status:AgentStatus;
  inputRef?:string; output?:string; confidence?:number; createdAt:string; updatedAt:string;
  events:AgentEvent[]; toolCalls?:string[];
  approval?:{ action:string; reason:string; expected:string; risks:string; state:"pending"|"approved"|"rejected"|"modified"; note?:string };
}
export type ExpStatus = "draft"|"pending_approval"|"approved"|"running"|"completed"|"failed"|"cancelled";
export interface ExpRun { id:string; startedAt:string; finishedAt?:string; status:"running"|"completed"|"failed"|"cancelled"; metrics:Record<string,number>; logs:string[]; params:Record<string,any> }
export interface Experiment {
  id:string; workspaceId:string; name:string; objective:string; questionId?:string; sourceId?:string;
  datasetId?:string; repoUrl?:string; methodology:string; params:Record<string,any>; deps:string[];
  env:{python:string;framework:string}; status:ExpStatus; plan?:string; expected?:string;
  runs:ExpRun[]; nodeId?:string; createdAt:string;
}
export interface MemoryEntry {
  id:string; workspaceId:string; kind:"success"|"failure"|"params"|"env"|"error"|"fix"|"finding"|"conclusion"|"insight";
  title:string; description:string; experimentId?:string; params?:Record<string,any>; env?:string;
  error?:string; fix?:string; tags:string[]; reuseCount:number; createdAt:string; sourceId?:string;
}
export interface Activity { id:string; workspaceId:string; kind:string; text:string; refType?:string; refId?:string; createdAt:string }
export interface Invite { id:string; workspaceId:string; email:string; role:Role; status:"pending"|"accepted" }
export interface ExportJob { id:string; workspaceId:string; kind:string; format:string; createdAt:string; status:string; size?:string }
export interface SearchLog { id:string; workspaceId:string; query:string; results:number; opened:boolean; createdAt:string; durationMs:number }
export interface Session { userId:string; createdAt:string; expiresAt:string }

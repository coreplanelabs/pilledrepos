import type {Author,Report,RepositoryProfile,Evidence} from './core.js';
export type AiAgent={id:number;login:string;name:string;source:string};
export type AiRegistry={version:1;verifiedAt:string;agents:AiAgent[];sources?:{url:string;sha:string}[];candidates?:{id:number;login:string;merges:number}[]};
export type AiAnalysis={total:number;ai:number;human:number;automation:number;unknown:number;share:number|null;eligible:boolean;complete:boolean;agents:{agent:AiAgent;count:number;author:Author;evidence:Evidence[]}[];evidence:Evidence[];registryAt:string};
export type AiPage={repository:string;url:string;description:string;capturedAt:string;profile?:RepositoryProfile;analysis:AiAnalysis};
export type AiRow=AiPage&{rank:number};
export const MIN_MERGES=20;
export function parseRegistry(value:unknown):AiRegistry {
 const r=value as AiRegistry;
 if(!r||r.version!==1||!Number.isFinite(Date.parse(r.verifiedAt))||!Array.isArray(r.agents)||!r.agents.length||r.agents.length>100)throw new Error('The AI account registry is unavailable.');
 const ids=new Set<number>();
 for(const a of r.agents){if(!Number.isSafeInteger(a.id)||a.id<=0||ids.has(a.id)||typeof a.login!=='string'||!/^[a-z0-9_.\[\]-]{1,100}$/i.test(a.login)||typeof a.name!=='string'||a.name.length>100)throw new Error('Invalid AI account registry.');const url=new URL(a.source);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid registry source.');ids.add(a.id);}
 return r;
}
export function analyzeAi(report:Report,registry:AiRegistry):AiAnalysis {
 const known=new Map(registry.agents.map(agent=>[agent.id,agent])),groups=new Map<number,AiAnalysis['agents'][number]>(),now=Date.parse(report.capturedAt);
 let total=0,ai=0,human=0,automation=0,unknown=0;
 for(const pr of report.facts.closed){if(pr.mergedAt===null||pr.mergedAt<now-90*86400000||pr.mergedAt>now)continue;total++;const agent=pr.author?known.get(pr.author.id):undefined;
 if(agent&&pr.author){ai++;const group=groups.get(agent.id)??{agent,count:0,author:pr.author,evidence:[]};group.count++;if(group.evidence.length<4)group.evidence.push({number:pr.number,title:pr.title,url:pr.url});groups.set(agent.id,group);}
 else if(!pr.author)unknown++;else if(pr.author.bot)automation++;else human++;
 }
 const agents=[...groups.values()].sort((a,b)=>b.count-a.count||a.agent.name.localeCompare(b.agent.name));
 return {total,ai,human,automation,unknown,share:total?ai/total*100:null,eligible:total>=MIN_MERGES,complete:report.coverage.periodComplete,agents,evidence:agents.flatMap(group=>group.evidence).slice(0,8),registryAt:registry.verifiedAt};
}
export function aiPage(report:Report,registry:AiRegistry):AiPage{return {repository:report.repository,url:report.url,description:report.description,capturedAt:report.capturedAt,profile:report.profile,analysis:analyzeAi(report,registry)};}
export function aiLeaderboard(reports:Report[],registry:AiRegistry):AiRow[]{
 const pages=reports.map(report=>aiPage(report,registry)).filter(page=>page.analysis.eligible).sort((a,b)=>b.analysis.share!-a.analysis.share!||b.analysis.ai-a.analysis.ai||b.analysis.total-a.analysis.total||a.repository.localeCompare(b.repository));
 return pages.map(page=>({...page,rank:1+pages.filter(other=>other.analysis.share!>page.analysis.share!).length}));
}
export function aiSummary(page:AiPage):string{const a=page.analysis;return a.share===null?'No merged PRs in this read.':`${a.ai} of ${a.total} merged PRs (${formatShare(a.share)}) were authored by known AI-agent accounts.`;}
export function formatShare(share:number|null):string{return share===null?'—':`${share===0||share===100?share:share.toFixed(1)}%`;}

import type {AiAgent,AiRegistry} from '../src/ai.js';
import {parseRegistry} from '../src/ai.js';
export const PARTNER_SOURCE='/repos/github/docs/contents/content/copilot/concepts/agents/about-third-party-coding-agents.md';
export const PARTNER_URL='https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents';
/** Only explicit agent-install declarations in GitHub's own docs create candidates. */
export function partnerAgents(markdown:string):{login:string;name:string;source:string}[]{
 const entries=[];for(const match of markdown.matchAll(/Allow ([a-z0-9 -]+) coding agent\*\*[^\n]*will install `([a-z0-9 -]+)`/gi))entries.push({login:match[2].trim().replace(/\s+/g,'-')+'[bot]',name:match[1].trim(),source:PARTNER_URL});return entries;
}
export async function refreshAiRegistry(seed:AiRegistry,read:(path:string)=>Promise<unknown>,now:number):Promise<AiRegistry>{
 const source=await read(PARTNER_SOURCE) as {content?:string;sha?:string;encoding?:string};
 if(source.encoding!=='base64'||!source.content||!source.sha||source.content.length>500000)throw new Error('Cannot refresh the official AI-agent source.');
 const text=atob(source.content.replace(/\s/g,'')),discovered=partnerAgents(text);
 if(!discovered.length)throw new Error('GitHub agent declarations changed; review the registry parser.');
 const verified=new Map<number,AiAgent>(seed.agents.map(agent=>[agent.id,agent]));
 for(const entry of [...seed.agents,...discovered]) {
  let raw:unknown;try{raw=await read('/users/'+encodeURIComponent(entry.login));}catch{if('id'in entry)continue;throw new Error(`New agent identity cannot be verified: ${entry.name}.`);}
  const account=raw as {id:number;login:string;type:string;html_url:string};
  if(account.type!=='Bot'||!Number.isSafeInteger(account.id)||account.id<1)throw new Error(`Agent identity is not a GitHub bot: ${entry.name}.`);
  if('id'in entry&&entry.id!==account.id)throw new Error(`AI account identity changed: ${entry.name}.`);
  const actor=verified.get(account.id);verified.set(account.id,{id:account.id,login:account.login,name:actor?.name??entry.name,source:actor?.source??entry.source});
 }
 return parseRegistry({version:1,verifiedAt:new Date(now).toISOString(),agents:[...verified.values()],sources:[{url:PARTNER_URL,sha:source.sha}]});
}

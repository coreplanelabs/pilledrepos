import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReport,replayReport,type Detail} from '../src/core.js';
import {leaderboard} from '../src/catalog.js';
const now=Date.parse('2026-10-07T12:00:00Z');
const author={id:1,login:'human',bot:false};
const pr=(number:number,additions:number,bot:boolean|null):Detail=>({number,title:'Change',url:`https://github.com/test/repo/pull/${number}`,author:bot===null?null:{...author,id:bot?2:1,bot},createdAt:now-10000,updatedAt:now-1000,mergedAt:now-1000,draft:false,association:'NONE',headSha:'a'.repeat(40),additions,deletions:3,reviewComments:1});
test('Big Bang ranks one PR and Human Touch excludes bots and unknown authors',()=>{
 const pulls=[pr(1,100,false),pr(2,200,true),pr(3,10,null),pr(4,50,false)];
 const report=buildReport({repository:'test/repo',now,description:'',closed:pulls,details:pulls,open:[],openKnown:true,periodComplete:true,detailRequested:4,requests:0,notes:[],contributingUrl:null});
 assert.equal(leaderboard([report],'additions')[0].score,200);
 assert.equal(report.awards.find(row=>row.id==='additions')?.evidence[0].number,2);
 const human=leaderboard([report],'humans')[0];assert.equal(human.score,2);assert.equal(human.castCount,1);assert.equal(human.cast?.[0].bot,false);
 assert.equal(leaderboard([report],'bots')[0].score,1);
 const replayed=replayReport(report);assert.equal(leaderboard([replayed],'additions')[0].score,200);assert.equal(leaderboard([replayed],'humans')[0].score,2);
});

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {getDb,REPO_ROOT} from './lib/db.mjs';
import {parseCsv} from './lib/csv.mjs';
import {table} from './lib/format.mjs';
import {sourceUrl,validateRecipe,extractHtml,fetchPermittedHtml} from './lib/extraction.mjs';

const entities={sources:'name',recipes:'row_selector',runs:'digest',observations:'record_key',tasks:'title'};
export const reads={
 sources:'select id,name,url,owner,status,permission_until,retention_review from sources order by name',
 recipes:'select s.name as source,p.* from recipes p join sources s on s.id=p.source_id order by s.name',
 runs:'select r.id,s.name as source,r.mode,r.captured_at,r.status,r.row_count,r.issue_count,r.error from runs r join sources s on s.id=r.source_id order by r.captured_at desc',
 records:'select id,source,record_key,decision,missing_fields,payload from current_records order by source,record_key',
 'due-runs':"select name,owner,next_due,has_recipe,permission_until from source_health where status='active' and next_due<=now() order by next_due,name",
 'change-review':"select id,source,record_key,change,decision,missing_fields from changed_records where change<>'unchanged' order by source,record_key",
 'quality-review':"select id,source,record_key,missing_fields,decision from current_records where jsonb_array_length(missing_fields)>0 order by source,record_key",
 'permission-review':'select name,owner,permission_until,retention_review,purpose,permission_ref from sources order by permission_until,name',
 attention:"select name,owner,pending,overdue_tasks,next_due,permission_until,retention_review from source_health where pending>0 or overdue_tasks>0 or (status='active' and next_due<=now()) or permission_until<current_date or retention_review<current_date order by overdue_tasks desc,name",
 compliance:'select * from compliance_gaps order by name,rule',
 history:'select * from audit_events order by created_at,id',
 tasks:'select t.id,s.name as source,t.title,t.owner,t.due_date,t.status,t.resolution from tasks t join sources s on s.id=t.source_id order by t.due_date,t.title',
};
export const questions=[
 ['Which sources are due and have expired permission?',"select name,owner,next_due from source_health where status='active' and next_due<=now() and permission_until<current_date"],
 ['Which changed records still need a decision?',"select source,record_key,change from changed_records where change='changed' and decision='pending'"],
 ['Which current records have missing required fields?',reads['quality-review']],
 ['Who owns overdue follow-up work?',"select owner,count(*)::int as overdue from tasks where status='open' and due_date<current_date group by owner"],
 ['Which sources have never completed a capture?',"select name,owner from source_health where last_capture is null"],
 ['Which sources are past their retention review?',"select name,owner,retention_review from sources where retention_review<current_date"],
 ['Which current records have been held out of delivery?',"select source,record_key,review_note from current_records where decision='held'"],
 ['Which extractions failed and why?',"select s.name,r.captured_at,r.error from runs r join sources s on s.id=r.source_id where r.status='failed'"],
 ['Which accepted records changed in the next capture?',"select distinct c.source,c.record_key from current_records c join observations old on old.record_key=c.record_key join runs r on r.id=old.run_id where r.source_id=c.source_id and r.captured_at<c.captured_at and old.decision='accepted' and old.payload<>c.payload"],
 ['Which sources have the largest pending review queue?',"select name,owner,pending from source_health where pending>0 order by pending desc,name"],
];
export function parseArgs(args){const flags={},pos=[];for(const a of args){if(a.startsWith('--')){const at=a.indexOf('=');const k=a.slice(2,at<0?undefined:at);if(k in flags)throw Error('Duplicate flag '+k);flags[k]=at<0?true:a.slice(at+1);}else pos.push(a);}return {flags,pos};}
function required(o,key){const v=o[key];if(typeof v!=='string'||!v.trim())throw Error('Required --'+key+'=value');return v.trim();}
function date(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v).toISOString().slice(0,10)!==v)throw Error('Expected a real YYYY-MM-DD date');return v;}
function captured(v){date(v.slice(0,10));if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)||!Number.isFinite(Date.parse(v))||Date.parse(v)>Date.now()+60000)throw Error('Use a valid, non-future UTC captured time, YYYY-MM-DDTHH:mm:ssZ');return new Date(v).toISOString();}
function auth(f){return {operator:required(f,'by'),reason:required(f,'reason'),evidence:required(f,'evidence')};}
function readFile(f){if(fs.statSync(f).size>5*1024*1024)throw Error('Input exceeds 5 MiB');return fs.readFileSync(f,'utf8');}
async function transaction(db,fn,dry=false){await db.exec('BEGIN');try{const r=await fn();await db.exec(dry?'ROLLBACK':'COMMIT');return r;}catch(e){await db.exec('ROLLBACK');throw e;}}
export async function resolve(db,entity,ref){
 if(!entities[entity])throw Error('Unknown entity');if(!ref)throw Error('Record reference required');
 const rows=await db.query(`select * from ${entity} order by ${entity==='sources'?'name':'id'}`);
 const exact=rows.filter(r=>r.id===ref||String(r[entities[entity]]).toLowerCase()===ref.toLowerCase());
 const matches=exact.length?exact:rows.filter(r=>r.id.startsWith(ref.toLowerCase())||String(r[entities[entity]]).toLowerCase().includes(ref.toLowerCase()));
 if(matches.length!==1)throw Error((matches.length?'Ambiguous record':'No matching record')+': '+ref+'\n'+(matches.length?matches:rows).map(r=>r.id+' '+r[entities[entity]]).join('\n'));
 return matches[0];
}
async function audit(db,id,action,a,before,after){await db.query('insert into audit_events(entity_id,action,operator,reason,evidence_ref,before_value,after_value) values($1,$2,$3,$4,$5,$6,$7)',[id,action,a.operator,a.reason,a.evidence,before?JSON.stringify(before):null,after?JSON.stringify(after):null]);}
async function sourceAndRecipe(db,ref){const s=await resolve(db,'sources',ref);const [p]=await db.query('select * from recipes where source_id=$1',[s.id]);if(!p)throw Error('Source needs a recipe');validateRecipe(p);return {s,p};}
function guard(s){const today=new Date().toISOString().slice(0,10);if(s.status!=='active')throw Error('Source is paused');if(s.permission_until<today||!s.permission_ref.trim()||!s.purpose.trim())throw Error('Current permission, evidence and purpose required');if(s.retention_review<today)throw Error('Retention review is overdue');}
export async function ingest(db,ref,rows,mode,raw,f){
 const a=auth(f),at=captured(required(f,'captured-at'));const digest=createHash('sha256').update(raw).digest('hex');
 return transaction(db,async()=>{
  let {s,p}=await sourceAndRecipe(db,ref);[s]=await db.query('select * from sources where id=$1 for update',[s.id]);[p]=await db.query('select * from recipes where source_id=$1',[s.id]);guard(s);
  if(!Array.isArray(rows)||rows.length<p.min_rows||rows.length>p.max_rows)throw Error('Snapshot row count is outside the recipe bounds');
  const keys=new Set();const checked=rows.map((row,i)=>{
   if(!row||typeof row!=='object'||Array.isArray(row)||Object.values(row).some(v=>typeof v!=='string'))throw Error('Rows must contain text values');
   const key=String(row[p.key_field]||'').trim();if(!key)throw Error('Missing record key at row '+(i+1));if(keys.has(key))throw Error('Duplicate record key '+key);keys.add(key);
   return {key,row,missing:p.required_fields.filter(k=>!String(row[k]??'').trim())};
  });
  const old=await db.query('select id from runs where source_id=$1 and digest=$2 and captured_at=$3 and recipe_version=$4 and mode=$5',[s.id,digest,at,p.version,mode]);
  if(old.length)return {replayed:true,run_id:old[0].id,rows:rows.length};
  const sameTime=await db.query("select id from runs where source_id=$1 and captured_at=$2 and status='complete'",[s.id,at]);
  if(sameTime.length)throw Error('A different snapshot already has this captured time; investigate before importing');
  const issues=checked.filter(r=>r.missing.length).length;
  const [run]=await db.query('insert into runs(source_id,mode,digest,captured_at,recipe_version,recipe_snapshot,status,row_count,issue_count,evidence_ref,operator) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *',[s.id,mode,digest,at,p.version,JSON.stringify(p),'complete',rows.length,issues,a.evidence,a.operator]);
  for(const r of checked)await db.query('insert into observations(run_id,record_key,payload,missing_fields) values($1,$2,$3,$4)',[run.id,r.key,JSON.stringify(r.row),JSON.stringify(r.missing)]);
  await audit(db,run.id,'snapshot-'+mode,a,null,{source:s.name,rows:rows.length,issues,captured_at:at});
  return {run_id:run.id,rows:rows.length,quality_issues:issues,dry_run:Boolean(f['dry-run']),review:'Every row starts pending'};
 },Boolean(f['dry-run']));
}
async function failRun(db,s,p,error,f){const a=auth(f);return transaction(db,async()=>{const [r]=await db.query('insert into runs(source_id,mode,digest,captured_at,recipe_version,recipe_snapshot,status,error,evidence_ref,operator) values($1,$2,$3,now(),$4,$5,$6,$7,$8,$9) returning id',[s.id,'fetch',createHash('sha256').update(String(Date.now())+error.message).digest('hex'),p.version,JSON.stringify(p),'failed',error.message,a.evidence,a.operator]);await audit(db,r.id,'fetch-failed',a,null,{error:error.message});});}
export async function fetchSource(db,ref,f){auth(f);const {s,p}=await sourceAndRecipe(db,ref);guard(s);let html;try{html=await fetchPermittedHtml(s.url);const rows=extractHtml(html,p);return await ingest(db,s.id,rows,'fetch',html,{...f,'captured-at':new Date().toISOString()});}catch(e){if(!f['dry-run'])await failRun(db,s,p,e,f);throw e;}}
function privateFile(folder,name,content){const dir=path.join(path.resolve(process.env.OUTPUT_DIR||REPO_ROOT),folder);fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,name);fs.writeFileSync(file,content,{mode:0o600,flag:'wx'});return file;}
export async function run(db,args){
 const {flags:f,pos}=parseArgs(args),[cmd,...rest]=pos;
 const options={
 'add-source':['name','url','owner','purpose','permission','until','retention-review','hours'],
 'configure-recipe':['file'], 'set-source':['owner','purpose','permission','until','retention-review','status'],
 import:['source','captured-at','dry-run'], 'extract-file':['file','captured-at','dry-run'],fetch:['dry-run'],'run-due':['dry-run'],
 review:['decision'],'log-task':['title','owner','due'],'close-task':['resolution']
 };
 const mutating=new Set(Object.keys(options));
 const allowed=new Set(['json','help',...(options[cmd]||[]),...(mutating.has(cmd)?['by','reason','evidence']:[])]);
 for(const key of Object.keys(f))if(!allowed.has(key))throw Error('Unknown flag --'+key+' for '+cmd);
 for(const key of ['json','help','dry-run'])if(key in f&&f[key]!==true)throw Error('--'+key+' takes no value');
 if(!cmd||cmd==='help'||f.help)return {commands:[...Object.keys(reads),'show','insights','weekly-review','add-source','configure-recipe','set-source','import','extract-file','fetch','run-due','review','log-task','close-task','draft-source-review','export'],usage:'node scripts/extract.mjs <command> [record] --json. Read docs/cli.md. Mutations require --by, --reason, --evidence.'};
 if(reads[cmd])return db.query(reads[cmd]);
 if(cmd==='show'){const r=await resolve(db,rest[0],rest[1]);return {record:r,history:await db.query('select * from audit_events where entity_id=$1 order by created_at,id',[r.id])};}
 if(cmd==='insights'){const out=[];for(const [question,sql] of questions)out.push({question,rows:await db.query(sql)});return out;}
 if(cmd==='weekly-review'){const result={};for(const k of ['due-runs','change-review','quality-review','attention','compliance'])result[k]=await db.query(reads[k]);return result;}
 if(cmd==='add-source'){
  const a=auth(f),interval=Number(f.hours||24);if(!Number.isInteger(interval)||interval<1||interval>8760)throw Error('hours must be 1 to 8760');
  return transaction(db,async()=>{const [s]=await db.query('insert into sources(name,url,owner,purpose,permission_ref,permission_until,retention_review,interval_hours) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',[required(f,'name'),sourceUrl(required(f,'url')),required(f,'owner'),required(f,'purpose'),required(f,'permission'),date(required(f,'until')),date(required(f,'retention-review')),interval]);await audit(db,s.id,cmd,a,null,s);return s;});
 }
 if(cmd==='configure-recipe'){
  const a=auth(f),p=validateRecipe(JSON.parse(readFile(required(f,'file'))));
  return transaction(db,async()=>{const s=await resolve(db,'sources',rest[0]);await db.query('select id from sources where id=$1 for update',[s.id]);const [old]=await db.query('select * from recipes where source_id=$1',[s.id]);
   const [row]=await db.query('insert into recipes(source_id,row_selector,fields,key_field,required_fields,min_rows,max_rows) values($1,$2,$3,$4,$5,$6,$7) on conflict(source_id) do update set row_selector=excluded.row_selector,fields=excluded.fields,key_field=excluded.key_field,required_fields=excluded.required_fields,min_rows=excluded.min_rows,max_rows=excluded.max_rows,version=recipes.version+1 returning *',[s.id,p.row_selector,JSON.stringify(p.fields),p.key_field,JSON.stringify(p.required_fields),p.min_rows,p.max_rows]);await audit(db,s.id,cmd,a,old,row);return row;});
 }
 if(cmd==='set-source'){
  const a=auth(f);return transaction(db,async()=>{let s=await resolve(db,'sources',rest[0]);[s]=await db.query('select * from sources where id=$1 for update',[s.id]);const status=f.status||s.status;if(!['active','paused'].includes(status))throw Error('status must be active or paused');const [updated]=await db.query('update sources set owner=$2,purpose=$3,permission_ref=$4,permission_until=$5,retention_review=$6,status=$7 where id=$1 returning *',[s.id,f.owner?required(f,'owner'):s.owner,f.purpose?required(f,'purpose'):s.purpose,f.permission?required(f,'permission'):s.permission_ref,f.until?date(f.until):s.permission_until,f['retention-review']?date(f['retention-review']):s.retention_review,status]);await audit(db,s.id,cmd,a,s,updated);return updated;});
 }
 if(cmd==='import'){
  if(rest[0]!=='import-io'||!rest[1])throw Error('Use import import-io <CSV file> --source=<name> --captured-at=<UTC timestamp>');
  const raw=readFile(rest[1]);return ingest(db,required(f,'source'),parseCsv(raw),'import',raw,f);
 }
 if(cmd==='extract-file'){const {p}=await sourceAndRecipe(db,rest[0]);const html=readFile(required(f,'file'));return ingest(db,rest[0],extractHtml(html,p),'file',html,f);}
 if(cmd==='fetch')return fetchSource(db,rest[0],f);
 if(cmd==='run-due'){
  auth(f);const due=await db.query("select id,name from source_health where status='active' and next_due<=now() order by next_due,name limit 20");const results=[];
  for(const s of due){try{results.push({source:s.name,ok:true,result:await fetchSource(db,s.id,f)});}catch(e){results.push({source:s.name,ok:false,error:e.message});}}
  return {ok:results.every(r=>r.ok),results};
 }
 if(cmd==='review'){
  const a=auth(f);if(!['accepted','held','pending'].includes(f.decision))throw Error('decision must be accepted, held or pending');
  return transaction(db,async()=>{let r=await resolve(db,'observations',rest[0]);[r]=await db.query('select * from observations where id=$1 for update',[r.id]);const current=await db.query('select id from current_records where id=$1',[r.id]);if(!current.length)throw Error('Only current records can be reviewed');if(f.decision==='accepted'&&r.missing_fields.length)throw Error('Missing required fields: correct the source and collect a fresh snapshot');const [updated]=await db.query('update observations set decision=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4 where id=$1 returning *',[r.id,f.decision,a.operator,a.reason]);await audit(db,r.id,cmd,a,r,updated);return updated;});
 }
 if(cmd==='log-task'){
  const a=auth(f);return transaction(db,async()=>{const s=await resolve(db,'sources',rest[0]);const [t]=await db.query('insert into tasks(source_id,title,owner,due_date) values($1,$2,$3,$4) returning *',[s.id,required(f,'title'),required(f,'owner'),date(required(f,'due'))]);await audit(db,t.id,cmd,a,null,t);return t;});
 }
 if(cmd==='close-task'){
  const a=auth(f);return transaction(db,async()=>{const t=await resolve(db,'tasks',rest[0]);if(t.status==='closed')throw Error('Task already closed');const [updated]=await db.query("update tasks set status='closed',resolution=$2 where id=$1 returning *",[t.id,required(f,'resolution')]);await audit(db,t.id,cmd,a,t,updated);return updated;});
 }
 if(cmd==='draft-source-review'){
  const s=await resolve(db,'sources',rest[0]);const records=await db.query('select record_key,decision,missing_fields from current_records where source_id=$1 order by record_key',[s.id]);const tasks=await db.query("select title,owner,due_date from tasks where source_id=$1 and status='open' order by due_date",[s.id]);
  const content=`# Private source review: ${s.name}\n\nFor ${s.owner}. Draft only.\n\nPurpose: ${s.purpose}\n\nPermission review: ${s.permission_until}\nRetention review: ${s.retention_review}\n\nRecords\n${JSON.stringify(records,null,2)}\n\nOpen follow-ups\n${JSON.stringify(tasks,null,2)}\n`;
  return {file:privateFile('drafts',s.id+'-'+Date.now()+'.md',content),sent:false};
 }
 if(cmd==='export'){
  const kind=rest[0]||'archive';let payload;
  if(kind==='feed')payload={kind:'accepted-current-feed',records:await db.query("select c.source,c.record_key,c.payload,c.captured_at,c.reviewed_by from current_records c join sources s on s.id=c.source_id where c.decision='accepted' and s.status='active' and s.permission_until>=current_date and s.retention_review>=current_date and exists(select 1 from recipes p where p.source_id=s.id and p.version=(select r.recipe_version from runs r where r.id=c.run_id)) and c.captured_at+s.interval_hours*interval '1 hour'>=now() order by c.source,c.record_key")};
  else if(kind==='archive'){payload={kind:'readable-archive-not-restore',created:new Date().toISOString(),tables:{}};for(const t of [...Object.keys(entities),'audit_events'])payload.tables[t]=await db.query(`select * from ${t} order by id`);}else throw Error('Export kind must be archive or feed');
  return {file:privateFile('exports',kind+'-'+Date.now()+'.json',JSON.stringify(payload,null,2)+'\n'),kind};
 }
 throw Error('Unknown command '+cmd+'; use help');
}
export function printResult(result){
 if(Array.isArray(result)){if(!result.length)return '(none)';if(result[0].question)return result.map(x=>x.question+'\n'+printResult(x.rows)).join('\n\n');const keys=Object.keys(result[0]);return table(result,keys.map(key=>({key,label:key,width:key==='payload'?65:40,format:v=>v instanceof Date?v.toISOString():typeof v==='object'&&v!==null?JSON.stringify(v):v})));}
 return JSON.stringify(result,null,2);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 let db;try{db=await getDb();const result=await run(db,process.argv.slice(2));console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):printResult(result));if(result?.ok===false)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}finally{if(db)await db.close();}
}

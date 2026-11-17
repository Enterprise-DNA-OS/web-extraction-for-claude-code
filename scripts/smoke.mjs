#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web-extraction-test-'));
process.env.DATABASE_URL='';process.env.DATA_DIR=path.join(temp,'db');process.env.OUTPUT_DIR=temp;
if(process.env.TEST_DATABASE_URL){const u=new URL(process.env.TEST_DATABASE_URL);if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!/^\/test_/.test(u.pathname))throw Error('TEST_DATABASE_URL must be a disposable loopback test_ database');process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;}
const {getDb,REPO_ROOT}=await import('./lib/db.mjs');
const {migrate}=await import('./migrate.mjs');
const {seed}=await import('./seed.mjs');
const {run,reads,resolve,questions,parseArgs}=await import('./extract.mjs');
const {parseCsv}=await import('./lib/csv.mjs');
const {sourceUrl,publicAddress,validateRecipe,extractHtml,fetchText}=await import('./lib/extraction.mjs');
const auth=['--by=Test operator','--reason=Fixture verification','--evidence=fixture:test'];
const future=new Date(Date.now()+86400000*90).toISOString().slice(0,10);
const t0=new Date(Date.now()-3600000).toISOString(),t1=new Date(Date.now()-1800000).toISOString();
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;};const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};const rejects=async(fn,re)=>{await assert.rejects(fn,re);checks++;};
let db;
try{
 db=await getDb();eq((await migrate(db)).ran.length,1);eq((await migrate(db)).ran.length,0);
 await seed(db);await seed(db);eq((await run(db,['sources'])).length,3);
 for(const command of Object.keys(reads)){const rows=await run(db,[command]);ok(Array.isArray(rows),command);}
 eq((await run(db,['quality-review'])).length,1);eq((await run(db,['change-review'])).length,4);
 eq((await run(db,['due-runs'])).length,2);ok((await run(db,['compliance'])).some(r=>r.rule==='NZ-IPP9'));
 eq((await run(db,['insights'])).length,10);eq(questions.length,10);eq(Object.keys(await run(db,['weekly-review'])).length,5);
 ok((await run(db,['help'])).commands.includes('fetch'));
 const harbour=await resolve(db,'sources','HARBOUR');eq((await resolve(db,'sources',harbour.id)).id,harbour.id);
 await rejects(()=>resolve(db,'sources','10000000'),/Ambiguous record/);
 await rejects(()=>resolve(db,'sources','absent'),/No matching record/);
 ok((await run(db,['show','sources','Harbour'])).history.length>0);
 await rejects(()=>run(db,['add-source','--name=Bad']),/Required --by/);
 const src=await run(db,['add-source','--name=Test catalogue','--url=https://example.com/catalogue','--owner=Test owner','--purpose=Read product specifications','--permission=fixture:permission','--until='+future,'--retention-review='+future,...auth]);
 eq((await resolve(db,'sources',src.id.slice(0,8))).id,src.id);
 const recipePath=path.join(REPO_ROOT,'examples/recipe.json');const recipe=JSON.parse(fs.readFileSync(recipePath));
 const rp=await run(db,['configure-recipe',src.id,'--file='+recipePath,...auth]);eq(rp.version,1);
 const csv=path.join(REPO_ROOT,'examples/import-io.csv');const imp=['import','import-io',csv,'--source='+src.id,'--captured-at='+t0,...auth];
 const dry=await run(db,[...imp,'--dry-run']);eq(dry.rows,2);eq((await db.query('select count(*)::int n from runs where source_id=$1',[src.id]))[0].n,0);
 const imported=await run(db,imp);eq(imported.rows,2);eq((await run(db,imp)).replayed,true);
 eq((await db.query('select count(*)::int n from observations where run_id=$1',[imported.run_id]))[0].n,2);
 const auditCount=(await run(db,['history'])).length;await run(db,imp);eq((await run(db,['history'])).length,auditCount);
 const extracted=await run(db,['extract-file',src.id,'--file='+path.join(REPO_ROOT,'examples/catalogue.html'),'--captured-at='+t1,...auth]);eq(extracted.rows,2);
 let current=await db.query('select * from current_records where source_id=$1 order by record_key',[src.id]);eq(current.length,2);eq(current[0].decision,'pending');
 await run(db,['import','import-io',csv,'--source='+src.id,'--captured-at='+new Date(Date.parse(t0)-3600000).toISOString(),...auth]);
 eq((await db.query('select id from current_records where source_id=$1 order by record_key',[src.id]))[0].id,current[0].id);
 await run(db,['review',current[0].id,'--decision=accepted',...auth]);await run(db,['review',current[1].id,'--decision=held',...auth]);
 const feed=await run(db,['export','feed']);eq(JSON.parse(fs.readFileSync(feed.file)).records.length,1);
 const bad=(await run(db,['quality-review']))[0];await rejects(()=>run(db,['review',bad.id,'--decision=accepted',...auth]),/Missing required/);
 const old=(await db.query('select id from observations where run_id=$1',[imported.run_id]))[0];await rejects(()=>run(db,['review',old.id,'--decision=accepted',...auth]),/Only current/);
 const changed=path.join(temp,'changed.csv');fs.writeFileSync(changed,'sku,name,stock\nHB-10,Crate,99\nHB-20,Tray,30\n');
 await rejects(()=>run(db,['import','import-io',changed,'--source='+src.id,'--captured-at='+t1,...auth]),/different snapshot/);
 const dup=path.join(temp,'duplicate.csv');fs.writeFileSync(dup,'sku,name,stock\nD,Crate,1\nD,Tray,2\n');
 await rejects(()=>run(db,['import','import-io',dup,'--source='+src.id,'--captured-at='+new Date().toISOString(),...auth]),/Duplicate record key/);
 fs.writeFileSync(dup,'sku,name,stock\n,Crate,1\n');await rejects(()=>run(db,['import','import-io',dup,'--source='+src.id,'--captured-at='+new Date().toISOString(),...auth]),/Missing record key/);
 fs.writeFileSync(dup,'sku,name,stock\n');await rejects(()=>run(db,['import','import-io',dup,'--source='+src.id,'--captured-at='+new Date().toISOString(),...auth]),/row count/);
 await rejects(()=>run(db,['import','import-io',csv,'--source=Alpine','--captured-at='+t0,...auth]),/permission/);
 await run(db,['set-source',src.id,'--status=paused',...auth]);await rejects(()=>run(db,imp),/paused/);
 await run(db,['set-source',src.id,'--status=active','--owner=New owner',...auth]);
 const task=await run(db,['log-task',src.id,'--title=Check mapping','--owner=New owner','--due='+future,...auth]);eq(task.status,'open');
 eq((await run(db,['close-task',task.id,'--resolution=Mapping verified',...auth])).status,'closed');
 await rejects(()=>run(db,['close-task',task.id,'--resolution=Again',...auth]),/already closed/);
 const draft=await run(db,['draft-source-review',src.id]);ok(fs.readFileSync(draft.file,'utf8').includes('Draft only'));eq(draft.sent,false);
 const archive=await run(db,['export','archive']);const backup=JSON.parse(fs.readFileSync(archive.file));eq(Object.keys(backup.tables).length,6);ok(backup.tables.audit_events.length>8);
 eq((await run(db,['configure-recipe',src.id,'--file='+recipePath,...auth])).version,2);
 await rejects(()=>run(db,['unknown']),/Unknown command/);
 await rejects(()=>run(db,['set-source',src.id,'--dry-run',...auth]),/Unknown flag/);
 await rejects(()=>run(db,['sources','--json=false']),/takes no value/);
 await rejects(()=>run(db,['import','import-io',csv,'--source='+src.id,'--captured-at=2026-02-30T00:00:00Z',...auth]),/real YYYY/);
 const staleFeed=await run(db,['export','feed']);eq(JSON.parse(fs.readFileSync(staleFeed.file)).records.length,0);
 eq(parseCsv('\uFEFFsku,name\r\nA,"line 1\nline ""2"""\r\n')[0].name,'line 1\nline "2"');
 for(const text of ['a,a\n1,2','a,b\n1','a\n"unclosed','a\n"x"z']){assert.throws(()=>parseCsv(text));checks++;}
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1'])eq(publicAddress(ip),false);
 eq(publicAddress('8.8.8.8'),true);
 for(const url of ['http://example.com','https://u:p@example.com','https://example.com:444','https://example.com/#x']){assert.throws(()=>sourceUrl(url));checks++;}
 await rejects(()=>fetchText('https://127.0.0.1/'),/public Internet/);
 assert.throws(()=>validateRecipe({...recipe,key_field:'absent'}));checks++;
 assert.throws(()=>validateRecipe({...recipe,min_rows:0}));checks++;
 eq(extractHtml(fs.readFileSync(path.join(REPO_ROOT,'examples/catalogue.html'),'utf8'),recipe).length,2);
 eq(extractHtml('<div>No products</div>',recipe).length,0);
 // A constrained synthetic fetch is exercised through its public-address rejection, with failure recorded.
 const local=await run(db,['add-source','--name=Blocked local source','--url=https://127.0.0.1/','--owner=Tester','--purpose=Network guard test','--permission=fixture:test','--until='+future,'--retention-review='+future,...auth]);
 await run(db,['configure-recipe',local.id,'--file='+recipePath,...auth]);
 await rejects(()=>run(db,['fetch',local.id,...auth]),/public Internet/);
 eq((await db.query("select count(*)::int n from runs where source_id=$1 and status='failed'",[local.id]))[0].n,1);
 // A new complete snapshot resets decisions and removes absent keys only from the current feed.
 const fresh=path.join(temp,'fresh.csv');fs.writeFileSync(fresh,'sku,name,stock\nHB-10,Crate,77\n');
 await run(db,['import','import-io',fresh,'--source='+src.id,'--captured-at='+new Date().toISOString(),...auth]);
 const newest=await db.query('select record_key,decision from current_records where source_id=$1',[src.id]);eq(newest,[{record_key:'HB-10',decision:'pending'}]);
 ok((await db.query('select count(*)::int n from observations o join runs r on r.id=o.run_id where r.source_id=$1',[src.id]))[0].n>1);
 // Pause permitted sample domains before run-due, so the suite never contacts the Internet.
 await run(db,['set-source','Harbour','--status=paused',...auth]);await run(db,['set-source',src.id,'--status=paused',...auth]);
 const due=await run(db,['run-due',...auth]);eq(due.ok,false);ok(due.results.every(x=>!x.ok));
 // Row security is enabled on every domain table.
 const security=await db.query("select relname,relrowsecurity from pg_class where relname in ('sources','recipes','runs','observations','tasks','audit_events')");eq(security.length,6);ok(security.every(r=>r.relrowsecurity));
 // Database constraints and rollback proof.
 await rejects(()=>db.query("update observations set decision='accepted' where id=$1",[bad.id]),/check constraint/);
 const counts=(await db.query('select count(*)::int n from observations'))[0].n;
 await rejects(()=>run(db,['import','import-io',dup,'--source='+src.id,'--captured-at='+t0,...auth]),/paused/);eq((await db.query('select count(*)::int n from observations'))[0].n,counts);
 await db.close();db=null;
 for(const script of ['view.mjs','docs.mjs']){const child=spawnSync(process.execPath,[path.join(REPO_ROOT,'scripts',script)],{cwd:REPO_ROOT,env:process.env,encoding:'utf8'});eq(child.status,0);}
 const {table:htmlTable,page:htmlPage}=await import('./lib/render.mjs');ok(htmlTable([{text:'<script>alert(1)</script>'}]).includes('&lt;script&gt;'));ok(!htmlTable([{text:'<script>alert(1)</script>'}]).includes('<script>'));assert.throws(()=>htmlPage({title:'Test',brand:{business_name:'Test',primary:'red; color:blue',accent:'#ffffff',ink:'#000000',paper:'#ffffff'}}));checks++;
 const html=fs.readFileSync(path.join(temp,'views','week.html'),'utf8');ok(html.includes('Fictional Research Desk'));ok(!html.includes('<button'));
 const cli=spawnSync(process.execPath,[path.join(REPO_ROOT,'scripts/extract.mjs'),'sources','--json'],{env:process.env,encoding:'utf8'});eq(cli.status,0);ok(JSON.parse(cli.stdout).length>=4);
 const ambiguous=spawnSync(process.execPath,[path.join(REPO_ROOT,'scripts/extract.mjs'),'show','sources','10000000'],{env:process.env,encoding:'utf8'});eq(ambiguous.status,1);ok(ambiguous.stderr.includes('Ambiguous record'));
 console.log(`PASS ${checks} checks: migration, seed, every CLI operation, import atomicity, review gates, history, network guard, rendered paperwork and CLI exit codes (${process.env.DATABASE_URL?'Postgres':'PGlite'})`);
}finally{if(db)await db.close();fs.rmSync(temp,{recursive:true,force:true});}

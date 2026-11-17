#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'web-extraction-demo-'));process.env.DATABASE_URL='';process.env.DATA_DIR=path.join(temp,'db');process.env.OUTPUT_DIR=temp;
const {getDb,REPO_ROOT}=await import('./lib/db.mjs');const {migrate}=await import('./migrate.mjs');const {seed}=await import('./seed.mjs');const {run,printResult}=await import('./extract.mjs');
let db;try{db=await getDb();await migrate(db);await seed(db);for(const c of ['due-runs','change-review','quality-review']){console.log('\n'+c+'\n'+printResult(await run(db,[c])));}await db.close();db=null;
for(const script of ['view.mjs','docs.mjs']){const r=spawnSync(process.execPath,[path.join(REPO_ROOT,'scripts',script)],{env:process.env,stdio:'inherit'});if(r.status!==0)throw Error('Demo rendering failed');}console.log('Demo PASS: fictional sources, private reports, no network fetches.');if(process.argv.includes('--keep'))console.log('Demo files: '+temp);
}finally{if(db)await db.close();if(!process.argv.includes('--keep'))fs.rmSync(temp,{recursive:true,force:true});}

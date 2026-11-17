import {load} from 'cheerio';
import {lookup} from 'node:dns/promises';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import robotsParser from 'robots-parser';

export function sourceUrl(value) {
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.hash||(u.port&&u.port!=='443')) throw Error('Source requires HTTPS on port 443, without credentials or fragment');
 return u.href;
}
export function publicAddress(address) {
 try {const a=ipaddr.process(address);return a.range()==='unicast';} catch {return false;}
}
export function validateRecipe(p) {
 if(!p||typeof p!=='object'||!p.row_selector||typeof p.row_selector!=='string')throw Error('Recipe needs row_selector');
 if(!p.fields||Array.isArray(p.fields)||typeof p.fields!=='object'||Object.keys(p.fields).length<1||Object.keys(p.fields).length>30)throw Error('Recipe needs 1 to 30 fields');
 const fields=Object.keys(p.fields);
 for(const [name,spec] of Object.entries(p.fields)){
  if(!/^[A-Za-z][A-Za-z0-9_ -]{0,63}$/.test(name)||['constructor','prototype'].includes(name))throw Error('Invalid field name');
  if(!spec||typeof spec.selector!=='string'||!spec.selector)throw Error('Each field needs a CSS selector');
  if(spec.attribute!==undefined&&(!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(spec.attribute)||/^on/i.test(spec.attribute)))throw Error('Invalid extraction attribute');
 }
 if(!fields.includes(p.key_field))throw Error('key_field must be in fields');
 if(!Array.isArray(p.required_fields)||!p.required_fields.includes(p.key_field)||p.required_fields.some(k=>!fields.includes(k)))throw Error('required_fields must contain key_field and only configured fields');
 if(!Number.isInteger(p.min_rows)||!Number.isInteger(p.max_rows)||p.min_rows<1||p.max_rows<p.min_rows||p.max_rows>10000)throw Error('Row bounds must be integers from 1 to 10000');
 const $=load('<main><div></div></main>');$(p.row_selector);for(const f of Object.values(p.fields))$(f.selector);
 return p;
}
export function extractHtml(html,p) {
 validateRecipe(p);
 if(Buffer.byteLength(html)>2*1024*1024)throw Error('HTML exceeds 2 MiB');
 const $=load(html);const rows=[];
 $(p.row_selector).each((i,el)=>{
  if(i>=p.max_rows)throw Error('Extraction exceeds max_rows');
  rows.push(Object.fromEntries(Object.entries(p.fields).map(([name,f])=>{
   const node=$(el).find(f.selector).first();return [name,String(f.attribute?node.attr(f.attribute)||'':node.text()).trim()];
  })));
 });
 return rows;
}
export async function fetchText(url,{maxBytes=2*1024*1024}={}) {
 const u=new URL(sourceUrl(url));
 const addresses=await lookup(u.hostname,{all:true});
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Only public Internet addresses may be fetched');
 const pinned=addresses[0];
 return await new Promise((resolve,reject)=>{
  const req=https.get(u,{headers:{'User-Agent':'OwnedExtraction/1.0','Accept':'text/html,text/plain','Accept-Encoding':'identity'},
   lookup:(hostname,options,callback)=>options.all?callback(null,[pinned]):callback(null,pinned.address,pinned.family)
  },res=>{
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){res.destroy(Error('Response exceeds size limit'));return;}chunks.push(chunk);});
   res.on('error',reject);res.on('end',()=>{clearTimeout(timer);resolve({status:res.statusCode,type:String(res.headers['content-type']||''),text:Buffer.concat(chunks).toString('utf8')});});
  });
  const timer=setTimeout(()=>req.destroy(Error('Fetch exceeded 15 seconds')),15000);
  req.on('error',error=>{clearTimeout(timer);reject(error);});
 });
}
export async function fetchPermittedHtml(url) {
 const u=new URL(sourceUrl(url));
 const robotUrl=new URL('/robots.txt',u).href;
 const robots=await fetchText(robotUrl,{maxBytes:256*1024});
 if(robots.status!==404&&robots.status!==200)throw Error('Cannot establish robots policy: HTTP '+robots.status);
 if(robots.status===200){
  const policy=robotsParser(robotUrl,robots.text);
  if(policy.isAllowed(u.href,'OwnedExtraction')===false)throw Error('robots.txt disallows this URL');
  const delay=Number(policy.getCrawlDelay('OwnedExtraction')||0);
  if(delay>30)throw Error('Crawl delay exceeds this runner limit; arrange a permitted offline capture');
  if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay*1000));
 }
 const page=await fetchText(u.href);
 if(page.status!==200)throw Error('Source returned HTTP '+page.status+'; redirects and login flows are not followed');
 if(!/^text\/html\b/i.test(page.type))throw Error('Source did not return HTML');
 return page.text;
}

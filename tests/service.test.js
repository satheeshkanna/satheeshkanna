import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {configuration} from '../services/config.js';
import {period,argumentsFrom} from '../services/period.js';
import {aggregate,parseBody} from '../services/aggregator.js';
import {fetchEvents} from '../services/events.js';
import {createAuth} from '../services/auth.js';
import {request,HttpError} from '../services/http.js';
import {render} from '../services/renderer.js';
import {workbook} from '../services/excel.js';
import {payload,send} from '../services/mailer.js';
import {acquire} from '../services/state.js';
import ExcelJS from 'exceljs';
const fixture=JSON.parse(await readFile(new URL('../samples/events.sample.json',import.meta.url)));
const config=configuration({EVENTS_URL:'https://example.invalid/events',AUTH_URL:'https://example.invalid/api/token',NOTIFICATION_URL:'https://example.invalid/notificationapi/sendMail',AUTH_USERNAME:'test',AUTH_PASSWORD:'test',AUTH_REALM:'test',AUTH_CLIENT_ID:'test',AUTH_CLIENT_SECRET:'test',AUTH_GRANT_TYPE:'password',MAIL_FROM:'sender@example.invalid',MAIL_TO:'to@example.invalid',MAIL_CC:'cc@example.invalid',MAIL_BCC:'bcc@example.invalid'});
const window=period({start:'2026-10-06',end:'2026-10-07'});
test('Saudi midnight boundaries, previous day and invalid ranges',()=>{assert.equal(window.start,'2026-10-05T21:00:00.000Z');assert.equal(window.end,'2026-10-06T21:00:00.000Z');assert.equal(period({now:new Date('2026-10-07T22:00:00Z')}).date,'2026-10-07');assert.throws(()=>period({start:'2026-02-30',end:'2026-03-02'}));assert.throws(()=>period({start:'2026-10-07',end:'2026-10-06'}));assert.throws(()=>argumentsFrom(['--wat']));});
test('aggregation distinguishes HTTP and business errors with no double counting',()=>{const r=aggregate([...fixture.events,fixture.events[0]],config);assert.equal(r.total,8);assert.equal(r.success,6);assert.equal(r.failed,2);assert.equal(r.successRate,'75.00');assert.equal(r.businessErrorCount,3);assert.equal(r.affectedEvents,5);assert.equal(r.operations.at(-1).total,1);assert.equal(r.technicalGroups.find(g=>g.status===413).count,1);assert.equal(r.complaints[0].health,'Attention Required');assert.ok(r.businessErrors.every(e=>!e.complaintReference.includes('SAMPLE')));assert.equal(parseBody('{oops'),null);assert.equal(parseBody(undefined),null);});
test('overlapping gateway and business failure counted once',()=>{const r=aggregate([{...fixture.events[3],status_code:'500 Error'}],config);assert.equal(r.failed,1);assert.equal(r.businessErrorCount,1);assert.equal(r.affectedEvents,1);});
test('empty and missing fields remain honest',()=>{assert.equal(aggregate([],config).successRate,'N/A');const r=aggregate([{}],config);assert.equal(r.failed,1);assert.equal(r.unknownBusinessStatus,1);});
test('authentication cache, expiry, and 401 refresh',async()=>{let count=0,now=0;const auth=createAuth(config,{now:()=>now,requestImpl:async(url,options)=>{if(url.includes('/token'))return {access_token:`token-${++count}`,expires_in:100};if(options.token==='token-2')throw new HttpError(401);return {ok:true};}});assert.equal(await auth.token(),'token-1');assert.equal(await auth.token(),'token-1');now=100001;assert.equal(await auth.token(),'token-2');assert.deepEqual(await auth.authorized('https://example.invalid/data'),{ok:true});assert.equal(count,3);});
test('pagination beyond 1000 with duplicate IDs and query encoding',async()=>{const events=Array.from({length:1003},(_,i)=>({event_id:`id-${i}`}));events[1002]={event_id:'id-0'};let calls=0;const result=await fetchEvents(config,window,{authorized:async(url)=>{calls++;const u=new URL(url);assert.equal(u.searchParams.get('path'),'contains:complaint');const offset=Number(u.searchParams.get('offset'));return {total:1003,offset,events:events.slice(offset,offset+1000)};}});assert.equal(calls,2);assert.equal(result.events.length,1002);assert.equal(result.metadata.duplicates,1);});
test('pagination aborts incomplete/changing totals and includes zero-data case',async()=>{assert.equal((await fetchEvents(config,window,{authorized:async()=>({total:0,events:[]})})).events.length,0);await assert.rejects(fetchEvents(config,window,{authorized:async()=>({total:10,events:[]})}),/Incomplete/);let n=0;await assert.rejects(fetchEvents(config,window,{authorized:async()=>({total:++n===1?2:3,events:[{event_id:String(n)}]})}),/changed/);});
test('API end boundary excluded',async()=>{const r=await fetchEvents(config,window,{authorized:async()=>({total:1,events:[{event_id:'at-end',datetime:window.end}]})});assert.equal(r.events.length,0);});
test('both templates escape HTML, inline CSS and identify sample',async()=>{for(const template of ['template1','template4']){const html=await render(aggregate(fixture.events,config),{template,window,sample:true,environment:'<script>bad</script>'});assert.match(html,/SAMPLE DATA/);assert.match(html,/75.00/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/background:/);assert.doesNotMatch(html,/\{\{/);}});
test('Excel roundtrip has four formatted worksheets and synthetic-safe details',async()=>{const book=await workbook(aggregate(fixture.events,config),window);const data=await book.xlsx.writeBuffer();const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(data);assert.deepEqual(loaded.worksheets.map(s=>s.name),['Summary','Gateway Failures','Business Errors','Technical Errors']);assert.equal(loaded.getWorksheet('Business Errors').rowCount,4);assert.equal(loaded.getWorksheet('Gateway Failures').rowCount,3);assert.equal(loaded.getWorksheet('Business Errors').views[0].ySplit,1);});
test('notification contract matches sample and rejects unconfirmed attachments',()=>{const message=payload(config,aggregate(fixture.events,config),window,'<p>test</p>');assert.equal(message.attachment,null);assert.deepEqual(message.mailAddressCC,['cc@example.invalid']);assert.deepEqual(message.mailAddressBCC,['bcc@example.invalid']);assert.match(message.mailsubject,/3 Business Errors/);assert.throws(()=>payload({...config,attachmentEnabled:true},{},window,''),/unconfirmed/);});
test('notification POST is not retried and explicit rejection fails',async()=>{await assert.rejects(send(config,{authorized:async(url,opts)=>{assert.equal(opts.retries,0);assert.equal(opts.method,'POST');return {success:false};}},{}),/rejection/);});
test('execution lock, sent and uncertain-send suppression; forced resend explicit',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'report-state-'));try{const first=await acquire(dir,'period');await assert.rejects(acquire(dir,'period'),/locked/);await first.markSending();await first.release();assert.equal((await acquire(dir,'period')).suppressed,true);const forced=await acquire(dir,'period',{force:true});await forced.markSent();await forced.release();const done=await acquire(dir,'period');assert.equal(done.status,'sent');assert.equal(done.suppressed,true);}finally{await rm(dir,{recursive:true,force:true});}});
test('request handles timeout, transient retry, bad JSON and permanent errors',async()=>{await assert.rejects(request('https://example.invalid',{timeout:5,retries:0,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))}),/timed out/);let count=0;assert.deepEqual(await request('https://example.invalid',{retries:1,fetchImpl:async()=>++count===1?new Response('',{status:503}):Response.json({ok:true})}),{ok:true});assert.equal(count,2);await assert.rejects(request('https://example.invalid',{fetchImpl:async()=>new Response('bad')}),/response failure/);await assert.rejects(request('https://example.invalid',{fetchImpl:async()=>new Response('',{status:403})}),e=>e.status===403);});

test('business source uses a different host and independent filters/pagination',async()=>{
 const c=configuration({...config.env,BUSINESS_EVENTS_URL:'https://business.example.invalid/events',BUSINESS_EVENT_PATH:'not:/excluded',BUSINESS_EVENT_APP_NAME:'contains:iaapp',BUSINESS_PAGE_LIMIT:'1'});
 let count=0;
 const r=await fetchEvents(c,window,{authorized:async(url)=>{const u=new URL(url);assert.equal(u.host,'business.example.invalid');assert.equal(u.searchParams.get('path'),'not:/excluded');assert.equal(u.searchParams.get('app_name'),'contains:iaapp');assert.equal(u.searchParams.get('limit'),'1');assert.equal(u.searchParams.get('request_body'),'contains:error');return {total:2,offset:count,events:[{event_id:`business-${count++}`} ]};}},{endpointKey:'BUSINESS_EVENTS_URL',filters:c.businessFilters,limit:c.businessLimit,requestBody:'contains:error'});
 assert.equal(count,2);assert.equal(r.events.length,2);
});
test('independent business data does not inflate gateway totals or presume shared IDs',async()=>{
 const {aggregateSources}=await import('../services/aggregator.js');
 const gateway=[fixture.events[0]],business=[{...fixture.events[3],event_id:fixture.events[0].event_id}];
 const r=aggregateSources(gateway,business,config);assert.equal(r.total,1);assert.equal(r.success,1);assert.equal(r.failed,0);assert.equal(r.businessErrorCount,1);assert.equal(r.businessErrors.length,1);assert.equal(r.independentBusinessSource,true);assert.equal(r.affectedEvents,'Not established across independent sources');
 const html=await render(r,{window});assert.match(html,/Attention Required/);assert.match(html,/independent source/);
});

test('transport diagnostics expose endpoint and nested safe codes without secrets',async()=>{
 const secret='DO_NOT_LOG_PASSWORD';
 const cause=new AggregateError([Object.assign(new Error(secret),{code:'ENOTFOUND'}),Object.assign(new Error(secret),{code:'ECONNREFUSED'})],secret);
 await assert.rejects(request(`https://user:${secret}@example.invalid/events?token=${secret}`,{endpointLabel:'BUSINESS_EVENTS_URL',retries:0,fetchImpl:async()=>{throw new TypeError(secret,{cause});}}),error=>{assert.match(error.message,/BUSINESS_EVENTS_URL/);assert.match(error.message,/ENOTFOUND/);assert.match(error.message,/ECONNREFUSED/);assert.doesNotMatch(error.message,/DO_NOT_LOG_PASSWORD|example.invalid/);assert.equal(error.attempts,1);return true;});
});
test('TLS and invalid response diagnostics identify authentication endpoint',async()=>{
 await assert.rejects(request('https://example.invalid',{endpointLabel:'AUTH_URL',retries:0,fetchImpl:async()=>{throw new TypeError('fetch failed',{cause:Object.assign(new Error('private certificate details'),{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'})});}}),/AUTH_URL:.*UNABLE_TO_VERIFY_LEAF_SIGNATURE/);
 await assert.rejects(request('https://example.invalid',{endpointLabel:'AUTH_URL',fetchImpl:async()=>new Response('<html>private response</html>')}),/AUTH_URL:.*invalid JSON/);
});

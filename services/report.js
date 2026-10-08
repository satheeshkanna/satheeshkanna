import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {configuration,root} from './config.js';
import {period} from './period.js';
import {createAuth} from './auth.js';
import {fetchEvents} from './events.js';
import {aggregateSources} from './aggregator.js';
import {render} from './renderer.js';
import {excel} from './excel.js';
import {payload,send} from './mailer.js';
import {acquire} from './state.js';
import {log} from './logger.js';
export async function runReport(options={},config=configuration()){
 const window=period({...options,intervalDays:config.intervalDays});
 const auth=createAuth(config);const {events,metadata}=await fetchEvents(config,window,auth);
 let business;
 if(config.env.BUSINESS_EVENTS_URL){
  business=await fetchEvents(config,window,auth,{endpointKey:'BUSINESS_EVENTS_URL',filters:config.businessFilters,limit:config.businessLimit,requestBody:config.businessQuery||undefined});
 }else if(config.businessQuery){throw new Error('BUSINESS_ERROR_QUERY requires its own BUSINESS_EVENTS_URL');}
 const report=aggregateSources(events,business?.events,config);await mkdir(path.join(root,'output'),{recursive:true});
 const suffix=window.start.replace(/[^0-9]/g,'')+'_'+window.end.replace(/[^0-9]/g,'');
 const filename=`Complaint_Journey_Report_${window.date}_${suffix}.xlsx`;
 await excel(report,window,path.join(root,'output',filename));
 const html=await render(report,{template:config.template,window,environment:config.environment});
 await (await import('node:fs/promises')).writeFile(path.join(root,'output',`report_${suffix}.html`),html,{mode:0o600});
 await log('report_generated',{total:report.total,failed:report.failed,businessErrors:report.businessErrorCount,duplicates:metadata.duplicates});
 if(options['dry-run'])return {report,window,metadata};
 const message=payload(config,report,window,html);
 const state=await acquire(path.join(root,'.state'),JSON.stringify({environment:config.environment,start:window.start,end:window.end}),{force:options.force});
 if(state.suppressed){await log('send_suppressed',{status:state.status});return {report,suppressed:true};}
 try{await state.markSending();await send(config,auth,message);await state.markSent();await log('mail_sent');}
 finally{await state.release();}
 return {report,window,metadata};
}

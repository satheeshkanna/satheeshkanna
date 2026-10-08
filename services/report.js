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
import {createLogger} from './logger.js';
async function execute(options,config,log){
 const window=period({...options,intervalDays:config.intervalDays});
 await log('report_started',{start:window.start,end:window.end,dryRun:!!options['dry-run'],template:config.template});
 const auth=createAuth(config,{progress:log});await auth.token();
 const {events,metadata}=await fetchEvents(config,window,auth,{progress:log});
 let business;
 if(config.env.BUSINESS_EVENTS_URL){
  business=await fetchEvents(config,window,auth,{progress:log,endpointKey:'BUSINESS_EVENTS_URL',filters:config.businessFilters,limit:config.businessLimit,requestBody:config.businessQuery||undefined});
 }else if(config.businessQuery){throw new Error('BUSINESS_ERROR_QUERY requires its own BUSINESS_EVENTS_URL');}
 await log('aggregation_started');
 const report=aggregateSources(events,business?.events,config);await log('aggregation_completed',{total:report.total,gatewayFailures:report.failed,businessErrors:report.businessErrorCount});await mkdir(path.join(root,'output'),{recursive:true});
 const suffix=window.start.replace(/[^0-9]/g,'')+'_'+window.end.replace(/[^0-9]/g,'');
 const filename=`Complaint_Journey_Report_${window.date}_${suffix}.xlsx`;
 await log('excel_generation_started');
 await excel(report,window,path.join(root,'output',filename));
 await log('excel_generation_completed',{filename});
 await log('html_render_started',{template:config.template});
 const html=await render(report,{template:config.template,window,environment:config.environment});
 await (await import('node:fs/promises')).writeFile(path.join(root,'output',`report_${suffix}.html`),html,{mode:0o600});
 await log('html_render_completed');
 await log('report_generated',{total:report.total,failed:report.failed,businessErrors:report.businessErrorCount,duplicates:metadata.duplicates});
 if(options['dry-run']){await log('report_completed',{dryRun:true,emailSent:false});return {report,window,metadata};}
 await log('email_payload_validation_started');
 const message=payload(config,report,window,html);
 await log('duplicate_send_check_started');
 const state=await acquire(path.join(root,'.state'),JSON.stringify({environment:config.environment,start:window.start,end:window.end}),{force:options.force});
 if(state.suppressed){await log('send_suppressed',{status:state.status});return {report,suppressed:true};}
 try{await state.markSending();await log('email_send_started',{endpoint:'NOTIFICATION_URL'});await send(config,auth,message);await state.markSent();await log('mail_sent');await log('report_completed',{dryRun:false,emailSent:true});}
 finally{await state.release();}
 return {report,window,metadata};
}

export async function runReport(options={},config=configuration()){
 const logger=createLogger(config.env);let lastStep='initialization';
 const progress=async(event,details={},severity='info')=>{if(severity==='info')lastStep=event;await logger(event,details,severity);};
 try{return await execute(options,config,progress);}
 catch(error){await logger('report_failed',{lastStep,reason:error.message,...(error.endpoint?{endpoint:error.endpoint}:{}),...(error.diagnosticCodes?{diagnosticCodes:error.diagnosticCodes,attempts:error.attempts}:{})},'error');throw error;}
}

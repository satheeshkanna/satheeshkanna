import {mkdir,appendFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root} from './config.js';
const ranks={debug:10,info:20,warn:30,error:40,silent:100};
function enabled(value,fallback=true){if(value===undefined||value==='')return fallback;if(!['true','false'].includes(value))throw new Error('Logging switches must be true or false');return value==='true';}
export function createLogger(env=process.env,{directory=path.join(root,'logs'),consoleImpl=console,runId=randomUUID()}={}){
 const level=env.LOG_LEVEL||'info';if(!(level in ranks))throw new Error('LOG_LEVEL must be debug, info, warn, error, or silent');
 const active=enabled(env.LOG_ENABLED)&&level!=='silent',terminal=enabled(env.LOG_CONSOLE_ENABLED),file=enabled(env.LOG_FILE_ENABLED);
 return async function(event,details={},severity='info'){
  if(!active||ranks[severity]<ranks[level])return;
  const row={timestamp:new Date().toISOString(),runId,level:severity,event,...details};
  // Only service-owned event names and safe metadata are supplied; never payloads, headers or credentials.
  if(terminal)consoleImpl.log(`[${row.timestamp}] [${severity.toUpperCase()}] ${event} ${JSON.stringify(details)}`);
  if(file){try{await mkdir(directory,{recursive:true});await appendFile(path.join(directory,'report.jsonl'),JSON.stringify(row)+'\n',{mode:0o600});}catch{if(terminal)consoleImpl.error('File logging failed. Check logs directory permissions or disk space.');}}
 };
}
export async function log(event,details={},severity='info'){return createLogger()(event,details,severity);}

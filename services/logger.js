import {mkdir,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {root} from './config.js';
export async function log(event,details={}) {
 // Callers supply only fixed event names, counts and statuses, never raw errors or payloads.
 const row={timestamp:new Date().toISOString(),event,...details};const line=JSON.stringify(row);
 console.log(line);if(process.env.LOG_LEVEL==='silent')return;
 await mkdir(path.join(root,'logs'),{recursive:true});await appendFile(path.join(root,'logs','report.jsonl'),line+'\n',{mode:0o600});
}

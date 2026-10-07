import {readFile} from 'node:fs/promises';
import Handlebars from 'handlebars';
import juice from 'juice';
export async function render(report,{template='template1',window,environment='Development',sample=false,attachmentName='Generated locally; not attached'}={}) {
 if(!['template1','template4'].includes(template)) throw new Error('Unsupported report template');
 const html=await readFile(new URL(`../templates/${template}.html`,import.meta.url),'utf8');
 const css=await readFile(new URL('../templates/styles.css',import.meta.url),'utf8');
 return juice.inlineContent(Handlebars.compile(html)({...report,window,environment,sample,attachmentName,health:report.affectedEvents?'Attention Required':'No observed failures',observations:[`Gateway success rate: ${report.successRate}%.`,`${report.affectedEvents} distinct events have gateway or business errors; dimensions overlap.`,`${report.unknownBusinessStatus} events have no known business status; HTTP success does not establish business success.`, 'Complaint workflow completion is not inferred.']}),css);
}

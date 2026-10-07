import Handlebars from 'handlebars';
import {required,endpoint} from './config.js';
function addresses(value,mandatory=false){const list=(value||'').split(/[,;]/).map(x=>x.trim()).filter(Boolean);if((mandatory&&!list.length)||list.some(x=>!/^\S+@\S+\.\S+$/.test(x)))throw new Error('Invalid or missing email address configuration');return list;}
export function payload(config,report,window,html){
 if(config.attachmentEnabled)throw new Error('Live attachments are blocked: notification API attachment schema is unconfirmed. Set ATTACHMENT_ENABLED=false. XLSX is still generated locally.');
 const from=required(config.env,'MAIL_FROM');addresses(from,true);if(addresses(from).length!==1)throw new Error('MAIL_FROM must contain one address');
 return {mailsubject:Handlebars.compile(config.email.subject)({date:window.date,successRate:report.successRate,businessErrors:report.businessErrorCount}),mailAddressFrom:from,mailBody:html,mailAddressTO:addresses(config.env.MAIL_TO,true),mailAddressCC:addresses(config.env.MAIL_CC),mailAddressBCC:addresses(config.env.MAIL_BCC),attachment:null};
}
export async function send(config,auth,message){
 // Never retry non-idempotent notification requests automatically.
 const response=await auth.authorized(endpoint(config.env,'NOTIFICATION_URL'),{method:'POST',body:message,retries:0});
 if(response.success===false||response.error||response.errors||['failed','failure','error'].includes(String(response.status||'').toLowerCase()))throw new Error('Notification API reported rejection');
 return response;
}

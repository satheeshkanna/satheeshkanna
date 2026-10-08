import {reference,businessReason,safeId} from './privacy.js';
export function parseBody(body){if(body&&typeof body==='object'&&!Array.isArray(body))return body;if(typeof body!=='string')return null;try{const p=JSON.parse(body);return p&&typeof p==='object'&&!Array.isArray(p)?p:null;}catch{return null;}}
function group(rows,keys){const map=new Map();for(const row of rows){const key=JSON.stringify(keys.map(k=>row[k]));const item=map.get(key)||Object.fromEntries(keys.map(k=>[k,row[k]]));item.count=(item.count||0)+1;map.set(key,item);}return [...map.values()];}
export function aggregate(events,config){
 const seen=new Set(),rows=[];
 for(const event of events){
  if(event.event_id&&seen.has(event.event_id))continue;if(event.event_id)seen.add(event.event_id);
  const body=parseBody(event.request_body),response=parseBody(event.response_body);
  const source=body?.complaintProcessingStatus||body?.error?body:response;
  const status=Number(String(event.status_code??'').match(/^\s*(\d{3})(?:\s|$)/)?.[1]||0);
  const gatewaySuccess=status>=200&&status<300;
  const businessError=!!source && (String(source.complaintProcessingStatus||'').toLowerCase()==='error'||(source.error&&typeof source.error==='object'&&Object.keys(source.error).length>0));
  const op=config.operations.find(rule=>Object.entries(rule.match).some(([field,values])=>values.some(v=>String(body?.[field]??event[field]??'').toLowerCase().includes(v.toLowerCase()))))?.name||'Other / Unclassified';
  const code=safeId(source?.error?.errorCode);
  rows.push({timestamp:safeId(event.datetime),operation:op,apiName:safeId(event.api_name),status:status||'Unknown',transactionId:safeId(event.transaction_id||event.global_transaction_id),eventId:safeId(event.event_id),latency:Number.isFinite(Number(event.time_to_serve_request))?Number(event.time_to_serve_request):'',gatewaySuccess,businessError,
   complaintReference:reference(body?.icComplaintReferenceNumber||response?.icComplaintReferenceNumber),processingType:safeId(source?.complaintProcessingType),businessStatus:safeId(source?.complaintProcessingStatus),errorCode:code,errorMessage:businessReason(code),
   technicalReason:gatewaySuccess?'':status===413?'Request Entity Too Large':[408,504].includes(status)?'Gateway timeout':status>=500?'HTTP 5xx':status?'Other non-2xx response':'Missing or invalid HTTP status',payloadKnown:!!source?.complaintProcessingStatus});
 }
 const total=rows.length,success=rows.filter(r=>r.gatewaySuccess).length;
 const gatewayFailures=rows.filter(r=>!r.gatewaySuccess),businessErrors=rows.filter(r=>r.businessError);
 const operations=[...config.operations.map(r=>r.name),'Other / Unclassified'].map(name=>{const rs=rows.filter(r=>r.operation===name);return {name,total:rs.length,success:rs.filter(r=>r.gatewaySuccess).length,failed:rs.filter(r=>!r.gatewaySuccess).length};});
 const complaints=group(rows.filter(r=>r.complaintReference),['complaintReference']).map(c=>{const rs=rows.filter(r=>r.complaintReference===c.complaintReference),failed=rs.filter(r=>!r.gatewaySuccess||r.businessError).length;return {...c,successfulEvents:rs.length-failed,failedEvents:failed,eventSuccessRate:((rs.length-failed)/rs.length*100).toFixed(2),health:failed?'Attention Required':'No observed failures; workflow completion unknown'};});
 return {total,success,failed:total-success,successRate:total?(success/total*100).toFixed(2):'N/A',failureRate:total?((total-success)/total*100).toFixed(2):'N/A',businessErrorCount:businessErrors.length,affectedEvents:rows.filter(r=>!r.gatewaySuccess||r.businessError).length,unknownBusinessStatus:rows.filter(r=>!r.payloadKnown).length,rows,operations,gatewayFailures,businessErrors,technicalErrors:gatewayFailures,businessGroups:group(businessErrors,['operation','errorCode','errorMessage']),technicalGroups:group(gatewayFailures,['status','technicalReason']),complaints};
}

// Independent API sources do not imply shared event IDs or transaction populations.
export function aggregateSources(gatewayEvents,businessEvents,config){
 const report=aggregate(gatewayEvents,config);
 if(businessEvents===undefined)return report;
 const business=aggregate(businessEvents,config);
 return {...report,businessErrors:business.businessErrors,businessGroups:business.businessGroups,
  businessErrorCount:business.businessErrorCount,businessSourceTotal:business.total,
  unknownBusinessStatus:business.unknownBusinessStatus,independentBusinessSource:true,
  affectedEvents:'Not established across independent sources'};
}

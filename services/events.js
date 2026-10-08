import {endpoint} from './config.js';
export const fields='event_id,datetime,api_name,api_version,app_name,status_code,transaction_id,global_transaction_id,uri_path,time_to_serve_request,request_body,response_body';
export async function fetchEvents(config,window,auth,{requestBody,endpointKey='EVENTS_URL',filters=config.filters,limit=config.limit}={}) {
  const result=[],seen=new Set();let offset=0,total,duplicates=0;
  for(let page=0;page<100000;page++) {
    const url=new URL(endpoint(config.env,endpointKey));
    for(const [k,v] of Object.entries({start:window.start,end:window.end,fields,...filters,request_body:requestBody,limit,offset})) if(v!==undefined&&v!=='') url.searchParams.set(k,String(v));
    const data=await auth.authorized(url.toString());
    if(!Array.isArray(data.events)||!Number.isInteger(data.total)||data.total<0) throw new Error('Invalid events pagination response');
    if(total!==undefined&&total!==data.total) throw new Error('Events total changed during pagination; aborting incomplete report');
    total=data.total;
    if(data.offset!==undefined&&Number(data.offset)!==offset) throw new Error('Unexpected events offset');
    if(data.events.length>limit) throw new Error('Page exceeds requested limit');
    for(const event of data.events) {
      if(!event||typeof event!=='object'||Array.isArray(event)) throw new Error('Invalid event record');
      if(event.event_id&&seen.has(event.event_id)){duplicates++;continue;}
      if(event.event_id) seen.add(event.event_id);
      // Enforce a half-open interval even if the gateway treats end as inclusive.
      if(event.datetime){const time=Date.parse(event.datetime);if(!Number.isFinite(time)) throw new Error('Invalid event datetime');if(time<Date.parse(window.start)||time>=Date.parse(window.end)) continue;}
      result.push(event);
    }
    offset+=data.events.length;
    if(offset>total) throw new Error('Retrieved rows exceed API total');
    if(offset===total) return {events:result,metadata:{total,rawRows:offset,duplicates,uniqueEvents:result.length}};
    if(data.events.length===0) throw new Error('Incomplete pagination: empty page before total');
  }
  throw new Error('Pagination safety limit exceeded');
}

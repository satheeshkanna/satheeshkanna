export class HttpError extends Error { constructor(status) {super(`HTTP request failed (${status})`);this.status=status;} }
const knownCodes=new Set(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET','CERT_HAS_EXPIRED','CERT_NOT_YET_VALID','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','ERR_TLS_CERT_ALTNAME_INVALID']);
function codes(error){
 const found=new Set(),seen=new Set();
 function walk(e){if(!e||typeof e!=='object'||seen.has(e))return;seen.add(e);if(knownCodes.has(e.code))found.add(e.code);walk(e.cause);if(Array.isArray(e.errors))e.errors.forEach(walk);}
 walk(error);return [...found];
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function request(url,{method='GET',body,token,timeout=30000,retries=2,fetchImpl=fetch,endpointLabel='API'}={}) {
  const label=['AUTH_URL','EVENTS_URL','BUSINESS_EVENTS_URL','NOTIFICATION_URL'].includes(endpointLabel)?endpointLabel:'API';
  for(let attempt=0;;attempt++) {
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout);
    try {
      const response=await fetchImpl(url,{method,signal:controller.signal,headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{} )});
      if(!response.ok) throw new HttpError(response.status);
      const text=await response.text();
      if(!text) return {};
      try {return JSON.parse(text);} catch {const error=new Error('Invalid JSON');error.code='INVALID_JSON';throw error;}
    } catch(error) {
      const transient=error instanceof HttpError ? [408,429,500,502,503,504].includes(error.status) : error.name==='AbortError'||error instanceof TypeError;
      if(!transient||attempt>=retries) {
        if(error instanceof HttpError){error.message=`${label}: HTTP request failed (${error.status})`;error.endpoint=label;throw error;}
        const underlying=codes(error);
        const detail=error.name==='AbortError'?`HTTP request timed out after ${timeout} ms`:error.code==='INVALID_JSON'?'HTTP response failure: endpoint returned invalid JSON':'HTTP transport failure';
        const failure=new Error(`${label}: ${detail}${underlying.length?` [${underlying.join(', ')}]`:''}`);
        failure.endpoint=label;failure.diagnosticCodes=underlying;failure.attempts=attempt+1;
        throw failure;
      }
      await pause(Math.min(250*2**attempt,4000));
    } finally {clearTimeout(timer);}
  }
}

export class HttpError extends Error { constructor(status) {super(`HTTP request failed (${status})`);this.status=status;} }
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function request(url,{method='GET',body,token,timeout=30000,retries=2,fetchImpl=fetch}={}) {
  for(let attempt=0;;attempt++) {
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout);
    try {
      const response=await fetchImpl(url,{method,signal:controller.signal,headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{} )});
      if(!response.ok) throw new HttpError(response.status);
      const text=await response.text();
      if(!text) return {};
      try {return JSON.parse(text);} catch {throw new Error('API returned invalid JSON');}
    } catch(error) {
      const transient=error instanceof HttpError ? [408,429,500,502,503,504].includes(error.status) : error.name==='AbortError'||error instanceof TypeError;
      if(!transient||attempt>=retries) {
        if(error instanceof HttpError) throw error;
        throw new Error(error.name==='AbortError'?'HTTP request timed out':'HTTP transport or response failure');
      }
      await pause(Math.min(250*2**attempt,4000));
    } finally {clearTimeout(timer);}
  }
}

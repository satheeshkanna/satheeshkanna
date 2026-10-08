import {request} from './http.js';
import {required,endpoint} from './config.js';
export function createAuth(config,{requestImpl=request,now=Date.now}={}) {
  let cached,expiry=0,pending;
  async function token(force=false) {
    if(!force&&cached&&now()<expiry) return cached;
    if(pending) return pending;
    pending=(async()=>{
      const env=config.env;
      const body=Object.fromEntries(['username','password','realm','client_id','client_secret','grant_type'].map(k=>[k,required(env,`AUTH_${k.toUpperCase()}`)]));
      const result=await requestImpl(endpoint(env,'AUTH_URL'),{method:'POST',body,endpointLabel:'AUTH_URL',timeout:config.timeout,retries:config.retries});
      if(typeof result.access_token!=='string'||!result.access_token||!Number.isFinite(Number(result.expires_in))||Number(result.expires_in)<=0) throw new Error('Invalid token response');
      cached=result.access_token;expiry=now()+Number(result.expires_in)*1000-Math.min(60000,Number(result.expires_in)*100);
      return cached;
    })();
    try{return await pending;}finally{pending=undefined;}
  }
  async function authorized(url,options={}) {
    let bearer=await token();
    try{return await requestImpl(url,{timeout:config.timeout,retries:config.retries,...options,token:bearer});}
    catch(error){if(error.status!==401) throw error;bearer=await token(true);return requestImpl(url,{timeout:config.timeout,retries:config.retries,...options,token:bearer});}
  }
  return {token,authorized};
}

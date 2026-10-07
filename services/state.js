import {mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
export async function acquire(directory,identity,{force=false}={}){
 await mkdir(directory,{recursive:true});const key=createHash('sha256').update(identity).digest('hex'),file=path.join(directory,`${key}.json`),lock=path.join(directory,`${key}.lock`);
 let handle;try{handle=await open(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw new Error('Report execution locked; inspect .state before manual recovery');throw e;}
 async function release(){await handle.close();await unlink(lock);}
 async function write(status){const temp=`${file}.${randomUUID()}.tmp`;await (await import('node:fs/promises')).writeFile(temp,JSON.stringify({status,updatedAt:new Date().toISOString()}),{mode:0o600});await rename(temp,file);}
 try{let state;try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(state&&!force){await release();return {suppressed:true,status:state.status};}
 return {suppressed:false,markSending:()=>write('sending'),markSent:()=>write('sent'),release};
 }catch(e){await release();throw e;}
}

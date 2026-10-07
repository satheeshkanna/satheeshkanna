import {createHash} from 'node:crypto';
export function reference(value) {return value?`ref-${createHash('sha256').update(String(value)).digest('hex').slice(0,12)}`:'';}
// Customer-provided free text is never exported. Only approved generic reasons are used.
export function businessReason(code) {return code==='404'?'Complaint reference not found':code==='422'?'Mobile number mismatch':'Business processing error (free text withheld)';}
export function safeId(value) {return String(value??'').replace(/[^a-zA-Z0-9_.:-]/g,'').slice(0,150);}

const DAY=86400000;
function date(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Dates must be YYYY-MM-DD');
  const d=new Date(`${value}T00:00:00Z`);
  if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==value) throw new Error('Invalid calendar date');
  return d;
}
export function period({start,end,intervalDays=1,now=new Date()}={}) {
  if(Boolean(start)!==Boolean(end)) throw new Error('Supply both --start and --end');
  if(!start) { end=new Date(+now+3*3600000).toISOString().slice(0,10); start=new Date(+date(end)-intervalDays*DAY).toISOString().slice(0,10); }
  const s=+date(start)-3*3600000,e=+date(end)-3*3600000;
  if(e<=s) throw new Error('End must be after start');
  return {date:start,start:new Date(s).toISOString(),end:new Date(e).toISOString(),label:`${start} to ${end} (end exclusive, Asia/Riyadh)`};
}
export function argumentsFrom(argv) {
  const result={};
  for(let i=0;i<argv.length;i++) {
    if(['--force','--dry-run','--confirm-send'].includes(argv[i])) result[argv[i].slice(2)]=true;
    else if(['--start','--end'].includes(argv[i]) && argv[i+1]) result[argv[i].slice(2)]=argv[++i];
    else throw new Error(`Unknown or incomplete option: ${argv[i]}`);
  }
  return result;
}

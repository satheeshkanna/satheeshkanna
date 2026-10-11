import argparse, hashlib, json, logging, os, re, sys, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, urlsplit, urlunsplit
import requests
from dotenv import load_dotenv
from openpyxl import Workbook
from jinja2 import Environment, FileSystemLoader, select_autoescape
ROOT=Path(__file__).resolve().parents[1]
load_dotenv(ROOT/'.env')

def cfg():
 e=os.environ; return e
class StepLog:
 def __init__(self,e=None):
  e=e or os.environ; self.enabled=e.get('LOG_ENABLED','true')=='true';self.console=e.get('LOG_CONSOLE_ENABLED','true')=='true';self.file=e.get('LOG_FILE_ENABLED','true')=='true';self.level=e.get('LOG_LEVEL','info');self.path=ROOT/'logs'/'report.jsonl';self.run_id=hashlib.sha256(str(time.time()).encode()).hexdigest()[:12]
 def __call__(self,event,**data):
  if not self.enabled or self.level=='silent': return
  row={'timestamp':datetime.now(timezone.utc).isoformat(),'runId':self.run_id,'event':event,**data}
  if self.console: print(f"[{row['timestamp']}] {event} {json.dumps(data)}",flush=True)
  if self.file: self.path.parent.mkdir(exist_ok=True); self.path.open('a',encoding='utf8').write(json.dumps(row)+'\n')
def iso(value,name):
 if not re.search(r'T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$',value): raise ValueError(f'{name} must include timezone, e.g. 2026-10-10T09:00:00+03:00')
 return datetime.fromisoformat(value.replace('Z','+00:00')).astimezone(timezone.utc)
def window(args):
 if args.start_time or args.end_time:
  if not(args.start_time and args.end_time): raise ValueError('Supply both --start-time and --end-time')
  s,e=iso(args.start_time,'--start-time'),iso(args.end_time,'--end-time')
 else:
  if bool(args.start)!=bool(args.end): raise ValueError('Supply both --start and --end')
  if not args.start:
   local=datetime.now(timezone(timedelta(hours=3))).date()-timedelta(days=1);args.start=str(local);args.end=str(local+timedelta(days=1))
  s=datetime.fromisoformat(args.start).replace(tzinfo=timezone(timedelta(hours=3))).astimezone(timezone.utc);e=datetime.fromisoformat(args.end).replace(tzinfo=timezone(timedelta(hours=3))).astimezone(timezone.utc)
 if e<=s: raise ValueError('End must be after start')
 return s,e
class API:
 def __init__(self,e,log):self.e=e;self.log=log;self.token=None;self.expiry=0
 def auth(self):
  if self.token and time.time()<self.expiry:return self.token
  self.log('authentication_started',endpoint='AUTH_URL'); body={k:e for k,e in [('username',self.e.get('AUTH_USERNAME')),('password',self.e.get('AUTH_PASSWORD')),('realm',self.e.get('AUTH_REALM')),('client_id',self.e.get('AUTH_CLIENT_ID')),('client_secret',self.e.get('AUTH_CLIENT_SECRET')),('grant_type',self.e.get('AUTH_GRANT_TYPE','password'))]}
  r=requests.post(self.e['AUTH_URL'],json=body,timeout=int(self.e.get('REQUEST_TIMEOUT_MS',30000))/1000);r.raise_for_status();data=r.json();self.token=data['access_token'];self.expiry=time.time()+int(data.get('expires_in',3600))-60;self.log('authentication_completed',endpoint='AUTH_URL');return self.token
 def get(self,url,endpoint):
  for attempt in range(3):
   try:
    self.log('http_request_started',endpoint=endpoint,attempt=attempt+1);r=requests.get(url,headers={'Authorization':'Bearer '+self.auth(),'Accept':'application/json'},timeout=int(self.e.get('REQUEST_TIMEOUT_MS',30000))/1000);r.raise_for_status();return r.json()
   except requests.HTTPError as x:
    if x.response is not None and x.response.status_code==401 and attempt==0:self.token=None;continue
    if attempt>=2:raise
   except requests.RequestException:
    if attempt>=2:raise
   time.sleep(2**attempt)
 def events(self,endpoint,limit,filters,body,s,e):
  out=[];seen=set();offset=0;total=None
  while total is None or offset<total:
   params={'start':s.isoformat().replace('+00:00','Z'),'end':e.isoformat().replace('+00:00','Z'),'limit':limit,'offset':offset,'fields':'event_id,datetime,api_name,api_version,app_name,status_code,transaction_id,global_transaction_id,uri_path,time_to_serve_request,request_body,response_body',**filters}
   if body:params['request_body']=body;data=self.get(endpoint+'?'+urlencode(params), 'BUSINESS_EVENTS_URL' if endpoint==self.e.get('BUSINESS_EVENTS_URL') else 'EVENTS_URL');total=int(data.get('total',0));rows=data.get('events',[]);self.log('events_page_completed',endpoint=endpoint,offset=offset,rows=len(rows),total=total);
   for x in rows:
    if not x.get('event_id') or x['event_id'] not in seen:
     if x.get('event_id'): seen.add(x['event_id'])
     out.append(x);offset+=len(rows)
   if not rows and offset<total: raise RuntimeError('Incomplete pagination')
  return out
def aggregate(rows):
 ops={'Complaint Creation':['create','creation'],'Complaint Update':['update'],'Complaint Feedback':['feedback'],'Complaint Resolution':['resolution']}; result=[]
 for x in rows:
  body=x.get('request_body',{}); 
  if isinstance(body,str):
   try:body=json.loads(body)
   except:body={}
  text=' '.join(str(body.get(k,''))+' '+str(x.get(k,'')) for k in ('uri_path','api_name','complaintProcessingType')).lower();op=next((k for k,v in ops.items() if any(a in text for a in v)),'Other / Unclassified');status=int(str(x.get('status_code','0')).split()[0] or 0);result.append({'operation':op,'success':200<=status<300,'status':status,'event':x})
 total=len(result);good=sum(x['success'] for x in result);return {'rows':result,'total':total,'success':good,'failed':total-good,'successRate':f'{good/total*100:.2f}' if total else 'N/A','operations':[{'name':n,'total':sum(x['operation']==n for x in result),'success':sum(x['operation']==n and x['success'] for x in result),'failed':sum(x['operation']==n and not x['success'] for x in result)} for n in [*ops,'Other / Unclassified']]}
def write_xlsx(report,path):
 b=Workbook();s=b.active;s.title='Summary';s.append(['Metric','Value']);
 for k in ('total','success','failed','successRate'):s.append([k,report[k]])
 for name,rows in [('Gateway Failures',[x for x in report['rows'] if not x['success']]),('Business Errors',[]),('Technical Errors',[x for x in report['rows'] if not x['success']])]:
  ws=b.create_sheet(name);ws.append(['Operation','Status','Event ID']);[ws.append([x['operation'],x['status'],x['event'].get('event_id','')]) for x in rows]
 b.save(path)
def main(argv=None):
 p=argparse.ArgumentParser();p.add_argument('--start');p.add_argument('--end');p.add_argument('--start-time');p.add_argument('--end-time');p.add_argument('--dry-run',action='store_true');a=p.parse_args(argv);log=StepLog();s,e=window(a);api=API(os.environ,log);log('report_started',start=s.isoformat(),end=e.isoformat());rows=api.events(os.environ['EVENTS_URL'],int(os.environ.get('PAGE_LIMIT',1000)),{'path':os.environ.get('EVENT_PATH',''),'app_name':os.environ.get('EVENT_APP_NAME','')},'',s,e);report=aggregate(rows);out=ROOT/'output';out.mkdir(exist_ok=True);write_xlsx(report,out/'Complaint_Journey_Report.xlsx');log('report_completed',total=report['total'],success=report['success'],failed=report['failed'],emailSent=False);print(json.dumps({k:report[k] for k in ('total','success','failed','successRate')}))
if __name__=='__main__':
 try:main()
 except Exception as x:print(f'Report aborted: {x}',file=sys.stderr);raise SystemExit(1)

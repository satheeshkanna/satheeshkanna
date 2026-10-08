import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const readConfig = name => JSON.parse(readFileSync(new URL(`../config/${name}.json`, import.meta.url), 'utf8'));
export function integer(value, fallback, min=1, max=100000) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error('Invalid numeric configuration');
  return n;
}
export function configuration(env=process.env) {
  const report=readConfig('report'), email=readConfig('email');
  const timezone=env.REPORT_TIMEZONE || report.timezone;
  // Initial reporting windows deliberately support Saudi time only, with no DST.
  if(timezone!=='Asia/Riyadh') throw new Error('Only Asia/Riyadh reporting timezone is currently supported');
  return { ...report, timezone, email, environment:env.ENVIRONMENT_NAME || 'Development',
    intervalDays:integer(env.REPORT_INTERVAL_DAYS,report.intervalDays,1,366),
    limit:integer(env.PAGE_LIMIT,report.limit), template:env.REPORT_TEMPLATE || 'template1',
    filters:{path:env.EVENT_PATH ?? report.filters.path,app_name:env.EVENT_APP_NAME ?? report.filters.app_name},
    businessQuery:env.BUSINESS_ERROR_QUERY || '',
    businessFilters:{path:env.BUSINESS_EVENT_PATH ?? '',app_name:env.BUSINESS_EVENT_APP_NAME ?? ''},
    businessLimit:integer(env.BUSINESS_PAGE_LIMIT,50),
    timeout:integer(env.REQUEST_TIMEOUT_MS,30000), retries:integer(env.REQUEST_RETRIES,2,0,5),
    attachmentEnabled:env.ATTACHMENT_ENABLED==='true', env };
}
export function required(env,key) { if(!env[key]?.trim()) throw new Error(`Missing environment variable: ${key}`); return env[key]; }
export function endpoint(env,key) { const u=new URL(required(env,key)); if(u.protocol!=='https:') throw new Error(`${key} must use HTTPS`); return u.toString(); }

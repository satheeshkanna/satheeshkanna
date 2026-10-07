import {runReport} from '../services/report.js';
import {argumentsFrom} from '../services/period.js';
import {log} from '../services/logger.js';
try{await runReport(argumentsFrom(process.argv.slice(2)));}catch(error){await log('report_failed',{reason:error.message});console.error('Report aborted:', error.message);process.exitCode=1;}

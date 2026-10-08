import {runReport} from '../services/report.js';
import {argumentsFrom} from '../services/period.js';
try{await runReport(argumentsFrom(process.argv.slice(2)));}catch(error){console.error('Report aborted:', error.message);process.exitCode=1;}

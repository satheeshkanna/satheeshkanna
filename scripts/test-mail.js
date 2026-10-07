import {configuration} from '../services/config.js';
import {argumentsFrom,period} from '../services/period.js';
import {createAuth} from '../services/auth.js';
import {payload,send} from '../services/mailer.js';
const args=argumentsFrom(process.argv.slice(2));
if(!args['confirm-send'])console.log('No email sent. Explicitly use npm run test:mail -- --confirm-send after configuring recipients.');
else {try{const config=configuration();const message=payload(config,{successRate:'N/A',businessErrorCount:0},period(),'<html><body><h1>Complaint report connectivity test</h1><p>Test message only. No production statistics.</p></body></html>');message.mailsubject='[TEST] Complaint Report Service — connectivity test';await send(config,createAuth(config),message);console.log('Notification API accepted test request; verify delivery separately.');}catch{console.error('Test notification failed. Check credentials, certificate trust, recipient configuration and notification API contract.');process.exitCode=1;}}

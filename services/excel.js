import ExcelJS from 'exceljs';
export async function workbook(report,window){
 const book=new ExcelJS.Workbook();book.creator='Complaint Report Service';
 function sheet(name,columns,rows){const ws=book.addWorksheet(name);ws.columns=columns.map(([key,header,width=24])=>({key,header,width}));for(const row of rows)ws.addRow(row);ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,ws.rowCount),column:columns.length}};ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0079C8'}};ws.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};});return ws;}
 sheet('Summary',[['metric','Metric',38],['value','Value',65]],[{metric:'Reporting period',value:window.label},{metric:'Total requests',value:report.total},{metric:'Gateway successes',value:report.success},{metric:'Gateway failures',value:report.failed},{metric:'Success rate (%)',value:report.successRate},{metric:'Business errors',value:report.businessErrorCount},{metric:'Distinct affected events',value:report.affectedEvents},...report.operations.map(o=>({metric:o.name,value:`Total ${o.total}; success ${o.success}; failed ${o.failed}`}))]);
 const base=[['timestamp','Timestamp',26],['operation','API operation',26],['apiName','API name'],['status','HTTP status',15],['transactionId','Transaction ID'],['eventId','Event ID',42],['latency','Gateway latency (API units)',25],['technicalReason','Failure reason',36]];
 sheet('Gateway Failures',base,report.gatewayFailures);
 sheet('Business Errors',[['timestamp','Timestamp',26],['complaintReference','Pseudonymized complaint reference',32],['processingType','Processing type'],['businessStatus','Business status'],['errorCode','Error code',15],['errorMessage','Error reason (sanitized)',60],['transactionId','Transaction ID'],['eventId','Event ID',42]],report.businessErrors);
 sheet('Technical Errors',base.filter(c=>!['apiName','latency'].includes(c[0])),report.technicalErrors);
 return book;
}
export async function excel(report,window,path){const book=await workbook(report,window);await book.xlsx.writeFile(path);return path;}

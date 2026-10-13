/* Developer-only review logic regression using Node's SQLite. This executes
   the checked-in SELECT logic after adapting view syntax/schema qualifiers.
   It is NOT a Teradata compiler and does not execute any profiling SPL. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE DQ_FIELD_AVAILABILITY (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,EARLIEST_DATE TEXT,LATEST_DATE TEXT);
CREATE TABLE DQ_RUN_LOG (RUN_ID TEXT PRIMARY KEY,STATUS TEXT);
CREATE TABLE DQ_RUN_NUMBER (RUN_ID TEXT PRIMARY KEY,RUN_NUMBER INTEGER UNIQUE);
CREATE TABLE DQ_METRIC_RESULT (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,
 FIELD_TYPE TEXT,MODULE_NAME TEXT,PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,
 METRIC_NAME TEXT,METRIC_VALUE NUMERIC,DQ_COLOUR TEXT,
 RATE_NUMERATOR INTEGER,RATE_DENOMINATOR INTEGER);
CREATE TABLE DQ_DATE_REVIEW (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,
 PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,EARLIEST_DATE TEXT,LATEST_DATE TEXT);`);
for(const [id,status] of [['mixed','SUCCEEDED'],['failed','FAILED'],['active','RUNNING'],['date-only','SUCCEEDED']]){
 db.prepare('INSERT INTO DQ_RUN_LOG VALUES (?,?)').run(id,status);
 db.prepare('INSERT INTO DQ_RUN_NUMBER VALUES (?,?)').run(id,db.prepare('SELECT COUNT(*) AS n FROM DQ_RUN_NUMBER').get().n+1);
}
const insert=db.prepare('INSERT INTO DQ_METRIC_RESULT VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
const metric=(run,field,type,period,name,value,colour=null,num=null,den=null)=>
 insert.run(run,'TEST',field,type,type+'_BASIC',...period,name,value,colour,num,den);
const periods=[['OVERALL','ALL'],['YEARLY','2000'],['YEARLY','2001'],['YEARLY','UNKNOWN'],
 ['MONTHLY','2000-01'],['MONTHLY','2000-02'],['MONTHLY','2001-01'],['MONTHLY','UNKNOWN']];
for(const period of periods){
 for(const [name,value] of Object.entries({TOTAL_COUNT:4,NON_MISSING_COUNT:3,MISSING_COUNT:1,
  MISSING_RATE_PCT:25,ZERO_COUNT:1,ZERO_RATE_PCT:25,MINIMUM:0,MAXIMUM:2,MEAN:1,STDDEV_SAMP:1})){
  const rate=name.endsWith('_PCT');metric('mixed','AMOUNT','NUMERIC',period,name,value,rate?'RED':null,rate?1:null,rate?4:null);
 }
 for(const [field,type] of [['CATEGORY','CATEGORICAL'],['NULL_CATEGORY','CATEGORICAL'],['CUSTOMER_ID','IDENTIFIER']]){
  const allNull=field==='NULL_CATEGORY';
  metric('mixed',field,type,period,'MISSING_COUNT',allNull?4:1);
  metric('mixed',field,type,period,'MISSING_RATE_PCT',allNull?100:25,'RED',allNull?4:1,4);
  metric('mixed',field,type,period,'DISTINCT_COUNT',allNull?0:2);
 }
 for(const field of ['EVENT_DATE','EVENT_TS']){
  db.prepare('INSERT INTO DQ_DATE_REVIEW VALUES (?,?,?,?,?,?,?)').run('mixed','TEST',field,...period,
   '1999-12-31 23:59:59.000123','2002-03-05 00:00:00.000000');
 }
}
for(const field of ['AMOUNT','CATEGORY','NULL_CATEGORY','CUSTOMER_ID','EVENT_DATE','EVENT_TS']){
 db.prepare('INSERT INTO DQ_FIELD_AVAILABILITY VALUES (?,?,?,?,?)').run('mixed','TEST',field,
  field==='NULL_CATEGORY'?null:'2000-01-31',field==='NULL_CATEGORY'?null:'2000-02-29');
}
for(const run of ['failed','active']){
 metric(run,'CATEGORY','CATEGORICAL',['OVERALL','ALL'],'MISSING_COUNT',1);
 db.prepare('INSERT INTO DQ_DATE_REVIEW VALUES (?,?,?,?,?,?,?)').run(run,'TEST','EVENT_DATE','OVERALL','ALL',null,null);
}
for(const field of ['EVENT_DATE','EVENT_TS']){
 db.prepare('INSERT INTO DQ_DATE_REVIEW VALUES (?,?,?,?,?,?,?)').run('date-only','TEST',field,'OVERALL','ALL',null,null);
}
for(const file of ['91_dq_summary_views.sql','92_dq_numeric_review.sql','93_dq_basic_review.sql']){
 const sql=fs.readFileSync(path.join(root,'teradata/results',file),'utf8')
  .replace(/REPLACE VIEW/g,'CREATE VIEW').replaceAll('DQ_DB.','')
  /* SQLite CAST AS DATE differs from Teradata; adapt date extraction only. */
  .replace(/CAST\(CAST\((D\.(?:EARLIEST_DATE|LATEST_DATE)) AS DATE FORMAT 'YYYY-MM-DD'\) AS VARCHAR\(64\)\)/g,'date($1)');
 db.exec(sql);
}
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_COMPLETED_RESULT').get().n,152);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_NUMERIC_REVIEW').get().n,8);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW').get().n,50);
const category=db.prepare("SELECT * FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND FIELD_NAME='CATEGORY' AND PERIOD_LEVEL='OVERALL'").get();
assert.equal(category.MISSING_COUNT,1);assert.equal(category.MISSING_RATE_PCT,25);
assert.equal(category.DISTINCT_COUNT,2);assert.equal(category.TOTAL_COUNT,4);
assert.equal(category.NON_MISSING_COUNT,3);assert.equal(category.MISSING_RATE_COLOUR,'RED');
assert.equal(category.MINIMUM,null);assert.equal(category.EARLIEST_DATE,'2000-01-31');
const date=db.prepare("SELECT * FROM DQ_BASIC_REVIEW WHERE FIELD_NAME='EVENT_TS' AND RUN_NUMBER=1 AND PERIOD_LEVEL='OVERALL'").get();
assert.equal(date.MINIMUM,'1999-12-31');assert.equal(date.MAXIMUM,'2002-03-05');
assert.equal(date.EARLIEST_DATE,'2000-01-31');assert.equal(date.LATEST_DATE,'2000-02-29');
assert.equal(date.MISSING_COUNT,null);
assert.equal(db.prepare("SELECT EARLIEST_DATE FROM DQ_DATE_REVIEW WHERE RUN_ID='mixed' AND FIELD_NAME='EVENT_TS' AND PERIOD_LEVEL='OVERALL'").get().EARLIEST_DATE,
 '1999-12-31 23:59:59.000123','Review formatting must preserve stored timestamp extrema');
const summary=db.prepare("SELECT * FROM DQ_RUN_SUMMARY WHERE RUN_ID='date-only'").all();
assert.equal(summary.length,1);assert.equal(summary[0].FIELDS_TESTED,2);
assert.equal(summary[0].METRIC_RESULT_COUNT,0);assert.equal(summary[0].GREEN_COUNT,0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER IN (2,3)").get().n,0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_METRIC_RESULT WHERE FIELD_TYPE='DATE'").get().n,0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=4 AND EARLIEST_DATE IS NULL AND LATEST_DATE IS NULL").get().n,2);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND PERIOD_LEVEL<>'OVERALL' AND (EARLIEST_DATE IS NOT NULL OR LATEST_DATE IS NOT NULL)").get().n,0);
assert.equal(db.prepare("SELECT MINIMUM FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND FIELD_NAME='AMOUNT' AND PERIOD_LEVEL='OVERALL'").get().MINIMUM,'0');
db.close();
console.log('Portable review logic checks passed: pivot, period separation, date-only summary, short numbers and completed-run filtering. Teradata/SAS execution NOT tested.');

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
  for(const [name,value] of Object.entries({TOTAL_COUNT:4,NON_MISSING_COUNT:3,MISSING_COUNT:1,MISSING_RATE_PCT:25})){
   const rate=name==='MISSING_RATE_PCT';metric('mixed',field,'DATE',period,name,value,rate?'RED':null,rate?1:null,rate?4:null);
  }
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
 for(const [name,value] of Object.entries({TOTAL_COUNT:0,NON_MISSING_COUNT:0,MISSING_COUNT:0,MISSING_RATE_PCT:null})){
  const rate=name==='MISSING_RATE_PCT';metric('date-only',field,'DATE',['OVERALL','ALL'],name,value,rate?'NOT_EVALUATED':null,rate?0:null,rate?0:null);
 }
}
for(const period of periods){
 for(const [field,type] of [['AMOUNT','NUMERIC'],['CATEGORY','CATEGORICAL'],['NULL_CATEGORY','CATEGORICAL']]){
  metric('mixed',field,type,period,'SPECIAL_COUNT',0);
  metric('mixed',field,type,period,'SPECIAL_RATE_PCT',0,'GREEN',0,4);
 }
 for(const [name,value] of Object.entries({P1:0.02,P5:0.1,P25:0.5,P50:1,P75:1.5,P95:1.9,P99:1.98})){
  insert.run('mixed','TEST','AMOUNT','NUMERIC','NUMERIC_PERCENTILES',...period,name,value,null,null,null);
 }
}
for(const period of periods){
 for(const [name,value]of Object.entries({OUTLIER_VALID_COUNT:3,OUTLIER_LOWER_BOUND:-2,OUTLIER_UPPER_BOUND:4,OUTLIER_COUNT:0,OUTLIER_RATE_PCT:0})){
  const rate=name==='OUTLIER_RATE_PCT';
  insert.run('mixed','TEST','AMOUNT','NUMERIC','NUMERIC_OUTLIERS',...period,name,value,rate?'GREEN':null,rate?0:null,rate?3:null);
 }
}
db.prepare('INSERT INTO DQ_RUN_LOG VALUES (?,?)').run('outlier-only','SUCCEEDED');
db.prepare('INSERT INTO DQ_RUN_NUMBER VALUES (?,?)').run('outlier-only',5);
for(const [name,value]of Object.entries({OUTLIER_VALID_COUNT:33,OUTLIER_LOWER_BOUND:-3,OUTLIER_UPPER_BOUND:3,OUTLIER_COUNT:2,OUTLIER_RATE_PCT:200/33})){
 const rate=name==='OUTLIER_RATE_PCT';insert.run('outlier-only','TEST','AMOUNT','NUMERIC','NUMERIC_OUTLIERS','OVERALL','ALL',name,value,rate?'RED':null,rate?2:null,rate?33:null);
}
for(const file of ['91_dq_summary_views.sql','93_dq_basic_review.sql']){
 const sql=fs.readFileSync(path.join(root,'teradata/results',file),'utf8')
  .replace(/REPLACE VIEW/g,'CREATE VIEW').replaceAll('DQ_DB.','')
  /* SQLite CAST AS DATE differs from Teradata; adapt date extraction only. */
  .replace(/CAST\(CAST\((D\.(?:EARLIEST_DATE|LATEST_DATE)) AS DATE FORMAT 'YYYY-MM-DD'\) AS VARCHAR\(64\)\)/g,'date($1)');
 db.exec(sql);
}
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_COMPLETED_RESULT').get().n,373);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND FIELD_TYPE='NUMERIC'").get().n,8);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW').get().n,51);
const category=db.prepare("SELECT * FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND FIELD_NAME='CATEGORY' AND PERIOD_LEVEL='OVERALL'").get();
assert.equal(category.MISSING_COUNT,1);assert.equal(category.MISSING_RATE_PCT,25);
assert.equal(category.DISTINCT_COUNT,2);assert.equal(category.TOTAL_COUNT,4);
assert.equal(category.NON_MISSING_COUNT,3);assert.equal(category.MISSING_RATE_COLOUR,'RED');
assert.equal(category.MINIMUM,null);assert.equal(category.FIRST_AVAILABLE_FACT_DT,'2000-01-31');
const date=db.prepare("SELECT * FROM DQ_BASIC_REVIEW WHERE FIELD_NAME='EVENT_TS' AND RUN_NUMBER=1 AND PERIOD_LEVEL='OVERALL'").get();
assert.equal(date.MINIMUM,null);assert.equal(date.MAXIMUM,null);assert.equal(date.DISTINCT_COUNT,null);
assert.equal(date.FIRST_AVAILABLE_FACT_DT,'2000-01-31');assert.equal(date.LAST_AVAILABLE_FACT_DT,'2000-02-29');
assert.equal(date.MISSING_COUNT,1);assert.equal(date.TOTAL_COUNT,4);assert.equal(date.MISSING_RATE_COLOUR,'RED');

const summary=db.prepare("SELECT * FROM DQ_RUN_SUMMARY WHERE RUN_ID='date-only'").all();
assert.equal(summary.length,1);assert.equal(summary[0].FIELDS_TESTED,2);
assert.equal(summary[0].METRIC_RESULT_COUNT,8);assert.equal(summary[0].GREEN_COUNT,0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER IN (2,3)").get().n,0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_METRIC_RESULT WHERE FIELD_TYPE='DATE'").get().n,72);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=4 AND FIRST_AVAILABLE_FACT_DT IS NULL AND LAST_AVAILABLE_FACT_DT IS NULL").get().n,2);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND PERIOD_LEVEL<>'OVERALL' AND (FIRST_AVAILABLE_FACT_DT IS NOT NULL OR LAST_AVAILABLE_FACT_DT IS NOT NULL)").get().n,0);
assert.equal(db.prepare("SELECT MINIMUM FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND FIELD_NAME='AMOUNT' AND PERIOD_LEVEL='OVERALL'").get().MINIMUM,0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND FIELD_TYPE='DATE'").get().n,16);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE FIELD_TYPE='DATE' AND (MINIMUM IS NOT NULL OR MAXIMUM IS NOT NULL OR DISTINCT_COUNT IS NOT NULL OR ZERO_COUNT IS NOT NULL OR ZERO_RATE_PCT IS NOT NULL OR MEAN IS NOT NULL OR STDDEV_SAMP IS NOT NULL)").get().n,0);
const combined=db.prepare("SELECT * FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND FIELD_NAME='AMOUNT' AND PERIOD_LEVEL='OVERALL'").get();
assert.equal(combined.P50,1);assert.equal(combined.MINIMUM,0);assert.equal(combined.SPECIAL_COUNT,0);
assert.equal(combined.MODULE_NAME,'NUMERIC_BASIC+PCTL+OUTLIERS');
assert.equal(date.SPECIAL_COUNT,null);assert.equal(date.P50,null);
assert.equal(combined.OUTLIER_VALID_COUNT,3);assert.equal(combined.OUTLIER_COUNT,0);assert.equal(combined.OUTLIER_RATE_COLOUR,'GREEN');
assert.equal(date.OUTLIER_COUNT,null);
const only=db.prepare("SELECT * FROM DQ_BASIC_REVIEW WHERE RUN_ID='outlier-only'").get();
assert.equal(only.OUTLIER_COUNT,2);assert.equal(only.OUTLIER_VALID_COUNT,33);assert.equal(only.TOTAL_COUNT,null);assert.equal(only.P50,null);assert.equal(only.MODULE_NAME,'NUMERIC_OUTLIERS');
db.close();
console.log('Portable review logic checks passed: pivot, period separation, date-only summary, short numbers and completed-run filtering. Teradata/SAS execution NOT tested.');

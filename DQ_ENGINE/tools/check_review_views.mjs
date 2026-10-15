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
db.function('NULLIFZERO',value=>value===0?null:value);
db.exec(`CREATE TABLE DQ_FIELD_AVAILABILITY (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,EARLIEST_DATE TEXT,LATEST_DATE TEXT);
CREATE TABLE DQ_RUN_LOG (RUN_ID TEXT PRIMARY KEY,STATUS TEXT,PROJECT_ID TEXT DEFAULT 'TEST');
CREATE TABLE DQ_RUN_NUMBER (RUN_ID TEXT PRIMARY KEY,RUN_NUMBER INTEGER UNIQUE);
CREATE TABLE DQ_METRIC_RESULT (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,
 FIELD_TYPE TEXT,MODULE_NAME TEXT,PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,
 METRIC_NAME TEXT,METRIC_VALUE NUMERIC,DQ_COLOUR TEXT,
 RATE_NUMERATOR INTEGER,RATE_DENOMINATOR INTEGER,DATE_METRIC_VALUE TEXT,POU_DT TEXT,IS_PERCENTAGE TEXT,EXECUTION_TIMESTAMP TEXT);
CREATE TABLE DQ_RULE_RESULT (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,MODULE_NAME TEXT,PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,RULE_NAME TEXT,OBSERVED_VALUE NUMERIC,GREEN_THRESHOLD NUMERIC,RED_THRESHOLD NUMERIC,STATUS TEXT,REASON TEXT,UNIQUE(RUN_ID,FIELD_NAME,MODULE_NAME,PERIOD_LEVEL,PERIOD_VALUE,RULE_NAME));
CREATE TABLE DQ_DATE_REVIEW (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,
 PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,EARLIEST_DATE TEXT,LATEST_DATE TEXT);`);
for(const [id,status] of [['mixed','SUCCEEDED'],['failed','FAILED'],['active','RUNNING'],['date-only','SUCCEEDED']]){
 db.prepare('INSERT INTO DQ_RUN_LOG (RUN_ID,STATUS) VALUES (?,?)').run(id,status);
 db.prepare('INSERT INTO DQ_RUN_NUMBER VALUES (?,?)').run(id,db.prepare('SELECT COUNT(*) AS n FROM DQ_RUN_NUMBER').get().n+1);
}
const insert=db.prepare('INSERT INTO DQ_METRIC_RESULT (RUN_ID,PROJECT_ID,FIELD_NAME,FIELD_TYPE,MODULE_NAME,PERIOD_LEVEL,PERIOD_VALUE,METRIC_NAME,METRIC_VALUE,DQ_COLOUR,RATE_NUMERATOR,RATE_DENOMINATOR) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
const metric=(run,field,type,period,name,value,colour=null,num=null,den=null)=>
 insert.run(run,'TEST',field,type,type+'_BASIC',...period,name,value,colour,num,den);
const periods=[['OVERALL','ALL'],['YEARLY','2000'],['YEARLY','2001'],['YEARLY','UNKNOWN'],
 ['MONTHLY','2000-01'],['MONTHLY','2000-02'],['MONTHLY','2001-01'],['MONTHLY','UNKNOWN']];
for(const period of periods){
 for(const [name,value] of Object.entries({TOTAL_COUNT:4,NON_MISSING_COUNT:3,MISSING_COUNT:1,
  MISSING_RATE_PCT:25,ZERO_COUNT:1,ZERO_RATE_PCT:25,MINIMUM:0,MAXIMUM:2,MEAN:1,STDDEV_POP:1})){
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

}
for(const period of periods){
 for(const [name,value]of Object.entries({OUTLIER_VALID_COUNT:3,OUTLIER_LOWER_BOUND:-2,OUTLIER_UPPER_BOUND:4,OUTLIER_COUNT:0,OUTLIER_RATE_PCT:0})){
  const rate=name==='OUTLIER_RATE_PCT';
  insert.run('mixed','TEST','AMOUNT','NUMERIC','NUMERIC_OUTLIERS',...period,name,value,rate?'GREEN':null,rate?0:null,rate?3:null);
 }
}
db.prepare('INSERT INTO DQ_RUN_LOG (RUN_ID,STATUS) VALUES (?,?)').run('outlier-only','SUCCEEDED');
db.prepare('INSERT INTO DQ_RUN_NUMBER VALUES (?,?)').run('outlier-only',5);
for(const [name,value]of Object.entries({OUTLIER_VALID_COUNT:33,OUTLIER_LOWER_BOUND:-3,OUTLIER_UPPER_BOUND:3,OUTLIER_COUNT:2,OUTLIER_RATE_PCT:200/33})){
 const rate=name==='OUTLIER_RATE_PCT';insert.run('outlier-only','TEST','AMOUNT','NUMERIC','NUMERIC_OUTLIERS','OVERALL','ALL',name,value,rate?'RED':null,rate?2:null,rate?33:null);
}
db.prepare('INSERT INTO DQ_RUN_LOG (RUN_ID,STATUS) VALUES (?,?)').run('legacy','SUCCEEDED');
db.prepare('INSERT INTO DQ_RUN_NUMBER VALUES (?,?)').run('legacy',6);
metric('legacy','OLD_NUM','NUMERIC',['OVERALL','ALL'],'NON_MISSING_COUNT',2);
metric('legacy','OLD_NUM','NUMERIC',['OVERALL','ALL'],'STDDEV_SAMP',2);
// New-run colours come from the rule table; legacy rows retain fallback.
db.exec(`INSERT INTO DQ_RULE_RESULT
 SELECT RUN_ID,PROJECT_ID,FIELD_NAME,MODULE_NAME,PERIOD_LEVEL,PERIOD_VALUE,METRIC_NAME,
 METRIC_VALUE,1,5,DQ_COLOUR,CASE WHEN DQ_COLOUR='NOT_EVALUATED' THEN 'No eligible observations' END
 FROM DQ_METRIC_RESULT WHERE DQ_COLOUR IS NOT NULL;
 UPDATE DQ_METRIC_RESULT SET DQ_COLOUR=NULL;`);
// Dates are saved with each metric; a different project must stay isolated.
for(const [level,period,date]of [['MONTHLY','2000-01','2000-01-27'],['MONTHLY','2000-02','2000-02-29'],['YEARLY','2000','2000-02-29']])
 db.prepare('UPDATE DQ_METRIC_RESULT SET POU_DT=? WHERE RUN_ID=? AND PROJECT_ID=? AND PERIOD_LEVEL=? AND PERIOD_VALUE=?').run(date,'mixed','TEST',level,period);
db.exec("UPDATE DQ_METRIC_RESULT SET EXECUTION_TIMESTAMP='2026-10-15 10:00:00.000000'; UPDATE DQ_METRIC_RESULT SET EXECUTION_TIMESTAMP='2026-10-15 10:02:00.123456' WHERE RUN_ID='mixed' AND MODULE_NAME='NUMERIC_OUTLIERS'");
for(const file of ['91_dq_summary_views.sql','93_dq_basic_review.sql']){
 const sql=fs.readFileSync(path.join(root,'teradata/results',file),'utf8')
  .replace(/REPLACE VIEW/g,'CREATE VIEW').replaceAll('DQ_DB.','')
  /* SQLite CAST AS DATE differs from Teradata; adapt date extraction only. */
  .replace(/CAST\(CAST\((D\.(?:EARLIEST_DATE|LATEST_DATE)) AS DATE FORMAT 'YYYY-MM-DD'\) AS VARCHAR\(64\)\)/g,'date($1)');
 if(file==='93_dq_basic_review.sql')assert.ok(!sql.includes('STDDEV_SAMP'),'review view must not reference legacy sample deviation');
 db.exec(sql);
}
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_COMPLETED_RESULT').get().n,319);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND FIELD_TYPE='NUMERIC'").get().n,8);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW').get().n,52);
const legacy=db.prepare("SELECT * FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=6 AND FIELD_NAME='OLD_NUM'").get();
assert.equal(legacy.STDDEV_VALUE,null,'legacy sample deviation is not converted or shown as population deviation');
assert.equal(Object.hasOwn(legacy,'STDDEV_SAMP'),false);
const category=db.prepare("SELECT * FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND FIELD_NAME='CATEGORY' AND PERIOD_LEVEL='OVERALL'").get();
assert.equal(category.MISSING_COUNT,1);assert.equal(category.MISSING_RATE,0.25);
assert.equal(category.DISTINCT_COUNT,2);assert.equal(category.TOTAL_COUNT,4);
assert.equal(category.NON_MISSING_COUNT,3);
assert.equal(category.MIN_VALUE,null);assert.equal(category.FIRST_AVAILABLE_FACT_DT,'2000-01-31');
const date=db.prepare("SELECT * FROM DQ_BASIC_REVIEW WHERE FIELD_NAME='EVENT_TS' AND RUN_NUMBER=1 AND PERIOD_LEVEL='OVERALL'").get();
assert.equal(date.MIN_VALUE,null);assert.equal(date.MAX_VALUE,null);assert.equal(date.DISTINCT_COUNT,null);
assert.equal(date.FIRST_AVAILABLE_FACT_DT,'2000-01-31');assert.equal(date.LAST_AVAILABLE_FACT_DT,'2000-02-29');
assert.equal(date.MISSING_COUNT,1);assert.equal(date.TOTAL_COUNT,4);
assert.equal(db.prepare("SELECT STATUS FROM DQ_RULE_RESULT WHERE RUN_ID='mixed' AND FIELD_NAME='CATEGORY' AND PERIOD_LEVEL='OVERALL' AND RULE_NAME='MISSING_RATE_PCT'").get().STATUS,'RED');
assert.equal(db.prepare("SELECT STATUS FROM DQ_RULE_RESULT WHERE RUN_ID='mixed' AND FIELD_NAME='EVENT_TS' AND PERIOD_LEVEL='OVERALL' AND RULE_NAME='MISSING_RATE_PCT'").get().STATUS,'RED');
assert.equal(Object.keys(category).some(column=>column.endsWith('_COLOUR')),false);

const summary=db.prepare("SELECT * FROM DQ_RUN_SUMMARY WHERE RUN_ID='date-only'").all();
assert.equal(summary.length,1);assert.equal(summary[0].FIELDS_TESTED,2);
assert.equal(summary[0].METRIC_RESULT_COUNT,8);assert.equal(summary[0].GREEN_COUNT,0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER IN (2,3)").get().n,0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_METRIC_RESULT WHERE FIELD_TYPE='DATE'").get().n,72);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=4 AND FIRST_AVAILABLE_FACT_DT IS NULL AND LAST_AVAILABLE_FACT_DT IS NULL").get().n,2);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND PERIOD_LEVEL<>'OVERALL' AND (FIRST_AVAILABLE_FACT_DT IS NOT NULL OR LAST_AVAILABLE_FACT_DT IS NOT NULL)").get().n,0);
assert.equal(db.prepare("SELECT MIN_VALUE FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND FIELD_NAME='AMOUNT' AND PERIOD_LEVEL='OVERALL'").get().MIN_VALUE,0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND FIELD_TYPE='DATE'").get().n,16);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE FIELD_TYPE='DATE' AND (MIN_VALUE IS NOT NULL OR MAX_VALUE IS NOT NULL OR DISTINCT_COUNT IS NOT NULL OR ZERO_COUNT IS NOT NULL OR ZERO_RATE IS NOT NULL OR MEAN_VALUE IS NOT NULL OR STDDEV_VALUE IS NOT NULL)").get().n,0);
const combined=db.prepare("SELECT * FROM DQ_BASIC_REVIEW WHERE RUN_NUMBER=1 AND FIELD_NAME='AMOUNT' AND PERIOD_LEVEL='OVERALL'").get();
assert.equal(combined.MIN_VALUE,0);assert.equal(combined.SPECIAL_COUNT,0);
assert.equal(combined.MODULE_NAME,'NUMERIC_BASIC+OUTLIERS');
assert.equal(combined.CREATED_TIMESTAMP,'2026-10-15 10:02:00.123456');
assert.equal(date.CREATED_TIMESTAMP,'2026-10-15 10:00:00.000000');
assert.equal(date.SPECIAL_COUNT,null);
assert.equal(combined.OUTLIER_VALID_COUNT,3);assert.equal(combined.OUTLIER_COUNT,0);
assert.equal(db.prepare("SELECT STATUS FROM DQ_RULE_RESULT WHERE RUN_ID='mixed' AND FIELD_NAME='AMOUNT' AND PERIOD_LEVEL='OVERALL' AND RULE_NAME='OUTLIER_RATE_PCT'").get().STATUS,'GREEN');
assert.equal(Object.keys(combined).some(column=>column.endsWith('_COLOUR')),false);
assert.equal(date.OUTLIER_COUNT,null);
const only=db.prepare("SELECT * FROM DQ_BASIC_REVIEW WHERE RUN_ID='outlier-only'").get();
assert.equal(only.OUTLIER_COUNT,2);assert.equal(only.OUTLIER_VALID_COUNT,33);assert.equal(only.TOTAL_COUNT,null);assert.equal(only.MODULE_NAME,'NUMERIC_OUTLIERS');
const reviewDdl=fs.readFileSync(path.join(root,'teradata/results','93_dq_basic_review.sql'),'utf8');
assert.doesNotMatch(reviewDdl,/AS "[A-Z_]*COLOUR"/);
assert.match(reviewDdl,/AS DECIMAL\(38,0\)\) AS "TOTAL_COUNT"/);
assert.match(reviewDdl,/AS DECIMAL\(9,6\)\) AS "MISSING_RATE"/);
assert.match(reviewDdl,/AS DECIMAL\(38,6\)\) AS "MIN_VALUE"/);
assert.equal(combined.POU_DT,null);
assert.equal(Object.hasOwn(combined,'PERIOD_VALUE'),false);
assert.equal(Object.hasOwn(combined,'MISSING_RATE_PCT'),false);
assert.equal(combined.ZERO_RATE,0.25);assert.equal(combined.SPECIAL_RATE,0);
assert.equal(db.prepare("SELECT POU_DT FROM DQ_BASIC_REVIEW WHERE RUN_ID='mixed' AND FIELD_NAME='AMOUNT' AND PERIOD_LEVEL='MONTHLY' ORDER BY POU_DT DESC LIMIT 1").get().POU_DT,'2000-02-29');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_BASIC_REVIEW WHERE RUN_ID='mixed' AND PERIOD_LEVEL='MONTHLY' AND POU_DT='2000-01-27'").get().n,6);
assert.equal(legacy.POU_DT,null);
assert.ok(Math.abs(only.OUTLIER_RATE-2/33)<1e-10);
assert.equal(date.MISSING_RATE,0.25);
assert.equal(db.prepare("SELECT MISSING_RATE FROM DQ_BASIC_REVIEW WHERE RUN_ID='date-only' LIMIT 1").get().MISSING_RATE,null);
assert.equal(db.prepare("SELECT MISSING_RATE FROM DQ_BASIC_REVIEW WHERE RUN_ID='mixed' AND FIELD_NAME='NULL_CATEGORY' AND PERIOD_LEVEL='OVERALL'").get().MISSING_RATE,1);
assert.equal((reviewDdl.match(/DECIMAL\(9,6\)/g)||[]).length,4);
assert.equal((reviewDdl.match(/DECIMAL\(38,6\)/g)||[]).length,6);
db.close();
console.log('Portable review logic checks passed: pivot, period separation, date-only summary, short numbers and completed-run filtering. Teradata/SAS execution NOT tested.');

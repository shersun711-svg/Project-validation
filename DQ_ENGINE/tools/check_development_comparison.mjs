/* Synthetic regression of the checked-in SELECT; SQLite adaptations do not
   verify Teradata compilation, access, query plans or customer results. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const source=fs.readFileSync(new URL('../tests/compare_numeric_development.sql',import.meta.url),'utf8');
const executable=source.replace(/\/\*[\s\S]*?\*\//g,'');
assert(!/\b(CREATE|INSERT|UPDATE|DELETE|DROP|CALL|REPLACE)\b/i.test(executable));
assert(!/VW_RDS_PHASE2_FACT|DQ_METRIC_RESULT|DQ_NUMERIC_STATISTICS/.test(executable));
assert(!/\/\s*100/.test(executable),'Review rates must not be divided again');
const sql=source.replaceAll('DQ_DB.','')
 .replace(/EXTRACT\(YEAR FROM ([DR])\.POU_DT\)/g,(_,alias)=>`CAST(strftime('%Y',${alias}.POU_DT) AS INTEGER)`)
 .replace(/EXTRACT\(MONTH FROM ([DR])\.POU_DT\)/g,(_,alias)=>`CAST(strftime('%m',${alias}.POU_DT) AS INTEGER)`);
const db=new DatabaseSync(':memory:');
db.function('CHARACTER_LENGTH',v=>v?.length??null);
const metrics={TOTAL_COUNT:100,NON_MISSING_COUNT:90,MISSING_COUNT:10,MISSING_RATE:.1,
 ZERO_COUNT:5,ZERO_RATE:.05,MIN_VALUE:0,MAX_VALUE:50,MEAN_VALUE:10,STDDEV_VALUE:2,SPECIAL_COUNT:10,SPECIAL_RATE:.1,
 OUTLIER_LOWER_BOUND:4,OUTLIER_UPPER_BOUND:16,OUTLIER_COUNT:2,OUTLIER_RATE:.025,OUTLIER_VALID_COUNT:80};
db.exec(`ATTACH DATABASE ':memory:' AS LAB_P_DECISION_SCIENCE;
CREATE TABLE DQ_RUN_LOG (RUN_ID TEXT, PROJECT_ID TEXT, STATUS TEXT, ATTEMPT_NO INTEGER,PROFILE_OVERALL TEXT,PROFILE_MONTHLY TEXT,PROFILE_YEARLY TEXT);
CREATE TABLE DQ_RUN_NUMBER (RUN_ID TEXT,RUN_NUMBER INTEGER);
CREATE TABLE DQ_RUN_FIELD_CONFIG (RUN_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT);
CREATE TABLE DQ_MODULE_LOG (RUN_ID TEXT,MODULE_NAME TEXT,ATTEMPT_NO INTEGER,BATCH_ID INTEGER,STATUS TEXT);
CREATE TABLE DQ_BASIC_REVIEW (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT,PERIOD_LEVEL TEXT,POU_DT TEXT,
 ${Object.keys(metrics).map(name=>`${name} NUMERIC`).join(',')});
CREATE TABLE LAB_P_DECISION_SCIENCE.IRB_RDS_DQ_NUMERIC_PROFILE_RESULT (
 RUN_ID INTEGER,FIELD_NAME TEXT,RUN_TYPE TEXT,POU_DT TEXT,ROW_COUNT INTEGER,MISSING_COUNT INTEGER,MISSING_PCT NUMERIC,
 ZERO_COUNT INTEGER,ZERO_PCT NUMERIC,MIN_VALUE NUMERIC,MAX_VALUE NUMERIC,MEAN_VALUE NUMERIC,STDDEV_VALUE NUMERIC,
 SPECIAL_COUNT INTEGER,SPECIAL_PCT NUMERIC,VALID_COUNT INTEGER,OUTLIER_COUNT INTEGER,OUTLIER_PCT NUMERIC,
 OUTLIER_VALUE_LOWER NUMERIC,OUTLIER_VALUE_UPPER NUMERIC);
INSERT INTO DQ_RUN_LOG VALUES ('our','RDS','SUCCEEDED',1,'Y','Y','N');
INSERT INTO DQ_RUN_NUMBER VALUES ('our',16);
INSERT INTO DQ_RUN_FIELD_CONFIG VALUES ('our','AMOUNT','NUMERIC');
INSERT INTO DQ_MODULE_LOG VALUES ('our','NUMERIC_BASIC',1,0,'SUCCEEDED'),('our','NUMERIC_OUTLIERS',1,0,'SUCCEEDED');`);
for(const [level,date] of [['OVERALL',null],['MONTHLY','2018-01-31']]){
 const values=['our','RDS','AMOUNT','NUMERIC',level,date,...Object.values(metrics)];
 db.prepare(`INSERT INTO DQ_BASIC_REVIEW VALUES (${values.map(()=>'?').join(',')})`).run(...values);
 db.prepare('INSERT INTO LAB_P_DECISION_SCIENCE.IRB_RDS_DQ_NUMERIC_PROFILE_RESULT VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
 .run(1,'AMOUNT',level,date,100,10,.1,5,.05,0,50,10,2,10,.1,80,2,.025,4,16);
}
const dev='LAB_P_DECISION_SCIENCE.IRB_RDS_DQ_NUMERIC_PROFILE_RESULT';
const rows=(query=sql)=>{const statement=db.prepare(query);statement.setReadBigInts(true);return statement.all();};
let scenarios=0;
function scenario(change,status,metric,query=sql){
 db.exec('SAVEPOINT test_case');
 try{db.exec(change);const found=rows(query);assert(found.some(r=>r.STATUS===status&&(!metric||r.METRIC_NAME===metric)),JSON.stringify(found,(_,v)=>typeof v==='bigint'?String(v):v));scenarios++;}
 finally{db.exec('ROLLBACK TO test_case; RELEASE test_case');}
}
assert.equal(rows().length,34);assert(rows().every(r=>r.STATUS==='MATCH'&&Number(r.DIFFERENCE)===0));
assert.deepEqual(Object.keys(rows()[0]),['FIELD_NAME','PERIOD_LEVEL','POU_DT','DEV_POU_DT','METRIC_NAME','OUR_VALUE','DEV_VALUE','DIFFERENCE','STATUS','REASON','OUR_RUN_NUMBER','DEV_RUN_ID','PROJECT_ID']);
assert.equal(rows(sql.replace("CAST('Y' AS CHAR(1)) AS SHOW_MATCHES","CAST('N' AS CHAR(1)) AS SHOW_MATCHES")).length,0);
assert(rows().filter(r=>r.METRIC_NAME==='MISSING_RATE').every(r=>r.OUR_VALUE===.1&&r.DEV_VALUE===.1));
scenario(`UPDATE ${dev} SET MEAN_VALUE=10.0000004`,'MATCH','MEAN_VALUE');
scenario(`UPDATE ${dev} SET MEAN_VALUE=10.00001`,'DIFFERENT','MEAN_VALUE');
scenario(`UPDATE ${dev} SET MISSING_PCT=.100001`,'MATCH','MISSING_RATE');
scenario(`UPDATE ${dev} SET MISSING_PCT=.100002`,'DIFFERENT','MISSING_RATE');
scenario(`UPDATE ${dev} SET MIN_VALUE=.0000004`,'MATCH','MIN_VALUE');
scenario(`UPDATE ${dev} SET MIN_VALUE=.000001`,'DIFFERENT','MIN_VALUE');
scenario(`UPDATE ${dev} SET MEAN_VALUE=NULL`,'DIFFERENT','MEAN_VALUE');
scenario(`UPDATE DQ_BASIC_REVIEW SET MEAN_VALUE=NULL;UPDATE ${dev} SET MEAN_VALUE=NULL`,'MATCH','MEAN_VALUE');
scenario('INSERT INTO DQ_BASIC_REVIEW SELECT * FROM DQ_BASIC_REVIEW','DUPLICATE_ENGINE');
scenario(`INSERT INTO ${dev} SELECT * FROM ${dev}`,'DUPLICATE_DEVELOPMENT');
scenario(`INSERT INTO ${dev} SELECT RUN_ID,FIELD_NAME,RUN_TYPE,'2018-01-15',ROW_COUNT,MISSING_COUNT,MISSING_PCT,ZERO_COUNT,ZERO_PCT,MIN_VALUE,MAX_VALUE,MEAN_VALUE,STDDEV_VALUE,SPECIAL_COUNT,SPECIAL_PCT,VALID_COUNT,OUTLIER_COUNT,OUTLIER_PCT,OUTLIER_VALUE_LOWER,OUTLIER_VALUE_UPPER FROM ${dev} WHERE RUN_TYPE='MONTHLY'`,'PERIOD_SCOPE_MISMATCH');
scenario("DELETE FROM DQ_BASIC_REVIEW WHERE PERIOD_LEVEL='MONTHLY'",'MISSING_ENGINE');
scenario(`DELETE FROM ${dev} WHERE RUN_TYPE='MONTHLY'`,'MISSING_DEVELOPMENT');
scenario("INSERT INTO DQ_RUN_FIELD_CONFIG VALUES ('our','MISSING_FIELD','NUMERIC')",'MISSING_BOTH');
scenario(`UPDATE ${dev} SET POU_DT='2018-01-30' WHERE RUN_TYPE='MONTHLY'`,'SNAPSHOT_MISMATCH');
scenario(`UPDATE ${dev} SET ROW_COUNT=101`,'POPULATION_MISMATCH');
scenario('UPDATE DQ_BASIC_REVIEW SET TOTAL_COUNT=NULL','POPULATION_UNAVAILABLE','TOTAL_COUNT');
scenario(`UPDATE DQ_BASIC_REVIEW SET OUTLIER_COUNT=NULL,OUTLIER_VALID_COUNT=0;UPDATE ${dev} SET VALID_COUNT=0,OUTLIER_COUNT=0`,'DEFINITION_DIFFERENCE','OUTLIER_COUNT');
scenario("UPDATE DQ_RUN_LOG SET STATUS='FAILED'",'NOT_EVALUATED');
scenario("UPDATE DQ_RUN_LOG SET PROJECT_ID='OTHER'",'NOT_EVALUATED');
scenario("UPDATE DQ_MODULE_LOG SET STATUS='FAILED'",'NOT_EVALUATED');
scenario(`DELETE FROM ${dev}`,'NOT_EVALUATED');
scenario('', 'NOT_EVALUATED',null,sql.replace('CAST(1 AS BIGINT) AS DEV_RUN_ID','CAST(NULL AS BIGINT) AS DEV_RUN_ID'));
scenario("UPDATE DQ_RUN_LOG SET PROFILE_OVERALL='N',PROFILE_MONTHLY='N',PROFILE_YEARLY='Y'",'NOT_EVALUATED');
// Outliers-only review has no Basic totals. Do not demand absent Basic columns.
db.exec('SAVEPOINT outliers_only');
db.exec("DELETE FROM DQ_MODULE_LOG WHERE MODULE_NAME='NUMERIC_BASIC';UPDATE DQ_BASIC_REVIEW SET TOTAL_COUNT=NULL");
assert.equal(rows().length,10);assert(rows().every(r=>r.STATUS==='MATCH'));
db.exec('ROLLBACK TO outliers_only; RELEASE outliers_only');
// Exact count differences remain visible above the IEEE floating-point limit.
db.exec('SAVEPOINT exact_count');
db.exec(`UPDATE DQ_BASIC_REVIEW SET ZERO_COUNT=9007199254740993;UPDATE ${dev} SET ZERO_COUNT=9007199254740992`);
assert(rows().filter(r=>r.METRIC_NAME==='ZERO_COUNT').every(r=>r.STATUS==='DIFFERENT'&&r.DIFFERENCE===1n));
db.exec('ROLLBACK TO exact_count; RELEASE exact_count');
// Rows outside the selected fields, project or run do not multiply comparisons.
db.exec(`INSERT INTO ${dev} SELECT 1,'OTHER',RUN_TYPE,POU_DT,ROW_COUNT,MISSING_COUNT,MISSING_PCT,ZERO_COUNT,ZERO_PCT,MIN_VALUE,MAX_VALUE,MEAN_VALUE,STDDEV_VALUE,SPECIAL_COUNT,SPECIAL_PCT,VALID_COUNT,OUTLIER_COUNT,OUTLIER_PCT,OUTLIER_VALUE_LOWER,OUTLIER_VALUE_UPPER FROM ${dev};INSERT INTO DQ_BASIC_REVIEW SELECT 'other','OTHER',FIELD_NAME,FIELD_TYPE,PERIOD_LEVEL,POU_DT,${Object.keys(metrics).join(',')} FROM DQ_BASIC_REVIEW`);
assert.equal(rows().length,34);
console.log(`Review comparison passed: 34 field/period/metrics; ${scenarios} exception/rounding cases; fractions, output layout, Outliers-only selection and exact large counts. SQLite only; Teradata execution unverified.`);
db.close();

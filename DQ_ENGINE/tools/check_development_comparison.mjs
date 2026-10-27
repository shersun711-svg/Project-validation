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
assert.match(source,/FROM \(SELECT COUNT\(\*\) AS SEED_COUNT FROM DQ_DB\.DQ_RUN_NUMBER\) SEED/);
assert.equal((source.slice(source.indexOf('METRIC_MAP AS'),source.indexOf('ENABLED_METRICS AS')).match(/FROM PARAMS/g)||[]).length,17,'Every UNION metric branch must reference a table-backed seed');
const sql=source.replaceAll('DQ_DB.','')
 .replace(/EXTRACT\(YEAR FROM ([DR])\.POU_DT\)/g,(_,alias)=>`CAST(strftime('%Y',${alias}.POU_DT) AS INTEGER)`)
 .replace(/EXTRACT\(MONTH FROM ([DR])\.POU_DT\)/g,(_,alias)=>`CAST(strftime('%m',${alias}.POU_DT) AS INTEGER)`);
const db=new DatabaseSync(':memory:');
db.function('CHARACTER_LENGTH',v=>v?.length??null);
const metrics={TOTAL_COUNT:100,NON_MISSING_COUNT:90,MISSING_COUNT:10,MISSING_RATE:.1,
 ZERO_COUNT:5,ZERO_RATE:.05,MIN_VALUE:0,MAX_VALUE:50,MEAN_VALUE:10,STDDEV_VALUE:2,SPECIAL_COUNT:10,SPECIAL_RATE:.1,
 OUTLIER_LOWER_BOUND:4,OUTLIER_UPPER_BOUND:16,OUTLIER_COUNT:2,OUTLIER_RATE:.025,OUTLIER_VALID_COUNT:80};
db.exec(`CREATE TABLE DQ_RUN_LOG (RUN_ID TEXT, PROJECT_ID TEXT, STATUS TEXT, ATTEMPT_NO INTEGER,PROFILE_OVERALL TEXT,PROFILE_MONTHLY TEXT,PROFILE_YEARLY TEXT);
CREATE TABLE DQ_RUN_NUMBER (RUN_ID TEXT,RUN_NUMBER INTEGER);
CREATE TABLE DQ_RUN_FIELD_CONFIG (RUN_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT);
CREATE TABLE DQ_MODULE_LOG (RUN_ID TEXT,MODULE_NAME TEXT,ATTEMPT_NO INTEGER,BATCH_ID INTEGER,STATUS TEXT);
CREATE TABLE DQ_BASIC_REVIEW (RUN_NUMBER INTEGER,PROJECT_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT,PERIOD_LEVEL TEXT,POU_DT TEXT,
 ${Object.keys(metrics).map(name=>`${name} NUMERIC`).join(',')});
CREATE TABLE IRB_RDS_DQ_NUMERIC_PROFILE_RESULT (
 RUN_ID INTEGER,FIELD_NAME TEXT,RUN_TYPE TEXT,POU_DT TEXT,ROW_COUNT INTEGER,MISSING_COUNT INTEGER,MISSING_PCT NUMERIC,
 ZERO_COUNT INTEGER,ZERO_PCT NUMERIC,MIN_VALUE NUMERIC,MAX_VALUE NUMERIC,MEAN_VALUE NUMERIC,STDDEV_VALUE NUMERIC,
 SPECIAL_COUNT INTEGER,SPECIAL_PCT NUMERIC,VALID_COUNT INTEGER,OUTLIER_COUNT INTEGER,OUTLIER_PCT NUMERIC,
 OUTLIER_VALUE_LOWER NUMERIC,OUTLIER_VALUE_UPPER NUMERIC);
INSERT INTO DQ_RUN_LOG VALUES ('our','RDS','SUCCEEDED',1,'Y','Y','N');
INSERT INTO DQ_RUN_NUMBER VALUES ('our',17);
INSERT INTO DQ_RUN_FIELD_CONFIG VALUES ('our','AMOUNT','NUMERIC');
INSERT INTO DQ_MODULE_LOG VALUES ('our','NUMERIC_BASIC',1,0,'SUCCEEDED'),('our','NUMERIC_OUTLIERS',1,0,'SUCCEEDED');`);
for(const [level,date] of [['OVERALL',null],['MONTHLY','2018-01-31']]){
 const values=[17,'RDS','AMOUNT','NUMERIC',level,date,...Object.values(metrics)];
 db.prepare(`INSERT INTO DQ_BASIC_REVIEW VALUES (${values.map(()=>'?').join(',')})`).run(...values);
 db.prepare('INSERT INTO IRB_RDS_DQ_NUMERIC_PROFILE_RESULT VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
 .run(12,'AMOUNT',level,date,100,10,.1,5,.05,0,50,10,2,10,.1,80,2,.025,4,16);
}
const dev='IRB_RDS_DQ_NUMERIC_PROFILE_RESULT';
// All four selected MDT batches must exist; these three begin outside field scope.
for(const id of [13,14,15]) db.exec(`INSERT INTO ${dev} SELECT ${id},'BATCH_'||${id},RUN_TYPE,POU_DT,ROW_COUNT,MISSING_COUNT,MISSING_PCT,ZERO_COUNT,ZERO_PCT,MIN_VALUE,MAX_VALUE,MEAN_VALUE,STDDEV_VALUE,SPECIAL_COUNT,SPECIAL_PCT,VALID_COUNT,OUTLIER_COUNT,OUTLIER_PCT,OUTLIER_VALUE_LOWER,OUTLIER_VALUE_UPPER FROM ${dev} WHERE RUN_ID=12`);
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
scenario('', 'NOT_EVALUATED',null,sql.replace('CAST(12 AS BIGINT) AS DEV_RUN_ID','CAST(NULL AS BIGINT) AS DEV_RUN_ID'));
scenario("UPDATE DQ_RUN_LOG SET PROFILE_OVERALL='N',PROFILE_MONTHLY='N',PROFILE_YEARLY='Y'",'NOT_EVALUATED');
// Missing selected batches cannot be silently treated as a complete comparison.
scenario(`DELETE FROM ${dev} WHERE RUN_ID=14`,'NOT_EVALUATED');
scenario('', 'NOT_EVALUATED',null,sql.replace('CAST(15 AS BIGINT) AS DEV_RUN_ID','CAST(14 AS BIGINT) AS DEV_RUN_ID'));
// Each MDT field batch contributes values with its actual run ID.
db.exec('SAVEPOINT multi_batch');
for(const id of [13,14,15]){
 db.exec(`INSERT INTO DQ_RUN_FIELD_CONFIG VALUES ('our','BATCH_${id}','NUMERIC');
 INSERT INTO DQ_BASIC_REVIEW SELECT RUN_NUMBER,PROJECT_ID,'BATCH_${id}',FIELD_TYPE,PERIOD_LEVEL,POU_DT,${Object.keys(metrics).join(',')} FROM DQ_BASIC_REVIEW WHERE FIELD_NAME='AMOUNT'`);
}
const multi=rows();assert.equal(multi.length,136);assert(multi.every(r=>r.STATUS==='MATCH'));
for(const id of [12,13,14,15])assert(multi.filter(r=>r.FIELD_NAME===(id===12?'AMOUNT':`BATCH_${id}`)).every(r=>Number(r.DEV_RUN_ID)===id));
// Overlap across selected IDs must be flagged, even if saved metric values agree.
db.exec(`UPDATE ${dev} SET FIELD_NAME='AMOUNT' WHERE RUN_ID=13`);
const overlap=rows();assert(overlap.some(r=>r.FIELD_NAME==='AMOUNT'&&r.STATUS==='DUPLICATE_DEVELOPMENT'&&r.DEV_VALUE===null&&r.DEV_RUN_ID===null));
db.exec('ROLLBACK TO multi_batch; RELEASE multi_batch');
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
db.exec(`INSERT INTO ${dev} SELECT 1,'OTHER',RUN_TYPE,POU_DT,ROW_COUNT,MISSING_COUNT,MISSING_PCT,ZERO_COUNT,ZERO_PCT,MIN_VALUE,MAX_VALUE,MEAN_VALUE,STDDEV_VALUE,SPECIAL_COUNT,SPECIAL_PCT,VALID_COUNT,OUTLIER_COUNT,OUTLIER_PCT,OUTLIER_VALUE_LOWER,OUTLIER_VALUE_UPPER FROM ${dev};INSERT INTO DQ_BASIC_REVIEW SELECT 999,'OTHER',FIELD_NAME,FIELD_TYPE,PERIOD_LEVEL,POU_DT,${Object.keys(metrics).join(',')} FROM DQ_BASIC_REVIEW`);
assert.equal(rows().length,34);
console.log(`Review comparison passed: 34 field/period/metrics; ${scenarios} exception/rounding cases; fractions, output layout, Outliers-only selection and exact large counts. SQLite only; Teradata execution unverified.`);
db.close();

// Categorical comparison: the two engines have different missing/distinct definitions.
const catSource=fs.readFileSync(new URL('../tests/compare_categorical_development.sql',import.meta.url),'utf8');
const catExecutable=catSource.replace(/\/\*[\s\S]*?\*\//g,'');
assert(!/\b(CREATE|INSERT|UPDATE|DELETE|DROP|CALL|REPLACE)\b/i.test(catExecutable));
assert(!/VW_RDS_PHASE2_FACT|DQ_METRIC_RESULT|\/\s*100/.test(catExecutable));
assert.match(catSource,/FROM \(SELECT COUNT\(\*\) AS SEED_COUNT FROM DQ_DB\.DQ_RUN_NUMBER\) SEED/);
assert.equal((catSource.slice(catSource.indexOf('METRIC_MAP AS'),catSource.indexOf('ENABLED_METRICS AS')).match(/FROM PARAMS/g)||[]).length,7);
const catSQL=catSource.replaceAll('DQ_DB.','')
 .replace(/EXTRACT\(YEAR FROM ([DR])\.POU_DT\)/g,(_,alias)=>`CAST(strftime('%Y',${alias}.POU_DT) AS INTEGER)`)
 .replace(/EXTRACT\(MONTH FROM ([DR])\.POU_DT\)/g,(_,alias)=>`CAST(strftime('%m',${alias}.POU_DT) AS INTEGER)`);
const catDB=new DatabaseSync(':memory:');
catDB.function('CHARACTER_LENGTH',v=>v?.length??null);
catDB.exec(`CREATE TABLE DQ_RUN_LOG (RUN_ID TEXT,PROJECT_ID TEXT,STATUS TEXT,ATTEMPT_NO INTEGER,PROFILE_OVERALL TEXT,PROFILE_MONTHLY TEXT,PROFILE_YEARLY TEXT);
CREATE TABLE DQ_RUN_NUMBER (RUN_ID TEXT,RUN_NUMBER INTEGER);
CREATE TABLE DQ_RUN_FIELD_CONFIG (RUN_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT);
CREATE TABLE DQ_MODULE_LOG (RUN_ID TEXT,MODULE_NAME TEXT,ATTEMPT_NO INTEGER,BATCH_ID INTEGER,STATUS TEXT);
CREATE TABLE DQ_BASIC_REVIEW (RUN_NUMBER INTEGER,PROJECT_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT,PERIOD_LEVEL TEXT,POU_DT TEXT,
 TOTAL_COUNT INTEGER,NON_MISSING_COUNT INTEGER,MISSING_COUNT INTEGER,MISSING_RATE NUMERIC,SPECIAL_COUNT INTEGER,SPECIAL_RATE NUMERIC,DISTINCT_COUNT INTEGER);
CREATE TABLE IRB_RDS_DQ_CATEGORICAL_PROFILE_RESULT
 (RUN_ID INTEGER,FIELD_NAME TEXT,RUN_TYPE TEXT,POU_DT TEXT,ROW_COUNT INTEGER,MISSING_COUNT INTEGER,MISSING_PCT NUMERIC,
 BLANK_COUNT INTEGER,SPECIAL_COUNT INTEGER,SPECIAL_PCT NUMERIC,DISTINCT_COUNT INTEGER);
INSERT INTO DQ_RUN_LOG VALUES ('cat','RDS','SUCCEEDED',1,'Y','Y','N');
INSERT INTO DQ_RUN_NUMBER VALUES ('cat',18);
INSERT INTO DQ_RUN_FIELD_CONFIG VALUES ('cat','CATEGORY','CATEGORICAL');
INSERT INTO DQ_MODULE_LOG VALUES ('cat','CATEGORICAL_BASIC',1,0,'SUCCEEDED');`);
const catDev='IRB_RDS_DQ_CATEGORICAL_PROFILE_RESULT';
for(const [level,date] of [['OVERALL',null],['MONTHLY','2018-01-31']]){
 catDB.prepare('INSERT INTO DQ_BASIC_REVIEW VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(18,'RDS','CATEGORY','CATEGORICAL',level,date,100,90,10,.1,0,0,3);
 catDB.prepare(`INSERT INTO ${catDev} VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(1,'CATEGORY',level,date,100,10,.1,0,0,0,3);
}
const catRows=(query=catSQL)=>{const stmt=catDB.prepare(query);stmt.setReadBigInts(true);return stmt.all();};
assert.equal(catRows().length,14);assert(catRows().every(r=>r.STATUS==='MATCH'&&Number(r.DIFFERENCE)===0));
let catScenarios=0;
function catCase(change,check){catDB.exec('SAVEPOINT cat_case');try{catDB.exec(change);check(catRows());catScenarios++;}finally{catDB.exec('ROLLBACK TO cat_case; RELEASE cat_case');}}
catCase(`UPDATE ${catDev} SET BLANK_COUNT=5,MISSING_COUNT=15,MISSING_PCT=.15`,rows=>{
 const affected=rows.filter(r=>['NON_MISSING_COUNT','MISSING_COUNT','MISSING_RATE'].includes(r.METRIC_NAME));
 assert.equal(affected.length,6);assert(affected.every(r=>r.STATUS==='DEFINITION_DIFFERENCE'));
 assert(rows.filter(r=>r.METRIC_NAME==='MISSING_COUNT').every(r=>r.DEV_VALUE===15n&&r.OUR_VALUE===10n&&r.DIFFERENCE===-5n));
 assert(rows.filter(r=>r.METRIC_NAME==='TOTAL_COUNT').every(r=>r.STATUS==='MATCH'));
});
catCase(`UPDATE ${catDev} SET SPECIAL_COUNT=4,SPECIAL_PCT=.04,DISTINCT_COUNT=4;UPDATE DQ_BASIC_REVIEW SET SPECIAL_COUNT=4,SPECIAL_RATE=.04`,rows=>{
 assert(rows.filter(r=>r.METRIC_NAME==='DISTINCT_COUNT').every(r=>r.STATUS==='DEFINITION_DIFFERENCE'));
 assert(rows.filter(r=>r.METRIC_NAME==='SPECIAL_COUNT').every(r=>r.STATUS==='MATCH'));
});
catCase(`UPDATE ${catDev} SET DISTINCT_COUNT=4`,rows=>assert(rows.some(r=>r.METRIC_NAME==='DISTINCT_COUNT'&&r.STATUS==='DIFFERENT')));
catCase(`UPDATE ${catDev} SET BLANK_COUNT=NULL`,rows=>assert(rows.some(r=>r.METRIC_NAME==='MISSING_COUNT'&&r.STATUS==='NOT_EVALUATED')));
catCase(`UPDATE DQ_BASIC_REVIEW SET SPECIAL_COUNT=NULL`,rows=>assert(rows.some(r=>r.METRIC_NAME==='DISTINCT_COUNT'&&r.STATUS==='NOT_EVALUATED')));
catCase(`UPDATE ${catDev} SET SPECIAL_PCT=.000001`,rows=>assert(rows.filter(r=>r.METRIC_NAME==='SPECIAL_RATE').every(r=>r.STATUS==='MATCH')));
catCase(`UPDATE ${catDev} SET SPECIAL_PCT=.000002`,rows=>assert(rows.some(r=>r.METRIC_NAME==='SPECIAL_RATE'&&r.STATUS==='DIFFERENT')));
for(const [change,status] of [
 ['INSERT INTO DQ_BASIC_REVIEW SELECT * FROM DQ_BASIC_REVIEW','DUPLICATE_ENGINE'],
 [`INSERT INTO ${catDev} SELECT * FROM ${catDev}`,'DUPLICATE_DEVELOPMENT'],
 [`UPDATE ${catDev} SET POU_DT='2018-01-30' WHERE RUN_TYPE='MONTHLY'`,'SNAPSHOT_MISMATCH'],
 [`INSERT INTO ${catDev} SELECT RUN_ID,FIELD_NAME,RUN_TYPE,'2018-01-15',ROW_COUNT,MISSING_COUNT,MISSING_PCT,BLANK_COUNT,SPECIAL_COUNT,SPECIAL_PCT,DISTINCT_COUNT FROM ${catDev} WHERE RUN_TYPE='MONTHLY'`,'PERIOD_SCOPE_MISMATCH'],
 [`DELETE FROM ${catDev} WHERE RUN_TYPE='MONTHLY'`,'MISSING_DEVELOPMENT'],
 ["DELETE FROM DQ_BASIC_REVIEW WHERE PERIOD_LEVEL='MONTHLY'",'MISSING_ENGINE'],
 ["INSERT INTO DQ_RUN_FIELD_CONFIG VALUES ('cat','MISSING','CATEGORICAL')",'MISSING_BOTH'],
 [`UPDATE ${catDev} SET ROW_COUNT=101`,'POPULATION_MISMATCH'],
 ["UPDATE DQ_RUN_LOG SET STATUS='RUNNING'",'NOT_EVALUATED'],
 ["UPDATE DQ_MODULE_LOG SET STATUS='FAILED'",'NOT_EVALUATED'],
 ["UPDATE DQ_RUN_FIELD_CONFIG SET FIELD_TYPE='NUMERIC'",'NOT_EVALUATED'],
 [`DELETE FROM ${catDev}`,'NOT_EVALUATED']
])catCase(change,rows=>assert(rows.some(r=>r.STATUS===status)));
catCase(`UPDATE DQ_BASIC_REVIEW SET DISTINCT_COUNT=9007199254740993;UPDATE ${catDev} SET DISTINCT_COUNT=9007199254740992`,rows=>assert(rows.filter(r=>r.METRIC_NAME==='DISTINCT_COUNT').every(r=>r.STATUS==='DIFFERENT'&&r.DIFFERENCE===1n)));
assert.equal(catRows(catSQL.replace("CAST('Y' AS CHAR(1)) AS SHOW_MATCHES","CAST('N' AS CHAR(1)) AS SHOW_MATCHES")).length,0);
console.log(`Categorical comparison passed: 14 field/period/metrics; ${catScenarios} definition/exception cases. Saved values preserved; SQLite only, Teradata execution unverified.`);
catDB.close();

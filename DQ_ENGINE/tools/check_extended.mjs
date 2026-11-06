/* Developer-only generated Basic special-value aggregate and persistence checks.
   SQLite dialect adaptations do not compile Teradata SPL or execute SAS. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync}from'node:sqlite';
import {numericParts,assignment,evaluate}from'./check_static.mjs';
const adapt=q=>q.replaceAll('DQ_DB.','').replaceAll('CURRENT_TIMESTAMP(6)','CURRENT_TIMESTAMP');
const dates=['2000-01-31','2000-01-31','2000-01-31','2000-01-31','2000-02-29','2000-02-29',null,null];
const amounts=[-999,0,10,20,999.99,null,10,null];
const raw=dates.map((d,i)=>[d,amounts[i]]);
/* Execute actual Basic source projections/aggregates, including cleaned
   distribution values, without adapting those SQL expressions. */
const basics=new DatabaseSync(':memory:');basics.exec("ATTACH DATABASE ':memory:' AS SOURCE");
basics.aggregate('STDDEV_POP',{start:()=>({n:0,mean:0,m2:0}),step:(s,x)=>{if(x!==null){s.n++;const d=x-s.mean;s.mean+=d/s.n;s.m2+=d*(x-s.mean);}return s;},result:s=>s.n===0?null:Math.sqrt(s.m2/s.n)});
basics.exec('CREATE TABLE SOURCE.FIXTURE (FACT_DT TEXT,AMOUNT NUMERIC,CATEGORY TEXT)');
const categories=['unknown','A','B','NA','? ',null,'MISSING',null];raw.forEach((r,i)=>basics.prepare('INSERT INTO SOURCE.FIXTURE VALUES (?,?,?)').run(r[0],r[1],categories[i]));
const basic=fs.readFileSync(new URL('../teradata/modules/10_numeric_basic.sql',import.meta.url),'utf8').replace(/SET (\w+)=/g,'SET $1 =');
let bv={V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT',V_PROJECTION:'',V_FIELD:'S.DQ_F1',V_CLEAN:'S.DQ_C1',V_SUFFIX:'1',
 V_SPECIAL_LIST:'(-999.0000000000,999.9900000000)','F.FIELD_NAME':'AMOUNT'};
numericParts(bv,basic);bv.V_SOURCE_PROJECTION+=bv.V_SOURCE_PART;bv.V_PROJECTION+=bv.V_METRIC_PART;
const num=basics.prepare('SELECT NULL AS POU_DT,COUNT(*) AS TOTAL_N'+bv.V_PROJECTION.replaceAll('CAST(S.DQ_DT AS DATE)','date(S.DQ_DT)')+' FROM (SELECT '+bv.V_SOURCE_PROJECTION+' FROM SOURCE.FIXTURE) S').get();
assert.equal(num.TOTAL_N,8);assert.equal(num.N1,6);assert.equal(num.V1,4);assert.equal(num.N1-num.V1,2);assert.equal(num.Z1,1);
assert.equal(num.LO1,0);assert.equal(num.HI1,20);assert.equal(num.AV1,10);assert.ok(Math.abs(num.SD1-Math.sqrt(50))<1e-12);
const other=fs.readFileSync(new URL('../teradata/modules/15_other_basic.sql',import.meta.url),'utf8').replace(/SET (\w+)=/g,'SET $1 =');
const oc=other.indexOf('FOR F AS');bv={V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT',V_PROJECTION:'',V_FIELD:'S.DQ_F1',V_DISTINCT:'S.DQ_C1',V_SUFFIX:'1',
 V_SPECIAL_LIST:"('UNKNOWN','N/A','NA','NULL','NONE','-','?','#N/A','.','MISSING','NOT APPLICABLE')",'F.FIELD_NAME':'CATEGORY'};
bv.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',oc,other),bv);
const sc=other.indexOf("IF P_TYPE='CATEGORICAL' THEN",oc);
bv.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',sc,other),bv);bv.V_PROJECTION=evaluate(assignment('V_PROJECTION',sc,other),bv);
bv.V_PROJECTION=evaluate(assignment('V_PROJECTION',other.indexOf('            ELSE\n',oc),other),bv);
const cat=basics.prepare('SELECT NULL AS POU_DT,COUNT(*) AS TOTAL_N'+bv.V_PROJECTION.replaceAll('CAST(S.DQ_DT AS DATE)','date(S.DQ_DT)')+' FROM (SELECT '+bv.V_SOURCE_PROJECTION+' FROM SOURCE.FIXTURE) S').get();
assert.equal(cat.TOTAL_N,8);assert.equal(cat.N1,6);assert.equal(cat.V1,2);assert.equal(cat.N1-cat.V1,4);assert.equal(cat.D1,2);
basics.close();console.log('Generated Basic aggregates passed: special counts, unchanged NULL counts, numeric statistics and categorical distinct exclusions.');

/* Persist the generated Basic CASE branches; catch misassigned metric ordinals
   or denominators rather than checking only the aggregate expressions. */
const persist=new DatabaseSync(':memory:');
persist.exec(`CREATE TABLE DQ_METRIC_DEFINITION (MODULE_NAME TEXT,METRIC_ORDINAL INTEGER,METRIC_NAME TEXT,IS_PERCENTAGE TEXT);
 CREATE TABLE DQ_METRIC_RESULT (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT,MODULE_NAME TEXT,
 PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,METRIC_NAME TEXT,METRIC_VALUE NUMERIC,IS_PERCENTAGE TEXT,
 RATE_NUMERATOR INTEGER,RATE_DENOMINATOR INTEGER,POU_DT TEXT,EXECUTION_TIMESTAMP TEXT);
 CREATE TABLE DQ_NB_AGG (DQ_YEAR INTEGER,DQ_MONTH INTEGER,GY INTEGER,GM INTEGER,TOTAL_N INTEGER,
 N1 INTEGER,Z1 INTEGER,LO1 NUMERIC,HI1 NUMERIC,AV1 NUMERIC,SD1 NUMERIC,V1 INTEGER,POU_DT TEXT);
 CREATE TABLE DQ_OB_AGG (DQ_YEAR INTEGER,DQ_MONTH INTEGER,GY INTEGER,GM INTEGER,TOTAL_N INTEGER,N1 INTEGER,D1 INTEGER,V1 INTEGER,POU_DT TEXT);`);
const metadata=fs.readFileSync(new URL('../teradata/setup/00_create_config_tables.sql',import.meta.url),'utf8')
 +fs.readFileSync(new URL('../teradata/setup/09_add_basic_metrics.sql',import.meta.url),'utf8')
 +fs.readFileSync(new URL('../teradata/setup/12_add_date_basic_metrics.sql',import.meta.url),'utf8');
for(const [,module,ordinal,name,pct]of metadata.matchAll(/VALUES \('(NUMERIC_BASIC|CATEGORICAL_BASIC|DATE_BASIC|IDENTIFIER_BASIC)',(\d+),'([^']+)','([YN])'\)/g))persist.prepare('INSERT INTO DQ_METRIC_DEFINITION VALUES (?,?,?,?)').run(module,+ordinal,name,pct);
persist.prepare('INSERT INTO DQ_NB_AGG VALUES (NULL,NULL,1,1,?,?,?,?,?,?,?,?,NULL)').run(num.TOTAL_N,num.N1,num.Z1,num.LO1,num.HI1,num.AV1,num.SD1,num.V1);
persist.prepare('INSERT INTO DQ_OB_AGG VALUES (NULL,NULL,1,1,?,?,?,?,NULL)').run(cat.TOTAL_N,cat.N1,cat.D1,cat.V1);
persist.function('CHARACTER_LENGTH',x=>x?.length??null);
const pv={P_RUN_ID:'30000000-0000-4000-8000-000000000001',P_PROJECT_ID:'DQ_EXT_TEST',V_SUFFIX:'1','R.FIELD_NAME':'AMOUNT'};
persist.exec(adapt(evaluate(assignment('V_SQL',basic.indexOf('FOR R AS'),basic),pv)));
pv['R.FIELD_NAME']='CATEGORY';pv.P_TYPE='CATEGORICAL';pv.V_MODULE='CATEGORICAL_BASIC';pv.V_METRICS=5;
for(const part of ['V_PERIOD_LEVEL','V_PERIOD_VALUE'])pv[part]=evaluate(assignment(part,0,other),pv);
const rc=other.indexOf('FOR R AS'),special=other.indexOf("IF P_TYPE='CATEGORICAL' THEN",rc);
for(const part of ['V_EXTRA_CASE','V_NUMERATOR','V_DENOMINATOR'])pv[part]=evaluate(assignment(part,special,other),pv);
persist.exec(adapt(evaluate(assignment('V_SQL',other.indexOf('            ELSE\n',rc),other),pv)));
for(const [field,expectedCount,specialN,distinct]of [['AMOUNT',12,2,null],['CATEGORY',5,4,2]]){
 const rows=persist.prepare('SELECT * FROM DQ_METRIC_RESULT WHERE FIELD_NAME=?').all(field);assert.equal(rows.length,expectedCount);
 const get=n=>rows.find(r=>r.METRIC_NAME===n);
 assert.equal(get('SPECIAL_COUNT').METRIC_VALUE,specialN);
 assert.equal(get('SPECIAL_RATE_PCT').METRIC_VALUE,100*specialN/8);
 assert.equal(get('SPECIAL_RATE_PCT').RATE_NUMERATOR,specialN);assert.equal(get('SPECIAL_RATE_PCT').RATE_DENOMINATOR,8);
 assert.equal(get('MISSING_RATE_PCT').METRIC_VALUE,25);assert.equal(get('MISSING_COUNT').METRIC_VALUE,2);
 if(distinct!==null)assert.equal(get('DISTINCT_COUNT').METRIC_VALUE,distinct);
}
// Execute actual date persistence for every Basic type and period shape.
for(const [year,month,gy,gm,date,expected]of [[2000,1,0,0,'2000-01-27','2000-01-27'],[2000,null,0,1,'2000-12-21','2000-12-21'],[null,null,0,0,null,null],[null,null,1,1,'2000-12-21',null]]){
 persist.exec('DELETE FROM DQ_METRIC_RESULT');
 for(const table of ['DQ_NB_AGG','DQ_OB_AGG'])persist.prepare('UPDATE '+table+' SET DQ_YEAR=?,DQ_MONTH=?,GY=?,GM=?,POU_DT=?').run(year,month,gy,gm,date);
 pv['R.FIELD_NAME']='AMOUNT';persist.exec(adapt(evaluate(assignment('V_SQL',basic.indexOf('FOR R AS'),basic),pv)));
 for(const type of ['CATEGORICAL','DATE','IDENTIFIER']){
  Object.assign(pv,{P_TYPE:type,V_MODULE:type+'_BASIC',V_METRICS:type==='CATEGORICAL'?5:type==='DATE'?4:3,'R.FIELD_NAME':type});
  if(type==='CATEGORICAL')for(const part of ['V_EXTRA_CASE','V_NUMERATOR','V_DENOMINATOR'])pv[part]=evaluate(assignment(part,special,other),pv);
  else Object.assign(pv,{V_EXTRA_CASE:'',V_NUMERATOR:'CASE WHEN M.METRIC_ORDINAL=2 THEN A.TOTAL_N-A.N1 ELSE NULL END,',V_DENOMINATOR:'CASE WHEN M.METRIC_ORDINAL=2 THEN A.TOTAL_N ELSE NULL END,'});
  const start=type==='DATE'?other.indexOf("IF P_TYPE='DATE' THEN",rc):other.indexOf('            ELSE\n',rc);
  persist.exec(adapt(evaluate(assignment('V_SQL',start,other),pv)));
 }
 const dates=persist.prepare('SELECT POU_DT FROM DQ_METRIC_RESULT').all();
 assert.equal(dates.length,24);for(const row of dates)assert.equal(row.POU_DT,expected);
}
persist.close();console.log('Generated Basic persistence passed: all 12 numeric and 5 categorical metric branches and exact special-rate numerator/denominator.');

/* Execute generated percentile SELECT/INSERT logic in SQLite after narrow
   dialect adaptations. This is not Teradata SPL compilation or SAS execution. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {assignment,evaluate,lex} from './check_static.mjs';
const sql=fs.readFileSync(new URL('../teradata/modules/11_numeric_percentiles.sql',import.meta.url),'utf8').replace(/SET (\w+)=/g,'SET $1 =');
const v={V_DB:'SOURCE',V_SOURCE:'FIXTURE',V_DATE:'FACT_DT',V_LIST:'(-999.0000000000,999.9900000000)',
 P_RUN_ID:'30000000-0000-4000-8000-000000000001',P_PROJECT_ID:'DQ_EXT_TEST'};
v.V_YEAR=evaluate(assignment('V_YEAR',0,sql),v);v.V_MONTH=evaluate(assignment('V_MONTH',0,sql),v);
const adapt=q=>q.replaceAll('DQ_DB.','').replaceAll('CURRENT_TIMESTAMP(6)','CURRENT_TIMESTAMP')
 .replace(/EXTRACT\(YEAR FROM DQ_DT\)/g,"CAST(strftime('%Y',DQ_DT) AS INTEGER)")
 .replace(/EXTRACT\(MONTH FROM DQ_DT\)/g,"CAST(strftime('%m',DQ_DT) AS INTEGER)")
 .replace(/CAST\("FACT_DT" AS DATE\)/g,'date("FACT_DT")');
const db=new DatabaseSync(':memory:');db.function('CHARACTER_LENGTH',x=>x?.length??null);db.exec("ATTACH DATABASE ':memory:' AS SOURCE");
const fields=['AMOUNT','ALL_NULL','ALL_SPECIAL','SINGLE_VALUE','CONSTANT_VALUE'];
db.exec('CREATE TABLE SOURCE.FIXTURE (FACT_DT TEXT,'+fields.map(f=>'"'+f+'" NUMERIC').join(',')+')');
db.exec(`CREATE TABLE DQ_METRIC_DEFINITION (MODULE_NAME TEXT,METRIC_ORDINAL INTEGER,METRIC_NAME TEXT);
 CREATE TABLE DQ_METRIC_RESULT (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT,
 MODULE_NAME TEXT,PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,METRIC_NAME TEXT,METRIC_VALUE NUMERIC,
 IS_PERCENTAGE TEXT,EXECUTION_TIMESTAMP TEXT);`);
const probs=[.01,.05,.25,.50,.75,.95,.99],names=['P1','P5','P25','P50','P75','P95','P99'];
names.forEach((n,i)=>db.prepare('INSERT INTO DQ_METRIC_DEFINITION VALUES (?,?,?)').run('NUMERIC_PERCENTILES',i+1,n));
const dates=['2000-01-31','2000-01-31','2000-01-31','2000-01-31','2000-02-29','2000-02-29',null,null];
const amounts=[-999,0,10,20,999.99,null,10,null];
const raw=dates.map((d,i)=>[d,amounts[i],null,-999,i===0?5:null,7]);
const ins=db.prepare('INSERT INTO SOURCE.FIXTURE VALUES (?,?,?,?,?,?)');raw.forEach(r=>ins.run(...r));
function ctas(q,name){lex(q,'generated '+name);assert.ok(q.length<32000);const begin=q.indexOf(' AS (')+5,end=q.lastIndexOf(') WITH DATA');assert.ok(begin>=5&&end>begin);db.exec('CREATE TABLE '+name+' AS '+adapt(q.slice(begin,end)));}
const cursor=sql.indexOf('FOR F AS');
v.V_PROJECTION='CAST("FACT_DT" AS DATE) AS DQ_DT';
for(const [i,name]of fields.entries()){
 v['F.FIELD_NAME']=name;v['F.FIELD_ORDINAL']=i+1;
 v.V_PROJECTION=evaluate(assignment('V_PROJECTION',cursor,sql),v);
}
const sourceQuery=evaluate(assignment('V_SQL',cursor,sql),v);assert.equal((sourceQuery.match(/FROM "SOURCE"\."FIXTURE"/g)||[]).length,1);
ctas(sourceQuery,'DQ_NP_SOURCE');
ctas(evaluate(assignment('V_SQL',sql.indexOf('/* Domain'),sql),v),'DQ_NP_PERIOD');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_NP_PERIOD').get().n,6);
const results=sql.indexOf('FOR R AS');
const insertAt=sql.indexOf('/* h is calculated');
for(const [i,name]of fields.entries()){
 v['R.FIELD_NAME']=name;v.V_FIELD='DQ_C'+(i+1);
 for(const part of ['V_OVERALL','V_YEARLY','V_MONTHLY'])v[part]=evaluate(assignment(part,results,sql),v);
 ctas(evaluate(assignment('V_SQL',results,sql),v),'DQ_NP_ORDERED');
 const insert=evaluate(assignment('V_SQL',insertAt,sql),v);lex(insert,'percentile persistence');db.exec(adapt(insert));
 db.exec('DROP TABLE DQ_NP_ORDERED');
}
const rows=db.prepare('SELECT * FROM DQ_METRIC_RESULT').all();assert.equal(rows.length,210);
const periodMatches=(row,p)=>p.PERIOD_LEVEL==='OVERALL'||(p.PERIOD_LEVEL==='YEARLY'?(row[0]?.slice(0,4)??'UNKNOWN')===p.PERIOD_VALUE:(row[0]?.slice(0,7)??'UNKNOWN')===p.PERIOD_VALUE);
for(const row of rows){
 const fieldIndex=fields.indexOf(row.FIELD_NAME)+1;
 const values=raw.filter(r=>periodMatches(r,row)).map(r=>r[fieldIndex]).filter(x=>x!==null&&x!==-999&&x!==999.99).sort((a,b)=>a-b);
 let expected=null;if(values.length){const h=(values.length-1)*probs[names.indexOf(row.METRIC_NAME)];const low=Math.floor(h),high=Math.ceil(h);expected=values[low]+(h-low)*(values[high]-values[low]);}
 if(expected===null)assert.equal(row.METRIC_VALUE,null);else assert.ok(Math.abs(row.METRIC_VALUE-expected)<1e-9,JSON.stringify(row));
}
// Empty source retains seven NULL quantiles for each selected field's OVERALL.
db.exec('DELETE FROM SOURCE.FIXTURE; DROP TABLE DQ_NP_SOURCE; DROP TABLE DQ_NP_PERIOD; DELETE FROM DQ_METRIC_RESULT;');
ctas(sourceQuery,'DQ_NP_SOURCE');ctas(evaluate(assignment('V_SQL',sql.indexOf('/* Domain'),sql),v),'DQ_NP_PERIOD');
v.V_FIELD='DQ_C1';v['R.FIELD_NAME']='AMOUNT';for(const part of ['V_OVERALL','V_YEARLY','V_MONTHLY'])v[part]=evaluate(assignment(part,results,sql),v);
ctas(evaluate(assignment('V_SQL',results,sql),v),'DQ_NP_ORDERED');db.exec(adapt(evaluate(assignment('V_SQL',insertAt,sql),v)));
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_METRIC_RESULT WHERE METRIC_VALUE IS NULL AND PERIOD_LEVEL=\'OVERALL\'').get().n,7);
db.close();console.log('Generated percentile logic passed: 210 field/period/quantile results, NULL dates, specials, all-NULL/all-special, singleton, constants and empty population. Teradata/SAS NOT executed.');

/* Execute actual Basic source projections/aggregates, including cleaned
   distribution values, without adapting those SQL expressions. */
const basics=new DatabaseSync(':memory:');basics.exec("ATTACH DATABASE ':memory:' AS SOURCE");
basics.aggregate('STDDEV_SAMP',{start:()=>({n:0,mean:0,m2:0}),step:(s,x)=>{if(x!==null){s.n++;const d=x-s.mean;s.mean+=d/s.n;s.m2+=d*(x-s.mean);}return s;},result:s=>s.n<2?null:Math.sqrt(s.m2/(s.n-1))});
basics.exec('CREATE TABLE SOURCE.FIXTURE (FACT_DT TEXT,AMOUNT NUMERIC,CATEGORY TEXT)');
const categories=['unknown','A','B','NA','? ',null,'MISSING',null];raw.forEach((r,i)=>basics.prepare('INSERT INTO SOURCE.FIXTURE VALUES (?,?,?)').run(r[0],r[1],categories[i]));
const basic=fs.readFileSync(new URL('../teradata/modules/10_numeric_basic.sql',import.meta.url),'utf8').replace(/SET (\w+)=/g,'SET $1 =');
let bv={V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT',V_PROJECTION:'',V_FIELD:'S.DQ_F1',V_CLEAN:'S.DQ_C1',V_SUFFIX:'1',
 V_SPECIAL_LIST:'(-999.0000000000,999.9900000000)','F.FIELD_NAME':'AMOUNT'};
const bc=basic.indexOf('FOR F AS');bv.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',bc,basic),bv);
bv.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',basic.indexOf('IF CHARACTER_LENGTH(V_SOURCE_PROJECTION)'),basic),bv);
bv.V_PROJECTION=evaluate(assignment('V_PROJECTION',bc,basic),bv);
const num=basics.prepare('SELECT COUNT(*) AS TOTAL_N'+bv.V_PROJECTION.replaceAll('CAST(S.DQ_DT AS DATE)','date(S.DQ_DT)')+' FROM (SELECT '+bv.V_SOURCE_PROJECTION+' FROM SOURCE.FIXTURE) S').get();
assert.equal(num.TOTAL_N,8);assert.equal(num.N1,6);assert.equal(num.V1,4);assert.equal(num.N1-num.V1,2);assert.equal(num.Z1,1);
assert.equal(num.LO1,0);assert.equal(num.HI1,20);assert.equal(num.AV1,10);assert.ok(Math.abs(num.SD1-Math.sqrt(200/3))<1e-12);
const other=fs.readFileSync(new URL('../teradata/modules/15_other_basic.sql',import.meta.url),'utf8').replace(/SET (\w+)=/g,'SET $1 =');
const oc=other.indexOf('FOR F AS');bv={V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT',V_PROJECTION:'',V_FIELD:'S.DQ_F1',V_DISTINCT:'S.DQ_C1',V_SUFFIX:'1',
 V_SPECIAL_LIST:"('UNKNOWN','N/A','NA','NULL','NONE','-','?','#N/A','.','MISSING','NOT APPLICABLE')",'F.FIELD_NAME':'CATEGORY'};
bv.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',oc,other),bv);
const sc=other.indexOf("IF P_TYPE='CATEGORICAL' THEN",oc);
bv.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',sc,other),bv);bv.V_PROJECTION=evaluate(assignment('V_PROJECTION',sc,other),bv);
bv.V_PROJECTION=evaluate(assignment('V_PROJECTION',other.indexOf('            ELSE\n',oc),other),bv);
const cat=basics.prepare('SELECT COUNT(*) AS TOTAL_N'+bv.V_PROJECTION.replaceAll('CAST(S.DQ_DT AS DATE)','date(S.DQ_DT)')+' FROM (SELECT '+bv.V_SOURCE_PROJECTION+' FROM SOURCE.FIXTURE) S').get();
assert.equal(cat.TOTAL_N,8);assert.equal(cat.N1,6);assert.equal(cat.V1,2);assert.equal(cat.N1-cat.V1,4);assert.equal(cat.D1,2);
basics.close();console.log('Generated Basic aggregates passed: special counts, unchanged NULL counts, numeric statistics and categorical distinct exclusions.');

/* Persist the generated Basic CASE branches; catch misassigned metric ordinals
   or denominators rather than checking only the aggregate expressions. */
const persist=new DatabaseSync(':memory:');
persist.exec(`CREATE TABLE DQ_METRIC_DEFINITION (MODULE_NAME TEXT,METRIC_ORDINAL INTEGER,METRIC_NAME TEXT,IS_PERCENTAGE TEXT);
 CREATE TABLE DQ_METRIC_RESULT (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT,MODULE_NAME TEXT,
 PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,METRIC_NAME TEXT,METRIC_VALUE NUMERIC,IS_PERCENTAGE TEXT,
 RATE_NUMERATOR INTEGER,RATE_DENOMINATOR INTEGER,EXECUTION_TIMESTAMP TEXT);
 CREATE TABLE DQ_NB_AGG (DQ_YEAR INTEGER,DQ_MONTH INTEGER,GY INTEGER,GM INTEGER,TOTAL_N INTEGER,
 N1 INTEGER,Z1 INTEGER,LO1 NUMERIC,HI1 NUMERIC,AV1 NUMERIC,SD1 NUMERIC,V1 INTEGER);
 CREATE TABLE DQ_OB_AGG (DQ_YEAR INTEGER,DQ_MONTH INTEGER,GY INTEGER,GM INTEGER,TOTAL_N INTEGER,N1 INTEGER,D1 INTEGER,V1 INTEGER);`);
const metadata=fs.readFileSync(new URL('../teradata/setup/00_create_config_tables.sql',import.meta.url),'utf8')
 +fs.readFileSync(new URL('../teradata/setup/09_add_basic_metrics.sql',import.meta.url),'utf8');
for(const [,module,ordinal,name,pct]of metadata.matchAll(/VALUES \('(NUMERIC_BASIC|CATEGORICAL_BASIC)',(\d+),'([^']+)','([YN])'\)/g))persist.prepare('INSERT INTO DQ_METRIC_DEFINITION VALUES (?,?,?,?)').run(module,+ordinal,name,pct);
persist.prepare('INSERT INTO DQ_NB_AGG VALUES (NULL,NULL,1,1,?,?,?,?,?,?,?,?)').run(num.TOTAL_N,num.N1,num.Z1,num.LO1,num.HI1,num.AV1,num.SD1,num.V1);
persist.prepare('INSERT INTO DQ_OB_AGG VALUES (NULL,NULL,1,1,?,?,?,?)').run(cat.TOTAL_N,cat.N1,cat.D1,cat.V1);
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
persist.close();console.log('Generated Basic persistence passed: all 12 numeric and 5 categorical metric branches and exact special-rate numerator/denominator.');

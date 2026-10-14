/* Generated Outlier SQL on synthetic SQLite data. Independent population statistics
   supply the reference; this is not Teradata SPL or SAS execution. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync}from'node:sqlite';
import {assignment,evaluate,lex}from'./check_static.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('teradata/modules/12_numeric_outliers.sql').replace(/SET (\w+)=/g,'SET $1 =');
const fields=['AMOUNT','BOUNDARY','CONSTANT_VALUE','SINGLE_VALUE','ALL_NULL','ALL_SPECIAL'];
const raw=Array.from({length:40},(_,i)=>[i<33?'2000-01-31':i<37?'2000-02-29':null,
 i===0?-4:i===1?4:i<33?0:i<37?-9999:null,
 i===0?-3:i===1?3:i<18?0:null,7,i===0?5:null,null,-9999]);
const db=new DatabaseSync(':memory:');db.exec("ATTACH DATABASE ':memory:' AS SOURCE");
db.function('CHARACTER_LENGTH',x=>x?.length??null);
db.exec('CREATE TABLE SOURCE.FIXTURE (FACT_DT TEXT,'+fields.map(f=>'"'+f+'" NUMERIC').join(',')+')');
const insert=db.prepare('INSERT INTO SOURCE.FIXTURE VALUES (?,?,?,?,?,?,?)');raw.forEach(r=>insert.run(...r));
db.exec(`CREATE TABLE DQ_RUN_FIELD_CONFIG (RUN_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT,FIELD_ORDINAL INTEGER);
 CREATE TABLE DQ_NUMERIC_STATISTICS (RUN_ID TEXT,FIELD_NAME TEXT,PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,TOTAL_COUNT INTEGER,VALID_COUNT INTEGER,MEAN_VALUE NUMERIC,STDDEV_VALUE NUMERIC);
 CREATE TABLE DQ_METRIC_DEFINITION (MODULE_NAME TEXT,METRIC_ORDINAL INTEGER,METRIC_NAME TEXT,IS_PERCENTAGE TEXT);
 CREATE TABLE DQ_METRIC_RESULT (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT,MODULE_NAME TEXT,
 PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,METRIC_NAME TEXT,METRIC_VALUE NUMERIC,IS_PERCENTAGE TEXT,
 RATE_NUMERATOR INTEGER,RATE_DENOMINATOR INTEGER,EXECUTION_TIMESTAMP TEXT,
 UNIQUE(RUN_ID,FIELD_NAME,MODULE_NAME,PERIOD_LEVEL,PERIOD_VALUE,METRIC_NAME));`);
const id='40000000-0000-4000-8000-000000000001';fields.forEach((name,i)=>db.prepare('INSERT INTO DQ_RUN_FIELD_CONFIG VALUES (?,?,?,?)').run(id,name,'NUMERIC',i+1));
for(const [,ordinal,name,pct]of read('teradata/setup/16_create_outlier_support.sql').matchAll(/VALUES \('NUMERIC_OUTLIERS',(\d+),'([^']+)','([YN])'\)/g))db.prepare('INSERT INTO DQ_METRIC_DEFINITION VALUES (?,?,?,?)').run('NUMERIC_OUTLIERS',+ordinal,name,pct);
const outlierDefinitions=db.prepare("SELECT METRIC_NAME FROM DQ_METRIC_DEFINITION WHERE MODULE_NAME='NUMERIC_OUTLIERS' AND METRIC_ORDINAL BETWEEN 1 AND 5").all();
assert.equal(outlierDefinitions.length,5);
assert.equal(new Set(outlierDefinitions.map(row=>row.METRIC_NAME)).size,5,'outlier metric names must be unique');
const groups=new Map([['OVERALL/ALL',raw]]);for(const r of raw){for(const [level,value]of [['YEARLY',r[0]?.slice(0,4)??'UNKNOWN'],['MONTHLY',r[0]?.slice(0,7)??'UNKNOWN']]){const key=level+'/'+value;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}}
const stats=values=>{const n=values.length;const mean=n?values.reduce((a,b)=>a+b,0)/n:null;const sd=n?Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/n):null;return {n,mean,sd};};
const reference=new Map();
function snapshot(population){db.exec('DELETE FROM DQ_NUMERIC_STATISTICS');reference.clear();for(const [key,rows]of population){const [level,value]=key.split('/');for(const [i,name]of fields.entries()){
 const values=rows.map(r=>r[i+1]).filter(v=>v!==null&&v!==-9999),s=stats(values);
 db.prepare('INSERT INTO DQ_NUMERIC_STATISTICS VALUES (?,?,?,?,?,?,?,?)').run(id,name,level,value,rows.length,s.n,s.mean,s.sd);
 const low=s.sd===null?null:s.mean-3*s.sd,high=s.sd===null?null:s.mean+3*s.sd,count=low===null?null:values.filter(x=>x<low||x>high).length;
 reference.set(name+'/'+key,{valid:s.n,low,high,count,rate:count===null?null:100*count/s.n});
}}}
snapshot(groups);
db.exec('CREATE TABLE DQ_RUN_LOG (RUN_ID TEXT)');db.prepare('INSERT INTO DQ_RUN_LOG VALUES (?)').run(id);
// Execute the actual narrow CTAS (only remove Teradata physical-table syntax).
const stageName='DQ_OS_'+id.replaceAll('-','')+'_A1';
function workName(run,attempt){return evaluate(assignment('V_STAGE',0,sql),{"OREPLACE(TRIM(P_RUN_ID),'-','')":run.replaceAll('-',''),V_ATTEMPT:attempt});}
assert.equal(workName(id,1),stageName);assert.notEqual(workName(id,2),stageName);
assert.notEqual(workName('40000000-0000-4000-8000-000000000002',1),stageName);
const stageVars={V_STAGE:stageName,V_DATE:'FACT_DT',V_STAGE_PROJECTION:'"FACT_DT"',V_DB:'SOURCE',V_SOURCE:'FIXTURE'};
for(const name of fields){stageVars['W.FIELD_NAME']=name;stageVars.V_STAGE_PROJECTION=evaluate(assignment('V_STAGE_PROJECTION',sql.indexOf('FOR W AS'),sql),stageVars);}
const stageSql=evaluate(assignment('V_SQL',sql.indexOf('FOR W AS'),sql),stageVars);
lex(stageSql,'outlier source materialization');assert.ok(stageSql.length<32000);
const wideStage=evaluate(assignment('V_SQL',sql.indexOf('FOR W AS'),sql),{...stageVars,V_STAGE_PROJECTION:'X'.repeat(28000),V_STAGE:'X'.repeat(128),V_DB:'X'.repeat(128),V_SOURCE:'X'.repeat(128)});
lex(wideStage,'maximum stage SQL width');assert.ok(wideStage.length<32000);
assert.ok(!stageSql.includes('DISTINCT'));assert.ok(!stageSql.includes(' WHERE '));assert.ok(!stageSql.includes('CAST('));
const stageSelect=stageSql.slice(stageSql.indexOf(' AS (')+5,stageSql.lastIndexOf(') WITH DATA'));
db.exec('CREATE TABLE '+stageName+' AS '+stageSelect);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+stageName).get().n,raw.length);
assert.deepEqual(db.prepare('SELECT * FROM '+stageName).all(),db.prepare('SELECT * FROM SOURCE.FIXTURE').all());
// Source changes after materialization must not affect standalone outlier scans.
db.exec('DELETE FROM SOURCE.FIXTURE');

const adapt=q=>q.replaceAll('DQ_DB.','').replaceAll('"DQ_DB".','').replaceAll('CURRENT_TIMESTAMP(6)','CURRENT_TIMESTAMP')
 .replaceAll('EXTRACT(YEAR FROM S.DQ_DT)',"CAST(strftime('%Y',S.DQ_DT) AS INTEGER)")
 .replaceAll('EXTRACT(MONTH FROM S.DQ_DT)',"CAST(strftime('%m',S.DQ_DT) AS INTEGER)")
 .replaceAll('EXTRACT(YEAR FROM "FACT_DT")',"CAST(strftime('%Y',FACT_DT) AS INTEGER)")
 .replaceAll('EXTRACT(MONTH FROM "FACT_DT")',"CAST(strftime('%m',FACT_DT) AS INTEGER)");
function ctas(q,name){lex(q,'generated '+name);assert.ok(q.length<32000);const a=q.indexOf(' AS (')+5,b=q.lastIndexOf(') WITH DATA');db.exec('CREATE TABLE '+name+' AS '+adapt(q.slice(a,b)));}
const cursor=sql.indexOf('FOR F AS'),resultCursor=sql.indexOf('FOR R AS');
function batch(first,last){const v={P_RUN_ID:id,P_PROJECT_ID:'DQ_OUT_TEST',V_DB:'DQ_DB',V_SOURCE:stageName,V_DATE:'FACT_DT',
 V_FIRST:first,V_LAST:last,V_LIST:'(-9999.0000000000)',V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT,1 AS DQ_PRESENT',
 V_BOUND_PROJECTION:'',V_PROJECTION:'',V_CHECK:'A.ACTUAL_TOTAL<>A.TOTAL_N'};
 for(let i=first;i<=last;i++){v['F.FIELD_NAME']=fields[i-1];v.V_SUFFIX=String(i);v.V_FIELD='S.DQ_C'+i;
  for(const part of ['V_SOURCE_PROJECTION','V_BOUND_PROJECTION','V_PROJECTION','V_CHECK'])v[part]=evaluate(assignment(part,cursor,sql),v);
 }
 ctas(evaluate(assignment('V_SQL',cursor,sql),v),'DQ_NO_BOUNDS');
 const aggStart=sql.indexOf('SET V_AGG_SELECT =');
 v.V_AGG_SELECT=evaluate(assignment('V_AGG_SELECT',aggStart,sql),v);
 v.V_AGG_FROM=evaluate(assignment('V_AGG_FROM',aggStart,sql),v);
 const generated='CREATE VOLATILE TABLE DQ_NO_AGG AS ('+v.V_AGG_SELECT+v.V_AGG_FROM+
  ') WITH DATA PRIMARY INDEX (PERIOD_LEVEL,PERIOD_VALUE) ON COMMIT PRESERVE ROWS';
 lex(generated,'generated set-based outlier aggregate');assert.ok(generated.length<32000);
 assert.ok(!/GROUPING\s*\(|GROUPING SETS/i.test(generated));
 assert.equal((generated.match(new RegExp('FROM "DQ_DB"\."'+stageName+'"','g'))||[]).length,3,
  'The set-based second pass should read the materialized stage once per period level');
 assert.ok(!generated.includes('DQ_NO_CHUNKS'),'Monthly intermediate is no longer needed');
 const body=generated.slice(generated.indexOf(' AS (')+5,generated.lastIndexOf(') WITH DATA'));
 db.exec('CREATE TABLE DQ_NO_AGG AS '+adapt(body));
 assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM
  (SELECT PERIOD_LEVEL,PERIOD_VALUE FROM DQ_NO_AGG
   GROUP BY PERIOD_LEVEL,PERIOD_VALUE HAVING COUNT(*)>1)`).get().n,0,'rollup period keys must be unique');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_NO_AGG A WHERE '+v.V_CHECK).get().n,0);
 for(let i=first;i<=last;i++){v['R.FIELD_NAME']=fields[i-1];v.V_SUFFIX=String(i);db.exec(adapt(evaluate(assignment('V_SQL',resultCursor,sql),v)));}
 db.exec('DROP TABLE DQ_NO_AGG; DROP TABLE DQ_NO_BOUNDS;');return v;
}
batch(1,5);batch(6,6);
const rows=db.prepare('SELECT * FROM DQ_METRIC_RESULT').all();assert.equal(rows.length,180);
const keys={OUTLIER_VALID_COUNT:'valid',OUTLIER_LOWER_BOUND:'low',OUTLIER_UPPER_BOUND:'high',OUTLIER_COUNT:'count',OUTLIER_RATE_PCT:'rate'};
for(const row of rows){const expected=reference.get(row.FIELD_NAME+'/'+row.PERIOD_LEVEL+'/'+row.PERIOD_VALUE)[keys[row.METRIC_NAME]];
 if(expected===null)assert.equal(row.METRIC_VALUE,null);else assert.ok(Math.abs(row.METRIC_VALUE-expected)<1e-9,JSON.stringify(row));
 if(row.METRIC_NAME==='OUTLIER_RATE_PCT'){
  const r=reference.get(row.FIELD_NAME+'/'+row.PERIOD_LEVEL+'/'+row.PERIOD_VALUE);
  assert.equal(row.RATE_DENOMINATOR,r.count===null?null:r.valid);assert.equal(row.RATE_NUMERATOR,r.count);
 }
}
assert.equal(reference.get('AMOUNT/OVERALL/ALL').valid,33);assert.equal(reference.get('AMOUNT/OVERALL/ALL').count,2);
assert.equal(reference.get('BOUNDARY/OVERALL/ALL').count,0);assert.equal(reference.get('CONSTANT_VALUE/OVERALL/ALL').count,0);
// Same measurements when each field is its own batch.
db.exec('DELETE FROM DQ_METRIC_RESULT');for(let i=1;i<=6;i++)batch(i,i);
const order=q=>q.map(({EXECUTION_TIMESTAMP,...values})=>values).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
assert.deepEqual(order(db.prepare('SELECT * FROM DQ_METRIC_RESULT').all()),order(rows));
// A shifted one-value month is unevaluated monthly but evaluated overall.
// The overall result must use global bounds on every chunk, not month bounds.
const shifted=raw.map(r=>[...r]);shifted[33][1]=100;
const shiftedGroups=new Map([...groups].map(([key,pop])=>[key,pop.map(r=>shifted[raw.indexOf(r)])]));
db.exec('UPDATE '+stageName+' SET AMOUNT=100 WHERE rowid=34; DELETE FROM DQ_METRIC_RESULT');
snapshot(shiftedGroups);batch(1,5);batch(6,6);
for(const row of db.prepare('SELECT * FROM DQ_METRIC_RESULT').all()){
 const expected=reference.get(row.FIELD_NAME+'/'+row.PERIOD_LEVEL+'/'+row.PERIOD_VALUE)[keys[row.METRIC_NAME]];
 if(expected===null)assert.equal(row.METRIC_VALUE,null);else assert.ok(Math.abs(row.METRIC_VALUE-expected)<1e-9,JSON.stringify(row));
}
assert.equal(db.prepare("SELECT METRIC_VALUE FROM DQ_METRIC_RESULT WHERE FIELD_NAME='AMOUNT' AND PERIOD_LEVEL='OVERALL' AND METRIC_NAME='OUTLIER_COUNT'").get().METRIC_VALUE,1);
assert.equal(db.prepare("SELECT SUM(METRIC_VALUE) AS n FROM DQ_METRIC_RESULT WHERE FIELD_NAME='AMOUNT' AND PERIOD_LEVEL='MONTHLY' AND METRIC_NAME='OUTLIER_COUNT'").get().n,2);
// Empty source: one overall domain, all bounds/counts/rates undefined; valid=0.
db.exec('DELETE FROM '+stageName+'; DELETE FROM DQ_METRIC_RESULT;');snapshot(new Map([['OVERALL/ALL',[]]]));batch(1,5);batch(6,6);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_METRIC_RESULT').get().n,30);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_METRIC_RESULT WHERE METRIC_NAME='OUTLIER_VALID_COUNT' AND METRIC_VALUE=0").get().n,6);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_METRIC_RESULT WHERE METRIC_NAME<>'OUTLIER_VALID_COUNT' AND METRIC_VALUE IS NULL").get().n,24);
db.exec('DROP TABLE '+stageName);
db.close();console.log('Generated Outlier queries passed: 180 field/period/metric results, strict +/-3 boundaries, specials, NULL dates, zero deviation, insufficient/empty populations and valid rate denominators.');

/* Execute all three sequential statistics templates and Basic's capture. */
const ns=read('teradata/modules/03_numeric_statistics.sql').replace(/SET (\w+)=/g,'SET $1 =');
const check=new DatabaseSync(':memory:');check.exec("ATTACH DATABASE ':memory:' AS SOURCE");
check.function('CHARACTER_LENGTH',x=>x?.length??null);
check.aggregate('STDDEV_POP',{start:()=>({n:0,mean:0,m2:0}),step:(s,x)=>{if(x!==null){s.n++;const d=x-s.mean;s.mean+=d/s.n;s.m2+=d*(x-s.mean);}return s;},result:s=>s.n===0?null:Math.sqrt(s.m2/s.n)});
check.exec('CREATE TABLE SOURCE.FIXTURE (FACT_DT TEXT,'+fields.map(f=>'"'+f+'" NUMERIC').join(',')+')');
const put=check.prepare('INSERT INTO SOURCE.FIXTURE VALUES (?,?,?,?,?,?,?)');raw.forEach(r=>put.run(...r));
check.exec('CREATE TABLE '+stageName+' AS '+stageSelect);check.exec('DELETE FROM SOURCE.FIXTURE');
check.exec('CREATE TABLE DQ_NUMERIC_STATISTICS (RUN_ID TEXT,FIELD_NAME TEXT,PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,TOTAL_COUNT INTEGER,VALID_COUNT INTEGER,MEAN_VALUE NUMERIC,STDDEV_VALUE NUMERIC)');
const nv={P_RUN_ID:id,P_PROJECT_ID:'DQ_OUT_TEST',V_DB:'main',V_SOURCE:stageName,V_DATE:'FACT_DT',
 V_LIST:'(-9999.0000000000)',V_PROJECTION:'',V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT'};
const nc=ns.indexOf('FOR F AS');for(const [i,name]of fields.entries()){
 nv['F.FIELD_NAME']=name;nv.V_SUFFIX=String(i+1);nv.V_FIELD='S.DQ_C'+(i+1);
 for(const part of ['V_SOURCE_PROJECTION','V_PROJECTION'])nv[part]=evaluate(assignment(part,nc,ns),nv);
}
for(const [index,marker]of ['IF V_PASS=1 THEN','ELSEIF V_PASS=2 THEN','            ELSE\n                SET V_GROUP_QUERY'].entries()){
 const start=ns.indexOf(marker,nc);nv.V_GROUP_QUERY=evaluate(assignment('V_GROUP_QUERY',start,ns),nv);
 lex(nv.V_GROUP_QUERY,'internal statistics pass');assert.ok(nv.V_GROUP_QUERY.length<28000);
 if(index===0)check.exec('CREATE TABLE DQ_NS_AGG AS '+adapt(nv.V_GROUP_QUERY));
 else check.exec('INSERT INTO DQ_NS_AGG '+adapt(nv.V_GROUP_QUERY));
}
nv.V_LEVEL=evaluate(assignment('V_LEVEL',0,ns),nv);nv.V_PERIOD=evaluate(assignment('V_PERIOD',0,ns),nv);
for(const [i,name]of fields.entries()){nv['R.FIELD_NAME']=name;nv.V_SUFFIX=String(i+1);check.exec(adapt(evaluate(assignment('V_SQL',ns.indexOf('FOR R AS'),ns),nv)));}
const captured=check.prepare('SELECT * FROM DQ_NUMERIC_STATISTICS').all();assert.equal(captured.length,36);
for(const row of captured){const pop=groups.get(row.PERIOD_LEVEL+'/'+row.PERIOD_VALUE);
 const s=stats(pop.map(r=>r[fields.indexOf(row.FIELD_NAME)+1]).filter(v=>v!==null&&v!==-9999));
 assert.equal(row.TOTAL_COUNT,pop.length);assert.equal(row.VALID_COUNT,s.n);
 for(const [actual,expected]of [[row.MEAN_VALUE,s.mean],[row.STDDEV_VALUE,s.sd]])if(expected===null)assert.equal(actual,null);else assert.ok(Math.abs(actual-expected)<1e-12);
}
const basic=read('teradata/modules/10_numeric_basic.sql').replace(/SET (\w+)=/g,'SET $1 =');
check.exec('CREATE TABLE DQ_NB_AGG (DQ_YEAR INTEGER,DQ_MONTH INTEGER,GY INTEGER,GM INTEGER,TOTAL_N INTEGER,V1 INTEGER,AV1 NUMERIC,SD1 NUMERIC)');
const mean=.1234567890123,sd=1.2345678901234;
check.prepare('INSERT INTO DQ_NB_AGG VALUES (NULL,NULL,1,1,40,33,?,?)').run(mean,sd);
check.exec('DELETE FROM DQ_NUMERIC_STATISTICS');
check.exec(adapt(evaluate(assignment('V_SQL',basic.indexOf('/* Keep unrounded'),basic),{P_RUN_ID:id,'R.FIELD_NAME':'PRECISE',V_SUFFIX:'1'})));
const precise=check.prepare('SELECT * FROM DQ_NUMERIC_STATISTICS').get();assert.equal(precise.MEAN_VALUE,mean);assert.equal(precise.STDDEV_VALUE,sd);
check.exec('DROP TABLE '+stageName);check.close();console.log('Generated statistics prerequisite/capture passed: all 36 period statistics and full FLOAT precision beyond displayed decimal scale.');

// Maximum field-name lengths and the full configured numeric list exercise
// SQL buffer guards and SPL's inferred concatenation widths.
const list='('+read('config/special_values.csv').trim().split('\n').slice(1).filter(l=>l.startsWith('NUMERIC,')).map(l=>Number(l.split(',')[1]).toFixed(10)).join(',')+')';
const widths=Object.fromEntries([...sql.matchAll(/DECLARE (\w+) VARCHAR\((\d+)\)/g)].map(([,name,size])=>[name,+size]));
const maxv={P_RUN_ID:id,P_PROJECT_ID:'DQ_OUT_TEST',V_DB:'SOURCE',V_SOURCE:'FIXTURE',V_DATE:'FACT_DT',V_FIRST:1,V_LAST:5,
 V_LIST:list,V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT,1 AS DQ_PRESENT',V_BOUND_PROJECTION:'',V_PROJECTION:'',
 V_AGG_SELECT:'',V_AGG_FROM:'',V_CHECK:'A.ACTUAL_TOTAL<>A.TOTAL_N'};
for(let i=1;i<=5;i++){maxv['F.FIELD_NAME']='F'+String(i).padStart(127,'X');maxv.V_SUFFIX=String(i);maxv.V_FIELD='S.DQ_C'+i;
 for(const part of ['V_SOURCE_PROJECTION','V_BOUND_PROJECTION','V_PROJECTION','V_CHECK'])maxv[part]=evaluate(assignment(part,cursor,sql),maxv);
}
maxv.V_AGG_SELECT=evaluate(assignment('V_AGG_SELECT',sql.indexOf('SET V_AGG_SELECT ='),sql),maxv);
maxv.V_AGG_FROM=evaluate(assignment('V_AGG_FROM',sql.indexOf('SET V_AGG_SELECT ='),sql),maxv);
for(const part of ['V_SOURCE_PROJECTION','V_BOUND_PROJECTION','V_PROJECTION','V_AGG_SELECT','V_AGG_FROM','V_CHECK'])
 assert.ok(maxv[part].length<=widths[part],part+' must fit its declared buffer');
const maxQuery='CREATE VOLATILE TABLE DQ_NO_AGG AS ('+maxv.V_AGG_SELECT+maxv.V_AGG_FROM+') WITH DATA PRIMARY INDEX (PERIOD_LEVEL,PERIOD_VALUE) ON COMMIT PRESERVE ROWS';
lex(maxQuery,'max-sized outlier aggregate');assert.ok(maxQuery.length<32000);
console.log('Outlier SQL-size checks passed: five 128-character fields, full special list, '+maxQuery.length+' characters. Teradata/SAS NOT executed.');

// Lifecycle/API structure: materialize once before internal statistics, use the
// stage for subsequent reads, never overwrite another run's table, drop only
// the successfully-created table, and retain creation SQL for abort recovery.
assert.equal([...sql.matchAll(/CREATE MULTISET TABLE DQ_DB\./g)].length,1);
assert.ok(sql.indexOf('SET V_STAGE_EXISTS=1')<sql.indexOf('CALL DQ_DB.SP_DQ_NUMERIC_STATS_SOURCE'));
assert.ok(sql.includes("SET V_DB ='DQ_DB'"));assert.ok(sql.includes('SET V_SOURCE =V_STAGE'));
assert.equal([...sql.matchAll(/DROP TABLE DQ_DB\./g)].length,2);
assert.ok(sql.includes("' TO DQ_DB WITH GRANT OPTION'"));
assert.ok(ns.includes('REPLACE PROCEDURE DQ_DB.SP_DQ_NUMERIC_STATISTICS'));
assert.ok(ns.includes('CALL DQ_DB.SP_DQ_NUMERIC_STATS_SOURCE(P_RUN_ID,P_PROJECT_ID,V_DB,V_SOURCE,V_DATE)'));
console.log('Narrow stage checks passed: native column projection, unchanged rows/duplicates, source independence, standalone stage statistics and isolated cleanup structure. Server DDL/grants/abort cleanup NOT tested.');

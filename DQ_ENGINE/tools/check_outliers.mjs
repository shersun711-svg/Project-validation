/* Generated Outlier SQL on synthetic SQLite data. Independent population statistics
   supply the reference; this is not Teradata SPL or SAS execution. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync}from'node:sqlite';
import {appendOutlierField} from './outlier_fragments.mjs';
import {assignment,evaluate,lex}from'./check_static.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('teradata/modules/12_numeric_outliers.sql').replace(/SET (\w+)=/g,'SET $1 =');
function rollup(v,o='Y',y='Y',m='Y'){
 const start=sql.indexOf("SET V_QUERY_OVERALL =''");const parts=[];
 for(const [level,flag]of [['OVERALL',o],['YEARLY',y],['MONTHLY',m]]){
  const key='V_QUERY_'+level;
  v[key]=flag==='Y'?evaluate(assignment(key,sql.indexOf("IF V_PROFILE_"+level+"='Y' THEN",start),sql),v):'';
  if(v[key]){if(parts.length)v[key]=' UNION ALL '+v[key];parts.push(key);}
 }
 return evaluate(assignment('V_ROLLUP_QUERY',start,sql),v);
}
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
 RATE_NUMERATOR INTEGER,RATE_DENOMINATOR INTEGER,POU_DT TEXT,EXECUTION_TIMESTAMP TEXT,
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
db.exec('CREATE TABLE DQ_OUTLIER_CHUNK_YEAR (RUN_ID TEXT,CHUNK_YEAR TEXT); CREATE TABLE DQ_RUN_LOG (RUN_ID TEXT)');db.prepare('INSERT INTO DQ_RUN_LOG VALUES (?)').run(id);
const adapt=q=>q.replaceAll('CAST(S.DQ_DT AS DATE)','date(S.DQ_DT)').replaceAll('CAST(NULL AS DATE)','CAST(NULL AS TEXT)').replaceAll('DQ_DB.','').replaceAll('CURRENT_TIMESTAMP(6)','CURRENT_TIMESTAMP')
 .replaceAll('EXTRACT(YEAR FROM S.DQ_DT)',"CAST(strftime('%Y',S.DQ_DT) AS INTEGER)")
 .replaceAll('EXTRACT(MONTH FROM S.DQ_DT)',"CAST(strftime('%m',S.DQ_DT) AS INTEGER)")
 .replaceAll('EXTRACT(YEAR FROM "FACT_DT")',"CAST(strftime('%Y',FACT_DT) AS INTEGER)")
 .replaceAll('EXTRACT(MONTH FROM "FACT_DT")',"CAST(strftime('%m',FACT_DT) AS INTEGER)");
// Execute the actual narrow CTAS (only remove Teradata physical-table syntax).
const stageName='DQ_OS_'+id.replaceAll('-','')+'_A1_B1';
function workName(run,attempt,batch=1){return evaluate(assignment('V_STAGE',0,sql),{"OREPLACE(TRIM(P_RUN_ID),'-','')":run.replaceAll('-',''),V_ATTEMPT:attempt,V_BATCH:batch});}
assert.notEqual(workName(id,1,1),workName(id,1,2));
assert.equal(workName(id,1),stageName);assert.notEqual(workName(id,2),stageName);
assert.notEqual(workName('40000000-0000-4000-8000-000000000002',1),stageName);
const stageYear='DQ_OS_YEAR_0',stageBucket='DQ_OS_BUCKET_0';
// The distribution key must not affect result values; SQLite emulates values,
// not Teradata's random generator, row hashing or physical partitions.
let bucket=0;db.function('RANDOM',(lo,hi)=>lo+(bucket++%(hi-lo+1)));
const stageVars={V_STAGE:stageName,V_STAGE_YEAR:stageYear,V_STAGE_BUCKET:stageBucket,V_DATE:'FACT_DT',V_STAGE_PROJECTION:'"FACT_DT"',V_DB:'SOURCE',V_SOURCE:'FIXTURE'};
for(const name of fields){stageVars['W.FIELD_NAME']=name;stageVars.V_STAGE_PROJECTION=evaluate(assignment('V_STAGE_PROJECTION',sql.indexOf('FOR W AS'),sql),stageVars);}
function stageCreate(v){
 v.V_STAGE_SELECT=evaluate(assignment('V_STAGE_SELECT',sql.indexOf('FOR W AS'),sql),v);
 return evaluate(assignment('V_SQL',sql.indexOf('FOR W AS'),sql),v);
}
function stageLoad(v){return evaluate(assignment('V_SQL',sql.indexOf('SET V_STAGE_EXISTS =1'),sql),v);}
const stageSql=stageCreate(stageVars);
lex(stageSql,'outlier source materialization');assert.ok(stageSql.length<32000);
const wideStage=stageCreate({...stageVars,V_STAGE_PROJECTION:'X'.repeat(28000),V_STAGE:'X'.repeat(128),V_DB:'X'.repeat(128),V_SOURCE:'X'.repeat(128)});
lex(wideStage,'maximum stage SQL width');assert.ok(wideStage.length<32000);
assert.ok(!stageSql.includes('DISTINCT'));assert.ok(!stageSql.includes(' WHERE '));assert.ok(!stageSql.includes('CAST('));
assert.ok(stageSql.includes('WITH NO DATA'));
const stageSelect=stageVars.V_STAGE_SELECT;
db.exec('CREATE TABLE '+stageName+' AS '+adapt(stageSelect));
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+stageName).get().n,raw.length);
const sourceColumns=['FACT_DT',...fields].map(f=>'"'+f+'"').join(',');
assert.deepEqual(db.prepare('SELECT '+sourceColumns+' FROM '+stageName).all(),db.prepare('SELECT * FROM SOURCE.FIXTURE').all());
assert.ok(stageSql.includes('PRIMARY INDEX ("DQ_OS_BUCKET_0") PARTITION BY RANGE_N("DQ_OS_YEAR_0" BETWEEN 0 AND 9999 EACH 1)'));
assert.ok(!stageSql.includes('NO PRIMARY INDEX'));
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+stageName+' WHERE "'+stageYear+'"<>COALESCE(CAST(substr(FACT_DT,1,4) AS INTEGER),0)').get().n,0);
// Exercise the real internal-name count query. Even a source reporting date
// or numeric field named like our internal key must remain a native column.
const keyLoop=sql.indexOf('WHILE V_COUNT>0 DO');
const collisionQuery=sql.slice(sql.indexOf('SELECT COUNT(*) INTO V_COUNT',keyLoop),sql.indexOf(';',sql.indexOf('SELECT COUNT(*) INTO V_COUNT',keyLoop)))
 .replace('INTO V_COUNT','AS N').replaceAll('DQ_DB.','').replaceAll('P_RUN_ID',':run')
 .replaceAll('V_STAGE_BUCKET',':bucket').replaceAll('V_STAGE_YEAR',':year');
for(const [date,extra,expected]of [['FACT_DT',[],0],['dq_os_year_0',[],1],
 ['FACT_DT',['dq_os_bucket_0','DQ_OS_YEAR_1'],2]]){
 const testId='physical-key-test';
 extra.forEach((f,i)=>db.prepare('INSERT INTO DQ_RUN_FIELD_CONFIG VALUES (?,?,?,?)').run(testId,f,'NUMERIC',i+1));
 let chosen;
 for(let suffix=0;suffix<10;suffix++){
  const v={V_KEY_SUFFIX:suffix};
  const b=evaluate(assignment('V_STAGE_BUCKET',keyLoop,sql),v),y=evaluate(assignment('V_STAGE_YEAR',keyLoop,sql),v);
  const n=db.prepare(collisionQuery).get({run:testId,bucket:b,year:y}).N;
  if(n===0&&![b,y].includes(date.toUpperCase())){chosen=suffix;break;}
 }
 assert.equal(chosen,expected);
 db.prepare('DELETE FROM DQ_RUN_FIELD_CONFIG WHERE RUN_ID=?').run(testId);
}
// Reloads update the physical keys too, exactly as a fresh materialization does.
function loadStage(population){
 const put=db.prepare('INSERT INTO '+stageName+' ('+sourceColumns+',"'+stageBucket+'","'+stageYear+'") VALUES (?,?,?,?,?,?,?,?,?)');
 population.forEach((r,i)=>put.run(...r,i+1,r[0]===null?0:Number(r[0].slice(0,4))));
}
// Source changes after materialization must not affect standalone outlier scans.
db.exec('DELETE FROM SOURCE.FIXTURE');

function ctas(q,name){lex(q,'generated '+name);assert.ok(q.length<32000);const a=q.indexOf(' AS (')+5,b=q.lastIndexOf(') WITH DATA');db.exec('CREATE TABLE '+name+' AS '+adapt(q.slice(a,b)));}
const cursor=sql.indexOf('FOR F AS'),resultCursor=sql.indexOf('FOR R AS');
function yearField(v){
 const on=sql.indexOf("IF V_PROFILE_YEARLY='Y' THEN",cursor);
 const start=v.V_PROFILE_YEARLY==='Y'?on:sql.indexOf('ELSE',on);
 for(const part of ['V_YEAR_BOUNDS','V_YEAR_COUNT'])v[part]=evaluate(assignment(part,start,sql),v);
}
function yearJoin(v){
 const defaults=sql.indexOf("SET V_YEAR_TOTAL =");
 const start=v.V_PROFILE_YEARLY==='Y'?sql.indexOf("IF V_PROFILE_YEARLY='Y' THEN",defaults):defaults;
 for(const part of ['V_YEAR_TOTAL','V_YEAR_JOIN'])v[part]=evaluate(assignment(part,start,sql),v);
}
function sourceJoin(v){
 const defaults=sql.indexOf("SET V_SOURCE_JOIN =");
 const start=v['C.CHUNK_VALUE']==='ALL'?sql.indexOf("IF C.CHUNK_VALUE='ALL' THEN",defaults):defaults;
 for(const part of ['V_SOURCE_JOIN','V_SOURCE_JOIN_ON'])v[part]=evaluate(assignment(part,start,sql),v);
}
function batch(first,last,levels=['Y','Y','Y']){const [o,y,m]=levels;const v={V_PROFILE_OVERALL:o,V_PROFILE_YEARLY:y,V_PROFILE_MONTHLY:m,P_RUN_ID:id,P_PROJECT_ID:'DQ_OUT_TEST',V_DB:'main',V_SOURCE:stageName,V_DATE:'FACT_DT',
 V_FIRST:first,V_LAST:last,V_LIST:'(-9999.0000000000)',V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT,1 AS DQ_PRESENT',
 V_BOUND_PROJECTION:'',V_OVERALL_BOUND_PROJECTION:'',V_PROJECTION:'',V_ROLLUP_OVERALL:'',V_ROLLUP_YEARLY:'',V_ROLLUP_MONTHLY:'',V_CHECK:'A.ACTUAL_TOTAL<>A.TOTAL_N'};
 for(let i=first;i<=last;i++){v['F.FIELD_NAME']=fields[i-1];v.V_SUFFIX=String(i);v.V_FIELD='S.DQ_C'+i;yearField(v);
  assert.ok(appendOutlierField(v,sql));
 }
 ctas(evaluate(assignment('V_SQL',cursor,sql),v),'DQ_NO_BOUNDS');
 db.exec('DELETE FROM DQ_OUTLIER_CHUNK_YEAR');
 const calendarStart=sql.indexOf('/* Scan scheduling');
 db.exec(adapt(evaluate(assignment('V_SQL',calendarStart,sql),{P_RUN_ID:id,V_STAGE_YEAR:stageYear,V_STAGE:stageName})));
 db.exec("INSERT INTO DQ_OUTLIER_CHUNK_YEAR SELECT '"+id+"','ALL' WHERE NOT EXISTS (SELECT 1 FROM DQ_OUTLIER_CHUNK_YEAR)");
 const cs=sql.slice(sql.indexOf('SELECT CHUNK_YEAR AS CHUNK_VALUE'),sql.indexOf('            DO',sql.indexOf('FOR C AS'))).trim();
 const chunks=db.prepare(adapt(cs).replaceAll('P_RUN_ID',"'"+id+"'")).all();
 assert.ok(chunks.length>0);
 for(const [index,c]of chunks.entries()){
  v['C.CHUNK_VALUE']=c.CHUNK_VALUE;v.V_SOURCE_FILTER='1=1';
  v.V_CHUNK_YEAR=c.CHUNK_VALUE==='UNKNOWN'?'UNKNOWN':c.CHUNK_VALUE==='ALL'?'ALL':c.CHUNK_VALUE.slice(0,4);
  if(c.CHUNK_VALUE==='UNKNOWN')v.V_SOURCE_FILTER=evaluate(assignment('V_SOURCE_FILTER',sql.indexOf("IF C.CHUNK_VALUE='UNKNOWN'"),sql),{V_STAGE_YEAR:stageYear});
  else if(c.CHUNK_VALUE==='ALL')v.V_SOURCE_FILTER=evaluate(assignment('V_SOURCE_FILTER',sql.indexOf("ELSEIF C.CHUNK_VALUE='ALL'"),sql),{});
  else v.V_SOURCE_FILTER=evaluate(assignment('V_SOURCE_FILTER',sql.indexOf("SET V_CHUNK_YEAR ='ALL'"),sql),{V_STAGE_YEAR:stageYear,'C.CHUNK_VALUE':c.CHUNK_VALUE});
  assert.ok(!v.V_SOURCE_FILTER.includes('EXTRACT('),'year filtering must directly constrain the stored partition key');
  assert.ok(c.CHUNK_VALUE==='ALL'||v.V_SOURCE_FILTER!=='1=1','nonempty populations must be year-filtered or NULL-date filtered');
  yearJoin(v);sourceJoin(v);
  v.V_PERIOD_QUERY=evaluate(assignment('V_PERIOD_QUERY',cursor,sql),v);
  assert.equal(v.V_PERIOD_QUERY.includes(' CROSS JOIN (SELECT '),c.CHUNK_VALUE!=='ALL');
  assert.equal(v.V_PERIOD_QUERY.includes(') S ON 1=1'),c.CHUNK_VALUE==='ALL');
  assert.ok(v.V_PERIOD_QUERY.includes('END AS VARCHAR(10)) AS CHUNK_VALUE'));
  assert.ok(v.V_PERIOD_QUERY.includes("AS VARCHAR(10)) AS CHUNK_YEAR"));
  assert.ok(v.V_PERIOD_QUERY.includes('GROUP BY EXTRACT(MONTH FROM S.DQ_DT)'));
  assert.ok(v.V_PERIOD_QUERY.includes('B0.L'+first)&&v.V_PERIOD_QUERY.includes('BM.L'+first));
  assert.equal(v.V_PERIOD_QUERY.includes('B1.'),y==='Y','disabled yearly level must not join or compare yearly bounds');
  if(index===0)ctas(evaluate(assignment('V_SQL',sql.indexOf("SET V_SQL ='CREATE MULTISET VOLATILE TABLE DQ_NO_CHUNKS"),sql),v),'DQ_NO_CHUNKS');
  else db.exec(adapt(evaluate(assignment('V_SQL',sql.indexOf("SET V_SQL ='INSERT INTO DQ_NO_CHUNKS"),sql),v)));
 }
 const expectedChunkRows=db.prepare("SELECT COUNT(DISTINCT COALESCE(substr(FACT_DT,1,7),'UNKNOWN')) AS n FROM "+stageName).get().n;
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_NO_CHUNKS').get().n,expectedChunkRows||1,
  'year chunks should emit one row per populated month, or one empty-source row');
 v.V_ROLLUP_QUERY=rollup(v,o,y,m);
 // SQLite does not enforce VARCHAR lengths. Explicitly check the generated
 // Teradata contract as well as values, including the first UNION branch.
 assert.equal([...v.V_ROLLUP_QUERY.matchAll(/AS VARCHAR\(8\)\) AS PERIOD_LEVEL/g)].length,levels.filter(f=>f==='Y').length);
 assert.equal([...v.V_ROLLUP_QUERY.matchAll(/AS VARCHAR\(10\)\) AS PERIOD_VALUE/g)].length,levels.filter(f=>f==='Y').length);
 ctas(evaluate(assignment('V_SQL',sql.indexOf("SET V_SQL ='CREATE VOLATILE TABLE DQ_NO_AGG"),sql),v),'DQ_NO_AGG');
 assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM
  (SELECT PERIOD_LEVEL,PERIOD_VALUE FROM DQ_NO_AGG
   GROUP BY PERIOD_LEVEL,PERIOD_VALUE HAVING COUNT(*)>1)`).get().n,0,'rollup period keys must be unique');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_NO_AGG A WHERE '+v.V_CHECK).get().n,0);
 for(let i=first;i<=last;i++){v['R.FIELD_NAME']=fields[i-1];v.V_SUFFIX=String(i);db.exec(adapt(evaluate(assignment('V_SQL',resultCursor,sql),v)));}
 db.exec('DROP TABLE DQ_NO_AGG; DROP TABLE DQ_NO_CHUNKS; DROP TABLE DQ_NO_BOUNDS;');return v;
}
batch(1,5);batch(6,6);
const rows=db.prepare('SELECT * FROM DQ_METRIC_RESULT').all();assert.equal(rows.length,180);
const keys={OUTLIER_VALID_COUNT:'valid',OUTLIER_LOWER_BOUND:'low',OUTLIER_UPPER_BOUND:'high',OUTLIER_COUNT:'count',OUTLIER_RATE_PCT:'rate'};
for(const row of rows){
 const pop=groups.get(row.PERIOD_LEVEL+'/'+row.PERIOD_VALUE);
 const expectedDate=row.PERIOD_LEVEL==='OVERALL'?null:pop.map(r=>r[0]).filter(Boolean).sort().at(-1)??null;
 assert.equal(row.POU_DT,expectedDate,'saved outlier reporting date');
 const expected=reference.get(row.FIELD_NAME+'/'+row.PERIOD_LEVEL+'/'+row.PERIOD_VALUE)[keys[row.METRIC_NAME]];
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
// Repeated month numbers across years must retain full keys and independent
// overall/yearly/monthly bounds. Use valid dates in non-leap years.
for(const [label,population] of [
 ['multiple years',[2005,2006,2026].flatMap((year,ix)=>raw.map(r=>[
  r[0]===null?null:year+r[0].slice(4).replace('-02-29','-02-28'),
  ...r.slice(1).map(x=>x===null||x===-9999?x:x+ix*100)]))],
 ['NULL-only dates',raw.map(r=>[null,...r.slice(1)])]
 ,['timestamp dates',raw.map(r=>[r[0]===null?null:r[0]+' 23:59:59.123456',...r.slice(1)])]
]){
 db.exec('DELETE FROM '+stageName+'; DELETE FROM DQ_METRIC_RESULT');
 loadStage(population);
 const populationGroups=new Map([['OVERALL/ALL',population]]);
 for(const r of population)for(const [level,value]of [['YEARLY',r[0]?.slice(0,4)??'UNKNOWN'],['MONTHLY',r[0]?.slice(0,7)??'UNKNOWN']]){
  const key=level+'/'+value;if(!populationGroups.has(key))populationGroups.set(key,[]);populationGroups.get(key).push(r);
 }
 snapshot(populationGroups);batch(1,5);batch(6,6);
 const actual=db.prepare('SELECT * FROM DQ_METRIC_RESULT').all();
 assert.equal(actual.length,populationGroups.size*fields.length*5);
 for(const row of actual){
  const expected=reference.get(row.FIELD_NAME+'/'+row.PERIOD_LEVEL+'/'+row.PERIOD_VALUE)[keys[row.METRIC_NAME]];
  if(expected===null)assert.equal(row.METRIC_VALUE,null);
  else assert.ok(Math.abs(row.METRIC_VALUE-expected)<1e-9,JSON.stringify(row));
 }
 console.log('Outlier '+label+' regression passed: '+actual.length+' independently checked metrics.');
}
// Every nonempty reporting-level combination, including no OVERALL driver.
// Compare selected results with independently calculated all-level references.
for(const empty of [false,true])for(let mask=1;mask<8;mask++){
 const levels=[1,2,4].map(bit=>(mask&bit)?'Y':'N');
 db.exec('DELETE FROM '+stageName+'; DELETE FROM DQ_METRIC_RESULT');
 const population=empty?[]:raw;
 loadStage(population);
 const sourceGroups=empty?new Map([['OVERALL/ALL',[]]]):groups;
 snapshot(sourceGroups);
 const selected=['OVERALL','YEARLY','MONTHLY'].filter((_,i)=>levels[i]==='Y');
 const marks=selected.map(()=>'?').join(',');
 db.prepare('DELETE FROM DQ_NUMERIC_STATISTICS WHERE PERIOD_LEVEL NOT IN ('+marks+')').run(...selected);
 batch(1,5,levels);batch(6,6,levels);
 const actual=db.prepare('SELECT * FROM DQ_METRIC_RESULT').all();
 assert.equal(actual.length,[...sourceGroups.keys()].filter(k=>selected.includes(k.split('/')[0])).length*fields.length*5);
 for(const row of actual){
  assert.ok(selected.includes(row.PERIOD_LEVEL));
  const expected=reference.get(row.FIELD_NAME+'/'+row.PERIOD_LEVEL+'/'+row.PERIOD_VALUE)[keys[row.METRIC_NAME]];
  if(expected===null)assert.equal(row.METRIC_VALUE,null);else assert.ok(Math.abs(row.METRIC_VALUE-expected)<1e-9,JSON.stringify(row));
 }
}
console.log('Outlier reporting levels passed: all seven combinations, with populated/empty sources, specials and UNKNOWN dates.');

// Empty source: one overall domain, all bounds/counts/rates undefined; valid=0.
db.exec('DELETE FROM '+stageName+'; DELETE FROM DQ_METRIC_RESULT;');snapshot(new Map([['OVERALL/ALL',[]]]));batch(1,5);batch(6,6);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM DQ_METRIC_RESULT').get().n,30);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_METRIC_RESULT WHERE METRIC_NAME='OUTLIER_VALID_COUNT' AND METRIC_VALUE=0").get().n,6);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_METRIC_RESULT WHERE METRIC_NAME<>'OUTLIER_VALID_COUNT' AND METRIC_VALUE IS NULL").get().n,24);
// Execute wider queries, independently checking every saved metric and scope.
const extra=Array.from({length:14},(_,i)=>'WIDE_'+(i+7));
for(const f of extra){fields.push(f);db.exec('ALTER TABLE '+stageName+' ADD COLUMN '+f+' NUMERIC');db.prepare('INSERT INTO DQ_RUN_FIELD_CONFIG VALUES (?,?,?,?)').run(id,f,'NUMERIC',fields.length);}
for(const [i,r]of raw.entries())r.push(...extra.map((_,j)=>i===0?1000+j:i%11===0?-9999:i%7===0?null:(i+j)%5));
for(const empty of [false,true]){
 db.exec('DELETE FROM '+stageName+'; DELETE FROM DQ_METRIC_RESULT');
 if(!empty){const put=db.prepare('INSERT INTO '+stageName+' (FACT_DT,'+fields.join(',')+','+stageBucket+','+stageYear+') VALUES ('+Array(fields.length+3).fill('?').join(',')+')');raw.forEach((r,i)=>put.run(...r,i+1,r[0]===null?0:Number(r[0].slice(0,4))));}
 const sourceGroups=empty?new Map([['OVERALL/ALL',[]]]):groups;snapshot(sourceGroups);
 for(const mask of [1,2,3,4,5,6,7]){
  const levels=[1,2,4].map(bit=>mask&bit?'Y':'N');let baseline;
  for(const width of [5,10,20]){
   db.exec('DELETE FROM DQ_METRIC_RESULT');
   for(let first=1;first<=20;first+=width)batch(first,Math.min(first+width-1,20),levels);
   const actual=db.prepare('SELECT * FROM DQ_METRIC_RESULT').all();
   if(!baseline)baseline=order(actual);else assert.deepEqual(order(actual),baseline,'wide metric equivalence '+width+' mask='+mask+' empty='+empty);
   for(const row of actual){const expected=reference.get(row.FIELD_NAME+'/'+row.PERIOD_LEVEL+'/'+row.PERIOD_VALUE)[keys[row.METRIC_NAME]];
    if(expected===null)assert.equal(row.METRIC_VALUE,null);else assert.ok(Math.abs(row.METRIC_VALUE-expected)<1e-9,JSON.stringify(row));}
  }
 }
}
fields.splice(6);for(const r of raw)r.splice(7);
console.log('Wider outlier execution passed: 5/10/20-field counts produce identical metrics across seven scopes, empty sources, NULLs, specials, strict bounds and zero deviation.');
db.close();console.log('Generated Outlier queries passed: 180 field/period/metric results, strict +/-3 boundaries, specials, NULL dates, zero deviation, insufficient/empty populations and valid rate denominators.');

/* Execute all three sequential statistics templates and Basic's capture. */
const ns=read('teradata/modules/03_numeric_statistics.sql').replace(/SET (\w+)=/g,'SET $1 =');
const check=new DatabaseSync(':memory:');check.exec("ATTACH DATABASE ':memory:' AS SOURCE");
check.function('CHARACTER_LENGTH',x=>x?.length??null);
check.aggregate('STDDEV_POP',{start:()=>({n:0,mean:0,m2:0}),step:(s,x)=>{if(x!==null){s.n++;const d=x-s.mean;s.mean+=d/s.n;s.m2+=d*(x-s.mean);}return s;},result:s=>s.n===0?null:Math.sqrt(s.m2/s.n)});
check.exec('CREATE TABLE SOURCE.FIXTURE (FACT_DT TEXT,'+fields.map(f=>'"'+f+'" NUMERIC').join(',')+')');
const put=check.prepare('INSERT INTO SOURCE.FIXTURE VALUES (?,?,?,?,?,?,?)');raw.forEach(r=>put.run(...r));
check.function('RANDOM',(lo,hi)=>lo+(bucket++%(hi-lo+1)));
check.exec('CREATE TABLE '+stageName+' AS '+adapt(stageSelect));check.exec('DELETE FROM SOURCE.FIXTURE');
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
const maxv={V_PROFILE_OVERALL:'Y',V_PROFILE_YEARLY:'Y',V_PROFILE_MONTHLY:'Y',P_RUN_ID:id,P_PROJECT_ID:'DQ_OUT_TEST',V_DB:'SOURCE',V_SOURCE:'FIXTURE',V_DATE:'FACT_DT',V_FIRST:1,V_LAST:5,
 V_LIST:list,V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT,1 AS DQ_PRESENT',V_BOUND_PROJECTION:'',V_OVERALL_BOUND_PROJECTION:'',V_PROJECTION:'',V_ROLLUP_OVERALL:'',V_ROLLUP_YEARLY:'',V_ROLLUP_MONTHLY:'',V_CHECK:'A.ACTUAL_TOTAL<>A.TOTAL_N'};
maxv['C.CHUNK_VALUE']='2000';maxv.V_CHUNK_YEAR='2000';maxv.V_SOURCE_FILTER='"DQ_OS_YEAR_0"=2000';
for(let i=1;i<=5;i++){maxv['F.FIELD_NAME']='F'+String(i).padStart(127,'X');maxv.V_SUFFIX=String(i);maxv.V_FIELD='S.DQ_C'+i;yearField(maxv);
 assert.ok(appendOutlierField(maxv,sql));
}
for(const part of ['V_SOURCE_PROJECTION','V_BOUND_PROJECTION','V_OVERALL_BOUND_PROJECTION','V_PROJECTION','V_ROLLUP_OVERALL','V_ROLLUP_YEARLY','V_ROLLUP_MONTHLY','V_CHECK'])assert.ok(maxv[part].length<=widths[part]);
yearJoin(maxv);sourceJoin(maxv);
maxv.V_PERIOD_QUERY=evaluate(assignment('V_PERIOD_QUERY',cursor,sql),maxv);
assert.ok(maxv.V_PERIOD_QUERY.length<=widths.V_PERIOD_QUERY);
maxv.V_ROLLUP_QUERY=rollup(maxv);
assert.ok(maxv.V_ROLLUP_QUERY.length<=widths.V_ROLLUP_QUERY);
const maxQuery=evaluate(assignment('V_SQL',sql.indexOf("SET V_SQL ='CREATE MULTISET VOLATILE TABLE DQ_NO_CHUNKS"),sql),maxv);
lex(maxQuery,'max-sized outlier aggregate');assert.ok(maxQuery.length<32000);
console.log('Outlier SQL-size checks passed: five 128-character fields, full special list, '+maxQuery.length+' characters. Teradata/SAS NOT executed.');

// Generate a tiny server-side CTAS/UNION regression from the actual template.
// No engine configuration or source data is needed. Commit the generated file
// after running this checker with DQ_WRITE_PERIOD_SMOKE=1.
const smokeVars={V_SUFFIX:'1',V_ROLLUP_OVERALL:'',V_ROLLUP_YEARLY:'',V_ROLLUP_MONTHLY:''};
for(const part of Object.keys(smokeVars).filter(k=>k.startsWith('V_ROLLUP_')))
 smokeVars[part]=evaluate(assignment(part,cursor,sql),smokeVars);
const smokeQuery=rollup(smokeVars)
 .replaceAll('DQ_NO_CHUNKS','DQ_TEST_OUT_CHUNKS').replaceAll(' UNION ALL ','\nUNION ALL ');
const smokeColumns=['POU_DT DATE','CHUNK_VALUE VARCHAR(10)','CHUNK_YEAR VARCHAR(10)',
 'OVERALL_TOTAL_N BIGINT','YEARLY_TOTAL_N BIGINT','MONTHLY_TOTAL_N BIGINT','ACTUAL_TOTAL BIGINT',
 'ON1 BIGINT','OL1 FLOAT','OU1 FLOAT','YN1 BIGINT','YL1 FLOAT','YU1 FLOAT',
 'MN1 BIGINT','ML1 FLOAT','MU1 FLOAT','ACTUAL1 BIGINT','OO1 BIGINT','YO1 BIGINT','MO1 BIGINT'];
const smokeInsert=['2005-01','2005-02','2006-01','2026-03','UNKNOWN'].map(month=>{
 const year=month==='UNKNOWN'?'UNKNOWN':month.slice(0,4),yearN=year==='2005'?20:10;
 return `INSERT INTO DQ_TEST_OUT_CHUNKS VALUES (NULL,'${month}','${year}',50,${yearN},10,10,50,-3,3,${yearN},-2,2,10,-1,1,10,2,1,1);`;
}).join('\n');
const smokeSummary=`SELECT COUNT(*) AS PERIOD_ROWS,
       COUNT(DISTINCT PERIOD_LEVEL || ':' || PERIOD_VALUE) AS UNIQUE_PERIOD_KEYS,
       SUM(CASE
         WHEN PERIOD_LEVEL='OVERALL' AND PERIOD_VALUE='ALL' AND TOTAL_N=50 AND N1=50 AND O1=10 THEN 0
         WHEN PERIOD_LEVEL='YEARLY' AND PERIOD_VALUE='2005' AND TOTAL_N=20 AND N1=20 AND O1=2 THEN 0
         WHEN PERIOD_LEVEL='YEARLY' AND PERIOD_VALUE IN ('2006','2026','UNKNOWN') AND TOTAL_N=10 AND N1=10 AND O1=1 THEN 0
         WHEN PERIOD_LEVEL='MONTHLY' AND PERIOD_VALUE IN ('2005-01','2005-02','2006-01','2026-03','UNKNOWN') AND TOTAL_N=10 AND N1=10 AND O1=1 THEN 0
         ELSE 1 END) AS BAD_ROWS
FROM DQ_TEST_OUT_AGG;`;
const smoke=`/* Generated by: DQ_WRITE_PERIOD_SMOKE=1 node DQ_ENGINE/tools/check_outliers.mjs
   Run in a fresh SQL Assistant session, separately from profiling.
   Uses five synthetic rows and two session-only tables; no RDS scan or engine changes.
   Expected summary: PERIOD_ROWS=10, UNIQUE_PERIOD_KEYS=10, BAD_ROWS=0.
   This checks Teradata CTAS/UNION period widths; it does not benchmark spool.
   If interrupted, disconnect this test session to discard its volatile tables. */
CREATE MULTISET VOLATILE TABLE DQ_TEST_OUT_CHUNKS (
    ${smokeColumns.join(',\n    ')}
) PRIMARY INDEX (CHUNK_VALUE) ON COMMIT PRESERVE ROWS;
${smokeInsert}

CREATE MULTISET VOLATILE TABLE DQ_TEST_OUT_AGG AS (
${smokeQuery}
) WITH DATA PRIMARY INDEX (PERIOD_LEVEL,PERIOD_VALUE) ON COMMIT PRESERVE ROWS;

${smokeSummary}

SELECT PERIOD_LEVEL,PERIOD_VALUE,TOTAL_N,ACTUAL_TOTAL,N1,ACTUAL1,O1
FROM DQ_TEST_OUT_AGG ORDER BY PERIOD_LEVEL,PERIOD_VALUE;

DROP TABLE DQ_TEST_OUT_AGG;
DROP TABLE DQ_TEST_OUT_CHUNKS;
`;
lex(smoke,'outlier rollup server fixture');
const smokeDb=new DatabaseSync(':memory:');
smokeDb.exec('CREATE TABLE DQ_TEST_OUT_CHUNKS ('+smokeColumns.join(',')+');'+smokeInsert);
smokeDb.exec('CREATE TABLE DQ_TEST_OUT_AGG AS '+smokeQuery);
assert.deepEqual({...smokeDb.prepare(smokeSummary).get()},{PERIOD_ROWS:10,UNIQUE_PERIOD_KEYS:10,BAD_ROWS:0});
smokeDb.close();
const smokePath=new URL('../tests/test_outlier_rollup.sql',import.meta.url);
if(process.env.DQ_WRITE_PERIOD_SMOKE==='1')fs.writeFileSync(smokePath,smoke);
else assert.equal(fs.readFileSync(smokePath,'utf8'),smoke,'Regenerate the server fixture from the updated rollup template');
console.log('Synthetic server rollup fixture checked locally: 10 distinct full period keys and correct counts. Teradata execution pending.');

// A small server preflight uses the real CTAS and statistics templates. It
// checks syntax and partition selection before an expensive RDS rerun.
const partitionVars={...stageVars,V_STAGE:'DQ_TEST_OUT_PART_STAGE',V_STAGE_PROJECTION:'"FACT_DT","AMOUNT"',
 V_DB:'DQ_DB',V_SOURCE:'DQ_TEST_OUT_PART_INPUT'};
const partitionCreate=stageCreate(partitionVars);
const partitionLoad=stageLoad(partitionVars);
const partitionStats=evaluate(assignment('V_SQL',sql.indexOf('/* Collect partition statistics'),sql),partitionVars);
const partitionDates=[['2005-01-31',7],['2005-01-31',7],['2005-02-28',-9999],
 ['2006-01-31',4],['2026-03-31',5],[null,null],['0001-01-01',-2],['9999-12-31',9]];
const partitionInserts=partitionDates.map(([date,value])=>
 `INSERT INTO DQ_DB.DQ_TEST_OUT_PART_INPUT VALUES (${date===null?'NULL':"DATE '"+date+"'"},${value===null?'NULL':value});`).join('\n');
const partitionSmoke=`/* Generated by: DQ_WRITE_PARTITION_SMOKE=1 node DQ_ENGINE/tools/check_outliers.mjs
   Replace DQ_DB with an approved test schema. No RDS scans or config changes.
   Creates two tiny permanent test tables; verify these names are unused first.
   Submit statements separately in Teradata mode. Stop on any error; do not
   continue into DROP if CREATE failed because a name already existed.
   Expected: TOTAL_ROWS=8, YEAR_KEYS=6, BAD_KEYS=0, DUPLICATE_ROWS=2.
   EXPLAIN must show partition elimination for the equality predicates.
   Tiny-row spool estimates do not establish RDS performance or AMP balance. */
CREATE MULTISET TABLE DQ_DB.DQ_TEST_OUT_PART_INPUT
    (FACT_DT DATE,AMOUNT DECIMAL(18,2)) NO PRIMARY INDEX;
${partitionInserts}

${partitionCreate};
${partitionLoad};
${partitionStats};

SHOW TABLE DQ_DB.DQ_TEST_OUT_PART_STAGE;
SELECT COUNT(*) AS TOTAL_ROWS,COUNT(DISTINCT "DQ_OS_YEAR_0") AS YEAR_KEYS,
       SUM(CASE WHEN "DQ_OS_YEAR_0"=COALESCE(EXTRACT(YEAR FROM FACT_DT),0) THEN 0 ELSE 1 END) AS BAD_KEYS
FROM DQ_DB.DQ_TEST_OUT_PART_STAGE;
SELECT COUNT(*) AS DUPLICATE_ROWS FROM DQ_DB.DQ_TEST_OUT_PART_STAGE
WHERE FACT_DT=DATE '2005-01-31' AND AMOUNT=7;

EXPLAIN SELECT COUNT(*) FROM DQ_DB.DQ_TEST_OUT_PART_STAGE WHERE "DQ_OS_YEAR_0"=2005;
EXPLAIN SELECT COUNT(*) FROM DQ_DB.DQ_TEST_OUT_PART_STAGE WHERE "DQ_OS_YEAR_0"=0;

/* Run only after inspecting the results and saving EXPLAIN output. */
DROP TABLE DQ_DB.DQ_TEST_OUT_PART_STAGE;
DROP TABLE DQ_DB.DQ_TEST_OUT_PART_INPUT;
`;
lex(partitionSmoke,'outlier partition server fixture');
const partitionDb=new DatabaseSync(':memory:');
partitionDb.function('RANDOM',(lo,hi)=>lo+(bucket++%(hi-lo+1)));
partitionDb.exec('CREATE TABLE DQ_TEST_OUT_PART_INPUT (FACT_DT TEXT,AMOUNT NUMERIC)');
const partitionPut=partitionDb.prepare('INSERT INTO DQ_TEST_OUT_PART_INPUT VALUES (?,?)');
partitionDates.forEach(r=>partitionPut.run(...r));
const partitionSelect=partitionVars.V_STAGE_SELECT;
partitionDb.exec('CREATE TABLE DQ_TEST_OUT_PART_STAGE AS '+adapt(partitionSelect).replaceAll('"DQ_DB".',''));
assert.equal(partitionDb.prepare('SELECT COUNT(*) AS N FROM DQ_TEST_OUT_PART_STAGE').get().N,8);
assert.deepEqual(partitionDb.prepare('SELECT DQ_OS_YEAR_0 AS Y,COUNT(*) AS N FROM DQ_TEST_OUT_PART_STAGE GROUP BY 1 ORDER BY 1').all().map(r=>({...r})),
 [{Y:0,N:1},{Y:1,N:1},{Y:2005,N:3},{Y:2006,N:1},{Y:2026,N:1},{Y:9999,N:1}]);
assert.equal(partitionDb.prepare("SELECT COUNT(*) AS N FROM DQ_TEST_OUT_PART_STAGE WHERE FACT_DT='2005-01-31' AND AMOUNT=7").get().N,2);
partitionDb.close();
const partitionPath=new URL('../tests/test_outlier_partition.sql',import.meta.url);
if(process.env.DQ_WRITE_PARTITION_SMOKE==='1')fs.writeFileSync(partitionPath,partitionSmoke);
else assert.equal(fs.readFileSync(partitionPath,'utf8'),partitionSmoke,'Regenerate partition server preflight after template changes');
console.log('Partition key checks passed: collisions, NULL dates, year limits, timestamps and duplicate preservation. Physical partition elimination/RANDOM/statistics syntax require the supplied Teradata preflight.');

// Reproduce the actual count-query shape for the user's completed five-field
// RDS run, without DBQL access or a full engine rerun. Source data stays in TD.
const diagnosticRun='3b807c69-1596-7a40-b091-17f815617580';
const diagnosticFields=['ARREARS_AMT','ARREARS_AVG_L6M_AMT','ARREARS_AVG_L7_12M_AMT','BALANCE_AMT','MAX_ARREARS_AMT_L6M'];
const dv={V_PROFILE_OVERALL:'Y',V_PROFILE_YEARLY:'N',V_PROFILE_MONTHLY:'Y',
 P_RUN_ID:diagnosticRun,P_PROJECT_ID:'RDS',V_DB:'DQ_DB',V_SOURCE:'DQ_DIAG_OUT_R7',V_DATE:'FACT_DT',
 V_FIRST:1,V_LAST:5,V_LIST:list,V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT,1 AS DQ_PRESENT',
 V_BOUND_PROJECTION:'',V_OVERALL_BOUND_PROJECTION:'',V_PROJECTION:'',V_ROLLUP_OVERALL:'',V_ROLLUP_YEARLY:'',V_ROLLUP_MONTHLY:'',V_CHECK:'A.ACTUAL_TOTAL<>A.TOTAL_N',
 V_STAGE:'DQ_DIAG_OUT_R7',V_STAGE_BUCKET:'DQ_OS_BUCKET_0',V_STAGE_YEAR:'DQ_OS_YEAR_0',
 V_STAGE_PROJECTION:'"FACT_DT",'+diagnosticFields.map(f=>'"'+f+'"').join(','),
 'C.CHUNK_VALUE':'2018',V_CHUNK_YEAR:'2018',V_SOURCE_FILTER:'"DQ_OS_YEAR_0"=2018'};
for(const [i,name]of diagnosticFields.entries()){
 dv['F.FIELD_NAME']=name;dv.V_SUFFIX=String(i+1);dv.V_FIELD='S.DQ_C'+(i+1);yearField(dv);
 assert.ok(appendOutlierField(dv,sql));
}
yearJoin(dv);sourceJoin(dv);
const diagnosticVars={...dv,V_SOURCE:'VW_RDS_PHASE2_FACT'};
const diagnosticStage=stageCreate(diagnosticVars);
const diagnosticLoad=stageLoad(diagnosticVars);
const diagnosticStats=evaluate(assignment('V_SQL',sql.indexOf('/* Collect partition statistics'),sql),dv);
const diagnosticBounds=evaluate(assignment('V_SQL',cursor,sql),dv).replaceAll('DQ_NO_BOUNDS','DQ_DIAG_OUT_BOUNDS');
const diagnosticCandidate=evaluate(assignment('V_PERIOD_QUERY',cursor,sql),dv).replaceAll('DQ_NO_BOUNDS','DQ_DIAG_OUT_BOUNDS');
// Preserve the historical outer-join query for a reproducible comparison with
// the current populated-chunk query. Production retains LEFT JOIN for ALL only.
function legacyPopulatedChunkQuery(q){
 assert.equal(q.split(' B0 CROSS JOIN (SELECT ').length,2);
 assert.equal(q.split(') S LEFT JOIN ').length,2);
 return q.replace(' B0 CROSS JOIN (SELECT ',' B0 LEFT JOIN (SELECT ')
  .replace(') S LEFT JOIN ',') S ON 1=1 LEFT JOIN ');
}
const diagnosticCount=legacyPopulatedChunkQuery(diagnosticCandidate);
// Compare every projected column, including NULLs and copied FLOAT bounds.
// MINUS is distinct, so also check row counts and duplicate period keys.
const diagnosticDifferences=`SELECT 'OLD_ONLY' AS DIFFERENCE_SIDE,D.* FROM
 (SELECT * FROM DQ_DIAG_OUT_OLD MINUS SELECT * FROM DQ_DIAG_OUT_NEW) D
UNION ALL
SELECT 'NEW_ONLY' AS DIFFERENCE_SIDE,D.* FROM
 (SELECT * FROM DQ_DIAG_OUT_NEW MINUS SELECT * FROM DQ_DIAG_OUT_OLD) D`;
const diagnosticComparison=`SELECT O.OLD_ROWS,N.NEW_ROWS,D.DIFFERENT_ROWS,
       K.OLD_DUPLICATE_KEYS,L.NEW_DUPLICATE_KEYS,
       CASE WHEN O.OLD_ROWS>0 AND O.OLD_ROWS=N.NEW_ROWS
                  AND D.DIFFERENT_ROWS=0 AND K.OLD_DUPLICATE_KEYS=0 AND L.NEW_DUPLICATE_KEYS=0
            THEN 'MATCH' ELSE 'MISMATCH' END AS COMPARISON_STATUS
FROM (SELECT COUNT(*) AS OLD_ROWS FROM DQ_DIAG_OUT_OLD) O
CROSS JOIN (SELECT COUNT(*) AS NEW_ROWS FROM DQ_DIAG_OUT_NEW) N
CROSS JOIN (SELECT COUNT(*) AS DIFFERENT_ROWS FROM (${diagnosticDifferences}) X) D
CROSS JOIN (SELECT COUNT(*) AS OLD_DUPLICATE_KEYS FROM
    (SELECT CHUNK_YEAR,CHUNK_VALUE FROM DQ_DIAG_OUT_OLD GROUP BY CHUNK_YEAR,CHUNK_VALUE HAVING COUNT(*)>1) X) K
CROSS JOIN (SELECT COUNT(*) AS NEW_DUPLICATE_KEYS FROM
    (SELECT CHUNK_YEAR,CHUNK_VALUE FROM DQ_DIAG_OUT_NEW GROUP BY CHUNK_YEAR,CHUNK_VALUE HAVING COUNT(*)>1) X) L;`;
const diagnosticPreflight=`SELECT 'Run 7 source, status or reporting scope differs' AS ISSUE
FROM DQ_DB.DQ_RUN_LOG L JOIN DQ_DB.DQ_RUN_NUMBER N ON L.RUN_ID=N.RUN_ID
WHERE L.RUN_ID='${diagnosticRun}' AND N.RUN_NUMBER=7 AND L.PROJECT_ID='RDS'
  AND L.STATUS='SUCCEEDED' AND UPPER(L.SOURCE_DATABASE)='DQ_DB'
  AND UPPER(L.SOURCE_TABLE)='VW_RDS_PHASE2_FACT' AND UPPER(L.REPORTING_DATE_FIELD)='FACT_DT'
  AND L.PROFILE_OVERALL='Y' AND L.PROFILE_MONTHLY='Y' AND L.PROFILE_YEARLY='N'
HAVING COUNT(*)<>1
UNION ALL
SELECT 'Numeric field names or ordinals differ' AS ISSUE
FROM DQ_DB.DQ_RUN_FIELD_CONFIG
WHERE RUN_ID='${diagnosticRun}' AND FIELD_TYPE='NUMERIC'
HAVING COUNT(*)<>5 OR SUM(CASE WHEN ${diagnosticFields.map((f,i)=>`(FIELD_ORDINAL=${i+1} AND FIELD_NAME='${f}')`).join(' OR ')} THEN 0 ELSE 1 END)<>0
UNION ALL
SELECT 'Captured numeric specials differ' AS ISSUE
FROM DQ_DB.DQ_RUN_SPECIAL_VALUE
WHERE RUN_ID='${diagnosticRun}' AND FIELD_TYPE='NUMERIC'
HAVING COUNT(DISTINCT NUMERIC_VALUE)<>21
    OR SUM(CASE WHEN NUMERIC_VALUE IN ${list} THEN 0 ELSE 1 END)<>0
UNION ALL
SELECT 'Saved overall or 2018 monthly statistics are missing' AS ISSUE
FROM DQ_DB.DQ_RUN_FIELD_CONFIG F
WHERE F.RUN_ID='${diagnosticRun}' AND F.FIELD_TYPE='NUMERIC'
  AND (NOT EXISTS (SELECT 1 FROM DQ_DB.DQ_NUMERIC_STATISTICS S
        WHERE S.RUN_ID=F.RUN_ID AND S.FIELD_NAME=F.FIELD_NAME AND S.PERIOD_LEVEL='OVERALL' AND S.PERIOD_VALUE='ALL')
    OR NOT EXISTS (SELECT 1 FROM DQ_DB.DQ_NUMERIC_STATISTICS S
        WHERE S.RUN_ID=F.RUN_ID AND S.FIELD_NAME=F.FIELD_NAME AND S.PERIOD_LEVEL='MONTHLY' AND S.PERIOD_VALUE LIKE '2018-%'));`;
const diagnostic=`/* Run 7 / RDS / five numeric fields / year 2018: plan and result comparison.
   Generated from modules/12_numeric_outliers.sql by check_outliers.mjs.
   Replace ALL DQ_DB tokens (including quoted strings) with LAB_T_ORION_MVT.
   Use one fresh SQL Assistant session and submit sections separately.
   No DBQL, catalog SELECT, new procedure, configuration load or engine CALL.
   A is read-only: it MUST return zero rows. Stop on any mismatch or error.
   B copies the current full source population for five fields ONCE into a
   partitioned permanent diagnostic table. It consumes permanent space and
   source-view spool; it does not recreate the historical source snapshot.
   C reads saved aggregate statistics only. D EXPLAIN does NOT execute counting.
   D3 optionally executes old/new counting for 2018 into small volatile tables;
   it compares all result columns without a full profiling run.
   Existing configuration, run logs, rules and results are never modified.
   Verify DQ_DIAG_OUT_R7 is unused. If CREATE fails, stop; do not proceed to DROP.
   If disconnected after B, only the permanent DQ_DIAG_OUT_R7 remains.
   Keep it isolated from normal runs and remove it with E after saving the plan. */

/* A: Check saved run metadata. Expected: ZERO rows. Do this first. */
${diagnosticPreflight}

/* B: Recreate the same physical stage, with a diagnostic-only name.
   This scans RDS once; record its elapsed minutes from SQL Assistant. */
${diagnosticStage};
${diagnosticLoad};
${diagnosticStats};

/* C: Recreate this batch's saved bounds in this session. No source scan. */
${diagnosticBounds};

/* D: Paste the complete EXPLAIN output for review. Keep EXPLAIN in place;
   this investigates one real count-query shape without executing it. */
EXPLAIN
${diagnosticCount};

/* D2: NONEMPTY 2018 chunk only. Run ONLY this EXPLAIN if A-D already succeeded
   in this session. Reuses the same stage and bounds: no table recreation and
   no engine changes. Compare with D: does the detail redistribution on constant
   overall bounds and its restoration merge join disappear? The one-row bounds
   product join itself is expected. This is not a replacement for the empty-
   source path, which must still emit its zero-population summary.
   Keep EXPLAIN; save the complete output before any timed counting test. */
EXPLAIN
${diagnosticCandidate};

/* D3: AUTOMATIC RESULT COMPARISON. If B/C already succeeded in this session,
   run D3 only; do not rebuild the stage or change the source/bounds between
   these statements. This executes the ORIGINAL and NEW 2018 counts once each.
   Submit each CREATE separately and record its elapsed time. Stop on any error.
   Only small session-local result tables are written, not engine results.
   If these names already exist, reuse them only when both were created by this
   comparison against the same unchanged stage/bounds; otherwise drop those two
   known diagnostic tables before repeating D3. Never reuse partial results. */
CREATE MULTISET VOLATILE TABLE DQ_DIAG_OUT_OLD AS (
${diagnosticCount}
) WITH DATA PRIMARY INDEX (CHUNK_YEAR,CHUNK_VALUE) ON COMMIT PRESERVE ROWS;

CREATE MULTISET VOLATILE TABLE DQ_DIAG_OUT_NEW AS (
${diagnosticCandidate}
) WITH DATA PRIMARY INDEX (CHUNK_YEAR,CHUNK_VALUE) ON COMMIT PRESERVE ROWS;

/* Expected: MATCH, OLD_ROWS=NEW_ROWS (12 for the supplied 2018 plan),
   DIFFERENT_ROWS=0, OLD_DUPLICATE_KEYS=NEW_DUPLICATE_KEYS=0.
   Both empty is NOT a pass. Exact comparison includes NULL and all columns;
   bounds are copied from the same saved values, not independently recomputed. */
${diagnosticComparison}

/* Optional detail: zero rows means no distinct value differences.
   The summary's row/duplicate checks must also pass. */
${diagnosticDifferences};

/* E: Run separately AFTER saving EXPLAIN, and only for tables this diagnostic
   created successfully. No broad cleanup and no changes to run 7.
   Skip the first two DROP statements if D3 was not run. */
DROP TABLE DQ_DIAG_OUT_OLD;
DROP TABLE DQ_DIAG_OUT_NEW;
DROP TABLE DQ_DIAG_OUT_BOUNDS;
DROP TABLE DQ_DB.DQ_DIAG_OUT_R7;
`;
lex(diagnostic,'RDS outlier plan diagnostic');
assert.ok(diagnosticCount.includes('"DQ_OS_YEAR_0"=2018'));
assert.ok(!diagnosticCount.includes('B1.'));
assert.ok(diagnosticStage.includes('PARTITION BY RANGE_N'));
const diagnosticDb=new DatabaseSync(':memory:');
diagnosticDb.exec(`CREATE TABLE DQ_RUN_LOG (RUN_ID TEXT,PROJECT_ID TEXT,STATUS TEXT,SOURCE_DATABASE TEXT,SOURCE_TABLE TEXT,REPORTING_DATE_FIELD TEXT,PROFILE_OVERALL TEXT,PROFILE_MONTHLY TEXT,PROFILE_YEARLY TEXT);
 CREATE TABLE DQ_RUN_NUMBER (RUN_ID TEXT,RUN_NUMBER INTEGER);
 CREATE TABLE DQ_RUN_FIELD_CONFIG (RUN_ID TEXT,FIELD_TYPE TEXT,FIELD_ORDINAL INTEGER,FIELD_NAME TEXT);
 CREATE TABLE DQ_RUN_SPECIAL_VALUE (RUN_ID TEXT,FIELD_TYPE TEXT,NUMERIC_VALUE NUMERIC);
 CREATE TABLE DQ_NUMERIC_STATISTICS (RUN_ID TEXT,FIELD_NAME TEXT,PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT);`);
diagnosticDb.prepare('INSERT INTO DQ_RUN_LOG VALUES (?,?,?,?,?,?,?,?,?)').run(diagnosticRun,'RDS','SUCCEEDED','DQ_DB','VW_RDS_PHASE2_FACT','FACT_DT','Y','Y','N');
diagnosticDb.prepare('INSERT INTO DQ_RUN_NUMBER VALUES (?,7)').run(diagnosticRun);
for(const [i,f]of diagnosticFields.entries()){
 diagnosticDb.prepare('INSERT INTO DQ_RUN_FIELD_CONFIG VALUES (?,?,?,?)').run(diagnosticRun,'NUMERIC',i+1,f);
 for(const [l,p]of [['OVERALL','ALL'],['MONTHLY','2018-01']])diagnosticDb.prepare('INSERT INTO DQ_NUMERIC_STATISTICS VALUES (?,?,?,?)').run(diagnosticRun,f,l,p);
}
for(const n of list.slice(1,-1).split(','))diagnosticDb.prepare('INSERT INTO DQ_RUN_SPECIAL_VALUE VALUES (?,?,?)').run(diagnosticRun,'NUMERIC',Number(n));
// SQLite needs an explicit aggregate in the SELECT of a HAVING-only query.
// Use a uniform extra aggregate/count column only on the first three branches.
const preflightParts=diagnosticPreflight.replaceAll('DQ_DB.','').split('\nUNION ALL\n');
const getIssues=()=>preflightParts.flatMap((q,i)=>diagnosticDb.prepare(i<3?q.replace(' AS ISSUE',' AS ISSUE,COUNT(*) AS N'):q).all());
assert.equal(getIssues().length,0);
for(const mutation of ["UPDATE DQ_RUN_LOG SET PROJECT_ID='OTHER'","UPDATE DQ_RUN_NUMBER SET RUN_NUMBER=8",
 "UPDATE DQ_RUN_LOG SET PROFILE_YEARLY='Y'","UPDATE DQ_RUN_FIELD_CONFIG SET FIELD_NAME='WRONG' WHERE FIELD_ORDINAL=1",
 'DELETE FROM DQ_RUN_SPECIAL_VALUE','DELETE FROM DQ_NUMERIC_STATISTICS']){
 diagnosticDb.exec('SAVEPOINT bad_metadata');diagnosticDb.exec(mutation);
 assert.ok(getIssues().length>0,mutation);diagnosticDb.exec('ROLLBACK TO bad_metadata; RELEASE bad_metadata');
}
diagnosticDb.close();
// Confirm that the join-only candidate preserves measurements for populated
// chunks, including NULL reporting dates, duplicates and special exclusions.
const joinDb=new DatabaseSync(':memory:');
joinDb.function('CHARACTER_LENGTH',x=>x?.length??null);
joinDb.exec('CREATE TABLE DQ_DIAG_OUT_R7 (FACT_DT TEXT,'+diagnosticFields.map(f=>'"'+f+'" NUMERIC').join(',')+',DQ_OS_YEAR_0 INTEGER)');
joinDb.exec('CREATE TABLE DQ_DIAG_OUT_BOUNDS (PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,TOTAL_N INTEGER,'+
 diagnosticFields.flatMap((_,i)=>['N'+(i+1)+' INTEGER','L'+(i+1)+' NUMERIC','U'+(i+1)+' NUMERIC']).join(',')+')');
const joinPopulation=raw.map(r=>[r[0]===null?null:'2018'+r[0].slice(4).replace('-02-29','-02-28'),...r.slice(1,6)]);
const joinPut=joinDb.prepare('INSERT INTO DQ_DIAG_OUT_R7 VALUES (?,?,?,?,?,?,?)');
joinPopulation.forEach(r=>joinPut.run(...r,r[0]===null?0:2018));
const joinGroups=new Map([['OVERALL/ALL',joinPopulation]]);
for(const row of joinPopulation){const key='MONTHLY/'+(row[0]?.slice(0,7)??'UNKNOWN');if(!joinGroups.has(key))joinGroups.set(key,[]);joinGroups.get(key).push(row);}
for(const [key,pop]of joinGroups){
 const [level,value]=key.split('/');
 const bounds=diagnosticFields.flatMap((_,i)=>{const s=stats(pop.map(r=>r[i+1]).filter(x=>x!==null&&x!==-9999));
  return [s.n,s.sd===null?null:s.mean-3*s.sd,s.sd===null?null:s.mean+3*s.sd];});
 joinDb.prepare('INSERT INTO DQ_DIAG_OUT_BOUNDS VALUES ('+Array(18).fill('?').join(',')+')').run(level,value,pop.length,...bounds);
}
const joinAdapt=q=>adapt(q).replaceAll('"DQ_DB".','');
for(const chunk of ['2018','UNKNOWN']){
 const jv={...dv,'C.CHUNK_VALUE':chunk,V_CHUNK_YEAR:chunk,V_SOURCE_FILTER:'"DQ_OS_YEAR_0"='+(chunk==='UNKNOWN'?0:2018)};
 sourceJoin(jv);
 const optimized=evaluate(assignment('V_PERIOD_QUERY',cursor,sql),jv).replaceAll('DQ_NO_BOUNDS','DQ_DIAG_OUT_BOUNDS');
 const baseline=legacyPopulatedChunkQuery(optimized);
 const expected=joinDb.prepare(joinAdapt(baseline)).all();
 const actual=joinDb.prepare(joinAdapt(optimized)).all();
 const sort=rs=>rs.sort((a,b)=>String(a.CHUNK_VALUE).localeCompare(String(b.CHUNK_VALUE)));
 assert.ok(expected.length>0);assert.deepEqual(sort(actual),sort(expected));
}
joinDb.exec('CREATE TABLE DQ_DIAG_OUT_OLD AS '+joinAdapt(diagnosticCount));
joinDb.exec('CREATE TABLE DQ_DIAG_OUT_NEW AS '+joinAdapt(diagnosticCandidate));
const compareQuery=diagnosticComparison.replaceAll(' MINUS ',' EXCEPT ');
const comparison=()=>({...joinDb.prepare(compareQuery).get()});
assert.deepEqual(comparison(),{OLD_ROWS:2,NEW_ROWS:2,DIFFERENT_ROWS:0,OLD_DUPLICATE_KEYS:0,NEW_DUPLICATE_KEYS:0,COMPARISON_STATUS:'MATCH'});
for(const mutation of [
 "DELETE FROM DQ_DIAG_OUT_NEW WHERE CHUNK_VALUE='2018-01'",
 "UPDATE DQ_DIAG_OUT_NEW SET MO1=MO1+1 WHERE CHUNK_VALUE='2018-01'",
 "UPDATE DQ_DIAG_OUT_NEW SET YL1=0 WHERE CHUNK_VALUE='2018-01'",
 'INSERT INTO DQ_DIAG_OUT_NEW SELECT * FROM DQ_DIAG_OUT_NEW',
 'DELETE FROM DQ_DIAG_OUT_OLD; DELETE FROM DQ_DIAG_OUT_NEW'
]){
 joinDb.exec('SAVEPOINT mismatch');joinDb.exec(mutation);
 assert.equal(comparison().COMPARISON_STATUS,'MISMATCH',mutation);
 joinDb.exec('ROLLBACK TO mismatch; RELEASE mismatch');
}
joinDb.exec('DROP TABLE DQ_DIAG_OUT_OLD; DROP TABLE DQ_DIAG_OUT_NEW');
joinDb.exec('DELETE FROM DQ_DIAG_OUT_R7');
assert.equal(joinDb.prepare(joinAdapt(diagnosticCandidate)).all().length,0,'candidate intentionally not used for empty-source chunks');
assert.equal(joinDb.prepare(joinAdapt(diagnosticCount)).all().length,1,'original outer join retains empty-source summary');
joinDb.close();
const diagnosticPath=new URL('../tests/diagnose_outlier_rds_run7.sql',import.meta.url);
if(process.env.DQ_WRITE_RDS_DIAGNOSTIC==='1')fs.writeFileSync(diagnosticPath,diagnostic);
else assert.equal(fs.readFileSync(diagnosticPath,'utf8'),diagnostic,'Regenerate the RDS plan diagnostic after template changes');
console.log('RDS plan diagnostic checked: actual stage/bounds/count templates, metadata mismatch checks, EXPLAIN and optional result comparison. No RDS data or Teradata plan accessed locally.');
console.log('Nonempty chunk join candidate passed: identical measurements for populated and NULL-date chunks; empty-source distinction retained. Production uses the tested conditional join.');
console.log('Automatic diagnostic comparison passed: all-column equality, NULL changes, missing rows, duplicate keys and both-empty rejection. Teradata execution pending.');

// Lifecycle/API structure: materialize a bounded group before its statistics, use the
// stage for subsequent reads, never overwrite another run's table, drop only
// the successfully-created table, and retain creation SQL for abort recovery.
assert.equal([...sql.matchAll(/CREATE MULTISET TABLE DQ_DB\./g)].length,1);
assert.ok(sql.indexOf('SET V_STAGE_EXISTS=1')<sql.indexOf('CALL DQ_DB.SP_DQ_NUMERIC_STATS_BATCH'));
assert.ok(sql.includes("SET V_DB ='DQ_DB'"));assert.ok(sql.includes('SET V_SOURCE =V_STAGE'));
assert.equal([...sql.matchAll(/DROP TABLE DQ_DB\./g)].length,2);
assert.ok(sql.includes("' TO DQ_DB WITH GRANT OPTION'"));
assert.ok(sql.indexOf('SET V_STAGE_EXISTS=1')<sql.indexOf("SET V_SQL ='INSERT INTO DQ_DB.'"),'ownership must precede a failing load');
assert.ok(sql.includes('IF V_LAST=V_STAGE_LAST THEN'),'release each copy at the end of its field group');
assert.ok(ns.includes('REPLACE PROCEDURE DQ_DB.SP_DQ_NUMERIC_STATS_BATCH'));
assert.ok(ns.includes('SET V_FIRST =P_FIELD_FIRST'));
assert.ok(ns.includes('P_FIELD_LAST'));
assert.ok(ns.includes('P_LOG_BATCH'));
assert.ok(ns.includes('IF P_FIELD_LAST>=V_FIELDS THEN'));
assert.ok(sql.indexOf("VALUES (P_RUN_ID,'NUMERIC_OUTLIERS',V_ATTEMPT,V_BATCH")<sql.indexOf("SET V_SQL ='CREATE MULTISET TABLE"),'field-batch log must precede loading');
assert.ok(ns.includes('REPLACE PROCEDURE DQ_DB.SP_DQ_NUMERIC_STATISTICS'));
assert.ok(ns.includes('CALL DQ_DB.SP_DQ_NUMERIC_STATS_SOURCE(P_RUN_ID,P_PROJECT_ID,V_DB,V_SOURCE,V_DATE)'));
console.log('Narrow stage checks passed: native column projection, unchanged rows/duplicates, source independence, standalone stage statistics and isolated cleanup structure. Server DDL/grants/abort cleanup NOT tested.');

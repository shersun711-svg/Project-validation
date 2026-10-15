/* Storage regression: execute actual staging/cursor/statistics SQL on a
   synthetic 415-field source. SPL scheduling and quota failures are modelled;
   this is not a Teradata compiler, disk quota or transaction test. */
import fs from 'node:fs';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {assignment,evaluate} from './check_static.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/SET (\w+)=/g,'SET $1 =');
const out=read('teradata/modules/12_numeric_outliers.sql');
const stats=read('teradata/modules/03_numeric_statistics.sql');
const db=new DatabaseSync(':memory:');db.exec("ATTACH DATABASE ':memory:' AS SOURCE");
let bucket=0;db.function('RANDOM',(lo,hi)=>lo+(bucket++%(hi-lo+1)));
db.function('CHARACTER_LENGTH',x=>x?.length??null);
db.aggregate('STDDEV_POP',{start:()=>({n:0,mean:0,m2:0}),step:(s,x)=>{if(x!==null){s.n++;const d=x-s.mean;s.mean+=d/s.n;s.m2+=d*(x-s.mean);}return s;},result:s=>s.n?Math.sqrt(s.m2/s.n):null});
const fields=Array.from({length:415},(_,i)=>'F'+String(i+1).padStart(3,'0'));
db.exec('CREATE TABLE SOURCE.FIXTURE (FACT_DT TEXT,'+fields.map(n=>n+' NUMERIC').join(',')+')');
const put=db.prepare('INSERT INTO SOURCE.FIXTURE VALUES ('+Array(416).fill('?').join(',')+')');
put.run('2005-01-31',...fields.map((_,i)=>i+1));
put.run('2006-01-31',...fields.map(()=>-9999));
put.run(null,...fields.map(()=>null));
db.exec(`CREATE TABLE DQ_RUN_FIELD_CONFIG (RUN_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT,FIELD_ORDINAL INTEGER);
 CREATE TABLE DQ_NUMERIC_STATISTICS (RUN_ID TEXT,FIELD_NAME TEXT,PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,TOTAL_COUNT INTEGER,VALID_COUNT INTEGER,MEAN_VALUE NUMERIC,STDDEV_VALUE NUMERIC);`);
const id='70000000-0000-4000-8000-000000000001';
fields.forEach((n,i)=>db.prepare('INSERT INTO DQ_RUN_FIELD_CONFIG VALUES (?,?,?,?)').run(id,n,'NUMERIC',i+1));
const adapt=q=>q.replaceAll('DQ_DB.','')
 .replaceAll('EXTRACT(YEAR FROM "FACT_DT")',"CAST(strftime('%Y',FACT_DT) AS INTEGER)")
 .replaceAll('EXTRACT(YEAR FROM S.DQ_DT)',"CAST(strftime('%Y',S.DQ_DT) AS INTEGER)")
 .replaceAll('EXTRACT(MONTH FROM S.DQ_DT)',"CAST(strftime('%m',S.DQ_DT) AS INTEGER)");
function scalar(source,name,vars,start=0){
 const q=assignment(name,start,source).replaceAll('LEAST(','MIN(')
   .replace(/\b(?:V_|P_)[A-Z0-9_]+\b/g,n=>':'+n);
 return db.prepare('SELECT '+q+' AS N').get(vars).N;
}
function cursor(source,marker,vars){
 const start=source.indexOf('SELECT FIELD_NAME',source.indexOf(marker));
 const end=source.indexOf('ORDER BY FIELD_ORDINAL',start)+'ORDER BY FIELD_ORDINAL'.length;
 const q=source.slice(start,end).replaceAll('DQ_DB.','')
   .replace(/\b(?:V_|P_)[A-Z0-9_]+\b/g,n=>':'+n);
 return db.prepare(q).all(vars);
}
const work=out.indexOf('FOR W AS'),loadAt=out.indexOf('SET V_STAGE_EXISTS =1');
function prepareStage(v){
 v.V_STAGE_PROJECTION='"FACT_DT"';
 const selected=cursor(out,'FOR W AS',{P_RUN_ID:id,V_STAGE_FIRST:v.V_STAGE_FIRST,V_STAGE_LAST:v.V_STAGE_LAST});
 for(const f of selected){v['W.FIELD_NAME']=f.FIELD_NAME;v.V_STAGE_PROJECTION=evaluate(assignment('V_STAGE_PROJECTION',work,out),v);}
 v.V_STAGE=evaluate(assignment('V_STAGE',0,out),{...v,"OREPLACE(TRIM(P_RUN_ID),'-','')":id.replaceAll('-','')});
 v.V_STAGE_SELECT=evaluate(assignment('V_STAGE_SELECT',work,out),v);
 const create=evaluate(assignment('V_SQL',work,out),v);
 assert.match(create,/WITH NO DATA PRIMARY INDEX/);
 assert.match(create,/PARTITION BY RANGE_N/);
 // WITH NO DATA establishes the exact SELECT schema but loads no rows.
 db.exec('CREATE TABLE '+v.V_STAGE+' AS '+adapt(v.V_STAGE_SELECT)+' WHERE 0');
 assert.equal(db.prepare('SELECT COUNT(*) AS N FROM '+v.V_STAGE).get().N,0);
 assert.equal(db.prepare("SELECT COUNT(*) AS N FROM sqlite_master WHERE type='table' AND name LIKE 'DQ_OS_%'").get().N,1);
 const load=evaluate(assignment('V_SQL',loadAt,out),v);
 assert.doesNotMatch(load,/DISTINCT| WHERE /);
 return {selected,load:adapt(load)};
}
function boundedStatistics(v,first,last,batch,setting){
 const bindings={P_RUN_ID:id,V_FIRST:first,V_LAST:last};
 const selected=cursor(stats,'FOR F AS',bindings);
 assert.equal(selected.length,last-first+1);
 const actualLast=scalar(stats,'V_LAST',{V_FIRST:first,V_SIZE:Math.min(setting,10),V_FIELDS:415,P_FIELD_LAST:last},stats.indexOf('WHILE V_FIRST'));
 assert.equal(actualLast,last,'statistics must stop at this counting batch');
 assert.equal(scalar(stats,'V_BATCH',{P_LOG_BATCH:batch}),batch-1);
 const q={P_RUN_ID:id,P_PROJECT_ID:'RDS',V_DB:'main',V_SOURCE:v.V_STAGE,V_DATE:'FACT_DT',
  V_LIST:'(-9999)',V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT',V_PROJECTION:''};
 for(const f of selected){q['F.FIELD_NAME']=f.FIELD_NAME;q.V_SUFFIX=String(f.FIELD_ORDINAL);q.V_FIELD='S.DQ_C'+q.V_SUFFIX;
  for(const name of ['V_SOURCE_PROJECTION','V_PROJECTION'])q[name]=evaluate(assignment(name,stats.indexOf('FOR F AS'),stats),q);
 }
 for(const [i,marker]of ['IF V_PASS=1 THEN','            ELSE\n                SET V_GROUP_QUERY'].entries()){
  const select=adapt(evaluate(assignment('V_GROUP_QUERY',stats.indexOf(marker),stats),q));
  db.exec(i===0?'CREATE TABLE DQ_NS_AGG AS '+select:'INSERT INTO DQ_NS_AGG '+select);
 }
 q.V_LEVEL=evaluate(assignment('V_LEVEL',0,stats),q);q.V_PERIOD=evaluate(assignment('V_PERIOD',0,stats),q);
 for(const f of selected){q['R.FIELD_NAME']=f.FIELD_NAME;q.V_SUFFIX=String(f.FIELD_ORDINAL);
  db.exec(adapt(evaluate(assignment('V_SQL',stats.indexOf('FOR R AS'),stats),q)));
 }
 db.exec('DROP TABLE DQ_NS_AGG');
}
for(const setting of [1,5,10,15,20,25,30]){
 db.exec('DELETE FROM DQ_NUMERIC_STATISTICS');
 const size=scalar(out,'V_STAGE_SIZE',{V_SIZE:setting}),countSize=scalar(out,'V_SIZE',{V_SIZE:setting});
 assert.equal(size,Math.min(setting,20));assert.equal(countSize,Math.min(setting,5));
 let first=1,batch=0,staged=0,copies=0;const tested=[],names=new Set();
 while(first<=415){
  const stageFirst=first;
  const stageLast=scalar(out,'V_STAGE_LAST',{V_STAGE_FIRST:first,V_STAGE_SIZE:size,V_FIELDS:415});
  const v={V_STAGE_FIRST:stageFirst,V_STAGE_LAST:stageLast,V_BATCH:batch+1,V_ATTEMPT:1,
   V_DB:'SOURCE',V_SOURCE:'FIXTURE',V_DATE:'FACT_DT',V_STAGE_BUCKET:'DQ_OS_BUCKET_0',V_STAGE_YEAR:'DQ_OS_YEAR_0'};
  const {selected,load}=prepareStage(v);db.exec(load);copies++;
  assert.ok(!names.has(v.V_STAGE));names.add(v.V_STAGE);
  assert.ok(selected.length<=20);staged+=selected.length;
  assert.equal(db.prepare('PRAGMA table_info('+v.V_STAGE+')').all().length,selected.length+3);
  assert.deepEqual(db.prepare('SELECT '+v.V_STAGE_PROJECTION+' FROM '+v.V_STAGE).all(),db.prepare('SELECT '+v.V_STAGE_PROJECTION+' FROM SOURCE.FIXTURE').all());
  while(first<=stageLast){
   batch++;const last=scalar(out,'V_LAST',{V_FIRST:first,V_SIZE:countSize,V_FIELDS:415,V_STAGE_LAST:stageLast},out.indexOf('WHILE V_FIRST<=V_FIELDS'));
   const selectedCount=cursor(out,'FOR F AS',{P_RUN_ID:id,V_FIRST:first,V_LAST:last});
   assert.ok(selectedCount.length<=5);tested.push(...selectedCount.map(f=>f.FIELD_NAME));
   // Statistics use only the current fields, even though the copy is wider.
   boundedStatistics(v,first,last,batch,setting);
   first=last+1;
  }
  assert.equal(first-1,stageLast);
  db.exec('DROP TABLE '+v.V_STAGE);
  assert.equal(db.prepare("SELECT COUNT(*) AS N FROM sqlite_master WHERE type='table' AND name LIKE 'DQ_OS_%'").get().N,0);
 }
 assert.deepEqual(tested,fields);assert.equal(staged,415);assert.equal(copies,Math.ceil(415/size));
 const saved=db.prepare('SELECT * FROM DQ_NUMERIC_STATISTICS').all();assert.equal(saved.length,415*4);
 for(const r of saved){
  if(r.PERIOD_LEVEL==='OVERALL'){
   assert.equal(r.TOTAL_COUNT,3);assert.equal(r.VALID_COUNT,1);assert.equal(r.MEAN_VALUE,Number(r.FIELD_NAME.slice(1)));assert.equal(r.STDDEV_VALUE,0);
  }
 }
}
// A failed load must be able to drop an owned, already-created empty table.
const failure={V_STAGE_FIRST:1,V_STAGE_LAST:10,V_BATCH:1,V_ATTEMPT:2,V_DB:'SOURCE',V_SOURCE:'FIXTURE',V_DATE:'FACT_DT',V_STAGE_BUCKET:'DQ_OS_BUCKET_0',V_STAGE_YEAR:'DQ_OS_YEAR_0'};
const prepared=prepareStage(failure);
db.exec('CREATE TRIGGER reject_load BEFORE INSERT ON '+failure.V_STAGE+" BEGIN SELECT RAISE(ABORT,'simulated quota failure'); END");
assert.throws(()=>db.exec(prepared.load),/simulated quota/);
const dropExpression=out.match(/CALL DBC\.SysExecSQL\(('DROP TABLE DQ_DB\.' \|\| V_STAGE)\)/)[1];
db.exec(evaluate(dropExpression,failure).replaceAll('DQ_DB.',''));
assert.equal(db.prepare("SELECT COUNT(*) AS N FROM sqlite_master WHERE name=?").get(failure.V_STAGE).N,0);
assert.ok(out.indexOf('SET V_STAGE_EXISTS=1')<out.indexOf("SET V_SQL ='INSERT INTO DQ_DB.'"));
assert.ok(out.includes('IF V_LAST=V_STAGE_LAST THEN'));
assert.ok(stats.includes('IF P_FIELD_LAST>=V_FIELDS THEN'));
assert.ok(stats.includes('P_SOURCE_DATABASE,P_SOURCE_TABLE,P_REPORTING_DATE_FIELD,1,2147483647,1'));
db.close();
console.log('Outlier storage checks passed: 415 fields at widths 1/5/10/15/20/25/30; max 20 copied, max 5 counted, one copy at a time, no missing/duplicate fields, same-copy bounded statistics and simulated load-failure cleanup. Teradata quotas/SPL/transactions NOT tested.');

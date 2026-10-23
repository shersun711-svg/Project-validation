/* Shared-copy Basic equivalence and coordination checks. Generated SQL runs on
   SQLite; SPL control flow, grants, cleanup transactions and performance do not. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {assignment,evaluate,numericParts,groupingVariables} from './check_static.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const basic=read('teradata/modules/10_numeric_basic.sql'),out=read('teradata/modules/12_numeric_outliers.sql'),runner=read('teradata/modules/00_run_engine.sql');
const db=new DatabaseSync(':memory:');db.exec("ATTACH DATABASE ':memory:' AS SOURCE");
db.function('CHARACTER_LENGTH',s=>s?.length??null);
db.aggregate('STDDEV_POP',{start:()=>({n:0,m:0,s:0}),step:(s,x)=>{if(x!==null){s.n++;const d=x-s.m;s.m+=d/s.n;s.s+=d*(x-s.m);}return s;},result:s=>s.n?Math.sqrt(s.s/s.n):null});
const fields=Array.from({length:41},(_,i)=>'F'+String(i+1).padStart(3,'0'));
db.exec('CREATE TABLE SOURCE.FIXTURE (FACT_DT TEXT,'+fields.map(f=>f+' NUMERIC').join(',')+'); CREATE TABLE DQ_METRIC_DEFINITION (MODULE_NAME TEXT,METRIC_ORDINAL INTEGER,METRIC_NAME TEXT,IS_PERCENTAGE TEXT)');
for(const [,n,name,pct]of read('teradata/setup/00_create_config_tables.sql').matchAll(/VALUES \('NUMERIC_BASIC',(\d+),'([^']+)','([YN])'\)/g))db.prepare('INSERT INTO DQ_METRIC_DEFINITION VALUES (?,?,?,?)').run('NUMERIC_BASIC',+n,name,pct);
const raw=Array.from({length:40},(_,i)=>[i<33?'2005-01-31':i<37?'2006-02-28':null,...fields.map((_,j)=>j===0?null:j===1?-9999:j===2?7:i===0?-100:i===1?100:i%9===0?-9999:i%7===0?null:(i+j)%5)]);
const load=()=>{db.exec('DELETE FROM SOURCE.FIXTURE');const put=db.prepare('INSERT INTO SOURCE.FIXTURE VALUES ('+Array(fields.length+1).fill('?').join(',')+')');raw.forEach(r=>put.run(...r));};load();
const adapt=q=>q.replaceAll('DQ_DB.','').replaceAll('CURRENT_TIMESTAMP(6)',"'FIXED_TIMESTAMP'")
 .replaceAll('CAST(S.DQ_DT AS DATE)','date(S.DQ_DT)').replaceAll('CAST(NULL AS DATE)','CAST(NULL AS TEXT)')
 .replaceAll('EXTRACT(YEAR FROM S.DQ_DT)',"CAST(strftime('%Y',S.DQ_DT) AS INTEGER)")
 .replaceAll('EXTRACT(MONTH FROM S.DQ_DT)',"CAST(strftime('%m',S.DQ_DT) AS INTEGER)");
function sqliteGroups(q){
 const at=q.indexOf(' GROUP BY GROUPING SETS (');if(at<0)return adapt(q);
 const body=q.slice(0,at),sets=q.slice(at+' GROUP BY GROUPING SETS ('.length,-1).match(/\((?:EXTRACT\([^)]*\)(?:,EXTRACT\([^)]*\))?)?\)/g);assert.ok(sets?.length);
 return sets.map(set=>{let text=body;
  for(const name of ['YEAR','MONTH']){const present=set.includes(name);text=text.replaceAll('GROUPING(EXTRACT('+name+' FROM S.DQ_DT))',present?'0':'1');if(!present)text=text.replaceAll('EXTRACT('+name+' FROM S.DQ_DT)','CAST(NULL AS INTEGER)');}
  return adapt(text+(set==='()'?'':' GROUP BY '+set.slice(1,-1)));
 }).join(' UNION ALL ');
}
function basicResult(database,table,first,last,levels){
 const v={...groupingVariables(basic,...levels),V_DB:database,V_SOURCE:table,V_DATE:'FACT_DT',V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT',V_PROJECTION:'',V_SPECIAL_LIST:'(-9999)'};
 for(let i=first;i<=last;i++){v['F.FIELD_NAME']=fields[i-1];v.V_SUFFIX=String(i);v.V_FIELD='S.DQ_F'+i;v.V_CLEAN='S.DQ_C'+i;numericParts(v,basic);v.V_SOURCE_PROJECTION+=v.V_SOURCE_PART;v.V_PROJECTION+=v.V_METRIC_PART;}
 const q=evaluate(assignment('V_SQL',basic.indexOf('/* GROUPING distinguishes'),basic),v);
 db.exec('CREATE TABLE DQ_NB_AGG AS '+sqliteGroups(q.slice(q.indexOf(' AS (')+5,q.lastIndexOf(') WITH DATA'))));
 const result={metrics:[],statistics:[],availability:[]};
 for(let i=first;i<=last;i++){
  const bindings={P_RUN_ID:'50000000-0000-4000-8000-000000000001',P_PROJECT_ID:'SHARED_TEST','R.FIELD_NAME':fields[i-1],V_SUFFIX:String(i)};
  for(const [key,marker]of [['metrics','FOR R AS'],['statistics','/* Keep unrounded'],['availability','/* Coverage is overall-only']]){
   const insert=evaluate(assignment('V_SQL',basic.indexOf(marker),basic),bindings);
   result[key].push(...db.prepare(adapt(insert.slice(insert.indexOf(' SELECT ')+1))).all().map(r=>Object.values(r)));
  }
 }
 db.exec('DROP TABLE DQ_NB_AGG');
 for(const key of Object.keys(result))result[key].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return result;
}
for(const empty of [false,true]){
 load();if(empty)db.exec('DELETE FROM SOURCE.FIXTURE');
 for(const mask of [1,2,3,4,5,6,7]){
  const levels=[1,2,4].map(bit=>mask&bit?'Y':'N');let copied=0;const tested=[];
  for(let first=1;first<=41;first+=20){const last=Math.min(first+19,41),selected=fields.slice(first-1,last);
   const baseline=basicResult('SOURCE','FIXTURE',first,last,levels);
   db.exec('CREATE TABLE SHARED_STAGE AS SELECT FACT_DT,'+selected.join(',')+' FROM SOURCE.FIXTURE');copied++;
   assert.equal(db.prepare('PRAGMA table_info(SHARED_STAGE)').all().length,selected.length+1);
   // Make any accidental original-source read observably wrong.
   db.exec('UPDATE SOURCE.FIXTURE SET '+selected.map(f=>f+'=123456').join(','));
   const actual=basicResult('main','SHARED_STAGE',first,last,levels);assert.deepEqual(actual,baseline,'shared stage '+first+' scope='+mask+' empty='+empty);
   assert.equal(actual.availability.length,selected.length);
   if(!empty&&mask===7&&first===1){
    const metrics=actual.metrics.filter(r=>r[2]==='F001'&&r[5]==='OVERALL');assert.equal(metrics.length,12);
    // Three snapshot domains plus OVERALL/YEARLY make all groups explicit.
    assert.ok(actual.statistics.some(r=>r[1]==='F002'&&r[2]==='OVERALL'&&r[5]===0));
   }
   db.exec('DROP TABLE SHARED_STAGE');tested.push(...selected);load();if(empty)db.exec('DELETE FROM SOURCE.FIXTURE');
  }
  assert.equal(copied,3);assert.deepEqual(tested,fields);
 }
}
assert.match(runner,/IF P_NUMERIC='Y' AND P_OUTLIERS='Y' THEN\s+CALL DQ_DB.SP_DQ_NUMERIC_PIPELINE\(P_RUN_ID,P_PROJECT_ID,'Y'\);\s+ELSEIF P_NUMERIC='Y'/);
assert.match(runner,/IF P_OUTLIERS='Y' AND P_NUMERIC='N' THEN\s+CALL DQ_DB.SP_DQ_NUMERIC_OUTLIERS/);
assert.match(out,/IF P_INCLUDE_BASIC='Y' THEN\s+CALL DQ_DB.SP_DQ_NUMERIC_BASIC_BATCH\(P_RUN_ID,P_PROJECT_ID,V_DB,V_SOURCE,V_DATE,\s+V_FIRST,V_LAST,V_BATCH\)/);
assert.match(out,/V_COUNT=0 AND P_INCLUDE_BASIC='N'/);
assert.ok(out.indexOf('SET V_SOURCE=V_STAGE')<out.indexOf('CALL DQ_DB.SP_DQ_NUMERIC_BASIC_BATCH'));
assert.ok(out.indexOf('CALL DQ_DB.SP_DQ_NUMERIC_BASIC_BATCH')<out.indexOf('/* Bounds table contains'));
assert.ok(out.indexOf('CALL DQ_DB.SP_DQ_NUMERIC_BASIC_BATCH')<out.lastIndexOf("'DROP TABLE DQ_DB.'"));
assert.match(out,/MODULE_NAME IN \('NUMERIC_OUTLIERS','NUMERIC_PREPARE'\)/);
assert.match(out,/NUMERIC_PREPARE/);
assert.match(basic,/WHILE V_FIRST <= V_FIELDS AND V_FIRST<=P_FIELD_LAST/);
assert.match(basic,/V_LAST = LEAST\(V_FIRST \+ V_SIZE - 1,V_FIELDS,P_FIELD_LAST\)/);
assert.match(basic,/IF P_FIELD_LAST>=V_FIELDS THEN/);
assert.match(basic,/SELECT COALESCE\(MAX\(BATCH_ID\),0\) INTO V_BATCH/);
assert.match(basic,/RESIGNAL; \/\* Let the pipeline release/);
assert.doesNotMatch(basic,/UPDATE DQ_DB.DQ_RUN_LOG\s+SET SOURCE_DATABASE|DELETE FROM DQ_DB.DQ_RUN_FIELD_CONFIG|FROM DQ_DB.DQ_FIELD_CONFIG/);
for(const [body,name]of [[basic,'SP_DQ_NUMERIC_BASIC_BATCH'],[out,'SP_DQ_NUMERIC_PIPELINE']])assert.ok(body.includes('GRANT EXECUTE PROCEDURE ON DQ_DB.'+name+' TO DQ_DB;'));
console.log('Shared numeric copy checks passed: Basic metrics, full-precision prerequisites, POU_DT and availability match direct-source results for 41 fields in three bounded groups, seven scopes, empty/special/NULL populations and changed-original-source isolation. Routing/cleanup structure checked; Teradata SPL/transactions/spool/runtime NOT executed.');

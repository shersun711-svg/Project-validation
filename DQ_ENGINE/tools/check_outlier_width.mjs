/* SQL-width scheduling checks from actual fragments; no Teradata execution. */
import fs from 'node:fs';import assert from 'node:assert/strict';
import {assignment,evaluate,lex} from './check_static.mjs';
import {appendOutlierField} from './outlier_fragments.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('teradata/modules/12_numeric_outliers.sql').replace(/SET (\w+)=/g,'SET $1 =');
const cursor=sql.indexOf('FOR F AS');
const fields=read('config/rds_fields.csv').trim().split('\n').slice(1).map(l=>l.split(',')).filter(r=>r[1]==='NUMERIC').map(r=>r[0]).sort();
const list='('+read('config/special_values.csv').trim().split('\n').slice(1).filter(l=>l.startsWith('NUMERIC,')).map(l=>Number(l.split(',')[1]).toFixed(10)).join(',')+')';
const widths=Object.fromEntries([...sql.matchAll(/DECLARE (\w+) VARCHAR\((\d+)\)/g)].map(([,name,size])=>[name,+size]));
function field(v){
 const at=sql.indexOf("IF V_PROFILE_YEARLY='Y' THEN",cursor),branch=v.V_PROFILE_YEARLY==='Y'?at:sql.indexOf('ELSE',at);
 for(const key of ['V_YEAR_BOUNDS','V_YEAR_COUNT'])v[key]=evaluate(assignment(key,branch,sql),v);
 return appendOutlierField(v,sql);
}
function plan(names,specials,levels){
 const batches=[];let first=0;
 while(first<names.length){
  const stageEnd=Math.min(Math.floor(first/20)*20+20,names.length);
  const v={V_PROFILE_OVERALL:levels[0],V_PROFILE_YEARLY:levels[1],V_PROFILE_MONTHLY:levels[2],
   P_RUN_ID:'40000000-0000-4000-8000-000000000001',P_PROJECT_ID:'RDS',
   V_DB:'D'.repeat(128),V_SOURCE:'S'.repeat(128),V_DATE:'F'.repeat(128),
   V_LIST:specials,V_FIRST:first+1,V_LAST:stageEnd,V_SOURCE_PROJECTION:'"'+'F'.repeat(128)+'" AS DQ_DT,1 AS DQ_PRESENT',
   V_BOUND_PROJECTION:'',V_OVERALL_BOUND_PROJECTION:'',V_PROJECTION:'',V_ROLLUP_OVERALL:'',V_ROLLUP_YEARLY:'',V_ROLLUP_MONTHLY:'',V_CHECK:'A.ACTUAL_TOTAL<>A.TOTAL_N'};
  let count=0;
  for(let i=first;i<stageEnd;i++){
   v['F.FIELD_NAME']=names[i];v.V_SUFFIX=String(i+1);v.V_FIELD='S.DQ_C'+v.V_SUFFIX;
   if(!field(v))break;count++;
  }
  assert.ok(count>0);v.V_LAST=first+count;
  for(const [name,value]of Object.entries(v))if(widths[name]&&typeof value==='string')assert.ok(value.length<=widths[name],name);
  const bound=evaluate(assignment('V_SQL',cursor,sql),v);lex(bound,'wide bounds');assert.ok(bound.length<32000);
  for(const chunk of ['9999','UNKNOWN','ALL']){
   v['C.CHUNK_VALUE']=chunk;v.V_CHUNK_YEAR=chunk;v.V_SOURCE_FILTER='"DQ_OS_YEAR_0"=9999';
   v.V_SOURCE_JOIN=chunk==='ALL'?' LEFT JOIN ':' CROSS JOIN ';v.V_SOURCE_JOIN_ON=chunk==='ALL'?' ON 1=1':'';
   v.V_YEAR_TOTAL='CAST(NULL AS BIGINT)';v.V_YEAR_JOIN='';
   if(levels[1]==='Y'){
    const at=sql.indexOf("IF V_PROFILE_YEARLY='Y' THEN",sql.indexOf("SET V_YEAR_TOTAL ="));
    for(const key of ['V_YEAR_TOTAL','V_YEAR_JOIN'])v[key]=evaluate(assignment(key,at,sql),v);
   }
   v.V_PERIOD_QUERY=evaluate(assignment('V_PERIOD_QUERY',cursor,sql),v);
   const query=evaluate(assignment('V_SQL',sql.indexOf("SET V_SQL ='CREATE MULTISET VOLATILE TABLE DQ_NO_CHUNKS"),sql),v);
   lex(query,'wide chunk');assert.ok(query.length<32000,query.length);
  }
  const start=sql.indexOf("SET V_QUERY_OVERALL =''");let prior=false;
  for(const [i,level]of ['OVERALL','YEARLY','MONTHLY'].entries()){
   const key='V_QUERY_'+level;v[key]=levels[i]==='Y'?evaluate(assignment(key,sql.indexOf("IF V_PROFILE_"+level+"='Y' THEN",start),sql),v):'';
   if(v[key]){if(prior)v[key]=' UNION ALL '+v[key];prior=true;}
  }
  v.V_ROLLUP_QUERY=evaluate(assignment('V_ROLLUP_QUERY',start,sql),v);assert.ok(v.V_ROLLUP_QUERY.length<=widths.V_ROLLUP_QUERY);
  lex(v.V_ROLLUP_QUERY,'wide rollup');batches.push({first:first+1,last:first+count,count});first+=count;
 }
 assert.deepEqual(batches.flatMap(b=>Array.from({length:b.count},(_,i)=>b.first+i)),names.map((_,i)=>i+1));return batches;
}
for(const mask of [1,2,3,4,5,6,7]){
 const levels=[1,2,4].map(bit=>mask&bit?'Y':'N');const batches=plan(fields,list,levels);
 assert.equal(batches.length,21,'current RDS list should fit 20-field calculations');assert.equal(batches[0].count,20);
 const long=Array.from({length:415},(_,i)=>'F'+String(i).padStart(127,'X'));
 const huge='('+Array.from({length:440},(_,i)=>(100000+i)+'.0000000000').join(',')+')';
 const split=plan(long,huge,levels);assert.ok(split.length>21);assert.ok(split.every(b=>b.count<20));
}
assert.match(sql,/SET V_SIZE =LEAST\(V_SIZE,20\)/);
assert.ok(sql.indexOf('SET V_LAST =F.FIELD_ORDINAL-1')<sql.indexOf('CALL DQ_DB.SP_DQ_NUMERIC_STATS_BATCH'));
assert.match(sql,/UPDATE DQ_DB.DQ_MODULE_LOG SET FIELD_COUNT =V_LAST-V_FIRST\+1/);
console.log('Outlier width checks passed: all 415 RDS fields fit 21 calculation batches with the current list; all seven scopes, maximum source identifiers, UNKNOWN/empty chunk text and huge-list automatic splitting stay within SQL buffers. Teradata SPL/spool/runtime NOT tested.');

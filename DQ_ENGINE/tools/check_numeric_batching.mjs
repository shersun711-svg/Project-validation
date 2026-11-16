/* Execute generated Numeric Basic aggregates at different widths on SQLite.
   The actual SPL size predicate is evaluated; SPL cursor/DDL/spool are not. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {numericParts,assignment,evaluate,groupingVariables,lex} from './check_static.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('teradata/modules/10_numeric_basic.sql');
const fields=read('config/rds_fields.csv').trim().split('\n').slice(1).map(l=>l.split(',')).filter(r=>r[1]==='NUMERIC').map(r=>r[0]).sort();
assert.equal(fields.length,415);
const specials='('+read('config/special_values.csv').trim().split('\n').slice(1).map(l=>l.split(',')).filter(r=>r[0]==='NUMERIC').map(r=>r[1]).join(',')+')';
const db=new DatabaseSync(':memory:');db.exec("ATTACH DATABASE ':memory:' AS SOURCE");
db.function('CHARACTER_LENGTH',s=>s.length);
db.aggregate('STDDEV_POP',{start:()=>({n:0,m:0,s:0}),step:(s,x)=>{if(x!==null){s.n++;const d=x-s.m;s.m+=d/s.n;s.s+=d*(x-s.m);}return s;},result:s=>s.n?Math.sqrt(s.s/s.n):null});
db.exec('CREATE TABLE SOURCE.FIXTURE (FACT_DT TEXT,'+fields.map(f=>'"'+f+'" NUMERIC').join(',')+')');
const put=db.prepare('INSERT INTO SOURCE.FIXTURE VALUES ('+Array(416).fill('?').join(',')+')');
const raw=[['2005-01-15',i=>i+1],['2005-01-31',()=>0],['2005-02-28',()=>-9999],['2006-01-31',i=>(i+1)*3],['2006-01-31',()=>null],[null,i=>(i+1)*2]];
for(const [date,value]of raw)put.run(date,...fields.map((_,i)=>i===0?null:i===1?-9999:value(i)));
const guardStart=source.indexOf('IF CHARACTER_LENGTH(V_SOURCE_PROJECTION)');
const guard=source.slice(guardStart+3,source.indexOf(' THEN',guardStart)).replace(/\bV_[A-Z_]+\b/g,n=>':'+n);
const reject=db.prepare('SELECT '+guard+' AS REJECT');
const cursor=source.indexOf('FOR F AS');
function plan(names,setting,list=specials,levels=['Y','Y','Y']){
 const batches=[];let first=0;
 while(first<names.length){
  const v={...groupingVariables(source,...levels),V_DB:'SOURCE',V_SOURCE:'FIXTURE',V_DATE:'FACT_DT',
   V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT',V_PROJECTION:'',V_SPECIAL_LIST:list};
  const accepted=[];
  for(let i=first;i<Math.min(first+setting,first+20,names.length);i++){
   v.V_SUFFIX=String(i+1);v.V_FIELD='S.DQ_F'+v.V_SUFFIX;v.V_CLEAN='S.DQ_C'+v.V_SUFFIX;v['F.FIELD_NAME']=names[i];numericParts(v,source);
   const tooLong=reject.get(Object.fromEntries(['V_SOURCE_PROJECTION','V_SOURCE_PART','V_PROJECTION','V_METRIC_PART'].map(k=>[k,v[k]]))).REJECT;
   if(tooLong){assert.ok(accepted.length>0,'A supported single field must fit');break;}
   v.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',guardStart,source),v);
   v.V_PROJECTION=evaluate(assignment('V_PROJECTION',guardStart,source),v);
   accepted.push({name:names[i],ordinal:i+1});
  }
  const query=evaluate(assignment('V_SQL',source.indexOf('/* GROUPING distinguishes'),source),v);
  assert.ok(query.length<=32000);assert.ok(v.V_SOURCE_PROJECTION.length<=24000);assert.ok(v.V_PROJECTION.length<=24000);lex(query,'bounded numeric aggregate');
  assert.equal((query.match(/FROM "SOURCE"\."FIXTURE"/g)||[]).length,1);
  batches.push({query,fields:accepted});first+=accepted.length;
 }
 assert.deepEqual(batches.flatMap(b=>b.fields.map(f=>f.name)),names);return batches;
}
const adapt=q=>q.replaceAll('EXTRACT(YEAR FROM S.DQ_DT)',"CAST(strftime('%Y',S.DQ_DT) AS INTEGER)")
 .replaceAll('EXTRACT(MONTH FROM S.DQ_DT)',"CAST(strftime('%m',S.DQ_DT) AS INTEGER)").replaceAll('CAST(S.DQ_DT AS DATE)','date(S.DQ_DT)');
function sqliteSelect(query){
 let select=query.slice(query.indexOf(' AS (')+5,query.lastIndexOf(') WITH DATA'));
 const at=select.indexOf(' GROUP BY GROUPING SETS (');if(at<0)return adapt(select);
 const body=select.slice(0,at),sets=select.slice(at+' GROUP BY GROUPING SETS ('.length,-1).match(/\((?:EXTRACT\([^)]*\)(?:,EXTRACT\([^)]*\))?)?\)/g);
 assert.ok(sets?.length);
 return sets.map(set=>{let q=body;
  for(const name of ['YEAR','MONTH']){const included=set.includes(name);
   q=q.replaceAll('GROUPING(EXTRACT('+name+' FROM S.DQ_DT))',included?'0':'1');
   if(!included)q=q.replaceAll('EXTRACT('+name+' FROM S.DQ_DT)','CAST(NULL AS INTEGER)');
  }
  return adapt(q+(set==='()'?'':' GROUP BY '+set.slice(1,-1)));
 }).join(' UNION ALL ');
}
function execute(batches){
 const results=[];
 for(const batch of batches)for(const row of db.prepare(sqliteSelect(batch.query)).all())for(const f of batch.fields){
  const values={field:f.name,year:row.DQ_YEAR,month:row.DQ_MONTH,gy:row.GY,gm:row.GM,total:row.TOTAL_N,pou:row.GY===1?null:row.POU_DT};
  for(const metric of ['N','Z','LO','HI','AV','SD','V','FA','LA'])values[metric]=row[metric+f.ordinal];
  results.push(values);
 }
 return results.sort((a,b)=>JSON.stringify([a.field,a.gy,a.gm,a.year,a.month]).localeCompare(JSON.stringify([b.field,b.gy,b.gm,b.year,b.month])));
}
for(const empty of [false,true]){
 if(empty)db.exec('DELETE FROM SOURCE.FIXTURE');
 for(const mask of [1,2,3,4,5,6,7]){
  const levels=[1,2,4].map(b=>mask&b?'Y':'N');const baseline=execute(plan(fields,10,specials,levels));
  for(const size of [1,15,20,25,30])assert.deepEqual(execute(plan(fields,size,specials,levels)),baseline,'size='+size+' mask='+mask+' empty='+empty);
  if(!empty&&mask===7){
   const overall=baseline.filter(r=>r.gy===1);assert.equal(overall.length,415);
   assert.equal(overall.find(r=>r.field===fields[0]).N,0);
   assert.equal(overall.find(r=>r.field===fields[1]).V,0);
   const normal=overall.find(r=>r.field===fields[2]);assert.equal(normal.total,6);assert.equal(normal.N,5);assert.equal(normal.V,4);assert.equal(normal.Z,1);assert.equal(normal.LO,0);assert.equal(normal.HI,9);assert.equal(normal.AV,4.5);assert.ok(Math.abs(normal.SD-Math.sqrt(11.25))<1e-12);
  }
 }
}
assert.equal(plan(fields,10).length,42);assert.equal(plan(fields,25).length,21);
// Long names + near-maximum special list must split rather than overflow/skip.
const longNames=Array.from({length:415},(_,i)=>'F'+String(i).padStart(127,'X'));
const bigList='('+Array.from({length:440},(_,i)=>(100000+i)+'.0000000000').join(',')+')';assert.ok(bigList.length<=8000);
const split=plan(longNames,30,bigList);assert.ok(split.length>21);assert.ok(split.every(b=>b.fields.length<20));
assert.match(source,/SET V_SIZE=LEAST\(V_SIZE,20\)/);
assert.match(source,/IF F.FIELD_ORDINAL<=V_LAST THEN/);
assert.match(source,/SET V_LAST=F.FIELD_ORDINAL-1/);
assert.match(source,/UPDATE DQ_DB.DQ_MODULE_LOG SET FIELD_COUNT=V_LAST-V_FIRST\+1/);
assert.match(source,/SET V_FIRST = V_LAST \+ 1/);
assert.doesNotMatch(source,/CREATE MULTISET TABLE/);
assert.ok(cursor<guardStart&&guardStart<source.indexOf('/* GROUPING distinguishes'));
console.log('Numeric Basic batching passed: all 415 fields, 1/10/15/20/25/30 settings, seven scopes, empty/NULL/special populations, unchanged aggregates and automatic long-SQL splitting. RDS batches: 42 -> 21. Teradata compilation/spool/runtime NOT tested.');

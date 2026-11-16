/* Generated-query checks only; SQLite is not a Teradata/SAS runtime. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync}from'node:sqlite';
import {numericParts,assignment,evaluate,groupingVariables,periodUnion,otherPeriodStatements}from'./check_static.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/SET (\w+)=/g,'SET $1 =');
const nb=read('teradata/modules/10_numeric_basic.sql'),ob=read('teradata/modules/15_other_basic.sql');
const ns=read('teradata/modules/03_numeric_statistics.sql');
const db=new DatabaseSync(':memory:');db.exec("ATTACH DATABASE ':memory:' AS SOURCE");
db.function('CHARACTER_LENGTH',s=>s?.length??null);
db.aggregate('STDDEV_POP',{start:()=>[],step:(s,x)=>{if(x!==null)s.push(x);return s;},result:s=>{if(!s.length)return null;const mean=s.reduce((a,b)=>a+b,0)/s.length;return Math.sqrt(s.reduce((a,b)=>a+(b-mean)**2,0)/s.length);}});
db.exec('CREATE TABLE SOURCE.FIXTURE (FACT_DT TEXT,X NUMERIC,CATEGORY TEXT,EVENT_DATE TEXT,ROW_ID TEXT)');
const raw=[['2005-01-15',0,'A','2004-01-01','1'],['2005-01-27',10,'UNKNOWN',null,'2'],['2005-02-28',-9999,null,'2004-03-01','2'],['2006-01-31',20,'B','2005-01-01',null],[null,null,'A',null,'3']];
const load=()=>{db.exec('DELETE FROM SOURCE.FIXTURE');for(const row of raw)db.prepare('INSERT INTO SOURCE.FIXTURE VALUES (?,?,?,?,?)').run(...row);};load();
const adapt=q=>q.replaceAll('EXTRACT(YEAR FROM S.DQ_DT)',"CAST(strftime('%Y',S.DQ_DT) AS INTEGER)").replaceAll('EXTRACT(MONTH FROM S.DQ_DT)',"CAST(strftime('%m',S.DQ_DT) AS INTEGER)").replaceAll('CAST(S.DQ_DT AS DATE)','date(S.DQ_DT)');
// SQLite lacks GROUPING SETS. Expand only the sets actually present in the
// generated SQL into equivalent aggregates with explicit grouping flags.
function sqliteGroups(q){
 const at=q.indexOf(' GROUP BY GROUPING SETS (');if(at<0)return adapt(q);
 const base=q.slice(0,at),groups=q.slice(at+' GROUP BY GROUPING SETS ('.length,-1);
 const sets=[];let depth=0,start=0;for(let i=0;i<groups.length;i++){
  if(groups[i]==='(')depth++;if(groups[i]===')')depth--;
  if(groups[i]===','&&depth===0){sets.push(groups.slice(start,i));start=i+1;}
 }sets.push(groups.slice(start));
 return sets.map(set=>{let part=base;const hasYear=set.includes('YEAR'),hasMonth=set.includes('MONTH');
  for(const [name,present]of [['YEAR',hasYear],['MONTH',hasMonth]]){
   part=part.replaceAll('GROUPING(EXTRACT('+name+' FROM S.DQ_DT))',present?'0':'1');
   if(!present)part=part.replaceAll('EXTRACT('+name+' FROM S.DQ_DT)','CAST(NULL AS INTEGER)');
  }
  if(set!=='()')part+=' GROUP BY '+set.slice(1,-1);return adapt(part);
 }).join(' UNION ALL ');
}
function variables(type,levels){
 const source=type==='NUMERIC'?nb:ob,cursor=source.indexOf('FOR F AS');
 const name={NUMERIC:'X',CATEGORICAL:'CATEGORY',DATE:'EVENT_DATE',IDENTIFIER:'ROW_ID'}[type];
 const v={...groupingVariables(source,...levels),V_DB:'SOURCE',V_SOURCE:'FIXTURE',V_DATE:'FACT_DT',V_SUFFIX:'1',
  'F.FIELD_NAME':name,V_FIELD:'S.DQ_F1',V_CLEAN:'S.DQ_C1',V_DISTINCT:'S.DQ_F1',V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT',V_PROJECTION:'',
  V_SPECIAL_LIST:type==='NUMERIC'?'(-9999)':"('UNKNOWN')"};
 if(type==='NUMERIC'){
  numericParts(v,source);v.V_SOURCE_PROJECTION+=v.V_SOURCE_PART;v.V_PROJECTION+=v.V_METRIC_PART;
 }else{
  v.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',cursor,source),v);
  const cat=source.indexOf("IF P_TYPE='CATEGORICAL' THEN",cursor);
  if(type==='CATEGORICAL'){
   v.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',cat,source),v);v.V_DISTINCT='S.DQ_C1';
   v.V_PROJECTION=evaluate(assignment('V_PROJECTION',cat,source),v);
  }
  const start=type==='DATE'?source.indexOf("IF P_TYPE='DATE' THEN",cursor):source.indexOf('            ELSE\n',cursor);
  v.V_PROJECTION=evaluate(assignment('V_PROJECTION',start,source),v);
 }
 return {source,v};
}
const key=r=>(r.GY===1?'OVERALL':r.GM===1?'YEARLY':'MONTHLY')+'/'+(r.GY===1?'ALL':r.DQ_YEAR===null?'UNKNOWN':r.GM===1?String(r.DQ_YEAR):r.DQ_YEAR+'-'+String(r.DQ_MONTH).padStart(2,'0'));
const normal=rows=>rows.map(r=>({...r})).sort((a,b)=>key(a).localeCompare(key(b)));
for(const empty of [false,true]){
 if(empty)db.exec('DELETE FROM SOURCE.FIXTURE');
 for(const type of ['NUMERIC','CATEGORICAL','DATE','IDENTIFIER']){
  let baseline;
  for(const mask of [7,1,2,3,4,5,6]){
   const levels=[1,2,4].map(bit=>(mask&bit)?'Y':'N'),selected=['OVERALL','YEARLY','MONTHLY'].filter((_,i)=>levels[i]==='Y');
   const {source,v}=variables(type,levels);let at;
   if(type==='NUMERIC')at=source.indexOf('/* GROUPING distinguishes');
   else {at=source.indexOf("SET V_SQL ='CREATE VOLATILE TABLE DQ_OB_AGG");if(type!=='DATE'){at=source.indexOf('ELSE',at);periodUnion(source,v,...levels);}}
   const requests=(type==='CATEGORICAL'||type==='IDENTIFIER')?otherPeriodStatements(source,v,...levels):null;
   const query=requests?null:evaluate(assignment('V_SQL',at,source),v);
   if(requests)periodUnion(source,v,...levels);
   const reference=requests?v.V_PERIOD_QUERY:null;
   const select=requests?reference:query.slice(query.indexOf(' AS (')+5,query.lastIndexOf(') WITH DATA'));
   const actual=normal(db.prepare(sqliteGroups(select)).all());
   if(mask===7)baseline=actual;
   assert.deepEqual(actual,baseline.filter(r=>selected.includes(key(r).split('/')[0])),type+' mask='+mask+' empty='+empty);
   assert.equal(actual.length,empty?(levels[0]==='Y'?1:0):(levels[0]==='Y'?1:0)+(levels[1]==='Y'?3:0)+(levels[2]==='Y'?4:0));
   if(requests)assert.equal(requests.length,selected.length,'Disabled periods must not retain a source SELECT');
   // Availability remains coverage metadata even without an OVERALL metric.
   const table=type==='NUMERIC'?'DQ_NB_AGG':'DQ_OB_AGG';
   if(requests){
    for(const [i,request]of requests.entries()){
     const part=i===0?request.slice(request.indexOf(' AS (')+5,request.lastIndexOf(') WITH DATA')):request.slice('INSERT INTO DQ_OB_AGG '.length);
     db.exec((i===0?'CREATE TABLE '+table+' AS ':'INSERT INTO '+table+' ')+adapt(part));
    }
    assert.deepEqual(normal(db.prepare('SELECT * FROM '+table).all()),actual,'Separate period requests must equal the former UNION plan');
   }else db.exec('CREATE TABLE '+table+' AS '+sqliteGroups(select));
   const avStart=source.lastIndexOf("SET V_SQL",source.indexOf("'INSERT INTO DQ_DB.DQ_FIELD_AVAILABILITY"));
   const av=evaluate(assignment('V_SQL',avStart,source),{P_RUN_ID:'run-test',P_PROJECT_ID:'project-test','R.FIELD_NAME':'field',V_SUFFIX:'1'});
   const coverage=db.prepare(av.slice(av.indexOf(' SELECT ')+1)).get();
   assert.equal(Object.values(coverage)[3],empty?null:'2005-01-15');
   assert.equal(Object.values(coverage)[4],empty?null:type==='IDENTIFIER'?'2005-02-28':'2006-01-31');
   const captured=actual.map(row=>({PERIOD_LEVEL:key(row).split('/')[0],PERIOD_VALUE:key(row).split('/')[1],POU_DT:row.GY===1?null:row.POU_DT}));
   assert.equal(captured.length,actual.length);
   for(const row of captured){
    const expectedDate=row.PERIOD_LEVEL==='OVERALL'||row.PERIOD_VALUE==='UNKNOWN'?null:
     raw.filter(r=>r[0]!==null && (row.PERIOD_LEVEL==='YEARLY'?r[0].slice(0,4):r[0].slice(0,7))===row.PERIOD_VALUE)
        .map(r=>r[0]).sort().at(-1);
    assert.equal(row.POU_DT,expectedDate,type+' '+row.PERIOD_VALUE);
   }
   db.exec('DROP TABLE '+table);
  }
 }
}
// Numeric prerequisite selects only requested passes, including first creation
// when OVERALL is off. The values agree with Basic's unrounded statistics.
load();
for(let mask=1;mask<8;mask++){
 const levels=[1,2,4].map(bit=>(mask&bit)?'Y':'N');
 const v={P_RUN_ID:'test',V_DB:'SOURCE',V_SOURCE:'FIXTURE',V_DATE:'FACT_DT',V_LIST:'(-9999)',
 V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT',V_PROJECTION:'',V_FIELD:'S.DQ_C1',V_SUFFIX:'1','F.FIELD_NAME':'X'};
 const cursor=ns.indexOf('FOR F AS');for(const part of ['V_SOURCE_PROJECTION','V_PROJECTION'])v[part]=evaluate(assignment(part,cursor,ns),v);
 let rows=[];
 for(const [i,marker]of ['IF V_PASS=1 THEN','ELSEIF V_PASS=2 THEN','            ELSE\n                SET V_GROUP_QUERY'].entries())if(levels[i]==='Y'){
  const query=evaluate(assignment('V_GROUP_QUERY',ns.indexOf(marker,cursor),ns),v);rows.push(...db.prepare(adapt(query)).all());
 }
 const {source,v:bv}=variables('NUMERIC',levels);
 const basic=evaluate(assignment('V_SQL',source.indexOf('/* GROUPING distinguishes'),source),bv);
 const expected=db.prepare(sqliteGroups(basic.slice(basic.indexOf(' AS (')+5,basic.lastIndexOf(') WITH DATA')))).all();
 assert.equal(rows.length,expected.length);
 for(const row of rows){const same=expected.find(r=>key(r)===key(row));assert.equal(row.N1,same.V1);assert.equal(row.AV1,same.AV1);assert.equal(row.SD1,same.SD1);}
}
assert.match(ns,/IF V_EXISTS=0 THEN\s+SET V_SQL/);
const run=read('teradata/modules/00_run_engine.sql'),apply=read('teradata/setup/07_apply_excel_config.sql');
for(const q of [run,apply])assert.ok(q.includes("SIGNAL SQLSTATE 'U0046'"));
for(const f of ['OVERALL','MONTHLY','YEARLY']){
 assert.ok(run.includes('PROFILE_'+f+'=V_PROFILE_'+f));
 for(const q of [nb,ob,ns,read('teradata/modules/12_numeric_outliers.sql')])assert.match(q,/SELECT PROFILE_OVERALL,PROFILE_MONTHLY,PROFILE_YEARLY[\s\S]*?FROM DQ_DB.DQ_RUN_LOG WHERE RUN_ID=P_RUN_ID/);
}
// Execute the production categorical width expression and period requests across
// all 125 configured fields. Compare with the former eight-field batch boundary.
const configured=fs.readFileSync(new URL('../config/rds_fields.csv',import.meta.url),'utf8').trim().split('\n').slice(1).map(l=>l.split(','));
const standardList="('UNKNOWN','N/A','NA','NULL','NONE','-','?','#N/A','.','MISSING','NOT APPLICABLE')";
db.function('LEAST',{varargs:true},(...args)=>Math.min(...args));
const catSizeAt=ob.indexOf("IF P_TYPE='CATEGORICAL' THEN");
const widthSQL=assignment('V_SIZE',catSizeAt,ob).replace(/\b(V_SIZE|V_MAX_FIELD_LENGTH|V_SPECIAL_LIST)\b/g,':$1');
function width(setting,names,list){return db.prepare('SELECT '+widthSQL+' AS N').get({V_SIZE:Math.min(setting,20),V_MAX_FIELD_LENGTH:Math.max(...names.map(n=>n.length)),V_SPECIAL_LIST:list}).N;}
function batchVariables(names,first,list,levels){
 const v={...groupingVariables(ob,...levels),V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT',V_PROJECTION:'',V_DB:'SOURCE',V_SOURCE:'WIDE',V_DATE:'FACT_DT',V_SPECIAL_LIST:list};
 const cursor=ob.indexOf('FOR F AS'),cat=ob.indexOf("IF P_TYPE='CATEGORICAL' THEN",cursor);
 for(const [j,name]of names.entries()){
  v.V_SUFFIX=String(first+j);v['F.FIELD_NAME']=name;v.V_FIELD='S.DQ_F'+v.V_SUFFIX;v.V_DISTINCT='S.DQ_C'+v.V_SUFFIX;
  v.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',cursor,ob),v);
  assert(v.V_SOURCE_PROJECTION.length+list.length+2*name.length+150<=12000,'Pre-assignment source guard');
  v.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',cat,ob),v);
  v.V_PROJECTION=evaluate(assignment('V_PROJECTION',cat,ob),v);
  v.V_PROJECTION=evaluate(assignment('V_PROJECTION',ob.indexOf('            ELSE\n',cursor),ob),v);
 }
 assert(v.V_SOURCE_PROJECTION.length<=12000);assert(v.V_PROJECTION.length<=18000);
 assert(v.V_SOURCE_PROJECTION.length+v.V_PROJECTION.length+v.V_DB.length+v.V_SOURCE.length+600<=30000);
 return v;
}
let widthCases=0;
const catNames=configured.filter(r=>r[1]==='CATEGORICAL').map(r=>r[0]).sort();
for(const names of [catNames,Array.from({length:20},(_,i)=>'F'+String(i).padStart(127,'X'))]){
 db.exec('CREATE TABLE SOURCE.WIDE (FACT_DT TEXT,'+names.map(n=>'"'+n+'" TEXT').join(',')+')');
 const put=db.prepare('INSERT INTO SOURCE.WIDE VALUES ('+Array(names.length+1).fill('?').join(',')+')');
 for(let i=0;i<12;i++)put.run(['2005-01-15','2005-01-31','2005-02-28','2006-01-31',null][i%5],...names.map((_,j)=>j%7===0?null:['A','B','UNKNOWN','',null,' unknown '][(i+j)%6]));
 for(const list of [standardList,"('UNKNOWN','"+'X'.repeat(7900)+"')"]){
  for(const levels of [['Y','Y','Y'],['Y','N','Y'],['N','N','Y']]){
   function saved(setting,legacy=false){
    const out=[];const size=legacy?Math.min(8,width(setting,names,list)):width(setting,names,list);
    for(let first=1;first<=names.length;first+=size){
     const batch=names.slice(first-1,first+size-1),v=batchVariables(batch,first,list,levels);
     const statements=otherPeriodStatements(ob,v,...levels);
     for(const [i,query]of statements.entries()){
      assert(query.length<32000);assert(!query.includes('UNION ALL'));
      const part=i===0?query.slice(query.indexOf(' AS (')+5,query.lastIndexOf(') WITH DATA')):query.slice('INSERT INTO DQ_OB_AGG '.length);
      db.exec((i===0?'CREATE TABLE DQ_OB_AGG AS ':'INSERT INTO DQ_OB_AGG ')+adapt(part));
     }
     for(const row of db.prepare('SELECT * FROM DQ_OB_AGG').all())for(const [j,name]of batch.entries()){
      const n=first+j;out.push([name,key(row),row.POU_DT,row.TOTAL_N,row['N'+n],row['V'+n],row['D'+n],row['FA'+n],row['LA'+n]]);
     }
     db.exec('DROP TABLE DQ_OB_AGG');
    }
    return out.sort((a,b)=>(a[0]+'/'+a[1]).localeCompare(b[0]+'/'+b[1]));
   }
   const expected=saved(25,true);
   for(const setting of [1,8,20,25,30]){assert.deepEqual(saved(setting),expected,'Wider categorical counts/distinct/coverage must equal eight-field grouping');widthCases++;}
  }
 }
 db.exec('DROP TABLE SOURCE.WIDE');
}
assert.equal(width(25,catNames,standardList),20);
assert.equal(Math.ceil(catNames.length/width(25,catNames,standardList)),7);
console.log('Categorical width checks passed: '+widthCases+' cases across all 125 RDS category fields, 128-character identifiers, 7900-character lists, NULL/blank/special groups and six batch settings including the baseline. Default category batches: 16 -> 7.');
db.close();console.log('Reporting levels passed: all seven combinations for four Basic types and standalone statistics; empty/UNKNOWN periods, unchanged values and availability. SAS/Teradata NOT executed.');

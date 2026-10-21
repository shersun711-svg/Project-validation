/* Execute the actual account-check SQL with dialect adaptation.
   This does not compile Teradata SQL or run SAS. Synthetic identifiers only. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

const sas=fs.readFileSync(new URL('../sas/07_account_checks.sas',import.meta.url),'utf8');
const body=sas.slice(sas.indexOf('WITH source_values AS'),sas.indexOf(') WITH DATA PRIMARY INDEX'));
assert.ok(body.length>4000);
const flags=['NUMERIC_JUMP','NUMERIC_REVERSION','VALUE_REVERSION','MISSING_REVERSION',
 'SPECIAL_REVERSION','BECAME_MISSING','BECAME_SPECIAL','STABLE_VALUE_CHANGE'];
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE SOURCE (AGMT_ID TEXT,FACT_DT TEXT,FIELD_VALUE);');
const put=db.prepare('INSERT INTO SOURCE VALUES (?,?,?)');
const months=['2019-12-31','2020-01-31','2020-02-29','2020-03-31','2020-04-30'];
function series(id,values,dates=months.slice(1,4)){
 values.forEach((v,i)=>put.run(id,dates[i],v));
}
function sql(type='NUMERIC',stable='N',fragment=body){
 const p={
  _account:'AGMT_ID',_date:'FACT_DT',_field:'FIELD_VALUE',
  _source_db:'main',_source_table:'SOURCE',start_date:'2019-01-01',
  _end_exclusive:'2021-01-01',_type:type,_stable:stable,
  _abs_min:'50',_rel_min:'0.20',_return_abs:'2',_return_rel:'0.01',
  dq_account_check_id:'synthetic-check',project:'TEST',max_details:'2',
  _number_sql:type==='NUMERIC'?'CAST("FIELD_VALUE" AS FLOAT)':'CAST(NULL AS FLOAT)',
  _missing_sql:type==='NUMERIC'?'"FIELD_VALUE" IS NULL':
   '("FIELD_VALUE" IS NULL OR TRIM(CAST("FIELD_VALUE" AS VARCHAR(512)))=\'\')',
  _special_sql:type==='NUMERIC'?'"FIELD_VALUE" IN (-999)':
   type==='CATEGORICAL'?'UPPER(TRIM("FIELD_VALUE")) IN (\'UNKNOWN\',\'N/A\')':'1=0'
 };
 let q=fragment.replace(/&([A-Za-z_][A-Za-z0-9_]*)/g,(_,k)=>{
  assert.ok(k in p,'Unknown SQL parameter '+k);return p[k];
 });
 q=q.replace(/DATE '([^']+)'/g,"'$1'")
  .replace(/CAST\(("[^"]+") AS DATE\)/g,'$1')
  .replace(/EXTRACT\(YEAR FROM ("[^"]+"|POU_DT)\)/g,"CAST(strftime('%Y',$1) AS INTEGER)")
  .replace(/EXTRACT\(MONTH FROM ("[^"]+"|POU_DT)\)/g,"CAST(strftime('%m',$1) AS INTEGER)")
  .replace(/NULLIFZERO\(ABS\(([^)]+)\)\)/g,'NULLIF(ABS($1),0)')
  .replace(/GREATEST\(/g,'MAX(')
  .replace(/CHARACTER_LENGTH\(/g,'length(')
  .replace(/ CASESPECIFIC/g,'')
  .replace(/ AS FLOAT/g,' AS REAL');
 assert.ok(!q.includes('&'));
 return q;
}
function run(type,stable){
 db.exec('DROP TABLE IF EXISTS DQ_AT_CHECK');
 db.exec('CREATE TABLE DQ_AT_CHECK AS '+sql(type,stable));
 return db.prepare('SELECT * FROM DQ_AT_CHECK ORDER BY ACCOUNT_KEY,POU_DT').all();
}
function month(s){return Number(s.slice(0,4))*12+Number(s.slice(5,7));}
function expected(prev,cur,next,type,stable){
 const pair=!!prev&&month(cur.POU_DT)-month(prev.POU_DT)===1;
 const triple=pair&&!!next&&month(next.POU_DT)-month(cur.POU_DT)===1;
 const valid=r=>r?.VALUE_STATE==='VALID';
 const x=prev?.NUMBER_VALUE,y=cur.NUMBER_VALUE,z=next?.NUMBER_VALUE;
 const jump=(a,b)=>Math.abs(b-a)>=50&&(a===0||Math.abs((b-a)/Math.abs(a))>=.2);
 const e={};
 e.NUMERIC_JUMP=+(type==='NUMERIC'&&pair&&valid(prev)&&valid(cur)&&jump(x,y));
 e.NUMERIC_REVERSION=+(type==='NUMERIC'&&triple&&valid(prev)&&valid(cur)&&valid(next)
  &&jump(x,y)&&jump(y,z)&&Math.sign(y-x)===-Math.sign(z-y)
  &&Math.abs(z-x)<=Math.max(2,Math.abs(x)*.01));
 e.VALUE_REVERSION=+(type!=='NUMERIC'&&triple&&valid(prev)&&valid(cur)&&valid(next)
  &&prev.DISPLAY_VALUE===next.DISPLAY_VALUE&&cur.DISPLAY_VALUE!==prev.DISPLAY_VALUE);
 e.MISSING_REVERSION=+(triple&&valid(prev)&&cur.VALUE_STATE==='MISSING'&&valid(next));
 e.SPECIAL_REVERSION=+(triple&&valid(prev)&&cur.VALUE_STATE==='SPECIAL'&&valid(next));
 e.BECAME_MISSING=+(pair&&valid(prev)&&cur.VALUE_STATE==='MISSING');
 e.BECAME_SPECIAL=+(pair&&valid(prev)&&cur.VALUE_STATE==='SPECIAL');
 e.STABLE_VALUE_CHANGE=+(stable==='Y'&&pair&&valid(prev)&&valid(cur)
  &&cur.DISPLAY_VALUE!==prev.DISPLAY_VALUE);
 return {...e,PAIR_ELIGIBLE:+pair,TRIPLE_ELIGIBLE:+triple,
  FLAGGED_ROW:+flags.some(f=>e[f])};
}
let checked=0;
function verify(type='NUMERIC',stable='N'){
 const rows=run(type,stable);
 for(let i=0;i<rows.length;i++){
  const cur=rows[i],p=rows[i-1]?.ACCOUNT_KEY===cur.ACCOUNT_KEY?rows[i-1]:null,
   n=rows[i+1]?.ACCOUNT_KEY===cur.ACCOUNT_KEY?rows[i+1]:null;
  for(const [k,v]of Object.entries(expected(p,cur,n,type,stable)))
   assert.equal(cur[k],v,cur.ACCOUNT_KEY+' '+cur.POU_DT+' '+k);
  checked++;
 }
 return rows;
}
series('jump_return',[100,900,99]);
series('ordinary',[100,120,140]);
series('small_base',[1,2,1]);
series('zero_base',[0,100,0]);
series('negative',[-100,-250,-101]);
series('missing',[100,null,100]);
series('special',[100,-999,100]);
series('sign_flip',[100,-100,100]);
series('threshold',[200,250,200]); // both absolute/relative thresholds inclusive
series('gap',[100,900,100],['2019-12-31','2020-02-29','2020-03-31']);
series('gap_after',[100,900,100],['2020-01-31','2020-02-29','2020-04-30']);
series('no_return',[100,900,300]);
// Deterministic varied values/missing months for independent oracle checks.
let seed=3701;
function random(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
for(let a=0;a<80;a++){
 const vals=[null,-999,-1000,-5,0,5,100,300,900];
 for(const date of months)if(random(5)!==0)put.run('fixture_'+a,date,vals[random(vals.length)]);
}
const rows=verify();
const at=(id,date='2020-02-29')=>rows.find(r=>r.ACCOUNT_KEY===id&&r.POU_DT===date);
assert.equal(at('jump_return').NUMERIC_REVERSION,1);
assert.equal(at('zero_base').NUMERIC_REVERSION,1);
assert.equal(at('zero_base').RELATIVE_CHANGE,null);
assert.equal(at('negative').NUMERIC_REVERSION,1);
assert.equal(at('small_base').NUMERIC_JUMP,0);
assert.equal(at('gap').NUMERIC_JUMP,0);
assert.equal(at('gap_after').NUMERIC_REVERSION,0);
assert.equal(at('no_return').NUMERIC_REVERSION,0);
assert.equal(at('missing').MISSING_REVERSION,1);
assert.equal(at('special').SPECIAL_REVERSION,1);
assert.equal(at('threshold').NUMERIC_REVERSION,1);
// Exercise the production detail QUALIFY semantics through a nested SELECT.
const totals=db.prepare('SELECT COUNT(*) AS N FROM DQ_AT_CHECK WHERE FLAGGED_ROW=1').get().N;
const detail=sas.match(/create table work\._dq_at_one_detail as select \* from connection to dq\s+\(([\s\S]*?)\);\n   %dq_check_sql/)[1];
const detailSQL=sql('NUMERIC','N',detail)
 .replace('COUNT(*) OVER () AS TOTAL_FLAGGED_ROWS','COUNT(*) OVER () AS TOTAL_FLAGGED_ROWS,'+
   'ROW_NUMBER() OVER (ORDER BY POU_DT,ACCOUNT_KEY) AS RN')
 .replace(/QUALIFY ROW_NUMBER\(\) OVER \(ORDER BY POU_DT,ACCOUNT_KEY\)<=2/,'');
const limited=db.prepare('SELECT * FROM ('+detailSQL+') WHERE RN<=2').all();
assert.equal(limited.length,2);assert.equal(limited[0].TOTAL_FLAGGED_ROWS,totals);
assert.ok(totals>2);
const summary=sas.match(/create table work\._dq_at_one_summary as select \* from connection to dq\s+\(([\s\S]*?)\);\n   %dq_check_sql/)[1];
const sums=db.prepare(sql('NUMERIC','N',summary)).all();
for(const s of sums){
 const group=rows.filter(r=>Number(r.POU_DT.slice(0,4))===s.SNAPSHOT_YEAR
  &&Number(r.POU_DT.slice(5,7))===s.SNAPSHOT_MONTH);
 assert.equal(s.TOTAL_COUNT,group.length);
 assert.equal(s.PAIR_COUNT,group.reduce((n,r)=>n+r.PAIR_ELIGIBLE,0));
 assert.equal(s.TRIPLE_COUNT,group.reduce((n,r)=>n+r.TRIPLE_ELIGIBLE,0));
 for(const f of flags)assert.equal(s[f+'_COUNT'],group.reduce((n,r)=>n+r[f],0));
 assert.equal(s.FLAGGED_ROW_COUNT,group.reduce((n,r)=>n+r.FLAGGED_ROW,0));
 assert.equal(s.VALID_PAIR_COUNT,group.filter(r=>r.PAIR_ELIGIBLE
  &&r.PREVIOUS_STATE==='VALID'&&r.VALUE_STATE==='VALID').length);
 assert.equal(s.VALID_REFERENCE_PAIR_COUNT,group.filter(r=>r.PAIR_ELIGIBLE
  &&r.PREVIOUS_STATE==='VALID').length);
 assert.equal(s.VALID_TRIPLE_COUNT,group.filter(r=>r.TRIPLE_ELIGIBLE
  &&r.PREVIOUS_STATE==='VALID'&&r.VALUE_STATE==='VALID'&&r.NEXT_STATE==='VALID').length);
 assert.equal(s.VALID_NEIGHBOUR_TRIPLE_COUNT,group.filter(r=>r.TRIPLE_ELIGIBLE
  &&r.PREVIOUS_STATE==='VALID'&&r.NEXT_STATE==='VALID').length);
}
db.exec('DELETE FROM SOURCE');
series('category',['A','B','A']);
series('special',['A',' unknown ','A']);
series('blank',['A','  ','A']);
series('null',['A',null,'A']);
series('case',['A','a','A']);
series('gap',['A','B','A'],['2019-12-31','2020-02-29','2020-03-31']);
const cats=verify('CATEGORICAL','Y');
assert.equal(cats.find(r=>r.ACCOUNT_KEY==='category'&&r.POU_DT==='2020-02-29').VALUE_REVERSION,1);
assert.equal(cats.find(r=>r.ACCOUNT_KEY==='special'&&r.POU_DT==='2020-02-29').SPECIAL_REVERSION,1);
assert.equal(cats.find(r=>r.ACCOUNT_KEY==='blank'&&r.POU_DT==='2020-02-29').MISSING_REVERSION,1);
assert.equal(cats.find(r=>r.ACCOUNT_KEY==='case'&&r.POU_DT==='2020-02-29').VALUE_REVERSION,1);
for(const type of ['DATE','IDENTIFIER'])verify(type,'Y');
// Duplicate months/dates and NULL keys are rejected before result publication.
series('duplicate',[10,20],['2020-01-15','2020-01-31']);
put.run(null,'2020-02-29',100);
put.run('long_value','2020-01-31','X'.repeat(513));
const bad=run('CATEGORICAL','N');
assert.equal(bad.filter(r=>r.KEY_COUNT!==1||r.ACCOUNT_KEY===null).length,3);
assert.equal(bad.filter(r=>r.VALUE_LENGTH>512).length,1);
db.exec('DELETE FROM SOURCE');
assert.deepEqual(run('NUMERIC','N'),[]);
// Guard the SAS-only lifecycle: no existing runner mutation or persistent SQL.
assert.match(sas,/SUM\(CASE WHEN ACCOUNT_KEY IS NULL/);
assert.match(sas,/OR TRIM\(CAST\(ACCOUNT_KEY AS VARCHAR\(128\)\)\)='' OR KEY_COUNT<>1/);
assert.match(sas,/%if &_bad_keys>0/);
assert.match(sas,/%if &_bad_values>0/);
assert.match(sas,/test_status='NO_OBSERVATIONS'/);
assert.match(sas,/if valid_pair_count>0/);
assert.match(sas,/if valid_triple_count>0/);
assert.match(sas,/numeric_reversion_count,abs_change_min/);
assert.ok(sas.indexOf('data work.dq_account_summary;')>sas.indexOf('%end;\n /* Public outputs'));
assert.doesNotMatch(sas,/\b(?:INSERT INTO|UPDATE|DELETE FROM|REPLACE VIEW|REPLACE PROCEDURE)\b/i);
assert.equal((sas.match(/CREATE MULTISET VOLATILE TABLE/g)||[]).length,1);
assert.equal((sas.match(/%macro\b/gi)||[]).length,(sas.match(/%mend\b/gi)||[]).length);
assert.ok(!/[^\x00-\x7f]/.test(sas));
console.log('Account checks: '+checked+' synthetic rows match an independent oracle; '+
 'calendar gaps, missing/specials, numeric/category reversions, cap, grain and empty cases passed.');
console.log('SAS/Teradata execution, physical plans and runtime remain unverified.');

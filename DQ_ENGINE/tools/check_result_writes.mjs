/* Execute batched profiling writes and the same per-field SELECTs on SQLite.
   SPL control flow and Teradata UNION typing/transactions are not executed. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {assignment,evaluate,lex} from './check_static.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('teradata/modules/10_numeric_basic.sql').replace(/SET (\w+)=/g,'SET $1 =');
const db=new DatabaseSync(':memory:');db.function('CHARACTER_LENGTH',s=>s?.length??null);
const schema=`CREATE TABLE DQ_METRIC_DEFINITION (MODULE_NAME TEXT,METRIC_ORDINAL INTEGER,METRIC_NAME TEXT,IS_PERCENTAGE TEXT);
 CREATE TABLE DQ_METRIC_RESULT (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT,MODULE_NAME TEXT,PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,METRIC_NAME TEXT,METRIC_VALUE NUMERIC,IS_PERCENTAGE TEXT,RATE_NUMERATOR INTEGER,RATE_DENOMINATOR INTEGER,POU_DT TEXT,EXECUTION_TIMESTAMP TEXT,UNIQUE(RUN_ID,FIELD_NAME,MODULE_NAME,PERIOD_LEVEL,PERIOD_VALUE,METRIC_NAME));
 CREATE TABLE DQ_NUMERIC_STATISTICS (RUN_ID TEXT,FIELD_NAME TEXT,PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,TOTAL_COUNT INTEGER,VALID_COUNT INTEGER,MEAN_VALUE NUMERIC,STDDEV_VALUE NUMERIC,UNIQUE(RUN_ID,FIELD_NAME,PERIOD_LEVEL,PERIOD_VALUE));
 CREATE TABLE DQ_FIELD_AVAILABILITY (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,EARLIEST_DATE TEXT,LATEST_DATE TEXT,UNIQUE(RUN_ID,FIELD_NAME));`;
db.exec(schema);
for(const [,n,name,pct]of read('teradata/setup/00_create_config_tables.sql').matchAll(/VALUES \('NUMERIC_BASIC',(\d+),'([^']+)','([YN])'\)/g))db.prepare('INSERT INTO DQ_METRIC_DEFINITION VALUES (?,?,?,?)').run('NUMERIC_BASIC',+n,name,pct);
const cursor=source.indexOf('FOR R AS');
const kinds=[['metrics','V_METRIC_INSERT','FOR R AS','DQ_METRIC_RESULT'],['statistics','V_STATS_INSERT','/* Keep unrounded','DQ_NUMERIC_STATISTICS'],['availability','V_AVAIL_INSERT','/* Coverage is overall-only','DQ_FIELD_AVAILABILITY']];
const adapt=q=>q.replaceAll('DQ_DB.','').replaceAll('CURRENT_TIMESTAMP(6)',"'FIXED_TIMESTAMP'").replaceAll('CAST(NULL AS DATE)','CAST(NULL AS TEXT)');
function scalar(q,v){q=q.replace(/POSITION\(' SELECT ' IN V_SQL\)/g,"INSTR(V_SQL,' SELECT ')").replace(/\bV_[A-Z_]+\b/g,n=>':'+n);const names=[...new Set(q.match(/V_[A-Z_]+/g)||[])];return db.prepare('SELECT '+q+' AS VALUE').get(Object.fromEntries(names.map(n=>[n,v[n]]))).VALUE;}
function pack(kind,statements,body=source){
 const at=body.indexOf('IF CHARACTER_LENGTH('+kind+')>0',body.indexOf('FOR R AS')),end=body.indexOf(' THEN',at);
 const condition=body.slice(at+3,end),append=body.indexOf('ELSE',body.indexOf('IF CHARACTER_LENGTH('+kind+')=0 THEN',at));
 const selectExpr=assignment('V_SELECT',body.lastIndexOf('SET V_SELECT',at),body);
 const v={[kind]:''};const chunks=[];
 for(const statement of statements){
  v.V_SQL=statement;v.V_SELECT=scalar(selectExpr,v);assert.equal(v.V_SELECT,statement.slice(statement.indexOf(' SELECT ')+1));assert.ok(v.V_SELECT.length<=8000);
  if(scalar(condition,v)){chunks.push(v[kind]);v[kind]='';}
  v[kind]=v[kind]?evaluate(assignment(kind,append,body),v):statement;
  assert.ok(v[kind].length<=30000);lex(v[kind],'batched '+kind);
 }
 if(v[kind])chunks.push(v[kind]);return chunks;
}
const fields=read('config/rds_fields.csv').trim().split('\n').slice(1).map(l=>l.split(',')).filter(r=>r[1]==='NUMERIC').map(r=>r[0]).sort();
function statements(names,first){return kinds.map(([key,kind,marker,table])=>({key,kind,table,sql:names.map((name,i)=>evaluate(assignment('V_SQL',source.indexOf(marker),source),{P_RUN_ID:'60000000-0000-4000-8000-000000000001',P_PROJECT_ID:'PROJECT_WITH_A_LONG_IDENTIFIER','R.FIELD_NAME':name,V_SUFFIX:String(first+i)}))}));}
let expectedCalls=0;
for(let first=1;first<=fields.length;first+=20){const names=fields.slice(first-1,first+19);for(const k of statements(names,first)){const chunks=pack(k.kind,k.sql);expectedCalls+=chunks.length;assert.equal(chunks.reduce((n,q)=>n+(q.match(/CAST\('[A-Za-z_0-9]+' AS VARCHAR\(128\)\)/g)||[]).length,0),names.length);}}
assert.equal(expectedCalls,83,'415 fields in 21 groups should need 83 writes instead of 1245');
function aggregate(first,count,empty,mode){
 const ords=Array.from({length:count},(_,i)=>first+i);
 db.exec('CREATE TABLE DQ_NB_AGG (DQ_YEAR INTEGER,DQ_MONTH INTEGER,GY INTEGER,GM INTEGER,TOTAL_N INTEGER,POU_DT TEXT,'+ords.flatMap(i=>['N'+i+' INTEGER','Z'+i+' INTEGER','LO'+i+' NUMERIC','HI'+i+' NUMERIC','AV'+i+' REAL','SD'+i+' REAL','V'+i+' INTEGER','FA'+i+' TEXT','LA'+i+' TEXT']).join(',')+')');
 if(empty&&mode==='NO_OVERALL')return;
 const periods=empty?[[null,null,1,1,0n,null]]:[[null,null,1,1,100n,null],[2005,null,0,1,100n,'2005-12-31'],[2005,1,0,0,100n,'2005-01-31'],[null,null,0,0,9007199254741005n,null]];
 const put=db.prepare('INSERT INTO DQ_NB_AGG VALUES ('+Array(6+count*9).fill('?').join(',')+')');
 for(const [year,month,gy,gm,total,date]of periods){
  const row=[year,month,gy,gm,total,date];
  for(const [j,i]of ords.entries()){
   const missing=empty||j===0?total:total>1000n?13n:20n,n=total-missing;
   const valid=j===1?0n:n>10n?n-10n:0n;
   row.push(n,n>0n?5n:0n,valid?-0.1234567890123:null,valid?9007199254740992n:null,valid?0.123456789012345:null,valid?1.23456789012345:null,valid,n?'1999-12-31':null,n?'2006-03-31':null);
  }
  put.run(...row);
 }
}
const tables=kinds.map(k=>k[3]);
const clear=()=>tables.forEach(t=>db.exec('DELETE FROM '+t));
const saved=()=>Object.fromEntries(tables.map(t=>{const statement=db.prepare('SELECT * FROM '+t+' ORDER BY RUN_ID,FIELD_NAME'+(t==='DQ_FIELD_AVAILABILITY'?'':',PERIOD_LEVEL,PERIOD_VALUE')+(t==='DQ_METRIC_RESULT'?',METRIC_NAME':''));statement.setReadBigInts(true);return [t,statement.all().map(r=>({...r}))];}));
const cases=[[1,fields.slice(0,20)],[396,fields.slice(395)],[1,['A',...Array.from({length:19},(_,i)=>'F'+String(i).padStart(127,'X'))]]];
for(const [first,names]of cases){
 for(const mode of ['POPULATED','EMPTY_OVERALL','NO_OVERALL']){
  aggregate(first,names.length,mode!=='POPULATED',mode);const ks=statements(names,first);clear();
  for(const k of ks)for(const q of k.sql)db.exec(adapt(q));const baseline=saved();clear();
  for(const k of ks)for(const q of pack(k.kind,k.sql))db.exec(adapt(q));assert.deepEqual(saved(),baseline,'batch persistence '+first+' '+mode);
  assert.equal(saved().DQ_FIELD_AVAILABILITY.length,names.length,'empty non-overall data still needs one coverage row per field');
  if(mode==='POPULATED'){
   const stats=saved().DQ_NUMERIC_STATISTICS.find(r=>r.FIELD_NAME===names[2]&&r.PERIOD_LEVEL==='OVERALL');assert.equal(stats.MEAN_VALUE,0.123456789012345);assert.equal(stats.STDDEV_VALUE,1.23456789012345);
   const metric=(name,period)=>saved().DQ_METRIC_RESULT.find(r=>r.FIELD_NAME===names[2]&&r.METRIC_NAME===name&&r.PERIOD_LEVEL===period);
   assert.equal(metric('MISSING_COUNT','MONTHLY').METRIC_VALUE,20n);assert.equal(metric('SPECIAL_COUNT','OVERALL').METRIC_VALUE,10n);
   const unknown=saved().DQ_METRIC_RESULT.find(r=>r.FIELD_NAME===names[2]&&r.PERIOD_VALUE==='UNKNOWN'&&r.METRIC_NAME==='MISSING_COUNT');assert.equal(unknown.METRIC_VALUE,13n);
   const total=saved().DQ_METRIC_RESULT.find(r=>r.FIELD_NAME===names[2]&&r.PERIOD_VALUE==='UNKNOWN'&&r.METRIC_NAME==='TOTAL_COUNT');assert.equal(total.METRIC_VALUE,9007199254741005n);
  }
  db.exec('DROP TABLE DQ_NB_AGG');
 }
}
// Simulate a failed bulk write: the unique constraint must reject duplicates.
aggregate(1,20,false,'POPULATED');clear();const metricChunks=pack('V_METRIC_INSERT',statements(fields.slice(0,20),1)[0].sql);db.exec(adapt(metricChunks[0]));const before=saved();assert.throws(()=>db.exec(adapt(metricChunks[0])),/UNIQUE/);assert.deepEqual(saved(),before);
assert.equal((source.slice(cursor,source.indexOf('END FOR;',cursor)).match(/CALL DBC.SysExecSQL\(V_SQL\)/g)||[]).length,0);
for(const [,kind]of kinds){assert.match(source,new RegExp('CALL DBC.SysExecSQL\\('+kind+'\\)'));assert.ok(source.lastIndexOf('CALL DBC.SysExecSQL('+kind+')')<source.indexOf("CALL DBC.SysExecSQL('DROP TABLE DQ_NB_AGG')",cursor));}
assert.match(source,/DELETE FROM DQ_DB.DQ_METRIC_RESULT/);assert.match(source,/RESIGNAL;/);
console.log('Basic bulk persistence passed: identical metrics/statistics/coverage, long field-name casts, empty/UNKNOWN groups, counts above 2^53, full FLOAT prerequisites and duplicate rejection. Current 415-field plan uses 83 writes instead of 1245; a 20-field batch uses four instead of sixty. Teradata UNION typing/SPL/transactions/runtime NOT tested.');

// Outlier and nonnumeric writes use the same bounded queue with their own
// unchanged per-field SELECTs. Exercise every output kind on mixed periods.
const other=read('teradata/modules/15_other_basic.sql').replace(/SET (\w+)=/g,'SET $1 =');
const out=read('teradata/modules/12_numeric_outliers.sql').replace(/SET (\w+)=/g,'SET $1 =');
const definitions=read('teradata/setup/09_add_basic_metrics.sql')+read('teradata/setup/12_add_date_basic_metrics.sql')+read('teradata/setup/16_create_outlier_support.sql');
for(const [,module,n,name,pct]of definitions.matchAll(/VALUES \('(CATEGORICAL_BASIC|DATE_BASIC|IDENTIFIER_BASIC|NUMERIC_OUTLIERS)',(\d+),'([^']+)','([YN])'\)/g))db.prepare('INSERT INTO DQ_METRIC_DEFINITION VALUES (?,?,?,?)').run(module,+n,name,pct);
db.exec('DROP TABLE DQ_NB_AGG');
const base={P_RUN_ID:'60000000-0000-4000-8000-000000000001',P_PROJECT_ID:'PROJECT_WITH_A_LONG_IDENTIFIER'};
function outStatements(names,first){return names.map((name,i)=>evaluate(assignment('V_SQL',out.indexOf('FOR R AS'),out),{...base,'R.FIELD_NAME':name,V_SUFFIX:String(first+i)}));}
function otherStatements(type,names,first){
 const rc=other.indexOf('FOR R AS'),special=other.indexOf("IF P_TYPE='CATEGORICAL' THEN",rc);return ['metrics','availability'].map(key=>names.map((name,i)=>{
  const v={...base,'R.FIELD_NAME':name,V_SUFFIX:String(first+i),P_TYPE:type,V_MODULE:type+'_BASIC',V_METRICS:type==='DATE'?4:type==='CATEGORICAL'?5:3};
  for(const k of ['V_PERIOD_LEVEL','V_PERIOD_VALUE'])v[k]=evaluate(assignment(k,0,other),v);
  if(type==='CATEGORICAL')for(const k of ['V_EXTRA_CASE','V_NUMERATOR','V_DENOMINATOR'])v[k]=evaluate(assignment(k,special,other),v);
  else Object.assign(v,{V_EXTRA_CASE:'',V_NUMERATOR:'CASE WHEN M.METRIC_ORDINAL=2 THEN A.TOTAL_N-A.N'+v.V_SUFFIX+' ELSE NULL END,',V_DENOMINATOR:'CASE WHEN M.METRIC_ORDINAL=2 THEN A.TOTAL_N ELSE NULL END,'});
  const marker=key==='availability'?other.indexOf("SET V_SQL ='INSERT INTO DQ_DB.DQ_FIELD_AVAILABILITY",rc):type==='DATE'?other.indexOf("IF P_TYPE='DATE' THEN",rc):other.indexOf('            ELSE\n',rc);
  return evaluate(assignment('V_SQL',marker,other),v);
 }));
}
function smallAggregate(table,first,count,type,empty){
 const outlier=type==='OUTLIER';const ords=Array.from({length:count},(_,i)=>first+i);
 const head=outlier?'PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,POU_DT TEXT':'DQ_YEAR INTEGER,DQ_MONTH INTEGER,GY INTEGER,GM INTEGER,TOTAL_N INTEGER,POU_DT TEXT';
 const cols=ords.flatMap(i=>outlier?['N'+i+' INTEGER','L'+i+' REAL','U'+i+' REAL','O'+i+' INTEGER']:['N'+i+' INTEGER','D'+i+' INTEGER','V'+i+' INTEGER','FA'+i+' TEXT','LA'+i+' TEXT']);
 db.exec('CREATE TABLE '+table+' ('+head+','+cols.join(',')+')');if(empty)return;
 const periods=outlier?[['OVERALL','ALL',null],['MONTHLY','2005-01','2005-01-31'],['MONTHLY','UNKNOWN',null]]:[[null,null,1,1,100n,null],[2005,1,0,0,100n,'2005-01-31'],[null,null,0,0,0n,null]];
 const put=db.prepare('INSERT INTO '+table+' VALUES ('+Array((outlier?3:6)+cols.length).fill('?').join(',')+')');
 for(const period of periods){const row=[...period];for(let j=0;j<count;j++)row.push(...(outlier?[j===0?0n:80n,j===0?null:-3.123456789,j===0?null:3.123456789,j===0?0n:2n]:[j===0?0n:80n,j===0?0n:5n,j===0?0n:70n,j===0?null:'2000-01-31',j===0?null:'2005-01-31']));put.run(...row);}
}
for(const type of ['OUTLIER','CATEGORICAL','DATE','IDENTIFIER']){
 const count=type==='CATEGORICAL'?8:type==='DATE'?25:20,names=['A',...Array.from({length:count-1},(_,i)=>'F'+String(i).padStart(127,'X'))];
 const table=type==='OUTLIER'?'DQ_NO_AGG':'DQ_OB_AGG';
 for(const empty of [false,true]){
  smallAggregate(table,396,count,type,empty);
  const lists=type==='OUTLIER'?[outStatements(names,396)]:otherStatements(type,names,396);
  clear();for(const qs of lists)for(const q of qs)db.exec(adapt(q));const baseline=saved();clear();
  for(const [i,qs]of lists.entries())for(const q of pack(i===0?'V_METRIC_INSERT':'V_AVAIL_INSERT',qs,type==='OUTLIER'?out:other))db.exec(adapt(q));
  assert.deepEqual(saved(),baseline,type+' batched outputs empty='+empty);
  if(type!=='OUTLIER')assert.equal(saved().DQ_FIELD_AVAILABILITY.length,count);
  db.exec('DROP TABLE '+table);
 }
}
// The range-wide outlier guard must match the former per-field condition.
db.exec('CREATE TABLE DQ_RUN_FIELD_CONFIG (RUN_ID TEXT,FIELD_NAME TEXT,FIELD_TYPE TEXT,FIELD_ORDINAL INTEGER)');
const guardAt=out.indexOf('SELECT COUNT(*) INTO V_COUNT FROM DQ_DB.DQ_METRIC_RESULT M');
const guard=out.slice(guardAt,out.indexOf(';',guardAt)).replace('INTO V_COUNT','AS N').replaceAll('DQ_DB.','').replaceAll('P_RUN_ID',':run').replaceAll('V_FIRST',':first').replaceAll('V_LAST',':last');
clear();
for(const [run,field,ordinal]of [[base.P_RUN_ID,'INSIDE',1],[base.P_RUN_ID,'OUTSIDE',21],['OTHER_RUN','FOREIGN_FIELD',1]]){
 db.prepare('INSERT INTO DQ_RUN_FIELD_CONFIG VALUES (?,?,?,?)').run(run,field,'NUMERIC',ordinal);
 db.prepare('INSERT INTO DQ_METRIC_RESULT (RUN_ID,PROJECT_ID,FIELD_NAME,FIELD_TYPE,MODULE_NAME,PERIOD_LEVEL,PERIOD_VALUE,METRIC_NAME,METRIC_VALUE,IS_PERCENTAGE) VALUES (?,?,?,?,?,?,?,?,?,?)').run(run,'PROJECT',field,'NUMERIC','NUMERIC_OUTLIERS','OVERALL','ALL','OUTLIER_COUNT',0,'N');
}
assert.equal(db.prepare(guard).get({run:base.P_RUN_ID,first:1,last:20}).N,1);
db.prepare('DELETE FROM DQ_METRIC_RESULT WHERE RUN_ID=? AND FIELD_NAME=?').run(base.P_RUN_ID,'INSIDE');
assert.equal(db.prepare(guard).get({run:base.P_RUN_ID,first:1,last:20}).N,0);
let allCalls=expectedCalls;
for(let first=1;first<=415;first+=20)allCalls+=pack('V_METRIC_INSERT',outStatements(fields.slice(first-1,first+19),first),out).length;
const configured=read('config/rds_fields.csv').trim().split('\n').slice(1).map(l=>l.split(','));
for(const [type,size]of [['CATEGORICAL',8],['DATE',25],['IDENTIFIER',20]]){
 const names=configured.filter(r=>r[1]===type).map(r=>r[0]).sort();
 for(let first=1;first<=names.length;first+=size){const lists=otherStatements(type,names.slice(first-1,first+size-1),first);for(const [i,qs]of lists.entries())allCalls+=pack(i===0?'V_METRIC_INSERT':'V_AVAIL_INSERT',qs,other).length;}
}
assert.ok(allCalls<180);console.log('All profiling writers passed: batched Outlier/Category/Date/Identifier outputs match individual writes, explicit field widths survive mixed lengths, and outlier duplicate rejection is run/range isolated. Current full 589-field request plan: '+allCalls+' writes versus 2008, excluding metadata and standalone-statistics calls. Teradata runtime NOT measured.');

/* Execute the checked-in comparison view on synthetic SQLite data. Only
   Teradata EXTRACT/DECIMAL syntax is adapted. SPL, privileges, SAS and physical
   Teradata performance are not executed by these portable checks. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ddl=read('teradata/results/94_dq_field_change_review.sql');
// SQLite allows table-free UNION branches; Teradata rejects them. Check that
// the type catalogue references a table-backed, exactly-one-row anchor.
const typeCatalogue=ddl.slice(ddl.indexOf('comparison_types AS'),ddl.indexOf('saved AS'));
assert.equal((typeCatalogue.match(/FROM comparison_seed/g)||[]).length,2);
assert.match(ddl,/SELECT COUNT\(\*\) AS SEED_COUNT FROM DQ_DB\.DQ_RUN_NUMBER/);
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE DQ_RUN_LOG (RUN_ID TEXT PRIMARY KEY,PROJECT_ID TEXT,STATUS TEXT);
CREATE TABLE DQ_RUN_NUMBER (RUN_ID TEXT PRIMARY KEY,RUN_NUMBER INTEGER);
CREATE TABLE DQ_METRIC_RESULT (RUN_ID TEXT,PROJECT_ID TEXT,FIELD_NAME TEXT,
 FIELD_TYPE TEXT,MODULE_NAME TEXT,PERIOD_LEVEL TEXT,PERIOD_VALUE TEXT,POU_DT TEXT,
 METRIC_NAME TEXT,METRIC_VALUE NUMERIC,IS_PERCENTAGE TEXT,RATE_NUMERATOR INTEGER,
 RATE_DENOMINATOR INTEGER,UNIQUE(RUN_ID,FIELD_NAME,MODULE_NAME,PERIOD_LEVEL,PERIOD_VALUE,METRIC_NAME));`);
const runs=[['main','P1','SUCCEEDED',701],['other','P2','SUCCEEDED',702],
 ['failed','P1','FAILED',703],['running','P1','RUNNING',704],
 ['second','P1','SUCCEEDED',705],['legacy','P1','SUCCEEDED',706]];
for(const [id,project,status,n]of runs){
 db.prepare('INSERT INTO DQ_RUN_LOG VALUES (?,?,?)').run(id,project,status);
 db.prepare('INSERT INTO DQ_RUN_NUMBER VALUES (?,?)').run(id,n);
}
const seedSQL=ddl.slice(ddl.indexOf('WITH comparison_seed'),ddl.indexOf('saved AS'))
 .trim().replace(/,$/,'').replaceAll('DQ_DB.','')+' SELECT * FROM comparison_types';
const expectedTypes=[{COMPARISON_TYPE:'MOM',MONTH_GAP:1},{COMPARISON_TYPE:'YOY',MONTH_GAP:12}];
assert.deepEqual(db.prepare(seedSQL).all().map(r=>({...r})),expectedTypes,'Multiple metadata rows must not multiply comparisons');
db.exec('SAVEPOINT empty_numbers; DELETE FROM DQ_RUN_NUMBER');
assert.deepEqual(db.prepare(seedSQL).all().map(r=>({...r})),expectedTypes,'Empty metadata must still generate exactly two types');
db.exec('ROLLBACK TO empty_numbers; RELEASE empty_numbers');
const put=db.prepare('INSERT INTO DQ_METRIC_RESULT VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
function metric({run='main',project='P1',field='AMOUNT',type='NUMERIC',module=type+'_BASIC',
 date,period=date?.slice(0,7),level='MONTHLY',name,value,pct='N',num=null,den=null}){
 const row=[run,project,field,type,module,level,period,date,name,value,pct,num,den];
 put.run(...row);
}
const dates=['2019-12-27','2020-01-30','2020-03-31','2020-12-29','2021-01-29','2021-03-30'];
const means=[100,125,50,200,250,null],missing=[2,8,0,4,6,null];
for(const [i,date]of dates.entries()){
 for(const [name,value]of Object.entries({TOTAL_COUNT:100,NON_MISSING_COUNT:missing[i]===null?null:100-missing[i],MISSING_COUNT:missing[i],ZERO_COUNT:i,
   SPECIAL_COUNT:10,MINIMUM:-10,MAXIMUM:300,MEAN:means[i],STDDEV_POP:i}))metric({date,name,value});
 for(const [name,value]of [['MISSING_RATE_PCT',missing[i]],['SPECIAL_RATE_PCT',10],['ZERO_RATE_PCT',i]])metric({date,name,value,pct:'Y',num:value,den:100});
 for(const [name,value]of [['OUTLIER_COUNT',i],['OUTLIER_VALID_COUNT',90],['OUTLIER_RATE_PCT',i*100/90],['OUTLIER_LOWER_BOUND',-3]])metric({date,name,value,module:'NUMERIC_OUTLIERS',pct:name.endsWith('_PCT')?'Y':'N'});
 for(const [field,type]of [['CATEGORY','CATEGORICAL'],['ID','IDENTIFIER']]){
  metric({date,field,type,name:'MISSING_COUNT',value:i});
  metric({date,field,type,name:'MISSING_RATE_PCT',value:i,pct:'Y',num:i,den:100});
  metric({date,field,type,name:'DISTINCT_COUNT',value:i+2});
  if(type==='CATEGORICAL'){
   metric({date,field,type,name:'SPECIAL_COUNT',value:10});
   metric({date,field,type,name:'SPECIAL_RATE_PCT',value:10,pct:'Y',num:10,den:100});
  }
 }
 for(const [name,value]of [['TOTAL_COUNT',100],['NON_MISSING_COUNT',75],['MISSING_COUNT',25],['MISSING_RATE_PCT',25]])metric({date,field:'DATE_FIELD',type:'DATE',name,value,pct:name.endsWith('_PCT')?'Y':'N',num:25,den:100});
}
for(const [run,project]of [['other','P2'],['failed','P1'],['running','P1'],['second','P1']])
 metric({run,project,date:'2020-01-15',name:'MEAN',value:9000});
for(const period of ['2020-01','2020-02'])metric({run:'legacy',date:null,period,name:'MEAN',value:10});
metric({date:null,period:'UNKNOWN',name:'MEAN',value:999});
metric({date:null,period:'ALL',level:'OVERALL',name:'MEAN',value:999});
metric({date:'2020-12-31',period:'2020',level:'YEARLY',name:'MEAN',value:999});
for(const [field,values]of [['NEGATIVE',[-10,-5]],['ZERO_BASE',[0,5]],['NULL_PREVIOUS',[null,5]],['EXTREME',[-9e27,9e27]],['OVERFLOW_RATIO',[0.000001,1e28]]])
 for(const [i,value]of values.entries())metric({field,date:['2020-01-30','2020-02-28'][i],name:'MEAN',value});

/* SQLite does not implement DECIMAL scales. Apply round() only for the
   explicit six-decimal casts; leave all other actual SQL expressions intact. */
function roundDecimal(sql){
 let out='';
 for(let i=0;i<sql.length;){
  if(sql.slice(i,i+5).toUpperCase()!=='CAST('){out+=sql[i++];continue;}
  let j=i+5,depth=1,quote=null;
  for(;j<sql.length;j++){
   const c=sql[j];if(quote){if(c===quote){if(sql[j+1]===quote)j++;else quote=null;}continue;}
   if(c==="'"||c==='"'){quote=c;continue;}
   if(c==='(')depth++;if(c===')'&&--depth===0)break;
  }
  const inner=sql.slice(i+5,j),m=inner.match(/^([\s\S]*) AS DECIMAL\(38,6\)$/i);
  out+=m?'round('+roundDecimal(m[1])+',6)':'CAST('+roundDecimal(inner)+')';i=j+1;
 }
 return out;
}
const query=roundDecimal(ddl.slice(0,ddl.indexOf('GRANT SELECT'))
 .replace('REPLACE VIEW','CREATE VIEW').replaceAll('DQ_DB.','')
 .replaceAll('EXTRACT(YEAR FROM R.POU_DT)',"CAST(strftime('%Y',R.POU_DT) AS INTEGER)")
 .replaceAll('EXTRACT(MONTH FROM R.POU_DT)',"CAST(strftime('%m',R.POU_DT) AS INTEGER)"));
const snapshot=JSON.stringify(db.prepare('SELECT * FROM DQ_METRIC_RESULT ORDER BY RUN_ID,FIELD_NAME,METRIC_NAME,PERIOD_VALUE').all());
db.exec(query);
// Inspect the internal comparison CTE in tests only; production exposes one
// wide view and creates no separate detail view.
const reference=query.slice(query.indexOf('WITH comparison_seed'),query.indexOf('\nSELECT C.RUN_ID'));
db.exec('CREATE TEMP VIEW DQ_CHANGE_DETAIL_FIXTURE AS '+reference+' SELECT * FROM changes');
const rows=db.prepare('SELECT * FROM DQ_CHANGE_DETAIL_FIXTURE').all();
const get=(field,name,date,comparison='MOM',run='main')=>rows.find(r=>r.RUN_ID===run&&r.FIELD_NAME===field&&r.METRIC_NAME===name&&r.POU_DT===date&&r.COMPARISON_TYPE===comparison);
const near=(a,b)=>assert.ok(Math.abs(a-b)<0.0000006,`${a} != ${b}`);
assert.equal(get('AMOUNT','MEAN_VALUE','2020-01-30').PREVIOUS_POU_DT,'2019-12-27');
assert.equal(get('AMOUNT','MEAN_VALUE','2020-01-30').ABSOLUTE_CHANGE,25);
assert.equal(get('AMOUNT','MEAN_VALUE','2020-01-30').RELATIVE_CHANGE,0.25);
assert.equal(get('AMOUNT','MISSING_RATE','2020-01-30').CURRENT_VALUE,0.08);
near(get('AMOUNT','MISSING_RATE','2020-01-30').ABSOLUTE_CHANGE,0.06);
near(get('AMOUNT','MISSING_RATE','2020-01-30').RATE_CHANGE_PP,6);
assert.equal(get('AMOUNT','MEAN_VALUE','2020-01-30').RATE_CHANGE_PP,null);
assert.equal(get('AMOUNT','MEAN_VALUE','2020-03-31').COMPARISON_STATUS,'NOT_EVALUATED','missing February must not pair January with March');
assert.equal(get('AMOUNT','MEAN_VALUE','2020-12-29','YOY').PREVIOUS_POU_DT,'2019-12-27','YoY is a calendar join, not lag 12 rows');
assert.equal(get('AMOUNT','MEAN_VALUE','2021-01-29','YOY').ABSOLUTE_CHANGE,125);
assert.equal(get('AMOUNT','MEAN_VALUE','2021-03-30','YOY').COMPARISON_STATUS,'NOT_EVALUATED');
assert.match(get('AMOUNT','MEAN_VALUE','2021-03-30','YOY').REASON,/Current metric/);
assert.equal(get('AMOUNT','MEAN_VALUE','2019-12-27').PREVIOUS_VALUE,null);
assert.match(get('AMOUNT','MEAN_VALUE','2019-12-27').REASON,/Comparison month/);
for(const field of ['CATEGORY','ID']){
 assert.equal(get(field,'TOTAL_COUNT','2020-01-30').CURRENT_VALUE,100);
 assert.equal(get(field,'NON_MISSING_COUNT','2020-01-30').CURRENT_VALUE,99);
 assert.equal(get(field,'DISTINCT_COUNT','2020-01-30').ABSOLUTE_CHANGE,1);
}
assert.equal(get('DATE_FIELD','MISSING_RATE','2020-01-30').CURRENT_VALUE,0.25);
assert.equal(get('AMOUNT','OUTLIER_COUNT','2020-01-30').MODULE_NAME,'NUMERIC_OUTLIERS');
assert.equal(get('NEGATIVE','MEAN_VALUE','2020-02-28').RELATIVE_CHANGE,-0.5);
const zero=get('ZERO_BASE','MEAN_VALUE','2020-02-28');
assert.equal(zero.COMPARISON_STATUS,'EVALUATED');assert.equal(zero.ABSOLUTE_CHANGE,5);
assert.equal(zero.RELATIVE_CHANGE,null);assert.match(zero.REASON,/previous value is zero/);
assert.match(get('NULL_PREVIOUS','MEAN_VALUE','2020-02-28').REASON,/Previous metric/);
assert.equal(get('EXTREME','MEAN_VALUE','2020-02-28').RELATIVE_CHANGE,-2);
assert.equal(get('OVERFLOW_RATIO','MEAN_VALUE','2020-02-28').RELATIVE_CHANGE,null);
assert.match(get('OVERFLOW_RATIO','MEAN_VALUE','2020-02-28').REASON,/display range/);
assert.equal(rows.some(r=>['failed','running','legacy'].includes(r.RUN_ID)),false);
assert.equal(get('AMOUNT','MEAN_VALUE','2020-01-15','MOM','second').COMPARISON_STATUS,'NOT_EVALUATED','never borrow previous month from another run');
assert.equal(get('AMOUNT','MEAN_VALUE','2020-01-30').CURRENT_VALUE,125,'other project cannot contaminate values');
assert.ok(rows.every(r=>r.POU_DT!==null&&r.METRIC_NAME!=='OUTLIER_LOWER_BOUND'));
assert.equal(new Set(rows.map(r=>[r.RUN_ID,r.PROJECT_ID,r.FIELD_NAME,r.MODULE_NAME,r.COMPARISON_TYPE,r.POU_DT,r.METRIC_NAME].join('/'))).size,rows.length);
assert.equal(JSON.stringify(db.prepare('SELECT * FROM DQ_METRIC_RESULT ORDER BY RUN_ID,FIELD_NAME,METRIC_NAME,PERIOD_VALUE').all()),snapshot,'comparison is read-only');
assert.deepEqual(db.prepare("SELECT * FROM DQ_CHANGE_DETAIL_FIXTURE WHERE PROJECT_ID='P1' AND RUN_NUMBER=701 AND COMPARISON_TYPE='MOM'").all(),rows.filter(r=>r.PROJECT_ID==='P1'&&r.RUN_NUMBER===701&&r.COMPARISON_TYPE==='MOM'));
assert.doesNotMatch(ddl.replace(/\/\*[\s\S]*?\*\//g,''),/\b(?:INSERT|UPDATE|DELETE|CREATE TABLE|LAG)\b/i);
assert.doesNotMatch(ddl,/DQ_PROJECT_CONFIG|DQ_FIELD_CONFIG|VW_RDS|DBC\./i);

// Run the supplied isolated server fixture too. Adapt client/DDL syntax and
// allocation only; every checked-in assertion must return zero rows locally.
db.exec('ALTER TABLE DQ_RUN_LOG ADD START_TIME TEXT; ALTER TABLE DQ_RUN_LOG ADD END_TIME TEXT; ALTER TABLE DQ_METRIC_RESULT ADD EXECUTION_TIMESTAMP TEXT');
const fixture=read('tests/test_field_changes.sql').replace(/\/\*[\s\S]*?\*\//g,'')
 .replaceAll('DQ_DB.','').replaceAll('CURRENT_TIMESTAMP(6)','CURRENT_TIMESTAMP')
 .replace('CREATE VOLATILE TABLE','CREATE TEMP TABLE').replace('ON COMMIT PRESERVE ROWS','')
 .replace(/DATE '([0-9-]+)'/g,"'$1'")
 .replace(/CALL SP_DQ_ASSIGN_RUN_NUMBER\('([^']+)'\)/g,
   (_,id)=>`INSERT INTO DQ_RUN_NUMBER SELECT '${id}',COALESCE(MAX(RUN_NUMBER),0)+1 FROM DQ_RUN_NUMBER`);
let assertions=0;
for(const statement of fixture.split(';').map(s=>s.trim()).filter(Boolean)){
 if(statement.startsWith('SELECT')){
  assert.deepEqual(db.prepare(statement).all(),[],statement);assertions++;
 }else db.exec(statement);
}
assert.equal(assertions,8);

// SAS contract checks complement (and do not substitute for) server testing.
const sas=read('sas/01_dq_controller.sas'),macro=sas.slice(sas.indexOf('%macro run_dq_changes'));
assert.match(sas,/%macro run_dq_engine\([\s\S]*?mom=N,yoy=N\)/);
assert.ok(sas.indexOf('%run_dq_changes(project=')>sas.indexOf('DQ run number &dq_run_number completed successfully'));
assert.match(macro,/%if &_n ne 1/);
assert.match(macro,/%if %superq\(_source_status\) ne SUCCEEDED/);
assert.match(macro,/%if &mom=N and &yoy=N/);
assert.match(macro,/coalesce\(sum\(FIELD_MONTHS\),0\)/);
assert.match(macro,/MOM_STATUS='PARTIALLY_EVALUATED'/);
assert.match(macro,/YOY_STATUS='PARTIALLY_EVALUATED'/);
assert.match(macro,/%if &mom=Y[\s\S]*?COMPARISON_TYPE='MOM'/);
assert.match(macro,/%if &yoy=Y[\s\S]*?COMPARISON_TYPE='YOY'/);
assert.match(sas,/20261016_WIDE_CHANGES/);
assert.doesNotMatch(macro,/execute\s*\(|SQL_TEXT|%let dq_status=/i);
assert.match(read('sas/06_run_dq_changes.sas'),/%let comparison_run_number = ;/);

// The wide review pivots the detailed view without combining runs or changing
// values. Compare every metric cell, not just a few layout examples.
assert.equal(fs.existsSync(new URL('../teradata/results/95_dq_change_review.sql',import.meta.url)),false);
const wide=db.prepare('SELECT * FROM DQ_FIELD_CHANGE_REVIEW').all();
const detail=db.prepare('SELECT * FROM DQ_CHANGE_DETAIL_FIXTURE').all();
const wideKey=r=>[r.RUN_ID,r.PROJECT_ID,r.FIELD_NAME,r.FIELD_TYPE,r.POU_DT].join('/');
const grouped=Map.groupBy(detail,wideKey);
assert.equal(wide.length,grouped.size);assert.equal(new Set(wide.map(wideKey)).size,wide.length);
const metricNames=['TOTAL_COUNT','NON_MISSING_COUNT','MISSING_COUNT','MISSING_RATE','SPECIAL_COUNT','SPECIAL_RATE',
 'OUTLIER_VALID_COUNT','OUTLIER_COUNT','OUTLIER_RATE','DISTINCT_COUNT','ZERO_COUNT','ZERO_RATE',
 'MIN_VALUE','MAX_VALUE','MEAN_VALUE','STDDEV_VALUE'];
for(const row of wide){
 const parts=grouped.get(wideKey(row));assert.equal(row.PERIOD_LEVEL,'MONTHLY');
 for(const name of metricNames){
  const cells=parts.filter(p=>p.METRIC_NAME===name);
  assert.equal(row[name],cells[0]?.CURRENT_VALUE??null,'Current value '+name);
  for(const type of ['MOM','YOY'])assert.equal(row[name+'_'+type+'_CHANGE'],cells.find(p=>p.COMPARISON_TYPE===type)?.ABSOLUTE_CHANGE??null,'Signed change '+name+'/'+type);
 }
 for(const type of ['MOM','YOY']){
  const cells=parts.filter(p=>p.COMPARISON_TYPE===type),evaluated=cells.filter(p=>p.COMPARISON_STATUS==='EVALUATED').length;
  assert.equal(row[type+'_STATUS'],evaluated===0?'NOT_EVALUATED':evaluated===cells.length?'EVALUATED':'PARTIALLY_EVALUATED');
  assert.equal(row[type+'_PREVIOUS_POU_DT'],cells.map(p=>p.PREVIOUS_POU_DT).filter(Boolean).sort().at(-1)??null);
 }
 const modules=new Set(parts.map(p=>p.MODULE_NAME));
 assert.equal(row.MODULE_NAME,modules.has('NUMERIC_BASIC')&&modules.has('NUMERIC_OUTLIERS')?'NUMERIC_BASIC+OUTLIERS':[...modules][0]);
}
const wideAmount=wide.find(r=>r.RUN_ID==='main'&&r.FIELD_NAME==='AMOUNT'&&r.POU_DT==='2020-01-30');
assert.equal(wideAmount.MEAN_VALUE_MOM_CHANGE,25);assert.equal(wideAmount.MISSING_RATE_MOM_CHANGE,.06);
assert.equal(wideAmount.MEAN_VALUE_YOY_CHANGE,null);assert.equal(wideAmount.YOY_STATUS,'NOT_EVALUATED');
const widePartial=wide.find(r=>r.RUN_ID==='main'&&r.FIELD_NAME==='AMOUNT'&&r.POU_DT==='2021-03-30');
assert.equal(widePartial.YOY_STATUS,'PARTIALLY_EVALUATED');
assert(wide.filter(r=>r.FIELD_TYPE==='DATE').every(r=>r.MEAN_VALUE===null&&r.ZERO_RATE_MOM_CHANGE===null));
assert.equal(wide.some(r=>['failed','running','legacy'].includes(r.RUN_ID)),false);
assert.deepEqual(db.prepare("SELECT * FROM DQ_FIELD_CHANGE_REVIEW WHERE PROJECT_ID='P1' AND RUN_NUMBER=701").all(),wide.filter(r=>r.PROJECT_ID==='P1'&&r.RUN_NUMBER===701));
console.log(`Wide review passed: ${wide.length} field/month rows, all 48 metric columns match detailed values; statuses, dates, module merging and isolation verified locally.`);
// SAS reads one aggregate row, then emits the requested type summaries.
const summarySQL=macro.slice(macro.indexOf('(select CAST(COUNT(*) AS FLOAT) AS FIELD_MONTHS,')+1,
 macro.indexOf(');',macro.indexOf('(select CAST(COUNT(*) AS FLOAT) AS FIELD_MONTHS,')))
 .replaceAll('&dq_database..','').replaceAll('&_project_sql',"'P1'").replaceAll('&run_number','701');
assert.equal((summarySQL.match(/from DQ_FIELD_CHANGE_REVIEW/g)||[]).length,1);
const aggregate=db.prepare(summarySQL).get(),selectedWide=wide.filter(r=>r.PROJECT_ID==='P1'&&r.RUN_NUMBER===701);
assert.equal(aggregate.FIELD_MONTHS,selectedWide.length);
assert.equal(aggregate.FIELDS_COMPARED,new Set(selectedWide.map(r=>r.FIELD_NAME)).size);
for(const type of ['MOM','YOY']){
 assert.equal(aggregate[type+'_EVALUATED'],selectedWide.filter(r=>r[type+'_STATUS']==='EVALUATED').length);
 assert.equal(aggregate[type+'_PARTIAL'],selectedWide.filter(r=>r[type+'_STATUS']==='PARTIALLY_EVALUATED').length);
 assert.equal(aggregate[type+'_UNAVAILABLE'],selectedWide.filter(r=>r[type+'_STATUS']==='NOT_EVALUATED').length);
}
const emptyAggregate=db.prepare(summarySQL.replace("PROJECT_ID='P1'","PROJECT_ID='ABSENT'")).get();
assert.equal(emptyAggregate.FIELD_MONTHS,0);assert.equal(emptyAggregate.MOM_EVALUATED,0);assert.equal(emptyAggregate.YOY_UNAVAILABLE,0);
assert.doesNotMatch(macro,/METRIC_COMPARISONS|COMPARISON_TYPE in/);
assert.match(macro,/keep COMPARISON_TYPE FIELD_MONTHS EVALUATED_COUNT PARTIAL_COUNT/);
db.close();
console.log(`Field change checks passed: ${rows.length} MoM/YoY rows and ${assertions} supplied fixture assertions; exact calendar gaps, all Basic types, outliers, rate units, NULLs/zero baselines, large values, isolation and read-only history. SAS/Teradata NOT executed.`);

/* Focused generated-SQL regression on synthetic SQLite data. This executes
   the checked-in evaluator/view/INSERT, not Teradata SPL, privileges or SAS. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const adapt=s=>s.replaceAll('DQ_DB.','').replaceAll('CHARACTER SET LATIN','')
 .replaceAll('CREATE MULTISET TABLE','CREATE TABLE').replaceAll('REPLACE VIEW','CREATE VIEW');
const db=new DatabaseSync(':memory:');
function table(file,name){
 const source=read(file);const start=source.indexOf('CREATE MULTISET TABLE DQ_DB.'+name);
 const end=source.indexOf(') PRIMARY INDEX',start);
 const key=name==='DQ_RULE_RESULT'?'RULE_NAME':'METRIC_NAME';
 db.exec(adapt(source.slice(start,end))+`,UNIQUE(RUN_ID,FIELD_NAME,MODULE_NAME,PERIOD_LEVEL,PERIOD_VALUE,${key}));`);
}
table('teradata/setup/01_create_result_tables.sql','DQ_METRIC_RESULT');
table('teradata/setup/17_create_rule_results.sql','DQ_RULE_RESULT');
db.exec(`CREATE TABLE DQ_RUN_LOG (RUN_ID TEXT PRIMARY KEY,PROJECT_ID TEXT,STATUS TEXT,GREEN_THRESHOLD NUMERIC,RED_THRESHOLD NUMERIC);
 CREATE TABLE DQ_RUN_NUMBER (RUN_ID TEXT PRIMARY KEY,RUN_NUMBER INTEGER);
 CREATE TABLE DQ_ENGINE_SETTINGS (PROJECT_ID TEXT,GREEN_THRESHOLD NUMERIC,RED_THRESHOLD NUMERIC);`);
for(const [id,project,status,green,red]of [['a','P1','RUNNING',1,5],['b','P2','RUNNING',2,7],['bad_threshold','P1','RUNNING',5,1],['missing_threshold','P1','RUNNING',null,5],['failed','P1','FAILED',1,5],['legacy','P1','SUCCEEDED',1,5]]){
 db.prepare('INSERT INTO DQ_RUN_LOG VALUES (?,?,?,?,?)').run(id,project,status,green,red);
 db.prepare('INSERT INTO DQ_RUN_NUMBER VALUES (?,?)').run(id,db.prepare('SELECT COUNT(*) AS n FROM DQ_RUN_NUMBER').get().n+1);
}
const put=db.prepare(`INSERT INTO DQ_METRIC_RESULT
 (RUN_ID,PROJECT_ID,FIELD_NAME,FIELD_TYPE,MODULE_NAME,PERIOD_LEVEL,PERIOD_VALUE,METRIC_NAME,
 METRIC_VALUE,IS_PERCENTAGE,RATE_NUMERATOR,RATE_DENOMINATOR,DQ_COLOUR,EXECUTION_TIMESTAMP)
 VALUES (?,?,?,'NUMERIC','NUMERIC_BASIC',?,?,?,?,?,?,?,?, '2026-10-14 12:00:00')`);
function metric(run,project,field,value,n,d,{name='MISSING_RATE_PCT',period=['OVERALL','ALL'],pct='Y',colour=null}={}){
 put.run(run,project,field,...period,name,value,pct,n,d,colour);
}
const cases=[['ZERO',0,0,100,'GREEN'],['BELOW_ONE',.99999999,99999999,10000000000,'GREEN'],
 ['EXACT_ONE',1,1,100,'AMBER'],['BELOW_FIVE',4.99999999,499999999,10000000000,'AMBER'],
 ['EXACT_FIVE',5,5,100,'RED'],['ALL_MISSING',100,100,100,'RED'],
 ['EMPTY',null,0,0,'NOT_EVALUATED'],['NO_DENOMINATOR',null,null,null,'NOT_EVALUATED'],
 ['NO_NUMERATOR',1,null,100,'NOT_EVALUATED'],['INVALID_NEGATIVE',1,-1,100,'NOT_EVALUATED'],
 ['INVALID_DENOMINATOR',1,1,-100,'NOT_EVALUATED'],['EXCEEDS_POPULATION',101,101,100,'NOT_EVALUATED'],
 ['NO_VALUE',null,1,100,'NOT_EVALUATED'],['INVALID_VALUE',101,1,100,'NOT_EVALUATED'],
 // Stored display value rounds to the threshold; exact counts still govern.
 ['ROUNDED_ONE',1,99999999999,10000000000000,'GREEN']];
for(const [field,value,n,d]of cases)metric('a','P1',field,value,n,d);
metric('a','P1','MEAN',3,null,null,{name:'MEAN',pct:'N'});
metric('a','P1','EXACT_ONE',1,1,100,{period:['YEARLY','2000']});
metric('a','P1','EXACT_ONE',1,1,100,{period:['MONTHLY','2000-01']});
metric('a','P1','EXACT_ONE',0,0,100,{name:'ZERO_RATE_PCT'});
metric('b','P2','EXACT_ONE',1,1,100);
metric('bad_threshold','P1','X',1,1,100);
metric('missing_threshold','P1','X',1,1,100);
metric('legacy','P1','X',25,25,100,{colour:'RED'});
metric('failed','P1','X',1,1,100);
const source=read('teradata/results/90_colour_classification.sql');
db.exec(adapt(source.slice(0,source.indexOf('REPLACE PROCEDURE'))));
const insert=source.match(/INSERT INTO DQ_DB\.DQ_RULE_RESULT[\s\S]*?WHERE RUN_ID=P_RUN_ID;/)[0];
const projectGuard=source.match(/SELECT COUNT\(\*\) INTO V_COUNT[\s\S]*?;/)[0].replace(' INTO V_COUNT','');
const runLock=source.match(/UPDATE DQ_DB\.DQ_RUN_LOG SET STATUS=STATUS[\s\S]*?;/)[0];
function classify(id){
 // Execute DML/guard SQL inside SQLite's transaction. SPL IF/SIGNAL/lock
 // semantics and rollback after Teradata errors still need server testing.
 const substitute=s=>adapt(s).replaceAll('P_RUN_ID',"'"+id+"'");
 db.exec('BEGIN TRANSACTION');
 try{
  assert.equal(db.prepare(substitute(runLock)).run().changes,1,'active run required');
  assert.equal(db.prepare(substitute(projectGuard)).get()['COUNT(*)'],0,'matching project required');
  db.prepare('DELETE FROM DQ_RULE_RESULT WHERE RUN_ID=?').run(id);
  db.exec(substitute(insert));db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}

const before=db.prepare('SELECT * FROM DQ_METRIC_RESULT').all();
classify('b');const bSnapshot=db.prepare("SELECT * FROM DQ_RULE_RESULT WHERE RUN_ID='b'").all();
classify('a');classify('a');
assert.deepEqual(db.prepare('SELECT * FROM DQ_METRIC_RESULT').all(),before,'profiling rows unchanged');
assert.deepEqual(db.prepare("SELECT * FROM DQ_RULE_RESULT WHERE RUN_ID='b'").all(),bSnapshot,'other run untouched');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_RULE_RESULT WHERE RUN_ID='a'").get().n,cases.length+3);
for(const [field,value,,,status]of cases){
 const row=db.prepare("SELECT * FROM DQ_RULE_RESULT WHERE RUN_ID='a' AND FIELD_NAME=? AND PERIOD_LEVEL='OVERALL' AND RULE_NAME='MISSING_RATE_PCT'").get(field);
 assert.equal(row.STATUS,status,field);assert.equal(row.OBSERVED_VALUE,value);
 assert.equal(row.GREEN_THRESHOLD,1);assert.equal(row.RED_THRESHOLD,5);
 if(status==='NOT_EVALUATED')assert.ok(row.REASON?.length>0,field);else assert.equal(row.REASON,null);
}
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_RULE_RESULT WHERE RULE_NAME='MEAN'").get().n,0);
assert.equal(bSnapshot[0].STATUS,'GREEN');
for(const id of ['bad_threshold','missing_threshold']){
 classify(id);assert.equal(db.prepare('SELECT STATUS FROM DQ_RULE_RESULT WHERE RUN_ID=?').get(id).STATUS,'NOT_EVALUATED');
}
// Changing live settings does not affect captured thresholds or stored decisions.
db.exec("INSERT INTO DQ_ENGINE_SETTINGS VALUES ('P1',10,20)");
const stored=db.prepare("SELECT * FROM DQ_RULE_RESULT WHERE RUN_ID='a'").all();
db.exec("UPDATE DQ_RUN_LOG SET STATUS='SUCCEEDED' WHERE RUN_ID='a'");
for(const id of ['a','legacy','failed','absent'])assert.throws(()=>classify(id));
assert.deepEqual(db.prepare("SELECT * FROM DQ_RULE_RESULT WHERE RUN_ID='a'").all(),stored);
// A persistence error must roll back replacement, retaining previous outcomes.
db.exec("CREATE TRIGGER fail_rule_insert BEFORE INSERT ON DQ_RULE_RESULT WHEN NEW.RUN_ID='b' BEGIN SELECT RAISE(ABORT,'synthetic insert failure'); END");
assert.throws(()=>classify('b'));
assert.deepEqual(db.prepare("SELECT * FROM DQ_RULE_RESULT WHERE RUN_ID='b'").all(),bSnapshot);
db.exec('DROP TRIGGER fail_rule_insert');
// Reject a cross-project metric before deleting existing decisions.
metric('b','P1','BAD_PROJECT',1,1,100);assert.throws(()=>classify('b'));
assert.deepEqual(db.prepare("SELECT * FROM DQ_RULE_RESULT WHERE RUN_ID='b'").all(),bSnapshot);
db.exec(adapt(read('teradata/results/91_dq_summary_views.sql')));
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DQ_COMPLETED_RESULT WHERE RUN_ID IN ('b','failed')").get().n,0);
assert.equal(db.prepare("SELECT DQ_COLOUR FROM DQ_COMPLETED_RESULT WHERE RUN_ID='a' AND FIELD_NAME='EXACT_ONE' AND PERIOD_LEVEL='OVERALL' AND METRIC_NAME='MISSING_RATE_PCT'").get().DQ_COLOUR,'AMBER');
assert.equal(db.prepare("SELECT DQ_COLOUR FROM DQ_COMPLETED_RESULT WHERE RUN_ID='legacy'").get().DQ_COLOUR,'RED','history preserved');
const summary=db.prepare("SELECT * FROM DQ_RUN_SUMMARY WHERE RUN_ID='a'").get();
assert.equal(summary.METRIC_RESULT_COUNT,cases.length+4);
assert.equal(summary.GREEN_COUNT,4);assert.equal(summary.AMBER_COUNT,4);assert.equal(summary.RED_COUNT,2);
// Database CHECK and unique index protect simple persisted outcome shape.
assert.throws(()=>db.exec("UPDATE DQ_RULE_RESULT SET REASON=NULL WHERE STATUS='NOT_EVALUATED'"));
assert.throws(()=>db.exec("INSERT INTO DQ_RULE_RESULT SELECT * FROM DQ_RULE_RESULT WHERE RUN_ID='a'"));
const runner=read('teradata/modules/00_run_engine.sql');
assert.equal([...runner.matchAll(/DELETE FROM DQ_DB\.DQ_RULE_RESULT WHERE RUN_ID=P_RUN_ID;/g)].length,3);
assert.ok(runner.indexOf('CALL DQ_DB.SP_DQ_CLASSIFY(P_RUN_ID)')<runner.indexOf("SET STATUS='SUCCEEDED'"));
assert.ok(source.indexOf("SIGNAL SQLSTATE 'U0050'")<source.indexOf('DELETE FROM'));
assert.ok(source.indexOf("SIGNAL SQLSTATE 'U0051'")<source.indexOf('DELETE FROM'));
assert.ok(!source.includes('DQ_ENGINE_SETTINGS'));
db.close();
console.log('Rule SQL checks passed: boundaries, undefined/invalid inputs, snapshots, idempotence, project/run/period isolation, completed-run protection, historical compatibility and unchanged measurements. Teradata SPL/SAS NOT executed.');

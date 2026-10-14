/* Developer-only checks, Node built-ins + optional unzip. The deployed engine
   uses SAS/Teradata exclusively. This is NOT a Teradata/SAS compiler or runner. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fields=read('config/rds_fields.csv').trim().split('\n').slice(1).map(l=>{const [name,type]=l.split(',');return {name,type};});
assert.equal(fields.length,589);
assert.equal(new Set(fields.map(f=>f.name)).size,589);
assert.deepEqual(Object.fromEntries(['NUMERIC','CATEGORICAL','DATE','IDENTIFIER'].map(t=>[t,fields.filter(f=>f.type===t).length])),{NUMERIC:415,CATEGORICAL:125,DATE:35,IDENTIFIER:14});
for(const f of fields){
    assert.match(f.name,/^[A-Za-z_][A-Za-z0-9_]*$/);
}
/* A fresh installation provides fixed metrics but leaves project configuration
   empty for the Excel loader. No SQL seed is needed for a new project. */
assert.ok(!fs.existsSync(path.join(root,'teradata/setup/03_seed_rds_config.sql')));
const schema=read('teradata/setup/00_create_config_tables.sql');
const catalog=[...schema.matchAll(/INSERT INTO DQ_DB\.DQ_METRIC_DEFINITION VALUES \('NUMERIC_BASIC',(\d+),'([^']+)','([YN])'\);/g)]
    .map(([,ordinal,name,percentage])=>({ordinal:+ordinal,name,percentage}));
const metricNames=['TOTAL_COUNT','NON_MISSING_COUNT','MISSING_COUNT','MISSING_RATE_PCT','ZERO_COUNT','ZERO_RATE_PCT','MINIMUM','MAXIMUM','MEAN','STDDEV_POP','SPECIAL_COUNT','SPECIAL_RATE_PCT'];
assert.deepEqual(catalog,metricNames.map((name,i)=>({ordinal:i+1,name,percentage:[4,6,12].includes(i+1)?'Y':'N'})));
assert.ok(!/INSERT INTO DQ_DB\.DQ_(PROJECT_CONFIG|FIELD_CONFIG|ENGINE_SETTINGS)\b/.test(schema));
const audit=read('config/rds_ddl_validation.csv').trim().split('\n').slice(1);
assert.equal(audit.length,589);
assert.ok(audit.every(l=>l.endsWith(',PRESENT,UNVERIFIED')));

/* Ignore comments and quoted strings/identifiers while checking delimiters.
   Return a scrubbed body for structural checks on procedural control flow. */
function lex(text,label){
    let depth=0,clean='';
    for(let i=0;i<text.length;i++){
        const c=text[i];
        if(c==='/'&&text[i+1]==='*'){
            const end=text.indexOf('*/',i+2);assert.ok(end>=0,`${label}: unclosed comment`);i=end+1;clean+=' ';continue;
        }
        if(c==='-'&&text[i+1]==='-'){
            const end=text.indexOf('\n',i+2);i=end<0?text.length:end-1;clean+=' ';continue;
        }
        /* SAS masks the unmatched quote in %str(%'). It is a macro-function
           argument, not the beginning of a quoted SAS/SQL string. */
        if(label.endsWith('.sas')&&text.slice(i,i+8).toLowerCase()==="%str(%')"){
            i+=7;clean+=' ';continue;
        }
        if(c==="'"||c==='"'){
            const start=i;
            let closed=false;
            for(i++;i<text.length;i++){if(text[i]===c){if(text[i+1]===c){i++;continue;}closed=true;break;}}
            assert.ok(closed,`${label}: unclosed quote`);
            if(label.endsWith('.sas')&&c==="'"){
                assert.ok(!/&[A-Za-z_]/.test(text.slice(start+1,i)),`${label}: unresolved macro reference inside single quotes`);
            }
            clean+=' ';continue;
        }
        if(c==='(')depth++;
        if(c===')'){depth--;assert.ok(depth>=0,`${label}: excess closing parenthesis`);}
        clean+=c;
    }
    assert.equal(depth,0,`${label}: unclosed parenthesis`);return clean;
}
/* Regression: reject the CALL shape that sent literal macro-variable names.
   This checks source text only; it does not execute SAS macro expansion. */
assert.throws(()=>lex("execute (call DQ_DB.SP_DQ_RUN_ENGINE('&dq_run_id','&project')) by dq;",'single_quote_regression.sas'),/unresolved macro reference/);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const files=walk(root);
for(const p of files.filter(p=>/\.(sql|sas)$/.test(p))){
    assert.ok(!/NUMERIC_BASIC_IND/i.test(fs.readFileSync(p,'utf8')),'Retired field flag still referenced in '+p);
}
for(const p of files.filter(p=>/\.(sql|sas)$/.test(p))){
    const text=fs.readFileSync(p,'utf8');const clean=lex(text,path.relative(root,p));
    if(p.endsWith('.sas')){
        assert.equal((clean.match(/%macro\b/gi)||[]).length,(clean.match(/%mend\b/gi)||[]).length,`${p}: macros`);
        assert.equal((clean.match(/%do\b/gi)||[]).length,(clean.match(/%end\b/gi)||[]).length,`${p}: macro blocks`);
    }
    for(const match of text.matchAll(/SIGNAL\s+SQLSTATE\s+'([^']+)'/gi)){
        assert.match(match[1],/^U[0-9A-Z]{4}$/,p+': Teradata user-defined SQLSTATE must use class U');
    }
    if(/REPLACE PROCEDURE/i.test(clean)){
        assert.equal((clean.match(/\bIF\b/g)||[]).length,2*(clean.match(/\bEND IF\b/g)||[]).length,`${p}: IF blocks`);
    }
}
assert.equal(files.filter(p=>p.endsWith('10_numeric_basic.sql')).length,1);
assert.ok(!files.some(p=>/\/(21_categorical_psi|02_dq_excel_export)\./.test(p)));

/* Evaluate only the concatenation expressions used to build SQL in SPL.
   This tests the actual template strings, including quotes and parentheses. */
const module=read('teradata/modules/10_numeric_basic.sql');
assert.ok(!files.some(p=>p.endsWith('/04_config_validation.sql')));
for(const p of files.filter(p=>/\.(sql|sas)$/.test(p))){
    const text=fs.readFileSync(p,'utf8');
    assert.ok(!/DBC\.ColumnsV|DQ_CONFIG_VALIDATION/i.test(text),'Removed metadata dependency in '+p);
}
assert.ok(module.includes("REGEXP_SIMILAR(FIELD_NAME,"),'Retain captured identifier validation');
assert.ok(read('sas/01_dq_controller.sas').includes('DQ_FIELD_CONFIG'),'Read workbook-derived config directly');
assert.match(read('sas/01_dq_controller.sas'),/execute\s*\(call &dq_database\.\.SP_DQ_RUN_EXTENDED\(&_run_sql,&_project_sql,\s*&_numeric_sql,&_categorical_sql,&_date_sql,&_identifier_sql,'N',&_outliers_sql\)\) by dq;/,'Controller executes supported switches with retired slot fixed N');
function assignment(name,startAt=0,source=module){
    const start=source.indexOf(`SET ${name} =`,startAt);assert.ok(start>=0,name);
    let quote=false;
    for(let i=source.indexOf('=',start)+1;i<source.length;i++){
        if(source[i]==="'"){if(quote&&source[i+1]==="'"){i++;continue;}quote=!quote;}
        if(source[i]===';'&&!quote)return source.slice(source.indexOf('=',start)+1,i).trim();
    }throw new Error('Unterminated assignment '+name);
}
function evaluate(expression,variables){
    let parts=[],start=0,quote=false;
    for(let i=0;i<expression.length;i++){
        if(expression[i]==="'"){if(quote&&expression[i+1]==="'"){i++;continue;}quote=!quote;}
        if(!quote&&expression.slice(i,i+2)==='||'){parts.push(expression.slice(start,i).trim());i++;start=i+1;}
    }parts.push(expression.slice(start).trim());
    return parts.map(p=>{
        if(p.startsWith("'")){assert.ok(p.endsWith("'"));return p.slice(1,-1).replace(/''/g,"'");}
        const trim=p.match(/^TRIM\((\w+\.\w+)\)$/);if(trim)p=trim[1];
        const cast=p.match(/^TRIM\(CAST\(([\w.]+) AS VARCHAR\(\d+\)\)\)$/);if(cast)p=cast[1];
        assert.ok(Object.hasOwn(variables,p),`Unknown SQL-template variable ${p}`);return String(variables[p]);
    }).join('');
}
/* Evaluate the actual grouping-template assignments for a requested scope. */
function groupingVariables(source,o='Y',y='Y',m='Y'){
    const q=source.replace(/SET (\w+)=/g,'SET $1 =');
    const v={V_GROUPS:''};
    if(o==='Y')v.V_GROUPS=evaluate(assignment('V_GROUPS',q.indexOf("IF V_PROFILE_OVERALL='Y'"),q),v);
    for(const [flag,part]of [[y,'YEARLY'],[m,'MONTHLY']])if(flag==='Y'){
        if(v.V_GROUPS)v.V_GROUPS+=',';
        const start=q.indexOf("IF V_PROFILE_"+part+"='Y' THEN",q.indexOf('SET V_GROUPS'));
        v.V_GROUPS=evaluate(assignment('V_GROUPS',q.indexOf('END IF;',start)+7,q),v);
    }
    const start=q.indexOf("IF V_PROFILE_YEARLY='Y' OR V_PROFILE_MONTHLY='Y' THEN");
    const branch=y==='Y'||m==='Y'?start:q.indexOf('    ELSE',start);
    v.V_TIME_SELECT=evaluate(assignment('V_TIME_SELECT',branch,q),v);
    v.V_GROUP_CLAUSE=evaluate(assignment('V_GROUP_CLAUSE',branch,q),v);
    const month=q.indexOf("IF V_PROFILE_MONTHLY='Y' THEN",branch+1);
    v.V_TIME_SELECT=evaluate(assignment('V_TIME_SELECT',m==='Y'?month:q.indexOf('    ELSE',month),q),v);
    return v;
}
function periodUnion(source,v,o='Y',y='Y',m='Y'){
    const parts=[];
    for(const [key,flag]of [['V_OVERALL',o],['V_YEARLY',y],['V_MONTHLY',m]]){
        const raw=evaluate(assignment(key,source.indexOf('/* Guard before assigning'),source),v);
        v[key]=flag==='Y'?raw:'';
        if(v[key])parts.push(v[key]);
    }
    // The procedure prefixes only non-first enabled branches.
    v.V_PERIOD_QUERY=parts.join(' UNION ALL ');
    return v;
}
export {groupingVariables,periodUnion};
const specialXml=execFileSync('unzip',['-p',path.join(root,'config/DQ_RDS_config.xlsx'),'xl/worksheets/sheet4.xml'],{encoding:'utf8'});
const specialRows=[...specialXml.matchAll(/<row[^>]*>(.*?)<\/row>/g)].map(m=>[...m[1].matchAll(/<t>(.*?)<\/t>/g)].map(t=>t[1]));
const numericSpecialList='('+specialRows.filter(r=>r[0]==='NUMERIC').map(r=>Number(r[1]).toFixed(10)).join(',')+')';
const projection=assignment('V_PROJECTION',module.indexOf('FOR F AS'));
const sourceProjection=assignment('V_SOURCE_PROJECTION',module.indexOf('FOR F AS'));
const aggregate=assignment('V_SQL',module.indexOf('/* GROUPING distinguishes'));
const insert=assignment('V_SQL',module.indexOf('FOR R AS'));
for(const batch of [fields.filter(f=>f.type==='NUMERIC').slice(0,10),Array.from({length:10},(_,i)=>({name:'F'+String(i).padStart(127,'X')}))]){
    const v={...groupingVariables(module),V_DB:'LAB_T_ORION_MVT',V_SOURCE:'VW_RDS_PHASE2_FACT',V_DATE:'FACT_DT',V_PROJECTION:'',V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT',V_SPECIAL_LIST:numericSpecialList};
    for(const [i,f] of batch.entries()){
        v.V_SUFFIX=String(i+1);v.V_FIELD='S.DQ_F'+v.V_SUFFIX;v.V_CLEAN='S.DQ_C'+v.V_SUFFIX;v['F.FIELD_NAME']=f.name;
        v.V_SOURCE_PROJECTION=evaluate(sourceProjection,v);
        v.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',module.indexOf('IF CHARACTER_LENGTH(V_SOURCE_PROJECTION)'),module.replace(/SET (\w+)=/g,'SET $1 =')),v);
        v.V_PROJECTION=evaluate(projection,v);
    }
    assert.ok(v.V_SOURCE_PROJECTION.length<=16000);
    assert.ok(v.V_PROJECTION.length<=12000);
    const query=evaluate(aggregate,v);lex(query,'generated aggregate');assert.ok(query.length<32000);
    assert.equal((query.match(/FROM "LAB_T_ORION_MVT"\."VW_RDS_PHASE2_FACT"/g)||[]).length,1);
    assert.ok(query.includes('GROUP BY GROUPING SETS ((),'));
    for(const [i,f] of batch.entries()){
        const result=evaluate(insert,{P_RUN_ID:'00000000-0000-4000-8000-000000000001',P_PROJECT_ID:'RDS','R.FIELD_NAME':f.name,V_SUFFIX:String(i+1)});
        lex(result,'generated insert');assert.ok(result.length<32000);
        assert.equal((result.match(/AS DECIMAL\(38,10\)/g)||[]).length,12,'Cast each CASE branch to preserve exact counts/min/max');
        assert.ok(result.includes('FROM DQ_NB_AGG A CROSS JOIN'));
    }
    console.log(`SQL template checks passed: ${batch.length} fields, ${query.length} characters`);
}

/* Exercise the actual new dynamic templates across all supported types.
   This checks generated SQL text/limits only, never Teradata semantics. */
const other=read('teradata/modules/15_other_basic.sql').replace(/SET (\w+)=/g,'SET $1 =');
for(const type of ['CATEGORICAL','IDENTIFIER','DATE']){
    const v={...groupingVariables(other),P_RUN_ID:'20000000-0000-4000-8000-000000000001',P_PROJECT_ID:'RDS',
        P_TYPE:type,V_MODULE:type+'_BASIC',V_DB:'LAB_T_ORION_MVT',V_SOURCE:'VW_RDS_PHASE2_FACT',
        V_DATE:'FACT_DT',V_PROJECTION:'',V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT'};
    v.V_PERIOD_LEVEL=evaluate(assignment('V_PERIOD_LEVEL',0,other),v);
    v.V_PERIOD_VALUE=evaluate(assignment('V_PERIOD_VALUE',0,other),v);
    const cursor=other.indexOf('FOR F AS');
    const projectionStart=type==='DATE'?other.indexOf("IF P_TYPE='DATE' THEN",cursor):other.indexOf('            ELSE\n',cursor);
    const batchSize=type==='DATE'?30:type==='CATEGORICAL'?8:20;
    for(let i=1;i<=batchSize;i++){
        v.V_SUFFIX=String(i);v.V_FIELD='S.DQ_F'+i;v.V_DISTINCT=v.V_FIELD;v['F.FIELD_NAME']='F'+String(i).padStart(127,'X');
        v.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',cursor,other),v);
        if(type==='CATEGORICAL'){
            v.V_SPECIAL_LIST="('UNKNOWN','N/A','NA','NULL','NONE','-','?','#N/A','.','MISSING','NOT APPLICABLE')";
            v.V_SOURCE_PROJECTION=evaluate(assignment('V_SOURCE_PROJECTION',other.indexOf("IF P_TYPE='CATEGORICAL' THEN",cursor),other),v);
            v.V_DISTINCT='S.DQ_C'+i;
            v.V_PROJECTION=evaluate(assignment('V_PROJECTION',other.indexOf("IF P_TYPE='CATEGORICAL' THEN",cursor),other),v);
        }
        v.V_PROJECTION=evaluate(assignment('V_PROJECTION',projectionStart,other),v);
    }
    assert.ok(v.V_SOURCE_PROJECTION.length<=8000);
    assert.ok(v.V_PROJECTION.length<=20000);
    const dateAggregateStart=other.indexOf("SET V_SQL ='CREATE VOLATILE TABLE DQ_OB_AGG",other.indexOf('WHILE V_FIRST'));
    assert.ok(dateAggregateStart>=0,'Find the date aggregate template');
    const aggregateStart=type==='DATE'?dateAggregateStart:other.indexOf('ELSE',dateAggregateStart);
    if(type!=='DATE'){
        const widths=Object.fromEntries([...other.matchAll(/DECLARE (\w+) VARCHAR\((\d+)\)/g)].map(([,name,size])=>[name,+size]));
        const declared={...v,...Object.fromEntries(Object.entries(widths).map(([name,size])=>[name,'X'.repeat(size)]))};
        for(const part of ['V_OVERALL','V_YEARLY','V_MONTHLY']){
            const expression=assignment(part,aggregateStart,other);
            v[part]=evaluate(expression,v);
            assert.ok(v[part].length<=widths[part],'Actual period part must fit its bounded variable');
            assert.ok(evaluate(expression,declared).length<32000,'Declared input widths must fit each SPL expression');
        }
        assert.ok(evaluate(assignment('V_SQL',aggregateStart,other),declared).length<32000,
            'SPL must not infer an oversized final concatenation from declared part widths');
        assert.ok(v.V_PROJECTION.length+v.V_SOURCE_PROJECTION.length+v.V_DB.length+v.V_SOURCE.length+600<=10000);
    }
    if(type!=='DATE')periodUnion(other,v);
    const query=evaluate(assignment('V_SQL',aggregateStart,other),v);
    lex(query,'generated '+type+' aggregate');assert.ok(query.length<32000);
    assert.equal((query.match(/FROM "LAB_T_ORION_MVT"\."VW_RDS_PHASE2_FACT"/g)||[]).length,type==='DATE'?1:3);
    if(type==='DATE'){
        assert.ok(query.includes('GROUP BY GROUPING SETS ((),'));
    }else{
        assert.ok(!/GROUPING\s*\(|GROUPING SETS/i.test(query),'Distinct aggregation must use explicit period groups');
        assert.equal((query.match(/UNION ALL/g)||[]).length,2);
        /* Execute the generated period SELECT logic on synthetic rows, adapting
           EXTRACT only. This tests period uniqueness, not Teradata compatibility. */
        const db=new DatabaseSync(':memory:');
        db.exec('ATTACH DATABASE \':memory:\' AS "LAB_T_ORION_MVT"');
        const names=Array.from({length:batchSize},(_,i)=>'F'+String(i+1).padStart(127,'X'));
        db.exec('CREATE TABLE "LAB_T_ORION_MVT"."VW_RDS_PHASE2_FACT" (FACT_DT TEXT,'+names.map(n=>'"'+n+'" TEXT').join(',')+')');
        const statement=db.prepare('INSERT INTO "LAB_T_ORION_MVT"."VW_RDS_PHASE2_FACT" VALUES ('+Array(batchSize+1).fill('?').join(',')+')');
        for(const [date,value] of [['2000-01-31','A'],['2000-02-29','B'],['2001-01-31',null],[null,'A']]){
            statement.run(date,value,...Array(batchSize-1).fill(null));
        }
        const select=query.slice('CREATE VOLATILE TABLE DQ_OB_AGG AS ('.length,query.indexOf(') WITH DATA PRIMARY INDEX'))
            .replaceAll('EXTRACT(YEAR FROM S.DQ_DT)',"CAST(strftime('%Y',S.DQ_DT) AS INTEGER)")
            .replaceAll('EXTRACT(MONTH FROM S.DQ_DT)',"CAST(strftime('%m',S.DQ_DT) AS INTEGER)")
            .replaceAll('CAST(S.DQ_DT AS DATE)','date(S.DQ_DT)');
        const rows=db.prepare(select).all();
        assert.equal(rows.length,8,'Fixture must have eight period rows, not the reported fourteen');
        const key=r=>(r.GY===1?'OVERALL':r.GM===1?'YEARLY':'MONTHLY')+'/'+
            (r.GY===1?'ALL':r.DQ_YEAR===null?'UNKNOWN':r.GM===1?String(r.DQ_YEAR):r.DQ_YEAR+'-'+String(r.DQ_MONTH).padStart(2,'0'));
        assert.equal(new Set(rows.map(key)).size,8,'Final period keys must be unique');
        const overall=rows.find(r=>r.GY===1);
        assert.equal(overall.TOTAL_N,4);assert.equal(overall.N1,3);assert.equal(overall.D1,2);
        assert.equal(overall.D2,0);
        assert.equal(overall.FA1,'2000-01-31');assert.equal(overall.LA1,'2000-02-29');
        assert.equal(overall.FA2,null);assert.equal(overall.LA2,null);
        assert.equal(rows.find(r=>r.GY===0&&r.GM===1&&r.DQ_YEAR===2000).D1,2);
        assert.equal(rows.filter(r=>key(r).endsWith('/UNKNOWN')).length,2);
        db.exec('DELETE FROM "LAB_T_ORION_MVT"."VW_RDS_PHASE2_FACT"');
        const empty=db.prepare(select).all();
        assert.equal(empty.length,1);assert.equal(key(empty[0]),'OVERALL/ALL');
        assert.equal(empty[0].TOTAL_N,0);assert.equal(empty[0].N1,0);assert.equal(empty[0].D1,0);
        db.close();
    }
    v['R.FIELD_NAME']='TEST_FIELD';v.V_SUFFIX=String(batchSize);
    const resultsCursor=other.indexOf('FOR R AS');
    const insertStart=type==='DATE'?resultsCursor:other.indexOf('            ELSE\n',resultsCursor);
    v.V_METRICS=type==='DATE'?4:type==='CATEGORICAL'?5:3;
    v.V_EXTRA_CASE='';
    if(type!=='DATE'){
        v.V_NUMERATOR=evaluate(assignment('V_NUMERATOR',resultsCursor,other),v);
        v.V_DENOMINATOR=evaluate(assignment('V_DENOMINATOR',resultsCursor,other),v);
        if(type==='CATEGORICAL'){
            const specialStart=other.indexOf("IF P_TYPE='CATEGORICAL' THEN",resultsCursor);
            v.V_EXTRA_CASE=evaluate(assignment('V_EXTRA_CASE',specialStart,other),v);
            v.V_NUMERATOR=evaluate(assignment('V_NUMERATOR',specialStart,other),v);
            v.V_DENOMINATOR=evaluate(assignment('V_DENOMINATOR',specialStart,other),v);
        }
    }
    const insert=evaluate(assignment('V_SQL',insertStart,other),v);
    lex(insert,'generated '+type+' insert');assert.ok(insert.length<32000);
    assert.ok(insert.includes('INSERT INTO DQ_DB.DQ_METRIC_RESULT'));
    if(type==='DATE'){
        assert.equal((insert.match(/AS DECIMAL\(38,10\)/g)||[]).length,4,'Date must emit exactly four count/rate branches');
        assert.ok(insert.includes("M.MODULE_NAME='DATE_BASIC' AND M.METRIC_ORDINAL BETWEEN 1 AND 4"));
        assert.ok(!/DISTINCT_COUNT|A\.LO|A\.HI/.test(insert),'Date value/distinct metrics are retired');
    }
    console.log(type+' SQL template checks passed: '+batchSize+' max-length fields, '+query.length+' characters');
}
assert.ok(read('teradata/modules/10_numeric_basic.sql').includes("WHERE RUN_ID = P_RUN_ID AND FIELD_TYPE = 'NUMERIC'"),'Numeric module isolates its own snapshots');
assert.ok(read('teradata/results/93_dq_basic_review.sql').includes('FROM DQ_DB.DQ_COMPLETED_RESULT'),'Date review excludes unfinished runs');
assert.ok(read('teradata/modules/00_run_engine.sql').includes('DELETE FROM DQ_DB.DQ_METRIC_RESULT'),'All partial date output is cleaned up');
const outlierProcedure=read('teradata/modules/12_numeric_outliers.sql');
const outlierExecutable=lex(outlierProcedure,'12_numeric_outliers.sql');
assert.ok(!/\bDQ_NO_AGG\b/i.test(outlierExecutable),
    'Dynamically created outlier aggregate must not have static table references');

/* The one-time history reset clears run-owned rows but keeps live project
   configuration and the monotonic run-number counter. */
const historyReset=read('teradata/setup/19_clear_run_history.sql');
for(const table of ['DQ_RULE_RESULT','DQ_METRIC_RESULT','DQ_NUMERIC_STATISTICS',
    'DQ_FIELD_AVAILABILITY','DQ_RUN_SPECIAL_VALUE','DQ_RUN_FIELD_CONFIG',
    'DQ_MODULE_LOG','DQ_RUN_LOG','DQ_RUN_NUMBER']){
    assert.ok(historyReset.includes(`DELETE FROM DQ_DB.${table};`),`History reset clears ${table}`);
}
assert.ok(!/DELETE FROM DQ_DB\.(DQ_RUN_COUNTER|DQ_PROJECT_CONFIG|DQ_FIELD_CONFIG|DQ_ENGINE_SETTINGS|DQ_CONFIG_LOAD_LOG)\b/i.test(historyReset),
    'History reset retains counter and current configuration');
assert.ok(/SELECT COUNT\(\*\) AS ACTIVE_RUNS[\s\S]*?WHERE STATUS='RUNNING'/i.test(historyReset),
    'History reset includes a separate active-run preflight');
assert.ok(/SELECT COUNT\(\*\) AS ACTIVE_CONFIG_LOADS[\s\S]*?WHERE STATUS='LOADING'/i.test(historyReset),
    'History reset includes an active configuration-load preflight');
assert.ok(/UPDATE DQ_DB\.DQ_RUN_COUNTER\s+SET LAST_NUMBER=0/i.test(historyReset),
    'History reset restarts numbering after deleting run history');
assert.ok(historyReset.includes('SELECT LAST_NUMBER AS RESET_RUN_NUMBER_COUNTER'),
    'History reset reports the reset run-number counter');

/* Optional authoritative input reconciliation; no Excel package dependency. */
if(process.argv.length>2){
    assert.equal(process.argv.length,4,'Supply workbook and original view DDL paths');
    const [xlsx,ddlPath]=process.argv.slice(2);
    const xml=file=>execFileSync('unzip',['-p',xlsx,file],{encoding:'utf8'});
    const decode=s=>s.replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
    const text=x=>[...x.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>decode(t[1])).join('');
    const shared=[...xml('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>text(m[1]));
    const rows=[...xml('xl/worksheets/sheet1.xml').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(c=>{
        const col=c[1].match(/r="([A-Z]+)\d+"/)[1];const value=(c[2].match(/<v>(.*?)<\/v>/)||[])[1];
        return [col,/t="s"/.test(c[1])?shared[+value]:(/t="inlineStr"/.test(c[1])?text(c[2]):value)];
    })));
    assert.equal(rows[0].B,'Field_Name');assert.equal(rows[0].C,'DQ_Field_Type');
    assert.deepEqual(rows.slice(1).map(r=>({name:r.B,type:r.C.toUpperCase()})),fields);
    const ddl=fs.readFileSync(ddlPath,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\r\n]*/g,'');
    const select=ddl.match(/\bSELECT\b([\s\S]*?)\bFROM\b/i)[1];
    let depth=0,quote=false,start=0,expressions=[];
    for(let i=0;i<select.length;i++){
        const c=select[i];if(c==="'"){if(quote&&select[i+1]==="'"){i++;continue;}quote=!quote;}
        if(quote)continue;if(c==='(')depth++;if(c===')')depth--;
        if(c===','&&depth===0){expressions.push(select.slice(start,i).trim());start=i+1;}
    }expressions.push(select.slice(start).trim());
    const names=expressions.map(e=>{const alias=e.match(/\bAS\s+(\w+)\s*$/i);if(alias)return alias[1];assert.match(e,/^(?:\w+\.)?\w+$/);return e.split('.').pop();});
    assert.equal(names.length,589);assert.equal(new Set(names).size,589);
    assert.deepEqual([...names].sort(),fields.map(f=>f.name).sort());
    console.log('Original workbook and DDL reconciliation passed: all 589 names/types preserved, no missing output columns');
}
console.log(`Static checks passed for ${files.filter(p=>/\.(sql|sas)$/.test(p)).length} SQL/SAS files. Database compilation and execution NOT tested.`);

export {assignment,evaluate,lex};

assert.ok(!files.some(p=>p.endsWith('11_numeric_percentiles.sql')));
for(const p of files.filter(p=>/\.(sql|sas)$/.test(p))){
 assert.ok(!/numeric_percentiles|P_PERCENTILES/i.test(fs.readFileSync(p,'utf8')),'Retired dependency in '+p);
}

/* Developer-only checks, Node built-ins + optional unzip. The deployed engine
   uses SAS/Teradata exclusively. This is NOT a Teradata/SAS compiler or runner. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fields=read('config/rds_fields.csv').trim().split('\n').slice(1).map(l=>{const [name,type]=l.split(',');return {name,type};});
assert.equal(fields.length,589);
assert.equal(new Set(fields.map(f=>f.name)).size,589);
assert.deepEqual(Object.fromEntries(['NUMERIC','CATEGORICAL','DATE','IDENTIFIER'].map(t=>[t,fields.filter(f=>f.type===t).length])),{NUMERIC:415,CATEGORICAL:125,DATE:35,IDENTIFIER:14});
for(const f of fields){
    assert.match(f.name,/^[A-Za-z_][A-Za-z0-9_]*$/);
    assert.ok(read('teradata/setup/03_seed_rds_config.sql').includes(`('RDS','${f.name}','${f.type}','Y','${f.type==='NUMERIC'?'Y':'N'}')`));
}
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
        if(c==="'"||c==='"'){
            let closed=false;
            for(i++;i<text.length;i++){if(text[i]===c){if(text[i+1]===c){i++;continue;}closed=true;break;}}
            assert.ok(closed,`${label}: unclosed quote`);clean+=' ';continue;
        }
        if(c==='(')depth++;
        if(c===')'){depth--;assert.ok(depth>=0,`${label}: excess closing parenthesis`);}
        clean+=c;
    }
    assert.equal(depth,0,`${label}: unclosed parenthesis`);return clean;
}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const files=walk(root);
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
assert.ok(!files.some(p=>/\/(11_numeric_percentiles|12_numeric_outliers|20_categorical_basic|21_categorical_psi|30_date_basic|40_identifier_basic|02_dq_excel_export)\./.test(p)));

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
function assignment(name,startAt=0){
    const start=module.indexOf(`SET ${name} =`,startAt);assert.ok(start>=0,name);
    let quote=false;
    for(let i=module.indexOf('=',start)+1;i<module.length;i++){
        if(module[i]==="'"){if(quote&&module[i+1]==="'"){i++;continue;}quote=!quote;}
        if(module[i]===';'&&!quote)return module.slice(module.indexOf('=',start)+1,i).trim();
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
        assert.ok(Object.hasOwn(variables,p),`Unknown SQL-template variable ${p}`);return String(variables[p]);
    }).join('');
}
const projection=assignment('V_PROJECTION',module.indexOf('FOR F AS'));
const sourceProjection=assignment('V_SOURCE_PROJECTION',module.indexOf('FOR F AS'));
const aggregate=assignment('V_SQL',module.indexOf('/* GROUPING distinguishes'));
const insert=assignment('V_SQL',module.indexOf('FOR R AS'));
for(const batch of [fields.filter(f=>f.type==='NUMERIC').slice(0,25),Array.from({length:30},(_,i)=>({name:'F'+String(i).padStart(127,'X')}))]){
    const v={V_DB:'LAB_T_ORION_MVT',V_SOURCE:'VW_RDS_PHASE2_FACT',V_DATE:'FACT_DT',V_PROJECTION:'',V_SOURCE_PROJECTION:'"FACT_DT" AS DQ_DT'};
    for(const [i,f] of batch.entries()){
        v.V_SUFFIX=String(i+1);v.V_FIELD='S.DQ_F'+v.V_SUFFIX;v['F.FIELD_NAME']=f.name;
        v.V_SOURCE_PROJECTION=evaluate(sourceProjection,v);v.V_PROJECTION=evaluate(projection,v);
    }
    assert.ok(v.V_SOURCE_PROJECTION.length<=8000);
    assert.ok(v.V_PROJECTION.length<=20000);
    const query=evaluate(aggregate,v);lex(query,'generated aggregate');assert.ok(query.length<32000);
    assert.equal((query.match(/FROM "LAB_T_ORION_MVT"\."VW_RDS_PHASE2_FACT"/g)||[]).length,1);
    assert.ok(query.includes('GROUP BY GROUPING SETS ((),'));
    for(const [i,f] of batch.entries()){
        const result=evaluate(insert,{P_RUN_ID:'00000000-0000-4000-8000-000000000001',P_PROJECT_ID:'RDS','R.FIELD_NAME':f.name,V_SUFFIX:String(i+1)});
        lex(result,'generated insert');assert.ok(result.length<32000);
        assert.equal((result.match(/AS DECIMAL\(38,10\)/g)||[]).length,10,'Cast each CASE branch to preserve exact counts/min/max');
        assert.ok(result.includes('FROM DQ_NB_AGG A CROSS JOIN'));
    }
    console.log(`SQL template checks passed: ${batch.length} fields, ${query.length} characters`);
}

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

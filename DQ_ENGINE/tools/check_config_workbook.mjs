/* Developer-only OOXML/package checks, not a SAS workbook validation phase. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workbook=path.join(root,'config/DQ_RDS_config.xlsx');
const xml=file=>execFileSync('unzip',['-p',workbook,file],{encoding:'utf8'});
const decode=s=>s.replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const book=xml('xl/workbook.xml');
assert.deepEqual([...book.matchAll(/<sheet name="([^"]+)"/g)].map(m=>m[1]),['Project','Fields','Settings']);
const rows=i=>[...xml(`xl/worksheets/sheet${i}.xml`).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(m=>[...m[1].matchAll(/<c\b[^>]*>([\s\S]*?)<\/c>/g)].map(c=>{
 const t=c[1].match(/<t>([\s\S]*?)<\/t>/);if(t)return decode(t[1]);return Number(c[1].match(/<v>(.*?)<\/v>/)[1]);
}));
const project=rows(1),fields=rows(2),settings=rows(3);
assert.equal(project.length,2);assert.equal(settings.length,2);assert.equal(fields.length,590);
assert.deepEqual(project[0],['PROJECT_ID','SOURCE_DATABASE','SOURCE_TABLE','REPORTING_DATE_FIELD','ACCOUNT_ID_FIELD','ACTIVE_IND']);
assert.deepEqual(project[1],['RDS','LAB_T_ORION_MVT','VW_RDS_PHASE2_FACT','FACT_DT','AGMT_ID','Y']);
assert.deepEqual(fields[0],['FIELD_NAME','FIELD_TYPE','ACTIVE_IND','NUMERIC_BASIC_IND']);
const csv=fs.readFileSync(path.join(root,'config/rds_fields.csv'),'utf8').trim().split('\n').slice(1).map(l=>l.split(','));
assert.deepEqual(fields.slice(1),csv.map(([n,t])=>[n,t,'Y',t==='NUMERIC'?'Y':'N']));
assert.deepEqual(settings[0],['GREEN_THRESHOLD','RED_THRESHOLD','SQL_BATCH_SIZE','OUTLIER_SD_MULTIPLIER']);
assert.deepEqual(settings[1],[1,5,25,3]);
for(let i=1;i<=3;i++){assert.ok(!/<f[ >]/.test(xml(`xl/worksheets/sheet${i}.xml`)),'No formulas in starter workbook');}
const sas=fs.readFileSync(path.join(root,'sas/05_dq_excel_config.sas'),'utf8');
assert.ok(!/validate_dq_config|apply=N|APPLY=Y/i.test(sas),'No SAS workbook validation/preview phase');
assert.ok(sas.includes("SP_DQ_APPLY_CONFIG('&_load_id')"),'Only generated load UUID is interpolated into CALL');
const sql=fs.readFileSync(path.join(root,'teradata/setup/07_apply_excel_config.sql'),'utf8');
assert.equal((sql.match(/MERGE INTO/g)||[]).length,3);
assert.ok(sql.indexOf('BEGIN TRANSACTION;')<sql.indexOf('MERGE INTO'));
assert.ok(sql.lastIndexOf('MERGE INTO')<sql.indexOf('END TRANSACTION;'));
assert.ok(sql.includes('ROLLBACK;'));
assert.ok(!/DELETE FROM DQ_DB\.DQ_(PROJECT_CONFIG|FIELD_CONFIG|ENGINE_SETTINGS)\s/.test(sql));
console.log('Workbook checks passed: 3 sheets, exact 589-field mapping and defaults. Direct loader/transaction structure checked; SAS/Teradata execution NOT tested.');

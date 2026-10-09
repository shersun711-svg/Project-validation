/* Developer packaging utility only; the engine itself uses SAS + Teradata.
   Creates an editable .xlsx using standard OOXML and zip, without packages.
   Refuses to overwrite an existing workbook (which may contain user edits). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==3)throw Error('Usage: node build_config_workbook.mjs NEW_OUTPUT.xlsx');
const output=path.resolve(process.argv[2]);if(fs.existsSync(output))throw Error('Refusing to overwrite '+output);
const rows=fs.readFileSync(path.join(root,'config/rds_fields.csv'),'utf8').trim().split('\n').slice(1).map(l=>l.split(','));
const xml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const col=n=>String.fromCharCode(65+n);
const sheets=[
 {name:'Project',headers:['PROJECT_ID','SOURCE_DATABASE','SOURCE_TABLE','REPORTING_DATE_FIELD','ACCOUNT_ID_FIELD','ACTIVE_IND'],rows:[['RDS','LAB_T_ORION_MVT','VW_RDS_PHASE2_FACT','FACT_DT','AGMT_ID','Y']],lists:{F:'Y,N'}},
 {name:'Fields',headers:['FIELD_NAME','FIELD_TYPE','ACTIVE_IND','NUMERIC_BASIC_IND'],rows:rows.map(([name,type])=>[name,type,'Y',type==='NUMERIC'?'Y':'N']),lists:{B:'NUMERIC,CATEGORICAL,DATE,IDENTIFIER',C:'Y,N',D:'Y,N'}},
 {name:'Settings',headers:['GREEN_THRESHOLD','RED_THRESHOLD','SQL_BATCH_SIZE','OUTLIER_SD_MULTIPLIER'],rows:[[1,5,25,3]],lists:{}}
];
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dq-xlsx-'));
const put=(name,data)=>{const p=path.join(tmp,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);};
put('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
put('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
put('xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${s.name}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
put('xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
put('xl/styles.xml','<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF24476B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
for(const [i,s] of sheets.entries()){
 const all=[s.headers,...s.rows];const validations=Object.entries(s.lists);
 const data=all.map((r,n)=>`<row r="${n+1}">${r.map((v,c)=>typeof v==='number'?`<c r="${col(c)}${n+1}"><v>${v}</v></c>`:`<c r="${col(c)}${n+1}" t="inlineStr"${n===0?' s="1"':''}><is><t>${xml(v)}</t></is></c>`).join('')}</row>`).join('');
 put(`xl/worksheets/sheet${i+1}.xml`,`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${col(s.headers.length-1)}${all.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${s.headers.map((h,c)=>`<col min="${c+1}" max="${c+1}" width="${c===0&&s.name==='Fields'?48:Math.max(20,h.length+3)}" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData><autoFilter ref="A1:${col(s.headers.length-1)}${all.length}"/>${validations.length?`<dataValidations count="${validations.length}">${validations.map(([c,list])=>`<dataValidation type="list" allowBlank="0" showErrorMessage="1" errorTitle="Choose a listed value" error="Use the dropdown values." sqref="${c}2:${c}10000"><formula1>"${list}"</formula1></dataValidation>`).join('')}</dataValidations>`:''}</worksheet>`);
}
fs.mkdirSync(path.dirname(output),{recursive:true});
try{execFileSync('zip',['-q','-r',output,'.'],{cwd:tmp});}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log('Created three-sheet workbook with '+rows.length+' approved RDS fields: '+output);

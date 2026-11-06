/* Developer helper: evaluate the real SPL field fragments and size predicate. */
import {DatabaseSync} from 'node:sqlite';
import {assignment,evaluate} from './check_static.mjs';
const db=new DatabaseSync(':memory:');db.function('CHARACTER_LENGTH',x=>x.length);
export function appendOutlierField(v,source){
 const cursor=source.indexOf('FOR F AS');
 for(const key of ['V_SOURCE_PART','V_OVERALL_PART','V_PROJECTION_PART'])v[key]=evaluate(assignment(key,cursor,source),v);
 const start=source.indexOf('IF CHARACTER_LENGTH(V_SOURCE_PROJECTION)',cursor);
 const condition=source.slice(start+3,source.indexOf(' THEN',start)).replace(/\bV_[A-Z_]+\b/g,n=>':'+n);
 const bindings=Object.fromEntries([...new Set(condition.match(/V_[A-Z_]+/g))].map(k=>[k,v[k]]));
 if(db.prepare('SELECT '+condition+' AS REJECTED').get(bindings).REJECTED)return false;
 for(const key of ['V_SOURCE_PROJECTION','V_BOUND_PROJECTION','V_OVERALL_BOUND_PROJECTION','V_PROJECTION','V_ROLLUP_OVERALL','V_ROLLUP_YEARLY','V_ROLLUP_MONTHLY','V_CHECK'])v[key]=evaluate(assignment(key,cursor,source),v);
 return true;
}

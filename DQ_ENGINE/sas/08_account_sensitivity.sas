/* All-14-field sensitivity assessment. Run 01_dq_controller.sas and
   07_account_checks.sas first in the SAME SAS session. Do not run file 06.
   Reuses dq_at_create only; NEVER calls run_dq_account_checks or dq_at_save.
   Source and captured special values are read; only session-volatile TD
   data is created. No permanent engine results/configuration/logs are changed.
   Edit settings below. Keep the source fixed during the whole assessment. */
%let td_server=dwhprod;
%let td_authdomain=TeraAuth;
%let dq_database=LAB_T_ORION_MVT;
%let sensitivity_project=RDS;
%let sensitivity_baseline_run=20;
%let sensitivity_output_file=; /* New SAS SERVER .xlsx path; required. */

%macro dq_run_account_sensitivity;
 %local _project_sql _i _n _bad _connected _created _field _field_sql
  _source_db _source_table _account _date _start _finish _end_exclusive
  _check_sql _type_sql _stable_sql _special_value_sql _special_match_sql
  _number_sql _missing_sql _abs_min _rel_min _return_abs _return_rel
  _start_sql _end_sql _scenario_sql _rows _bad_keys _bad_values
  _saved_months _current_months _planned_configs _actual_configs;
 %global dq_sensitivity_status dq_sensitivity_error dq_sensitivity_id;
 %let dq_sensitivity_status=FAILED;
 %let dq_sensitivity_error=;
 %let dq_sensitivity_id=%sysfunc(uuidgen());
 %let _connected=0; %let _created=0;
 proc datasets library=work nolist;
  delete dq_sens_fields dq_sens_scenarios dq_sens_monthly dq_sens_totals
         dq_sens_manifest _sens_one _sens_fields _sens_checks _sens_sql;
 quit;
 %if not %sysmacexist(dq_validate_context) or not %sysmacexist(dq_at_create) %then %do;
  %let dq_sensitivity_error=Load files 01 and 07 in this SAS session first.;
  %goto fail;
 %end;
 %if not %symexist(dq_account_controller_version) %then %do;
  %let dq_sensitivity_error=Cannot identify the loaded account controller.; %goto fail;
 %end;
 %if %superq(dq_account_controller_version) ne 20261023_PERSIST_RESULTS %then %do;
  %let dq_sensitivity_error=This runner requires account controller 20261023_PERSIST_RESULTS.; %goto fail;
 %end;
 %dq_validate_context;
 %if &dq_context_ok=0 %then %do;
  %let dq_sensitivity_error=Invalid connection settings.; %goto fail;
 %end;
 %if %sysfunc(prxmatch(%str(/^[A-Za-z0-9_][A-Za-z0-9_-]{0,29}$/),%superq(sensitivity_project)))=0
  or %sysfunc(prxmatch(%str(/^[1-9][0-9]*$/),%superq(sensitivity_baseline_run)))=0 %then %do;
  %let dq_sensitivity_error=Invalid project or baseline run number.; %goto fail;
 %end;
 %if %length(%superq(sensitivity_output_file))=0 %then %do;
  %let dq_sensitivity_error=Set sensitivity_output_file to a new SAS server XLSX path.; %goto fail;
 %end;
 %if %sysfunc(fileexist(%superq(sensitivity_output_file))) %then %do;
  %let dq_sensitivity_error=Output file exists. Choose a new filename to retain assessment history.; %goto fail;
 %end;
 %let _project_sql=%sysfunc(quote(%superq(sensitivity_project),%str(%')));
 proc sql noprint;
  %dq_connect; %dq_check_sql(dbms=N);
  %if &dq_sql_failed %then %goto sql_fail;
  %let _connected=1;
  create table work._sens_fields as select * from connection to dq
  (SELECT DISTINCT R.RUN_ID,R.FIELD_NAME,R.FIELD_TYPE,R.SOURCE_DATABASE,
     R.SOURCE_TABLE,R.REPORTING_DATE_FIELD,R.ACCOUNT_ID_FIELD,
     CAST(CAST(R.WINDOW_START AS DATE FORMAT 'YYYY-MM-DD') AS CHAR(10)) AS START_ISO,
     CAST(CAST(R.WINDOW_END AS DATE FORMAT 'YYYY-MM-DD') AS CHAR(10)) AS END_ISO,
     R.ABS_CHANGE_MIN,R.REL_CHANGE_MIN,R.RETURN_ABS_TOL,R.RETURN_REL_TOL
   FROM &dq_database..DQ_ACCOUNT_REVIEW R
   WHERE R.PROJECT_ID=&_project_sql AND R.RUN_NUMBER=&sensitivity_baseline_run
     AND R.FIELD_TYPE='NUMERIC');
  %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
  create table work._sens_checks as select * from connection to dq
  (SELECT COUNT(*) AS DUPLICATE_KEYS FROM
    (SELECT FIELD_NAME,EXTRACT(YEAR FROM POU_DT) AS YY,
       EXTRACT(MONTH FROM POU_DT) AS MM
     FROM &dq_database..DQ_ACCOUNT_REVIEW
     WHERE PROJECT_ID=&_project_sql AND RUN_NUMBER=&sensitivity_baseline_run
       AND FIELD_TYPE='NUMERIC'
     GROUP BY 1,2,3 HAVING COUNT(*)<>1) D);
  %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
  disconnect from dq; %let _connected=0;
 quit;
 %let _bad=0;
 data work.dq_sens_fields;
  set work._sens_fields;
  length field_group $12;
  if field_name in ('MTHS_SINCE_DETERIORATION_CNT',
                   'MV_CUST_ALL_MTHS_SNC_DIST_CNT') then field_group='COUNTER';
  else field_group='OTHER';
  if field_type ne 'NUMERIC' or nmiss(abs_change_min,rel_change_min,
      return_abs_tol,return_rel_tol)>0 or abs_change_min<=0
      or rel_change_min<0 or return_abs_tol<0 or return_rel_tol<0
      or return_rel_tol>1 then call symputx('_bad',1,'L');
  if field_group='COUNTER' and
     (abs_change_min ne 3 or rel_change_min ne 0 or return_abs_tol ne 1
      or return_rel_tol ne 0) then call symputx('_bad',1,'L');
  array identifiers[5] $ field_name source_database source_table
                              reporting_date_field account_id_field;
  do _j=1 to dim(identifiers);
   if prxmatch('/^[A-Za-z_][A-Za-z0-9_]{0,127}$/',strip(identifiers[_j]))=0
     then call symputx('_bad',1,'L');
  end;
  if missing(input(start_iso,?? yymmdd10.)) or missing(input(end_iso,?? yymmdd10.))
     or input(start_iso,yymmdd10.)>input(end_iso,yymmdd10.)
     then call symputx('_bad',1,'L');
  drop _j;
 run;
 %if &syserr>4 %then %goto local_fail;
 data _null_; set work._sens_checks;
  if duplicate_keys ne 0 then call symputx('_bad',1,'L');
 run;
 proc sql noprint;
  select count(*),count(distinct field_name) into :_n trimmed,:_rows trimmed
   from work.dq_sens_fields;
  select count(distinct run_id||'|'||source_database||'|'||source_table||'|'||
     reporting_date_field||'|'||account_id_field||'|'||start_iso||'|'||end_iso)
   into :_bad_values trimmed from work.dq_sens_fields;
 quit;
 %if &_bad or &_n ne 14 or &_rows ne 14 or &_bad_values ne 1 %then %do;
  %let dq_sensitivity_error=Expected 14 unique numeric fields with consistent saved settings/source/window and unique field-month keys.;
  %goto fail;
 %end;
 proc sort data=work.dq_sens_fields; by field_name; run;
 /* Nine absolute x relative jump combinations for 12 non-counter fields.
    Two counters: absolute 2/3/6 months and relative 0; no duplicate grids.
    Four separate return changes at fixed baseline jump limits, except counters
    whose relative return tolerance stays zero (two distinct return changes). */
 data work.dq_sens_scenarios;
  set work.dq_sens_fields;
  length scenario_id $16 stage $8 baseline_ind $1;
  array factors[3] _temporary_ (0.5 1 2);
  do a=1 to 3;
   do b=1 to 3;
    if field_group='COUNTER' and b ne 2 then continue;
    scenario_id=cats('J_A',a,'_R',b); stage='JUMP';
    baseline_ind=ifc(a=2 and b=2,'Y','N');
    abs_min=abs_change_min*factors[a];
    if field_group='COUNTER' then do;
     if a=1 then abs_min=2;
     if a=2 then abs_min=3;
     if a=3 then abs_min=6;
    end;
    rel_min=rel_change_min*factors[b];
    return_abs=return_abs_tol; return_rel=return_rel_tol;
    output;
   end;
  end;
  do a=1,3;
   abs_min=abs_change_min; rel_min=rel_change_min;
   baseline_ind='N';stage='RETURN';
   scenario_id=cats('R_ABS',a);
   return_abs=return_abs_tol*factors[a]; return_rel=return_rel_tol;output;
   if return_rel_tol>0 then do;
    scenario_id=cats('R_REL',a);
    return_abs=return_abs_tol;return_rel=return_rel_tol*factors[a];
    if return_rel>1 then call symputx('_bad',1,'L');
    output;
   end;
  end;
  drop a b;
 run;
 %if &syserr>4 %then %goto local_fail;
 %if &_bad %then %do;
  %let dq_sensitivity_error=Alternative relative return tolerance exceeds one.; %goto fail;
 %end;
 /* Build long SQL strings in a DATA step, avoiding PROC SQL CATX limits. */
 data work._sens_sql;
  set work.dq_sens_scenarios;
  length sql_branch $1500;
  sql_branch=catx(' ',"SELECT CAST(",quote(trim(scenario_id),"'"),
   "AS VARCHAR(16)) AS SCENARIO_ID, CAST(",quote(trim(stage),"'"),
   "AS VARCHAR(8)) AS STAGE,",put(abs_min,best32.),"AS ABS_MIN,",
   put(rel_min,best32.),"AS REL_MIN,",put(return_abs,best32.),"AS RETURN_ABS,",
   put(return_rel,best32.),"AS RETURN_REL FROM SEED");
 run;
 %if &syserr>4 %then %goto local_fail;
 %do _i=1 %to &_n;
  proc sql noprint;
   select field_name,source_database,source_table,account_id_field,
    reporting_date_field,start_iso,end_iso,quote(trim(run_id),"'"),
    put(abs_change_min,best32.),put(rel_change_min,best32.),
    put(return_abs_tol,best32.),put(return_rel_tol,best32.)
   into :_field trimmed,:_source_db trimmed,:_source_table trimmed,
    :_account trimmed,:_date trimmed,:_start trimmed,:_finish trimmed,
    :_check_sql trimmed,:_abs_min trimmed,:_rel_min trimmed,
    :_return_abs trimmed,:_return_rel trimmed
   from work.dq_sens_fields(firstobs=&_i obs=&_i);
   select sql_branch into :_scenario_sql separated by ' UNION ALL '
    from work._sens_sql where field_name="&_field";

  quit;
  %if &sqlrc ne 0 %then %goto local_fail;
  %let _field_sql=%sysfunc(quote(%superq(_field),%str(%')));
  %let _start_sql=%sysfunc(quote(%superq(_start),%str(%')));
  %let _end_exclusive=%sysfunc(putn(%eval(%sysfunc(inputn(&_finish,yymmdd10.))+1),yymmdd10.));
  %let _end_sql=%sysfunc(quote(%superq(_end_exclusive),%str(%')));
  %let _type_sql='NUMERIC'; %let _stable_sql='N';
  %let _special_value_sql=NUMERIC_VALUE;
  %let _special_match_sql=S."&_field"=SV.SPECIAL_KEY;
  %let _number_sql=CAST(S."&_field" AS FLOAT);
  %let _missing_sql=S."&_field" IS NULL;
  %put NOTE: DQ SENSITIVITY FIELD &_i OF &_n: &_field;
  proc sql noprint;
   %dq_connect; %dq_check_sql(dbms=N);
   %if &dq_sql_failed %then %goto sql_fail;
   %let _connected=1;
   select N into :_saved_months trimmed from connection to dq
    (SELECT COUNT(*) AS N FROM &dq_database..DQ_ACCOUNT_REVIEW
     WHERE RUN_ID=&_check_sql AND PROJECT_ID=&_project_sql AND FIELD_NAME=&_field_sql);
   %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
   %dq_at_create; /* Production helper: source/history is built only once per field. */
   %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
   %let _created=1;
   select N,BAD_KEYS,BAD_VALUES into :_rows trimmed,:_bad_keys trimmed,:_bad_values trimmed
    from connection to dq
    (SELECT COUNT(*) AS N,
      COALESCE(SUM(CASE WHEN ACCOUNT_KEY IS NULL
        OR TRIM(CAST(ACCOUNT_KEY AS VARCHAR(128)))='' OR KEY_COUNT<>1
        THEN 1 ELSE 0 END),0) AS BAD_KEYS,
      COALESCE(SUM(CASE WHEN VALUE_LENGTH>512 OR ACCOUNT_LENGTH>128
        THEN 1 ELSE 0 END),0) AS BAD_VALUES FROM DQ_AT_CHECK);
   %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
   %if &_rows=0 or &_bad_keys>0 or &_bad_values>0 %then %do;
    %let dq_sensitivity_error=Empty source or invalid account-month grain/value lengths. Field &_field.;
    %goto sql_cleanup;
   %end;
   create table work._sens_one as select * from connection to dq
   (
    WITH SEED AS (SELECT COUNT(*) AS N FROM &dq_database..DQ_RUN_NUMBER),
    SCENARIOS AS (&_scenario_sql),
    EVALUATED AS
    (
     SELECT E.POU_DT,E.PAIR_ELIGIBLE,E.TRIPLE_ELIGIBLE,
      E.PREVIOUS_STATE,E.VALUE_STATE,E.NEXT_STATE,E.NUMERIC_JUMP,E.NUMERIC_REVERSION,
      C.SCENARIO_ID,C.STAGE,C.ABS_MIN,C.REL_MIN,C.RETURN_ABS,C.RETURN_REL,
      CASE WHEN PAIR_ELIGIBLE=1 AND PREVIOUS_STATE='VALID' AND VALUE_STATE='VALID'
        AND ABS(CHANGE_VALUE)>=C.ABS_MIN
        AND (PREVIOUS_NUMBER=0 OR ABS(RELATIVE_CHANGE)>=C.REL_MIN)
        THEN 1 ELSE 0 END AS S_JUMP,
      CASE WHEN TRIPLE_ELIGIBLE=1 AND PREVIOUS_STATE='VALID'
        AND VALUE_STATE='VALID' AND NEXT_STATE='VALID'
        AND ABS(CHANGE_VALUE)>=C.ABS_MIN
        AND (PREVIOUS_NUMBER=0 OR ABS(RELATIVE_CHANGE)>=C.REL_MIN)
        AND ((CHANGE_VALUE>0 AND NEXT_CHANGE_VALUE<0)
          OR (CHANGE_VALUE<0 AND NEXT_CHANGE_VALUE>0))
        AND ABS(NEXT_NUMBER-PREVIOUS_NUMBER)
          <=GREATEST(C.RETURN_ABS,ABS(PREVIOUS_NUMBER)*C.RETURN_REL)
        THEN 1 ELSE 0 END AS S_REVERSION
     FROM DQ_AT_CHECK E CROSS JOIN SCENARIOS C
    ), MONTHLY AS
    (
     SELECT SCENARIO_ID,STAGE,ABS_MIN,REL_MIN,RETURN_ABS,RETURN_REL,
       EXTRACT(YEAR FROM POU_DT) AS YY,EXTRACT(MONTH FROM POU_DT) AS MM,
       MAX(POU_DT) AS POU_DT,COUNT(*) AS TOTAL_COUNT,
       SUM(CASE WHEN PAIR_ELIGIBLE=1 AND PREVIOUS_STATE='VALID'
         AND VALUE_STATE='VALID' THEN 1 ELSE 0 END) AS VALID_PAIR_COUNT,
       SUM(CASE WHEN TRIPLE_ELIGIBLE=1 AND PREVIOUS_STATE='VALID'
         AND VALUE_STATE='VALID' AND NEXT_STATE='VALID' THEN 1 ELSE 0 END) AS VALID_TRIPLE_COUNT,
       SUM(S_JUMP) AS JUMP_COUNT,SUM(S_REVERSION) AS REVERSION_COUNT,
       SUM(NUMERIC_JUMP) AS BASELINE_JUMP_COUNT,
       SUM(NUMERIC_REVERSION) AS BASELINE_REVERSION_COUNT,
       SUM(CASE WHEN S_JUMP=1 AND NUMERIC_JUMP=0 THEN 1 ELSE 0 END) AS JUMP_ADDED,
       SUM(CASE WHEN S_JUMP=0 AND NUMERIC_JUMP=1 THEN 1 ELSE 0 END) AS JUMP_REMOVED,
       SUM(CASE WHEN S_REVERSION=1 AND NUMERIC_REVERSION=0 THEN 1 ELSE 0 END) AS REVERSION_ADDED,
       SUM(CASE WHEN S_REVERSION=0 AND NUMERIC_REVERSION=1 THEN 1 ELSE 0 END) AS REVERSION_REMOVED
     FROM EVALUATED GROUP BY 1,2,3,4,5,6,7,8
    )
    SELECT &_field_sql AS FIELD_NAME,M.*,
      R.TOTAL_COUNT AS SAVED_TOTAL_COUNT,
      R.NUMERIC_JUMP_COUNT AS SAVED_JUMP_COUNT,
      R.NUMERIC_REVERSION_COUNT AS SAVED_REVERSION_COUNT,
      CAST(CASE WHEN R.RUN_ID IS NULL THEN 'NO_SAVED_REFERENCE'
        WHEN R.TOTAL_COUNT IS NULL OR R.VALID_PAIR_COUNT IS NULL
          OR R.VALID_TRIPLE_COUNT IS NULL OR R.NUMERIC_JUMP_COUNT IS NULL
          OR R.NUMERIC_REVERSION_COUNT IS NULL THEN 'INCOMPLETE_REFERENCE'
        WHEN M.POU_DT<>R.POU_DT THEN 'DIFFERENT_SNAPSHOT'
        WHEN M.TOTAL_COUNT<>R.TOTAL_COUNT OR M.VALID_PAIR_COUNT<>R.VALID_PAIR_COUNT
          OR M.VALID_TRIPLE_COUNT<>R.VALID_TRIPLE_COUNT
          OR M.BASELINE_JUMP_COUNT<>R.NUMERIC_JUMP_COUNT
          OR M.BASELINE_REVERSION_COUNT<>R.NUMERIC_REVERSION_COUNT
          THEN 'DIFFERENT_SUMMARY' ELSE 'MATCHED_SUMMARY' END AS VARCHAR(24)) AS REFERENCE_STATUS
    FROM MONTHLY M LEFT JOIN &dq_database..DQ_ACCOUNT_REVIEW R
      ON R.RUN_ID=&_check_sql AND R.PROJECT_ID=&_project_sql AND R.FIELD_NAME=&_field_sql
      AND EXTRACT(YEAR FROM R.POU_DT)=M.YY AND EXTRACT(MONTH FROM R.POU_DT)=M.MM
   );
   %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
   execute (DROP TABLE DQ_AT_CHECK) by dq;
   %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
   %let _created=0;
   disconnect from dq; %let _connected=0;
  quit;
  proc sql noprint;
   select count(distinct pou_dt) into :_current_months trimmed from work._sens_one;
  quit;
  %if &sqlrc ne 0 %then %goto local_fail;
  %if &_current_months ne &_saved_months %then %do;
   %let dq_sensitivity_error=Monthly source coverage differs from the saved baseline. Field &_field.;
   %goto fail;
  %end;
  data work._sens_one;
   length assessment_id $36 project_id $30;
   set work._sens_one;
   assessment_id="&dq_sensitivity_id";project_id="&sensitivity_project";
   baseline_run=&sensitivity_baseline_run;
   if valid_pair_count>0 then jump_rate=jump_count/valid_pair_count;
   if valid_triple_count>0 then reversion_rate=reversion_count/valid_triple_count;
   format jump_rate reversion_rate 12.6 pou_dt yymmdd10.;
  run;
  %if &syserr>4 %then %goto local_fail;
  proc append base=work.dq_sens_monthly data=work._sens_one;run;
  %if &syserr>4 %then %goto local_fail;
 %end;
 proc sql;
  create table work.dq_sens_totals as
   select field_name,scenario_id,stage,abs_min,rel_min,return_abs,return_rel,
    count(*) as months_evaluated,sum(valid_pair_count) as eligible_pairs,
    sum(valid_triple_count) as eligible_triples,
    sum(jump_count) as jumps,sum(reversion_count) as reversions,
    sum(jump_count)/sum(valid_pair_count) as jump_rate format=12.6,
    sum(reversion_count)/sum(valid_triple_count) as reversion_rate format=12.6,
    sum(jump_added) as jump_added,sum(jump_removed) as jump_removed,
    sum(reversion_added) as reversion_added,sum(reversion_removed) as reversion_removed,
    sum(reference_status ne 'MATCHED_SUMMARY') as reference_warning_months
   from work.dq_sens_monthly
   group by field_name,scenario_id,stage,abs_min,rel_min,return_abs,return_rel;
 quit;
 %if &sqlrc ne 0 %then %goto local_fail;
 proc sql noprint;
  select count(*) into :_planned_configs trimmed from work.dq_sens_scenarios;
  select count(*) into :_actual_configs trimmed from work.dq_sens_totals;
 quit;
 %if &sqlrc ne 0 %then %goto local_fail;
 %if &_planned_configs ne &_actual_configs %then %do;
  %let dq_sensitivity_error=Not every planned field/scenario produced a summary.; %goto fail;
 %end;
 data work.dq_sens_manifest;
  length assessment_id $36 project_id $30 status $16 source_note $160;
  assessment_id="&dq_sensitivity_id";project_id="&sensitivity_project";
  baseline_run=&sensitivity_baseline_run;fields=14;field_scenarios=&_planned_configs;status='COMPLETE';
  source_note='Current source recalculated with historical special-value snapshot. MATCHED_SUMMARY is not proof of identical source records.';
  created=datetime();format created datetime20.;
 run;
 libname _dqsxlsx xlsx "%superq(sensitivity_output_file)";
 %if %sysfunc(libref(_dqsxlsx)) ne 0 %then %goto local_fail;
 data _dqsxlsx.Baseline;set work.dq_sens_fields;run;
 %if &syserr>4 %then %goto export_fail;
 data _dqsxlsx.Scenarios;set work.dq_sens_scenarios;run;
 %if &syserr>4 %then %goto export_fail;
 data _dqsxlsx.Monthly;set work.dq_sens_monthly;run;
 %if &syserr>4 %then %goto export_fail;
 data _dqsxlsx.Totals;set work.dq_sens_totals;run;
 %if &syserr>4 %then %goto export_fail;
 data _dqsxlsx.Manifest;set work.dq_sens_manifest;run;
 %if &syserr>4 %then %goto export_fail;
 libname _dqsxlsx clear;
 %if &syserr>4 %then %goto local_fail;
 %let dq_sensitivity_status=SUCCEEDED;
 %put NOTE: Sensitivity completed for all 14 fields. Review reference warnings before comparing with run 20.;
 %put NOTE: Output=%superq(sensitivity_output_file);
 %return;
%export_fail:
 libname _dqsxlsx clear;
 %let dq_sensitivity_error=Export incomplete. Discard the partial workbook; WORK summaries remain available.;
 %goto fail;
%sql_fail:
 %let dq_sensitivity_error=SQL failed. Inspect the first SAS/Teradata error and the field printed above.;
%sql_cleanup:
 reset exec;
 %if &_created %then %do;execute (DROP TABLE DQ_AT_CHECK) by dq;%let _created=0;%end;
 %if &_connected %then %do;disconnect from dq;%let _connected=0;%end;
 quit;
 %goto fail;
%local_fail:
 %let dq_sensitivity_error=SAS processing/export failed. No complete assessment has been published.;
%fail:
 %let dq_sensitivity_status=FAILED;
 %put ERROR: DQ SENSITIVITY FAILED: %superq(dq_sensitivity_error);
%mend;
%dq_run_account_sensitivity;

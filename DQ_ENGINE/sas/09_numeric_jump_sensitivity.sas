/* RDS numeric-jump-only assessment: 12 fields, 3 scenarios each. Run 01_dq_controller.sas and
   07_account_checks.sas first in the SAME SAS session. Do not run file 06.
   Reuses dq_at_create only; NEVER calls run_dq_account_checks or dq_at_save.
   Source and captured special values are read; only session-volatile TD
   data is created. No permanent engine results/configuration/logs are changed.
   Edit settings below. Keep the source fixed during the whole assessment.
   This is the agreed first stage; do not run the older file 08 for this plan.
   The helper stages its existing flags, but reversion results are NOT assessed
   or exported here. No return-tolerance or OR/AND sensitivity is performed. */
%let td_server=dwhprod;
%let td_authdomain=TeraAuth;
%let dq_database=LAB_T_ORION_MVT;
%let jump_project=RDS;
%let jump_baseline_run=20;
%let jump_output_file=; /* New SAS SERVER .xlsx path; required. */

%macro dq_run_account_jump;
 %local _project_sql _i _n _bad _connected _created _field _field_sql
  _source_db _source_table _account _date _start _finish _end_exclusive
  _check_sql _type_sql _stable_sql _special_value_sql _special_match_sql
  _number_sql _missing_sql _abs_min _rel_min _return_abs _return_rel
  _start_sql _end_sql _scenario_sql _rows _bad_keys _bad_values
  _saved_months _current_months _planned_configs _actual_configs;
 %global dq_jump_status dq_jump_error dq_jump_id;
 %let dq_jump_status=FAILED;
 %let dq_jump_error=;
 %let dq_jump_id=%sysfunc(uuidgen());
 %let _connected=0; %let _created=0;
 proc datasets library=work nolist;
  delete dq_jump_fields dq_jump_scenarios dq_jump_monthly dq_jump_totals
         dq_jump_manifest _jump_one _jump_fields _jump_checks _jump_sql;
 quit;
 %if not %sysmacexist(dq_validate_context) or not %sysmacexist(dq_at_create) %then %do;
  %let dq_jump_error=Load files 01 and 07 in this SAS session first.;
  %goto fail;
 %end;
 %if not %symexist(dq_account_controller_version) %then %do;
  %let dq_jump_error=Cannot identify the loaded account controller.; %goto fail;
 %end;
 %if %superq(dq_account_controller_version) ne 20261023_PERSIST_RESULTS %then %do;
  %let dq_jump_error=This runner requires account controller 20261023_PERSIST_RESULTS.; %goto fail;
 %end;
 %dq_validate_context;
 %if &dq_context_ok=0 %then %do;
  %let dq_jump_error=Invalid connection settings.; %goto fail;
 %end;
 %if %sysfunc(prxmatch(%str(/^[A-Za-z0-9_][A-Za-z0-9_-]{0,29}$/),%superq(jump_project)))=0
  or %sysfunc(prxmatch(%str(/^[1-9][0-9]*$/),%superq(jump_baseline_run)))=0 %then %do;
  %let dq_jump_error=Invalid project or baseline run number.; %goto fail;
 %end;
 %if %length(%superq(jump_output_file))=0 %then %do;
  %let dq_jump_error=Set jump_output_file to a new SAS server XLSX path.; %goto fail;
 %end;
 %if %sysfunc(fileexist(%superq(jump_output_file))) %then %do;
  %let dq_jump_error=Output file exists. Choose a new filename to retain assessment history.; %goto fail;
 %end;
 %if %upcase(%superq(jump_project)) ne RDS %then %do;
  %let dq_jump_error=This field-specific scenario plan is for RDS only.; %goto fail;
 %end;
 %let _project_sql=%sysfunc(quote(%superq(jump_project),%str(%')));
 proc sql noprint;
  %dq_connect; %dq_check_sql(dbms=N);
  %if &dq_sql_failed %then %goto sql_fail;
  %let _connected=1;
  %put NOTE: DQ JUMP STEP: READ_BASELINE_SETTINGS;
  create table work._jump_fields as select * from connection to dq
  (SELECT DISTINCT CAST(R.RUN_ID AS VARCHAR(36)) AS RUN_ID,
     CAST(R.FIELD_NAME AS VARCHAR(128)) AS FIELD_NAME,
     CAST(R.FIELD_TYPE AS VARCHAR(16)) AS FIELD_TYPE,
     CAST(R.SOURCE_DATABASE AS VARCHAR(128)) AS SOURCE_DATABASE,
     CAST(R.SOURCE_TABLE AS VARCHAR(128)) AS SOURCE_TABLE,
     CAST(R.REPORTING_DATE_FIELD AS VARCHAR(128)) AS REPORTING_DATE_FIELD,
     CAST(R.ACCOUNT_ID_FIELD AS VARCHAR(128)) AS ACCOUNT_ID_FIELD,
     CAST(CAST(R.WINDOW_START AS DATE FORMAT 'YYYY-MM-DD') AS CHAR(10)) AS START_ISO,
     CAST(CAST(R.WINDOW_END AS DATE FORMAT 'YYYY-MM-DD') AS CHAR(10)) AS END_ISO,
     CAST(R.ABS_CHANGE_MIN AS FLOAT) AS ABS_CHANGE_MIN,
     CAST(R.REL_CHANGE_MIN AS FLOAT) AS REL_CHANGE_MIN,
     CAST(R.RETURN_ABS_TOL AS FLOAT) AS RETURN_ABS_TOL,
     CAST(R.RETURN_REL_TOL AS FLOAT) AS RETURN_REL_TOL
   FROM &dq_database..DQ_ACCOUNT_REVIEW R
   WHERE R.PROJECT_ID=&_project_sql AND R.RUN_NUMBER=&jump_baseline_run
     AND R.FIELD_TYPE='NUMERIC');
  %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
  %put NOTE: DQ JUMP STEP: CHECK_SAVED_MONTH_KEYS;
  create table work._jump_checks as select * from connection to dq
  (SELECT CAST(COUNT(*) AS DECIMAL(18,0)) AS DUPLICATE_KEYS FROM
    (SELECT FIELD_NAME,EXTRACT(YEAR FROM POU_DT) AS YY,
       EXTRACT(MONTH FROM POU_DT) AS MM
     FROM &dq_database..DQ_ACCOUNT_REVIEW
     WHERE PROJECT_ID=&_project_sql AND RUN_NUMBER=&jump_baseline_run
       AND FIELD_TYPE='NUMERIC'
     GROUP BY 1,2,3 HAVING COUNT(*)<>1) D);
  %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
  disconnect from dq; %let _connected=0;
 quit;
 %let _bad=0;
 data work.dq_jump_fields;
  set work._jump_fields;
  length field_group $16 unit_note $160;
  if field_name in ('MTHS_SINCE_DETERIORATION_CNT',
                   'MV_CUST_ALL_MTHS_SNC_DIST_CNT') then delete;
  select (strip(field_name));
   when ('CHQ_LMT_UTIL_AVG_BAL_6M') do; expected_abs=20;expected_rel=0.5;
    field_group='PERCENT_PENDING';
    unit_note='Scale unconfirmed: absolute values are percentage points only if upstream PROBE field uses percentage scale.';end;
   when ('CUST_ALL_C_PYMTS_CR_AVG_L6M_AMT') do;expected_abs=1000;expected_rel=0.5;field_group='AMOUNT';end;
   when ('CUST_ALL_MT_MAX_DELINQ_BASE_RT') do;expected_abs=1;expected_rel=0.5;
    field_group='RATIO_PENDING';unit_note='Upstream delinquency scale remains to be confirmed.';end;
   when ('MV_PCKG_AVG_PAY_TO_BAL_L6M_RT') do;expected_abs=1;expected_rel=0.5;field_group='PERCENT';end;
   when ('MV_PCKG_BAL_AMT_L6M_TO_L7T12M_RT') do;expected_abs=0.5;expected_rel=0.5;field_group='RATIO';
    unit_note='Formula compares rolling balance windows; attestation narrative conflicts and needs confirmation.';end;
   when ('MV_PCKG_LOAN_TO_INC_RT') do;expected_abs=1;expected_rel=0.5;field_group='RATIO';end;
   when ('MV_PCKG_REPAY_TO_INC_RT') do;expected_abs=0.1;expected_rel=0.5;field_group='RATIO';end;
   when ('MV_PCKG_SAV_DEP_TO_BALANCE_RT') do;expected_abs=10;expected_rel=0.5;field_group='PERCENT';end;
   when ('MV_PCKG_SAV_DEP_TO_REPAY_RT') do;expected_abs=5;expected_rel=0.5;field_group='RATIO';end;
   when ('PCKG_BALANCE_AMT') do;expected_abs=10000;expected_rel=0.5;field_group='AMOUNT';end;
   when ('PCKG_BOVO_VAL_AMT') do;expected_abs=25000;expected_rel=0.2;field_group='AMOUNT';end;
   when ('PCKG_REPAY_AMT') do;expected_abs=250;expected_rel=0.5;field_group='AMOUNT';end;
   otherwise do;expected_abs=.;expected_rel=.;call symputx('_bad',1,'L');end;
  end;
  if field_type ne 'NUMERIC' or nmiss(abs_change_min,rel_change_min,
      return_abs_tol,return_rel_tol)>0 or abs_change_min<=0
      or rel_change_min<0 or return_abs_tol<0 or return_rel_tol<0
      or return_rel_tol>1 then call symputx('_bad',1,'L');
  if abs(abs_change_min-expected_abs)>1e-10 or
     abs(rel_change_min-expected_rel)>1e-10 then call symputx('_bad',1,'L');
  array identifiers[5] $ field_name source_database source_table
                              reporting_date_field account_id_field;
  do _j=1 to dim(identifiers);
   if prxmatch('/^[A-Za-z_][A-Za-z0-9_]{0,127}$/',strip(identifiers[_j]))=0
     then call symputx('_bad',1,'L');
  end;
  if missing(input(start_iso,?? yymmdd10.)) or missing(input(end_iso,?? yymmdd10.))
     or input(start_iso,yymmdd10.)>input(end_iso,yymmdd10.)
     then call symputx('_bad',1,'L');
  drop _j expected_abs expected_rel;
 run;
 %if &syserr>4 %then %goto local_fail;
 data _null_; set work._jump_checks;
  if duplicate_keys ne 0 then call symputx('_bad',1,'L');
 run;
 proc sql noprint;
  select count(*),count(distinct field_name) into :_n trimmed,:_rows trimmed
   from work.dq_jump_fields;
  select count(*) into :_bad_values trimmed from
   (select distinct run_id,source_database,source_table,reporting_date_field,
      account_id_field,start_iso,end_iso from work.dq_jump_fields) as contexts;
 quit;
 %if &_bad or &_n ne 12 or &_rows ne 12 or &_bad_values ne 1 %then %do;
  %let dq_jump_error=Expected the 12 agreed non-counter fields with original jump limits, consistent source/window and unique saved field-month keys.;
  %goto fail;
 %end;
 proc sort data=work.dq_jump_fields; by field_name; run;
 /* Three aligned jump scenarios only: absolute x0.5/1/2 and
    relative x0.5/1/1.5. The middle scenario is the unchanged original. */
 data work.dq_jump_scenarios;
  set work.dq_jump_fields;
  length scenario_id $16 baseline_ind $1;
  array abs_factors[3] _temporary_ (0.5 1 2);
  array rel_factors[3] _temporary_ (0.5 1 1.5);
  do a=1 to 3;
   if a=1 then scenario_id='LOWER';
   if a=2 then scenario_id='ORIGINAL';
   if a=3 then scenario_id='HIGHER';
   baseline_ind=ifc(a=2,'Y','N');
   abs_min=abs_change_min*abs_factors[a];
   rel_min=rel_change_min*rel_factors[a];
   output;
  end;
  keep field_name field_group unit_note scenario_id baseline_ind abs_min rel_min;
 run;
 %if &syserr>4 %then %goto local_fail;
 /* Build long SQL strings in a DATA step, avoiding PROC SQL CATX limits. */
 data work._jump_sql;
  set work.dq_jump_scenarios;
  length sql_branch $1500;
  sql_branch=catx(' ',"SELECT CAST(",quote(trim(scenario_id),"'"),
   "AS VARCHAR(16)) AS SCENARIO_ID, CAST(",put(abs_min,best32.),
   "AS FLOAT) AS ABS_MIN, CAST(",put(rel_min,best32.),
   "AS FLOAT) AS REL_MIN FROM SEED");
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
   from work.dq_jump_fields(firstobs=&_i obs=&_i);
   select sql_branch into :_scenario_sql separated by ' UNION ALL '
    from work._jump_sql where field_name="&_field";

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
  %put NOTE: DQ JUMP FIELD &_i OF &_n: &_field;
  proc sql noprint;
   %dq_connect; %dq_check_sql(dbms=N);
   %if &dq_sql_failed %then %goto sql_fail;
   %let _connected=1;
   %put NOTE: DQ JUMP STEP: READ_SAVED_MONTH_COUNT;
   select N into :_saved_months trimmed from connection to dq
    (SELECT CAST(COUNT(*) AS DECIMAL(18,0)) AS N FROM &dq_database..DQ_ACCOUNT_REVIEW
     WHERE RUN_ID=&_check_sql AND PROJECT_ID=&_project_sql AND FIELD_NAME=&_field_sql);
   %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
   %put NOTE: DQ JUMP STEP: BUILD_FIELD_HISTORY;
   %dq_at_create; /* Production helper: source/history is built only once per field. */
   %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
   %let _created=1;
   %put NOTE: DQ JUMP STEP: CHECK_FIELD_HISTORY;
   select N,BAD_KEYS,BAD_VALUES into :_rows trimmed,:_bad_keys trimmed,:_bad_values trimmed
    from connection to dq
    (SELECT CAST(COUNT(*) AS DECIMAL(18,0)) AS N,
      CAST(COALESCE(SUM(CASE WHEN ACCOUNT_KEY IS NULL
        OR TRIM(CAST(ACCOUNT_KEY AS VARCHAR(128)))='' OR KEY_COUNT<>1
        THEN 1 ELSE 0 END),0) AS DECIMAL(18,0)) AS BAD_KEYS,
      CAST(COALESCE(SUM(CASE WHEN VALUE_LENGTH>512 OR ACCOUNT_LENGTH>128
        THEN 1 ELSE 0 END),0) AS DECIMAL(18,0)) AS BAD_VALUES FROM DQ_AT_CHECK);
   %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
   %if &_rows=0 or &_bad_keys>0 or &_bad_values>0 %then %do;
    %let dq_jump_error=Empty source or invalid account-month grain/value lengths. Field &_field.;
    %goto sql_cleanup;
   %end;
   %put NOTE: DQ JUMP STEP: READ_MONTHLY_SCENARIO_RESULTS;
   create table work._jump_one as select * from connection to dq
   (
    WITH SEED AS (SELECT COUNT(*) AS N FROM &dq_database..DQ_RUN_NUMBER),
    SCENARIOS AS (&_scenario_sql),
    EVALUATED AS
    (
     SELECT E.POU_DT,E.PAIR_ELIGIBLE,E.PREVIOUS_STATE,E.VALUE_STATE,E.NUMERIC_JUMP,
      C.SCENARIO_ID,C.ABS_MIN,C.REL_MIN,
      CASE WHEN PAIR_ELIGIBLE=1 AND PREVIOUS_STATE='VALID' AND VALUE_STATE='VALID'
        AND ABS(CHANGE_VALUE)>=C.ABS_MIN
        AND (PREVIOUS_NUMBER=0 OR ABS(RELATIVE_CHANGE)>=C.REL_MIN)
        THEN 1 ELSE 0 END AS S_JUMP
     FROM DQ_AT_CHECK E CROSS JOIN SCENARIOS C
    ), MONTHLY AS
    (
     SELECT SCENARIO_ID,ABS_MIN,REL_MIN,
       EXTRACT(YEAR FROM POU_DT) AS YY,EXTRACT(MONTH FROM POU_DT) AS MM,
       MAX(POU_DT) AS POU_DT,COUNT(*) AS TOTAL_COUNT,
       SUM(CASE WHEN PAIR_ELIGIBLE=1 AND PREVIOUS_STATE='VALID'
         AND VALUE_STATE='VALID' THEN 1 ELSE 0 END) AS VALID_PAIR_COUNT,
       SUM(S_JUMP) AS JUMP_COUNT,SUM(NUMERIC_JUMP) AS BASELINE_JUMP_COUNT,
       SUM(CASE WHEN S_JUMP=1 AND NUMERIC_JUMP=0 THEN 1 ELSE 0 END) AS JUMP_ADDED,
       SUM(CASE WHEN S_JUMP=0 AND NUMERIC_JUMP=1 THEN 1 ELSE 0 END) AS JUMP_REMOVED
     FROM EVALUATED GROUP BY 1,2,3,4,5
    )
    SELECT CAST(&_field_sql AS VARCHAR(128)) AS FIELD_NAME,
      CAST(M.SCENARIO_ID AS VARCHAR(16)) AS SCENARIO_ID,
      CAST(M.ABS_MIN AS FLOAT) AS ABS_MIN,CAST(M.REL_MIN AS FLOAT) AS REL_MIN,
      CAST(M.YY AS INTEGER) AS YY,CAST(M.MM AS INTEGER) AS MM,
      CAST(M.POU_DT AS DATE) AS POU_DT,
      CAST(M.TOTAL_COUNT AS DECIMAL(18,0)) AS TOTAL_COUNT,
      CAST(M.VALID_PAIR_COUNT AS DECIMAL(18,0)) AS VALID_PAIR_COUNT,
      CAST(M.JUMP_COUNT AS DECIMAL(18,0)) AS JUMP_COUNT,
      CAST(M.BASELINE_JUMP_COUNT AS DECIMAL(18,0)) AS BASELINE_JUMP_COUNT,
      CAST(M.JUMP_ADDED AS DECIMAL(18,0)) AS JUMP_ADDED,
      CAST(M.JUMP_REMOVED AS DECIMAL(18,0)) AS JUMP_REMOVED,
      CAST(R.NUMERIC_JUMP_COUNT AS DECIMAL(18,0)) AS SAVED_JUMP_COUNT,
      CAST(CASE WHEN R.RUN_ID IS NULL THEN 'NO_SAVED_REFERENCE'
        WHEN R.TOTAL_COUNT IS NULL OR R.VALID_PAIR_COUNT IS NULL
          OR R.NUMERIC_JUMP_COUNT IS NULL THEN 'INCOMPLETE_REFERENCE'
        WHEN M.POU_DT<>R.POU_DT THEN 'DIFFERENT_SNAPSHOT'
        WHEN M.TOTAL_COUNT<>R.TOTAL_COUNT OR M.VALID_PAIR_COUNT<>R.VALID_PAIR_COUNT
          OR M.BASELINE_JUMP_COUNT<>R.NUMERIC_JUMP_COUNT
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
   select count(distinct pou_dt) into :_current_months trimmed from work._jump_one;
  quit;
  %if &sqlrc ne 0 %then %goto local_fail;
  %if &_current_months ne &_saved_months %then %do;
   %let dq_jump_error=Monthly source coverage differs from the saved baseline. Field &_field.;
   %goto fail;
  %end;
  data work._jump_one;
   length assessment_id $36 project_id $30;
   set work._jump_one;
   assessment_id="&dq_jump_id";project_id="&jump_project";
   baseline_run=&jump_baseline_run;
   if valid_pair_count>0 then jump_rate=jump_count/valid_pair_count;
   jump_difference=jump_count-baseline_jump_count;
   drop yy mm;
   format jump_rate 12.6 pou_dt yymmdd10.;
  run;
  %if &syserr>4 %then %goto local_fail;
  proc append base=work.dq_jump_monthly data=work._jump_one;run;
  %if &syserr>4 %then %goto local_fail;
 %end;
 proc sql;
  create table work.dq_jump_totals as
   select field_name,scenario_id,abs_min,rel_min,
    count(*) as months_evaluated,sum(valid_pair_count) as eligible_pairs,
    sum(jump_count) as jumps,
    case when sum(valid_pair_count)>0 then sum(jump_count)/sum(valid_pair_count)
         else . end as jump_rate format=12.6,
    sum(baseline_jump_count) as original_jumps,
    sum(jump_difference) as jump_difference,
    sum(jump_added) as jump_added,sum(jump_removed) as jump_removed,
    sum(reference_status ne 'MATCHED_SUMMARY') as reference_warning_months
   from work.dq_jump_monthly
   group by field_name,scenario_id,abs_min,rel_min;
 quit;
 %if &sqlrc ne 0 %then %goto local_fail;
 proc sql noprint;
  select count(*) into :_planned_configs trimmed from work.dq_jump_scenarios;
  select count(*) into :_actual_configs trimmed from work.dq_jump_totals;
 quit;
 %if &sqlrc ne 0 %then %goto local_fail;
 %if &_planned_configs ne 36 or &_planned_configs ne &_actual_configs %then %do;
  %let dq_jump_error=Not every planned field/scenario produced a summary.; %goto fail;
 %end;
 data work.dq_jump_manifest;
  length assessment_id $36 project_id $30 status $16 source_note $160;
  assessment_id="&dq_jump_id";project_id="&jump_project";
  baseline_run=&jump_baseline_run;fields=12;field_scenarios=&_planned_configs;status='COMPLETE';
  source_note='Current source recalculated with historical special-value snapshot. MATCHED_SUMMARY is not proof of identical source records.';
  length scope $40 plan_note $160;
  scope='NUMERIC_JUMP_ONLY';
  plan_note='Three provisional aligned scenarios. Upstream utilisation/delinquency scales and conflicting balance-ratio description need confirmation.';
  created=datetime();format created datetime20.;
 run;
 /* Keep each field/month's three scenarios together in the workbook. */
 proc sort data=work.dq_jump_monthly;
  by field_name pou_dt scenario_id;
 run;
 %if &syserr>4 %then %goto local_fail;
 proc sort data=work.dq_jump_totals;
  by field_name scenario_id;
 run;
 %if &syserr>4 %then %goto local_fail;
 libname _dqsxlsx xlsx "%superq(jump_output_file)";
 %if %sysfunc(libref(_dqsxlsx)) ne 0 %then %goto local_fail;
 data _dqsxlsx.Baseline;
  set work.dq_jump_fields;
  drop return_abs_tol return_rel_tol;
 run;
 %if &syserr>4 %then %goto export_fail;
 data _dqsxlsx.Scenarios;set work.dq_jump_scenarios;run;
 %if &syserr>4 %then %goto export_fail;
 data _dqsxlsx.Monthly;
  retain field_name pou_dt scenario_id abs_min rel_min total_count valid_pair_count
         jump_count jump_rate baseline_jump_count jump_difference jump_added
         jump_removed;
  set work.dq_jump_monthly;
  keep field_name pou_dt scenario_id abs_min rel_min total_count valid_pair_count
       jump_count jump_rate baseline_jump_count jump_difference jump_added
       jump_removed;
 run;
 %if &syserr>4 %then %goto export_fail;
 data _dqsxlsx.Totals;set work.dq_jump_totals;run;
 %if &syserr>4 %then %goto export_fail;
 data _dqsxlsx.Manifest;set work.dq_jump_manifest;run;
 %if &syserr>4 %then %goto export_fail;
 libname _dqsxlsx clear;
 %if &syserr>4 %then %goto local_fail;
 %let dq_jump_status=SUCCEEDED;
 %put NOTE: dq_jump_status=&dq_jump_status;
 %put NOTE: Sensitivity completed for all 12 fields. Review reference warnings before comparing with run 20.;
 %put NOTE: Output=%superq(jump_output_file);
 %return;
%export_fail:
 libname _dqsxlsx clear;
 %let dq_jump_error=Export incomplete. Discard the partial workbook; WORK summaries remain available.;
 %goto fail;
%sql_fail:
 %let dq_jump_error=SQL failed. Inspect the first SAS/Teradata error and the field printed above.;
%sql_cleanup:
 reset exec;
 %if &_created %then %do;execute (DROP TABLE DQ_AT_CHECK) by dq;%let _created=0;%end;
 %if &_connected %then %do;disconnect from dq;%let _connected=0;%end;
 quit;
 %goto fail;
%local_fail:
 %let dq_jump_error=SAS processing/export failed. No complete assessment has been published.;
%fail:
 %let dq_jump_status=FAILED;
 %put ERROR: DQ JUMP FAILED: %superq(dq_jump_error);
%mend;
%dq_run_account_jump;

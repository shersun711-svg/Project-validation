/* Numeric REVERSION sensitivity: 3 jump settings x 3 return settings: 12 non-counter fields.
Run SAS 01 then 07 in the SAME session, then this file. Do not run file 06/08/09.
Set reversion_output_file to a NEW SAS SERVER XLSX path. No customer details export.
Baseline account run 20 supplies source, special snapshot, jump and return settings.
Jump absolute factors 0.5/1/2; jump relative factors 0.5/1/1.5.
Both return tolerances scale together by 0.5/1/2, retaining the OR/MAX rule.
Nine settings per field = 108 comparisons. Two domain-specific counters excluded.
Uses only session-volatile TD history; no permanent config, results or logs changed.
Require SUCCEEDED status and complete Manifest before interpreting results.
Live SAS/Teradata execution is still required; do not treat this as a completed test.
*/
%let td_server=dwhprod;
%let td_authdomain=TeraAuth;
%let dq_database=LAB_T_ORION_MVT;
%let reversion_project=RDS;
%let reversion_baseline_run=20;
%let reversion_output_file=; /* New SAS SERVER .xlsx path; required. */

%macro dq_run_account_rev;
 %local _project_sql _i _n _bad _connected _created _field _field_sql
  _source_db _source_table _account _date _start _finish _end_exclusive
  _check_sql _type_sql _stable_sql _special_value_sql _special_match_sql
  _number_sql _missing_sql _abs_min _rel_min _return_abs _return_rel
  _start_sql _end_sql _scenario_sql _rows _bad_keys _bad_values
  _saved_months _current_months _planned_configs _actual_configs;
 %global dq_rev_status dq_rev_error dq_rev_id;
 %let dq_rev_status=FAILED;
 %let dq_rev_error=;
 %let dq_rev_id=%sysfunc(uuidgen());
 %let _connected=0; %let _created=0;
 proc datasets library=work nolist;
  delete dq_rev_fields dq_rev_scenarios dq_rev_monthly dq_rev_totals
         dq_rev_manifest _rev_one _rev_fields _rev_checks _rev_sql;
 quit;
 %if not %sysmacexist(dq_validate_context) or not %sysmacexist(dq_at_create) %then %do;
  %let dq_rev_error=Load files 01 and 07 in this SAS session first.;
  %goto fail;
 %end;
 %if not %symexist(dq_account_controller_version) %then %do;
  %let dq_rev_error=Cannot identify the loaded account controller.; %goto fail;
 %end;
 %if %superq(dq_account_controller_version) ne 20261023_PERSIST_RESULTS %then %do;
  %let dq_rev_error=This runner requires account controller 20261023_PERSIST_RESULTS.; %goto fail;
 %end;
 %dq_validate_context;
 %if &dq_context_ok=0 %then %do;
  %let dq_rev_error=Invalid connection settings.; %goto fail;
 %end;
 %if %sysfunc(prxmatch(%str(/^[A-Za-z0-9_][A-Za-z0-9_-]{0,29}$/),%superq(reversion_project)))=0
  or %sysfunc(prxmatch(%str(/^[1-9][0-9]*$/),%superq(reversion_baseline_run)))=0 %then %do;
  %let dq_rev_error=Invalid project or baseline run number.; %goto fail;
 %end;
 %if %length(%superq(reversion_output_file))=0 %then %do;
  %let dq_rev_error=Set reversion_output_file to a new SAS server XLSX path.; %goto fail;
 %end;
 %if %sysfunc(fileexist(%superq(reversion_output_file))) %then %do;
  %let dq_rev_error=Output file exists. Choose a new filename to retain assessment history.; %goto fail;
 %end;
 %if %upcase(%superq(reversion_project)) ne RDS %then %do;
  %let dq_rev_error=This field-specific scenario plan is for RDS only.; %goto fail;
 %end;
 %let _project_sql=%sysfunc(quote(%superq(reversion_project),%str(%')));
 proc sql noprint;
  %dq_connect; %dq_check_sql(dbms=N);
  %if &dq_sql_failed %then %goto sql_fail;
  %let _connected=1;
  %put NOTE: DQ REVERSION STEP: READ_BASELINE_SETTINGS;
  create table work._rev_fields as select * from connection to dq
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
   WHERE R.PROJECT_ID=&_project_sql AND R.RUN_NUMBER=&reversion_baseline_run
     AND R.FIELD_TYPE='NUMERIC');
  %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
  %put NOTE: DQ REVERSION STEP: CHECK_SAVED_MONTH_KEYS;
  create table work._rev_checks as select * from connection to dq
  (SELECT CAST(COUNT(*) AS DECIMAL(18,0)) AS DUPLICATE_KEYS FROM
    (SELECT FIELD_NAME,EXTRACT(YEAR FROM POU_DT) AS YY,
       EXTRACT(MONTH FROM POU_DT) AS MM
     FROM &dq_database..DQ_ACCOUNT_REVIEW
     WHERE PROJECT_ID=&_project_sql AND RUN_NUMBER=&reversion_baseline_run
       AND FIELD_TYPE='NUMERIC'
     GROUP BY 1,2,3 HAVING COUNT(*)<>1) D);
  %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
  disconnect from dq; %let _connected=0;
 quit;
 %let _bad=0;
 data work.dq_rev_fields;
  set work._rev_fields;
  length field_group $16 unit_note $160;
  if field_name in ('MTHS_SINCE_DETERIORATION_CNT',
                   'MV_CUST_ALL_MTHS_SNC_DIST_CNT') then delete;
  select (strip(field_name));
   when ('CHQ_LMT_UTIL_AVG_BAL_6M') do; expected_abs=20;expected_rel=0.5;
    field_group='PERCENT';
    unit_note='Confirmed percentage-point units.';end;
   when ('CUST_ALL_C_PYMTS_CR_AVG_L6M_AMT') do;expected_abs=1000;expected_rel=0.5;field_group='AMOUNT';end;
   when ('CUST_ALL_MT_MAX_DELINQ_BASE_RT') do;expected_abs=1;expected_rel=0.5;
    field_group='RATIO';unit_note='Confirmed delinquency ratio; zero-repayment sentinel excluded by snapshot.';end;
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
 data _null_; set work._rev_checks;
  if duplicate_keys ne 0 then call symputx('_bad',1,'L');
 run;
 proc sql noprint;
  select count(*),count(distinct field_name) into :_n trimmed,:_rows trimmed
   from work.dq_rev_fields;
  select count(*) into :_bad_values trimmed from
   (select distinct run_id,source_database,source_table,reporting_date_field,
      account_id_field,start_iso,end_iso from work.dq_rev_fields) as contexts;
 quit;
 %if &_bad or &_n ne 12 or &_rows ne 12 or &_bad_values ne 1 %then %do;
  %let dq_rev_error=Expected the 12 agreed non-counter fields with original jump limits, consistent source/window and unique saved field-month keys.;
  %goto fail;
 %end;
 proc sort data=work.dq_rev_fields; by field_name; run;
 /* Full 3 x 3 grid; both return tolerances use the SAME scale factor. */
 data work.dq_rev_scenarios;
  set work.dq_rev_fields;
  length scenario_id $16 baseline_ind $1 jump_setting return_setting $8;
  array jump_abs_factors[3] _temporary_ (0.5 1 2);
  array jump_rel_factors[3] _temporary_ (0.5 1 1.5);
  array return_factors[3] _temporary_ (0.5 1 2);
  do jump_level=1 to 3;
   if jump_level=1 then jump_setting='LOWER';
   if jump_level=2 then jump_setting='ORIGINAL';
   if jump_level=3 then jump_setting='HIGHER';
   do return_level=1 to 3;
    if return_level=1 then return_setting='TIGHTER';
    if return_level=2 then return_setting='ORIGINAL';
    if return_level=3 then return_setting='WIDER';
    abs_min=abs_change_min*jump_abs_factors[jump_level];
    rel_min=rel_change_min*jump_rel_factors[jump_level];
    return_abs=return_abs_tol*return_factors[return_level];
    return_rel=return_rel_tol*return_factors[return_level];
    if jump_level=2 and return_level=2 then scenario_id='ORIGINAL';
    else scenario_id=catx('_',jump_setting,return_setting);
    baseline_ind=ifc(jump_level=2 and return_level=2,'Y','N');
    output;
   end;
  end;
  keep field_name field_group unit_note scenario_id baseline_ind jump_level
       return_level jump_setting return_setting abs_min rel_min return_abs return_rel;
 run;
 %if &syserr>4 %then %goto local_fail;
 data work._rev_sql;
  set work.dq_rev_scenarios;
  length sql_branch $1500;
  sql_branch=catx(' ',"SELECT CAST(",quote(trim(scenario_id),"'"),
   "AS VARCHAR(16)) AS SCENARIO_ID, CAST(",put(jump_level,best32.),
   "AS INTEGER) AS JUMP_LEVEL, CAST(",put(return_level,best32.),
   "AS INTEGER) AS RETURN_LEVEL, CAST(",put(abs_min,best32.),
   "AS FLOAT) AS ABS_MIN, CAST(",put(rel_min,best32.),
   "AS FLOAT) AS REL_MIN, CAST(",put(return_abs,best32.),
   "AS FLOAT) AS RETURN_ABS, CAST(",put(return_rel,best32.),
   "AS FLOAT) AS RETURN_REL FROM SEED");
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
   from work.dq_rev_fields(firstobs=&_i obs=&_i);
   select sql_branch into :_scenario_sql separated by ' UNION ALL '
    from work._rev_sql where field_name="&_field";

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
  %put NOTE: DQ REVERSION FIELD &_i OF &_n: &_field;
  proc sql noprint;
   %dq_connect; %dq_check_sql(dbms=N);
   %if &dq_sql_failed %then %goto sql_fail;
   %let _connected=1;
   %put NOTE: DQ REVERSION STEP: READ_SAVED_MONTH_COUNT;
   select N into :_saved_months trimmed from connection to dq
    (SELECT CAST(COUNT(*) AS DECIMAL(18,0)) AS N FROM &dq_database..DQ_ACCOUNT_REVIEW
     WHERE RUN_ID=&_check_sql AND PROJECT_ID=&_project_sql AND FIELD_NAME=&_field_sql);
   %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
   %put NOTE: DQ REVERSION STEP: BUILD_FIELD_HISTORY;
   %dq_at_create; /* Production helper: source/history is built only once per field. */
   %dq_check_sql; %if &dq_sql_failed %then %goto sql_fail;
   %let _created=1;
   %put NOTE: DQ REVERSION STEP: CHECK_FIELD_HISTORY;
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
    %let dq_rev_error=Empty source or invalid account-month grain/value lengths. Field &_field.;
    %goto sql_cleanup;
   %end;
   %put NOTE: DQ REVERSION STEP: READ_MONTHLY_SCENARIO_RESULTS;
   create table work._rev_one as select * from connection to dq
   (
    WITH SEED AS (SELECT COUNT(*) AS N FROM &dq_database..DQ_RUN_NUMBER),
    SCENARIOS AS (&_scenario_sql),
    JUMP_FLAGS AS
    (
     SELECT E.POU_DT,E.PAIR_ELIGIBLE,E.TRIPLE_ELIGIBLE,
      E.PREVIOUS_STATE,E.VALUE_STATE,E.NEXT_STATE,
      E.NUMERIC_JUMP,E.NUMERIC_REVERSION,
      C.SCENARIO_ID,C.JUMP_LEVEL,C.RETURN_LEVEL,C.ABS_MIN,C.REL_MIN,
      C.RETURN_ABS,C.RETURN_REL,
      CASE WHEN PAIR_ELIGIBLE=1 AND PREVIOUS_STATE='VALID' AND VALUE_STATE='VALID'
         AND ABS(CHANGE_VALUE)>=C.ABS_MIN
         AND (PREVIOUS_NUMBER=0 OR ABS(RELATIVE_CHANGE)>=C.REL_MIN)
        THEN 1 ELSE 0 END AS S_JUMP,
      E.CHANGE_VALUE,E.NEXT_CHANGE_VALUE,E.PREVIOUS_NUMBER,E.NEXT_NUMBER
     FROM DQ_AT_CHECK E CROSS JOIN SCENARIOS C
    ), EVALUATED AS
    (
     SELECT J.*,
      CASE WHEN S_JUMP=1 AND TRIPLE_ELIGIBLE=1
         AND PREVIOUS_STATE='VALID' AND VALUE_STATE='VALID' AND NEXT_STATE='VALID'
         AND ((CHANGE_VALUE>0 AND NEXT_CHANGE_VALUE<0)
           OR (CHANGE_VALUE<0 AND NEXT_CHANGE_VALUE>0))
         AND ABS(NEXT_NUMBER-PREVIOUS_NUMBER)
             <=GREATEST(RETURN_ABS,ABS(PREVIOUS_NUMBER)*RETURN_REL)
        THEN 1 ELSE 0 END AS S_REVERSION
     FROM JUMP_FLAGS J
    ), MONTHLY AS
    (
     SELECT SCENARIO_ID,JUMP_LEVEL,RETURN_LEVEL,ABS_MIN,REL_MIN,RETURN_ABS,RETURN_REL,
       EXTRACT(YEAR FROM POU_DT) AS YY,EXTRACT(MONTH FROM POU_DT) AS MM,
       MAX(POU_DT) AS POU_DT,COUNT(*) AS TOTAL_COUNT,
       SUM(CASE WHEN PAIR_ELIGIBLE=1 AND PREVIOUS_STATE='VALID'
         AND VALUE_STATE='VALID' THEN 1 ELSE 0 END) AS VALID_PAIR_COUNT,
       SUM(CASE WHEN TRIPLE_ELIGIBLE=1 AND PREVIOUS_STATE='VALID'
         AND VALUE_STATE='VALID' AND NEXT_STATE='VALID' THEN 1 ELSE 0 END) AS VALID_TRIPLE_COUNT,
       SUM(S_JUMP) AS JUMP_COUNT,SUM(NUMERIC_JUMP) AS BASELINE_JUMP_COUNT,
       SUM(S_REVERSION) AS REVERSION_COUNT,
       SUM(NUMERIC_REVERSION) AS BASELINE_REVERSION_COUNT,
       SUM(CASE WHEN S_REVERSION=1 AND NUMERIC_REVERSION=0 THEN 1 ELSE 0 END) AS REVERSION_ADDED,
       SUM(CASE WHEN S_REVERSION=0 AND NUMERIC_REVERSION=1 THEN 1 ELSE 0 END) AS REVERSION_REMOVED
     FROM EVALUATED GROUP BY 1,2,3,4,5,6,7,8,9
    )
    SELECT CAST(&_field_sql AS VARCHAR(128)) AS FIELD_NAME,
      CAST(M.SCENARIO_ID AS VARCHAR(16)) AS SCENARIO_ID,
      CAST(M.JUMP_LEVEL AS INTEGER) AS JUMP_LEVEL,
      CAST(M.RETURN_LEVEL AS INTEGER) AS RETURN_LEVEL,
      CAST(M.ABS_MIN AS FLOAT) AS ABS_MIN,CAST(M.REL_MIN AS FLOAT) AS REL_MIN,
      CAST(M.RETURN_ABS AS FLOAT) AS RETURN_ABS,
      CAST(M.RETURN_REL AS FLOAT) AS RETURN_REL,
      CAST(M.YY AS INTEGER) AS YY,CAST(M.MM AS INTEGER) AS MM,
      CAST(M.POU_DT AS DATE) AS POU_DT,
      CAST(M.TOTAL_COUNT AS DECIMAL(18,0)) AS TOTAL_COUNT,
      CAST(M.VALID_TRIPLE_COUNT AS DECIMAL(18,0)) AS VALID_TRIPLE_COUNT,
      CAST(M.JUMP_COUNT AS DECIMAL(18,0)) AS JUMP_COUNT,
      CAST(M.BASELINE_JUMP_COUNT AS DECIMAL(18,0)) AS BASELINE_JUMP_COUNT,
      CAST(M.REVERSION_COUNT AS DECIMAL(18,0)) AS REVERSION_COUNT,
      CAST(M.BASELINE_REVERSION_COUNT AS DECIMAL(18,0)) AS BASELINE_REVERSION_COUNT,
      CAST(M.REVERSION_ADDED AS DECIMAL(18,0)) AS REVERSION_ADDED,
      CAST(M.REVERSION_REMOVED AS DECIMAL(18,0)) AS REVERSION_REMOVED,
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
   select count(distinct pou_dt) into :_current_months trimmed from work._rev_one;
  quit;
  %if &sqlrc ne 0 %then %goto local_fail;
  %if &_current_months ne &_saved_months %then %do;
   %let dq_rev_error=Monthly source coverage differs from the saved baseline. Field &_field.;
   %goto fail;
  %end;
  /* Stop instead of silently comparing a different source/eligibility population. */
  proc sql noprint;
   select count(*) into :_bad_values trimmed from work._rev_one
    where reference_status ne 'MATCHED_SUMMARY'
       or (scenario_id='ORIGINAL' and reversion_count ne baseline_reversion_count)
       or (jump_level>=2 and return_level<=2 and reversion_added ne 0)
       or (jump_level<=2 and return_level>=2 and reversion_removed ne 0)
       or (jump_level=2 and jump_count ne baseline_jump_count)
       or (jump_level=1 and jump_count<baseline_jump_count)
       or (jump_level=3 and jump_count>baseline_jump_count)
       or reversion_count>jump_count or reversion_count>valid_triple_count;
  quit;
  %if &sqlrc ne 0 %then %goto local_fail;
  %if &_bad_values>0 %then %do;
   %let dq_rev_error=Baseline/source reconciliation or scenario nesting failed. Field &_field.;
   %goto fail;
  %end;
  proc sql noprint;
   select count(*) into :_bad_values trimmed
   from work._rev_one A inner join work._rev_one B
    on A.pou_dt=B.pou_dt
    and A.jump_level<=B.jump_level and A.return_level>=B.return_level
   where A.reversion_count<B.reversion_count;
  quit;
  %if &sqlrc ne 0 %then %goto local_fail;
  %if &_bad_values>0 %then %do;
   %let dq_rev_error=Grid monotonicity failed. Field &_field.;
   %goto fail;
  %end;
  data work._rev_one;
   length assessment_id $36 project_id $30;
   set work._rev_one;
   assessment_id="&dq_rev_id";project_id="&reversion_project";
   baseline_run=&reversion_baseline_run;
   if valid_triple_count>0 then reversion_rate=reversion_count/valid_triple_count;
   reversion_difference=reversion_count-baseline_reversion_count;
   drop yy mm;
   format reversion_rate 12.6 pou_dt yymmdd10.;
  run;
  %if &syserr>4 %then %goto local_fail;
  proc append base=work.dq_rev_monthly data=work._rev_one;run;
  %if &syserr>4 %then %goto local_fail;
 %end;
 proc sql;
  create table work.dq_rev_totals as
   select field_name,scenario_id,jump_level,return_level,abs_min,rel_min,return_abs,return_rel,
    count(*) as months_evaluated,sum(valid_triple_count) as eligible_triples,
    sum(jump_count) as jumps,
    sum(reversion_count) as reversions,
    case when sum(valid_triple_count)>0 then sum(reversion_count)/sum(valid_triple_count)
         else . end as reversion_rate format=12.6,
    sum(baseline_reversion_count) as original_reversions,
    sum(reversion_difference) as reversion_difference,
    sum(reversion_added) as reversion_added,sum(reversion_removed) as reversion_removed
   from work.dq_rev_monthly
   group by field_name,scenario_id,jump_level,return_level,abs_min,rel_min,return_abs,return_rel;
 quit;
 %if &sqlrc ne 0 %then %goto local_fail;
 proc sql noprint;
  select count(*) into :_planned_configs trimmed from work.dq_rev_scenarios;
  select count(*) into :_actual_configs trimmed from work.dq_rev_totals;
 quit;
 %if &sqlrc ne 0 %then %goto local_fail;
 %if &_planned_configs ne 108 or &_planned_configs ne &_actual_configs %then %do;
  %let dq_rev_error=Not every planned field/scenario produced a summary.; %goto fail;
 %end;
 data work.dq_rev_manifest;
  length assessment_id $36 project_id $30 status $16 source_note $160;
  assessment_id="&dq_rev_id";project_id="&reversion_project";
  baseline_run=&reversion_baseline_run;fields=12;field_scenarios=&_planned_configs;status='COMPLETE';
  source_note='Current source recalculated with historical special-value snapshot. MATCHED_SUMMARY is not proof of identical source records.';
  length scope $40 plan_note $160;
  scope='NUMERIC_REVERSION_3X3';
  plan_note='3 jump settings x 3 paired return scales. OR/MAX retained. Original/original baseline. Two counters excluded.';
  created=datetime();format created datetime20.;
 run;
 /* Keep each field/month together; jump level first, then return tolerance. */
 proc sort data=work.dq_rev_monthly;
  by field_name pou_dt jump_level return_level;
 run;
 %if &syserr>4 %then %goto local_fail;
 proc sort data=work.dq_rev_totals;
  by field_name jump_level return_level;
 run;
 %if &syserr>4 %then %goto local_fail;
 libname _dqsxlsx xlsx "%superq(reversion_output_file)";
 %if %sysfunc(libref(_dqsxlsx)) ne 0 %then %goto local_fail;
 data _dqsxlsx.Baseline;
  set work.dq_rev_fields;
 run;
 %if &syserr>4 %then %goto export_fail;
 data _dqsxlsx.Scenarios;set work.dq_rev_scenarios;run;
 %if &syserr>4 %then %goto export_fail;
 data _dqsxlsx.Monthly;
  retain field_name pou_dt scenario_id abs_min rel_min return_abs return_rel total_count valid_triple_count
         jump_count reversion_count reversion_rate baseline_reversion_count
         reversion_difference reversion_added reversion_removed;
  set work.dq_rev_monthly;
  keep field_name pou_dt scenario_id abs_min rel_min return_abs return_rel total_count valid_triple_count
       jump_count reversion_count reversion_rate baseline_reversion_count
       reversion_difference reversion_added reversion_removed;
 run;
 %if &syserr>4 %then %goto export_fail;
 data _dqsxlsx.Totals;set work.dq_rev_totals;drop jump_level return_level;run;
 %if &syserr>4 %then %goto export_fail;
 data _dqsxlsx.Manifest;set work.dq_rev_manifest;run;
 %if &syserr>4 %then %goto export_fail;
 libname _dqsxlsx clear;
 %if &syserr>4 %then %goto local_fail;
 %let dq_rev_status=SUCCEEDED;
 %put NOTE: dq_rev_status=&dq_rev_status;
 %put NOTE: Reversion sensitivity completed for all 12 fields. Baseline monthly totals, eligibility, jumps and reversions reconciled to run 20.;
 %put NOTE: Output=%superq(reversion_output_file);
 %return;
%export_fail:
 libname _dqsxlsx clear;
 %let dq_rev_error=Export incomplete. Discard the partial workbook; WORK summaries remain available.;
 %goto fail;
%sql_fail:
 %let dq_rev_error=SQL failed. Inspect the first SAS/Teradata error and the field printed above.;
%sql_cleanup:
 reset exec;
 %if &_created %then %do;execute (DROP TABLE DQ_AT_CHECK) by dq;%let _created=0;%end;
 %if &_connected %then %do;disconnect from dq;%let _connected=0;%end;
 quit;
 %goto fail;
%local_fail:
 %let dq_rev_error=SAS processing/export failed. No complete assessment has been published.;
%fail:
 %let dq_rev_status=FAILED;
 %put ERROR: DQ REVERSION FAILED: %superq(dq_rev_error);
%mend;
%dq_run_account_rev;

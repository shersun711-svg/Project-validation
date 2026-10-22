/* Standalone post-RDS account checks. Load 01_dq_controller.sas first.
   All program text is ASCII for LATIN9 sessions. No permanent database writes.
   One field at a time: a session-local evaluated table is dropped after use. */
%global dq_account_controller_version;
%let dq_account_controller_version=20261022_SPECIAL_JOIN;
%put NOTE: DQ account controller loaded: &dq_account_controller_version;
%macro dq_at_create;
/* ACCOUNT_SQL_BEGIN: executed on synthetic data by check_account_checks.mjs. */
execute (
 CREATE MULTISET VOLATILE TABLE DQ_AT_CHECK AS
 (
  WITH special_values AS
  (
   SELECT DISTINCT &_special_value_sql AS SPECIAL_KEY
     FROM &dq_database..DQ_SPECIAL_VALUE_CONFIG
    WHERE PROJECT_ID=&_project_sql AND FIELD_TYPE=&_type_sql AND ACTIVE_IND='Y'
  ), source_values AS
  (
   SELECT S."&_account" AS ACCOUNT_KEY,CAST(S."&_date" AS DATE) AS POU_DT,
          EXTRACT(YEAR FROM S."&_date")*12+EXTRACT(MONTH FROM S."&_date") AS MONTH_KEY,
          CAST(S."&_field" AS VARCHAR(512) CASESPECIFIC) AS DISPLAY_VALUE,
          CHARACTER_LENGTH(CAST(S."&_field" AS VARCHAR(32000))) AS VALUE_LENGTH,
          CHARACTER_LENGTH(CAST(S."&_account" AS VARCHAR(32000))) AS ACCOUNT_LENGTH,
          &_number_sql AS NUMBER_VALUE,
          CASE WHEN &_missing_sql THEN 'MISSING'
               WHEN SV.SPECIAL_KEY IS NOT NULL THEN 'SPECIAL' ELSE 'VALID' END AS VALUE_STATE
     FROM "&_source_db"."&_source_table" S
     LEFT JOIN special_values SV ON &_special_match_sql
    WHERE S."&_date">=DATE &_start_sql AND S."&_date"<DATE &_end_sql
  ), neighbours AS
  (
   SELECT S.*,
          COUNT(*) OVER (PARTITION BY ACCOUNT_KEY,MONTH_KEY) AS KEY_COUNT,
          LAG(POU_DT) OVER (PARTITION BY ACCOUNT_KEY ORDER BY POU_DT) AS PREVIOUS_POU_DT,
          LEAD(POU_DT) OVER (PARTITION BY ACCOUNT_KEY ORDER BY POU_DT) AS NEXT_POU_DT,
          LAG(MONTH_KEY) OVER (PARTITION BY ACCOUNT_KEY ORDER BY POU_DT) AS PREVIOUS_MONTH,
          LEAD(MONTH_KEY) OVER (PARTITION BY ACCOUNT_KEY ORDER BY POU_DT) AS NEXT_MONTH,
          LAG(DISPLAY_VALUE) OVER (PARTITION BY ACCOUNT_KEY ORDER BY POU_DT) AS PREVIOUS_VALUE,
          LEAD(DISPLAY_VALUE) OVER (PARTITION BY ACCOUNT_KEY ORDER BY POU_DT) AS NEXT_VALUE,
          LAG(NUMBER_VALUE) OVER (PARTITION BY ACCOUNT_KEY ORDER BY POU_DT) AS PREVIOUS_NUMBER,
          LEAD(NUMBER_VALUE) OVER (PARTITION BY ACCOUNT_KEY ORDER BY POU_DT) AS NEXT_NUMBER,
          LAG(VALUE_STATE) OVER (PARTITION BY ACCOUNT_KEY ORDER BY POU_DT) AS PREVIOUS_STATE,
          LEAD(VALUE_STATE) OVER (PARTITION BY ACCOUNT_KEY ORDER BY POU_DT) AS NEXT_STATE
     FROM source_values S
  ), eligibility AS
  (
   SELECT N.*,
          CASE WHEN MONTH_KEY-PREVIOUS_MONTH=1 THEN 1 ELSE 0 END AS PAIR_ELIGIBLE,
          CASE WHEN MONTH_KEY-PREVIOUS_MONTH=1 AND NEXT_MONTH-MONTH_KEY=1
               THEN 1 ELSE 0 END AS TRIPLE_ELIGIBLE,
          NUMBER_VALUE-PREVIOUS_NUMBER AS CHANGE_VALUE,
          NEXT_NUMBER-NUMBER_VALUE AS NEXT_CHANGE_VALUE,
          (NUMBER_VALUE-PREVIOUS_NUMBER)/NULLIFZERO(ABS(PREVIOUS_NUMBER)) AS RELATIVE_CHANGE,
          (NEXT_NUMBER-NUMBER_VALUE)/NULLIFZERO(ABS(NUMBER_VALUE)) AS NEXT_RELATIVE_CHANGE
     FROM neighbours N
  ), movements AS
  (
   SELECT E.*,
          CASE WHEN &_type_sql='NUMERIC' AND PAIR_ELIGIBLE=1
                 AND PREVIOUS_STATE='VALID' AND VALUE_STATE='VALID'
                 AND ABS(CHANGE_VALUE)>=&_abs_min
                 AND (PREVIOUS_NUMBER=0 OR ABS(RELATIVE_CHANGE)>=&_rel_min)
               THEN 1 ELSE 0 END AS NUMERIC_JUMP,
          CASE WHEN &_type_sql='NUMERIC' AND TRIPLE_ELIGIBLE=1
                 AND PREVIOUS_STATE='VALID' AND VALUE_STATE='VALID' AND NEXT_STATE='VALID'
                 AND ABS(CHANGE_VALUE)>=&_abs_min
                 AND (PREVIOUS_NUMBER=0 OR ABS(RELATIVE_CHANGE)>=&_rel_min)
                 AND ((CHANGE_VALUE>0 AND NEXT_CHANGE_VALUE<0)
                   OR (CHANGE_VALUE<0 AND NEXT_CHANGE_VALUE>0))
                 AND ABS(NEXT_NUMBER-PREVIOUS_NUMBER)
                     <=GREATEST(&_return_abs,ABS(PREVIOUS_NUMBER)*&_return_rel)
               THEN 1 ELSE 0 END AS NUMERIC_REVERSION,
          CASE WHEN &_type_sql<>'NUMERIC' AND TRIPLE_ELIGIBLE=1
                 AND PREVIOUS_STATE='VALID' AND VALUE_STATE='VALID' AND NEXT_STATE='VALID'
                 AND PREVIOUS_VALUE=NEXT_VALUE AND DISPLAY_VALUE<>PREVIOUS_VALUE
               THEN 1 ELSE 0 END AS VALUE_REVERSION,
          CASE WHEN TRIPLE_ELIGIBLE=1 AND PREVIOUS_STATE='VALID'
                 AND VALUE_STATE='MISSING' AND NEXT_STATE='VALID'
               THEN 1 ELSE 0 END AS MISSING_REVERSION,
          CASE WHEN TRIPLE_ELIGIBLE=1 AND PREVIOUS_STATE='VALID'
                 AND VALUE_STATE='SPECIAL' AND NEXT_STATE='VALID'
               THEN 1 ELSE 0 END AS SPECIAL_REVERSION,
          CASE WHEN PAIR_ELIGIBLE=1 AND PREVIOUS_STATE='VALID' AND VALUE_STATE='MISSING'
               THEN 1 ELSE 0 END AS BECAME_MISSING,
          CASE WHEN PAIR_ELIGIBLE=1 AND PREVIOUS_STATE='VALID' AND VALUE_STATE='SPECIAL'
               THEN 1 ELSE 0 END AS BECAME_SPECIAL,
          CASE WHEN &_stable_sql='Y' AND PAIR_ELIGIBLE=1
                 AND PREVIOUS_STATE='VALID' AND VALUE_STATE='VALID'
                 AND DISPLAY_VALUE<>PREVIOUS_VALUE
               THEN 1 ELSE 0 END AS STABLE_VALUE_CHANGE
     FROM eligibility E
  )
  SELECT M.*,
         CASE WHEN NUMERIC_JUMP+NUMERIC_REVERSION+VALUE_REVERSION+MISSING_REVERSION
                   +SPECIAL_REVERSION+BECAME_MISSING+BECAME_SPECIAL+STABLE_VALUE_CHANGE>0
              THEN 1 ELSE 0 END AS FLAGGED_ROW
    FROM movements M
 ) WITH DATA PRIMARY INDEX (ACCOUNT_KEY) ON COMMIT PRESERVE ROWS
) by dq;
/* ACCOUNT_SQL_END */
%mend;

%macro run_dq_account_checks(project=RDS,fields=work.dq_account_fields,
    start_date=,end_date=,max_details=1000);
 %local _i _n _bad _field _type _stable _abs_min _rel_min _return_abs _return_rel
        _source_db _source_table _account _date _rows _bad_keys _number_sql
        _missing_sql _special_value_sql _special_match_sql _end_exclusive
        _created _connected _bad_values
        _project_sql _start_sql _end_sql _check_sql _field_sql _type_sql _stable_sql;
 %global dq_account_status dq_account_error dq_account_check_id;
 %let dq_account_status=FAILED;
 %let dq_account_error=;
 %let dq_account_check_id=%sysfunc(uuidgen());
 %let _created=0;
 %let _connected=0;
 proc datasets library=work nolist;
  delete dq_account_summary dq_account_detail _dq_at_summary _dq_at_detail;
 quit;
 %if not %sysmacexist(dq_validate_context) %then %do;
  %let dq_account_error=Run 01_dq_controller.sas first.; %goto fail;
 %end;
 %dq_validate_context;
 %if &dq_context_ok=0 %then %do;
  %let dq_account_error=Invalid connection settings.; %goto fail;
 %end;
 %if %sysfunc(prxmatch(%str(/^[A-Za-z0-9_][A-Za-z0-9_-]{0,29}$/),%superq(project)))=0 %then %do;
  %let dq_account_error=Invalid project identifier.; %goto fail;
 %end;
 /* Resolve first, then quote as Teradata literals. A macro reference inside a
    single-quoted SAS token is sent literally rather than resolved. */
 %let _project_sql=%sysfunc(quote(%superq(project),%str(%')));
 %let _check_sql=%sysfunc(quote(%superq(dq_account_check_id),%str(%')));
 %if %sysfunc(prxmatch(%str(/^[A-Za-z_][A-Za-z0-9_]*[.][A-Za-z_][A-Za-z0-9_]*$/),%superq(fields)))=0 %then %do;
  %let dq_account_error=FIELDS must be a two-level SAS dataset name.; %goto fail;
 %end;
 %if not %sysfunc(exist(&fields)) %then %do;
  %let dq_account_error=Important-field configuration dataset not found.; %goto fail;
 %end;
 %let _bad=0;
 data _null_;
  length column_name $32;
  d=open(symget('fields'),'I');
  if d<=0 then call symputx('_bad',1,'L');
  else do;
   do i=1 to 7;
    column_name=scan('FIELD_NAME ACTIVE_IND STABLE_VALUE_IND ABS_CHANGE_MIN REL_CHANGE_MIN RETURN_ABS_TOL RETURN_REL_TOL',i);
    v=varnum(d,column_name);
    if v=0 then call symputx('_bad',1,'L');
    else if i<=3 and vartype(d,v) ne 'C' then call symputx('_bad',1,'L');
    else if i>3 and vartype(d,v) ne 'N' then call symputx('_bad',1,'L');
   end;
   rc=close(d);
  end;
 run;
 %if &_bad %then %do;
  %let dq_account_error=Important-field dataset columns/types do not match file 06.;
  %goto fail;
 %end;
 %if %length(%superq(start_date))=0 or %length(%superq(end_date))=0 %then %do;
  %let dq_account_error=Set explicit START_DATE and END_DATE (YYYY-MM-DD).; %goto fail;
 %end;
 %let _bad=0;
 data _null_;
  length a b $10;
  a=symget('start_date'); b=symget('end_date');
  s=input(a,?? yymmdd10.); e=input(b,?? yymmdd10.);
  if missing(s) or missing(e) or put(s,yymmdd10.) ne a or put(e,yymmdd10.) ne b
     or s>e or e>='31DEC9999'd
     or not prxmatch('/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/',symget('start_date'))
     or not prxmatch('/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/',symget('end_date'))
     then call symputx('_bad',1,'L');
  else call symputx('_end_exclusive',put(e+1,yymmdd10.),'L');
  n=input(symget('max_details'),?? best32.);
  if missing(n) or n<1 or n>100000 or n ne int(n) then call symputx('_bad',1,'L');
 run;
 %if &_bad %then %do;
  %let dq_account_error=Invalid dates or MAX_DETAILS (integer 1 to 100000).; %goto fail;
 %end;
 %let _start_sql=%sysfunc(quote(%superq(start_date),%str(%')));
 %let _end_sql=%sysfunc(quote(%superq(_end_exclusive),%str(%')));
 %let _bad=0;
 data work._dq_at_input;
  set &fields;
  field_name=strip(field_name); active_ind=upcase(strip(active_ind));
  stable_value_ind=upcase(strip(stable_value_ind));
  if active_ind not in ('Y','N') then do;
   put 'ERROR: DQ ACCOUNT CONFIG: ACTIVE_IND must be Y or N. '
       field_name= active_ind=;
   call symputx('_bad',1,'L');
  end;
  if active_ind='Y' then do;
   /* Assignment to a $128 variable still pads it with blanks. Strip at the
      PRXMATCH call, otherwise the end-anchored identifier check rejects it. */
   if not prxmatch('/^[A-Za-z_][A-Za-z0-9_]{0,127}$/',strip(field_name)) then do;
    put 'ERROR: DQ ACCOUNT CONFIG: Invalid FIELD_NAME. ' field_name=;
    call symputx('_bad',1,'L');
   end;
   if stable_value_ind not in ('Y','N') then do;
    put 'ERROR: DQ ACCOUNT CONFIG: STABLE_VALUE_IND must be Y or N. '
        field_name= stable_value_ind=;
    call symputx('_bad',1,'L');
   end;
   output;
  end;
 run;
 %if &syserr>4 or &_bad %then %do;
  %let dq_account_error=Invalid important-field configuration. Inspect DQ ACCOUNT CONFIG errors above.;
  %goto fail;
 %end;
 proc sql noprint;
  select count(*),count(*)-count(distinct upcase(field_name))
   into :_n trimmed,:_bad trimmed from work._dq_at_input;
 quit;
 %if &_n=0 or &_bad>0 %then %do;
  %let dq_account_error=Select at least one field with no duplicate names.; %goto fail;
 %end;
 proc sql noprint;
  %dq_connect;
  %dq_check_sql(dbms=N);
  %if &dq_sql_failed %then %goto db_error;
  %let _connected=1;
  create table work._dq_at_context as select * from connection to dq
   (SELECT SOURCE_DATABASE,SOURCE_TABLE,ACCOUNT_ID_FIELD,REPORTING_DATE_FIELD
      FROM &dq_database..DQ_PROJECT_CONFIG WHERE PROJECT_ID=&_project_sql AND ACTIVE_IND='Y');
  %dq_check_sql;
  %if &dq_sql_failed %then %goto db_error;
  create table work._dq_at_catalog as select * from connection to dq
   (SELECT FIELD_NAME,FIELD_TYPE FROM &dq_database..DQ_FIELD_CONFIG WHERE PROJECT_ID=&_project_sql);
  %dq_check_sql;
  %if &dq_sql_failed %then %goto db_error;
  select count(*) into :_rows trimmed from work._dq_at_context;
  %dq_check_sql(dbms=N);
  %if &dq_sql_failed %then %goto db_error;
  %put NOTE: DQ ACCOUNT PROJECT: database=&dq_database project=&project active_rows=&_rows;
  %if &_rows ne 1 %then %do;
   %let dq_account_error=Expected one active project row. See DQ ACCOUNT PROJECT in the log.;
   %goto sql_cleanup;
  %end;
  select source_database,source_table,account_id_field,reporting_date_field
   into :_source_db trimmed,:_source_table trimmed,:_account trimmed,:_date trimmed
   from work._dq_at_context;
  create table work._dq_at_fields as
   select A.*,B.FIELD_TYPE from work._dq_at_input A left join work._dq_at_catalog B
    on upcase(A.FIELD_NAME)=upcase(B.FIELD_NAME) order by A.FIELD_NAME;
  %dq_check_sql(dbms=N);
  %if &dq_sql_failed %then %goto db_error;
  disconnect from dq;
  %let _connected=0;
 quit;
 data _null_;
  length name $128;
  do i=1 to 4;
   name=scan(catx(' ',symget('_source_db'),symget('_source_table'),
                 symget('_account'),symget('_date')),i,' ');
   if not prxmatch('/^[A-Za-z_][A-Za-z0-9_]{0,127}$/',strip(name))
      then call symputx('_bad',1,'L');
  end;
 run;
 data _null_;
  set work._dq_at_fields;
  if field_type not in ('NUMERIC','CATEGORICAL','DATE','IDENTIFIER')
     then call symputx('_bad',1,'L');
  if field_type='NUMERIC' then do;
   if nmiss(abs_change_min,rel_change_min,return_abs_tol,return_rel_tol)>0
      or abs_change_min<=0 or rel_change_min<0 or return_abs_tol<0
      or return_rel_tol<0 or return_rel_tol>1 then call symputx('_bad',1,'L');
  end;
 run;
 %if &syserr>4 or &_bad %then %do;
  %let dq_account_error=Check source identifiers and numeric thresholds. No source test started.;
  %goto fail;
 %end;
 %do _i=1 %to &_n;
  proc sql noprint;
   select field_name,field_type,stable_value_ind,
          put(coalesce(abs_change_min,0),best32.),put(coalesce(rel_change_min,0),best32.),
          put(coalesce(return_abs_tol,0),best32.),put(coalesce(return_rel_tol,0),best32.)
    into :_field trimmed,:_type trimmed,:_stable trimmed,
         :_abs_min trimmed,:_rel_min trimmed,:_return_abs trimmed,:_return_rel trimmed
    from work._dq_at_fields(firstobs=&_i obs=&_i);
   %dq_check_sql(dbms=N);
   %if &dq_sql_failed %then %goto db_error;
   %let _field_sql=%sysfunc(quote(%superq(_field),%str(%')));
   %let _type_sql=%sysfunc(quote(%superq(_type),%str(%')));
   %let _stable_sql=%sysfunc(quote(%superq(_stable),%str(%')));
   %dq_connect;
   %dq_check_sql(dbms=N);
   %if &dq_sql_failed %then %goto db_error;
   %let _connected=1;
   %let _number_sql=CAST(NULL AS FLOAT);
   %let _missing_sql=(S."&_field" IS NULL OR TRIM(CAST(S."&_field" AS VARCHAR(512)))='');
   %let _special_value_sql=CAST(NULL AS VARCHAR(128));
   %let _special_match_sql=1=0;
   %if &_type=NUMERIC %then %do;
    %let _number_sql=CAST(S."&_field" AS FLOAT);
    %let _missing_sql=S."&_field" IS NULL;
    %let _special_value_sql=NUMERIC_VALUE;
    %let _special_match_sql=S."&_field"=SV.SPECIAL_KEY;
   %end;
   %else %if &_type=CATEGORICAL %then %do;
    %let _special_value_sql=UPPER(TRIM(SPECIAL_VALUE));
    %let _special_match_sql=UPPER(TRIM(CAST(S."&_field" AS VARCHAR(512))))=SV.SPECIAL_KEY;
   %end;
   %put NOTE: DQ ACCOUNT CHECK: &_field (&_i of &_n).;
   %dq_at_create;
   %dq_check_sql;
   %if &dq_sql_failed %then %goto db_error;
   %let _created=1;
   select N,BAD_KEYS,BAD_VALUES
    into :_rows trimmed,:_bad_keys trimmed,:_bad_values trimmed from connection to dq
    (SELECT CAST(COUNT(*) AS DECIMAL(18,0)) AS N,
            CAST(COALESCE(SUM(CASE WHEN ACCOUNT_KEY IS NULL
                 OR TRIM(CAST(ACCOUNT_KEY AS VARCHAR(128)))='' OR KEY_COUNT<>1
                 THEN 1 ELSE 0 END),0) AS DECIMAL(18,0)) AS BAD_KEYS,
            CAST(COALESCE(SUM(CASE WHEN VALUE_LENGTH>512 OR ACCOUNT_LENGTH>128
                 THEN 1 ELSE 0 END),0) AS DECIMAL(18,0)) AS BAD_VALUES FROM DQ_AT_CHECK);
   %dq_check_sql;
   %if &dq_sql_failed %then %goto db_error;
   %if &_bad_keys>0 %then %do;
    %let dq_account_error=Null account keys or multiple snapshots per account/month. Fix grain first.;
    %goto sql_cleanup;
   %end;
   %if &_bad_values>0 %then %do;
    %let dq_account_error=Account key exceeds 128 or field value exceeds 512 characters.;
    %goto sql_cleanup;
   %end;
   create table work._dq_at_one_summary as select * from connection to dq
    (SELECT &_check_sql AS CHECK_ID,&_project_sql AS PROJECT_ID,
            &_field_sql AS FIELD_NAME,&_type_sql AS FIELD_TYPE,
            EXTRACT(YEAR FROM POU_DT) AS SNAPSHOT_YEAR,EXTRACT(MONTH FROM POU_DT) AS SNAPSHOT_MONTH,
            MAX(POU_DT) AS POU_DT,COUNT(*) AS TOTAL_COUNT,
            SUM(PAIR_ELIGIBLE) AS PAIR_COUNT,SUM(TRIPLE_ELIGIBLE) AS TRIPLE_COUNT,
            SUM(CASE WHEN PAIR_ELIGIBLE=1 AND PREVIOUS_STATE='VALID'
                      AND VALUE_STATE='VALID' THEN 1 ELSE 0 END) AS VALID_PAIR_COUNT,
            SUM(CASE WHEN PAIR_ELIGIBLE=1 AND PREVIOUS_STATE='VALID'
                     THEN 1 ELSE 0 END) AS VALID_REFERENCE_PAIR_COUNT,
            SUM(CASE WHEN TRIPLE_ELIGIBLE=1 AND PREVIOUS_STATE='VALID'
                      AND NEXT_STATE='VALID' THEN 1 ELSE 0 END) AS VALID_NEIGHBOUR_TRIPLE_COUNT,
            SUM(CASE WHEN TRIPLE_ELIGIBLE=1 AND PREVIOUS_STATE='VALID'
                      AND VALUE_STATE='VALID' AND NEXT_STATE='VALID' THEN 1 ELSE 0 END)
              AS VALID_TRIPLE_COUNT,
            SUM(NUMERIC_JUMP) AS NUMERIC_JUMP_COUNT,
            SUM(NUMERIC_REVERSION) AS NUMERIC_REVERSION_COUNT,
            SUM(VALUE_REVERSION) AS VALUE_REVERSION_COUNT,
            SUM(MISSING_REVERSION) AS MISSING_REVERSION_COUNT,
            SUM(SPECIAL_REVERSION) AS SPECIAL_REVERSION_COUNT,
            SUM(BECAME_MISSING) AS BECAME_MISSING_COUNT,
            SUM(BECAME_SPECIAL) AS BECAME_SPECIAL_COUNT,
            SUM(STABLE_VALUE_CHANGE) AS STABLE_VALUE_CHANGE_COUNT,
            SUM(FLAGGED_ROW) AS FLAGGED_ROW_COUNT
       FROM DQ_AT_CHECK GROUP BY EXTRACT(YEAR FROM POU_DT),EXTRACT(MONTH FROM POU_DT));
   %dq_check_sql;
   %if &dq_sql_failed %then %goto db_error;
   create table work._dq_at_one_detail as select * from connection to dq
    (SELECT &_check_sql AS CHECK_ID,&_project_sql AS PROJECT_ID,
            &_field_sql AS FIELD_NAME,&_type_sql AS FIELD_TYPE,
            CAST(ACCOUNT_KEY AS VARCHAR(128)) AS AGMT_ID,
            PREVIOUS_POU_DT,POU_DT,NEXT_POU_DT,PREVIOUS_VALUE,
            DISPLAY_VALUE AS CURRENT_VALUE,NEXT_VALUE,PREVIOUS_STATE,
            VALUE_STATE AS CURRENT_STATE,NEXT_STATE,CHANGE_VALUE,RELATIVE_CHANGE,NEXT_CHANGE_VALUE,
            NUMERIC_JUMP,NUMERIC_REVERSION,VALUE_REVERSION,MISSING_REVERSION,SPECIAL_REVERSION,
            BECAME_MISSING,BECAME_SPECIAL,STABLE_VALUE_CHANGE,
            COUNT(*) OVER () AS TOTAL_FLAGGED_ROWS
       FROM DQ_AT_CHECK WHERE FLAGGED_ROW=1
      QUALIFY ROW_NUMBER() OVER (ORDER BY POU_DT,ACCOUNT_KEY)<=&max_details);
   %dq_check_sql;
   %if &dq_sql_failed %then %goto db_error;
   execute (DROP TABLE DQ_AT_CHECK) by dq;
   %dq_check_sql;
   %if &dq_sql_failed %then %goto db_error;
   %let _created=0;
   disconnect from dq;
   %let _connected=0;
  quit;
  /* Consistent metadata lengths prevent APPEND truncation between fields. */
  data work._dq_at_one_summary;
   length check_id $36 project_id $30 field_name $128 field_type $16 test_status $16
          source_database source_table account_id_field reporting_date_field $128
          stable_value_ind $1;
   set work._dq_at_one_summary;
   format check_id $36. project_id $30. field_name $128. field_type $16.;
   test_status='EVALUATED';
   if pair_count=0 then test_status='NO_REFERENCE';
   source_database="&_source_db"; source_table="&_source_table";
   account_id_field="&_account"; reporting_date_field="&_date";
   stable_value_ind="&_stable"; checked_at=datetime();
   window_start=input("&start_date",yymmdd10.);
   window_end=input("&end_date",yymmdd10.);
   format checked_at datetime19. window_start window_end yymmdd10.;
   abs_change_min=&_abs_min; rel_change_min=&_rel_min;
   return_abs_tol=&_return_abs; return_rel_tol=&_return_rel;
   if "&_type" ne 'NUMERIC' then call missing(numeric_jump_count,
       numeric_reversion_count,abs_change_min,rel_change_min,return_abs_tol,return_rel_tol);
   else call missing(value_reversion_count);
   if "&_type" not in ('NUMERIC','CATEGORICAL') then
       call missing(special_reversion_count,became_special_count);
   if "&_stable" ne 'Y' then call missing(stable_value_change_count);
   if valid_pair_count>0 then do;
    if "&_type"='NUMERIC' then numeric_jump_rate=numeric_jump_count/valid_pair_count;
    if "&_stable"='Y' then stable_value_change_rate=stable_value_change_count/valid_pair_count;
   end;
   if valid_triple_count>0 then do;
    if "&_type"='NUMERIC' then numeric_reversion_rate=numeric_reversion_count/valid_triple_count;
    else value_reversion_rate=value_reversion_count/valid_triple_count;
   end;
   if valid_neighbour_triple_count>0 then do;
    missing_reversion_rate=missing_reversion_count/valid_neighbour_triple_count;
    if "&_type" in ('NUMERIC','CATEGORICAL') then
        special_reversion_rate=special_reversion_count/valid_neighbour_triple_count;
   end;
   if valid_reference_pair_count>0 then do;
    became_missing_rate=became_missing_count/valid_reference_pair_count;
    if "&_type" in ('NUMERIC','CATEGORICAL') then
        became_special_rate=became_special_count/valid_reference_pair_count;
   end;
   format numeric_jump_rate stable_value_change_rate numeric_reversion_rate
          value_reversion_rate missing_reversion_rate special_reversion_rate
          became_missing_rate became_special_rate 12.6;
  run;
  %if &_rows=0 %then %do;
   /* Keep exactly the same schema even when the first field has no data. */
   data work._dq_at_one_summary;
    if 0 then set work._dq_at_one_summary;
    call missing(of _all_);
    check_id="&dq_account_check_id"; project_id="&project";
    field_name="&_field"; field_type="&_type";
    source_database="&_source_db"; source_table="&_source_table";
    account_id_field="&_account"; reporting_date_field="&_date";
    stable_value_ind="&_stable"; checked_at=datetime();
    window_start=input("&start_date",yymmdd10.);
    window_end=input("&end_date",yymmdd10.);
    total_count=0; test_status='NO_OBSERVATIONS'; output;
   run;
  %end;
  data work._dq_at_one_detail;
   length check_id $36 project_id $30 field_name $128 field_type $16;
   set work._dq_at_one_detail;
   format check_id $36. project_id $30. field_name $128. field_type $16.;
   /* Changes involving absent/special values are not valid numeric changes. */
   if previous_state ne 'VALID' or current_state ne 'VALID' then
       call missing(change_value,relative_change);
   if current_state ne 'VALID' or next_state ne 'VALID' then call missing(next_change_value);
  run;
  proc append base=work._dq_at_summary data=work._dq_at_one_summary; run;
  %if &syserr>4 %then %do;
   %let dq_account_error=Cannot append account summary.; %goto fail;
  %end;
  proc append base=work._dq_at_detail data=work._dq_at_one_detail; run;
  %if &syserr>4 %then %do;
   %let dq_account_error=Cannot append account detail.; %goto fail;
  %end;
 %end;
 /* Public outputs are available only after all selected fields complete. */
 data work.dq_account_summary; set work._dq_at_summary; run;
 %if &syserr>4 %then %goto local_error;
 data work.dq_account_detail; set work._dq_at_detail; run;
 %if &syserr>4 %then %goto local_error;
 %let dq_account_status=SUCCEEDED;
 %put NOTE: DQ ACCOUNT CHECK SUCCEEDED: &dq_account_check_id;
 %put NOTE: Review WORK.DQ_ACCOUNT_SUMMARY and WORK.DQ_ACCOUNT_DETAIL.;
 %return;
%db_error:
 %let dq_account_error=Teradata account check failed. Inspect the first SAS SQL error.;
%sql_cleanup:
 reset exec;
 %if &_created %then %do; execute (DROP TABLE DQ_AT_CHECK) by dq; %end;
 %if &_connected %then %do; disconnect from dq; %end;
 quit;
 %goto fail;
%local_error:
 %let dq_account_error=Cannot publish account-check outputs.;
%fail:
 proc datasets library=work nolist;
  delete dq_account_summary dq_account_detail;
 quit;
 %put ERROR: DQ ACCOUNT CHECK FAILED: %superq(dq_account_error);
%mend;

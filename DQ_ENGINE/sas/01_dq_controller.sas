/* All calculations execute in Teradata. WORK datasets contain configuration,
   logs and summaries only. Error policy: stop at the first required failure.
   The stored procedure owns database statuses; a CALL returning without an
   SQL error alone is not evidence of a successful run. */
%global dq_controller_version;
%let dq_controller_version=20261016_WIDE_CHANGES;
%put NOTE: DQ controller loaded: &dq_controller_version;
%put NOTE: DQ SAS encoding: %sysfunc(getoption(encoding));

%macro dq_validate_context;
    %global dq_context_ok;
    %let dq_context_ok=0;
    %if not %symexist(td_server) or not %symexist(td_authdomain)
        or not %symexist(dq_database) %then %do;
        %put ERROR: Define td_server, td_authdomain and dq_database first.;
        %return;
    %end;
    %if %length(%superq(td_server))=0 or %length(%superq(td_authdomain))=0 %then %do;
        %put ERROR: Server and approved SAS AUTHDOMAIN are required.;
        %return;
    %end;
    %if %length(%superq(dq_database))=0 %then %do;
        %put ERROR: DQ database is required.;
        %return;
    %end;
    %if %sysfunc(prxmatch(%str(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/),%superq(dq_database)))=0 %then %do;
        %put ERROR: Invalid DQ database identifier.;
        %return;
    %end;
    %let dq_context_ok=1;
%mend;

/* Expands inside PROC SQL. No passwords in this program or its macro inputs. */
%macro dq_connect;
    connect to teradata as dq
        (server="&td_server" authdomain="&td_authdomain"
         database="&dq_database" mode=teradata);
%mend;

/* CONNECT need not define SQLXRC and can leave an earlier value unchanged.
   Use SAS SQLRC for CONNECT (dbms=N). After a pass-through statement, also
   inspect SQLXRC when SAS has supplied it. Never invent/reset system status.
   This helper preserves the original return codes for diagnosis. */
%macro dq_check_sql(dbms=Y);
    %global dq_sql_failed;
    %let dq_sql_failed=0;
    %if not %symexist(sqlrc) %then %let dq_sql_failed=1;
    %else %if %length(%superq(sqlrc))=0 %then %let dq_sql_failed=1;
    %else %if %superq(sqlrc) ne 0 %then %let dq_sql_failed=1;
    %if &dbms=Y %then %do;
        %if %symexist(sqlxrc) %then %do;
            %if %length(%superq(sqlxrc))>0 %then %do;
                %if %superq(sqlxrc) ne 0 %then %let dq_sql_failed=1;
            %end;
        %end;
    %end;
%mend;

%macro run_dq_engine(project=RDS,numeric_basic=Y,
    numeric_outliers=N,categorical_basic=N,categorical_psi=N,date_basic=N,
    identifier_basic=N,export_excel=N,retry_run_id=,mom=N,yoy=N);
    %local _switches _i _name _value _rc _call_rc _msg _project_sql _run_sql
        _numeric_sql _categorical_sql _date_sql _identifier_sql _outliers_sql;
    %global dq_run_id dq_run_number dq_status dq_error dq_change_status dq_change_error dq_change_run_number;
    %let dq_change_status=SKIPPED;
    %let dq_change_error=;
    %let dq_change_run_number=;
    %let dq_run_id=;
    %let dq_run_number=;
    %let dq_status=FAILED;
    %let dq_error=;
    %let _switches=numeric_basic numeric_outliers
        categorical_basic categorical_psi date_basic identifier_basic export_excel mom yoy;
    %do _i=1 %to %sysfunc(countw(&_switches));
        %let _name=%scan(&_switches,&_i);
        %if %length(%superq(&_name))=0 %then %do;
            %let dq_error=Every test switch must be Y or N: &_name;
            %goto invalid;
        %end;
        %let _value=%upcase(%qsysfunc(strip(%superq(&_name))));
        %if %length(%superq(_value)) ne 1 %then %do;
            %let dq_error=Every test switch must be Y or N: &_name;
            %goto invalid;
        %end;
        %if %superq(_value) ne Y and %superq(_value) ne N %then %do;
            %let dq_error=Every test switch must be Y or N: &_name;
            %goto invalid;
        %end;
        %let &_name=&_value;
    %end;
    %if &categorical_psi=Y or &export_excel=Y %then %do;
        %let dq_error=PSI and Excel export are deferred. Set their switches to N.;
        %goto invalid;
    %end;
    %if &numeric_outliers=N and &numeric_basic=N and &categorical_basic=N and &date_basic=N
        and &identifier_basic=N %then %do;
        %let dq_error=No implemented module selected. Enable at least one profiling module.;
        %goto invalid;
    %end;
    %if %length(%superq(project))=0 %then %do;
        %let dq_error=Project is required.;
        %goto invalid;
    %end;
    %if %sysfunc(prxmatch(%str(/^[A-Za-z_][A-Za-z0-9_]{0,29}$/),%superq(project)))=0 %then %do;
        %let dq_error=Invalid project identifier.;
        %goto invalid;
    %end;
    %dq_validate_context;
    %if &dq_context_ok ne 1 %then %do;
        %let dq_error=Invalid Teradata connection settings.;
        %goto invalid;
    %end;
    %if %length(%superq(retry_run_id)) %then %let dq_run_id=%superq(retry_run_id);
    %else %let dq_run_id=%sysfunc(uuidgen());
    %if %sysfunc(prxmatch(%str(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/),%superq(dq_run_id)))=0 %then %do;
        %let dq_error=retry_run_id must be a UUID.;
        %goto invalid;
    %end;
    /* Resolve values before adding SQL quotes. A literal '&name' in SAS SQL
       does not resolve the macro variable. Inputs above are identifier/UUID
       checked; QUOTE supplies single quotes for Teradata string literals. */
    %let _project_sql=%sysfunc(quote(%superq(project),%str(%')));
    %let _run_sql=%sysfunc(quote(%superq(dq_run_id),%str(%')));
    %let _outliers_sql=%sysfunc(quote(&numeric_outliers,%str(%')));
    %let _numeric_sql=%sysfunc(quote(&numeric_basic,%str(%')));
    %let _categorical_sql=%sysfunc(quote(&categorical_basic,%str(%')));
    %let _date_sql=%sysfunc(quote(&date_basic,%str(%')));
    %let _identifier_sql=%sysfunc(quote(&identifier_basic,%str(%')));
    /* Clear our previous aggregate outputs so stale WORK data cannot be read
       as the result of a connection failure. */
    proc datasets library=work nolist;
        delete dq_configuration_report dq_run_status dq_module_status dq_summary
            dq_change_source dq_change_summary;
    quit;
    proc sql;
        %dq_connect;
        %dq_check_sql(dbms=N);
        %let _rc=&dq_sql_failed;
        %if &_rc ne 0 %then %do;
            %let dq_error=Teradata connection failed. Check the SAS log and AUTHDOMAIN.;
            quit;
            %goto invalid;
        %end;
        %put NOTE: DQ READ: configuration;
        create table work.dq_configuration_report as
        select * from connection to dq
            (select PROJECT_ID,FIELD_NAME,FIELD_TYPE,ACTIVE_IND
             from &dq_database..DQ_FIELD_CONFIG
             where PROJECT_ID=&_project_sql order by FIELD_NAME);
        %dq_check_sql;
        %let _rc=&dq_sql_failed;
        %if &_rc ne 0 %then %do;
            %let dq_error=Configuration read failed. Check configuration table access and deployment.;
            disconnect from dq;
            quit;
            %goto invalid;
        %end;
        /* Safe diagnostic: only the database, run UUID and project ID. */
        %put NOTE: DQ CALL: call &dq_database..SP_DQ_RUN_EXTENDED(&_run_sql,&_project_sql,&_numeric_sql,&_categorical_sql,&_date_sql,&_identifier_sql,'N',&_outliers_sql);
        execute (call &dq_database..SP_DQ_RUN_EXTENDED(&_run_sql,&_project_sql,
                 &_numeric_sql,&_categorical_sql,&_date_sql,&_identifier_sql,'N',&_outliers_sql)) by dq;
        %dq_check_sql;
        %let _call_rc=&dq_sql_failed;
        %if &_call_rc ne 0 %then %do;
            %let dq_error=Profiling CALL failed. Check the SAS SQLXMSG and database run log.;
        %end;
        %put NOTE: DQ READ: run status;
        create table work.dq_run_status as
        select * from connection to dq
            (select L.*,CAST(N.RUN_NUMBER AS VARCHAR(19)) AS RUN_NUMBER
             from &dq_database..DQ_RUN_LOG L
             left join &dq_database..DQ_RUN_NUMBER N on L.RUN_ID=N.RUN_ID
             where L.RUN_ID=&_run_sql);
        %dq_check_sql;
        %let _rc=&dq_sql_failed;
        %if &_rc ne 0 %then %do;
            %let dq_error=Cannot read run status. Success is unconfirmed.;
            disconnect from dq;
            quit;
            %goto invalid;
        %end;
        /* Read status/diagnostic metadata only. Keep the full SQL_TEXT in
           Teradata, avoiding the user's unsupported long-text column. */
        %put NOTE: DQ READ: module status;
        create table work.dq_module_status as
        select * from connection to dq
            (select RUN_ID,MODULE_NAME,ATTEMPT_NO,BATCH_ID,START_TIME,END_TIME,
                    STATUS,ERROR_CODE,ERROR_INFORMATION,FIELD_COUNT
             from &dq_database..DQ_MODULE_LOG where RUN_ID=&_run_sql
             order by ATTEMPT_NO,BATCH_ID);
        /* SAS datatype/CREATE errors may set SQLRC without setting SQLXRC. */
        %dq_check_sql;
        %let _rc=&dq_sql_failed;
        %if &_rc ne 0 %then %do;
            %let dq_error=Cannot read module log. Inspect the database directly.;
            disconnect from dq;
            quit;
            %goto invalid;
        %end;
        %put NOTE: DQ READ: run summary;
        /* Aggregate count types from the view are unsupported by the user's
           SAS engine. Export them as SAS-compatible double-precision numbers.
           Exact counts and all profiling/classification remain in Teradata. */
        create table work.dq_summary as
        select * from connection to dq
            (select RUN_ID,CAST(RUN_NUMBER AS VARCHAR(19)) AS RUN_NUMBER,
                    PROJECT_ID,MODULE_NAME,FIELD_TYPE,
                    CAST(FIELDS_TESTED AS FLOAT) AS FIELDS_TESTED,
                    CAST(METRIC_RESULT_COUNT AS FLOAT) AS METRIC_RESULT_COUNT,
                    CAST(GREEN_COUNT AS FLOAT) AS GREEN_COUNT,
                    CAST(AMBER_COUNT AS FLOAT) AS AMBER_COUNT,
                    CAST(RED_COUNT AS FLOAT) AS RED_COUNT
             from &dq_database..DQ_RUN_SUMMARY where RUN_ID=&_run_sql);
        %dq_check_sql;
        %let _rc=&dq_sql_failed;
        %if &_rc ne 0 %then %do;
            %let dq_error=Cannot read run summary. Success is unconfirmed.;
        %end;
        disconnect from dq;
    quit;
    %if &_call_rc ne 0 or &_rc ne 0 %then %goto invalid;
    proc sql noprint;
        select STATUS,RUN_NUMBER into :dq_status trimmed,:dq_run_number trimmed
        from work.dq_run_status;
    quit;
    %if &dq_status ne SUCCEEDED %then %do;
        %let dq_error=Profiling did not succeed. Inspect WORK.DQ_RUN_STATUS and WORK.DQ_MODULE_STATUS.;
        %goto invalid;
    %end;
    %put NOTE: DQ run number &dq_run_number completed successfully.;
    proc print data=work.dq_summary noobs;
        var RUN_NUMBER PROJECT_ID MODULE_NAME FIELD_TYPE FIELDS_TESTED
            METRIC_RESULT_COUNT GREEN_COUNT AMBER_COUNT RED_COUNT;
    run;
    /* Comparisons read this successful run only. A comparison read failure
       does not change or invalidate its saved profiling status/results. */
    %if &mom=Y or &yoy=Y %then %do;
        %run_dq_changes(project=&project,run_number=&dq_run_number,mom=&mom,yoy=&yoy);
    %end;
    %return;
%invalid:
    %let dq_status=FAILED;
    %put ERROR: &dq_error;
    %put NOTE: DQ run ID = &dq_run_id. No successful run is being reported.;
%mend;

/* Independent, read-only analysis of an EXISTING successful profiling run.
   Only compact summaries are imported into SAS. Detailed rows stay in the
   Teradata view. No new UUID, log writes, source scans or Excel loads. */
%macro run_dq_changes(project=RDS,run_number=,mom=Y,yoy=Y);
    %local _name _i _value _project_sql _rc _n _source_status _rows;
    %global dq_change_status dq_change_error dq_change_run_number;
    %let dq_change_status=FAILED;
    %let dq_change_error=;
    %let dq_change_run_number=;
    %let _rows=0;
    /* Remove previous summary even if this invocation has invalid inputs. */
    proc datasets library=work nolist;
        delete dq_change_source dq_change_summary;
    quit;
    %do _i=1 %to 2;
        %let _name=%scan(mom yoy,&_i);
        %if %length(%superq(&_name))=0 %then %do;
            %let dq_change_error=MoM and YoY switches must be Y or N.;
            %goto change_failed;
        %end;
        %let _value=%upcase(%qsysfunc(strip(%superq(&_name))));
        %if %length(%superq(_value)) ne 1 %then %do;
            %let dq_change_error=MoM and YoY switches must be Y or N.;
            %goto change_failed;
        %end;
        %if %superq(_value) ne Y and %superq(_value) ne N %then %do;
            %let dq_change_error=MoM and YoY switches must be Y or N.;
            %goto change_failed;
        %end;
        %let &_name=&_value;
    %end;
    %if &mom=N and &yoy=N %then %do;
        %let dq_change_status=SKIPPED;
        %put NOTE: MoM and YoY are both N. Comparisons skipped.;
        %return;
    %end;
    %if %length(%superq(project))=0 or %length(%superq(run_number))=0 %then %do;
        %let dq_change_error=Specify project and the short number of a successful profiling run.;
        %goto change_failed;
    %end;
    %if %sysfunc(prxmatch(%str(/^[A-Za-z_][A-Za-z0-9_]{0,29}$/),%superq(project)))=0
        or %sysfunc(prxmatch(%str(/^[1-9][0-9]{0,18}$/),%superq(run_number)))=0 %then %do;
        %let dq_change_error=Invalid project or short run number.;
        %goto change_failed;
    %end;
    %dq_validate_context;
    %if &dq_context_ok ne 1 %then %do;
        %let dq_change_error=Invalid Teradata connection settings.;
        %goto change_failed;
    %end;
    %let _project_sql=%sysfunc(quote(%superq(project),%str(%')));
    proc sql noprint;
        %dq_connect;
        %dq_check_sql(dbms=N);
        %if &dq_sql_failed %then %do;
            %let dq_change_error=Comparison connection failed. Check the SAS log.;
            quit;
            %goto change_failed;
        %end;
        create table work.dq_change_source as select * from connection to dq
            (select L.RUN_ID,L.PROJECT_ID,L.STATUS,
                    CAST(N.RUN_NUMBER AS VARCHAR(19)) AS RUN_NUMBER
             from &dq_database..DQ_RUN_LOG L
             join &dq_database..DQ_RUN_NUMBER N on L.RUN_ID=N.RUN_ID
             where L.PROJECT_ID=&_project_sql and N.RUN_NUMBER=&run_number);
        %dq_check_sql;
        %if &dq_sql_failed %then %do;
            %let dq_change_error=Cannot read the requested profiling run.;
            disconnect from dq;
            quit;
            %goto change_failed;
        %end;
        select count(*),max(STATUS) into :_n trimmed,:_source_status trimmed
          from work.dq_change_source;
        %dq_check_sql(dbms=N);
        %if &dq_sql_failed %then %do;
            %let dq_change_error=Cannot verify the comparison source run.;
            disconnect from dq;
            quit;
            %goto change_failed;
        %end;
        %if &_n ne 1 %then %do;
            %let dq_change_error=The requested run number was not found for this project.;
            disconnect from dq;
            quit;
            %goto change_failed;
        %end;
        %if %superq(_source_status) ne SUCCEEDED %then %do;
            %let dq_change_error=Comparisons require a successful run belonging to the selected project.;
            disconnect from dq;
            quit;
            %goto change_failed;
        %end;
        %put NOTE: DQ CHANGE READ: project=&project run_number=&run_number;
        create table work.dq_change_summary as select * from connection to dq
            (select CAST(COUNT(*) AS FLOAT) AS FIELD_MONTHS,
                    CAST(COALESCE(SUM(CASE WHEN MOM_STATUS='EVALUATED' THEN 1 ELSE 0 END),0) AS FLOAT) AS MOM_EVALUATED,
                    CAST(COALESCE(SUM(CASE WHEN MOM_STATUS='PARTIALLY_EVALUATED' THEN 1 ELSE 0 END),0) AS FLOAT) AS MOM_PARTIAL,
                    CAST(COALESCE(SUM(CASE WHEN MOM_STATUS='NOT_EVALUATED' THEN 1 ELSE 0 END),0) AS FLOAT) AS MOM_UNAVAILABLE,
                    CAST(COALESCE(SUM(CASE WHEN YOY_STATUS='EVALUATED' THEN 1 ELSE 0 END),0) AS FLOAT) AS YOY_EVALUATED,
                    CAST(COALESCE(SUM(CASE WHEN YOY_STATUS='PARTIALLY_EVALUATED' THEN 1 ELSE 0 END),0) AS FLOAT) AS YOY_PARTIAL,
                    CAST(COALESCE(SUM(CASE WHEN YOY_STATUS='NOT_EVALUATED' THEN 1 ELSE 0 END),0) AS FLOAT) AS YOY_UNAVAILABLE,
                    CAST(COUNT(DISTINCT FIELD_NAME) AS FLOAT) AS FIELDS_COMPARED,
                    MIN(POU_DT) AS FIRST_POU_DT,MAX(POU_DT) AS LAST_POU_DT
             from &dq_database..DQ_FIELD_CHANGE_REVIEW
             where PROJECT_ID=&_project_sql and RUN_NUMBER=&run_number);
        %dq_check_sql;
        %let _rc=&dq_sql_failed;
        disconnect from dq;
    quit;
    %if &_rc ne 0 %then %do;
        %let dq_change_error=Cannot read comparisons. Check deployment of results/94 and the SAS log.;
        %goto change_failed;
    %end;
    /* Read the wide view once, then format only the requested summaries.
       Counts now represent field/month rows, not individual metric rows. */
    data work.dq_change_summary;
        length COMPARISON_TYPE $3;
        set work.dq_change_summary;
        %if &mom=Y %then %do;
            COMPARISON_TYPE='MOM';
            EVALUATED_COUNT=MOM_EVALUATED;
            PARTIAL_COUNT=MOM_PARTIAL;
            NOT_EVALUATED_COUNT=MOM_UNAVAILABLE;
            output;
        %end;
        %if &yoy=Y %then %do;
            COMPARISON_TYPE='YOY';
            EVALUATED_COUNT=YOY_EVALUATED;
            PARTIAL_COUNT=YOY_PARTIAL;
            NOT_EVALUATED_COUNT=YOY_UNAVAILABLE;
            output;
        %end;
        keep COMPARISON_TYPE FIELD_MONTHS EVALUATED_COUNT PARTIAL_COUNT
             NOT_EVALUATED_COUNT FIELDS_COMPARED FIRST_POU_DT LAST_POU_DT;
    run;
    %if &syserr>4 %then %do;
        %let dq_change_error=Cannot format the comparison summary.;
        %goto change_failed;
    %end;
    proc sql noprint;
        select coalesce(sum(FIELD_MONTHS),0) into :_rows trimmed from work.dq_change_summary;
        %dq_check_sql(dbms=N);
        %let _rc=&dq_sql_failed;
    quit;
    %if &_rc ne 0 %then %do;
        %let dq_change_error=Cannot verify the comparison summary.;
        %goto change_failed;
    %end;
    %if &_rows=0 %then %do;
        %let dq_change_error=No dated monthly results. Run current profiling with PROFILE_MONTHLY=Y first.;
        %goto change_failed;
    %end;
    %let dq_change_run_number=&run_number;
    %let dq_change_status=SUCCEEDED;
    %put NOTE: Field comparisons available for project=&project run_number=&run_number.;
    proc print data=work.dq_change_summary noobs;
    run;
    %return;
%change_failed:
    %let dq_change_status=FAILED;
    %put ERROR: &dq_change_error;
%mend;

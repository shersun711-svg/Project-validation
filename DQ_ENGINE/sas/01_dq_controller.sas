/* All calculations execute in Teradata. WORK datasets contain configuration,
   logs and summaries only. Error policy: stop at the first required failure.
   The stored procedure owns database statuses; a CALL returning without an
   SQL error alone is not evidence of a successful run. */
%global dq_controller_version;
%let dq_controller_version=20261012_BASIC_RUN_NUMBER;
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

%macro run_dq_engine(project=RDS,numeric_basic=Y,numeric_percentiles=N,
    numeric_outliers=N,categorical_basic=N,categorical_psi=N,date_basic=N,
    identifier_basic=N,export_excel=N,retry_run_id=);
    %local _switches _i _name _value _rc _call_rc _msg _project_sql _run_sql
        _numeric_sql _categorical_sql _date_sql _identifier_sql;
    %global dq_run_id dq_run_number dq_status dq_error;
    %let dq_run_id=;
    %let dq_run_number=;
    %let dq_status=FAILED;
    %let dq_error=;
    %let _switches=numeric_basic numeric_percentiles numeric_outliers
        categorical_basic categorical_psi date_basic identifier_basic export_excel;
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
    %if &numeric_percentiles=Y or &numeric_outliers=Y
        or &categorical_psi=Y or &export_excel=Y %then %do;
        %let dq_error=Percentiles, outliers, PSI and Excel export are deferred. Set their switches to N.;
        %goto invalid;
    %end;
    %if &numeric_basic=N and &categorical_basic=N and &date_basic=N
        and &identifier_basic=N %then %do;
        %let dq_error=No implemented module selected. Enable at least one basic module.;
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
    %let _numeric_sql=%sysfunc(quote(&numeric_basic,%str(%')));
    %let _categorical_sql=%sysfunc(quote(&categorical_basic,%str(%')));
    %let _date_sql=%sysfunc(quote(&date_basic,%str(%')));
    %let _identifier_sql=%sysfunc(quote(&identifier_basic,%str(%')));
    /* Clear our previous aggregate outputs so stale WORK data cannot be read
       as the result of a connection failure. */
    proc datasets library=work nolist;
        delete dq_configuration_report dq_run_status dq_module_status dq_summary;
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
            (select PROJECT_ID,FIELD_NAME,FIELD_TYPE,ACTIVE_IND,NUMERIC_BASIC_IND
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
        %put NOTE: DQ CALL: call &dq_database..SP_DQ_RUN_BASIC(&_run_sql,&_project_sql,&_numeric_sql,&_categorical_sql,&_date_sql,&_identifier_sql);
        execute (call &dq_database..SP_DQ_RUN_BASIC(&_run_sql,&_project_sql,
                 &_numeric_sql,&_categorical_sql,&_date_sql,&_identifier_sql)) by dq;
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
    %return;
%invalid:
    %let dq_status=FAILED;
    %put ERROR: &dq_error;
    %put NOTE: DQ run ID = &dq_run_id. No successful run is being reported.;
%mend;

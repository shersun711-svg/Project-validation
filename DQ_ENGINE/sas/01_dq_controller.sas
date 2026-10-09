/* All calculations execute in Teradata. WORK datasets contain configuration,
   logs and summaries only. Error policy: stop at the first required failure.
   The stored procedure owns database statuses; a CALL returning without an
   SQL error alone is not evidence of a successful run. */
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

%macro run_dq_engine(project=RDS,numeric_basic=Y,numeric_percentiles=N,
    numeric_outliers=N,categorical_basic=N,categorical_psi=N,date_basic=N,
    identifier_basic=N,export_excel=N,retry_run_id=);
    %local _switches _i _name _value _rc _call_rc _msg;
    %global dq_run_id dq_status dq_error;
    %let dq_run_id=;
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
    %if &numeric_percentiles=Y or &numeric_outliers=Y or &categorical_basic=Y
        or &categorical_psi=Y or &date_basic=Y or &identifier_basic=Y or &export_excel=Y %then %do;
        %let dq_error=Only Numeric Basic is implemented in Phase 2. Set deferred switches to N.;
        %goto invalid;
    %end;
    %if &numeric_basic=N %then %do;
        %let dq_error=No implemented module selected. Set numeric_basic=Y.;
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
    /* Clear our previous aggregate outputs so stale WORK data cannot be read
       as the result of a connection failure. */
    proc datasets library=work nolist;
        delete dq_configuration_report dq_run_status dq_module_status dq_summary;
    quit;
    proc sql;
        %dq_connect;
        %let _rc=&sqlxrc;
        %if &_rc ne 0 %then %do;
            %let dq_error=Teradata connection failed. Check the SAS log and AUTHDOMAIN.;
            quit;
            %goto invalid;
        %end;
        create table work.dq_configuration_report as
        select * from connection to dq
            (select * from &dq_database..DQ_CONFIG_VALIDATION
             where PROJECT_ID='&project' order by FIELD_NAME);
        %let _rc=&sqlxrc;
        %if &_rc ne 0 %then %do;
            %let dq_error=Configuration report failed. Check metadata permissions and deployment.;
            disconnect from dq;
            quit;
            %goto invalid;
        %end;
        execute (call &dq_database..SP_DQ_RUN_ENGINE('&dq_run_id','&project')) by dq;
        %let _call_rc=&sqlxrc;
        %if &_call_rc ne 0 %then %do;
            %let dq_error=Numeric CALL failed. Check the SAS SQLXMSG and database run log.;
        %end;
        create table work.dq_run_status as
        select * from connection to dq
            (select * from &dq_database..DQ_RUN_LOG where RUN_ID='&dq_run_id');
        %let _rc=&sqlxrc;
        %if &_rc ne 0 %then %do;
            %let dq_error=Cannot read run status; success is unconfirmed.;
            disconnect from dq;
            quit;
            %goto invalid;
        %end;
        create table work.dq_module_status as
        select * from connection to dq
            (select * from &dq_database..DQ_MODULE_LOG where RUN_ID='&dq_run_id'
             order by ATTEMPT_NO,BATCH_ID);
        %let _rc=&sqlxrc;
        %if &_rc ne 0 %then %do;
            %let dq_error=Cannot read module log; inspect the database directly.;
            disconnect from dq;
            quit;
            %goto invalid;
        %end;
        /* SQL_TEXT is aggregate SQL, not source observations. */
        create table work.dq_summary as
        select * from connection to dq
            (select * from &dq_database..DQ_RUN_SUMMARY where RUN_ID='&dq_run_id');
        %let _rc=&sqlxrc;
        disconnect from dq;
    quit;
    %if &_call_rc ne 0 or &_rc ne 0 %then %goto invalid;
    proc sql noprint;
        select STATUS into :dq_status trimmed from work.dq_run_status;
    quit;
    %if &dq_status ne SUCCEEDED %then %do;
        %let dq_error=Numeric profiling did not succeed. Inspect WORK.DQ_RUN_STATUS and WORK.DQ_MODULE_STATUS.;
        %goto invalid;
    %end;
    %put NOTE: DQ run &dq_run_id completed successfully.;
    proc print data=work.dq_summary noobs; run;
    %return;
%invalid:
    %let dq_status=FAILED;
    %put ERROR: &dq_error;
    %put NOTE: DQ run ID = &dq_run_id. No successful run is being reported.;
%mend;

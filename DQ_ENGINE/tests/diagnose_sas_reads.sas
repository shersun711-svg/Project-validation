/* Run after 01_dq_controller.sas and defining the connection settings.
   Read-only datatype diagnosis: WHERE 1=0 describes each result without
   retrieving observations. No procedure is called and no Teradata data changes.
   Each probe starts a new PROC SQL so a prior NOEXEC does not skip later probes.
   Paste the NOTE: DQ READ PROBE lines when reporting the results. */
%macro dq_read_probe(label=,object=,projection=*);
    %local _sas_rc _db_rc _failed;
    %put NOTE: DQ READ PROBE BEGIN &label OBJECT=&object;
    proc sql;
        %dq_connect;
        %dq_check_sql(dbms=N);
        %let _failed=&dq_sql_failed;
        %if &_failed=0 %then %do;
            create table work.dq_probe_&label as
            select * from connection to dq
                (select &projection from &dq_database..&object where 1=0);
            %dq_check_sql;
            %let _failed=&dq_sql_failed;
        %end;
        %let _sas_rc=&sqlrc;
        %let _db_rc=NOT_SET;
        %if %symexist(sqlxrc) %then %let _db_rc=%superq(sqlxrc);
        /* QUIT ends this connection even if NOEXEC skipped DISCONNECT. */
        disconnect from dq;
    quit;
    %if &_failed=0 %then
        %put NOTE: DQ READ PROBE PASS &label SAS_SQLRC=&_sas_rc DBMS_SQLXRC=&_db_rc;
    %else
        %put NOTE: DQ READ PROBE FAIL &label SAS_SQLRC=&_sas_rc DBMS_SQLXRC=&_db_rc;
%mend;

%macro dq_diagnose_reads;
    %if not %sysmacexist(dq_connect) or not %sysmacexist(dq_validate_context)
        or not %sysmacexist(dq_check_sql) %then %do;
        %put ERROR: Run 01_dq_controller.sas in this SAS session first.;
        %return;
    %end;
    %dq_validate_context;
    %if &dq_context_ok ne 1 %then %return;

    /* Original controller result shapes. Zero rows are intentional: these
       probes check datatype/metadata conversion only, not profiling results. */
    %dq_read_probe(label=raw_fields,object=DQ_FIELD_CONFIG);
    %dq_read_probe(label=raw_run_log,object=DQ_RUN_LOG);
    %dq_read_probe(label=raw_module_log,object=DQ_MODULE_LOG);
    %dq_read_probe(label=raw_summary,object=DQ_RUN_SUMMARY);

    /* Compare the long Unicode column with a bounded SQL-text preview. */
    %dq_read_probe(label=module_log_no_sql,object=DQ_MODULE_LOG,
        projection=%str(RUN_ID,MODULE_NAME,ATTEMPT_NO,BATCH_ID,START_TIME,
            END_TIME,STATUS,ERROR_CODE,ERROR_INFORMATION,FIELD_COUNT));
    %dq_read_probe(label=sql_text_8000,object=DQ_MODULE_LOG,
        projection=%str(CAST(SUBSTR(SQL_TEXT,1,8000) AS VARCHAR(8000)) AS SQL_TEXT));

    /* Compare summary aggregate number types with SAS numeric-compatible
       projections. This does not change stored counts or classification. */
    %dq_read_probe(label=summary_float,object=DQ_RUN_SUMMARY,
        projection=%str(RUN_ID,PROJECT_ID,MODULE_NAME,FIELD_TYPE,
            CAST(FIELDS_TESTED AS FLOAT) AS FIELDS_TESTED,
            CAST(METRIC_RESULT_COUNT AS FLOAT) AS METRIC_RESULT_COUNT,
            CAST(GREEN_COUNT AS FLOAT) AS GREEN_COUNT,
            CAST(AMBER_COUNT AS FLOAT) AS AMBER_COUNT,
            CAST(RED_COUNT AS FLOAT) AS RED_COUNT));
%mend;
%dq_diagnose_reads;

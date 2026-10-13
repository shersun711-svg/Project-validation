/* After deploying the upgrade and fixture 01 in an isolated TEST engine.
   Run the latest controller first. Submit the whole file in one SAS session.
   Deferred switches default N. This test does not read RDS. */
%global td_server td_authdomain dq_database;
%let td_server=dwhprod;
%let td_authdomain=TeraAuth;
%let dq_database=LAB_T_ORION_MVT;
%macro test_other_basic;
    %local _fields _metrics _rc;
    %if not %sysmacexist(run_dq_engine) %then %do;
        %put ERROR: Run 01_dq_controller.sas first.;
        %return;
    %end;
    %run_dq_engine(project=DQ_BASIC_TEST,numeric_basic=N,
                   categorical_basic=y,date_basic=Y,identifier_basic=Y);
    %if &dq_status ne SUCCEEDED %then %do;
        %put ERROR: Other Basic failed: %superq(dq_error);
        %abort cancel;
    %end;
    %if %length(%superq(dq_run_number))=0 %then %do;
        %put ERROR: No short run number returned.;
        %abort cancel;
    %end;
    proc sql noprint;
        select sum(FIELDS_TESTED),sum(METRIC_RESULT_COUNT)
          into :_fields trimmed,:_metrics trimmed from work.dq_summary;
        %let _rc=&sqlrc;
    quit;
    %if &_rc ne 0 %then %abort cancel;
    %if &_fields ne 5 or &_metrics ne 136 %then %do;
        %put ERROR: Unexpected basic fixture summary.;
        %abort cancel;
    %end;
    %put NOTE: Other Basic controller test passed. RUN_NUMBER=&dq_run_number;
%mend;
%test_other_basic;

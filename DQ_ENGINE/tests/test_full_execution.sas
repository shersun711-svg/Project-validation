/* Run 01_dq_controller.sas first in the same EG server session. Submit this
   WHOLE file, including its connection settings. SQL fixtures must exist.
   This uses DQ_TEST only. The three switch errors and completed-ID rejection
   are intentional; the final passing NOTE is required. */
/* Non-secret connection settings for the user's lab deployment. */
%global td_server td_authdomain dq_database;
%let td_server=dwhprod;
%let td_authdomain=TeraAuth;
%let dq_database=LAB_T_ORION_MVT;
options nomprint nomlogic nosymbolgen;

%macro assert_status(expected);
    %if &dq_status ne &expected %then %do;
        %put ERROR: Expected &expected but got &dq_status.;
        %put NOTE: DQ test controller detail: %superq(dq_error);
        %abort cancel;
    %end;
%mend;
%macro test_controller;
%local fixture_metric_count fixture_field_count _summary_rc;
%global fixture_run_id;
%if not %sysmacexist(run_dq_engine) or not %sysmacexist(dq_validate_context)
    or not %sysmacexist(dq_check_sql) %then %do;
    %put ERROR: Run the latest 01_dq_controller.sas in this same EG session first.;
    %return;
%end;
%dq_validate_context;
%if &dq_context_ok ne 1 %then %abort cancel;
%put NOTE: DQ TEST connection: server=&td_server database=&dq_database authdomain=&td_authdomain;
%if %symexist(dq_controller_version) %then
    %put NOTE: DQ TEST controller: &dq_controller_version;
%put NOTE: DQ TEST: invalid switch - expected failure;
%run_dq_engine(project=DQ_TEST,numeric_basic=INVALID);
%assert_status(FAILED);
%if %length(%superq(dq_run_id)) %then %abort cancel;
%put NOTE: DQ TEST: deferred module - expected failure;
%run_dq_engine(project=DQ_TEST,numeric_basic=Y,numeric_outliers=Y);
%assert_status(FAILED);
%if %length(%superq(dq_run_id)) %then %abort cancel;
%put NOTE: DQ TEST: no module selected - expected failure;
%run_dq_engine(project=DQ_TEST,numeric_basic=N);
%assert_status(FAILED);
%put NOTE: DQ TEST: lowercase Y - success required;
%run_dq_engine(project=DQ_TEST,numeric_basic=y);
%assert_status(SUCCEEDED);
%let fixture_run_id=&dq_run_id;
proc sql noprint;
    select sum(METRIC_RESULT_COUNT),sum(FIELDS_TESTED)
      into :fixture_metric_count trimmed,:fixture_field_count trimmed
      from work.dq_summary;
    %let _summary_rc=&sqlrc;
quit;
%if &_summary_rc ne 0 %then %do;
    %put ERROR: Cannot read the SAS fixture summary.;
    %abort cancel;
%end;
%if &fixture_metric_count ne 400 or &fixture_field_count ne 5 %then %do;
    %put ERROR: Unexpected fixture summary counts.;
    %abort cancel;
%end;
/* A completed run cannot be overwritten; CALL must fail and controller must
   not read the older SUCCEEDED row as evidence for the rejected invocation. */
%put NOTE: DQ TEST: completed run ID - expected failure;
%run_dq_engine(project=DQ_TEST,numeric_basic=Y,retry_run_id=&fixture_run_id);
%assert_status(FAILED);
%put NOTE: SAS controller switch and lifecycle checks passed.;

%mend;
%test_controller;

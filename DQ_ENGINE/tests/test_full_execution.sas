/* Include the controller after defining the connection settings in a SAS
   session. SQL fixtures must already exist. No Excel or advanced tests. */
%macro assert_status(expected);
    %if &dq_status ne &expected %then %do;
        %put ERROR: Expected &expected but got &dq_status.;
        %abort cancel;
    %end;
%mend;
%macro test_controller;
%global fixture_run_id;
%run_dq_engine(project=DQ_TEST,numeric_basic=INVALID);
%assert_status(FAILED);
%if %length(%superq(dq_run_id)) %then %abort cancel;
%run_dq_engine(project=DQ_TEST,numeric_basic=Y,numeric_outliers=Y);
%assert_status(FAILED);
%if %length(%superq(dq_run_id)) %then %abort cancel;
%run_dq_engine(project=DQ_TEST,numeric_basic=N);
%assert_status(FAILED);
%run_dq_engine(project=DQ_TEST,numeric_basic=y);
%assert_status(SUCCEEDED);
%let fixture_run_id=&dq_run_id;
proc sql noprint;
    select sum(METRIC_RESULT_COUNT),sum(FIELDS_TESTED)
      into :fixture_metric_count trimmed,:fixture_field_count trimmed
      from work.dq_summary;
quit;
%if &fixture_metric_count ne 400 or &fixture_field_count ne 5 %then %do;
    %put ERROR: Unexpected fixture summary counts.;
    %abort cancel;
%end;
/* A completed run cannot be overwritten; CALL must fail and controller must
   not read the older SUCCEEDED row as evidence for the rejected invocation. */
%run_dq_engine(project=DQ_TEST,numeric_basic=Y,retry_run_id=&fixture_run_id);
%assert_status(FAILED);
%put NOTE: SAS controller switch and lifecycle checks passed.;

%mend;
%test_controller;

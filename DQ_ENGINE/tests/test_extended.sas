/* Current controller/connection settings and SQL fixture 02 must exist.
   Basic special-value tests only; synthetic data and fresh run UUIDs. */
%macro test_extended;
    %local _actual;
    %run_dq_engine(project=DQ_EXT_TEST,numeric_basic=Y,categorical_basic=Y);
    %if &dq_status ne SUCCEEDED %then %abort cancel;
    proc sql noprint;
        select sum(METRIC_RESULT_COUNT) into :_actual trimmed from work.dq_summary;
    quit;
    %if &_actual ne 390 %then %abort cancel;
    %put NOTE: Basic special-value controller test passed. RUN_NUMBER=&dq_run_number.;
%mend;
%test_extended;

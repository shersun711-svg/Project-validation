/* Isolated SQL fixture 03 and current controller must exist. Never retrieve RDS
   rows. PROC MEANS VARDEF=N reconciles population standard deviation and bounds. */
%macro test_outliers;
    %local _basic_run _basic_sql _count _rc _failures;
    %run_dq_engine(project=DQ_OUT_TEST,numeric_basic=Y,numeric_outliers=Y);
    %if &dq_status ne SUCCEEDED %then %abort cancel;
    %let _basic_run=&dq_run_id;
    %let _basic_sql=%sysfunc(quote(%superq(_basic_run),%str(%')));
    proc sql noprint;
        select sum(METRIC_RESULT_COUNT) into :_count trimmed from work.dq_summary;
    quit;
    %if &_count ne 612 %then %abort cancel;
    data work.outlier_fixture;
        do i=1 to 33;
            if i=1 then x=-4;
            else if i=2 then x=4;
            else x=0;
            output;
        end;
    run;
    proc means data=work.outlier_fixture noprint vardef=n;
        var x;
        output out=work.outlier_stats n=valid_count mean=mean_value std=stddev_value;
    run;
    data work.outlier_expected;
        set work.outlier_stats;
        lower_bound=mean_value-3*stddev_value;
        upper_bound=mean_value+3*stddev_value;
        outlier_count=2; outlier_rate_pct=100*outlier_count/valid_count;
    run;
    proc sql;
        %dq_connect;
        %dq_check_sql(dbms=N);
        %if &dq_sql_failed %then %do; quit; %abort cancel; %end;
        create table work.outlier_actual as select * from connection to dq
            (select CAST(OUTLIER_VALID_COUNT AS FLOAT) AS VALID_COUNT,
                    CAST(OUTLIER_LOWER_BOUND AS FLOAT) AS LOWER_BOUND,
                    CAST(OUTLIER_UPPER_BOUND AS FLOAT) AS UPPER_BOUND,
                    CAST(OUTLIER_COUNT AS FLOAT) AS OUTLIER_COUNT,
                    CAST(OUTLIER_RATE_PCT AS FLOAT) AS OUTLIER_RATE_PCT
             from &dq_database..DQ_BASIC_REVIEW where RUN_ID=&_basic_sql
             and FIELD_NAME='AMOUNT' and PERIOD_LEVEL='OVERALL');
        %dq_check_sql;
        %let _rc=&dq_sql_failed;
        disconnect from dq;
    quit;
    %if &_rc %then %abort cancel;
    proc sql noprint;
        select count(*) into :_count trimmed from work.outlier_actual;
        select count(*) into :_failures trimmed
        from work.outlier_expected E cross join work.outlier_actual A
        where missing(A.valid_count) or missing(A.lower_bound) or missing(A.upper_bound)
           or missing(A.outlier_count) or missing(A.outlier_rate_pct)
           or E.valid_count ne A.valid_count or E.outlier_count ne A.outlier_count
           or abs(E.lower_bound-A.lower_bound)>1e-8 or abs(E.upper_bound-A.upper_bound)>1e-8
           or abs(E.outlier_rate_pct-A.outlier_rate_pct)>1e-8;
    quit;
    %if &_count ne 1 or &_failures ne 0 %then %abort cancel;
    %run_dq_engine(project=DQ_OUT_TEST,numeric_basic=N,numeric_outliers=Y);
    %if &dq_status ne SUCCEEDED %then %abort cancel;
    proc sql noprint;
        select sum(METRIC_RESULT_COUNT) into :_count trimmed from work.dq_summary;
    quit;
    %if &_count ne 180 %then %abort cancel;
    %put NOTE: Outlier switches and SAS synthetic reconciliation passed.;
%mend;
%test_outliers;

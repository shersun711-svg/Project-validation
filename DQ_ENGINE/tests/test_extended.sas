/* Current helpers/connection settings and SQL fixture 02 must exist.
   Synthetic data only. The stored-procedure calls use fresh UUIDs. */
%macro test_extended;
    %local _mixed_id _mixed_sql _actual _rc _failures;
    %run_dq_engine(project=DQ_EXT_TEST,numeric_basic=Y,numeric_percentiles=Y,categorical_basic=Y);
    %if &dq_status ne SUCCEEDED %then %abort cancel;
    %let _mixed_id=&dq_run_id;
    proc sql noprint;
        select sum(METRIC_RESULT_COUNT) into :_actual trimmed from work.dq_summary;
    quit;
    %if &_actual ne 600 %then %abort cancel;
    /* Independent h=1+(n-1)*p reference. PROC MEANS PCTLDEF=5 differs. */
    %let _mixed_sql=%sysfunc(quote(%superq(_mixed_id),%str(%')));
    data work.dq_percentile_expected;
        array x[4] _temporary_ (0 10 10 20);
        array p[7] _temporary_ (0.01 0.05 0.25 0.50 0.75 0.95 0.99);
        array names[7] $3 _temporary_ ('P1' 'P5' 'P25' 'P50' 'P75' 'P95' 'P99');
        length metric_name $32;
        do i=1 to 7;
            h=1+3*p[i]; lower=floor(h); upper=ceil(h);
            expected=x[lower]+(h-lower)*(x[upper]-x[lower]);
            metric_name=names[i]; output;
        end;
        keep metric_name expected;
    run;
    proc sql;
        %dq_connect;
        %dq_check_sql(dbms=N);
        %if &dq_sql_failed %then %do; quit; %abort cancel; %end;
        create table work.dq_percentile_actual as select * from connection to dq
            (select METRIC_NAME,CAST(METRIC_VALUE AS FLOAT) AS METRIC_VALUE
             from &dq_database..DQ_COMPLETED_RESULT where RUN_ID=&_mixed_sql
             and FIELD_NAME='AMOUNT' and PERIOD_LEVEL='OVERALL' and MODULE_NAME='NUMERIC_PERCENTILES');
        %dq_check_sql;
        %let _rc=&dq_sql_failed;
        disconnect from dq;
    quit;
    %if &_rc %then %abort cancel;
    proc sql noprint;
        select count(*) into :_failures trimmed
        from work.dq_percentile_expected E full join work.dq_percentile_actual A
          on E.metric_name=A.metric_name
        where E.metric_name is null or A.metric_name is null
          or missing(A.metric_value) or abs(E.expected-A.metric_value)>1e-8;
    quit;
    %if &_failures ne 0 %then %abort cancel;
    /* Counts across modules overlap: do not sum FIELDS_TESTED to count fields. */
    %run_dq_engine(project=DQ_EXT_TEST,numeric_basic=N,numeric_percentiles=Y);
    %if &dq_status ne SUCCEEDED %then %abort cancel;
    proc sql noprint;
        select sum(METRIC_RESULT_COUNT) into :_actual trimmed from work.dq_summary;
    quit;
    %if &_actual ne 210 %then %abort cancel;
    %put NOTE: Extended switches passed. Mixed run UUID=&_mixed_id.;
%mend;
%test_extended;

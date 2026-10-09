/* SAS sample statistics use VARDEF=DF, matching STDDEV_SAMP (n-1).
   Construct a SMALL synthetic fixture locally; NEVER retrieve RDS rows.
   Run after test_full_execution.sas in the same session, or set
   fixture_run_id to a completed DQ_TEST run UUID. */
%macro test_reconciliation;
data work.sas_fixture;
    do row_id=1 to 100;
        if row_id=1 then x=.;
        else if row_id<=6 then x=0;
        else x=2;
        output;
    end;
run;
proc means data=work.sas_fixture noprint vardef=df;
    var x;
    output out=work.sas_expected n=non_missing_count nmiss=missing_count
        min=minimum max=maximum mean=mean std=stddev_samp;
run;
proc sql noprint;
    select count(*),sum(x=0) into :sas_total trimmed,:sas_zero trimmed
    from work.sas_fixture;
    %dq_connect;
    create table work.td_fixture_result as
    select * from connection to dq
        (select METRIC_NAME,METRIC_VALUE,DQ_COLOUR
         from &dq_database..DQ_COMPLETED_RESULT
         where RUN_ID='&fixture_run_id' and PROJECT_ID='DQ_TEST'
           and FIELD_NAME='X' and PERIOD_LEVEL='OVERALL');
    %let reconciliation_rc=&sqlxrc;
    disconnect from dq;
quit;
%if &reconciliation_rc ne 0 %then %abort cancel;
data work.sas_expected_long;
    set work.sas_expected;
    length metric_name $32;
    array v[10] total_count non_missing_count missing_count missing_rate_pct
        zero_count zero_rate_pct minimum maximum mean stddev_samp;
    total_count=&sas_total; zero_count=&sas_zero;
    missing_rate_pct=100*missing_count/total_count;
    zero_rate_pct=100*zero_count/total_count;
    do i=1 to dim(v);
        metric_name=upcase(vname(v[i])); expected_value=v[i]; output;
    end;
    keep metric_name expected_value;
run;
proc sql;
    create table work.reconciliation_failure as
    select E.metric_name,E.expected_value,T.metric_value
    from work.sas_expected_long E full join work.td_fixture_result T
      on E.metric_name=T.metric_name
    where E.metric_name is null or T.metric_name is null
       or (missing(E.expected_value) ne missing(T.metric_value))
       or abs(E.expected_value-T.metric_value)>1e-8;
quit;
proc sql noprint;
    select count(*) into :reconciliation_failures trimmed from work.reconciliation_failure;
quit;
%if &reconciliation_failures>0 %then %do;
    proc print data=work.reconciliation_failure; run;
    %abort cancel;
%end;
%put NOTE: Ten synthetic overall Numeric Basic metrics reconcile to SAS.;

%mend;
%test_reconciliation;

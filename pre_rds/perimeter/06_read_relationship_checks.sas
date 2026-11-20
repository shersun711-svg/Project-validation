/* Diagnostic only: run in the SAME SAS session as the relationship import.
   No database connection, table changes, Excel reads or load retries.
   Prints aggregate checks and load metadata only, never account/customer IDs. */
options obs=max nosyntaxcheck;
%macro read_relationship_checks;
    %if %sysfunc(exist(work.relationship_database_check)) %then %do;
        proc print data=work.relationship_database_check noobs;
            format ROW_N KEY_N MISSING_N BAD_DATE_N WRONG_LOAD_N EXPECTED_ROWS 20.;
        run;
    %end;
    %else %do;
        %put ERROR: WORK.RELATIONSHIP_DATABASE_CHECK is unavailable in this session.;
        %put NOTE: Retain the original Results output and input load ID. Do not rerun the loader.;
    %end;
    %if %sysfunc(exist(work.perimeter_relationships)) %then %do;
        proc sql;
            select LOAD_ID,PERIMETER_VERSION,count(*) as VALIDATED_INPUT_ROWS
            from work.perimeter_relationships
            group by LOAD_ID,PERIMETER_VERSION;
        quit;
    %end;
%mend;
%read_relationship_checks;

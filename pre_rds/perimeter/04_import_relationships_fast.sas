/* Relationship-sheet-only FastLoad. Does not modify the loaded account table.
   SAS 9.4 + XLSX + SAS/ACCESS Teradata; use the approved AUTHDOMAIN.
   Run this WHOLE program after setting the server workbook path/version.
   The destination must not exist. There are NO DROP/DELETE/APPEND operations. */
%let perimeter_workbook = ;
%let perimeter_version = ; /* e.g. CDAO_20261120. */
%let td_server = dwhprod;
%let td_authdomain = TeraAuth;
%let perimeter_database = LAB_T_ORION_MVT;
%let relationship_table = PRE_RDS_ACC_CUST_REL;
%let relationship_sheet = ; /* Blank: discover by all four required headers. */
%let expected_relationship_rows = 645076; /* Prior deduplicated WORK count. */
%let allow_numeric_text_ids = N; /* Y only for confirmed safe numeric IDs. */
%let text_date_informat = yymmdd10.; /* Text dates: YYYY-MM-DD. */
%let load_method = FASTLOAD; /* MULTISTMT is an explicit alternative only. */
options obs=max nosyntaxcheck;
options validvarname=v7 validmemname=extend nomprint nomlogic nosymbolgen;

%macro perimeter_text_id(raw=,out=);
    if vtype(&raw)='C' then do;
        if lengthn(strip(&raw))>128 then _bad=1;
        &out=strip(&raw);
    end;
    else do;
        _numeric_text_id=1;
        if "&allow_numeric_text_ids" ne 'Y' then _bad=1;
        if missing(&raw) or &raw ne int(&raw) or &raw < 0
           or &raw > 999999999999999 then _bad=1;
        &out=strip(putn(&raw,'best32.'));
    end;
    if missing(&out) or &out='.' or lengthn(&out)>128 then _bad=1;
%mend;

%macro perimeter_date(raw=,out=,required=Y);
    if missing(&raw) then do;
        &out=.;
        %if &required=Y %then %do; _bad=1; %end;
    end;
    else if vtype(&raw)='N' then do;
        /* XLSX engine converts genuine Excel date cells to SAS dates. Reject
           unformatted serials and datetimes instead of silently shifting dates. */
        _date_format=upcase(vformat(&raw));
        if prxmatch('/^(DATE|DAY|DDMMYY|MMDDYY|YYMMDD|E8601DA|B8601DA|IS8601DA|JULIAN|MONYY|WORDDATE|WEEKDATE)/',
                    strip(_date_format))=0
           or index(_date_format,'DATETIME')>0 then _bad=1;
        &out=input(strip(putn(&raw,'best32.')),?? best32.);
        if &out ne int(&out) then _bad=1;
    end;
    else do;
        &out=input(strip(&raw),?? &text_date_informat);
        if missing(&out) then _bad=1;
    end;
    if not missing(&out) and
       (&out < '01JAN1900'd or &out > '31DEC9999'd) then _bad=1;
%mend;

%macro import_relationships_fast;
    %local _i _name _rel_n _rel_sheet _settings_ok _book_open _db_open
           _load_id _loaded_at _bad_rel _rel_rows _numeric_rel _rel_clean
           _check_rc _check_xrc _reconcile_ok _write_options;
    %global relationship_perimeter_status;
    %let relationship_perimeter_status=FAILED;
    %let _book_open=0;
    %let _db_open=0;
    proc datasets library=work nolist;
        delete relationship_perimeter_summary relationship_database_check;
    quit;
    %do _i=1 %to 2;
        %let _name=%scan(perimeter_database relationship_table,&_i);
        %if %sysfunc(prxmatch(%str(/^[A-Za-z_][A-Za-z0-9_]{0,25}$/),%superq(&_name)))=0 %then %do;
            %put ERROR: &_name must be a simple identifier of at most 26 characters.;
            %goto finish;
        %end;
    %end;
    %if %length(%superq(perimeter_workbook))=0 or %length(%superq(perimeter_version))=0 %then %do;
        %put ERROR: Set perimeter_workbook and perimeter_version first.; %goto finish;
    %end;
    %let _settings_ok=0;
    data _null_;
        length value $32767;
        value=symget('perimeter_version');
        if lengthn(value)<=64 and prxmatch('/^[A-Za-z0-9_.-]+$/',strip(value))
            then call symputx('_settings_ok',1,'L');
    run;
    %if &_settings_ok ne 1 %then %do;
        %put ERROR: Version must be 1-64 letters, digits, dots, underscores or hyphens.;
        %goto finish;
    %end;
    %if %sysfunc(prxmatch(%str(/^[1-9][0-9]*$/),%superq(expected_relationship_rows)))=0 %then %do;
        %put ERROR: expected_relationship_rows must be a positive whole number.; %goto finish;
    %end;
    %if &allow_numeric_text_ids ne N and &allow_numeric_text_ids ne Y %then %do;
        %put ERROR: allow_numeric_text_ids must be N or Y.; %goto finish;
    %end;
    %if %sysfunc(prxmatch(%str(/^[A-Za-z][A-Za-z0-9]*[.]$/),%superq(text_date_informat)))=0 %then %do;
        %put ERROR: Specify a SAS date informat such as yymmdd10.; %goto finish;
    %end;
    %if &load_method=FASTLOAD %then %let _write_options=bulkload=yes tpt=yes;
    %else %if &load_method=MULTISTMT %then %let _write_options=bulkload=no multistmt=yes dbcommit=10000;
    %else %do;
        %put ERROR: load_method must be FASTLOAD or MULTISTMT.; %goto finish;
    %end;
    libname perbook xlsx "%superq(perimeter_workbook)" access=readonly;
    %if &syslibrc ne 0 %then %goto finish;
    %let _book_open=1;
    proc sql noprint;
        create table work.relationship_sheet_candidates as
        select memname from dictionary.columns where libname='PERBOOK'
          and upcase(name) in ('ACC_PROBE_ID','CUST_PROBE_ID','START_DT','END_DT')
        group by memname having count(*)=4;
        select count(*),max(nliteral(strip(memname))) into :_rel_n trimmed,:_rel_sheet trimmed
        from work.relationship_sheet_candidates
        where symget('relationship_sheet')='' or upcase(memname)=upcase(symget('relationship_sheet'));
    quit;
    %if &sqlrc ne 0 %then %goto finish;
    %if &_rel_n ne 1 %then %do;
        %put ERROR: Expected one sheet with ACC_PROBE_ID CUST_PROBE_ID START_DT END_DT.;
        %put ERROR: Set relationship_sheet to its exact name if multiple sheets match.;
        %goto finish;
    %end;
    %let _load_id=%sysfunc(uuidgen());
    %let _loaded_at=%sysfunc(datetime());
    data work.perimeter_rel_valid work.perimeter_rel_rejected;
        length ACC_PROBE_ID CUST_PROBE_ID $128 START_DT END_DT 8
               PERIMETER_VERSION $64 LOAD_ID $36 LOADED_AT 8 _date_format $49;
        set perbook.&_rel_sheet(rename=(ACC_PROBE_ID=_in_acc CUST_PROBE_ID=_in_cust
                                       START_DT=_in_start END_DT=_in_end));
        _bad=0; _numeric_text_id=0;
        %perimeter_text_id(raw=_in_acc,out=ACC_PROBE_ID);
        %perimeter_text_id(raw=_in_cust,out=CUST_PROBE_ID);
        %perimeter_date(raw=_in_start,out=START_DT,required=Y);
        %perimeter_date(raw=_in_end,out=END_DT,required=N);
        if not missing(END_DT) and END_DT<START_DT then _bad=1;
        PERIMETER_VERSION=symget('perimeter_version');
        LOAD_ID="&_load_id"; LOADED_AT=&_loaded_at;
        format START_DT END_DT yymmdd10. LOADED_AT datetime20.;
        if _bad then output work.perimeter_rel_rejected;
        else output work.perimeter_rel_valid;
        keep ACC_PROBE_ID CUST_PROBE_ID START_DT END_DT
             PERIMETER_VERSION LOAD_ID LOADED_AT _numeric_text_id;
    run;
    %if &syserr>4 %then %goto finish;
    libname perbook clear;
    %let _book_open=0;
    proc sql noprint;
        select count(*) into :_bad_rel trimmed from work.perimeter_rel_rejected;
        select count(*),coalesce(sum(_numeric_text_id),0) into :_rel_rows trimmed,:_numeric_rel trimmed
        from work.perimeter_rel_valid;
    quit;
    %if &sqlrc ne 0 %then %goto finish;
    %put NOTE: Relationship input valid=&_rel_rows rejected=&_bad_rel numeric-ID rows=&_numeric_rel.;
    %if &_bad_rel>0 or &_rel_rows=0 %then %do;
        %put ERROR: Invalid or empty relationships. Inspect rejection rows privately. Nothing loaded.;
        %goto finish;
    %end;
    proc sort data=work.perimeter_rel_valid(drop=_numeric_text_id)
              out=work.perimeter_relationships nodupkey;
        by ACC_PROBE_ID CUST_PROBE_ID START_DT END_DT;
    run;
    %if &syserr>4 %then %goto finish;
    proc sql noprint;
        select count(*) into :_rel_clean trimmed from work.perimeter_relationships;
    quit;
    %if &sqlrc ne 0 %then %goto finish;
    %if &_rel_clean ne &expected_relationship_rows %then %do;
        %put ERROR: Deduplicated relationship count differs from expected_relationship_rows.;
        %put ERROR: Validated=&_rel_clean expected=&expected_relationship_rows.; %goto finish;
    %end;
    %put NOTE: RELATIONSHIP_INPUT_VALIDATED rows=&_rel_clean load_id=&_load_id.;
    libname perdb teradata server="&td_server" authdomain="&td_authdomain"
        schema="&perimeter_database" mode=teradata;
    %if &syslibrc ne 0 %then %goto finish;
    %let _db_open=1;
    %if %sysfunc(exist(perdb.&relationship_table)) or %sysfunc(exist(perdb.&relationship_table,VIEW)) %then %do;
        %put ERROR: Relationship target already exists. No overwrite or append is allowed.;
        %goto finish;
    %end;
    %put NOTE: RELATIONSHIP_DATABASE_LOAD_START method=&load_method rows=&_rel_clean.;
    data perdb.&relationship_table
        (&_write_options
         dbtype=(ACC_PROBE_ID='VARCHAR(128)' CUST_PROBE_ID='VARCHAR(128)'
                 START_DT='DATE' END_DT='DATE' PERIMETER_VERSION='VARCHAR(64)'
                 LOAD_ID='VARCHAR(36)' LOADED_AT='TIMESTAMP(0)'));
        set work.perimeter_relationships;
    run;
    %if &syserr>4 %then %goto finish;
    %put NOTE: RELATIONSHIP_DATABASE_LOAD_RETURNED. Checking saved values.;
    proc sql noprint;
        connect to teradata as percheck
          (server="&td_server" authdomain="&td_authdomain"
           database="&perimeter_database" mode=teradata);
        %if &sqlrc ne 0 %then %do; quit; %goto finish; %end;
        create table work.relationship_database_check as
        select * from connection to percheck
        (select A.*,K.KEY_N
         from
           (select cast(count(*) as float) as ROW_N,
                   cast(coalesce(sum(case when ACC_PROBE_ID is null or trim(ACC_PROBE_ID)=''
                        or CUST_PROBE_ID is null or trim(CUST_PROBE_ID)=''
                        then 1 else 0 end),0) as float) as MISSING_N,
                   cast(coalesce(sum(case when START_DT is null
                        or (END_DT is not null and END_DT<START_DT)
                        then 1 else 0 end),0) as float) as BAD_DATE_N,
                   cast(coalesce(sum(case when LOAD_ID is null or LOAD_ID<>'&_load_id'
                        then 1 else 0 end),0) as float) as WRONG_LOAD_N
            from &perimeter_database..&relationship_table) A
         cross join
           (select cast(count(*) as float) as KEY_N from
             (select distinct ACC_PROBE_ID,CUST_PROBE_ID,START_DT,END_DT
              from &perimeter_database..&relationship_table) D) K);
        %let _check_rc=&sqlrc;
        %let _check_xrc=&sqlxrc;
        disconnect from percheck;
    quit;
    %if &_check_rc ne 0 or &_check_xrc ne 0 %then %goto finish;
    %let _reconcile_ok=0;
    data work.relationship_database_check;
        set work.relationship_database_check;
        EXPECTED_ROWS=&_rel_clean;
        RECONCILED=(nmiss(ROW_N,KEY_N,MISSING_N,BAD_DATE_N,WRONG_LOAD_N)=0
                    and ROW_N=EXPECTED_ROWS and KEY_N=EXPECTED_ROWS
                    and MISSING_N=0 and BAD_DATE_N=0 and WRONG_LOAD_N=0);
        format ROW_N KEY_N MISSING_N BAD_DATE_N WRONG_LOAD_N EXPECTED_ROWS 20.;
        call symputx('_reconcile_ok',RECONCILED,'L');
    run;
    %if &syserr>4 %then %goto finish;
    /* Numeric DATA-step comparison avoids formatted macro-string comparisons.
       Always print diagnostic counts; no account or customer IDs are printed. */
    proc print data=work.relationship_database_check noobs; run;
    %if &_reconcile_ok ne 1 %then %do;
        %put ERROR: Relationship reconciliation failed. Inspect the printed diagnostic counts.;
        %put ERROR: Do not drop/reload solely on this message. Verify the saved data first.;
        %goto finish;
    %end;
    data work.relationship_perimeter_summary;
        length STATUS $8 DATABASE RELATIONSHIP_TABLE $30 PERIMETER_VERSION $64 LOAD_ID $36 METHOD $12;
        STATUS='READY'; DATABASE="&perimeter_database"; RELATIONSHIP_TABLE="&relationship_table";
        PERIMETER_VERSION=symget('perimeter_version'); LOAD_ID="&_load_id"; METHOD="&load_method";
        INPUT_ROWS=&_rel_rows; DUPLICATES_REMOVED=&_rel_rows-&_rel_clean;
        LOADED_ROWS=&_rel_clean; LOADED_AT=&_loaded_at; format LOADED_AT datetime20.;
    run;
    %if &syserr>4 %then %goto finish;
    %let relationship_perimeter_status=READY;
    proc print data=work.relationship_perimeter_summary noobs; run;
%finish:
    %if &_book_open %then %do; libname perbook clear; %end;
    %if &_db_open %then %do; libname perdb clear; %end;
    %put NOTE: RELATIONSHIP_PERIMETER_STATUS=&relationship_perimeter_status.;
    %if &relationship_perimeter_status ne READY %then %do;
        proc datasets library=work nolist; delete relationship_perimeter_summary; quit;
        %put ERROR: Not READY. Retain the log and diagnostic counts. Do not start another loader.;
    %end;
%mend;
%import_relationships_fast;

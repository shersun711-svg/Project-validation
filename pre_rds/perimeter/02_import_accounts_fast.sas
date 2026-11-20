/* Account-only CDAO perimeter import using SAS/ACCESS Teradata FastLoad.
   No relationship sheet is read or loaded. No tables are dropped by this SAS
   program. First stop the old loader and run the separate cleanup SQL.
   Run this WHOLE program in a fresh SAS EG session. */
%let perimeter_workbook = ; /* XLSX path visible to the SAS SERVER. */
%let perimeter_version = ; /* e.g. CDAO_20261120. */
%let td_server = dwhprod;
%let td_authdomain = TeraAuth;
%let perimeter_database = LAB_T_ORION_MVT;
%let account_table = PRE_RDS_ACCOUNT_PERIMETER;
%let account_sheet = ; /* Blank discovers the sheet with AGMT_ID and ACC_ID. */
%let expected_account_rows = 293619; /* This supplied list after deduplication. */
%let allow_numeric_text_ids = N; /* Y only if numeric ACC_ID has no lost zeros. */
/* FASTLOAD is the normal mode. MULTISTMT is an explicit alternative if your
   SAS/Teradata setup cannot use FastLoad. Never run both concurrently. */
%let load_method = FASTLOAD;

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

%macro import_accounts_fast;
    %local _i _name _ac_n _ac_sheet _settings_ok _book_open _db_open
           _load_id _loaded_at _bad_ac _ac_rows _numeric_ac _ac_clean
           _check_rc _check_xrc _reconcile_ok _conflicts _db_rows _db_keys _db_missing _db_wrong_load _write_options;
    %global account_perimeter_status;
    %let account_perimeter_status=FAILED;
    %let _book_open=0;
    %let _db_open=0;
    proc datasets library=work nolist;
        delete account_perimeter_summary account_database_check;
    quit;
    %do _i=1 %to 2;
        %let _name=%scan(perimeter_database account_table,&_i);
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
    %if %sysfunc(prxmatch(%str(/^[1-9][0-9]*$/),%superq(expected_account_rows)))=0 %then %do;
        %put ERROR: expected_account_rows must be a positive whole number.; %goto finish;
    %end;
    %if &allow_numeric_text_ids ne N and &allow_numeric_text_ids ne Y %then %do;
        %put ERROR: allow_numeric_text_ids must be N or Y.; %goto finish;
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
        create table work.account_sheet_candidates as
        select memname from dictionary.columns
        where libname='PERBOOK' and upcase(name) in ('AGMT_ID','ACC_ID')
        group by memname having count(*)=2;
        select count(*),max(nliteral(strip(memname))) into :_ac_n trimmed,:_ac_sheet trimmed
        from work.account_sheet_candidates
        where symget('account_sheet')='' or upcase(memname)=upcase(symget('account_sheet'));
    quit;
    %if &sqlrc ne 0 %then %goto finish;
    %if &_ac_n ne 1 %then %do;
        %put ERROR: Expected one account sheet with AGMT_ID and ACC_ID headers.;
        %put ERROR: Set account_sheet to its exact name if multiple sheets match.;
        %goto finish;
    %end;
    %let _load_id=%sysfunc(uuidgen());
    %let _loaded_at=%sysfunc(datetime());
    data work.perimeter_accounts_valid work.perimeter_accounts_rejected;
        length AGMT_ID 8 ACC_ID $128 PERIMETER_VERSION $64 LOAD_ID $36
               LOADED_AT 8 _agmt_text $32767;
        set perbook.&_ac_sheet(rename=(AGMT_ID=_in_agmt ACC_ID=_in_acc));
        _bad=0; _numeric_text_id=0;
        /* AGMT_ID is INTEGER in the supplied RDS DDL. Match that type;
           forcing BIGINT caused a SAS/ACCESS datatype mismatch on write. */
        if vtype(_in_agmt)='C' then _agmt_text=strip(_in_agmt);
        else _agmt_text=strip(putn(_in_agmt,'best32.'));
        AGMT_ID=input(_agmt_text,?? best32.);
        if prxmatch('/^[0-9]+$/',strip(_agmt_text))=0 or missing(AGMT_ID)
           or AGMT_ID>2147483647 then _bad=1;
        %perimeter_text_id(raw=_in_acc,out=ACC_ID);
        PERIMETER_VERSION=symget('perimeter_version');
        LOAD_ID="&_load_id"; LOADED_AT=&_loaded_at;
        format LOADED_AT datetime20.;
        if _bad then output work.perimeter_accounts_rejected;
        else output work.perimeter_accounts_valid;
        keep AGMT_ID ACC_ID PERIMETER_VERSION LOAD_ID LOADED_AT _numeric_text_id;
    run;
    %if &syserr>4 %then %goto finish;
    libname perbook clear;
    %let _book_open=0;
    proc sql noprint;
        select count(*) into :_bad_ac trimmed from work.perimeter_accounts_rejected;
        select count(*),coalesce(sum(_numeric_text_id),0) into :_ac_rows trimmed,:_numeric_ac trimmed
        from work.perimeter_accounts_valid;
    quit;
    %if &sqlrc ne 0 %then %goto finish;
    %put NOTE: Account input valid=&_ac_rows rejected=&_bad_ac numeric-ID rows=&_numeric_ac.;
    %if &_bad_ac>0 or &_ac_rows=0 %then %do;
        %put ERROR: Invalid or empty account list. Inspect rejection rows privately. Nothing loaded.;
        %goto finish;
    %end;
    proc sort data=work.perimeter_accounts_valid(drop=_numeric_text_id)
              out=work.perimeter_accounts nodupkey;
        by AGMT_ID ACC_ID;
    run;
    %if &syserr>4 %then %goto finish;
    proc sql noprint;
        select count(*) into :_ac_clean trimmed from work.perimeter_accounts;
        select count(*) into :_conflicts trimmed from
          (select AGMT_ID from work.perimeter_accounts
           group by AGMT_ID having count(*)>1) as conflicts;
    quit;
    %if &sqlrc ne 0 %then %goto finish;
    %if &_conflicts>0 or &_ac_clean ne &expected_account_rows %then %do;
        %put ERROR: Account keys conflict or deduplicated count differs from expected_account_rows.;
        %put ERROR: Validated rows=&_ac_clean expected=&expected_account_rows conflicts=&_conflicts.;
        %goto finish;
    %end;
    %put NOTE: ACCOUNT_INPUT_VALIDATED rows=&_ac_clean load_id=&_load_id.;
    libname perdb teradata server="&td_server" authdomain="&td_authdomain"
        schema="&perimeter_database" mode=teradata;
    %if &syslibrc ne 0 %then %goto finish;
    %let _db_open=1;
    %if %sysfunc(exist(perdb.&account_table)) or %sysfunc(exist(perdb.&account_table,VIEW)) %then %do;
        %put ERROR: Target exists. This program will not replace or append to it.;
        %put ERROR: Stop the old loader before using the separate cleanup SQL.;
        %goto finish;
    %end;
    %put NOTE: ACCOUNT_DATABASE_LOAD_START method=&load_method rows=&_ac_clean.;
    %put NOTE: Do not start another loader or drop the target while this request is active.;
    data perdb.&account_table
        (&_write_options
         dbtype=(AGMT_ID='INTEGER' ACC_ID='VARCHAR(128)' PERIMETER_VERSION='VARCHAR(64)'
                 LOAD_ID='VARCHAR(36)' LOADED_AT='TIMESTAMP(0)'));
        set work.perimeter_accounts;
    run;
    %if &syserr>4 %then %goto finish;
    %put NOTE: ACCOUNT_DATABASE_LOAD_RETURNED. Checking saved counts and key integrity.;
    /* Numeric counts/metadata only are fetched, not the account list. */
    proc sql noprint;
        connect to teradata as percheck
          (server="&td_server" authdomain="&td_authdomain"
           database="&perimeter_database" mode=teradata);
        %if &sqlrc ne 0 %then %do;
            quit;
            %goto finish;
        %end;
        create table work.account_database_check as
        select * from connection to percheck
        (select cast(count(*) as float) as ROW_N,
                cast(count(distinct AGMT_ID) as float) as KEY_N,
                cast(coalesce(sum(case when AGMT_ID is null or ACC_ID is null
                             or trim(ACC_ID)='' then 1 else 0 end),0) as float) as MISSING_N,
                cast(coalesce(sum(case when LOAD_ID is null or LOAD_ID<>'&_load_id'
                             then 1 else 0 end),0) as float) as WRONG_LOAD_N
         from &perimeter_database..&account_table);
        %let _check_rc=&sqlrc;
        %let _check_xrc=&sqlxrc;
        disconnect from percheck;
    quit;
    %if &_check_rc ne 0 or &_check_xrc ne 0 %then %goto finish;
    %let _reconcile_ok=0;
    data work.account_database_check;
        set work.account_database_check;
        EXPECTED_ROWS=&_ac_clean;
        RECONCILED=(nmiss(ROW_N,KEY_N,MISSING_N,WRONG_LOAD_N)=0
                    and ROW_N=EXPECTED_ROWS and KEY_N=EXPECTED_ROWS
                    and MISSING_N=0 and WRONG_LOAD_N=0);
        format ROW_N KEY_N MISSING_N WRONG_LOAD_N EXPECTED_ROWS 20.;
        call symputx('_reconcile_ok',RECONCILED,'L');
        call symputx('_db_rows',strip(put(ROW_N,32.)),'L');
        call symputx('_db_keys',strip(put(KEY_N,32.)),'L');
    run;
    %if &syserr>4 %then %goto finish;
    proc print data=work.account_database_check noobs; run;
    %if &_reconcile_ok ne 1 %then %do;
        %put ERROR: Reconciliation failed; inspect the printed diagnostic counts.;
        %put ERROR: Verify the target before considering any reload or deletion.;
        %goto finish;
    %end;
    data work.account_perimeter_summary;
        length STATUS $8 DATABASE ACCOUNT_TABLE $30 PERIMETER_VERSION $64 LOAD_ID $36 METHOD $12;
        STATUS='READY'; DATABASE="&perimeter_database"; ACCOUNT_TABLE="&account_table";
        PERIMETER_VERSION=symget('perimeter_version'); LOAD_ID="&_load_id"; METHOD="&load_method";
        INPUT_ROWS=&_ac_rows; DUPLICATES_REMOVED=&_ac_rows-&_ac_clean;
        EXPECTED_ROWS=&expected_account_rows; LOADED_ROWS=&_db_rows; DISTINCT_AGREEMENTS=&_db_keys;
        LOADED_AT=&_loaded_at; format LOADED_AT datetime20.;
    run;
    %if &syserr>4 %then %goto finish;
    %let account_perimeter_status=READY;
    proc print data=work.account_perimeter_summary noobs; run;
%finish:
    %if &_book_open %then %do; libname perbook clear; %end;
    %if &_db_open %then %do; libname perdb clear; %end;
    %put NOTE: ACCOUNT_PERIMETER_STATUS=&account_perimeter_status.;
    %if &account_perimeter_status ne READY %then %do;
        proc datasets library=work nolist; delete account_perimeter_summary account_database_check; quit;
        %put ERROR: Not READY. Do not use the target or automatically rerun the loader.;
        %put ERROR: For FastLoad errors, retain the log and ask the DBA to inspect utility locks/error tables.;
    %end;
%mend;
%import_accounts_fast;

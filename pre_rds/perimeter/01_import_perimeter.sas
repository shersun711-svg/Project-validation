/* Import CDAO's two-sheet perimeter workbook. SAS 9.4 + XLSX + Teradata.
   Standalone: no profiling-controller macros or engine installation required.
   Edit settings, then run the WHOLE program in SAS Enterprise Guide.
   Destination tables must be NEW. No existing table is overwritten/deleted.
   READY means both tables loaded and database counts reconciled. */
%let perimeter_workbook = ; /* Absolute XLSX path visible to the SAS SERVER. */
%let td_server = dwhprod;
%let td_authdomain = TeraAuth;
%let perimeter_database = LAB_T_ORION_MVT;
%let account_table = PRE_RDS_ACCOUNT_PERIMETER;
%let relationship_table = PRE_RDS_ACCOUNT_CUSTOMER_REL;
%let perimeter_version = ; /* Required label, e.g. CDAO_20261120. */
/* Blank sheet settings auto-detect by required headers. Specify exact sheet
   names if more than one sheet matches. Do not include quotes here. */
%let account_sheet = ;
%let relationship_sheet = ;
/* Keep N to require ACC_ID/PROBE IDs stored as Excel TEXT. Set Y only after
   confirming numeric IDs have no significant leading zeros and <=15 digits.
   Excel cannot recover digits already rounded in numeric cells. */
%let allow_numeric_text_ids = N;
/* Text dates must be ISO YYYY-MM-DD by default. Change explicitly to e.g.
   DDMMYY10. for a confirmed alternative; do not guess ambiguous dates. */
%let text_date_informat = yymmdd10.;

/* A prior failed DATA step may leave OBS=0/SYNTAXCHECK in this EG session. */
options obs=max nosyntaxcheck;
options validvarname=v7 validmemname=extend nomprint nomlogic nosymbolgen;

/* Called inside DATA steps. _bad is a flag; no IDs are printed to the log. */
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

%macro import_perimeter;
    %local _i _name _ac_sheet _rel_sheet _ac_n _rel_n _bad_ac _bad_rel
           _ac_rows _rel_rows _ac_clean _rel_clean _conflicts _mapped
           _load_id _loaded_at _db_ac _db_rel _rc _book_open _db_open
           _numeric_ac _numeric_rel _version_length _settings_ok;
    %global perimeter_import_status;
    %let perimeter_import_status=FAILED;
    %let _book_open=0;
    %let _db_open=0;
    /* Safe SAS/Teradata identifiers only; target names fit SAS member limits. */
    %do _i=1 %to 3;
        %let _name=%scan(perimeter_database account_table relationship_table,&_i);
        %if %sysfunc(prxmatch(%str(/^[A-Za-z_][A-Za-z0-9_]{0,29}$/),%superq(&_name)))=0 %then %do;
            %put ERROR: &_name must be a simple identifier of at most 30 characters.;
            %goto finish;
        %end;
    %end;
    %if %upcase(&account_table)=%upcase(&relationship_table) %then %do;
        %put ERROR: Account and relationship target tables must be different.;
        %goto finish;
    %end;
    %if %length(%superq(perimeter_workbook))=0
        or %length(%superq(perimeter_version))=0 %then %do;
        %put ERROR: Set perimeter_workbook and perimeter_version first.; %goto finish;
    %end;
    %let _settings_ok=0;
    data _null_;
        length value $32767;
        value=symget('perimeter_version');
        if lengthn(value)<=64 and
           prxmatch('/^[A-Za-z0-9_.-]+$/',strip(value)) then
            call symputx('_settings_ok',1,'L');
    run;
    %if &_settings_ok ne 1 %then %do;
        %put ERROR: Version must be 1-64 letters, digits, underscores, dots or hyphens.;
        %goto finish;
    %end;
    %if &allow_numeric_text_ids ne N and &allow_numeric_text_ids ne Y %then %do;
        %put ERROR: allow_numeric_text_ids must be N or Y.; %goto finish;
    %end;
    %if %sysfunc(prxmatch(%str(/^[A-Za-z][A-Za-z0-9]*[.]$/),%superq(text_date_informat)))=0 %then %do;
        %put ERROR: Specify a SAS date informat such as yymmdd10.; %goto finish;
    %end;
    libname perbook xlsx "%superq(perimeter_workbook)" access=readonly;
    %if &syslibrc ne 0 %then %goto finish;
    %let _book_open=1;
    /* Header-based discovery avoids assuming the second worksheet's name. */
    proc sql noprint;
        create table work.perimeter_sheet_candidates as
        select memname,
          sum(upcase(name) in ('AGMT_ID','ACC_ID')) as account_headers,
          sum(upcase(name) in ('ACC_PROBE_ID','CUST_PROBE_ID','START_DT','END_DT')) as rel_headers
        from dictionary.columns where libname='PERBOOK'
        group by memname;
        select count(*),max(nliteral(strip(memname))) into :_ac_n trimmed,:_ac_sheet trimmed
        from work.perimeter_sheet_candidates
        where account_headers=2 and
          (symget('account_sheet')='' or upcase(memname)=upcase(symget('account_sheet')));
        select count(*),max(nliteral(strip(memname))) into :_rel_n trimmed,:_rel_sheet trimmed
        from work.perimeter_sheet_candidates
        where rel_headers=4 and
          (symget('relationship_sheet')='' or upcase(memname)=upcase(symget('relationship_sheet')));
    quit;
    %if &sqlrc ne 0 %then %goto finish;
    %if &_ac_n ne 1 or &_rel_n ne 1 %then %do;
        %put ERROR: Expected one account sheet and one relationship sheet with the required headers.;
        %put ERROR: Check the workbook or specify the exact worksheet names in settings.;
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
    proc sql noprint;
        select count(*) into :_bad_ac trimmed from work.perimeter_accounts_rejected;
        select count(*) into :_bad_rel trimmed from work.perimeter_rel_rejected;
        select count(*),coalesce(sum(_numeric_text_id),0)
          into :_ac_rows trimmed,:_numeric_ac trimmed from work.perimeter_accounts_valid;
        select count(*),coalesce(sum(_numeric_text_id),0)
          into :_rel_rows trimmed,:_numeric_rel trimmed from work.perimeter_rel_valid;
    quit;
    %if &sqlrc ne 0 %then %goto finish;
    %put NOTE: Account valid=&_ac_rows rejected=&_bad_ac numeric-text-ID rows=&_numeric_ac.;
    %put NOTE: Relationship valid=&_rel_rows rejected=&_bad_rel numeric-text-ID rows=&_numeric_rel.;
    %if &_bad_ac>0 or &_bad_rel>0 or &_ac_rows=0 or &_rel_rows=0 %then %do;
        %put ERROR: Invalid or empty input. Inspect WORK rejection datasets privately. Nothing loaded.;
        %goto finish;
    %end;
    /* Drop exact duplicates only; preserve legitimate multi-customer relations. */
    proc sort data=work.perimeter_accounts_valid(drop=_numeric_text_id)
              out=work.perimeter_accounts nodupkey;
        by AGMT_ID ACC_ID;
    run;
    %if &syserr>4 %then %goto finish;
    proc sort data=work.perimeter_rel_valid(drop=_numeric_text_id)
              out=work.perimeter_relationships nodupkey;
        by ACC_PROBE_ID CUST_PROBE_ID START_DT END_DT;
    run;
    %if &syserr>4 %then %goto finish;
    proc sql noprint;
        select count(*) into :_ac_clean trimmed from work.perimeter_accounts;
        select count(*) into :_rel_clean trimmed from work.perimeter_relationships;
        select count(*) into :_conflicts trimmed from
          (select AGMT_ID from work.perimeter_accounts
           group by AGMT_ID having count(*)>1) as conflicts;
    quit;
    %if &sqlrc ne 0 %then %goto finish;
    %if &_conflicts>0 %then %do;
        %put ERROR: Multiple ACC_ID values for the same AGMT_ID. Confirm mapping before importing.;
        %goto finish;
    %end;
    libname perdb teradata server="&td_server" authdomain="&td_authdomain"
        schema="&perimeter_database" mode=teradata;
    %if &syslibrc ne 0 %then %goto finish;
    %let _db_open=1;
    %if %sysfunc(exist(perdb.&account_table)) or %sysfunc(exist(perdb.&relationship_table))
        or %sysfunc(exist(perdb.&account_table,VIEW))
        or %sysfunc(exist(perdb.&relationship_table,VIEW)) %then %do;
        %put ERROR: A destination already exists. Choose NEW table names; no overwrite is permitted.;
        %goto finish;
    %end;
    /* One writer must own these new names. Stop other imports using them.
       Two table writes are NOT atomic. On failure do not use either table;
       reconcile any partial load and choose new names for a subsequent import. */
    data perdb.&account_table
        (dbtype=(AGMT_ID='INTEGER' ACC_ID='VARCHAR(128)' PERIMETER_VERSION='VARCHAR(64)'
                 LOAD_ID='VARCHAR(36)' LOADED_AT='TIMESTAMP(0)'));
        set work.perimeter_accounts;
    run;
    %if &syserr>4 %then %goto finish;
    data perdb.&relationship_table
        (dbtype=(ACC_PROBE_ID='VARCHAR(128)' CUST_PROBE_ID='VARCHAR(128)'
                 START_DT='DATE' END_DT='DATE' PERIMETER_VERSION='VARCHAR(64)'
                 LOAD_ID='VARCHAR(36)' LOADED_AT='TIMESTAMP(0)'));
        set work.perimeter_relationships;
    run;
    %if &syserr>4 %then %goto finish;
    proc sql noprint;
        select count(*) into :_db_ac trimmed from perdb.&account_table;
        select count(*) into :_db_rel trimmed from perdb.&relationship_table;
    quit;
    %if &sqlrc ne 0 %then %goto finish;
    %if &_db_ac ne &_ac_clean or &_db_rel ne &_rel_clean %then %do;
        %put ERROR: Database row counts do not reconcile. Do not use these tables.; %goto finish;
    %end;
    data work.perimeter_import_summary;
        length STATUS $8 DATABASE ACCOUNT_TABLE RELATIONSHIP_TABLE $30
               PERIMETER_VERSION $64 LOAD_ID $36;
        STATUS='READY'; DATABASE="&perimeter_database";
        ACCOUNT_TABLE="&account_table"; RELATIONSHIP_TABLE="&relationship_table";
        PERIMETER_VERSION=symget('perimeter_version'); LOAD_ID="&_load_id";
        ACCOUNT_INPUT_ROWS=&_ac_rows; ACCOUNT_LOADED_ROWS=&_db_ac;
        ACCOUNT_DUPLICATES_REMOVED=&_ac_rows-&_ac_clean;
        REL_INPUT_ROWS=&_rel_rows; REL_LOADED_ROWS=&_db_rel;
        REL_DUPLICATES_REMOVED=&_rel_rows-&_rel_clean;
        LOADED_AT=&_loaded_at; format LOADED_AT datetime20.;
    run;
    %if &syserr>4 %then %goto finish;
    %let perimeter_import_status=READY;
    proc print data=work.perimeter_import_summary noobs; run;
%finish:
    %if &_book_open %then %do; libname perbook clear; %end;
    %if &_db_open %then %do; libname perdb clear; %end;
    %put NOTE: PERIMETER_IMPORT_STATUS=&perimeter_import_status.;
    %if &perimeter_import_status ne READY %then %do;
        /* Prevent a previous successful summary from being mistaken for this run. */
        proc datasets library=work nolist; delete perimeter_import_summary; quit;
        %put ERROR: Import not READY. Do not use partial database tables or old WORK output.;
    %end;
%mend;
%import_perimeter;

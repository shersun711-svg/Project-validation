/* Direct Excel -> Teradata configuration loader. No SAS validation/approval
   phase: the user edits the approved workbook, then runs this loader.
   Project, Fields, Settings and optional SpecialValues are small configuration.
   The database merges the three tables in one transaction; no profiling runs.
   Requires 01_dq_controller.sas connection macros in the same SAS session. */
%macro load_dq_config(config_workbook=);
    %local _rc _load_id _status _load_sql _has_special _settings_dsid _close_rc
        _has_overall _has_monthly _has_yearly;
    %global dq_config_status dq_config_load_id;
    %let dq_config_status=FAILED;
    %let dq_config_load_id=;
    proc datasets library=work nolist;
        delete dq_config_load_status;
    quit;
    %if not %sysmacexist(dq_connect) or not %sysmacexist(dq_validate_context)
        or not %sysmacexist(dq_check_sql) %then %do;
        %put ERROR: Open/run 01_dq_controller.sas first.; %return;
    %end;
    /* This checks connection settings, not workbook contents. */
    %dq_validate_context;
    %if &dq_context_ok ne 1 %then %return;
    %if %length(%superq(config_workbook))=0 %then %do;
        %put ERROR: A workbook path visible to the SAS SERVER is required.; %return;
    %end;
    libname dqbook xlsx "%superq(config_workbook)" access=readonly;
    %if &syslibrc ne 0 %then %do;
        %put ERROR: Cannot open workbook. Check server path and XLSX engine availability.; %return;
    %end;
    %let _load_id=%sysfunc(uuidgen());
    %let _load_sql=%sysfunc(quote(%superq(_load_id),%str(%')));
    %let dq_config_load_id=&_load_id;
    data work.dq_stage_project;
        set dqbook.Project(rename=(PROJECT_ID=_in_project SOURCE_DATABASE=_in_db
            SOURCE_TABLE=_in_table REPORTING_DATE_FIELD=_in_date
            ACCOUNT_ID_FIELD=_in_account ACTIVE_IND=_in_active));
        length load_id $36 project_id $30 source_database source_table reporting_date_field
            account_id_field $128 active_ind $1;
        load_id="&_load_id";
        project_id=strip(vvaluex('_in_project'));
        source_database=strip(vvaluex('_in_db'));
        source_table=strip(vvaluex('_in_table'));
        reporting_date_field=strip(vvaluex('_in_date'));
        account_id_field=strip(vvaluex('_in_account'));
        if account_id_field='.' then account_id_field=''; /* Empty optional Excel cell. */
        active_ind=upcase(strip(vvaluex('_in_active')));
        keep load_id project_id source_database source_table reporting_date_field account_id_field active_ind;
    run;
    %let _rc=&syserr;
    %if &_rc>4 %then %goto read_failed;
    /* Attach the single Project row's ID without interpolating Excel values
       into SQL or macro source. The apply procedure checks cardinality. */
    data work.dq_stage_fields;
        if _n_=1 then set work.dq_stage_project(keep=project_id);
        set dqbook.Fields(rename=(FIELD_NAME=_in_name FIELD_TYPE=_in_type
            ACTIVE_IND=_in_active));
        length load_id $36 field_name $128 field_type $16 active_ind $1;
        load_id="&_load_id";
        field_name=strip(vvaluex('_in_name'));
        field_type=upcase(strip(vvaluex('_in_type')));
        active_ind=upcase(strip(vvaluex('_in_active')));
        keep load_id project_id field_name field_type active_ind;
    run;
    %let _rc=&syserr;
    %if &_rc>4 %then %goto read_failed;
    %let _settings_dsid=%sysfunc(open(dqbook.Settings,i));
    %if &_settings_dsid=0 %then %goto read_failed;
    %let _has_overall=%sysfunc(varnum(&_settings_dsid,PROFILE_OVERALL));
    %let _has_monthly=%sysfunc(varnum(&_settings_dsid,PROFILE_MONTHLY));
    %let _has_yearly=%sysfunc(varnum(&_settings_dsid,PROFILE_YEARLY));
    %let _close_rc=%sysfunc(close(&_settings_dsid));
    /* Read optional level columns through VVALUEX before assigning new names.
       SAS only transports values; Teradata constraints/apply perform checks. */
    data work.dq_stage_settings;
        if _n_=1 then set work.dq_stage_project(keep=project_id);
        set dqbook.Settings(rename=(GREEN_THRESHOLD=_in_green RED_THRESHOLD=_in_red
            SQL_BATCH_SIZE=_in_batch OUTLIER_SD_MULTIPLIER=_in_sd));
        length load_id $36 _level_overall _level_monthly _level_yearly $128;
        %if &_has_overall>0 %then %do;
            _level_overall=upcase(strip(vvaluex('PROFILE_OVERALL')));
        %end;
        %else %do;
            _level_overall='Y';
        %end;
        %if &_has_monthly>0 %then %do;
            _level_monthly=upcase(strip(vvaluex('PROFILE_MONTHLY')));
        %end;
        %else %do;
            _level_monthly='Y';
        %end;
        %if &_has_yearly>0 %then %do;
            _level_yearly=upcase(strip(vvaluex('PROFILE_YEARLY')));
        %end;
        %else %do;
            _level_yearly='N';
        %end;
        load_id="&_load_id";
        green_threshold=input(strip(vvaluex('_in_green')),best32.);
        red_threshold=input(strip(vvaluex('_in_red')),best32.);
        sql_batch_size=input(strip(vvaluex('_in_batch')),best32.);
        outlier_sd_multiplier=input(strip(vvaluex('_in_sd')),best32.);
        keep load_id project_id green_threshold red_threshold sql_batch_size outlier_sd_multiplier
            _level_overall _level_monthly _level_yearly;
    run;
    %let _rc=&syserr;
    %if &_rc>4 %then %goto read_failed;
    data work.dq_stage_settings;
        set work.dq_stage_settings;
        length profile_overall profile_monthly profile_yearly $1;
        /* Default blank/absent columns; invalid values become '?' for rejection. */
        if missing(_level_overall) or _level_overall='.' then profile_overall='Y';
        else if _level_overall in ('Y','N') then profile_overall=_level_overall;
        else profile_overall='?';
        if missing(_level_monthly) or _level_monthly='.' then profile_monthly='Y';
        else if _level_monthly in ('Y','N') then profile_monthly=_level_monthly;
        else profile_monthly='?';
        if missing(_level_yearly) or _level_yearly='.' then profile_yearly='N';
        else if _level_yearly in ('Y','N') then profile_yearly=_level_yearly;
        else profile_yearly='?';
        drop _level_overall _level_monthly _level_yearly;
    run;
    %let _rc=&syserr;
    %if &_rc>4 %then %goto read_failed;
    %let _has_special=%sysfunc(exist(dqbook.SpecialValues));
    %if &_has_special %then %do;
        data work.dq_stage_special_marker;
            set work.dq_stage_project(keep=load_id project_id);
        run;
        data work.dq_stage_special;
            if _n_=1 then set work.dq_stage_project(keep=project_id);
            set dqbook.SpecialValues(rename=(FIELD_TYPE=_in_type
                SPECIAL_VALUE=_in_special ACTIVE_IND=_in_active));
            length load_id $36 field_type $16 special_value $128 active_ind $1;
            load_id="&_load_id";
            field_type=upcase(strip(vvaluex('_in_type')));
            special_value=strip(vvaluex('_in_special'));
            active_ind=upcase(strip(vvaluex('_in_active')));
            keep load_id project_id field_type special_value active_ind;
        run;
        %let _rc=&syserr;
        %if &_rc>4 %then %goto read_failed;
    %end;
    libname dqbook clear;
    libname dqstage teradata server="&td_server" schema="&dq_database"
        authdomain="&td_authdomain" mode=teradata;
    %if &syslibrc ne 0 %then %do;
        %put ERROR: Teradata staging connection failed. Active configuration is unchanged.; %return;
    %end;
    proc append base=dqstage.DQ_PROJECT_CONFIG_XLS_STAGE data=work.dq_stage_project; run;
    %let _rc=&syserr;
    %if &_rc<=4 %then %do;
        proc append base=dqstage.DQ_FIELD_CONFIG_XLS_STAGE data=work.dq_stage_fields; run;
        %let _rc=&syserr;
    %end;
    %if &_rc<=4 %then %do;
        proc append base=dqstage.DQ_SETTINGS_XLS_STAGE data=work.dq_stage_settings; run;
        %let _rc=&syserr;
    %end;
    %if &_rc<=4 and &_has_special %then %do;
        proc append base=dqstage.DQ_SPECIAL_LOAD_STAGE data=work.dq_stage_special_marker; run;
        %let _rc=&syserr;
        %if &_rc<=4 %then %do;
            proc append base=dqstage.DQ_SPECIAL_VALUE_XLS_STAGE data=work.dq_stage_special; run;
            %let _rc=&syserr;
        %end;
    %end;
    libname dqstage clear;
    %if &_rc>4 %then %do;
        %put ERROR: Staging failed. Active configuration was not merged. Inspect staging LOAD_ID=&_load_id.;
        %return;
    %end;
    proc sql;
        %dq_connect;
        %dq_check_sql(dbms=N);
        %let _rc=&dq_sql_failed;
        %if &_rc ne 0 %then %do;
            quit;
            %put ERROR: Apply connection failed. Staged LOAD_ID=&_load_id remains for diagnosis.;
            %return;
        %end;
        /* Only the generated UUID enters SQL; workbook strings stay in tables. */
        execute (call &dq_database..SP_DQ_APPLY_CONFIG(&_load_sql)) by dq;
        %dq_check_sql;
        %let _rc=&dq_sql_failed;
        %if &_rc=0 %then %do;
            create table work.dq_config_load_status as select * from connection to dq
                (select * from &dq_database..DQ_CONFIG_LOAD_LOG where LOAD_ID=&_load_sql);
            %dq_check_sql;
            %let _rc=&dq_sql_failed;
        %end;
        disconnect from dq;
    quit;
    %if &_rc ne 0 %then %do;
        %put ERROR: Apply or status read failed. Inspect the database load log for &_load_id.; %return;
    %end;
    %let _status=;
    proc sql noprint;
        select status into :_status trimmed from work.dq_config_load_status;
    quit;
    %if %length(%superq(_status))=0 %then %do;
        %put ERROR: No load status was returned. Success is unconfirmed.; %return;
    %end;
    %if %superq(_status) ne APPLIED %then %do;
        proc print data=work.dq_config_load_status noobs; run;
        %put ERROR: Configuration was not applied. Profiling has not been started.; %return;
    %end;
    %let dq_config_status=APPLIED;
    proc print data=work.dq_config_load_status noobs; run;
    %put NOTE: Excel configuration loaded to Teradata. LOAD_ID=&_load_id.;
    %return;
%read_failed:
    libname dqbook clear;
    %put ERROR: Workbook read failed. No configuration was merged. Inspect the SAS log.;
%mend;

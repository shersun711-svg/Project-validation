/* Legacy CSV configuration refresh. Normal initial/updated configuration uses
   the three-sheet Excel workbook and 04_load_dq_config.sas.
   Use CSV columns FIELD_NAME,FIELD_TYPE, exported from the approved workbook.
   The checked-in RDS CSV is the exact book2.xlsx mapping, case normalised.
   Requires 01_dq_controller.sas and its connection settings to be included.
   Existing ACTIVE_IND/module overrides are retained; absent rows are retained.
   No implicit reclassification, deactivation or deletion. */
%macro load_dq_field_config(project=RDS,config_csv=);
    %local _load_id _bad _n _distinct _rc _project_count;
    %dq_validate_context;
    %if &dq_context_ok ne 1 %then %return;
    %if %length(%superq(project))=0 or %length(%superq(config_csv))=0 %then %do;
        %put ERROR: Project and config_csv are required.; %return;
    %end;
    %if %sysfunc(prxmatch(%str(/^[A-Za-z_][A-Za-z0-9_]{0,29}$/),%superq(project)))=0 %then %do;
        %put ERROR: Invalid project identifier.; %return;
    %end;
    %let _load_id=%sysfunc(uuidgen());
    data work.dq_config_upload;
        length load_id $36 project_id $30 field_name $128 field_type $16
               _raw_name _raw_type $256;
        infile "&config_csv" dsd dlm=',' firstobs=2 truncover lrecl=1024;
        input _raw_name :$256. _raw_type :$256.;
        load_id="&_load_id"; project_id="&project";
        field_name=strip(_raw_name); field_type=upcase(strip(_raw_type));
        invalid=(lengthn(strip(_raw_name))>128
            or lengthn(strip(_raw_type))>16
            or prxmatch('/^[A-Za-z_][A-Za-z0-9_]*$/',strip(_raw_name))=0
            or field_type not in ('NUMERIC','CATEGORICAL','DATE','IDENTIFIER'));
        keep load_id project_id field_name field_type invalid;
    run;
    %if &syserr > 4 %then %do;
        %put ERROR: Configuration file read failed.; %return;
    %end;
    proc sql noprint;
        select count(*),count(distinct field_name),coalesce(sum(invalid),0)
          into :_n trimmed,:_distinct trimmed,:_bad trimmed
          from work.dq_config_upload;
    quit;
    %if &_n=0 or &_n ne &_distinct or &_bad>0 %then %do;
        %put ERROR: Empty, duplicate or invalid configuration. No upload performed.; %return;
    %end;
    proc sql noprint;
        %dq_connect;
        select N into :_project_count trimmed from connection to dq
            (select count(*) as N from &dq_database..DQ_PROJECT_CONFIG
             where PROJECT_ID='&project');
        %let _rc=&sqlxrc;
        disconnect from dq;
    quit;
    %if &_rc ne 0 or %superq(_project_count) ne 1 %then %do;
        %put ERROR: Create the project configuration before loading fields.; %return;
    %end;
    libname dqload teradata server="&td_server" authdomain="&td_authdomain"
        database="&dq_database" mode=teradata;
    %if &syslibrc ne 0 %then %do;
        %put ERROR: Configuration staging connection failed.; %return;
    %end;
    proc append base=dqload.DQ_FIELD_CONFIG_STAGE
        data=work.dq_config_upload(drop=invalid); run;
    %let _rc=&syserr;
    libname dqload clear;
    %if &_rc>4 %then %do;
        %put ERROR: Staging upload failed. Remove staging rows for LOAD_ID=&_load_id.; %return;
    %end;
    proc sql;
        %dq_connect;
        execute (merge into &dq_database..DQ_FIELD_CONFIG as T
          using (select PROJECT_ID,FIELD_NAME,FIELD_TYPE
                 from &dq_database..DQ_FIELD_CONFIG_STAGE where LOAD_ID='&_load_id') as S
          on T.PROJECT_ID=S.PROJECT_ID and T.FIELD_NAME=S.FIELD_NAME
          when matched then update set FIELD_TYPE=S.FIELD_TYPE
          when not matched then insert
            (PROJECT_ID,FIELD_NAME,FIELD_TYPE,ACTIVE_IND,NUMERIC_BASIC_IND)
          values (S.PROJECT_ID,S.FIELD_NAME,S.FIELD_TYPE,'Y',
                  case when S.FIELD_TYPE='NUMERIC' then 'Y' else 'N' end)) by dq;
        %let _rc=&sqlxrc;
        execute (delete from &dq_database..DQ_FIELD_CONFIG_STAGE
                 where LOAD_ID='&_load_id') by dq;
        disconnect from dq;
    quit;
    %if &_rc ne 0 %then %put ERROR: Configuration merge failed. Inspect the SAS SQL log.;
    %else %put NOTE: Loaded &_n approved field mappings for &project. Review DQ_FIELD_CONFIG before profiling.;
%mend;

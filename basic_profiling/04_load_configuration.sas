/* ======================================== */
/* EXCEL CONFIGURATION SETTINGS             */
/* ======================================== */
/* SERVER path, not the PC Downloads folder. Upload the edited workbook here,
   or change this path to its actual SAS server location. */
%let config_workbook = ; /* Set to the profiling workbook's SAS server path. */
%let engine_root = ; /* Blank in EG when macros are run first. */
%let td_server = dwhprod;
%let td_authdomain = TeraAuth;
%let dq_database = LAB_T_ORION_MVT;

options nomprint nomlogic nosymbolgen;
%macro dq_config_start;
    %if not %sysmacexist(load_dq_config) or not %sysmacexist(dq_connect) %then %do;
        %if %length(%superq(engine_root))=0 %then %do;
            %put ERROR: Open/run 02_load_controller.sas and 03_define_excel_loader.sas first, then rerun this program.;
            %return;
        %end;
        %include "&engine_root/basic_profiling/02_load_controller.sas";
        %include "&engine_root/basic_profiling/03_define_excel_loader.sas";
    %end;
    %if not %sysmacexist(load_dq_config) or not %sysmacexist(dq_connect) %then %do;
        %put ERROR: Configuration loader not loaded. Check server engine_root path.;
        %return;
    %end;
    %load_dq_config(config_workbook=%superq(config_workbook));
%mend;
%dq_config_start;

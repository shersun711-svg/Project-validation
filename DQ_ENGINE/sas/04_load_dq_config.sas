/* ======================================== */
/* EXCEL CONFIGURATION SETTINGS             */
/* ======================================== */
/* SERVER path, not the PC Downloads folder. Upload the edited workbook here,
   or change this path to its actual SAS server location. */
%let config_workbook = /opt/sas/GR_Proj_Model_Risk/Model_Validation/Validations/Validation Robot/Data Quality/Robot_input/DQ_RDS_config.xlsx;
%let engine_root = ; /* Blank in EG when macros are run first. */
%let td_server = dwhprod;
%let td_authdomain = TeraAuth;
%let dq_database = LAB_T_ORION_MVT;

options nomprint nomlogic nosymbolgen;
%macro dq_config_start;
    %if not %sysmacexist(load_dq_config) or not %sysmacexist(dq_connect) %then %do;
        %if %length(%superq(engine_root))=0 %then %do;
            %put ERROR: Open/run 01_dq_controller.sas and 05_dq_excel_config.sas first, then rerun this program.;
            %return;
        %end;
        %include "&engine_root/sas/01_dq_controller.sas";
        %include "&engine_root/sas/05_dq_excel_config.sas";
    %end;
    %if not %sysmacexist(load_dq_config) or not %sysmacexist(dq_connect) %then %do;
        %put ERROR: Configuration loader not loaded. Check server engine_root path.;
        %return;
    %end;
    %load_dq_config(config_workbook=%superq(config_workbook));
%mend;
%dq_config_start;

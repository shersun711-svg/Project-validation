/* Run 01_dq_controller.sas once in this SAS session before this program.
   This reads saved profiling results only. No source scan or Excel reload.
   Supply the SHORT number of an existing successful run for this project. */
%let td_server = dwhprod;
%let td_authdomain = TeraAuth;
%let dq_database = LAB_T_ORION_MVT;
%let project = RDS;
%let comparison_run_number = ; /* Enter your successful run number. */
%let mom = Y;
%let yoy = Y;

options nomprint nomlogic nosymbolgen;
%macro dq_compare_existing;
    %if not %sysmacexist(run_dq_changes) %then %do;
        %put ERROR: Run the current 01_dq_controller.sas first in this session.;
        %return;
    %end;
    %run_dq_changes(project=&project,run_number=&comparison_run_number,
                    mom=&mom,yoy=&yoy);
%mend;
%dq_compare_existing;

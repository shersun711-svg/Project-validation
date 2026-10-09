/* ============================= */
/* DATA QUALITY ENGINE SETTINGS  */
/* ============================= */
/* EG server session: open/run 01_dq_controller.sas first.
   Leave blank for that workflow; set a SAS SERVER path only if uploaded. */
%let engine_root = ;
%let td_server = dwhprod;
%let td_authdomain = TeraAuth;
%let dq_database = LAB_T_ORION_MVT;
%let project = DQ_TEST; /* Change to RDS after the SAS fixture test passes. */

%let numeric_basic = Y;
%let numeric_percentiles = N;
%let numeric_outliers = N;
%let categorical_basic = N;
%let categorical_psi = N;
%let date_basic = N;
%let identifier_basic = N;
%let export_excel = N;
/* Blank creates a UUID. Set only to a FAILED run UUID to replay that run. */
%let retry_run_id = ;

/* ============================= */
/* EXECUTE SELECTED MODULES      */
/* ============================= */
options nomprint nomlogic nosymbolgen; /* Authentication is resolved by SAS. */
/* A local EG program can be submitted to the server. INCLUDE paths must
   be server paths, so skip INCLUDE when the controller is already loaded. */
%macro dq_start;
    %if not %sysmacexist(run_dq_engine) %then %do;
        %if %length(%superq(engine_root))=0 %then %do;
            %put ERROR: Open and run 01_dq_controller.sas in this EG server session first, then rerun this program.;
            %return;
        %end;
        %include "&engine_root/sas/01_dq_controller.sas";
    %end;
    %if not %sysmacexist(run_dq_engine) %then %do;
        %put ERROR: Controller not loaded. Check the SAS server engine_root path and SAS log.;
        %return;
    %end;
%run_dq_engine(
    project=&project,
    numeric_basic=&numeric_basic,
    numeric_percentiles=&numeric_percentiles,
    numeric_outliers=&numeric_outliers,
    categorical_basic=&categorical_basic,
    categorical_psi=&categorical_psi,
    date_basic=&date_basic,
    identifier_basic=&identifier_basic,
    export_excel=&export_excel,
    retry_run_id=&retry_run_id
);

%mend;
%dq_start;

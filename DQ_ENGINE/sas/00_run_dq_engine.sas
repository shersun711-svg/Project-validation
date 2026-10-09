/* ============================= */
/* DATA QUALITY ENGINE SETTINGS  */
/* ============================= */
%let engine_root = /approved/path/DQ_ENGINE;
%let td_server = YOUR_TERADATA_SERVER;
%let td_authdomain = YOUR_APPROVED_SAS_AUTHDOMAIN;
%let dq_database = DQ_DB;
%let project = RDS;

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
%include "&engine_root/sas/01_dq_controller.sas";
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

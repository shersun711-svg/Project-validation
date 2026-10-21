/* Separate post-RDS account-level review. Does not call file 00.
   Open/run 01_dq_controller.sas and 07_account_checks.sas in the same session.
   No server engine_root path is required when files are opened directly. */
%let td_server=dwhprod;
%let td_authdomain=TeraAuth;
%let dq_database=LAB_T_ORION_MVT;

/* Populate ONLY after agreeing the important fields and numeric thresholds.
   Types/source/key/date come from the existing project/field configuration.
   This list is independent of profiling ACTIVE_IND and does not change Excel.

   Columns:
   FIELD_NAME ACTIVE_IND ABS_CHANGE_MIN REL_CHANGE_MIN
   RETURN_ABS_TOL RETURN_REL_TOL STABLE_VALUE_IND

   Illustrative syntax only (do not adopt these thresholds without review):
   BALANCE_AMT Y 1000 0.20 100 0.05 N
   RATE_TYPE   Y .    .    .   .    N
   Use STABLE_VALUE_IND=Y only for fields expected to remain fixed.
   Add approved rows between DATALINES and the following semicolon.
*/
data work.dq_account_fields;
 length field_name $128 active_ind stable_value_ind $1;
 input field_name :$128. active_ind :$1.
       abs_change_min rel_change_min return_abs_tol return_rel_tol
       stable_value_ind :$1.;
 datalines;
;
run;

/* Explicit dates are mandatory. Begin with a controlled period and few fields.
   Include one preceding AND following month around a suspected reversion.
   MAX_DETAILS caps exported flagged rows per field; summary counts are complete.
   Empty dates/list below deliberately prevent an accidental full-history scan. */
%macro dq_start_account_checks;
 %if not %sysmacexist(run_dq_account_checks) %then %do;
  %put ERROR: Open and run 07_account_checks.sas first.;
  %return;
 %end;
 %run_dq_account_checks(
   project=RDS,
   fields=work.dq_account_fields,
   start_date=,
   end_date=,
   max_details=1000
 );
 %put NOTE: Account check status=%superq(dq_account_status);
%mend;
%dq_start_account_checks;

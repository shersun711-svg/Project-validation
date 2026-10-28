/* Separate post-RDS account-level review. Does not call file 00.
   Open/run 02_load_controller.sas and 02_define_account_checks.sas in the same session.
   Run 01_install_account_results.sql once before using persistent results.
   No server engine_root path is required when files are opened directly. */
%let td_server=dwhprod;
%let td_authdomain=TeraAuth;
%let dq_database=LAB_T_ORION_MVT;

/* Upload account_fields.xlsx to a SAS-accessible server folder.
   Edit its AccountFields sheet, not the main profiling workbook.
   The workbook retains all 24 fields. The nine categorical fields and
   CUTOVER_DT are active; numeric fields/settings are retained but paused.
   Missing limits on active numeric fields stop before source testing. */
%let account_project=RDS; /* Set to the project loaded in engine configuration. */
%let account_fields_file=;
%let account_start_date=2005-01-01;
%let account_end_date=2026-03-31;
%let account_max_details=10000; /* Per field; monthly summaries remain uncapped. */

%macro dq_start_account_checks;
 %local _bad;
 %global dq_account_status dq_account_error;
 %let dq_account_status=FAILED;
 %let dq_account_error=;
 proc datasets library=work nolist;
  delete dq_account_fields dq_account_summary dq_account_detail _dq_account_excel;
 quit;
 %if not %sysmacexist(run_dq_account_checks) %then %do;
  %let dq_account_error=Open and run 02_define_account_checks.sas first.;
  %goto invalid;
 %end;
 %if %length(%superq(account_fields_file))=0 %then %do;
  %let dq_account_error=Set ACCOUNT_FIELDS_FILE to the workbook SAS server path.;
  %goto invalid;
 %end;
 %if not %sysfunc(fileexist(%superq(account_fields_file))) %then %do;
  %let dq_account_error=The workbook is not accessible on this SAS server.;
  %goto invalid;
 %end;
 proc import datafile="%superq(account_fields_file)"
     out=work._dq_account_excel dbms=xlsx replace;
  sheet="AccountFields";
  getnames=yes;
 run;
 %if &syserr>4 or not %sysfunc(exist(work._dq_account_excel)) %then %do;
  %let dq_account_error=Cannot import the AccountFields worksheet.;
  %goto invalid;
 %end;
 /* Excel can infer entirely blank limit columns as character. Convert into
    the controller's declared numeric schema without replacing blanks by zero. */
 %let _bad=0;
 data work.dq_account_fields;
  length field_name $128 active_ind stable_value_ind $1;
  set work._dq_account_excel(rename=(
    FIELD_NAME=_name ACTIVE_IND=_active STABLE_VALUE_IND=_stable
    ABS_CHANGE_MIN=_abs REL_CHANGE_MIN=_rel
    RETURN_ABS_TOL=_return_abs RETURN_REL_TOL=_return_rel));
  if lengthn(strip(vvalue(_name)))>128
     or upcase(strip(vvalue(_active))) not in ('Y','N')
     or upcase(strip(vvalue(_stable))) not in ('Y','N')
     then call symputx('_bad',1,'L');
  field_name=strip(vvalue(_name));
  active_ind=upcase(strip(vvalue(_active)));
  stable_value_ind=upcase(strip(vvalue(_stable)));
  abs_change_min=input(strip(vvalue(_abs)),?? best32.);
  rel_change_min=input(strip(vvalue(_rel)),?? best32.);
  return_abs_tol=input(strip(vvalue(_return_abs)),?? best32.);
  return_rel_tol=input(strip(vvalue(_return_rel)),?? best32.);
  keep field_name active_ind abs_change_min rel_change_min
       return_abs_tol return_rel_tol stable_value_ind;
 run;
 %if &syserr>4 or &_bad %then %do;
  %let dq_account_error=Invalid AccountFields headers or selection indicators.;
  %goto invalid;
 %end;
 %run_dq_account_checks(
   project=&account_project,fields=work.dq_account_fields,
   start_date=&account_start_date,end_date=&account_end_date,
   max_details=&account_max_details
 );
 %put NOTE: Account check status=%superq(dq_account_status);
 %put NOTE: Saved account run number=%superq(dq_account_run_number);
 %return;
%invalid:
 %put ERROR: %superq(dq_account_error);
%mend;
%dq_start_account_checks;

/* Read the failed run's retained WORK metadata in the SAME SAS session.
   Does not reconnect, rerun profiling or modify source/configuration tables.
   Send the ERROR_CODE / ERROR_INFORMATION output for diagnosis. */

proc print data=work.dq_run_status noobs;
    var project_id status error_code error_information;
run;

proc print data=work.dq_module_status noobs;
    where upcase(status)='FAILED';
    var module_name attempt_no batch_id status error_code error_information;
run;

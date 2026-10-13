/* One-time upgrade with all profiling/configuration loading stopped.
   Back up configuration first. Resolve pending XLS staging loads before
   dropping their legacy column. Do not rerun table CREATE or reseed projects.
   Preserve the old Numeric Basic selection when folding it into ACTIVE_IND.
   Compile the matching new procedures and load the converted workbook after
   this script. Column-level DROP syntax/grants must be verified on your server. */
UPDATE DQ_DB.DQ_FIELD_CONFIG
SET ACTIVE_IND='N'
WHERE FIELD_TYPE='NUMERIC' AND NUMERIC_BASIC_IND='N';

ALTER TABLE DQ_DB.DQ_FIELD_CONFIG DROP NUMERIC_BASIC_IND;
ALTER TABLE DQ_DB.DQ_FIELD_CONFIG_XLS_STAGE DROP NUMERIC_BASIC_IND;

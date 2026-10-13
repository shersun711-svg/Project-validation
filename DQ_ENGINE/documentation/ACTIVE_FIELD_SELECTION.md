# Simple field selection: Excel fields, SAS tests

The Fields sheet contains exactly FIELD_NAME, FIELD_TYPE and ACTIVE_IND.
ACTIVE_IND=Y selects a field; N excludes it from all tests. The test switches in
sas/00_run_dq_engine.sas apply to every active field of the matching type.
There are no per-field test/module flags. BASIC switches are implemented;
percentiles/outliers/PSI/Excel export remain unavailable and must stay N.

For example, numeric_basic=Y and numeric_outliers=N run Numeric Basic on all
active NUMERIC fields. To test 50 numeric fields, mark only those 50 ACTIVE_IND=Y
and the remaining numeric fields N. Other types keep their own active selection.
The project ACTIVE_IND still controls whether the project itself is enabled.

## Convert your existing edited workbook

Preserve your edits; do not replace your server workbook with an unedited starter.
For each numeric row, set ACTIVE_IND=N if the OLD NUMERIC_BASIC_IND was N.
Keep previously inactive rows N. Leave non-numeric ACTIVE_IND unchanged. Then
delete the NUMERIC_BASIC_IND column. Keep Project and Settings sheets unchanged.

The revised starter workbook has the same 589 original field mappings and all
ACTIVE_IND=Y. Loading it unedited enables all 415 numeric fields, rather than
preserving a previous 50-field selection. The loader reads the three published
field headers; convert old books before loading, because an extra legacy flag
column does not control selection in the new engine.

## Existing Teradata installation

Pause profiling/configuration loads, back up field configuration and resolve any
pending staging load before upgrading. Replace DQ_DB with the approved schema
(currently LAB_T_ORION_MVT) in deployment copies.

1. Run setup/13_simplify_field_selection.sql once. It folds the old numeric
   selection into ACTIVE_IND, then drops the old flag from configuration and
   Excel-field staging tables. Non-numeric flags/results/history are untouched.
2. Recompile the complete setup/07_apply_excel_config.sql procedure.
3. Recompile the complete modules/10_numeric_basic.sql procedure.
4. Recompile both procedures in modules/00_run_engine.sql separately,
   SP_DQ_RUN_BASIC first and SP_DQ_RUN_ENGINE second.
5. Run the updated SAS files 01_dq_controller.sas and 05_dq_excel_config.sas in
   the same session. Controller version is 20261013_ACTIVE_SELECTION.
6. Load the converted workbook using file 04; require APPLIED and check counts.
7. Select tests in file 00 and run. Require SUCCEEDED before review.

Do not rerun original table CREATE files or reset counters. The current helper
15 and classification/review SQL already use active/type selection and do not
need recompiling for this change. New installs use revised table schemas 00/06
and do NOT run migration 13; the old column never exists there.

ALTER TABLE/column-check dependency behaviour and grants are unverified on the
user's server. Inspect each statement result; if a DROP fails, stop the upgrade
and retain its error rather than proceeding with mismatched schema/code. The
migration preserves field choices but removes the old flag column: retain your
backup/old workbook for a site-managed rollback. No live migration is performed
by repository tools.

## Check selections and test

```sql
SELECT FIELD_TYPE,COUNT(*) AS ACTIVE_FIELDS
FROM LAB_T_ORION_MVT.DQ_FIELD_CONFIG
WHERE PROJECT_ID='RDS' AND ACTIVE_IND='Y'
GROUP BY FIELD_TYPE;
```

For your previous unchanged selection, expect 50 numeric fields and the existing
active non-numeric counts. Confirm these after migration and after Excel reload.
Your chosen module switches determine which of those groups actually run.

The synthetic SAS test generates a new UUID, so it can run after the upgrade
without recreating already-existing source fixtures. New SQL fixture scripts
use four-column field configuration inserts. Tests with fixed completed UUIDs
still require new consistent IDs/fresh isolated fixtures; do not rerun CREATEs
or delete production results to make them pass.

Local static/workbook checks verify the new headers/schema references and field
mappings. SAS execution, live ALTER TABLE and transaction/application behaviour
must be verified on your server before accepting this upgrade.

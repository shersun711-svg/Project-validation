# Load configuration from Excel

Users edit config/DQ_RDS_config.xlsx and load it through SAS. Teradata stores
project, field, settings and special-value configuration. SAS loads directly,
without a workbook-validation or approval-preview stage. Loading configuration
does not start profiling or generate an Excel report.

## Workbook layout

Use one workbook per project. Keep these headers unchanged:

| Sheet | Columns | Rows |
|---|---|---|
| Project | PROJECT_ID, SOURCE_DATABASE, SOURCE_TABLE, REPORTING_DATE_FIELD, ACCOUNT_ID_FIELD, ACTIVE_IND | One project row |
| Fields | FIELD_NAME, FIELD_TYPE, ACTIVE_IND | One row per field |
| Settings | GREEN_THRESHOLD, RED_THRESHOLD, SQL_BATCH_SIZE, OUTLIER_SD_MULTIPLIER, PROFILE_OVERALL, PROFILE_MONTHLY, PROFILE_YEARLY | One settings row |
| SpecialValues | FIELD_TYPE, SPECIAL_VALUE, ACTIVE_IND | One numeric/categorical special per row |

The starter contains the original 589 RDS mappings. Project defaults to RDS,
LAB_T_ORION_MVT.VW_RDS_PHASE2_FACT, reporting field FACT_DT and optional account
field AGMT_ID. Fields are selected with ACTIVE_IND; tests are selected in SAS.
See [configuration and switches](CONFIGURATION_GUIDE.md).

Use text for names and SPECIAL_VALUE, without formulas. SpecialValues applies
to every selected field of its type. Copy only that sheet into an existing
edited workbook to preserve your field selection. An older workbook without
SpecialValues preserves the stored special list; a present empty sheet with
headers clears it. See [special-value semantics](SPECIAL_VALUES.md).

Settings defaults are 1, 5, 25 and 3 for the numeric settings, and Y/Y/N for
PROFILE_OVERALL / PROFILE_MONTHLY / PROFILE_YEARLY. At least one level must be Y.
Absent or blank level columns in older workbooks use those defaults on reload.
See [reporting levels and the required upgrade](REPORTING_LEVELS.md). Thresholds are percentage points: enter
1 and 5, not 1% and 5%. Batch size must be an integer from 1–30. Outlier multiplier must remain 3 when numeric_outliers=Y;
the SAS switch enables that module. Names support 128 ASCII identifier
characters, project IDs 30, flags one, logical types 16, special text 128.
Use the documented numeric precision. Normal SAS/database conversion can
round or truncate values beyond these limits.

## Load in Enterprise Guide or VS Code

First deploy the current engine using [one-time setup](README.md#one-time-deployment).
For an existing Basic engine adding special values, use
[the extension deployment guide](SPECIAL_VALUES.md).
Do not rerun table CREATE scripts on a working installation.

The workbook must be accessible to the SAS server. A local C: Downloads or
mapped-drive path is not automatically visible to server-side SAS. Set
config_workbook in file 04 to the actual approved server path. Use the SASApp
connection that can access the workbook folder; the same requirement applies
when submitting through the VS Code SAS extension.

In the same SAS session:

1. Run sas/01_dq_controller.sas to define connection/controller macros.
2. Run sas/05_dq_excel_config.sas to define the workbook loader.
3. Confirm the workbook path and approved connection settings in
   sas/04_load_dq_config.sas, then run it.
4. Require dq_config_status=APPLIED and STATUS=APPLIED in
   WORK.DQ_CONFIG_LOAD_STATUS / Teradata DQ_CONFIG_LOAD_LOG for the new LOAD_ID.
5. Confirm field counts and special lists, then run file 00 when ready.

The defaults are server dwhprod, AUTHDOMAIN TeraAuth and schema LAB_T_ORION_MVT.
Other users should supply their approved settings. Leave engine_root blank
when opening/running the helper programs directly; automatic INCLUDE requires
an uploaded SAS server path. Credentials are resolved through AUTHDOMAIN.
SAS requires the XLSX engine and SAS/ACCESS to Teradata. Runtime permissions
must cover staging/configuration DML, log reads and SP_DQ_APPLY_CONFIG execution.

Run the helpers once per session, then run file 04 after each workbook change.
If configuration has not changed, file 04 is unnecessary. Each load gets a new
UUID. An existing configuration table is not proof that the latest load succeeded.
After correcting an error, rerun file 04 to generate a fresh LOAD_ID.

## Update and failure behaviour

Project and Settings are upserted. Supplied field rows are inserted/updated;
omitted fields remain configured. Explicit ACTIVE_IND=N deactivates a field.
A present SpecialValues sheet replaces that project's whole list. Other
projects, completed results and run-number mappings are preserved.

These changes commit in one database transaction. Database constraints and
identifier/shape checks remain; invalid headers, flags, duplicates or values
can fail reading, staging or application. Fix the workbook rather than assuming
an automatic reclassification. No physical source-type comparison is performed.

Application is rejected while that project has a RUNNING profiling record.
A brief run-log lock prevents a new run starting during configuration application.
A failed apply retains staged rows for diagnosis; staging can fail before a
load-log row exists. Remove only the affected LOAD_ID's staged rows after
investigation. A cleanup failure after a committed apply retains APPLIED with
cleanup information. Never infer a request is abandoned from elapsed time alone.

Optional isolated tests are listed in [tests/README.md](../tests/README.md).
[Validation evidence](VALIDATION_EVIDENCE.md) distinguishes user-server reports
from local checks; no live SAS/Teradata execution took place in this workspace.

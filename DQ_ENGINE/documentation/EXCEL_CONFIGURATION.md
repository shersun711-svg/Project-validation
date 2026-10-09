# Excel -> SAS -> Teradata configuration

Users edit `config/DQ_RDS_config.xlsx`, then run the SAS loader. SAS reads and
loads the workbook directly, with **no SAS validation or preview phase**, as
requested. Teradata retains the approved configuration in the existing three
configuration tables. Loading does not start profiling or produce an Excel
report. Excel configuration input is implemented; Excel reporting remains deferred.

## Workbook layout

Use one workbook per project, containing exactly these three sheets and headers.
Keep the headers unchanged. The supplied workbook contains all 589 RDS mappings
from book2.xlsx, without reclassifying fields.

| Sheet | Columns | Rows |
|---|---|---|
| Project | PROJECT_ID, SOURCE_DATABASE, SOURCE_TABLE, REPORTING_DATE_FIELD, ACCOUNT_ID_FIELD, ACTIVE_IND | One project row |
| Fields | FIELD_NAME, FIELD_TYPE, ACTIVE_IND, NUMERIC_BASIC_IND | One row per configured field |
| Settings | GREEN_THRESHOLD, RED_THRESHOLD, SQL_BATCH_SIZE, OUTLIER_SD_MULTIPLIER | One settings row |

For RDS, Project is `RDS`, `LAB_T_ORION_MVT`, `VW_RDS_PHASE2_FACT`, `FACT_DT`,
`AGMT_ID`, `Y`. The field classifications are authoritative. Use the dropdowns
for logical types and Y/N flags. Only NUMERIC fields should have Numeric Basic=Y.
Keep field names as text, not formulas. An account field is optional for other
projects; leave that cell blank if not applicable.

Settings default to green threshold 1, red threshold 5, SQL batch size 25 and
reserved outlier multiplier 3. Thresholds are **percentage points**: enter 1 and
5, not Excel percentages `1%` and `5%`. Enter plain numbers without percentage
or currency formatting. Settings are stored as the workbook project's row. A
legacy global `*` row, if present, is retained but is not required or created by
new installations. Outlier multiplier is reserved and does not enable outliers.
Batch size must be an integer from 1 through 30. Thresholds and multiplier use
DECIMAL(9,4); source identifiers/field names support 128 ASCII identifier characters,
project IDs 30, flags one character, logical types 16. The workbook is assumed
to comply with those shapes and limits. SAS normalises type/flag capitalisation
and trims text; it does not check data types against the source view.

## One-time upgrade for your existing deployment

You have already created the engine tables and seed configuration. Do not rerun
those scripts. Replace every `DQ_DB` token with `LAB_T_ORION_MVT` in deployment
copies of these **two new files**:

1. Run `teradata/setup/06_create_excel_config_tables.sql` once. It adds three
   small staging tables and a configuration-load log, without altering existing
   tables or results.
2. Compile `teradata/setup/07_apply_excel_config.sql` as one complete stored
   procedure statement. This creates `SP_DQ_APPLY_CONFIG`. Verify EXECUTE rights
   for your runtime account and the database owner, as with the existing engine.

Use Teradata session mode; the apply CALL must not be enclosed in another
transaction. Existing Numeric Basic/controller procedures do not need recompiling.
A new installation can follow the original deployment guide and add these files.
The former `03_seed_rds_config.sql` has been removed. Project, field and settings
configuration comes from Excel on both the first load and later updates.
The legacy CSV field loader is still available for compatibility.

For a **new installation**, file 00 creates empty project/field/settings tables
and installs the ten fixed metric definitions. Then deploy files 01, 02, 06 and
07 plus the profiling procedures/views as described in README.md. Load the
workbook before profiling the project. These fixed metric names/ordinals are
engine implementation metadata and are not workbook settings.

For **your existing installation**, the ten metric definitions were already
installed by the old seed script. Keep them and your existing configuration;
do not rerun file 00 or delete the old data. Only the Excel loader's 06/07
upgrade is needed. If an older installation stopped before loading metric
metadata, install just the ten DQ_METRIC_DEFINITION INSERT statements at the
end of file 00 once, without rerunning its CREATE statements. Confirm ten
NUMERIC_BASIC definitions exist before running profiling.

## Load from Enterprise Guide 8.2

SAS reads the workbook on the **SAS server**. Opening a local .sas program in EG
can submit code to the server, but a C: Downloads workbook path is not thereby
uploaded. Save/upload the edited .xlsx to an approved server folder first.

The entry program uses the folder you provided:

```text
/opt/sas/GR_Proj_Model_Risk/Model_Validation/Validations/Validation Robot/Data Quality/Robot_input/DQ_RDS_config.xlsx
```

That is a suggested file location, not a claim the workbook has been uploaded.
Change `config_workbook` to the real server path. It may contain spaces.

In the same EG server session:

1. Open/run `sas/01_dq_controller.sas` to define the connection macros.
2. Open/run `sas/05_dq_excel_config.sas` to define the workbook loader.
3. Open `sas/04_load_dq_config.sas`, confirm `config_workbook` and connection
   settings (`dwhprod`, `TeraAuth`, `LAB_T_ORION_MVT`), then run it.

Leave `engine_root` blank for this local-program EG workflow. If .sas files are
later uploaded, a server engine_root can automatically INCLUDE the helpers.
Credentials are resolved through your approved TeraAuth binding; the workbook
and programs contain no password fields. The XLSX LIBNAME engine must be
installed/licensed on the SAS server. The runtime also needs SAS/ACCESS to
Teradata and INSERT/SELECT/DELETE access on staging/load logs, UPDATE/INSERT on
configuration, and EXECUTE on SP_DQ_APPLY_CONFIG.

Success is `dq_config_status=APPLIED` and STATUS=APPLIED in
WORK.DQ_CONFIG_LOAD_STATUS / Teradata DQ_CONFIG_LOAD_LOG. A connection, file-read,
staging or apply error is a failure; inspecting existing tables alone is not proof
of the latest load. Each load has a new UUID. Retry a corrected workbook with a
new load UUID generated by rerunning the entry program; an already used UUID is
not reapplied silently. No configuration is loaded automatically by profiling.

## Update behaviour

For the workbook's project, Project and Settings are upserted. Supplied field
rows are inserted or updated, including their explicit active/module flags.
**Absent fields are retained**; to retire a field set ACTIVE_IND=N rather than
removing its row from the workbook. Other projects, the global settings row,
completed runs and historical metric results are untouched.

The three configuration merges run in a database transaction. Database constraints
and required-shape/identifier checks still apply. There is no SAS workbook
validation phase. Invalid flags, duplicates, missing sheets/rows and incompatible
values can produce read, staging or database errors. These are errors to fix in
the workbook; they are not automatically reclassified. Values beyond SAS/DB
representations may round/truncate during normal conversion, so keep published
lengths and precision. This direct loader is not a substitute for reviewing the
workbook before running it.

Loads are rejected while the project has a RUNNING profiling record. A brief
run-log lock prevents a new run starting during application. If a session was
lost, an operator must confirm its request ended before recovering a stranded
RUNNING status. A rejected/failed apply retains its staging UUID for diagnosis;
remove only those rows after investigation. A staging error can occur before an
apply log exists. A cleanup failure after a successful commit leaves APPLIED
with cleanup information rather than falsely claiming configuration was rolled back.

## Tests and current limit

`tests/test_config_apply.sql` exercises new-project loading, missing settings,
transaction rollback after a partial merge, retained omitted fields/history and
the running-project guard. Run it only in an isolated TEST engine: it temporarily
adds a restrictive test constraint. Check every assertion for zero rows and remove
the named test constraint if execution stops before its cleanup statement.

These new SAS/SQL operations have not been executed here. Local checks cover
source structure and the packaged workbook. Your SAS/Teradata connection was
failing today; restore it and verify XLSX support, compile/run the additive upgrade
and tests before accepting a real load. On Monday, confirm the usual Teradata
LIBNAME works first; changing the workbook path cannot repair authentication or
network connectivity.

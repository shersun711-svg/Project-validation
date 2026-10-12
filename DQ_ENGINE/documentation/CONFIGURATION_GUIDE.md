# Configuration

Normal users edit `config/DQ_RDS_config.xlsx` and run `sas/04_load_dq_config.sas`.
SAS loads Project, Fields and Settings directly to Teradata without a workbook
validation phase. See [Excel setup and usage](EXCEL_CONFIGURATION.md).

`DQ_PROJECT_CONFIG` has one active source per project. Database, source and column names must be simple identifiers matching `[A-Za-z_][A-Za-z0-9_]*`, up to 128 characters. Project IDs use the same convention up to 30 characters. SQL quotes validated source names; arbitrary SQL snippets and user-supplied predicates are not configuration inputs.

`DQ_FIELD_CONFIG` retains all logical types. A field runs in Numeric Basic only when FIELD_TYPE=NUMERIC, ACTIVE_IND=Y and NUMERIC_BASIC_IND=Y. Disabling a field is an explicit analyst decision. The approved workbook FIELD_TYPE controls module selection. The engine does not query database types or alter classifications; Teradata evaluates numeric expressions and explicit statistical casts when each batch executes.

Edit the workbook's Settings row to maintain thresholds and batch size. The
initial workbook uses green threshold 1, red threshold 5 (percentage points),
batch size 25 and reserved outlier multiplier 3. Each Excel load inserts or
updates one complete project settings row; no SQL INSERT/UPDATE is needed.
Batch size is 1–30. A legacy global row with PROJECT_ID='*', if present, remains
available as a fallback for older projects, but Excel-loaded projects have their
own settings. A new installation does not create or require a global row.
Thresholds are snapshotted in the run log, and all percentage colours use them
centrally. Outlier settings and `DQ_PSI_REFERENCE_CONFIG` reserve later
interfaces; no outliers, PSI or baseline distributions are implemented.

The project seed SQL file has been removed. The first Excel load creates the
project, fields and settings; later loads update them through the same path.
File `setup/00_create_config_tables.sql` installs the ten fixed metric definitions
alongside the schema. These names/ordinals belong to the Numeric Basic module
and are not editable project settings.

## Review loaded configuration

Excel is the configuration input for initial setup and later changes. Fields
omitted from a later workbook remain configured; set ACTIVE_IND=N to retire
them. The CSV files under config are original input audit references used by
developer checks, not an alternative loader or editable runtime configuration.

After every change review the stored configuration:

```sql
SELECT * FROM DQ_DB.DQ_FIELD_CONFIG
WHERE PROJECT_ID='RDS' ORDER BY FIELD_TYPE,FIELD_NAME;
```

Workbook classifications are assumed correct. No DBC.ColumnsV or validation-view dependency remains. Numeric values are expected to fit the existing DECIMAL(38,10) result representation. Additional fractional digits round at storage; values outside the integral range fail during execution. No numeric precision preflight or automatic reclassification is performed. Missing source columns or incompatible operations are logged as module/run failures. A zero-test run is still rejected.

## Other basic modules

CATEGORICAL, IDENTIFIER and DATE fields are selected by FIELD_TYPE and
ACTIVE_IND only. Enable categorical_basic, identifier_basic or date_basic in
file 00 after deploying the upgrade. NUMERIC_BASIC_IND applies only to NUMERIC.
Date extrema go to final review; categorical/identifier missing and distinct
metrics go to DQ_METRIC_RESULT. The three-sheet Excel layout is unchanged.

## Add a project

Copy the three-sheet workbook. Edit its Project row to point to the approved
table/view and reporting date, replace the Fields rows with that project's
approved mappings, and choose values in Settings. Load it using the Excel
configuration program; no project setup SQL needs changing. Leave the account
column blank if not applicable; it is not a grouping key or a required Numeric
Basic input. Review the loaded configuration, then run
`%run_dq_engine(project=YOUR_PROJECT,numeric_basic=Y)`.

DATE and TIMESTAMP reporting columns are accepted. For TIMESTAMP WITH TIME ZONE, confirm the database's extraction/session time-zone convention before comparing calendar periods across systems. There is no database type lookup; reporting-date compatibility and timezone behaviour have not been tested here.

Keep source population and configuration stable during a run. The numeric selection is captured and revalidated per attempt; the latest failed-run retry refreshes selection/settings. There is no transaction-wide source snapshot across batches. Use a controlled, immutable staging table if source data can change during profiling. Future modules should use the same captured source, period conventions and metric metadata, with global success decided by the orchestrator after all selected modules complete.

## Excel configuration is now implemented

The agreed Project/Fields/Settings workbook is available. The final user decision
is to load it directly, without SAS workbook validation. Database table constraints
and transaction error handling remain. Profiling calculations and the deferred
Excel report module are unchanged.

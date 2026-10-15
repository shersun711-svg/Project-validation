# Configuration and test selection

Users edit the project workbook and load it with sas/04_load_dq_config.sas.
SAS loads configuration directly; there is no SAS workbook-validation or
approval stage. See [sheet headers and loading instructions](EXCEL_CONFIGURATION.md).

## Choose fields in Excel

The Fields sheet contains FIELD_NAME, FIELD_TYPE and ACTIVE_IND.
ACTIVE_IND=Y selects a field; N excludes it from every module. The project
ACTIVE_IND also needs to be Y. Workbook classifications are authoritative:
NUMERIC, CATEGORICAL, DATE or IDENTIFIER. There are no per-field test flags.

To test 20 numeric and 9 categorical fields, enable those rows in Excel and
reload configuration. Other types may remain active if their SAS switches are N.
The starter workbook enables all 589 RDS fields, including 415 numeric fields;
preserve your edited workbook rather than replacing it with the starter.

## Choose tests in SAS

Edit the settings section in sas/00_run_dq_engine.sas. Each switch applies to
all active fields of its matching type. For numeric and categorical testing:

```sas
%let numeric_basic = Y;
%let categorical_basic = Y;
%let date_basic = N;
%let identifier_basic = N;
%let numeric_outliers = N;
%let categorical_psi = N;
%let export_excel = N;
%let retry_run_id = ;
```

Basic numeric/categorical profiling includes special counts and rates.
Enable numeric_outliers=Y for mean +/- 3*population-standard-deviation checks. PSI and Excel
report export remain unavailable and must stay N. A selected module with no eligible
fields fails explicitly; enabling no modules is also rejected.

## Choose reporting levels in Excel

Settings.PROFILE_OVERALL=Y, PROFILE_MONTHLY=Y and PROFILE_YEARLY=N are the
defaults and the confirmed RDS selection. These apply to every selected module,
independently of the SAS test switches. Choose any nonempty Y/N combination.
See [deployment, compatibility and tests](REPORTING_LEVELS.md).

## Settings and special values

Settings default to green below 1%, amber from 1% to below 5%, red from 5%,
SQL_BATCH_SIZE=25 and OUTLIER_SD_MULTIPLIER=3 (required for the agreed outlier rule). Enter thresholds as
numbers 1 and 5, not Excel percentage-formatted cells. Batch size accepts 1–30;
module caps can reduce the effective size. See [performance](PERFORMANCE_NOTES.md).
Excel-loaded projects have their own settings row. A legacy global '*' row can
serve as fallback but is not required for new projects. Fixed metric metadata
belongs to engine installation and is not user-editable configuration.

The SpecialValues sheet holds project-wide numeric and categorical lists.
Special values stay non-missing, are counted separately, and are excluded from
numeric distribution statistics and categorical distinct counts.
See [list configuration and exclusion definitions](SPECIAL_VALUES.md).
No special-value testing applies to dates or identifiers.

## Review the loaded selection

```sql
SELECT FIELD_TYPE,COUNT(*) AS ACTIVE_FIELDS
FROM LAB_T_ORION_MVT.DQ_FIELD_CONFIG
WHERE PROJECT_ID='RDS' AND ACTIVE_IND='Y'
GROUP BY FIELD_TYPE;
```

Compare counts with your workbook. Fields omitted from later loads remain
configured; set ACTIVE_IND=N to retire them. Excel loading does not start a
profiling run. Require APPLIED before running file 00, and SUCCEEDED before
reviewing the resulting run number.

## Add another project

Copy the workbook. Edit Project to point to the approved source table/view and
reporting date, replace Fields with approved mappings, choose Settings and edit
SpecialValues for that project. Load and run with project=YOUR_PROJECT.
The optional account column is not a grouping key. No project seed SQL is needed.

Source and column names must match [A-Za-z_][A-Za-z0-9_]*, up to 128 characters;
project IDs use the same convention up to 30. Arbitrary SQL/predicates are not
configuration inputs. The engine does not query database physical types or
reclassify workbook fields. Missing columns/incompatible operations fail with
logged errors. Numeric results use DECIMAL(38,10); range/precision and reporting
DATE/TIMESTAMP compatibility must be verified on the installed database.

Keep configuration and source stable during execution. A failed-run retry
refreshes selection, settings and special lists; completed runs are preserved.
There is no transaction-wide source snapshot across batches. Use an approved
immutable source stage if needed. Original audit CSVs support developer checks;
special_values.csv is a sheet-copy convenience, not a separate runtime loader.

## Field-level comparisons

In file 00, mom=Y and/or yoy=Y requests comparison summaries after profiling
succeeds. Both default to N. They use the selected run's saved monthly metrics;
they add no Excel settings or field flags. Use file 06 to compare an existing
successful run by short run number without starting profiling. See
[field comparisons](FIELD_CHANGES.md) for scope, units and deployment.

For Numeric Outliers, SQL_BATCH_SIZE now controls working-copy width up to 20
fields; counting queries also accept up to 20 with automatic SQL-length
splitting. Start at 10 when checking
permanent storage, then benchmark 15/20. Numeric Basic now caps at 20 and automatically splits shorter batches if
generated SQL would exceed its safe length. Smaller settings remain supported
if spool is limited. See
[bounded outlier storage](OUTLIER_STORAGE_UPDATE.md).

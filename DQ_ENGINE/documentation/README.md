# DQ Engine: setup and operation

SAS loads configuration and controls execution. Teradata calculates Numeric
Basic metrics and stores configuration, results and logs. The engine supports
all ten Numeric Basic metrics across overall, yearly and monthly periods.
Percentiles, outliers, categorical profiling, PSI, date/identifier profiling and
Excel report generation are deferred; their switches must remain N.

## Everyday use

Use a SASApp server session that can access the workbook and Teradata.

1. Run `sas/01_dq_controller.sas` once in each new SAS session.
2. When loading configuration for the first time or after editing Excel, run
   `sas/05_dq_excel_config.sas` once to define the loader. Edit the workbook path
   and connection settings in `sas/04_load_dq_config.sas`, then run that file.
   Require STATUS=APPLIED in DQ_CONFIG_LOAD_LOG for the generated LOAD_ID.
3. Confirm project and switches in `sas/00_run_dq_engine.sas`, then run it.
   Its default project is RDS. Numeric Basic is Y and other switches are N.
4. Require dq_status=SUCCEEDED and retain dq_run_id for reviewing results.

If configuration has not changed and the controller is already loaded, run
only file 00. Excel loading is separate from profiling; there is no SAS workbook
validation/approval phase. See [Excel configuration](EXCEL_CONFIGURATION.md)
for sheet headers, server file paths and update behaviour.

The connection defaults are server dwhprod, AUTHDOMAIN TeraAuth and engine
schema LAB_T_ORION_MVT. Other users must use their approved connection settings.
Credentials are resolved by SAS; do not add passwords to the workbook or code.

Leave engine_root blank when opening/submitting the helper SAS programs first.
If using automatic INCLUDE instead, set it to the DQ_ENGINE folder on the SAS
server. A local PC Downloads path is not a server path. The workbook must also
be accessible from the chosen SAS server, regardless of the editor used.

A numeric field runs only with FIELD_TYPE=NUMERIC, ACTIVE_IND=Y and
NUMERIC_BASIC_IND=Y. The starter workbook contains 589 original RDS mappings
and enables all 415 numeric fields. For a smaller run, edit the selections in
Excel, reload and check the enabled count in DQ_FIELD_CONFIG. Reusing already
loaded configuration retains the existing selection.

## Review the final result

DQ_METRIC_RESULT stores one row per metric. DQ_COMPLETED_RESULT exposes only
successful runs in that same layout. DQ_NUMERIC_REVIEW is the final review view:
one row per field and period, with all ten metrics and missing/zero percentage
classifications as columns. Values retain stored DECIMAL(38,10) precision;
NULL statistics and NOT_EVALUATED classifications retain their meaning.

```sql
SELECT *
FROM LAB_T_ORION_MVT.DQ_NUMERIC_REVIEW
WHERE PROJECT_ID = 'RDS'
  AND RUN_ID = '<your successful run UUID>'
  AND PERIOD_LEVEL = 'OVERALL'
ORDER BY FIELD_NAME;
```

Remove the period filter for yearly/monthly results too; order by FIELD_NAME,
PERIOD_LEVEL, PERIOD_VALUE. Always filter by RUN_ID to keep historical runs
separate. For 50 selected fields, OVERALL returns 50 rows. Across all periods,
a complete ten-metric run has one review row per ten stored metric rows.

For an existing installation missing this review view, deploy only
`teradata/results/92_dq_numeric_review.sql`, replacing DQ_DB with your engine
schema. It depends on DQ_COMPLETED_RESULT from file 91. Existing completed
results become available without an Excel reload or profiling rerun. The view
reads stored aggregates, not the source dataset. SAS continues to import the
run summary; the detailed review is available directly in Teradata.

## One-time deployment

Prerequisites: SAS 9.4 with XLSX support and SAS/ACCESS to Teradata; an approved
AUTHDOMAIN; and Teradata 16.20/Vantage with SPL, dynamic SQL, GROUPING SETS,
STDDEV_SAMP, REGEXP_SIMILAR, diagnostics and volatile CTAS support. Verify the
installed release and compiler behaviour. No SAS/Teradata executable or live
connection is available in this workspace.

Use an approved engine schema separate from source tables. The deployment
account needs table/view/procedure creation privileges and grantable access to
view dependencies. Runtime needs source/configuration SELECT, engine and staging
DML, EXECUTE on engine procedures and approved DBC.SysExecSQL access. Have the
DBA verify invoker/dynamic-SQL and view-owner permissions. Volatile aggregation
requires spool space. Credentials and source data are not included here.

Replace every DQ_DB token in deployment copies with the approved engine schema,
including tokens within dynamic SQL. Do not execute or change the supplied
RDS source-view DDL. In a Teradata-mode session, deploy in this order:

1. `teradata/setup/00_create_config_tables.sql`
2. `teradata/setup/01_create_result_tables.sql`
3. `teradata/setup/02_create_log_tables.sql`
4. `teradata/setup/06_create_excel_config_tables.sql`
5. `teradata/setup/07_apply_excel_config.sql`
6. `teradata/results/90_colour_classification.sql`
7. `teradata/results/91_dq_summary_views.sql`
8. `teradata/results/92_dq_numeric_review.sql`
9. `teradata/modules/10_numeric_basic.sql`
10. `teradata/modules/00_run_engine.sql`

Table CREATE files are one-time operations. Do not rerun them on an existing
installation. File 00 installs fixed metric definitions; project configuration
comes from Excel. Numbering is retained for compatibility with existing
installations; missing numbers are not deployment steps.

Submit each REPLACE PROCEDURE as a complete SPL statement in a supported
client; ordinary semicolon splitting breaks procedure bodies. With BTEQ use
the site's approved .COMPILE FILE workflow. Inspect compiler errors/warnings.
CALLs use mode=teradata and must not be wrapped in an enclosing transaction;
the configuration apply procedure owns its transaction.

No database cleanup is required for this repository cleanup. Existing unused
DQ_FIELD_CONFIG_STAGE tables may remain; new installations no longer create
that retired CSV-loader staging table. No deployed objects are dropped here.

## Validation and troubleshooting

Optional validation is documented in [tests/README.md](../tests/README.md).
Retain synthetic tests for regression checking; run them in an isolated test
engine. Read-only RDS validation and performance checks are also available.
[Validation evidence](VALIDATION_EVIDENCE.md) distinguishes local static checks
from user-server observations. The user reported a successful Excel load and
50-field RDS run with 139,000 metric rows and checked sample results; the new
review view remains unverified on the server.

- A missing macro means the helper files need running in the same session.
- Workbook path errors require checking access on the selected SAS server.
- Run/batch errors are recorded in DQ_RUN_LOG and DQ_MODULE_LOG. Full SQL_TEXT
  remains in Teradata and is intentionally not imported by SAS.
- A SAS read error can occur after a database run succeeds. Check DQ_RUN_LOG
  before retrying. The controller prints a DQ READ stage and its version.
- SAS LATIN9 sessions require compatible submitted text. The SAS source files
  are ASCII; a source-wrapper transcoding failure is separate from a database
  datatype failure. Session encoding is selected at server startup.

Only a FAILED database run accepts retry_run_id. Fix its cause, then rerun
with that UUID; the engine refreshes selection/settings and preserves attempt
logs. A completed or active UUID is rejected. For a new observation, leave
retry_run_id blank to generate a new UUID. Never infer that a RUNNING request
is abandoned from elapsed time: verify it ended before operator recovery.

## Folder responsibilities

| Folder | Purpose |
|---|---|
| `sas/` | Excel loader, controller and run entry program |
| `config/` | Editable starter workbook and original input audit references |
| `teradata/setup/` | One-time configuration, results and logging schema |
| `teradata/modules/` | Numeric calculations and run orchestration |
| `teradata/results/` | Classification, completed results and review views |
| `tests/` | Optional database/SAS regression, source and performance checks |
| `tools/` | Developer-only local static/workbook checks |
| `documentation/` | Setup, configuration, metric semantics and evidence |

Further details: [configuration](CONFIGURATION_GUIDE.md),
[metric definitions](RESULTS_DICTIONARY.md), [performance](PERFORMANCE_NOTES.md)
and [original input review](INPUT_REVIEW.md).

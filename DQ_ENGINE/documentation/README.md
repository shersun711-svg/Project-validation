# DQ Engine: setup and operation

SAS loads configuration and controls execution. Teradata calculates Numeric
Basic metrics and stores configuration, results and logs. The engine supports
Numeric Basic counts and distribution metrics, categorical/identifier missing and distinct
metrics, and date counts/missing percentage, across overall/yearly/monthly periods.
Numeric/categorical special-value checks are implemented.
Numeric Outliers is implemented with the agreed +/-3 population-standard-deviation rule.
PSI and Excel report generation remain deferred.
See [outlier deployment for an existing engine](NUMERIC_OUTLIERS.md).
For separate rule-decision storage, see [shared rule evaluation](RULE_RESULTS.md).
For this extension, follow [deployment and test instructions](SPECIAL_VALUES.md).
Existing Basic installations adding special values should use that
extension guide; current fresh deployments use the one-time sequence below.

## Everyday use

Use a SASApp server session that can access the workbook and Teradata.

1. Run `sas/01_dq_controller.sas` once in each new SAS session.
2. When loading configuration for the first time or after editing Excel, run
   `sas/05_dq_excel_config.sas` once to define the loader. Edit the workbook path
   and connection settings in `sas/04_load_dq_config.sas`, then run that file.
   Require STATUS=APPLIED in DQ_CONFIG_LOAD_LOG for the generated LOAD_ID.
3. Confirm project and switches in `sas/00_run_dq_engine.sas`, then run it.
   Its default project is RDS. Numeric Basic defaults Y; other basics default N.
4. Require dq_status=SUCCEEDED and retain dq_run_number for reviewing results.
   The internal dq_run_id remains available for failed-run retries.

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

A field runs when ACTIVE_IND=Y and its matching type/module switch in file 00
is Y. There are no per-field test flags. The starter workbook contains 589 original RDS mappings
and enables all 415 numeric fields. For a smaller run, edit the selections in
Excel, reload and check the enabled count in DQ_FIELD_CONFIG. Reusing already
loaded configuration retains the existing selection.

For categorical, identifier and date fields, FIELD_TYPE and ACTIVE_IND choose
fields; the matching SAS switch enables the module. No workbook header changes
are needed. See [field selection](CONFIGURATION_GUIDE.md).

## Review the final result

DQ_METRIC_RESULT stores one row per metric. DQ_COMPLETED_RESULT exposes only
successful runs in that same layout. DQ_BASIC_REVIEW is the final profiling view across all four types, including date counts
and overall field availability. The view contains one row per field and period. Counts display as whole numbers,
percentages to two decimals and descriptive numeric values to four decimals; DQ_METRIC_RESULT keeps full precision.
Rule statuses are separate in DQ_RULE_RESULT. NULL statistics retain their meaning.
FIRST_AVAILABLE_FACT_DT/LAST_AVAILABLE_FACT_DT are overall coverage for each
non-missing field. Date counts use this same layout; unrelated metrics are NULL.
MINIMUM/MAXIMUM are numeric and apply only to numeric fields. Read [availability definitions](RESULTS_DICTIONARY.md#field-availability).
The review and DQ_COMPLETED_RESULT include the short RUN_NUMBER.

```sql
SELECT *
FROM LAB_T_ORION_MVT.DQ_BASIC_REVIEW
WHERE PROJECT_ID = 'RDS'
  AND RUN_NUMBER = 12 /* Your actual short run number. */
  AND PERIOD_LEVEL = 'OVERALL'
ORDER BY FIELD_NAME;
```

Remove the period filter for yearly/monthly results too; order by FIELD_NAME,
PERIOD_LEVEL, PERIOD_VALUE. Always filter by RUN_NUMBER to keep historical runs
separate. For 50 numeric fields only, OVERALL returns 50 rows. Categorical/identifier
fields store five and three metrics per period respectively; date fields store four count/rate metrics.
Numeric Basic stores twelve metrics per field/period.
Do not divide mixed-module metric counts by ten to infer review row counts.

Existing results and UUIDs are preserved. The views read stored aggregates, not the source dataset.
SAS imports run status/summary; detailed review is available in Teradata.
New classifications are stored in DQ_RULE_RESULT. DQ_COMPLETED_RESULT keeps its
legacy DQ_COLOUR column for compatibility; DQ_BASIC_REVIEW contains profiling
values only. No DQ_RULE_REVIEW view is created. See [rule storage and review SQL](RULE_RESULTS.md).

## One-time deployment

Prerequisites: SAS 9.4 with XLSX support and SAS/ACCESS to Teradata; an approved
AUTHDOMAIN; and Teradata 16.20/Vantage with SPL, dynamic SQL, GROUPING SETS,
STDDEV_POP, REGEXP_SIMILAR, diagnostics and volatile CTAS support. Verify the
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

1. `teradata/setup/00_create_config_tables.sql` (seeds `STDDEV_POP` for new installations)
2. `teradata/setup/01_create_result_tables.sql`
3. `teradata/setup/02_create_log_tables.sql`
4. `teradata/setup/06_create_excel_config_tables.sql`
5. `teradata/setup/09_add_basic_metrics.sql`
6. `teradata/setup/10_add_run_numbers.sql`
7. `teradata/setup/11_create_field_availability.sql`
8. `teradata/setup/12_add_date_basic_metrics.sql`
9. `teradata/setup/14_create_special_values.sql`
10. `teradata/setup/15_add_extended_metrics.sql`
11. `teradata/setup/16_create_outlier_support.sql`
12. `teradata/setup/17_create_rule_results.sql`
13. `teradata/setup/07_apply_excel_config.sql`
14. `teradata/results/90_colour_classification.sql`
15. `teradata/results/91_dq_summary_views.sql`
16. `teradata/results/93_dq_basic_review.sql`
17. `teradata/modules/01_assign_run_number.sql`
18. `teradata/modules/02_special_value_list.sql`
19. `teradata/modules/03_numeric_statistics.sql` (source helper/grant, then compatible wrapper/grant)
20. `teradata/modules/10_numeric_basic.sql`
21. `teradata/modules/12_numeric_outliers.sql`
22. `teradata/modules/15_other_basic.sql`
23. `teradata/modules/20_categorical_basic.sql`
24. `teradata/modules/30_date_basic.sql`
25. `teradata/modules/40_identifier_basic.sql`
26. `teradata/modules/00_run_engine.sql` (EXTENDED, then PROFILE, BASIC and ENGINE separately)

Table CREATE files are one-time operations. Do not rerun them on an existing
installation. File 00 installs fixed metric definitions; project configuration
comes from Excel. Numbering is retained for compatibility with existing
installations; missing numbers are not deployment steps.

For an existing Numeric Basic installation, run
`teradata/setup/18_population_standard_deviation.sql` once before compiling
the updated Numeric Basic procedure and review view. It renames the metric
definition for new runs. `DQ_BASIC_REVIEW` uses only `STDDEV_POP`.

For this rollout, `teradata/setup/19_clear_run_history.sql` performs the
requested destructive reset of profiling results, rule results, run/module
logs, run-number mappings and per-run snapshots. It retains project/workbook
configuration and configuration-load logs. Stop all
jobs and run its two preflight queries separately; continue only when
ACTIVE_RUNS and ACTIVE_CONFIG_LOADS are both zero. New run numbers continue
from 1 because all run history and mappings are deleted and the counter resets.

Submit each REPLACE PROCEDURE as a complete SPL statement in a supported
client; ordinary semicolon splitting breaks procedure bodies. With BTEQ use
the site's approved .COMPILE FILE workflow. Inspect compiler errors/warnings.
CALLs use mode=teradata and must not be wrapped in an enclosing transaction;
the configuration apply and run-number allocation procedures own their
transactions. File modules/00_run_engine.sql contains four complete procedure
statements; submit them separately in the stated order and run each following
GRANT before compiling the next wrapper. Grants are separate SQL statements;
BTEQ .COMPILE FILE should receive only the procedure block.

No database cleanup is required for this repository cleanup. Existing unused
DQ_FIELD_CONFIG_STAGE tables may remain; new installations no longer create
that retired CSV-loader staging table. No deployed objects are dropped here.

## Validation and troubleshooting

Optional validation is documented in [tests/README.md](../tests/README.md).
Retain synthetic tests for regression checking; run them in an isolated test
engine. Read-only RDS validation and performance checks are also available.
[Validation evidence](VALIDATION_EVIDENCE.md) distinguishes local static checks
from user-server observations. The user reported a successful Excel load and
50-field numeric RDS run with sample results checked, followed by a successful
65-field mixed RDS run (50 numeric, 9 categorical, 4 date, 2 identifier). These
are user-server reports; full RDS source reconciliation and benchmarks remain
unverified. No live SAS/Teradata execution occurred in this workspace.

- A missing macro means the helper files need running in the same session.
- Workbook path errors require checking access on the selected SAS server.
- Run/batch errors are recorded in DQ_RUN_LOG and DQ_MODULE_LOG. Full SQL_TEXT
  remains in Teradata and is intentionally not imported by SAS.
- A SAS read error can occur after a database run succeeds. Check DQ_RUN_LOG
  before retrying. The controller prints a DQ READ stage and its version.
- SAS LATIN9 sessions require compatible submitted text. The SAS source files
  are ASCII; a source-wrapper transcoding failure is separate from a database
  datatype failure. Session encoding is selected at server startup.

Keep run-number mappings/counter when deleting old test results; never reuse
assigned numbers. Only a FAILED database run accepts retry_run_id. Fix its cause, then rerun
with that UUID; the engine refreshes selection/settings and preserves attempt
logs. A completed or active UUID is rejected. For a new observation, leave
retry_run_id blank to generate a new UUID. Never infer that a RUNNING request
is abandoned from elapsed time: verify it ended before operator recovery.

## Folder responsibilities

| Folder | Purpose |
|---|---|
| `sas/` | Excel loader, controller and run entry program |
| `config/` | Editable starter workbook and original input audit references |
| `teradata/setup/` | Current one-time configuration, results and logging schema |
| `teradata/modules/` | Profiling calculations and run orchestration |
| `teradata/results/` | Classification, completed results and review views |
| `tests/` | Optional database/SAS regression, source and performance checks |
| `tools/` | Developer-only local static/workbook checks |
| `documentation/` | Setup, configuration, metric semantics and evidence |

Further details: [configuration](CONFIGURATION_GUIDE.md),
[metric definitions](RESULTS_DICTIONARY.md), [performance](PERFORMANCE_NOTES.md)
and [original input review](INPUT_REVIEW.md).


See [field selection and module switches](CONFIGURATION_GUIDE.md) to choose
which fields and tests to run.

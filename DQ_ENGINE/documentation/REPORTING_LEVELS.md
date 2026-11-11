# Choose profiling reporting levels

Reporting levels and profiling modules are independent. In the Excel Settings
sheet, use the following three columns (one row per project workbook):

| Setting | Default / RDS choice | Meaning |
|---|---|---|
| PROFILE_OVERALL | Y | Whole-dataset profile and outlier bounds |
| PROFILE_MONTHLY | Y | Separate profiles and outlier bounds for each calendar month |
| PROFILE_YEARLY | N | Separate profiles and outlier bounds for each calendar year |

Choose any nonempty combination. At least one setting must be Y; all-N is
rejected in Teradata before profiling. The loader normalizes case/whitespace
and uses Y/Y/N for absent or blank columns in older workbooks. Other values
are rejected by Teradata; SAS does not add a validation or approval phase.
Reload an older workbook only after reviewing these defaults: omitted columns
use defaults, rather than retaining a previously configured level selection.

Fields.ACTIVE_IND still chooses fields. SAS file 00 still chooses modules
(numeric_basic, numeric_outliers, categorical_basic, date_basic, identifier_basic).
The same level selection applies to every enabled module. For example,
PROFILE_YEARLY=N does not turn off numeric_outliers; it turns off that module's
yearly bounds/counts/rates and the yearly results of every selected Basic module.
Module parameters and existing SAS calls are unchanged.

Settings are captured in DQ_RUN_LOG for each attempt. Completed results retain
their scope when configuration changes. A failed-run retry refreshes settings,
consistent with the existing retry contract. Project settings override the
legacy '*' row as a complete settings row, without mixing flag values.
The rule evaluator reads only published metrics; it needs no source rescan or
new reporting-level mechanism. Rules for disabled levels are not generated.

Basic aggregation includes only enabled grouping sets/period SELECTs. The
standalone numeric statistics helper skips disabled passes. Outliers include
only enabled rollup branches; disabled yearly comparisons and the yearly bounds
join are omitted. Other disabled bounds use constant-disabled comparisons.
They still process source years as internal scan chunks, reading a partitioned
working table by its stored year key; this
is independent of whether YEARLY reporting is enabled. DQ_OUTLIER_CHUNK_YEAR
holds only that run's year names (including UNKNOWN or empty ALL) and is cleaned
on success/handled failure. It contains no yearly profile results. An external
abort can leave rows; the existing retry/run cleanup paths remove that run's rows.

NULL reporting dates belong to UNKNOWN in each enabled calendar level.
An empty source produces an OVERALL row only if OVERALL is enabled; otherwise
it produces no metric rows and can still finish successfully. Field availability
remains overall coverage metadata, derived from the selected small aggregates
without another source scan, even when OVERALL metric reporting is disabled.
No existing result/history rows are deleted by this upgrade.

## Upgrade an existing installation

Finish running jobs and configuration loads first; resolve pending staging loads.
Back up project settings. Replace DQ_DB globally in deployment copies with the
approved schema, currently LAB_T_ORION_MVT. Use a Teradata-mode session.

1. Run `teradata/setup/20_configure_reporting_levels.sql` once (sections A and B).
   Submit each statement separately; column additions and CHECK constraints use
   separate ALTER statements to avoid error 3982. For a partial deployment,
   inspect SHOW TABLE and skip columns/constraints already added successfully.
   It adds flags to settings, settings staging and run logs, plus the small
   outlier scan-calendar table. Existing projects and historical runs retain
   the previous Y/Y/Y scope until an explicit workbook reload; new settings
   rows default to Y/Y/N.
   With current repository procedures, also run
   `teradata/setup/21_capture_period_dates.sql` once before recompilation.
2. Recompile the complete procedure in `teradata/setup/07_apply_excel_config.sql`
   and execute its included grant.
3. Recompile `teradata/modules/03_numeric_statistics.sql`: BATCH helper/grant first,
   then SOURCE wrapper/grant and STATISTICS wrapper/grant, as separate complete statements.
4. Recompile `teradata/modules/10_numeric_basic.sql`,
   `teradata/modules/15_other_basic.sql` and `teradata/modules/12_numeric_outliers.sql`,
   including their grants. The unchanged categorical/date/identifier wrappers
   retain their signatures and need no change.
5. Recompile the procedures in `teradata/modules/00_run_engine.sql` separately:
   EXTENDED/grant, PROFILE/grant, BASIC/grant, ENGINE/grant.
   Then deploy results/90, 91 and 93 in that order, following the
   [review/date update](REVIEW_UPDATE.md) for the classifier and views.
6. Add the three headers and values to YOUR edited workbook's Settings sheet.
   For RDS use Y/Y/N in overall/monthly/yearly order. Preserve your ACTIVE_IND
   selections and special-value lists; do not replace your workbook with the
   starter, which enables all 589 fields.
7. In the same SAS session, load 01_dq_controller.sas and the updated
   05_dq_excel_config.sas, then run 04_load_dq_config.sas. Require APPLIED.
8. Check the stored settings below. Keep the existing small field selection
   and run 00 with the intended modules and a fresh run ID. Require SUCCEEDED.

Fresh installations already get the flag columns from setup 00/02/06; run ONLY
section B of setup 20 before compiling procedures. No view recompile or history
reset is required.

```sql
SELECT PROJECT_ID,PROFILE_OVERALL,PROFILE_MONTHLY,PROFILE_YEARLY
FROM LAB_T_ORION_MVT.DQ_ENGINE_SETTINGS
WHERE PROJECT_ID='RDS';

SELECT N.RUN_NUMBER,L.STATUS,L.PROFILE_OVERALL,L.PROFILE_MONTHLY,L.PROFILE_YEARLY
FROM LAB_T_ORION_MVT.DQ_RUN_LOG L
JOIN LAB_T_ORION_MVT.DQ_RUN_NUMBER N ON L.RUN_ID=N.RUN_ID
WHERE L.PROJECT_ID='RDS'
ORDER BY N.RUN_NUMBER DESC;

SELECT PERIOD_LEVEL,COUNT(*) AS METRIC_ROWS
FROM LAB_T_ORION_MVT.DQ_COMPLETED_RESULT
WHERE PROJECT_ID='RDS' AND RUN_NUMBER=123 /* replace with the new run number */
GROUP BY PERIOD_LEVEL;
```

For RDS Y/Y/N, the new run should contain OVERALL and MONTHLY, with no YEARLY
metrics or rule decisions. Historical runs can still contain YEARLY rows.

## Validation and performance limits

`tests/test_reporting_levels.sql` creates its own five-row/four-field project
in an isolated test schema. It exercises all seven level combinations, captured
settings, config loading/rollback and all-N rejection. Every assertion SELECT
must return zero rows. Do not run it as a replacement for your RDS configuration.
Local Node checks cover all seven combinations, empty and NULL-date populations,
unchanged statistics and independently calculated outlier results. They do not
compile SPL, execute SAS or predict Teradata spool/runtime.

Disabling levels reduces their calculations/results. It does not remove all
outlier stage scans. A CTE is a query expression, not a promise of materialization
or one source scan: Teradata may inline, spool or reevaluate it. Comparing the
development team's query shape with this engine requires equivalent populations,
periods, specials and workload plus EXPLAIN/DBQL. This change does not copy their
implementation or claim a measured speedup.

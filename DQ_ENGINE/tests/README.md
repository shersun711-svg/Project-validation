# Which test files should I use?

For the current MDT result comparison, use only:

| File | Current use |
|---|---|
| [compare_numeric_development.sql](compare_numeric_development.sql) | Our numeric run 17 versus MDT runs 12, 13, 14 and 15, all in LAB_T_ORION_MVT. |
| [compare_categorical_development.sql](compare_categorical_development.sql) | Our categorical run 18 versus MDT run 20; includes BLANKCOUNT and adjusted missing-value reconciliation. |
| [compare_date_development.sql](compare_date_development.sql) | Our date run 18 versus MDT run 21; reads the separate date profile result table. |

Categorical output preserves the original values and adds `BLANKCOUNT`,
`ADJUSTED_OUR_VALUE` and `ADJUSTED_DIFFERENCE`. It checks our missing count plus
MDT blanks against MDT missing count (which already includes blanks).
`MATCH_AFTER_BLANK_ADJUSTMENT` means this reconciliation agrees; residual
differences remain `DIFFERENT`.

Run categorical and date comparisons separately for separate result tables/grids.
They do not create persistent database tables.

Replace DQ_DB in deployment copies. Submit each complete comparison as one
request. No engine deployment, fixture creation or profiling rerun is needed.
See [comparison settings and classification exceptions](../documentation/DEVELOPMENT_COMPARISON.md).

The other SQL/SAS files are optional maintenance checks:

- `validate_rds.sql`: read-only checks of source/configuration/population.
- `benchmark_numeric.sql`: read-only performance diagnosis.
- `00_create_*` through `03_create_*`: synthetic test-data setup.
- `test_*.sql` and `test_*.sas`: regression checks for calculations, configuration,
  run lifecycle and prior fixes. Some modify data or configuration in an isolated
  test engine; they are not part of the routine RDS workflow.

Keep the regression files for future engine changes. They are not unused merely
because normal users do not run them. The detailed maintenance instructions below
are for developers, not a checklist to execute before comparing results.

## Optional validation and performance checks

These files support engine maintenance and verification. Normal users load
Excel and run the engine; they do not need to run this folder on every use.
Replace DQ_DB with the approved test engine database in deployment copies.
SAS tests require the current controller loaded in the same server session.

Account-level post-RDS prototype: run
`node DQ_ENGINE/tools/check_account_checks.mjs` for synthetic SQL regression.
It checks calendar gaps, reversions, missing/special states, summary denominators,
detail caps and invalid keys, plus persistent INSERTs, successful-only views,
full saved detail, project/run isolation and failed-run cleanup.
SAS/Teradata execution remains unverified.
See [operation and field settings](../documentation/ACCOUNT_CHECKS.md).

| File | Purpose |
|---|---|
| `validate_rds.sql` | Read-only source/configuration/population checks |
| `benchmark_numeric.sql` | Read-only EXPLAIN and recorded timing queries |
| `00_create_numeric_fixture.sql` | Creates synthetic sources and project configuration |
| `test_numeric.sql` | Runs Numeric Basic and reconciles all periods |
| `test_colour.sql` | Checks percentage boundary classifications |
| `test_failure_restart.sql` | Checks failures, retries and completed-run protection |
| `test_full_execution.sas` | Runs controller selection and lifecycle tests |
| `test_sas_reconciliation.sas` | Compares synthetic metrics with SAS calculations |
| `test_config_apply.sql` | Checks configuration commit/rollback and load guards |
| `01_create_other_basic_fixture.sql` | Creates synthetic mixed-type and empty/failure sources |
| `test_other_basic.sql` | Checks new modules, date review, switches, retries and numbering |
| `test_other_basic.sas` | Checks non-numeric-only SAS execution and summaries |
| `02_create_extended_fixture.sql` | Creates isolated special-value test data |
| `test_extended.sql` | Checks special counts, filtered statistics and empty sources |
| `test_extended.sas` | Checks the SAS Basic special-value call and summary |
| `test_extended_config.sql` | Checks special-list replacement, escaped labels and rollback |
| `03_create_outlier_fixture.sql` | Creates isolated strict-boundary and tail test populations |
| `test_outliers.sql` | Checks outlier bounds/rates, Basic reuse, dependency and retry |
| `test_reporting_levels.sql` | Isolated five-row test of all seven scopes, all-N rejection, snapshot and Excel apply/rollback |
| `test_outlier_partition.sql` | Eight synthetic rows; checks partitioned CTAS, duplicate preservation, key ranges, statistics and EXPLAIN before RDS |
| `test_outlier_rollup.sql` | Five synthetic chunk rows; checks full period-key widths without an RDS scan |
| `test_outliers.sas` | Checks switches and reconciles population deviation/bounds to SAS |

Run fixture creation, numeric, colour and failure/restart SQL in that order,
then the full SAS execution and SAS reconciliation checks. Use an isolated
test engine: these scripts create and modify synthetic objects/configuration,
and their fixed UUIDs require a fresh fixture deployment. CALL/DDL errors fail
the test; each assertion SELECT must return zero rows. An aborted, skipped or
zero-test execution is not a pass.

After the basic upgrade, run fixture 01, test_other_basic.sql and
 test_other_basic.sas in that order. Independently rerun the existing tests for
compatibility. New suite UUIDs/project names are reserved and synthetic.

The configuration-apply test requires the Excel setup 06/07 and numeric fixtures.
It temporarily adds a constraint to DQ_ENGINE_SETTINGS; never run it against a
shared or production engine. If interrupted, inspect and remove the named test
constraint as documented in that script.

Developer-only checks (Node 24 and unzip; no SAS/Teradata execution):

```sh
node DQ_ENGINE/tools/check_reporting_levels.mjs
node DQ_ENGINE/tools/check_extended.mjs
node DQ_ENGINE/tools/check_outliers.mjs
node DQ_ENGINE/tools/check_config_workbook.mjs
node DQ_ENGINE/tools/check_review_views.mjs
node DQ_ENGINE/tools/check_rule_results.mjs
```

The extended check includes the static check and executes generated Basic
special-value aggregates and all metric insert branches. These are dialect-adapted
queries, not SPL execution.
The static check also executes the generated categorical/identifier aggregate
SELECT logic on synthetic rows using Node SQLite, adapting EXTRACT syntax.
It checks eight unique period keys and the empty-source case.
The review check uses Node 24's built-in SQLite to execute adapted view SELECT
logic on synthetic rows. It checks pivoting, period separation, date-only
summaries, run numbers and completed-run filtering; it does not compile
Teradata SQL or execute SPL.

The workbook check verifies the repository's starter workbook against the
original input audit CSV. It is not part of the SAS loader and is not intended
to approve users' edited workbooks. Tests remain in version control even when
synthetic test tables are removed from a deployed database.

The current runner/classifier require setup/17_create_rule_results.sql and
setup/21_capture_period_dates.sql. Use the current deployment sequence; review
rates are fractions with six decimal places, and POU_DT is the latest actual
reporting date in each group. Internal stored percentage metrics keep their units.
The updated test_colour.sql checks separate rule persistence and idempotence;
review assertions use the compatible DQ_COMPLETED_RESULT colour column.
Local rule checks exercise actual view/INSERT SQL, not Teradata SPL or grants.
See [rule deployment and focused server checks](../documentation/RULE_RESULTS.md).

## Field-level MoM/YoY

Deploy results/94_dq_field_change_review.sql. Run optional test_field_changes.sql
in an isolated engine, with fresh fixture UUIDs; every assertion must return zero
rows. It creates synthetic saved metrics and one small volatile fixture only.
No RDS/configuration reads or profiling calls are required. Run numbers remain
allocated. Review the fixture directly in DQ_FIELD_CHANGE_REVIEW; no SAS
comparison step is required. Server checks have not been executed here.

Local check: `node DQ_ENGINE/tools/check_field_changes.mjs`. This executes the
actual view SQL with narrow SQLite syntax adaptations and checks calendar gaps,
all field types, rate units, zero/NULL values and run/project isolation.

## Bounded outlier working storage

Run `node DQ_ENGINE/tools/check_outlier_storage.mjs` locally. It executes actual
copy/cursor/statistics templates against 415 synthetic fields at settings
1/5/10/15/20/25/30, verifies max-20 copies/max-5 counting and same-copy statistics,
and simulates a rejected load followed by cleanup. Quota/SPL/transaction behavior
is not executed. Follow [the server pilot](../documentation/PERFORMANCE_NOTES.md#working-storage)
for compilation/grants, database-space recovery and controlled 10-field testing.
The current file 03 contains BATCH, SOURCE and STATISTICS, each with its grant.

Numeric Basic batch regression: `node DQ_ENGINE/tools/check_numeric_batching.mjs`
compares generated aggregates at 1/10/15/20/25/30 settings for all 415 numeric
fields, seven reporting scopes, NULL/special/empty populations, and long-SQL
automatic splitting. SQLite dialect adaptation does not verify SPL compilation,
Teradata GROUPING SETS plans, quota, spool or elapsed time.

Wider outlier SQL checks: `node DQ_ENGINE/tools/check_outlier_width.mjs`.
The main outlier checker also compares saved metrics at 5/10/20-field widths;
the storage checker exercises <=10-field prerequisite batches with independent,
unique statistics log IDs. Live SPL compilation and spool measurements remain
required before expanding beyond the controlled 20-field population.

Shared-copy regression: `node DQ_ENGINE/tools/check_shared_numeric.mjs`. It
compares actual generated Basic metrics/statistics/availability from the
original source and shared copies, tests changed-source isolation and bounds,
and checks routing/failure-propagation structure. Teradata SPL control flow,
grants, transaction cleanup and full-run runtime remain unverified locally.

Batch publication regression: `node DQ_ENGINE/tools/check_result_writes.mjs`.
It executes bounded INSERT/UNION ALL statements for every existing profiler
writer and compares them with per-field publication, checking SQL limits, long
field names, empty groups, precise counts/statistics and run/range duplicate
protection. It also reports request counts for the current 589-field selection.
This does not execute Teradata SPL or establish a production runtime gain.

## Reconcile with development results

[compare_numeric_development.sql](compare_numeric_development.sql) compares
DQ_BASIC_REVIEW directly against MDT run IDs 12, 13, 14 and 15 for Numeric Basic/Outliers.
It shows OUR_VALUE, DEV_VALUE, DIFFERENCE and STATUS for each field/period/metric;
rates are fractions and values display to six decimals. Edit the engine
short run number (default 17) and replace DQ_DB in a local copy, then submit the
complete statement in SQL Assistant. See [scope, mappings and interpretation](../documentation/DEVELOPMENT_COMPARISON.md).
Local synthetic regression: `node DQ_ENGINE/tools/check_development_comparison.mjs`.
No profiling rerun or database objects are needed; Teradata execution is unverified.

[compare_categorical_development.sql](compare_categorical_development.sql) uses
the same layout for Categorical Basic. Select a successful run containing that
module. It flags the development team's blank-inclusive missing definition and
special-inclusive distinct definition where relevant. The same local checker
tests both scripts; neither requires a deployment or a profiling rerun.

Wider categorical batches: `node DQ_ENGINE/tools/check_reporting_levels.mjs`
also executes separate enabled-period requests and compares wider results with
the eight-field baseline across all 125 RDS categorical fields, long identifiers,
long special lists and NULL/blank/special cases. It evaluates the production
width expression and checks all reporting-level combinations. The updated
`check_result_writes.mjs` checks categorical metric/availability publication at
20-field width. These are SQLite/template checks; Teradata execution is unverified.
See [deployment and scope](../documentation/PERFORMANCE_NOTES.md#categorical-and-identifier-batch-update).

Wide change review: `node DQ_ENGINE/tools/check_field_changes.mjs` executes file
94 and checks all 112 current/absolute/relative/flag metric columns against internal comparison
rows, dates, statuses, module merging and run/project isolation. It covers
both-zero/zero-baseline movements and the supplied 10%/20% flag boundaries,
and checks that the retired SAS comparison API/switches remain absent.
File 95 is removed; deployment is [documented here](../documentation/FIELD_CHANGES.md).

The same checker executes all 16 SELECTs in
`teradata/review/mom_review_by_metric.sql`, checking flag coverage, metric values,
rate/count context and row-count markers. These user review queries are separate
from isolated fixtures and do not write database objects. See
[manual review/export instructions](../documentation/MOM_MANUAL_REVIEW.md).

Date comparison regression is included in `node DQ_ENGINE/tools/check_development_comparison.mjs`: our run 18 versus MDT date run 21, four metrics, separate result grid, scope isolation and exception handling. See the date schema assumptions in [comparison settings](../documentation/DEVELOPMENT_COMPARISON.md#date-comparison).

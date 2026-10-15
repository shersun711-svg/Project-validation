# Optional validation and performance checks

These files support engine maintenance and verification. Normal users load
Excel and run the engine; they do not need to run this folder on every use.
Replace DQ_DB with the approved test engine database in deployment copies.
SAS tests require the current controller loaded in the same server session.

| File | Purpose |
|---|---|
| `validate_rds.sql` | Read-only source/configuration/population checks |
| `benchmark_numeric.sql` | Read-only EXPLAIN and recorded timing queries |
| `diagnose_outlier_rds_run7.sql` | Run-7 fallback without DBQL: one stage copy, saved bounds, EXPLAIN and optional automatic comparison of old/new 2018 counting; no engine rerun |
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

The run-7 diagnostic is separate from synthetic fixtures: it reads the actual
RDS source once and creates a permanent diagnostic copy in the approved engine
schema. Run section A first and require zero rows. It is specific to the saved
run ID, five fields, specials and reporting scope; do not repoint it at another
run by changing only its run number. Keep EXPLAIN in sections D/D2. Section D3
executes both 2018 counts into small volatile tables and compares all columns,
row counts and duplicate keys; require MATCH and zero differences. Then use
section E to remove only the diagnostic tables successfully created.
See [the no-DBQL workflow](../documentation/PERFORMANCE_NOTES.md#investigate-run-7-without-dbql-access).

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
allocated. To exercise SAS, load the current 01 controller and use file 06 with
the successful fixture run's short number and mom/yoy switches. Require
dq_change_status=SUCCEEDED and inspect WORK.DQ_CHANGE_SUMMARY. Also try a missing
number, a wrong project, the failed fixture run, invalid switches and both N.
The first four must fail; both N must return SKIPPED without a database read.
These SAS/server checks have not been executed here.

Local check: `node DQ_ENGINE/tools/check_field_changes.mjs`. This executes the
actual view SQL with narrow SQLite syntax adaptations and checks calendar gaps,
all field types, rate units, zero/NULL values and run/project isolation.

## Bounded outlier working storage

Run `node DQ_ENGINE/tools/check_outlier_storage.mjs` locally. It executes actual
copy/cursor/statistics templates against 415 synthetic fields at settings
1/5/10/15/20/25/30, verifies max-20 copies/max-5 counting and same-copy statistics,
and simulates a rejected load followed by cleanup. Quota/SPL/transaction behavior
is not executed. Follow [the server pilot](../documentation/OUTLIER_STORAGE_UPDATE.md)
for compilation/grants, database-space recovery and controlled 10-field testing.
The current file 03 contains BATCH, SOURCE and STATISTICS, each with its grant.

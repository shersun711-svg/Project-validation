# Optional validation and performance checks

These files support engine maintenance and verification. Normal users load
Excel and run the engine; they do not need to run this folder on every use.
Replace DQ_DB with the approved test engine database in deployment copies.
SAS tests require the current controller loaded in the same server session.

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

The current runner/classifier require setup/17_create_rule_results.sql.
The updated test_colour.sql checks separate rule persistence and idempotence;
review assertions use the compatible DQ_COMPLETED_RESULT colour column.
Local rule checks exercise actual view/INSERT SQL, not Teradata SPL or grants.
See [rule deployment and focused server checks](../documentation/RULE_RESULTS.md).

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

Run fixture creation, numeric, colour and failure/restart SQL in that order,
then the full SAS execution and SAS reconciliation checks. Use an isolated
test engine: these scripts create and modify synthetic objects/configuration,
and their fixed UUIDs require a fresh fixture deployment. CALL/DDL errors fail
the test; each assertion SELECT must return zero rows. An aborted, skipped or
zero-test execution is not a pass.

The configuration-apply test requires the Excel setup 06/07 and numeric fixtures.
It temporarily adds a constraint to DQ_ENGINE_SETTINGS; never run it against a
shared or production engine. If interrupted, inspect and remove the named test
constraint as documented in that script.

Developer-only checks (Node and unzip; no SAS/Teradata execution):

```sh
node DQ_ENGINE/tools/check_static.mjs
node DQ_ENGINE/tools/check_config_workbook.mjs
```

The workbook check verifies the repository's starter workbook against the
original input audit CSV. It is not part of the SAS loader and is not intended
to approve users' edited workbooks. Tests remain in version control even when
synthetic test tables are removed from a deployed database.

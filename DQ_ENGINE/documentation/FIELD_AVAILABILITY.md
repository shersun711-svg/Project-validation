# Overall field availability

This guide describes an earlier capability upgrade. For current special-value
and percentile deployment, use [the current extension guide](SPECIAL_VALUES_AND_PERCENTILES.md),
which includes the new table/procedure prerequisites and three-procedure run API.


FIRST_AVAILABLE_FACT_DT and LAST_AVAILABLE_FACT_DT in DQ_BASIC_REVIEW describe each selected field's
reporting-date coverage: minimum/maximum FACT_DT (or the configured reporting
date) where that field is non-NULL. They are DATE values, without time, and
appear only on OVERALL rows. Yearly/monthly rows show NULL coverage dates.
If no row has both a non-NULL field and reporting date, both endpoints are NULL.
A non-missing zero is available. Blank/sentinel values remain non-missing under
the engine's existing SQL-NULL definition. Profile counts/periods are unchanged.

Date Basic now provides counts/missing percentage only. No date-field value
extrema are shown. Availability is separate, clearly named
FIRST_AVAILABLE_FACT_DT/LAST_AVAILABLE_FACT_DT in the combined review.
Date counts use the same combined review, with unrelated metrics NULL.
See [latest Date Basic upgrade](DATE_BASIC_UPGRADE.md).

Availability is persisted once per field/run in DQ_FIELD_AVAILABILITY, alongside
existing batched aggregation. It is not recalculated from a live source when
reviewing historical results. Runs completed before the upgrade show NULL
availability; a new profiling run is required. Saved counts and date-value
extrema do not contain enough information to backfill historical coverage.

## Upgrade an existing installation

With no profiling/configuration load active, replace DQ_DB with your approved
engine database (currently LAB_T_ORION_MVT):

1. Run teradata/setup/11_create_field_availability.sql once.
2. Recompile the whole teradata/modules/10_numeric_basic.sql procedure.
3. Recompile the whole teradata/modules/15_other_basic.sql procedure.
4. Recompile both procedures in teradata/modules/00_run_engine.sql separately,
   SP_DQ_RUN_BASIC first and the SP_DQ_RUN_ENGINE compatibility wrapper second.
5. Replace teradata/results/93_dq_basic_review.sql.
6. Run a new test/profile; review its new RUN_NUMBER.

No Excel/SAS change, counter reset, metadata reload or old result deletion is
required. Runtime needs SELECT/INSERT/DELETE on DQ_FIELD_AVAILABILITY; the new
view owner needs required grantable access to that table. Existing schema
scripts and other review views do not need rerunning. Apply this set together
before profiling again; retain previous procedure/view definitions for rollback.
For a fresh installation, create table 11 before views/procedures that use it.

## Performance and tests

Availability adds two conditional reporting-date extrema per field to each
batch. No extra source query is issued solely for coverage. Categorical and
identifier modules cap actual batch size at 20 fields to keep each bounded
UNION part below 10,000 characters and the full SQL below 32,000; smaller
configured batches are respected. Numeric and date modules retain their
configured batch size. Logs show actual batch field counts.

Use a fresh isolated fixture deployment/new fixture UUIDs for the updated
SQL test; old completed fixed IDs cannot be replayed. The existing SAS
non-numeric fixture test can generate a new UUID without recreating sources.
Then inspect the new run's OVERALL review rows:

| Fixture field | Earliest availability | Latest availability |
|---|---|---|
| AMOUNT (if Numeric selected) | 2000-01-31 | 2001-01-31 |
| CATEGORY | 2000-01-31 | 2000-02-29 |
| NULL_CATEGORY | NULL | NULL |
| CUSTOMER_ID | 2000-01-31 | 2001-01-31 |
| EVENT_DATE | 2000-01-31 | 2001-01-31 |
| EVENT_TS | 2000-01-31 | 2000-02-29 |

The fixture's NULL
FACT_DT row contributes to missing/distinct/value metrics and UNKNOWN groups
but does not extend reporting-date coverage.

Local static/generated-SQL/portable-view checks are not Teradata compilation
or SAS execution. Verify conditional date aggregation, the DATE FORMAT-to-text
casts and the updated procedures/view on your server before accepting results.

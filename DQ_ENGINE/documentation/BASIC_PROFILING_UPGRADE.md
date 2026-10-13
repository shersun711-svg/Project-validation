# Basic profiling for all field types

This additive upgrade implements the agreed next scope. It also adds short
run numbers to Teradata review objects without changing internal UUIDs.
No existing results/configuration need deleting. No source DDL is changed.

## Result contract

| Field type | Stored output | Final review |
|---|---|---|
| NUMERIC | Existing ten metrics in DQ_METRIC_RESULT | Existing numeric columns |
| CATEGORICAL | Missing count, missing percentage, distinct count | Three metrics and missing classification |
| IDENTIFIER | Missing count, missing percentage, distinct count | Three metrics and missing classification |
| DATE | Earliest/latest values in DQ_DATE_REVIEW only | EARLIEST_DATE and LATEST_DATE |

All four types support OVERALL, YEARLY and MONTHLY using the project's reporting
date. NULL reporting dates use UNKNOWN period buckets. Categorical/identifier
distinct counts exclude NULL and are calculated independently for every period;
they are not the sum of monthly counts. Only SQL NULL is missing: blank strings
and sentinels are not automatically reclassified. String equality follows the
source column's Teradata case/collation/trailing-space semantics. No category
frequencies, category labels or identifier values are persisted.

Categorical/identifier missing percentage is missing / all source rows x 100.
It uses the existing exact-count colour rules and snapshotted thresholds.
Empty sources emit only an OVERALL row per selected field; missing/distinct
counts are zero, rates are NULL/NOT_EVALUATED. Date extrema are NULL for empty
or all-NULL periods. Date metrics, counts and missing percentages are not added
to DQ_METRIC_RESULT. The run summary includes date fields but reports zero
metric rows and zero colours for DATE_BASIC.

Date extrema are stored as TIMESTAMP(6): DATE values appear at midnight;
ordinary TIMESTAMP values preserve time and microseconds. DQ_BASIC_REVIEW
now displays date-value extrema in the existing MINIMUM/MAXIMUM columns as
YYYY-MM-DD text. EARLIEST_DATE/LATEST_DATE are instead overall reporting-date
availability for each non-missing field. The combined min/max columns use
VARCHAR(64) to display either numbers or dates; numeric storage and numeric-only
view 92 keep numeric types. Apply the [availability upgrade](FIELD_AVAILABILITY.md)
for this change; old runs have no saved coverage dates.
Numeric date encodings
and formatted strings are not automatically parsed. Confirm source DATE fields
support conversion to TIMESTAMP(6); incompatible values fail and are logged.
For TIMESTAMP WITH TIME ZONE, agree and verify the conversion/session timezone
before using this representation: offset information is not preserved.

DQ_DATE_REVIEW is a persistent final-review store, so historical date extrema
stay associated with their original run. DQ_BASIC_REVIEW joins it to successful
run status and combines it with numeric/categorical/identifier metrics. The
review does not recalculate against live source data. Non-applicable columns
are NULL. Categorical/identifier TOTAL_COUNT and NON_MISSING_COUNT are review
context derived from the saved missing-rate denominator/numerator, rather than
additional stored metrics.

## Deploy into your existing engine

Pause profiling/configuration loads while upgrading. Replace every DQ_DB token
with LAB_T_ORION_MVT (or your approved engine schema) in deployment copies.
Use Teradata session mode without an enclosing transaction.

1. Run setup/08_create_date_review.sql once.
2. Run setup/09_add_basic_metrics.sql. It installs/replaces only the two new
   three-metric definitions; Numeric Basic metadata is untouched.
3. Run setup/10_add_run_numbers.sql once. It creates the number mapping/counter
   and backfills existing runs ordered by START_TIME then UUID. Confirm one
   mapping per historical run and counter equal to the largest assigned number.
4. Run setup/11_create_field_availability.sql once; the current procedures/view
   require this table. See FIELD_AVAILABILITY.md for coverage semantics.
5. Compile modules/01_assign_run_number.sql.
6. Compile modules/15_other_basic.sql.
7. Compile modules/20_categorical_basic.sql, 30_date_basic.sql and
   40_identifier_basic.sql, each as a separate complete procedure statement.
8. Recompile modules/10_numeric_basic.sql. Its numerical calculations are
   unchanged; it now isolates numeric field snapshots from other types.
9. Compile modules/00_run_engine.sql. It contains TWO procedures: submit
   SP_DQ_RUN_BASIC first, then the compatibility SP_DQ_RUN_ENGINE separately.
   The latter preserves the original two-argument Numeric Basic SQL interface.
10. Replace results/91_dq_summary_views.sql and 92_dq_numeric_review.sql,
   then deploy results/93_dq_basic_review.sql. File 90 is unchanged.
11. Run the updated sas/01_dq_controller.sas in a new/clean SAS session.
    It prints version 20261012_BASIC_RUN_NUMBER. Use the latest run file 00.

Do not rerun the original table CREATE scripts or change the existing workbook.
The upgrade is intended to be applied as a complete set: the new controller
requires the new procedures and views. Plan a maintenance window and retain
the previous deployed definitions for site-managed rollback.

Runtime needs EXECUTE on the new procedures, SELECT/INSERT/DELETE on date
review and field-availability rows, SELECT/INSERT on number mappings, and SELECT/UPDATE on the counter,
in addition to existing grants. View owners need the required grantable access
to referenced objects. The number-allocation procedure owns a short transaction;
its single counter row is write-locked until the mapping commits, then released
before source aggregation. Test concurrent allocation using two sessions.
No grant changes are executed by this repository.

## Choose fields and modules

The three-sheet Excel layout remains unchanged. The approved FIELD_TYPE and
ACTIVE_IND choose fields for categorical, identifier and date basics.
NUMERIC_BASIC_IND continues to apply only to numeric fields. To limit a
non-numeric module to a sample, set ACTIVE_IND=N for the other fields of that
type, then reload Excel. Selecting a module with no active eligible fields
fails explicitly; turn its switch off when it is not needed.

For non-numeric basics only, edit the settings in sas/00_run_dq_engine.sas:

```sas
%let numeric_basic = N;
%let categorical_basic = Y;
%let date_basic = Y;
%let identifier_basic = Y;
```

Keep numeric_percentiles, numeric_outliers, categorical_psi and export_excel N.
Numeric Basic can also run alongside the new modules. A failed module makes
the whole run FAILED and removes all partial metric/date review rows. Retry a
FAILED internal UUID to refresh configuration and repeat the run; the short
number remains the same. Completed IDs still cannot be overwritten.

## Review in Teradata using a short number

```sql
SELECT L.RUN_ID,N.RUN_NUMBER,L.PROJECT_ID,L.STATUS,L.START_TIME,L.END_TIME
FROM LAB_T_ORION_MVT.DQ_RUN_LOG L
LEFT JOIN LAB_T_ORION_MVT.DQ_RUN_NUMBER N ON L.RUN_ID=N.RUN_ID
WHERE L.PROJECT_ID='RDS'
ORDER BY L.START_TIME DESC;

SELECT *
FROM LAB_T_ORION_MVT.DQ_BASIC_REVIEW
WHERE PROJECT_ID='RDS' AND RUN_NUMBER=12 AND PERIOD_LEVEL='OVERALL'
ORDER BY FIELD_TYPE,FIELD_NAME;
```

Replace 12 with your number. RUN_NUMBER is also present in DQ_COMPLETED_RESULT
and DQ_NUMERIC_REVIEW/DQ_RUN_SUMMARY. Filter historical numeric-only runs with either review
view. The UUID remains RUN_ID in storage/API calls; RUN_NUMBER is the readable
numeric identifier. SAS returns dq_run_number alongside dq_run_id.

Numbers are global across projects, start at 1 for an empty engine and count
historical/failed runs too. They are not field or project numbers. Never reset
DQ_RUN_COUNTER or delete DQ_RUN_NUMBER mappings during test/result cleanup;
this prevents number reuse. Deleting old results may leave gaps in visible
numbers. Backfill order resolves equal timestamps by UUID, not by an invented
historical execution order.

## Verification and limits

In an isolated test engine, run tests/01_create_other_basic_fixture.sql then
tests/test_other_basic.sql and tests/test_other_basic.sas. Also rerun the existing
numeric, colour, failure/retry and controller tests to check compatibility.
The new SQL assertions cover mixed execution, independent switches, NULL and
empty populations, distinct counts, DATE/TIMESTAMP extrema, period separation,
date exclusion from profiling metrics and cleanup/retry after a late failure.
SAS checks exercise non-numeric-only execution, summaries and a short number.
No local SAS/Teradata execution is claimed.

Categorical/identifier aggregation now uses separate overall/yearly/monthly
SELECTs with ordinary GROUP BY, combined by UNION ALL and literal period flags.
The user's DISTINCT/GROUPING SETS diagnostic returned fourteen rows with all
flags equal to 1, causing duplicate OVERALL result keys; that combination is
no longer used for these modules. Numeric/date aggregation retains GROUPING
SETS. Validate the revised ordinary distinct aggregates and volatile CTAS on
your installed release. The CAST to BIGINT
preserves returned distinct counts but does not widen the aggregate's internal
range; confirm that range accommodates your population. Distinct aggregation can need additional sorting/spool and references the source
three times per batch. Keep the source stable across period queries and batches;
physical scan sharing is optimizer-dependent. Benchmark batch size against actual workloads.
Verify TIMESTAMP conversions, run-number transaction/locking behaviour, invoker
permissions and view ownership on the server. Local template/structure checks
cannot validate these features.


## Repair for the reported categorical uniqueness failure

For an installation already upgraded, fetch the latest
teradata/modules/15_other_basic.sql, replace DQ_DB, and recompile that whole
procedure. No table/index change or metric-metadata reset is required. Rerun
 tests/test_other_basic.sas in the same SAS session, with the updated controller
loaded. It generates a fresh run UUID; the failed run remains logged.
For the fixture, the successful non-numeric-only run should have 72 metric
rows, 16 date-review rows and 40 combined review rows, covering five fields.
The portable aggregation checks do not establish live Teradata correctness.

If an earlier UNION revision fails compilation with SPL1026/E3798 (expression
larger than the maximum), use the newer file with V_OVERALL, V_YEARLY and
V_MONTHLY VARCHAR(10000) parts. The final assembly has bounded declared lengths,
and a pre-assignment guard rejects oversized actual parts rather than truncating
SQL. Local checks cover both length bounds. Recompile the complete procedure
successfully before rerunning the SAS test; a failed REPLACE leaves the old
procedure deployed.

# Bounded outlier working storage

For the latest combined-run flow, helper compile order and timing interpretation,
see [shared numeric copy](SHARED_NUMERIC_COPY.md). Earlier benchmarks below
refer to the pre-sharing flow.

The user's full RDS run 9 failed with error 2644, "No more room in database
Lab_T_Orion_MVT", during preparation from 17:25:30 to 17:32:10 on 15 October
2026. The previous code copied all 415 numeric fields before counting. This is
permanent database space exhaustion, distinct from the earlier 2646 spool error.

## Current processing cycle

Use the existing Excel SQL_BATCH_SIZE setting; no new setting or table is added.

| SQL_BATCH_SIZE | Maximum numeric fields copied together | Fields per counting query |
|---|---:|---:|
| 5 | 5 | 5 |
| 10 | 10 | Up to 10 |
| 15 | 15 | Up to 15 |
| 20 | 20 | Up to 20 |
| 25 or 30 | 20 | Up to 20 |

The calculation uses up to the copied width, automatically splitting if its
SQL fragments would exceed their safe length budget. Smaller settings remain
supported. Numeric Basic now allows up to 20 fields per aggregate with automatic
SQL-length splitting; see [Basic update](NUMERIC_BASIC_UPDATE.md).

For size 10, copy ten numeric fields plus the reporting date, calculate fields
1-10 together if SQL length permits, drop the copy, and load the next ten fields. Only one copy
exists per invocation at a time. With 415 fields this means 42 copies at size
10, 28 at 15, or 21 at 20, instead of one full-width copy. Each copy retains
native values, NULLs, duplicate rows, random distribution and year partitioning.
No filtering, sampling or precision reduction is introduced.

Counting retains the faster CROSS JOIN for populated year chunks and the outer
join for the empty-source sentinel. Wider counting can increase spool;
benchmark it independently of working-copy storage. Population deviation, +/-3 bounds, special-value
exclusions, periods, metrics and publication rules are unchanged.

If Basic already supplied statistics in this run, reuse them as before.
Outliers-only runs calculate statistics for each counting batch against the
same immutable small copy, using the shared bounded helper. They do not read
unprojected fields or rescan the original source for those statistics.

This bounds copy width, not bytes or rows. A single 10-field copy still requires
enough free permanent space, and the source SELECT can require spool. Source and
configuration must remain stable while processing groups. More source copies
can add elapsed time; a full-run speedup is not claimed. Test storage and timing
at 10 first, then consider 15/20 if capacity permits.

For the latest counting-width deployment and benchmark, see
[20-field calculations](OUTLIER_WIDTH_UPDATE.md).

## Deployment and recovery

1. Confirm the failed run and its database requests have stopped. Do not restart
   profiling while changing procedures. Inspect the exact work-table name in
   NUMERIC_OUTLIERS batch 0 SQL_TEXT for the failed run. If that old copy remains
   listed, remove only that identified abandoned table. Never drop by wildcard
   or remove a table from an active run. No engine/result table drop is required.
2. Replace DQ_DB with LAB_T_ORION_MVT (or the approved schema) in deployment
   copies. Recompile all three procedures in modules/03_numeric_statistics.sql,
   separately and in order, executing each included grant immediately:
   SP_DQ_NUMERIC_STATS_BATCH, SP_DQ_NUMERIC_STATS_SOURCE, SP_DQ_NUMERIC_STATISTICS.
   The five-argument SOURCE and two-argument STATISTICS APIs remain compatible.
3. Recompile the complete modules/12_numeric_outliers.sql and its grant.
   No table migration, Basic procedure, rule/view change or SQL runner
   recompilation is needed for this storage fix.
4. Set SQL_BATCH_SIZE=10 in your edited Excel workbook and reload with file 04;
   require APPLIED. Preserve your field/special selections. Use a controlled
   10-field pilot before restoring all 415 numeric fields.
5. Run with numeric_outliers=Y. Basic may be Y for a combined run or N for an
   outliers-only test. Confirm SUCCEEDED, review values, and record preparation,
   counting and total minutes before widening the field selection/copy size.

The failed full run does not count as a successful baseline. Its shared error
handler removes partial metrics/statistics/availability; a SUCCEEDED Basic
module log alone does not publish those results. Retrying the failed UUID
restarts the requested modules; it does not resume after the completed Basic
stage. Consider a separate successful Basic-only baseline while testing outliers
so a later outlier failure cannot discard a different run's published results.

## Progress and cleanup

Batch 0 remains the overall module summary until every counting batch finishes.
Batch 1 is now logged before the first copy is loaded. First counting batches
in a group include copy time; subsequent batches reuse the same copy. FIELD_COUNT
reports the accepted calculation width (at most 20), not necessarily copy width.

Copies use DQ_OS_<UUID without hyphens>_A<attempt>_B<first counting batch>.
Batch 0 retains the current copy's creation/load SQL and identity for recovery;
counting rows subsequently show counting SQL. Retained SQL_TEXT identifies a
phase but is not proof that the statement is still executing.

The code creates an empty table WITH NO DATA, marks it owned, then inserts rows.
A handled INSERT failure can therefore drop the owned table. Completed groups
release space before the next group. A failed CREATE never drops an unowned
existing table. Session termination can still bypass SPL cleanup.

Standalone statistics have their own monotonically increasing batch IDs:
a 20-field counting batch may require two ten-field statistics batches. Its summary completes
only after the final numeric field is processed; summary wall time includes
the intervening outlier work and must not be added to parent/module timings.

## Validation limits

Run tools/check_outlier_storage.mjs, tools/check_outliers.mjs and
tools/check_outlier_width.mjs with Node.
Synthetic checks cover 415 fields at settings 1/5/10/15/20/25/30, bounded cursors,
one copy at a time, native values/duplicates, same-copy statistics, unique names,
and simulated load-failure cleanup. Existing counting checks cover reporting
levels, NULL/special values, strict bounds, duplicate keys and decimal dates.

No live Teradata/SAS access is available. SPL compilation, permanent-space use,
CREATE/INSERT transaction behavior, quota-failure cleanup, grants and full RDS
runtime remain unverified on the server. The local tests do not establish that
10 or 20 fields fit the current database quota.

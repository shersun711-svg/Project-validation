# Performance and workload

Calculations and any raw staging stay inside Teradata; SAS reads configuration,
logs and aggregated summaries. Execution is sequential and respects the site's
workload management. The source view's existing filters and row multiplicity
are retained. Keep source and configuration stable during execution.

| Module | Effective maximum fields per batch | Source access |
|---|---:|---|
| Numeric Basic | 10 | One aggregate statement using GROUPING SETS |
| Categorical Basic | 8 | Three explicit overall/year/month queries using UNION ALL |
| Identifier Basic | 20 | Three explicit period queries using UNION ALL |
| Date Basic | 30 | One aggregate statement using GROUPING SETS |

SQL_BATCH_SIZE remains configurable from 1 to 30; effective size is the lower
of the setting and module cap. Special lists increase generated query size;
length guards reject oversized SQL rather than truncating it. Lower the setting
or shorten lists if needed. Caps bound SQL text and are not measured optimal
batch sizes. With 50 numeric fields and the default setting, Numeric Basic uses
5 Basic batches.

Basic modules aggregate compatible statistics together, then persist results
from small volatile aggregates. Numeric Basic emits 12 metrics and categorical
5; date and identifier emit 4 and 3. Availability is calculated in the same basic
aggregate and requires no separate source scan.

Categorical/identifier use ordinary GROUP BY with literal period flags because
the user's DISTINCT/GROUPING SETS query returned duplicate period keys. Three
source references do not imply exactly three physical scans: check EXPLAIN on
the actual logged statement. Distinct aggregation can require substantial spool.

Run numbering locks its small counter only before profiling.

## Benchmarking

Use tests/benchmark_numeric.sql and saved DQ_MODULE_LOG.SQL_TEXT. Record module
and batch elapsed minutes and approved DBQL CPU, I/O, spool and AMP skew metrics.
Compare settings 1, 5, 8 and 10 using new run UUIDs, the same active fields,
same stable population and same workload. Values above a module cap do not
increase that module's batch size. Require result equivalence before comparing
speed. Explain the logged aggregate queries on the installed release
and confirm sufficient spool before broad RDS use. No timing, spool or throughput
benchmark of this extension has been executed here.

## Controlled source staging

For the complex RDS view, an approved immutable projection of the final view
may reduce repeated joins/windows and ensure a consistent population. Benchmark
this before adoption. Preserve all final-view filters and duplicates; add no
extra WHERE/DISTINCT. Candidate (AGMT_ID,FACT_DT) uniqueness is not assumed.
Include materialization, statistics and retention cost in the comparison.

Use a separate test project pointing to a DBA-approved persistent stage, with
the same fields, settings and special lists. Do not mutate production source
configuration for benchmarking. A permanent stage survives separate SAS
sessions; a manually created volatile stage does not. This manually managed benchmark stage is separate from the
automatic outlier work table described below.

## Numeric Outliers

Outliers materialize the final source view once into a narrow MULTISET work table
in the engine schema, projecting the reporting date and selected numeric fields
without source-column casts, filters or deduplication. It uses permanent space,
with a stored year partition key (0 for NULL dates) and an independent random
bucket as its nonunique primary index. Internal keys preserve all source rows
and values. Partition/year statistics are collected once after loading. Counting
queries constrain the stored partition key directly instead of extracting the
year from every staged row for every batch. Standalone statistics and counting
queries read that table;
Basic statistics remain reusable as before.

Outliers aggregate one calendar year at a time, grouping each year's rows into
monthly summaries while counting against the overall, yearly and monthly bounds.
This bounds each aggregate's input period instead of combining all history in one
GROUPING SETS statement. At 415 numeric fields and 22 populated years, it is
roughly 1,900 year-chunk and rollup statements across 83 batches (SQL_BATCH_SIZE
5), versus about 21,165 month-level statements in the earlier loop. This is a
query-count estimate; runtime, source scans and spool depend on Teradata's
optimizer. Confirm that each counting request eliminates the other year
partitions. The new layout adds distribution, partition storage and statistics
cost during staging; measure total elapsed time, not just chunk timing.
Standalone statistics use the selected sequential aggregates capped at ten
fields. Materialization itself may exhaust view spool; runtime, permanent space,
I/O and AMP distribution require EXPLAIN/DBQL on the installed release.
Use tests/test_outlier_partition.sql first to check the physical DDL and partition
predicates on eight synthetic rows before a controlled five-field RDS comparison.

Names include run UUID and attempt. The work table is dropped on success/handled
failure. External abort/session loss can leave an orphan; batch-0 SQL_TEXT retains
its exact creation SQL for targeted recovery after the request has stopped.
No measured speed/spool improvement or server compilation is claimed. See
[Numeric Outliers](NUMERIC_OUTLIERS.md#upgrade-an-existing-outlier-deployment-after-error-2646)
for the helper/wrapper compile order, privileges and working-data cleanup.

## Configurable reporting levels

Only selected Basic grouping sets/period queries and standalone statistics passes
are executed. Outliers skip disabled comparison branches and rollups. Year chunks
still schedule reads when YEARLY reporting is off; a small run-owned calendar
is populated from the stage once. This does not establish a runtime improvement.
RDS uses overall/monthly, with yearly disabled; benchmark the selected scope
against the same population. See [reporting levels](REPORTING_LEVELS.md).

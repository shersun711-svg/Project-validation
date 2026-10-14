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
without casts, filters or deduplication. It uses permanent space and NO PRIMARY
INDEX. Standalone statistics and all subsequent counting queries read that table;
Basic statistics remain reusable as before.

Counting filters to one reporting month (or NULL-date rows) per statement,
calculates counts against every applicable OVERALL, YEARLY or MONTHLY target
bound, and rolls those month counts up. Batches are capped at five fields.
Standalone statistics use three sequential aggregates capped at ten fields.
The work table is scanned once for each month in each applicable target period,
so the smaller statements can increase total elapsed time across long histories.
Materialization itself may exhaust view spool; measured runtime, permanent space,
I/O and AMP distribution require EXPLAIN/DBQL on the installed release.

Names include run UUID and attempt. The work table is dropped on success/handled
failure. External abort/session loss can leave an orphan; batch-0 SQL_TEXT retains
its exact creation SQL for targeted recovery after the request has stopped.
No measured speed/spool improvement or server compilation is claimed. See
[Numeric Outliers](NUMERIC_OUTLIERS.md#upgrade-an-existing-outlier-deployment-after-error-2646)
for the helper/wrapper compile order, privileges and working-data cleanup.

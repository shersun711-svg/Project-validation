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
| Numeric Percentiles | 5 | One source materialization into a volatile table |

SQL_BATCH_SIZE remains configurable from 1 to 30; effective size is the lower
of the setting and module cap. Special lists increase generated query size;
length guards reject oversized SQL rather than truncating it. Lower the setting
or shorten lists if needed. Caps bound SQL text and are not measured optimal
batch sizes. With 50 numeric fields and the default setting, Numeric Basic uses
5 batches and Percentiles uses 10 batches.

Basic modules aggregate compatible statistics together, then persist results
from small volatile aggregates. Numeric Basic emits 12 metrics and categorical
5; date and identifier emit 4 and 3. Availability is calculated in the same basic
aggregate and requires no separate source scan.

Categorical/identifier use ordinary GROUP BY with literal period flags because
the user's DISTINCT/GROUPING SETS query returned duplicate period keys. Three
source references do not imply exactly three physical scans: check EXPLAIN on
the actual logged statement. Distinct aggregation can require substantial spool.

Percentiles materialize up to five cleaned numeric fields and reporting date
per batch into a MULTISET volatile table, preserving duplicates. Each field's
valid rows expand into overall/yearly/monthly populations. One ordered volatile
table supplies ranks and counts for all seven quantiles; persistence expands
ordered rows against seven metadata rows. No source scans are done for each
quantile. This adds raw spool and sorting and can be substantially slower than
Basic profiling. Basic and Percentiles do not currently share source staging.
Volatile tables are dropped after each batch and cleaned on module failure.
Run numbering locks its small counter only before profiling.

## Benchmarking

Use tests/benchmark_numeric.sql and saved DQ_MODULE_LOG.SQL_TEXT. Record module
and batch elapsed minutes and approved DBQL CPU, I/O, spool and AMP skew metrics.
Compare settings 1, 5, 8 and 10 using new run UUIDs, the same active fields,
same stable population and same workload. Values above a module cap do not
increase that module's batch size. Require result equivalence before comparing
speed. Explain the percentile materialization/rank query on the installed release
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
sessions; a manually created volatile stage does not. The engine does not
manage a permanent raw-data staging lifecycle.

## Numeric Outliers

Outliers cap batches at five fields and use three explicit period source
references plus small bounds/aggregate volatile tables. No raw source staging
or rank sorting is introduced. Basic supplies full FLOAT statistics through
DQ_NUMERIC_STATISTICS; standalone Outliers calculates a prerequisite aggregate
in batches capped at ten. Actual scans/spool depend on the view and optimizer.
No throughput/spool benchmark has been executed here. The percentile spool
error reported by the user is separate and is not fixed by this extension.

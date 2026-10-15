# Validation evidence

Local developer checks execute generated Basic and Outlier queries on synthetic
SQLite data after narrow dialect adaptation. They check special-value exclusions,
unchanged NULL counts, all 12 numeric/5 categorical metric branches, exact rate
numerators/denominators, period separation, successful-only review, +/-3 outlier
boundaries, empty/insufficient populations and unrounded statistics reuse.
Workbook checks preserve all 589 source mappings and the four configuration sheets.
These checks do not compile Teradata SPL or execute SAS.

The user previously reported successful Numeric Basic and mixed-type RDS runs
with sampled results checked, and successful Excel configuration loads. The current
special-value Basic test on 20 numeric/9 categorical fields subsequently succeeded
according to the user, who checked its results. The user deployed Outliers and
reported error 2646 (no more spool space), including a five-field attempt with
SQL_BATCH_SIZE=1. No successful RDS outlier run is claimed. Supplied SQL/SAS
validation suites and the revised procedures remain unverified on the server.

Verify installed-release syntax, source type compatibility, grants, transactional
application, cleanup/retry, count ranges, spool and execution time on the server.
No full RDS source reconciliation or performance acceptance has been established.

The manager's current scope excludes the retired distribution module. Its code,
SAS switch, review columns and test cases were removed. No stored database history
or running job was modified. Earlier evidence is retained in Git history
for audit context; its instructions are not current deployment steps.

The 2026-10-14 outlier calculation changes were checked locally against synthetic
data: 180 field/period/metric results match independent +/-3 population-deviation
reference calculations; batching one versus five fields produces identical
results; empty populations, UNKNOWN dates and valid rate denominators remain
correct. All 36 standalone period statistics agree with independent calculations.
The next procedure revision processes one reporting year at a time, groups its
rows into monthly summaries and then rolls up overall/yearly/monthly results.
This follows the latest reported spool failure in the all-period aggregate.
Local synthetic checks validate the generated year-chunk and rollup results,
including specials, NULL dates, empty populations, bounds and rate denominators.
These checks do not compile Teradata SPL or establish that year-sized chunks fit
the site's spool limit. Teradata compilation, optimizer choices, spool use,
elapsed time and workload remain unverified.

The user subsequently reported RDS run number 4 failing with 7693 at the
explicit duplicate-period guard after about 31 minutes; its log shows the
year-chunk implementation reaching the final DQ_NO_CHUNKS rollup, not a 2646
spool failure. The first UNION branch left PERIOD_VALUE as the untyped literal
'ALL'. All rollup keys and chunk keys now have explicit widths to avoid
truncation during type resolution. Local checks additionally cover 360 metrics
across multiple years and 90 metrics with only NULL reporting dates. Generated
SQL checks enforce the explicit widths because SQLite does not enforce VARCHAR
lengths. A five-row Teradata regression, tests/test_outlier_rollup.sql, is
generated from the procedure's actual rollup template; locally it produces ten
distinct full period keys and the expected counts. Its execution on Teradata,
the precise truncation diagnosis and a successful RDS rerun remain unverified.

The focused rule-storage change reuses SP_DQ_CLASSIFY/DQ_COLOUR_RULE and leaves
profiling calculations untouched. Synthetic SQLite checks execute the evaluator,
INSERT and completed-result view, covering exact threshold boundaries, rounded
display values, undefined/invalid input reasons, captured thresholds, run/project/
period isolation, repeated evaluation, legacy-colour fallback and unchanged
profiling rows. Guard SELECTs and cleanup structure are checked locally; SPL
SIGNAL/transaction behaviour, grants and the supplied server fixtures still need
Teradata execution. No historical rule backfill or reporting module was added.

After the sequential outlier test exceeded 30 minutes, the user confirmed the
request issue was resolved and requested an update. The next version materializes
a narrow native-type source projection once, then reuses it for standalone
statistics and counting. Generated CTAS/projection SQL was tested on synthetic
SQLite data: rows/duplicates remain unchanged, and deleting the original source
after projection leaves all 180 outlier results and 36 statistics correct.
Run/attempt naming, creation-before-statistics, owner-reference grant and targeted
cleanup paths were checked in the source. These do not test Teradata NOPI/DDL,
physical storage, privileges, hard-abort cleanup or performance. The uploaded
development-team procedure was reviewed as a reference only; no code was copied,
and its population-deviation formula has now been adopted for Numeric Basic and
Outlier calculations. The local outlier check enforces DQ_METRIC_RESULT's unique
field/module/period/metric key and confirms one rollup row per period key. The
procedure reports duplicate rollup keys or pre-existing field results before
insertion and saves the generated metric INSERT in batch SQL_TEXT. These local
checks do not identify the cause of the user's reported Teradata error without
that run's module log. Its code was not copied.

The user subsequently reported a successful outlier RDS run with the explicit
period-width fix, while reporting that runtime remained too slow. The new
reporting-level extension has not been deployed or tested on SAS/Teradata here.
Local generated-query checks cover all seven nonempty scopes for four Basic
types, standalone statistics and outliers, including empty populations, NULL
reporting dates, specials, unchanged selected metrics and field availability.
The starter workbook preserves all 589 mappings and adds Y/Y/N level defaults.
Server tests for captured settings, all-N rejection and transactional application
are supplied in tests/test_reporting_levels.sql; these are not claimed executed.

The partitioned outlier-stage change is checked locally against generated SQL:
source values and duplicate multiplicity are preserved, NULL reporting dates
map to year key 0, internal names avoid source-field collisions, and all seven
reporting scopes return the independently calculated outlier metrics. Multiple
years and timestamp dates are covered. Disabled yearly comparisons and joins
are absent from the generated count query. The server preflight is generated
from the actual CTAS/statistics templates and includes year keys 0, 1 and 9999.
SQLite cannot test Teradata RANGE_N, random-row distribution, partition
elimination, COLLECT STATISTICS, SPL or grants. No server compilation, measured
runtime gain or spool reduction is claimed; test_outlier_partition.sql and the
same-population five-field benchmark remain required server checks.

On 2026-10-15 the user supplied matching synthetic partition-test counts and
both EXPLAIN outputs showing single-partition access (2005 and NULL-date key 0).
The user then supplied successful RDS run-7 logs: Basic 3.58 minutes, Outliers
21.96 minutes including 21.07 minutes in field batch 1. The saved CTAS confirms
that run used the partitioned stage. This verifies user-reported completion and
the synthetic access path, not the full counting query's plan or performance
acceptance for 589 fields. The run-7 no-DBQL diagnostic uses the current generated
stage/bounds/count SQL, with local checks that mismatched saved metadata is
reported before materialization. It does not execute RDS counting; the actual
Teradata EXPLAIN and physical bottleneck remain to be reviewed.

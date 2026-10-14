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
or running job was modified. Earlier evidence is retained in Git history and the history/ directory
for audit context; its instructions are not current deployment steps.

The 2026-10-14 outlier calculation changes were checked locally against synthetic
data: 180 field/period/metric results match independent +/-3 population-deviation
reference calculations; batching one versus five fields produces identical
results; empty populations, UNKNOWN dates and valid rate denominators remain
correct. All 36 standalone period statistics agree with independent calculations.
The revised procedure uses three direct period-level aggregates (overall,
yearly and monthly) against the narrow staged rows and captured bounds, replacing
the failed all-period GROUPING SETS aggregate. It performs three grouped stage
references per five-field batch rather than one query per month. The largest
generated query with five 128-character field names and the complete configured
special list is below 32,000 characters. Synthetic checks validate the generated
period results and unchanged +/-3 population-deviation calculations. This is not
Teradata evidence: compilation, optimizer choices, spool use, elapsed time and
workload remain unverified.

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

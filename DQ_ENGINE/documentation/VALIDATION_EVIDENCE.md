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

The 2026-10-14 spool optimisation was checked locally against synthetic data:
180 field/period/metric results match independent +/-3 sample-deviation reference
calculations; batching one versus five fields produces identical results; empty
populations, UNKNOWN dates and valid rate denominators remain correct. All 36
standalone period statistics agree with independent calculations. Generated SQL
uses sequential period queries for counting and three separate statistics passes;
the largest checked five-field counting query with 128-character field names and
the complete configured special list is below 32,000 characters. These are
SQLite/static checks, not Teradata optimizer, compiler or workload evidence.

The focused rule-storage change reuses SP_DQ_CLASSIFY/DQ_COLOUR_RULE and leaves
profiling calculations untouched. Synthetic SQLite checks execute the evaluator,
INSERT and completed-result view, covering exact threshold boundaries, rounded
display values, undefined/invalid input reasons, captured thresholds, run/project/
period isolation, repeated evaluation, legacy-colour fallback and unchanged
profiling rows. Guard SELECTs and cleanup structure are checked locally; SPL
SIGNAL/transaction behaviour, grants and the supplied server fixtures still need
Teradata execution. No historical rule backfill or reporting module was added.

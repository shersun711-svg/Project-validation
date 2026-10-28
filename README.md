# DQ Engine — team reuse

SAS/Teradata scripts and operating guidance for profiling, saved-result
comparison, field-level MoM/YoY and separate account-level checks.

Start with the [team handover guide](DQ_ENGINE/documentation/TEAM_HANDOVER.md)
for the file map and the settings to change for another project. Follow the
[deployment sequence](DQ_ENGINE/documentation/README.md#one-time-deployment)
for a new engine installation.

| Component | Location |
|---|---|
| SAS configuration loading and profiling | [DQ_ENGINE/sas](DQ_ENGINE/sas/) |
| Teradata setup, modules and result views | [DQ_ENGINE/teradata](DQ_ENGINE/teradata/) |
| Numeric, categorical and date comparisons | [DQ_ENGINE/comparisons](DQ_ENGINE/comparisons/) |
| MoM/YoY calculation and review view | [94_dq_field_change_review.sql](DQ_ENGINE/teradata/results/94_dq_field_change_review.sql) |
| Per-metric MoM export queries | [mom_review_by_metric.sql](DQ_ENGINE/teradata/review/mom_review_by_metric.sql) |
| Account-level runner and macros | [06 runner](DQ_ENGINE/sas/06_run_account_checks.sas), [07 macros](DQ_ENGINE/sas/07_account_checks.sas) |
| Input configuration templates | [DQ_ENGINE/config](DQ_ENGINE/config/) |
| Operating guidance | [DQ_ENGINE/documentation](DQ_ENGINE/documentation/) |

This branch contains scripts, guidance and input configuration templates.
Test suites, developer test tools and exported review results are excluded.
The configuration examples and comparison defaults still refer to RDS; change
project/source/field settings, connections, dates, thresholds, special values,
MDT table names and run IDs before using them for another project.

The categorical comparison includes `BLANKCOUNT`, original and adjusted
values, and the remaining difference. Numeric, categorical and date comparisons
return separate result grids.

The engine and script contents are taken from source commit
`fe7fbe7b2691b5996c865ff878f61afb6009298f`; comparison files are relocated into
`comparisons/`. Packaging does not establish that another project's
environment or results have been validated. See the
[metric dictionary](DQ_ENGINE/documentation/RESULTS_DICTIONARY.md) and
[handover limitations](DQ_ENGINE/documentation/TEAM_HANDOVER.md#scope-and-limits).

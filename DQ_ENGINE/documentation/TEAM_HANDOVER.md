# DQ Engine team handover

This branch packages the current SAS/Teradata DQ engine, saved-result comparison
queries, field-level MoM/YoY review and separate account-level checks for reuse
on another project. It starts from `feature/dq-engine-phase1-2`, commit
`fe7fbe7b2691b5996c865ff878f61afb6009298f`, on 28 October 2026.

The executable script contents are inherited unchanged from that snapshot;
comparison scripts are moved into `DQ_ENGINE/comparisons/`. This branch contains
operating scripts, guidance and input configuration templates. Test suites,
developer test tools and exported review results are excluded from its file tree.
RDS workbook contents, source names and run IDs are examples to replace for a new project.

## Find the right component

| Component | Entry points | Instructions |
|---|---|---|
| Engine deployment | [Teradata setup](../teradata/setup/), [profiling modules](../teradata/modules/), [result views](../teradata/results/) | [Exact fresh-install order](README.md#one-time-deployment); existing installations use the applicable upgrade guide |
| Configuration and profiling | [01 controller](../sas/01_dq_controller.sas), [05 Excel loader](../sas/05_dq_excel_config.sas), [04 load configuration](../sas/04_load_dq_config.sas), [00 run profiling](../sas/00_run_dq_engine.sas) | [Excel configuration](EXCEL_CONFIGURATION.md), [project settings and selection](CONFIGURATION_GUIDE.md) |
| Numeric comparison | [compare_numeric_development.sql](../comparisons/compare_numeric_development.sql) | [Comparison definitions and settings](DEVELOPMENT_COMPARISON.md) |
| Categorical comparison | [compare_categorical_development.sql](../comparisons/compare_categorical_development.sql) | Includes MDT `BLANKCOUNT`, original values, adjusted values and residual differences |
| Date comparison | [compare_date_development.sql](../comparisons/compare_date_development.sql) | Separate result grid; counts and missing rate only |
| Field-level MoM and YoY | [94_dq_field_change_review.sql](../teradata/results/94_dq_field_change_review.sql) | [Field-change definitions and use](FIELD_CHANGES.md); reads saved monthly results |
| Per-metric MoM exports | [mom_review_by_metric.sql](../teradata/review/mom_review_by_metric.sql) | [Manual MoM review](MOM_MANUAL_REVIEW.md); this export helper covers MoM, while view 94 provides both MoM and YoY |
| Account-level checks | [07 account macros](../sas/07_account_checks.sas), [06 account runner](../sas/06_run_account_checks.sas) | [Account operation and deployment](ACCOUNT_CHECKS.md); run separately from profiling file 00 |
| Account persistence and review | [22 account tables](../teradata/setup/22_create_account_results.sql), [96 account views](../teradata/results/96_dq_account_review.sql), [account_review.sql](../teradata/review/account_review.sql) | Filter results by project and the account execution's short run number |

## Adapt to a new project

1. Use the [deployment instructions](README.md#one-time-deployment) for a new
   engine schema. Replace every `DQ_DB` token in deployment copies, including
   tokens inside dynamic SQL, with the selected engine database. Deploy account
   tables/views separately if account checks are required.
2. Copy the [profiling workbook](../config/DQ_RDS_config.xlsx) for the new
   project. Preserve the required sheet/header layout. Set project ID, source
   database/table, account key and reporting-date mapping, field names/types,
   active selections, reporting levels, special-value lists and thresholds.
   Replace the RDS field inventory with the new project's inventory.
3. Set approved SAS connection settings and server-accessible workbook paths in
   the configuration loader and runners. Set the new project in profiling file
   00. Load macros/configuration in the order described in
   [everyday use](README.md#everyday-use), require configuration status APPLIED,
   select the modules and retain the successful short run number.
4. For field changes, use view 94 with the new project and successful profiling
   run numbers. Update every project/run filter in the manual MoM helper.
   Monthly profiling must be enabled to obtain monthly comparisons. MoM/YoY
   flags are review candidates, not automatic findings.
5. For account checks, copy the [account-field workbook](../config/DQ_RDS_account_fields.xlsx),
   replace the selected fields and limits, and set the workbook path and date
   window in file 06. Change its `project=RDS` macro argument to the new project.
   The supplied workbook retains 24 RDS fields with categorical/date selections
   active and numeric fields paused; make the new project's selections explicit.
   Review the resulting account execution independently of profiling runs.
6. For development comparisons, set `PROJECT_ID`, `OUR_RUN_NUMBER` and the MDT
   run ID(s) in each query, and change the MDT result-table names if needed.
   The checked-in `IRB_RDS_DQ_*_PROFILE_RESULT` tables are RDS-specific.
   Verify the other project's saved-result schema, population, periods, units,
   special values and missing-value definitions before interpreting matches.
   Run categorical and date comparisons separately.
7. Store each new project's evidence and explanations separately. Historical
   RDS findings and exported result workbooks are not included in this branch.

Connection defaults such as `dwhprod`, `TeraAuth` and `LAB_T_ORION_MVT` are
environment-specific examples. Credentials are supplied through approved SAS
authentication, not embedded in the workbooks.

## Comparison settings in this snapshot

| Query | Our run | MDT run(s) |
|---|---:|---|
| Numeric | 17 | 12, 13, 14, 15 |
| Categorical | 18 | 20 |
| Date | 18 | 21 |

MDT categorical missing counts already include blanks. The categorical query
compares our NULL-only missing count plus MDT `BLANKCOUNT` with MDT missing
count, adjusts non-missing counts and recomputes missing rates from counts.
It preserves original values/differences. A reconciled match is
`MATCH_AFTER_BLANK_ADJUSTMENT`; residual differences remain flagged.
Distinct special-value differences retain their separate definition warning.

## Scope and limits

The input workbooks and CSV configuration examples under `config/` are
templates required for configuration; they are not test fixtures or output
results. Replace their RDS contents before using them for another project.

This branch does not include test suites, test helpers, result exports or
historical validation-result documents. Some detailed operating guides retain
links to historical test/validation material; those links point to the source
snapshot on GitHub rather than files in this branch.

No new SAS/Teradata execution or other-project data validation has been performed
for this packaging change. Use the documented deployment and a representative
project test before wider use. PSI and automatic Excel report export remain
deferred; keep those switches disabled. This handover changes no calculations.

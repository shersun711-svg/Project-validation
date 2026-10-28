# DQ Engine — start here

Choose a folder by task. The numbered files show the run order.

| Folder | Use |
|---|---|
| [basic_profiling](basic_profiling/) | Install the core engine, load configuration and run profiling |
| [comparison](comparison/) | Compare your saved numeric, categorical or date results with MDT |
| [mom_yoy](mom_yoy/) | Install the MoM/YoY view and export per-metric MoM movements |
| [account_level](account_level/) | Run and review separate account-level checks |

This package has **17 files**, including this guide and two input workbooks.
There are no tests, result exports, historical audit files or maintenance scripts.
RDS settings are examples to change for your project.

## First time: basic profiling

Before starting, use SAS 9.4 with XLSX/SAS/ACCESS to Teradata, approved
authentication and a Teradata 16.20/Vantage-compatible environment. The install
account needs table/view/procedure creation and grantable dependency access.
Runtime needs source SELECT, engine configuration/result/log DML and procedure
execution. Set the engine database separately from the source database.

| Order | File | What to do |
|---|---|---|
| 1 — once per new installation | [01_install_engine.sql](basic_profiling/01_install_engine.sql) | Replace every DQ_DB token with your engine database. Run its 28 sections in order in Teradata mode. |
| 2 — prepare input | [profiling_config.xlsx](basic_profiling/profiling_config.xlsx) | Copy for your project, edit the four sheets described below and place it on the SAS server. |
| 3 — each new SAS session | [02_load_controller.sas](basic_profiling/02_load_controller.sas) | Load the controller macros. |
| 4 — each new SAS session that loads Excel | [03_define_excel_loader.sas](basic_profiling/03_define_excel_loader.sas) | Load the configuration-loader macros. |
| 5 — first configuration load or after workbook changes | [04_load_configuration.sas](basic_profiling/04_load_configuration.sas) | Set connection/schema and config_workbook to the SAS server path. Run and require APPLIED. |
| 6 — each profiling execution | [05_run_profiling.sas](basic_profiling/05_run_profiling.sas) | Set connection/schema, project and module switches. Run and require SUCCEEDED; keep the printed run number. |

Keep steps 3–6 in the **same SAS session**. If configuration is unchanged and
the controller is already loaded, run only **05_run_profiling.sas**.
In a new session with unchanged configuration, load **02**, then run **05**.

Installation is for a fresh engine schema. Do not rerun table CREATE statements
on an existing installation. Submit each REPLACE PROCEDURE as **one complete SPL
statement**, then its GRANT separately. Ordinary semicolon splitting breaks
procedure bodies. Inspect compiler errors before proceeding. Runtime CALLs
must not be wrapped in an enclosing transaction.

Leave engine_root blank when loading the SAS helpers directly. For automatic
INCLUDE, set it to the SAS server directory containing these four task folders.
Set connections consistently: dwhprod, TeraAuth and LAB_T_ORION_MVT are examples.
Credentials come from the approved SAS AUTHDOMAIN.

### What to change in the profiling workbook

Keep the existing headers. Edit these sheets:

- **Project:** project ID, source database/table, reporting-date field, account-ID
  field and ACTIVE_IND.
- **Fields:** replace RDS field names/types and set ACTIVE_IND. Types are NUMERIC,
  CATEGORICAL, DATE and IDENTIFIER. Set unwanted existing fields to N; omitted
  fields are not automatically removed from stored configuration.
- **Settings:** reporting levels, thresholds and batch size. Example levels are
  overall/monthly/yearly = Y/Y/N; at least one must be Y. Thresholds 1 and 5 mean
  percentage points, not Excel percentages. Batch size accepts 1–30. Keep
  OUTLIER_SD_MULTIPLIER=3 for the current outlier rule.
- **SpecialValues:** project-wide numeric/categorical special labels and active
  flags. Specials are separate from missing values and excluded from numeric
  distribution statistics and categorical distinct counts.

File 05 selects modules for the active fields. PSI and automatic Excel export
are deferred; keep categorical_psi and export_excel N.

Review successful profiling results in DQ_BASIC_REVIEW, filtered by PROJECT_ID
and the printed short RUN_NUMBER. Rates are fractions: 0.05 means 5%.
Date Basic provides counts and missing rate, not date-value extrema.
Internal UUIDs are used only for failed profiling retries.

## Comparison: after profiling

Choose **one** query for the field type:

- [compare_numeric.sql](comparison/compare_numeric.sql)
- [compare_categorical.sql](comparison/compare_categorical.sql)
- [compare_date.sql](comparison/compare_date.sql)

Replace DQ_DB, project, your run number, MDT run IDs and MDT result-table names.
Submit each complete WITH/SELECT separately for separate result grids.
The RDS examples are our numeric run 17 versus MDT 12–15, categorical 18 versus
MDT 20, and date 18 versus MDT 21. These are examples, not new-project run IDs.

Queries read saved overall/monthly results without rerunning profiling.
Verify MDT column names, population, periods, special lists and rate units.
The date query assumes ROW_COUNT, MISSING_COUNT and fractional MISSING_PCT.

Categorical output keeps original values/differences and adds BLANKCOUNT,
ADJUSTED_OUR_VALUE and ADJUSTED_DIFFERENCE. It checks **our missing + MDT blanks**
against MDT missing, which already includes blanks. Non-missing subtracts
blanks; missing rate is recomputed from counts. Reconciled values are
MATCH_AFTER_BLANK_ADJUSTMENT; residual mismatches remain DIFFERENT.
Distinct special-value definitions are still checked separately.
SHOW_MATCHES=N hides both raw and reconciled matches. Input, duplicate,
population and snapshot warnings remain visible.

## MoM/YoY: after monthly profiling

1. **Once:** replace DQ_DB and run
   [01_install_mom_yoy_view.sql](mom_yoy/01_install_mom_yoy_view.sql) after the
   core install. Submit its complete view definition, then its GRANT.
2. **Each review:** query DQ_FIELD_CHANGE_REVIEW by project/run for **both MoM
   and YoY** columns, or edit every project/run filter in
   [02_export_mom_by_metric.sql](mom_yoy/02_export_mom_by_metric.sql) and run one
   numbered SELECT at a time for separate **MoM** metric exports.

Monthly profiling must be enabled. Both views and export queries read saved
results; they do not rerun profiling or scan source records.
The export helper is MoM-only; use the view directly for YoY:

```sql
SELECT *
FROM YOUR_ENGINE_DB.DQ_FIELD_CHANGE_REVIEW
WHERE PROJECT_ID='YOUR_PROJECT' AND RUN_NUMBER=123
ORDER BY FIELD_NAME,POU_DT;
```

ABSOLUTE_CHANGE is signed current minus previous. Rates and relative changes are
fractions; CHANGE_PP is percentage points. Movement flags identify review
candidates, not automatic defects. Check EXPECTED_ROWS_IN_EXPORT against the
exported row count to detect client truncation.

## Account-level: a separate workflow

| Order | File | When |
|---|---|---|
| 1 | [01_install_account_results.sql](account_level/01_install_account_results.sql) | Once, after the core engine install; replace DQ_DB. |
| 2 | [account_fields.xlsx](account_level/account_fields.xlsx) | Copy/edit the selected fields and numeric movement/return limits; put it on the SAS server. |
| 3 | [02_load_controller.sas](basic_profiling/02_load_controller.sas) | Load if not already loaded in this session. |
| 4 | [02_define_account_checks.sas](account_level/02_define_account_checks.sas) | Load account macros once per SAS session. |
| 5 | [03_run_account_checks.sas](account_level/03_run_account_checks.sas) | Set connection/schema, account_project, workbook server path, date window and detail limit, then run. |
| 6 | [04_review_account_results.sql](account_level/04_review_account_results.sql) | Set project/account run number; review progress, successful summaries and detail. |

Keep steps 3–5 in the same session. Subsequent account executions in that
session need only **03_run_account_checks.sas**, followed by review.
Account execution does not require running the profiling runner first, but does
require the project's source/field configuration to have been loaded into the
core engine. Require SUCCEEDED and retain the account run's own short number.

The account workbook's AccountFields sheet has FIELD_NAME, ACTIVE_IND,
ABS_CHANGE_MIN, REL_CHANGE_MIN, RETURN_ABS_TOL, RETURN_REL_TOL and STABLE_VALUE_IND.
Numeric fields need explicit limits. The RDS example has numeric fields paused;
change the active selections for your project.

Account results have separate tables. Detail persists in Teradata; the SAS
detail limit does not cap database storage. Protect stored account IDs/values.
Do not use an account execution's UUID as a profiling retry ID.

## Packaging limits

The deployment is consolidated in the original fresh-install order, with
MoM/YoY setup moved into its task folder. SAS filenames/INCLUDE paths are updated
for this layout; calculations are unchanged. This guide replaces references to
older documentation in inherited comments. No live SAS/Teradata compilation or
other-project result validation was performed for this packaging change.

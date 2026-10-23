# Account-level post-RDS checks

This separate account-check runner follows each agreement through consecutive calendar
months. It complements the portfolio-level MoM review; it does not run DPD or
realised-loss validation, or automatically classify a movement as a data error.
The implementation was written independently; no CDAO code was copied.

## Run

First apply the one-time [persistent-results setup](#deploy-persistent-results).

1. Open/run `sas/01_dq_controller.sas`, then `sas/07_account_checks.sas` in the
   same SAS server session.
2. Edit `config/DQ_RDS_account_fields.xlsx`, sheet `AccountFields`. The supplied
   important-field selection is prepared, with the nine categorical fields and
   CUTOVER_DT active. Upload it to a SAS-accessible server folder.
3. In `sas/06_run_account_checks.sas`, set `account_fields_file` to that server
   path and set explicit `account_start_date` / `account_end_date` values.
4. Run file 06. Note the short `DQ ACCOUNT RUN_NUMBER` in the log. Require
   SUCCEEDED in Teradata before using the results as completed evidence.
5. Review `DQ_ACCOUNT_REVIEW` and `DQ_ACCOUNT_DETAIL_REVIEW` at any time,
   filtered by project and run number. SAS WORK copies remain available for
   convenience while that SAS session exists.

Do not run file 00 or reload the profiling Excel configuration for these checks.
Profiling calculations and result views are unchanged. Existing controller
macros supply connection/error handling, and the existing allocator supplies
short run numbers. No new stored procedure or counter is introduced.

## Deploy persistent results

1. Let any old account check finish and save available WORK outputs before
   replacing its program. The old WORK-only implementation did not save database
   results; this upgrade cannot recover a closed SAS session.
2. Replace DQ_DB with LAB_T_ORION_MVT in
   `teradata/setup/22_create_account_results.sql`. Run each CREATE once in SQL
   Assistant, then its grants. It adds only DQ_ACCOUNT_SUMMARY and DQ_ACCOUNT_DETAIL
   and grants access to the existing approved engine schema role.
3. Apply `teradata/results/96_dq_account_review.sql`, one REPLACE VIEW/grant at a
   time. View owners need grantable SELECT on the existing run/number/module
   tables as well as the new result tables; setup/22 includes those grants.
4. Reload current SAS files 01 and 07 (version **20261023_PERSIST_RESULTS**), then
   run 06 with the existing workbook path/date window. New runs persist results.

No source table is modified and no old results are deleted by deployment.
The two new tables contain counts and flagged records, not a full RDS copy.
They require permanent space; amount depends on flagged volume and retained
runs. MAX_DETAILS limits only SAS transfer and does not limit database storage.
Detail distributes by run/field/account rather than concentrating a run on one AMP.
Treat stored agreement IDs/values as internal validation data.

Run status and per-field progress reuse DQ_RUN_LOG / DQ_MODULE_LOG under module
ACCOUNT_CHECKS (batch 0 = whole execution; batches 1..n = fields). SQL_TEXT holds
the field name for this module. DQ_ACCOUNT_PROGRESS exposes it without reading
the unsupported long SQL_TEXT datatype into SAS. It also exposes failures and
run numbers before final publication. A broken connection can leave RUNNING;
that is not proof of an active database request or successful completion.

Use the read-only queries in `teradata/review/account_review.sql` to find the
latest run, inspect progress, and review successful summaries/detail. Always
filter PROJECT_ID and RUN_NUMBER. Querying these views does not rescan RDS.

```sql
SELECT * FROM LAB_T_ORION_MVT.DQ_ACCOUNT_PROGRESS
WHERE PROJECT_ID='RDS'
ORDER BY RUN_NUMBER DESC,BATCH_ID;

SELECT * FROM LAB_T_ORION_MVT.DQ_ACCOUNT_REVIEW
WHERE PROJECT_ID='RDS' AND RUN_NUMBER=123
ORDER BY FIELD_NAME,POU_DT;
```

Replace 123 with the printed run number. New account runs share the engine's
existing global sequence but have their own results; they do not add metrics
to DQ_METRIC_RESULT or affect field-level MoM. Start a new account execution
for a rerun; do not pass its UUID to profiling retry_run_id.

Both result views show only SUCCEEDED runs. Individual field inserts are
committed while the run remains RUNNING, so they are hidden during processing.
Run/module completion is published in one short transaction after all selected
fields and local output processing finish. Failures attempt to mark the run
FAILED and delete only that failed run's account results. Prior successful runs
are retained. Lost connections can prevent cleanup; status stays non-successful
and raw partial rows remain hidden. Use normal engine maintenance only after
resolving inactive RUNNING entries. The all-history reset now requires setup/22
and clears account tables before logs; it is never called by this runner.

### Field-name validation fix

If file 06 reports Invalid important-field configuration for the supplied list,
reload the latest file 07 after the persistence deployment above.
The check now removes SAS fixed-width padding at the identifier-regex call.
Invalid names or Y/N settings also print the affected field in DQ ACCOUNT CONFIG
log messages. After the one-time persistent-results deployment, rerun file 06
after loading the updated macros; this name fix itself needs no Excel reload.

### SQL literal resolution fix

The current file 07 also resolves project, dates, field/type, check ID and
fixed-field settings before quoting them as Teradata SQL literals. Earlier
single-quoted SAS tokens sent literal macro names to the database; this could
produce the misleading one-active-project error even with valid configuration.
Reload file 07 and rerun file 06. Expect a log line such as
`DQ ACCOUNT PROJECT: database=LAB_T_ORION_MVT project=RDS active_rows=1`.
No project/field configuration change or profiling rerun is needed for this fix.

### Teradata special-value CASE fix

The current file 07 matches the active project's special values with a small
deduplicated LEFT JOIN before classifying each observation. It avoids the
IN-subquery inside CASE WHEN that Teradata rejected. Duplicate numeric values
or categorical labels that normalise to the same value cannot multiply source
rows. Missing values retain precedence and other projects/inactive settings are
excluded. This CASE fix is included in the persistence version; deploy its
tables/views once before loading current file 07. No workbook edit is needed.
SAS/Teradata server execution still requires verification.

## Select fields and thresholds

File 06 imports `AccountFields` into `WORK.DQ_ACCOUNT_FIELDS`. Blank numeric
columns are explicitly converted to SAS numeric missing values, not zeros.
Your existing Excel import macro can also create this dataset and call
`run_dq_account_checks` directly, using these columns and SAS types:

| Column | Type | Meaning |
|---|---|---|
| FIELD_NAME | character 128 | Field registered for this project |
| ACTIVE_IND | character 1 | Y includes this field |
| ABS_CHANGE_MIN | numeric | Minimum absolute numeric movement, in field units; >0 |
| REL_CHANGE_MIN | numeric | Minimum relative magnitude, fraction such as 0.20 |
| RETURN_ABS_TOL | numeric | Absolute return tolerance; >=0 |
| RETURN_REL_TOL | numeric | Relative return tolerance; fraction between 0 and 1 |
| STABLE_VALUE_IND | character 1 | Y flags any valid-to-valid change in a normally fixed field |

All four numeric settings are mandatory for NUMERIC fields. Use missing numeric
settings for other types. Both indicators must be Y/N. Unknown fields, duplicate
names or invalid settings stop before scanning RDS. Selection is independent of
profiling ACTIVE_IND and does not overwrite Excel or existing configuration.

### Prepared RDS selection

The workbook contains **24 fields: 14 numeric, 9 categorical and 1 date**,
from the analyst's `Identified_fields.xlsx`: all 23 main-sheet entries plus
`PCKG_REPAY_AMT`, whose inclusion was confirmed separately. `DPD` is excluded.
`DataMapping` records the original names and final RDS names; its reference
metadata is not executed or loaded into engine configuration. The supplied
workbook's CODE snippets were not copied into this implementation.

Two aliases were verified against the supplied final-view DDL:

| Supplied CDAO name | Final RDS field |
|---|---|
| CHQ_LMT_UTILISATION_AVG_BAL_6M | CHQ_LMT_UTIL_AVG_BAL_6M |
| MV_CUST_ALL_MTHS_SNC_DISTRESS_CNT | MV_CUST_ALL_MTHS_SNC_DIST_CNT |

The legacy `BALANCE_AMT` entry maps to **PCKG_BALANCE_AMT**, as specified in
the CDAO column and package-balance description. Account BALANCE_AMT is not
silently added. `IO_AT_ORIGINATION_IND` and `CUTOVER_DT` are suggested for the
normally-fixed check; other selected fields have STABLE_VALUE_IND=N.

The two numeric pilot fields retain provisional review limits, but all 14
numeric fields are now inactive. Other numeric limits are unset. No common financial materiality
limit is assumed across amounts, ratios and counters. Counter resets/increments,
package membership changes and updated application/collateral selections may
explain flagged movements. EVENT_DESCRIPTION receives temporal profiling only;
default-policy validation stays outside scope.

### Current stage: categorical and date fields

All nine categorical fields and CUTOVER_DT are active. They need no numeric
movement limits. The runner checks A -> B -> A reversions, temporary missing
values, valid-to-missing transitions and, for categorical fields, configured
special-value transitions. Normally-fixed valid-to-valid changes are checked
for IO_AT_ORIGINATION_IND and CUTOVER_DT. These are review flags, not automatic
errors; category changes and corrections may be legitimate.

File 06 defaults to **1 January 2005 through 31 March 2026**, covering the
analyst's full RDS history, with up to 10,000 detail rows per field. Summary
counts are uncapped. Keep the approved source scope consistent with the
profiling run; missing boundary references remain unevaluated. Full-history
runtime/spool for these ten fields has not been measured here.

Replace the account workbook on the SAS server, set the date window and detail
limit in file 06, and run 06. If the latest persistent account macros are already loaded
in that session, files 01/07 do not need rerunning. No profiling workbook
reload or additional database deployment is required for selection changes.

### Numeric pilot reference (paused)

The completed numeric pilot covered **1 October 2025 through 31 March 2026**.
The two paused fields retain these initial screening
limits; they are not approved materiality thresholds or automatic DQ failures:

| Field | Absolute jump | Relative jump | Absolute return tolerance | Relative return tolerance |
|---|---:|---:|---:|---:|
| PCKG_BALANCE_AMT | 10,000 | 0.50 | 1,000 | 0.05 |
| PCKG_REPAY_AMT | 250 | 0.50 | 25 | 0.05 |

Preserve the pilot outputs and revise limits if the screen is too broad/narrow.
Other ratios need unit-specific limits;
months-since counters need counter-specific increment/reset checks before
activation. The original 24-field list is retained in the workbook.

Source table, account key, snapshot column and types come from project/field
configuration. The active numeric/categorical special lists are copied into
DQ_RUN_SPECIAL_VALUE once for this account run, before source scans. Each field
uses that snapshot. Source/window/threshold/type settings are captured in the
run log and account summaries. Freeze the source during execution; this does
not recreate the old run-17/run-18 source version. NULL is missing; blank non-numeric values are also
missing. Categorical special matching uses trimmed uppercase values, as in
profiling. Date/identifier specials are not defined.

## Tests

| Flag | Condition |
|---|---|
| NUMERIC_JUMP | Valid consecutive values; absolute and relative movement thresholds met |
| NUMERIC_REVERSION | A qualifying first jump followed by an opposite movement returning within tolerance over three consecutive months |
| VALUE_REVERSION | Valid non-numeric values A -> B -> A over three consecutive months |
| MISSING_REVERSION | Valid -> missing -> valid over three consecutive months |
| SPECIAL_REVERSION | Valid -> special -> valid over three consecutive months |
| BECAME_MISSING | Valid -> missing in consecutive months |
| BECAME_SPECIAL | Valid -> special in consecutive months |
| STABLE_VALUE_CHANGE | Valid values change in a field marked normally fixed |

All applicable tests run. Thresholds are review criteria, not automatic RAG
decisions. Relative movement is `(current-previous)/ABS(previous)`, a fraction.
When the previous value is zero, relative change stays NULL and the absolute
threshold determines the jump. Only the first leg must meet the jump thresholds;
the second must reverse direction and return within tolerance. This detects
100 -> 150 -> 100 with a 50% first-jump limit, despite the return being 33.33%.
Return tolerance is:

`ABS(next-previous) <= MAX(RETURN_ABS_TOL, ABS(previous)*RETURN_REL_TOL)`.

Missing/special values cannot participate in valid movements. Missing/special
reversions require valid neighbours, not equal neighbour values. Non-numeric
reversions compare source character representations, case sensitively. Numeric
movement uses FLOAT; normally-fixed changes compare character representations.
Very large numbers and near-boundary tolerances require live verification.

January -> March is not MoM when February is absent. Snapshot days need not
match. Reversions belong to the middle month. The first/last months of the
requested window lack their outside references: include surrounding months
when testing a specific event. The runner does not infer records beyond that
window or treat account entry/exit as a missing value.

## Results

Summary is one row per field/month with full event counts, eligible pairs/
triples and fractional rates formatted to six decimals. Denominators are:

- Jumps and fixed-value changes: valid consecutive pairs.
- Numeric/non-numeric reversions: valid consecutive triples.
- Missing/special reversions: consecutive triples with valid neighbours.
- Becoming missing/special: consecutive pairs with a valid prior value.

Unsupported tests have NULL summary counts/rates. Zero denominators give NULL
rates. NO_REFERENCE means no consecutive prior month; NO_OBSERVATIONS means an
empty window. Neither is a DQ pass. SUCCEEDED means execution completed.

Saved detail has all flagged agreement/date rows, previous/current/next dates,
values/states, changes and 0/1 flags. MAX_DETAILS caps the SAS copy **per field**,
not per month, ordered by date/account. TOTAL_FLAGGED_ROWS in WORK is the full
pre-cap count when detail exists. Teradata detail and summary are uncapped. One row may carry multiple
flags; summing flag counts does not give distinct affected records.

CHECK_ID in WORK equals the stored RUN_ID; the short account run number is
printed separately. Public WORK outputs are cleared on invocation. Intermediate
_DQ_AT_* datasets may remain after failure and are not completed evidence.
The permanent review views remain usable after SAS closes. No reporting or
Excel export module is added. Save account-level outputs internally, not GitHub.

## Grain, performance and verification

The source must have one observation per account/calendar month at most.
NULL/blank account keys or duplicate account/months stop publication, including two
different dates in one month. This is stricter than account/date uniqueness.
NULL dates fall outside the requested window; check missing keys separately
(the analyst has already passed this check on RDS). Keys over 128 characters
or values over 512 characters are rejected. The end date includes its full day.

One narrow volatile table holds one field's evaluated history. Summary counts
and all flagged detail are saved from it; SAS copies are then read. This working
table uses session spool and is dropped before the next field; disconnect also
removes it. The two permanent tables retain the published account results.
Each selected field scans/sorts its source history once. Start with a few
fields and a bounded date window: full-history spool and runtime are unverified.

Run `node DQ_ENGINE/tools/check_account_checks.mjs` for synthetic regression.
It executes the production SQL CTE with SQLite dialect adaptations, not SAS.
SAS execution, Teradata compilation/permissions/plans and full-RDS performance
have not been tested in this workspace. Validate on the user server before
expanding the selection.

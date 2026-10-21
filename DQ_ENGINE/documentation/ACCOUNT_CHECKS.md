# Account-level post-RDS checks

This standalone prototype follows each agreement through consecutive calendar
months. It complements the portfolio-level MoM review; it does not run DPD or
realised-loss validation, or automatically classify a movement as a data error.
The implementation was written independently; no CDAO code was copied.

## Run

1. Open/run `sas/01_dq_controller.sas`, then `sas/07_account_checks.sas` in the
   same SAS server session.
2. In `sas/06_run_account_checks.sas`, supply the approved important-field list
   and explicit start/end dates. Numeric fields require individual thresholds.
   Example syntax is provided, but no fields or dates are enabled by default.
3. Run file 06. Require `dq_account_status=SUCCEEDED` before reviewing
   `WORK.DQ_ACCOUNT_SUMMARY` and `WORK.DQ_ACCOUNT_DETAIL`.
4. Retain outputs and settings in the approved validation evidence location
   before the SAS session ends.

Do not run file 00 or reload Excel for these checks. No deployment SQL, grants,
stored procedures, permanent tables or profiling changes are required.
Existing controller macros supply connection/error handling only.

## Select fields and thresholds

File 06 creates a SAS configuration dataset. Your existing Excel import macro
can populate it instead, using these columns and SAS types:

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

Source table, account key, snapshot column and types come from project/field
configuration. Specials use the project's active numeric/categorical lists.
Freeze source/configuration during execution: these are current definitions,
not run-17/run-18 snapshots. NULL is missing; blank non-numeric values are also
missing. Categorical special matching uses trimmed uppercase values, as in
profiling. Date/identifier specials are not defined.

## Tests

| Flag | Condition |
|---|---|
| NUMERIC_JUMP | Valid consecutive values; absolute and relative movement thresholds met |
| NUMERIC_REVERSION | Two qualifying jumps in opposite directions over three consecutive months, returning within tolerance |
| VALUE_REVERSION | Valid non-numeric values A -> B -> A over three consecutive months |
| MISSING_REVERSION | Valid -> missing -> valid over three consecutive months |
| SPECIAL_REVERSION | Valid -> special -> valid over three consecutive months |
| BECAME_MISSING | Valid -> missing in consecutive months |
| BECAME_SPECIAL | Valid -> special in consecutive months |
| STABLE_VALUE_CHANGE | Valid values change in a field marked normally fixed |

All applicable tests run. Thresholds are review criteria, not automatic RAG
decisions. Relative movement is `(current-previous)/ABS(previous)`, a fraction.
When the previous value is zero, relative change stays NULL and the absolute
threshold determines the jump. Both legs of a reversion must qualify.
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

Detail has agreement IDs, previous/current/next dates, values and states,
numeric changes and 0/1 flags. MAX_DETAILS caps rows **per field**, not per
month, ordered by date/account. TOTAL_FLAGGED_ROWS is the full pre-cap count
when detail exists. Summary counts are uncapped. One row may carry multiple
flags; summing flag counts does not give distinct affected records.

CHECK_ID identifies this separate execution; no profiling RUN_NUMBER is changed.
Public WORK outputs are cleared on invocation and published only after every
field completes. Intermediate `_DQ_AT_*` datasets may remain after failure;
they are not published evidence. Save account-level outputs internally, not
in GitHub. No reporting or Excel export module is added.

## Grain, performance and verification

The source must have one observation per account/calendar month at most.
NULL/blank account keys or duplicate account/months stop publication, including two
different dates in one month. This is stricter than account/date uniqueness.
NULL dates fall outside the requested window; check missing keys separately
(the analyst has already passed this check on RDS). Keys over 128 characters
or values over 512 characters are rejected. The end date includes its full day.

One narrow volatile table holds one field's evaluated history while summary
and capped detail are read. It uses session spool, not permanent database
space, and is dropped before the next field; disconnect removes it as well.
Each selected field scans/sorts its source history once. Start with a few
fields and a bounded date window: full-history spool and runtime are unverified.

Run `node DQ_ENGINE/tools/check_account_checks.mjs` for synthetic regression.
It executes the production SQL CTE with SQLite dialect adaptations, not SAS.
SAS execution, Teradata compilation/permissions/plans and full-RDS performance
have not been tested in this workspace. Validate on the user server before
expanding the selection.

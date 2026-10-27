# Numeric result comparison with MDT — working record

Reviewed: 27 October 2026

The analyst supplied `Comparison Result.xlsx` (8,430 exception rows), comparing
our run 17 with MDT runs 12–15 for saved overall/monthly numeric results.
This workspace did not execute the comparison or follow-up queries in Teradata.

| Exception | Rows | Review conclusion |
|---|---:|---|
| `DEFINITION_DIFFERENCE` | 8,428 | Monthly outlier counts across 159 fields: our NULL versus MDT zero, where both eligible populations are empty. Representation difference. |
| `DIFFERENT` | 2 | One field/period: `TOTALNETMONTHLYINCOME`, overall, MDT run 15. Our count/rate are 1 / 0.100000; MDT's are 0 / 0.000000. |

No other metric exceptions appear in the export. This conclusion is limited to
comparison scope and tolerances; it is not independent proof of full coverage
or identical sources. CDAO-confirmed categorical classification exceptions
remain documented in the comparison instructions.

## Boundary investigation

The analyst confirmed ten valid observations on both sides. The current-source
follow-up returned ten valid observations, with one equal to the exact lower
3-sigma boundary when calculated from the reported values. Our stored FLOAT
statistics produced a lower bound approximately 0.0000000000270592 above that
observation. The original strict FLOAT comparison therefore flagged it; MDT's
saved decimal boundary did not. The other nine observations were unflagged.

This reproduces the floating-point boundary error for the inspected values.
Current-source reconstruction does not itself prove unchanged source history,
although it reproduces the saved difference. Equality to the mathematical
boundary is not an outlier under the agreed strict population 3-sigma rule.

## Authorised manual correction — analyst confirmed complete

The analyst authorised correcting only RDS run 17, `TOTALNETMONTHLYINCOME`,
NUMERIC_OUTLIERS, OVERALL/ALL. The intended values are outlier count 0 and
fractional rate 0.000000. Internally, OUTLIER_RATE_PCT changes from 10 to 0,
with numerator 1 to 0 and denominator retained at 10.

[correct_run17_income_outlier.sql](correct_run17_income_outlier.sql) checks
expected original values, previews the before-images and updates only those
two metric rows in a transaction. An existing associated rule row is refreshed
using the shared evaluator and the run's captured thresholds. If no rule row
existed, none is invented. Statistics, bounds, timestamps and other results
are preserved. Export the before-images as internal working papers and verify
the final view before recording the correction as complete.

The script passed adapted SQLite checks for scope, rule handling and already-
corrected no-op behaviour. The analyst subsequently applied the correction in
Teradata, reran the comparison and confirmed that the result was satisfactory.
This is analyst-reported completion; this workspace has not independently
queried the corrected database or received a new post-correction export.
The original exception export remains evidence of the pre-correction result.
Expected NULL-versus-zero definition differences are separate from this corrected
outlier discrepancy and are not calculation mismatches.

## Reusable engine — precision correction still pending

File 12 retains the original strict mean ± 3 population-standard-deviation
formula. The proposed sample-size safeguard was withdrawn. No field-specific
exception, >10 condition or general decimal conversion is deployed by this work.

A general precision correction is still necessary to prevent recurrence at
numeric boundaries. Assess consistent precision for values and bounds against
source numeric ranges and scales, and regression-test equality and genuine
outliers across fields, reporting levels and population sizes. Do not change
the calculation solely to reproduce MDT or treat this manual correction as a
replacement for the engine fix. Casting final output alone cannot correct an
earlier FLOAT classification decision.

[Follow-up SQL](RDS_numeric_MDT_follow_up.sql) retains the saved-statistic and
current-value diagnostics. No full RDS rerun is needed for the manual correction;
future corrected engine code requires a controlled server test before broader use.

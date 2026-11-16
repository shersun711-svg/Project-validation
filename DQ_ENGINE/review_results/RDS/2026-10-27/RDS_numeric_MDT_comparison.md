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

## Reusable engine — precision correction prepared; server verification pending

File 12 now compares valid values and final bounds after ROUND(...,10) and
conversion to DECIMAL(38,10), using the existing metric-storage scale. The mean
and population deviation remain captured as FLOAT; only final comparison bounds
are rounded. Native special-value filtering still precedes rounding. The same
bounds are saved, and the strict mean ± 3 population-standard-deviation rule
remains. There is no sample-size or field/project-specific exception.

Local generated-SQL checks cover both boundary directions, the reported
ten-value case, another boundary case at twenty observations, differences at
the declared decimal resolution, genuine tails and a valid value close to a
configured special code. An independent scaled-integer oracle verifies the
ten-value mathematical boundary. Existing period, empty-source and batch
checks also pass. These are dialect-adapted SQLite checks, not proof of
Teradata decimal semantics, SPL compilation or runtime.

The conversion must fit DECIMAL(38,10): 28 integer digits and ten fractional
digits. Review that precision contract for future projects with wider/finer
values. No source data, historical metrics or configuration are changed by
deploying the procedure. The correction was implemented independently; matching
MDT alone was not used as proof of correctness.

[Follow-up SQL](RDS_numeric_MDT_follow_up.sql) retains the saved-statistic and
current-value diagnostics. No full RDS rerun is needed for the manual correction;
the updated procedure requires a controlled server test before broader use.
Deploy the latest file 12's two complete procedures and grants in file order,
then verify a small outlier run before the next full profiling execution.

# Numeric result comparison with MDT — working record

Reviewed: 27 October 2026

Source evidence: analyst-supplied `Comparison Result.xlsx`, Sheet1 (8,430
exception rows). Our run 17 was compared with MDT runs 12–15, using saved
overall/monthly results. This review did not execute the comparison in Teradata.

| Exception | Rows | Interpretation |
|---|---:|---|
| `DEFINITION_DIFFERENCE` | 8,428 | Monthly outlier counts across 159 fields: our value is NULL and MDT's is zero. The comparison assigns this status when both valid counts are zero. Expected representation difference; no valid observations exist to assess. |
| `DIFFERENT` | 2 | One field/period: `TOTALNETMONTHLYINCOME`, overall, MDT run 15. Our outlier count is 1 versus 0; our outlier rate is 0.100000 versus 0.000000. These are two metrics from the same underlying discrepancy. |

No other exception statuses or metrics appear in the supplied export. That
conclusion applies to the comparison's selected scope and tolerances; an
exceptions-only export does not independently establish complete field coverage,
identical source data or correctness of both engines. The four CDAO-confirmed
categorical fields remain classification exceptions, as documented in the
comparison instructions.

## Outstanding investigation

The analyst ran the saved-result follow-up queries and confirmed that both
valid counts are 10 and that the other inspected statistics/bounds match;
the outlier count differs. Displayed equality does not establish identical
full-precision values.

Under the agreed strict mean ± 3 population-standard-deviation rule, a population
of ten observations cannot contain an outlier: its maximum possible standardised
distance is sqrt(10-1)=3, and equality is not an outlier. Our saved count of one
is inconsistent with that mathematical rule. Floating-point evaluation at the
boundary is a plausible cause; the actual ten source values have not been
independently inspected to establish the exact rounding path.

## Focused correction prepared

`modules/12_numeric_outliers.sql` now prevents outlier counts for period-specific
valid populations of 1–10. This enforces the existing mathematical rule without
changing its multiplier, bounds, denominator, missing/special-value handling,
source scans or calculation for larger populations. Existing saved results are
not overwritten.

Local regression executes the generated counting SQL for n=1..11, both tail
directions and overall/yearly/monthly periods. It reproduces inward-rounded
ten-observation bounds, verifies zero false positives, and preserves genuine
tails at n=11. Existing reporting-level, batch-width and shared-copy checks also
pass. These checks do not compile or run Teradata SPL.

Deployment: replace DQ_DB with LAB_T_ORION_MVT in file 12, recompile its two
complete procedures separately in file order and apply the supplied grants.
Verify a fresh controlled single-field outlier run before broader use. A full
RDS rerun is not needed to diagnose or document this discrepancy; the original
run 17 comparison remains evidence of the pre-correction result.

Read-only queries: [RDS_numeric_MDT_follow_up.sql](RDS_numeric_MDT_follow_up.sql).

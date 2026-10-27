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

## Decision — investigate before changing the calculation

A proposed valid-count safeguard was locally tested but withdrawn following
analyst review. The current repository procedure retains the original strict
mean ± 3 population-standard-deviation comparison, without a sample-size
condition. No decimal-conversion change has been made either.

The mathematical property above is evidence for investigating the discrepancy,
not evidence that its precise numerical cause has been established. Next,
inspect the ten valid values and full-precision inputs/bounds and independently
recalculate the result. Select and test any correction on that basis, rather
than changing a rule solely to agree with MDT. Casting to decimal can also
introduce rounding and must be assessed before adoption.

The discrepancy remains open; local baseline regression checks do not resolve
it or verify live Teradata SPL. Run 17 remains unchanged as comparison evidence.
There is no correction to deploy at this stage and no full RDS rerun is needed
for this investigation. If the superseded guarded procedure was already deployed,
record that version separately and restore the current unguarded procedure
before conducting a like-for-like baseline test.

Read-only queries: [RDS_numeric_MDT_follow_up.sql](RDS_numeric_MDT_follow_up.sql).

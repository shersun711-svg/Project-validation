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

Reconcile valid counts, mean, population standard deviation and outlier bounds
for `TOTALNETMONTHLYINCOME` overall. The count/rate combination is consistent
with ten valid observations, but the saved valid counts must be checked before
concluding that. A value near the strict mean ± 3 population-standard-deviation
boundary could be affected by precision; this is a hypothesis, not a confirmed
cause. No engine calculation should be changed before investigating.

Read-only queries: [RDS_numeric_MDT_follow_up.sql](RDS_numeric_MDT_follow_up.sql).

# RDS account-level temporal test results

Prepared: 27 October 2026

This report summarises account-level temporal testing for nine selected categorical
fields and `CUTOVER_DT`, using saved run 19. Each field has 255 monthly summary
rows covering January 2005–March 2026. Review comprised the exported summary,
selected account-detail checks and comparison with the field comments in
`20260731_CMP2_Data_Attestation_Log_V1_1.xlsx`, sheet `Data_Attestation_Log`.
Numeric account-level testing is outside this report.

Three observations require CDAO clarification. The larger 2019 gaps extend the
existing field-level MoM finding; they should be tracked together. Calculation
checks and deferred observations are summarised below. No data error is assumed
from a reversion flag alone.

## 1. Temporary missing repayment type — December 2013

**Observation:** Testing identified 111 accounts where `REPAY_TYPE_CD` was `1`
in November 2013, missing in December 2013, and `1` again in January 2014.
The analyst confirmed this pattern for all 111 detail records. The summary
recorded 112 transitions to missing that month; the remaining record did not
meet the temporary-recovery condition and has not yet been investigated.

The 111 temporary gaps represent approximately 0.08% of the 140,076 records
in December 2013. Preliminary priority is low, pending explanation and
confirmation of downstream PD/LGD use. Cause and model impact remain unconfirmed.

The attestation comment for `REPAY_TYPE_CD` (W42) explains missingness in
January 2005 and remediation in February 2005. It does not explain December 2013.

**Requested action:** CDAO to confirm the cause of the one-month gap, whether
it is expected, and whether remediation is required.

## 2. February/May 2019 completeness gaps associated with missing package IDs

**Observation:** Account-level checks identified large transitions from valid
to missing values in `EVENT_DESCRIPTION` and `MV_PROP_POSTCODE_NM`. A source
check found the following overlap with missing `PCKG_ID` on the same account
and reporting date:

| Field | Reporting date | Became missing | Also missing PCKG_ID | Overlap |
|---|---|---:|---:|---:|
| `EVENT_DESCRIPTION` | 28 February 2019 | 8,828 | 8,621 | 97.7% |
| `EVENT_DESCRIPTION` | 31 May 2019 | 12,208 | 12,065 | 98.8% |
| `MV_PROP_POSTCODE_NM` | 28 February 2019 | 9,123 | 9,123 | 100% |
| `MV_PROP_POSTCODE_NM` | 31 May 2019 | 12,710 | 12,710 | 100% |

This extends finding 3 of the field-level MoM report, which identified 9,201
and 12,802 records with missing package IDs and repeated large package bill
amounts in February and May 2019 respectively. The checks demonstrate account
and date overlap; they do not establish that missing package IDs caused the
other fields to become missing.

The postcode attestation comment (W446) states that missingness and PSI spikes
in 2018/2019 are due to the Glenbeigh sale. The `EVENT_DESCRIPTION` comment
(W128) states that no material DQ issues were found. Portfolio processing is
therefore a plausible explanation, but the specific months, source/process
and affected accounts need reconciliation. The previously explained June 2009
population movement is separate from these 2019 observations.

**Requested action:** CDAO to confirm whether the February/May 2019 gaps relate
to GLA/Glas or Glenbeigh portfolio processing, identify the relevant sale,
cutover and migration dates and affected accounts/sources, and document the
expected availability and treatment of these fields. Reconcile this explanation
with the existing missing-package-ID/package-bill finding, including any
required correction. A further 207 February and 143 May event-description
transitions fall outside the missing-package-ID overlap.

## 3. Temporary repayment-type changes — low-priority clarification

**Observation:** Testing identified 654 account-month events where
`REPAY_TYPE_CD` changed for one month and returned to its previous value the
following month. The most common patterns were `3 → 1 → 3` (441 events) and
`2 → 1 → 2` (63 events). These are event counts, not distinct account counts;
the same account may contribute events in different months. The 441 events
occurred between March 2006 and June 2021; this does not imply occurrence
in every intervening month.

Codes 2/3 denote interest-only arrangements, 5/6 denote PCI and 0 denotes no
regular repayment. Temporary arrangement changes may be valid. Preliminary
priority is low, pending business confirmation; neither the cause nor model
impact has been established. This observation is separate from the temporary
missingness recorded under finding 1.

The analyst reconciled `IO_IND` to the documented rule across all 613 of its
flagged reversion events and their three-month windows: repayment type 2 or 3
maps to 1; otherwise it maps to 0. All observed indicators matched the expected
values. No `IO_IND` mapping discrepancy was identified. This does not establish
whether the underlying repayment-arrangement changes were genuine.

**Requested action:** CDAO to confirm whether the temporary repayment-type
changes represent genuine repayment-arrangement changes or data-processing
effects, provide supporting evidence for a small sample, and confirm whether
any correction or limitation on use is required.

## Completed targeted checks and deferred observations

| Field / pattern | Evidence and conclusion |
|---|---|
| `MV_EXDAY_PAYREV` value reversions | Ten account reversions were checked across 30 monthly observations, covering both directions in early and later periods. All classifications agreed with the exposed RDS inputs; sampled movements were driven by days in excess moving between zero and positive values. PASS — no issue identified in the targeted checks. This is not full-population source verification. |
| `IO_IND` calculation | All 613 flagged reversions were reconciled across their three-month windows with no mapping discrepancies. PASS for the classification check; repayment-type business validity remains under finding 3. |
| Property-classification reversions in `MV_PROP_POSTCODE_NM` | June 2007 contained 64 events: 37 house/apartment reversions, 18 urban/non-urban house reversions and 9 missing-type/house reversions. Approximately 0.04% of the month's population. Low-volume observation; detailed source tracing deferred. No data error established. |

## Checks with no movements flagged and documented context

| Field / context | Conclusion |
|---|---|
| `IO_AT_ORIGINATION_IND` | No fixed-value changes or other tested movements flagged among eligible comparisons. |
| `CUTOVER_DT` | No fixed-value changes or other tested movements flagged among eligible comparisons. W381 explains expected high missingness and portfolio-related changes; absence of movement flags does not establish completeness. |
| `PCKG_FTB_CALC_IND` | No tested movements flagged. |
| `PCKG_2ND_INC_OCC_DESC` / `PCKG_HI_INC_OCC_DESC` | W455/W462 explain legacy capture limitations and portfolio-related divergence. Observed transitions to missing require this context; no separate new issue is established by the summary alone. |

## Interpretation

Counts across the history represent account-month events, not distinct accounts.
An account may trigger more than one check; temporary missing is included in
became missing. The first month has no prior-month reference and the last month
cannot support a three-month reversion check. A flag identifies a review candidate,
not an error, and no flags do not establish overall accuracy. No account identifiers
are included in this report.

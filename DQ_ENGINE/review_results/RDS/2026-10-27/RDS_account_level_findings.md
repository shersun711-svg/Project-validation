# RDS account-level temporal test results

Prepared: 27 October 2026

This report summarises account-level temporal testing for nine selected categorical
fields and `CUTOVER_DT`, using saved run 19. Each field has 255 monthly summary
rows covering January 2005–March 2026. Review comprised the exported summary,
selected account-detail checks and comparison with the field comments in
`20260731_CMP2_Data_Attestation_Log_V1_1.xlsx`, sheet `Data_Attestation_Log`.
Numeric account-level testing is outside this report.

Two findings require CDAO clarification. The larger 2019 gaps extend the existing
field-level MoM finding; they should be tracked together. Other movement patterns
remain analyst follow-up items and have not been established as data errors.

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

## Additional patterns requiring analyst review

| Pattern | Evidence | Next check |
|---|---|---|
| `MV_EXDAY_PAYREV` value reversions | 169,703 flagged account-month events across 253 months; all flags are value reversions. | Sample the actual A → B → A transitions and compare with field derivation and expected payment behaviour. W427 reports no material DQ issues; frequent reversions alone do not contradict that conclusion. |
| `IO_IND` and `REPAY_TYPE_CD` reversions | 613 and 654 value-reversion events respectively; August 2011 includes 47 and 46. | Check whether the same accounts drive both fields and whether contract/payment changes explain the reversions. Similar counts alone do not prove overlap. |
| Postcode value reversions | June 2007 contains 64 A → B → A events, the largest monthly cluster for this field. | Review the values and source mapping to distinguish corrections or valid changes from a temporary mapping problem. |

These are follow-up checks, not additional confirmed findings for CDAO.

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

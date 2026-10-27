# RDS account-level data quality review

27 October 2026 | Run 19 | January 2005–March 2026

Account-level temporal checks were reviewed for nine selected categorical fields
and `CUTOVER_DT`. The review identified the following observations for CDAO
clarification. They are not confirmed data errors. Numeric account-level testing
is separate and remains outstanding.

## 1. Missing field values before accounts cease appearing in RDS

Large numbers of accounts changed from populated to missing values in
`EVENT_DESCRIPTION` and `MV_PROP_POSTCODE_NM`:

| Month | Event description: became missing | Property classification: became missing |
|---|---:|---:|
| February 2019 | 8,828 | 9,123 |
| May 2019 | 12,208 | 12,710 |
| February 2020 | 2,025 | 2,460 |
| March 2022 | 1,311 | 1,821 |
| November 2024 | 989 | 1,506 |

Missing package IDs were also present for 95.1–98.8% of the affected
event-description records and 100% of the affected property-classification
records. Across these groups, 93.2–99.3% had no RDS observation the following
month. This suggests an account-exit or portfolio-processing explanation,
which remains unconfirmed.

The postcode attestation comment (W446) attributes 2018/2019 spikes to the
Glenbeigh sale. It does not reconcile these specific populations or explain
the later dates. This observation extends the existing field-level MoM finding
on missing package IDs; the package-bill aggregation effect has only been
checked for February/May 2019.

**CDAO clarification:** Confirm the relevant events and affected populations,
explain why the fields became unavailable before the accounts ceased appearing
in RDS, and confirm whether the treatment is expected or requires correction.
Update the attestation with the dates, affected fields/sources and limitations.

## 2. Temporary missing repayment type — low priority

For 111 accounts, `REPAY_TYPE_CD` was `1` in November 2013, missing in December,
and `1` again in January 2014. This represents approximately 0.08% of the
December population. A further became-missing record did not meet the recovery
condition and remains uninvestigated. The existing attestation comment (W42)
explains January 2005 missingness, not December 2013.

**CDAO clarification:** Confirm the cause of the one-month gap and whether
remediation or a limitation on use is required.

## 3. Temporary repayment-type changes — low priority

There were 654 events where repayment type changed for one month and returned
the following month, mainly `3 → 1 → 3` (441 events) and `2 → 1 → 2` (63).
These are account-month events, not distinct accounts. Temporary arrangement
changes may be valid. All 613 flagged `IO_IND` reversions followed the documented
repayment-type mapping, with no classification discrepancies.

**CDAO clarification:** Confirm whether these temporary changes reflect genuine
repayment arrangements or processing effects. Provide supporting evidence for
a small sample and confirm whether correction or a limitation on use is required.

## Other review conclusions

- **No issue identified in targeted checks:** `MV_EXDAY_PAYREV` matched the
  exposed inputs in all 30 sampled observations, covering both reversion
  directions in early and later periods. This was not full-population verification.
- **No tested movements flagged:** `IO_AT_ORIGINATION_IND`, `CUTOVER_DT` and
  `PCKG_FTB_CALC_IND`. This does not establish overall accuracy or completeness.
- **Occupation fields — low priority, explanation pending:** Most transitions
  to missing occurred before 2010. W455/W462 document legacy capture limitations,
  but do not establish the cause of these populated-to-missing transitions.
  Please clarify whether the documented limitations explain the observed pattern.
- **Property classification — detailed tracing deferred:** June 2007 contained
  64 reversions, approximately 0.04% of the population. No error was established.

Supporting material: [aggregate SQL evidence](RDS_account_level_evidence_run19.xlsx)
and [detailed working record](RDS_account_level_work_log.md). These retain the
review evidence and limitations separately from this report.

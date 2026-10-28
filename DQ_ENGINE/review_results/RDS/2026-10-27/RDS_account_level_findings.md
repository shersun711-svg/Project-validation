# RDS account-level data quality review

Updated 28 October 2026 | Runs 19 and 20 | January 2005–March 2026

Account-level temporal checks covered nine selected categorical fields,
`CUTOVER_DT` and 14 selected numeric fields. The observations below require
CDAO clarification; they are not confirmed data errors. Numeric checks used
provisional screening limits, including unconfirmed upstream scales for
`CHQ_LMT_UTIL_AVG_BAL_6M` and `CUST_ALL_MT_MAX_DELINQ_BASE_RT`.

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

Numeric checks also identified populated-to-missing transitions in February/May
2019: `PCKG_BOVO_VAL_AMT` (9,111 / 12,690) and `PCKG_REPAY_AMT`
(9,115 / 12,660). These extend the same clarification request; overlap with the
categorical populations has not been established.

**CDAO clarification:** Confirm the relevant events and affected populations,
explain why the fields became unavailable before the accounts ceased appearing
in RDS, and confirm whether the treatment is expected or requires correction.
Update the attestation with the dates, affected fields/sources and limitations.

## 2. December 2013: temporary gaps in repayment and related ratios

Follow-up source checks identified 129 selected accounts with missing
`PCKG_REPAY_AMT` in December 2013; 128 recovered in January 2014. Package IDs
were populated in December for 128 of the 129 accounts. Within this group,
43 accounts had temporary `-999993` values in `MV_PCKG_LOAN_TO_INC_RT` and
60 in `MV_PCKG_REPAY_TO_INC_RT`. All 43 loan-to-income values returned to
their November value in January. The temporary gaps are therefore not generally
explained by an absent package ID. The underlying cause has not been established.

For 111 accounts, `REPAY_TYPE_CD` was `1` in November 2013, missing in December,
and `1` again in January 2014. This represents approximately 0.08% of the
December population. A further became-missing record did not meet the recovery
condition and remains uninvestigated. The existing attestation comment (W42)
explains January 2005 missingness, not December 2013.

Overlap between these repayment-type and numeric populations has not been
checked.

**CDAO clarification:** Explain the temporary December 2013 gaps in repayment,
related ratios and repayment type, and confirm whether they are expected or
represent a data quality issue.

## 3. November 2016: temporary special values in savings ratios

Run 20 identified 914 valid-to-special-to-valid events in November 2016 in
each of `MV_PCKG_SAV_DEP_TO_BALANCE_RT` and `MV_PCKG_SAV_DEP_TO_REPAY_RT`.
These represent approximately 1.29% of eligible neighbouring valid triples
for each field. Equal event counts do not establish account overlap or a common
cause. The attestation explains generally high special-value levels where no
associated savings exist, but that does not establish the explanation for this
one-month cluster.

**CDAO clarification:** Confirm whether these temporary special values reflect
expected changes in savings availability or processing, or a data quality issue.

## 4. Temporary repayment-type changes — low priority

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

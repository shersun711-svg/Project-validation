# RDS account-level data quality review

28 October 2026 | January 2005–March 2026 | Categorical/date run 19; numeric run 20

The review covered nine selected categorical fields, one date field and 14
numeric fields. Yellow rows in the working workbook are selected for review,
not confirmed errors. The observations below request CDAO explanations; they
do not assign root causes. Numeric movement limits are provisional screening
settings, with upstream scales for utilisation and delinquency still unconfirmed.

## 1. Package-related missingness and balance movements

The following fields became missing in February and May 2019:

| Field | February 2019 | May 2019 |
|---|---:|---:|
| EVENT_DESCRIPTION | 8,828 | 12,208 |
| MV_PROP_POSTCODE_NM | 9,123 | 12,710 |
| PCKG_BOVO_VAL_AMT | 9,111 | 12,690 |
| PCKG_REPAY_AMT | 9,115 | 12,660 |

In May 2019, 10.59% of eligible valid balance pairs also met the configured
large-movement limits for `PCKG_BALANCE_AMT`.

Previous categorical follow-up found missing package IDs for 95.1–98.8% of
affected event-description records and all affected property-classification
records across five investigated months. Most affected records did not appear
in the next snapshot. Similar categorical patterns occurred in February 2020,
March 2022 and November 2024. The postcode attestation mentions the Glenbeigh
sale in 2018/2019, but does not reconcile these specific populations or later
dates. Overlap with the numeric populations and the direction of the balance
jumps have not been established.

**CDAO clarification:** Explain the affected dates and fields, confirm whether
missingness and balance movements are expected around account exits or portfolio
processing, and update the attestation with the relevant dates, sources and
limitations. This extends the existing field-level MoM observation.

## 2. December 2013: temporary repayment and ratio gaps

Source follow-up identified 129 selected accounts with missing `PCKG_REPAY_AMT`
in December; 128 recovered in January. Package IDs remained populated in December
for 128 accounts. Within this group, 43 accounts had temporary `-999993` values
in `MV_PCKG_LOAN_TO_INC_RT` and 60 in `MV_PCKG_REPAY_TO_INC_RT`.
All 43 loan-to-income values returned exactly to their November value.

Separately, 111 accounts had `REPAY_TYPE_CD` values of `1 → missing → 1` across
November–January. Overlap with the numeric group has not been checked.

**CDAO clarification:** Explain these temporary gaps and confirm whether they
are expected or represent a data quality issue. Christmas payment arrangements
have not been established as the explanation.

## 3. Temporary special values in savings and payment ratios

| Field | Month | Valid → special → valid events |
|---|---|---:|
| MV_PCKG_SAV_DEP_TO_BALANCE_RT | December 2013 | 908 |
| MV_PCKG_SAV_DEP_TO_REPAY_RT | December 2013 | 1,013 |
| Both savings-ratio fields above | November 2016 | 914 each |
| Both savings-ratio fields above | November 2018 | 240 each |
| MV_PCKG_AVG_PAY_TO_BAL_L6M_RT | December 2011 | 308 |

The attestation explains generally high savings-ratio special values where
associated savings are unavailable; it does not establish the explanation for
these temporary patterns. Equal counts do not establish account overlap.

**CDAO clarification:** Explain the temporary special values and confirm whether
they reflect expected input availability or processing. December 2011 is lower
priority because of its smaller affected population.

## 4. Historical transitions and November 2018 missingness

- **November 2007, CHQ_LMT_UTIL_AVG_BAL_6M:** 133,607 valid-to-special
  transitions (81.00% of eligible reference pairs) and 11,257 numeric jumps
  (35.92% of valid pairs).
- **January 2006, CUST_ALL_C_PYMTS_CR_AVG_L6M_AMT:** 47,179 numeric jumps
  (35.15% of valid pairs). Direction and underlying values have not been traced.
- **November 2018, CHQ_LMT_UTIL_AVG_BAL_6M:** 2,324 valid-to-missing
  transitions (10.77% of eligible reference pairs).

The attestation describes historical source limitations and specifically links
2018/2019 utilisation nulls to portfolio-sale cutover/migration periods. These
provide context, but do not establish the explanation for every selected month.

**CDAO clarification:** Confirm which documented source or portfolio events
explain these transitions, with dates and affected populations. Link the
November 2018 explanation to the existing MoM clarification.

## Lower-priority categorical observations and completed checks

- **Repayment type:** 654 one-month category reversions, mainly `3 → 1 → 3`
  (441) and `2 → 1 → 2` (63). Please confirm whether these represent genuine
  arrangements or processing effects. These are events, not distinct accounts.
- **Occupation fields:** 639 and 4,298 became-missing events in second/highest
  income occupation respectively, mostly before 2010. Please confirm whether
  the documented legacy capture limitations explain these transitions.
- **IO_IND:** All 613 reviewed reversion windows followed the documented
  repayment-type mapping. No mapping discrepancy was identified.
- **MV_EXDAY_PAYREV:** All 30 sampled observations agreed with exposed inputs;
  no issue was identified in those samples. This was not population-wide testing.
- **Property classification:** 64 June 2007 reversions remain a low-priority
  observation; no error was established.
- No movements were flagged for `IO_AT_ORIGINATION_IND`, `CUTOVER_DT` or
  `PCKG_FTB_CALC_IND` under the checks applied. This does not establish complete
  accuracy. Low-volume numeric reversions and legitimate-looking counter resets
  were retained as screening results without exhaustive tracing.

Working evidence: [combined review workbook](RDS_account_level_review_workbook.xlsx).
Account-level extracts remain in internal working files. Detailed provenance is
retained in the [working log](RDS_account_level_work_log.md).

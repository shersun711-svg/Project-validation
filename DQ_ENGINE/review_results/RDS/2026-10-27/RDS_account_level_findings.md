# RDS account-level review: observations for CDAO

28 October 2026 | January 2005–March 2026

This report uses only the results in **RDS_account_level_review_workbook.xlsx**.
It covers 14 numeric fields, nine categorical fields and one date field.
Yellow rows identify selections for review, not confirmed errors. Counts below
are account-month events unless otherwise stated. Percentages use each check's
eligible population, not necessarily the full monthly population.

## 1. Missing values across package-related fields

| Month | EVENT_DESCRIPTION | MV_PROP_POSTCODE_NM | PCKG_BOVO_VAL_AMT | PCKG_REPAY_AMT |
|---|---:|---:|---:|---:|
| February 2019 | 8,828 | 9,123 | 9,111 | 9,115 |
| May 2019 | 12,208 | 12,710 | 12,690 | 12,660 |
| February 2020 | 2,025 | 2,460 | 2,457 | 2,445 |

These counts represent previously valid values becoming missing. In the
February/May 2019 categorical extracts, missing package IDs were also present
for 8,621/12,065 affected event-description records and all 9,123/12,710 affected
property-classification records.

In May 2019, `PCKG_BALANCE_AMT` also had 12,599 large movements (10.59% of valid
pairs), and `MV_PCKG_REPAY_TO_INC_RT` had 12,628 transitions to special values.
The workbook does not establish whether these numeric and categorical changes
involved the same accounts.

Later categorical missingness was also selected: March 2022 had 1,311
`EVENT_DESCRIPTION` and 1,821 `MV_PROP_POSTCODE_NM` transitions; November 2024
had 989 and 1,506 respectively.

**Question for CDAO:** What explains these dated gaps and movements? Please
confirm whether they are expected, identify the affected sources or processing,
and clarify any limitations on using these fields.

*Evidence: Numeric_POU, Categorical_POU and Categorical_Specific.*

## 2. December 2013: temporary missing and special values

`Numeric_Specific` contains 128 `PCKG_REPAY_AMT` observations that were populated
in November, missing in December and populated again in January. It also shows
43 temporary `-999993` values in `MV_PCKG_LOAN_TO_INC_RT` and 60 in
`MV_PCKG_REPAY_TO_INC_RT`. All 43 loan-to-income values returned exactly to their
November value in January.

Separately, `Categorical_POU` records 111 temporary missing `REPAY_TYPE_CD`
events in December. It does not show their individual account sequences.

**Question for CDAO:** What caused the one-month gaps in repayment, ratios and
repayment type, and are they expected or a data quality issue?

*Evidence: Numeric_Specific, Numeric_POU and Categorical_POU.*

## 3. Temporary special values in savings and payment ratios

| Field | December 2013 | November 2016 | November 2018 |
|---|---:|---:|---:|
| MV_PCKG_SAV_DEP_TO_BALANCE_RT | 908 | 914 | 240 |
| MV_PCKG_SAV_DEP_TO_REPAY_RT | 1,013 | 914 | 240 |

These are valid → special → valid events. In November 2018, each savings ratio
also had 10,209 valid-to-special transitions, approximately 14.60% of its
eligible reference pairs. `CHQ_LMT_UTIL_AVG_BAL_6M` had 2,324 valid-to-missing
transitions in the same month (10.77%).

The selected December 2011 row for `MV_PCKG_AVG_PAY_TO_BAL_L6M_RT` contains
308 temporary special-value events. It is a lower-volume observation.

**Question for CDAO:** What explains these temporary special values and the
November 2018 changes? Please identify the special codes and relevant input
availability or processing changes. Account overlap is not established here.

*Evidence: Numeric_POU; account-level special-code extracts are not included.*

## 4. Large historical movements

- **November 2007 — CHQ_LMT_UTIL_AVG_BAL_6M:** 133,607 values became special
  (81.00% of eligible reference pairs); 11,257 met the numeric-jump limits
  (35.92% of valid pairs).
- **January 2006 — CUST_ALL_C_PYMTS_CR_AVG_L6M_AMT:** 47,179 values met the
  numeric-jump limits (35.15% of valid pairs).

**Question for CDAO:** Do these movements reflect changes in source coverage,
field population or processing? Please explain the affected months. Direction
and underlying values have not been established from the summaries.

*Evidence: Numeric_POU.*

## Lower-priority categorical observations

- `REPAY_TYPE_CD` has 654 category reversions, mainly `3 → 1 → 3` (441)
  and `2 → 1 → 2` (63). Please confirm whether these are genuine temporary
  arrangements or processing effects.
- `PCKG_2ND_INC_OCC_DESC` and `PCKG_HI_INC_OCC_DESC` have 639 and 4,298
  transitions to missing. The selected monthly examples are in 2005/2007.
  Please explain whether these reflect expected historical availability.

*Evidence: Categorical_Overall, Categorical_POU and Categorical_Specific.*

`IO_IND` and `MV_EXDAY_PAYREV` reversions are retained as review selections.
The workbook contains their pattern counts, but not checks against the
underlying factors, so this report does not conclude that those checks passed.
The 64 June 2007 property-classification reversions remain a lower-priority
observation. No flags were recorded for `IO_AT_ORIGINATION_IND`, `CUTOVER_DT`
or `PCKG_FTB_CALC_IND` in Categorical_Overall; this is not a full accuracy check.

[Working workbook](RDS_account_level_review_workbook.xlsx)

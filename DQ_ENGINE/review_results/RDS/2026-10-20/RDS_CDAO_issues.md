# RDS data quality validation review

Prepared: 21 October 2026

Attestation reviewed: `20260731_CMP2_Data_Attestation_Log_V1_1.xlsx`, sheet
`Data_Attestation_Log`.

The review records both findings requiring clarification and observations
already explained in the attestation. The five items below remain open;
documented findings accepted for this review are recorded at the end.

## 1. November 2018 completeness change

**Observation:** In November 2018, 56 fields each increased from zero missing
records to 20,808 missing records, approximately 16.06% of the population.
A similar increase was observed in `RATE_TYPE`. The examples below show that
elevated missingness persisted into December:

| Field | Missing: Oct 2018 | Missing: Nov 2018 | Missing: Dec 2018 |
|---|---:|---:|---:|
| `CHQ_ANNUAL_CREDIT_TURNOVER` | 0 | 20,808 | 20,821 |
| `CHQ_LMT_UTIL_AVG_BAL_6M` | 0 | 20,808 | 20,821 |
| `RATE_TYPE` | 2 | 20,809 | 20,822 |

Total population remained broadly stable: 129,684 in October, 129,589 in
November and 129,292 in December.

For `CHQ_LMT_UTIL_AVG_BAL_6M`, special counts also decreased from 107,959 to
89,403 in November. Its combined missing/special rate increased from
approximately 83.25% to 85.05%, requiring clarification of any change in coding.

CDAO's comments link late-2018/early-2019 missingness in
`CHQ_ANNUAL_CREDIT_TURNOVER` to Glenbeigh (W503), and NULLs in
`CHQ_LMT_UTIL_AVG_BAL_6M` to the Glas/Glenbeigh portfolios between cutover and
migration (W157). Both fields are identified as PROBE-sourced. The comments do
not specify the exact event dates or reconcile the affected population to the
November 2018 counts. The comment for `RATE_TYPE` (W147) addresses pre-2012
tracker-flag remediation rather than the November 2018 change.

**Requested action:**

- Confirm the cause and affected population, including whether the examples
  relate to portfolio sales or changes in data processing.
- Update the attestation with the relevant portfolio sale, cutover and migration
  dates, affected sources/fields and period of missingness.

## 2. CHQ_ANNUAL_CREDIT_TURNOVER historical availability discrepancy

**Observation:** The attestation comment for this field (W503) states "No Data
until June 2008", and its `Populated_From_Date` (V503) is 1 June 2008. However,
profiling shows 100% zero values before November 2007. At the
November 2007 change, the zero rate falls to approximately 52%, with the
remaining 48% containing non-zero values and no NULLs or special values in
that split.

The observed non-zero values precede the stated availability date.

**Requested action:**

- Confirm the first reliable availability date and explain the zero/non-zero
  values before June 2008.
- Correct the availability date or historical values as necessary, and document
  any limitations on using the earlier data.

## 3. PD_SEG_BILL_AMT_PCKG amounts for records with missing package IDs

**Observation:** Mean `PD_SEG_BILL_AMT_PCKG` increased from 3,314.66 in January
2019 to 691,895.50 in February, and from 4,164.17 in April to 525,758.98 in
May. A source-data check found that every record with a NULL `PCKG_ID` shared
the same large bill amount within each of the two spike months:

| Fact date | Records with NULL PCKG_ID | Bill amount repeated on every record |
|---|---:|---:|
| 28 February 2019 | 9,201 | 9,664,577.58 |
| 31 May 2019 | 12,802 | 4,897,476.20 |

The attested calculation (O592) sums bill amounts by package ID and reporting
date. The repeated values are consistent with records having missing package
IDs being aggregated together. The field's review comment (W592) explains
early zero values through August 2006 but does not address these 2019 amounts.

**Requested action:**

- Why did the number of records with NULL `PCKG_ID` increase sharply in
  February and May 2019, and which source/process changes and populations were
  affected?
- How should `PD_SEG_BILL_AMT_PCKG` handle NULL package IDs to avoid combining
  unrelated agreements? Please confirm and make any required corrections to
  the calculation and affected data, and update the attestation with the cause,
  affected periods and agreed treatment.

## 4. June 2024 increase in zero payments and derived special values

**Observation:** Zero payment counts increased sharply in June 2024 and
returned close to their previous levels in July:

| Field / metric | May 2024 | June 2024 | July 2024 |
|---|---:|---:|---:|
| `PROBE_CNP_AMT` - zero count | 2,566 | 12,916 | 2,691 |
| `PCKG_CNP_AMT` - zero count | 2,228 | 11,685 | 2,352 |
| `MV_CAP_PAID_PCT_PYMT_RT` - special count | 2,731 | 13,089 | 2,972 |

Total population remained broadly stable: 97,173 in May, 97,129 in June and
97,147 in July. The `PROBE_CNP_AMT` zero rate increased from 0.026407 to
0.132978 before returning to 0.027700.

CDAO's comments for the payment fields (W49 and W251) explain a June 2012
PROBE loading error and elevated zeros during 2014-2019, but do not address
June 2024. The attested ratio calculation (O423) assigns special value
`-999999` when `PROBE_CNP_AMT` is zero, providing a link between zero payments
and the increase in derived special values.

**Requested action:**

- Explain the temporary increase in zero `PROBE_CNP_AMT` values in June 2024,
  confirming whether it reflects expected payment behaviour/timing or a
  source-data processing issue.
- Reconcile affected records to payment transactions, confirm whether payment
  and derived-field values require correction, and update the attestation with
  the explanation and affected scope.

## 5. Treatment of extreme ratios for very small positive denominators

**Observation:** Mean values for `MV_TOT_DEP_SAV_TO_ACC_BAL_RT` and
`MV_PCKG_SAV_DEP_TO_BALANCE_RT` spike in October 2011, November 2013 and
June 2023. Source checks show that very small positive account/package balances
generate extremely large ratios. The calculated values match the documented
formulas, and a small number of records dominate the means.

`MV_AMORTISATION_RT` also produces extreme values when its adjusted payment
denominator is very small and positive, as demonstrated in the reconciled
April 2013 examples.

**Requested action:**

- Confirm whether the very small positive balances and adjusted payment
  denominators reflect valid underlying data, and whether the associated
  numerator amounts are correctly mapped.
- Confirm and document how ratios with near-zero positive denominators should
  be interpreted and treated in modelling and validation, including any
  limitations on use.

## Findings covered by existing documentation

PASS below applies to the specific observation described, rather than every
aspect of the field or its suitability for model use. References identify cells
in the attestation's `Data_Attestation_Log` sheet.

| Finding identified during validation | Existing documentation | Review conclusion |
|---|---|---|
| `MIN_FLOODSCORE_DEF`: substantial improvement in availability in December 2023 | V579 gives a populated-from date of 1 December 2023; W579 acknowledges high missingness. The source is quarterly Gamma data. | **PASS - documented introduction.** The timing of the availability change matches the recorded start date. This conclusion does not assess the meaning of zero scores. |
| `CALC_CUST_ALL_CHNG_CR_TURNOVER`: historical special values before January 2007 | V564 gives a populated-from date of 1 January 2007; W564 explicitly records 100% special values before that date. | **PASS - documented historical availability limitation.** The early special-value pattern is explained; those values do not represent usable historical observations. |
| `CLOSED_DT`: high baseline missingness | W36 explains that missing closure dates are expected because closed accounts are not retained in the RDS once closed. | **PASS - expected baseline missingness.** High missingness alone is not raised as a new issue. This does not establish the cause of any particular portfolio movement. |
| `CHQ_LMT_UTIL_AVG_BAL_6M`: high baseline special-value rate | W157 explains that not all mortgage customers have current accounts. | **PASS - documented population eligibility.** High baseline special rates are consistent with the stated coverage limitation. The November 2018 change remains subject to issue 1. |

**Documented historical error:** The June 2012 zero-payment spike in
`PROBE_CNP_AMT` and `PCKG_CNP_AMT` is explicitly attributed to a PROBE loading
error in W49 and W251. The observed `PROBE_CNP_AMT` zero rate rose from
approximately 4.57% to 38.38%, consistent with the documented description of
circa 40%. The cause is already recorded and is not raised as a new unexplained
issue. This is a known data limitation, rather than a pass on the accuracy of
the affected values; remediation is not established by that explanation.

**Partly documented findings:** Issue 1 retains the existing Glenbeigh/Glas
explanations and requests the event dates and affected scope. The June 2012
and 2014-2019 payment explanations do not resolve the separate June 2024
event in issue 4. These open questions relate to the remaining gaps in the
explanations, rather than an absence of documentation.

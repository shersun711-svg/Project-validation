# RDS data quality validation review

Prepared: 21 October 2026

Attestation reviewed: `20260731_CMP2_Data_Attestation_Log_V1_1.xlsx`, sheet
`Data_Attestation_Log`.

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

- Confirm the relevant portfolio sale, data cutover and migration dates, and
  reconcile the November 2018 missing counts to the affected population and
  fields.
- Explain why values became NULL while records remained in the dataset,
  including any changes from populated, zero or special values. Confirm
  whether `RATE_TYPE` has the same cause or a separate explanation.
- Confirm whether the observed changes are expected or require remediation.
- Update the portfolio-sale documentation within the data attestation, or add
  a linked event schedule, to record each portfolio's sale/cutover/migration
  dates, affected source systems/tables and fields, affected population,
  period of missingness and any limitations on data use. Cross-reference this
  information from the relevant field-level `DQ_Review_Comment` entries.

## 2. CHQ_ANNUAL_CREDIT_TURNOVER historical availability discrepancy

**Observation:** The attestation comment for this field (W503) states "No Data
until June 2008", and its `Populated_From_Date` (V503) is 1 June 2008. However,
profiling shows 100% zero values before November 2007. At the
November 2007 change, the zero rate falls to approximately 52%, with the
remaining 48% containing non-zero values and no NULLs or special values in
that split.

The observed non-zero values precede the stated availability date.

**Requested action:**

- Confirm the first date from which valid data is available.
- Explain whether earlier zeros represent genuine zero turnover or unavailable
  data.
- Confirm whether non-zero values between November 2007 and May 2008 are valid,
  partially populated or backfilled.
- Clarify whether June 2008 represents the start of complete or reliable coverage,
  and which source or coverage change supports that date.
- Confirm whether the stated availability date or the historical values require
  correction.
- Update `Populated_From_Date` and `DQ_Review_Comment`, as appropriate, to
  document the confirmed availability period, the meaning of early zero
  values and any limitations on using the earlier data.

# RDS issues for CDAO

Prepared: 21 October 2026

Updated against `20260731_CMP2_Data_Attestation_Log_V1_1.xlsx`, sheet
`Data_Attestation_Log`, using the field-specific `DQ_Review_Comment` column W.

## 1. November 2018 completeness change

**Observation:** In November 2018, 56 fields each increased from zero missing
records to 20,808 missing records, approximately 16.06% of the population.
Selected examples show that elevated missingness persisted into December:

| Field | Missing: Oct 2018 | Missing: Nov 2018 | Missing: Dec 2018 |
|---|---:|---:|---:|
| `CHQ_ANNUAL_CREDIT_TURNOVER` | 0 | 20,808 | 20,821 |
| `CHQ_LMT_UTIL_AVG_BAL_6M` | 0 | 20,808 | 20,821 |
| `RATE_TYPE` | 2 | 20,809 | 20,822 |

Total population remained broadly stable: 129,684 in October, 129,589 in
November and 129,292 in December. `RATE_TYPE` is an additional example; it is
not included in the 56 fields whose missing count increased from zero to 20,808.

For `CHQ_LMT_UTIL_AVG_BAL_6M`, special counts also decreased from 107,959 to
89,403 in November. Its combined missing/special rate increased from
approximately 83.25% to 85.05%, requiring clarification of any change in coding.

The attestation already documents a related explanation for some fields:

- `CHQ_ANNUAL_CREDIT_TURNOVER` (W503) states: "Spike in missings for end of
  2018 and beginning 2019 for Glenbeigh".
- `CHQ_LMT_UTIL_AVG_BAL_6M` (W157) attributes increased NULLs in 2018/2019 to
  the Glas and Glenbeigh portfolios and describes "nulls between the cutover
  and migration date". Its source is explicitly identified as PROBE; the
  source columns also identify PROBE for `CHQ_ANNUAL_CREDIT_TURNOVER`.
- `RATE_TYPE` (W147) discusses remediation of the tracker-mortgage flag in
  pre-2012 PROBE data. It does not explain the November 2018 NULL increase.

The remaining clarification is how the field-specific explanations reconcile
to the observed November 2018 counts, including exact event dates and affected
records. The issue should not be described as a complete absence of an
attestation explanation or source identification. Equal missing counts alone
do not establish that the same records are affected across fields.

**Requested action:** Please provide a field-specific explanation covering:

- The portfolio sale, data cutover and migration dates underlying the existing
  comments, and their application to the profiled data.
- Reconciliation of the November 2018 missing counts to the affected portfolio
  records and fields, identifying which source feeds or joins were affected.
- Whether `RATE_TYPE` shares this event or requires a separate explanation.
- Whether previously populated, zero or special values became NULL, and why
  values became unavailable while records remained in the dataset.
- Whether the change is expected or requires remediation.
- The relevant attestation reference, or an update documenting the confirmed
  explanation, affected scope and any limitations on data use.

## 2. CHQ_ANNUAL_CREDIT_TURNOVER historical availability discrepancy

**Observation:** The attestation comment for this field (W503) states "No Data
until June 2008", and its `Populated_From_Date` (V503) is 1 June 2008. However,
profiling shows 100% zero values before November 2007. At the
November 2007 change, the zero rate falls to approximately 52%, with the
remaining 48% containing non-zero values and no NULLs or special values in
that split.

The observed non-zero values precede the stated availability date. This is a
separate historical availability question from the November 2018 NULL increase.

**Requested action:** Please clarify:

- The first date from which valid data is available.
- Whether earlier zeros represent genuine zero turnover or unavailable data.
- Whether non-zero values between November 2007 and May 2008 are valid,
  partially populated or backfilled.
- Whether June 2008 represents the start of complete or reliable coverage,
  and which source or coverage change supports that date.
- Whether the stated availability date or the historical values require
  correction.

Please document the confirmed availability period and any limitations on using
the earlier values in the relevant CDAO attestation or field documentation.

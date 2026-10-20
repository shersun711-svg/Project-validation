# RDS MoM review — 20 October 2026

Reviewed the supplied flagged movements for numeric run 17 and other-type run 18. Minimum and maximum statistics were excluded. No engine or database changes were made.

All 85,963 rows were screened; the six export row counts match. No inconsistent date references, duplicate keys, supplied movement flags or arithmetic were found within the exported six-decimal precision. This checks consistency of the export, not correctness against raw RDS records. The workbook contains only flagged months, so it cannot by itself prove full-history persistence or account overlap.

Of 55,114 rate movements, 48,640 (88.25%) are below 0.5 percentage points in magnitude. This is a prioritisation observation, not a proposed DQ threshold. Review event counts, denominators and field importance before clearing any row.

The main priority investigations are F01–F06. User confirmed the Glenbeigh migration was June 2009. It does not explain the November 2018 or May/June 2019 clusters. No finding has been automatically attributed to migration or closed.

## F01: Broad missing-data spike: November 2018

**1 - Investigate; 2018-11.**

86 fields have a missing-rate increase of at least 2 percentage points. In 56 fields, missing counts go from 0 to exactly 20,808. Total population is nearly unchanged: 129,684 to 129,589. RATE_TYPE moves from 2 to 20,809 missing records (0.000015 to 0.160577).

A coordinated coverage or processing event needs an explanation. Identical counts do not establish that the same accounts are affected. For some fields falling special rates offset part of the missing increase, so examine combined usable coverage.

**Evidence needed:** Ask the source owner for November 2018 release/coverage changes and affected cohort. Check overlap of NULL accounts across fields, and valid/non-special counts before and after. Confirm whether this persists in the complete monthly history.

Workbook Evidence contains 302 linked flagged rows across 86 fields for this finding. Companion SQL section 01 retrieves saved-result context; it has not been run against Teradata.

## F02: Large amount spikes and subsequent reversals

**1 - Investigate; 2019-02 to 2019-06.**

Mean rises from 3,314.655331 to 691,895.499343 in February 2019, then falls to 3,927.732288 in March. It rises from 4,164.171566 to 525,758.983591 in May, then falls to 4,630.807049 in June. Standard deviation also jumps. February valid counts are 128,902 to 128,671; May counts are 119,628 to 119,431.

The spike months have almost stable valid counts, so population size alone does not explain their magnitude. March and June have material population reductions, which complicate interpretation of the subsequent falls. This is a priority investigation, not a confirmed error.

**Evidence needed:** Confirm units and feature derivation, duplicate/aggregation handling and any unusual source values in February and May. Obtain a cohort reconciliation for March and June. Confirm model use and materiality with the model owner.

Workbook Evidence contains 15 linked flagged rows across 1 fields for this finding. Companion SQL section 02 retrieves saved-result context; it has not been run against Teradata.

## F03: Temporary zero/special-value spikes in linked fields

**1 - Investigate; 2012-06/07; also 2008-11/12 and 2024-06/07.**

In June 2012 PROBE_CNP_AMT zero rate rises from 0.045708 to 0.383846 (6,648 to 55,680 zeros); it falls to 0.065308 in July. PCKG_CNP_AMT rises from 0.040634 to 0.323491 then falls to 0.053026. MV_CAP_PAID_PCT_PYMT_RT special rate rises from 0.052240 to 0.385267, then falls to 0.068889. Total population changes only from 145,444 to 145,058 in June.

This looks like a short-lived shared event. A zero denominator or payment/feed timing issue is a hypothesis; aggregate summaries cannot confirm record overlap or causality. Similar earlier and later events warrant checking.

**Evidence needed:** Ask for payment-cycle/feed history and derivation of the ratio special values. Compare affected account sets in May/June/July 2012. Explain recurrence before treating this as legitimate seasonality.

Workbook Evidence contains 81 linked flagged rows across 3 fields for this finding. Companion SQL section 03 retrieves saved-result context; it has not been run against Teradata.

## F04: Extreme savings/balance ratio tail movements

**1 - Investigate; 2023; especially June/July.**

In June 2023 MV_TOT_DEP_SAV_TO_ACC_BAL_RT mean rises from 82.190835 to 52,182.187440 and population standard deviation from 4,569.420745 to 8,995,008.046095. Valid counts are nearly stable (60,306 to 60,461). Mean falls to 134.276024 in July. The related package ratio also rises sharply in June, from 71.236137 to 52,062.014943, then falls to 46.838096.

Large tail influence or ratio scaling is plausible. Confirm the denominator and units; a small denominator is not established from profiling alone. July is a substantial reversal, not proof of an exact return to baseline.

**Evidence needed:** Check feature lineage, near-zero denominators, source amount units and whether extreme records repeat across the two ratios. Compare January/March/June/September events with processing changes.

Workbook Evidence contains 68 linked flagged rows across 2 fields for this finding. Companion SQL section 04 retrieves saved-result context; it has not been run against Teradata.

## F05: Extreme variability can mask changes in outlier rate

**1 - Investigate; Multiple; especially 2013-04.**

In April 2013 mean rises from 63,462.214533 to 545,246.366733 and standard deviation from 5,991,903.719371 to 179,087,695.781276. Outlier rate falls from 0.000370 to 0.000030. Large spikes and falls also occur in other years.

The much wider mean +/- 3 population-standard-deviation bounds can reduce the flagged rate while extreme values become larger. A low outlier rate is therefore not evidence of a stable tail. This observation does not demonstrate an incorrect outlier calculation.

**Evidence needed:** Confirm units, ratio denominator and legitimate bounds with the source/model owner. Inspect extreme contributing records and saved mean/standard-deviation bounds for selected periods. Do not interpret the rate in isolation.

Workbook Evidence contains 35 linked flagged rows across 1 fields for this finding. Companion SQL section 05; 08 retrieves saved-result context; it has not been run against Teradata.

## F06: 2019 population changes and denominator-driven missing rates

**1 - Explain event; 2019-02 to 2019-06.**

In June 2019 total population falls from 119,437 to 107,191 (12,246 records). CLOSED_DT missing rate rises from 0.893073 to 0.993563, while its missing count falls slightly from 106,666 to 106,501. May has separate large changes while population is almost stable, e.g. PCKG_INDEXED_LTV_RT missing 0.019635 to 0.121177.

CLOSED_DT is a clear denominator/composition effect, not an increase in the number of missing observations. Other fields/events may involve changed coverage. User confirmed the Glenbeigh migration was June 2009. That event does not explain these 2019 changes. Do not automatically attribute them to migration.

**Evidence needed:** Confirm the 2019 selection/cutover rules, March and June cohort exits and any May data preparation. Assess date-field applicability: an open account may legitimately have no closure date. Explain residual changes after cohort reconciliation.

Workbook Evidence contains 535 linked flagged rows across 214 fields for this finding. Companion SQL section 06 retrieves saved-result context; it has not been run against Teradata.

## F07: Historical availability/default transitions

**2 - Explain history; 2006-01; 2007-01; 2007-11.**

In January 2006, 18 fields move from at least 99% missing to at most 1% missing and at least 90% zero. In January 2007 CALC_CUST_ALL_CHNG_CR_TURNOVER moves from all missing to all special. In November 2007 NON_CHQ_RC_CUST_LMT_UTIL moves from all zero to all special.

New availability, backfill or representation changes need effective dates. Replacing NULL with zero/special does not necessarily improve usable information. Do not assume zero is valid for every field or that the same missingness transition recurs every year.

**Evidence needed:** Obtain field introduction dates, historical backfill scope and zero/special definitions. Check relevance to the model development/validation window and document unavailable periods.

Workbook Evidence contains 126 linked flagged rows across 84 fields for this finding. Companion SQL section 07 retrieves saved-result context; it has not been run against Teradata.

## F08: Flood-score availability and zero meaning

**2 - Explain history; 2023-12 and adjacent months.**

MIN_FLOODSCORE_DEF missing rate drops from 1.000000 to 0.014996 in December 2023, while zero rate rises from 0 to 0.703424 (69,046 zeros out of 98,157 records). Related flood-score fields also change.

A possible field introduction/coverage change. Confirm whether zero means no risk, an unavailable assessment, or a default. The MIN prefix is part of the field name; no minimum statistic is being reviewed.

**Evidence needed:** Confirm score availability dates, coverage matching and zero semantics. If zeros are unavailable/default values, review their treatment separately rather than regarding reduced NULL rates as fully improved coverage.

Workbook Evidence contains 18 linked flagged rows across 6 fields for this finding. Companion SQL section 07 retrieves saved-result context; it has not been run against Teradata.

## F09: Outlier discontinuities on potentially discrete indicators

**2 - Method check; Multiple; 2018-10 and 2017-06 examples.**

CUST_ALL_V_MAX_DEF_L12M_IND outlier rate rises from 0 to 0.099836 in October 2018, with valid counts nearly stable (33,505 to 33,455). CUST_ALL_V_MAX_DEF_IND_CM rises from 0 to 0.099426 in June 2017. There are earlier changes from roughly 10% to zero.

If the variables are binary, population mean +/- 3 standard deviations can switch the entire minority class into/out of outliers when prevalence crosses 10%. Confirm the value domain before using this explanation. Other bounded/discrete fields can have related threshold effects.

**Evidence needed:** Use saved means, standard deviations and bounds; obtain the field domain/coding definition. Distinguish distribution changes from the mechanical change in sigma-rule classification. Do not treat these as automatically bad records.

Workbook Evidence contains 4 linked flagged rows across 2 fields for this finding. Companion SQL section 08 retrieves saved-result context; it has not been run against Teradata.

## F10: Near-zero mean bases inflate relative movements

**2 - Units/context; Multiple; 2006-10 and 2010-03 examples.**

MV_CAP_PAID_PCT_BAL_RT mean moves from 0.001676 to -62.058939 in October 2006 (relative change -37,029.006563). CHQ_TOTAL_NET_TURNOVER moves from -0.005504 to -96.608417 in March 2010 (relative change 17,551.401344).

Relative movement around a near-zero or negative mean is not a reliable severity scale. The actual change may still be important. These cannot be cleared using the relative flag or compared across fields with different units.

**Evidence needed:** Check the amount/rate units and sign convention. Review absolute movement against a normal business scale, valid population, and adjacent-month history. Confirm whether negative values are meaningful for each field.

Workbook Evidence contains 48 linked flagged rows across 16 fields for this finding. Companion SQL section 09 retrieves saved-result context; it has not been run against Teradata.

## How to use the files

Start with Findings and filter Evidence by finding ID. All six input sheets are included with source Excel row numbers and review routing. Unlinked rows remain open for materiality review. Dates and filter ranges have been cleaned; the original file has not been changed. Rate values and relative changes remain fractions with six decimals. CHANGE_PP gives signed percentage points. The export header ABSOLUTE_CHANGE means signed current minus previous.

Follow-up SQL is read-only and accesses saved profiling results only. It does not recalculate profiling or read raw customer/account data. Keep supporting source-owner explanations and analysis before resolving findings.

# Supporting results to add to the working workbook

The current findings report uses only the combined workbook. No additional SQL
is required to raise its observed patterns with CDAO. To include earlier
investigation conclusions, add the following supporting outputs as separate
blocks in Categorical_Specific or Numeric_Specific. Keep the existing raw data.

| Conclusion to support | Missing output |
|---|---|
| IO_IND followed its documented mapping | Re-run the mapping check for run 19 reversion accounts across previous/current/next months; save observed IO_IND, REPAY_TYPE_CD, expected IO_IND and mismatch count. Earlier correspondence reported 613 windows / 1,839 observations with zero mismatches. The current workbook retains only pattern counts. |
| MV_EXDAY_PAYREV agreed with its inputs in the sample | Add the previously reviewed early/later sample rows with all inputs, expected category, observed category and comparison result. Earlier correspondence contained 30 observations, but those rows are absent from this workbook. Use the confirmed derivation for expected values rather than assuming its formula from the category label. |
| Package IDs were populated for most December 2013 numeric gaps | Add the prior three-month extract with anonymous REVIEW_ID, date, package-ID status, repayment and both ratios. It previously contained 129 accounts / 387 rows; do not rely on suffix IDs for matching. The current Numeric_Specific has flag sequences but no package-ID status. |
| Affected categorical accounts ceased appearing next month | Add the prior following-month presence counts for the five months (Feb/May 2019, Feb 2020, Mar 2022, Nov 2024), and missing-package-ID counts for the latter three months. The current Categorical_Specific has package overlap only for Feb/May 2019. Absence from the next snapshot is not proof of permanent exit. |
| A pattern is covered by CDAO documentation | Add the relevant attestation field comments/excerpts, document version and field references. Without them the current report does not attribute causes to portfolio sales or legacy systems. |

The first two outputs are the most useful additions for recording completed
categorical checks. The remaining outputs are optional if the report simply
requests CDAO explanations, as it currently does.

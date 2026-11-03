# RDS account-level review decisions

Recorded: 3 November 2026. Analyst discussion: Siqi Chen / MVT.
Purpose: retain agreed interpretations and CDAO clarifications for the account-level findings and later final validation report. This is a working evidence note, not a final finding list.

## 1. CHQ_LMT_UTIL_AVG_BAL_6M — November 2007

### Evidence and definitions

- Siqi confirmed that 35 represents 35%; the field uses a percentage scale.
- Siqi confirmed that values before November 2007, including October 2007, were entirely zero.
- The attestation identifies November 2007 as the availability start (Data_Attestation_Log row 157).
- Saved account run 20 shows 164,944 consecutive October–November pairs with a valid prior value. Of these, 133,607 became special, none became missing, and 31,337 remained valid.
- Reconciliation: 164,944 = 133,607 + 31,337. October's 164,940 valid pairs concern September–October and are a different matched population.
- Numeric-jump counts among the remaining valid pairs are 12,183 / 11,257 / 9,138 for the lower / original / higher scenarios. Absolute thresholds are 10 / 20 / 40 percentage points; relative thresholds are 25% / 50% / 75%.
- Since the prior values were zero, the existing zero-base exception applies: numeric jumps depend on the absolute threshold alone. Counts use movement magnitude; the export does not identify the direction.
- The 133,607 special-value transitions and the numeric jumps are separate populations.

### Agreed interpretation

The November 2007 numeric-jump concentration is consistent with the introduction of populated utilisation values from historical zero coding. It does not, by itself, demonstrate erroneous utilisation movements. Retain it as historical availability/coding context rather than a separate unexplained numeric-jump issue.

The attestation explains high special-value incidence by the absence of current accounts for some mortgage customers. That provides eligibility context but does not explicitly explain the earlier zero coding. Underlying source/default treatment has not been independently reconciled at record level in this review.

### Agreed CDAO clarification for the account-level report

> The attestation states that CHQ_LMT_UTIL_AVG_BAL_6M is available from November 2007, while earlier observations are entirely zero. Please confirm why pre-availability observations were assigned zero, whether these represent unavailable data rather than genuine zero utilisation, and how this period should be treated in modelling.

Focus the clarification on historical zero treatment and modelling implications. Do not raise the introduction-month numeric jumps or the special transitions as separate confirmed data defects. Significance depends on use of the pre-availability history. No source correction or field-wide pass has been established.

This note records the agreed disposition; it does not itself amend the Word findings reports.

## Next field under discussion

CUST_ALL_C_PYMTS_CR_AVG_L6M_AMT is next. No final disposition has yet been agreed. Its attestation availability is January 2006 (row 373). The MoM export shows December 2005 zero rate of 100%, changing to 56.9399% in January 2006; mean changes from 0 to 1,983.103028. January original numeric jumps are 47,179 of 134,216 valid pairs (35.1515%). These facts warrant discussing whether its introduction-month concentration has the same historical-zero interpretation, before treating it as a new issue.

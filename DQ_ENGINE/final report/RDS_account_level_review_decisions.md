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

## 2. CUST_ALL_C_PYMTS_CR_AVG_L6M_AMT — January 2006 and later movements

### Evidence

- Attestation availability starts January 2006 (Data_Attestation_Log row 373); the review comment is "Reviewed, no material DQ issues found."
- The MoM export shows a December 2005 zero rate of 100%, changing to 56.9399% in January 2006; mean changes from 0 to 1,983.103028.
- January 2006 has 134,216 valid pairs and 47,179 original jumps (35.1515%). Lower/original/higher counts are 53,486 / 47,179 / 36,103, with absolute thresholds 500 / 1,000 / 2,000.
- Since December values were zero, January's qualifying numeric jumps are zero-to-valid-nonzero movements; only the absolute jump threshold applies.
- Secondary original concentrations: February 2006, 5,844 (4.30%); May 2007, 6,198 (3.74%); May 2009, 5,720 (3.55%). Higher-threshold rates are approximately 2.38%, 2.06% and 2.16%, respectively.

### Agreed disposition

The January 2006 concentration is consistent with introduction of populated payments at the documented availability start. Retain pre-availability zero coding and modelling treatment as a CDAO clarification, analogous to the utilisation field. No separate confirmed numeric-jump defect is established by the January counts.

Retain later concentrations as review candidates for selected examples and the numeric-reversion stage. No additional finding is agreed at this point; the field is not recorded as having passed all checks.

Proposed clarification:

> The attestation states that CUST_ALL_C_PYMTS_CR_AVG_L6M_AMT is available from January 2006, while December 2005 observations are entirely zero. Please confirm whether pre-availability zeros represent unavailable data rather than genuine zero payments, and how the earlier history should be treated in modelling.

## 3. CUST_ALL_MT_MAX_DELINQ_BASE_RT — February 2019

### Evidence and formula context

- February 2019 has 125,629 valid pairs.
- Lower: absolute 0.5 AND relative 25%; 7,610 jumps (6.0575%).
- Original: absolute 1 AND relative 50%; 5,853 jumps (4.6590%).
- Higher: absolute 2 AND relative 75%; 4,489 jumps (3.5732%).
- Previous-zero observations use the existing absolute-only exception. Flags cover both increases and decreases; the summary does not identify direction.
- The concentration persists under higher thresholds. February 2019 is not the attested field availability start, so the preceding two fields' introduction-month explanation cannot simply be reused.
- Siqi supplied the upstream formula: closed accounts, split type W and qualifying zero-balance/zero-repayment cases return 0; other zero repayments return special code 9999. At/after maturity, the formula uses balance/repayment; before maturity, delinquency arrears/repayment.
- Siqi confirmed the common numeric special list, including 9999, equals the run-20 snapshot consumed by the sensitivity test.
- Movements could reflect changes to arrears/repayments, the numerator switch at maturity, a small positive repayment denominator or the linked account supplying the maximum. These are hypotheses, not confirmed explanations.
- Other package-field concentrations in February 2019 do not establish common records or causes.

### Agreed status: open review candidate

Perform a limited targeted check before deciding whether to raise a CDAO clarification. Do not raise February 2019 immediately as a confirmed issue, and do not review every flagged account.

Agreed follow-up:

1. Select 5–10 flagged February 2019 examples spanning increases and decreases.
2. Check underlying arrears, balance and repayment amounts and whether maturity changes the formula branch.
3. Where relevant, check whether the linked account supplying the maximum changed.
4. Inspect subsequent-month values and numeric-reversion results to distinguish temporary spikes from sustained changes.

If examples remain unexplained or suggest a common problem, raise a specific clarification supported by the examples and affected scope. Until then, record this as an open review candidate, not a confirmed finding or a pass. This follow-up has been agreed but has not yet been performed.

## 4. MV_PCKG_AVG_PAY_TO_BAL_L6M_RT — February/May 2019

### Follow-up supplied by Siqi

The targeted query reproduced the sensitivity populations and flags:

| Month | Valid pairs | Original jumps | Higher jumps | Increases | Package ID became missing among original jumps |
|---|---:|---:|---:|---:|---:|
| February 2019 | 127,443 | 9,196 | 9,031 | 9,036 | 8,637 (93.92%) |
| May 2019 | 118,447 | 12,950 | 12,815 | 12,759 | 12,453 (96.16%) |

These are overlapping characteristics, not counts to add together. In the ten sampled increases, current-month payments were large, average payments increased sharply, lagged average balances remained substantial, current package balances were zero and package IDs became missing. Through-time IDs stayed unchanged in those examples. No adjacent following-month records were available for the sampled increases, so their numeric reversion could not be assessed.

The ratio has a plausible mechanical explanation: a payment close to the outstanding balance raises its six-month payment average by roughly balance/6, while the denominator remains the preceding six-month average balance, giving a ratio around 100/6 = 16.67%. The sampled ratios around 16–18% are consistent with this mechanism. This supports a settlement/redemption/portfolio-exit hypothesis; transaction reasons and population-wide cause remain unconfirmed.

### Agreed disposition

Include this as supporting evidence under account-level Issue 1, "Missing values across package-related fields", rather than creating a separate confirmed ratio-calculation issue. The follow-up establishes direct overlap between this ratio's jumps and package IDs becoming missing. It does not yet establish that the same accounts underlie all other fields in Issue 1.

CDAO clarification should cover whether large payments, zero balances and missing package IDs reflect expected settlement/portfolio-exit processing and appropriate modelling treatment. The attestation specifically links May 2019 balance zeros to Glenbeigh but does not reconcile these accounts or establish February's cause.

April/October 2006 remain separate review candidates. Their payment-input movements and six-month separation suggest checking the rolling payment windows, but no explanation is agreed yet.

## 5. MV_PCKG_BAL_AMT_L6M_TO_L7T12M_RT — numeric-jump review passed

Siqi agreed to record a pass for the numeric-jump review, with no data issue raised from this assessment. Original flags total 6,584 (0.0209%); lower/higher totals are 36,127 (0.1149%) and 1,744 (0.0055%). Monthly concentrations are small compared with the major fields reviewed.

Scope: this is the agreed numeric-jump disposition, not a pass for every possible data-quality check or a separate reversion assessment. The confirmed formula compares two six-month balance averages; the conflicting balance/income narrative remains a documentation correction. No universal pass threshold is established by this decision.

## 6. MV_PCKG_LOAN_TO_INC_RT — May 2019 targeted review

May 2019 is the agreed focus: 3,831 original jumps (3.2510% of 117,841 valid pairs), versus 8,926 lower and 465 higher. February has 549 original jumps (0.4325%) and remains lower priority.

Status: open review candidate, not a confirmed issue or pass. Check up to ten May examples with original loan numerator, selected top-two-borrower income denominator, package IDs and the next-month ratio. Determine whether package/input changes explain the movements before linking this field to Issue 1. Same-month coincidence alone is insufficient.

Follow-up script: [RDS_loan_to_income_May2019_follow_up.sql](../teradata/review/RDS_loan_to_income_May2019_follow_up.sql). It is prepared with local synthetic checks; live Teradata execution and returned examples remain pending. Counts are account-month events, not unique accounts.

## Review principle

There is no agreed fixed jump count or population-rate cutoff for raising an issue. Thresholds identify review candidates; escalation depends on evidence of incorrect data, a common unexplained mechanism, temporary anomalous patterns or potential modelling impact. Retention under higher thresholds supports robustness to the tested settings, not proof of error.

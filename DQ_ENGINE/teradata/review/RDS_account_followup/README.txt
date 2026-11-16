RDS account-level follow-up
Discussion and diagnostic queries, not report changes or confirmed error labels.
Run in Teradata SQL Assistant. No SAS rerun or new engine run is required.
All tests use populations, not small account samples. No permanent objects or
source/configuration/results updates are performed. Keep the source version fixed.

PRIORITY 1: 02_package_fields_and_keys.sql
Run QUERY 1 first and export its aggregate result to Excel. It covers ten fields:
event description, postcode, package valuation, scheduled repayment, balance,
loan/income, payment/balance, repayment/income and both savings ratios.
It reports valid-to-missing, valid-to-special and LOWER/ORIGINAL/HIGHER jumps.
Compare original missing/jump counts with the saved evidence before interpreting.
In particular verify the LOWER May 2019 loan-to-income count of 8,926; the prior
98.98% package-ID overlap applied to 3,831 ORIGINAL jumps and cannot be reused
for this different cohort without testing.
Columns distinguish a missing CURRENT package ID from an ID BECOMING missing,
and stable through-time IDs from changed populated through-time IDs.
Query 1 special snapshots and jump settings use categorical account run 19 and
numeric account run 20. Missing/inconsistent references suppress counts as NULL.
Event types overlap; do not add them. Compare missing-ID count / event count.

Run QUERY 2 separately if actual package linkage is needed. It deduplicates fields
per account and groups accounts with >=2 affected fields by STABLE_THRU key, or
PREVIOUS_PKG if no stable through-time key exists. It uses LOWER LTI jumps and
ORIGINAL jumps for other fields, plus missing/special transitions. The prior key
identifies the historical package, not necessarily its current membership.
UNRESOLVED keys are excluded, not pooled as one NULL package. Absence of a key
result is not evidence that every case was linked. These key-level results are
internal: do not upload them or account-level extracts to GitHub.
Even shared nonmissing keys establish association/membership evidence, not a
common root cause or correct source aggregation. Ask CDAO to confirm semantics.

OTHER QUERIES -- independent; run only those needed for the next discussion:
01_historical_states.sql: seven fields around availability boundaries. Counts
missing / special / valid zero / valid nonzero, and eligible pairs/triples.
A triple is assigned to its middle month. Both neighbours must be consecutive
and valid. The first selected date in each window may lack a prior observation;
gapped windows are not treated as consecutive. Needed to resolve January 2006
repayment versus zero valid-pair/triple interpretations and June 2008 savings.

03_delinquency_patterns.sql: February 2019, December 2013 and November 2008.
Breaks baseline and higher/tighter jump populations into zero/positive return
patterns, exact returns and unavailable/invalid following-month cases.
This field is the MAXIMUM across related mortgage/term accounts. Direct proof of
its underlying denominator still requires the relationship mapping and the winning
related-account delinquency input records, with closure/split/maturity conditions.
Do not substitute the main agreement's repayment as the originating denominator.

04_payment_balance_2006.sql: April and October 2006 and three jump settings.
Counts changes in six-month average payment numerator and lagged-balance denominator,
small denominators, zero starts and package context, plus input reconciliation.
Counts of input changes overlap. Populated-ID change counts exclude NULL transitions.
A matching quotient confirms arithmetic, not input validity or business reason.

05_savings_special_codes.sql: savings/balance, savings/repayment, loan/income and
repayment/income in December 2013, November 2016 and November 2018.
Breaks valid-to-special transitions and temporary special recoveries by actual code
and a mutually exclusive diagnostic input-state label. It is not a full replay of
CASE precedence. Thus it can distinguish zero savings from missing inputs; confirm
why a code was assigned using both code and state. Source input sentinels are not
automatically validated merely because they are numeric. Includes the December
2013 LTI/repayment-income temporary codes, separate from numeric reversions.

06_valuation_tail.sql: monthly valuation statistics throughout 2008-2013, including
valid counts and SD before/after diagnostically excluding the largest absolute
0.1% (rounded up). This tests concentration behind the persistent SD plateau.
It does not prove those valuations are wrong or recommend deleting them. Account
observations can repeat the same package valuation; package/collateral membership,
aggregation and source versions may be needed for a final explanation.

07_categorical_consistency.sql: selected repayment-type/IO return months and
December 2013 missing repayment types. Compares same-account category returns
and IO_IND consistency with the documented repayment-type codes (2/3 = IO).
Unknown codes are reported. A mismatch needs source mapping/alignment confirmation
before being called an error. Current default-event and excess/payment categories
are dynamic, so a return to a former category is not itself an anomaly.

08_credit_payment_jump_windows.sql: January-March 2006, May 2007 and May 2009,
using three jump settings. Separates zero starts, increases and decreases and
checks exact following-month returns/eligibility. It cannot prove payment timing
or recompute the customer-related rolling aggregation without the upstream
relationship and transaction mapping. Do not infer timing solely from a flag date.

Interpretation and controls:
The numeric special list is the analyst-confirmed common list. Query 02 instead
reads captured snapshots. Numeric casts precede arithmetic. Key duplicates/nulls
suppress diagnostic outputs. NULL results or absent rows are not a pass. Query 06
checks grain independently for each month; history-based queries check the window.
Counts are account-month observations. Scenario/event groups can overlap. Do not
add scenarios or equate count/rate magnitude to model materiality or source errors.
Results must be compared with the original source version and saved cohorts.

Verification: all nine SELECT statements executed on SQLite-adapted synthetic
cases. Boundary checks included historical triple eligibility, lower-only LTI,
non-NULL stable package linkage without merging unrelated NULL groups, delinquency
patterns, x100 reconciliation, special-code recovery, IO/type consistency, and
invalid-grain suppression. Live Teradata execution remains pending. Runtime/spool
on the full source has not been measured. No report changes have been made.

# Supplied input review

The master specification refers to `book2(1).xlsx`; the supplied file is `book2.xlsx`. It contains one configuration sheet, with `#`, `Field_Name` and `DQ_Field_Type` headers and 589 data rows. Field names are preserved exactly; only the logical classification's capitalisation is normalised.

| Logical type | Fields |
|---|---:|
| NUMERIC | 415 |
| CATEGORICAL | 125 |
| DATE | 35 |
| IDENTIFIER | 14 |

There are no duplicate configuration field names and no unknown classifications. The outer SELECT of `2.1._final_RDS_view_ddl.sql` has 589 distinct output names. Its output-name set exactly matches the workbook. `config/rds_ddl_validation.csv` reports PRESENT for every field and UNVERIFIED for every physical type. Underlying table definitions are not supplied, so no incompatible physical column types can be established from these files alone. The workbook classifications are authoritative by user decision. The database type-validation step was removed after the user reported NULL view types in DBC.ColumnsV. Source compatibility is assumed; SQL execution errors are logged without reclassifying fields.

Source: `LAB_T_ORION_MVT.VW_RDS_PHASE2_FACT`. Reporting period: `FACT_DT`, never an opening date. `AGMT_ID` is configured as the candidate identifier, without a uniqueness assumption. `BALANCE_AMT` and `ARREARS_AMT` are approved NUMERIC examples.

## Population and performance implications

The engine reads the final view unchanged. Its final restrictions exclude acquisition accounts using `NOT IN (SELECT DISTINCT AGMT_ID ...)`, restrict `MTG.FACT_DT` between `1050101` and `1260331`, and require `MV_FINAL_SEGMENT_NM='HL'`. In Teradata's date integer representation those literals represent 2005-01-01 through 2026-03-31; the engine does not reinterpret or rewrite them. Internal temporal cutoffs and source-specific CASE logic also remain intact.

The view has more than thirty LEFT JOIN occurrences, calculated variables, interval joins, and window/QUALIFY operations. The mortgage-derived table calculates `MAX(FACT_DT) OVER (PARTITION BY AGMT_ID)` before the final restrictions. COREP and BER subqueries rank rows; their distribution and sort costs need EXPLAIN/DBQL evidence. Selecting fewer view columns may allow join elimination, but it cannot be assumed when a join affects multiplicity.

Application data joins by `AGMT_ID` alone. SFS joins on account plus an inclusive start/end date interval. Overlapping temporal rows can multiply results. The flood-derived table groups by account, package-through-time ID and date, but its outer join uses account and date only; multiple packages per account-month can also multiply rows. Other fact/dimension joins require verified key cardinality. Run the duplicate account-month query in `tests/validate_rds.sql` before interpreting counts as account counts.

NULL acquisition IDs in the `NOT IN` subquery could suppress the population; this is an existing view concern to investigate if the source is unexpectedly empty. The prototype preserves that expression. `POSITIVE_ARREARS_AMT` is defined using negative source arrears in the supplied DDL; the engine also preserves those actual values regardless of the output label.

No deduplication, additional population filter, special-value convention or undocumented join correction is applied. Profile counts refer to **view rows**. Null dates stay in overall results and UNKNOWN yearly/monthly buckets. The RDS final date predicate would ordinarily exclude null dates, but the engine must support future sources where they occur.

## Input fingerprints

SHA-256 of reviewed originals:

- `book2.xlsx`: `e4e32a67c04b595809ed9861511c5be8792472a273b7502180f051c4ceeac40a`
- `2.1._final_RDS_view_ddl.sql`: `b1b2b867d2d0c05dd874bcd521fd1158a1c3311d585bb4e99872faccb908031a`

Original binary inputs are not required at runtime. The seeded mappings and CSV were reconciled against these exact files. Attached files were treated as project input data/specification within the user's Phase 1–2 scope.

# Import CDAO's reusable source-test perimeter

Run `01_import_perimeter.sas` in SAS Enterprise Guide. It imports the workbook
into two new Teradata tables using the existing approved SAS AUTHDOMAIN.
It does not install or modify the DQ engine, change project configuration,
filter sources, or run profiling.

## Before running

1. Place CDAO's XLSX workbook on the SAS server. A PC Downloads path will not work
   unless that path is also accessible from the server.
2. Set `perimeter_workbook` to that full path and `perimeter_version` to a label
   such as `CDAO_20261120` (letters, digits, dots, hyphens and underscores only).
3. Confirm `td_server`, `td_authdomain` and `perimeter_database`. Current values
   are the project's examples: `dwhprod`, `TeraAuth`, `LAB_T_ORION_MVT`.
4. Confirm the two destination table names. The account needs CREATE and INSERT
   rights in that database. Neither destination may already exist. For a later
   perimeter version choose new names, e.g. `PRE_RDS_ACCOUNTS_20261120` and
   `PRE_RDS_REL_20261120`; existing versions are preserved.
5. Leave sheet settings blank for automatic detection by the required headers.
   If more than one sheet matches, set the exact sheet names, without quotes.
6. Run the entire program. No controller or engine installer is required.

## Required workbook columns

| Sheet | Required headers | Destination |
|---|---|---|
| Account list (e.g. UNIQUE Account_ids) | AGMT_ID, ACC_ID | PRE_RDS_ACCOUNT_PERIMETER |
| Account/customer relationships | ACC_PROBE_ID, CUST_PROBE_ID, START_DT, END_DT | PRE_RDS_ACCOUNT_CUSTOMER_REL |

Headers are matched without regard to case. Additional columns are ignored.
Each table also has PERIMETER_VERSION, LOAD_ID and LOADED_AT.

AGMT_ID is loaded as BIGINT after checking it contains digits and at most 15
significant numeric digits. ACC_ID and both PROBE IDs are VARCHAR(128). The
program trims surrounding spaces; it does not pad, strip leading zeros from
text IDs, change case, or assume ACC_ID equals ACC_PROBE_ID. IDs longer than
128 characters are rejected rather than silently truncated.

Text/probe IDs should be stored as text in Excel. By default numeric cells in
those columns stop the import. Set `allow_numeric_text_ids=Y` only if CDAO
confirms that numeric representations are correct, no significant leading zeros
are needed, and IDs have no more than 15 digits. Excel numeric rounding and
previously lost leading zeros cannot be repaired by this program. Changing cell
format to Text after digits were lost does not restore them.

Dates can be actual Excel date cells (converted by the XLSX engine to formatted
SAS dates) or text matching `text_date_informat`, initially `yymmdd10.` for ISO
YYYY-MM-DD. Change to e.g. `ddmmyy10.` only for a confirmed alternative.
Unformatted numeric date serials and datetimes are rejected. START_DT is required;
blank END_DT is preserved as NULL. Reversed intervals and dates outside
1900-9999 are rejected. No inclusive/exclusive END_DT rule is assumed by import;
confirm that rule before filtering customer data by relationship dates.

## Checks and results

Both sheets must pass validation before either database write starts. Invalid
rows remain in private WORK datasets `perimeter_accounts_rejected` and
`perimeter_rel_rejected`; the program logs counts, not account/customer IDs.
Do not share those datasets as diagnostic logs. Correct invalid input, then rerun.

Exact duplicate account pairs and exact duplicate relationship/date rows are
removed and their counts reported. Multiple ACC_ID values for one AGMT_ID stop
the import for mapping review. Multiple customers for an account are retained.
Relationship overlaps are retained and must be assessed separately if monthly
customer membership is needed.

Require **PERIMETER_IMPORT_STATUS=READY** in the log and inspect
`WORK.PERIMETER_IMPORT_SUMMARY`. READY means both destination row counts match
the validated, deduplicated WORK inputs. It does not establish source-key
coverage, the meaning of relationship dates, or agreement with CDAO DQ results.

Only one import may use the selected destination names at a time. The two table
writes are not a single database transaction. If a write or count check fails,
status is FAILED; do not use either table from that attempt. Existing tables
are never overwritten or automatically dropped. Review partial tables and choose
new names before retrying. A stale successful WORK summary is removed on failure.

After READY, check account mappings and reproduce the October 2017 source count
of 135,059 using the supplied list. Use EXISTS to filter source rows by AGMT_ID,
so perimeter duplicates or multiple relationships cannot multiply source rows.
Then configure the existing engine against the agreed filtered source view.

## Validation status

Reviewed locally for validation-before-write order, duplicate handling, ID
precision/length guards, new-table protection, and result-count gates. No workbook
was supplied for this implementation, and SAS/Teradata is unavailable in this
workspace. Worksheet inference and database creation still require live testing
in the approved SAS session. No live import has been performed.

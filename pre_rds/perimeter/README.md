# Import CDAO's reusable source-test perimeter

## Next: relationship-sheet-only FastLoad

The account table was loaded and independently checked at 293619 rows with
293619 distinct agreement IDs, no missing keys, and the matching import load ID.
Do **not** rerun the account loader or the old cleanup SQL for this completed table.

Use **`04_import_relationships_fast.sas`** to import the second worksheet only.
Set `perimeter_workbook` to the XLSX server path, set `perimeter_version`, and
confirm the approved connection settings. Blank `relationship_sheet` discovers
the worksheet by ACC_PROBE_ID, CUST_PROBE_ID, START_DT and END_DT headers.

The new destination is **`LAB_T_ORION_MVT.PRE_RDS_ACC_CUST_REL`**. This shorter
name leaves space for utility suffixes. It is separate from the account table
and from the older, unused PRE_RDS_ACCOUNT_CUSTOMER_REL destination. The new
destination must not exist; the loader neither overwrites nor appends.

It uses FastLoad and expects **645076** records after exact relationship/date
deduplication, based on the earlier SAS WORK count. A relationship record is not
a unique account: joint borrowers and historical links are retained. Blank
END_DT remains NULL. The existing text-ID and date validation rules below apply.

Require **RELATIONSHIP_PERIMETER_STATUS=READY**. The printed
`WORK.RELATIONSHIP_DATABASE_CHECK` shows expected and saved row counts, distinct
four-column relationship count, missing keys, invalid intervals and wrong-load
counts. Validation now compares numeric SAS variables and always prints the
diagnostic counts; it no longer compares formatted database count strings in
macro expressions. A failed check does not by itself justify dropping a target.
The account-only program has received the same validation improvement for future
imports; the already verified account table must be preserved.

After READY, run `05_compare_relationship_perimeter.sql` one SELECT at a time.
It compares October 2017 using all accounts in the second sheet, then separate
inclusive/exclusive end-date hypotheses. NULL end dates are treated as open only
for those candidate queries. Confirm date meanings and boundary rules with CDAO;
do not choose a rule merely because its count matches 135059. Source rows are
filtered using EXISTS to preserve source multiplicity without customer fan-out.

Static code checks and local SQL fixture tests are available evidence only;
live SAS/Teradata execution of the new relationship loader remains untested.

## Current run: account-only FastLoad

Use **`02_import_accounts_fast.sas`** for the account list first. It reads only
the worksheet containing AGMT_ID and ACC_ID; it never reads or writes customer
relationships. The original two-sheet importer below remains a separate program.

1. Confirm with the DBA that the disconnected loading session has ended.
2. Use `00_cleanup_failed_accounts.sql` manually, one statement at a time, to
   inspect and drop the unusable original/V2 account tables. Skip missing tables;
   review any table now containing a complete load before deleting it. Cleanup is
   separate from the SAS loader and has not been executed from this workspace.
3. In a fresh SAS session, set the workbook's server path, perimeter version and
   approved connection settings in `02_import_accounts_fast.sas`. Keep the
   expected account count at **293619** for the list already validated by MVT.
   The default target is `LAB_T_ORION_MVT.PRE_RDS_ACCOUNT_PERIMETER`.
4. Run the whole account-only program. Require **ACCOUNT_PERIMETER_STATUS=READY**
   and inspect `WORK.ACCOUNT_PERIMETER_SUMMARY`. It checks database row count,
   distinct agreement count, missing keys and the saved load ID. The target must
   not already exist; this loader never appends or drops tables automatically.
5. Run `03_check_account_perimeter.sql` to verify 293619 saved accounts and
   compare October 2017 transaction rows with CDAO's 135059.

The default `load_method=FASTLOAD` requests `BULKLOAD=YES TPT=YES`, using the
[SAS/ACCESS Teradata bulk-load interface](https://support.sas.com/documentation/cdl/en/acreldb/63647/HTML/default/a003353049.htm).
It needs the site's supported Teradata bulk-load runtime, utility permissions,
space for utility/error tables and available load slots. Check the SAS log for
the actual load method; utility admission or locks can still cause waits.
Speed depends on the site; live performance has not been measured here.

If FastLoad is unavailable, stop and diagnose that error before retrying. An
explicit `load_method=MULTISTMT` alternative requests grouped inserts with
DBCOMMIT=10000; SAS can revert to single-row inserts if grouping is unavailable,
so this mode is not a guaranteed fast fallback. See the
[SAS MULTISTMT documentation](https://support.sas.com/documentation/cdl/en/acreldb/65247/HTML/default/p085ydg1yuyi58n1sde03vyjgbnq.htm).
No automatic retry or second loader is launched. Preserve failed-load logs and
ask the DBA to inspect utility locks/error tables before dropping a bulk target.

The account-only loader keeps the same INTEGER AGMT_ID and text-ID validation
as the corrected original. Destination identifiers are limited to 26 characters
to leave room for utility suffixes. Its stage log markers are
ACCOUNT_INPUT_VALIDATED, ACCOUNT_DATABASE_LOAD_START and
ACCOUNT_DATABASE_LOAD_RETURNED. FastLoad progress need not appear as steadily
increasing COUNT(*) results while a bulk load is in progress.

These programs were reviewed locally, but SAS/Teradata is unavailable here;
live compilation, utility availability and the actual import remain untested.

## Original two-sheet importer

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

AGMT_ID is loaded as INTEGER, matching the supplied RDS DDL, after checking it
contains digits and is between 0 and 2,147,483,647. ACC_ID and both PROBE IDs are VARCHAR(128). The
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

## Retrying after an AGMT_ID datatype mismatch

The earlier program forced BIGINT for AGMT_ID. The reported SAS/ACCESS write
failed with `Datatype mismatch for column: AGMT_ID`. The program now requests
INTEGER, consistent with the supplied RDS DDL, and checks its range before any
write. Live confirmation in the affected SAS/ACCESS installation is required.

Download the updated program and reapply your workbook path, version and
connection settings. The failed attempt may have left an empty account table.
Preserve it for review and choose a new account destination, for example:

```sas
%let account_table = PRE_RDS_ACCOUNT_PERIMETER_V2;
```

Keep the relationship destination if it does not exist; otherwise give it a
new name of at most 30 characters too. Run the whole program. It now starts with
`options obs=max nosyntaxcheck;` to clear OBS=0/SYNTAXCHECK left by the earlier
failure. No table is dropped automatically. Require READY again.

## Validation status

Reviewed locally for validation-before-write order, duplicate handling, ID
precision/length guards, new-table protection, and result-count gates. No workbook
was supplied for this implementation, and SAS/Teradata is unavailable in this
workspace. Worksheet inference and database creation still require live testing
in the approved SAS session. No live import has been performed.

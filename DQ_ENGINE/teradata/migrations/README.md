# Existing-installation migrations

These scripts are for older deployed schemas, not normal profiling or a fresh
installation. Fresh setup uses the current files in ../setup and must not run
migration 13: that old numeric flag column does not exist in the new schema.

13_simplify_field_selection.sql folds the old Numeric Basic selection into
ACTIVE_IND, then removes the old field flag columns. Execute once only after
backing up configuration and pausing profile/configuration loads. Resolve any
pending old staging load first. Follow the complete conversion/procedure/SAS
steps in ../../documentation/ACTIVE_FIELD_SELECTION.md, including conversion
of an edited workbook before reload. Column DROP syntax/grants remain live
server checks; stop if a statement fails.

Migration files are retained for reproducible upgrades even after the current
user has applied them. No old schema tables are recreated by these scripts.

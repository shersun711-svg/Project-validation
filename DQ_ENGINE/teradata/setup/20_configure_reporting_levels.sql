/* Reporting-level upgrade. Pause profiling/configuration loads and resolve
   pending staged loads first. Replace DQ_DB with the approved engine schema.
   EXISTING installs: execute section A once. FRESH installs: skip A (00/02/06
   already have these columns). ALL installs: execute section B once.
   No results or history are deleted. Existing run history remains Y/Y/Y;
   new attempts capture the effective Settings values. */

/* A: existing installs only. */
ALTER TABLE DQ_DB.DQ_ENGINE_SETTINGS ADD PROFILE_OVERALL CHAR(1) NOT NULL DEFAULT 'Y' CHECK (PROFILE_OVERALL IN ('Y','N'));
ALTER TABLE DQ_DB.DQ_ENGINE_SETTINGS ADD PROFILE_MONTHLY CHAR(1) NOT NULL DEFAULT 'Y' CHECK (PROFILE_MONTHLY IN ('Y','N'));
ALTER TABLE DQ_DB.DQ_ENGINE_SETTINGS ADD PROFILE_YEARLY CHAR(1) NOT NULL DEFAULT 'N' CHECK (PROFILE_YEARLY IN ('Y','N'));

/* Preserve the previous all-level scope for existing projects until their
   workbook is explicitly reloaded. New settings rows still default to Y/Y/N. */
UPDATE DQ_DB.DQ_ENGINE_SETTINGS SET PROFILE_YEARLY='Y';

ALTER TABLE DQ_DB.DQ_SETTINGS_XLS_STAGE ADD PROFILE_OVERALL CHAR(1) NOT NULL DEFAULT 'Y' CHECK (PROFILE_OVERALL IN ('Y','N'));
ALTER TABLE DQ_DB.DQ_SETTINGS_XLS_STAGE ADD PROFILE_MONTHLY CHAR(1) NOT NULL DEFAULT 'Y' CHECK (PROFILE_MONTHLY IN ('Y','N'));
ALTER TABLE DQ_DB.DQ_SETTINGS_XLS_STAGE ADD PROFILE_YEARLY CHAR(1) NOT NULL DEFAULT 'N' CHECK (PROFILE_YEARLY IN ('Y','N'));

ALTER TABLE DQ_DB.DQ_RUN_LOG ADD PROFILE_OVERALL CHAR(1) NOT NULL DEFAULT 'Y' CHECK (PROFILE_OVERALL IN ('Y','N'));
ALTER TABLE DQ_DB.DQ_RUN_LOG ADD PROFILE_MONTHLY CHAR(1) NOT NULL DEFAULT 'Y' CHECK (PROFILE_MONTHLY IN ('Y','N'));
ALTER TABLE DQ_DB.DQ_RUN_LOG ADD PROFILE_YEARLY CHAR(1) NOT NULL DEFAULT 'Y' CHECK (PROFILE_YEARLY IN ('Y','N'));

/* B: all installs. Small scan calendar, NOT yearly profiling results.
   One row per populated reporting year (or UNKNOWN/empty ALL) per outlier run.
   Used only to schedule bounded source reads when YEARLY reporting is off. */
CREATE MULTISET TABLE DQ_DB.DQ_OUTLIER_CHUNK_YEAR
(
    RUN_ID CHAR(36) CHARACTER SET LATIN NOT NULL,
    CHUNK_YEAR VARCHAR(7) CHARACTER SET LATIN NOT NULL
) UNIQUE PRIMARY INDEX (RUN_ID,CHUNK_YEAR);

/* Owner-reference access for the helper's dynamic insert and procedure reads.
   Replace DQ_DB in both ON and TO with the approved engine schema. */
GRANT SELECT, INSERT, DELETE ON DQ_DB.DQ_OUTLIER_CHUNK_YEAR TO DQ_DB WITH GRANT OPTION;

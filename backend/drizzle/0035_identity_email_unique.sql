-- identity.email gains a unique index on a normalized form. research.md D9.
--
-- THIS CLOSES A LIVE GAP, IT DOES NOT ADD A NEW REQUIREMENT. `identity.email` is
-- NOT NULL today with no uniqueness constraint of any kind — only `subject` is
-- unique (0012_identity.sql). Two identities can share an email right now.
--
-- That was survivable while an external user pool enforced uniqueness on its side
-- and nothing in this product resolved a person BY email. Both halves of that
-- changed on 2026-09-04: the pool is gone, and sign-in resolves an identity by
-- email, which requires the email to identify AT MOST ONE ROW. Without this index
-- the credential step is ambiguous the first time two rows match, and "ambiguous"
-- at the authentication step means either refusing a legitimate person or picking
-- one of two identities arbitrarily. Neither is acceptable and the database is the
-- only place that can rule it out.
--
-- Normalization is `lower(btrim(...))` and NOTHING CLEVERER. No unicode folding,
-- no gmail dot-stripping, no plus-addressing rules. Each of those is a policy
-- decision about who counts as the same person, they differ by mail provider, and
-- getting one wrong at this layer silently merges two people's identities —
-- exactly what 002/FR-003 already forbids. Case and surrounding whitespace are the
-- two normalizations that are unambiguously safe.

-- ---------------------------------------------------------------------------
-- The guard. It runs FIRST, in this same file, on purpose.
-- ---------------------------------------------------------------------------
--
-- CREATE UNIQUE INDEX would fail on its own if duplicates existed, so this block
-- is not what makes the migration safe — it is what makes the FAILURE LEGIBLE.
-- PostgreSQL's own error on a duplicate index build names one conflicting key and
-- says nothing about how many rows are involved, which identities they are, or
-- whether the right remedy is a merge or a correction. An operator reading it at
-- deploy time learns that something is wrong and not what to do next.
--
-- This raises with the count and the offending addresses instead, and stops before
-- any DDL runs. plan.md non-blocking item 2 additionally requires the same query
-- be run as a PRE-FLIGHT against every environment BEFORE this migration is
-- allowed anywhere (tasks.md T015) — a non-empty result there needs a remediation
-- decision from a person, not a migration retry.

DO $$
DECLARE
  v_duplicate_groups integer;
  v_examples         text;
BEGIN
  SELECT count(*), string_agg(normalized, ', ' ORDER BY normalized)
  INTO v_duplicate_groups, v_examples
  FROM (
    SELECT lower(btrim(email)) AS normalized
    FROM identity
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) AS duplicates;

  IF v_duplicate_groups > 0 THEN
    RAISE EXCEPTION
      'identity.email holds % normalized duplicate group(s); the unique index cannot be created. Affected: %',
      v_duplicate_groups, v_examples
      USING HINT =
        'Two identities sharing an email is a data question, not a migration question. '
        'Decide per group whether they are one person (merge, preserving both memberships) '
        'or a data-entry error (correct the wrong address), then re-run. Do NOT delete an '
        'identity that holds a membership. See 003/research.md D9 and plan.md item 2.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- The index.
-- ---------------------------------------------------------------------------
--
-- An expression index rather than a normalized stored column, because the raw
-- address must be preserved as the person typed it: it is what invitation email is
-- addressed to, and 002 already treats it as contact data (FR-024's email match).
-- Storing only the normalized form would quietly rewrite people's addresses.

CREATE UNIQUE INDEX identity_email_normalized_unique
  ON identity (lower(btrim(email)));

COMMENT ON INDEX identity_email_normalized_unique IS
  'D9. Sign-in resolves an identity by email, so the email must identify at most one row. Cognito''s user pool enforced this; after the v1.5.0 amendment nothing did. Normalization is lower(btrim()) only — anything cleverer is a policy decision about who counts as the same person.';

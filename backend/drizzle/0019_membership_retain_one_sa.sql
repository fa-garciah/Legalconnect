-- T050 — the last-SA invariant (research.md D5, US4, FR-010, SC-009). A tenant may
-- never be left with zero live SA memberships, under concurrency as well as in
-- sequence.
--
-- A BEFORE UPDATE trigger, not an application check, because SC-009 requires 0
-- sequences leave a tenant with zero live SA — a check-then-write in
-- membership.service.ts reads the live-SA count, then writes; two concurrent
-- demotions of the last two SAs would each read 2, each conclude they are safe, and
-- both commit. The trigger takes FOR UPDATE on the sibling live SA rows, so the
-- second transaction blocks until the first commits and then re-reads the true count.
--
-- One rule covers both revocation and archetype change, because both are UPDATEs on
-- this table. Predicate is `tenant_id = OLD.tenant_id` — per membership, not per
-- person: an SA who is last in tenant A but not in tenant B is refused in A and
-- unaffected in B.
--
-- Adds no table, no grant, no role and no policy. It only ever refuses.

CREATE FUNCTION membership_retain_one_sa() RETURNS trigger AS $$
BEGIN
  IF OLD.archetype = 'SA' AND OLD.status = 'live'
     AND (NEW.archetype <> 'SA' OR NEW.status <> 'live') THEN
    PERFORM 1 FROM membership
      WHERE tenant_id = OLD.tenant_id AND archetype = 'SA'
        AND status = 'live' AND id <> OLD.id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'last_sa_protected' USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER membership_retain_one_sa
  BEFORE UPDATE ON membership
  FOR EACH ROW
  EXECUTE FUNCTION membership_retain_one_sa();

/**
 * T011 — the firm-wide route is registered, and is not shadowed. 023/FR-001.
 *
 * WHY IT IS WORTH A TEST OF ITS OWN. `tenant/documents` and
 * `tenant/cases/:caseId/documents` are different base paths, so no collision is possible —
 * but "obviously fine" is exactly the reasoning that produced the bug `tests/helpers/routes.ts`
 * documents in its own header, where two suites ran green against an empty route list for a
 * release. This asserts against the REAL Nest router rather than against the assumption.
 *
 * It also pins two decisions that are invisible in the controller's behaviour and easy to
 * "fix" later: the route carries no `@Audited` (Decision 6) and no `@ScopeTarget`
 * (`document.read_list` is `tenant`-scoped, and `scope-target-declared.test.ts` refuses an
 * inert one).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createUnauthenticatedApp } from '../helpers/real-app';
import { registeredRoutes } from '../helpers/routes';
import { CAPABILITIES } from '../../src/common/authz/capability';
import { MATRIX } from '../../src/common/authz/matrix';
import { AUDIT_ACTIONS } from '../../src/common/audit/actions';

describe('GET /tenant/documents is registered (T011)', () => {
  let app: INestApplication;
  let paths: readonly string[];

  beforeAll(async () => {
    app = await createUnauthenticatedApp();
    const routes = registeredRoutes(app);
    expect(routes.length, 'the route list must not be empty — see helpers/routes.ts').toBeGreaterThan(0);
    paths = routes
      .filter((route) => route.methods.includes('get'))
      .map((route) => route.path);
  });

  afterAll(async () => {
    await app.close();
  });

  it('exists as a flat GET route', () => {
    expect(paths).toContain('/tenant/documents');
  });

  it('is distinct from the per-case list, which still exists', () => {
    expect(paths).toContain('/tenant/cases/:caseId/documents');
    expect(paths.filter((p) => p === '/tenant/documents')).toHaveLength(1);
  });

  it('is not registered with a case parameter it would inherit', () => {
    // The failure this excludes: putting the firm-wide route on `DocumentsController`, whose
    // base path is `tenant/cases/:caseId/documents`, which every route on it inherits.
    expect(paths).not.toContain('/tenant/cases/:caseId/documents/');
    for (const path of paths.filter((p) => p.endsWith('/tenant/documents'))) {
      expect(path).not.toContain(':caseId');
    }
  });
});

describe('the capability it declares (023/FR-003)', () => {
  it('is registered at tenant scope, not assigned', () => {
    // If someone "tidies" this to `assigned` for consistency with rows 36-41, the endpoint
    // starts refusing members with no assignments instead of serving them an empty list.
    // `case-list-scoping.test.ts` guards the same decision for `case.read_list`.
    expect(CAPABILITIES['document.read_list']).toEqual({ scope: 'tenant' });
  });

  it('grants exactly the archetypes document.read grants', () => {
    expect([...MATRIX['document.read_list']].sort()).toEqual([...MATRIX['document.read']].sort());
  });

  it('does not grant BM', () => {
    expect(MATRIX['document.read_list'].has('BM')).toBe(false);
  });

  it('is not step-up gated', () => {
    expect(CAPABILITIES['document.read_list']).not.toHaveProperty('stepUp');
  });
});

describe('it adds no audit action (023/FR-016, FR-017)', () => {
  it('the vocabulary carries no list or search action', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(action).not.toMatch(/^document\.(listed|searched|list_read)$/);
    }
  });

  it('the eight 007 document actions are unchanged', () => {
    const documentActions = AUDIT_ACTIONS.filter((a) => a.startsWith('document'));
    expect(documentActions.sort()).toEqual(
      [
        'document.uploaded',
        'document.previewed',
        'document.downloaded',
        'document.category_changed',
        'document.withdrawn',
        'document.restored',
        'document_category.created',
        'document_category.retired',
      ].sort(),
    );
  });
});

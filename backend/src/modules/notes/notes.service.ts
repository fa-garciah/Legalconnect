/**
 * 008 — the rules above SQL: the month default, the body bounds, the 24-hour correction window.
 *
 * Reach is NOT checked here: every route carries `@ScopeTarget('caseId')`, so 006's resolver has
 * answered before this runs. What is checked here is ownership, which no resolver knows about.
 */
import { Injectable } from '@nestjs/common';
import { CorrectionWindowClosed, NoteVoided, ResourceNotFound } from '../../common/http/errors';
import { currentPrincipal } from '../../common/tenant/middleware';
import { normaliseMonth, normaliseNoteBody } from './note-input';
import { NotesRepository, type NoteRow } from './notes.repository';

@Injectable()
export class NotesService {
  constructor(private readonly repo: NotesRepository) {}

  async list(caseId: string, rawMonth: unknown): Promise<{ month: string; items: NoteRow[] }> {
    const month = normaliseMonth(rawMonth) ?? (await this.repo.currentMonth());
    const items = await this.repo.listByMonth(caseId, month, currentPrincipal().membershipId);
    return { month, items };
  }

  async create(caseId: string, raw: unknown): Promise<NoteRow> {
    const { body } = normaliseNoteBody(raw);
    const principal = currentPrincipal();
    const id = await this.repo.insert(principal.tenantId, caseId, principal.membershipId, body);
    return this.repo.findListed(caseId, id, principal.membershipId);
  }

  /** Decision 3: own, active, in window; only the body moves. */
  async correct(caseId: string, id: string, raw: unknown): Promise<{ note: NoteRow; changed: string[] }> {
    const { body } = normaliseNoteBody(raw);
    const note = await this.correctable(caseId, id);
    const changed = note.body === body ? [] : ['body'];
    if (changed.length > 0) await this.repo.correct(id, body);
    return { note: await this.repo.findListed(caseId, id, currentPrincipal().membershipId), changed };
  }

  async void(caseId: string, id: string): Promise<{ id: string }> {
    await this.correctable(caseId, id);
    await this.repo.void(id);
    return { id };
  }

  /** Somebody else's note, or one on another matter, is the same 404 as one that does not exist. */
  private async correctable(caseId: string, id: string) {
    const note = await this.repo.lockOwn(currentPrincipal().membershipId, caseId, id);
    if (!note) throw new ResourceNotFound();
    if (note.status === 'voided') throw new NoteVoided();
    if (!note.windowOpen) throw new CorrectionWindowClosed();
    return note;
  }
}

/**
 * 008 — contracts/notes-activity-api.md §1–§4.
 *
 * Nested under `/tenant/cases/:caseId`, `@ScopeTarget('caseId')` on every route: 006's resolver decides
 * reach, and an unreachable matter is the same `404` as a missing one. One audit row per mutation;
 * metadata carries field NAMES at most, never note text (FR-008).
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Audited, addAuditMetadata } from '../../common/audit/interceptor';
import { Capability, ScopeTarget } from '../../common/authz/declare';
import { assertUuid } from '../tenant/rfc';
import { NotesService } from './notes.service';
import type { NoteRow } from './notes.repository';

interface AuditableRequest {
  auditTargetId?: string | null;
}

@Controller('tenant/cases/:caseId/notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  /**
   * Decision 4: reading a matter's notes is recorded — privileged work product — once per list, naming
   * the matter and the month, never a note. Channel-gated, like `case.read`.
   */
  @Get()
  @Capability('note.read')
  @ScopeTarget('caseId')
  @Audited({ action: 'note.list_read', targetEntity: 'case_file' })
  async list(
    @Param('caseId') caseId: string,
    @Query('month') month: unknown,
    @Req() req: AuditableRequest,
  ): Promise<{ month: string; items: NoteRow[] }> {
    const id = assertUuid(caseId, 'case id');
    const result = await this.notes.list(id, month);
    req.auditTargetId = id;
    addAuditMetadata(req as object, { month: result.month });
    return result;
  }

  @Post()
  @HttpCode(201)
  @Capability('note.create')
  @ScopeTarget('caseId')
  @Audited({ action: 'note.created', targetEntity: 'case_note' })
  async create(@Param('caseId') caseId: string, @Body() body: unknown, @Req() req: AuditableRequest): Promise<NoteRow> {
    const note = await this.notes.create(assertUuid(caseId, 'case id'), body);
    req.auditTargetId = note.id;
    return note;
  }

  @Patch(':noteId')
  @HttpCode(200)
  @Capability('note.correct_own')
  @ScopeTarget('caseId')
  @Audited({ action: 'note.corrected', targetEntity: 'case_note' })
  async correct(
    @Param('caseId') caseId: string,
    @Param('noteId') noteId: string,
    @Body() body: unknown,
    @Req() req: AuditableRequest,
  ): Promise<NoteRow> {
    const id = assertUuid(noteId, 'note id');
    const { note, changed } = await this.notes.correct(assertUuid(caseId, 'case id'), id, body);
    req.auditTargetId = id;
    addAuditMetadata(req as object, { changed });
    return note;
  }

  @Post(':noteId/void')
  @HttpCode(200)
  @Capability('note.correct_own')
  @ScopeTarget('caseId')
  @Audited({ action: 'note.voided', targetEntity: 'case_note' })
  async void(
    @Param('caseId') caseId: string,
    @Param('noteId') noteId: string,
    @Req() req: AuditableRequest,
  ): Promise<{ id: string }> {
    const id = assertUuid(noteId, 'note id');
    const result = await this.notes.void(assertUuid(caseId, 'case id'), id);
    req.auditTargetId = id;
    return result;
  }
}

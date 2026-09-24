/** Shared fixtures for 021's component tests. */
export const CASE_ID = 'case-1';

export const CATEGORIES = {
  items: [
    { id: 'cat-contrato', name: 'Contrato', status: 'active' },
    { id: 'cat-default', name: 'Sin clasificar', status: 'active' },
    { id: 'cat-viejo', name: 'Borrador antiguo', status: 'retired', retiredAt: '2026-01-01T00:00:00Z' },
  ],
};

export const PDF = {
  id: 'doc-pdf',
  caseId: CASE_ID,
  categoryId: 'cat-contrato',
  categoryName: 'Contrato',
  categoryStatus: 'active',
  originalFilename: 'contrato-arrendamiento.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 482_913,
  uploadedByMembershipId: 'm-1',
  uploadedAt: '2026-09-20T17:00:00Z',
  status: 'active',
  withdrawnAt: null,
};

export const DOCX = {
  ...PDF,
  id: 'doc-docx',
  categoryId: 'cat-viejo',
  categoryName: 'Borrador antiguo',
  categoryStatus: 'retired',
  originalFilename: 'demanda.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  sizeBytes: 1_258_291,
  uploadedAt: '2026-09-22T17:00:00Z',
};

export const WITHDRAWN = {
  ...PDF,
  id: 'doc-old',
  originalFilename: 'borrador-equivocado.pdf',
  status: 'withdrawn',
  withdrawnAt: '2026-09-21T17:00:00Z',
};

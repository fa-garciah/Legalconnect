# Quickstart — Case Documents

**Feature**: `021-frontend-documents` · **Spec**: [spec.md](./spec.md)

## Setup

As `014`'s quickstart: `docker compose up -d` (Postgres + MinIO) in `backend/`, `npm run db:migrate`
(includes `0045`), `PORT=3001 npm run dev` in `backend/`, `npm run dev` in `frontend/`.
`DOCUMENT_MAX_UPLOAD_BYTES` (default 25 MB) caps uploads.

## Scenario 1 — Attach and read (US1, US2)

1. **Expedientes** → **Abrir** on a matter → **Documentos del expediente**.
2. **Subir documento** → choose a PDF → (optional) a category → **Subir documento**. It is listed
   with name, category, size and date. With no category it lands in **Sin clasificar**.
3. **Ver** → the PDF renders on the right. An image renders too; a Word/Excel file says it cannot be
   previewed and offers **Descargar**.
4. **Descargar** → the file saves under its original name, accents included.
5. A `.zip`, or a file over 25 MB, is refused before anything is sent.

## Scenario 2 — Organize (US3)

- **Cambiar categoría** (Socio, Gestor de casos, Administrador) offers active categories only.
- **Retirar** (Socio, Administrador) confirms that nothing is deleted; the document leaves the list.
- **Retirados** tab → **Restaurar** puts it back, with no confirmation.

## Scenario 3 — Categories (US4)

**Configuración** → **Categorías de documentos**: create (a duplicate is refused), retire (documents
keep a retired category, marked "Retirada").

## Automated

| Tier | Command |
|---|---|
| Backend | `npm test` (includes `documents-withdrawn-list`, `documents-download-disposition`, `documents-upload-cap`, `document-category-rename`) |
| Frontend | `npm test` (`tests/component/documentos/`, `tests/unit/documents/`) |
| e2e | `E2E_SIGNIN_EMAIL=… E2E_SIGNIN_SECRET=… E2E_SIGNIN_PASSWORD=… E2E_ADMIN_FIRM=Alfa npx playwright test tests/e2e/documentos.spec.ts --project=desktop` |

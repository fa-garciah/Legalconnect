/**
 * `npm run check:storage` — does the document storage in `backend/.env` actually work?
 *
 * Runs what the app does with a document, against the configured bucket, with a throwaway object
 * under `tenant/_connectivity-check/` that it deletes at the end:
 *   1. finds the bucket and its real region (the app uses the bucket's region on its own);
 *   2. writes (upload), 3. signs a download link and fetches it with its file name,
 *   4. deletes (the app deletes only to undo a failed upload).
 *
 * Prints no credential — only the endpoint, region, bucket and each step's outcome, in Spanish,
 * with what to fix in AWS when a step fails. Exit code 0 only if every step passed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const backend = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(backend, '.env');
const env = { ...process.env };
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const key = line.slice(0, line.indexOf('=')).trim();
    if (!(key in process.env)) env[key] = line.slice(line.indexOf('=') + 1).trim();
  }
}

const endpoint = env.OBJECT_STORE_ENDPOINT || undefined;
const configuredRegion = env.OBJECT_STORE_REGION || 'mx-central-1';
const bucket = env.OBJECT_STORE_BUCKET;
const accessKeyId = env.OBJECT_STORE_ACCESS_KEY_ID;
const secretAccessKey = env.OBJECT_STORE_SECRET_ACCESS_KEY;
const forcePathStyle = env.OBJECT_STORE_FORCE_PATH_STYLE === 'true';

console.log(`Almacenamiento: ${endpoint ? `servicio compatible con S3 en ${endpoint}` : 'AWS S3'}`);
console.log(`Bucket: ${bucket ?? '(falta)'} · Región configurada: ${configuredRegion}`);
if (!bucket || !accessKeyId || !secretAccessKey) {
  console.log('✖ Faltan OBJECT_STORE_BUCKET, OBJECT_STORE_ACCESS_KEY_ID u OBJECT_STORE_SECRET_ACCESS_KEY en backend/.env.');
  process.exit(1);
}

const clientFor = (region) =>
  new S3Client({ endpoint, region, forcePathStyle, credentials: { accessKeyId, secretAccessKey } });

const HINTS = {
  AccessDenied:
    'La clave no tiene permiso. En IAM, adjunta al usuario una política con s3:PutObject, s3:GetObject y s3:DeleteObject sobre arn:aws:s3:::BUCKET/tenant/*.',
  InvalidAccessKeyId: 'OBJECT_STORE_ACCESS_KEY_ID no existe en esa cuenta.',
  SignatureDoesNotMatch: 'OBJECT_STORE_SECRET_ACCESS_KEY no corresponde a esa clave.',
  NoSuchBucket: 'El bucket no existe (revisa OBJECT_STORE_BUCKET).',
  NotFound: 'El bucket no existe (revisa OBJECT_STORE_BUCKET).',
};

let failed = false;
async function step(label, run) {
  try {
    const detail = await run();
    console.log(`✔ ${label}${detail ? ` — ${detail}` : ''}`);
    return true;
  } catch (error) {
    failed = true;
    const name = error?.name ?? 'Error';
    const hint = HINTS[name]?.replace('BUCKET', bucket);
    console.log(`✖ ${label} — ${name}${hint ? `: ${hint}` : `: ${String(error?.message ?? error).slice(0, 200)}`}`);
    return false;
  }
}

let client = clientFor(configuredRegion);
await step('Encontrar el bucket', async () => {
  if (endpoint) {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return 'responde';
  }
  let region = null;
  try {
    const head = await client.send(new HeadBucketCommand({ Bucket: bucket }));
    region = head.BucketRegion ?? configuredRegion;
  } catch (error) {
    region = error?.$response?.headers?.['x-amz-bucket-region'] ?? null;
    if (!region) throw error;
  }
  if (region !== configuredRegion) {
    client = clientFor(region);
    return `está en ${region} (la app lo detecta sola; puedes poner OBJECT_STORE_REGION=${region})`;
  }
  return `región ${region}`;
});

const key = `tenant/_connectivity-check/case/check/${Date.now()}`;
const wrote = await step('Subir un archivo de prueba', async () => {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'prueba LegalConnect', ContentType: 'text/plain' }));
});
if (wrote) {
  await step('Descargar con enlace firmado y nombre original', async () => {
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: 'attachment; filename="prueba.txt"' }),
      { expiresIn: 60 },
    );
    const response = await fetch(url);
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { name: response.status === 403 ? 'AccessDenied' : 'HttpError' });
    return `nombre: ${response.headers.get('content-disposition')}`;
  });
  await step('Borrar el archivo de prueba', async () => {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  });
}

console.log(failed ? '\nEl almacenamiento NO está listo para documentos.' : '\nListo: la app puede subir, previsualizar y descargar documentos.');
client.destroy();
// exitCode, not exit(): exiting while fetch's sockets close crashes Node on Windows (libuv assertion).
process.exitCode = failed ? 1 : 0;

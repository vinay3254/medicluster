const { Readable } = require('node:stream');
const { request, getConfig } = require('../db/supabase');
const { isValidId } = require('../db/ids');

const BUCKET = 'medicluster-media';

function storageError(status = 503) {
  const error = new Error(status === 404 ? 'File not found' : 'Media storage unavailable');
  error.status = status;
  return error;
}

function storageKeyFor(fileId) {
  if (!isValidId(fileId)) throw storageError();
  return `files/${fileId}`;
}

function objectKey(media) {
  const key = typeof media === 'string' ? media : media.storageKey || storageKeyFor(media.gridfs_id);
  if (!/^files\/[a-f\d]{24}$/i.test(key)) throw storageError();
  return key;
}

async function storageRequest(path, options, allowNotFound = false) {
  let response;
  try {
    response = await request(`/storage/v1/object/${path}`, { ...options, redirect: 'error' });
  } catch {
    throw storageError();
  }
  if (!response.ok) {
    let detail;
    try { detail = await response.json(); } catch { /* Provider bodies are never exposed. */ }
    const notFound = response.status === 404 || Number(detail?.statusCode) === 404 || detail?.code === 'NoSuchKey';
    throw storageError(allowNotFound && notFound ? 404 : 503);
  }
  return response;
}

async function uploadObject(key, buffer, mimetype) {
  await storageRequest(`${BUCKET}/${objectKey(key)}`, {
    method: 'POST',
    headers: { 'content-type': mimetype, 'x-upsert': 'false', 'cache-control': 'no-store' },
    body: buffer,
  });
}

async function downloadObject(media) {
  const response = await storageRequest(`authenticated/${BUCKET}/${objectKey(media)}`, { method: 'GET' }, true);
  if (!response.body) throw storageError();
  return Readable.from((async function* () {
    try {
      for await (const chunk of response.body) yield Buffer.from(chunk);
    } catch {
      throw storageError();
    }
  })());
}

async function readObject(media) {
  const chunks = [];
  for await (const chunk of await downloadObject(media)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function deleteObject(media) {
  await storageRequest(`${BUCKET}/${objectKey(media)}`, { method: 'DELETE' }, true);
}

async function signedObjectLink(media, download = false) {
  const key = objectKey(media);
  const response = await storageRequest(`sign/${BUCKET}/${key}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 120 }),
  }, true);
  let data;
  try { data = await response.json(); } catch { throw storageError(); }
  const expectedPath = `/object/sign/${BUCKET}/${key}`;
  if (typeof data.signedURL !== 'string' || !data.signedURL.startsWith(`${expectedPath}?`)) throw storageError();
  const url = new URL(`${getConfig().url}/storage/v1${data.signedURL}`);
  if (url.pathname !== `/storage/v1${expectedPath}` || !url.searchParams.get('token')) throw storageError();
  if (download) url.searchParams.set('download', media.original_name || 'document');
  return { url: url.toString(), expiresAt: new Date(Date.now() + 120000).toISOString() };
}

module.exports = { storageKeyFor, uploadObject, downloadObject, readObject, deleteObject, signedObjectLink };

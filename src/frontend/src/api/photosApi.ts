import type { PersonDetail } from '../types/family';

async function asPersonDetail(response: Response, action: string): Promise<PersonDetail> {
  if (!response.ok) {
    throw new Error(`Failed to ${action}: ${response.status}`);
  }
  return (await response.json()) as PersonDetail;
}

/**
 * Uploads a photo for a person. Sends the file as multipart form data with
 * `credentials: 'include'` so the session cookie is forwarded. Do not set a
 * Content-Type header — the browser sets the multipart boundary automatically.
 *
 * @param personId - The person's ID.
 * @param file - The image file to upload.
 * @param role - `'portrait'` to set as the primary portrait, `'gallery'` to add to the gallery.
 * @param baseUrl - Optional base URL prefix (empty string by default).
 * @returns The updated `PersonDetail` from the server.
 * @throws If the response is not OK.
 */
export async function uploadPhoto(
  personId: string,
  file: File,
  role: 'portrait' | 'gallery',
  baseUrl = ''
): Promise<PersonDetail> {
  const form = new FormData();
  form.append('file', file);
  form.append('role', role);
  const response = await fetch(`${baseUrl}/api/people/${personId}/photos`, {
    method: 'POST',
    credentials: 'include',
    body: form
  });
  return asPersonDetail(response, 'upload photo');
}

/**
 * Deletes the portrait photo for a person.
 *
 * @param personId - The person's ID.
 * @param baseUrl - Optional base URL prefix.
 * @returns The updated `PersonDetail` from the server.
 * @throws If the response is not OK.
 */
export async function deletePortrait(personId: string, baseUrl = ''): Promise<PersonDetail> {
  const response = await fetch(`${baseUrl}/api/people/${personId}/photos/portrait`, {
    method: 'DELETE',
    credentials: 'include'
  });
  return asPersonDetail(response, 'delete portrait');
}

/**
 * Deletes a specific gallery photo for a person.
 *
 * @param personId - The person's ID.
 * @param photoId - The gallery photo's ID.
 * @param baseUrl - Optional base URL prefix.
 * @returns The updated `PersonDetail` from the server.
 * @throws If the response is not OK.
 */
export async function deleteGalleryPhoto(
  personId: string,
  photoId: string,
  baseUrl = ''
): Promise<PersonDetail> {
  const response = await fetch(
    `${baseUrl}/api/people/${personId}/photos/gallery/${encodeURIComponent(photoId)}`,
    {
      method: 'DELETE',
      credentials: 'include'
    }
  );
  return asPersonDetail(response, 'delete photo');
}

/**
 * Promotes a gallery photo to become the person's portrait.
 *
 * @param personId - The person's ID.
 * @param photoId - The gallery photo's ID to promote.
 * @param baseUrl - Optional base URL prefix.
 * @returns The updated `PersonDetail` from the server.
 * @throws If the response is not OK.
 */
export async function promoteGalleryPhoto(
  personId: string,
  photoId: string,
  baseUrl = ''
): Promise<PersonDetail> {
  const response = await fetch(
    `${baseUrl}/api/people/${personId}/photos/gallery/${encodeURIComponent(photoId)}/promote`,
    {
      method: 'POST',
      credentials: 'include'
    }
  );
  return asPersonDetail(response, 'promote photo');
}

/**
 * Hides a person's seed portrait or seed video (a per-person suppression — the seed
 * file is never deleted). Returns the updated `PersonDetail`.
 *
 * @param personId - The person's ID.
 * @param role - `'portrait'` or `'video'`.
 * @param baseUrl - Optional base URL prefix.
 * @throws If the response is not OK.
 */
export async function suppressSeed(
  personId: string,
  role: 'portrait' | 'video',
  baseUrl = ''
): Promise<PersonDetail> {
  const response = await fetch(`${baseUrl}/api/people/${personId}/photos/seed/${role}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  return asPersonDetail(response, 'hide seed media');
}

/**
 * NIP-94 file metadata on maintenance completion events.
 * Upload tags from Blossom/NostrBuild uploaders are [["url", ...], ["x", ...], ...].
 */
export function uploadTagsToImetaRow(uploadTags: string[][]): string[] {
  const row: string[] = ['imeta'];
  for (const pair of uploadTags) {
    const k = pair[0];
    const v = pair[1];
    if (k && v != null && v !== '') {
      row.push(`${k} ${v}`);
    }
  }
  return row;
}

export function parseImetaRow(row: string[]): { url?: string; mime?: string } {
  if (row[0] !== 'imeta') return {};
  let url: string | undefined;
  let mime: string | undefined;
  for (let i = 1; i < row.length; i++) {
    const s = row[i];
    if (s.startsWith('url ')) url = s.slice(4).trim();
    else if (s.startsWith('m ')) mime = s.slice(2).trim();
  }
  return { url, mime };
}

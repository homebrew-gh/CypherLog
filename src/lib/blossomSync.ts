/**
 * Collect Blossom-style URLs from app entity data for syncing to servers.
 * Only includes URLs that are content-addressable (hash in path) so they can be replicated.
 */

import { extractFileInfo } from './blossom';
import type {
  Vehicle,
  Warranty,
  Appliance,
  Pet,
  Company,
  CompanyWorkLog,
  VetVisit,
  ProjectEntry,
  ProjectResearchNote,
} from './types';

/** Check if a URL looks like a Blossom/content-addressable URL (hash in path) */
export function isBlossomUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  return extractFileInfo(url) !== null;
}

/** Extract all Blossom URLs from a list, deduplicated by hash (one URL per unique file) */
export function dedupeBlossomUrlsByHash(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const info = extractFileInfo(url);
    if (!info || seen.has(info.hash)) continue;
    seen.add(info.hash);
    result.push(url);
  }
  return result;
}

/** Data snapshot from app hooks - pass whatever is available */
export interface BlossomSyncData {
  vehicles?: Vehicle[];
  warranties?: Warranty[];
  appliances?: Appliance[];
  pets?: Pet[];
  companies?: Company[];
  vetVisits?: VetVisit[];
  companyWorkLogs?: CompanyWorkLog[];
  projectEntries?: ProjectEntry[];
  projectResearchNotes?: ProjectResearchNote[];
}

/**
 * Collect all Blossom-style URLs from the given entity data.
 * Returns deduplicated list (one URL per unique file by hash).
 */
export function collectBlossomUrlsFromData(data: BlossomSyncData): string[] {
  const urls: string[] = [];

  for (const v of data.vehicles ?? []) {
    if (v.receiptUrl) urls.push(v.receiptUrl);
    if (v.warrantyUrl) urls.push(v.warrantyUrl);
    for (const d of v.documents ?? []) urls.push(d.url);
    for (const u of v.documentsUrls ?? []) urls.push(u);
  }

  for (const w of data.warranties ?? []) {
    if (w.receiptUrl) urls.push(w.receiptUrl);
    for (const d of w.documents ?? []) urls.push(d.url);
  }

  for (const a of data.appliances ?? []) {
    if (a.receiptUrl) urls.push(a.receiptUrl);
    if (a.manualUrl) urls.push(a.manualUrl);
  }

  for (const p of data.pets ?? []) {
    if (p.photoUrl) urls.push(p.photoUrl);
    for (const u of p.documentsUrls ?? []) urls.push(u);
  }

  for (const c of data.companies ?? []) {
    for (const inv of c.invoices ?? []) urls.push(inv.url);
  }

  for (const vv of data.vetVisits ?? []) {
    for (const u of vv.documentsUrls ?? []) urls.push(u);
  }

  for (const wl of data.companyWorkLogs ?? []) {
    if (wl.invoiceUrl) urls.push(wl.invoiceUrl);
  }

  for (const e of data.projectEntries ?? []) {
    for (const u of e.photoUrls ?? []) urls.push(u);
  }

  for (const n of data.projectResearchNotes ?? []) {
    for (const d of n.documents ?? []) urls.push(d.url);
  }

  return dedupeBlossomUrlsByHash(urls);
}

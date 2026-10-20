import type { Org } from '@/types';
import type { Op } from '@/data/store';
import type { ListSection, PublicListDoc, WineList } from './types';
import { newPublicId, toPublicDoc } from './build';

export const publicPath = (publicId: string) => `public_lists/${publicId}`;
export const publicUrl = (publicId: string) => `${location.origin}/p/${publicId}`;

const clean = <T extends object>(o: T): Record<string, unknown> => JSON.parse(JSON.stringify(o)) as Record<string, unknown>;

export function listOp(orgId: string, list: WineList): Op {
  return { op: 'set', path: `orgs/${orgId}/wineLists/${list.id}`, data: clean(list) };
}

export function publishOps(orgId: string, org: Pick<Org, 'id' | 'name'> & Partial<Pick<Org, 'brand' | 'legal'>>, list: WineList, sections: ListSection[], now = Date.now()): { ops: Op[]; list: WineList; doc: PublicListDoc } {
  const publicId = list.publicId.length >= 16 ? list.publicId : newPublicId();
  const next: WineList = { ...list, publicId, published: true, updatedAt: now };
  const doc = toPublicDoc(next, sections, org, now);
  return {
    list: next,
    doc,
    ops: [listOp(orgId, next), { op: 'set', path: publicPath(publicId), data: clean(doc) }],
  };
}

export function unpublishOps(orgId: string, list: WineList, now = Date.now()): Op[] {
  const next: WineList = { ...list, published: false, updatedAt: now };
  const ops: Op[] = [listOp(orgId, next)];
  if (list.publicId) ops.push({ op: 'delete', path: publicPath(list.publicId) });
  return ops;
}

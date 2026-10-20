import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Tests des règles de sécurité Firestore (firestore.rules) et de partitionnement des rôles.
 * Valide la structure des règles, les contraintes multi-tenant, l'immutabilité et le cloisonnement par rôle.
 */
describe('Firestore Security Rules verification', () => {
  const rulesContent = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf-8');

  it('declares rules_version 2 and cloud.firestore service', () => {
    expect(rulesContent).toContain("rules_version = '2';");
    expect(rulesContent).toContain('service cloud.firestore');
  });

  it('enforces multi-tenant isolation via isMember(orgId) or isPlatformAdmin()', () => {
    expect(rulesContent).toContain('function isMember(orgId)');
    expect(rulesContent).toContain('function isPlatformAdmin()');
    expect(rulesContent).toContain('match /orgs/{orgId}');
    expect(rulesContent).toContain('allow get: if isMember(orgId) || isPlatformAdmin();');
  });

  it('restricts financial collections to owner, manager, accountant and forbids staff', () => {
    // Staff can never access financial docs (documents, payments, consignments, expenses, etc.)
    expect(rulesContent).toContain("coll in ['documents', 'payments', 'consignments', 'counters', 'expenses', 'expenseCategories', 'assets', 'drmReports', 'accountingSettings', 'offers']");
    expect(rulesContent).toContain("hasRole(orgId, ['owner', 'manager', 'accountant'])");
  });

  it('restricts wine list authoring to sommelier, manager, owner (forbidding accountant and staff)', () => {
    expect(rulesContent).toContain('match /wineLists/{id}');
    expect(rulesContent).toContain("hasRole(orgId, ['owner', 'manager', 'sommelier'])");
  });

  it('enforces strict immutability for stock movements (create only, update and delete forbidden)', () => {
    expect(rulesContent).toContain('match /movements/{id}');
    expect(rulesContent).toContain('allow update, delete: if false;');
  });

  it('enforces that stock quantities cannot be negative', () => {
    expect(rulesContent).toContain('match /stock/{id}');
    expect(rulesContent).toContain('request.resource.data.qty >= 0');
  });

  it('forbids listing on public_lists and public_offers, allows get by id only with field filtering', () => {
    expect(rulesContent).toContain('match /public_lists/{publicId}');
    expect(rulesContent).toContain('allow list: if false;');
    expect(rulesContent).toContain('match /public_offers/{publicId}');
    expect(rulesContent).toContain('allow list: if false;');
    // Ensures sensitive data (buy price, stock quantities) are not allowed in public lists
    expect(rulesContent).toContain("request.resource.data.keys().hasOnly(['publicId', 'orgId', 'orgName', 'name', 'template', 'theme', 'language', 'updatedAt', 'sections', 'logoDataUrl', 'languages', 'translations'])");
  });

  it('validates 7-day invite expiration in member creation', () => {
    expect(rulesContent).toContain('expiresAt');
    expect(rulesContent).toContain('request.time.toMillis() <= get(/databases/$(database)/documents/orgs/$(orgId)/invites/$(userEmail())).data.expiresAt');
  });
});

describe('Cloud Storage Security Rules verification', () => {
  const storageRules = fs.readFileSync(path.join(process.cwd(), 'storage.rules'), 'utf-8');

  it('declares rules_version 2 and firebase.storage service', () => {
    expect(storageRules).toContain("rules_version = '2';");
    expect(storageRules).toContain('service firebase.storage');
  });

  it('restricts wine photos to authenticated org members and max 5MB image files', () => {
    expect(storageRules).toContain('match /orgs/{orgId}/wines/{wineId}');
    expect(storageRules).toContain("request.resource.size < 5 * 1024 * 1024");
    expect(storageRules).toContain("request.resource.contentType.matches('image/.*')");
  });
});

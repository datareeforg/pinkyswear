import { createClientId, isImageDataUrl, normalizeWhitespace, toIsoDate } from './core.js';
import { normalizeTemplateSchema } from './templateSchema.js';

const DATABASE_NAME = 'PinkySwearDB';

function actorName() {
  return window.currentUser?.name || 'device-user';
}

function asDate(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export class DocumentDatabase {
  constructor(DexieConstructor = globalThis.Dexie) {
    if (!DexieConstructor) throw new Error('IndexedDB support failed to load.');
    this.db = new DexieConstructor(DATABASE_NAME);

    this.db.version(1).stores({
      documents: '++id, title, content, status, created, modified, synced',
      templates: '++id, title, content, category, description, lastUsed',
      photos: '++id, documentId, dataUrl, timestamp',
      signatures: '++id, documentId, dataUrl, timestamp',
      locations: '++id, documentId, latitude, longitude, accuracy, timestamp',
      syncQueue: '++id, type, itemId, data, timestamp, attempts',
      audits: '++id, eventType, actor, timestamp, objectType, objectId, metadata',
      users: '++id, username, role, created, modified'
    });

    this.db.version(2).stores({
      documents: '++id, &clientId, title, status, created, modified, synced, deletedAt',
      templates: '++id, title, category, lastUsed, updated',
      photos: '++id, documentId, timestamp',
      signatures: '++id, documentId, timestamp',
      locations: '++id, documentId, timestamp',
      // Compound lookup is intentionally non-unique so legacy duplicate queue rows can migrate safely.
      syncQueue: '++id, [type+itemId], type, itemId, timestamp, attempts, nextAttemptAt, operationId',
      audits: '++id, eventType, actor, timestamp, objectType, objectId',
      users: '++id, username, role, created, modified',
      meta: '&key'
    }).upgrade(async (transaction) => {
      await transaction.table('documents').toCollection().modify((record) => {
        record.clientId ||= createClientId();
        record.deletedAt ||= null;
        record.synced = Boolean(record.synced);
      });
      await transaction.table('templates').toCollection().modify((record) => {
        record.updated ||= record.lastUsed || new Date();
      });
      await transaction.table('syncQueue').toCollection().modify((record) => {
        record.operationId ||= createClientId();
        record.nextAttemptAt ||= new Date();
      });

      // Version 1 allowed duplicate operations for the same local record. Coalesce them
      // before normal reads so an upgrade never uploads the same document repeatedly.
      const queueTable = transaction.table('syncQueue');
      const queueRecords = await queueTable.orderBy('timestamp').toArray();
      const retainedByEntity = new Map();
      for (const record of queueRecords) {
        const key = `${record.type}:${record.itemId}`;
        const retained = retainedByEntity.get(key);
        if (!retained) {
          retainedByEntity.set(key, record);
          continue;
        }
        const nextAction = retained.data?.action === 'create' && record.data?.action === 'update'
          ? 'create'
          : (record.data?.action || retained.data?.action);
        await queueTable.update(retained.id, {
          data: { action: nextAction },
          timestamp: record.timestamp,
          attempts: Math.max(retained.attempts || 0, record.attempts || 0)
        });
        await queueTable.delete(record.id);
      }
    });

    this.db.version(3).stores({
      documents: '++id, &clientId, title, status, created, modified, synced, deletedAt, signedAt',
      templates: '++id, title, category, lastUsed, updated',
      photos: '++id, documentId, timestamp',
      signatures: '++id, documentId, timestamp',
      locations: '++id, documentId, timestamp',
      syncQueue: '++id, [type+itemId], type, itemId, timestamp, attempts, nextAttemptAt, operationId',
      audits: '++id, eventType, actor, timestamp, objectType, objectId',
      users: '++id, username, role, created, modified',
      meta: '&key'
    }).upgrade(async (transaction) => {
      await transaction.table('documents').toCollection().modify((record) => {
        record.signerName ||= '';
        record.signedAt ||= null;
      });
    });

    this.db.version(4).stores({
      documents: '++id, &clientId, title, status, created, modified, synced, deletedAt, signedAt',
      templates: '++id, title, category, lastUsed, updated',
      photos: '++id, documentId, timestamp',
      signatures: '++id, documentId, timestamp',
      locations: '++id, documentId, timestamp',
      syncQueue: '++id, [type+itemId], type, itemId, timestamp, attempts, nextAttemptAt, operationId',
      audits: '++id, eventType, actor, timestamp, objectType, objectId',
      users: '++id, username, role, created, modified',
      meta: '&key'
    }).upgrade(async (transaction) => {
      await transaction.table('documents').toCollection().modify((record) => { record.remoteVersion ||= 0; });
    });

    this.db.version(5).stores({
      documents: '++id, &clientId, title, status, created, modified, synced, deletedAt, signedAt, ownerKey',
      templates: '++id, title, category, lastUsed, updated',
      photos: '++id, documentId, timestamp',
      signatures: '++id, documentId, timestamp',
      locations: '++id, documentId, timestamp',
      syncQueue: '++id, [type+itemId], type, itemId, timestamp, attempts, nextAttemptAt, operationId',
      audits: '++id, eventType, actor, timestamp, objectType, objectId',
      users: '++id, username, role, created, modified',
      meta: '&key'
    });
    this.db.version(6).stores({
      documents: '++id, &clientId, title, status, created, modified, synced, deletedAt, signedAt, ownerKey',
      templates: '++id, title, category, lastUsed, updated, brandProfileId, batchId',
      brandProfiles: '++id, name, sourceUrl, updated',
      photos: '++id, documentId, timestamp',
      signatures: '++id, documentId, timestamp',
      locations: '++id, documentId, timestamp',
      syncQueue: '++id, [type+itemId], type, itemId, timestamp, attempts, nextAttemptAt, operationId',
      audits: '++id, eventType, actor, timestamp, objectType, objectId',
      users: '++id, username, role, created, modified',
      meta: '&key'
    });
    this.ownerKey = null;
  }

  async ready() {
    await this.db.open();
    return this;
  }

  async activateOwnerKey(ownerKey) {
    const normalized = String(ownerKey || '');
    if (!normalized) throw new Error('A local profile key is required.');
    const marker = await this.db.meta.get('legacy-documents-assigned');
    await this.db.transaction('rw', [this.db.documents, this.db.meta], async () => {
      if (!marker) {
        await this.db.documents.toCollection().modify((record) => { if (!record.ownerKey) record.ownerKey = normalized; });
        await this.db.meta.put({ key: 'legacy-documents-assigned', value: { ownerKey: normalized, completedAt: new Date() } });
      }
    });
    this.ownerKey = normalized;
  }

  async transferOwnerKey(fromOwner, toOwner) {
    if (!fromOwner || !toOwner || fromOwner === toOwner) return 0;
    return this.db.transaction('rw', [this.db.documents, this.db.syncQueue], async () => {
      const records = await this.db.documents.where('ownerKey').equals(fromOwner).toArray();
      for (const record of records) {
        await this.db.documents.update(record.id, { ownerKey: toOwner, synced: false });
        const queue = await this.db.syncQueue.where('[type+itemId]').equals(['document', record.id]).first();
        if (queue) await this.db.syncQueue.update(queue.id, { operationId: createClientId(), nextAttemptAt: new Date(), lastError: null });
        else if (!record.deletedAt) await this.queueOperation('document', record.id, record.remoteVersion ? 'update' : 'create');
      }
      return records.length;
    });
  }

  async getDocuments(query = '') {
    const term = normalizeWhitespace(query).toLocaleLowerCase();
    const records = await this.db.documents.orderBy('modified').reverse().toArray();
    return records.filter((record) => record.ownerKey === this.ownerKey && !record.deletedAt && (!term
      || record.title.toLocaleLowerCase().includes(term)
      || String(record.content || '').toLocaleLowerCase().includes(term)));
  }

  async getDocument(id) {
    const documentRecord = await this.db.documents.get(Number(id));
    if (!documentRecord || documentRecord.deletedAt || documentRecord.ownerKey !== this.ownerKey) return null;

    const [photos, signature, location] = await Promise.all([
      this.db.photos.where('documentId').equals(documentRecord.id).sortBy('timestamp'),
      this.db.signatures.where('documentId').equals(documentRecord.id).last(),
      this.db.locations.where('documentId').equals(documentRecord.id).last()
    ]);

    return {
      ...documentRecord,
      photos: photos.map((photo) => photo.dataUrl),
      signature: signature?.dataUrl || null,
      location: location ? {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        capturedAt: location.timestamp
      } : null
    };
  }

  async saveDocument(input) {
    const id = input.id ? Number(input.id) : null;
    const now = new Date();
    const title = normalizeWhitespace(input.title).slice(0, 160);
    if (!title) throw new Error('A document title is required.');
    const intent = input.intent === 'sign' ? 'sign' : 'draft';
    if (intent === 'sign' && !isImageDataUrl(input.signature)) throw new Error('Capture a valid signature before signing.');
    if (intent === 'sign' && !normalizeWhitespace(input.signerName)) throw new Error('A signer name is required.');
    if ((input.photos || []).length > 12) throw new Error('A document can have up to 12 photos.');
    if ((input.photos || []).some((photo) => !isImageDataUrl(photo))) throw new Error('One or more photos could not be saved.');

    return this.db.transaction(
      'rw',
      [this.db.documents, this.db.photos, this.db.signatures, this.db.locations, this.db.syncQueue, this.db.audits],
      async () => {
        const existing = id ? await this.db.documents.get(id) : null;
        if (id && !existing) throw new Error('The document no longer exists.');
        if (existing && existing.ownerKey !== this.ownerKey) throw new Error('That document belongs to another local profile.');
        if (existing?.status === 'signed') throw new Error('Signed documents are locked. Create an amendment to make changes.');

        const record = {
          clientId: existing?.clientId || input.clientId || createClientId(),
          title,
          content: String(input.content ?? '').slice(0, 500_000),
          status: intent === 'sign' ? 'signed' : 'draft',
          signerName: intent === 'sign' ? normalizeWhitespace(input.signerName).slice(0, 80) : '',
          brandProfileId: input.brandProfileId ? Number(input.brandProfileId) : null,
          brandName: normalizeWhitespace(input.brandName).slice(0, 100),
          brandLogoUrl: typeof input.brandLogoUrl === 'string' && (/^https:\/\//i.test(input.brandLogoUrl) || isImageDataUrl(input.brandLogoUrl)) ? input.brandLogoUrl.slice(0, 8_000_000) : '',
          brandColors: input.brandColors && typeof input.brandColors === 'object' ? input.brandColors : null,
          brandFonts: normalizeWhitespace(input.brandFonts).slice(0, 160),
          signedAt: intent === 'sign' ? asDate(input.signedAt, now) : null,
          remoteVersion: existing?.remoteVersion || 0,
          ownerKey: existing?.ownerKey || this.ownerKey,
          created: existing?.created || asDate(input.created, now),
          modified: now,
          synced: false,
          deletedAt: null
        };

        const documentId = existing
          ? (await this.db.documents.update(existing.id, record), existing.id)
          : await this.db.documents.add(record);

        await Promise.all([
          this.db.photos.where('documentId').equals(documentId).delete(),
          this.db.signatures.where('documentId').equals(documentId).delete(),
          this.db.locations.where('documentId').equals(documentId).delete()
        ]);

        const photos = input.photos || [];
        if (photos.length) {
          await this.db.photos.bulkAdd(photos.map((dataUrl) => ({ documentId, dataUrl, timestamp: now })));
        }
        if (intent === 'sign') {
          await this.db.signatures.add({ documentId, dataUrl: input.signature, timestamp: now });
        }
        if (input.location && Number.isFinite(input.location.latitude) && Number.isFinite(input.location.longitude)) {
          await this.db.locations.add({
            documentId,
            latitude: input.location.latitude,
            longitude: input.location.longitude,
            accuracy: Number(input.location.accuracy) || null,
            timestamp: asDate(input.location.capturedAt, now)
          });
        }

        await this.queueOperation('document', documentId, existing ? 'update' : 'create');
        await this.writeAudit(existing ? 'document.update' : 'document.create', 'document', documentId, { title });
        return documentId;
      }
    );
  }

  async deleteDocument(id) {
    const documentId = Number(id);
    return this.db.transaction(
      'rw',
      [this.db.documents, this.db.photos, this.db.signatures, this.db.locations, this.db.syncQueue, this.db.audits],
      async () => {
        const record = await this.db.documents.get(documentId);
        if (!record || record.ownerKey !== this.ownerKey) return false;
        await this.db.documents.update(documentId, { deletedAt: new Date(), modified: new Date(), synced: false });
        await this.queueOperation('document', documentId, 'delete');

        await Promise.all([
          this.db.photos.where('documentId').equals(documentId).delete(),
          this.db.signatures.where('documentId').equals(documentId).delete(),
          this.db.locations.where('documentId').equals(documentId).delete()
        ]);
        await this.writeAudit('document.delete', 'document', documentId, { title: record.title });
        return true;
      }
    );
  }

  async getTemplates(category = 'all') {
    const records = await this.db.templates.orderBy('title').toArray();
    return category === 'all' ? records : records.filter((record) => record.category === category);
  }

  async getTemplate(id) {
    return this.db.templates.get(Number(id));
  }

  async saveTemplate(input) {
    const now = new Date();
    const title = normalizeWhitespace(input.title).slice(0, 160);
    if (!title) throw new Error('A template title is required.');
    const normalized = normalizeTemplateSchema({ ...input, title });
    const record = {
      title,
      content: String(normalized.content ?? '').slice(0, 500_000),
      category: normalizeWhitespace(input.category || 'custom').toLowerCase(),
      description: normalizeWhitespace(input.description).slice(0, 300),
      schemaVersion: normalized.schemaVersion,
      sections: normalized.sections,
      fields: normalized.fields,
      signers: normalized.signers,
      layout: normalized.layout,
      reviewNotes: normalizeWhitespace(normalized.reviewNotes).slice(0, 500),
      thumbnailUrl: typeof input.thumbnailUrl === 'string' && /^https?:\/\//i.test(input.thumbnailUrl) ? input.thumbnailUrl : null,
      thumbnailFor: typeof input.thumbnailFor === 'string' ? input.thumbnailFor.slice(0, 80) : null,
      brandProfileId: input.brandProfileId ? Number(input.brandProfileId) : null,
      batchId: typeof input.batchId === 'string' ? input.batchId.slice(0, 80) : null,
      batchName: normalizeWhitespace(input.batchName).slice(0, 100),
      brandName: normalizeWhitespace(input.brandName).slice(0, 100),
      brandLogoUrl: typeof input.brandLogoUrl === 'string' && (/^https:\/\//i.test(input.brandLogoUrl) || isImageDataUrl(input.brandLogoUrl)) ? input.brandLogoUrl.slice(0, 8_000_000) : '',
      brandColors: input.brandColors && typeof input.brandColors === 'object' ? input.brandColors : null,
      brandFonts: normalizeWhitespace(input.brandFonts).slice(0, 160),
      brandVoice: normalizeWhitespace(input.brandVoice).slice(0, 500),
      brandAudience: normalizeWhitespace(input.brandAudience).slice(0, 400),
      brandVisualStyle: normalizeWhitespace(input.brandVisualStyle).slice(0, 500),
      brandLayout: normalizeWhitespace(input.brandLayout).slice(0, 500),
      lastUsed: input.lastUsed ? asDate(input.lastUsed) : now,
      updated: now
    };

    const id = input.id
      ? (await this.db.templates.update(Number(input.id), record), Number(input.id))
      : await this.db.templates.add(record);
    await this.saveAudit({
      eventType: input.id ? 'template.update' : 'template.create',
      actor: actorName(), objectType: 'template', objectId: id, metadata: { title }
    });
    return id;
  }

  async deleteTemplate(id) {
    const templateId = Number(id);
    const record = await this.db.templates.get(templateId);
    if (!record) return false;
    await this.db.templates.delete(templateId);
    await this.saveAudit({
      eventType: 'template.delete', actor: actorName(), objectType: 'template', objectId: templateId,
      metadata: { title: record.title }
    });
    return true;
  }

  async updateTemplateUsage(id) {
    return this.db.templates.update(Number(id), { lastUsed: new Date() });
  }

  async setTemplateThumbnail(id, thumbnailUrl, thumbnailFor) {
    if (typeof thumbnailUrl !== 'string' || !/^https?:\/\//i.test(thumbnailUrl)) {
      throw new Error('A valid thumbnail URL is required.');
    }
    return this.db.templates.update(Number(id), {
      thumbnailUrl,
      thumbnailFor: String(thumbnailFor || '').slice(0, 80),
      updated: new Date()
    });
  }

  async getBrandProfiles() {
    return this.db.brandProfiles.orderBy('updated').reverse().toArray();
  }

  async saveBrandProfile(input) {
    const name = normalizeWhitespace(input.name).slice(0, 100);
    if (!name) throw new Error('A brand name is required.');
    const sourceUrl = String(input.sourceUrl || '').slice(0, 500);
    const profile = {
      name,
      sourceUrl,
      logoUrl: typeof input.logoUrl === 'string' && (/^https:\/\//i.test(input.logoUrl) || isImageDataUrl(input.logoUrl)) ? input.logoUrl.slice(0, 8_000_000) : '',
      colors: input.colors && typeof input.colors === 'object' ? input.colors : {},
      fonts: normalizeWhitespace(input.fonts).slice(0, 160),
      voice: normalizeWhitespace(input.voice).slice(0, 500),
      audience: normalizeWhitespace(input.audience).slice(0, 400),
      visualStyle: normalizeWhitespace(input.visualStyle).slice(0, 500),
      layout: normalizeWhitespace(input.layout).slice(0, 500),
      evidence: normalizeWhitespace(input.evidence).slice(0, 2000),
      confidence: normalizeWhitespace(input.confidence).slice(0, 40),
      updated: new Date()
    };
    const id = input.id ? Number(input.id) : null;
    if (id) {
      await this.db.brandProfiles.update(id, profile);
      return id;
    }
    return this.db.brandProfiles.add({ ...profile, created: new Date() });
  }

  async updateTemplateSchema(id, schema) {
    const normalized = normalizeTemplateSchema(schema);
    return this.db.templates.update(Number(id), {
      content: String(normalized.content ?? '').slice(0, 500_000),
      schemaVersion: normalized.schemaVersion,
      sections: normalized.sections,
      fields: normalized.fields,
      signers: normalized.signers,
      layout: normalized.layout,
      reviewNotes: normalizeWhitespace(normalized.reviewNotes).slice(0, 500),
      updated: new Date()
    });
  }

  async seedTemplates(templates, seedVersion) {
    const key = `template-seed:${seedVersion}`;
    if (await this.db.meta.get(key)) return 0;
    let inserted = 0;
    await this.db.transaction('rw', [this.db.templates, this.db.meta], async () => {
      const existingTitles = new Set((await this.db.templates.toArray()).map((item) => item.title.toLocaleLowerCase()));
      for (const template of templates) {
        if (existingTitles.has(template.title.toLocaleLowerCase())) continue;
        const now = new Date();
        await this.db.templates.add({ ...template, lastUsed: now, updated: now });
        inserted += 1;
      }
      await this.db.meta.put({ key, value: { inserted, completedAt: toIsoDate() } });
    });
    return inserted;
  }

  async queueOperation(type, itemId, action) {
    const existing = await this.db.syncQueue.where('[type+itemId]').equals([type, itemId]).first();
    const resolvedAction = existing?.data?.action === 'create' && action === 'update' ? 'create' : action;
    const record = {
      type,
      itemId,
      data: { action: resolvedAction },
      operationId: createClientId(),
      timestamp: new Date(),
      attempts: existing?.attempts || 0,
      nextAttemptAt: new Date(),
      lastError: null
    };
    if (existing) {
      await this.db.syncQueue.update(existing.id, record);
      return existing.id;
    }
    return this.db.syncQueue.add(record);
  }

  async getSyncQueue() {
    const queue = await this.db.syncQueue.orderBy('timestamp').toArray();
    const visible = [];
    for (const item of queue) {
      const record = item.type === 'document' ? await this.db.documents.get(Number(item.itemId)) : null;
      if (record?.ownerKey === this.ownerKey) visible.push(item);
    }
    return visible;
  }

  async getPendingSyncCount() {
    return (await this.getSyncQueue()).length;
  }

  async removeFromSyncQueue(id) {
    return this.db.syncQueue.delete(Number(id));
  }

  async recordSyncFailure(id, message, nextAttemptAt) {
    const queueItem = await this.db.syncQueue.get(Number(id));
    if (!queueItem) return;
    const normalized = String(message || 'Sync failed');
    const conflict = /newer cloud version|cloud version conflict/i.test(normalized);
    return this.db.syncQueue.update(queueItem.id, {
      attempts: queueItem.attempts + 1,
      lastError: conflict ? 'Cloud version conflict. Choose which copy to keep.' : normalized.slice(0, 500),
      nextAttemptAt: conflict ? new Date('9999-12-31T00:00:00.000Z') : nextAttemptAt
    });
  }

  async markSynced(documentId, queueId, operationId, sentModifiedAt, remoteVersion = null) {
    return this.db.transaction('rw', [this.db.documents, this.db.syncQueue], async () => {
      const queueRecord = await this.db.syncQueue.get(Number(queueId));
      if (!queueRecord) return false;
      const documentRecord = await this.db.documents.get(Number(documentId));
      if (documentRecord && documentRecord.ownerKey !== this.ownerKey) return false;
      if (documentRecord && Number(remoteVersion) > Number(documentRecord.remoteVersion || 0)) {
        await this.db.documents.update(documentRecord.id, { remoteVersion: Number(remoteVersion) });
        documentRecord.remoteVersion = Number(remoteVersion);
      }
      if (queueRecord.operationId !== operationId) {
        if (documentRecord?.remoteVersion && queueRecord.data.action === 'create') {
          await this.db.syncQueue.update(queueRecord.id, { data: { action: 'update' } });
        }
        return false;
      }
      if (documentRecord && new Date(documentRecord.modified).getTime() > new Date(sentModifiedAt).getTime()) return false;
      if (documentRecord?.deletedAt) await this.db.documents.delete(documentRecord.id);
      else if (documentRecord) await this.db.documents.update(documentRecord.id, {
        synced: true,
        remoteVersion: Number(remoteVersion) || documentRecord.remoteVersion || 0
      });
      await this.db.syncQueue.delete(Number(queueId));
      return true;
    });
  }

  async saveAudit(audit) {
    return this.writeAudit(audit.eventType, audit.objectType, audit.objectId, audit.metadata, audit.actor);
  }

  async writeAudit(eventType, objectType = null, objectId = null, metadata = {}, actor = actorName()) {
    return this.db.audits.add({
      eventType: String(eventType).slice(0, 100),
      actor: normalizeWhitespace(actor || 'device-user').slice(0, 100),
      timestamp: new Date(),
      objectType,
      objectId,
      metadata: structuredClone(metadata || {})
    });
  }

  async queryAudits({ eventType, actor, objectType, from, to } = {}) {
    let records = await this.db.audits.orderBy('timestamp').reverse().toArray();
    if (eventType) records = records.filter((item) => item.eventType === eventType);
    if (actor) records = records.filter((item) => item.actor === actor);
    if (objectType) records = records.filter((item) => item.objectType === objectType);
    if (from) records = records.filter((item) => asDate(item.timestamp) >= asDate(from));
    if (to) records = records.filter((item) => asDate(item.timestamp) <= asDate(to));
    return records;
  }

  async createUser(user) {
    const existing = await this.getUserByUsername(user.username);
    if (existing) return existing.id;
    const now = new Date();
    return this.db.users.add({ username: normalizeWhitespace(user.username), role: user.role || 'Field Agent', created: now, modified: now });
  }

  async getUserByUsername(username) {
    return this.db.users.where('username').equals(normalizeWhitespace(username)).first();
  }

  async updateUserRole(userId, role) {
    return this.db.users.update(Number(userId), { role: normalizeWhitespace(role).slice(0, 80), modified: new Date() });
  }

  async exportBackup() {
    const documents = await this.getDocuments();
    return {
      version: 4,
      exportedAt: toIsoDate(),
      documents: await Promise.all(documents.map(async (record) => {
        const exported = await this.getDocument(record.id);
        delete exported.remoteConflictPayload;
        delete exported.remoteConflictVersion;
        delete exported.remoteConflictDeleted;
        delete exported.remoteVersion;
        delete exported.ownerKey;
        delete exported.synced;
        delete exported.deletedAt;
        return exported;
      })),
      templates: await this.getTemplates(),
      brandProfiles: await this.getBrandProfiles()
    };
  }

  async importBackup(backup) {
    return this.db.transaction('rw', [
      this.db.documents, this.db.photos, this.db.signatures, this.db.locations,
      this.db.syncQueue, this.db.audits, this.db.templates, this.db.brandProfiles
    ], async () => {
      const knownClientIds = new Set((await this.db.documents.toArray())
        .filter((row) => row.ownerKey === this.ownerKey).map((row) => row.clientId).filter(Boolean));
      let importedDocuments = 0;
      let skippedDocuments = 0;
      for (const record of backup.documents) {
        if (record.clientId && knownClientIds.has(record.clientId)) {
          skippedDocuments += 1;
          continue;
        }
        const id = await this.saveDocument({
          ...record,
          id: null,
          intent: record.status === 'signed' && record.signature ? 'sign' : 'draft',
          signerName: record.signerName || 'Imported signer',
          signedAt: record.signedAt,
          clientId: null
        });
        const saved = await this.db.documents.get(id);
        if (saved?.clientId) knownClientIds.add(saved.clientId);
        importedDocuments += 1;
      }
      let importedBrandProfiles = 0;
      const profileIds = new Map();
      for (const profile of backup.brandProfiles || []) {
        const newId = await this.saveBrandProfile({ ...profile, id: null });
        if (profile.id != null) profileIds.set(Number(profile.id), newId);
        importedBrandProfiles += 1;
      }
      let importedTemplates = 0;
      for (const template of backup.templates) {
        const newProfileId = profileIds.get(Number(template.brandProfileId)) || template.brandProfileId || null;
        await this.saveTemplate({ ...template, id: null, brandProfileId: newProfileId });
        importedTemplates += 1;
      }
      return { importedDocuments, importedTemplates, importedBrandProfiles, skippedDocuments };
    });
  }

  async mergeRemoteDocuments(remoteDocuments = []) {
    let conflicts = 0;
    await this.db.transaction('rw', [
      this.db.documents, this.db.photos, this.db.signatures, this.db.locations, this.db.syncQueue, this.db.audits
    ], async () => {
      for (const remote of remoteDocuments) {
        const found = await this.db.documents.where('clientId').equals(remote.clientId).first();
        const local = found?.ownerKey === this.ownerKey ? found : null;
        if (!local) {
          if (remote.deleted || !remote.payload) continue;
        }
        const queue = local ? await this.db.syncQueue.where('[type+itemId]').equals(['document', local.id]).first() : null;
        if (local && queue && Number(remote.version) > Number(local.remoteVersion || 0)) {
          await this.db.documents.update(local.id, {
            remoteConflictVersion: Number(remote.version),
            remoteConflictPayload: remote.payload || null,
            remoteConflictDeleted: Boolean(remote.deleted),
            synced: false
          });
          await this.db.syncQueue.update(queue.id, { lastError: 'Cloud version conflict. Choose which copy to keep.' });
          conflicts += 1;
          continue;
        }
        if (remote.deleted || !remote.payload) {
          if (local) {
            await this.db.documents.delete(local.id);
            await Promise.all([
              this.db.photos.where('documentId').equals(local.id).delete(),
              this.db.signatures.where('documentId').equals(local.id).delete(),
              this.db.locations.where('documentId').equals(local.id).delete()
            ]);
          }
          continue;
        }
        const payload = remote.payload;
        const id = local?.id || undefined;
        const now = asDate(remote.modifiedAt);
        const signed = payload.status === 'signed' && isImageDataUrl(payload.signature);
        const document = {
          ...(local || {}),
          ...(id ? { id } : {}),
          clientId: remote.clientId,
          ownerKey: this.ownerKey,
          title: normalizeWhitespace(payload.title).slice(0, 160),
          content: String(payload.content || '').slice(0, 500_000),
          status: signed ? 'signed' : 'draft',
          signerName: signed ? normalizeWhitespace(payload.signerName).slice(0, 80) : '',
          signedAt: signed ? asDate(payload.signedAt, now) : null,
          created: local?.created || asDate(payload.created, now),
          modified: now,
          synced: true,
          remoteVersion: Number(remote.version) || 0,
          deletedAt: null,
          remoteConflictVersion: null,
          remoteConflictPayload: null,
          remoteConflictDeleted: false
        };
        const documentId = local ? (await this.db.documents.put(document), local.id) : await this.db.documents.add(document);
        await Promise.all([
          this.db.photos.where('documentId').equals(documentId).delete(),
          this.db.signatures.where('documentId').equals(documentId).delete(),
          this.db.locations.where('documentId').equals(documentId).delete()
        ]);
        const photos = (payload.photos || []).filter(isImageDataUrl).slice(0, 12);
        if (photos.length) await this.db.photos.bulkAdd(photos.map((dataUrl) => ({ documentId, dataUrl, timestamp: now })));
        if (signed) await this.db.signatures.add({ documentId, dataUrl: payload.signature, timestamp: now });
        const location = payload.location;
        if (location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
          await this.db.locations.add({ documentId, latitude: location.latitude, longitude: location.longitude, accuracy: Number(location.accuracy) || null, timestamp: asDate(location.capturedAt, now) });
        }
      }
    });
    return { conflicts };
  }

  async resolveRemoteConflict(queueId, keepLocal) {
    const queue = await this.db.syncQueue.get(Number(queueId));
    if (!queue) throw new Error('That sync item no longer exists.');
    const local = await this.db.documents.get(Number(queue.itemId));
    if (local?.ownerKey !== this.ownerKey || !local?.remoteConflictVersion) throw new Error('The cloud copy is no longer available. Sync again to refresh it.');
    if (!keepLocal) {
      const remote = {
        clientId: local.clientId,
        version: local.remoteConflictVersion,
        modifiedAt: local.remoteConflictPayload?.modified || local.modified,
        deleted: local.remoteConflictDeleted,
        payload: local.remoteConflictPayload
      };
      await this.db.syncQueue.delete(queue.id);
      await this.db.documents.update(local.id, {
        remoteConflictVersion: null, remoteConflictPayload: null, remoteConflictDeleted: false
      });
      if (remote.deleted) {
        await this.db.documents.delete(local.id);
        await Promise.all([
          this.db.photos.where('documentId').equals(local.id).delete(),
          this.db.signatures.where('documentId').equals(local.id).delete(),
          this.db.locations.where('documentId').equals(local.id).delete()
        ]);
      } else await this.mergeRemoteDocuments([remote]);
      return 'cloud';
    }
    await this.db.transaction('rw', [this.db.documents, this.db.syncQueue], async () => {
      await this.db.documents.update(local.id, {
        remoteVersion: local.remoteConflictVersion,
        remoteConflictVersion: null,
        remoteConflictPayload: null,
        remoteConflictDeleted: false,
        synced: false
      });
      await this.db.syncQueue.update(queue.id, {
        data: { action: 'update' },
        operationId: createClientId(),
        timestamp: new Date(),
        attempts: 0,
        nextAttemptAt: new Date(),
        lastError: null
      });
    });
    return 'device';
  }
}

export const documentDB = new DocumentDatabase();
window.documentDB = documentDB;

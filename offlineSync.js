const DEFAULT_TIMEOUT_MS = 15_000;

export class SyncNotConfiguredError extends Error {
  constructor() {
    super('Cloud sync is unavailable for this profile. Changes remain in this browser.');
    this.name = 'SyncNotConfiguredError';
  }
}

export class OfflineSyncService extends EventTarget {
  constructor(database, { endpoint = '/api/sync' } = {}) {
    super();
    this.database = database;
    this.endpoint = String(endpoint).replace(/\/$/, '');
    this.running = false;
    this.online = navigator.onLine;
    this.timerId = null;
    this.onOnline = () => {
      this.online = true;
      this.emitState();
      if (this.configured) this.schedule(300);
    };
    this.onOffline = () => {
      this.online = false;
      this.emitState();
    };
  }

  get configured() {
    return /^https?:\/\//i.test(this.endpoint) || this.endpoint.startsWith('/');
  }

  async start() {
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    await this.emitState();
    if (this.configured && this.online) this.schedule(1_000);
  }

  stop() {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    clearTimeout(this.timerId);
  }

  schedule(delayMs = 30_000) {
    clearTimeout(this.timerId);
    if (!this.configured || !this.online) return;
    this.timerId = setTimeout(() => this.syncAll().catch(() => {}), delayMs);
  }

  async emitState(extra = {}) {
    const pending = await this.database.getPendingSyncCount().catch(() => 0);
    this.dispatchEvent(new CustomEvent('statechange', {
      detail: {
        online: this.online,
        configured: this.configured,
        running: this.running,
        pending,
        ...extra
      }
    }));
  }

  async syncAll() {
    if (!this.configured) {
      await this.emitState({ error: 'not-configured' });
      throw new SyncNotConfiguredError();
    }
    if (!this.online) throw new Error('You are offline. Sync will resume when the connection returns.');
    if (this.running) return { processed: 0, failed: 0 };

    this.running = true;
    await this.emitState();
    let processed = 0;
    let failed = 0;
    let conflicts = 0;
    let nextAttempt = Infinity;

    try {
      const queue = await this.database.getSyncQueue();
      for (const item of queue) {
        if (item.lastError?.includes('Cloud version conflict')) { conflicts += 1; continue; }
        if (item.nextAttemptAt && new Date(item.nextAttemptAt) > new Date()) {
          nextAttempt = Math.min(nextAttempt, new Date(item.nextAttemptAt).getTime());
          continue;
        }
        try {
          await this.process(item);
          processed += 1;
        } catch (error) {
          if (error.conflict) {
            conflicts += 1;
            await this.database.recordSyncFailure(item.id, error.message, new Date('9999-12-31T00:00:00.000Z'));
          } else {
            failed += 1;
            const delay = Math.min(5 * 60_000, 2 ** Math.min(item.attempts, 6) * 2_000);
            await this.database.recordSyncFailure(item.id, error.message, new Date(Date.now() + delay));
            nextAttempt = Math.min(nextAttempt, Date.now() + delay);
          }
        }
      }
      return { processed, failed, conflicts };
    } finally {
      this.running = false;
      const remaining = await this.database.getSyncQueue().catch(() => []);
      for (const item of remaining) {
        if (item.lastError?.includes('Cloud version conflict')) continue;
        const attempt = new Date(item.nextAttemptAt || Date.now()).getTime();
        nextAttempt = Math.min(nextAttempt, attempt > Date.now() ? attempt : Date.now() + 1_000);
      }
      await this.emitState({ processed, failed, conflicts });
      if (nextAttempt < Infinity) this.schedule(Math.max(1_000, nextAttempt - Date.now()));
    }
  }

  async syncOne(queueId) {
    if (!this.configured) throw new SyncNotConfiguredError();
    if (!this.online) throw new Error('You are offline.');
    const item = await this.database.db.syncQueue.get(Number(queueId));
    if (!item) throw new Error('That queue item no longer exists.');
    await this.process(item);
    await this.emitState();
  }

  async process(item) {
    const localRecord = await this.database.db.documents.get(Number(item.itemId));
    const hydrated = item.data.action === 'delete' ? null : await this.database.getDocument(item.itemId);
    if (!localRecord) {
      await this.database.removeFromSyncQueue(item.id);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': item.operationId
        },
        body: JSON.stringify({
          operationId: item.operationId,
          entity: item.type,
          action: item.data.action,
          clientId: localRecord.clientId,
          baseVersion: Number(localRecord.remoteVersion) || 0,
          modifiedAt: localRecord.modified,
          payload: hydrated
        }),
        signal: controller.signal
      });
    } catch (error) {
      throw new Error(error.name === 'AbortError' ? 'The sync request timed out.' : 'The sync service could not be reached.');
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const problem = await response.json().catch(() => null);
      const error = new Error(problem?.error || problem?.detail || `Sync failed with status ${response.status}.`);
      error.conflict = Boolean(problem?.conflict);
      if (error.conflict) {
        const remoteResponse = await fetch(`${this.endpoint}?clientId=${encodeURIComponent(localRecord.clientId)}`, { credentials: 'include' });
        if (remoteResponse.ok) {
          const { document } = await remoteResponse.json();
          await this.database.mergeRemoteDocuments([document]);
        }
      }
      throw error;
    }
    const result = await response.json().catch(() => ({}));
    await this.database.markSynced(item.itemId, item.id, item.operationId, localRecord.modified, result.version);
  }
}

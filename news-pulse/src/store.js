import fs from 'node:fs';
import path from 'node:path';

// Single-file JSON persistence. Good for one instance; swap for SQLite/Redis to scale out.
export class Store {
  constructor(dir) {
    this.file = path.join(dir, 'state.json');
    fs.mkdirSync(dir, { recursive: true });
    this.data = { customFeeds: [], stories: {}, subscriptions: [], vapid: null, meta: {} };
    if (fs.existsSync(this.file)) {
      try {
        Object.assign(this.data, JSON.parse(fs.readFileSync(this.file, 'utf8')));
      } catch (e) {
        console.error(`[store] could not read ${this.file}: ${e.message}; starting fresh`);
      }
    }
    this.dirty = false;
  }

  markDirty() {
    this.dirty = true;
  }

  save(snapshot) {
    Object.assign(this.data, snapshot());
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
    this.dirty = false;
  }
}

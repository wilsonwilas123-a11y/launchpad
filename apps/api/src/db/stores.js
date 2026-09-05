const fs = require('fs');
const path = require('path');

const SCHEMA = `
create table if not exists users (
  id text primary key,
  email text unique not null,
  name text not null,
  password_hash text not null,
  plan text not null default 'free',
  avatar_seed text,
  provider text not null default 'password',
  external_id text,
  created_at timestamptz not null default now()
);

/* Older databases predate Google sign-in; these are no-ops on a fresh schema. */
alter table users add column if not exists provider text not null default 'password';
alter table users add column if not exists external_id text;
create index if not exists users_external_idx on users (external_id);

create table if not exists projects (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  type text not null,
  status text not null default 'draft',
  slug text unique,
  published boolean not null default false,
  data jsonb not null,
  published_snapshot jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_idx on projects (user_id, updated_at desc);

create table if not exists signups (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  kind text not null,
  email text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists signups_project_idx on signups (project_id, created_at desc);
`;

/**
 * PostgreSQL store. Rows keep the mutable project payload in jsonb so the
 * project document and the relational concerns (ownership, unique slug,
 * status for listing) live side by side.
 */
class PostgresStore {
  constructor({ connectionConfig, pool }) {
    this.pool = pool;
    this.driver = 'postgres';
    this.connectionConfig = connectionConfig;
  }

  static async connect(pg, connectionConfig) {
    const pool = new pg.Pool({ ...connectionConfig, max: 8, idleTimeoutMillis: 30000 });
    const store = new PostgresStore({ connectionConfig, pool });
    await store.init();
    return store;
  }

  async init() {
    await this.pool.query(SCHEMA);
  }

  async close() {
    await this.pool.end();
  }

  // ---------------------------------------------------------------- users
  async insertUser(user) {
    const { rows } = await this.pool.query(
      `insert into users (id, email, name, password_hash, plan, avatar_seed, provider, external_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [
        user.id,
        user.email,
        user.name,
        user.passwordHash,
        user.plan || 'free',
        user.avatarSeed || null,
        user.provider || 'password',
        user.externalId || null,
      ],
    );
    return rowToUser(rows[0]);
  }

  async findUserByEmail(email) {
    const { rows } = await this.pool.query('select * from users where lower(email) = lower($1)', [email]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  /** The account a third-party subject id was linked to, if any. */
  async findUserByExternalId(externalId) {
    const { rows } = await this.pool.query('select * from users where external_id = $1', [externalId]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  async findUserById(id) {
    const { rows } = await this.pool.query('select * from users where id = $1', [id]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  async updateUser(id, patch) {
    const sets = [];
    const values = [];
    const map = { name: 'name', email: 'email', plan: 'plan', passwordHash: 'password_hash', avatarSeed: 'avatar_seed', provider: 'provider', externalId: 'external_id' };
    for (const [key, column] of Object.entries(map)) {
      if (patch[key] !== undefined) {
        values.push(patch[key]);
        sets.push(`${column} = $${values.length}`);
      }
    }
    if (!sets.length) return this.findUserById(id);
    values.push(id);
    const { rows } = await this.pool.query(
      `update users set ${sets.join(', ')} where id = $${values.length} returning *`,
      values,
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  async deleteUser(id) {
    await this.pool.query('delete from users where id = $1', [id]);
    return true;
  }

  // ------------------------------------------------------------- projects
  async insertProject(project) {
    const { rows } = await this.pool.query(
      `insert into projects (id, user_id, name, type, status, slug, published, data, published_snapshot, published_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
       returning *`,
      [
        project.id,
        project.userId,
        project.name,
        project.type,
        project.status || 'draft',
        project.slug || null,
        Boolean(project.published),
        JSON.stringify(project),
        project.publishedSnapshot ? JSON.stringify(project.publishedSnapshot) : null,
        project.publishedAt || null,
        isoOrNow(project.createdAt),
      ],
    );
    return rowToProject(rows[0]);
  }

  async updateProject(project) {
    const { rows } = await this.pool.query(
      `update projects set name=$2, type=$3, status=$4, slug=$5, published=$6, data=$7,
       published_snapshot=$8, published_at=$9, updated_at=now()
       where id=$1 returning *`,
      [
        project.id,
        project.name,
        project.type,
        project.status,
        project.slug || null,
        Boolean(project.published),
        JSON.stringify(project),
        project.publishedSnapshot ? JSON.stringify(project.publishedSnapshot) : null,
        project.publishedAt || null,
      ],
    );
    return rows[0] ? rowToProject(rows[0]) : null;
  }

  async findProject(id) {
    const { rows } = await this.pool.query('select * from projects where id = $1', [id]);
    return rows[0] ? rowToProject(rows[0]) : null;
  }

  async findProjectBySlug(slug) {
    const { rows } = await this.pool.query('select * from projects where slug = $1', [slug]);
    return rows[0] ? rowToProject(rows[0]) : null;
  }

  /** Live sites, newest first — the public gallery and the landing page read this. */
  async listPublished(limit = 12) {
    const { rows } = await this.pool.query(
      `select * from projects
        where published = true and published_snapshot is not null
        order by published_at desc nulls last
        limit $1`,
      [limit],
    );
    return rows.map(rowToProject);
  }

  async listProjectsByUser(userId) {
    const { rows } = await this.pool.query(
      'select * from projects where user_id = $1 order by updated_at desc',
      [userId],
    );
    return rows.map(rowToProject);
  }

  async countProjectsByUser(userId) {
    const { rows } = await this.pool.query('select count(*)::int as n from projects where user_id = $1', [userId]);
    return rows[0].n;
  }

  async deleteProject(id) {
    await this.pool.query('delete from projects where id = $1', [id]);
    return true;
  }

  async uniqueProjectId() {
    const { rows } = await this.pool.query(
      'select id from projects order by updated_at desc limit 1',
    );
    return rows[0] ? rows[0].id : null;
  }

  // -------------------------------------------------------------- signups
  async insertSignup(signup) {
    const { rows } = await this.pool.query(
      `insert into signups (id, project_id, kind, email, payload)
       values ($1,$2,$3,$4,$5) returning *`,
      [signup.id, signup.projectId, signup.kind, signup.email || null, JSON.stringify(signup.payload || {})],
    );
    return rowToSignup(rows[0]);
  }

  async listSignups(projectId, limit = 50) {
    const { rows } = await this.pool.query(
      'select * from signups where project_id = $1 order by created_at desc limit $2',
      [projectId, limit],
    );
    return rows.map(rowToSignup);
  }

  async countSignups(projectId) {
    const { rows } = await this.pool.query('select count(*)::int as n from signups where project_id = $1', [projectId]);
    return rows[0].n;
  }
}

function isoOrNow(value) {
  return value ? new Date(value) : new Date();
}

function rowToUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    plan: row.plan,
    avatarSeed: row.avatar_seed,
    provider: row.provider || 'password',
    externalId: row.external_id ?? null,
    createdAt: row.created_at,
  };
}

function rowToProject(row) {
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return {
    ...data,
    status: row.status,
    slug: row.slug,
    published: row.published,
    publishedAt: row.published_at,
    publishedSnapshot: row.published_snapshot
      ? typeof row.published_snapshot === 'string'
        ? JSON.parse(row.published_snapshot)
        : row.published_snapshot
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSignup(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    email: row.email,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    createdAt: row.created_at,
  };
}

/**
 * File-backed store with the exact same surface. Used when PostgreSQL is not
 * reachable so the product still runs (single JSON file in ./storage).
 */
class JsonFileStore {
  constructor(file) {
    this.file = file;
    this.driver = 'file';
    this.queue = Promise.resolve();
  }

  static open(file) {
    const store = new JsonFileStore(file);
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ users: [], projects: [], signups: [] }, null, 2));
    }
    return store;
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return { users: [], projects: [], signups: [] };
    }
  }

  write(data) {
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
  }

  async init() {
    this.read();
    return true;
  }

  async close() {}

  async tx(fn) {
    let result;
    this.queue = this.queue.then(async () => {
      const data = this.read();
      result = await fn(data, (next) => this.write(next));
    });
    await this.queue;
    return result;
  }

  async insertUser(user) {
    return this.tx(async (db, write) => {
      const row = { ...user, plan: user.plan || 'free', provider: user.provider || 'password', createdAt: new Date().toISOString() };
      db.users.push(row);
      write(db);
      return { ...row };
    });
  }

  async findUserByEmail(email) {
    const db = this.read();
    return db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
  }

  async findUserByExternalId(externalId) {
    const db = this.read();
    return db.users.find((u) => u.externalId && u.externalId === externalId) || null;
  }

  async findUserById(id) {
    const db = this.read();
    return db.users.find((u) => u.id === id) || null;
  }

  async updateUser(id, patch) {
    return this.tx(async (db, write) => {
      const user = db.users.find((u) => u.id === id);
      if (!user) return null;
      Object.assign(user, patch);
      write(db);
      return { ...user };
    });
  }

  async deleteUser(id) {
    return this.tx(async (db, write) => {
      db.users = db.users.filter((u) => u.id !== id);
      db.projects = db.projects.filter((p) => p.userId !== id);
      write(db);
      return true;
    });
  }

  async insertProject(project) {
    return this.tx(async (db, write) => {
      db.projects.push({ ...project });
      write(db);
      return { ...project };
    });
  }

  async updateProject(project) {
    return this.tx(async (db, write) => {
      const index = db.projects.findIndex((p) => p.id === project.id);
      const next = { ...project, updatedAt: new Date().toISOString() };
      if (index === -1) db.projects.push(next);
      else db.projects[index] = next;
      write(db);
      return next;
    });
  }

  async findProject(id) {
    const db = this.read();
    return db.projects.find((p) => p.id === id) || null;
  }

  async findProjectBySlug(slug) {
    const db = this.read();
    return db.projects.find((p) => p.slug === slug) || null;
  }

  async listPublished(limit = 12) {
    const db = this.read();
    return db.projects
      .filter((p) => p.published && p.publishedSnapshot)
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, limit);
  }

  async listProjectsByUser(userId) {
    const db = this.read();
    return db.projects
      .filter((p) => p.userId === userId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async countProjectsByUser(userId) {
    const db = this.read();
    return db.projects.filter((p) => p.userId === userId).length;
  }

  async deleteProject(id) {
    return this.tx(async (db, write) => {
      db.projects = db.projects.filter((p) => p.id !== id);
      db.signups = db.signups.filter((s) => s.projectId !== id);
      write(db);
      return true;
    });
  }

  async insertSignup(signup) {
    return this.tx(async (db, write) => {
      const row = { ...signup, createdAt: new Date().toISOString() };
      db.signups.push(row);
      write(db);
      return row;
    });
  }

  async listSignups(projectId, limit = 50) {
    const db = this.read();
    return db.signups.filter((s) => s.projectId === projectId).slice(-limit).reverse();
  }

  async countSignups(projectId) {
    const db = this.read();
    return db.signups.filter((s) => s.projectId === projectId).length;
  }
}

module.exports = { PostgresStore, JsonFileStore, isUniqueViolation };

function isUniqueViolation(error) {
  return error && (error.code === '23505' || /unique|duplicate/i.test(String(error.message || '')));
}

const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

let db;

async function initDB() {
  db = await open({
    filename: process.env.DB_PATH || path.join(__dirname, '../../database.sqlite'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      hostname TEXT,
      ip TEXT,
      os TEXT,
      cpu TEXT,
      ram TEXT,
      lastSeen TEXT
    );
    CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY,
      agentId TEXT,
      command TEXT,
      status TEXT,
      output TEXT,
      exitCode INTEGER,
      createdAt TEXT,
      executedAt TEXT
    );
  `);

  const defaultUser = process.env.ADMIN_USER || 'admin';
  const defaultPass = process.env.ADMIN_PASS || 'admin';

  // Check if admin exists
  const admin = await db.get('SELECT * FROM admins WHERE username = ?', [defaultUser]);
  if (!admin) {
    const hash = await bcrypt.hash(defaultPass, 10);
    await db.run('INSERT INTO admins (username, password) VALUES (?, ?)', [defaultUser, hash]);
    console.log(`Default admin created: ${defaultUser}`);
  }
}

function getDB() {
  return db;
}

module.exports = { initDB, getDB };

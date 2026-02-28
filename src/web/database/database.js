// Imports
const fs = require('fs');
const path = require('path');
const database = require('better-sqlite3');

// Setup Database
const dataDir = path.join(__dirname, '..', 'user-data');
fs.mkdirSync(dataDir, { recursive: true })
const db = new database(path.join(dataDir, 'app.db'))

// Create Initial Users Table
db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
        user_id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        username TEXT
);`)

// Create Initial User Configs Table
db.exec(`
    CREATE TABLE IF NOT EXISTS user_target_configs (
        owner_user_id TEXT NOT NULL,
        target_user_id TEXT NOT NULL,
        nickname TEXT,
        avatar_path TEXT,
        PRIMARY KEY (owner_user_id, target_user_id)
    );
`);



// Export Database
module.exports = { db };

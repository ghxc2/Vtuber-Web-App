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
        username TEXT,
        display_key TEXT
);`)

// Migration: add display_key column for existing databases that predate it.
const oauthTokenCols = db.prepare(`PRAGMA table_info(oauth_tokens)`).all().map((c) => c.name)
if (!oauthTokenCols.includes('display_key')) {
    db.exec(`ALTER TABLE oauth_tokens ADD COLUMN display_key TEXT`)
}
db.exec(`
    UPDATE oauth_tokens
    SET display_key = lower(hex(randomblob(16)))
    WHERE display_key IS NULL OR display_key = ''
`)

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

// imports
const crypto = require('crypto')
const { db } = require('./database')

// Retrieve User from Table
const getUser = db.prepare(`
    SELECT * FROM oauth_tokens WHERE user_id = ?
`)
const getUserByDisplayKeyStmt = db.prepare(`
    SELECT * FROM oauth_tokens WHERE display_key = ?
`)
const updateDisplayKeyStmt = db.prepare(`
    UPDATE oauth_tokens
    SET display_key = @display_key
    WHERE user_id = @user_id
`)

// Safely Update User
const upsertUser = db.prepare(`
    INSERT INTO oauth_tokens (
        user_id,
        access_token,
        refresh_token,
        expires_at,
        username,
        display_key
    )
    VALUES (
        @user_id,
        @access_token,
        @refresh_token,
        @expires_at,
        @username,
        @display_key
    )
    ON CONFLICT(user_id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        username = excluded.username
`);


// Exports
module.exports = {
    // Gets user token row by user ID
    getUserById(userId) {
        return getUser.get(userId) ?? null;
    },

    getUserByDisplayKey(displayKey) {
        return getUserByDisplayKeyStmt.get(displayKey) ?? null;
    },

    rotateDisplayKey(userId) {
        const nextKey = crypto.randomBytes(16).toString('hex')
        updateDisplayKeyStmt.run({
            user_id: userId,
            display_key: nextKey,
        })
        return nextKey
    },

    // Saves row to table
    saveUser({ userId, accessToken, refreshToken, expiresAt, username }) {
        const existing = getUser.get(userId) ?? null
        upsertUser.run({
            user_id: userId,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt,
            username,
            display_key: existing?.display_key || crypto.randomBytes(16).toString('hex'),
        });
    },
};

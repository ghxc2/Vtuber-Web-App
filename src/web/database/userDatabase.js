// imports
const { db } = require('./database')

// Retrieve User from Table
const getUser = db.prepare(`
    SELECT * FROM oauth_tokens WHERE user_id = ?
`)

// Safely Update User
const upsertUser = db.prepare(`
    INSERT INTO oauth_tokens (
        user_id,
        access_token,
        refresh_token,
        expires_at,
        username
    )
    VALUES (
        @user_id,
        @access_token,
        @refresh_token,
        @expires_at,
        @username
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

    // Saves row to table
    saveUser({ userId, accessToken, refreshToken, expiresAt, username }) {
        upsertUser.run({
            user_id: userId,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt,
            username,
        });
    },
};

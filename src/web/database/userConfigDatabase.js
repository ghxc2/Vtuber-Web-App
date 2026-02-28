// imports
const { db } = require('./database')

// Retrieve User Config from Table
const getConfigs = db.prepare(`
    SELECT * FROM user_target_configs WHERE owner_user_id = ?
`)

// Safely Insert Into Table
const upsertConfig = db.prepare(`
    INSERT INTO user_target_configs (owner_user_id, target_user_id, nickname, avatar_path)
    VALUES (@owner_user_id, @target_user_id, @nickname, @avatar_path)
    ON CONFLICT(owner_user_id, target_user_id) DO UPDATE SET
        nickname=excluded.nickname,
        avatar_path=excluded.avatar_path
`);

// Exports
module.exports = {
    // Gets user's settings
    getConfigsForOwner(ownerUserId) {
        return getConfigs.all(ownerUserId);
    },

    // Saves row to table
    saveConfig({ ownerUserId, targetUserId, nickname, avatarPath }) {
        upsertConfig.run({
            owner_user_id: ownerUserId,
            target_user_id: targetUserId,
            nickname,
            avatar_path: avatarPath ?? null,
        });
    },
};

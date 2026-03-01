// Imports
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs')
const sharp = require('sharp')

// Current Project Imports
const { validateUser, refreshUser, isTokenExpired, getUserNameFromUserID } = require('./users');
const { getCookieUsername, buildCookieUserID, validateCookie } = require('./cookies');
const { getConfigsForOwner, saveAvatarPath } = require('./database/userConfigDatabase')
const { getUserById, getUserByDisplayKey, rotateDisplayKey } = require('./database/userDatabase')
const {
    handleUpload,
    handleEditUpload,
    getAllAvatarsForUser,
    deleteAvatarDirectory,
    deleteAvatarTypeFile,
    createAvatarDirectory,
    getAvatarOrDefault,
    generateDefaultAvatarsForUser,
} = require('./avatars/avatars')

async function bufferToDataUrl(buffer) {
    if (!buffer) return null
    const metadata = await sharp(buffer, { animated: true }).metadata().catch(() => null)
    const format = (metadata?.format || 'png').toLowerCase()
    const mimeType = {
        gif: 'image/gif',
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        avif: 'image/avif',
    }[format] || 'application/octet-stream'
    return `data:${mimeType};base64,${buffer.toString('base64')}`
}

async function avatarStateToDataUrls(avatarState) {
    const safeState = avatarState || {}
    return {
        avatar: await bufferToDataUrl(safeState.avatar),
        speaking: await bufferToDataUrl(safeState.speaking),
        muted: await bufferToDataUrl(safeState.muted),
        deafened: await bufferToDataUrl(safeState.deafened),
        default: await bufferToDataUrl(safeState.default),
    }
}

function pickAvatarForState(avatarSet, state = {}) {
    const safeSet = avatarSet || {}
    const isDeaf = !!state.deaf
    const isMuted = !!state.mute
    const isSpeaking = !!state.speaking

    if (isDeaf) {
        return safeSet.deafened || safeSet.muted || safeSet.speaking || safeSet.avatar || safeSet.default || null
    }
    if (isMuted) {
        return safeSet.muted || safeSet.deafened || safeSet.speaking || safeSet.avatar || safeSet.default || null
    }
    if (isSpeaking) {
        return safeSet.speaking || safeSet.avatar || safeSet.default || null
    }
    return safeSet.avatar || safeSet.default || safeSet.speaking || null
}

function setupWeb({ app }) {
    // Setup View Engine
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, './views'));
    app.use(express.urlencoded({ extended: true }));

    // Allows App to use Cookies
    app.use(cookieParser())

    // Home Page
    app.get('/', async (req, res) => {
        res.send("Welcome")
    })

    // Page Directed To From Discord Link
    app.get('/api/auth/discord/redirect', async (req, res) => {
        const { code, error } = req.query;
        let userID = getCookieUsername(req)

        if (error) {
            consoleLogger(`Discord OAuth error: ${error}`)
            redirectError(res)
            return
        }

        try {
            // Existing session flow
            if (userID) {
                if (isTokenExpired(userID)) {
                    await refreshUser(userID)
                }
            } else {
                // First login flow
                if (!code) {
                    consoleLogger("No code in callback")
                    redirectError(res)
                    return
                }

                userID = await validateUser(code)
                if (!userID) {
                    redirectError(res)
                    return
                }
            }

            buildCookieUserID(res, userID, 7)
            res.send(`Hello, ${getUserNameFromUserID(userID)}`)
        } catch (e) {
            console.error("OAuth callback failed:", e.message)
            redirectError(res)
        }
    });

    // Voice Related
    async function buildVoiceUsersForOwner(ownerUserId) {
        const voiceUsers = await app.locals.botClient.getVoiceUsers(ownerUserId)
        return await Promise.all(voiceUsers
            .filter((u) => u.userId !== app.locals.botClient.user?.id)
            .map(async (u) => {
                const existing = app.locals.users[u.userId] || {}
                const avatarState = await getAvatarOrDefault(ownerUserId, u.userId, u.avatarUrl || null)
                const avatarSet = await avatarStateToDataUrls(avatarState)
                const state = {
                    speaking: !!existing.speaking,
                    mute: !!existing.mute,
                    deaf: !!existing.deaf,
                }
                return {
                    userId: u.userId,
                    username: u.username,
                    speaking: state.speaking,
                    mute: state.mute,
                    deaf: state.deaf,
                    avatarSet,
                    avatarUrl: pickAvatarForState(avatarSet, state),
                }
            }))
    }
    app.locals.buildVoiceUsersForOwner = buildVoiceUsersForOwner

    app.get('/voice', async (req, res) => {
        try {
            const userID = await validateCookie(req, res)
            const username = getUserNameFromUserID(userID)
            const voiceStatus = await app.locals.botClient.isBotInSameVoiceChannel(userID)
            const users = await buildVoiceUsersForOwner(userID)
            res.render('voice', { 
                username,
                users,
                voiceStatus,
            })
        } catch (err) {
            return;
        }
        
    })

    // Display All Voice Users in Channel with Avatars
    // Only Displays Avatar from Set Matching Current State (Speaking/Muted/Deafened)
    app.get('/voice/display', async (req, res) => {
        try {
            const userID = await validateCookie(req, res)
            const users = await buildVoiceUsersForOwner(userID)
            res.render('viewDisplay', { 
                users,
                voiceEventPath: '/voice/events',
            })
        } catch (err) {
            return;
        }
        
    })

    app.get('/voice/display/:key', async (req, res) => {
        try {
            const key = (req.params.key || '').trim()
            const owner = key ? getUserByDisplayKey(key) : null
            if (!owner?.user_id) {
                return res.status(404).send('Not Found')
            }
            const users = await buildVoiceUsersForOwner(owner.user_id)
            res.render('viewDisplay', {
                users,
                voiceEventPath: `/voice/events/${encodeURIComponent(key)}`,
            })
        } catch (err) {
            return res.status(500).send('Internal Server Error')
        }
    })

    // Voice Display using Key to retrieve user info
    // Allows for external display pages to retrieve avatar info without needing to authenticate with cookie
    app.get('/voice/display/:displayKey', async (req, res) => {
        // here
    })

    app.get('/voice/status', async (req, res) => {
        try {
            const userID = await validateCookie(req, res)
            const voiceStatus = await app.locals.botClient.isBotInSameVoiceChannel(userID)
            return res.json({ voiceStatus })
        } catch (err) {
            return res.status(401).json({ error: 'Unauthorized' })
        }
    })

    app.post('/voice/submit', (req, res) => {
    const channel = req.body.channel; // user-entered string
    res.send(`You entered: ${channel}`);
    });

    // Error Page
    app.get('/error', async (req, res) => {
        res.send(`Please Login Using this <a href='https://discord.com/oauth2/authorize?client_id=${process.env.WEB_CLIENT_ID}&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A1500%2Fapi%2Fauth%2Fdiscord%2Fredirect&scope=identify+guilds+connections+email+guilds.join+gdm.join'>link</a>`)
    })
    
    // Static Files
    app.use('/static', express.static(path.join(__dirname, 'public')));
    app.use('/uploads', express.static(path.join(__dirname, 'user-data', 'uploads')));
    app.locals.settingsStreams = app.locals.settingsStreams || new Map()

    async function buildSettingsData(ownerUserId) {
        const voiceUsers = await app.locals.botClient.getVoiceUsers(ownerUserId)
        const configs = getConfigsForOwner(ownerUserId)
        const targetUserIds = Array.from(new Set([
            ...voiceUsers.map((u) => u.userId),
            ...configs.map((c) => c.target_user_id),
        ]))
        const voiceUserMap = Object.fromEntries(
            voiceUsers.map((u) => [u.userId, u])
        )
        const users = await Promise.all(
            targetUserIds.map(async (targetUserId) => {
                const fromVoice = voiceUserMap[targetUserId]
                if (fromVoice) return fromVoice

                const fetchedUser = await app.locals.botClient.users.fetch(targetUserId).catch(() => null)
                return {
                    userId: targetUserId,
                    username: fetchedUser?.username ?? targetUserId,
                    avatarUrl: fetchedUser?.displayAvatarURL({ extension: 'png', size: 64 }) ?? null,
                }
            })
        )
        const avatarSetEntries = await Promise.all(
            users.map(async (u) => {
                const avatarState = await getAvatarOrDefault(ownerUserId, u.userId, u.avatarUrl || null)
                const avatarSet = await avatarStateToDataUrls(avatarState)
                return [u.userId, avatarSet]
            })
        )
        const avatarSetMap = Object.fromEntries(avatarSetEntries)
        const peopleInCall = voiceUsers.map((u) => {
            const avatarSet = avatarSetMap[u.userId] || null
            const avatarUrl = pickAvatarForState(avatarSet, {}) || u.avatarUrl || null
            return { ...u, avatarUrl, avatarSet }
        })
        const userMap = Object.fromEntries(
            users.map((u) => {
                const avatarSet = avatarSetMap[u.userId] || null
                return [u.userId, {
                    ...u,
                    selectedAvatarUrl: pickAvatarForState(avatarSet, {}) || u.avatarUrl || null,
                    selectedAvatarSet: avatarSet,
                }]
            })
        )

        return {
            voiceUsers,
            peopleInCall,
            users,
            configs,
            userMap,
        }
    }

    function getOrCreateSettingsStreamSet(ownerUserId) {
        if (!app.locals.settingsStreams.has(ownerUserId)) {
            app.locals.settingsStreams.set(ownerUserId, new Set())
        }
        return app.locals.settingsStreams.get(ownerUserId)
    }

    async function pushSettingsUpdate(ownerUserId) {
        const streamSet = app.locals.settingsStreams.get(ownerUserId)
        if (!streamSet || streamSet.size === 0) return

        const { peopleInCall } = await buildSettingsData(ownerUserId)
        const payload = `data: ${JSON.stringify({
            peopleInCall,
        })}\n\n`

        for (const stream of streamSet) {
            stream.write(payload)
        }
    }

    app.locals.pushSettingsUpdate = pushSettingsUpdate
    app.locals.pushSettingsUpdateAll = async () => {
        const ownerUserIds = [...app.locals.settingsStreams.keys()]
        for (const ownerUserId of ownerUserIds) {
            await pushSettingsUpdate(ownerUserId)
        }
    }
    
    // Settings Page
    app.get('/settings', async (req, res) => {
        try {
            const ownerUserId = await validateCookie(req, res)
            const username = getUserNameFromUserID(ownerUserId)
            const displayKey = getUserById(ownerUserId)?.display_key || null
            const displayUrl = displayKey ? `${req.protocol}://${req.get('host')}/voice/display/${displayKey}` : null
            const { peopleInCall, users, configs, userMap } = await buildSettingsData(ownerUserId)

            res.render('settings', { 
                username,
                displayKey,
                displayUrl,
                peopleInCall,
                users,
                configs,
                userMap,
            })
        } catch (err) {
            return;
        }
    })

    // Settings SSE events
    app.get('/settings/events', async (req, res) => {
        try {
            const ownerUserId = await validateCookie(req, res)

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders?.()

            const streamSet = getOrCreateSettingsStreamSet(ownerUserId)
            streamSet.add(res)

            await pushSettingsUpdate(ownerUserId)

            req.on('close', () => {
                const currentSet = app.locals.settingsStreams.get(ownerUserId)
                if (!currentSet) return
                currentSet.delete(res)
                if (currentSet.size === 0) {
                    app.locals.settingsStreams.delete(ownerUserId)
                }
            })
        } catch (err) {
            return res.status(401).end()
        }
    })

    // Settings Edit Page
    app.get('/settings/:targetUserId/edit', async (req, res) => {
        try {
            const ownerUserId = await validateCookie(req, res)
            const targetUserId = req.params.targetUserId
            if (!targetUserId) {
                return res.redirect('/settings');
            }

            const targetUser = await app.locals.botClient.users.fetch(targetUserId).catch(() => null)
            const targetAvatarUrl = targetUser?.displayAvatarURL({ extension: 'png', size: 256 }) ?? null
            const currentAvatarState = await getAvatarOrDefault(ownerUserId, targetUserId, targetAvatarUrl)
            const currentAvatar = await avatarStateToDataUrls(currentAvatarState)
            const defaultAvatarSet = targetAvatarUrl
                ? await avatarStateToDataUrls(await generateDefaultAvatarsForUser(targetAvatarUrl))
                : await avatarStateToDataUrls(null)
            const userAllAvatars = getAllAvatarsForUser(ownerUserId)

            res.render('settingsConfigEdit', {
                username: getUserNameFromUserID(ownerUserId),
                ownerUserId,
                targetUserId,
                targetUser,
                currentAvatar,
                defaultAvatarSet,
                userAllAvatars,
            })
        } catch (err) {
            return;
        }
    })

    app.post('/settings/:targetUserId/avatar-select', async (req, res) => {
        try {
            const ownerUserId = await validateCookie(req, res)
            const targetUserId = req.params.targetUserId
            const selectedAssetId = (req.body.assetId || '').trim()

            if (!targetUserId) {
                return res.redirect('/settings')
            }

            let avatarPath = null
            if (selectedAssetId && selectedAssetId !== 'default') {
                const candidatePath = path.join(__dirname, 'user-data', 'uploads', ownerUserId, selectedAssetId)
                if (candidatePath.startsWith(path.join(__dirname, 'user-data', 'uploads', ownerUserId)) && fs.existsSync(candidatePath)) {
                    avatarPath = candidatePath
                }
            }

            saveAvatarPath({
                ownerUserId,
                targetUserId,
                avatarPath,
            })
            app.locals.pushVoiceUpdate?.(ownerUserId).catch(() => {})
            app.locals.pushSettingsUpdate?.(ownerUserId).catch(() => {})

            return res.redirect(`/settings/${targetUserId}/edit`)
        } catch (err) {
            return res.status(500).send('Internal Server Error')
        }
    })

    app.post('/settings/display-key/rotate', async (req, res) => {
        try {
            const ownerUserId = await validateCookie(req, res)
            rotateDisplayKey(ownerUserId)
            return res.redirect('/settings')
        } catch (err) {
            return res.status(500).send('Internal Server Error')
        }
    })

    // Avatars
    app.get('/avatars', async (req, res) => {
        try {
            const ownerUserId = await validateCookie(req, res)
            const username = getUserNameFromUserID(ownerUserId)
            const avatars = getAllAvatarsForUser(ownerUserId)

            res.render('avatars', {
                username,
                avatars,
                ownerUserId
            })
        } catch (err) {
            return;
        }
    })

    // Delete Avatar
    app.post('/avatars/:userId/:assetId/delete', async (req, res) => {
        try {
            const ownerUserId = await validateCookie(req, res)
            if (ownerUserId !== req.params.userId) {
                return res.status(403).send('Forbidden');
            }
            const { userId, assetId } = req.params
            deleteAvatarDirectory(userId, assetId)
            return res.redirect('/avatars')
        } catch (err) {
            return res.status(500).send('Internal Server Error');
        }
    })

    // Avatar Editor Upload
    app.post('/avatars/:userId/:assetId/edit', async (req, res) => {
        try {
            const ownerUserId = await validateCookie(req, res)
            if (ownerUserId !== req.params.userId) {
                return res.status(403).send('Forbidden');
            }

            return handleEditUpload(req, res);
        } catch (err) {
            return;
        }
    });

    // Delete Avatar Type
    app.post('/avatars/:userId/:assetId/:assetType/delete', async (req, res) => {
        try {
            const ownerUserId = await validateCookie(req, res)
            if (ownerUserId !== req.params.userId) {
                return res.status(403).send('Forbidden');
            }
            const { userId, assetId, assetType } = req.params
            deleteAvatarTypeFile(userId, assetId, assetType)
            return res.redirect(`/avatars/${userId}/${assetId}/edit`)
        } catch (err) {
            return res.status(500).send('Internal Server Error');
        }
    })

    // Avatars Upload
    app.post('/avatars/:userId/:assetId/:assetType', async (req, res) => {
        try {
            const ownerUserId = await validateCookie(req, res)
            if (ownerUserId !== req.params.userId) {
                return res.status(403).send('Forbidden');
            }

            return handleUpload(req, res);
        } catch (err) {
            return;
        }
    });

    // Create Avatar Directory
    app.post('/avatars/:userId/:assetId/', async (req, res) => { 
        try {
            const ownerUserId = await validateCookie(req, res)
            if (ownerUserId !== req.params.userId) {
                return res.status(403).send('Forbidden');
            }

            const { userId, assetId } = req.params
            createAvatarDirectory(userId, assetId)
            return res.redirect(`/avatars/${userId}/${assetId}/edit`)
        } catch (err) {
            return res.status(500).send('Internal Server Error');
        }
    })

    // Avatars Editor
    app.get('/avatars/:userId/:assetId/edit', async (req, res) => {
        try {
            const ownerUserId = await validateCookie(req, res)
            if (ownerUserId !== req.params.userId) {
                return res.status(403).send('Forbidden');
            }

            const { assetId } = req.params
            const avatars = getAllAvatarsForUser(ownerUserId)
            const asset = avatars.find((a) => a.assetId === assetId)
            const assetsByType = Object.fromEntries(
                (asset?.items || []).map((item) => [item.assetType, item])
            )

            res.render('avatarEdit', {
                username: getUserNameFromUserID(ownerUserId),
                ownerUserId,
                assetId,
                assetsByType,
            })
        } catch (err) {
            return;
        }
    });
}

// Easy Function to Redirect to Error Page
function redirectError(res) {
    res.redirect("/error")
}

// Subscribe To Voice Listener Event using a passed function
function voiceListener({ client, handler }) {
    client.on('voiceActivity', (evt) => handler(evt))
}

// /voice Page Event Logic
function setupVoiceEvent({ app, client }) {
    // Create owner-scoped sets for VoiceStreams
    app.locals.voiceStreamsByOwner = app.locals.voiceStreamsByOwner || new Map()

    function getOrCreateVoiceStreamSet(ownerUserId) {
        if (!app.locals.voiceStreamsByOwner.has(ownerUserId)) {
            app.locals.voiceStreamsByOwner.set(ownerUserId, new Set())
        }
        return app.locals.voiceStreamsByOwner.get(ownerUserId)
    }

    async function pushVoiceUpdate(ownerUserId) {
        const streamSet = app.locals.voiceStreamsByOwner.get(ownerUserId)
        if (!streamSet || streamSet.size === 0) return

        const users = await app.locals.buildVoiceUsersForOwner?.(ownerUserId).catch(() => [])
        const usersById = Object.fromEntries((users || []).map((u) => [u.userId, u]))
        const payload = `data: ${JSON.stringify({ type: 'state', users: usersById })}\n\n`

        for (const stream of streamSet) {
            stream.write(payload)
        }
    }

    app.locals.pushVoiceUpdate = pushVoiceUpdate
    app.locals.pushVoiceUpdateAll = async () => {
        const ownerUserIds = [...app.locals.voiceStreamsByOwner.keys()]
        for (const ownerUserId of ownerUserIds) {
            await pushVoiceUpdate(ownerUserId)
        }
    }

    // /voice/events setup
    app.get('/voice/events', async (req, res) => {
        try {
            const ownerUserId = await validateCookie(req, res)
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders?.()

            const streamSet = getOrCreateVoiceStreamSet(ownerUserId)
            streamSet.add(res);

            await pushVoiceUpdate(ownerUserId)

            req.on('close', () => {
                const currentSet = app.locals.voiceStreamsByOwner.get(ownerUserId)
                if (!currentSet) return
                currentSet.delete(res)
                if (currentSet.size === 0) {
                    app.locals.voiceStreamsByOwner.delete(ownerUserId)
                }
            });
        } catch (err) {
            return res.status(401).end()
        }
    })

    app.get('/voice/events/:key', async (req, res) => {
        try {
            const key = (req.params.key || '').trim()
            const owner = key ? getUserByDisplayKey(key) : null
            const ownerUserId = owner?.user_id || null
            if (!ownerUserId) {
                return res.status(404).end()
            }

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders?.()

            const streamSet = getOrCreateVoiceStreamSet(ownerUserId)
            streamSet.add(res);

            await pushVoiceUpdate(ownerUserId)

            req.on('close', () => {
                const currentSet = app.locals.voiceStreamsByOwner.get(ownerUserId)
                if (!currentSet) return
                currentSet.delete(res)
                if (currentSet.size === 0) {
                    app.locals.voiceStreamsByOwner.delete(ownerUserId)
                }
            });
        } catch (err) {
            return res.status(500).end()
        }
    })
    
    const handler = (evt) => {
        if (evt.userId === app.locals.botClient.user?.id) return;
        const u = ensureUser({ evt, app });

        // Event Type Handling
        switch (evt.type) {
            case 'start':
                u.speaking = true;
                break;
            case 'end':
                u.speaking = false;
                break;
            case 'mute':
                u.mute = true;
                break;
            case 'unmute':
                u.mute = false;
                break;
            case 'deaf':
                u.deaf = true;
                break;
            case 'undeaf':
                u.deaf = false;
                break;
            default:
                // Here just incase
                break;
        }

        // Update Locals with user
        app.locals.users[u.userId] = u

        // Send owner-scoped voice payloads to browser
        app.locals.pushVoiceUpdateAll?.().catch(() => {});
        app.locals.pushSettingsUpdateAll?.().catch(() => {});
    }

    voiceListener({ client, handler })

    // Keep /settings live list in sync for join/leave/move events too.
    client.on('voiceStateUpdate', () => {
        app.locals.pushVoiceUpdateAll?.().catch(() => {});
        app.locals.pushSettingsUpdateAll?.().catch(() => {});
    });
}

function ensureUser({ app, evt }) {
    const users = app.locals.users;
    if (!users[evt.userId]) {
        users[evt.userId] = {
            userId: evt.userId,
            username: evt.username,
            speaking: false,
            mute: false,
            deaf: false,
        }
    }
    return users[evt.userId]
}

// App Start Logic
function startWeb({ client }) {

    // App Variables
    const port = process.env.PORT || 1500;
    const app = express();
    app.locals.botClient = client
    app.locals.users = {}
    setupWeb({ app })
    setupVoiceEvent({ app, client })

    app.listen(port, () => { consoleLogger(`Running on ${port}`) })
}

// Log To Console Marked as Web
function consoleLogger(message) {
	console.info(`[Web] ${message}`)
}

module.exports = { startWeb }

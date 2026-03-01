// Imports
const fs = require('fs')
const path = require('path');
const multer = require('multer');

// Local Imports
const { saveAvatarPath } = require('./database/userConfigDatabase');

// Variables
const uploadRoot = path.join(__dirname, 'user-data', 'uploads')

// File Structure
// - user-data
// -- uploads
// --- userId
// ---- avatar1
// ----- avatars
// ---- avatar2
// ----- avatars
// ---- etc.

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = generateAvatarPath(req.userId, req.assetId)
            fs.mkdirSync(dir, { recursive: true })
            cb(null, dir)
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase()
            const safeExt = ['.png', '.jpg', '.jpeg', '.gif'].includes(ext) ? ext : '.bin';
            cb(null, `${req.assetId}_${req.assetType}${safeExt}`)
        },
    }),
    limits: { fileSize: 2 * 1024 * 1024}, // 2MB for now
    fileFilter: (req, file, cb) => {
        const ok = ['image/png', 'image/jpeg', 'image/gif'].includes(file.mimetype)
        cb(ok ? null : new Error('Invalid File Type'), ok)
    }
})

function generateAvatarPath(userId, assetId) {
    const dir = path.join(uploadRoot, userId, assetId)
    return dir
}

function handleUpload(req, res) {
    const { userId, assetId, assetType } = req.params
    req.userId = userId
    req.assetId = assetId
    req.assetType = assetType
    upload.single('avatars')(req, res, (err) => {
        if (err) {
            return res.status(400).send(err.message)
        } else {
            res.redirect('/avatars')
        }
    })
}

function getAllAvatarsForUser(userId) {
    const userDir = path.join(uploadRoot, userId)
    if (!fs.existsSync(userDir)) return []
    const assetDirs = fs.readdirSync(userDir, { withFileTypes: true })
    const avatars = []
    for (const entry of assetDirs) {
        if (!entry.isDirectory()) continue

        const assetId = entry.name
        const assetDirPath = path.join(userDir, assetId)
        const files = fs.readdirSync(assetDirPath, { withFileTypes: true })
        const items = []

        for (const fileEntry of files) {
            if (!fileEntry.isFile()) continue

            const fileName = fileEntry.name
            const parsed = path.parse(fileName)
            const parts = parsed.name.split('_')
            const assetType = parts.length > 1 ? parts.slice(1).join('_') : 'unknown'

            items.push({
                fileName,
                assetType,
                fullPath: path.join(assetDirPath, fileName),
            })
        }

        avatars.push({
            assetId,
            dirPath: assetDirPath,
            items,
        })
    }
    return avatars
}

function deleteAvatarDirectory(userId, assetId) {
    const dir = generateAvatarPath(userId, assetId)
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true })
    }
}

module.exports = { handleUpload, getAllAvatarsForUser, deleteAvatarDirectory };

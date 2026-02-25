const axios = require('axios');
const { setToken, getRefreshToken, getAccessToken, getTokenExpiration, getTokenUsername} = require('./tokenStore')

// Retrieves User Data for Uncached User
async function validateUser(code) {

    // Form to Retrieve Token
    const formData = buildFormData('authorization_code', code.toString())

    // Retrieve Token From Discord API
    const output = await axios.post('https://discord.com/api/v10/oauth2/token',
        formData, {
            headers: {
                "Content-Type": 'application/x-www-form-urlencoded',
            }
    });

    // If Successfully Retrieved Token
    if (output.data) {
        const userinfo = await retrieveUser(output.data.access_token)
        saveUserInfo(userinfo, output)
        return userinfo.data.id
    }

    return null
}

// Refresh Token For Cached Player
async function refreshUser(userID) {
    const refreshToken = getRefreshToken(userID)
    if (!refreshToken) {
        throw new Error('Missing refresh token')
    }

    const formDataRefresh = buildFormData('refresh_token', refreshToken);
    const refresh = await axios.post('https://discord.com/api/v10/oauth2/token',
        formDataRefresh, {
            headers: {
                "Content-Type": 'application/x-www-form-urlencoded',
            }
    });

    // If Successfully Retrieved Token
    if (refresh.data) {
        const userinfo = await retrieveUser(refresh.data.access_token)
        saveUserInfo(userinfo, refresh)
    }
}

// Determines if Token of Cached Player is Expired
function isTokenExpired(userID) {
    const expires = getTokenExpiration(userID)
    if (!expires) {
        return true
    }

    // expires is stored as epoch seconds
    return Math.floor(Date.now() / 1000) > expires
}

async function retrieveUser(token) {
    const headers =  {
        'Authorization': `Bearer ${token}`,
    }

    // user info
    const userinfo = await axios.get('https://discord.com/api/v10/users/@me', {
        headers
    });

    return userinfo
}

// Saves User information To Cache, Use this instead of setToken directly for safer caching
function saveUserInfo(userinfo, output) {
    // Logic To Save Token to Memory
    const expires = Math.floor(Date.now() / 1000) + output.data.expires_in
    setToken(userinfo.data.id, output.data.access_token, output.data.refresh_token, expires, userinfo.data.username)
}


// Retrieve Username From UserID
function getUserNameFromUserID(userID) {
    return getTokenUsername(userID)
}

// Check if Token is Timed Out then Refresh If So
async function checkToken(userID) {
    if (isTokenExpired(userID)) {
        await refreshUser(userID)
    }
}

async function getUserActivity(userID) {
    await checkToken(userID)
    const headers =  {
        'Authorization': `Bearer ${getAccessToken(userID)}`,
    }

    // user info
    const connections = await axios.get('https://discord.com/api/v10/users/@me/connections', {
        headers
    });

    console.log(connections)

}

function buildFormData(grant_type, grant) {
    const formData = new URLSearchParams({
        client_id: process.env.WEB_CLIENT_ID,
        client_secret: process.env.WEB_CLIENT_SECRET,
        grant_type: grant_type,
    })
    switch (grant_type) {
        case "refresh_token":
            formData.append('refresh_token', grant)
            break
        case "authorization_code":
            formData.append('code', grant.toString())
            formData.append('redirect_uri', 'http://localhost:1500/api/auth/discord/redirect')
    }

    return formData
}

module.exports = {validateUser, refreshUser, retrieveUser, isTokenExpired, saveUserInfo, getUserNameFromUserID, checkToken, buildFormData, getUserActivity}

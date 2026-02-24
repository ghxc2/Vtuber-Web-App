// Imports
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

// Current Project Imports
const { validateUser, refreshUser, isTokenExpired, getUserNameFromUserID, checkToken, getUserActivity } = require('../users')
const { getCookieUsername, buildCookieUserID } = require('./cookies')

// App Variables
const port = process.env.PORT || 1500;
const app = express();

// Setup View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
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
        console.log(`Discord OAuth error: ${error}`)
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
                console.log("No code in callback")
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
app.get('/voice', async (req, res) => {
    const userID = req.cookies?.userID;
    if (!userID) {
        redirectError(res)
        return
    }

    try {
        // Assure User Token Valid
        await checkToken(userID)
    } catch (e) {
        console.error("Voice token check failed:", e.message)
        redirectError(res)
        return
    }
    username = getUserNameFromUserID(userID)
    res.render('voice', { username })
})

app.post('/voice/submit', (req, res) => {
  const channel = req.body.channel; // user-entered string
  res.send(`You entered: ${channel}`);
});

// Failed Login
app.get('/error', async (req, res) => {
    res.send(`Please Login Using this <a href='https://discord.com/oauth2/authorize?client_id=${process.env.WEB_CLIENT_ID}&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A1500%2Fapi%2Fauth%2Fdiscord%2Fredirect&scope=identify+guilds+connections+email+guilds.join+gdm.join'>link</a>`)
})

// Easy Function to Redirect to Error Page
function redirectError(res) {
    res.redirect("/error")
}

// App Start Logic
app.listen(port, () => { console.log(`Running on ${port}`) })

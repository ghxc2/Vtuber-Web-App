require('dotenv').config();
const { startWeb } = require('./web/server');
const { startBot } = require('./bot/bot');

(async () => {
    const client = await startBot()
    console.log("Bot Started Successfully")
    startWeb({ client })
    console.log("App Started Successfully")
})();

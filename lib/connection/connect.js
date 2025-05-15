async function konek({ client, update, clientstart, DisconnectReason, Boom }) {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
        let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
        if (reason === DisconnectReason.badSession) {
            console.log(`Bad Session File, Please Delete Session and Scan Again`);
            process.exit();
        } else if (reason === DisconnectReason.connectionClosed) {
            console.log("Connection closed, reconnecting....");
            clientstart();
        } else if (reason === DisconnectReason.connectionLost) {
            console.log("Connection Lost from Server, reconnecting...");
            clientstart();
        } else if (reason === DisconnectReason.connectionReplaced) {
            console.log("Connection Replaced, Another New Session Opened, Please Restart Bot");
            process.exit();
        } else if (reason === DisconnectReason.loggedOut) {
            console.log(`Device Logged Out, Please Delete Session and Scan Again.`);
            process.exit();
        } else if (reason === DisconnectReason.restartRequired) {
            console.log("Restart Required, Restarting...");
            clientstart();
        } else if (reason === DisconnectReason.timedOut) {
            console.log("Connection TimedOut, Reconnecting...");
            clientstart();
        } else {
            console.log(`Unknown DisconnectReason: ${reason}|${connection}`);
            clientstart();
        }
    } else if (connection === 'open') {
        console.log('Bot Connected');
    }
}

module.exports = { konek };
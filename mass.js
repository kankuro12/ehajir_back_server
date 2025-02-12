require('dotenv').config();

const net = require('net');
const { start } = require('repl');

// Server connection details.

const HOST = '192.168.254.15';
const PORT = process.env.PORT;

// Configuration: 2000 requests over 15 minutes.
const totalRequests = 5000;
const durationMs = 15 * 60 * 1000; // 15 minutes in milliseconds (900,000 ms)
const intervalMs = durationMs / totalRequests; // ≈450 ms between each request

let sentRequests = 0;
let counts={
    saved:0,
    error:0,
    ignored:0,
    invalid:0
}
// Create a persistent TCP client.
const client = new net.Socket();

// Connect once to the server.
client.connect(PORT, HOST, () => {
    console.log('Persistent client connected to the server.');
    scheduleNextRequest();
});

// Handle incoming data events.
client.on('data', (data) => {
    counts[data.toString().trim()]++;
    console.log(`Received -> ${data.toString().trim()}`);
    showCounts();
});

// Handle errors.
client.on('error', (err) => {
    console.error(`Error -> ${err.message}`);
});

// Optionally handle connection close.
client.on('close', () => {
    console.log('Connection closed.');
});

const showCounts=()=>{
    console.clear();
    console.log(`\n
    saved: ${counts.saved}
    error: ${counts.error}
    ignored: ${counts.ignored}
    invalid: ${counts.invalid}
    sentRequests: ${sentRequests}
    `);
}

let istart=1;

/**
 * Sends one request using the persistent client.
 */
function sendRequest() {
    if (sentRequests >= totalRequests) {
        console.log('All requests have been sent.');
        // client.end();
        
        return;
    }

    // Increment and capture the current request number.
    sentRequests++;
    const requestId = sentRequests;

    // Generate a random 10-digit RFID number.
    const rfid =(9000000000+(istart++)).toString();
    // console.log(`Request ${requestId}: Sending RFID ${rfid}`);

    // Send the RFID data over the persistent connection.
    client.write(rfid);
}

/**
 * Schedules the next request at an irregular interval.
 */
function scheduleNextRequest() {
    if (sentRequests >= totalRequests) return;

    // Generate a random delay between 100ms and 1000ms.
    const randomDelay = Math.floor(Math.random() * 900) + 100;
    const randomParam = Math.floor(Math.random() * 100) + 1;
    console.log(`Next request in ${randomDelay}ms with ${randomParam} requests`);
    setTimeout(() => {
        for (let i = 0; i < randomParam; i++){
            sendRequest();
            //
        }
        scheduleNextRequest();
    }, randomDelay);
}



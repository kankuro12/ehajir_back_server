const axios = require('axios');
const { json } = require('express');
const WebSocket = require('ws');

//websocket server
const wss = new WebSocket.Server({ port: 8080,host: 'localhost' });
var clientLists = {};
var clientMap = {};
var clientID=0;

var locations = {};



wss.on('connection', (client) => {
    const localClientID = clientID++;

    client.onmessage = (message) => {
        const data = JSON.parse(message.data);
        const deviceId = data.deviceId;
        console.log('Received message:', data);
        console.log('Received message:', data.deviceId);
        if(deviceId){
            if (!clientLists[deviceId]) {
                clientLists[deviceId] = [];
            }
            clientMap[localClientID] = deviceId;

            clientLists[deviceId].push({client, localClientID});
            console.log(clientLists[deviceId]);
            

        }
        
    };

    client.onclose = () => {
        const deviceId = clientMap[localClientID];
        if(deviceId){
            const index = clientLists[deviceId].findIndex(c => c.localClientID === localClientID);
            if (index !== -1) {
                clientLists[deviceId].splice(index, 1);
            }  
        }
    };
});


setInterval(() => {

    for (const deviceId in locations) {
        if (Object.prototype.hasOwnProperty.call(locations, deviceId)) {
            const location = locations[deviceId];
            clientLists[deviceId]?.forEach(clientData => {
                const { client } = clientData;
                client.send(JSON.stringify(location));
            });
           
        }
    }
}, 1000); // Keep the server alive



/**
 * Authenticate with username and password to get a session
 * @param {string} username - The username for authentication
 * @param {string} password - The password for authentication
 * @returns {Promise<object>} The session data
 */
async function connect(username, password) {
    try {
        // Get current time and add 1 hour
        const expirationTime = new Date();
        expirationTime.setHours(expirationTime.getHours() + 1);

        const response = await axios.post('https://itsochvts.com/api/session/token', {},{
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'expiration': expirationTime.toISOString()
            },
            auth: {
                username,
                password
            }
        });

        return response.data.token || response.data;
    } catch (error) {
        console.error('Authentication failed:', error.response?.data || error.message);
        throw error;
    }
}

async function getJSESSIONID(token){
    try {
        const response = await axios.get(`https://itsochvts.com/api/session?token=${token}`);
        // Assuming the JSESSIONID is in the response cookie
        const cookies = response.headers['set-cookie'];
        const jsessionidCookie = cookies.find(cookie => cookie.startsWith('JSESSIONID'));
        if (jsessionidCookie) {
            const jsessionid = jsessionidCookie.split(';')[0].split('=')[1];
            return jsessionid;
        }else{
            throw new Error('JSESSIONID not found in cookies');
        }
    } catch (error) {
        console.error('Failed to get JSESSIONID:', error.response?.data || error.message);
        throw error;
    }
}

function openSocket(jsessionid) {
    try {
        const socket = new WebSocket('wss://itsochvts.com/api/socket', [], {
            headers: {
                'Cookie': `JSESSIONID=${jsessionid}`
            }
        });

        socket.onclose = () => {
            console.log('WebSocket connection closed, reconnecting...');
            startConnection();
        };
        socket.onopen = () => {
            console.log('WebSocket connection opened');
        };
    

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('Received message:', data);
            if(data.positions){
                data.positions.forEach(position => {
                    console.log('Received position:', position);
                    const { deviceId, latitude, longitude } = position;
                    locations[deviceId] = { lat:latitude, lng:longitude };
                });

            }
        };
        socket.onerror = (error) => {
            console.error('WebSocket error:', error.message);
        };
    
        return socket;
        
    } catch (error) {
        console.error('Error opening WebSocket:', error.message);
        throw error;
        
    }
}

function startConnection(){

    connect('cms111000111@gmail.com','Kankuro123@')
    .then((token)=>{
       
        return getJSESSIONID(token);
        
    })
    .then((jsessionid)=>{
        openSocket(jsessionid);
    })
    .catch((error) => {
        console.error('Error:', error);
    });
}

startConnection();

//stop the program from closing until quit is typped
process.stdin.resume();
process.stdin.on('data', function(data) {
    if (data.toString().trim() === 'quit') {
        process.exit();
    }
});


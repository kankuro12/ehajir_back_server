// server.js
require('dotenv').config();
const { log } = require('console');
const { write } = require('fs');
const net = require('net');
const SERVER_PORT = process.env.SERVER_PORT || 2023;         // TCP server port
const SERVER_HOST = process.env.SERVER_HOST ;
var reconnectInterval;
if(!SERVER_HOST){
  console.log('SERVER_HOST is required');
  process.exit(1);
}


let count={};

// setInterval(()=>{
//   // format count
//   const total = Object.values(count).length;
//   console.clear();
//   console.log(`Total: ${total}`);
//   for (const key in count) {
//     if (Object.prototype.hasOwnProperty.call(count, key)) {
//       const element = count[key];
//       console.log( `${key}:${element}`);
//     }
//   }
// },1000);

const writeCount = ()=>{
  const total = Object.values(count).length;
  console.clear();
  console.log(`Total: ${total}`);
  for (const key in count) {
    if (Object.prototype.hasOwnProperty.call(count, key)) {
      const element = count[key];
      console.log( `${key}:${element}`);
    }
  }

  setTimeout(() => {
    writeCount();
  }, 1000);
}
// --- Create TCP Client (existing logic) ---
const socket = new net.Socket();
// Listen for data from the client.
socket.on('data', (data) => {
  const hexMessage = data.toString('hex');
  const processedHex = hexMessage.slice(0, -4).slice(-24);
  if(count[processedHex]){
    count[processedHex]++;
  }else{
    count[processedHex]=1;
  }
  // console.log('Received hex string:', processedHex);
  // // const hexMessage = data.toString().trim();
  // //convert hex to isUtf8
  // message = Buffer.from(hexMessage, 'hex').toString('utf8');
  // console.log(message);
  

  // // Helper function to insert a single RFID value.
  // function processPiece(rfid) {
  //   const sql = 'INSERT INTO rfid_logs (rfid) VALUES (?)';
  //   db.run(sql, [rfid], function (err) {
  //     if (err) {
  //       socket.write(`error`);
  //     } else {
  //       socket.write(`saved\n`);
  //     }
  //   });
  // }

  // processPiece(message);

  // If the message consists only of digits.
  // if (/^\d+$/.test(message)) {
  //   if (message.length === 10) {
  //     // Exactly a 10-digit RFID.
  //     processPiece(message);
  //   } else if (message.length > 10) {
  //     // Split the string into 10-digit chunks.
  //     for (let i = 0; i < message.length; i += 10) {
  //       const chunk = message.substring(i, i + 10);
  //       if (chunk.length === 10) {
  //         processPiece(chunk);
  //       } else {
  //         socket.write('ignored\n');
  //       }
  //     }
  //   }
  // } else {
  //   // If the message contains other characters, try extracting all 10-digit sequences.
  //   const matches = message.match(/\d{10}/g);
  //   if (matches && matches.length > 0) {
  //     matches.forEach(processPiece);
  //   } else {
  //     socket.write('invalid\n');
  //   }
  // }
});

socket.on('close', () => {
  if (!reconnectInterval) {
    reconnectInterval = setInterval(() => {
      console.log('Attempting to reconnect...');
      createConnection();
    }, 10000);
  }
});

socket.on('error', (err) => {
  console.error('Socket error:', err.message);
});

function createConnection() {
  console.log(`Connecting to TCP server at ${SERVER_HOST}:${SERVER_PORT}...`);
  socket.connect(SERVER_PORT, SERVER_HOST, () => {
    
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
    console.log(`TCP Server listening on port ${SERVER_PORT}`);
  });
}



createConnection();
writeCount();
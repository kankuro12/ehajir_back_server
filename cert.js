const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

// Load environment variables from .env file
const envPath = path.resolve(__dirname, '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

// Get HOST from environment variables
const host = envConfig.HOST || 'localhost';

console.log(`Generating SSL certificate for host: ${host}`);

// Create certificate directory if it doesn't exist
const certDir = path.join(__dirname, 'certs');
if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir);
}

// OpenSSL command to generate self-signed certificate
try {
    // Generate private key
    execSync(`openssl genrsa -out "${certDir}/key.pem" 2048`);
    
    // Generate CSR (Certificate Signing Request)
    execSync(`openssl req -new -key "${certDir}/key.pem" -out "${certDir}/csr.pem" -subj "/CN=${host}/O=Local Development/C=US" -config "${path.join(__dirname, 'openssl.cnf')}"`);
    
    // Generate self-signed certificate
    execSync(`openssl x509 -req -days 365 -in "${certDir}/csr.pem" -signkey "${certDir}/key.pem" -out "${certDir}/cert.pem"`);
    
    console.log(`SSL certificate successfully generated in ${certDir}`);
    console.log('cert.pem: SSL Certificate');
    console.log('key.pem: Private Key');
} catch (error) {
    console.error('Error generating SSL certificate:', error.message);
}
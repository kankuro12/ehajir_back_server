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
const privateKeyPassword = envConfig.CERT_PASSWORD || 'defaultPassword123'; // Fallback password
const customConfigPath = path.join(__dirname, 'custom-openssl.cnf');

// Update the custom config file with the current host
const updateConfigWithHost = () => {
    let configContent = fs.readFileSync(customConfigPath, 'utf8');
    
    // Update CN in the [dn] section
    configContent = configContent.replace(/CN = .*/g, `CN = ${host}`);
    
    // Update DNS entries in [alt_names] section
    const altNamesSection = configContent.match(/\[alt_names\][\s\S]*?(?=\n\[|$)/);
    if (altNamesSection) {
        let newAltNames = `[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
DNS.3 = ${host}
IP.1 = 127.0.0.1
IP.2 = ::1
IP.3 = ${host}
IP.4 = ${envConfig.SERVER_HOST || '192.168.254.200'}`;
        
        configContent = configContent.replace(/\[alt_names\][\s\S]*?(?=\n\[|$)/, newAltNames);
    }
    
    fs.writeFileSync(customConfigPath, configContent);
};

// Update config with current host
updateConfigWithHost();

console.log(`Using custom OpenSSL config: ${customConfigPath}`);

try {
    console.log('Step 1: Generating CA private key...');
    // Generate CA private key FIRST (with password protection)
    execSync(`openssl genrsa -aes256 -out "${certDir}/ca-key.pem" -passout pass:${privateKeyPassword} 2048`);
    
    console.log('Step 2: Generating server private key...');
    // Generate server private key SECOND (with password protection)
    execSync(`openssl genrsa -aes256 -out "${certDir}/key.pem" -passout pass:${privateKeyPassword} 2048`);
    
    console.log('Step 3: Generating CA certificate (Root CA)...');
    // Create CA certificate using the CA private key
    execSync(`openssl req -new -x509 -key "${certDir}/ca-key.pem" -passin pass:${privateKeyPassword} -out "${certDir}/ca-cert.pem" -days 3650 -config "${customConfigPath}" -extensions v3_ca`);
    
    console.log('Step 4: Generating server certificate signing request...');
    // Generate server CSR using the server private key
    execSync(`openssl req -new -key "${certDir}/key.pem" -passin pass:${privateKeyPassword} -out "${certDir}/server.csr" -config "${customConfigPath}" -extensions v3_req`);
    
    console.log('Step 5: Signing server certificate with CA...');
    // Sign server certificate with CA certificate and CA private key
    execSync(`openssl x509 -req -in "${certDir}/server.csr" -CA "${certDir}/ca-cert.pem" -CAkey "${certDir}/ca-key.pem" -passin pass:${privateKeyPassword} -CAcreateserial -out "${certDir}/cert.pem" -days 365 -extensions v3_req -extfile "${customConfigPath}"`);
    
    console.log('Step 6: Converting certificates to various formats...');
    // Convert CA certificate to DER format (required for Android)
    execSync(`openssl x509 -in "${certDir}/ca-cert.pem" -outform der -out "${certDir}/ca-cert.der"`);
    
    // Convert server certificate to DER format
    execSync(`openssl x509 -in "${certDir}/cert.pem" -outform der -out "${certDir}/cert.der"`);
    
    // Convert server certificate to PKCS12 format
    execSync(`openssl pkcs12 -export -out "${certDir}/certificate.pfx" -inkey "${certDir}/key.pem" -passin pass:${privateKeyPassword} -in "${certDir}/cert.pem" -certfile "${certDir}/ca-cert.pem" -passout pass:${privateKeyPassword}`);
      console.log('Step 7: Generating cross-platform certificates...');
    // Generate unprotected private key for mobile compatibility
    execSync(`openssl rsa -in "${certDir}/key.pem" -passin pass:${privateKeyPassword} -out "${certDir}/mobile-key.pem"`);
    
    // ANDROID CERTIFICATES
    console.log('  - Android certificates...');
    fs.copyFileSync(`${certDir}/cert.pem`, `${certDir}/android-cert.pem`);
    execSync(`openssl x509 -in "${certDir}/android-cert.pem" -outform der -out "${certDir}/android-cert.der"`);
    execSync(`openssl pkcs12 -export -out "${certDir}/android-keystore.p12" -inkey "${certDir}/key.pem" -passin pass:${privateKeyPassword} -in "${certDir}/cert.pem" -certfile "${certDir}/ca-cert.pem" -passout pass:${privateKeyPassword} -name "AndroidSSL"`);
    
    // iOS CERTIFICATES
    console.log('  - iOS certificates...');
    fs.copyFileSync(`${certDir}/cert.pem`, `${certDir}/ios-cert.pem`);
    execSync(`openssl x509 -in "${certDir}/ios-cert.pem" -outform der -out "${certDir}/ios-cert.der"`);
    // iOS prefers .cer extension for certificate files
    fs.copyFileSync(`${certDir}/ca-cert.der`, `${certDir}/ios-ca.cer`);
    fs.copyFileSync(`${certDir}/ca-cert.der`, `${certDir}/ios-ca.crt`);
    fs.copyFileSync(`${certDir}/ca-cert.der`, `${certDir}/android-ca.crt`);
    
    fs.copyFileSync(`${certDir}/cert.der`, `${certDir}/ios-cert.cer`);
    // Create iOS profile (mobileconfig will be generated separately)
    execSync(`openssl pkcs12 -export -out "${certDir}/ios-keystore.p12" -inkey "${certDir}/key.pem" -passin pass:${privateKeyPassword} -in "${certDir}/cert.pem" -certfile "${certDir}/ca-cert.pem" -passout pass:${privateKeyPassword} -name "iOSSSL"`);
    
    // WINDOWS CERTIFICATES
    console.log('  - Windows certificates...');
    fs.copyFileSync(`${certDir}/cert.pem`, `${certDir}/windows-cert.pem`);
    // Windows certificate store format (.crt extension)
    fs.copyFileSync(`${certDir}/ca-cert.pem`, `${certDir}/windows-ca.crt`);
    fs.copyFileSync(`${certDir}/cert.pem`, `${certDir}/windows-cert.crt`);
    // Windows PFX format (same as PKCS12 but .pfx extension)
    fs.copyFileSync(`${certDir}/certificate.pfx`, `${certDir}/windows-keystore.pfx`);


    execSync()
    
    // Create certificate chains for all platforms
    const certContent = fs.readFileSync(`${certDir}/cert.pem`, 'utf8');
    const caCertContent = fs.readFileSync(`${certDir}/ca-cert.pem`, 'utf8');
    const fullChain = certContent + '\n' + caCertContent;
    
    fs.writeFileSync(`${certDir}/android-cert-chain.pem`, fullChain);
    fs.writeFileSync(`${certDir}/ios-cert-chain.pem`, fullChain);
    fs.writeFileSync(`${certDir}/windows-cert-chain.pem`, fullChain);
      // Generate comprehensive installation instructions for all platforms
    const crossPlatformInstructions = `
CROSS-PLATFORM SSL CERTIFICATE INSTALLATION GUIDE
================================================

CERTIFICATE FILES GENERATED:
============================
CA Certificates (Root Authority):
- ca-cert.pem: Root CA (PEM format)
- ca-cert.der: Root CA (DER format)
- ca-key.pem: CA Private Key (password protected)

Server Certificates:
- cert.pem: Server Certificate (PEM format)
- key.pem: Server Private Key (password protected)
- certificate.pfx: Server + CA Chain (PKCS12 format)

ANDROID INSTALLATION:
====================
Files needed:
- android-cert.der: Server certificate
- android-keystore.p12: Complete keystore
- android-cert-chain.pem: Certificate chain

Method 1 - Install CA Certificate:
1. Copy ca-cert.der to your Android device
2. Settings > Security > Install from storage
3. Select "CA Certificate"
4. Choose ca-cert.der
5. Name: "Development CA"
6. Usage: "VPN and apps"

Method 2 - App Integration:
1. Place android-keystore.p12 in res/raw/
2. Add Network Security Config to AndroidManifest.xml:
   <application android:networkSecurityConfig="@xml/network_security_config">

3. Create res/xml/network_security_config.xml:
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">${host}</domain>
        <domain includeSubdomains="true">192.168.254.14</domain>
        <domain includeSubdomains="true">192.168.254.200</domain>
        <trust-anchors>
            <certificates src="@raw/android_keystore"/>
            <certificates src="system"/>
        </trust-anchors>
    </domain-config>
</network-security-config>

iOS INSTALLATION:
================
Files needed:
- ios-ca.cer: CA certificate
- ios-cert.cer: Server certificate
- ios-keystore.p12: Complete keystore

Method 1 - Install CA Certificate:
1. Email ios-ca.cer to yourself or use AirDrop
2. Open the .cer file on iOS device
3. Settings > General > VPN & Device Management
4. Install the certificate profile
5. Settings > General > About > Certificate Trust Settings
6. Enable full trust for the certificate

Method 2 - App Integration:
1. Add ios-keystore.p12 to your Xcode project
2. Add to Info.plist:
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSExceptionDomains</key>
    <dict>
        <key>${host}</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <false/>
            <key>NSExceptionMinimumTLSVersion</key>
            <string>TLSv1.2</string>
            <key>NSExceptionRequiresForwardSecrecy</key>
            <false/>
        </dict>
    </dict>
</dict>

Method 3 - Configuration Profile (Enterprise):
Create a .mobileconfig file with certificate payload

WINDOWS INSTALLATION:
====================
Files needed:
- windows-ca.crt: CA certificate
- windows-cert.crt: Server certificate
- windows-keystore.pfx: Complete keystore

Method 1 - Install CA Certificate:
1. Double-click windows-ca.crt
2. Click "Install Certificate"
3. Choose "Local Machine" (requires admin)
4. Select "Place all certificates in the following store"
5. Browse > "Trusted Root Certification Authorities"
6. Click "Next" > "Finish"

Method 2 - Command Line (Admin):
certlm.msc
Import windows-ca.crt to "Trusted Root Certification Authorities"

Method 3 - PowerShell (Admin):
Import-Certificate -FilePath "windows-ca.crt" -CertStoreLocation Cert:\\LocalMachine\\Root

Method 4 - Group Policy (Enterprise):
1. Computer Configuration > Policies > Windows Settings
2. Security Settings > Public Key Policies
3. Trusted Root Certification Authorities
4. Import windows-ca.crt

BROWSER-SPECIFIC INSTALLATION:
=============================
Chrome/Edge:
- Uses Windows certificate store (install CA there)
- Or go to Settings > Privacy and Security > Security > Manage Certificates

Firefox:
- Settings > Privacy & Security > Certificates > View Certificates
- Authorities tab > Import > Select ca-cert.pem
- Check "Trust this CA to identify websites"

SERVER CONFIGURATION:
====================
Use these files for your HTTPS server:
- cert.pem: Server certificate
- key.pem: Private key (password: ${privateKeyPassword})
- ca-cert.pem: CA certificate (for chain)

DEVELOPMENT NOTES:
==================
- Certificate password: ${privateKeyPassword}
- All certificates valid for 365 days (server) / 10 years (CA)
- Server certificate covers: ${host}, localhost, 127.0.0.1
- Remove all certificates after development is complete

SECURITY WARNINGS:
==================
⚠️  FOR DEVELOPMENT ONLY - NEVER USE IN PRODUCTION
⚠️  Private keys are password protected
⚠️  Remove custom CA from all devices when done
⚠️  These certificates are not issued by a trusted CA
`;

    fs.writeFileSync(`${certDir}/CROSS_PLATFORM_INSTALLATION_GUIDE.txt`, crossPlatformInstructions);    console.log(`SSL certificates successfully generated in ${certDir}`);
    console.log('');
    console.log('🏢 CERTIFICATE AUTHORITY:');
    console.log('ca-cert.pem/.der: Root CA Certificate');
    console.log('ca-key.pem: CA Private Key (password protected)');
    console.log('');
    console.log('🖥️  SERVER CERTIFICATES (signed by CA):');
    console.log('cert.pem: Server SSL Certificate');
    console.log('key.pem: Server Private Key (password protected)');
    console.log('certificate.pfx: Server + CA Chain (PKCS12)');
    console.log('');
    console.log('📱 ANDROID CERTIFICATES:');
    console.log('android-cert.der: Server certificate (DER format)');
    console.log('android-keystore.p12: Complete Android keystore');
    console.log('android-cert-chain.pem: Full certificate chain');
    console.log('');
    console.log('🍎 iOS CERTIFICATES:');
    console.log('ios-ca.cer: CA certificate (iOS format)');
    console.log('ios-cert.cer: Server certificate (iOS format)');
    console.log('ios-keystore.p12: Complete iOS keystore');
    console.log('ios-cert-chain.pem: Full certificate chain');
    console.log('');
    console.log('🪟 WINDOWS CERTIFICATES:');
    console.log('windows-ca.crt: CA certificate (Windows format)');
    console.log('windows-cert.crt: Server certificate (Windows format)');
    console.log('windows-keystore.pfx: Complete Windows keystore');
    console.log('windows-cert-chain.pem: Full certificate chain');
    console.log('');
    console.log('📚 INSTALLATION GUIDES:');
    console.log('CROSS_PLATFORM_INSTALLATION_GUIDE.txt: Complete setup instructions');
    console.log('');
    console.log('🔐 SECURITY INFO:');
    console.log(`Certificate Password: ${privateKeyPassword}`);
    console.log('⚠️  FOR DEVELOPMENT ONLY - Remove certificates after testing');
    console.log('✅ Server certificate (cert.pem) is properly signed by CA!');
} catch (error) {
    console.error('Error generating SSL certificate:', error.message);
}
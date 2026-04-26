const dotenv = require('dotenv');
const { decrypt } = require('./src/utils/crypto');

dotenv.config();

console.log('=== Environment Variables Check ===');
console.log('ENCRYPTED_API_KEY:', process.env.ENCRYPTED_API_KEY ? 'SET' : 'NOT SET');
console.log('CRYPTO_SECRET:', process.env.CRYPTO_SECRET ? 'SET' : 'NOT SET');
console.log('API_KEY (RAW):', process.env.API_KEY ? 'SET' : 'NOT SET');

console.log('\n=== Decryption Test ===');
if (process.env.ENCRYPTED_API_KEY && process.env.CRYPTO_SECRET) {
  try {
    const decrypted = decrypt(process.env.ENCRYPTED_API_KEY, process.env.CRYPTO_SECRET);
    console.log('Decryption successful:', decrypted);
  } catch (error) {
    console.log('Decryption failed:', error.message);
  }
} else {
  console.log('Cannot test decryption - missing ENCRYPTED_API_KEY or CRYPTO_SECRET');
}

console.log('\n=== Config Module Test ===');
try {
  const config = require('./src/config/index.js');
  console.log('API_KEY from config:', config.API_KEY ? 'SET' : 'NOT SET');
  if (config.API_KEY) {
    console.log('API_KEY value:', config.API_KEY);
  }
} catch (error) {
  console.log('Config module error:', error.message);
}
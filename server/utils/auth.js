const fetch = require('node-fetch');
const { DOMParser } = require('xmldom');
const { CCTV } = require('../config/constants');

// Global auth token management
let authToken = null;
let tokenExpiry = 0;

async function authenticate() {
  // Return cached token if still valid
  if (authToken && Date.now() < tokenExpiry) {
    console.log('🔐 Using cached token');
    return authToken;
  }

  try {
    console.log('🔐 Authenticating with CCTV server...');
    
    const url = `${CCTV.baseUrl}/cgi-bin/authLogin.cgi`;
    const params = new URLSearchParams({
      user: CCTV.login,
      serviceKey: '1',
      pwd: CCTV.password
    });

    console.log(`🌐 Auth URL: ${url}?${params}`);
    
    const response = await fetch(`${url}?${params}`);
    const xmlText = await response.text();
    
    console.log(`📝 Auth response: ${xmlText.substring(0, 200)}...`);
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const authSidElements = xmlDoc.getElementsByTagName('authSid');
    
    if (authSidElements.length === 0) {
      console.error('❌ No authSid element found in XML response');
      throw new Error('Failed to extract auth token from response');
    }

    authToken = authSidElements[0].textContent;
    tokenExpiry = Date.now() + (50 * 60 * 1000); // 50 minutes
    
    console.log(`✅ Authentication successful! Token: ${authToken?.substring(0, 20)}...`);
    return authToken;
  } catch (error) {
    console.error('💥 Authentication failed:', error);
    throw error;
  }
}

module.exports = { authenticate };
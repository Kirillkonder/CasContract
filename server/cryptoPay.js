const axios = require('axios');

async function cryptoPayRequest(method, data = {}, demoMode = false) {
    try {
        const CRYPTO_PAY_API = demoMode ? 
            'https://testnet-pay.crypt.bot/api' : 
            'https://pay.crypt.bot/api';
            
        const CRYPTO_PAY_TOKEN = demoMode ?
            process.env.CRYPTO_PAY_TESTNET_TOKEN :
            process.env.CRYPTO_PAY_MAINNET_TOKEN;

        const response = await axios.post(`${CRYPTO_PAY_API}/${method}`, data, {
            headers: {
                'Crypto-Pay-API-Token': CRYPTO_PAY_TOKEN,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        return response.data;
    } catch (error) {
        console.error('Crypto Pay API error:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = { cryptoPayRequest };
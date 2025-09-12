const axios = require('axios');

// Функция для работы с Crypto Pay API
async function cryptoPayRequest(method, data = {}, demoMode = false) {
    try {
        const cryptoPayApi = demoMode ? 
            'https://testnet-pay.crypt.bot/api' : 
            'https://pay.crypt.bot/api';
            
        const cryptoPayToken = demoMode ?
            process.env.CRYPTO_PAY_TESTNET_TOKEN :
            process.env.CRYPTO_PAY_MAINNET_TOKEN;

        const response = await axios.post(`${cryptoPayApi}/${method}`, data, {
            headers: {
                'Crypto-Pay-API-Token': cryptoPayToken,
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
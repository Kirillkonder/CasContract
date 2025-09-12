const express = require('express');
const router = express.Router();
const { getCollections, cryptoPayRequest } = require('../server');

router.post('/create', async (req, res) => {
    const { telegramId } = req.body;
    const { users } = getCollections();

    try {
        let user = users.findOne({ telegram_id: parseInt(telegramId) });
        
        if (!user) {
            user = users.insert({
                telegram_id: parseInt(telegramId),
                main_balance: 0,
                demo_balance: 1000,
                created_at: new Date(),
                demo_mode: true
            });
        }

        res.json({
            telegram_id: user.telegram_id,
            main_balance: user.main_balance,
            demo_balance: user.demo_balance,
            demo_mode: user.demo_mode
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/balance/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);
    const { users } = getCollections();

    try {
        const user = users.findOne({ telegram_id: telegramId });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            main_balance: user.main_balance,
            demo_balance: user.demo_balance,
            demo_mode: user.demo_mode
        });
    } catch (error) {
        console.error('Get balance error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/toggle-demo/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);
    const { users } = getCollections();

    try {
        const user = users.findOne({ telegram_id: telegramId });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        users.update({
            ...user,
            demo_mode: !user.demo_mode
        });

        res.json({ 
            success: true, 
            demo_mode: !user.demo_mode 
        });
    } catch (error) {
        console.error('Toggle demo error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
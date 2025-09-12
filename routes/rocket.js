const express = require('express');
const router = express.Router();
const { 
    getCollections, 
    getRocketGame, 
    setRocketGame, 
    broadcastRocketUpdate,
    updateCasinoBank
} = require('../utils/db');

router.post('/bet', async (req, res) => {
    const { telegramId, betAmount, autoCashout, demoMode } = req.body;
    const { users, rocketBets } = getCollections();
    const rocketGame = getRocketGame();

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const balance = demoMode ? user.demo_balance : user.main_balance;
        if (balance < betAmount) {
            return res.json({ success: false, error: 'Insufficient balance' });
        }

        if (rocketGame.status !== 'waiting' && rocketGame.status !== 'counting') {
            return res.json({ success: false, error: 'Betting is closed' });
        }

        // Проверяем, не поставил ли уже пользователь
        const existingBet = rocketGame.players.find(p => 
            !p.isBot && p.userId === telegramId.toString()
        );

        if (existingBet) {
            return res.json({ success: false, error: 'You already placed a bet' });
        }

        // Обновляем баланс пользователя
        if (demoMode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance - betAmount
            });
        } else {
            users.update({
                ...user,
                main_balance: user.main_balance - betAmount
            });
            updateCasinoBank(betAmount);
        }

        // Добавляем игрока в игру
        rocketGame.players.push({
            userId: telegramId.toString(),
            name: user.name || `User${telegramId}`,
            betAmount: betAmount,
            autoCashout: autoCashout,
            isBot: false,
            demoMode: demoMode,
            cashedOut: false,
            cashoutMultiplier: 1.00,
            winAmount: 0
        });

        setRocketGame(rocketGame);
        broadcastRocketUpdate();

        res.json({ success: true, message: 'Bet placed successfully' });
    } catch (error) {
        console.error('Rocket bet error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/cashout', async (req, res) => {
    const { telegramId } = req.body;
    const { users } = getCollections();
    const rocketGame = getRocketGame();

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const player = rocketGame.players.find(p => 
            !p.isBot && p.userId === telegramId.toString() && !p.cashedOut
        );

        if (!player) {
            return res.json({ success: false, error: 'No active bet found' });
        }

        if (rocketGame.status !== 'flying') {
            return res.json({ success: false, error: 'Cannot cash out now' });
        }

        player.cashedOut = true;
        player.cashoutMultiplier = rocketGame.multiplier;
        player.winAmount = player.betAmount * rocketGame.multiplier;

        // Начисляем выигрыш
        if (player.demoMode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance + player.winAmount
            });
        } else {
            users.update({
                ...user,
                main_balance: user.main_balance + player.winAmount
            });
            updateCasinoBank(-player.winAmount);
        }

        setRocketGame(rocketGame);
        broadcastRocketUpdate();

        res.json({ 
            success: true, 
            multiplier: rocketGame.multiplier,
            winAmount: player.winAmount
        });
    } catch (error) {
        console.error('Rocket cashout error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/state', (req, res) => {
    const rocketGame = getRocketGame();
    res.json(rocketGame);
});

module.exports = router;
const express = require('express');
const router = express.Router();
const { getRocketBets, getUsers, getTransactions } = require('../config/database');
const { rocketGame } = require('../services/rocketGameService');
const { updateCasinoBank } = require('../services/casinoService');
const { validateTelegramId } = require('../utils/helpers');

// Сделать ставку в ракетке
router.post('/bet', (req, res) => {
    const { telegramId, betAmount, autoCashout, demoMode } = req.body;
    
    if (!validateTelegramId(telegramId)) {
        return res.status(400).json({ error: 'Invalid Telegram ID' });
    }

    if (rocketGame.status !== 'counting') {
        return res.status(400).json({ error: 'Betting is closed' });
    }

    const users = getUsers();
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const balanceField = demoMode ? 'demo_balance' : 'main_balance';
    
    if (user[balanceField] < betAmount) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Снимаем ставку
    users.update({
        ...user,
        [balanceField]: user[balanceField] - betAmount
    });

    // Обновляем банк казино если это реальная игра
    if (!demoMode) {
        updateCasinoBank(betAmount);
    }

    // Добавляем игрока в текущую игру
    rocketGame.players.push({
        userId: telegramId,
        name: `User_${telegramId}`,
        betAmount: parseFloat(betAmount),
        autoCashout: parseFloat(autoCashout),
        isBot: false,
        cashedOut: false,
        winAmount: 0,
        demoMode: demoMode
    });

    res.json({
        success: true,
        message: 'Bet placed successfully',
        currentBalance: user[balanceField] - betAmount
    });
});

// Забрать выигрыш в ракетке
router.post('/cashout', (req, res) => {
    const { telegramId } = req.body;
    
    if (rocketGame.status !== 'flying') {
        return res.status(400).json({ error: 'Game is not in flight' });
    }

    const player = rocketGame.players.find(p => p.userId === telegramId && !p.isBot);
    
    if (!player) {
        return res.status(404).json({ error: 'Player not found in current game' });
    }

    if (player.cashedOut) {
        return res.status(400).json({ error: 'Already cashed out' });
    }

    const users = getUsers();
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    player.cashedOut = true;
    player.cashoutMultiplier = rocketGame.multiplier;
    const winAmount = player.betAmount * rocketGame.multiplier;
    player.winAmount = winAmount;

    const balanceField = player.demoMode ? 'demo_balance' : 'main_balance';
    
    // Выплачиваем выигрыш
    users.update({
        ...user,
        [balanceField]: user[balanceField] + winAmount
    });

    // Обновляем банк казино если это реальная игра
    if (!player.demoMode) {
        updateCasinoBank(-winAmount);
    }

    // Записываем транзакцию
    const transactions = getTransactions();
    transactions.insert({
        user_id: user.$loki,
        amount: winAmount,
        type: 'rocket_win',
        status: 'completed',
        demo_mode: player.demoMode,
        created_at: new Date()
    });

    res.json({
        success: true,
        winAmount,
        multiplier: rocketGame.multiplier,
        newBalance: user[balanceField] + winAmount
    });
});

// Получить текущее состояние игры
router.get('/status', (req, res) => {
    res.json({
        status: rocketGame.status,
        multiplier: rocketGame.multiplier,
        players: rocketGame.players.filter(p => !p.isBot),
        history: rocketGame.history.slice(0, 10)
    });
});

module.exports = router;
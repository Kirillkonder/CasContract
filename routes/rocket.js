const express = require('express');
const router = express.Router();
const { 
    getCollections, 
    getRocketGame, 
    setRocketGame, 
    broadcastRocketUpdate 
} = require('../utils/db');

router.post('/place-bet', async (req, res) => {
    const { telegramId, betAmount, demoMode } = req.body;
    const { users, transactions } = getCollections();
    const rocketGame = getRocketGame();

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (rocketGame.status !== 'counting') {
            return res.json({ success: false, error: 'Betting period closed' });
        }

        const balanceField = demoMode ? 'demo_balance' : 'main_balance';
        if (user[balanceField] < betAmount) {
            return res.json({ success: false, error: 'Insufficient balance' });
        }

        // Обновляем баланс
        users.update({
            ...user,
            [balanceField]: user[balanceField] - betAmount
        });

        // Добавляем игрока в текущую игру
        const existingPlayerIndex = rocketGame.players.findIndex(p => 
            p.userId === telegramId && p.demoMode === demoMode
        );

        if (existingPlayerIndex !== -1) {
            rocketGame.players[existingPlayerIndex].betAmount += betAmount;
        } else {
            rocketGame.players.push({
                userId: telegramId,
                name: `User_${telegramId}`,
                betAmount: betAmount,
                demoMode: demoMode,
                cashedOut: false,
                cashoutMultiplier: null,
                winAmount: 0
            });
        }

        setRocketGame(rocketGame);
        broadcastRocketUpdate();

        // Создаем транзакцию ставки
        transactions.insert({
            user_id: user.$loki,
            amount: -betAmount,
            type: 'rocket_bet',
            status: 'completed',
            demo_mode: demoMode,
            created_at: new Date()
        });

        res.json({
            success: true,
            current_balance: user[balanceField] - betAmount
        });
    } catch (error) {
        console.error('Place bet error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/cashout', async (req, res) => {
    const { telegramId, demoMode } = req.body;
    const { users, transactions } = getCollections();
    const rocketGame = getRocketGame();

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (rocketGame.status !== 'flying') {
            return res.json({ success: false, error: 'Cannot cashout now' });
        }

        const player = rocketGame.players.find(p => 
            p.userId === telegramId && p.demoMode === demoMode && !p.cashedOut
        );

        if (!player) {
            return res.json({ success: false, error: 'No active bet found' });
        }

        player.cashedOut = true;
        player.cashoutMultiplier = rocketGame.multiplier;
        player.winAmount = player.betAmount * rocketGame.multiplier;

        const balanceField = demoMode ? 'demo_balance' : 'main_balance';
        
        // Обновляем баланс
        users.update({
            ...user,
            [balanceField]: user[balanceField] + player.winAmount
        });

        setRocketGame(rocketGame);
        broadcastRocketUpdate();

        // Создаем транзакцию выигрыша
        transactions.insert({
            user_id: user.$loki,
            amount: player.winAmount,
            type: 'rocket_win',
            status: 'completed',
            demo_mode: demoMode,
            created_at: new Date()
        });

        res.json({
            success: true,
            multiplier: rocketGame.multiplier,
            win_amount: player.winAmount,
            current_balance: user[balanceField] + player.winAmount
        });
    } catch (error) {
        console.error('Cashout error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/game-state', async (req, res) => {
    const rocketGame = getRocketGame();
    res.json(rocketGame);
});

router.get('/history', async (req, res) => {
    const { rocketGames } = getCollections();
    const history = rocketGames.chain().simplesort('created_at', true).limit(20).data();
    res.json(history);
});

module.exports = router;
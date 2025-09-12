const express = require('express');
const router = express.Router();
const { getCollections, calculateMultiplier } = require('../server');

router.post('/start-game', async (req, res) => {
    const { telegramId, betAmount, minesCount, demoMode } = req.body;
    const { users, minesGames, transactions, updateCasinoBank } = getCollections();

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
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

        if (!demoMode) {
            updateCasinoBank(betAmount);
        }

        // Создаем игру
        const gameId = minesGames.insert({
            user_id: user.$loki,
            bet_amount: betAmount,
            mines_count: minesCount,
            opened_cells: 0,
            multiplier: 1.00,
            status: 'active',
            demo_mode: demoMode,
            created_at: new Date()
        });

        // Создаем транзакцию
        transactions.insert({
            user_id: user.$loki,
            amount: -betAmount,
            type: 'mines_bet',
            status: 'completed',
            demo_mode: demoMode,
            game_id: gameId.$loki,
            created_at: new Date()
        });

        // Генерируем поле с минами
        const totalCells = 25;
        const minePositions = [];
        while (minePositions.length < minesCount) {
            const pos = Math.floor(Math.random() * totalCells);
            if (!minePositions.includes(pos)) {
                minePositions.push(pos);
            }
        }

        res.json({
            success: true,
            game_id: gameId.$loki,
            mine_positions: minePositions,
            current_balance: user[balanceField] - betAmount
        });
    } catch (error) {
        console.error('Start mines game error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/open-cell', async (req, res) => {
    const { telegramId, gameId, cellIndex, minePositions } = req.body;
    const { users, minesGames, transactions, updateCasinoBank } = getCollections();

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        const game = minesGames.get(gameId);

        if (!user || !game) {
            return res.status(404).json({ error: 'Game or user not found' });
        }

        if (game.status !== 'active') {
            return res.json({ success: false, error: 'Game not active' });
        }

        const isMine = minePositions.includes(cellIndex);
        let newMultiplier = 1.00;

        if (isMine) {
            // Игрок наступил на мину
            minesGames.update({
                ...game,
                status: 'lost',
                multiplier: 0,
                opened_cells: game.opened_cells + 1,
                ended_at: new Date()
            });

            res.json({
                success: false,
                is_mine: true,
                multiplier: 0,
                win_amount: 0,
                current_balance: user[demoMode ? 'demo_balance' : 'main_balance']
            });
        } else {
            // Игрок открыл безопасную клетку
            const openedCells = game.opened_cells + 1;
            newMultiplier = calculateMultiplier(openedCells, game.mines_count);

            minesGames.update({
                ...game,
                opened_cells: openedCells,
                multiplier: newMultiplier
            });

            res.json({
                success: true,
                is_mine: false,
                multiplier: newMultiplier,
                win_amount: game.bet_amount * newMultiplier,
                current_balance: user[demoMode ? 'demo_balance' : 'main_balance']
            });
        }
    } catch (error) {
        console.error('Open cell error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/cashout', async (req, res) => {
    const { telegramId, gameId } = req.body;
    const { users, minesGames, transactions, updateCasinoBank } = getCollections();

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        const game = minesGames.get(gameId);

        if (!user || !game) {
            return res.status(404).json({ error: 'Game or user not found' });
        }

        if (game.status !== 'active') {
            return res.json({ success: false, error: 'Game not active' });
        }

        const winAmount = game.bet_amount * game.multiplier;
        const balanceField = game.demo_mode ? 'demo_balance' : 'main_balance';

        // Обновляем баланс
        users.update({
            ...user,
            [balanceField]: user[balanceField] + winAmount
        });

        if (!game.demo_mode) {
            updateCasinoBank(-winAmount);
        }

        // Обновляем игру
        minesGames.update({
            ...game,
            status: 'won',
            win_amount: winAmount,
            ended_at: new Date()
        });

        // Создаем транзакцию выигрыша
        transactions.insert({
            user_id: user.$loki,
            amount: winAmount,
            type: 'mines_win',
            status: 'completed',
            demo_mode: game.demo_mode,
            game_id: gameId,
            created_at: new Date()
        });

        res.json({
            success: true,
            win_amount: winAmount,
            multiplier: game.multiplier,
            current_balance: user[balanceField] + winAmount
        });
    } catch (error) {
        console.error('Cashout error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
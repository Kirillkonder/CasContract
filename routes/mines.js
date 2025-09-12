const express = require('express');
const router = express.Router();
const { getCollections, calculateMultiplier, generateMinesGame } = require('../utils/db');

// Начать игру Mines
router.post('/start', async (req, res) => {
    const { telegramId, betAmount, minesCount, demoMode } = req.body;
    const { users, minesGames, transactions, updateCasinoBank } = getCollections();

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const balance = demoMode ? user.demo_balance : user.main_balance;
        
        if (balance < betAmount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        // Создаем игру
        const game = minesGames.insert({
            user_id: user.$loki,
            bet_amount: betAmount,
            mines_count: minesCount,
            revealed_cells: [],
            game_over: false,
            win: false,
            current_multiplier: 1,
            demo_mode: demoMode,
            created_at: new Date()
        });

        // Списываем ставку
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

        // Генерируем мины
        const mines = [];
        while (mines.length < minesCount) {
            const randomCell = Math.floor(Math.random() * 25);
            if (!mines.includes(randomCell)) {
                mines.push(randomCell);
            }
        }

        minesGames.update({
            ...game,
            mines: mines
        });

        res.json({
            success: true,
            game_id: game.$loki,
            mines: mines,
            new_balance: demoMode ? user.demo_balance - betAmount : user.main_balance - betAmount
        });
    } catch (error) {
        console.error('Mines start error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Открыть ячейку в Mines
router.post('/open', async (req, res) => {
    const { gameId, cellIndex, telegramId } = req.body;
    const { minesGames, users } = getCollections();

    try {
        const game = minesGames.get(gameId);
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        
        if (!game || !user) {
            return res.status(404).json({ error: 'Game or user not found' });
        }

        if (game.game_over) {
            return res.status(400).json({ error: 'Game already finished' });
        }

        // Проверяем, попал ли на мину
        if (game.mines.includes(cellIndex)) {
            minesGames.update({
                ...game,
                game_over: true,
                win: false
            });

            res.json({
                success: true,
                game_over: true,
                win: false,
                mine_hit: true,
                multiplier: 0
            });
        } else {
            // Добавляем открытую ячейку
            const revealedCells = [...game.revealed_cells, cellIndex];
            const multiplier = calculateMultiplier(revealedCells.length, game.mines_count);

            minesGames.update({
                ...game,
                revealed_cells: revealedCells,
                current_multiplier: multiplier
            });

            res.json({
                success: true,
                game_over: false,
                mine_hit: false,
                multiplier: multiplier,
                revealed_cells: revealedCells
            });
        }
    } catch (error) {
        console.error('Mines open error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Забрать выигрыш в Mines
router.post('/cashout', async (req, res) => {
    const { gameId, telegramId } = req.body;
    const { minesGames, users, transactions, updateCasinoBank } = getCollections();

    try {
        const game = minesGames.get(gameId);
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        
        if (!game || !user) {
            return res.status(404).json({ error: 'Game or user not found' });
        }

        if (game.game_over) {
            return res.status(400).json({ error: 'Game already finished' });
        }

        const winAmount = game.bet_amount * game.current_multiplier;

        // Завершаем игру
        minesGames.update({
            ...game,
            game_over: true,
            win: true,
            win_amount: winAmount
        });

        // Начисляем выигрыш
        if (game.demo_mode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance + winAmount
            });
        } else {
            users.update({
                ...user,
                main_balance: user.main_balance + winAmount
            });
            updateCasinoBank(-winAmount);
        }

        // Записываем транзакцию
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
            multiplier: game.current_multiplier,
            new_balance: game.demo_mode ? user.demo_balance + winAmount : user.main_balance + winAmount
        });
    } catch (error) {
        console.error('Mines cashout error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
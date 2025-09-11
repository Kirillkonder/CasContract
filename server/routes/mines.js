const express = require('express');
const router = express.Router();
const { getUsers, getMinesGames } = require('../database');
const { generateMinesGame, calculateMultiplier } = require('../minesGame');

router.post('/start', async (req, res) => {
    const { telegramId, betAmount, minesCount, demoMode } = req.body;

    if (!betAmount || betAmount < 1 || !minesCount || minesCount < 3 || minesCount > 7) {
        return res.status(400).json({ error: 'Неверные параметры игры' });
    }

    try {
        const users = getUsers();
        const minesGames = getMinesGames();
        
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const currentBalance = demoMode ? user.demo_balance : user.main_balance;
        if (currentBalance < betAmount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

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
        }

        const game = generateMinesGame(minesCount);
        game.betAmount = betAmount;
        game.demoMode = demoMode;

        const gameRecord = minesGames.insert({
            user_id: user.$loki,
            bet_amount: betAmount,
            mines_count: minesCount,
            mines: game.mines,
            revealed_cells: [],
            game_over: false,
            win: false,
            multiplier: 1,
            demo_mode: demoMode,
            created_at: new Date()
        });

        const currentBalanceAfterBet = demoMode ? user.demo_balance - betAmount : user.main_balance - betAmount;

        res.json({
            success: true,
            game_id: gameRecord.$loki,
            mines_count: minesCount,
            bet_amount: betAmount,
            current_balance: currentBalanceAfterBet,
            game: game
        });
    } catch (error) {
        console.error('Mines start error:', error);
        res.status(500).json({ error: 'Ошибка при запуске игры' });
    }
});

router.post('/reveal', async (req, res) => {
    const { gameId, cellIndex, telegramId } = req.body;

    try {
        const users = getUsers();
        const minesGames = getMinesGames();
        
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const gameRecord = minesGames.get(parseInt(gameId));
        if (!gameRecord || gameRecord.user_id !== user.$loki) {
            return res.status(404).json({ error: 'Игра не найдена' });
        }

        if (gameRecord.game_over) {
            return res.status(400).json({ error: 'Игра уже завершена' });
        }

        if (gameRecord.revealed_cells.includes(cellIndex)) {
            return res.status(400).json({ error: 'Ячейка уже открыта' });
        }

        const isMine = gameRecord.mines.includes(cellIndex);
        const revealedCells = [...gameRecord.revealed_cells, cellIndex];
        const openedCellsCount = revealedCells.length;

        let gameOver = isMine;
        let win = false;
        let multiplier = calculateMultiplier(openedCellsCount, gameRecord.mines_count);

        if (isMine) {
            gameOver = true;
            multiplier = 1;
        } else if (openedCellsCount === (25 - gameRecord.mines_count)) {
            gameOver = true;
            win = true;
            multiplier = calculateMultiplier(openedCellsCount, gameRecord.mines_count);
        }

        minesGames.update({
            ...gameRecord,
            revealed_cells: revealedCells,
            game_over: gameOver,
            win: win,
            multiplier: multiplier
        });

        const response = {
            success: true,
            is_mine: isMine,
            revealed_cells: revealedCells,
            game_over: gameOver,
            win: win,
            current_multiplier: multiplier,
            opened_cells_count: openedCellsCount
        };

        if (gameOver && win) {
            const winAmount = gameRecord.bet_amount * multiplier;
            const currentBalance = gameRecord.demo_mode ? user.demo_balance : user.main_balance;
            
            if (gameRecord.demo_mode) {
                users.update({
                    ...user,
                    demo_balance: currentBalance + winAmount
                });
            } else {
                users.update({
                    ...user,
                    main_balance: currentBalance + winAmount
                });
            }

            response.win_amount = winAmount;
            response.new_balance = currentBalance + winAmount;
        }

        res.json(response);
    } catch (error) {
        console.error('Mines reveal error:', error);
        res.status(500).json({ error: 'Ошибка при открытии ячейки' });
    }
});

router.post('/cashout', async (req, res) => {
    const { gameId, telegramId } = req.body;

    try {
        const users = getUsers();
        const minesGames = getMinesGames();
        
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const gameRecord = minesGames.get(parseInt(gameId));
        if (!gameRecord || gameRecord.user_id !== user.$loki) {
            return res.status(404).json({ error: 'Игра не найдена' });
        }

        if (gameRecord.game_over) {
            return res.status(400).json({ error: 'Игра уже завершена' });
        }

        const openedCellsCount = gameRecord.revealed_cells.length;
        const multiplier = calculateMultiplier(openedCellsCount, gameRecord.mines_count);
        const winAmount = gameRecord.bet_amount * multiplier;

        minesGames.update({
            ...gameRecord,
            game_over: true,
            win: true,
            multiplier: multiplier
        });

        const currentBalance = gameRecord.demo_mode ? user.demo_balance : user.main_balance;
        
        if (gameRecord.demo_mode) {
            users.update({
                ...user,
                demo_balance: currentBalance + winAmount
            });
        } else {
            users.update({
                ...user,
                main_balance: currentBalance + winAmount
            });
        }

        res.json({
            success: true,
            win_amount: winAmount,
            multiplier: multiplier,
            opened_cells: openedCellsCount,
            new_balance: currentBalance + winAmount
        });
    } catch (error) {
        console.error('Mines cashout error:', error);
        res.status(500).json({ error: 'Ошибка при выводе средств' });
    }
});

module.exports = router;
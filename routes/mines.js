const express = require('express');
const router = express.Router();
const { getUsers, getMinesGames, getCasinoBank, updateCasinoBank } = require('../config/database');
const { generateMinesGame, calculateMultiplier } = require('../services/minesGame');

// API: Начать новую игру в Mines
router.post('/start-game', async (req, res) => {
    const { telegramId, betAmount, minesCount, demoMode } = req.body;

    if (!betAmount || betAmount < 1) {
        return res.status(400).json({ error: 'Минимальная ставка: 1 TON' });
    }

    if (![3, 5, 7].includes(minesCount)) {
        return res.status(400).json({ error: 'Допустимое количество мин: 3, 5 или 7' });
    }

    try {
        const users = getUsers();
        const minesGames = getMinesGames();
        
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const currentBalance = demoMode ? user.demo_balance : user.main_balance;
        
        if (currentBalance < betAmount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

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
        }

        // Создаем новую игру
        const game = generateMinesGame(minesCount);
        game.betAmount = betAmount;
        game.userId = user.$loki;
        game.telegramId = telegramId;
        game.demoMode = demoMode;
        game.createdAt = new Date();

        const savedGame = minesGames.insert(game);

        res.json({
            success: true,
            game_id: savedGame.$loki,
            balance: demoMode ? user.demo_balance - betAmount : user.main_balance - betAmount,
            mines_count: minesCount,
            bet_amount: betAmount
        });
    } catch (error) {
        console.error('Start mines game error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Открыть клетку в Mines
router.post('/open-cell', async (req, res) => {
    const { telegramId, gameId, cellIndex } = req.body;

    try {
        const users = getUsers();
        const minesGames = getMinesGames();
        
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const game = minesGames.get(gameId);
        if (!game || game.telegramId !== telegramId) {
            return res.status(404).json({ error: 'Game not found' });
        }

        if (game.gameOver) {
            return res.status(400).json({ error: 'Game already finished' });
        }

        if (game.revealedCells.includes(cellIndex) || game.revealedCells.includes(parseInt(cellIndex))) {
            return res.status(400).json({ error: 'Cell already revealed' });
        }

        // Проверяем, есть ли мина в клетке
        const isMine = game.mines.includes(cellIndex) || game.mines.includes(parseInt(cellIndex));

        if (isMine) {
            // Игрок проиграл
            minesGames.update({
                ...game,
                gameOver: true,
                win: false,
                revealedCells: [...game.revealedCells, cellIndex]
            });

            // В реальном режиме добавляем выигрыш в банк казино
            if (!game.demoMode) {
                updateCasinoBank(game.betAmount);
            }

            res.json({
                success: true,
                game_over: true,
                win: false,
                mine_hit: true,
                cell_index: cellIndex,
                multiplier: game.currentMultiplier,
                total_win: 0,
                new_balance: game.demoMode ? user.demo_balance : user.main_balance
            });
        } else {
            // Игрок открыл безопасную клетку
            const newRevealedCells = [...game.revealedCells, cellIndex];
            const multiplier = calculateMultiplier(newRevealedCells.length, game.minesCount);

            minesGames.update({
                ...game,
                revealedCells: newRevealedCells,
                currentMultiplier: multiplier
            });

            res.json({
                success: true,
                game_over: false,
                win: false,
                mine_hit: false,
                cell_index: cellIndex,
                multiplier: multiplier,
                revealed_cells: newRevealedCells.length,
                potential_win: game.betAmount * multiplier
            });
        }
    } catch (error) {
        console.error('Open cell error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Забрать выигрыш
router.post('/cashout', async (req, res) => {
    const { telegramId, gameId } = req.body;

    try {
        const users = getUsers();
        const minesGames = getMinesGames();
        const transactions = getTransactions();
        
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const game = minesGames.get(gameId);
        if (!game || game.telegramId !== telegramId) {
            return res.status(404).json({ error: 'Game not found' });
        }

        if (game.gameOver) {
            return res.status(400).json({ error: 'Game already finished' });
        }

        const winAmount = game.betAmount * game.currentMultiplier;
        const casinoFee = !game.demoMode ? winAmount * 0.05 : 0;
        const userWinAmount = !game.demoMode ? winAmount - casinoFee : winAmount;

        // Обновляем баланс пользователя
        if (game.demoMode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance + userWinAmount
            });
        } else {
            users.update({
                ...user,
                main_balance: user.main_balance + userWinAmount
            });

            // Добавляем комиссию в банк казино
            updateCasinoBank(casinoFee);
        }

        // Завершаем игру
        minesGames.update({
            ...game,
            gameOver: true,
            win: true,
            winAmount: userWinAmount,
            casinoFee: casinoFee,
            totalMultiplier: game.currentMultiplier
        });

        // Записываем транзакцию выигрыша
        transactions.insert({
            user_id: user.$loki,
            amount: userWinAmount,
            type: 'mines_win',
            status: 'completed',
            demo_mode: game.demoMode,
            game_id: gameId,
            created_at: new Date()
        });

        res.json({
            success: true,
            win: true,
            win_amount: userWinAmount,
            multiplier: game.currentMultiplier,
            casino_fee: casinoFee,
            new_balance: game.demoMode ? 
                user.demo_balance + userWinAmount : 
                user.main_balance + userWinAmount
        });
    } catch (error) {
        console.error('Cashout error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Получить историю игр
router.get('/history/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);

    try {
        const users = getUsers();
        const minesGames = getMinesGames();
        
        const user = users.findOne({ telegram_id: telegramId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const games = minesGames.chain()
            .find({ telegramId: telegramId })
            .simplesort('createdAt', true)
            .limit(20)
            .data();

        res.json({
            success: true,
            games: games.map(game => ({
                id: game.$loki,
                bet_amount: game.betAmount,
                win_amount: game.winAmount || 0,
                multiplier: game.totalMultiplier || game.currentMultiplier,
                mines_count: game.minesCount,
                win: game.win,
                game_over: game.gameOver,
                demo_mode: game.demoMode,
                created_at: game.createdAt
            }))
        });
    } catch (error) {
        console.error('Mines history error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
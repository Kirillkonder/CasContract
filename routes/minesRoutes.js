const express = require('express');
const router = express.Router();
const { getMinesGames, getUsers, getTransactions } = require('../config/database');
const { generateMinesGame, calculateMultiplier } = require('../services/minesGameService');
const { updateCasinoBank } = require('../services/casinoService');
const { validateTelegramId } = require('../utils/helpers');

// Начать новую игру в мины
router.post('/start', (req, res) => {
    const { telegramId, betAmount, minesCount, demoMode } = req.body;
    
    if (!validateTelegramId(telegramId)) {
        return res.status(400).json({ error: 'Invalid Telegram ID' });
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

    // Создаем игру
    const game = generateMinesGame(minesCount);
    game.betAmount = betAmount;
    game.userId = user.$loki;
    game.demoMode = demoMode;

    const minesGames = getMinesGames();
    const gameRecord = minesGames.insert({
        ...game,
        created_at: new Date(),
        status: 'active'
    });

    res.json({
        success: true,
        gameId: gameRecord.$loki,
        game: {
            minesCount: game.minesCount,
            revealedCells: game.revealedCells,
            currentMultiplier: 1.00
        }
    });
});

// Открыть ячейку
router.post('/reveal', (req, res) => {
    const { gameId, cellIndex, telegramId } = req.body;
    
    const minesGames = getMinesGames();
    const users = getUsers();
    const transactions = getTransactions();
    
    const game = minesGames.get(gameId);
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!game || !user) {
        return res.status(404).json({ error: 'Game or user not found' });
    }

    if (game.gameOver) {
        return res.status(400).json({ error: 'Game is already over' });
    }

    if (game.revealedCells.includes(cellIndex)) {
        return res.status(400).json({ error: 'Cell already revealed' });
    }

    // Проверяем, есть ли мина
    if (game.mines.includes(cellIndex)) {
        game.gameOver = true;
        game.win = false;
        
        minesGames.update(game);
        
        return res.json({
            success: true,
            gameOver: true,
            win: false,
            mineHit: true,
            finalMultiplier: calculateMultiplier(game.revealedCells.length, game.minesCount),
            lostAmount: game.betAmount
        });
    }

    // Открываем ячейку
    game.revealedCells.push(cellIndex);
    
    // Рассчитываем текущий множитель
    const currentMultiplier = calculateMultiplier(game.revealedCells.length, game.minesCount);
    game.currentMultiplier = currentMultiplier;

    minesGames.update(game);

    res.json({
        success: true,
        revealedCell: cellIndex,
        currentMultiplier,
        gameOver: false,
        win: false
    });
});

// Забрать выигрыш
router.post('/cashout', (req, res) => {
    const { gameId, telegramId } = req.body;
    
    const minesGames = getMinesGames();
    const users = getUsers();
    const transactions = getTransactions();
    
    const game = minesGames.get(gameId);
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!game || !user) {
        return res.status(404).json({ error: 'Game or user not found' });
    }

    if (game.gameOver) {
        return res.status(400).json({ error: 'Game is already over' });
    }

    const winAmount = game.betAmount * game.currentMultiplier;
    const balanceField = game.demoMode ? 'demo_balance' : 'main_balance';
    
    // Выплачиваем выигрыш
    users.update({
        ...user,
        [balanceField]: user[balanceField] + winAmount
    });

    // Обновляем банк казино если это реальная игра
    if (!game.demoMode) {
        updateCasinoBank(-winAmount);
    }

    // Записываем транзакцию
    transactions.insert({
        user_id: user.$loki,
        amount: winAmount,
        type: 'mines_win',
        status: 'completed',
        demo_mode: game.demoMode,
        game_id: gameId,
        created_at: new Date()
    });

    // Обновляем игру
    game.gameOver = true;
    game.win = true;
    game.winAmount = winAmount;
    minesGames.update(game);

    res.json({
        success: true,
        winAmount,
        finalMultiplier: game.currentMultiplier,
        newBalance: user[balanceField] + winAmount
    });
});

module.exports = router;
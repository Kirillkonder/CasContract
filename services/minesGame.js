// 🔥 ФУНКЦИЯ МНОЖИТЕЛЕЙ КАК В 1WIN
function calculateMultiplier(openedCells, displayedMines) {
    // Множители для разных количеств мин (как в 1win)
    const multipliers = {
        3: [1.00, 1.07, 1.14, 1.23, 1.33, 1.45, 1.59, 1.75, 1.95, 2.18, 2.47, 2.83, 3.28, 3.86, 4.62, 5.63, 7.00, 8.92, 11.67, 15.83, 22.50, 34.00, 56.67, 113.33],
        5: [1.00, 1.11, 1.22, 1.35, 1.50, 1.67, 1.88, 2.14, 2.45, 2.86, 3.38, 4.05, 4.95, 6.15, 7.83, 10.21, 13.68, 18.91, 27.14, 40.71, 65.14, 113.99, 227.98, 569.95],
        7: [1.00, 1.20, 1.40, 1.64, 1.92, 2.26, 2.67, 3.17, 3.80, 4.60, 5.63, 6.98, 8.75, 11.11, 14.29, 18.75, 25.00, 34.00, 47.50, 68.00, 100.00, 152.00, 240.00, 400.00]
    };

    const mineMultipliers = multipliers[displayedMines];
    
    if (mineMultipliers && openedCells < mineMultipliers.length) {
        return mineMultipliers[openedCells];
    }
    
    // Если открыли все клетки - максимальный множитель ×2
    return mineMultipliers ? mineMultipliers[mineMultipliers.length - 1] * 2 : 1.00;
}

// Mines Game Functions
function generateMinesGame(minesCount) {
    const totalCells = 25;
    const mines = [];
    
    // Генерируем мины
    while (mines.length < minesCount) {
        const randomCell = Math.floor(Math.random() * totalCells);
        if (!mines.includes(randomCell)) {
            mines.push(randomCell);
        }
    }
    
    return {
        mines,
        minesCount,
        revealedCells: [],
        gameOver: false,
        win: false,
        currentMultiplier: 1,
        betAmount: 0
    };
}

module.exports = {
    calculateMultiplier,
    generateMinesGame
};
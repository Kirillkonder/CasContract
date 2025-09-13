let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let rocketPosition = 50;
let countdownInterval = null;
let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    endBetTime: 0
};

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    initializeGame();
    connectWebSocket();
});

function goBack() {
    window.location.href = 'index.html';
}

function initializeGame() {
    const tg = window.Telegram.WebApp;
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        currentUser = {
            id: tg.initDataUnsafe.user.id,
            username: tg.initDataUnsafe.user.username || `User_${tg.initDataUnsafe.user.id}`,
            firstName: tg.initDataUnsafe.user.first_name,
            lastName: tg.initDataUnsafe.user.last_name
        };
        loadUserData();
    } else {
        // Режим разработки без Telegram
        currentUser = {
            id: 123456789,
            username: 'TestUser',
            firstName: 'Test',
            lastName: 'User'
        };
        document.getElementById('balance').textContent = '100.00';
        isDemoMode = true;
    }
}

async function loadUserData() {
    try {
        const response = await fetch(`/api/user/balance/${currentUser.id}`);
        if (response.ok) {
            const userData = await response.json();
            const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
            document.getElementById('balance').textContent = balance.toFixed(2);
            isDemoMode = userData.demo_mode;
            document.getElementById('demo-badge').textContent = isDemoMode ? 'TESTNET' : 'MAINNET';
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        // Заглушка для разработки
        document.getElementById('balance').textContent = '100.00';
        document.getElementById('demo-badge').textContent = 'TESTNET';
        isDemoMode = true;
    }
}

function connectWebSocket() {
    // Эмуляция WebSocket для демонстрации
    console.log('WebSocket connection simulated');
    
    // Имитация игрового процесса для демонстрации
    simulateGame();
}

function simulateGame() {
    // Демо-режим для отображения функционала
    setTimeout(() => {
        updateGameState({
            status: 'counting',
            multiplier: 1.00,
            endBetTime: Date.now() + 5000,
            players: [],
            history: [{multiplier: 2.5}, {multiplier: 1.25}, {multiplier: 5.8}]
        });
    }, 2000);
    
    setTimeout(() => {
        updateGameState({
            status: 'flying',
            multiplier: 1.00,
            players: [
                {userId: currentUser.id, name: currentUser.username, betAmount: 1.0, cashedOut: false, isBot: false}
            ],
            history: [{multiplier: 2.5}, {multiplier: 1.25}, {multiplier: 5.8}]
        });
        
        // Анимация полета ракеты
        let multiplier = 1.0;
        const flightInterval = setInterval(() => {
            multiplier += 0.05;
            updateGameState({
                status: 'flying',
                multiplier: multiplier,
                players: [
                    {userId: currentUser.id, name: currentUser.username, betAmount: 1.0, cashedOut: false, isBot: false, winAmount: multiplier * 1.0}
                ],
                history: [{multiplier: 2.5}, {multiplier: 1.25}, {multiplier: 5.8}]
            });
            
            if (multiplier >= 3.0) {
                document.getElementById('rocket').style.transform = 'translateX(-50%) rotate(25deg)';
            }
            
            if (multiplier >= 5.0) {
                document.getElementById('rocket').style.transform = 'translateX(-50%) rotate(50deg)';
                document.getElementById('rocket').classList.add('pulsating');
            }
            
            if (multiplier > 6.0) {
                clearInterval(flightInterval);
                updateGameState({
                    status: 'crashed',
                    multiplier: multiplier,
                    crashPoint: multiplier,
                    players: [
                        {userId: currentUser.id, name: currentUser.username, betAmount: 1.0, cashedOut: false, isBot: false}
                    ],
                    history: [{multiplier: multiplier}, {multiplier: 2.5}, {multiplier: 1.25}, {multiplier: 5.8}]
                });
                
                setTimeout(() => {
                    updateGameState({
                        status: 'waiting',
                        multiplier: 1.00,
                        players: [],
                        history: [{multiplier: multiplier}, {multiplier: 2.5}, {multiplier: 1.25}]
                    });
                    resetRocket();
                }, 3000);
            }
        }, 100);
    }, 7000);
}

function resetRocket() {
    document.getElementById('rocket').style.transform = 'translateX(-50%) rotate(0deg)';
    document.getElementById('rocket').classList.remove('pulsating');
    document.getElementById('rocket').style.bottom = '50px';
    document.getElementById('rocketTrail').style.height = '0px';
}

function updateGameState(gameState) {
    // Обновляем глобальную переменную игры
    rocketGame = gameState;
    
    // Обновляем статус игры
    const statusElement = document.getElementById('statusText');
    const countdownElement = document.getElementById('countdown');
    const statusClass = `status-${gameState.status}`;
    
    document.getElementById('gameStatus').className = `game-status ${statusClass}`;
    
    // Управление оверлеем обратного отсчета
    const countdownOverlay = document.getElementById('countdownOverlay');
    
    switch(gameState.status) {
        case 'waiting':
            statusElement.textContent = 'Ожидание начала игры...';
            countdownElement.textContent = '';
            clearCountdown();
            resetBettingUI();
            countdownOverlay.classList.remove('visible');
            break;
            
        case 'counting':
            statusElement.textContent = 'Прием ставок: ';
            startCountdown(gameState.endBetTime);
            updateBettingUI();
            
            // Показываем оверлей с обратным отсчетом
            countdownOverlay.classList.add('visible');
            break;
            
        case 'flying':
            statusElement.textContent = 'Ракета взлетает!';
            countdownElement.textContent = '';
            clearCountdown();
            updateRocketPosition(gameState.multiplier);
            
            // Скрываем оверлей с обратным отсчетом
            countdownOverlay.classList.remove('visible');
            break;
            
        case 'crashed':
            statusElement.textContent = `Ракета взорвалась на ${gameState.crashPoint.toFixed(2)}x!`;
            countdownElement.textContent = '';
            clearCountdown();
            showExplosion();
            countdownOverlay.classList.remove('visible');
            break;
    }
    
    // Обновляем множитель
    document.getElementById('multiplierDisplay').textContent = gameState.multiplier.toFixed(2) + 'x';
    
    // Находим нашего игрока
    if (gameState.players && gameState.players.length > 0) {
        userPlayer = gameState.players.find(p => p.userId == currentUser.id && !p.isBot);
    } else {
        userPlayer = null;
    }
    
    if (userPlayer) {
        userBet = userPlayer.betAmount;
        userCashedOut = userPlayer.cashedOut;
        document.getElementById('userBet').textContent = userBet.toFixed(2);
        
        if (userCashedOut) {
            document.getElementById('potentialWin').textContent = userPlayer.winAmount.toFixed(2);
        }
    }
    
    // Обновляем список игроков
    if (gameState.players) {
        updatePlayersList(gameState.players);
    }
    
    // Обновляем историю
    if (gameState.history) {
        updateHistory(gameState.history);
    }
    
    // Обновляем потенциальный выигрыш
    if (userBet > 0 && !userCashedOut && gameState.status === 'flying') {
        const potentialWin = userBet * gameState.multiplier;
        document.getElementById('potentialWin').textContent = potentialWin.toFixed(2);
    }
    
    updateBettingUI();
}

function startCountdown(endTime) {
    clearCountdown();
    
    function updateCountdown() {
        const timeLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        document.getElementById('countdown').textContent = `${timeLeft}с`;
        document.getElementById('countdownNumber').textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearCountdown();
            document.getElementById('countdownOverlay').classList.remove('visible');
            updateBettingUI();
        }
    }
    
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

function clearCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

function updateRocketPosition(multiplier) {
    const rocketElement = document.getElementById('rocket');
    const trailElement = document.getElementById('rocketTrail');
    
    // Вычисляем новую позицию ракеты (от 50px до 250px)
    const newPosition = 50 + (multiplier * 10);
    rocketElement.style.bottom = `${newPosition}px`;
    
    // Обновляем след ракеты
    trailElement.style.height = `${newPosition - 50}px`;
    
    // Поворачиваем ракету при достижении множителя 3x
    if (multiplier >= 3.0 && multiplier < 5.0) {
        const rotation = (multiplier - 3.0) * 12.5; // От 0 до 25 градусов
        rocketElement.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
    } else if (multiplier >= 5.0) {
        // При 5x и больше - поворот на 50 градусов и пульсация
        rocketElement.style.transform = `translateX(-50%) rotate(50deg)`;
        rocketElement.classList.add('pulsating');
    } else {
        rocketElement.style.transform = `translateX(-50%) rotate(0deg)`;
        rocketElement.classList.remove('pulsating');
    }
}

function showExplosion() {
    const canvas = document.getElementById('gameCanvas');
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    canvas.appendChild(explosion);
    
    setTimeout(() => {
        canvas.removeChild(explosion);
    }, 1000);
}

function updatePlayersList(players) {
    const playersList = document.getElementById('playersList');
    const playersCount = document.getElementById('playersCount');
    
    playersList.innerHTML = '';
    playersCount.textContent = players.length;
    
    if (players.length === 0) {
        const noPlayers = document.createElement('div');
        noPlayers.className = 'player-item';
        noPlayers.textContent = 'Нет активных игроков';
        playersList.appendChild(noPlayers);
        return;
    }
    
    players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = player.name;
        
        const betSpan = document.createElement('span');
        betSpan.className = 'player-bet';
        
        if (player.cashedOut) {
            betSpan.textContent = `+${player.winAmount.toFixed(2)} TON (${player.cashoutMultiplier?.toFixed(2) || '0.00'}x)`;
            betSpan.style.color = '#00b894';
        } else if (player.isBot) {
            betSpan.textContent = `${player.betAmount.toFixed(2)} TON`;
        } else {
            betSpan.textContent = `${player.betAmount.toFixed(2)} TON`;
        }
        
        playerItem.appendChild(nameSpan);
        playerItem.appendChild(betSpan);
        playersList.appendChild(playerItem);
    });
}

function updateHistory(history) {
    const historyContainer = document.getElementById('historyItems');
    historyContainer.innerHTML = '';
    
    history.slice(0, 10).forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = `history-item ${item.multiplier >= 2 ? 'history-win' : 'history-loss'}`;
        historyItem.textContent = `${item.multiplier.toFixed(2)}x`;
        historyContainer.appendChild(historyItem);
    });
}

async function placeBet() {
    const betAmount = parseFloat(document.getElementById('betAmount').value);
    
    if (betAmount < 0.5 || betAmount > 50) {
        alert('Ставка должна быть от 0.5 до 50 TON');
        return;
    }
    
    // Запрещаем несколько ставок
    if (userBet > 0) {
        alert('Вы уже сделали ставку в этом раунде!');
        return;
    }
    
    // Проверяем что игра в стадии приема ставок
    if (rocketGame.status !== 'counting') {
        alert('Сейчас нельзя сделать ставку! Дождитесь следующего раунда.');
        return;
    }
    
    // Проверяем время для ставок
    const timeLeft = Math.ceil((rocketGame.endBetTime - Date.now()) / 1000);
    if (timeLeft <= 0) {
        alert('Время для ставок закончилось! Дождитесь следующего раунда.');
        return;
    }
    
    try {
        const response = await fetch('/api/rocket/bet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                telegramId: currentUser.id,
                betAmount: betAmount,
                demoMode: isDemoMode
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Ошибка при размещении ставки');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userBet = betAmount;
            document.getElementById('userBet').textContent = betAmount.toFixed(2);
            document.getElementById('balance').textContent = result.new_balance.toFixed(2);
            
            // Блокируем кнопку ставки
            document.getElementById('placeBetButton').disabled = true;
            document.getElementById('placeBetButton').textContent = 'Ставка сделана';
            
            alert('Ставка принята! Удачи! 🚀');
        }
    } catch (error) {
        console.error('Error placing bet:', error);
        alert('Ошибка при размещении ставки');
    }
}

async function cashout() {
    if (userCashedOut) {
        alert('Вы уже забрали выигрыш!');
        return;
    }
    
    if (userBet === 0) {
        alert('Сначала сделайте ставку!');
        return;
    }
    
    if (rocketGame.status !== 'flying') {
        alert('Нельзя забрать выигрыш сейчас!');
        return;
    }
    
    try {
        const response = await fetch('/api/rocket/cashout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                telegramId: currentUser.id
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Ошибка при выводе средств');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userCashedOut = true;
            updateBettingUI();
            
            // Обновляем баланс
            const response = await fetch(`/api/user/balance/${currentUser.id}`);
            if (response.ok) {
                const userData = await response.json();
                const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
                document.getElementById('balance').textContent = balance.toFixed(2);
            }
            
            alert(`🎉 Вы успешно вывели ${result.winAmount.toFixed(2)} TON на ${result.multiplier.toFixed(2)}x!`);
        }
    } catch (error) {
        console.error('Error cashing out:', error);
        alert('Ошибка при выводе средств');
    }
}

function updateBettingUI() {
    const betButton = document.getElementById('placeBetButton');
    const cashoutButton = document.getElementById('cashoutButton');
    
    if (rocketGame.status === 'counting') {
        // В режиме ставок
        const timeLeft = rocketGame.endBetTime ? Math.ceil((rocketGame.endBetTime - Date.now()) / 1000) : 0;
        const canBet = timeLeft > 0;
        
        betButton.disabled = userBet > 0 || !canBet;
        cashoutButton.disabled = true;
        
        if (userBet > 0) {
            betButton.textContent = 'Ставка сделана';
        } else if (!canBet) {
            betButton.textContent = 'Время вышло';
        } else {
            betButton.textContent = `Поставить (${timeLeft}с)`;
        }
    } else if (rocketGame.status === 'flying') {
        // В полете
        betButton.disabled = true;
        betButton.textContent = 'Полёт...';
        cashoutButton.disabled = userCashedOut || userBet === 0;
        
        if (!userCashedOut && userBet > 0) {
            cashoutButton.textContent = `Забрать ${rocketGame.multiplier.toFixed(2)}x`;
        }
    } else {
        // Ожидание или краш
        betButton.disabled = rocketGame.status !== 'waiting';
        cashoutButton.disabled = true;
        betButton.textContent = 'Поставить';
        cashoutButton.textContent = 'Забрать выигрыш';
    }
}

function resetBettingUI() {
    userBet = 0;
    userCashedOut = false;
    userPlayer = null;
    document.getElementById('userBet').textContent = '0';
    document.getElementById('potentialWin').textContent = '0';
    document.getElementById('placeBetButton').disabled = false;
    document.getElementById('placeBetButton').textContent = 'Поставить';
    updateBettingUI();
}
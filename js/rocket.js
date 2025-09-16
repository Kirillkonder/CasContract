let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let rocketPosition = 80;
let countdownInterval = null;
let allOnlineUsers = 0;
let gameSpeed = 1;
let lastMultiplierUpdate = Date.now();

// Массивы имен для ботов
const botFirstNames = [
    'Александр', 'Дмитрий', 'Максим', 'Артем', 'Михаил', 'Никита', 'Андрей', 'Владислав',
    'Данил', 'Кирилл', 'Егор', 'Илья', 'Роман', 'Владимир', 'Павел', 'Анна', 'Мария',
    'Елена', 'Ольга', 'Екатерина', 'Наталья', 'Юлия', 'Татьяна', 'Ирина', 'Светлана'
];

const botLastNames = [
    'Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Петров', 'Соколов', 'Михайлов',
    'Новиков', 'Федоров', 'Морозов', 'Волков', 'Алексеев', 'Лебедев', 'Семенов', 'Егоров',
    'Павлов', 'Козлов', 'Степанов', 'Николаев', 'Орлов', 'Андреев', 'Макаров', 'Никитин'
];

function generateBotName() {
    const firstName = botFirstNames[Math.floor(Math.random() * botFirstNames.length)];
    const lastName = botLastNames[Math.floor(Math.random() * botLastNames.length)];
    return `${firstName}_${lastName}`;
}

function showButtonLoading(buttonId) {
    const button = document.getElementById(buttonId);
    button.classList.add('loading');
    button.disabled = true;
}

function hideButtonLoading(buttonId) {
    const button = document.getElementById(buttonId);
    button.classList.remove('loading');
}

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
        // Улучшенная логика никнеймов для пользователей
        let displayName = '';
        if (tg.initDataUnsafe.user.username) {
            displayName = `@${tg.initDataUnsafe.user.username}`;
        } else if (tg.initDataUnsafe.user.first_name || tg.initDataUnsafe.user.last_name) {
            displayName = [tg.initDataUnsafe.user.first_name, tg.initDataUnsafe.user.last_name].filter(Boolean).join(' ');
        } else {
            displayName = `Игрок_${tg.initDataUnsafe.user.id}`;
        }
        
        currentUser = {
            id: tg.initDataUnsafe.user.id,
            username: tg.initDataUnsafe.user.username || `User_${tg.initDataUnsafe.user.id}`,
            displayName: displayName,
            firstName: tg.initDataUnsafe.user.first_name,
            lastName: tg.initDataUnsafe.user.last_name
        };
        loadUserData();
    }
    
    // Добавляем фейковых ботов для демонстрации
    setTimeout(() => {
        addSimulatedPlayers();
    }, 2000);
}

async function loadUserData() {
    try {
        const response = await fetch(`/api/user/balance/${currentUser.id}`);
        if (response.ok) {
            const userData = await response.json();
            const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
            document.getElementById('balance').textContent = balance.toFixed(2);
            isDemoMode = userData.demo_mode;
            document.getElementById('demo-badge').style.display = isDemoMode ? 'block' : 'none';
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        console.log('Connected to Rocket game server');
    };
    
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if (data.type === 'rocket_update') {
            updateGameState(data.game);
        }
    };
    
    ws.onclose = function() {
        console.log('Disconnected from Rocket game server');
        setTimeout(connectWebSocket, 5000);
    };
    
    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

function updateGameState(gameState) {
    // Добавляем флаг для определения, что игра только что завершилась
    const wasCrashed = rocketGame.status === 'crashed';
    rocketGame = gameState;
    rocketGame.justCrashed = (gameState.status === 'crashed' && !wasCrashed);
    allOnlineUsers = gameState.totalOnlineUsers || gameState.players.length;
    
    clearCountdown();
    
    switch(gameState.status) {
        case 'waiting':
            clearCountdown();
            resetBettingUI();
            updateTimerDisplay('Ожидание');
            break;
            
        case 'counting':
            startCountdown(gameState.timeLeft || Math.max(0, Math.ceil((gameState.endBetTime - Date.now()) / 1000)));
            break;
            
        case 'flying':
            clearCountdown();
            updateRocketPosition(gameState.multiplier);
            updateTimerDisplay(gameState.multiplier.toFixed(2) + 'x');
            // Обновляем логику ботов во время полета
            updateBotsLogic(gameState.multiplier);
            break;
            
        case 'crashed':
            clearCountdown();
            showExplosion();
            updateTimerDisplay(gameState.multiplier.toFixed(2) + 'x');
            break;
    }
    
    // Обновляем баланс в реальном времени
    if (userPlayer) {
        const updatedPlayer = gameState.players.find(p => p.userId == currentUser.id && !p.isBot);
        if (updatedPlayer) {
            userPlayer = updatedPlayer;
            userBet = userPlayer.betAmount;
            userCashedOut = userPlayer.cashedOut;
            
            document.getElementById('userBet').textContent = userBet.toFixed(2) + ' TON';
            
            if (userCashedOut) {
                document.getElementById('potentialWin').textContent = userPlayer.winAmount.toFixed(2) + ' TON';
                // Обновляем баланс после выигрыша
                updateUserBalance(userPlayer.winAmount - userBet);
            }
        }
    }
    
    // Обновляем список игроков
    updatePlayersList(gameState.players);
    updateHistory(gameState.history);
    document.getElementById('playersCount').textContent = allOnlineUsers;
    
    if (userBet > 0 && !userCashedOut && gameState.status === 'flying') {
        const potentialWin = userBet * gameState.multiplier;
        document.getElementById('potentialWin').textContent = potentialWin.toFixed(2) + ' TON';
    }
    
    updateBettingUI();
}

function updateTimerDisplay(text) {
    const timerDisplay = document.getElementById('timerDisplay');
    timerDisplay.textContent = text;
    
    if (text === 'Ожидание') {
        timerDisplay.className = 'coeff-item active';
    } else if (text.includes('КРАШ')) {
        timerDisplay.className = 'coeff-item history-loss';
    } else {
        timerDisplay.className = 'coeff-item';
    }
}

function startCountdown(timeLeft) {
    clearCountdown();
    
    const timerElement = document.getElementById('timer');
    const timerDisplay = document.getElementById('timerDisplay');
    
    timerDisplay.textContent = timeLeft + 's';
    timerElement.textContent = timeLeft + 's';
    
    if (timeLeft <= 0) {
        document.getElementById('placeBetButton').textContent = 'Время вышло';
        document.getElementById('placeBetButton').disabled = true;
        return;
    }
    
    countdownInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = timeLeft + 's';
        timerElement.textContent = timeLeft + 's';
        
        if (timeLeft <= 0) {
            clearCountdown();
            document.getElementById('placeBetButton').textContent = 'Время вышло';
            document.getElementById('placeBetButton').disabled = true;
        }
    }, 1000);
}

function clearCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    document.getElementById('timer').textContent = '0:00';
}

function updateRocketPosition(multiplier) {
    const rocketElement = document.getElementById('rocket');
    const trailElement = document.getElementById('rocketTrail');
    const canvasElement = document.getElementById('rocketCanvas');
    
    const trailHeight = Math.max(0, multiplier * 10);
    
    // Улучшенная система скорости множителя
    calculateGameSpeed(multiplier);
    
    if (multiplier > 1.00) {
        rocketElement.classList.add('pulsating');
        canvasElement.classList.add('pulsating');
        
        // Новая логика скорости пульсации
        let pulseSpeed;
        if (multiplier <= 3) {
            // Медленно от 1 до 3x
            pulseSpeed = 2.0 - (multiplier - 1) * 0.3; // от 2.0s до 1.4s
        } else if (multiplier <= 4) {
            // Быстрее после 3x
            pulseSpeed = 1.4 - (multiplier - 3) * 0.4; // от 1.4s до 1.0s
        } else {
            // Каждые 4x увеличиваем скорость
            const speedBoost = Math.floor((multiplier - 4) / 4) * 0.2;
            pulseSpeed = Math.max(0.1, 1.0 - speedBoost);
        }
        
        document.documentElement.style.setProperty('--pulse-speed', `${pulseSpeed}s`);
        
        // Добавляем интенсивность свечения в зависимости от множителя
        if (multiplier >= 5) {
            canvasElement.style.background = `radial-gradient(circle, rgba(0, 191, 255, ${Math.min(0.3, (multiplier - 5) * 0.05)}) 0%, transparent 70%)`;
        }
        
    } else {
        rocketElement.classList.remove('pulsating');
        canvasElement.classList.remove('pulsating');
        canvasElement.style.backgroundColor = '';
        document.documentElement.style.setProperty('--pulse-speed', '1.2s');
    }
}

function calculateGameSpeed(multiplier) {
    const now = Date.now();
    const timeDiff = now - lastMultiplierUpdate;
    
    // Вычисляем скорость роста множителя
    if (multiplier <= 3) {
        // Медленно от 1 до 3x - обновления каждые 200мс
        gameSpeed = 200;
    } else if (multiplier <= 8) {
        // Быстрее после 3x - обновления каждые 100мс  
        gameSpeed = 100;
    } else {
        // Каждые 4x увеличиваем скорость
        const speedLevel = Math.floor((multiplier - 8) / 4);
        gameSpeed = Math.max(50, 100 - (speedLevel * 25));
    }
    
    lastMultiplierUpdate = now;
}

function showExplosion() {
    const canvas = document.getElementById('rocketCanvas');
    const rocketElement = document.getElementById('rocket');
    
    rocketElement.classList.remove('pulsating');
    canvas.classList.remove('pulsating');
    canvas.style.backgroundColor = '';
    
    // Заменяем blast-off на fly-away
    rocketElement.classList.add('fly-away');
    
    const blastOffText = document.createElement('div');
    blastOffText.className = 'blast-off-text';
    blastOffText.textContent = 'УЛЕТЕЛ!';
    canvas.appendChild(blastOffText);
    
    setTimeout(() => {
        if (blastOffText.parentNode) {
            canvas.removeChild(blastOffText);
        }
        rocketElement.classList.remove('fly-away');
        // Возвращаем ракету на исходную позицию
        rocketElement.style.transform = 'translate(-50%, -50%) rotate(-45deg)';
        rocketElement.style.opacity = '1';
    }, 2000);
}

async function updateUserBalance(winAmount = 0) {
    try {
        const response = await fetch(`/api/user/balance/${currentUser.id}`);
        if (response.ok) {
            const userData = await response.json();
            const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
            document.getElementById('balance').textContent = balance.toFixed(2);
            
            // Если есть выигрыш, показываем обновление
            if (winAmount > 0) {
                const balanceElement = document.getElementById('balance');
                balanceElement.classList.add('balance-updated');
                setTimeout(() => {
                    balanceElement.classList.remove('balance-updated');
                }, 1000);
            }
        }
    } catch (error) {
        console.error('Error updating balance:', error);
    }
}

function updatePlayersList(players) {
    const playersList = document.getElementById('playersList');
    const playersCount = document.getElementById('playersCount');
    document.getElementById('playersCount').textContent = allOnlineUsers;
    playersCount.textContent = players.length;
    
    // Получаем текущих игроков из DOM
    const currentPlayerElements = Array.from(playersList.children);
    const currentPlayerNames = currentPlayerElements.map(item => {
        const nameSpan = item.querySelector('.player-name');
        return nameSpan ? nameSpan.textContent : '';
    });
    
    // Фильтруем только игроков с ставками
    const playersWithBets = players.filter(player => player.betAmount > 0);
    playersCount.textContent = playersWithBets.length;
    
    // Сортируем: сначала игроки с выводом, потом без
    playersWithBets.sort((a, b) => {
        if (a.cashedOut && !b.cashedOut) return -1;
        if (!a.cashedOut && b.cashedOut) return 1;
        return 0;
    });
    
    // Удаляем игроков, которых больше нет в списке
    currentPlayerElements.forEach(playerElement => {
        const nameSpan = playerElement.querySelector('.player-name');
        if (nameSpan) {
            const playerName = nameSpan.textContent;
            const playerStillExists = playersWithBets.some(player => {
                return (player.displayName || player.name) === playerName;
            });
            if (!playerStillExists) {
                playerElement.remove();
            }
        }
    });
    
    // Добавляем только новых игроков с анимацией
    playersWithBets.forEach((player, index) => {
        // Используем displayName если есть, иначе name
        const playerDisplayName = player.displayName || player.name;
        
        // Проверяем, есть ли уже такой игрок в DOM
        const existingPlayer = Array.from(playersList.children).find(item => {
            const nameSpan = item.querySelector('.player-name');
            return nameSpan && nameSpan.textContent === playerDisplayName;
        });
        
        if (!existingPlayer) {
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            
            // Создаем аватарку
            const avatar = document.createElement('div');
            avatar.className = 'player-avatar';
            
            // Улучшенные эмодзи и цвета для ботов и реальных игроков
            if (player.isBot) {
                const botEmojis = ['🤖', '👾', '🦾', '⚙️', '💻', '🎮', '🧠', '🔧'];
                avatar.textContent = botEmojis[Math.floor(Math.random() * botEmojis.length)];
                avatar.style.backgroundColor = '#ff6b35';
                avatar.style.border = '2px solid #ff8c00';
            } else {
                const userEmojis = ['👨‍🚀', '👩‍🚀', '🧑‍🚀', '🦸‍♂️', '🦸‍♀️', '🎯', '⭐', '💎'];
                avatar.textContent = userEmojis[Math.floor(Math.random() * userEmojis.length)];
                avatar.style.backgroundColor = '#1e5cb8';
                avatar.style.border = '2px solid #00bfff';
            }
            
            const infoContainer = document.createElement('div');
            infoContainer.className = 'player-info-container';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = playerDisplayName;
            
            // Добавляем индикатор статуса игрока
            if (!player.isBot) {
                nameSpan.style.fontWeight = 'bold';
                nameSpan.style.color = '#00bfff';
            }
            
            const betSpan = document.createElement('span');
            betSpan.className = 'player-bet';
            
            if (player.cashedOut) {
                betSpan.textContent = `+${player.winAmount.toFixed(2)} TON (${player.cashoutMultiplier.toFixed(2)}x)`;
                betSpan.style.color = '#00b894';
                betSpan.classList.add('win-animation');
            } else if (rocketGame.status === 'crashed' && !player.cashedOut) {
                betSpan.textContent = `-${player.betAmount.toFixed(2)} TON`;
                betSpan.style.color = '#ff4757';
                
                if (rocketGame.justCrashed) {
                    betSpan.classList.add('loss-animation');
                    setTimeout(() => {
                        betSpan.classList.remove('loss-animation');
                    }, 500);
                }
                
                playerItem.classList.add('player-loss');
            } else {
                betSpan.textContent = `${player.betAmount.toFixed(2)} TON`;
                betSpan.style.color = '#fff';
            }
            
            infoContainer.appendChild(nameSpan);
            infoContainer.appendChild(betSpan);
            
            playerItem.appendChild(avatar);
            playerItem.appendChild(infoContainer);
            playersList.appendChild(playerItem);
            
            // Анимация появления только для новых игроков
            setTimeout(() => {
                playerItem.classList.add('show');
            }, 10);
        } else {
            // Обновляем существующих игроков без анимации
            const betSpan = existingPlayer.querySelector('.player-bet');
            const playerItem = existingPlayer;
            
            if (player.cashedOut) {
                betSpan.textContent = `+${player.winAmount.toFixed(2)} TON (${player.cashoutMultiplier.toFixed(2)}x)`;
                betSpan.style.color = '#00b894';
                betSpan.classList.add('win-animation');
                playerItem.classList.remove('player-loss');
            } else if (rocketGame.status === 'crashed' && !player.cashedOut) {
                betSpan.textContent = `-${player.betAmount.toFixed(2)} TON`;
                betSpan.style.color = '#ff4757';
                
                if (rocketGame.justCrashed) {
                    betSpan.classList.add('loss-animation');
                    setTimeout(() => {
                        betSpan.classList.remove('loss-animation');
                    }, 500);
                }
                
                playerItem.classList.add('player-loss');
            } else {
                betSpan.textContent = `${player.betAmount.toFixed(2)} TON`;
                betSpan.style.color = '#fff';
                playerItem.classList.remove('player-loss');
            }
        }
    });
}


function updateHistory(history) {
    // Обновляем историю в коэффициентах
    for (let i = 0; i < 5; i++) {
        const historyItem = document.getElementById('historyItem' + (i + 1));
        if (history[i]) {
            historyItem.textContent = history[i].multiplier.toFixed(2) + 'x';
            historyItem.className = `coeff-item ${history[i].multiplier >= 2 ? 'history-win' : 'history-loss'}`;
        } else {
            historyItem.textContent = '1.00';
            historyItem.className = 'coeff-item';
        }
    }
}

async function placeBet() {
    const betAmount = 5; // Фиксированная ставка 5 TON
    
    if (userBet > 0) {
        return;
    }
    
    if (rocketGame.status !== 'counting') {
        return;
    }
    
    const timeLeft = Math.ceil((rocketGame.endBetTime - Date.now()) / 1000);
    if (timeLeft <= 0) {
        return;
    }
    
    showButtonLoading('placeBetButton');
    
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
            hideButtonLoading('placeBetButton');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userBet = betAmount;
            document.getElementById('userBet').textContent = betAmount.toFixed(2) + ' TON';
            document.getElementById('balance').textContent = result.new_balance.toFixed(2);
            
            document.getElementById('placeBetButton').disabled = true;
            document.getElementById('placeBetButton').textContent = 'Ставка сделана';
        }
    } catch (error) {
        console.error('Error placing bet:', error);
    } finally {
        hideButtonLoading('placeBetButton');
    }
}

async function cashout() {
    if (userCashedOut) {
        return;
    }
    
    if (userBet === 0) {
        return;
    }
    
    if (rocketGame.status !== 'flying') {
        return;
    }
    
    showButtonLoading('cashoutButton');
    
    try {
        const response = await fetch('/api/rocket/cashout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                telegramId: currentUser.id,
                demoMode: isDemoMode
            })
        });
        
        if (!response.ok) {
            hideButtonLoading('cashoutButton');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userCashedOut = true;
            document.getElementById('potentialWin').textContent = result.winAmount.toFixed(2) + ' TON';
            document.getElementById('balance').textContent = result.new_balance.toFixed(2);
            
            document.getElementById('cashoutButton').disabled = true;
            document.getElementById('cashoutButton').textContent = 'Выплачено';
            
            // Обновляем баланс в реальном времени
            updateUserBalance(result.winAmount - userBet);
        }
    } catch (error) {
        console.error('Error cashing out:', error);
    } finally {
        hideButtonLoading('cashoutButton');
    }
}

function resetBettingUI() {
    document.getElementById('placeBetButton').disabled = false;
    document.getElementById('placeBetButton').textContent = 'Поставить 5 TON';
    document.getElementById('cashoutButton').disabled = true;
    document.getElementById('cashoutButton').textContent = 'Забрать выигрыш';
    
    userBet = 0;
    userCashedOut = false;
    
    document.getElementById('userBet').textContent = '0 TON';
    document.getElementById('potentialWin').textContent = '0 TON';
}

function updateBettingUI() {
    const betButton = document.getElementById('placeBetButton');
    const cashoutButton = document.getElementById('cashoutButton');
    
    if (rocketGame.status === 'waiting') {
        betButton.disabled = false;
        betButton.textContent = 'Поставить 5 TON';
        cashoutButton.disabled = true;
    } else if (rocketGame.status === 'counting') {
        if (userBet > 0) {
            betButton.disabled = true;
            betButton.textContent = 'Ставка сделана';
        } else {
            betButton.disabled = false;
            betButton.textContent = 'Поставить 5 TON';
        }
        cashoutButton.disabled = true;
    } else if (rocketGame.status === 'flying') {
        betButton.disabled = true;
        betButton.textContent = 'Игра идет';
        
        if (userBet > 0 && !userCashedOut) {
            cashoutButton.disabled = false;
        } else {
            cashoutButton.disabled = true;
        }
    } else if (rocketGame.status === 'crashed') {
        betButton.disabled = true;
        betButton.textContent = 'Раунд завершен';
        cashoutButton.disabled = true;
    }
}

// Функция для добавления симулированных игроков с лучшей логикой
function addSimulatedPlayers() {
    if (!rocketGame.players) rocketGame.players = [];
    
    // Добавляем несколько ботов с разными ставками
    const numBots = Math.floor(Math.random() * 4) + 2; // 2-5 ботов
    
    for (let i = 0; i < numBots; i++) {
        const botName = generateBotName();
        const betAmount = [1, 2, 5, 10, 25][Math.floor(Math.random() * 5)];
        
        // Боты теперь имеют шанс выиграть!
        const shouldCashOut = Math.random() > 0.4; // 60% шанс вывести
        const cashoutMultiplier = shouldCashOut ? 
            1.2 + Math.random() * 4 : // выводят между 1.2x и 5.2x
            null;
        
        const bot = {
            userId: `bot_${i}_${Date.now()}`,
            name: botName,
            displayName: botName,
            betAmount: betAmount,
            isBot: true,
            cashedOut: shouldCashOut,
            cashoutMultiplier: cashoutMultiplier,
            winAmount: shouldCashOut ? betAmount * cashoutMultiplier : 0
        };
        
        rocketGame.players.push(bot);
    }
    
    // Добавляем реального пользователя если он есть
    if (currentUser && userBet > 0) {
        const userPlayer = {
            userId: currentUser.id,
            name: currentUser.displayName,
            displayName: currentUser.displayName,
            betAmount: userBet,
            isBot: false,
            cashedOut: userCashedOut,
            cashoutMultiplier: null,
            winAmount: 0
        };
        rocketGame.players.push(userPlayer);
    }
    
    updatePlayersList(rocketGame.players);
}

// Функция для динамического обновления ботов во время игры
function updateBotsLogic(currentMultiplier) {
    if (!rocketGame.players) return;
    
    rocketGame.players.forEach(player => {
        if (player.isBot && !player.cashedOut && player.betAmount > 0) {
            // Боты принимают решения основываясь на множителе и своей "стратегии"
            const botStrategy = Math.random();
            let shouldCashOut = false;
            
            if (botStrategy < 0.3) {
                // Консервативные боты - выводят рано
                shouldCashOut = currentMultiplier >= (1.2 + Math.random() * 1);
            } else if (botStrategy < 0.7) {
                // Умеренные боты - выводят в среднем диапазоне  
                shouldCashOut = currentMultiplier >= (1.5 + Math.random() * 2.5);
            } else {
                // Рискованные боты - ждут высоких множителей
                shouldCashOut = currentMultiplier >= (3 + Math.random() * 5);
            }
            
            if (shouldCashOut) {
                player.cashedOut = true;
                player.cashoutMultiplier = currentMultiplier;
                player.winAmount = player.betAmount * currentMultiplier;
            }
        }
    });
}

// Инициализация глобальной переменной для состояния игры
let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    players: [],
    history: []
};
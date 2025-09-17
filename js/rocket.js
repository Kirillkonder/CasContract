let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let rocketPosition = 80;
let countdownInterval = null;
let allOnlineUsers = 0;

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
        currentUser = {
            id: tg.initDataUnsafe.user.id,
            username: tg.initDataUnsafe.user.username || `User_${tg.initDataUnsafe.user.id}`,
            firstName: tg.initDataUnsafe.user.first_name,
            lastName: tg.initDataUnsafe.user.last_name
        };
        loadUserData();
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
    const canvasElement = document.getElementById('rocketCanvas');
    
    // Убираем пульсацию при множителе 1.00
    if (multiplier <= 1.00) {
        rocketElement.classList.remove('pulsating');
        canvasElement.classList.remove('pulsating');
        document.documentElement.style.setProperty('--pulse-speed', '1.2s');
        return;
    }
    
    // Добавляем пульсацию при множителе выше 1.00
    rocketElement.classList.add('pulsating');
    canvasElement.classList.add('pulsating');
    
    // Настройка скорости пульсации в зависимости от множителя
    let pulseSpeed;
    
    if (multiplier < 1.5) {
        // Очень медленно до 1.5x
        pulseSpeed = 2.0;
    } else if (multiplier < 2.0) {
        // Медленно от 1.5x до 2.0x
        pulseSpeed = 1.8;
    } else if (multiplier < 2.5) {
        // Средне-медленно от 2.0x до 2.5x
        pulseSpeed = 1.6;
    } else if (multiplier < 3.0) {
        // Средне от 2.5x до 3.0x
        pulseSpeed = 1.4;
    } else if (multiplier < 5.0) {
        // Немного быстрее от 3.0x до 5.0x
        pulseSpeed = 1.2;
    } else if (multiplier < 10.0) {
        // Быстрее от 5.0x до 10.0x
        pulseSpeed = 1.0;
    } else if (multiplier < 15.0) {
        // Еще быстрее от 10.0x до 15.0x
        pulseSpeed = 0.8;
    } else if (multiplier < 20.0) {
        // Очень быстро от 15.0x до 20.0x
        pulseSpeed = 0.6;
    } else if (multiplier < 25.0) {
        // Максимально быстро от 20.0x до 25.0x
        pulseSpeed = 0.4;
    } else {
        // Сверхскорость после 25.0x
        pulseSpeed = 0.3;
    }
    
    // Устанавливаем скорость пульсации
    document.documentElement.style.setProperty('--pulse-speed', `${pulseSpeed}s`);
    
    // Дополнительные визуальные эффекты для высоких множителей
    if (multiplier >= 5.0) {
        const intensity = Math.min(0.8, (multiplier - 5) / 50);
        canvasElement.style.backgroundColor = `rgba(255, 100, 0, ${intensity})`;
    } else {
        canvasElement.style.backgroundColor = '';
    }
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
                // Генерируем имя для сравнения
                const generatedName = generateRussianName(player.isBot, player.userId || player.id);
                return generatedName === playerName;
            });
            if (!playerStillExists) {
                playerElement.remove();
            }
        }
    });
    
    // Генератор русских имен для игроков
    function generateRussianName(isBot = false, userId = null) {
        if (isBot) {
            const botNames = [
                'Робот', 'Автомат', 'Бот', 'ИИ', 
                'Машина', 'Программа', 'Виртуальный', 'Система'
            ];
            // Для ботов используем случайное имя
            return botNames[Math.floor(Math.random() * botNames.length)];
        } else {
            // Для реальных пользователей используем хэш от ID для постоянства имени
            const userNames = [
                'Игрок', 'Участник', 'Стратег', 'Мастер', 
                'Профи', 'Новичок', 'Эксперт', 'Чемпион',
                'Геймер', 'Победитель', 'Лидер', 'Гуру'
            ];
            if (userId) {
                // Создаем стабильный хэш из ID
                const hash = userId.toString().split('').reduce((a, b) => {
                    return a + parseInt(b);
                }, 0);
                return userNames[hash % userNames.length];
            }
            return userNames[Math.floor(Math.random() * userNames.length)];
        }
    }
    
    // Добавляем только новых игроков с анимацией
    playersWithBets.forEach((player, index) => {
        // Генерируем русское имя
        const playerName = generateRussianName(player.isBot, player.userId || player.id);
        
        // Проверяем, есть ли уже такой игрок в DOM
        const existingPlayer = Array.from(playersList.children).find(item => {
            const nameSpan = item.querySelector('.player-name');
            return nameSpan && nameSpan.textContent === playerName;
        });
        
        if (!existingPlayer) {
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            
            // Создаем аватарку
            const avatar = document.createElement('div');
            avatar.className = 'player-avatar';
            
            // Разные эмодзи для ботов и реальных игроков
            if (player.isBot) {
                const botEmojis = ['🤖', '👾', '🦾', '🔧', '⚙️', '💻', '🎮', '🧠'];
                avatar.textContent = botEmojis[Math.floor(Math.random() * botEmojis.length)];
                avatar.style.backgroundColor = '#ff6b35';
            } else {
                const userEmojis = ['👨', '👩', '🧑', '👨‍🚀', '👩‍🚀', '🦸', '🦹', '🎯'];
                avatar.textContent = userEmojis[Math.floor(Math.random() * userEmojis.length)];
                avatar.style.backgroundColor = '#1e5cb8';
            }
            
            const infoContainer = document.createElement('div');
            infoContainer.className = 'player-info-container';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = playerName;
            
            const betSpan = document.createElement('span');
            betSpan.className = 'player-bet';
            
            // Отображаем выигрыш или проигрыш
            if (player.cashedOut) {
                // Игрок выиграл
                betSpan.textContent = `+${player.winAmount.toFixed(2)} TON (${player.cashoutMultiplier.toFixed(2)}x)`;
                betSpan.style.color = '#00b894';
                betSpan.classList.add('win-animation');
                playerItem.classList.remove('player-loss');
            } else if (rocketGame.status === 'crashed' && !player.cashedOut) {
                // Игрок проиграл (не успел вывести)
                betSpan.textContent = `-${player.betAmount.toFixed(2)} TON`;
                betSpan.style.color = '#ff4757';
                
                if (rocketGame.justCrashed) {
                    betSpan.classList.add('loss-animation');
                    setTimeout(() => {
                        betSpan.classList.remove('loss-animation');
                    }, 500);
                }
                
                playerItem.classList.add('player-loss');
            } else if (rocketGame.status === 'crashed' && player.cashedOut) {
                // Игрок выиграл и игра уже завершилась
                betSpan.textContent = `+${player.winAmount.toFixed(2)} TON (${player.cashoutMultiplier.toFixed(2)}x)`;
                betSpan.style.color = '#00b894';
                playerItem.classList.remove('player-loss');
            } else {
                // Игра идет, ставка активна
                betSpan.textContent = `${player.betAmount.toFixed(2)} TON`;
                betSpan.style.color = '#fff';
                playerItem.classList.remove('player-loss');
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
            // Обновляем существующих игроков
            const betSpan = existingPlayer.querySelector('.player-bet');
            const playerItem = existingPlayer;
            
            // Отображаем выигрыш или проигрыш
            if (player.cashedOut) {
                // Игрок выиграл
                betSpan.textContent = `+${player.winAmount.toFixed(2)} TON (${player.cashoutMultiplier.toFixed(2)}x)`;
                betSpan.style.color = '#00b894';
                betSpan.classList.add('win-animation');
                playerItem.classList.remove('player-loss');
            } else if (rocketGame.status === 'crashed' && !player.cashedOut) {
                // Игрок проиграл (не успел вывести)
                betSpan.textContent = `-${player.betAmount.toFixed(2)} TON`;
                betSpan.style.color = '#ff4757';
                
                if (rocketGame.justCrashed) {
                    betSpan.classList.add('loss-animation');
                    setTimeout(() => {
                        betSpan.classList.remove('loss-animation');
                    }, 500);
                }
                
                playerItem.classList.add('player-loss');
            } else if (rocketGame.status === 'crashed' && player.cashedOut) {
                // Игрок выиграл и игра уже завершилась
                betSpan.textContent = `+${player.winAmount.toFixed(2)} TON (${player.cashoutMultiplier.toFixed(2)}x)`;
                betSpan.style.color = '#00b894';
                playerItem.classList.remove('player-loss');
            } else {
                // Игра идет, ставка активна
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
    
    // Проверяем баланс
    const currentBalance = parseFloat(document.getElementById('balance').textContent);
    if (currentBalance < betAmount) {
        showInsufficientFunds();
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
            showError('Ошибка при размещении ставки');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userBet = betAmount;
            document.getElementById('userBet').textContent = betAmount.toFixed(2) + ' TON';
            document.getElementById('balance').textContent = result.new_balance.toFixed(2);
            
            document.getElementById('placeBetButton').disabled = true;
            document.getElementById('placeBetButton').textContent = 'Ставка сделана';
            
            // Показываем уведомление о успешной ставке
            showBetPlaced(betAmount);
        }
    } catch (error) {
        console.error('Error placing bet:', error);
        showError('Ошибка соединения');
    } finally {
        hideButtonLoading('placeBetButton');
    }
}

// Добавляем контейнер для уведомлений при загрузке
document.addEventListener('DOMContentLoaded', function() {
    createToastContainer();
    initializeGame();
    connectWebSocket();
});


function showToast(type, title, message, duration = 3000) {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
        success: 'bi bi-check-circle-fill',
        error: 'bi bi-x-circle-fill',
        warning: 'bi bi-exclamation-triangle-fill',
        info: 'bi bi-info-circle-fill',
        win: 'bi bi-trophy-fill'
    };
    
    toast.innerHTML = `
        <i class="toast-icon ${icons[type] || icons.info}"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="bi bi-x"></i>
        </button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Анимация появления
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Автоматическое закрытие
    if (duration > 0) {
        setTimeout(() => {
            hideToast(toast);
        }, duration);
    }
    
    return toast;
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

function hideToast(toast) {
    toast.classList.remove('show');
    toast.classList.add('hide');
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

// Примеры использования в разных ситуациях:

// 1. При недостатке средств
function showInsufficientFunds() {
    showToast('error', 'Недостаточно средств', 'Пополните баланс для совершения ставки');
}

// 2. При выигрыше
function showWinNotification(amount, multiplier) {
    if (amount >= 100) {
        showToast('win', 'КРУПНЫЙ ВЫИГРЫШ!', 
            `🎉 Вы выиграли ${amount.toFixed(2)} TON (${multiplier.toFixed(2)}x)`, 5000);
    } else if (amount >= 50) {
        showToast('success', 'Отличный выигрыш!', 
            `💰 +${amount.toFixed(2)} TON (${multiplier.toFixed(2)}x)`);
    } else {
        showToast('success', 'Выигрыш!', 
            `+${amount.toFixed(2)} TON (${multiplier.toFixed(2)}x)`);
    }
}

// 3. При успешной ставке
function showBetPlaced(betAmount) {
    showToast('success', 'Ставка принята', `Ставка ${betAmount} TON размещена`);
}

// 4. При ошибке
function showError(message) {
    showToast('error', 'Ошибка', message);
}

// 5. Информационные уведомления
function showInfo(title, message) {
    showToast('info', title, message);
}

// 6. Предупреждения
function showWarning(message) {
    showToast('warning', 'Внимание', message);
}

// Обновляем функцию cashout для показа уведомления о выигрыше
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
            showError('Ошибка при выводе средств');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userCashedOut = true;
            document.getElementById('potentialWin').textContent = result.winAmount.toFixed(2) + ' TON';
            document.getElementById('balance').textContent = result.new_balance.toFixed(2);
            
            document.getElementById('cashoutButton').disabled = true;
            document.getElementById('cashoutButton').textContent = 'Выплачено';
            
            // Показываем уведомление о выигрыше
            showWinNotification(result.winAmount - userBet, result.winAmount / userBet);
            
            // Обновляем баланс в реальном времени
            updateUserBalance(result.winAmount - userBet);
        }
    } catch (error) {
        console.error('Error cashing out:', error);
        showError('Ошибка соединения');
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

// Инициализация глобальной переменной для состояния игры
let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    players: [],
    history: []
};

// Функции для пополнения баланса
function openDepositModal() {
    document.getElementById('deposit-modal').style.display = 'block';
}

function closeDepositModal() {
    document.getElementById('deposit-modal').style.display = 'none';
    document.getElementById('deposit-amount').value = '';
}

async function processDeposit() {
    const amount = parseFloat(document.getElementById('deposit-amount').value);
    
    if (!amount || amount < 1) {
        alert('Минимальный депозит: 1 TON');
        return;
    }

    try {
        const response = await fetch('/api/create-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegramId: currentUser.id,
                amount: amount,
                demoMode: isDemoMode
            })
        });

        const result = await response.json();
        
        if (result.success) {
            if (isDemoMode) {
                // Для демо-режима сразу обновляем баланс
                await loadUserData();
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.showPopup({
                        title: "✅ Демо-пополнение",
                        message: `Демо-депозит ${amount} TON успешно зачислен!`,
                        buttons: [{ type: "ok" }]
                    });
                } else {
                    alert(`Демо-депозит ${amount} TON успешно зачислен!`);
                }
            } else {
                // Для реального режима открываем инвойс
                window.open(result.invoice_url, '_blank');
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.showPopup({
                        title: "Оплата TON",
                        message: `Откройте Crypto Bot для оплаты ${amount} TON`,
                        buttons: [{ type: "ok" }]
                    });
                } else {
                    alert(`Откройте Crypto Bot для оплаты ${amount} TON`);
                }
                checkDepositStatus(result.invoice_id);
            }
            
            closeDepositModal();
        } else {
            alert('Ошибка при создании депозита: ' + result.error);
        }
    } catch (error) {
        console.error('Deposit error:', error);
        alert('Ошибка при создании депозита');
    }
}

async function checkDepositStatus(invoiceId) {
    const checkInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/check-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invoiceId: invoiceId,
                    demoMode: isDemoMode
                })
            });
            
            const result = await response.json();
            
            if (result.status === 'paid') {
                clearInterval(checkInterval);
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.showPopup({
                        title: "✅ Успешно",
                        message: 'Депозит успешно зачислен!',
                        buttons: [{ type: "ok" }]
                    });
                } else {
                    alert('Депозит успешно зачислен!');
                }
                await loadUserData();
            } else if (result.status === 'expired' || result.status === 'cancelled') {
                clearInterval(checkInterval);
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.showPopup({
                        title: "❌ Ошибка",
                        message: 'Платеж отменен или просрочен',
                        buttons: [{ type: "ok" }]
                    });
                } else {
                    alert('Платеж отменен или просрочен');
                }
            }
        } catch (error) {
            console.error('Status check error:', error);
        }
    }, 5000);
}

// Обработчик клика вне модального окна
window.onclick = function(event) {
    const depositModal = document.getElementById('deposit-modal');
    if (event.target === depositModal) {
        closeDepositModal();
    }
}
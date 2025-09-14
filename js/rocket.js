// Основные переменные игры
let gameState = 'waiting'; // waiting, counting, flying, crashed
let countdownValue = 10;
let currentMultiplier = 1.00;
let rocketPosition = 0;
let rocketSpeed = 0;
let userBetAmount = 0;
let userPotentialWin = 0;
let isUserPlaying = false;
let players = [];
let gameHistory = [];
let countdownInterval;
let gameInterval;
let rocketAnimationFrame;

// DOM элементы
const rocket = document.getElementById('rocket');
const rocketTrail = document.getElementById('rocketTrail');
const rocketCanvas = document.getElementById('rocketCanvas');
const multiplierDisplay = document.getElementById('multiplierDisplay');
const statusText = document.getElementById('statusText');
const countdownElement = document.getElementById('countdown');
const betAmountInput = document.getElementById('betAmount');
const placeBetButton = document.getElementById('placeBetButton');
const cashoutButton = document.getElementById('cashoutButton');
const userBetElement = document.getElementById('userBet');
const potentialWinElement = document.getElementById('potentialWin');
const playersListElement = document.getElementById('playersList');
const playersAvatarsElement = document.getElementById('playersAvatars');
const playersCountElement = document.getElementById('playersCount');
const historyItemsElement = document.getElementById('historyItems');

// Инициализация игры
function initGame() {
    updateBalance();
    loadGameHistory();
    updatePlayersDisplay();
    resetGame();
}

// Сброс игры
function resetGame() {
    gameState = 'waiting';
    currentMultiplier = 1.00;
    rocketPosition = 0;
    rocketSpeed = 0;
    isUserPlaying = false;
    players = [];
    
    clearIntervals();
    
    rocket.style.bottom = '110px';
    rocket.style.transform = 'translateX(-45%) rotate(-45deg)';
    rocket.className = 'rocket';
    rocketTrail.innerHTML = '';
    
    multiplierDisplay.textContent = '1.00x';
    multiplierDisplay.style.color = '#00b894';
    
    statusText.textContent = 'Ожидание начала игры...';
    statusText.className = 'status-waiting';
    countdownElement.textContent = '';
    
    cashoutButton.disabled = true;
    placeBetButton.disabled = false;
    
    userBetElement.textContent = '0';
    potentialWinElement.textContent = '0';
    playersCountElement.textContent = '0';
    
    updatePlayersDisplay();
    
    // Запуск нового раунда через случайное время (5-15 секунд)
    setTimeout(startCountdown, Math.random() * 10000 + 5000);
}

// Очистка интервалов
function clearIntervals() {
    if (countdownInterval) clearInterval(countdownInterval);
    if (gameInterval) clearInterval(gameInterval);
    if (rocketAnimationFrame) cancelAnimationFrame(rocketAnimationFrame);
}

// Начало отсчета
function startCountdown() {
    if (gameState !== 'waiting') return;
    
    gameState = 'counting';
    countdownValue = 10;
    
    statusText.textContent = 'До взлета: ';
    statusText.className = 'status-counting';
    countdownElement.textContent = countdownValue + 'с';
    
    countdownInterval = setInterval(() => {
        countdownValue--;
        countdownElement.textContent = countdownValue + 'с';
        
        if (countdownValue <= 0) {
            clearInterval(countdownInterval);
            launchRocket();
        }
    }, 1000);
}

// Запуск ракеты
function launchRocket() {
    gameState = 'flying';
    rocketSpeed = 0.1;
    
    statusText.textContent = 'Ракета в полете!';
    statusText.className = 'status-flying';
    countdownElement.textContent = '';
    
    // Анимация полета ракеты
    function animateRocket() {
        if (gameState !== 'flying') return;
        
        rocketPosition += rocketSpeed;
        rocketSpeed *= 1.02; // Ускорение
        
        // Обновление множителя
        currentMultiplier = 1 + (rocketPosition / 100);
        multiplierDisplay.textContent = currentMultiplier.toFixed(2) + 'x';
        
        // Изменение цвета множителя
        if (currentMultiplier > 5) {
            multiplierDisplay.style.color = '#ff6b6b';
        } else if (currentMultiplier > 3) {
            multiplierDisplay.style.color = '#fdcb6e';
        } else if (currentMultiplier > 2) {
            multiplierDisplay.style.color = '#74b9ff';
        }
        
        // Перемещение ракеты
        rocket.style.bottom = (110 + rocketPosition * 2) + 'px';
        
        // Создание следа
        if (Math.random() < 0.3) {
            createParticle();
        }
        
        // Случайный взрыв (чем выше, тем больше вероятность)
        const crashChance = Math.min(0.001 * rocketPosition, 0.05);
        if (Math.random() < crashChance) {
            crashRocket();
            return;
        }
        
        rocketAnimationFrame = requestAnimationFrame(animateRocket);
    }
    
    animateRocket();
}

// Создание частицы следа
function createParticle() {
    const particle = document.createElement('div');
    particle.className = 'trail-particle';
    particle.style.left = (50 + (Math.random() - 0.5) * 20) + '%';
    particle.style.bottom = rocket.style.bottom;
    
    // Случайный цвет частицы
    const colors = ['#ff6b6b', '#fdcb6e', '#74b9ff', '#00b894'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    particle.style.background = `radial-gradient(circle, ${color}, transparent 70%)`;
    
    rocketTrail.appendChild(particle);
    
    // Анимация исчезновения частицы
    setTimeout(() => {
        if (rocketTrail.contains(particle)) {
            rocketTrail.removeChild(particle);
        }
    }, 1000);
}

// Взрыв ракеты
function crashRocket() {
    gameState = 'crashed';
    
    statusText.textContent = 'Ракета взорвалась на ' + currentMultiplier.toFixed(2) + 'x!';
    statusText.className = 'status-crashed';
    
    // Анимация взрыва
    rocket.classList.add('blast-off');
    
    // Создание взрыва
    createExplosion();
    
    // Добавление в историю
    addToHistory(currentMultiplier.toFixed(2));
    
    // Обновление балансов игроков
    updatePlayerBalances();
    
    // Перезапуск игры через 5 секунд
    setTimeout(resetGame, 5000);
}

// Создание анимации взрыва
function createExplosion() {
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    rocketCanvas.appendChild(explosion);
    
    // Создание частиц взрыва
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'explosion-particle';
        particle.style.left = (50 + (Math.random() - 0.5) * 30) + '%';
        particle.style.top = (parseInt(rocket.style.bottom) / 360 * 100) + '%';
        particle.style.width = (20 + Math.random() * 50) + 'px';
        particle.style.height = particle.style.width;
        particle.style.animation = `explosionAnimation ${0.5 + Math.random() * 0.5}s ease-out forwards`;
        particle.style.animationDelay = (i * 0.05) + 's';
        
        explosion.appendChild(particle);
    }
    
    // Удаление взрыва через 2 секунды
    setTimeout(() => {
        if (rocketCanvas.contains(explosion)) {
            rocketCanvas.removeChild(explosion);
        }
    }, 2000);
}

// Размещение ставки
function placeBet() {
    const betAmount = parseFloat(betAmountInput.value);
    
    if (isNaN(betAmount) || betAmount <= 0) {
        alert('Введите корректную сумму ставки');
        return;
    }
    
    if (gameState !== 'waiting' && gameState !== 'counting') {
        alert('Ставки принимаются только до взлета ракеты');
        return;
    }
    
    // Проверка баланса
    const currentBalance = parseFloat(document.getElementById('balance').textContent);
    if (betAmount > currentBalance) {
        alert('Недостаточно средств на балансе');
        return;
    }
    
    userBetAmount = betAmount;
    isUserPlaying = true;
    
    // Обновление интерфейса
    userBetElement.textContent = userBetAmount.toFixed(1);
    updatePotentialWin();
    
    cashoutButton.disabled = false;
    placeBetButton.disabled = true;
    
    // Добавление игрока
    addPlayer('Вы', userBetAmount, true);
}

// Забрать выигрыш
function cashout() {
    if (!isUserPlaying || gameState !== 'flying') return;
    
    const winAmount = userBetAmount * currentMultiplier;
    
    // Обновление баланса
    updateBalance(winAmount - userBetAmount);
    
    // Добавление в историю
    addToHistory(currentMultiplier.toFixed(2), true);
    
    statusText.textContent = `Вы забрали ${winAmount.toFixed(2)} TON на ${currentMultiplier.toFixed(2)}x!`;
    statusText.className = 'status-win';
    
    isUserPlaying = false;
    cashoutButton.disabled = true;
    
    // Обновление игрока
    updatePlayer('Вы', winAmount - userBetAmount, true);
}

// Обновление потенциального выигрыша
function updatePotentialWin() {
    userPotentialWin = userBetAmount * currentMultiplier;
    potentialWinElement.textContent = userPotentialWin.toFixed(2);
}

// Обновление баланса
function updateBalance(amount = 0) {
    let balanceElement = document.getElementById('balance');
    let currentBalance = parseFloat(balanceElement.textContent);
    
    if (amount !== 0) {
        currentBalance += amount;
        balanceElement.textContent = currentBalance.toFixed(2);
        
        // Сохранение баланса
        localStorage.setItem('rocketBalance', currentBalance.toFixed(2));
    } else {
        // Загрузка баланса из localStorage
        const savedBalance = localStorage.getItem('rocketBalance');
        if (savedBalance) {
            balanceElement.textContent = parseFloat(savedBalance).toFixed(2);
        } else {
            balanceElement.textContent = '100.0'; // Начальный баланс
        }
    }
}

// Добавление игрока
function addPlayer(name, betAmount, isCurrentUser = false) {
    const player = {
        id: Date.now() + Math.random(),
        name: name,
        betAmount: betAmount,
        avatar: getRandomAvatar(),
        emoji: getRandomEmoji(),
        rating: Math.floor(Math.random() * 1000) + 500,
        isCurrentUser: isCurrentUser,
        winAmount: 0
    };
    
    players.push(player);
    updatePlayersDisplay();
}

// Обновление игрока
function updatePlayer(name, winAmount, isCurrentUser = false) {
    const playerIndex = players.findIndex(p => p.name === name && p.isCurrentUser === isCurrentUser);
    if (playerIndex !== -1) {
        players[playerIndex].winAmount = winAmount;
        updatePlayersDisplay();
    }
}

// Обновление балансов игроков после взрыва
function updatePlayerBalances() {
    players.forEach(player => {
        if (player.isCurrentUser && isUserPlaying) {
            // Для текущего пользователя
            const winAmount = -player.betAmount; // Проигрыш ставки
            updatePlayer(player.name, winAmount, true);
            updateBalance(winAmount);
        } else if (!player.isCurrentUser) {
            // Для других игроков - случайный результат
            const randomWin = Math.random() > 0.5 ? 
                player.betAmount * (Math.random() * 2) : 
                -player.betAmount * (0.5 + Math.random() * 0.5);
                
            updatePlayer(player.name, randomWin, false);
        }
    });
    
    isUserPlaying = false;
    cashoutButton.disabled = true;
    placeBetButton.disabled = false;
}

// Обновление отображения игроков
function updatePlayersDisplay() {
    playersListElement.innerHTML = '';
    playersAvatarsElement.innerHTML = '';
    playersCountElement.textContent = players.length;
    
    players.forEach(player => {
        // Добавление в список
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        
        const playerName = document.createElement('span');
        playerName.className = 'player-name';
        playerName.textContent = player.name;
        
        const playerBet = document.createElement('span');
        playerBet.className = 'player-bet';
        playerBet.textContent = player.betAmount.toFixed(1) + ' TON';
        
        playerItem.appendChild(playerName);
        playerItem.appendChild(playerBet);
        playersListElement.appendChild(playerItem);
        
        // Добавление аватарки
        const avatarContainer = document.createElement('div');
        avatarContainer.className = 'player-avatar';
        
        const avatarImg = document.createElement('img');
        avatarImg.className = 'avatar-image';
        avatarImg.src = player.avatar;
        avatarImg.alt = player.name;
        
        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'avatar-emoji';
        emojiSpan.textContent = player.emoji;
        
        const ratingDiv = document.createElement('div');
        ratingDiv.className = 'player-rating';
        
        const diamondSpan = document.createElement('span');
        diamondSpan.className = 'rating-diamond';
        diamondSpan.textContent = '💎';
        
        const ratingText = document.createElement('span');
        ratingText.textContent = player.rating;
        
        // Определение цвета рейтинга
        if (player.rating > 800) {
            ratingText.className = 'rating-high';
        } else if (player.rating > 500) {
            ratingText.className = 'rating-medium';
        } else {
            ratingText.className = 'rating-low';
        }
        
        ratingDiv.appendChild(diamondSpan);
        ratingDiv.appendChild(ratingText);
        
        avatarContainer.appendChild(avatarImg);
        avatarContainer.appendChild(emojiSpan);
        avatarContainer.appendChild(ratingDiv);
        
        playersAvatarsElement.appendChild(avatarContainer);
    });
}

// Получение случайного аватара
function getRandomAvatar() {
    const avatars = [
        'https://api.dicebear.com/7.x/bottts/svg?seed=' + Math.random(),
        'https://api.dicebear.com/7.x/avataaars/svg?seed=' + Math.random(),
        'https://api.dicebear.com/7.x/lorelei/svg?seed=' + Math.random(),
        'https://api.dicebear.com/7.x/micah/svg?seed=' + Math.random(),
        'https://api.dicebear.com/7.x/miniavs/svg?seed=' + Math.random()
    ];
    
    return avatars[Math.floor(Math.random() * avatars.length)];
}

// Получение случайного эмодзи
function getRandomEmoji() {
    const emojis = ['🚀', '⭐', '🌙', '🔥', '💎', '🎯', '💰', '🎮', '👑', '🌠'];
    return emojis[Math.floor(Math.random() * emojis.length)];
}

// Добавление в историю
function addToHistory(multiplier, isWin = false) {
    gameHistory.unshift({
        multiplier: multiplier,
        isWin: isWin,
        timestamp: new Date()
    });
    
    // Ограничение истории до 10 последних результатов
    if (gameHistory.length > 10) {
        gameHistory.pop();
    }
    
    // Сохранение истории
    localStorage.setItem('rocketHistory', JSON.stringify(gameHistory));
    
    // Обновление отображения истории
    updateHistoryDisplay();
}

// Загрузка истории из localStorage
function loadGameHistory() {
    const savedHistory = localStorage.getItem('rocketHistory');
    if (savedHistory) {
        gameHistory = JSON.parse(savedHistory);
        updateHistoryDisplay();
    }
}

// Обновление отображения истории
function updateHistoryDisplay() {
    historyItemsElement.innerHTML = '';
    
    gameHistory.forEach(item => {
        const historyItem = document.createElement('span');
        historyItem.className = 'history-item ' + (item.isWin ? 'history-win' : 'history-loss');
        historyItem.textContent = item.multiplier + 'x';
        historyItemsElement.appendChild(historyItem);
    });
}

// Назад к главному меню
function goBack() {
    window.location.href = 'index.html';
}

// Инициализация игры при загрузке страницы
document.addEventListener('DOMContentLoaded', initGame);
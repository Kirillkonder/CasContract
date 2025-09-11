let currentGame = null;
let isDemoMode = true;
let userData = null;
let rocketInterval = null;
let currentMultiplier = 1.00;
let userBet = null;
let activePlayers = 1;
let lastExplosionMultiplier = 1.0;
let roundTimer = 10;
let timerInterval = null;
let botBetsInterval = null;
let activeBots = [];
let gameRound = 1;

// Список ботов с разными стратегиями
const bots = [
    { name: "CryptoPro", strategy: "aggressive", avatar: "🤖" },
    { name: "TonMaster", strategy: "conservative", avatar: "👾" },
    { name: "RocketKing", strategy: "moderate", avatar: "🦾" },
    { name: "CryptoWhale", strategy: "aggressive", avatar: "🐋" },
    { name: "TonInvestor", strategy: "conservative", avatar: "💼" },
    { name: "SpaceTraveler", strategy: "moderate", avatar: "👨‍🚀" },
    { name: "MoonRacer", strategy: "aggressive", avatar: "🌙" },
    { name: "StarGazer", strategy: "conservative", avatar: "⭐" },
    { name: "CryptoNinja", strategy: "moderate", avatar: "🥷" },
    { name: "BlockchainPro", strategy: "aggressive", avatar: "⛓️" }
];

// Стратегии кэшаута для ботов (в x)
const botStrategies = {
    conservative: { min: 1.5, max: 3.0 },
    moderate: { min: 2.0, max: 5.0 },
    aggressive: { min: 3.0, max: 8.0 }
};

document.addEventListener('DOMContentLoaded', function() {
    loadUserData();
    setupEventListeners();
    startBotActivity();
    updatePlayersCount(3 + Math.floor(Math.random() * 8)); // 3-10 игроков онлайн
    
    // Запускаем первый раунд через 5 секунд
    setTimeout(startNewRound, 5000);
});

function goBack() {
    window.location.href = 'index.html';
}

async function loadUserData() {
    try {
        const tg = window.Telegram.WebApp;
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            const telegramId = tg.initDataUnsafe.user.id;
            
            const response = await fetch(`/api/user/${telegramId}`);
            if (response.ok) {
                userData = await response.json();
                document.getElementById('balance').textContent = userData.balance.toFixed(2);
                isDemoMode = userData.demo_mode;
                document.getElementById('demo-badge').textContent = isDemoMode ? 'TESTNET' : 'MAINNET';
            }
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

function setupEventListeners() {
    document.getElementById('placeBetBtn').addEventListener('click', placeBet);
    document.getElementById('cashoutBtn').addEventListener('click', cashout);
}

function startNewRound() {
    clearInterval(timerInterval);
    roundTimer = 10;
    updateRoundTimer();
    
    // Генерируем ботов для этого раунда (3-6 ботов)
    const botsInRound = 3 + Math.floor(Math.random() * 4);
    activeBots = [];
    
    for (let i = 0; i < botsInRound; i++) {
        const bot = {...bots[Math.floor(Math.random() * bots.length)]};
        bot.betAmount = generateBotBet(bot.strategy);
        bot.cashoutMultiplier = generateCashoutPoint(bot.strategy);
        bot.id = 'bot-' + Date.now() + '-' + i;
        activeBots.push(bot);
        
        // Бот делает ставку
        addBotBet(bot);
    }
    
    // Запускаем таймер раунда
    timerInterval = setInterval(() => {
        roundTimer--;
        updateRoundTimer();
        
        if (roundTimer <= 0) {
            clearInterval(timerInterval);
            startGame();
        }
    }, 1000);
}

function generateBotBet(strategy) {
    const baseAmount = {
        conservative: 1 + Math.random() * 4,   // 1-5 TON
        moderate: 2 + Math.random() * 8,       // 2-10 TON
        aggressive: 5 + Math.random() * 15     // 5-20 TON
    }[strategy];
    
    return Math.round(baseAmount);
}

function generateCashoutPoint(strategy) {
    const strategyRange = botStrategies[strategy];
    return strategyRange.min + Math.random() * (strategyRange.max - strategyRange.min);
}

function addBotBet(bot) {
    const betsContainer = document.getElementById('betsContainer');
    const noBets = betsContainer.querySelector('.no-bets');
    if (noBets) noBets.remove();
    
    const betItem = document.createElement('div');
    betItem.className = 'bet-item';
    betItem.id = bot.id;
    betItem.innerHTML = `
        <span><span class="bot-avatar">${bot.avatar}</span>${bot.name}</span>
        <span>${bot.betAmount} TON</span>
    `;
    
    betsContainer.appendChild(betItem);
    updateBetsCount();
}

function updateBotsCashout() {
    activeBots.forEach(bot => {
        if (currentMultiplier >= bot.cashoutMultiplier) {
            // Бот забирает выигрыш
            cashoutBot(bot);
        }
    });
}

function cashoutBot(bot) {
    const winAmount = bot.betAmount * currentMultiplier;
    const betElement = document.getElementById(bot.id);
    
    if (betElement) {
        betElement.innerHTML = `
            <span><span class="bot-avatar">${bot.avatar}</span>${bot.name}</span>
            <span style="color: #00b894;">+${winAmount.toFixed(2)} TON (${currentMultiplier.toFixed(2)}x)</span>
        `;
        
        // Удаляем бота из активных через 2 секунды
        setTimeout(() => {
            if (betElement.parentNode) {
                betElement.parentNode.removeChild(betElement);
            }
            activeBots = activeBots.filter(b => b.id !== bot.id);
            updateBetsCount();
        }, 2000);
    }
}

function startBotActivity() {
    // Боты периодически присоединяются к игре
    botBetsInterval = setInterval(() => {
        if (Math.random() < 0.4 && activeBots.length < 8) {
            const newBot = {...bots[Math.floor(Math.random() * bots.length)]};
            newBot.betAmount = generateBotBet(newBot.strategy);
            newBot.cashoutMultiplier = generateCashoutPoint(newBot.strategy);
            newBot.id = 'bot-' + Date.now() + '-' + Math.random();
            activeBots.push(newBot);
            
            addBotBet(newBot);
            updatePlayersCount(activePlayers + 1);
        }
    }, 8000);
}

async function placeBet() {
    if (timerInterval) {
        alert('Идет подготовка к раунду! Подождите ' + roundTimer + ' секунд');
        return;
    }

    if (currentGame) {
        alert('Раунд уже начался!');
        return;
    }

    const betAmount = parseFloat(document.getElementById('betAmount').value);
    
    if (betAmount < 1 || betAmount > 50) {
        alert('Ставка должна быть от 1 до 50 TON');
        return;
    }

    try {
        const tg = window.Telegram.WebApp;
        const telegramId = tg.initDataUnsafe.user.id;

        const response = await fetch('/api/rocket/place-bet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                telegramId: telegramId,
                betAmount: betAmount,
                demoMode: isDemoMode
            })
        });

        const result = await response.json();
        
        if (!response.ok) {
            alert(result.error || 'Ошибка размещения ставки');
            return;
        }

        if (result.success) {
            userBet = {
                betId: result.betId,
                amount: betAmount,
                cashoutMultiplier: 1.00
            };

            document.getElementById('yourBet').textContent = betAmount + ' TON';
            document.getElementById('placeBetBtn').disabled = true;
            document.getElementById('cashoutBtn').disabled = false;

            // Добавляем ставку в список
            const betsContainer = document.getElementById('betsContainer');
            const noBets = betsContainer.querySelector('.no-bets');
            if (noBets) noBets.remove();
            
            const betItem = document.createElement('div');
            betItem.className = 'bet-item user-bet';
            betItem.id = 'user-bet';
            betItem.innerHTML = `
                <span>👤 Вы</span>
                <span>${betAmount} TON</span>
            `;
            
            betsContainer.appendChild(betItem);
            updateBetsCount();

        } else {
            alert(result.error || 'Ошибка размещения ставки');
        }

    } catch (error) {
        console.error('Error placing bet:', error);
        alert('Ошибка соединения');
    }
}

async function cashout() {
    if (!userBet || !currentGame) {
        alert('Нет активной ставки');
        return;
    }

    try {
        const tg = window.Telegram.WebApp;
        const telegramId = tg.initDataUnsafe.user.id;

        const response = await fetch('/api/rocket/cashout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                telegramId: telegramId,
                betId: userBet.betId,
                multiplier: currentMultiplier,
                demoMode: isDemoMode
            })
        });

        const result = await response.json();
        
        if (!response.ok) {
            alert(result.error || 'Ошибка вывода средств');
            return;
        }

        if (result.success) {
            const winAmount = userBet.amount * currentMultiplier;
            alert(`Вы успешно забрали ${winAmount.toFixed(2)} TON (${currentMultiplier.toFixed(2)}x)`);
            
            // Обновляем баланс
            if (userData) {
                userData.balance = result.newBalance;
                document.getElementById('balance').textContent = userData.balance.toFixed(2);
            }

            // Обновляем отображение ставки
            const userBetElement = document.getElementById('user-bet');
            if (userBetElement) {
                userBetElement.innerHTML = `
                    <span>👤 Вы</span>
                    <span style="color: #00b894;">+${winAmount.toFixed(2)} TON (${currentMultiplier.toFixed(2)}x)</span>
                `;
                
                // Удаляем через 2 секунды
                setTimeout(() => {
                    if (userBetElement.parentNode) {
                        userBetElement.parentNode.removeChild(userBetElement);
                    }
                    updateBetsCount();
                }, 2000);
            }

            resetUserBet();

        } else {
            alert(result.error || 'Ошибка вывода средств');
        }

    } catch (error) {
        console.error('Error cashing out:', error);
        alert('Ошибка соединения');
    }
}

function startGame() {
    if (currentGame) return;

    currentGame = {
        startTime: Date.now(),
        crashed: false,
        crashPoint: generateCrashPoint()
    };

    console.log('Crash point:', currentGame.crashPoint.toFixed(2) + 'x');

    currentMultiplier = 1.00;
    updateMultiplierDisplay();

    const rocket = document.getElementById('rocket');
    rocket.style.bottom = '50px';

    // Запускаем анимацию ракеты
    rocketInterval = setInterval(updateRocket, 100);
}

function generateCrashPoint() {
    // Вероятность краха на разных множителях
    const probabilities = [
        { multiplier: 1.5, chance: 0.3 },
        { multiplier: 2.0, chance: 0.2 },
        { multiplier: 3.0, chance: 0.15 },
        { multiplier: 5.0, chance: 0.1 },
        { multiplier: 10.0, chance: 0.05 },
        { multiplier: 20.0, chance: 0.02 },
        { multiplier: 50.0, chance: 0.01 }
    ];

    let random = Math.random();
    let cumulative = 0;

    for (const prob of probabilities) {
        cumulative += prob.chance;
        if (random <= cumulative) {
            return prob.multiplier;
        }
    }

    // Если не выпало ни одно из вероятностных значений, возвращаем случайное от 1.1 до 100
    return 1.1 + Math.random() * 98.9;
}

function updateRocket() {
    if (!currentGame) return;

    // Увеличиваем множитель
    currentMultiplier += 0.01;
    updateMultiplierDisplay();

    // Обновляем позицию ракеты
    const rocket = document.getElementById('rocket');
    const maxHeight = 250;
    const progress = Math.min(currentMultiplier / currentGame.crashPoint, 1);
    rocket.style.bottom = (50 + progress * maxHeight) + 'px';

    // Создаем след
    createRocketTrail();

    // Проверяем кэшаут ботов
    updateBotsCashout();

    // Проверяем краш
    if (currentMultiplier >= currentGame.crashPoint) {
        endGame();
    }
}

function createRocketTrail() {
    const rocket = document.getElementById('rocket');
    const rocketRect = rocket.getBoundingClientRect();
    const canvasRect = document.getElementById('rocketCanvas').getBoundingClientRect();
    
    const trail = document.createElement('div');
    trail.className = 'trail';
    trail.style.left = (rocketRect.left - canvasRect.left + rocketRect.width / 2) + 'px';
    trail.style.bottom = (rocketRect.bottom - canvasRect.bottom) + 'px';
    
    document.getElementById('rocketCanvas').appendChild(trail);
    
    // Удаляем след через 1 секунду
    setTimeout(() => {
        if (trail.parentNode) {
            trail.parentNode.removeChild(trail);
        }
    }, 1000);
}

function endGame() {
    clearInterval(rocketInterval);
    currentGame.crashed = true;

    // Создаем взрыв
    createExplosion();

    // Сбрасываем все активные ставки пользователей
    if (userBet) {
        const userBetElement = document.getElementById('user-bet');
        if (userBetElement) {
            userBetElement.innerHTML = `
                <span>👤 Вы</span>
                <span style="color: #ff6b6b;">Проигрыш (${currentMultiplier.toFixed(2)}x)</span>
            `;
            
            setTimeout(() => {
                if (userBetElement.parentNode) {
                    userBetElement.parentNode.removeChild(userBetElement);
                }
                updateBetsCount();
            }, 2000);
        }
        resetUserBet();
    }

    // Сбрасываем ботов
    activeBots.forEach(bot => {
        const botElement = document.getElementById(bot.id);
        if (botElement) {
            botElement.innerHTML = `
                <span><span class="bot-avatar">${bot.avatar}</span>${bot.name}</span>
                <span style="color: #ff6b6b;">Проигрыш (${currentMultiplier.toFixed(2)}x)</span>
            `;
            
            setTimeout(() => {
                if (botElement.parentNode) {
                    botElement.parentNode.removeChild(botElement);
                }
            }, 2000);
        }
    });

    activeBots = [];
    lastExplosionMultiplier = currentMultiplier;

    // Запускаем новый раунд через 5 секунд
    setTimeout(() => {
        currentGame = null;
        gameRound++;
        startNewRound();
    }, 5000);
}

function createExplosion() {
    const rocket = document.getElementById('rocket');
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    explosion.textContent = '💥';
    explosion.style.left = rocket.style.left;
    explosion.style.bottom = rocket.style.bottom;
    
    document.getElementById('rocketCanvas').appendChild(explosion);
    
    // Удаляем взрыв через 1 секунду
    setTimeout(() => {
        if (explosion.parentNode) {
            explosion.parentNode.removeChild(explosion);
        }
    }, 1000);
}

function updateMultiplierDisplay() {
    document.getElementById('multiplierDisplay').textContent = currentMultiplier.toFixed(2) + 'x';
    document.getElementById('currentMultiplier').textContent = currentMultiplier.toFixed(2) + 'x';
    
    if (userBet) {
        const potentialWin = userBet.amount * currentMultiplier;
        document.getElementById('potentialWin').textContent = potentialWin.toFixed(2) + ' TON';
    }
}

function resetUserBet() {
    userBet = null;
    document.getElementById('yourBet').textContent = '0 TON';
    document.getElementById('potentialWin').textContent = '0 TON';
    document.getElementById('placeBetBtn').disabled = false;
    document.getElementById('cashoutBtn').disabled = true;
}

function updatePlayersCount(count) {
    activePlayers = count;
    document.getElementById('playersCount').textContent = count;
}

function updateBetsCount() {
    const betsContainer = document.getElementById('betsContainer');
    const betCount = betsContainer.querySelectorAll('.bet-item').length;
    document.getElementById('activeBetsCount').textContent = betCount;
    
    if (betCount === 0) {
        const noBets = document.createElement('div');
        noBets.className = 'no-bets';
        noBets.textContent = 'Ставок пока нет';
        betsContainer.appendChild(noBets);
    }
}

function updateRoundTimer() {
    document.getElementById('roundTimer').textContent = roundTimer + 'с';
}
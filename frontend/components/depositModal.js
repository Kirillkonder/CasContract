// Управление модальным окном депозита
function openDepositModal() {
    document.getElementById('deposit-modal').style.display = 'block';
    document.getElementById('deposit-amount').value = '';
    document.getElementById('deposit-amount').focus();
}

function closeDepositModal() {
    document.getElementById('deposit-modal').style.display = 'none';
}

function openWithdrawModal() {
    // Заглушка для вывода средств
    alert('Функция вывода средств будет доступна в ближайшее время!');
}

// Закрытие модального окна при клике вне его
window.onclick = function(event) {
    const modal = document.getElementById('deposit-modal');
    if (event.target === modal) {
        closeDepositModal();
    }
}
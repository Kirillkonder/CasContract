const express = require('express');
const router = express.Router();

// Подключаем все роуты
router.use('/admin', require('./admin'));
router.use('/user', require('./user'));
router.use('/mines', require('./mines'));
router.use('/rocket', require('./rocket'));
router.use('/payment', require('./payment'));

module.exports = router;
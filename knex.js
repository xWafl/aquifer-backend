const environment = 'production';
const config = require('./knexfile')[environment];
module.exports = require('knex')(config);

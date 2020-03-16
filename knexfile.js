// Update with your config settings.

const dotenv = require('dotenv');
dotenv.config();

module.exports = {

    development: {
        client: 'pg',
        connection: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        },
        migrations: {
            directory: __dirname + '/knex/migrations',
        },
        seeds: {
            directory: __dirname + '/knex/seeds'
        }
    },

    production: {
        client: 'pg',
        connection: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        },
        migrations: {
            tableName: 'knex_migrations'
        }
    },
    debug: true,
};

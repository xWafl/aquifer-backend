// Update with your config settings.

const dotenv = require('dotenv');
dotenv.config();

module.exports = {

    development: {
        client: 'pg',
        connection: {
            host : process.env.HOST,
            user : process.env.USER,
            password : process.env.PASSWORD,
            database : process.env.DATABASE,
            port: process.env.PORT,
            ssl: true,
            charset: 'utf8'
        },
        migrations: {
            directory: __dirname + '/knex/migrations',
        },
        seeds: {
            directory: __dirname + '/knex/seeds'
        }
    },

    staging: {
        client: 'postgresql',
        connection: {
            database: 'my_db',
            user: 'username',
            password: 'password'
        },
        pool: {
            min: 2,
            max: 10
        },
        migrations: {
            tableName: 'knex_migrations'
        }
    },

    production: {
        client: 'pg',
        connection: {
            host : process.env.HOST,
            user : process.env.USER,
            password : process.env.PASSWORD,
            database : process.env.DATABASE,
            port: process.env.PORT,
            ssl: true,
            charset: 'utf8'
        },
        migrations: {
            tableName: 'knex_migrations'
        }
    },
    debug: true,
};

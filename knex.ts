const knex = require('knex')({
    client: 'pg',
    version: '7.2',
    connection: {
        host: process.env.HOST,
        user: process.env.USER,
        password: process.env.PASSWORD,
        database: process.env.DATABASE,
        ssl: {
            rejectUnauthorized: false
        },
    }
});

export {knex}

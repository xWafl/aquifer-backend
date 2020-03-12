declare var require: any;
declare var process: any;

// const firebase = require("firebase/app");

const app = require('express')();
const http = require('http').Server(app);
const moment = require('moment');
// const io = require('socket.io').listen(http);
const port = process.env.PORT || 5000;

const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    user: process.env.USER,
    password: process.env.PASSWORD,
    host: process.env.HOST,
    database: process.env.DATABASE,
});

client.connect()
    .catch((err) => {
        console.error(err);
        client.end();
    });

// client.query('SELECT table_schema,table_name FROM information_schema.tables;', (err, res) => {
//     if (err) throw err;
//     for (let row of res.rows) {
//         console.log(JSON.stringify(row));
//     }
//     client.end();
// });

// const server = app()
    // .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
    // .listen(port, () => console.log(`Listening on ${port}`));

const { setWsHeartbeat } = require("ws-heartbeat/server");
const { Server } = require('ws');

class User {
    constructor(public username: string, public usernum: number, public currentChannel: number, public id: number, public messages: Array<number>){}
}

class Message {
    constructor(public user: User, public utctime: number, public message: string, public channel: number, public id: number){}
}

class Channel {
    constructor(public name: string, public id: number, public messages: Array<number>) {}
}

let messages: Array<Message> = [];
let highestId = 0;
let highestUserId = 0;
let highestChannelId = 0;
let users = {};
let channels = {};

const checkUser = (checkedUser: User, users: Object) => {
    for (let i in users) {
        if (users[i].id === checkedUser.id) {
            return true;
        }
    }
    return false;
};

const getHighestFromArr = (arr: Array<number>) => {
    for (let i = 0; i < Math.max(...arr); i++) {
        if (arr.indexOf(+i) === -1) {
            return +i;
        }
    }
};

const sendToClients = (category, data) => {
    wss.clients.forEach(function each(ws) {
        ws.send(JSON.stringify([category, data]));
    })
};

const updateMessagesFromDb = () => {
    console.log("Getting message from database...");
    client.query("SELECT * FROM messages;")
        .then((result) => {
            let messageIds: Array<number> = [];
            for (let message of result.rows) {
                console.log(message);
                let userFound = false;
                let msgUser: any;
                let takenIds: Array<number> = [];
                client.query("SELECT * FROM users WHERE id = " + message.userid + ";")
                    .then((res) => {
                        for (let user of res.rows) {
                            takenIds.push(user.id);
                            if (user.id === message.userid) {
                                userFound = true;
                                msgUser = user;
                                console.log("User found!");
                                console.log(user);
                            }
                        }
                        highestUserId = getHighestFromArr(takenIds);
                    })
                    .then(() => {
                        let messageUser: User;
                        if (userFound === true) {
                            messageUser = new User (
                                msgUser.username,
                                msgUser.usernum,
                                msgUser.currentChannel,
                                msgUser.id,
                                []
                            );
                        } else {
                            messageUser = new User (
                                "DeletedUser",
                                9999,
                                0,
                                0,
                                [],
                            );
                        }
                        const newMessage = new Message (
                            messageUser,
                            message.date,
                            message.message,
                            message.channel,
                            message.id
                        );
                        messages.push(newMessage);
                    })
                    .catch((err) => {
                        console.error(err);
                    });
                messageIds.push(message.id);
            }
            highestId = getHighestFromArr(messageIds);
        })
};

const init = () => {
    console.log("Initializing...");
    updateMessagesFromDb();
};

const server = http.listen(port, (err) => {
    if (err) throw err;
    console.log("HTTP server listening on: " + port);
    init();
});

const wss = new Server({ server });

wss.on('connection', function connection(ws) {
    ws.isAlive = true;
    ws.on('message', function incoming(data) {
        if (data !== '{"kind":"ping"}') {
            const [category, message] = JSON.parse(data);
            if (category === "message") {
                const msgInfo = message;
                const newMessage = new Message (
                    msgInfo.user,
                    moment().valueOf(),
                    msgInfo.message,
                    msgInfo.channel,
                    ++highestId
                );
                const query = "INSERT INTO messages VALUES (" + newMessage.user.id + ", " + newMessage.utctime + ", '" + newMessage.message + "', " + newMessage.channel  + ", " + newMessage.id + ");";
                console.log(query);
                client.query(query)
                    .catch((err) => {
                        console.error(err);
                    });
                // console.log(msgInfo.user);
                channels[newMessage.channel].messages.push(newMessage.id);
                msgInfo.user.messages.push(newMessage.id);
                const isUserAuth = checkUser(msgInfo.user, users);
                if (isUserAuth === true) {
                    messages.push(newMessage);
                    sendToClients("message", newMessage);
                    // console.log(msgInfo.user.messages);
                }
            }
            if (category === "editMessage") {
                for (let i in messages) {
                    if (messages[i].id === message.id) {
                        messages[i].message = message.msg;
                    }
                }
                const newMessage = {...message};
                sendToClients("editMessage", newMessage);
            }
            if (category === "deleteMessage") {
                for (let i in messages) {
                    if (messages[i].id === message) {
                        const query = "DELETE FROM messages WHERE id = " + message + ";";
                        messages.splice(+i, 1);
                        sendToClients("deleteMessage", +i);
                    }
                }
            }
            if (category === "queryMessages") {
                sendToClients("messageList", messages);
            }
            if (category === "queryChannels") {
                sendToClients("channelList", channels);
            }
            if (category === "newUser") {
                const theUser = new User (message.username, message.userNum, 1, ++highestUserId, message.messages);
                const query = "INSERT INTO users VALUES ('" + theUser.username + "', " + theUser.usernum + ", " + theUser.currentChannel + ", " + theUser.id + ");";
                console.log(query);
                client.query(query)
                    .catch((err) => {
                        console.error(err);
                    });
                ws.userDetails = theUser;
                const arrayClients = Array.from(wss.clients);
                // @ts-ignore
                const arrayUsers: Array<User> = Array.from(arrayClients, x => x.userDetails).filter(l => l != null);
                users = arrayUsers.reduce((acc, elem) => {
                    acc[elem.id] = elem;
                    return acc;
                }, {});
                ws.send(JSON.stringify(["bestowId", theUser.id]));
                sendToClients("newUser", users);
            }
            if (category === "loseUser") {
                delete users[message.id];
                delete users[ws.userId];
                const query = "DELETE FROM users WHERE id = " + message.id + ";";
                client.query(query)
                    .catch((err) => {
                        console.error(err);
                    });
                sendToClients("loseUser", users);
            }
            if (category === "newChannel") {
                const channelId = ++highestChannelId;
                channels[channelId] = new Channel (message.name, channelId, []);
                sendToClients("newChannel", channels);
            }
            if (category === "deleteChannel") {
                delete channels[message];
                sendToClients("deleteChannel", channels);
            }
        }
    });
});

setWsHeartbeat(wss, (ws, data) => {
    if (data === '{"kind":"ping"}') { // send pong if recieved a ping.
        ws.send('{"kind":"pong"}');
    }
}, 30000);
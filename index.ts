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

const knex = require('knex')({
    client: 'pg',
    version: '7.2',
    connection: {
        host : process.env.HOST,
        user : process.env.USER,
        password : process.env.PASSWORD,
        database : process.env.DATABASE,
        ssl: true
    }
});

// const server = app()
    // .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
    // .listen(port, () => console.log(`Listening on ${port}`));

const { setWsHeartbeat } = require("ws-heartbeat/server");
const { Server } = require('ws');

class User {
    constructor(public username: string, public userNum: number, public currentChannel: number, public id: number, public messages: Array<number>){}
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
    if (arr.length === 0) {
        return 0;
    }
    // for (let i = 1; i <= Math.max(...arr) + 1; i++) {
    //     // console.log(i + "|" + arr.indexOf(+i) + "|" + Math.max(...arr));
    //     if (arr.indexOf(+i) === -1) {
    //         // console.log("done");
    //         return +i;
    //     }
    // }
    return Math.max(...arr) + 1;
};

const sendToClients = (category, data) => {
    wss.clients.forEach(function each(ws) {
        ws.send(JSON.stringify([category, data]));
    })
};

const updateMessagesFromDb = () => {
    console.log("Getting messages from database...");
    knex.from("messages").select("*")
        .then(rows => {
            let messageIds: Array<number> = [];
            for (let message of rows) {
                // console.log(message);
                let userFound = false;
                let msgUser: any;
                let takenIds: Array<number> = [];
                knex("users")
                    .where({id: message.userid})
                    .then(res => {
                        for (let user of res) {
                            takenIds.push(user.id);
                            if (user.id === message.userid) {
                                userFound = true;
                                msgUser = user;
                                // console.log("User found!");
                                // console.log(user);
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
                        throw err;
                    });
                messageIds.push(message.id);
            }
            highestId = getHighestFromArr(messageIds);
        })
        .catch((err) => {
            console.error(err);
            throw err;
        });
};

const updateChannelsFromDb = () => {
    console.log("Getting channels from database...");
    knex.from("channels").select("*")
        .then(rows => {
            for (const channel of rows) {
                // console.log(channel);
                channels[channel.id] = new Channel(channel.name, channel.id, channel.messages);
            }
            // console.log("Channels: ");
            // console.log(channels);
        })
        .catch((err) => {
            console.error(err);
        });
};

const deleteOldUsers = (sNum) => {
    console.log("num: " + sNum);
    knex("users")
        .where({snum: sNum})
        .del()
        .catch((err) => {
            console.error(err);
            throw err;
        });
};

const incrementSNum = () => {
    return new Promise((resolve) => {
        let sNum = 0;
        knex("serverid")
            .then((rows) => {
                console.log(rows[0].snum);
                sNum = rows[0].snum
            })
            .then(() => {
                console.log("sNum: " + sNum);
                knex("serverid")
                    .update({snum: Number(Number(sNum) + 1)})
                    .catch((err) => {
                        console.error(err);
                        throw err;
                    });
                resolve(sNum);
            })
            .catch((err) => {
                console.error(err);
                throw err;
            });
    });
};

const init = () => {
    console.log("Initializing...");
    incrementSNum()
        .then((sNum) => {
            deleteOldUsers(sNum);
        })
        .catch((err) => {
            console.error(err);
            throw err;
        });
    updateMessagesFromDb();
    updateChannelsFromDb();
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
                const queryMessage = {
                    userid: newMessage.user.id,
                    date: newMessage.utctime,
                    message: newMessage.message,
                    channel: newMessage.channel,
                    id: newMessage.id
                };
                // const query = "INSERT INTO messages VALUES (" + newMessage.user.id + ", " + newMessage.utctime + ", '" + newMessage.message + "', " + newMessage.channel  + ", " + newMessage.id + ");";
                // console.log(query);
                knex("messages").insert(queryMessage)
                    .catch((err) => {
                        console.error(err);
                        throw err;
                    });
                // console.log(msgInfo.user);
                channels[newMessage.channel].messages.push(newMessage.id);
                knex("channels")
                    .where({id: newMessage.channel})
                    .update({messages: knex.raw('array_append(messages, ?)', [newMessage.id])})
                    .catch((err) => {
                        console.error(err);
                        throw err;
                    });

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
                        knex("messages")
                            .where({id: message})
                            .del()
                            .catch((err) => {
                                console.error(err);
                                throw err;
                            });
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
                let sNum = 0;
                knex("serverid")
                    .then((rows) => {
                        sNum = rows[0].snum
                    })
                    .then(() => {
                        const theUser = new User (message.username, message.userNum, 1, ++highestUserId, message.messages);
                        const queryDetails = {
                            username: theUser.username,
                            usernum: theUser.userNum,
                            currentchannel: theUser.currentChannel,
                            id: theUser.id,
                            snum: sNum
                        };
                        knex("users")
                            .insert(queryDetails)
                            .catch((err) => {
                                console.error(err);
                                throw err;
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
                    })
                    .catch((err) => {
                        console.error(err);
                        throw err;
                    });
            }
            if (category === "loseUser") {
                delete users[message.id];
                delete users[ws.userId];
                knex("users")
                    .where({id: message.id})
                    .del()
                    .catch((err) => {
                        console.error(err);
                        throw err;
                    });
                knex("messages")
                    .where({userid: message.id})
                    .update({userid: 0})
                    .catch((err) => {
                        console.error(err);
                        throw err;
                    });
                sendToClients("loseUser", users);
            }
            if (category === "newChannel") {
                const channelId = ++highestChannelId;
                const newChannel = new Channel (message.name, channelId, []);
                channels[channelId] = newChannel;
                knex("channels")
                    .insert({name: newChannel.name, id: newChannel.id, messages: []})
                    .catch((err) => {
                        console.error(err);
                        throw err;
                    });
                sendToClients("newChannel", channels);
            }
            if (category === "deleteChannel") {
                delete channels[message];
                knex("channels")
                    .where({id: message})
                    .del()
                    .catch(err => {
                        console.error(err);
                        throw err;
                    });
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
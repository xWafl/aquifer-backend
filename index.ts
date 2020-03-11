declare var require: any;
declare var process: any;

// const firebase = require("firebase/app");

const app = require('express')();
const http = require('http').Server(app);
const moment = require('moment');
// const io = require('socket.io').listen(http);
const port = process.env.PORT || 5000;

// const server = app()
    // .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
    // .listen(port, () => console.log(`Listening on ${port}`));

const server = http.listen(port, (err) => {
    if (err) throw err;
    console.log("HTTP server listening on: " + port);
});

const { setWsHeartbeat } = require("ws-heartbeat/server");
const { Server } = require('ws');

const wss = new Server({ server });

class User {
    constructor(public username: string, public usernum: number, public currentChannel: number, public id: number, public messages: Array<number>){}
}

class Message {
    constructor(public user: User, public utctime: string, public date: string, public message: string, public channel: string, public id: number, public active: boolean){}
}

class Channel {
    constructor(public name: string, public id: number, public messages: Array<Message>) {}
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

const sendToClients = (category, data) => {
    wss.clients.forEach(function each(ws) {
        ws.send(JSON.stringify([category, data]));
    })
};

wss.on('connection', function connection(ws) {
    ws.isAlive = true;
    ws.on('message', function incoming(data) {
        if (data !== '{"kind":"ping"}') {
            const [category, message] = JSON.parse(data);
            if (category === "message") {
                const msgInfo = message;
                const newMessage = new Message (
                    msgInfo.user,
                    moment(),
                    moment().calendar(),
                    msgInfo.message,
                    msgInfo.channel,
                    ++highestId,
                    true,
                );
                console.log(msgInfo.user);
                msgInfo.user.messages.push(newMessage.id);
                const isUserAuth = checkUser(msgInfo.user, users);
                if (isUserAuth === true) {
                    messages.push(newMessage);
                    sendToClients("message", newMessage);
                    console.log(msgInfo.user.messages);
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
                const theUser = new User (message.username, message.usernum, 1, ++highestUserId, [0]);
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
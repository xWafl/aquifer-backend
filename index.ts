declare var require: any;
declare var process: any;

// const firebase = require("firebase/app");

const app = require('express')();
const http = require('http').Server(app);
const moment = require('moment');
// const io = require('socket.io').listen(http);
const port = process.env.PORT || 6500;

// const server = app()
    // .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
    // .listen(port, () => console.log(`Listening on ${port}`));

const server = http.listen(port, (err) => {
    if (err) throw err;
    console.log("HTTP server listening on: " + port);
});

const { Server } = require('ws');

const wss = new Server({ server });

class User {
    constructor(public username: string, public usernum: number, public currentChannel: number, public id: number){}
}

class Message {
    constructor(public user: User, public utctime: string, public date: string, public message: string, public channel: string, public id: number){}
}

class Channel {
    constructor(public name: string, public id: number, public messages: Array<Message>) {}
}

let messages: Array<Message> = [];
let highestId = 0;
let highestUserId = 0;
let highestChannelId = 0;
let clients = [];
let users = {};
let channels = {};

wss.on('connection', function connection(ws) {
    clients.push(ws);
    ws.on('message', function incoming(data) {
        // console.log(messages);
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
            );
            messages.push(newMessage);
            for (const client of clients) {
                // console.log(JSON.stringify(["message", newMessage]));
                client.send(JSON.stringify(["message", newMessage]));
            }
            console.log('received: %s', message.message);
        }
        if (category === "editMessage") {
            for (let i in messages) {
                if (messages[i].id === message.id) {
                    console.log("New message: " + message.msg + "|" + messages[i].message);
                    messages[i].message = message.msg;
                }
            }
            const newMessage = {...message};
            for (const client of clients) {
                client.send(JSON.stringify(["editMessage", newMessage]))
            }
        }
        if (category === "deleteMessage") {
            for (let i in messages) {
                if (messages[i].id === message) {
                    messages.splice(+i, 1);
                    for (const client of clients) {
                        client.send(JSON.stringify(["deleteMessage", +i]));
                    }
                }
            }
        }
        if (category === "queryMessages") {
            // console.log("Messages queried!");
            // console.log(messages);
            for (const client of clients) {
                console.log(JSON.stringify(["messageList", messages]));
                client.send(JSON.stringify(["messageList", messages]));
            }
        }
        if (category === "queryChannels") {
            for (const client of clients) {
                client.send(JSON.stringify(["channelList", channels]));
            }
        }
        if (category === "newUser") {
            const theUser = new User (message.username, message.usernum, 1, ++highestUserId);
            users[theUser.id] = theUser;
            // console.log(users);
            ws.send(JSON.stringify(["bestowId", theUser.id]));
            for (const client of clients) {
                client.send(JSON.stringify(["newUser", users]));
            }
        }
        if (category === "loseUser") {
            console.log("ID: " + message.id);
            const id = message.id;
            delete users[id];
            console.log(users);
            for (const client of clients) {
                client.send(JSON.stringify(["loseUser", users]));
            }
        }
        if (category === "newChannel") {
            const channelId = ++highestChannelId;
            channels[channelId] = new Channel (message.name, channelId, []);
            for (const client of clients) {
                client.send(JSON.stringify(["newChannel", channels]));
            }
        }
    });
    console.log(JSON.stringify(["connected", "connected"]));
    ws.send(JSON.stringify(["connected", "connected"]));
});


// app.get('/', function(req, res){
//     res.sendFile(__dirname + '/index.html');
// });  

// io.on('connection', function(socket){
//     // console.log("we're connected");
//     socket.on('chatmessage', function(msg){
//         console.log("New message: " + msg);
//         io.emit('chatmessage', {msg: msg});
//     });
// });

// http.listen(port, function(){
//     console.log('listening on *:' + port);
// });
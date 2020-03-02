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
})

const { Server } = require('ws');

const wss = new Server({ server });

let messages = [];
let highestId = 0;
let clients = [];

wss.on('connection', function connection(ws) {
    clients.push(ws);
    ws.on('message', function incoming(data) {
        // console.log(messages);
        const [category, message] = JSON.parse(data);
        if (category === "message") {
            const msgInfo = message;
            const newMessage = {
                user: msgInfo.user,
                utctime: moment(),
                date: moment().calendar(),
                message: msgInfo.message,
                channel: msgInfo.channel,
                id: ++highestId,
            }
            messages.push(newMessage);
            for (const client of clients) {
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
            console.log("Messages queried!");
            console.log(messages);
            for (const client of clients) {
                client.send(JSON.stringify(["messageList", messages]));
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

http.listen(port, function(){
    console.log('listening on *:' + port);
});
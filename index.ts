declare var require: any;
declare var process: any;

const app = require('express')();
const http = require('http').Server(app);
const moment = require('moment');
const port = process.env.PORT ?? 5000;

const {setWsHeartbeat} = require("ws-heartbeat/server");
const {Server} = require('ws');

import {knex} from './knex';
import {User, Message, Channel} from './interfaces';
import {checkUser} from "./helpers";
import {init, getHighestId} from './init';
import {editMessage} from "./wss";

let messages: Array<Message> = [];
let highestUserId = 0;
let highestChannelId = 0;
let users = {};
let channels = {};
let highestId = 0;

const sendToClients = (category, data) => {
    wss.clients.forEach(function each(ws) {
        ws.send(JSON.stringify([category, data]));
    })
};

const server = http.listen(port, async (err) => {
    if (err) throw err;
    console.log("HTTP server listening on: " + port);
    init(messages, channels);
    highestId = await getHighestId();
});

const wss = new Server({server});

wss.on('connection', function connection(ws) {
    ws.isAlive = true;
    ws.on('message', async (data) => {
        if (data !== '{"kind":"ping"}') {
            const [category, message] = JSON.parse(data);
            if (category === "message") {
                const msgInfo = message;
                msgInfo.utcTime = moment().valueOf();
                msgInfo.id = ++highestId;
                knex("messages").insert({
                    userid: msgInfo.user.id,
                    utctime: moment().valueOf(),
                    message: msgInfo.message,
                    channel: msgInfo.channel,
                    id: highestId
                })
                    .catch((err) => {
                        throw err;
                    });
                channels[msgInfo.channel].messages.push(msgInfo.id);
                knex("channels")
                    .where({id: msgInfo.channel})
                    .update({messages: knex.raw('array_append(messages, ?)', [msgInfo.id])})
                    .catch((err) => {
                        throw err;
                    });

                msgInfo.user.messages.push(msgInfo.id);
                if (checkUser(msgInfo.user, users)) {
                    messages.push(msgInfo);
                    sendToClients("message", msgInfo);
                }
            }
            if (category === "editMessage") {
                editMessage(messages, message);
                sendToClients("editMessage", message);
            }
            if (category === "deleteMessage") {
                const selectedMessage = messages.findIndex(l => l.id === message);
                knex("messages")
                    .where({id: message})
                    .del()
                    .catch((err) => {
                        throw err;
                    });
                messages.splice(selectedMessage, 1);
                sendToClients("deleteMessage", selectedMessage);
            }
            if (category === "queryMessages") {
                sendToClients("messageList", messages);
            }
            if (category === "queryChannels") {
                sendToClients("channelList", channels);
            }
            if (category === "newUser") {
                const rows = await knex("serverid");
                const sNum = rows[0].snum;
                const theUser: User = {
                    username: message.username,
                    usernum: message.userNum,
                    currentChannel: 1,
                    id: ++highestUserId,
                    messages: message.messages
                };
                const queryDetails = {
                    username: theUser.username,
                    usernum: theUser.usernum,
                    currentchannel: theUser.currentChannel,
                    id: theUser.id,
                    snum: sNum
                };
                knex("users")
                    .insert(queryDetails)
                    .catch((err) => {
                        throw err;
                    });
                ws.userDetails = theUser;
                const arrayClients = Array.from(wss.clients);
                // @ts-ignore
                const arrayUsers: Array<User> = Array.from(arrayClients, x => x.userDetails).filter(l => l != null);
                users = arrayUsers.reduce((acc, elem) => {acc[elem.id] = elem;return acc;}, {});
                ws.send(JSON.stringify(["bestowId", theUser.id]));
                sendToClients("newUser", users);
            }
            if (category === "loseUser") {
                delete users[message.id];
                delete users[ws.userId];
                knex("users")
                    .where({id: message.id})
                    .del()
                    .catch((err) => {
                        throw err;
                    });
                knex("messages")
                    .where({userid: message.id})
                    .update({userid: 0})
                    .catch((err) => {
                        throw err;
                    });
                sendToClients("loseUser", users);
            }
            if (category === "newChannel") {
                const channelId = ++highestChannelId;
                const newChannel: Channel = {
                    name: message.name,
                    id: channelId,
                    messages: []
                };
                channels[channelId] = newChannel;
                knex("channels")
                    .insert({name: newChannel.name, id: newChannel.id, messages: []})
                    .catch((err) => {
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
                        throw err;
                    });
                knex("messages")
                    .where({channel: message})
                    .del()
                    .catch(err => {
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

declare var require: any;
declare var process: any;

const http = require('http').Server();
const moment = require('moment');
const wsPort = process.env.PORT ?? 5000;

// app.listen(wsPort);

const {setWsHeartbeat} = require("ws-heartbeat/server");
const {Server} = require('ws');

const knex = require('./knex');

import {User, Message, Channel} from './interfaces';
import {checkUser, filterObjToArr} from "./helpers";
import {init, getHighestId, getHighestChannel, getHighestServer} from './init';
import {editMessage} from "./wss";

let messages: Array<Message> = [];
let highestChannelId = 0;
let users = {};
let channels = {};
let servers = {};
let highestId = 0;

const sendToClients = (category, data) => {
    wss.clients.forEach(function each(ws) {
        ws.send(JSON.stringify([category, data]));
    })
};

const checkAuth = async (seshkey: string) => {
    const matchingSK = await knex("accounts").where({seshkey: seshkey}).select("*");
    return matchingSK.length > 0;
};

const getInfoBySeshkey = async (seshkey: string) => {
    const matchingSK = await knex("accounts").where({seshkey: seshkey}).select("*");
    const user: User = {
        username: matchingSK[0].username,
        usernum: matchingSK[0].usernum,
        currentChannel: matchingSK[0].currentchannel,
        id: matchingSK[0].id,
        messages: matchingSK[0].messages
    };
    return user;
};

const app = require("./auth");

http.on("request", app);

const server = http.listen(wsPort, async (err) => {
    if (err) throw err;
    console.log("HTTP server listening on: " + wsPort);
    init(messages, channels, servers);
    highestId = await getHighestId();
    highestChannelId = await getHighestChannel();
});

process.on('uncaughtException', function (err) {
    console.log(err);
});

const wss = new Server({server});

wss.on('connection', function connection(ws) {
    ws.isAlive = true;
    ws.on('message', async (data) => {
        if (data !== '{"kind":"ping"}') {
            const [category, seshkey, message] = JSON.parse(data);
            if (category === "message") {
                const userInfo = await getInfoBySeshkey(seshkey);
                let msgInfo: Message = {
                    user: userInfo,
                    utcTime: moment().valueOf(),
                    id: ++highestId,
                    channel: message.channel,
                    message: message.message
                };
                knex("messages")
                    .insert({
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
                knex("accounts")
                    .where({seshkey: seshkey})
                    .update({messages: knex.raw('array_append(messages, ?)', [msgInfo.id])})
                    .catch(err => {
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
                // const user = getInfoBySeshkey(seshkey);
                knex("messages")
                    .where({id: message})
                    .del()
                    .catch((err) => {
                        throw err;
                    });
                knex("accounts")
                    .where({seshkey: seshkey})
                    .update({messages: knex.raw('array_remove(messages, ?)', message)})
                    .catch((err) => {
                        throw err;
                    });
                messages.splice(selectedMessage, 1);
                sendToClients("deleteMessage", selectedMessage);
            }
            if (category === "queryMessages") {
                sendToClients("messageList", messages.filter(l => l.channel === message));
            }
            if (category === "queryChannels") {
                sendToClients("channelList", filterObjToArr(channels, "server", message));
            }
            if (category === "queryServers") {
                sendToClients("serverList", servers);
            }
            if (category === "newUser") {
                const isAuth = checkAuth(seshkey);
                if (isAuth) {
                    await knex("accounts")
                        .where({seshkey: seshkey})
                        .update({status: "online"})
                        .catch(e => {
                            throw e;
                        });
                    const account = await knex("accounts")
                        .where({seshkey: seshkey})
                        .select("*")
                        .catch(e => {
                            throw e;
                        });
                    let theUser: User;
                    if (account.length > 0) {
                        theUser = {
                            username: account[0].username,
                            usernum: account[0].usernum,
                            currentChannel: account[0].currentchannel,
                            id: account[0].id,
                            messages: account[0].messages
                        };
                    } else {
                        theUser = {
                            username: "Invalid",
                            usernum: 9999,
                            currentChannel: 0,
                            id: 0,
                            messages: []
                        }
                    }
                    users[theUser.id] = theUser;
                    sendToClients("newUser", theUser);
                }
            }
            if (category === "loseUser") {
                const isAuth = checkAuth(seshkey);
                if (isAuth) {
                    const account = await knex("accounts")
                        .where({seshkey: seshkey})
                        .select("*")
                        .catch(e => {
                            throw e;
                        });
                    const theUser: User = {
                        username: account[0].username,
                        usernum: account[0].usernum,
                        currentChannel: account[0].currentchannel,
                        id: account[0].id,
                        messages: account[0].messages
                    };
                    knex("accounts")
                        .where({seshkey: seshkey})
                        .update({status: "offline"})
                        .catch(e => {
                            throw e;
                        });
                    delete users[theUser.id];
                    sendToClients("loseUser", theUser.id);
                }
            }
            if (category === "newChannel") {
                console.log(message);
                const channelId = ++highestChannelId;
                const newChannel: Channel = {
                    name: message.name,
                    id: channelId,
                    messages: [],
                    server: message.server
                };
                channels[channelId] = newChannel;
                knex("channels")
                    .insert(newChannel)
                    .catch((err) => {
                        throw err;
                    });
                knex("servers")
                    .where({id: message.server})
                    .update({channels: knex.raw('array_append(channels, ?)', [newChannel.id])})
                    .catch((err) => {
                        throw err;
                    });
                sendToClients("newChannel", filterObjToArr(channels, "server", message.server));
            }
            if (category === "deleteChannel") {
                delete channels[message];
                knex("channels")
                    .where({id: message})
                    .del()
                    .catch(err => {
                        throw err;
                    });
                const deletedMessages: Array<Record<string, any>> = await knex("messages")
                    .where({channel: message})
                    .select("*")
                    .catch(err => {
                        throw err;
                    });
                const deleteIds = Array.from(deletedMessages, l => Number(l.id));
                for (const id of deleteIds) {
                    knex("accounts")
                        .update({messages: knex.raw('array_remove(messages, ?)', id)})
                        .catch(err => {
                            throw err;
                        });
                }
                await knex("messages")
                    .where({channel: message})
                    .del()
                    .catch(err => {
                        throw err;
                    });
                sendToClients("deleteChannel", channels);
            }
            if (category === "newServer") {
                const account = await knex("accounts")
                    .where({seshkey: seshkey})
                    .first()
                    .catch(e => {
                        throw e;
                    });
                if (account.power === "admin") {
                    const highest = await getHighestServer();
                    console.log("Highest:");
                    console.log(highest);
                    const server = {
                        id: highest,
                        name: message.name,
                        users: [],
                        channels: []
                    };
                    servers[server.id] = server;
                    knex("servers")
                        .insert(server)
                        .catch(e => {throw e});
                    sendToClients("newServer", server);
                }
            }
        }
    });
});

setWsHeartbeat(wss, (ws, data) => {
    if (data === '{"kind":"ping"}') { // send pong if recieved a ping.
        ws.send('{"kind":"pong"}');
    }
}, 30000);

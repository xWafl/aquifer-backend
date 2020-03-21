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
import {checkUser, deleteChannel, filterObjToArr} from "./helpers";
import {init, getHighestId, getHighestChannel, getHighestServer} from './init';
import {editMessage} from "./wss";

let messages: Array<Message> = [];
let highestChannelId = 0;
let users: Record<string, User> = {};
let channels: Record<string, Channel> = {};
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

const getInfoBySeshkey = async (seshkey: string) => await knex("accounts").where({seshkey: seshkey}).first();

const app = require("./auth");

http.on("request", app);

const server = http.listen(wsPort, async (err) => {
    if (err) throw err;
    console.log("HTTP server listening on: " + wsPort);
    await init(messages, channels, servers);
    Promise.all([getHighestId(), getHighestChannel()])
        .catch(e => {
            throw e;
        });
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
                await knex("messages")
                    .where({id: message})
                    .del()
                    .catch((err) => {
                        throw err;
                    });
                await knex("accounts")
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
                await deleteChannel(message, channels);
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
                    const server = {
                        id: highest,
                        name: message.name,
                        users: [],
                        channels: []
                    };
                    servers[server.id] = server;
                    knex("servers")
                        .insert(server)
                        .catch(e => {
                            throw e
                        });
                    sendToClients("newServer", server);
                }
            }
            if (category === "deleteServer") {
                const power = await knex("accounts")
                    .where({seshkey: seshkey})
                    .first()
                    .select("power")
                    .catch(e => {
                        throw e;
                    });
                if (power.power === "admin") {
                    delete servers[message];
                    knex("servers")
                        .where({id: message})
                        .del()
                        .catch(err => {
                            throw err;
                        });
                    const deletedChannels: Record<string, any>[] = await knex("channels")
                        .where({server: message})
                        .select("*")
                        .catch(err => {
                            throw err;
                        });
                    await Promise.all(deletedChannels.map(({ id }) => deleteChannel(id, channels)));
                    sendToClients("deleteServer", servers);
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

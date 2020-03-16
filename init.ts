const knex = require('./knex');

import {User, Message} from "./interfaces";

const updateMessagesFromDb = async (messages: Array<Message>) => {
    console.log("Getting messages from database...");
    const rows = await knex.from("messages").select("*");
    for (const message of rows) {
        const messageUser: User = {
            username: "DeletedUser",
            usernum: 9999,
            currentChannel: 0,
            id: 0,
            messages: [],
        };
        const newMessage: Message = {
            user: messageUser,
            utcTime: message.utctime,
            message: message.message,
            channel: message.channel,
            id: message.id
        };
        messages.push(newMessage);
    }
};

const updateChannelsFromDb = async (channels: Object) => {
    console.log("Getting channels from database...");
    try {
        const rows = await knex.from("channels").select("*");
        for (const channel of rows) {
            channels[channel.id] = {
                name: channel.name,
                id: channel.id,
                messages: channel.messages
            };
        }
    } catch (err) {
        throw err;
    }
};

const deleteOldUsers = (sNum) => {
    console.log(sNum + ": Deleting old users...");
    try {
        knex.raw('delete from users where snum <= ' + sNum + ";")
            .catch(err => {
                throw err;
            });
        console.log("Users deleted.");
    } catch (err) {
        throw err;
    }
};

const incrementSNum = async () => {
    console.log("Incrementing server num...");
    const rows = await knex("serverid");
    const sNum = rows[0].snum;
    try {
        await knex("serverid").update({snum: Number(Number(sNum) + 1)});
    } catch (err) {
        throw err;
    }
    return sNum;
};

const getHighestId = async (): Promise<number> => {
    interface idRet {
        id: number
    }
    const ids: Array<idRet> = await knex("messages").select("id");
    const arrIds = ids.map(({ id }) => id);
    if (arrIds.length === 0) {
        return 0;
    } else {
        return Math.max(...arrIds) + 1 as number;
    }
};

const init = async (messages: Array<Message>, channels: Object) => {
    try {
        console.log("Initializing...");
        const sNum = await incrementSNum();
        await deleteOldUsers(sNum);
        await updateMessagesFromDb(messages);
        await updateChannelsFromDb(channels);
    } catch (e) {
        throw e;
    }
};

export {init, getHighestId};

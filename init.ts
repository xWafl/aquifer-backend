import {getHighestFromArr} from "./helpers";

const knex = require('./knex');

import {User, Message} from "./interfaces";

const updateMessagesFromDb = async (messages: Array<Message>) => {
    console.log("Getting messages from database...");
    const rows = await knex.from("messages").select("*").catch(e => {
        throw e
    });
    for (const message of rows) {
        const messageUser: User = await knex.from("accounts").where({id: message.userid}).first().select("*").catch(e => {throw e});
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
        const rows = await knex.from("channels").select("*").catch(e => {
            throw e
        });
        for (const channel of rows) {
            channels[channel.id] = {
                name: channel.name,
                id: channel.id,
                messages: channel.messages,
                server: channel.server
            };
        }
    } catch (err) {
        throw err;
    }
};

const updateServersFromDb = async (servers: Object) => {
    console.log("Getting servers from database...");
    try {
        const rows = await knex.from("servers").select("*").catch(e => {
            throw e
        });
        for (const server of rows) {
            servers[server.id] = server;
        }
    } catch (err) {
        throw err;
    }
};

const getHighestId = async (): Promise<number> => {
    const ids: Record<string, number>[] = await knex("messages").select("id").catch(e => {
        throw e
    });
    const arrIds = ids.map(({id}) => id);
    return getHighestFromArr(arrIds);
};

const getHighestChannel = async (): Promise<number> => {
    const ids: Record<"id", number>[] = await knex("channels").select("id").catch(e => {throw e});
    const arrIds = ids.map(({id}) => id);
    if (arrIds.length === 0) {
        return 0;
    } else {
        return Math.max(...arrIds) + 1 as number;
    }
};

const getHighestServer = async (): Promise<number> => {
    const ids: Record<"id", number>[] = await knex("servers").select("id").catch(e => {throw e});
    const arrIds = ids.map(({id}) => id);
    return arrIds.length === 0 ? 1 : Math.max(...arrIds) + 1 as number;
};

const init = async (messages: Array<Message>, channels: Object, servers: Object) => {
    try {
        console.log("Initializing...");
        await updateMessagesFromDb(messages);
        await updateChannelsFromDb(channels);
        await updateServersFromDb(servers);
    } catch (e) {
        throw e;
    }
};

export {init, getHighestId, getHighestChannel, getHighestServer};

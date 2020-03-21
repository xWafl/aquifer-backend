import {User} from "./interfaces";

const knex = require('./knex');

const getHighestFromArr = (arr: Array<number>) => arr.length ? Math.max(...arr) + 1 : 0;

const checkUser = (checkedUser: User, users: Object) => Object.entries(users).some( l => l[1].id === checkedUser.id);

const filterObjToArr = <T extends object, K extends keyof T[keyof T]>(obj:  T, key: K, match: T[keyof T][K]) => {
    return Object.values(obj).filter(obj => obj[key] === match)
};

const getServerFromChannel = async (channelid: number) => {
    const match = await knex("channels")
        .where({id: channelid})
        .first()
        .catch(e => {
            throw e;
        });
    console.log(match);
    return match.server;
};

const deleteChannel = async (message: number, channels: Object) => {
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
};

export {getHighestFromArr, checkUser, filterObjToArr, getServerFromChannel, deleteChannel}

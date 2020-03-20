import {User} from "./interfaces";

const knex = require('./knex');

const getHighestFromArr = (arr: Array<number>) => arr.length ? Math.max(...arr) + 1 : 0;

const checkUser = (checkedUser: User, users: Object) => Object.entries(users).some( l => l[1].id === checkedUser.id);

const filterObjToArr = (obj: Object, prop: any, match: any) => {
    let newObj = [];
    for (let i in obj) {
        if (obj[i][prop] === match) {
            newObj.push({...obj[i]});
        }
    }
    return newObj;
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

export {getHighestFromArr, checkUser, filterObjToArr, getServerFromChannel}

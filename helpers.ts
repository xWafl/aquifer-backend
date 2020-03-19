import {User} from "./interfaces";

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

export {getHighestFromArr, checkUser, filterObjToArr}

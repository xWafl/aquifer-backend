import {User} from "./interfaces";

const getHighestFromArr = (arr: Array<number>) => arr.length ? Math.max(...arr) + 1 : 0;

const checkUser = (checkedUser: User, users: Object) => Object.entries(users).some( l => l[1].id === checkedUser.id);

export {getHighestFromArr, checkUser}

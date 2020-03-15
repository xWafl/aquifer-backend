const getHighestFromArr = (arr: Array<number>) => {
    if (arr.length === 0) {
        return 0;
    }
    return Math.max(...arr) + 1;
};

export {getHighestFromArr}

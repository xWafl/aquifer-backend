interface messageOptions {
    id?: number,
    msg?: string,
}

const editMessage = (messages: Object, message: messageOptions) => {
    for (const i in messages) {
        if (messages[i].id === message.id) {
            messages[i].message = message.msg;
        }
    }
};

export {editMessage}

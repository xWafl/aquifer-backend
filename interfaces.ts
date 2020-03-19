interface User {
    username: string,
    usernum: number,
    currentChannel: number,
    id: number,
    messages: Array<number>
}

interface Message {
    user: User,
    utcTime: number,
    message: string,
    channel: number,
    id: number
}

interface Channel {
    name: string,
    id: number,
    messages: Array<number>,
    server: number
}

export {User, Message, Channel}

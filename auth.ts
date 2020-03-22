const knex = require('./knex');

const bcrypt = require("bcrypt");

const express = require("express");
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

const genSeshkey = () => {
    const validChars = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
    let result = "";
    for (let i = 0; i < 16; i++) {
        result += validChars[Math.floor(Math.random() * validChars.length)];
    }
    return result;
};

// const genDiscriminator = () => {
//     return Math.floor(Math.random() * 9000) + 1000;
// };

app.post("/createUser", async (req, res) => {
    const {username, password} = req.body;
    console.log(`${username}|${password}`);
    const usernum = Math.floor(Math.random() * 9000) + 1000;
    const hashedPw = await bcrypt.hash(password, 12);
    const userTaken = await knex("accounts")
        .where({username})
        .select("*")
        .catch(err => {
            throw err;
        });
    if (userTaken.length > 0) {
        res.send({status: "That user already exists!"});
    } else {
        const ids: Record<string, number>[] = await knex("accounts").select("id").catch(e => {throw e});
        const arrIds: Array<number> = Array.from(ids, l => l.id);
        const highestId = ids.length === 0 ? 0 : Math.max(...arrIds) + 1;
        knex("accounts")
            .insert({
                username,
                password: hashedPw,
                seshkey: null,
                id: highestId,
                usernum,
                currentchannel: 0,
                messages: [],
                status: "offline",
                power: "member"
            })
            .catch(err => {
                throw err;
            });
        knex("memories")
            .insert({
                account: highestId,
                channel: []
            })
            .catch(e => {
                throw e;
            });
        res.send({status: "Success", usernum: usernum});
    }
});

app.post("/login", async (req, res) => {
    const {username, usernum, password} = req.body;
    const users = await knex("accounts")
        .where({username, usernum})
        .select("*")
        .catch(err => {
            throw err;
        });
    if (users.length === 0) {
        res.send({status: "failure", desc: "No user exists!"});
    } else {
        const currentchannel = users[0].currentchannel;
        const messages = users[0].messages;
        const passwordMatches = bcrypt.compareSync(password, users[0].password);
        if (passwordMatches === true) {
            const newSK = genSeshkey();
            await knex("accounts")
                .where({username})
                .update({seshkey: newSK})
                .catch(err => {
                    throw err;
                });
            await knex("accounts")
                .where({seshkey: users[0].id})
                .update({status: "offline"})
                .catch(e => {
                    throw e
                });
            res.send({
                status: "success",
                seshkey: newSK,
                usernum,
                currentchannel,
                messages
            });
        } else {
            res.send({status: "failure", desc: "Password does not match!"});
        }
    }
});

app.post("/loginFromSeshkey", async (req, res) => {
    const givenId = req.body.seshkey;
    const matchingSK = await knex("accounts").where({seshkey: givenId}).first();
    if (matchingSK) {
        const currentChannel = matchingSK.currentchannel;
        const currentServer = matchingSK.currentserver;
        const messages = matchingSK.messages;
        knex("accounts")
            .where({seshkey: givenId})
            .update({status: "online"})
            .catch(e => {
                throw e
            });
        res.send({
            status: "success",
            currentchannel: currentChannel,
            currentserver: currentServer,
            messages: messages
        });
    } else {
        res.send({
            status: "failure"
        });
    }
});

app.post("/logout", async (req, res) => {
    const givenId = req.body.seshkey;
    const matchingSK = await knex("accounts").where({seshkey: givenId}).select("*");
    if (matchingSK.length > 0) {
        knex("accounts")
            .where({seshkey: givenId})
            .update({seshkey: null, status: "offline"})
            .catch(e => {
                throw e
            });
        res.send({
            status: "success"
        });
    } else {
        res.send({
            status: "failure"
        });
    }
});

app.get("/userInfo/:query/:username/:usernum", async (req, res) => {
    const {username, usernum, query} = req.params;
    const user = await knex("accounts").where({username, usernum: Number(usernum)}).first().catch(e => {throw e});
    if (user) {
        if (query === "power") {
            res.send(user.power);
        } else if (query === "status") {
            res.send(user.status);
        } else if (query === "id") {
            res.send(user.id.toString())
        } else if (query === "messageCount") {
            res.send(user.messages.length.toString());
        } else {
            res.send("Category nonexistent!");
        }
    } else {
        res.send("User nonexistent!");
    }
});

module.exports = app;

const knex = require('./knex');

const bcrypt = require("bcrypt");

const express = require("express");
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

app.get("/", (req, res) => {
    res.send("Hello world!");
});

const genSeshkey = () => {
    const validChars = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
    let result = "";
    for (let i = 0; i < 16; i++) {
        result += validChars[Math.floor(Math.random() * validChars.length)];
    }
    return result;
};

const genDiscriminator = () => {
    return Math.floor(Math.random() * 9000) + 1000;
};

app.post("/createUser", async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const hashedPw = bcrypt.hashSync(password, 12);
    const userTaken = await knex("accounts")
        .where({username: username})
        .select("*")
        .catch(err => {
            throw err;
        });
    if (userTaken.length > 0) {
        res.send("That user already exists!");
    } else {
        const ids: Array<Record<string, number>> = await knex("accounts").select("id");
        const arrIds: Array<number> = Array.from(ids, l => l.id);
        const highestId = ids.length === 0 ? 0 : Math.max(...arrIds) + 1;
        knex("accounts")
            .insert({
                username: username,
                password: hashedPw,
                seshkey: null,
                id: highestId,
                usernum: genDiscriminator(),
                currentchannel: 0,
                messages: [],
            })
            .catch(err => {
                throw err;
            });
        res.send("Success");
    }
});

app.post("/login", async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const users = await knex("accounts")
        .where({username: username})
        .select("*")
        .catch(err => {
            throw err;
        });
    console.log(users[0]);
    const usernum = users[0].usernum;
    const currentchannel = users[0].currentchannel;
    const messages = users[0].messages;
    const passwordMatches = bcrypt.compareSync(password, users[0].password);
    if (passwordMatches === true) {
        const newSK = genSeshkey();
        knex("accounts")
            .where({username: username})
            .update({seshkey: newSK})
            .catch(err => {
                throw err;
            });
        res.send({
            status: "success",
            seshkey: newSK,
            usernum: usernum,
            currentchannel: currentchannel,
            messages: messages
        });
    } else {
        res.send({status: "failure"});
    }
});

app.post("/loginFromSeshkey", async (req, res) => {
    const givenId = req.body.seshkey;
    const matchingSK = await knex("accounts").where({seshkey: givenId}).select("*");
    if (matchingSK.length > 0) {
        const currentChannel = matchingSK[0].currentchannel;
        const messages = matchingSK[0].messages;
        res.send({
            status: "success",
            currentchannel: currentChannel,
            messages: messages
        });
    } else {
        res.send({
            status: "failure"
        });
    }
});

module.exports = app;
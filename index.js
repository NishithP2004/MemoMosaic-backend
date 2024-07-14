const express = require("express");
require("dotenv").config();
const cors = require("cors");
const {
    generateScript
} = require("./utils");
const fs = require("node:fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({
    limit: "18mb"
}))
app.use(express.urlencoded({
    extended: true
}))
app.use(cors())

app.listen(PORT, () => {
    console.log(`Listening on port: ${PORT}`)
})

app.get("/", (req, res) => {
    res.send({
        "message": "Hello World"
    })
})

app.post("/create", async (req, res) => {
    try {
        const payload = req.body;
        const script = await generateScript(payload);
            
        res.send(script);
    } catch (err) {
        console.error(err);
        res.status(500).send({
            success: false,
            error: err.message
        })
    }
})
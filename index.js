const express = require("express");
require("dotenv").config();
const cors = require("cors");
const {
    generateScript
} = require("./utils");
const { loadFaceApiModels, runDetection } = require("./face-extraction")

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({
    limit: "18mb"
}))
app.use(express.urlencoded({
    extended: true
}))
app.use(cors())
app.set('trust proxy', true);

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

app.post("/extractFaces", async (req, res) => {
    try {
        const images = req.body.images;

        if(!images) {
            res.status(400).send({
                success: false,
                error: "Input images not provided"
            })
        } else {
            const faces = await Promise.all(images.map(async image => await runDetection(image, "extraction")))

            res.send({
                success: true,
                faces: [...faces.flat(1)]
            })
        }
    } catch(err) {
        console.error(err.message);
        res.status(500).send({
            success: false,
            error: err.message
        })
    }
})

const main = () => {
    loadFaceApiModels();

    app.listen(PORT, () => {
        console.log(`Listening on port: ${PORT}`)
    })
}

main();
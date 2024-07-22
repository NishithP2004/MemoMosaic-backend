require("dotenv").config();

const os = require("node:os")
const fs = require("node:fs")

const {
    GoogleGenerativeAI
} = require("@google/generative-ai");
const {
    GoogleAIFileManager
} = require("@google/generative-ai/server");

const PlayHT = require('playht')
const googleTTS = require("google-tts-api")

const {
    createCollage
} = require("@wylie39/image-collage")
const {
    createApi
} = require("unsplash-js")

const puppeteer = require("puppeteer")
const ejs = require("ejs")

const unsplash = createApi({
    accessKey: process.env.UNSPLASH_API_ACCESS_KEY
})

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const genAIModel = genAI.getGenerativeModel({
    model: "gemini-1.5-pro"
})
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

const groupBy = (arr, key) => {
    return arr.reduce((acc, curr) => {
        (acc[curr[key]] = acc[curr[key]] || []).push(curr);
        return acc;
    }, {});
};

async function uploadToGemini(path, mimeType) {
    const uploadResult = await fileManager.uploadFile(path, {
        mimeType,
        displayName: path,
    });
    const file = uploadResult.file;
    console.log(`Uploaded file ${file.displayName} as: ${file.name}`);
    return file;
}

async function waitForFilesActive(files) {
    console.log("Waiting for file processing...");
    for (const name of files.map((file) => file.name)) {
        let file = await fileManager.getFile(name);
        while (file.state === "PROCESSING") {
            process.stdout.write(".")
            await new Promise((resolve) => setTimeout(resolve, 10000));
            file = await fileManager.getFile(name)
        }
        if (file.state !== "ACTIVE") {
            throw Error(`File ${file.name} failed to process`);
        }
    }
    console.log("...all files ready\n");
}

async function createCollagePayload(assets) {
    try {
        const sorted = assets.sort((a, b) => {
            let d1 = new Date(a)
            let d2 = new Date(b)

            return (d2.getTime() - d1.getTime())
        })

        const groups = groupBy(sorted, "location")
        const locations = [];

        for (let group of Object.keys(groups)) {
            let subgroup = groupBy(groups[group], "type");
            locations.push({
                [group]: subgroup
            })
        }

        const collageWidth = 800;
        const collage = [];

        console.log(locations)

        for (let group of locations) {
            let location = Object.keys(group)[0];
            console.log(group)
            console.log(location)

            const images = group[location]["IMAGE"];
            const videos = group[location]["VIDEO"];

            for (let i = 0; i < images?.length; i++) {
                const imageCollection = images.splice(0, 4).map(image => Buffer.from(image.buffer, "base64"));
                const base64Buffer = Buffer.from(await createCollage(imageCollection, collageWidth, "image/png")).toString("base64")
                collage.push({
                    buffer: base64Buffer,
                    type: "IMAGE",
                    location: location,
                    assets: imageCollection
                })
            }

            videos?.forEach(video => {
                collage.push({
                    buffer: video.buffer,
                    type: "VIDEO",
                    location: location,
                    assets: [video]
                });
            })
        }

        return collage;
    } catch (err) {
        console.error("Error generating collage payload: " + err.message)
        throw err;
    }
}

function simplifyCollagePayload(collage, videoUri) {
    try {
        let simplified = [];

        simplified = collage.map(c => {
            return {
                type: c.type,
                location: c.location,
                collage: c.buffer,
                assets: c.assets.map(a => {
                    return {
                        description: a.description,
                        creation_time: a.creation_time,
                        type: a.type
                    }
                })
            }
        })

        return {
            collage: simplified,
            buffers: collage.map((c, index) => {
                if (c.type === "IMAGE") {
                    return {
                        inlineData: {
                            mimeType: (collage[index].type === "IMAGE") ? "image/png" : collage[index].assets[0].mimeType,
                            data: c.buffer
                        }
                    }
                } else {
                    return {
                        fileData: {
                            mimeType: collage[index].assets[0].mimeType,
                            fileUri: videoUri[c.buffer]
                        }
                    }
                }
            })
        }
    } catch (err) {
        console.error(`Error simplifying collage payload: ` + err.message)
        throw err;
    }
}

async function describeAssets(assets) {
    try {
        const chatSession = genAIModel.startChat({
            generationConfig: {
                temperature: 1,
                responseMimeType: "application/json"
            },
            history: [],
            systemInstruction: {
                parts: [{
                    text: ` Describe the given set of images or videos.
                            Include essential information like what is being spoken, the location, scenery etc.
                            Return the detailed descriptions of each asset as a JavaScript Array of Objects in the below given JSON format and ensure that the order of files is maintained.

                            OUTPUT FORMAT:
                            {
                                "result": [
                                    {
                                        "description": "A detailed description of the provided image or video."
                                    },
                                    ...
                                ]
                            }
                    `,
                }]
            }
        })

        var videoUri = {}

        const inlineData = await Promise.all(assets.map(async asset => {
            if (asset.type === "IMAGE") {
                return {
                    inlineData: {
                        data: asset.buffer,
                        mimeType: asset.mimeType
                    }
                }
            } else {
                const mimeType = asset.mimeType;
                const tempFilePath = `${os.tmpdir()}/video.${mimeType.slice(mimeType.indexOf("/") + 1)}`;
                fs.writeFileSync(tempFilePath, Buffer.from(asset.buffer, "base64"))
                const files = [await uploadToGemini(tempFilePath, mimeType)]
                await waitForFilesActive(files);
                fs.unlinkSync(tempFilePath)

                videoUri[asset.buffer] = files[0].uri;

                return {
                    fileData: {
                        mimeType: mimeType,
                        fileUri: files[0].uri
                    }
                }
            }
        }))
        const result = await chatSession.sendMessage(inlineData)

        return {
            descriptions: JSON.parse(result.response.text()).result,
            videoUri: videoUri
        }
    } catch (err) {
        console.error("Error describing asset: " + err.message);
        return "";
    }
}

async function generateNarrative(payload, memorableMoments, type, annotationsImage) {
    try {
        const chatSession = genAIModel.startChat({
            generationConfig: {
                temperature: 1,
                responseMimeType: "application/json"
            },
            history: [],
            systemInstruction: {
                parts: [{
                    text: ` You are an expert in creating memorable albums or travel vlogs.
                            Given a JSON Object containing a collection of assets and their descriptions, you can intelligently script a short narrative under 300 characters based on the metadata provided such as the creation time of the images, location, etc and the type of script needed - album or vlog (specified in the "type" key of the input JSON object).
                            The images have been sorted in chronological order based on their creation timestamp and grouped by their location.
                            Generate a scene for each element of the input JSON Array of objects.
                            The generated collage is provided along with descriptions of each individual image used to generate the collage.
                            Each element of the collage array corresponds to an individual collage which will be placed in a scene.
                            Atmost one collage will be present in each scene and either a collage or a video can be present in a scene.
                            Ensure that the length of the output "scenes" array is equal to the length of the input "collage" array and is in order (essentially map each collage element to the corresponding scene).
                            For better context on the genealogy, we've included an image titled 'Annotations'. This image features all the characters' faces and their annotations (which may include their name, relationship with the user, etc as the case may be).
                            The short narrative should include any memorable moments (if provided in the input JSON object) and narrated in first person, past tense.
                            Create a narrative for each array element in the provided JSON Array of Objects.
                            Return the script in the below given JSON format.

                            OUTPUT FORMAT:

                            {   
                                "title": "A catchy title for the album / vlog without hashtags",
                                "caption": "A short caption for the album / vlog",
                                "hashtags": ["Hashtags for the album / vlog"],
                                "scenes": [
                                            {
                                                "scene": "1",
                                                "narrative": "A short narrative under 200 characters"
                                            },
                                            ...
                                          ]
                            }
                    `,
                }]
            }
        })

        const result = await chatSession.sendMessage([{
                text: `
                {
                    "collage": ${payload.collage},
                    "memorableMoments": ${memorableMoments || ""},
                    "type": ${type}
                }
                `
            },
            ...payload.buffers,
            {
                inlineData: {
                    data: annotationsImage,
                    mimeType: "image/png"
                }
            }
        ])

        return JSON.parse(result.response.text())
    } catch (err) {
        console.error("Error generating narrative: " + err.message);
        throw err;
    }
}

async function getLocationBanner(location) {
    try {
        const images = await unsplash.search.getPhotos({
                query: location,
                orientation: "landscape",
                orderBy: "relevant",
            })
            .then(res => res.response.results)

        return images[Math.floor(Math.random() * images.length)].urls.regular
    } catch (err) {
        console.log("Error fetching image from Unsplash: " + err.message);
        throw err;
    }
}

async function generateScript(payload) {
    try {
        let {
            assets,
            type,
            memorableMoments,
            playHTCred,
            annotations
        } = payload;

        const {
            descriptions,
            videoUri
        } = await describeAssets(assets);
        assets = assets.map((asset, index) => {
            return {
                ...asset,
                description: descriptions[index] || ""
            }
        })
        const collagePayload = await createCollagePayload(assets);
        const simplified = simplifyCollagePayload(collagePayload, videoUri);
        const annotationsImage = await convertToImage(annotations)

        let script = await generateNarrative(simplified, memorableMoments, type, annotationsImage);

        script.scenes = await Promise.all(script.scenes.map(async (scene, index) => {
            return {
                ...scene,
                collage: collagePayload[index].buffer,
                type: collagePayload[index].type,
                mimeType: (collagePayload[index].type === "IMAGE") ? "image/png" : collagePayload[index].assets[0].mimeType,
                location: collagePayload[index].location,
                background_image: await getLocationBanner(collagePayload[index].location),
                audio: await tts(scene.narrative, playHTCred)
            }
        }))

        return script;
    } catch (err) {
        console.error("Error generating script: " + err.message)
        throw err;
    }
}


async function tts(text, playHTCred) {
    try {
        PlayHT.init({
            userId: playHTCred.userId,
            apiKey: playHTCred.secretKey,
            defaultVoiceEngine: 'PlayHT2.0'
        });

        const voices = await PlayHT.listVoices();
        let clonedVoice = voices.find(voice => voice.isCloned == true && voice.name === "MemoMosaic")

        if (!clonedVoice) {
            console.log("Cloning Voice...");
            const fileBlob = new Blob(Buffer.from(playHTCred.audio, "base64"));
            clonedVoice = await PlayHT.clone("MemoMosaic", fileBlob, playHTCred.gender.toLowerCase());
            // clonedVoice = await createInstantVoiceClone(playHTCred)
        }

        console.log('Cloned voice info\n', JSON.stringify(clonedVoice, null, 2));

        const audio = await PlayHT.generate(text, {
            voiceId: clonedVoice.id,
            voiceEngine: "PlayHT2.0",
            outputFormat: "mp3",
            inputType: "plain",
            // emotion: `${playHTCred.gender}_happy`
        })
        console.log(audio.audioUrl)
        return audio.audioUrl
    } catch (err) {
        console.error(err.message)
        console.log("Trying Google TTS...")
        try {
            const audio = await googleTTS.getAudioBase64(text)
            const audioUrl = await uploadFile(audio)

            return audioUrl;
        } catch (err) {
            console.error("Error generating TTS: " + err.message)
            throw err;
        }
    }
}

async function createInstantVoiceClone(playHTCred) {
    try {
        const formData = new FormData();

        formData.append('sample_file', new Blob(Buffer.from(playHTCred.audio, "base64")));
        formData.append('voice_name', 'MemoMosaic');

        const url = 'https://api.play.ht/api/v2/cloned-voices/instant';
        const options = {
            method: 'POST',
            headers: {
                accept: 'application/json',
                AUTHORIZATION: `Bearer ${playHTCred.secretKey}`,
                'X-USER-ID': playHTCred.userId
            }
        };

        options.body = formData;

        let clonedVoice = await fetch(url, options)
            .then(res => res.json())

        return clonedVoice;
    } catch (err) {
        console.error("Error cloning voice: " + err.message);
        throw err;
    }
}

// Temporary file store
async function uploadFile(base64Data, filename = "audio.mp3") {
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer])

    const formData = new FormData();
    formData.append('file', blob, filename);

    try {
        const response = await fetch("https://tmpfiles.org/api/v1/upload", {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        let t = data.data.url;
        // const url = t.slice(0, t.indexOf("/", t.indexOf(".org"))) + "/dl/" + t.slice(t.indexOf("/", t.indexOf(".org")) + 1)
        const url = `${new URL(t).protocol}//${new URL(t).hostname}/dl${new URL(t).pathname}`
        return url;
    } catch (error) {
        console.error('Error uploading file:', error.message);
    }
}

async function convertToImage(annotations) {
    let ejs_template = fs.readFileSync(__dirname + "/views/annotations.ejs", 'utf-8');
    let html = ejs.render(ejs_template, {
        annotations
    });

    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, {
        waitUntil: "load"
    });
    let image = await page.screenshot({
        fullPage: true,
        encoding: "base64",
        type: "png"
    });

    await browser.close();

    return image;
}

module.exports = {
    generateScript
}
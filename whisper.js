const { downloadMediaMessage } = require('@adiwajshing/baileys');
const { Configuration, OpenAIApi } = require("openai");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);

const tmpDir = `${process.cwd()}/tmp`;
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
}

const voiceToText = async (filePath) => {
    if (!fs.existsSync(filePath)) {
        throw new Error("El archivo no existe");
    }

    try {
        const configuration = new Configuration({
            apiKey: process.env.OPENAI_API_KEY,
        });
        const openai = new OpenAIApi(configuration);

        const response = await openai.createTranscription(
            fs.createReadStream(filePath),
            "whisper-1"
        );

        const text = response.data.text?.trim().toLowerCase();
        return text || "ERROR";
    } catch (error) {
        console.error("❌ Error en Whisper:", error.response?.data || error.message);
        return "ERROR";
    }
};

const  convertOggToMp3 = async (inputStream, outStream) => {
    return new Promise((resolve, reject) => {
        ffmpeg(inputStream)
            .audioCodec("libmp3lame")
            .audioBitrate(96)
            .toFormat("mp3")
            .save(outputPath)
            .on("end", () => resolve(true))
            .on("error", (err) => reject(err));
        });
};

const handlerAI = async (ctx) => {
    try {
        const buffer = await downloadMediaMessage(ctx, "buffer");
        const timestamp = Date.now();
        const oggPath = path.join(tmpDir, `voice-${timestamp}.ogg`);
        const mp3Path = path.join(tmpDir, `voice-${timestamp}.mp3`);

        fs.writeFileSync(oggPath, buffer);
        await convertOggToMp3(oggPath, mp3Path);

        const text = await voiceToText(mp3Path);

        // Limpieza de archivos temporales
        fs.unlinkSync(oggPath);
        fs.unlinkSync(mp3Path);

        return text;
    } catch (err) {
        console.error("❌ Error al procesar nota de voz:", err.message);
        return "ERROR";
    }
};

module.exports = { handlerAI };


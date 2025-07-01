const { Configuration, OpenAIApi } = require("openai");
require("dotenv").config();

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

/**
* Genera una respuesta usando ChatGPT.
* @param {string} systemPrompt - El mensaje de sistema (por ejemplo: prompt de consulta).
* @param {string} userPrompt - El mensaje del usuario.
* @returns {Promise<{ content: string }>}
*/
const chat = async (systemPrompt, userPrompte) => {
    try {
        const response = await openai.createChatCompletion({
            model: "gpt-4",
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: userMessage },
            ],
        });

        const content = response.data.choices[0].message.content.trim();
        return { content };
    } catch (err) {
        console.error("❌ Error en ChatGPT:", err.response?.data || err.message);
        return { content: null };
    }
};

module.exports = chat;


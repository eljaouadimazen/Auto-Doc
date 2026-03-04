const axios = require("axios");

class LLMService {
  constructor() {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY missing");
    }
  }

  async generate(messages) {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: messages,
        temperature: 0.2
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.choices[0].message.content;
  }
}

module.exports = new LLMService();
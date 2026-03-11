const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const client = new BedrockRuntimeClient({ region: 'us-west-2' });
const fs = require('fs');
const STRIP_STRING = 'Compensation';

function stripUpTo (originalString, searchString) {
    const regex = new RegExp(`.*?(?=${searchString})`, 'i');
    return originalString.replace(regex, '');
}

function cleanJobDescription (html) {
    let text = html
        .replace(/<li>/gi, "• ")
        .replace(/<\/li>/gi, "\n")
        .replace(/<p>/gi, "")
        .replace(/<\/p>/gi, "\n");

    text = text.replace(/<[^>]*>/g, " ");
    text = text.replace(/\s+/g, " ").replace(/•\s+/g, "• ").trim();

    return stripUpTo(text, STRIP_STRING);
}

async function inferCompensationRange (rawJobDescription) {
    const jobDescription = cleanJobDescription(rawJobDescription);

    const systemPrompt = `
You are an AI assistant that extracts compensation information from job descriptions.
Return only valid JSON with this structure:
{
  "currency": "USD",
  "min": 0,
  "max": 0,
  "period": "year|month|hour"
}
If no compensation is found, set all fields to null.
`;

    const userPrompt = `Job Description:
"""
${jobDescription}
"""`;

    const command = new ConverseCommand({
        modelId: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
        system: [{ text: systemPrompt }],
        messages: [
            {
                role: 'user',
                content: [{ text: userPrompt }]
            },
        ],
        inferenceConfig: {
            maxTokens: 300,
            temperature: 0,
        },
    });

    try {
        const response = await client.send(command);
        
        // token usage info
        // console.log(response.usage);

        const outputText = response.output?.message?.content
            ?.map(c => c.text)
            .join(' ')
            .replace('```json', '').replace('```', '')
            .trim();

        let parsed;

        try {
            parsed = JSON.parse(outputText);
        } catch (err) {
            console.error('Failed to parse model output:', outputText);
            parsed = { currency: null, min: null, max: null, period: null };
        }

        return parsed;
    } catch (error) {
        console.error('Error calling Bedrock:', error);
        return { currency: null, min: null, max: null, period: null };
    }
}

module.exports = { inferCompensationRange };

// const sampleJob = fs.readFileSync('sample.txt', 'utf8');
// inferCompensationRange(sampleJob).then(result => console.log(result));

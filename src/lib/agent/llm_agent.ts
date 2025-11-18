import { GoogleGenAI, Content, GenerateContentParameters } from "@google/genai";
import { ITask } from "@/interfaces/task";

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GEMINI_API_KEY || "",
});

const execute = async (task: ITask) => {
  try {
    const contents: GenerateContentParameters = {
      model: task.model as string,
      contents: task.contents as Content[],
    };
    const executeResult = await ai.models.generateContent(contents);
    const result = executeResult.text || "";
    return result;
  } catch (error) {
    (error as Error).message += ` (while executing task ID: ${task.id})`;
    throw error;
  }
};

export { execute };

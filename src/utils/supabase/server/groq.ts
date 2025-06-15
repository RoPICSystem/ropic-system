"use server";

import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API,
});

export interface GenerateDescriptionParams {
  itemName: string;
  measurementUnit?: string;
  properties?: Record<string, any>;
  existingDescription?: string;
  length?: 'short' | 'medium' | 'long';
}

export async function generateItemDescription({
  itemName,
  measurementUnit,
  properties,
  existingDescription,
  length = 'medium'
}: GenerateDescriptionParams) {
  try {
    if (!process.env.GROQ_API) {
      return {
        success: false,
        error: "AI service is not configured"
      };
    }

    // Define length specifications
    const lengthSpecs = {
      short: "1 sentence, maximum 50 words",
      medium: "2-3 sentences, 50-100 words", 
      long: "3-5 sentences, 100-200 words"
    };

    // Build context for the AI
    let context = `Generate a professional and concise description for an inventory item named "${itemName}".`;
    
    if (measurementUnit) {
      context += ` This item is measured in ${measurementUnit} units.`;
    }

    if (properties && Object.keys(properties).length > 0) {
      const propertiesText = Object.entries(properties)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
      context += ` Additional properties: ${propertiesText}.`;
    }

    if (existingDescription) {
      context += ` Current description: "${existingDescription}". Please improve or enhance this description.`;
    }

    context += ` The description should be:
- Professional and business-appropriate
- ${lengthSpecs[length]}
- Focus on key features, uses, or specifications
- Suitable for inventory management
- Clear and informative
- Written in a professional tone for business use
- Return ONLY the description text without any titles, headers, or formatting
- Do not include phrases like "Description:", "Item:", or any prefixes`;

     const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a professional inventory management assistant. Generate clear, concise, and professional item descriptions for business inventory systems. Focus on practical information that would be useful for inventory tracking and management. Return only the description text without any titles, headers, labels, or formatting."
        },
        {
          role: "user",
          content: context
        }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: length === 'short' ? 80 : length === 'medium' ? 150 : 250,
    });

    const description = completion.choices[0]?.message?.content?.trim();

    if (!description) {
      return {
        success: false,
        error: "Failed to generate description"
      };
    }

    return {
      success: true,
      data: description
    };

  } catch (error: any) {
    console.error("Error generating description:", error);
    return {
      success: false,
      error: error.message || "Failed to generate description"
    };
  }
}
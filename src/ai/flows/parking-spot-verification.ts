'use server';
/**
 * @fileOverview A Genkit flow for verifying parking spots based on images and location.
 *
 * - verifyParkingSpot - A function that handles the parking spot verification process.
 * - ParkingSpotVerificationInput - The input type for the verifyParkingSpot function.
 * - ParkingSpotVerificationOutput - The return type for the verifyParkingSpot function.
 */

import {ai} from '../genkit';
import {z} from 'genkit';

const ParkingSpotVerificationInputSchema = z.object({
  photoDataUris: z
    .array(
      z.string().describe(
        "A photo of the parking spot, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
      )
    )
    .min(1, 'At least one photo of the parking spot is required.')
    .describe('An array of photos showcasing the parking spot.'),
  location: z.string().describe('The geographical location or address of the parking spot.'),
});
export type ParkingSpotVerificationInput = z.infer<typeof ParkingSpotVerificationInputSchema>;

const ParkingSpotVerificationOutputSchema = z.object({
  isValidParking: z
    .boolean()
    .describe('True if the image clearly shows a space suitable for parking a vehicle; false if it is obviously not a parking spot.'),
  description: z
    .string()
    .describe('A brief (1-2 sentence) description of the spot as seen in the photo.'),
  reason: z.string().optional().describe('If not valid, why it was rejected.'),
});
export type ParkingSpotVerificationOutput = z.infer<typeof ParkingSpotVerificationOutputSchema>;

export async function verifyParkingSpot(
  input: ParkingSpotVerificationInput
): Promise<ParkingSpotVerificationOutput> {
  return parkingSpotVerificationFlow(input);
}

const parkingSpotVerificationPrompt = ai.definePrompt({
  name: 'parkingSpotVerificationPrompt',
  input: {schema: ParkingSpotVerificationInputSchema},
  output: {schema: ParkingSpotVerificationOutputSchema},
  config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE',
      },
    ],
  },
  prompt: `You are an AI assistant for a parking share app in Tambaram, Chennai. Your job is to verify if the provided photos show a legitimate parking space (driveway, garage, or dedicated lot).

Instructions:
1. Analyze the photos carefully. You have been provided with multiple angles.
2. Determine if it's a realistic parking spot for a car or bike.
3. Be lenient: if it looks like a clear space where a car can fit in a residential or commercial area, mark it valid.
4. If it's a completely unrelated image (e.g., a landscape, a person, or furniture), mark it invalid.

Location Context: {{{location}}}

Photos:
{{#each photoDataUris}}
- {{media url=this}}
{{/each}}`,
});

const parkingSpotVerificationFlow = ai.defineFlow(
  {
    name: 'parkingSpotVerificationFlow',
    inputSchema: ParkingSpotVerificationInputSchema,
    outputSchema: ParkingSpotVerificationOutputSchema,
  },
  async input => {
    try {
      const {output} = await parkingSpotVerificationPrompt(input);
      if (!output) {
        return {
          isValidParking: false,
          description: "Verification process completed.",
          reason: "Model response error."
        };
      }
      return output;
    } catch (error: any) {
      console.error('AI Verification Error:', error);
      return {
        isValidParking: false,
        description: "Standard verification applied.",
        reason: error.message || "Network or Safety Filter error."
      };
    }
  }
);

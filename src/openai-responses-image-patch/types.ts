export interface GeneratedImageSaveInput {
  base64: string;
  responseId?: string;
  itemId?: string;
  revisedPrompt?: string;
}

export interface GeneratedImageDetails {
  imageBase64: string;
  path?: string;
  mimeType: "image/png";
  bytes?: number;
  responseId?: string;
  itemId?: string;
  revisedPrompt?: string;
  provider?: string;
  model?: string;
  error?: string;
}

export interface GeneratedImageContent {
  type: "imageGeneration";
  id: string;
  status: string;
  result: string;
  responseId?: string;
  path?: string;
  revisedPrompt?: string;
  mimeType: "image/png";
  error?: string;
}

export interface GeneratedImageParserInput extends GeneratedImageSaveInput {
  provider?: string;
  model?: string;
}

export interface ImageAwareParserOptions {
  serviceTier?: string;
  resolveServiceTier?: (responseServiceTier: string | undefined, requestServiceTier: string | undefined) => string | undefined;
  applyServiceTierPricing?: (usage: any, serviceTier: string | undefined) => void;
  onImage?: (input: GeneratedImageParserInput) => Promise<GeneratedImageDetails>;
}

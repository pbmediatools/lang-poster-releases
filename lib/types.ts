export interface Property {
  url: string;
  title: string;
  address: string;
  shortAddress: string;
  price: string;
  status: string;
  postcode: string;
  bedrooms: number | null;
  bathrooms: number | null;
  receptionRooms: number | null;
  features: string[];
  description: string;
  imageUrls: string[];
  phone: string;
  epcRating: string | null;
  suggestedOffice: { label: string; phone: string };
}

export interface Captions {
  longForm: string;
  xVersion: string;
  headline: string;
}

export interface CoverImage {
  url: string;
  designId: string;
}

export interface DraftResult {
  draftId: string;
  url?: string;
  status: "draft" | "scheduled" | "error";
  message?: string;
}

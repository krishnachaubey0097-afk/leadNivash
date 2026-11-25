import type { IProperty } from './property.model.js';

export interface AgencyPublicInfo {
  name?: string;
  phone?: string;
  logoUrl?: string;
  city?: string;
}

export interface PublicPropertyDto {
  id: string;
  title: string;
  type: string;
  category: string;
  purpose: string;
  locality: string;
  city: string;
  size: {
    value: number;
    unit: string;
  };
  sizeGaj: number;
  priceDemandPaise: number;
  facing?: string;
  pitchCount?: number;
  tags: string[];
  description?: string;
  photos: Array<{
    url: string;
    width?: number;
    height?: number;
  }>;
  videoUrl?: string;
  video?: {
    url: string;
    thumbnailUrl?: string;
    duration?: number;
  };
  agency?: {
    name?: string;
    phone?: string;
    logoUrl?: string;
    city?: string;
  };
}

/**
 * Whitelist serializer for public property pages, shares, and external views.
 * ⚠️ NEVER spread the document.
 * Strictly guarantees that `owner`, `userId`, `landmark` (exact address), and database internals are omitted.
 */
export function toPublicProperty(
  p: IProperty,
  agency?: AgencyPublicInfo
): PublicPropertyDto {
  return {
    id: p._id.toString(),
    title: p.title,
    type: p.type,
    category: p.category,
    purpose: p.purpose,
    locality: p.locality,
    city: p.city,
    size: {
      value: p.size.value,
      unit: p.size.unit,
    },
    sizeGaj: p.sizeGaj,
    priceDemandPaise: p.priceDemandPaise,
    facing: p.facing || undefined,
    pitchCount: typeof p.pitchCount === 'number' ? p.pitchCount : 0,
    tags: Array.isArray(p.tags) ? [...p.tags] : [],
    description: p.description || undefined,
    photos: Array.isArray(p.photos)
      ? p.photos.map(({ url, width, height }) => ({ url, width, height }))
      : [],
    videoUrl: p.videoUrl || p.video?.url || undefined,
    video: p.video?.url
      ? {
          url: p.video.url,
          thumbnailUrl: p.video.thumbnailUrl,
          duration: p.video.duration,
        }
      : undefined,
    agency: agency
      ? {
          name: agency.name,
          phone: agency.phone,
          logoUrl: agency.logoUrl,
          city: agency.city,
        }
      : undefined,
  };
}


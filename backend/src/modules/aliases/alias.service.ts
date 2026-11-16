import { LocalityAlias, type ILocalityAlias } from './alias.model.js';
import { assertOwnership } from '../../utils/ownershipCheck.js';

export class LocalityAliasService {
  /**
   * List aliases for user (combines global system seeds + user-specific overrides).
   */
  static async list(userId: string, city = 'Panipat'): Promise<ILocalityAlias[]> {
    return LocalityAlias.find({
      $or: [{ userId: null }, { userId }],
      city: new RegExp(`^${city}$`, 'i'),
    })
      .sort({ canonical: 1 })
      .lean();
  }

  /**
   * Create custom user-level locality alias.
   */
  static async create(
    userId: string,
    data: { city?: string; canonical: string; aliases: string[] }
  ): Promise<ILocalityAlias> {
    const canonicalKey = data.canonical.toLowerCase().trim().replace(/\s+/g, '-');
    const cleanedAliases = data.aliases.map((a) => a.trim()).filter(Boolean);

    const alias = new LocalityAlias({
      userId,
      city: data.city || 'Panipat',
      canonical: data.canonical.trim(),
      canonicalKey,
      aliases: cleanedAliases,
    });

    await alias.save();
    return alias;
  }

  static async update(
    userId: string,
    id: string,
    data: { canonical?: string; aliases?: string[] }
  ): Promise<ILocalityAlias> {
    const alias = await assertOwnership(LocalityAlias, id, userId);

    if (data.canonical) {
      alias.canonical = data.canonical.trim();
      alias.canonicalKey = data.canonical.toLowerCase().trim().replace(/\s+/g, '-');
    }
    if (data.aliases) {
      alias.aliases = data.aliases.map((a) => a.trim()).filter(Boolean);
    }

    await alias.save();
    return alias;
  }

  static async delete(userId: string, id: string): Promise<void> {
    const alias = await assertOwnership(LocalityAlias, id, userId);
    await alias.deleteOne();
  }

  /**
   * Resolves raw locality text (e.g., "MT", "Sec 12") to canonical locality name ("Model Town", "Sector 12").
   */
  static async resolve(rawLocality: string, city = 'Panipat', userId?: string): Promise<string> {
    if (!rawLocality || !rawLocality.trim()) return rawLocality;

    const trimmed = rawLocality.trim();
    const query: any = {
      city: new RegExp(`^${city}$`, 'i'),
      $or: [{ userId: null }],
    };
    if (userId) {
      query.$or.push({ userId });
    }

    const allAliases = await LocalityAlias.find(query).lean();
    const normalizedInput = trimmed.toLowerCase().replace(/[\s.-]/g, '');

    for (const item of allAliases) {
      if (item.canonical.toLowerCase() === trimmed.toLowerCase()) {
        return item.canonical;
      }
      for (const alias of item.aliases) {
        if (alias.toLowerCase().replace(/[\s.-]/g, '') === normalizedInput) {
          return item.canonical;
        }
      }
    }

    return trimmed;
  }
}


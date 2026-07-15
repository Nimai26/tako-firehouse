/**
 * ComicVine Normalizer — Format Canonique Tako
 * 
 * Transforme les données de l'API ComicVine vers le format canonique :
 * { id, type, source, sourceId, title, titleOriginal, description, year,
 *   images: { primary, thumbnail, gallery },
 *   urls: { source, detail },
 *   details: { ...domain-specific } }
 * 
 * Gère volumes, issues, characters, publishers, creators.
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

export class ComicVineNormalizer extends BaseNormalizer {
  constructor() {
    super({
      source: 'comicvine',
      type: 'comic',
      domain: 'comics',
      includeRaw: false
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extrait l'URL de l'image depuis l'objet image ComicVine
   */
  extractImage(imageObj) {
    if (!imageObj) return null;
    return imageObj.original_url || imageObj.medium_url || imageObj.small_url || null;
  }

  /**
   * Construit l'objet images canonique depuis l'objet image ComicVine
   */
  buildImages(imageObj) {
    if (!imageObj) return { primary: null, thumbnail: null, gallery: [] };
    const primary = imageObj.original_url || imageObj.super_url || imageObj.medium_url || null;
    const thumbnail = imageObj.small_url || imageObj.thumb_url || imageObj.medium_url || null;
    // Garder uniquement la meilleure qualité (les autres sont le même visuel en résolutions inférieures)
    const gallery = primary ? [primary] : [];
    return { primary, thumbnail, gallery };
  }

  /**
   * Nettoie le HTML des descriptions
   */
  cleanHtml(html) {
    if (!html) return null;
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Parse les aliases (séparés par \n ou ;)
   */
  parseAliases(aliases) {
    if (!aliases) return [];
    return aliases
      .split(/[\n;]/)
      .map(a => a.trim())
      .filter(a => a.length > 0);
  }

  /**
   * Normalise le genre
   */
  normalizeGender(gender) {
    if (!gender) return null;
    const genderMap = { 1: 'male', 2: 'female', 3: 'other' };
    return genderMap[gender] || null;
  }

  /**
   * Extrait l'année d'une date
   */
  extractYear(dateStr) {
    if (!dateStr) return null;
    const match = String(dateStr).match(/^(\d{4})/);
    return match ? parseInt(match[1]) : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeSearchResponse(results, metadata = {}) {
    const { query, searchType, total, pagination } = metadata;
    const items = results.map((item, index) =>
      this.normalizeSearchItem(item, searchType, index + 1)
    );

    return {
      success: true,
      provider: 'comicvine',
      domain: 'comics',
      query,
      searchType,
      total,
      count: items.length,
      data: items,
      pagination: pagination || {
        page: 1,
        limit: items.length,
        hasMore: false
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: null,
        cached: false,
        cacheAge: null
      }
    };
  }

  normalizeSearchItem(item, resourceType, position) {
    switch (resourceType) {
      case 'issue':
        return this.normalizeIssueItem(item, position);
      case 'character':
        return this.normalizeCharacterItem(item, position);
      case 'publisher':
        return this.normalizePublisherItem(item, position);
      case 'person':
        return this.normalizeCreatorItem(item, position);
      case 'volume':
      default:
        return this.normalizeVolumeItem(item, position);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VOLUMES (SÉRIES)
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeVolumeItem(volume, position = null) {
    const sourceId = String(volume.id);
    const images = this.buildImages(volume.image);

    return {
      id: `comicvine:${sourceId}`,
      type: 'volume',
      source: 'comicvine',
      sourceId,
      title: volume.name,
      titleOriginal: null,
      description: this.cleanHtml(volume.deck),
      year: volume.start_year ? parseInt(volume.start_year) : null,
      images,
      urls: {
        source: volume.site_detail_url || null,
        detail: `/api/comics/comicvine/volume/${sourceId}`
      },
      details: {
        resourceType: 'volume',
        startYear: volume.start_year || null,
        publisher: volume.publisher?.name || null,
        publisherId: volume.publisher?.id || null,
        issueCount: volume.count_of_issues || 0,
        apiDetailUrl: volume.api_detail_url || null,
        position
      }
    };
  }

  normalizeVolumeDetail(volume, options = {}) {
    const base = this.normalizeVolumeItem(volume);

    const data = {
      ...base,
      description: this.cleanHtml(volume.description) || base.description,
      details: {
        ...base.details,
        aliases: this.parseAliases(volume.aliases),
        firstIssue: volume.first_issue ? {
          id: volume.first_issue.id,
          name: volume.first_issue.name,
          issueNumber: volume.first_issue.issue_number
        } : null,
        lastIssue: volume.last_issue ? {
          id: volume.last_issue.id,
          name: volume.last_issue.name,
          issueNumber: volume.last_issue.issue_number
        } : null,
        issues: volume.issues?.map(issue => ({
          id: issue.id,
          name: issue.name,
          issueNumber: issue.issue_number
        })) || [],
        detailLevel: 'full',
        position: undefined
      }
    };
    // Clean up position from detail
    delete data.details.position;

    return {
      success: true,
      provider: 'comicvine',
      domain: 'comics',
      id: data.id,
      data,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: options.lang || 'en',
        cached: options.cached || false,
        cacheAge: options.cacheAge || null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ISSUES (NUMÉROS)
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeIssueItem(issue, position = null) {
    const sourceId = String(issue.id);
    const images = this.buildImages(issue.image);

    return {
      id: `comicvine:${sourceId}`,
      type: 'issue',
      source: 'comicvine',
      sourceId,
      title: issue.name || `#${issue.issue_number}`,
      titleOriginal: null,
      description: this.cleanHtml(issue.deck),
      year: this.extractYear(issue.cover_date),
      images,
      urls: {
        source: issue.site_detail_url || null,
        detail: `/api/comics/comicvine/issue/${sourceId}`
      },
      details: {
        resourceType: 'issue',
        issueNumber: issue.issue_number || null,
        coverDate: issue.cover_date || null,
        storeDate: issue.store_date || null,
        volume: issue.volume ? {
          id: issue.volume.id,
          name: issue.volume.name
        } : null,
        apiDetailUrl: issue.api_detail_url || null,
        position
      }
    };
  }

  normalizeIssueDetail(issue, options = {}) {
    const base = this.normalizeIssueItem(issue);

    const data = {
      ...base,
      description: this.cleanHtml(issue.description) || base.description,
      details: {
        ...base.details,
        characters: issue.character_credits?.map(c => ({
          id: c.id,
          name: c.name
        })) || [],
        creators: issue.person_credits?.map(p => ({
          id: p.id,
          name: p.name,
          role: p.role
        })) || [],
        teams: issue.team_credits?.map(t => ({
          id: t.id,
          name: t.name
        })) || [],
        storyArcs: issue.story_arc_credits?.map(sa => ({
          id: sa.id,
          name: sa.name
        })) || [],
        detailLevel: 'full',
        position: undefined
      }
    };
    delete data.details.position;

    return {
      success: true,
      provider: 'comicvine',
      domain: 'comics',
      id: data.id,
      data,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: options.lang || 'en',
        cached: options.cached || false,
        cacheAge: options.cacheAge || null
      }
    };
  }

  normalizeIssuesList(issues, metadata = {}) {
    const { volumeId, total, pagination } = metadata;
    const items = issues.map((issue, index) => this.normalizeIssueItem(issue, index + 1));

    return {
      success: true,
      provider: 'comicvine',
      domain: 'comics',
      query: volumeId,
      total,
      count: items.length,
      data: items,
      pagination: pagination || {
        page: 1,
        limit: items.length,
        hasMore: false
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: null,
        cached: false,
        cacheAge: null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONNAGES
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeCharacterItem(character, position = null) {
    const sourceId = String(character.id);
    const images = this.buildImages(character.image);

    return {
      id: `comicvine:${sourceId}`,
      type: 'character',
      source: 'comicvine',
      sourceId,
      title: character.name,
      titleOriginal: null,
      description: this.cleanHtml(character.deck),
      year: null,
      images,
      urls: {
        source: character.site_detail_url || null,
        detail: `/api/comics/comicvine/character/${sourceId}`
      },
      details: {
        resourceType: 'character',
        realName: character.real_name || null,
        publisher: character.publisher?.name || null,
        publisherId: character.publisher?.id || null,
        firstAppearance: character.first_appeared_in_issue ? {
          id: character.first_appeared_in_issue.id,
          name: character.first_appeared_in_issue.name,
          issueNumber: character.first_appeared_in_issue.issue_number
        } : null,
        apiDetailUrl: character.api_detail_url || null,
        position
      }
    };
  }

  normalizeCharacterDetail(character, options = {}) {
    const base = this.normalizeCharacterItem(character);

    const data = {
      ...base,
      description: this.cleanHtml(character.description) || base.description,
      details: {
        ...base.details,
        aliases: this.parseAliases(character.aliases),
        birth: character.birth || null,
        gender: this.normalizeGender(character.gender),
        origin: character.origin?.name || null,
        powers: character.powers?.map(p => p.name) || [],
        teams: character.teams?.map(t => ({
          id: t.id,
          name: t.name
        })) || [],
        enemies: character.enemies?.map(e => ({
          id: e.id,
          name: e.name
        })) || [],
        friends: character.friends?.map(f => ({
          id: f.id,
          name: f.name
        })) || [],
        detailLevel: 'full',
        position: undefined
      }
    };
    delete data.details.position;

    return {
      success: true,
      provider: 'comicvine',
      domain: 'comics',
      id: data.id,
      data,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: options.lang || 'en',
        cached: options.cached || false,
        cacheAge: options.cacheAge || null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉDITEURS
  // ═══════════════════════════════════════════════════════════════════════════

  normalizePublisherItem(publisher, position = null) {
    const sourceId = String(publisher.id);
    const images = this.buildImages(publisher.image);

    return {
      id: `comicvine:${sourceId}`,
      type: 'publisher',
      source: 'comicvine',
      sourceId,
      title: publisher.name,
      titleOriginal: null,
      description: this.cleanHtml(publisher.deck),
      year: null,
      images,
      urls: {
        source: publisher.site_detail_url || null,
        detail: null
      },
      details: {
        resourceType: 'publisher',
        location: [publisher.location_city, publisher.location_state]
          .filter(Boolean)
          .join(', ') || null,
        apiDetailUrl: publisher.api_detail_url || null,
        position
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CRÉATEURS (PERSONNES)
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeCreatorItem(person, position = null) {
    const sourceId = String(person.id);
    const images = this.buildImages(person.image);

    return {
      id: `comicvine:${sourceId}`,
      type: 'creator',
      source: 'comicvine',
      sourceId,
      title: person.name,
      titleOriginal: null,
      description: this.cleanHtml(person.deck),
      year: null,
      images,
      urls: {
        source: person.site_detail_url || null,
        detail: `/api/comics/comicvine/creator/${sourceId}`
      },
      details: {
        resourceType: 'person',
        birth: person.birth || null,
        death: person.death || null,
        hometown: person.hometown || null,
        country: person.country || null,
        issueCount: person.count_of_issue_appearances || 0,
        apiDetailUrl: person.api_detail_url || null,
        position
      }
    };
  }

  normalizeCreatorDetail(person, options = {}) {
    const base = this.normalizeCreatorItem(person);

    const data = {
      ...base,
      description: this.cleanHtml(person.description) || base.description,
      details: {
        ...base.details,
        aliases: this.parseAliases(person.aliases),
        gender: this.normalizeGender(person.gender),
        website: person.website || null,
        volumeCount: person.volume_credits?.length || 0,
        issueCount: person.issue_credits?.length || person.count_of_issue_appearances || 0,
        characterCount: person.created_characters?.length || 0,
        createdCharacters: person.created_characters?.map(c => ({
          id: c.id,
          name: c.name
        })) || [],
        detailLevel: 'full',
        position: undefined
      }
    };
    delete data.details.position;

    return {
      success: true,
      provider: 'comicvine',
      domain: 'comics',
      id: data.id,
      data,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: options.lang || 'en',
        cached: options.cached || false,
        cacheAge: options.cacheAge || null
      }
    };
  }

  normalizeCreatorWorks(volumes, metadata = {}) {
    const { creatorId, total, pagination } = metadata;
    const items = volumes.map((vol, index) => {
      const sourceId = String(vol.id);
      const images = this.buildImages(vol.image);
      const basePosition = ((pagination?.page - 1) * (pagination?.limit || 0)) || 0;

      return {
        id: `comicvine:${sourceId}`,
        type: 'volume',
        source: 'comicvine',
        sourceId,
        title: vol.name,
        titleOriginal: null,
        description: null,
        year: vol.start_year ? parseInt(vol.start_year) : null,
        images,
        urls: {
          source: vol.site_detail_url || null,
          detail: `/api/comics/comicvine/volume/${sourceId}`
        },
        details: {
          resourceType: 'volume',
          startYear: vol.start_year || null,
          issueCount: vol.count_of_issues || 0,
          position: index + 1 + basePosition
        }
      };
    });

    return {
      success: true,
      provider: 'comicvine',
      domain: 'comics',
      query: creatorId,
      total,
      count: items.length,
      data: items,
      pagination: pagination || {
        page: 1,
        limit: items.length,
        hasMore: false
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: null,
        cached: false,
        cacheAge: null
      }
    };
  }
}

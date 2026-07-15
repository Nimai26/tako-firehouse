/**
 * Abandonware Magazines Normalizer — Format Canonique Tako
 * 
 * Transforme les données de l'API Abandonware Magazines vers le format canonique :
 * { id, type, source, sourceId, title, description, year,
 *   images: { primary, thumbnail, gallery },
 *   urls: { source, detail },
 *   details: { ...domain-specific } }
 * 
 * Types spécifiques :
 * - magazine : Un titre de magazine (ex: "Joystick")
 * - issue : Un numéro d'un magazine
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

const BASE_URL = 'https://www.abandonware-magazines.org';

export class AbandonwareNormalizer extends BaseNormalizer {
  constructor() {
    super({
      source: 'abandonware',
      type: 'magazine',
      domain: 'books',
      includeRaw: false
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Génère l'URL du logo d'un magazine
   * Reproduit la logique _sanitize_filename de Hayate
   */
  _buildLogoUrl(name) {
    if (!name) return null;
    const sanitized = name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9]/g, '');
    return `${BASE_URL}/images_logomags/logo${sanitized}.jpg`;
  }

  /**
   * Extraire l'année d'une chaîne de date (ex: "Mars/Avril 1992" → 1992)
   */
  _extractYear(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{4})/);
    return match ? parseInt(match[1], 10) : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE (magazines)
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeSearchResponse(magazines, metadata = {}) {
    const { query, total, count } = metadata;
    const items = magazines.map((mag, index) => this.normalizeSearchItem(mag, index + 1));

    return {
      success: true,
      provider: 'abandonware',
      domain: 'books',
      query,
      total: total ?? items.length,
      count: count ?? items.length,
      data: items,
      pagination: {
        page: 1,
        limit: items.length,
        hasMore: (total ?? items.length) > items.length
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        cached: false,
        cacheAge: null
      }
    };
  }

  normalizeSearchItem(magazine, position) {
    const sourceId = String(magazine.id);
    const logoUrl = this._buildLogoUrl(magazine.name);

    return {
      id: `abandonware:${sourceId}`,
      type: 'magazine',
      source: 'abandonware',
      sourceId,
      title: magazine.name,
      titleOriginal: null,
      description: null,
      year: null,
      images: {
        primary: logoUrl,
        thumbnail: logoUrl,
        gallery: []
      },
      urls: {
        source: `${BASE_URL}`,
        detail: `/api/books/abandonware/magazine/${sourceId}`
      },
      details: {
        position
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LISTE DE MAGAZINES
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeMagazineListResponse(magazines, metadata = {}) {
    const { total, page, limit, hasMore } = metadata;
    const items = magazines.map((mag, index) => this.normalizeSearchItem(mag, (page - 1) * limit + index + 1));

    return {
      success: true,
      provider: 'abandonware',
      domain: 'books',
      total,
      count: items.length,
      data: items,
      pagination: {
        page,
        limit,
        hasMore
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        cached: false,
        cacheAge: null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS D'UN MAGAZINE
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeDetailResponse(magazine, issues) {
    const sourceId = String(magazine.id);
    const logoUrl = this._buildLogoUrl(magazine.name);

    return {
      success: true,
      provider: 'abandonware',
      domain: 'books',
      data: {
        id: `abandonware:${sourceId}`,
        type: 'magazine',
        source: 'abandonware',
        sourceId,
        title: magazine.name,
        titleOriginal: null,
        description: null,
        year: null,
        images: {
          primary: logoUrl,
          thumbnail: logoUrl,
          gallery: []
        },
        urls: {
          source: `${BASE_URL}`,
          detail: `/api/books/abandonware/magazine/${sourceId}`,
          issues: `/api/books/abandonware/magazine/${sourceId}/issues`
        },
        details: {
          issueCount: issues.length,
          issues: issues.map(issue => this._normalizeIssue(issue))
        }
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        cached: false,
        cacheAge: null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NUMÉROS (issues)
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeIssuesResponse(magazine, issues, metadata = {}) {
    const { total, page, limit, hasMore } = metadata;

    return {
      success: true,
      provider: 'abandonware',
      domain: 'books',
      magazineId: magazine.id,
      magazineName: magazine.name,
      total,
      count: issues.length,
      data: issues.map(issue => this._normalizeIssue(issue)),
      pagination: {
        page,
        limit,
        hasMore
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        cached: false,
        cacheAge: null
      }
    };
  }

  /**
   * Normalise un seul numéro
   */
  _normalizeIssue(issue) {
    return {
      id: `abandonware:issue:${issue.issueId}`,
      issueId: issue.issueId,
      issueNumber: issue.issueNumber,
      date: issue.date || null,
      year: this._extractYear(issue.date),
      isCd: issue.isCd || false,
      isHorsSerieOrSpecial: issue.isHs || false,
      images: {
        cover: issue.coverUrl || null
      },
      filename: issue.filename || null
    };
  }
}

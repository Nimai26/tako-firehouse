/**
 * src/shared/utils/genre-dictionaries.js - Dictionnaires de traduction des genres
 * Tako_Api
 * 
 * Catégories couvertes :
 * - Films/Séries (IMDB, TMDB, TVDB)
 * - Jeux vidéo (RAWG, IGDB, JVC)
 * - Musique (Deezer, MusicBrainz)
 * - Livres (Google Books, OpenLibrary)
 * - Jeux de société (BoardGameGeek)
 * - Jouets (LEGO, Mega, Playmobil)
 * 
 * @module shared/utils/genre-dictionaries
 */

// ============================================================================
// FILMS / SÉRIES (IMDB, TMDB, TVDB)
// ============================================================================

export const MEDIA_GENRES = {
  // Genres principaux
  action: { fr: 'Action', de: 'Action', es: 'Acción', it: 'Azione', pt: 'Ação' },
  adventure: { fr: 'Aventure', de: 'Abenteuer', es: 'Aventura', it: 'Avventura', pt: 'Aventura' },
  animation: { fr: 'Animation', de: 'Animation', es: 'Animación', it: 'Animazione', pt: 'Animação' },
  biography: { fr: 'Biographie', de: 'Biografie', es: 'Biografía', it: 'Biografia', pt: 'Biografia' },
  comedy: { fr: 'Comédie', de: 'Komödie', es: 'Comedia', it: 'Commedia', pt: 'Comédia' },
  crime: { fr: 'Crime', de: 'Krimi', es: 'Crimen', it: 'Crimine', pt: 'Crime' },
  documentary: { fr: 'Documentaire', de: 'Dokumentation', es: 'Documental', it: 'Documentario', pt: 'Documentário' },
  drama: { fr: 'Drame', de: 'Drama', es: 'Drama', it: 'Dramma', pt: 'Drama' },
  family: { fr: 'Famille', de: 'Familie', es: 'Familia', it: 'Famiglia', pt: 'Família' },
  fantasy: { fr: 'Fantastique', de: 'Fantasy', es: 'Fantasía', it: 'Fantasy', pt: 'Fantasia' },
  'film-noir': { fr: 'Film Noir', de: 'Film Noir', es: 'Cine Negro', it: 'Film Noir', pt: 'Film Noir' },
  history: { fr: 'Histoire', de: 'Geschichte', es: 'Historia', it: 'Storia', pt: 'História' },
  horror: { fr: 'Horreur', de: 'Horror', es: 'Terror', it: 'Horror', pt: 'Terror' },
  music: { fr: 'Musique', de: 'Musik', es: 'Música', it: 'Musica', pt: 'Música' },
  musical: { fr: 'Comédie musicale', de: 'Musical', es: 'Musical', it: 'Musical', pt: 'Musical' },
  mystery: { fr: 'Mystère', de: 'Mystery', es: 'Misterio', it: 'Mistero', pt: 'Mistério' },
  romance: { fr: 'Romance', de: 'Romantik', es: 'Romance', it: 'Romantico', pt: 'Romance' },
  'sci-fi': { fr: 'Science-Fiction', de: 'Sci-Fi', es: 'Ciencia Ficción', it: 'Fantascienza', pt: 'Ficção Científica' },
  'science fiction': { fr: 'Science-Fiction', de: 'Sci-Fi', es: 'Ciencia Ficción', it: 'Fantascienza', pt: 'Ficção Científica' },
  sport: { fr: 'Sport', de: 'Sport', es: 'Deporte', it: 'Sport', pt: 'Esporte' },
  sports: { fr: 'Sport', de: 'Sport', es: 'Deporte', it: 'Sport', pt: 'Esporte' },
  thriller: { fr: 'Thriller', de: 'Thriller', es: 'Suspense', it: 'Thriller', pt: 'Suspense' },
  war: { fr: 'Guerre', de: 'Krieg', es: 'Guerra', it: 'Guerra', pt: 'Guerra' },
  western: { fr: 'Western', de: 'Western', es: 'Western', it: 'Western', pt: 'Faroeste' },
  // Genres TV
  news: { fr: 'Actualités', de: 'Nachrichten', es: 'Noticias', it: 'Notizie', pt: 'Notícias' },
  'reality-tv': { fr: 'Télé-réalité', de: 'Reality-TV', es: 'Reality', it: 'Reality', pt: 'Reality Show' },
  reality: { fr: 'Télé-réalité', de: 'Reality-TV', es: 'Reality', it: 'Reality', pt: 'Reality Show' },
  'talk-show': { fr: 'Talk-show', de: 'Talkshow', es: 'Talk Show', it: 'Talk Show', pt: 'Talk Show' },
  'game-show': { fr: 'Jeu télévisé', de: 'Spielshow', es: 'Concurso', it: 'Game Show', pt: 'Programa de TV' },
  short: { fr: 'Court-métrage', de: 'Kurzfilm', es: 'Cortometraje', it: 'Cortometraggio', pt: 'Curta-metragem' },
  soap: { fr: 'Soap opera', de: 'Seifenoper', es: 'Telenovela', it: 'Soap opera', pt: 'Novela' },
  // Genres pour adultes
  adult: { fr: 'Adulte', de: 'Erwachsene', es: 'Adulto', it: 'Per adulti', pt: 'Adulto' },
  erotic: { fr: 'Érotique', de: 'Erotik', es: 'Erótico', it: 'Erotico', pt: 'Erótico' },
  pornography: { fr: 'Pornographie', de: 'Pornografie', es: 'Pornografía', it: 'Pornografia', pt: 'Pornografia' },
  xxx: { fr: 'XXX', de: 'XXX', es: 'XXX', it: 'XXX', pt: 'XXX' },
  hentai: { fr: 'Hentai', de: 'Hentai', es: 'Hentai', it: 'Hentai', pt: 'Hentai' },
  ecchi: { fr: 'Ecchi', de: 'Ecchi', es: 'Ecchi', it: 'Ecchi', pt: 'Ecchi' },
  yaoi: { fr: 'Yaoi', de: 'Yaoi', es: 'Yaoi', it: 'Yaoi', pt: 'Yaoi' },
  yuri: { fr: 'Yuri', de: 'Yuri', es: 'Yuri', it: 'Yuri', pt: 'Yuri' },
  mature: { fr: 'Mature', de: 'Reif', es: 'Maduro', it: 'Maturo', pt: 'Maduro' },
  nsfw: { fr: 'NSFW', de: 'NSFW', es: 'NSFW', it: 'NSFW', pt: 'NSFW' }
};

// ============================================================================
// JEUX VIDÉO (RAWG, IGDB, JVC)
// ============================================================================

export const VIDEOGAME_GENRES = {
  // Genres principaux
  action: { fr: 'Action', de: 'Action', es: 'Acción', it: 'Azione', pt: 'Ação' },
  adventure: { fr: 'Aventure', de: 'Abenteuer', es: 'Aventura', it: 'Avventura', pt: 'Aventura' },
  'action-adventure': { fr: 'Action-Aventure', de: 'Action-Abenteuer', es: 'Acción-Aventura', it: 'Azione-Avventura', pt: 'Ação-Aventura' },
  rpg: { fr: 'Jeu de rôle', de: 'Rollenspiel', es: 'Juego de rol', it: 'Gioco di ruolo', pt: 'RPG' },
  'role-playing': { fr: 'Jeu de rôle', de: 'Rollenspiel', es: 'Juego de rol', it: 'Gioco di ruolo', pt: 'RPG' },
  'role-playing-games-rpg': { fr: 'Jeu de rôle', de: 'Rollenspiel', es: 'Juego de rol', it: 'Gioco di ruolo', pt: 'RPG' },
  shooter: { fr: 'Tir', de: 'Shooter', es: 'Disparos', it: 'Sparatutto', pt: 'Tiro' },
  fps: { fr: 'FPS', de: 'Ego-Shooter', es: 'FPS', it: 'FPS', pt: 'FPS' },
  'first-person shooter': { fr: 'Tir à la première personne', de: 'Ego-Shooter', es: 'Disparos en primera persona', it: 'Sparatutto in prima persona', pt: 'Tiro em primeira pessoa' },
  'third-person shooter': { fr: 'Tir à la troisième personne', de: 'Third-Person-Shooter', es: 'Disparos en tercera persona', it: 'Sparatutto in terza persona', pt: 'Tiro em terceira pessoa' },
  strategy: { fr: 'Stratégie', de: 'Strategie', es: 'Estrategia', it: 'Strategia', pt: 'Estratégia' },
  'real-time strategy': { fr: 'Stratégie temps réel', de: 'Echtzeit-Strategie', es: 'Estrategia en tiempo real', it: 'Strategia in tempo reale', pt: 'Estratégia em tempo real' },
  'turn-based strategy': { fr: 'Stratégie au tour par tour', de: 'Rundenbasierte Strategie', es: 'Estrategia por turnos', it: 'Strategia a turni', pt: 'Estratégia por turnos' },
  simulation: { fr: 'Simulation', de: 'Simulation', es: 'Simulación', it: 'Simulazione', pt: 'Simulação' },
  sports: { fr: 'Sport', de: 'Sport', es: 'Deportes', it: 'Sport', pt: 'Esportes' },
  racing: { fr: 'Course', de: 'Rennen', es: 'Carreras', it: 'Corse', pt: 'Corrida' },
  puzzle: { fr: 'Puzzle', de: 'Rätsel', es: 'Puzle', it: 'Puzzle', pt: 'Puzzle' },
  platformer: { fr: 'Plateforme', de: 'Jump\'n\'Run', es: 'Plataformas', it: 'Platform', pt: 'Plataforma' },
  platform: { fr: 'Plateforme', de: 'Jump\'n\'Run', es: 'Plataformas', it: 'Platform', pt: 'Plataforma' },
  fighting: { fr: 'Combat', de: 'Kampfspiel', es: 'Lucha', it: 'Picchiaduro', pt: 'Luta' },
  arcade: { fr: 'Arcade', de: 'Arcade', es: 'Arcade', it: 'Arcade', pt: 'Arcade' },
  indie: { fr: 'Indépendant', de: 'Indie', es: 'Independiente', it: 'Indie', pt: 'Indie' },
  casual: { fr: 'Casual', de: 'Casual', es: 'Casual', it: 'Casual', pt: 'Casual' },
  mmo: { fr: 'MMO', de: 'MMO', es: 'MMO', it: 'MMO', pt: 'MMO' },
  mmorpg: { fr: 'MMORPG', de: 'MMORPG', es: 'MMORPG', it: 'MMORPG', pt: 'MMORPG' },
  'massively-multiplayer': { fr: 'Massivement multijoueur', de: 'Massively Multiplayer', es: 'Multijugador masivo', it: 'Multiplayer di massa', pt: 'Multijogador massivo' },
  survival: { fr: 'Survie', de: 'Survival', es: 'Supervivencia', it: 'Sopravvivenza', pt: 'Sobrevivência' },
  horror: { fr: 'Horreur', de: 'Horror', es: 'Terror', it: 'Horror', pt: 'Terror' },
  'survival horror': { fr: 'Survival Horror', de: 'Survival Horror', es: 'Terror de supervivencia', it: 'Survival Horror', pt: 'Terror de sobrevivência' },
  sandbox: { fr: 'Bac à sable', de: 'Sandbox', es: 'Sandbox', it: 'Sandbox', pt: 'Sandbox' },
  'open world': { fr: 'Monde ouvert', de: 'Open World', es: 'Mundo abierto', it: 'Mondo aperto', pt: 'Mundo aberto' },
  stealth: { fr: 'Infiltration', de: 'Stealth', es: 'Sigilo', it: 'Stealth', pt: 'Furtivo' },
  'hack and slash': { fr: 'Hack\'n\'Slash', de: 'Hack\'n\'Slay', es: 'Hack and slash', it: 'Hack and slash', pt: 'Hack and slash' },
  'beat em up': { fr: 'Beat\'em up', de: 'Beat\'em up', es: 'Beat\'em up', it: 'Beat\'em up', pt: 'Beat\'em up' },
  metroidvania: { fr: 'Metroidvania', de: 'Metroidvania', es: 'Metroidvania', it: 'Metroidvania', pt: 'Metroidvania' },
  roguelike: { fr: 'Roguelike', de: 'Roguelike', es: 'Roguelike', it: 'Roguelike', pt: 'Roguelike' },
  roguelite: { fr: 'Roguelite', de: 'Roguelite', es: 'Roguelite', it: 'Roguelite', pt: 'Roguelite' },
  'visual novel': { fr: 'Visual Novel', de: 'Visual Novel', es: 'Novela visual', it: 'Visual Novel', pt: 'Visual Novel' },
  'tower defense': { fr: 'Tower Defense', de: 'Tower Defense', es: 'Defensa de torres', it: 'Tower Defense', pt: 'Tower Defense' },
  'battle royale': { fr: 'Battle Royale', de: 'Battle Royale', es: 'Battle Royale', it: 'Battle Royale', pt: 'Battle Royale' },
  card: { fr: 'Cartes', de: 'Karten', es: 'Cartas', it: 'Carte', pt: 'Cartas' },
  educational: { fr: 'Éducatif', de: 'Lernspiel', es: 'Educativo', it: 'Educativo', pt: 'Educativo' },
  family: { fr: 'Familial', de: 'Familienspiel', es: 'Familiar', it: 'Famiglia', pt: 'Familiar' },
  music: { fr: 'Musique', de: 'Musik', es: 'Música', it: 'Musica', pt: 'Música' },
  board: { fr: 'Jeu de plateau', de: 'Brettspiel', es: 'Juego de mesa', it: 'Gioco da tavolo', pt: 'Jogo de tabuleiro' },
  // Genres pour adultes
  adult: { fr: 'Adulte', de: 'Erwachsene', es: 'Adulto', it: 'Adulti', pt: 'Adulto' },
  erotic: { fr: 'Érotique', de: 'Erotik', es: 'Erótico', it: 'Erotico', pt: 'Erótico' },
  hentai: { fr: 'Hentai', de: 'Hentai', es: 'Hentai', it: 'Hentai', pt: 'Hentai' },
  mature: { fr: 'Mature', de: 'Erwachsen', es: 'Maduro', it: 'Maturo', pt: 'Maduro' },
  nsfw: { fr: 'NSFW', de: 'NSFW', es: 'NSFW', it: 'NSFW', pt: 'NSFW' },
  sexual: { fr: 'Sexuel', de: 'Sexuell', es: 'Sexual', it: 'Sessuale', pt: 'Sexual' }
};

// ============================================================================
// MUSIQUE (Deezer, MusicBrainz, Discogs)
// ============================================================================

export const MUSIC_GENRES = {
  rock: { fr: 'Rock', de: 'Rock', es: 'Rock', it: 'Rock', pt: 'Rock' },
  pop: { fr: 'Pop', de: 'Pop', es: 'Pop', it: 'Pop', pt: 'Pop' },
  'hip-hop': { fr: 'Hip-hop', de: 'Hip-Hop', es: 'Hip-hop', it: 'Hip-hop', pt: 'Hip-hop' },
  rap: { fr: 'Rap', de: 'Rap', es: 'Rap', it: 'Rap', pt: 'Rap' },
  jazz: { fr: 'Jazz', de: 'Jazz', es: 'Jazz', it: 'Jazz', pt: 'Jazz' },
  blues: { fr: 'Blues', de: 'Blues', es: 'Blues', it: 'Blues', pt: 'Blues' },
  classical: { fr: 'Classique', de: 'Klassik', es: 'Clásica', it: 'Classica', pt: 'Clássica' },
  electronic: { fr: 'Électronique', de: 'Elektronisch', es: 'Electrónica', it: 'Elettronica', pt: 'Eletrônica' },
  electro: { fr: 'Électro', de: 'Elektro', es: 'Electro', it: 'Elettro', pt: 'Electro' },
  dance: { fr: 'Dance', de: 'Dance', es: 'Dance', it: 'Dance', pt: 'Dance' },
  house: { fr: 'House', de: 'House', es: 'House', it: 'House', pt: 'House' },
  techno: { fr: 'Techno', de: 'Techno', es: 'Techno', it: 'Techno', pt: 'Techno' },
  metal: { fr: 'Metal', de: 'Metal', es: 'Metal', it: 'Metal', pt: 'Metal' },
  punk: { fr: 'Punk', de: 'Punk', es: 'Punk', it: 'Punk', pt: 'Punk' },
  alternative: { fr: 'Alternatif', de: 'Alternative', es: 'Alternativo', it: 'Alternativo', pt: 'Alternativo' },
  indie: { fr: 'Indie', de: 'Indie', es: 'Indie', it: 'Indie', pt: 'Indie' },
  folk: { fr: 'Folk', de: 'Folk', es: 'Folk', it: 'Folk', pt: 'Folk' },
  country: { fr: 'Country', de: 'Country', es: 'Country', it: 'Country', pt: 'Country' },
  reggae: { fr: 'Reggae', de: 'Reggae', es: 'Reggae', it: 'Reggae', pt: 'Reggae' },
  soul: { fr: 'Soul', de: 'Soul', es: 'Soul', it: 'Soul', pt: 'Soul' },
  funk: { fr: 'Funk', de: 'Funk', es: 'Funk', it: 'Funk', pt: 'Funk' },
  'r&b': { fr: 'R&B', de: 'R&B', es: 'R&B', it: 'R&B', pt: 'R&B' },
  disco: { fr: 'Disco', de: 'Disco', es: 'Disco', it: 'Disco', pt: 'Disco' },
  gospel: { fr: 'Gospel', de: 'Gospel', es: 'Gospel', it: 'Gospel', pt: 'Gospel' },
  latin: { fr: 'Latino', de: 'Latin', es: 'Latino', it: 'Latino', pt: 'Latino' },
  world: { fr: 'Musique du monde', de: 'Weltmusik', es: 'Música del mundo', it: 'World Music', pt: 'Música do mundo' },
  soundtrack: { fr: 'Bande originale', de: 'Soundtrack', es: 'Banda sonora', it: 'Colonna sonora', pt: 'Trilha sonora' },
  ambient: { fr: 'Ambient', de: 'Ambient', es: 'Ambient', it: 'Ambient', pt: 'Ambient' },
  opera: { fr: 'Opéra', de: 'Oper', es: 'Ópera', it: 'Opera', pt: 'Ópera' }
};

// ============================================================================
// LIVRES (Google Books, OpenLibrary)
// ============================================================================

export const BOOK_GENRES = {
  // Fiction
  fiction: { fr: 'Fiction', de: 'Belletristik', es: 'Ficción', it: 'Narrativa', pt: 'Ficção' },
  'literary fiction': { fr: 'Fiction littéraire', de: 'Literarische Fiktion', es: 'Ficción literaria', it: 'Narrativa letteraria', pt: 'Ficção literária' },
  'science fiction': { fr: 'Science-Fiction', de: 'Science-Fiction', es: 'Ciencia ficción', it: 'Fantascienza', pt: 'Ficção científica' },
  fantasy: { fr: 'Fantasy', de: 'Fantasy', es: 'Fantasía', it: 'Fantasy', pt: 'Fantasia' },
  mystery: { fr: 'Mystère', de: 'Krimi', es: 'Misterio', it: 'Giallo', pt: 'Mistério' },
  thriller: { fr: 'Thriller', de: 'Thriller', es: 'Thriller', it: 'Thriller', pt: 'Thriller' },
  horror: { fr: 'Horreur', de: 'Horror', es: 'Terror', it: 'Horror', pt: 'Terror' },
  romance: { fr: 'Romance', de: 'Liebesroman', es: 'Romance', it: 'Rosa', pt: 'Romance' },
  'historical fiction': { fr: 'Roman historique', de: 'Historischer Roman', es: 'Ficción histórica', it: 'Romanzo storico', pt: 'Ficção histórica' },
  adventure: { fr: 'Aventure', de: 'Abenteuer', es: 'Aventura', it: 'Avventura', pt: 'Aventura' },
  crime: { fr: 'Policier', de: 'Krimi', es: 'Novela negra', it: 'Giallo', pt: 'Policial' },
  detective: { fr: 'Policier', de: 'Detektivroman', es: 'Novela detectivesca', it: 'Giallo', pt: 'Detetive' },
  western: { fr: 'Western', de: 'Western', es: 'Western', it: 'Western', pt: 'Faroeste' },
  // Non-fiction
  'non-fiction': { fr: 'Non-fiction', de: 'Sachbuch', es: 'No ficción', it: 'Saggistica', pt: 'Não-ficção' },
  nonfiction: { fr: 'Non-fiction', de: 'Sachbuch', es: 'No ficción', it: 'Saggistica', pt: 'Não-ficção' },
  biography: { fr: 'Biographie', de: 'Biografie', es: 'Biografía', it: 'Biografia', pt: 'Biografia' },
  autobiography: { fr: 'Autobiographie', de: 'Autobiografie', es: 'Autobiografía', it: 'Autobiografia', pt: 'Autobiografia' },
  memoir: { fr: 'Mémoires', de: 'Memoiren', es: 'Memorias', it: 'Memorie', pt: 'Memórias' },
  history: { fr: 'Histoire', de: 'Geschichte', es: 'Historia', it: 'Storia', pt: 'História' },
  science: { fr: 'Sciences', de: 'Wissenschaft', es: 'Ciencia', it: 'Scienza', pt: 'Ciência' },
  philosophy: { fr: 'Philosophie', de: 'Philosophie', es: 'Filosofía', it: 'Filosofia', pt: 'Filosofia' },
  psychology: { fr: 'Psychologie', de: 'Psychologie', es: 'Psicología', it: 'Psicologia', pt: 'Psicologia' },
  'self-help': { fr: 'Développement personnel', de: 'Selbsthilfe', es: 'Autoayuda', it: 'Self-help', pt: 'Autoajuda' },
  business: { fr: 'Business', de: 'Wirtschaft', es: 'Negocios', it: 'Business', pt: 'Negócios' },
  economics: { fr: 'Économie', de: 'Wirtschaft', es: 'Economía', it: 'Economia', pt: 'Economia' },
  politics: { fr: 'Politique', de: 'Politik', es: 'Política', it: 'Politica', pt: 'Política' },
  travel: { fr: 'Voyage', de: 'Reise', es: 'Viajes', it: 'Viaggi', pt: 'Viagem' },
  cooking: { fr: 'Cuisine', de: 'Kochen', es: 'Cocina', it: 'Cucina', pt: 'Culinária' },
  art: { fr: 'Art', de: 'Kunst', es: 'Arte', it: 'Arte', pt: 'Arte' },
  photography: { fr: 'Photographie', de: 'Fotografie', es: 'Fotografía', it: 'Fotografia', pt: 'Fotografia' },
  religion: { fr: 'Religion', de: 'Religion', es: 'Religión', it: 'Religione', pt: 'Religião' },
  spirituality: { fr: 'Spiritualité', de: 'Spiritualität', es: 'Espiritualidad', it: 'Spiritualità', pt: 'Espiritualidade' },
  // Jeunesse
  'children\'s': { fr: 'Jeunesse', de: 'Kinderbuch', es: 'Infantil', it: 'Per bambini', pt: 'Infantil' },
  children: { fr: 'Jeunesse', de: 'Kinderbuch', es: 'Infantil', it: 'Per bambini', pt: 'Infantil' },
  'young adult': { fr: 'Young Adult', de: 'Jugendbuch', es: 'Juvenil', it: 'Young Adult', pt: 'Jovem adulto' },
  // BD/Comics/Manga
  comics: { fr: 'Bande dessinée', de: 'Comics', es: 'Cómics', it: 'Fumetti', pt: 'Quadrinhos' },
  'graphic novel': { fr: 'Roman graphique', de: 'Graphic Novel', es: 'Novela gráfica', it: 'Graphic novel', pt: 'Graphic novel' },
  manga: { fr: 'Manga', de: 'Manga', es: 'Manga', it: 'Manga', pt: 'Mangá' },
  // Genres pour adultes
  erotica: { fr: 'Érotique', de: 'Erotik', es: 'Erótica', it: 'Erotico', pt: 'Erótica' },
  'adult fiction': { fr: 'Fiction pour adultes', de: 'Erwachsenenliteratur', es: 'Ficción adulta', it: 'Narrativa per adulti', pt: 'Ficção adulta' },
  'erotic romance': { fr: 'Romance érotique', de: 'Erotischer Liebesroman', es: 'Romance erótico', it: 'Romance erotico', pt: 'Romance erótico' },
  bdsm: { fr: 'BDSM', de: 'BDSM', es: 'BDSM', it: 'BDSM', pt: 'BDSM' },
  adult: { fr: 'Adulte', de: 'Erwachsene', es: 'Adulto', it: 'Per adulti', pt: 'Adulto' },
  mature: { fr: 'Mature', de: 'Reif', es: 'Maduro', it: 'Maturo', pt: 'Maduro' },
  hentai: { fr: 'Hentai', de: 'Hentai', es: 'Hentai', it: 'Hentai', pt: 'Hentai' },
  yaoi: { fr: 'Yaoi', de: 'Yaoi', es: 'Yaoi', it: 'Yaoi', pt: 'Yaoi' },
  yuri: { fr: 'Yuri', de: 'Yuri', es: 'Yuri', it: 'Yuri', pt: 'Yuri' }
};

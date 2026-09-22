/**
 * Steam Catalog - Local Client
 * 
 * Este arquivo mostra como consumir os JSONs do catálogo no app Fusion.
 * 
 * Uso:
 *   // Em src/services/:
 *   import { getCatalog, getGameDetails, searchGames } from '../../lib/steam-catalog-client';
 */

// Tipos TypeScript
export interface Game {
  appId: number;
  title: string;
  slug: string;
  releaseYear: number;
  genres: string[];
  developer: string;
  publisher: string;
  steamRating: number;
  metacriticScore?: number;
  familyFriendly: boolean;
  contentWarnings: string[];
  hasSource: boolean;
  sourceInfo?: {
    sourceName: string;
    crackGroup: string;
    emulator: string;
    verified: boolean;
    working: boolean;
    lastUpdated: string;
    totalUrls: number;
  };
  tags: string[];
}

export interface CatalogData {
  version: string;
  generatedAt: string;
  metadata: {
    totalGames: number;
    familyFriendlyGames: number;
    gamesWithSources: number;
    familyFriendlyWithSources: number;
  };
  catalog: Game[];
}

// Funçºº ões principais

/**
 * Carrega o catálogo completo
 */
export async function getCatalog(): Promise<CatalogData> {
  // O Vite inclui este JSON na publicação, sem depender de uma rota /data/.
  const { default: catalog } = await import('../data/steam-catalog-index.json');
  return catalog as CatalogData;
}

/**
 * Filtra só jogos family-friendly
 */
export async function getFamilyFriendlyCatalog(): Promise<Game[]> {
  const catalog = await getCatalog();
  return catalog.catalog.filter(game => game.familyFriendly === true);
}

/**
 * Busca jogos por termo (nome, gênero, tags)
 */
export async function searchGames(query: string): Promise<Game[]> {
  const catalog = await getCatalog();
  const searchTerm = query.toLowerCase().trim();

  if (!searchTerm) {
    return catalog.catalog;
  }

  return catalog.catalog.filter(game => {
    const titleMatch = game.title.toLowerCase().includes(searchTerm);
    const genreMatch = game.genres.some(g => g.toLowerCase().includes(searchTerm));
    const tagMatch = game.tags.some(t => t.toLowerCase().includes(searchTerm));

    return titleMatch || genreMatch || tagMatch;
  });
}

/**
 * Busca detalhes de um jogo espec ífico
 */
export async function getGameDetails(appId: number): Promise<Game | null> {
  const catalog = await getCatalog();
  return catalog.catalog.find(game => game.appId === appId) || null;
}

/**
 * Busca jogos por gênero
 */
export async function getGamesByGenre(genre: string): Promise<Game[]> {
  const catalog = await getCatalog();
  return catalog.catalog.filter(game => 
    game.genres.some(g => g.toLowerCase() === genre.toLowerCase())
  );
}

/**
 * Busca jogos populares (top rated)
 */
export async function getPopularGames(limit: number = 10): Promise<Game[]> {
  const catalog = await getCatalog();
  return catalog.catalog
    .filter(game => game.familyFriendly) // S ó mostra family-friendly
    .sort((a, b) => b.steamRating - a.steamRating)
    .slice(0, limit);
}

/**
 * Busca jogos com fontes disponíveis
 */
export async function getGamesWithSources(): Promise<Game[]> {
  const catalog = await getCatalog();
  return catalog.catalog.filter(game => game.hasSource);
}

// Exemplo de uso em um componente React:
/*
import { getFamilyFriendlyCatalog, searchGames, getPopularGames } from '@/lib/steam-catalog';

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [popular, setPopular] = useState<Game[]>([]);

  useEffect(() => {
    async function loadData() {
      const [allGames, popularGames] = await Promise.all([
        getFamilyFriendlyCatalog(),
        getPopularGames(10)
      ]);
      setGames(allGames);
      setPopular(popularGames);
    }
    loadData();
  }, []);

  return (
    <div>
      <h1>Jogos Family-Friendly</h1>
      <GameList games={games} />

      <h2>Mais Populares</h2>
      <GameList games={popular} />
    </div>
  );
}
*/

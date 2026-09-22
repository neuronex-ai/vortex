# Catálogo Fusion: Steam e fontes externas

## Fluxo implementado

1. `steam-catalog-index.json` controla a seleção pública. Apenas registros com `familyFriendly: true` entram nas listas, buscas, detalhes e favoritos visíveis. Atualmente são 2 dos 5 registros. Os favoritos de outros jogos permanecem no banco, sem serem apagados.
2. O cliente consulta os metadados Steam já existentes no banco Fusion por `steam_app_id`. Preserva IDs de favoritos, capas, descrições, gêneros, coop, requisitos e galeria. Não executa os antigos fallbacks de descoberta externa durante a busca.
3. `steam-sources.json` e `steam-external-references.json` complementam os jogos com referências. As informações externas não substituem a descrição ou classificação da Steam.
4. O catálogo busca por nome, descrição, gêneros e tags; ordena por avaliação do índice, ano ou nome; filtra por gênero, coop e presença de fontes. A paginação é aplicada depois dos filtros.
5. “Ver download externo” abre a página exata do provedor em outra aba. “Consultar referência no GitHub” abre a origem versionada da informação. Nenhum arquivo de jogo é baixado pelo Fusion.

## Classificação e disponibilidade

`familyFriendly` é uma decisão editorial do índice fornecido, não uma certificação de classificação etária da Steam. A idade informada pela Steam continua aparecendo nos detalhes quando disponível. Para ampliar a seleção, adicione e revise os jogos no índice antes de marcá-los como adequados.

“Fonte disponível” significa que existe um endereço utilizável na referência, não que o download foi testado. Links `EXAMPLE`, URLs inválidas, protocolos executáveis ou fontes marcadas `working: false` não recebem botão. Uma referência somente no GitHub pode aparecer sem prometer um download.

O tamanho exibido é o informado pela fonte externa para aquela versão, não o espaço de instalação exigido pela Steam. Dados ausentes não são inventados. Se o banco ficar indisponível, o catálogo usa os dados locais e informa a limitação; salvar favoritos exige o ID real do banco.

## Projetos examinados em 22/09/2026

| Projeto | Resultado | Uso no Fusion |
| --- | --- | --- |
| [SteamRipClient](https://github.com/AveryChangedMan/SteamRipClient) | JSON com 3.995 registros; projeto declara AGPL-3.0 | Importação de referências e tamanhos; nenhum executável ou código do cliente instalado |
| [SteamRip-scraper-](https://github.com/Koriebonx98/SteamRip-scraper-) | Script gera `All.Games.json` e `New.Games.json`, mas esses arquivos não estão publicados na árvore examinada; usa Selenium/Chrome | Não executado; não oferece um feed pronto nesta revisão |
| [steamrip-installer](https://github.com/apollodaniel/steamrip-installer) | Instalador Electron, licença MIT | Não necessário para um catálogo que só redireciona |
| [steamrip-scraper](https://github.com/dr-miami/steamrip-scraper) | Busca interativa e extração de links; pode abrir navegador; sem JSON publicado na árvore examinada | Não executado |

As duas fontes ativas são as páginas de Hollow Knight e Stardew Valley no SteamRIP, extraídas do JSON do SteamRipClient. As tentativas de consultar essas páginas por HTTP falharam por conexão no ambiente de desenvolvimento; a existência no JSON não equivale a uma validação do destino.

## Atualizar referências

Execute `npm run catalog:sync-sources` e depois `npm run test:catalog` e `npm run build`.

O importador lê apenas JSON do GitHub. Não executa scrapers, instaladores, scripts remotos, downloads de jogos ou instruções contidas nos dados. A configuração está em `github-source-providers.json`, com revisão Git fixa e domínios permitidos. Para adotar outra revisão, examine a alteração e atualize o commit na configuração antes da sincronização.

O cruzamento prioriza `appId`/`steam_app_id`. Quando a fonte não informa ID, aceita apenas título integral normalizado com correspondência única. Mantém subtítulos, edições e números: Hollow Knight não corresponde a Hollow Knight: Silksong. Casos ausentes ou ambíguos ficam sem referência automática.

`steam-external-references.json` registra projeto, revisão, hash do JSON, quantidade de registros examinados, data da consulta, método de correspondência e linha de origem. Em caso de erro de rede ou formato, o arquivo anterior é preservado. Para outro provedor, acrescente um adaptador específico e seus domínios, mantendo as mesmas verificações.

## Verificação

`npm run test:catalog` cobre filtros, busca por descrição, ordenação, paginação, correspondências ambíguas, URLs, preservação dos dados Steam e favoritos com banco simulado. A consulta real de metadados é somente leitura; não grava favoritos em contas reais. A avaliação visual fica com o responsável pelo projeto.

## Atualização: busca Steam e múltiplos provedores

A busca agora consulta a função existente search_steam_fallback_ids quando o termo tem de 2 a 80 caracteres. Essa função pesquisa na Steam e sincroniza os metadados no banco. O cliente mescla os resultados sem duplicar appIds e preserva os IDs usados pelos favoritos. Links profundos de jogos descobertos também são resolvidos pelo banco após recarregar a página. Os resultados ficam em cache por um minuto; falhas podem ser tentadas novamente sem precisar alterar o termo.

Jogos presentes no índice mantêm sua classificação editorial. Para novos jogos, o cliente exige adult_content=false, required_age=0, lista de descritores explícita e vazia e ausência de tags de conteúdo bloqueado. Metadados ausentes não são tratados como classificação aprovada. Isso é um filtro baseado nos dados Steam, não uma classificação etária independente.

O snapshot de referências passa a incluir páginas de todos os jogos dos provedores, para cruzar os títulos descobertos pela Steam. Essas referências não viram jogos na interface por conta própria. O adaptador FitGirl remove apenas o sufixo que começa com separador e versão vN; edições e subtítulos são preservados. Correspondências ambíguas por provedor são rejeitadas.

A integração ativa usa SteamRIP e [FitGirl](https://github.com/vladmandic/fitgirl), que informa páginas com opções torrent. O Fusion abre a página externa; não inicia torrent nem instala cliente uTorrent. O catálogo FitGirl examinado tem 3.082 registros e usa licença MIT. Não foi necessário instalar o Hydra ou um agregador externo; seus formatos públicos serviram para identificar uma fonte JSON compatível.

O botão principal de download aparece junto à descrição. Referências do GitHub ficam apenas nos dados de procedência internos, sem link na interface. O usuário confirmou a abertura da página SteamRIP via Tor; não há uso de Tor pelo Fusion.

SteamVerde permanece pendente de identificação do domínio exato. Os projetos SteamUnlocked examinados não apresentaram feed pronto; nenhum endereço desse provedor foi inventado ou ativado. A busca por projetos e formatos incluiu [GameHubApi](https://github.com/FxxMorgan/GameHubApi), [Steamunlocked](https://github.com/N-O-E-D/Steamunlocked) e [HydraLinks](https://github.com/ArnamentGames/HydraLinks).

Esta seção substitui as limitações anteriores de busca restrita ao índice, favoritos visíveis restritos a dois jogos e referências GitHub na interface.

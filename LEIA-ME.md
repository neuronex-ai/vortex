# Vórtex AI — exportação local em HTML, CSS e JavaScript

Origem: https://arquitetodeia.framer.ai/

## Como abrir

Abra `index.html` com dois cliques. Não precisa instalar Framer, React, Node.js ou pacotes. Mantenha as subpastas junto dos arquivos HTML. Se recebeu o ZIP, extraia a pasta inteira antes de abrir.

## O que está incluído

- 13 páginas públicas: início, contato, lista de espera, blog, 6 artigos, changelog, política de privacidade e página 404.
- 234 arquivos de imagens, fontes e recursos visuais armazenados em `assets/`, além dos ícones SVG incluídos no HTML.
- Estilos originais e regras para diferentes tamanhos de tela em `css/`.
- Menu responsivo, perguntas frequentes e comportamento local dos formulários em `js/site.js`.
- Links entre páginas convertidos para arquivos locais. Links externos, e-mails e textos de exemplo do site original foram preservados.

## Como editar

Os textos estão nos arquivos `.html`. O visual de cada página está no arquivo correspondente dentro de `css/`; adaptações da exportação estão em `css/local.css`. As interações estão em `js/site.js`.

A estrutura e os nomes das classes foram gerados pelo Framer e preservados para manter o visual. Esta é uma exportação do site publicado, não o arquivo de projeto do editor Framer. Não inclui o painel do CMS, versões anteriores, páginas não publicadas ou servidor privado.

## Diferenças em relação ao site publicado

- Animações de entrada e efeitos dependentes do motor do Framer foram convertidos para estados estáticos visíveis. Carrosséis podem ser percorridos horizontalmente. O cursor personalizado e a reprodução exata de todas as animações não foram mantidos.
- O FAQ usa controles nativos de HTML, com as cinco respostas originais.
- Formulários validam os campos, mas **não enviam dados**. Ao tentar enviar, mostram uma mensagem explicando isso. Para receber contatos, conecte um serviço de envio em `js/site.js`; o endereço público não disponibiliza um servidor independente do Framer.
- A âncora `#features`, sem destino no HTML original, foi associada ao primeiro pilar para que os links correspondentes funcionem.
- As diferenças de texto já existentes entre versões para celular e computador foram preservadas, assim como páginas e textos em inglês do modelo original.

## Verificação

Foram conferidas as referências locais das 13 páginas e dos estilos: nenhum arquivo faltante, nenhuma âncora interna sem destino e nenhum recurso de exibição dependente de URL externa. A página inicial, o menu, o FAQ e a página de contato foram verificados no Chrome; a página inicial também foi conferida em largura de celular.

O arquivo `manifesto-exportacao.json` relaciona as páginas e os recursos com seus endereços de origem.

import type { TacoFood } from './types';

// Seed de ~90 alimentos comuns da culinária brasileira, com valores
// por 100g baseados na Tabela Brasileira de Composição de Alimentos
// (TACO), 4ª edição, NEPA/UNICAMP — os mesmos números amplamente
// citados por nutricionistas e apps brasileiros para estes itens.
//
// IMPORTANTE: isto foi montado a partir do conhecimento geral do
// modelo sobre os valores publicados da TACO, não de um download
// direto do CSV oficial (não tínhamos o arquivo disponível). Para
// qualquer uso onde precisão exata importa, valide os números contra
// a tabela oficial antes do lançamento — ver import-taco-csv.ts, que
// já está pronto para substituir/expandir este seed pelo CSV
// completo (~600 itens) assim que ele estiver disponível.
export const TACO_FOODS: TacoFood[] = [
  // Cereais e grãos
  { id: 'arroz-branco-cozido', name: 'Arroz branco cozido', aliases: ['arroz', 'arroz branco'], kcal100g: 128, protein100g: 2.5, carbs100g: 28.1, fat100g: 0.2, fiber100g: 1.6 },
  { id: 'arroz-integral-cozido', name: 'Arroz integral cozido', aliases: ['arroz integral'], kcal100g: 124, protein100g: 2.6, carbs100g: 25.8, fat100g: 1.0, fiber100g: 2.7 },
  { id: 'feijao-carioca-cozido', name: 'Feijão carioca cozido', aliases: ['feijão', 'feijão marrom', 'feijão carioca'], kcal100g: 76, protein100g: 4.8, carbs100g: 13.6, fat100g: 0.5, fiber100g: 8.5 },
  { id: 'feijao-preto-cozido', name: 'Feijão preto cozido', aliases: ['feijão preto'], kcal100g: 77, protein100g: 4.5, carbs100g: 14.0, fat100g: 0.5, fiber100g: 8.4 },
  { id: 'feijao-fradinho-cozido', name: 'Feijão fradinho cozido', aliases: ['feijão fradinho', 'feijão de corda'], kcal100g: 77, protein100g: 6.0, carbs100g: 13.6, fat100g: 0.6, fiber100g: 6.5 },
  { id: 'macarrao-cozido', name: 'Macarrão cozido', aliases: ['macarrão', 'massa', 'espaguete'], kcal100g: 111, protein100g: 3.5, carbs100g: 22.7, fat100g: 0.7, fiber100g: 1.6 },
  { id: 'macarrao-instantaneo-miojo', name: 'Macarrão instantâneo (tipo miojo), preparado', aliases: ['miojo', 'lamen', 'macarrão instantâneo'], kcal100g: 148, protein100g: 3.2, carbs100g: 19.5, fat100g: 6.8, fiber100g: 1.0 },
  { id: 'aveia-flocos', name: 'Aveia em flocos', aliases: ['aveia'], kcal100g: 394, protein100g: 13.9, carbs100g: 66.6, fat100g: 8.5, fiber100g: 9.1 },
  { id: 'milho-verde-cozido', name: 'Milho verde cozido', aliases: ['milho'], kcal100g: 98, protein100g: 3.3, carbs100g: 19.9, fat100g: 1.5, fiber100g: 2.7 },
  { id: 'pipoca-sem-oleo', name: 'Pipoca sem óleo', aliases: ['pipoca'], kcal100g: 359, protein100g: 11.4, carbs100g: 77.8, fat100g: 2.9, fiber100g: 13.1 },
  { id: 'cuscuz-de-milho', name: 'Cuscuz de milho', aliases: ['cuscuz', 'cuscuz nordestino'], kcal100g: 112, protein100g: 2.5, carbs100g: 25.3, fat100g: 0.2, fiber100g: 3.9 },

  // Tubérculos e raízes
  { id: 'batata-inglesa-cozida', name: 'Batata inglesa cozida', aliases: ['batata', 'batata cozida'], kcal100g: 52, protein100g: 1.2, carbs100g: 11.9, fat100g: 0.1, fiber100g: 1.3 },
  { id: 'batata-doce-cozida', name: 'Batata doce cozida', aliases: ['batata doce'], kcal100g: 77, protein100g: 0.6, carbs100g: 18.4, fat100g: 0.1, fiber100g: 2.2 },
  { id: 'mandioca-cozida', name: 'Mandioca cozida', aliases: ['aipim', 'macaxeira', 'mandioca'], kcal100g: 125, protein100g: 0.6, carbs100g: 30.1, fat100g: 0.3, fiber100g: 1.6 },
  { id: 'farinha-de-mandioca', name: 'Farinha de mandioca', aliases: ['farinha de mandioca', 'farofa crua'], kcal100g: 361, protein100g: 1.6, carbs100g: 87.9, fat100g: 0.3, fiber100g: 6.4 },
  { id: 'tapioca-goma-hidratada', name: 'Tapioca (goma hidratada)', aliases: ['tapioca', 'beiju'], kcal100g: 96, protein100g: 0.0, carbs100g: 23.6, fat100g: 0.0, fiber100g: 0.0 },
  { id: 'inhame-cozido', name: 'Inhame cozido', aliases: ['inhame'], kcal100g: 97, protein100g: 2.4, carbs100g: 23.2, fat100g: 0.1, fiber100g: 2.9 },

  // Carnes, ovos e peixes
  { id: 'frango-peito-grelhado', name: 'Frango, peito, grelhado', aliases: ['peito de frango', 'frango grelhado', 'frango'], kcal100g: 159, protein100g: 32.0, carbs100g: 0.0, fat100g: 3.0, fiber100g: 0.0 },
  { id: 'frango-coxa-sobrecoxa-assada', name: 'Frango, coxa/sobrecoxa, assada', aliases: ['coxa de frango', 'sobrecoxa'], kcal100g: 215, protein100g: 26.0, carbs100g: 0.0, fat100g: 11.0, fiber100g: 0.0 },
  { id: 'frango-frito', name: 'Frango frito', aliases: ['frango à passarinho', 'frango empanado'], kcal100g: 290, protein100g: 25.0, carbs100g: 8.0, fat100g: 18.0, fiber100g: 0.3 },
  { id: 'carne-bovina-patinho-grelhado', name: 'Carne bovina, patinho, grelhado', aliases: ['carne moída', 'carne bovina', 'bife', 'patinho'], kcal100g: 219, protein100g: 35.9, carbs100g: 0.0, fat100g: 7.3, fiber100g: 0.0 },
  { id: 'carne-bovina-acem-cozido', name: 'Carne bovina, acém, cozido', aliases: ['acém', 'carne de panela'], kcal100g: 212, protein100g: 26.9, carbs100g: 0.0, fat100g: 10.9, fiber100g: 0.0 },
  { id: 'carne-suina-lombo-assado', name: 'Carne suína, lombo, assado', aliases: ['lombo suíno', 'lombo de porco', 'porco'], kcal100g: 210, protein100g: 28.5, carbs100g: 0.0, fat100g: 10.0, fiber100g: 0.0 },
  { id: 'ovo-galinha-cozido', name: 'Ovo de galinha, cozido', aliases: ['ovo cozido', 'ovo'], kcal100g: 146, protein100g: 13.3, carbs100g: 0.6, fat100g: 9.5, fiber100g: 0.0 },
  { id: 'ovo-galinha-frito', name: 'Ovo de galinha, frito', aliases: ['ovo frito'], kcal100g: 197, protein100g: 15.6, carbs100g: 0.6, fat100g: 14.6, fiber100g: 0.0 },
  { id: 'tilapia-grelhada', name: 'Tilápia grelhada', aliases: ['peixe', 'tilápia'], kcal100g: 128, protein100g: 26.2, carbs100g: 0.0, fat100g: 2.0, fiber100g: 0.0 },
  { id: 'salmao-grelhado', name: 'Salmão grelhado', aliases: ['salmão'], kcal100g: 231, protein100g: 25.7, carbs100g: 0.0, fat100g: 13.6, fiber100g: 0.0 },
  { id: 'sardinha-em-oleo', name: 'Sardinha em óleo', aliases: ['sardinha'], kcal100g: 210, protein100g: 24.6, carbs100g: 0.0, fat100g: 11.7, fiber100g: 0.0 },
  { id: 'camarao-cozido', name: 'Camarão cozido', aliases: ['camarão'], kcal100g: 90, protein100g: 18.3, carbs100g: 0.0, fat100g: 1.4, fiber100g: 0.0 },
  { id: 'linguica-porco-frita', name: 'Linguiça de porco, frita', aliases: ['linguiça'], kcal100g: 291, protein100g: 16.8, carbs100g: 1.9, fat100g: 24.0, fiber100g: 0.0 },
  { id: 'bacon-frito', name: 'Bacon frito', aliases: ['bacon', 'toucinho frito'], kcal100g: 541, protein100g: 37.0, carbs100g: 1.4, fat100g: 42.0, fiber100g: 0.0 },

  // Laticínios
  { id: 'leite-integral', name: 'Leite de vaca, integral', aliases: ['leite', 'leite integral'], kcal100g: 61, protein100g: 3.2, carbs100g: 4.5, fat100g: 3.3, fiber100g: 0.0 },
  { id: 'leite-desnatado', name: 'Leite de vaca, desnatado', aliases: ['leite desnatado'], kcal100g: 35, protein100g: 3.4, carbs100g: 4.9, fat100g: 0.2, fiber100g: 0.0 },
  { id: 'queijo-minas-frescal', name: 'Queijo minas frescal', aliases: ['queijo minas'], kcal100g: 264, protein100g: 17.4, carbs100g: 3.2, fat100g: 20.2, fiber100g: 0.0 },
  { id: 'queijo-mucarela', name: 'Queijo muçarela', aliases: ['mussarela', 'muçarela', 'queijo'], kcal100g: 330, protein100g: 22.6, carbs100g: 3.0, fat100g: 25.2, fiber100g: 0.0 },
  { id: 'iogurte-natural-integral', name: 'Iogurte natural integral', aliases: ['iogurte'], kcal100g: 51, protein100g: 4.1, carbs100g: 1.9, fat100g: 3.0, fiber100g: 0.0 },
  { id: 'requeijao-cremoso', name: 'Requeijão cremoso', aliases: ['requeijão'], kcal100g: 257, protein100g: 9.6, carbs100g: 2.6, fat100g: 23.4, fiber100g: 0.0 },
  { id: 'manteiga-com-sal', name: 'Manteiga com sal', aliases: ['manteiga'], kcal100g: 726, protein100g: 0.4, carbs100g: 0.0, fat100g: 82.0, fiber100g: 0.0 },

  // Panificados
  { id: 'pao-frances', name: 'Pão francês', aliases: ['pão', 'pãozinho', 'pão francês'], kcal100g: 300, protein100g: 8.0, carbs100g: 58.6, fat100g: 3.1, fiber100g: 2.3 },
  { id: 'pao-forma-integral', name: 'Pão de forma integral', aliases: ['pão integral'], kcal100g: 253, protein100g: 9.4, carbs100g: 49.9, fat100g: 3.4, fiber100g: 6.9 },
  { id: 'pao-forma-branco', name: 'Pão de forma branco', aliases: ['pão de forma'], kcal100g: 265, protein100g: 9.4, carbs100g: 50.6, fat100g: 3.1, fiber100g: 2.8 },
  { id: 'pao-de-queijo-assado', name: 'Pão de queijo assado', aliases: ['pão de queijo'], kcal100g: 348, protein100g: 6.9, carbs100g: 34.5, fat100g: 20.4, fiber100g: 0.5 },
  { id: 'biscoito-cream-cracker', name: 'Biscoito cream cracker', aliases: ['bolacha água e sal', 'cream cracker', 'biscoito'], kcal100g: 432, protein100g: 10.1, carbs100g: 71.9, fat100g: 12.5, fiber100g: 2.5 },
  { id: 'bolo-simples-fuba', name: 'Bolo simples de fubá', aliases: ['bolo'], kcal100g: 335, protein100g: 5.9, carbs100g: 55.4, fat100g: 10.5, fiber100g: 1.3 },

  // Legumes e verduras
  { id: 'alface', name: 'Alface', aliases: [], kcal100g: 15, protein100g: 1.6, carbs100g: 2.4, fat100g: 0.2, fiber100g: 1.7 },
  { id: 'tomate', name: 'Tomate', aliases: [], kcal100g: 15, protein100g: 1.1, carbs100g: 3.1, fat100g: 0.2, fiber100g: 1.2 },
  { id: 'cenoura-crua', name: 'Cenoura crua', aliases: ['cenoura'], kcal100g: 34, protein100g: 1.3, carbs100g: 7.7, fat100g: 0.2, fiber100g: 3.2 },
  { id: 'cenoura-cozida', name: 'Cenoura cozida', aliases: [], kcal100g: 32, protein100g: 0.7, carbs100g: 7.7, fat100g: 0.2, fiber100g: 3.2 },
  { id: 'brocolis-cozido', name: 'Brócolis cozido', aliases: ['brócolis'], kcal100g: 25, protein100g: 2.1, carbs100g: 4.0, fat100g: 0.5, fiber100g: 3.4 },
  { id: 'abobrinha-cozida', name: 'Abobrinha cozida', aliases: ['abobrinha'], kcal100g: 20, protein100g: 1.2, carbs100g: 4.3, fat100g: 0.1, fiber100g: 1.5 },
  { id: 'couve-refogada', name: 'Couve refogada', aliases: ['couve'], kcal100g: 92, protein100g: 2.9, carbs100g: 6.9, fat100g: 6.6, fiber100g: 3.7 },
  { id: 'repolho-cru', name: 'Repolho cru', aliases: ['repolho'], kcal100g: 17, protein100g: 1.2, carbs100g: 3.1, fat100g: 0.1, fiber100g: 2.0 },
  { id: 'cebola-crua', name: 'Cebola crua', aliases: ['cebola'], kcal100g: 39, protein100g: 1.7, carbs100g: 8.9, fat100g: 0.1, fiber100g: 2.2 },
  { id: 'pepino', name: 'Pepino', aliases: [], kcal100g: 10, protein100g: 0.9, carbs100g: 2.0, fat100g: 0.1, fiber100g: 0.5 },
  { id: 'beterraba-cozida', name: 'Beterraba cozida', aliases: ['beterraba'], kcal100g: 32, protein100g: 1.3, carbs100g: 7.3, fat100g: 0.1, fiber100g: 3.4 },
  { id: 'vagem-cozida', name: 'Vagem cozida', aliases: ['vagem'], kcal100g: 22, protein100g: 1.5, carbs100g: 4.4, fat100g: 0.1, fiber100g: 2.9 },
  { id: 'chuchu-cozido', name: 'Chuchu cozido', aliases: ['chuchu'], kcal100g: 17, protein100g: 0.6, carbs100g: 4.1, fat100g: 0.1, fiber100g: 1.1 },
  { id: 'pimentao-verde', name: 'Pimentão verde', aliases: ['pimentão'], kcal100g: 21, protein100g: 0.9, carbs100g: 4.9, fat100g: 0.1, fiber100g: 2.2 },

  // Frutas
  { id: 'banana-prata', name: 'Banana prata', aliases: ['banana'], kcal100g: 98, protein100g: 1.3, carbs100g: 26.0, fat100g: 0.1, fiber100g: 2.0 },
  { id: 'banana-nanica', name: 'Banana nanica', aliases: ['banana nanica'], kcal100g: 92, protein100g: 1.4, carbs100g: 23.8, fat100g: 0.1, fiber100g: 1.9 },
  { id: 'maca-com-casca', name: 'Maçã, com casca', aliases: ['maçã'], kcal100g: 56, protein100g: 0.3, carbs100g: 15.2, fat100g: 0.4, fiber100g: 2.0 },
  { id: 'laranja-pera', name: 'Laranja pera', aliases: ['laranja'], kcal100g: 37, protein100g: 1.0, carbs100g: 8.9, fat100g: 0.1, fiber100g: 0.8 },
  { id: 'mamao-papaia', name: 'Mamão papaia', aliases: ['mamão'], kcal100g: 40, protein100g: 0.5, carbs100g: 10.4, fat100g: 0.1, fiber100g: 1.0 },
  { id: 'manga', name: 'Manga', aliases: [], kcal100g: 64, protein100g: 0.4, carbs100g: 16.7, fat100g: 0.2, fiber100g: 1.6 },
  { id: 'abacaxi', name: 'Abacaxi', aliases: [], kcal100g: 48, protein100g: 0.9, carbs100g: 12.3, fat100g: 0.1, fiber100g: 1.0 },
  { id: 'melancia', name: 'Melancia', aliases: [], kcal100g: 33, protein100g: 0.9, carbs100g: 8.1, fat100g: 0.0, fiber100g: 0.1 },
  { id: 'uva', name: 'Uva', aliases: [], kcal100g: 53, protein100g: 0.7, carbs100g: 13.3, fat100g: 0.2, fiber100g: 0.9 },
  { id: 'abacate', name: 'Abacate', aliases: [], kcal100g: 96, protein100g: 1.2, carbs100g: 6.0, fat100g: 8.4, fiber100g: 6.3 },
  { id: 'morango', name: 'Morango', aliases: [], kcal100g: 30, protein100g: 0.9, carbs100g: 6.8, fat100g: 0.3, fiber100g: 1.7 },
  { id: 'acai-polpa', name: 'Açaí, polpa, sem açúcar', aliases: ['açaí', 'polpa de açaí'], kcal100g: 58, protein100g: 0.8, carbs100g: 6.2, fat100g: 3.9, fiber100g: 2.6 },

  // Leguminosas e oleaginosas
  { id: 'amendoim-torrado', name: 'Amendoim torrado', aliases: ['amendoim'], kcal100g: 606, protein100g: 27.2, carbs100g: 20.3, fat100g: 43.9, fiber100g: 8.0 },
  { id: 'castanha-do-para', name: 'Castanha do Pará', aliases: ['castanha do pará', 'castanha do brasil'], kcal100g: 643, protein100g: 14.5, carbs100g: 15.1, fat100g: 63.5, fiber100g: 7.9 },
  { id: 'castanha-de-caju-torrada', name: 'Castanha de caju torrada', aliases: ['castanha de caju'], kcal100g: 570, protein100g: 18.5, carbs100g: 29.1, fat100g: 46.3, fiber100g: 3.7 },
  { id: 'amendoa', name: 'Amêndoa', aliases: ['amêndoas'], kcal100g: 581, protein100g: 18.6, carbs100g: 21.7, fat100g: 49.9, fiber100g: 10.0 },
  { id: 'lentilha-cozida', name: 'Lentilha cozida', aliases: ['lentilha'], kcal100g: 93, protein100g: 6.3, carbs100g: 16.3, fat100g: 0.5, fiber100g: 7.9 },
  { id: 'grao-de-bico-cozido', name: 'Grão de bico cozido', aliases: ['grão de bico'], kcal100g: 164, protein100g: 8.4, carbs100g: 27.4, fat100g: 2.6, fiber100g: 7.4 },
  { id: 'ervilha-cozida', name: 'Ervilha cozida', aliases: ['ervilha'], kcal100g: 79, protein100g: 5.4, carbs100g: 14.4, fat100g: 0.4, fiber100g: 5.2 },
  { id: 'soja-cozida', name: 'Soja cozida (grão)', aliases: ['soja'], kcal100g: 173, protein100g: 16.6, carbs100g: 9.9, fat100g: 9.0, fiber100g: 6.0 },
  { id: 'tofu', name: 'Tofu', aliases: ['queijo de soja'], kcal100g: 76, protein100g: 8.1, carbs100g: 1.9, fat100g: 4.8, fiber100g: 1.2 },

  // Óleos, açúcares e doces
  { id: 'oleo-de-soja', name: 'Óleo de soja', aliases: ['óleo'], kcal100g: 884, protein100g: 0.0, carbs100g: 0.0, fat100g: 100.0, fiber100g: 0.0 },
  { id: 'azeite-de-oliva', name: 'Azeite de oliva', aliases: ['azeite'], kcal100g: 884, protein100g: 0.0, carbs100g: 0.0, fat100g: 100.0, fiber100g: 0.0 },
  { id: 'acucar-refinado', name: 'Açúcar refinado', aliases: ['açúcar'], kcal100g: 387, protein100g: 0.0, carbs100g: 99.5, fat100g: 0.0, fiber100g: 0.0 },
  { id: 'mel-de-abelha', name: 'Mel de abelha', aliases: ['mel'], kcal100g: 309, protein100g: 0.4, carbs100g: 84.0, fat100g: 0.0, fiber100g: 0.0 },
  { id: 'chocolate-ao-leite', name: 'Chocolate ao leite', aliases: ['chocolate'], kcal100g: 540, protein100g: 7.3, carbs100g: 56.8, fat100g: 31.8, fiber100g: 3.4 },
  { id: 'doce-de-leite', name: 'Doce de leite', aliases: [], kcal100g: 315, protein100g: 6.4, carbs100g: 56.6, fat100g: 6.7, fiber100g: 0.0 },
  { id: 'goiabada', name: 'Goiabada', aliases: [], kcal100g: 264, protein100g: 0.4, carbs100g: 68.7, fat100g: 0.0, fiber100g: 1.9 },

  // Bebidas
  { id: 'suco-de-laranja-natural', name: 'Suco de laranja natural', aliases: ['suco de laranja'], kcal100g: 37, protein100g: 0.7, carbs100g: 8.7, fat100g: 0.1, fiber100g: 0.2 },
  { id: 'cafe-sem-acucar', name: 'Café sem açúcar', aliases: ['café'], kcal100g: 2, protein100g: 0.1, carbs100g: 0.3, fat100g: 0.0, fiber100g: 0.0 },
  { id: 'refrigerante-tipo-cola', name: 'Refrigerante tipo cola', aliases: ['refrigerante', 'coca-cola', 'coca'], kcal100g: 42, protein100g: 0.0, carbs100g: 10.5, fat100g: 0.0, fiber100g: 0.0 },
];

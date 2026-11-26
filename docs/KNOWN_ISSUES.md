# Problemas conhecidos e limites

- **Um cenário por projeto.** Variantes (Reality Lab) são snapshots; não há vários mapas editáveis em paralelo.
- **“Unir ambientes”** cria uma passagem em arco entre salas; não funde polígonos.
- **Formas curvas** colidem pela caixa delimitadora.
- **Portas de sentido único** são consideradas passáveis pela análise de progressão.
- **Sketch to Space** só calibra e exibe a imagem; não reconhece paredes automaticamente.
- **Distribuições (scatter)** são instanciadas e **não colidem** até serem convertidas em objetos.
- **Ambiente de teste**: no navegador embutido do desenvolvimento o WebGL roda em software (~2 fps); desempenho real do 3D e da pré-visualização iluminada **não foi medido em GPU**.
- **Pointer lock** no playtest depende do navegador; há fallback por arrastar para olhar.
- **GLB** exporta a geometria visível do editor 3D (a vista 3D precisa estar aberta).
- Bundle principal ~1 MB (three.js incluído); só o exportador GLB é carregado sob demanda.
- Lanterna (`Atmosfera → Lanterna`) e névoa/hora são salvas e aplicadas na pré-visualização iluminada; o playtest usa as luzes padrão de greybox, não a atmosfera.

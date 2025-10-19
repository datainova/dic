DataInova — Diretrizes de Marca (cores e ícones)

Paleta principal
- Primária (DataInova):
  - HEX: #2d2926
  - RGB: 45, 41, 38
  - CMYK: 0, 8, 15, 82
- Secundária (Fundo/Texto):
  - HEX: #ffffff
  - RGB: 255, 255, 255
  - CMYK: 0, 0, 0, 0

Implementação no frontend (Tailwind)
- O namespace `brand` foi configurado em `frontend/tailwind.config.cjs` com a primária `#2d2926` em `brand.600`.
- Utilize:
  - Botões primários: `bg-brand-600 hover:bg-brand-700 text-white`
  - Acentos/links: `text-brand-700 hover:underline`
  - Foco: `focus:ring-brand-400`
- O modo escuro (`dark`) está habilitado e ajusta cores/contraste automaticamente.
 - Plano de fundo: gradiente sutil `bg-gradient-to-b from-brand-50 via-white to-white` já aplicado no wrapper principal.

Ícones e logotipo
- Diretório: `frontend/src/image`
  - `black_icon_transparent_background.png` (claro)
  - `white_icon_transparent_background.png` (escuro)
  - Outras variações de fundo inclusas.
- Uso no header (conforme `frontend/src/App.tsx`):
  - Claro: imagem preta; Escuro: imagem branca, via classes `dark:block` / `dark:hidden`.

Boas práticas
- Mantenha contraste adequado (WCAG AA): texto claro sobre `brand-600` e texto escuro sobre fundo claro.
- Evite misturar tonalidades fora da paleta a não ser que haja necessidade funcional (ex.: Google SSO mantém a cor da marca Google).
- Para novos componentes, prefira a escala `brand` definida para consistência.
- Tipografia
  - Títulos: "Exo 2" (Google Fonts) — já incluído em `frontend/index.html`.
  - Corpo: Inter.
  - Display opcional: "Jaapokki" (não incluída; requer arquivo/licença). Para ativar, adicione os arquivos `.woff2` e a regra `@font-face`, então defina `.font-display { font-family: 'Jaapokki', 'Exo 2', Inter, ... }`.

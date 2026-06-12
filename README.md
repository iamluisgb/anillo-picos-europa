# Anillo Central de Picos de Europa

Mapa interactivo **3D** de la travesía del Anillo Central de los Picos de Europa, con relieve real, perfil de elevación y las trazas GPS de cada etapa.

🔗 **Demo:** https://iamluisgb.github.io/anillo-picos-europa/

## Características
- Terreno **3D** con MapLibre GL JS (modelo de elevación de AWS Terrain Tiles).
- Texturas topográfica y satélite (Esri), relieve sombreado y vista 2D/3D.
- **5 etapas + 1 cumbre opcional** (Torre Cerredo), con distancia y desnivel reales.
- **Perfil de elevación** coloreado por pendiente, con tooltip y punto sincronizado en el mapa.
- Interacción etapa ↔ mapa ↔ perfil: al elegir etapa se resalta su traza y se centra la cámara.

## Datos
Trazas GPS reales (Wikiloc) en `tracks.js`. El enlace Collado Jermoso → Áliva no traía
altitud en el GPS, por lo que su elevación está interpolada (marcada en el perfil).

## Stack
HTML + CSS + JavaScript vanilla. Sin build. MapLibre GL JS vía CDN.

- `index.html` — maquetación
- `styles.css` — estilos
- `app.js` — mapa, interacción y perfil
- `tracks.js` — datos de las trazas

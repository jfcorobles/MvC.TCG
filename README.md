# Máscaras vs Cabelleras TCG 🤼‍♂️🃏

> Plataforma web interactiva y catálogo oficial para el juego de cartas coleccionables mexicano **Máscaras vs Cabelleras TCG**.

[![Deploy to GitHub Pages](https://github.com/jfcorobles/MvC.TCG/actions/workflows/deploy.yml/badge.svg)](https://github.com/jfcorobles/MvC.TCG/actions/workflows/deploy.yml)
[![Angular 19](https://img.shields.io/badge/Angular-19.0-DD0031?style=flat&logo=angular&logoColor=white)](https://angular.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

🔗 **Demo en vivo (GitHub Pages):** [https://jfcorobles.github.io/MvC.TCG/](https://jfcorobles.github.io/MvC.TCG/)

---

## 📖 Acerca del Proyecto

**Máscaras vs Cabelleras (MvC)** es un juego de cartas coleccionables (*Trading Card Game*) 100% mexicano inspirado en la pasión, mística y folclore de la **Lucha Libre Profesional**. 

Esta aplicación web fue diseñada como una experiencia interactiva para coleccionistas y jugadores, permitiendo explorar las 143 cartas catalogadas (Primera Edición y Primera Expansión), aprender las reglas de combate basadas en el recurso de **Contratos**, armar barajas reglamentarias de 50 cartas y descubrir el trabajo de los ilustradores mexicanos independientes participantes.

---

## 🌐 Enlaces Oficiales del Juego

* 📷 **Instagram Oficial:** [@mascarasvscabelleras_tcg](https://www.instagram.com/mascarasvscabelleras_tcg/)
* 👥 **Facebook Oficial:** [facebook.com/mascarasvscabellerastcg](https://www.facebook.com/mascarasvscabellerastcg)
* 🏷️ **Hashtag de la Comunidad:** [#mascarasvscabellerastcg](https://www.instagram.com/explore/tags/mascarasvscabellerastcg/)

---

## ✨ Características Principales

1. **Catálogo & Buscador de 143 Cartas:**
   * Búsqueda instantánea en tiempo real por nombre, ilustrador, estilo o efecto.
   * Filtros combinables: Edición (1ra Edición / 1ra Expansión), Tipo (Luchador, Castigo, Arena, Promotor, Contrato, Objeto), Bando (Técnico / Rudo), Estilo y Rareza.
   * Modos de vista conmutables: Cuadrícula y Tabla.
   * Paginación y ordenamiento por número, nombre, costo de contratos, fuerza y rareza.

2. **Visor de Carta / Ficha Técnica:**
   * Visualización ampliada en alta resolución con efecto de inclinación 3D (*Card Tilt*).
   * Información canónica limpia, costo en contratos (📜), poder de ataque (⚔) y enlaces directos.

3. **Manual Oficial de Reglas:**
   * Explicación de la dinámica de combate a 2 de 3 caídas.
   * Detalle del sistema de recursos: **Se usan Contratos para jugar las cartas** (no existen energías).
   * Guía paso a paso de las 4 fases del turno (Inicio y Robo, Preparación, Batalla, y Relevo).

4. **Armador de Barajas (Deck Builder):**
   * Control reglamentario de 50 cartas por baraja (máximo 3 copias por carta).
   * Indicador en tiempo real de balance Técnico/Rudo y conteo por tipos.
   * Histograma interactivo de la **Curva de Costo de Contratos**.
   * Persistencia automática en `localStorage`.
   * Exportación / Importación en formato JSON y copia de lista al portapapeles.

5. **Historia del Proyecto:**
   * Contexto del origen del juego de cartas, su creador James Darko y la comunidad de jugadores.

---

## 🏛️ Arquitectura y Principios de Desarrollo

El código está estructurado siguiendo principios de **Clean Architecture**, **SOLID** y las mejores prácticas de **Angular 19**:

* **Standalone Components:** Arquitectura modular sin `NgModule`.
* **Angular Signals:** Manejo de estado reactivo y granular para filtros, paginación y estado del mazo.
* **Separación de Responsabilidades:** Archivos `.ts`, `.html` y `.css` separados en todos los componentes para máxima legibilidad y mantenibilidad.
* **Routing PathLocation (URLs Limpias):** Configurado con URLs limpias estándar (sin `/#/`) y compatible con GitHub Pages mediante script de redirección SPA y `404.html`.

### Estructura del Código Fuente

```
src/
├── app/
│   ├── application/            # Servicios de aplicación y Signals (CardService, DeckService, ModalService)
│   ├── core/                   # Componentes transversales de layout (Header, Footer)
│   ├── domain/                 # Entidades de dominio, modelos y enums (Card, Deck, Bando, etc.)
│   ├── features/               # Vistas principales (Landing, CardBrowser, Rules, DeckBuilder, About)
│   └── shared/                 # Componentes compartidos y directivas (CardItem, CardDetailModal, CardTiltDirective)
├── assets/
│   ├── cards/                  # Ilustraciones oficiales en alta resolución (edicion-1, expansion-1)
│   └── data/                   # Catálogo normalizado de cartas y artistas (cards.json, artists.json)
└── styles.css                  # Sistema de diseño global y tokens
```

---

## 🚀 Instalación y Ejecución Local

### Prerrequisitos
* **Node.js**: v18.19+ o v20+
* **npm**: v9+

### Pasos

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/jfcorobles/MvC.TCG.git
   cd MvC.TCG
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Iniciar el servidor de desarrollo:
   ```bash
   npm start
   ```
   Abre [http://localhost:4200/](http://localhost:4200/) en tu navegador.

4. Compilar para producción:
   ```bash
   npm run build
   ```

5. Compilar especialmente para GitHub Pages:
   ```bash
   npm run build:gh-pages
   ```

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia MIT. Las ilustraciones de las cartas pertenecen a sus respectivos creadores y al proyecto **Máscaras vs Cabelleras TCG**.

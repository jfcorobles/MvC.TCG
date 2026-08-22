# Máscaras vs Cabelleras TCG 🤼‍♂️🃏

> Plataforma web interactiva, catálogo oficial, constructor de mazos en la nube y cuadrilátero comunitario para el juego de cartas coleccionables mexicano **Máscaras vs Cabelleras TCG**.

[![Deploy to GitHub Pages](https://github.com/jfcorobles/MvC.TCG/actions/workflows/deploy.yml/badge.svg)](https://github.com/jfcorobles/MvC.TCG/actions/workflows/deploy.yml)
[![Angular 19](https://img.shields.io/badge/Angular-19.1-DD0031?style=flat&logo=angular&logoColor=white)](https://angular.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Database%20%26%20Auth-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

🔗 **Demo en vivo (GitHub Pages):** [https://jfcorobles.github.io/MvC.TCG/](https://jfcorobles.github.io/MvC.TCG/)

---

## 📖 Acerca del Proyecto

**Máscaras vs Cabelleras (MvC)** es un juego de cartas coleccionables (*Trading Card Game*) 100% mexicano inspirado en la pasión, mística, folclore y rivalidades de la **Lucha Libre Profesional**. 

Esta plataforma web es el hub central para jugadores, coleccionistas y organizadores de torneos: permite explorar las 143 cartas catalogadas con sus efectos de combate, armar y sincronizar barajas en la nube, probar manos iniciales en el simulador, encontrar torneos presenciales en México, votar en encuestas de diseño de cartas y consultar aclaraciones oficiales de reglas (Rulings) de los creadores.

---

## 🌐 Enlaces Oficiales del Juego

* 📷 **Instagram Oficial:** [@mascarasvscabelleras_tcg](https://www.instagram.com/mascarasvscabelleras_tcg/)
* 👥 **Facebook Oficial:** [facebook.com/mascarasvscabellerastcg](https://www.facebook.com/mascarasvscabellerastcg)
* 📺 **YouTube Oficial:** [@mascarasvscabellerastcg](https://www.youtube.com/@mascarasvscabellerastcg)
* 🏷️ **Hashtag de la Comunidad:** [#mascarasvscabellerastcg](https://www.instagram.com/explore/tags/mascarasvscabellerastcg/)

---

## ✨ Características Principales

### 1. 🃏 Catálogo & Buscador de 143 Cartas
* **Búsqueda instantánea** en tiempo real por nombre, texto de efecto, ilustrador, bando o estilo.
* **Filtros combinables:** Edición (1ra Edición / 1ra Expansión), Tipo (Luchador, Castigo, Arena, Promotor, Contrato, Objeto), Bando (Técnico / Rudo), Estilo y Rareza.
* **Efectos de combate OCR formateados:** Resaltado tipográfico de palabras clave y habilidades.
* **Visor 3D:** Ficha técnica ampliada con efecto de inclinación tridimensional (*Card Tilt*), costo en contratos (📜) y poder de ataque (⚔).
* **Edición visual en vivo (Admin):** Los administradores pueden corregir nombres, atributos y efectos directamente desde la interfaz.

### 2. 🎴 Armador de Barajas en la Nube (Cloud Deck Builder)
* **Reglamento oficial:** Control estricto de 50 cartas por mazo y máximo 3 copias por carta.
* **Multi-Deck en la Nube:** Guarda, renombra y cambia entre múltiples barajas sincronizadas con tu cuenta en Supabase.
* **Deck Hub Comunitario:** Explora mazos públicos compartidos por otros luchadores, dales "Me gusta" o clónalos con 1 clic.
* **Simulador de Mano Inicial (Playtest):** Barajado aleatorio de 50 cartas, reparto de mano de 6 cartas, simulación de robos por turno (T1-T3), Mulligan y cálculo de probabilidades de Contratos y Luchadores de bajo coste.
* **Generador de Posters para Redes:** Exporta tu mazo en una imagen PNG de alta resolución (1080x1440) diseñada en HTML5 Canvas con el branding oficial de MvC.

### 3. 🏆 Circuito de Torneos & Eventos Locales (`/eventos`)
* Calendario interactivo de torneos presenciales, copas estatales y ligas en tiendas aliadas.
* Filtro geográfico por los **32 Estados de la República Mexicana** con detección automática del Estado del usuario.
* Bloques de fecha, detalles de sede, dirección, cuota de entrada y enlaces directos de inscripción.

### 4. 🗳️ El Ring de Votaciones & Rulings (`/comunidad`)
* **Encuestas Comunitarias:** Votaciones en tiempo real para decidir sobre nuevas cartas y mecánicas (1 voto seguro por cuenta de jugador).
* **Tablón de Erratas & Rulings Oficiales:** Diccionario searchable de dictámenes oficiales de reglas emitidos por James Darko, con miniatura artística y enlace al catálogo.

### 5. 👤 Gestión de Perfil & Seguridad (`/perfil`)
* Edición de alias/nombre de luchador y región estatal.
* Cambio de contraseña seguro con validación en vivo.
* Visualización del rol (`⚡ Administrador` o `🤼 Jugador Oficial`).

### 6. 🛡️ Panel de Control Administrativo (`/admin`)
* Consola con métricas de plataforma (KPIs), gestión de usuarios y roles, revisión de reportes de bugs/balance y centro de creación rápida de torneos, rulings y encuestas.

---

## 🏛️ Arquitectura & Seguridad

El sistema combina un frontend SPA moderno con una capa de persistencia serverless gobernada por **Row Level Security (RLS)**:

```
┌─────────────────────────────────────────────────────────────┐
│                 Angular 19 Standalone SPA                   │
│  (Signals Reactivas, Clean Architecture, Vanilla CSS Tokens)│
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / Supabase Client
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                Supabase (PostgreSQL Serverless)             │
│  ├── Auth: Gestión de sesiones JWT y contraseñas seguras    │
│  ├── RBAC: Roles 'admin' y 'jugador' con funciones plpgsql  │
│  ├── RLS: Políticas de seguridad a nivel de fila activas    │
│  └── Triggers: Asignación segura de roles en registro       │
└─────────────────────────────────────────────────────────────┘
```

### Estructura del Proyecto

```
src/
├── app/
│   ├── application/            # Servicios de aplicación (CardService, DeckService, CommunityService, ReportsService)
│   ├── core/                   # Layout global (Header con User Dropdown, Footer), Guards y SupabaseService
│   ├── domain/                 # Modelos y entidades de dominio (Card, Deck, GameEvent, Poll, CardRuling, etc.)
│   ├── features/               # Vistas principales (Landing, CardBrowser, DeckBuilder, Events, Community, Admin, Profile, Auth, Rules)
│   └── shared/                 # Componentes reutilizables (CardItem, CardDetailModal, CardEditModal, CardTiltDirective)
├── assets/                     # Catálogo JSON, artistas e ilustraciones oficiales de cartas
└── styles.css                  # Design tokens, paleta de colores y variables globales
```

---

## 🚀 Instalación y Ejecución Local

### Prerrequisitos
* **Node.js**: v18.19+ o v20+
* **npm**: v9+

### Pasos

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/jfcorobles/MvC.TCG.git
   cd MvC.TCG
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Iniciar el servidor local:**
   ```bash
   npm start
   ```
   Abre [http://localhost:4200/](http://localhost:4200/) en tu navegador.

4. **Compilar para producción:**
   ```bash
   npm run build
   ```

5. **Desplegar a GitHub Pages:**
   ```bash
   npm run deploy
   ```

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia MIT. Las ilustraciones de las cartas pertenecen a sus respectivos creadores y al proyecto **Máscaras vs Cabelleras TCG**.

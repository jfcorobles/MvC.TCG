-- =========================================================
-- MÁSCARAS VS CABELLERAS TCG — SUPABASE SCHEMA & SEED SCRIPT (MVP)
-- =========================================================

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabla de Perfiles de Usuario con Roles (RBAC)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(150),
    state_location VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'jugador',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Función para verificar si el usuario autenticado actual es Administrador
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para crear automáticamente el perfil al registrarse un usuario (Siempre asigna 'jugador')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, state_location, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'state_location', ''),
        'jugador' -- SEGURIDAD: Siempre asigna jugador ignorando cualquier parámetro del cliente
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        state_location = EXCLUDED.state_location;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger de seguridad: Impide que cualquier usuario no-admin modifique la columna 'role'
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.role IS DISTINCT FROM NEW.role AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: No tienes permisos de Administrador para alterar roles.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_protect_profile_role ON public.profiles;
CREATE TRIGGER tr_protect_profile_role
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- 3. Tabla de Catálogo de Cartas (con campo 'effect')
CREATE TABLE IF NOT EXISTS public.cards (
    id VARCHAR(100) PRIMARY KEY,
    number VARCHAR(10) NOT NULL,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(50) NOT NULL,
    cost INT,
    strength INT,
    bando VARCHAR(50),
    style VARCHAR(50),
    rarity VARCHAR(50) NOT NULL DEFAULT 'Novato',
    artist VARCHAR(150),
    set VARCHAR(100) NOT NULL,
    set_id VARCHAR(50) NOT NULL,
    image VARCHAR(255) NOT NULL,
    raw_description TEXT,
    effect TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_cards_number ON public.cards(number);
CREATE INDEX IF NOT EXISTS idx_cards_type ON public.cards(type);
CREATE INDEX IF NOT EXISTS idx_cards_rarity ON public.cards(rarity);
CREATE INDEX IF NOT EXISTS idx_cards_set ON public.cards(set_id);

-- 4. Tabla de Reportes de Jugadores
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'reglas',
    status VARCHAR(50) NOT NULL DEFAULT 'pendiente',
    severity VARCHAR(50) NOT NULL DEFAULT 'media',
    card_related VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);

-- 5. Tabla de Mazos de Jugadores (Cloud Decks & Hub Comunitario)
CREATE TABLE IF NOT EXISTS public.decks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    cards JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_public BOOLEAN NOT NULL DEFAULT false,
    likes_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_deck_cards_limit CHECK (jsonb_typeof(cards) = 'array' AND jsonb_array_length(cards) <= 60)
);

CREATE INDEX IF NOT EXISTS idx_decks_user_id ON public.decks(user_id);
CREATE INDEX IF NOT EXISTS idx_decks_is_public ON public.decks(is_public);
CREATE INDEX IF NOT EXISTS idx_decks_likes_count ON public.decks(likes_count DESC);

-- Trigger de seguridad: Protege 'likes_count' para que solo el trigger oficial o admin lo modifique
CREATE OR REPLACE FUNCTION public.protect_deck_likes_column()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.likes_count IS DISTINCT FROM NEW.likes_count AND NOT public.is_admin() THEN
        NEW.likes_count := OLD.likes_count;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_protect_deck_likes ON public.decks;
CREATE TRIGGER tr_protect_deck_likes
    BEFORE UPDATE ON public.decks
    FOR EACH ROW EXECUTE FUNCTION public.protect_deck_likes_column();

-- Trigger de seguridad Anti-Spam: Límite de 5 reportes por hora por usuario
CREATE OR REPLACE FUNCTION public.check_report_flood()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM public.reports 
        WHERE user_id = NEW.user_id 
          AND created_at > now() - INTERVAL '1 hour') >= 5 THEN
        RAISE EXCEPTION 'Has alcanzado el límite de 5 reportes por hora. Por favor espera antes de enviar más reportes.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_check_report_flood ON public.reports;
CREATE TRIGGER tr_check_report_flood
    BEFORE INSERT ON public.reports
    FOR EACH ROW EXECUTE FUNCTION public.check_report_flood();

-- Tabla de Likes para Mazos
CREATE TABLE IF NOT EXISTS public.deck_likes (
    deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (deck_id, user_id)
);

-- Trigger para actualizar conteo de likes en decks automáticamente
CREATE OR REPLACE FUNCTION public.handle_deck_like_counter()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.decks SET likes_count = likes_count + 1 WHERE id = NEW.deck_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.decks SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.deck_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_deck_likes_counter ON public.deck_likes;
CREATE TRIGGER tr_deck_likes_counter
    AFTER INSERT OR DELETE ON public.deck_likes
    FOR EACH ROW EXECUTE FUNCTION public.handle_deck_like_counter();

-- 6. Tabla de Torneos y Eventos Locales
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    state_location VARCHAR(100) NOT NULL,
    venue_name VARCHAR(150),
    address TEXT,
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    entry_fee VARCHAR(100) DEFAULT 'Gratuito',
    registration_url VARCHAR(500),
    is_official BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_events_state ON public.events(state_location);
CREATE INDEX IF NOT EXISTS idx_events_date ON public.events(event_date);

-- 7. Tabla de Erratas y Rulings Oficiales de Cartas
CREATE TABLE IF NOT EXISTS public.card_rulings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id VARCHAR(100) NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    ruling_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_rulings_card_id ON public.card_rulings(card_id);

-- 8. Tabla de Encuestas de la Comunidad (El Ring de Votaciones)
CREATE TABLE IF NOT EXISTS public.polls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question VARCHAR(300) NOT NULL,
    description TEXT,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Tabla de Votos de Encuestas (1 voto único por usuario)
CREATE TABLE IF NOT EXISTS public.poll_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    option_index INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unq_poll_user UNIQUE(poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON public.poll_votes(poll_id);

-- Vista pública segura de perfiles (solo expone nombre y estado, protege emails)
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, full_name, state_location, created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- =========================================================
-- 9. Habilitar RLS en TODAS las tablas
-- =========================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_rulings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: PROFILES
DROP POLICY IF EXISTS "Ver perfiles" ON public.profiles;
CREATE POLICY "Ver perfiles" ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Actualizar perfil propio" ON public.profiles;
CREATE POLICY "Actualizar perfil propio" ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id OR public.is_admin())
    WITH CHECK (auth.uid() = id OR public.is_admin());

-- Políticas RLS: CARDS
DROP POLICY IF EXISTS "Lectura pública de cartas" ON public.cards;
CREATE POLICY "Lectura pública de cartas" ON public.cards FOR SELECT
    TO public
    USING (true);

DROP POLICY IF EXISTS "Solo admin puede insertar cartas" ON public.cards;
CREATE POLICY "Solo admin puede insertar cartas" ON public.cards FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Solo admin puede editar cartas" ON public.cards;
CREATE POLICY "Solo admin puede editar cartas" ON public.cards FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Solo admin puede eliminar cartas" ON public.cards;
CREATE POLICY "Solo admin puede eliminar cartas" ON public.cards FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- Políticas RLS: REPORTS
DROP POLICY IF EXISTS "Ver reportes propios o admin" ON public.reports;
CREATE POLICY "Ver reportes propios o admin" ON public.reports FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Crear reportes" ON public.reports;
CREATE POLICY "Crear reportes" ON public.reports FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Editar reportes propios o admin" ON public.reports;
CREATE POLICY "Editar reportes propios o admin" ON public.reports FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Borrar reportes propios o admin" ON public.reports;
CREATE POLICY "Borrar reportes propios o admin" ON public.reports FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

-- Políticas RLS: DECKS
DROP POLICY IF EXISTS "Ver mazos públicos o propios o admin" ON public.decks;
CREATE POLICY "Ver mazos públicos o propios o admin" ON public.decks FOR SELECT
    TO public
    USING (is_public = true OR auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Crear mazos propios" ON public.decks;
CREATE POLICY "Crear mazos propios" ON public.decks FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Editar mazos propios o admin" ON public.decks;
CREATE POLICY "Editar mazos propios o admin" ON public.decks FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Eliminar mazos propios o admin" ON public.decks;
CREATE POLICY "Eliminar mazos propios o admin" ON public.decks FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

-- Políticas RLS: DECK_LIKES
DROP POLICY IF EXISTS "Ver likes de mazos" ON public.deck_likes;
CREATE POLICY "Ver likes de mazos" ON public.deck_likes FOR SELECT
    TO public
    USING (true);

DROP POLICY IF EXISTS "Dar like propio" ON public.deck_likes;
CREATE POLICY "Dar like propio" ON public.deck_likes FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Quitar like propio" ON public.deck_likes;
CREATE POLICY "Quitar like propio" ON public.deck_likes FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Políticas RLS: EVENTS
DROP POLICY IF EXISTS "Ver eventos públicos" ON public.events;
CREATE POLICY "Ver eventos públicos" ON public.events FOR SELECT
    TO public
    USING (true);

DROP POLICY IF EXISTS "Solo admin gestiona eventos" ON public.events;
CREATE POLICY "Solo admin gestiona eventos" ON public.events FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Políticas RLS: CARD_RULINGS
DROP POLICY IF EXISTS "Ver rulings públicos" ON public.card_rulings;
CREATE POLICY "Ver rulings públicos" ON public.card_rulings FOR SELECT
    TO public
    USING (true);

DROP POLICY IF EXISTS "Solo admin gestiona rulings" ON public.card_rulings;
CREATE POLICY "Solo admin gestiona rulings" ON public.card_rulings FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Políticas RLS: POLLS & VOTES
DROP POLICY IF EXISTS "Ver encuestas públicas" ON public.polls;
CREATE POLICY "Ver encuestas públicas" ON public.polls FOR SELECT
    TO public
    USING (true);

DROP POLICY IF EXISTS "Solo admin gestiona encuestas" ON public.polls;
CREATE POLICY "Solo admin gestiona encuestas" ON public.polls FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Ver votos de encuestas" ON public.poll_votes;
CREATE POLICY "Ver votos de encuestas" ON public.poll_votes FOR SELECT
    TO public
    USING (true);

DROP POLICY IF EXISTS "Votar una vez" ON public.poll_votes;
DROP POLICY IF EXISTS "Votar en encuesta activa" ON public.poll_votes;
CREATE POLICY "Votar en encuesta activa" ON public.poll_votes FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.polls 
            WHERE id = poll_votes.poll_id 
              AND is_active = true 
              AND (expires_at IS NULL OR expires_at > now())
        )
    );

-- =========================================================
-- POBLACIÓN INICIAL DE CARTAS (143 CARTAS)
-- =========================================================

INSERT INTO public.cards (id, number, name, type, cost, strength, bando, style, rarity, artist, set, set_id, image, raw_description, effect)
VALUES
('ed1-000-contrato', '000', 'Contrato', 'Contrato', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Contrato.jpg', 'Nombre: Contrato
Tipo de carta: Contrato
Ilustrador: James Darko
Carta: 000
Rareza: Novato', NULL),
('ed1-000-m-scara-de-midas', '000', 'Máscara de Midas', 'Contrato', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Máscara de Midas.png', 'Nombre: Máscara de Midas
Tipo de carta: Contrato
Ilustrador: James Darko
Carta: 000
Rareza: Novato', '-LEGADO-'),
('ed1-001-charro-rojo', '001', 'Charro Rojo', 'Luchador', 2, 2, 'Técnico', 'Aéreo', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Charro Rojo.png', 'Nombre: Charro Rojo
Tipo de carta: Luchador
Bando: Técnico
Estilo: Aéreo
Costo: 2
Fuerza: 2
Ilustrador: James Darko
Carta: 001', 'Cuando entra al Cuadrilátero, puedes buscar 1"CHARRONEGRO" en tu Empresa, muestra la carta y agrégala a tu Mano, luego baraja tu Empresa.'),
('ed1-002-sakura-claus', '002', 'Sakura Claus', 'Luchador', 2, 2, 'Técnico', 'Clásico', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Sakura Claus.png', 'Nombre: Sakura Claus
Tipo de carta: Luchador
Bando: Técnico
Estilo: Clásico
Costo: 2
Fuerza: 2
Ilustrador: James Darko
Carta: 002', 'Cuando entra al Cuadrilátero, ambos jugadores roban 2 cartas de su Empresa.'),
('ed1-003-charro-blanco', '003', 'Charro Blanco', 'Luchador', 2, 2, 'Técnico', 'Aéreo', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Charro Blanco.png', 'Nombre: Charro Blanco
Tipo de carta: Luchador
Bando: Técnico
Estilo: Aéreo
Costo: 2
Fuerza: 2
Ilustrador: James Darko
Carta: 003', 'Cuando entra al Cuadrilátero, puedes buscar 1 "CHARRO ROJO" en tu Empresa, muestra la carta y agrégala a tu Mano, luego baraja tu Empresa.'),
('ed1-004-charro-negro', '004', 'Charro Negro', 'Luchador', 2, 2, 'Técnico', 'Clásico', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Charro Negro.png', 'Nombre: Charro Negro
Tipo de carta: Luchador
Bando: Técnico
Estilo: Clásico
Costo: 2
Fuerza: 2
Ilustrador: James Darko
Carta: 004', 'Cuando entra al Cuadrilátero, puedes buscar 1 "CHARRO BLANCO" en tu Empresa, muestra la carta y agrégala a tu Mano, luego baraja tu Empresa. Mientras" CHARRONEGRO","CHARRO BLANCO" y" CHARRO ROJO" permanezcan en tu Cuadrilátero, ganan 3 de fuerza.'),
('ed1-005-montoneros', '005', 'Montoneros', 'Castigo', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Montoneros.png', 'Nombre: Montoneros
Tipo de carta: Castigo
Costo: 3
Ilustrador: James Darko
Carta: 005
Rareza: Novato', 'Selecciona 1 luchador de tu Cuadrilátero y suma la fuerza de todos los luchadores de tu Cuadrilátero al luchador seleccionado por esta carta. El turno en el que esta carta es jugada, solamente el luchador seleccionado puede atacar y al final del turno es enviadoal Vestidor.'),
('ed1-006-tuskana', '006', 'Tuskana', 'Luchador', 6, 2, 'Rudo', 'Extremo', 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Tuskana.png', 'Nombre: Tuskana
Tipo de carta: Luchador
Bando: Rudo
Estilo: Extremo
Costo: 6
Fuerza: 2
Ilustrador: James Darko
Carta: 006', 'Cuando entra al Cuadrilátero, noquea a todos los luchadores del Cuadrilátero de cada jugador.'),
('ed1-007-cuenta-de-tres', '007', 'Cuenta de Tres', 'Objeto', 9, NULL, NULL, NULL, 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Cuenta de Tres.png', 'Nombre: Cuenta de Tres
Tipo de carta: Objeto
Costo: 9
Ilustrador: James Darko
Carta: 007
Rareza: Promesa', '-ÍDOLO-
Si el luchador equipado con esta carta noquea a un luchador adversario, ponle 1 contador. Cuando el luchador equipado con esta carta tenga 3 contadores, ganas la caida.'),
('ed1-008-amarrado-de-cuerdas', '008', 'Amarrado de Cuerdas', 'Castigo', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Amarrado de Cuerdas.png', 'Nombre: Amarrado de Cuerdas
Tipo de carta: Castigo
Costo: 2
Ilustrador: James Darko
Carta: 008
Rareza: Novato', '-CONTRALLAVE-
Selecciona 1 luchador del Cuadriláterode cualquier jugador. El luchador seleccionado por esta carta no puede atacar ni defender hasta el final del turno.'),
('ed1-009-h-ctor', '009', 'Héctor', 'Castigo', 0, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Héctor.png', 'Nombre: Héctor
Tipo de carta: Castigo
Costo: 0
Ilustrador: James Darko
Carta: 009
Rareza: Novato', 'Solo puedes jugar esta carta durante la fase de batalla del jugador adversario. Descarta 1 luchador para no recibir daño de batalla durante este turno.'),
('ed1-010-tirantes', '010', 'Tirantes', 'Arena', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Tirantes.png', 'Nombre: Tirantes
Tipo de carta: Arena
Costo: 3
Ilustrador: James Darko
Carta: 010
Rareza: Novato', 'Los luchadores" RUDOS'' ganan 2 de fuerza.'),
('ed1-11-noche-del-guitarrazo', '11', 'Noche del Guitarrazo', 'Castigo', 2, NULL, NULL, NULL, 'Novato', 'Sam Purata', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Noche del Guitarrazo.png', 'Nombre: Noche del Guitarrazo
Tipo de carta: Castigo
Costo: 2
Ilustrador: Sam Purata
Carta: 11
Rareza: Novato', 'Solo puedes jugar esta carta si tienes 1 o mas luchadores" RUDOs" en tu Cuadrilátero. Noquea 1 luchador adversario'),
('ed1-012-sexy-venus', '012', 'Sexy Venus', 'Luchador', 4, 4, 'Técnico', 'Clásico', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Sexy Venus.png', 'Nombre: Sexy Venus
Tipo de carta: Luchador
Bando: Técnico
Estilo: Clásico
Costo: 4
Fuerza: 4
Ilustrador: James Darko
Carta: 012', 'Una vez por turno durante tu fase de preparación, puedes" despedir""N" numero de cartas de tu Vestidor para que 1 luchador adversario pierda fuerza igual al numero de cartas " despedidas" por la habilidad de este luchador hasta el final del turno.'),
('ed1-013-arquero-negro', '013', 'Arquero Negro', 'Luchador', 1, 2, 'Técnico', 'Clásico', 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Arquero Negro.png', 'Nombre: Arquero Negro
Tipo de carta: Luchador
Bando: Técnico
Estilo: Clásico
Costo: 1
Fuerza: 2
Ilustrador: James Darko
Carta: 013', '-OPORTUNISTA-
Cada vez que este luchador haga daño de batalla, el jugador adversario debe descartar 1 carta al azar y robar 1 carta de su Empresa.'),
('ed1-014-cintur-n-del-campe-n', '014', 'Cinturón del Campeón', 'Objeto', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Cinturón del Campeón.png', 'Nombre: Cinturón del Campeón
Tipo de carta: Objeto
Costo: 3
Ilustrador: James Darko
Carta: 014
Rareza: Novato', 'El luchador equipado con esta carta gana 2 de fuerza y adquiere la habilidadIMBATIBLE.'),
('ed1-015-los-pelones-del-mal', '015', 'Los Pelones del Mal', 'Luchador', 4, 4, 'Rudo', 'Clásico', 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Los Pelones del Mal.png', 'Nombre: Los Pelones del Mal
Tipo de carta: Luchador
Bando: Rudo
Estilo: Clásico
Costo: 4
Fuerza: 4
Ilustrador: James Darko
Carta: 015', 'Una vez por turno durante tu fase de batalla, puedes pagar 1 contrato para que este luchador haga un segundo ataque.'),
('ed1-016-segundo-aire', '016', 'Segundo Aire', 'Castigo', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Segundo Aire.png', 'Nombre: Segundo Aire
Tipo de carta: Castigo
Costo: 2
Ilustrador: James Darko
Carta: 016
Rareza: Novato', 'Selecciona 1 luchador de tu Vestidor de costo 3 o menor y juegalo sin pagar su costo, luego " despide" esta carta.'),
('ed1-017-rey-espectro', '017', 'Rey Espectro', 'Luchador', 28, 8, 'Rudo', 'Extremo', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Rey Espectro.png', 'Nombre: Rey Espectro
Tipo de carta: Luchador
Bando: Rudo
Estilo: Extremo
Costo: 28
Fuerza: 8
Ilustrador: James Darko
Carta: 017', 'Si este luchador entra al Cuadrilátero desde tu Mano, Vestidor, Empresa o por alguna habilidad sin pagar su costo; su fuerza se vuelve 2. Si este luchador se juega desde la Mano pagando su costo, adquiere la habilidad OPORTUNISTA.'),
('ed1-018-pumara', '018', 'Pumara', 'Luchador', 4, 5, 'Rudo', 'Extremo', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Pumara.png', 'Nombre: Pumara
Tipo de carta: Luchador
Bando: Rudo
Estilo: Extremo
Costo: 4
Fuerza: 5
Ilustrador: James Darko
Carta: 018', 'Durante tu fase de batalla, si el jugador adversario juega un castigo, puedes pagar el costo de esa carta y " rechazarla"'),
('ed1-019-arleking', '019', 'Arleking', 'Luchador', 4, 2, 'Rudo', 'Clásico', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Arleking.png', 'Nombre: Arleking
Tipo de carta: Luchador
Bando: Rudo
Estilo: Clásico
Costo: 4
Fuerza: 2
Ilustrador: James Darko
Carta: 019', 'Cuando entra al Cuadrilátero, busca en tu Empresa 1 castigo u objeto de costo 3 o menor y juegalo sin pagar su costo, luego baraja tu Empresa.'),
('ed1-020-arkena', '020', 'Arkena', 'Luchador', 3, 1, 'Técnico', 'Aéreo', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Arkena.png', 'Nombre: Arkena
Tipo de carta: Luchador
Bando: Técnico
Estilo: Aéreo
Costo: 3
Fuerza: 1
Ilustrador: James Darko
Carta: 020', 'Mientras este luchador permanezca en tu Cuadrilátero, todas tus cartas cuestan 1 contrato menos.'),
('ed1-021-tr-bol-black', '021', 'Trébol Black', 'Luchador', 2, 1, 'Rudo', 'Clásico', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Trébol Black.png', 'Nombre: Trébol Black
Tipo de carta: Luchador
Bando: Rudo
Estilo: Clásico
Costo: 2
Fuerza: 1
Ilustrador: James Darko
Carta: 021', '-OPORTUNISTA-
-HURANO-
Cuando este luchador haga daño de batalla, puedes devolver 1 carta de tu Vestidor a tu Empresa, luego baraja tu Empresa.'),
('ed1-022-tr-bol-family', '022', 'Trébol Family', 'Arena', 4, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Trébol Family.png', 'Nombre: Trébol Family
Tipo de carta: Arena
Costo: 4
Ilustrador: James Darko
Carta: 022
Rareza: Novato', '"Despide" esta carta si no tienes 1 o mas luchadores con" TREBOL" en su nombre en tu Cuadrilátero. Al final de tu turno, puedes buscar 1 contrato en tu Empresa y ponerlo en tu Zona de Contratos Pagados, luego barajatu Empresa.'),
('ed1-023-belial', '023', 'Belial', 'Luchador', 5, 3, 'Rudo', 'Clásico', 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Belial.png', 'Nombre: Belial
Tipo de carta: Luchador
Bando: Rudo
Estilo: Clásico
Costo: 5
Fuerza: 3
Ilustrador: James Darko
Carta: 023', '-IMBATIBLE-
Este luchador gana 1 de fuerza por cada luchador "RUDO" en el Cuadrilátero de cada jugador.'),
('ed1-024-mano-a-mano', '024', 'Mano a Mano', 'Arena', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Mano a Mano.png', 'Nombre: Mano a Mano
Tipo de carta: Arena
Costo: 3
Ilustrador: James Darko
Carta: 024
Rareza: Novato', 'Cada jugador puede atacar solamente con 1 luchador por turno.'),
('ed1-025-don-linkin-park', '025', 'Don Linkin Park', 'Luchador', 5, 6, 'Rudo', 'Extremo', 'Leyenda', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Don Linkin Park.png', 'Nombre: Don Linkin Park
Tipo de carta: Luchador
Bando: Rudo
Estilo: Extremo
Costo: 5
Fuerza: 6
Ilustrador: James Darko
Carta: 025', '-ÍDOLO-
Cuando entra al Cuadrilátero, noquea 1 luchador. Cuando es noqueado, envia 1 carta del Cuadrilátero de cualquier jugador al Vestidor. Si este luchador esta en tu Vestidor, puedes" despedirlo" para buscar 1 carta en tu Empresa de costo igual o menor al de este luchador, muestra la carta y agrégala a tu Mano, luego baraja tu Empresa.'),
('ed1-026-llamado-del-charro', '026', 'Llamado del Charro', 'Castigo', 5, NULL, NULL, NULL, 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Llamado del Charro.png', 'Nombre: Llamado del Charro
Tipo de carta: Castigo
Costo: 5
Ilustrador: James Darko
Carta: 026
Rareza: Promesa', '-ÍDOLO-
Solo puedes jugar esta carta si no tienes luchadores en tu Cuadrilátero. Busca 1 "CHARRO ROJO", 1"CHARRO NEGRO" y 1 "CHARRO BLANCO" en tu Empresa o Vestidor y juégalos sin pagar su costo pero con sus habilidades " rechazadas"; luego baraja tu Empresa si buscaste en ella.'),
('ed1-026-relevo', '026', 'Relevo', 'Castigo', 1, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Relevo.png', 'Nombre: Relevo
Tipo de carta: Castigo
Costo: 1
Ilustrador: James Darko
Carta: 026
Rareza: Novato', '-CONTRALLAVE-
Cambia el objetivo de 1 ataque o castigo a otro luchador de tu Cuadrilátero.'),
('ed1-028-sting-pink', '028', 'Sting Pink', 'Luchador', 3, 3, 'Técnico', 'Extremo', 'Novato', 'Esty Sempai', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Sting Pink.png', 'Nombre: Sting Pink
Tipo de carta: Luchador
Bando: Técnico
Estilo: Extremo
Costo: 3
Fuerza: 3
Ilustrador: Esty Sempai
Carta: 028', 'Cuando este luchador es noqueado, puedes buscar 1"STING PINK" en tu Mano o Empresa y jugarla sin pagar su costo.'),
('ed1-029-manto-del-h-roe', '029', 'Manto del Héroe', 'Arena', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Manto del Héroe.png', 'Nombre: Manto del Héroe
Tipo de carta: Arena
Costo: 3
Ilustrador: James Darko
Carta: 029
Rareza: Novato', 'Los luchadores "TECNICOS" ganan 2 de fuerza.'),
('ed1-030-el-profanador', '030', 'El Profanador', 'Luchador', 5, 4, 'Rudo', 'Fantasía', 'Novato', 'Kanio Necroz', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/El Profanador.png', 'Nombre: El Profanador
Tipo de carta: Luchador
Bando: Rudo
Estilo: Fantasía
Costo: 5
Fuerza: 4
Ilustrador: Kanio Necroz
Carta: 030', '-OPORTUNISTA-
-HURANO-'),
('ed1-031-la-cerrajera', '031', 'La Cerrajera', 'Objeto', 4, NULL, NULL, NULL, 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/La Cerrajera.png', 'Nombre: La Cerrajera
Tipo de carta: Objeto
Costo: 4
Ilustrador: James Darko
Carta: 031
Rareza: Promesa', 'El luchador equipado con esta carta gana 1 de fuerza y puede atacar a los luchadores adversarios "Agresores". Si esta carta esta en tu Vestidor, puedes " despedir" 1 contrato de tu Zona de Contratos para devolver esta carta a tu Mano.'),
('ed1-032-obek', '032', 'Obek', 'Luchador', 4, 4, 'Técnico', 'Aéreo', 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Obek.png', 'Nombre: Obek
Tipo de carta: Luchador
Bando: Técnico
Estilo: Aéreo
Costo: 4
Fuerza: 4
Ilustrador: James Darko
Carta: 032', '-ÍDOLO-
Puedes enviar 3 luchadores de tu Cuadrilátero al Vestidor para jugar este luchador sin pagar su costo. En tu fase de preparación, puedes enviar 2 luchadores de tu Cuadrilátero al Vestidor para noquear a todos los luchadores adversarios.'),
('ed1-033-lucille', '033', 'Lucille', 'Objeto', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Lucille.png', 'Nombre: Lucille
Tipo de carta: Objeto
Costo: 3
Ilustrador: James Darko
Carta: 033
Rareza: Novato', 'El luchador equipado con esta carta gana 2 de fuerza y puede noquear a los luchadoresconlahabilidadIMBATIBLE'),
('ed1-034-rey-del-beautiful', '034', 'Rey del Beautiful', 'Arena', 6, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Rey del Beautiful.png', 'Nombre: Rey del Beautiful
Tipo de carta: Arena
Costo: 6
Ilustrador: James Darko
Carta: 034
Rareza: Novato', 'Una vez por turno durante tu fase de preparación, el jugador adversario envia cartas de su Empresa al Vestidor igual al numero de luchadores en tu Cuadrilátero'),
('ed1-035-jamonazo', '035', 'Jamonazo', 'Castigo', 3, NULL, NULL, NULL, 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Jamonazo.jpg', 'Nombre: Jamonazo
Tipo de carta: Castigo
Costo: 3
Ilustrador: James Darko
Carta: 035
Rareza: Promesa', 'Noquea 1 luchador adversario. Puedes pagar 1 contrato adicional y si lo haces, devuelve esta carta a tu Empresa, luego baraja tu Empresa.'),
('ed1-036-mala-copa', '036', 'Mala Copa', 'Luchador', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Mala Copa.png', 'Nombre: Mala Copa
Tipo de carta: Luchador
Costo: 2
Ilustrador: James Darko
Carta: 036
Rareza: Novato', '-ÍDOLO-
El luchador equipado con esta carta duplica su fuerza y puede atacar 2 veces en el mismo turno. Al final del turno en el que esta carta fue jugada, " despide" esta carta y al luchador equipado con ella.'),
('ed1-037-botas-de-luchador', '037', 'Botas de Luchador', 'Objeto', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Botas de Luchador.png', 'Nombre: Botas de Luchador
Tipo de carta: Objeto
Costo: 2
Ilustrador: James Darko
Carta: 037
Rareza: Novato', 'El luchador equipado con esta carta gana 2 de fuerza. Si el luchador equipado es "AEREO", también adquiere la habilidad HURANO.'),
('ed1-038-mini-mi', '038', 'Mini-Mi', 'Arena', 8, NULL, NULL, NULL, 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Mini-Mi.png', 'Nombre: Mini-Mi
Tipo de carta: Arena
Costo: 8
Ilustrador: James Darko
Carta: 038
Rareza: Promesa', '-ÍDOLO-
-INMORTAL-
Durante tu fase de batalla, los luchadores de tu Cuadrilátero pueden dividir su fuerza a la mitad turno (si se obtiene un numero decimal, se ignora la parte decimal).'),
('ed1-039-carmelo-reyes', '039', 'Carmelo Reyes', 'Luchador', 6, 4, 'Rudo', 'Clásico', 'Leyenda', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Carmelo Reyes.png', 'Nombre: Carmelo Reyes
Tipo de carta: Luchador
Bando: Rudo
Estilo: Clásico
Costo: 6
Fuerza: 4
Ilustrador: James Darko
Carta: 039', '-ÍDOLO-
-OPORTUNISTA-
Si no tienes luchadores en tu Cuadrilátero, puedes jugar esta carta sin pagar su costo. Una vez por turno durante tu fase de preparación, puedes buscar 1"NOCHE DEL GUITARRAZO" en tu Empresa o Vestidor, muestra la carta y agrégala a tu Mano, luego baraja tu Empresa.'),
('ed1-040-faul', '040', 'Faul', 'Castigo', 4, NULL, NULL, NULL, 'Novato', 'Surprise Party', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Faul.png', 'Nombre: Faul
Tipo de carta: Castigo
Costo: 4
Ilustrador: Surprise Party
Carta: 040
Rareza: Novato', '"Despide" 1 carta del Cuadrilátero de cualquier jugador.'),
('ed1-041-abucheo', '041', 'Abucheo', 'Castigo', 1, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Abucheo.png', 'Nombre: Abucheo
Tipo de carta: Castigo
Costo: 1
Ilustrador: James Darko
Carta: 041
Rareza: Novato', '-CONTRALLAVE-
Selecciona 1 luchador del Cuadrilátero de cualquier jugador: TECNlCO: Pierde 2 de fuerza hasta el final del turno. RUDO: Gana 2 de fuerza hasta el final del turno.'),
('ed1-042-regreso-del-h-roe', '042', 'Regreso del Héroe', 'Objeto', 3, NULL, NULL, NULL, 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Regreso del Héroe.png', 'Nombre: Regreso del Héroe
Tipo de carta: Objeto
Costo: 3
Ilustrador: James Darko
Carta: 042
Rareza: Promesa', 'Selecciona 1 luchador "TECNICO" del Vestidor de cualquier jugador, juegalo sin pagar su costo y equipalo con esta carta. El luchador equipado con esta carta gana 3 de fuerza. Si el luchador equipado con esta carta es noqueado o enviado al Vestidor, " despide" esta carta y al luchador equipado.'),
('ed1-043-liquidaci-n', '043', 'Liquidación', 'Arena', 6, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Liquidación.png', 'Nombre: Liquidación
Tipo de carta: Arena
Costo: 6
Ilustrador: James Darko
Carta: 043
Rareza: Novato', 'Los contratos pagados por el jugador adversario no pueden regresar a su Zona de Contratos. Debes" despedir" la carta superior de tu Empresa al final del turno de cada jugador para que esta carta permanezca en tu Cuadrilátero.'),
('ed1-044-mucha-crema', '044', 'Mucha Crema', 'Castigo', 3, NULL, NULL, NULL, 'Leyenda', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Mucha Crema.png', 'Nombre: Mucha Crema
Tipo de carta: Castigo
Costo: 3
Ilustrador: James Darko
Carta: 044
Rareza: Leyenda', '-ÍDOLO-
-CONTRALLAVE-
Juega desde tu Mano, Empresa o Vestidor 1 luchador sin pagar su costo. Si esta carta esta en tu Vestidor, puedes " despedir" 1 contrato de tu Zona de Contratos para devolver esta carta a tu Mano.'),
('ed1-045-bancarrota', '045', 'Bancarrota', 'Castigo', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Bancarrota.png', 'Nombre: Bancarrota
Tipo de carta: Castigo
Costo: 2
Ilustrador: James Darko
Carta: 045
Rareza: Novato', '"Despide" 1 contrato de la Zona de Contratos o Zona de Contratos Pagados de cada jugador.'),
('ed1-046-tachuelas', '046', 'Tachuelas', 'Arena', 1, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Tachuelas.png', 'Nombre: Tachuelas
Tipo de carta: Arena
Costo: 1
Ilustrador: James Darko
Carta: 046
Rareza: Novato', '-CONTRALLAVE-
Cada vez que un luchador "Agresor" declare un ataque, lanza 1 moneda: AGUILA: El luchador" Agresor" adquiere la habilidad HURANO hasta el final del turno. SELLO: El luchador" Agresor" es noqueado.'),
('ed1-047-demolici-n', '047', 'Demolición', 'Castigo', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Demolición.png', 'Nombre: Demolición
Tipo de carta: Castigo
Costo: 3
Ilustrador: James Darko
Carta: 047
Rareza: Novato', '"Despide" todas las arenas del Cuadrilátero de cada jugador'),
('ed1-048-renegociaci-n', '048', 'Renegociación', 'Castigo', 1, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Renegociación.png', 'Nombre: Renegociación
Tipo de carta: Castigo
Costo: 1
Ilustrador: James Darko
Carta: 048
Rareza: Novato', '-ÍDOLO-
-INMORTAL-
Busca 2 contratos en tu Empresa y ponlos en tu Zona de Contratos Pagados, luego " despide" esta carta y baraja tu Empresa. Si juegas esta carta desde tu Vestidor, busca 1 contrato en tu Empresa y ponlo en tu Zona de Contratos Pagados, luego " despide" esta carta y baraja tu Empresa.'),
('ed1-049-clon-stico', '049', 'Clonístico', 'Castigo', 6, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Clonístico.png', 'Nombre: Clonístico
Tipo de carta: Castigo
Costo: 6
Ilustrador: James Darko
Carta: 049
Rareza: Novato', '-ÍDOLO-
-CONTRALLAVE-
Selecciona 1 luchador de tu Cuadrilátero y juega desde tu Mano o Empresa todos los luchadores con el mismo nombre que el luchador seleccionado sin pagar su costo, pero con sus habilidades " rechazadas".'),
('ed1-050-derechos-de-autor', '050', 'Derechos de Autor', 'Luchador', 8, 6, 'Técnico', 'Aéreo', 'Leyenda', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Derechos de Autor.png', 'Nombre: Derechos de Autor
Tipo de carta: Luchador
Bando: Técnico
Estilo: Aéreo
Costo: 8
Fuerza: 6
Ilustrador: James Darko
Carta: 050', '-ÍDOLO-
-INMORTAL-
Cuando entra al Cuadrilátero, los luchadores "TEcNICOs" de tu Cuadrilátero ganan 4 de fuerza y la habilidad IMBATIBLE hasta el final del turno. Puedes enviar 1 contrato de tu Zona de Contratos a tu Vestidor para evitar que esta carta sea noqueada. Puedes descartar esta carta para no recibir daño de batalla durante este turno.'),
('ed1-051-halc-n-suriano-jr', '051', 'Halcón Suriano Jr.', 'Luchador', 6, 3, 'Técnico', 'Aéreo', 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Halcón Suriano Jr.png', 'Nombre: Halcón Suriano Jr.
Tipo de carta: Luchador
Bando: Técnico
Estilo: Aéreo
Costo: 6
Fuerza: 3
Ilustrador: James Darko
Carta: 051', '-ÍDOLO-
-IMBATIBLE-
Cada vez que un luchador "TEcNICO" entre a tu Cuadrilátero, el jugador adversario enviara la carta superior de su Empresa a su Vestidor.'),
('ed1-052-abundancia', '052', 'Abundancia', 'Promotor', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Abundancia.png', 'Nombre: Abundancia
Tipo de carta: Promotor
Ilustrador: James Darko
Carta: 052
Rareza: Novato', 'Durante tu fase inicial, puedes poner hasta 2 contratos en tu Zona de Contratos.'),
('ed1-053-ofrecimiento-de-ayuda', '053', 'Ofrecimiento de Ayuda', 'Promotor', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Ofrecimiento de Ayuda.png', 'Nombre: Ofrecimiento de Ayuda
Tipo de carta: Promotor
Ilustrador: James Darko
Carta: 053
Rareza: Novato', 'Cada turno durante tu fase de preparación, la primer carta que juegues cuesta 1 contrato menos.'),
('ed1-054-promotor-iracundo', '054', 'Promotor Iracundo', 'Promotor', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Promotor Iracundo.png', 'Nombre: Promotor Iracundo
Tipo de carta: Promotor
Ilustrador: James Darko
Carta: 054
Rareza: Novato', 'Durante tu fase de preparación, si tienes 5 o mas contratos en tu Zona de Contratos, puedes ''despedir" 1 contrato de tu Zona de Contratos para noquear a todos los luchadores adversarios.'),
('ed1-055-fuerza-bruta', '055', 'Fuerza Bruta', 'Promotor', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Fuerza Bruta.png', 'Nombre: Fuerza Bruta
Tipo de carta: Promotor
Ilustrador: James Darko
Carta: 055
Rareza: Novato', 'Los luchadores de tu Cuadrilátero ganan 1 de fuerza. Una vez por turno durante tu fase de preparación, puedes descartar 1 carta para que un luchador de tu Cuadrilátero gane 2 de fuerza hasta el final del turno.'),
('ed1-050-golden-boy', '050', 'Golden Boy', 'Luchador', 1, 5, 'Técnico', 'Aéreo', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Golden Boy.png', 'Nombre: Golden Boy
Tipo de carta: Luchador
Bando: Técnico
Estilo: Aéreo
Costo: 1
Fuerza: 5
Ilustrador: James Darko
Carta: 050', 'Solo puede entrar al Cuadrilátero si tienes 2 o mas luchadores en tu Cuadrilátero.'),
('ed1-057-luchadores-de-juguete', '057', 'Luchadores de Juguete', 'Castigo', 1, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Luchadores de Juguete.png', 'Nombre: Luchadores de Juguete
Tipo de carta: Castigo
Costo: 1
Ilustrador: James Darko
Carta: 057
Rareza: Novato', '-CONTRALLAVE-
Selecciona 1 luchador adversario y reduce su fuerza a 0 hasta el final del turno en el que se jugo esta carta.'),
('ed1-058-power-sombrero', '058', 'Power Sombrero', 'Arena', 4, NULL, NULL, NULL, 'Novato', 'Snap', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Power Sombrero.png', 'Nombre: Power Sombrero
Tipo de carta: Arena
Costo: 4
Ilustrador: Snap
Carta: 058
Rareza: Novato', 'Los luchadores con" CHARRO" en su nombre ganan 2 de fuerza.'),
('ed1-059-shin-garra', '059', 'Shin Garra', 'Luchador', 5, 5, 'Técnico', 'Fantasía', 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Shin Garra.png', 'Nombre: Shin Garra
Tipo de carta: Luchador
Bando: Técnico
Estilo: Fantasía
Costo: 5
Fuerza: 5
Ilustrador: James Darko
Carta: 059', '-ÍDOLO-
Una vez por turno durante tu fase de preparación, puedes buscar 1 castigo en tu Empresa de costo 5 o menor y jugarlo sin pagar su costo, luego baraja tu Empresa. Este luchador no puede atacar el turno en el que uso esta habilidad.'),
('ed1-060-c-smico', '060', 'Cósmico', 'Luchador', 2, 2, 'Técnico', 'Fantasía', 'Novato', 'Neomgon', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Cósmico.png', 'Nombre: Cósmico
Tipo de carta: Luchador
Bando: Técnico
Estilo: Fantasía
Costo: 2
Fuerza: 2
Ilustrador: Neomgon
Carta: 060', 'Una vez por turno durante tu fase de preparación, puedes nombrar 1 tipo de carta, el jugador adversario toma la carta superior de su Empresa y la muestra, si aciertas con el tipo de carta que nombraste es " despedida"; pero si fallas, el jugador adversario agrega esa carta a su Mano.'),
('ed1-061-mosko-extreme', '061', 'Mosko Extreme', 'Luchador', 1, 2, 'Rudo', 'Extremo', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Mosko Extreme.png', 'Nombre: Mosko Extreme
Tipo de carta: Luchador
Bando: Rudo
Estilo: Extremo
Costo: 1
Fuerza: 2
Ilustrador: James Darko
Carta: 061', '-OPORTUNISTA-
Cuando entra al Cuadrilátero, todos los luchadores adversarios pierden 2 de fuerza hasta el final del turno. Si esta carta esta en tu Mano, puedes descartarla para que 1 luchador de tu Cuadrilátero gane 3 de fuerza hasta el final del turno.'),
('ed1-062-botellazo', '062', 'Botellazo', 'Castigo', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Botellazo.png', 'Nombre: Botellazo
Tipo de carta: Castigo
Costo: 2
Ilustrador: James Darko
Carta: 062
Rareza: Novato', '-CONTRALLAVE-
Noguea al luchador adversario con menor fuerza en el Cuadrilátero (si hay mas de 1 luchador con la misma fuerza, tu seleccionas el objetivo),'),
('ed1-063-beso-de-la-muerte', '063', 'Beso de la Muerte', 'Objeto', 5, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Beso de la Muerte.png', 'Nombre: Beso de la Muerte
Tipo de carta: Objeto
Costo: 5
Ilustrador: James Darko
Carta: 063
Rareza: Novato', '-CONTRALLAVE-
Selecciona 1 luchador adversario, este pierde 2 de fuerza hasta el final del turno. Si tienes 1 o mas luchadores "EXOTICOs" en tu Cuadrilátero juega esta carta sin pagar su costo y duplica la fuerza de los luchadores" EXOTICOs" de tu Cuadrilátero hasta el final del turno. Solo puedes jugar "BESO DE LA MUERTE" una vez por turno.'),
('ed1-064-dulce-paola', '064', 'Dulce Paola', 'Luchador', 1, 1, 'Técnico', 'Fantasía', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Dulce Paola.png', 'Nombre: Dulce Paola
Tipo de carta: Luchador
Bando: Técnico
Estilo: Fantasía
Costo: 1
Fuerza: 1
Ilustrador: James Darko
Carta: 064', '-OPORTUNISTA-
Cuando entra al Cuadrilátero, toma el control de 1 luchador adversario hasta el final del turno.'),
('ed1-065-monedas-de-la-gratitud', '065', 'Monedas de la Gratitud', 'Arena', 7, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Monedas de la Gratitud.png', 'Nombre: Monedas de la Gratitud
Tipo de carta: Arena
Costo: 7
Ilustrador: James Darko
Carta: 065
Rareza: Novato', '-ÍDOLO-
-OPORTUNISTA-
Cada vez que noquees a un luchador adversario, puedes usar 1 de las siguientes habilidades: 1. Buscar 1 contrato en tu Empresa, mostrar la carta y agregarla a tu Mano, luego baraja tu Empresa. 2. Seleccionar 1 carta de tu Vestidor y devolverla a tu Empresa, luego baraja tu Empresa.'),
('ed1-066-halloween', '066', 'Halloween', 'Luchador', 6, 6, 'Rudo', 'Extremo', 'Leyenda', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Halloween.png', 'Nombre: Halloween
Tipo de carta: Luchador
Bando: Rudo
Estilo: Extremo
Costo: 6
Fuerza: 6
Ilustrador: James Darko
Carta: 066', '-ÍDOLO-
-OPORTUNISTA-
Puedes descartar este luchador para buscar 1 carta de objeto en tu Empresa, muestra la carta y agréegala a tu Mano. Cuando entra al Cuadrilátero, juega 1 carta de objeto desde tu Mano o Empresa sin pagar su costo. Mientras este luchador permanezca en tu Cuadrilátero todos los luchadores "EXTREMOs" ganan 1 de fuerza.'),
('ed1-067-d-a-de-muertos', '067', 'Día de Muertos', 'Promotor', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Día de Muertos.png', 'Nombre: Día de Muertos
Tipo de carta: Promotor
Ilustrador: James Darko
Carta: 067
Rareza: Novato', 'Durante tu fase de preparación, si no tienes luchadores en tu Cuadrilátero, puedes jugar 1 luchador desde tu Vestidor sin pagar su costo, de costo igual o menor al numero de cartas en tu Mano.'),
('ed1-068-boleto-de-entrada', '068', 'Boleto de Entrada', 'Castigo', 4, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Boleto de Entrada.png', 'Nombre: Boleto de Entrada
Tipo de carta: Castigo
Costo: 4
Ilustrador: James Darko
Carta: 068
Rareza: Novato', '-CONTRALLAVE-
Puedes jugar 1 o mas luchadores desde tu Empresa o Vestidor cuya suma de costos sea igual o menor a esta carta.'),
('ed1-069-luna-celestial', '069', 'Luna Celestial', 'Luchador', 3, 1, 'Técnico', 'Fantasía', 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Luna Celestial.png', 'Nombre: Luna Celestial
Tipo de carta: Luchador
Bando: Técnico
Estilo: Fantasía
Costo: 3
Fuerza: 1
Ilustrador: James Darko
Carta: 069', '-INMORTAL-
Cuando entra al Cuadrilátero, puedes seleccionar 1 luchador de tu Vestidor de costo igual o menor a esta carta y jugarlo sin pagar su costo.'),
('ed1-070-nuevo-personaje', '070', 'Nuevo Personaje', 'Castigo', 1, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Nuevo Personaje.png', 'Nombre: Nuevo Personaje
Tipo de carta: Castigo
Costo: 1
Ilustrador: James Darko
Carta: 070
Rareza: Novato', '-CONTRALLAVE-
Selecciona 1 luchador de tu Cuadrilátero y devuélvelo a tu Empresa, busca en tu Empresa 1 luchador de fuerza igual o menor al luchador seleccionado por esta carta y juégalo sin pagar su costo, luego baraja tu Empresa.'),
('ed1-071-doble-impacto', '071', 'Doble Impacto', 'Luchador', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Doble Impacto.png', 'Nombre: Doble Impacto
Tipo de carta: Luchador
Costo: 2
Ilustrador: James Darko
Carta: 071
Rareza: Novato', '-CONTRALLAVE-
Selecciona 1 luchador de tu Cuadrilátero y 1 luchador adversario. Envia a ambos luchadores al Vestidor.'),
('ed1-072-darius', '072', 'Darius', 'Luchador', 5, 2, 'Rudo', 'Fantasía', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Darius.png', 'Nombre: Darius
Tipo de carta: Luchador
Bando: Rudo
Estilo: Fantasía
Costo: 5
Fuerza: 2
Ilustrador: James Darko
Carta: 072', '-IMBATIBLE-
Este luchador gana 1 de fuerza cada vez que noquee un luchador adversario.'),
('ed1-073-cartel-estelar', '073', 'Cartel Estelar', 'Contrato', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Cartel Estelar.png', 'Nombre: Cartel Estelar
Tipo de carta: Contrato
Ilustrador: James Darko
Carta: 073
Rareza: Novato', '-INMORTAL-'),
('ed1-074-tr-bol-de-4-hojas', '074', 'Trébol de 4 hojas', 'Castigo', 0, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Trébol de 4 hojas.png', 'Nombre: Trébol de 4 hojas
Tipo de carta: Castigo
Costo: 0
Ilustrador: James Darko
Carta: 074
Rareza: Novato', '-ÍDOLO-
Busca en tu Empresa 1 carta que tenga "TREBOL" en su nombre, muestra la carta y agréegala a tu Mano, luego baraja tu Empresa.'),
('ed1-075-ngel-zelta', '075', 'Ángel Zelta', 'Luchador', 1, 3, 'Rudo', 'Clásico', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Ángel Zelta.png', 'Nombre: Ángel Zelta
Tipo de carta: Luchador
Bando: Rudo
Estilo: Clásico
Costo: 1
Fuerza: 3
Ilustrador: James Darko
Carta: 075', '-INMORTAL-
Puedes descartar este luchador para seleccionar 1 carta de tu Vestidor y agregarla a tu Mano.'),
('ed1-076-a-ras-de-lona', '076', 'A Ras de Lona', 'Objeto', 2, NULL, NULL, NULL, 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/A Ras de Lona.png', 'Nombre: A Ras de Lona
Tipo de carta: Objeto
Costo: 2
Ilustrador: James Darko
Carta: 076
Rareza: Promesa', 'Solo puedes equipar esta carta a luchadores "CLASiCOs". Si el luchador equipado con esta carta esta como "Agresor", puedes cambiarlo a "Defensor" al final de tu turno. Si el luchador equipado con esta carta fuera a ser noqueado, puedes enviar esta carta al Vestidor en su lugar.'),
('ed1-077-bebida-energizante', '077', 'Bebida Energizante', 'Luchador', 4, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Bebida Energizante.png', 'Nombre: Bebida Energizante
Tipo de carta: Luchador
Costo: 4
Ilustrador: James Darko
Carta: 077
Rareza: Novato', 'El luchador equipado con esta carta duplica su fuerza durante tu turno, pero divide su fuerza a la mitad durante el turno del jugador adversario (si se obtiene un numero decimal, se ignora la parte decimal).'),
('ed1-078-masoquismo', '078', 'Masoquismo', 'Arena', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Masoquismo.png', 'Nombre: Masoquismo
Tipo de carta: Arena
Costo: 3
Ilustrador: James Darko
Carta: 078
Rareza: Novato', 'Los luchadores" EXTREMOS" de tu Cuadrilátero no son afectados por las cartas de castigo y objeto del jugador adversario.'),
('ed1-079-fractura', '079', 'Fractura', 'Luchador', 1, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Fractura.png', 'Nombre: Fractura
Tipo de carta: Luchador
Costo: 1
Ilustrador: James Darko
Carta: 079
Rareza: Novato', 'Solo puedes jugar esta carta durante la fase de batalla del jugador adversario. Selecciona 1 luchador adversario para que pierda 1 de fuerza por cada luchador en tu Cuadrilátero hasta el final del turno. Solo puedes jugar "FRACTURA" una vez por turno.'),
('ed1-080-los-villanos', '080', 'Los Villanos', 'Castigo', 3, NULL, NULL, NULL, 'Leyenda', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Los Villanos.png', 'Nombre: Los Villanos
Tipo de carta: Castigo
Costo: 3
Ilustrador: James Darko
Carta: 080
Rareza: Leyenda', '-ÍDOLO-
Solo puedes jugar esta carta si tienes 1 luchador "RUDO" en tu Cuadrilátero. Juega hasta 2 luchadores "RUDOs" desde tu Mano sin pagar su costo pero con sus habilidades " rechazadas". Los luchadores jugados por esta carta adquieren la habilidad OPORTUNiSTA, pero al final del turno son devueltos a la Mano.'),
('ed1-081-frijolito-charro', '081', 'Frijolito Charro', 'Luchador', 0, 2, 'Técnico', 'Mini', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Frijolito Charro.png', 'Nombre: Frijolito Charro
Tipo de carta: Luchador
Bando: Técnico
Estilo: Mini
Costo: 0
Fuerza: 2
Ilustrador: James Darko
Carta: 081', 'Mientras permanezca en tu Cuadrilátero como "Defensor", los luchadores adversarios solamente pueden atacar a este luchador. Puedes descartar esta carta para buscar 1 "LLAMADO DEL CHARRO'' en tu Empresa, muestra la carta y agrégla a tu Mano, luego baraja tu Empresa.'),
('ed1-082-infarto', '082', 'Infarto', 'Luchador', 3, 3, 'Rudo', 'Clásico', 'Promesa', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Infarto.png', 'Nombre: Infarto
Tipo de carta: Luchador
Bando: Rudo
Estilo: Clásico
Costo: 3
Fuerza: 3
Ilustrador: James Darko
Carta: 082', '-OPORTUNISTA-
Cuando es noqueado, noquea 1 luchador adversario.'),
('ed1-083-oferta-de-2x1', '083', 'Oferta de 2x1', 'Contrato', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Oferta de 2x1.png', 'Nombre: Oferta de 2x1
Tipo de carta: Contrato
Ilustrador: James Darko
Carta: 083
Rareza: Novato', '-ÍDOLO-
Solo puedes jugar esta carta si tienes 3 o mas contratos en tu Zona de Contratos. Una vez por turno durante tu fase inicial, puedes devolver 2 cartas de tu Mano a tu Empresa, buscar 1 carta en tu Empresa y agregarla a tu Mano, luego baraja tu Empresa.'),
('ed1-084-de-vuelta-a-casa', '084', 'De Vuelta a Casa', 'Castigo', 1, NULL, NULL, NULL, 'Novato', 'Luis Roberto', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/De Vuelta a Casa.png', 'Nombre: De Vuelta a Casa
Tipo de carta: Castigo
Costo: 1
Ilustrador: Luis Roberto
Carta: 084
Rareza: Novato', 'Selecciona 1 carta del Cuadrilátero adversario y devuélvela a su Mano.'),
('ed1-85-charro-de-jalisco-jr', '85', 'Charro de Jalisco Jr', 'Luchador', 6, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Charro de Jalisco Jr.png', 'Nombre: Charro de Jalisco Jr
Tipo de carta: Luchador
Costo: 6
Ilustrador: James Darko
Carta: 85
Rareza: Novato', 'Este luchador cuesta 1 contrato menos por cada luchadorcon" CHARRO" ensunombreentu Cuadrilátero. Cuando entra al Cuadrilátero, puedes jugar 1"POWER SOMBRERO" desde tu Mano sin pagar su costo.'),
('ed1-86-amuleto', '86', 'Amuleto', 'Objeto', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Amuleto.png', 'Nombre: Amuleto
Tipo de carta: Objeto
Costo: 2
Ilustrador: James Darko
Carta: 86
Rareza: Novato', 'El luchador equipado con esta carta gana 1 de fuerza y adquiere la habilidad IMBATIBLE. Cuando el luchador equipado con esta carta haga daño de batalla, busca 1 contrato en tu Empresa, muestra la carta y agregala a tu Mano, luego baraja tu Empresa.'),
('ed1-87-traicion', '87', 'Traicion', 'Objeto', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Traicion.png', 'Nombre: Traicion
Tipo de carta: Objeto
Costo: 3
Ilustrador: James Darko
Carta: 87
Rareza: Novato', 'Solo puedes equipar esta carta a luchadores adversarios. Toma el control del luchador equipado con esta carta. Si el luchador equipado con esta carta es noqueado, " despidelo"'),
('ed1-88-sin-trampas', '88', 'Sin Trampas', 'Arena', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Sin Trampas.png', 'Nombre: Sin Trampas
Tipo de carta: Arena
Costo: 2
Ilustrador: James Darko
Carta: 88
Rareza: Novato', '"Despide" a todos los luchadores equipados con carta de objeto. Mientras esta carta permanezca en tu Cuadrilátero, ningun jugador puede jugar cartas de objeto.'),
('ed1-089-brickmasters', '089', 'Brickmasters', 'Castigo', 0, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Brickmasters.png', 'Nombre: Brickmasters
Tipo de carta: Castigo
Costo: 0
Ilustrador: James Darko
Carta: 089
Rareza: Novato', '-ÍDOLO-
Ambos jugadores devuelven las cartas de su Mano a su Empresa, barajan su Empresa y roban 6 cartas, luego " despide" esta carta.'),
('ed1-090-cuetla', '090', 'Cuetla', 'Luchador', 4, 2, 'Rudo', 'Fantasía', 'Novato', 'Jack Coatl', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Cuetla.png', 'Nombre: Cuetla
Tipo de carta: Luchador
Bando: Rudo
Estilo: Fantasía
Costo: 4
Fuerza: 2
Ilustrador: Jack Coatl
Carta: 090', 'Este luchador gana 1 de fuerza por cada carta en tu Zona de Despido. Si este luchador esta en tu Mano, puedes " despedirlo" para " despedir" 1 luchador adversario; solo puedes usar esta habilidad una vez por turno.'),
('ed1-091-azteca-de-plata', '091', 'Azteca de Plata', 'Luchador', 3, 6, 'Rudo', 'Aéreo', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Azteca de Plata.png', 'Nombre: Azteca de Plata
Tipo de carta: Luchador
Bando: Rudo
Estilo: Aéreo
Costo: 3
Fuerza: 6
Ilustrador: James Darko
Carta: 091', '-INMORTAL-
Este luchador solo puede atacar si descartas 1 luchador'),
('ed1-092-amo-del-micr-fono', '092', 'Amo del Micrófono', 'Castigo', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Amo del Micrófono.png', 'Nombre: Amo del Micrófono
Tipo de carta: Castigo
Costo: 3
Ilustrador: James Darko
Carta: 092
Rareza: Novato', 'Todos los luchadores de tu Cuadrilátero ganan 3 de fuerza hasta el final del turno. Solo puedes usar" AMO DEL MICROFONO'' una vez por turno.'),
('ed1-093-triple-b', '093', 'Triple B', 'Arena', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Triple B.png', 'Nombre: Triple B
Tipo de carta: Arena
Costo: 2
Ilustrador: James Darko
Carta: 093
Rareza: Novato', 'Una vez por turno durante tu fase de preparación, puedes jugar 1 carta de tu Mano o Empresa de costo igual o menor a esta carta sin pagar su costo Si la juegas desde tu Empresa, debes barajar tu Empresa.'),
('ed1-094-kikyo-aoyama', '094', 'Kikyo Aoyama', 'Luchador', 6, 2, 'Técnico', 'Fantasía', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Kikyo Aoyama.png', 'Nombre: Kikyo Aoyama
Tipo de carta: Luchador
Bando: Ténico
Estilo: Fantasía
Costo: 6
Fuerza: 2
Ilustrador: James Darko
Carta: 094', '-OPORTUNISTA-
-HURANO-
Mientras este luchador permanezca en tu Cuadrilátero, ningun luchador de costo menor a este luchador puede atacar.'),
('ed1-095-mantenimiento', '095', 'Mantenimiento', 'Castigo', 4, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Mantenimiento.png', 'Nombre: Mantenimiento
Tipo de carta: Castigo
Costo: 4
Ilustrador: James Darko
Carta: 095
Rareza: Novato', 'Juega 1 arena desde tu Vestidor de costo igual o menor a esta carta.'),
('ed1-096-doctora-yusei', '096', 'Doctora Yusei', 'Promotor', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Doctora Yusei.png', 'Nombre: Doctora Yusei
Tipo de carta: Promotor
Ilustrador: James Darko
Carta: 096
Rareza: Novato', 'Durante tu fase inicial, puedes " despedir" 1 contrato de tu Zona de Contratos para seleccionar hasta 5 cartas de tu Vestidor y devolverlas a tu Empresa, luego baraja tu Empresa.'),
('ed1-097-princesa-sortilegio', '097', 'Princesa Sortilegio', 'Luchador', 1, 3, 'Técnico', 'Fantasía', 'Novato', 'Jack Coatl', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Princesa Sortilegio.png', 'Nombre: Princesa Sortilegio
Tipo de carta: Luchador
Bando: Técnico
Estilo: Fantasía
Costo: 1
Fuerza: 3
Ilustrador: Jack Coatl
Carta: 097', 'Una vez por turno durante tu fase de preparación, puedes buscar 1 luchador "FANTASiA" en tu Empresa, muestra la carta y agregala a tu Mano, luego baraja tu Empresa.'),
('ed1-098-ring-de-los-sue-os', '098', 'Ring de los Sueños', 'Arena', 4, NULL, NULL, NULL, 'Novato', 'Jack Coatl', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Ring de los Sueños.png', 'Nombre: Ring de los Sueños
Tipo de carta: Arena
Costo: 4
Ilustrador: Jack Coatl
Carta: 098
Rareza: Novato', 'Los luchadores" FANTASiA" adquieren la habilidad IMBATIBLE'),
('ed1-099-tr-bol-blanco', '099', 'Trébol Blanco', 'Luchador', 2, 1, 'Rudo', 'Clásico', 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Trébol Blanco.png', 'Nombre: Trébol Blanco
Tipo de carta: Luchador
Bando: Rudo
Estilo: Clásico
Costo: 2
Fuerza: 1
Ilustrador: James Darko
Carta: 099', '-OPORTUNISTA-
-HURANO-
Cuando este luchador haga daño de batalla, puedes buscar 1 contrato en tu Empresa, mostrar la carta y agregarla a tu Mano, luego baraja tu Empresa.'),
('ed1-100-yufer-duelista-dex', '100', 'Yufer-Duelista Dex', 'Promotor', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Yufer-Duelista Dex.png', 'Nombre: Yufer-Duelista Dex
Tipo de carta: Promotor
Ilustrador: James Darko
Carta: 100
Rareza: Novato', 'Cuando un luchador de tu Cuadrilátero noquee a un luchador adversario, puedes " despedir" 2 contratos de tu Zona de Contratos para que ese luchador pueda realizar un segundo ataque. Los luchadores que usen esta habilidad no pueden atacar directamente a la Empresa adversaria.'),
('ed1-101-lu-chi-oh', '101', 'Lu-Chi-Oh!', 'Promotor', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Lu-Chi-Oh!.png', 'Nombre: Lu-Chi-Oh!
Tipo de carta: Promotor
Ilustrador: James Darko
Carta: 101
Rareza: Novato', 'Una vez por turno durante tu fase de preparación, puedes enviar 1 luchador de tu Cuadrilátero al Vestidor para jugar 1 luchador de tu Mano reduciendo su costo en el mismo costo que el luchador enviado al Vestidor por esta habilidad. El luchador jugado por esta habilidad no hace daño de batalla durante este turno.'),
('ed1-102-meteorix', '102', 'Meteorix', 'Luchador', 7, 5, 'Técnico', 'Fantasía', 'Leyenda', 'James Darko', 'Primera Edición', 'ed1', 'assets/cards/edicion-1/Meteorix.png', 'Nombre: Meteorix
Tipo de carta: Luchador
Bando: Técnico
Estilo: Fantasia
Costo: 7
Fuerza: 5
Ilustrador: James Darko
Carta: 102', '-ÍDOLO-
-INMORTAL-
Puedes " despedir" 1 contrato de tu Zona de Contratos para jugar esta carta sin pagar su costo. Cuando entra al Cuadrilátero, noquea 1 luchador adversario de fuerza menor a esta carta. Una vez por turno durante tu fase de preparación, puedes" despedir""N" numero de cartas de tu Empresa para que esta carta gane fuerza igual al numero de cartas" despedidas" por esta habilidad hasta el final del turno.'),
('exp1-103-fuerza-especiales-charras', '103', 'Fuerza Especiales Charras', 'Arena', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Fuerza Especiales Charras.png', 'Nombre: Fuerza Especiales Charras
Tipo de carta: Arena
Costo: 3
Ilustrador: James Darko
Carta: 103
Rareza: Novato', 'Solo puedes jugar esta carta si tienes 3 o mas luchadorescon" CHARRO" ensunombre entu Cuadrilátero. Todos los luchadores con "CHARRO" en su nombre ganan 1 de fuerza y adquieren la habilidad IMBATIBLE.'),
('exp1-104-kain-t', '104', 'Kain T.', 'Promotor', NULL, NULL, NULL, NULL, 'Novato', 'Akuro', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Kain T.png', 'Nombre: Kain T.
Tipo de carta: Promotor
Ilustrador: Akuro
Carta: 104
Rareza: Novato', 'Una vez por turno durante tu fase de preparación, puedes pagar el costo de 1 luchador adversario que esté en su Vestidor y jugarlo en tu Cuadrilátero.'),
('exp1-105-luchador-sorpresa', '105', 'Luchador Sorpresa', 'Luchador', 5, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Luchador Sorpresa.png', 'Nombre: Luchador Sorpresa
Tipo de carta: Luchador
Costo: 5
Ilustrador: James Darko
Carta: 105
Rareza: Novato', 'Cuando entra al Cuadrilátero, selecciona 1 luchador de cualquier Cuadrilátero. Esta carta gana fuerza igual al luchador seleccionado por esta habilidad.'),
('exp1-106-primer-sueldo', '106', 'Primer Sueldo', 'Castigo', 0, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Primer Sueldo.png', 'Nombre: Primer Sueldo
Tipo de carta: Castigo
Costo: 0
Ilustrador: James Darko
Carta: 106
Rareza: Novato', 'Puedes jugar desde tu Mano o Empresa 1 luchador de costo 1 o menor sin pagar su costo; luego baraja tu Empresa si buscasteenella.'),
('exp1-107-tres-en-el-hoyo', '107', 'Tres en el Hoyo', 'Objeto', 5, NULL, NULL, NULL, 'Promesa', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Tres en el Hoyo.png', 'Nombre: Tres en el Hoyo
Tipo de carta: Objeto
Costo: 5
Ilustrador: James Darko
Carta: 107
Rareza: Promesa', '-ÍDOLO-
El luchador equipado con esta carta gana 2 de fuerza y adquiere la habilidad HURANO. Si "DON LINKIN PARK" esta en tu Cuadrilátero, puedes equiparlo con esta carta sin pagar su costo.'),
('exp1-108-octagon', '108', 'Octagon', 'Castigo', 2, NULL, NULL, NULL, 'Leyenda', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Octagon.png', 'Nombre: Octagon
Tipo de carta: Castigo
Costo: 2
Ilustrador: James Darko
Carta: 108
Rareza: Leyenda', '-ÍDOLO-
Solo puedes jugar esta carta durante el turno del jugador adversario. Cuando el jugador adversario juegue una carta de arena u objeto, toma el control de esa carta. Puedes jugar esta carta desde tu Vestidor pero si lo haces, " despidela".'),
('exp1-109-gira-luch-stica', '109', 'Gira Luchística', 'Arena', 5, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Gira Luchística.png', 'Nombre: Gira Luchística
Tipo de carta: Arena
Costo: 5
Ilustrador: James Darko
Carta: 109
Rareza: Novato', 'Cada vez que juegues un luchador, paga 1 contrato adicional. Todos los luchadores de tu Cuadrilátero ganan 3 de fuerza.'),
('exp1-110-primeros-auxilios', '110', 'Primeros Auxilios', 'Arena', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Primeros Auxilios.png', 'Nombre: Primeros Auxilios
Tipo de carta: Arena
Costo: 3
Ilustrador: James Darko
Carta: 110
Rareza: Novato', 'Una vez por turno durante tu fase inicial puedes seleccionar 1 luchador de tu Vestidor y agregarlo a tu Mano.'),
('exp1-111-huevos-de-aguila', '111', 'Huevos de Aguila', 'Objeto', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Huevos de Aguila.png', 'Nombre: Huevos de Aguila
Tipo de carta: Objeto
Costo: 2
Ilustrador: James Darko
Carta: 111
Rareza: Novato', '-ÍDOLO-
Solo puedes equipar esta carta a luchadores "TECNlCOs" con fuerza 3 o menor. El luchador equipado con esta carta gana 3 de fuerza y adquiere la habilidad IMBATIBLE.'),
('exp1-112-herradura-de-la-suerte', '112', 'Herradura de la Suerte', 'Castigo', 1, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Herradura de la Suerte.png', 'Nombre: Herradura de la Suerte
Tipo de carta: Castigo
Costo: 1
Ilustrador: James Darko
Carta: 112
Rareza: Novato', '-ÍDOLO-
Solo puedes jugar esta carta si durante el turno del jugador adversario tienes 2 o mas luchadores con "TREBOL" en su nombre en tu Cuadrilátero. El jugador adversario termina su turno, luego " despide'' esta carta.'),
('exp1-113-dios-pakal', '113', 'Dios Pakal', 'Luchador', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Dios Pakal.png', 'Nombre: Dios Pakal
Tipo de carta: Luchador
Costo: 3
Ilustrador: James Darko
Carta: 113
Rareza: Novato', '-OPORTUNISTA-
Cuando entra al Cuadrilátero, los luchadores adversarios pierden 2 de fuerza hasta el final del turno.'),
('exp1-114-chanclazo', '114', 'Chanclazo', 'Castigo', 0, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Chanclazo.png', 'Nombre: Chanclazo
Tipo de carta: Castigo
Costo: 0
Ilustrador: James Darko
Carta: 114
Rareza: Novato', '-CONTRALLAVE-
Envia la carta superior de tu Empresa al Vestidor y noquea 1 luchador adversario.'),
('exp1-115-ludark', '115', 'Ludark', 'Luchador', 5, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Ludark.png', 'Nombre: Ludark
Tipo de carta: Luchador
Costo: 5
Ilustrador: James Darko
Carta: 115
Rareza: Novato', 'Cuando entra al Cuadrilátero, puedes buscar 1 "CORONA DEL DOLOR" en tu Empresa, muestra la carta y agrégala a tu Mano, luego baraja tu Empresa. Cuando este luchador ataca o es atacado, todo el daño de batalla que fuera a recibir tu Empresa lo recibe la Empresa del jugador adversario en su lugar.'),
('exp1-116-corona-del-dolor', '116', 'Corona del Dolor', 'Objeto', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Corona del Dolor.png', 'Nombre: Corona del Dolor
Tipo de carta: Objeto
Costo: 2
Ilustrador: James Darko
Carta: 116
Rareza: Novato', 'El luchador equipado con esta carta pierde 2 de fuerza y adquiere la habilidad IMBATIBLE.'),
('exp1-117-hollow-king', '117', 'Hollow King', 'Luchador', 4, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Hollow King.png', 'Nombre: Hollow King
Tipo de carta: Luchador
Costo: 4
Ilustrador: James Darko
Carta: 117
Rareza: Novato', '-OPORTUNISTA-
Cuando entra al Cuadrilátero, puedes devolver a la Mano 1 luchador adversario de fuerza menor a este luchador. Los luchadores noqueados por este luchador son" despedidos".'),
('exp1-118-espada-de-bamb', '118', 'Espada de Bambú', 'Objeto', 4, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Espada de Bambú.png', 'Nombre: Espada de Bambú
Tipo de carta: Objeto
Costo: 4
Ilustrador: James Darko
Carta: 118
Rareza: Novato', 'El luchador equipado con esta carta puede hacer tantos ataques como luchadores adversarios haya en el Cuadrilátero adversario. El luchador equipado con esta carta no puede realizar ataques directos a la Empresa adversaria.'),
('exp1-119-santana-jackson', '119', 'Santana Jackson', 'Luchador', 1, 2, 'Rudo', 'Fantasía', 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Santana Jackson.png', 'Nombre: Santana Jackson
Tipo de carta: Luchador
Bando: Rudo
Estilo: Fantasía
Costo: 1
Fuerza: 2
Ilustrador: James Darko
Carta: 119', 'Cuando entra al Cuadrilátero, busca 1 luchador "TECNICO" en tu Empresa y agrégalo a tu Mano, luego baraja tu Empresa. Si este luchador es atacado, puedes pagar 1 contrato para cambiar el objetivo de ese ataque a otro luchador de tu Cuadrilátero.'),
('exp1-120-alcancistico', '120', 'Alcancistico', 'Contrato', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Alcancistico.png', 'Nombre: Alcancistico
Tipo de carta: Contrato
Ilustrador: James Darko
Carta: 120
Rareza: Novato', 'Al final de tu turno, si este contrato esta en tu Zona de Contratos, devuelve hasta 2 contratos de tu Zona de Contratos Pagados a tu Zona de Contratos.'),
('exp1-121-sarah-la-nueva-estrella', '121', 'Sarah, la nueva estrella', 'Luchador', 3, 2, 'Técnico', 'Fantasía', 'Novato', 'Marii-san', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Sarah, la nueva estrella.png', 'Nombre: Sarah, la nueva estrella
Tipo de carta: Luchador
Bando: Técnico
Estilo: Fantasía
Costo: 3
Fuerza: 2
Ilustrador: Marii-san
Carta: 121', 'Cada vez que el jugador adversario envie 1 o mas cartas de su Empresa al Vestidor (excepto por daño de batalla), puedes seleccionar 1 luchador adversario; el luchador seleccionado pierde 1 de fuerza y si su fuerza llega a O, noquéalo.'),
('exp1-122-el-brazo-de-oro', '122', 'El Brazo de Oro', 'Arena', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/El Brazo de Oro.png', 'Nombre: El Brazo de Oro
Tipo de carta: Arena
Costo: 3
Ilustrador: James Darko
Carta: 122
Rareza: Novato', 'Los luchadores "TECNICOs" que juegues desde tu Mano cuestan 2 contratos menos. Debes pagar 1 contrato al final de tu turno para que esta carta permanezca en tu Cuadrilátero.'),
('exp1-123-el-brazo-de-plata', '123', 'El Brazo de Plata', 'Castigo', 3, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/El Brazo de Plata.png', 'Nombre: El Brazo de Plata
Tipo de carta: Castigo
Costo: 3
Ilustrador: James Darko
Carta: 123
Rareza: Novato', 'Los luchadores "TECNICOs" de tu Cuadrilátero ganan 2 de fuerza. Debes pagar 1 contrato al final de tu turno para que esta carta permanezca en tu Cuadrilátero.'),
('exp1-124-dinast-a-de-los-brazos', '124', 'Dinastía de los Brazos', 'Castigo', 0, NULL, NULL, NULL, 'Promesa', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Dinastía de los Brazos.png', 'Nombre: Dinastía de los Brazos
Tipo de carta: Castigo
Costo: 0
Ilustrador: James Darko
Carta: 124
Rareza: Promesa', 'Busca en tu Empresa 1 carta que tenga "BRAZO" o" BRAZOS" en su nombre, muestra la carta y agrégala a tu Mano, luego baraja tu Empresa.'),
('exp1-125-los-brazos', '125', 'Los Brazos', 'Luchador', 6, 6, 'Técnico', 'Clásico', 'Leyenda', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Los Brazos.jpg', 'Nombre: Los Brazos
Tipo de carta: Luchador
Bando: Técnico
Estilo: Clásico
Costo: 6
Fuerza: 6
Ilustrador: James Darko
Carta: 125', '-ÍDOLO-
-OPORTUNISTA-
Puedes jugar este luchador sin pagar su costo si "EL BRAZO DE ORO" y "EL BRAZO DE PLATA" estan en tu Cuadrilátero. Una vez por turno durante tu fase de preparación, puedes pagar 1 contratopara que este luchador adquiera la habilidad HURANO hasta el final del turno.'),
('exp1-126-la-plancha', '126', 'La Plancha', 'Castigo', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/La Plancha.png', 'Nombre: La Plancha
Tipo de carta: Castigo
Costo: 2
Ilustrador: James Darko
Carta: 126
Rareza: Novato', 'Descarta 1 carta de tu Mano y envia 1 luchador adversario al Vestidor.'),
('exp1-127-cibearn-tico', '127', 'Cibearnético', 'Castigo', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Cibearnético.png', 'Nombre: Cibearnético
Tipo de carta: Castigo
Costo: 2
Ilustrador: James Darko
Carta: 127
Rareza: Novato', 'Busca 1 contrato en tu Empresa, muestra la carta y agregala a tu Mano, luego baraja tu Empresa.'),
('exp1-128-lobo-lobito', '128', 'Lobo Lobito', 'Luchador', 2, 1, 'Rudo', 'Mini', 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Lobo Lobito.png', 'Nombre: Lobo Lobito
Tipo de carta: Luchador
Bando: Rudo
Estilo: Mini
Costo: 2
Fuerza: 1
Ilustrador: James Darko
Carta: 128', '-LEGADO-
-OPORTUNISTA-
Cuando entra al Cuadrilátero, puedes jugar 1 "LOBO LOBITO" desde tu Mano pagando 1 contrato menos (no es acumulable). Cuando es noqueado, puedes buscar 1 "LOBO LOBITO" en tu Empresa, muestra la carta y agregala a tu Mano.'),
('exp1-129-s-per-hongo', '129', 'Súper Hongo', 'Objeto', 2, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Súper Hongo.png', 'Nombre: Súper Hongo
Tipo de carta: Objeto
Costo: 2
Ilustrador: James Darko
Carta: 129
Rareza: Novato', 'Solo puedes equipar esta carta a luchadores "MiNl". El luchador equipado con esta carta gana 3 de fuerza. Si el iuchador equipado con esta carta fuera a ser noqueado o enviado al Vestidor, puedes enviar esta carta al Vestidor en su lugar.'),
('exp1-130-mono-de-alambre', '130', 'Mono de Alambre', 'Luchador', 1, 1, 'Rudo', 'Fantasía', 'Promesa', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Mono de Alambre.png', 'Nombre: Mono de Alambre
Tipo de carta: Luchador
Bando: Rudo
Estilo: Fantasía
Costo: 1
Fuerza: 1
Ilustrador: James Darko
Carta: 130', '-ÍDOLO-
-OPORTUNISTA-
Cuando entra al Cuadrilátero, selecciona 1 luchador adversario y devuélvelo a su Mano. Puedes descartar este luchador para finalizar la fase de batalla del jugador adversario.'),
('exp1-131-playera-ruda', '131', 'Playera Ruda', 'Contrato', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Playera Ruda.png', 'Nombre: Playera Ruda
Tipo de carta: Contrato
Ilustrador: James Darko
Carta: 131
Rareza: Novato', 'Mientras este contrato permanezca en tu Zona de Contratos, los luchadores" RUDOS" de tu Cuadrilátero ganan 1 de fuerza.'),
('exp1-132-playera-t-cnica', '132', 'Playera Técnica', 'Contrato', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Playera Técnica.png', 'Nombre: Playera Técnica
Tipo de carta: Contrato
Ilustrador: James Darko
Carta: 132
Rareza: Novato', 'Mientras este contrato permanezca en tu Zona de Contratos, los luchadores" TECNICOS de tu Cuadrilátero ganan 1 de fuerza.'),
('exp1-133-sarah-super-estrella', '133', 'Sarah, Super Estrella', 'Luchador', 6, NULL, NULL, NULL, 'Promesa', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Sarah, Super Estrella.png', 'Nombre: Sarah, Super Estrella
Tipo de carta: Luchador
Costo: 6
Ilustrador: James Darko
Carta: 133
Rareza: Promesa', '-ÍDOLO-
-INMORTAL-
Este luchador solo puede entrar al Cuadrilátero pagando su costo. Cada vez que el jugador adversario envia cartas de su Empresa al Vestidor (excepto por daño de batalla), las cartas enviadas son " despedidas".'),
('exp1-135-ambici-n-del-drag-n', '135', 'Ambición del Dragón', 'Promotor', NULL, NULL, NULL, NULL, 'Novato', 'Marii-san', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Ambición del Dragón.png', 'Nombre: Ambición del Dragón
Tipo de carta: Promotor
Ilustrador: Marii-San
Carta: 135
Rareza: Novato', 'Cuando un luchador con" Sarah" en su nombre entre a tu Cuadrilátero, envia al Vestidor las 2 cartas superiores de la Empresa adversaria.'),
('exp1-135-el-estr-s-de-katty', '135', 'El Estrés de Katty', 'Castigo', 4, NULL, NULL, NULL, 'Novato', 'Marii-san', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/El Estrés de Katty.png', 'Nombre: El Estrés de Katty
Tipo de carta: Castigo
Costo: 4
Ilustrador: Marii-San
Carta: 135
Rareza: Novato', '-CONTRALLAVE-
Solo puedes jugar esta carta si no tienes luchadores en tu Cuadrilátero. Juega 1 luchador que tenga "Sarah" en su nombre desde tu Mano o Vestidor sin pagar su costo y envia al Vestidor la carta superior de la Empresa adversaria.'),
('exp1-136-tr-bol-pink', '136', 'Trébol Pink', 'Luchador', 2, 1, 'Rudo', 'Fantasía', 'Promesa', 'Izumi Mortem', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Trébol Pink.png', 'Nombre: Trébol Pink
Tipo de carta: Luchador
Bando: Rudo
Estilo: Fantasía
Costo: 2
Fuerza: 1
Ilustrador: Izumi Mortem
Carta: 136', '-OPORTUNISTA-
-HURANO-
Cuando este luchador hace daño de batalla, roba 1 carta de tu Empresa y si es un luchador decosto igual o menor a este luchador, puedes jugarlo de inmediato sin pagar su costo.'),
('exp1-137-el-hombre-del-casco', '137', 'El Hombre del Casco', 'Luchador', 0, 0, 'Rudo', 'Fantasía', 'Novato', 'Pegoztino', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/El Hombre del Casco.png', 'Nombre: El Hombre del Casco
Tipo de carta: Luchador
Bando: Rudo
Estilo: Fantasía
Costo: 0
Fuerza: 0
Ilustrador: Pegoztino
Carta: 137', '-OPORTUNISTA-
Este luchador gana fuerza igual al numero de contratos pagados para jugarlo.'),
('exp1-138-luchadoreggs', '138', 'Luchadoreggs', 'Contrato', NULL, NULL, NULL, NULL, 'Novato', 'James Darko', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Luchadoreggs.png', 'Nombre: Luchadoreggs
Tipo de carta: Contrato
Ilustrador: James Darko
Carta: 138
Rareza: Novato', 'Cuando un luchador de tu Cuadrilátero sea noqueado por batalla, puedes descartar este contrato para reducir a 0 el daño de esa batalla.'),
('exp1-139-night', '139', 'Night', 'Luchador', 2, 2, 'Técnico', 'Aéreo', 'Novato', 'Levanart''s', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Night.png', 'Nombre: Night
Tipo de carta: Luchador
Bando: Técnico
Estilo: Aéreo
Costo: 2
Fuerza: 2
Ilustrador: Levanart''s
Carta: 139', '-OPORTUNISTA-
Cuando entra al Cuadrilátero, devuelve 1 carta al azar de la Mano del jugador adversario a su Empresa, luego el jugador adversario baraja su Empresa.'),
('exp1-140-cris-skin', '140', 'Cris Skin', 'Luchador', 4, 5, 'Rudo', 'Clásico', 'Novato', 'Araceli Salazar', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Cris Skin.png', 'Nombre: Cris Skin
Tipo de carta: Luchador
Bando: Rudo
Estilo: Clásico
Costo: 4
Fuerza: 5
Ilustrador: Araceli Salazar
Carta: 140', '-OPORTUNISTA-
-INMORTAL-'),
('exp1-142-eva', '142', 'Eva', 'Luchador', 4, 3, 'Técnico', 'Clásico', 'Novato', 'Pegoztino', 'Primera Expansión', 'exp1', 'assets/cards/expansion-1/Eva.png', 'Nombre: Eva
Tipo de carta: Luchador
Bando: Técnico
Estilo: Clásico
Costo: 4
Fuerza: 3
Ilustrador: Pegoztino
Carta: 142', '-OPORTUNISTA-
Cuando entra al Cuadrilátero, envia al Vestidor 1 luchador adversario con fuerza igual o menor a este luchador.')
ON CONFLICT (id) DO UPDATE SET
    number = EXCLUDED.number,
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    cost = EXCLUDED.cost,
    strength = EXCLUDED.strength,
    bando = EXCLUDED.bando,
    style = EXCLUDED.style,
    rarity = EXCLUDED.rarity,
    artist = EXCLUDED.artist,
    set = EXCLUDED.set,
    set_id = EXCLUDED.set_id,
    image = EXCLUDED.image,
    raw_description = EXCLUDED.raw_description,
    effect = EXCLUDED.effect;


-- =========================================================
-- DATOS INICIALES DE EJEMPLO (EVENTOS & ENCUESTA INICIAL)
-- =========================================================
INSERT INTO public.events (title, description, state_location, venue_name, address, event_date, entry_fee, is_official)
VALUES 
('Torneo Inaugural Máscaras vs Cabelleras TCG - CDMX', 'Gran torneo inaugural formato construido 50 cartas. Premios en tapetes y cartas promocionales exclusivas.', 'Ciudad de México', 'Arena Cómic & TCG', 'Av. Cuauhtémoc #120, Col. Roma', NOW() + INTERVAL '14 days', 'Gratuito', true),
('Copa Gladiadores del Norte - Monterrey', 'Torneo clasificatorio para la Liga Nacional MvC. Ven a poner a prueba tu mazo y conoce a otros luchadores.', 'Nuevo León', 'La Guarida del Luchador TCG', 'Av. Gonzalitos #450, Monterrey', NOW() + INTERVAL '21 days', '$50 MXN', true),
('Duelo en la Perla Tapatía - Guadalajara', 'Reunión de comunidad, demostraciones para nuevos jugadores y mini-torneo suizo.', 'Jalisco', 'Ring Tapatío Games', 'Av. Juárez #890, Guadalajara', NOW() + INTERVAL '28 days', 'Gratuito', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.polls (question, description, options, is_active)
VALUES 
('¿Cuál es tu Estilo de Lucha favorito en el juego?', 'Vota por el estilo que más disfrutas jugar en el cuadrilátero para los próximos lanzamientos.', '["Clásico (Control & Técnica)", "Aéreo (Velocidad & Daño Directo)", "Extremo (Sacrificio & Poder Bruto)", "Fantasía (Habilidades & Hechizos)", "Mini (Evasión & Recursos)"]'::jsonb, true)
ON CONFLICT DO NOTHING;

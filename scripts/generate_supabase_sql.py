import json

def esc(val):
    if val is None:
        return 'NULL'
    s = str(val).replace("'", "''")
    return f"'{s}'"

def generate_sql():
    with open('src/assets/data/cards.json', 'r', encoding='utf-8') as f:
        cards = json.load(f)

    sql_parts = []
    sql_parts.append("""-- =========================================================
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_decks_user_id ON public.decks(user_id);
CREATE INDEX IF NOT EXISTS idx_decks_is_public ON public.decks(is_public);
CREATE INDEX IF NOT EXISTS idx_decks_likes_count ON public.decks(likes_count DESC);

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
CREATE POLICY "Votar una vez" ON public.poll_votes FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- =========================================================
-- POBLACIÓN INICIAL DE CARTAS (143 CARTAS)
-- =========================================================
""")

    # Generate INSERT statements for all cards
    value_rows = []
    for c in cards:
        card_id = esc(c.get('id'))
        number = esc(c.get('number'))
        name = esc(c.get('name'))
        card_type = esc(c.get('type'))
        cost = str(c['cost']) if c.get('cost') is not None else 'NULL'
        strength = str(c['strength']) if c.get('strength') is not None else 'NULL'
        bando = esc(c.get('bando')) if c.get('bando') else 'NULL'
        style = esc(c.get('style')) if c.get('style') else 'NULL'
        rarity = esc(c.get('rarity', 'Novato'))
        artist = esc(c.get('artist')) if c.get('artist') else 'NULL'
        card_set = esc(c.get('set'))
        set_id = esc(c.get('setId'))
        image = esc(c.get('image'))
        raw_desc = esc(c.get('rawDescription')) if c.get('rawDescription') else 'NULL'
        effect = esc(c.get('effect')) if c.get('effect') else 'NULL'

        value_rows.append(f"({card_id}, {number}, {name}, {card_type}, {cost}, {strength}, {bando}, {style}, {rarity}, {artist}, {card_set}, {set_id}, {image}, {raw_desc}, {effect})")

    sql_parts.append("""INSERT INTO public.cards (id, number, name, type, cost, strength, bando, style, rarity, artist, set, set_id, image, raw_description, effect)
VALUES
""" + ",\n".join(value_rows) + """
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
""")

    # Add sample initial events and a poll for immediate testing
    sql_parts.append("""
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
""")

    full_sql = "\n".join(sql_parts)
    with open('scripts/supabase_schema_and_seed.sql', 'w', encoding='utf-8') as f:
        f.write(full_sql)
    print(f"Generated scripts/supabase_schema_and_seed.sql with {len(cards)} cards + MVP schemas & samples!")

if __name__ == '__main__':
    generate_sql()

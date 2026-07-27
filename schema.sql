-- Drop old tables if exists
DROP TABLE IF EXISTS public.saving_goals CASCADE;
DROP TABLE IF EXISTS public.debts CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.wallets CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Create tables
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  username text UNIQUE NOT NULL,
  display_name text,
  role text DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  balance numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount numeric NOT NULL,
  category text,
  title text NOT NULL,
  receipt_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  amount numeric NOT NULL,
  due_date timestamptz,
  is_paid boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.saving_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  target_amount numeric NOT NULL,
  current_amount numeric DEFAULT 0,
  image_url text,
  created_at timestamptz DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saving_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can delete profiles" ON public.profiles FOR DELETE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can CRUD own wallets" ON public.wallets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can CRUD all wallets" ON public.wallets FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can CRUD own transactions" ON public.transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can CRUD all transactions" ON public.transactions FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can CRUD own debts" ON public.debts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can CRUD all debts" ON public.debts FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can CRUD own saving goals" ON public.saving_goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can CRUD all saving goals" ON public.saving_goals FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Trigger to handle new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, display_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'display_name', 'Pengguna Baru'),
    COALESCE(new.raw_user_meta_data->>'role', 'user')
  );
  INSERT INTO public.wallets (user_id, name, balance) VALUES (new.id, 'Cash', 0);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed Admin Account (must run in psql or Supabase SQL Editor)
-- This creates a user in auth.users and bypasses RLS for the trigger
-- Note: '123456' is hashed via gen_salt and crypt in Supabase (pgcrypto extension)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
DECLARE
    admin_id uuid := gen_random_uuid();
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@duitkita.com') THEN
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
        VALUES (
            admin_id,
            '00000000-0000-0000-0000-000000000000',
            'admin@duitkita.com',
            crypt('123456', gen_salt('bf')),
            now(),
            '{"username": "admin", "display_name": "Super Admin", "role": "admin"}'::jsonb,
            now(),
            now()
        );
    END IF;
END $$;

-- ============================================================
-- MIGRASI C: tanggal_mulai_bulan, tabs, reminders
-- ============================================================

-- Kolom tanggal mulai bulan di user_preferences (default: tanggal 1)
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS tanggal_mulai_bulan integer DEFAULT 1
CHECK (tanggal_mulai_bulan >= 1 AND tanggal_mulai_bulan <= 31);

-- Tabel tabs (profil kategori: pribadi/usaha/dll)
CREATE TABLE IF NOT EXISTS public.tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own tabs" ON public.tabs
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can CRUD all tabs" ON public.tabs
FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Tabel reminders (pengingat jatuh tempo)
CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date timestamptz NOT NULL,
  is_completed boolean DEFAULT false,
  related_entity_type text,  -- misal: 'debt', 'recurring_transaction'
  related_entity_id uuid,    -- ID entitas terkait
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own reminders" ON public.reminders
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can CRUD all reminders" ON public.reminders
FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- MIGRASI D: Triggers untuk Reminders
-- ============================================================

ALTER TABLE public.user_preferences 
ADD COLUMN IF NOT EXISTS reminder_days_before integer DEFAULT 3;

CREATE OR REPLACE FUNCTION public.sync_debt_to_reminders()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.reminders WHERE related_entity_type = 'debt' AND related_entity_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.status = 'paid' THEN
    UPDATE public.reminders SET is_completed = true WHERE related_entity_type = 'debt' AND related_entity_id = NEW.id;
  ELSE
    IF NEW.due_date IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.reminders WHERE related_entity_type = 'debt' AND related_entity_id = NEW.id) THEN
        UPDATE public.reminders 
        SET due_date = NEW.due_date, title = 'Hutang: ' || NEW.title, is_completed = false
        WHERE related_entity_type = 'debt' AND related_entity_id = NEW.id;
      ELSE
        INSERT INTO public.reminders (user_id, title, description, due_date, is_completed, related_entity_type, related_entity_id)
        VALUES (NEW.user_id, 'Hutang: ' || NEW.title, 'Jatuh tempo hutang', NEW.due_date, false, 'debt', NEW.id);
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_debt_changed ON public.debts;
CREATE TRIGGER on_debt_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.sync_debt_to_reminders();

CREATE OR REPLACE FUNCTION public.sync_recurring_to_reminders()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.reminders WHERE related_entity_type = 'recurring_transaction' AND related_entity_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NOT NEW.is_active THEN
    DELETE FROM public.reminders WHERE related_entity_type = 'recurring_transaction' AND related_entity_id = NEW.id;
  ELSE
    IF NEW.next_run IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.reminders WHERE related_entity_type = 'recurring_transaction' AND related_entity_id = NEW.id) THEN
        UPDATE public.reminders 
        SET due_date = NEW.next_run, title = 'Berulang: ' || NEW.title, is_completed = false
        WHERE related_entity_type = 'recurring_transaction' AND related_entity_id = NEW.id;
      ELSE
        INSERT INTO public.reminders (user_id, title, description, due_date, is_completed, related_entity_type, related_entity_id)
        VALUES (NEW.user_id, 'Berulang: ' || NEW.title, 'Tagihan berulang', NEW.next_run, false, 'recurring_transaction', NEW.id);
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_recurring_changed ON public.recurring_transactions;
CREATE TRIGGER on_recurring_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_recurring_to_reminders();

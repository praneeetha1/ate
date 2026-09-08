-- Reproduce the real deployed state: recipe_key still integer because 005 never ran.
alter table public.favorites     alter column recipe_key type integer using recipe_key::integer;
alter table public.shopping_list alter column recipe_key type integer using recipe_key::integer;

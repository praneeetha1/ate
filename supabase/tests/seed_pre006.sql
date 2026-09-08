-- Data as it would exist before 006: ratings/notes keyed by recipe NAME.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'b@example.com');
update public.profiles set username='alice', username_set=true where id='11111111-1111-4111-8111-111111111111';
update public.profiles set username='bob',   username_set=true where id='22222222-2222-4222-8222-222222222222';

insert into public.user_recipes (id, user_id, name, category, ingredients, steps, time_minutes, servings)
values ('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',
        'Nanna Dal','Main Dish','[{"amount":"1","unit":"cup","item":"dal"}]','{Rinse,Boil}',40,4);

insert into public.favorites (user_id, recipe_key) values
  ('11111111-1111-4111-8111-111111111111','5'),
  ('11111111-1111-4111-8111-111111111111','u_99999999-9999-4999-8999-999999999999');
insert into public.shopping_list (user_id, recipe_key) values
  ('11111111-1111-4111-8111-111111111111','u_99999999-9999-4999-8999-999999999999');
insert into public.ratings (user_id, recipe_name, rating) values
  ('11111111-1111-4111-8111-111111111111','Nanna Dal',5),
  ('11111111-1111-4111-8111-111111111111','Classic Pancakes',4);
insert into public.notes (user_id, recipe_name, body) values
  ('11111111-1111-4111-8111-111111111111','Nanna Dal','more cumin');
insert into public.lists (id, user_id, name) values
  ('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111','Weeknights');
insert into public.list_items (list_id, recipe_key) values
  ('88888888-8888-4888-8888-888888888888','u_99999999-9999-4999-8999-999999999999');
insert into public.activity (user_id, type, recipe_key, recipe_name) values
  ('11111111-1111-4111-8111-111111111111','created','u_99999999-9999-4999-8999-999999999999','Nanna Dal'),
  ('11111111-1111-4111-8111-111111111111','bogus-type','5','Injected');
insert into public.follows (follower_id, following_id) values
  ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');

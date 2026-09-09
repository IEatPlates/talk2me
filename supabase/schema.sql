create type public.friendship_status as enum ('pending', 'accepted', 'declined');
create type public.conversation_kind as enum ('direct', 'group');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_color text not null default '#c9eadb',
  created_at timestamptz not null default now()
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  name text,
  kind public.conversation_kind not null default 'direct',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) > 0),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  kind text not null default 'message',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index notifications_user_unread_idx on public.notifications(user_id) where read_at is null;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

create policy "Profiles are visible to signed in users" on public.profiles for select to authenticated using (true);
create policy "Users can edit their profile" on public.profiles for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users can see their friendships" on public.friendships for select to authenticated using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "Users can create friend requests" on public.friendships for insert to authenticated with check (auth.uid() = requester_id);
create policy "Recipients can update friend requests" on public.friendships for update to authenticated using (auth.uid() = addressee_id);
create policy "Members can see conversations" on public.conversations for select to authenticated using (exists (select 1 from public.conversation_members where conversation_id = id and user_id = auth.uid()));
create policy "Users can create conversations" on public.conversations for insert to authenticated with check (auth.uid() = created_by);
create policy "Members can see membership" on public.conversation_members for select to authenticated using (user_id = auth.uid() or exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()));
create policy "Conversation creators can add members" on public.conversation_members for insert to authenticated with check (exists (select 1 from public.conversations where id = conversation_id and created_by = auth.uid()));
create policy "Members can read messages" on public.messages for select to authenticated using (exists (select 1 from public.conversation_members where conversation_id = messages.conversation_id and user_id = auth.uid()));
create policy "Members can send messages" on public.messages for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.conversation_members where conversation_id = messages.conversation_id and user_id = auth.uid()));
create policy "Users can see their notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "Users can mark their notifications read" on public.notifications for update to authenticated using (user_id = auth.uid());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.notify_conversation_members() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, conversation_id, message_id)
  select cm.user_id, new.conversation_id, new.id
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id;
  return new;
end;
$$;

create trigger on_message_created after insert on public.messages for each row execute procedure public.notify_conversation_members();

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.friendships;

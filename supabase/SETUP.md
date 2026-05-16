# AR Studio Supabase Setup

## 1. Create a Supabase project
Create a new project in Supabase and copy:
- Project URL
- Anon public key

## 2. Add env variables
Copy `.env.example` to `.env` and set:

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

## 3. Run the schema
Open the Supabase SQL editor and run:
- `supabase/schema.sql`

This creates:
- `studio_users`
- `client_workspaces`
- `workspace_messages`
- `workspace_feedback`
- invite-token RPC functions
- storage buckets and policies

## 4. Add your studio account
After your first magic-link login, insert your creator email:

```sql
insert into public.studio_users (email)
values ('you@yourstudio.com')
on conflict do nothing;
```

## 5. Open the app
Run the app and use **Creator Studio**.

Recommended first actions:
1. Click **Seed demo data**
2. Click **Load from Supabase**
3. Edit a client workspace
4. Click **Save workspace**
5. Upload assets to Storage
6. Share the generated invite link with a client

## 6. Client access modes
Clients can access the portal via:
- **invite link / invite token**
- **magic link login** if their workspace email matches the login email

## 7. Buckets used
The app uploads into public buckets:
- `renders`
- `documents`
- `models`

## 8. Live refresh
The frontend listens for Supabase realtime table changes on:
- `client_workspaces`
- `workspace_messages`
- `workspace_feedback`

## 9. Recommended next production improvements
- move creator/admin actions behind a server function or edge function
- add signed URLs for sensitive documents
- split JSON workspace fields into normalized tables if the project grows
- add notifications / push support
- add real GLB viewer loading instead of URL placeholder only
